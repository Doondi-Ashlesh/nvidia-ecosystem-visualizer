/**
 * lib/model-config.ts
 *
 * Single source of truth for where LLM calls go and which key signs them.
 *
 * WHY: previously each route read process.env.NIM_BASE_URL / NVIDIA_API_KEY /
 * OPENROUTER_API_KEY directly and picked the key based on URL heuristics. That
 * made swapping endpoints (managed NIM → Brev self-hosted) error-prone: any
 * route that forgot to read the new env would silently hit the wrong model.
 *
 * Centralising this here means the Brev demo swap is ONE env edit, and the
 * fixture replay harness (LLM_REPLAY) can short-circuit network calls for all
 * routes uniformly.
 *
 * Procedures: see docs/procedures/06-brev-swap.md and
 *             docs/procedures/03-fixture-replay.md
 */

export type ModelProvider = 'openrouter' | 'nim-managed' | 'nim-self-hosted';

export type ModelConfig = {
  /** Base URL passed to the OpenAI SDK */
  baseURL: string;
  /** API key for this provider (never log this) */
  apiKey: string;
  /** Model identifier as the provider expects it */
  model: string;
  /** Which backend we're talking to — drives retry behaviour and logging */
  provider: ModelProvider;
  /** When true, routes should read a saved fixture instead of calling the API */
  isReplay: boolean;
  /** Path to the fixture file when isReplay is true */
  replayPath?: string;
  /** Pinned container tag or model revision, for provenance headers */
  modelTag: string;
};

const DEFAULT_NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

/**
 * Resolve model config from environment. Called once per request by each LLM
 * route. Order of precedence:
 *   1. LLM_REPLAY set -> replay mode, no network call
 *   2. NIM_BASE_URL contains "openrouter" -> OpenRouter (use OPENROUTER_API_KEY)
 *   3. NIM_BASE_URL contains "localhost" or private IP -> Brev self-hosted
 *   4. Otherwise -> managed NIM (use NVIDIA_API_KEY)
 */
export function getModelConfig(): ModelConfig {
  const replayPath = process.env.LLM_REPLAY?.trim();
  if (replayPath) {
    return {
      baseURL: 'replay://local',
      apiKey: 'replay',
      model: 'replay',
      provider: 'nim-managed',
      isReplay: true,
      replayPath,
      modelTag: 'replay',
    };
  }

  const baseURL = process.env.NIM_BASE_URL?.trim() || DEFAULT_NIM_BASE_URL;
  const model = process.env.NIM_CHAT_MODEL?.trim() || DEFAULT_MODEL;

  let provider: ModelProvider = 'nim-managed';
  let apiKey = process.env.NVIDIA_API_KEY?.trim() || '';

  if (baseURL.includes('openrouter')) {
    provider = 'openrouter';
    apiKey = process.env.OPENROUTER_API_KEY?.trim() || '';
  } else if (
    baseURL.includes('localhost') ||
    baseURL.includes('127.0.0.1') ||
    /(^|:\/\/)(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(baseURL)
  ) {
    provider = 'nim-self-hosted';
    // Self-hosted NIM on Brev usually accepts the same NVIDIA_API_KEY or
    // a placeholder; some deployments disable auth entirely. Fall back to a
    // token so the SDK doesn't refuse to send a request without a key header.
    apiKey = apiKey || 'self-hosted';
  }

  return {
    baseURL,
    apiKey,
    model,
    provider,
    isReplay: false,
    modelTag: model, // for now, tag == model id; Brev demo pins a container sha
  };
}

/** True if the API key needed for the selected provider is missing. */
export function isModelKeyMissing(cfg: ModelConfig): boolean {
  if (cfg.isReplay) return false;
  return !cfg.apiKey || cfg.apiKey === 'self-hosted'
    ? cfg.provider !== 'nim-self-hosted' && !cfg.apiKey
    : false;
}

/** Human-readable provider label for logs / provenance. Never includes the key. */
export function describeProvider(cfg: ModelConfig): string {
  if (cfg.isReplay) return `replay(${cfg.replayPath})`;
  return `${cfg.provider}:${cfg.model}@${cfg.baseURL}`;
}
