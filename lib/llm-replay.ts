/**
 * lib/llm-replay.ts
 *
 * Save and replay LLM responses as JSON fixtures so we can iterate on
 * validators, parsers, and UI without re-calling the model.
 *
 * WHY: each live call is 30–300s and costs tokens. During Day 1–3 we touch
 * validators, schemas, and streaming code many times — replaying a saved
 * response turns that round-trip into <1ms and free. Validators still run
 * against the replayed content, which is exactly what we want to test.
 *
 * Procedures: docs/procedures/03-fixture-replay.md
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const FIXTURES_ROOT = path.join(process.cwd(), 'fixtures');

export type FixtureStage = 'goalspec' | 'path' | 'notebook';

export type Fixture = {
  /** Stage this fixture was captured from */
  stage: FixtureStage;
  /** Short human-readable label, e.g. "healthcare-cdss" */
  name: string;
  /** sha256 of the request payload — lets us detect when input changes */
  inputHash: string;
  /** Timestamp the fixture was captured */
  capturedAt: string;
  /** Model identifier at capture time (for drift detection) */
  modelTag: string;
  /** Raw string content returned by the LLM (not the wrapping JSON) */
  content: string;
  /** Optional: token usage if the provider returned it */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/** Stable sha256 of a JSON-serialisable input. */
export function hashInput(input: unknown): string {
  const json = JSON.stringify(input, Object.keys(input as object).sort());
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/**
 * Save a fixture to disk. Only runs when LLM_SAVE_FIXTURES=1 — callers can
 * invoke this unconditionally and it will no-op in normal operation.
 */
export async function saveFixture(
  stage: FixtureStage,
  name: string,
  input: unknown,
  content: string,
  opts: { modelTag: string; usage?: Fixture['usage'] },
): Promise<void> {
  if (process.env.LLM_SAVE_FIXTURES !== '1') return;

  const dir = path.join(FIXTURES_ROOT, stage);
  await fs.mkdir(dir, { recursive: true });

  const fixture: Fixture = {
    stage,
    name,
    inputHash: hashInput(input),
    capturedAt: new Date().toISOString(),
    modelTag: opts.modelTag,
    content,
    usage: opts.usage,
  };

  const file = path.join(dir, `${name}.json`);
  await fs.writeFile(file, JSON.stringify(fixture, null, 2), 'utf8');
}

/**
 * Load a fixture file by path. Path is what the user put in LLM_REPLAY.
 * Throws if the file is missing or malformed — we want loud failure, because
 * silent fallback to a live call defeats the purpose.
 */
export async function loadFixture(replayPath: string): Promise<Fixture> {
  // Allow both "fixtures/notebook/foo.json" and absolute paths.
  const abs = path.isAbsolute(replayPath)
    ? replayPath
    : path.join(process.cwd(), replayPath);

  const raw = await fs.readFile(abs, 'utf8');
  const parsed = JSON.parse(raw) as Fixture;

  if (!parsed.stage || !parsed.content) {
    throw new Error(
      `Fixture at ${abs} is malformed: missing stage or content`,
    );
  }
  return parsed;
}

/**
 * Warn when the replayed fixture was captured against a different input
 * than the current request. Non-fatal — callers decide whether to proceed.
 */
export function fixtureMatchesInput(fixture: Fixture, input: unknown): boolean {
  return fixture.inputHash === hashInput(input);
}
