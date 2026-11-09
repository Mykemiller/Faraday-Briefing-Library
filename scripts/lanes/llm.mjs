// BL2-05 (FDY-281): optional model polish of the two editorial passages a deterministic composer
// writes least well — the thesis paragraph and Faraday's Take — plus the global concurrency guard
// for model calls (12 across all lanes, FDY-281).
//
// The polish is OFF unless ANTHROPIC_API_KEY is set (or a client is injected). It never adds a
// fact: the model is handed only the sentences already cited in the draft, each with its [Sn]
// marker, and must reason over them. Its output is validated before it replaces anything —
// every marker must exist in the draft, every factual sentence must carry a marker, every
// digit-bearing token must appear in the cited evidence, the vocabulary rules hold — and on any
// failure the deterministic text stands. Profiles are never polished (no Take, sourced facts only).

import { numbersSupported } from './compose.mjs';

export const DEFAULT_MODEL = process.env.BL2_MODEL || 'claude-opus-5-5';
export const GLOBAL_MODEL_CONCURRENCY = Number(process.env.BL2_MODEL_CONCURRENCY ?? 12);

/** Counting semaphore: `const release = await sem.acquire(); try { … } finally { release(); }` */
export class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.active = 0;
    this.queue = [];
  }
  acquire() {
    return new Promise((resolve) => {
      const grant = () => {
        this.active += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active -= 1;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.active < this.limit) grant();
      else this.queue.push(grant);
    });
  }
  get waiting() {
    return this.queue.length;
  }
}

export const GLOBAL_MODEL_SEMAPHORE = new Semaphore(GLOBAL_MODEL_CONCURRENCY);

const SYSTEM = `You are the Faraday Briefing Library's editor. You rewrite two passages of a draft briefing — the thesis paragraph and "Faraday's Take" — in Faraday's editorial-authoritative register (The Economist meets a private intelligence firm).

Hard rules, checked by a program after you answer:
1. Use ONLY the evidence sentences supplied, each tagged with a marker like [S3]. Every factual sentence you write ends with the marker(s) of the evidence it restates. Do not add a fact, a number, a name or a date that is not in the supplied sentences.
2. Opinion is allowed only in the Take, in sentences that begin "Faraday's reading" or "Our view". Those sentences carry no marker and introduce no new fact.
3. Vocabulary: Theater, Sector, Thread, Signal. Never "Key Player", "Theme", "Domain", "Sub-Domain". Never print internal codes such as D3.1 or T-001.
4. The thesis is one paragraph of 60–110 words that says what Faraday thinks and why, leading with the conclusion. The Take is 2–3 short paragraphs (150–260 words total) that argue over the cited facts.
5. Reply with JSON only: {"hypothesis": "...", "take": ["paragraph", "paragraph"]}.`;

function evidenceLines(draft, pack) {
  const byUrl = new Map(pack.items.map((it) => [it.url, it]));
  const lines = [];
  for (const r of draft.source_refs) {
    const it = byUrl.get(r.url) ?? (pack.jurisdiction_record?.url === r.url ? pack.jurisdiction_record : null) ?? (pack.entity?.url === r.url ? pack.entity : null);
    if (!it) continue;
    for (const s of it.text.slice(0, 3)) lines.push(`[${r.ref}] (${it.date ?? 'undated'}, ${it.publisher}) ${s}`);
  }
  return lines;
}

const MARK = /\[S\d+\]/g;
const OPINION = /^(Faraday's reading|Our view)/;

/** Validate a polished passage against the draft's refs and evidence. Returns problems[] (empty = ok). */
export function validatePolish(text, draft, pack, { allowOpinion = false } = {}) {
  const problems = [];
  const refs = new Set(draft.source_refs.map((r) => r.ref));
  for (const m of text.matchAll(MARK)) if (!refs.has(m[0].slice(1, -1))) problems.push(`unknown marker ${m[0]}`);
  if (/\bKey Players?\b|\bSub-?Domains?\b|\bDomains?\b|\bThemes?\b/.test(text)) problems.push('forbidden vocabulary');
  if (/\b(?:D\d{1,2}(?:\.\d{1,2})?|T-00\d)\b/.test(text.replace(MARK, ''))) problems.push('internal code');
  const byRef = new Map(draft.source_refs.map((r) => [r.ref, r]));
  const itemsFor = (sentence) => [...sentence.matchAll(MARK)].map((m) => byRef.get(m[0].slice(1, -1))).filter(Boolean).map((r) => pack.items.find((it) => it.url === r.url) ?? pack.jurisdiction_record ?? pack.entity).filter(Boolean);
  // Split on sentence ends, but never in front of a marker ("… 2026. [S1]" is one sentence).
  const sentences = text.split(/(?<=[.!?]["')\]]?(?:\s\[S\d+\])*)\s+(?=[A-Z"'(]|\[(?!S\d))/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (allowOpinion && OPINION.test(s)) {
      if (/\d/.test(s)) problems.push(`opinion sentence carries a number: ${s.slice(0, 60)}`);
      continue;
    }
    if (!MARK.test(s)) {
      MARK.lastIndex = 0;
      problems.push(`uncited sentence: ${s.slice(0, 60)}`);
      continue;
    }
    MARK.lastIndex = 0;
    if (!numbersSupported(s.replace(MARK, ''), itemsFor(s))) problems.push(`unsupported number: ${s.slice(0, 60)}`);
  }
  return problems;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no JSON object in model reply');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Build a polisher. Returns null when disabled (no key, no client) so callers can `polish?.(…)`.
 * The polisher returns { draft, polished: boolean, reason?: string } and never throws for model
 * or validation failures — the deterministic draft is always a valid fallback.
 */
export function createPolisher({ client = null, apiKey = process.env.ANTHROPIC_API_KEY, model = DEFAULT_MODEL, semaphore = GLOBAL_MODEL_SEMAPHORE, enabled = true, maxTokens = 4000 } = {}) {
  if (!enabled) return null;
  let clientPromise = client ? Promise.resolve(client) : null;
  if (!clientPromise) {
    if (!apiKey) return null;
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey }));
  }
  return {
    model,
    async polish(draft, pack) {
      if (draft.kind === 'profile') return { draft, polished: false, reason: 'profiles are never polished' };
      const evidence = evidenceLines(draft, pack);
      if (!evidence.length) return { draft, polished: false, reason: 'no evidence lines' };
      const user = [
        `Title: ${draft.title}`,
        `Tier: ${draft.tier} (${draft.kind})`,
        '',
        'Current thesis (rewrite):',
        draft.hypothesis,
        '',
        'Evidence sentences (the only facts you may use):',
        ...evidence,
      ].join('\n');
      const release = await semaphore.acquire();
      let reply;
      try {
        const c = await clientPromise;
        const res = await c.messages.create({ model, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: user }] });
        if (res.stop_reason === 'refusal') return { draft, polished: false, reason: `model refusal (${res.stop_details?.category ?? 'unspecified'})` };
        reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      } catch (e) {
        return { draft, polished: false, reason: `model call failed: ${e?.message ?? e}` };
      } finally {
        release();
      }
      let parsed;
      try {
        parsed = extractJson(reply);
      } catch (e) {
        return { draft, polished: false, reason: e.message };
      }
      const hypothesis = String(parsed.hypothesis ?? '').replace(/\s+/g, ' ').trim();
      const take = Array.isArray(parsed.take) ? parsed.take.map((p) => String(p).replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
      const problems = [...validatePolish(hypothesis, draft, pack), ...take.flatMap((p) => validatePolish(p, draft, pack, { allowOpinion: true }))];
      if (!hypothesis || !take.length) problems.push('empty passage');
      if (problems.length) return { draft, polished: false, reason: problems.slice(0, 3).join('; ') };
      return { draft: applyPolish(draft, { hypothesis, take }), polished: true };
    },
  };
}

/** Replace the thesis paragraph and the Take body in the manuscript; contents[] is re-split by the caller. */
export function applyPolish(draft, { hypothesis, take }) {
  let md = draft.manuscript_md;
  if (draft.kind === 'deep') {
    md = md.replace(/\*\*Faraday's thesis\.\*\*[^\n]*\n/, `**Faraday's thesis.** ${hypothesis}\n`);
  } else {
    // Standard/jurisdiction: the cover deck paragraph is the hypothesis.
    const cover = md.match(/:::cover\n# [^\n]*\n\n([^\n]+)\n/);
    if (cover) md = md.replace(cover[1], hypothesis);
  }
  const byline = draft.byline ?? 'Faraday Editorial';
  md = md.replace(/:::take\n## Faraday's Take\n[\s\S]*?\n\*— [^\n]*\*\n:::/, `:::take\n## Faraday's Take\n\n${take.join('\n\n')}\n\n*— ${byline}*\n:::`);
  return { ...draft, hypothesis, manuscript_md: md, polished: true };
}
