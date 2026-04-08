/**
 * NeMo Retriever pattern — NVIDIA Embedding NIM + cosine similarity.
 *
 * Architecture:
 *  1. STATIC_SKILLS (compiled-in baseline) are embedded at first call and cached.
 *  2. A background async refresh fetches live SKILL.md files from GitHub on
 *     server startup. If successful, it merges into the in-memory skill store and
 *     invalidates the embedding cache so the next query re-embeds fresh data.
 *  3. retrieveRelevantSkills() embeds the user goal via NVIDIA's nv-embedqa-e5-v5
 *     model and returns the top-K semantically matched skills — these are injected
 *     into the Nemotron system prompt as grounding context.
 *
 * IMPORTANT — Next.js module lifecycle:
 *  Module-level state persists across requests in a long-running Node.js server
 *  (`next start` or `next dev`). This is the intended deployment model for this
 *  demo. Serverless/edge deployments would need a different caching strategy.
 */

import OpenAI from 'openai';
import { parse as parseYaml } from 'yaml';
import { STATIC_SKILLS, SKILL_SOURCE_URLS } from '@/data/skills-catalog';
import type { Skill, ServiceSkills } from '@/types/ecosystem';

// ── NIM client (server-only) ──────────────────────────────────────────────────
const nim = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY ?? '',
});

// ── Module-level state ────────────────────────────────────────────────────────

/** Current live skill store — starts as static baseline, updated by background refresh */
let liveSkills: ServiceSkills[] = STATIC_SKILLS;

/** Embedding cache — null means embeddings need to be (re)computed */
let embeddingCache: Array<{ skill: Skill; serviceId: string; embedding: number[] }> | null = null;

// ── Embedding helpers ─────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
  const res = await nim.embeddings.create({
    model: 'nvidia/nv-embedqa-e5-v5',
    input: text,
    encoding_format: 'float',
  });
  return res.data[0].embedding;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed the user goal and retrieve the top-K most semantically relevant skills
 * from the live skills store. Results are injected into the Nemotron prompt.
 *
 * Embeddings for the skill corpus are computed once and cached in memory.
 * Re-computed only when the background refresh replaces liveSkills.
 */
export async function retrieveRelevantSkills(goal: string, topK = 5): Promise<Skill[]> {
  // Build embedding cache if not yet computed (or invalidated by refresh)
  if (!embeddingCache) {
    const allSkills = liveSkills.flatMap(s =>
      s.skills.map(skill => ({ skill, serviceId: s.serviceId }))
    );
    const embeddings = await Promise.all(
      allSkills.map(async ({ skill, serviceId }) => ({
        skill,
        serviceId,
        embedding: await getEmbedding(`${skill.name}: ${skill.description}`),
      }))
    );
    embeddingCache = embeddings;
    console.log(`[skills-retriever] Embedded ${embeddings.length} skills into cache`);
  }

  const goalEmbedding = await getEmbedding(goal);

  return embeddingCache
    .map(entry => ({ ...entry, score: cosineSim(goalEmbedding, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(entry => entry.skill);
}

/** Returns the number of cached skill embeddings (for diagnostics). */
export function getCacheSize(): number {
  return embeddingCache?.length ?? 0;
}

// ── Background GitHub refresh ─────────────────────────────────────────────────

/** Headers for raw.githubusercontent.com (optional auth for rate limits). */
function githubFetchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'nvidia-ecosystem-visualizer/1',
    Accept: 'text/plain',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    // GitHub recommends Bearer for PATs (classic and fine-grained)
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Retry transient failures (429 / 5xx) with bounded backoff. */
async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
  const headers = githubFetchHeaders();
  let last: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { headers, cache: 'no-store' });
    last = res;
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      const ra = res.headers.get('retry-after');
      const waitMs = ra
        ? Math.min(parseInt(ra, 10) * 1000, 60000)
        : Math.min(400 * 2 ** (attempt - 1), 8000);
      await new Promise(r => setTimeout(r, Number.isFinite(waitMs) ? waitMs : 400 * attempt));
      continue;
    }
    return res;
  }
  return last!;
}

/** Parse YAML frontmatter (handles multiline / folded `description`, extra keys). */
function parseSkillMd(raw: string): Pick<Skill, 'name' | 'version' | 'description'> | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    const doc = parseYaml(m[1]);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const o = doc as Record<string, unknown>;
    const name = String(o.name ?? '').trim();
    const description = String(o.description ?? '').trim();
    if (!name || !description) return null;
    const version = String(o.version ?? '').trim() || '1.0.0';
    return { name, version, description };
  } catch {
    return null;
  }
}

function rawUrlToBlobUrl(rawUrl: string): string {
  return rawUrl
    .replace('raw.githubusercontent.com', 'github.com')
    .replace('/main/', '/blob/main/');
}

/** Merge fresh skills into existing service entries, adding or replacing by skill name */
function mergeIntoStore(
  base: ServiceSkills[],
  fresh: Array<{ serviceId: string; skill: Skill }>,
): ServiceSkills[] {
  const result = base.map(s => ({ ...s, skills: [...s.skills] }));
  for (const { serviceId, skill } of fresh) {
    let entry = result.find(s => s.serviceId === serviceId);
    if (!entry) {
      entry = { serviceId, skills: [] };
      result.push(entry);
    }
    const idx = entry.skills.findIndex(s => s.name === skill.name);
    if (idx >= 0) {
      entry.skills[idx] = skill;
    } else {
      entry.skills.push(skill);
    }
  }
  return result;
}

async function backgroundRefresh(): Promise<void> {
  const results = await Promise.allSettled(
    SKILL_SOURCE_URLS.map(async ({ serviceId, name, rawUrl }) => {
      try {
        const res = await fetchWithRetry(rawUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        const parsed = parseSkillMd(text);
        if (!parsed) {
          throw new Error('YAML frontmatter parse failed (missing name/description)');
        }
        const skill: Skill = {
          ...parsed,
          repoUrl: rawUrlToBlobUrl(rawUrl),
        };
        return { serviceId, name, skill };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[skills-retriever] skip ${name} (${serviceId}): ${msg} — ${rawUrl}`);
        throw e;
      }
    })
  );

  const fresh = results
    .filter((r): r is PromiseFulfilledResult<{ serviceId: string; name: string; skill: Skill }> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value);

  const failed = results.filter(r => r.status === 'rejected').length;

  if (fresh.length > 0) {
    liveSkills = mergeIntoStore(liveSkills, fresh);
    embeddingCache = null; // invalidate — will recompute on next query
    console.log(
      `[skills-retriever] Refreshed ${fresh.length}/${SKILL_SOURCE_URLS.length} skills from GitHub` +
      (failed > 0 ? ` (${failed} failed — static baseline kept for those)` : '')
    );
  } else {
    console.warn(
      '[skills-retriever] GitHub refresh failed for all sources — using static baseline'
    );
  }
}

// Fire-and-forget on module load. Never rejects, never blocks request handling.
backgroundRefresh().catch(() => {});
