/**
 * lib/llm-client.ts
 *
 * Single entry-point for all LLM calls in the pipeline. Routes never talk to
 * the OpenAI SDK directly — they call completeChat() which handles:
 *
 *   - provider selection  (managed NIM / Brev self-hosted / OpenRouter)
 *   - fixture replay      (LLM_REPLAY env var short-circuits the network call)
 *   - fixture save        (LLM_SAVE_FIXTURES=1 captures successful responses)
 *   - retries             (up to 3 attempts on transient / empty-choices errors)
 *   - structured logging  (correlation id, latency, token usage)
 *
 * WHY: we had the same retry + empty-choice + parse boilerplate duplicated
 * in each route. Centralising kills two bugs at once:
 *   1. the Brev swap is a pure env change (proc 06-brev-swap.md)
 *   2. iteration on validators never hits the real API (proc 03-fixture-replay.md)
 */

import OpenAI from 'openai';
import {
  getModelConfig,
  describeProvider,
  type ModelConfig,
} from './model-config';
import {
  loadFixture,
  saveFixture,
  type FixtureStage,
} from './llm-replay';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type CompleteChatInput = {
  /** Which pipeline stage is making the call. Drives fixture file paths. */
  stage: FixtureStage;
  /** Short label for this specific request, e.g. "healthcare-cdss". */
  fixtureName: string;
  /** Raw input used for fixture hashing. Typically the user-visible request body. */
  fixtureInput: unknown;
  /** Chat messages to send. */
  messages: ChatMessage[];
  /** Sampling params. Defaults picked for deterministic pipeline output. */
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  /** How many times to retry on transient failures. */
  maxAttempts?: number;
  /** Correlation id for tracing across stages. */
  correlationId: string;
};

export type CompleteChatOutput = {
  /** Raw assistant content — downstream parses this. */
  content: string;
  /** Finish reason from the provider, or "replay" in replay mode. */
  finishReason: string;
  /** Total attempts used. 1 means first-try success. */
  attempts: number;
  /** Milliseconds elapsed end-to-end. Includes retries. */
  latencyMs: number;
  /** Token usage if provider returned it. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** Model identifier used (for provenance headers). */
  modelTag: string;
  /** Provider description for logs — no secrets inside. */
  providerLabel: string;
};

class EmptyChoicesError extends Error {
  constructor() {
    super('Provider returned response with no choices');
  }
}

export async function completeChat(
  input: CompleteChatInput,
): Promise<CompleteChatOutput> {
  const cfg = getModelConfig();
  const t0 = Date.now();
  const providerLabel = describeProvider(cfg);

  // ─── Replay mode ───────────────────────────────────────────────────
  if (cfg.isReplay && cfg.replayPath) {
    const fixture = await loadFixture(cfg.replayPath);
    const latencyMs = Date.now() - t0;
    console.log(
      `[llm-client][${input.correlationId}] REPLAY stage=${input.stage} ` +
        `fixture=${cfg.replayPath} ${fixture.content.length}ch ${latencyMs}ms`,
    );
    return {
      content: fixture.content,
      finishReason: 'replay',
      attempts: 1,
      latencyMs,
      usage: fixture.usage,
      modelTag: fixture.modelTag,
      providerLabel: `replay(${cfg.replayPath})`,
    };
  }

  // ─── Live mode ─────────────────────────────────────────────────────
  if (!cfg.apiKey) {
    throw new Error(
      `No API key available for provider ${cfg.provider}. ` +
        `Set NVIDIA_API_KEY (managed NIM) or OPENROUTER_API_KEY.`,
    );
  }

  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  const maxAttempts = input.maxAttempts ?? 3;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: cfg.model,
        messages: input.messages,
        temperature: input.temperature ?? 0,
        top_p: input.top_p ?? 0.95,
        max_tokens: input.max_tokens ?? 8192,
      });

      if (!completion?.choices?.length) {
        throw new EmptyChoicesError();
      }

      const choice = completion.choices[0];
      const msg = choice.message as unknown as Record<string, unknown>;
      const content = (msg?.content ?? '') as string;
      const finishReason = choice.finish_reason ?? 'unknown';
      const latencyMs = Date.now() - t0;

      console.log(
        `[llm-client][${input.correlationId}] OK stage=${input.stage} ` +
          `provider=${cfg.provider} attempts=${attempt} ` +
          `finish=${finishReason} chars=${content.length} ms=${latencyMs} ` +
          `tokens=${completion.usage?.total_tokens ?? '?'}`,
      );

      const usage = completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : undefined;

      // Fire-and-forget fixture save — never blocks the response.
      void saveFixture(
        input.stage,
        input.fixtureName,
        input.fixtureInput,
        content,
        { modelTag: cfg.modelTag, usage },
      ).catch((err) => {
        console.warn(
          `[llm-client][${input.correlationId}] saveFixture failed:`,
          err,
        );
      });

      return {
        content,
        finishReason,
        attempts: attempt,
        latencyMs,
        usage,
        modelTag: cfg.modelTag,
        providerLabel,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[llm-client][${input.correlationId}] attempt ${attempt}/${maxAttempts} ` +
          `failed stage=${input.stage} provider=${cfg.provider}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      // Only retry on transient categories; other errors (e.g. bad request)
      // bubble immediately to save credits and time.
      if (!isRetriable(err)) break;
    }
  }

  const latencyMs = Date.now() - t0;
  console.error(
    `[llm-client][${input.correlationId}] FAILED stage=${input.stage} ` +
      `after ${maxAttempts} attempts in ${latencyMs}ms`,
  );
  throw lastError ?? new Error('Unknown LLM client failure');
}

function isRetriable(err: unknown): boolean {
  if (err instanceof EmptyChoicesError) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err);
  // Network-y signals worth a retry. 4xx client errors (except 429) are not.
  if (msg.includes('429')) return true;
  if (msg.includes('timeout') || msg.includes('econnreset')) return true;
  if (msg.includes('socket hang up')) return true;
  if (msg.includes('fetch failed')) return true;
  // OpenAI SDK wraps 5xx with "Internal" / status >= 500 markers
  if (/5\d\d/.test(msg)) return true;
  return false;
}

/** Expose the resolved config for logging / provenance headers. */
export function describeActiveConfig(): {
  provider: string;
  modelTag: string;
  baseURL: string;
} {
  const cfg: ModelConfig = getModelConfig();
  return {
    provider: cfg.provider,
    modelTag: cfg.modelTag,
    baseURL: cfg.baseURL,
  };
}
