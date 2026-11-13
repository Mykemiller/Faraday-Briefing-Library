// BL3-08 (FDY-333b): the thesis and Faraday's Take, written by the model and VERIFIED IN CODE.
//
// Decision 1 (FDY-333): a draft opens with a one-sentence thesis the cited Signals support. The model
// (llm.mjs conventions: same client, same default model, same concurrency guard) proposes it from the
// densest evidence cluster; this module verifies every number, entity and qualifier against the cited
// items. No key, a failed call, or a failed verification ⇒ NoThesisError ("no_thesis"): the draft is NOT
// staged and nothing deterministic pads the gap. Profiles are exempt (sourced facts only, no Take).
//
// Temperature 0, one retry (the retry carries the first attempt's problems). Tests use a stub client only.

import { DEFAULT_MODEL, GLOBAL_MODEL_SEMAPHORE, validatePolish, applyPolish } from './llm.mjs';
import { decodeEntities, verifyQualifiers } from './evidence.mjs';

export class NoThesisError extends Error {
  constructor(reason) {
    super(`no_thesis: ${reason}`);
    this.name = 'NoThesisError';
    this.code = 'no_thesis';
    this.reason = reason;
  }
}

export const TAKE_LABEL = 'Faraday view';
export const POSITION_VERB = /\b(?:expect(?:s|ed)?|should(?:\s+not)?|will|must|need(?:s)? to|are likely to|is likely to|would be wise to|we recommend|recommend(?:s)?)\b/i;
export const OVERLAP_LIMIT = 0.6;
const MARK = /\[S\d+\]/g;
const OPINION = /^(Faraday's reading|Our view)/;

const SYSTEM = `You are the Faraday Briefing Library's editor. You write the one-sentence thesis and "Faraday's Take" of a briefing from evidence sentences, each tagged with a marker like [S3].

Hard rules, checked by a program after you answer:
1. THESIS: exactly ONE sentence (at most 45 words) that states an argument a buyer could act on, written from the densest cluster of the evidence. It ends with the marker(s) of the evidence it restates.
2. Use ONLY the evidence supplied. Do not add a number, a name, an organisation or a date that is not in the cited sentences. Copy hedges and date qualifiers exactly: "up to", "over", "about", "casi", "by"/"after"/"before"/"from", ranges like "20–30 MW". Never attach a year to a figure the source leaves undated.
3. TAKE: 2–3 short paragraphs of argument. At least one sentence must take a position with a verb such as expect, should, will or must, and carry a marker. The Take must ADD a judgment; it may not restate a body sentence. Opinion sentences that carry no marker begin "Faraday's reading" or "Our view" and contain no number.
4. Vocabulary: Theater, Sector, Thread, Signal. Never "Key Player", "Theme", "Domain", "Sub-Domain". Never print internal codes such as D3.1.
5. If the evidence does not support a thesis, do not invent one: reply {"thesis": null, "reason": "<why>"}.
6. Reply with JSON only: {"thesis": "...", "take": ["paragraph", "paragraph"]}.`;

const tokens = (s) => new Set((decodeEntities(s).replace(MARK, ' ').toLowerCase().match(/[a-z0-9][a-z0-9'’%.-]*/g) ?? []).map((w) => w.replace(/[.'’-]+$/, '')).filter((w) => w.length > 2));

/** Sentences of a text, markers kept. */
export const sentencesOf = (text) => String(text ?? '').split(/(?<=[.!?]["')\]]?(?:\s\[S\d+\])*)\s+(?=[A-Z"'(]|\[(?!S\d))/).map((s) => s.trim()).filter(Boolean);

/** Body sentences of a manuscript: everything outside the cover, the Take block and the Sources page. */
export function bodySentences(manuscript) {
  let md = String(manuscript ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  md = md.replace(/:::cover[\s\S]*?\n:::/, '').replace(/:::take[\s\S]*?\n:::/, '');
  const i = md.search(/^## Sources & method/m);
  if (i >= 0) md = md.slice(0, i);
  const out = [];
  for (const line of md.split('\n')) {
    if (!line.trim() || line.startsWith('#') || /^\|?[-| :]+\|?$/.test(line)) continue;
    const cells = line.startsWith('|') ? line.replace(/^\||\|$/g, '').split('|') : [line];
    for (const c of cells) out.push(...sentencesOf(c.replace(/^\s*[-*]\s+/, '')));
  }
  return out;
}

/** Fraction of `sentence`'s tokens that also occur in `other`. */
export function tokenOverlap(sentence, other) {
  const a = tokens(sentence);
  if (!a.size) return 0;
  const b = tokens(other);
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n / a.size;
}

const NOT_ENTITIES = new Set(['faraday', "faraday's", 'signal', 'signals', 'sector', 'thread', 'theater', 'take', 'our', 'the', 'this', 'that', 'we', 'it', 'these', 'those', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'q1', 'q2', 'q3', 'q4', 'expect', 'should', 'will', 'must', 'if', 'but', 'and', 'while', 'when', 'where', 'because', 'although', 'unless', 'until', 'after', 'before', 'by', 'in', 'on', 'at', 'for', 'with', 'from', 'as']);

/** Named entities in generated text: capitalised words / runs, sentence-initial single words excluded. */
export function entitiesIn(text) {
  const out = new Set();
  for (const s of sentencesOf(decodeEntities(text).replace(MARK, ' '))) {
    const words = s.split(/\s+/);
    for (let i = 0; i < words.length; ) {
      const w = words[i].replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '');
      if (!/^[A-Z][\w&'’.-]*$/.test(w) || NOT_ENTITIES.has(w.toLowerCase())) { i += 1; continue; }
      let j = i + 1;
      const run = [w];
      while (j < words.length) {
        const n = words[j].replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '');
        if (/^[A-Z][\w&'’.-]*$/.test(n) && !NOT_ENTITIES.has(n.toLowerCase())) { run.push(n); j += 1; } else break;
      }
      if (!(i === 0 && run.length === 1)) out.add(run.join(' '));
      i = j;
    }
  }
  return [...out];
}

function citedItems(sentenceOrText, draft, pack) {
  const byRef = new Map(draft.source_refs.map((r) => [r.ref, r]));
  const out = [];
  for (const m of String(sentenceOrText).matchAll(MARK)) {
    const r = byRef.get(m[0].slice(1, -1));
    if (!r) continue;
    const it = pack.items.find((x) => x.url === r.url) ?? (pack.jurisdiction_record?.url === r.url ? pack.jurisdiction_record : null) ?? (pack.entity?.url === r.url ? pack.entity : null);
    if (it) out.push(it);
  }
  return out;
}

/**
 * Verify a proposed thesis + Take against the draft it will sit in. Returns problems[] (empty = accept).
 * Checks: one-sentence thesis · markers exist and cite · numbers in cited items · entities in cited items ·
 * no changed hedge/qualifier (verifyQualifiers) · Take has a position verb and a marker · no Take sentence
 * shares more than 60 % of its tokens with a body sentence.
 */
export function verifyThesis(thesis, take, draft, pack) {
  const problems = [];
  if (!thesis || typeof thesis !== 'string') return ['empty thesis'];
  if (!Array.isArray(take) || !take.length) problems.push('empty take');
  const thesisSentences = sentencesOf(thesis);
  if (thesisSentences.length !== 1) problems.push(`thesis must be one sentence (got ${thesisSentences.length})`);
  const words = thesis.replace(MARK, ' ').trim().split(/\s+/).length;
  if (words > 45) problems.push(`thesis is ${words} words (max 45)`);
  if (!MARK.test(thesis)) problems.push('thesis carries no marker');
  MARK.lastIndex = 0;
  problems.push(...validatePolish(thesis, draft, pack));
  const takeText = (take ?? []).join('\n\n');
  problems.push(...(take ?? []).flatMap((p) => validatePolish(p, draft, pack, { allowOpinion: true })));

  // entities and qualifiers, sentence by sentence against the items that sentence cites
  for (const [label, text] of [['thesis', thesis], ['take', takeText]]) {
    for (const s of sentencesOf(text)) {
      if (OPINION.test(s)) continue;
      const items = citedItems(s, draft, pack);
      if (!items.length) continue;
      const pool = decodeEntities(`${items.map((it) => `${it.headline} ${it.publisher ?? ''} ${(it.text ?? []).join(' ')}`).join(' ')} ${draft.title ?? ''} ${pack.jurisdiction?.name ?? ''}`).toLowerCase();
      for (const e of entitiesIn(s)) {
        const low = e.toLowerCase();
        if (pool.includes(low) || low.split(/\s+/).every((w) => pool.includes(w))) continue;
        problems.push(`${label} names "${e}", which no cited item states`);
      }
      for (const q of verifyQualifiers(s.replace(MARK, ' '), items)) problems.push(`${label} ${q.code}: "${q.figure}"`);
    }
  }

  // Take rules
  if (!POSITION_VERB.test(takeText)) problems.push('take takes no position (no expect/should/will/must)');
  if (!MARK.test(takeText)) problems.push('take carries no marker');
  MARK.lastIndex = 0;
  const body = bodySentences(draft.manuscript_md);
  for (const s of sentencesOf(takeText)) {
    if (OPINION.test(s) && !MARK.test(s)) { MARK.lastIndex = 0; continue; }
    MARK.lastIndex = 0;
    if (tokens(s).size < 6) continue;
    const hit = body.find((b) => tokenOverlap(s, b) > OVERLAP_LIMIT);
    if (hit) problems.push(`take restates a body sentence: "${s.slice(0, 70)}"`);
  }
  return [...new Set(problems)];
}

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

function extractJson(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('no JSON object in model reply');
  return JSON.parse(text.slice(a, b + 1));
}

/**
 * Build the writer. Returns null when disabled (no key, no client) so callers fail closed:
 * a null writer with the thesis gate on ⇒ no_thesis.
 */
export function createThesisWriter({ client = null, apiKey = process.env.ANTHROPIC_API_KEY, model = DEFAULT_MODEL, semaphore = GLOBAL_MODEL_SEMAPHORE, enabled = true, maxTokens = 2000 } = {}) {
  if (!enabled) return null;
  let clientPromise = client ? Promise.resolve(client) : null;
  if (!clientPromise) {
    if (!apiKey) return null;
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey }));
  }
  const ask = async (user) => {
    const release = await semaphore.acquire();
    try {
      const c = await clientPromise;
      const res = await c.messages.create({ model, max_tokens: maxTokens, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: user }] });
      if (res.stop_reason === 'refusal') throw new Error(`model refusal (${res.stop_details?.category ?? 'unspecified'})`);
      return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    } finally {
      release();
    }
  };
  return {
    model,
    /** @returns {Promise<{ ok: true, thesis: string, take: string[], label: string, model: string, attempts: number } | { ok: false, reason: string, attempts: number }>} */
    async write(draft, pack) {
      const evidence = evidenceLines(draft, pack);
      if (!evidence.length) return { ok: false, reason: 'no evidence lines', attempts: 0 };
      const base = [`Title: ${draft.title}`, `Tier: ${draft.tier} (${draft.kind})`, '', 'Evidence sentences (the only facts you may use):', ...evidence].join('\n');
      let reason = 'no attempt';
      let feedback = '';
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let reply;
        try {
          reply = await ask(feedback ? `${base}\n\nYour previous answer was rejected for: ${feedback}\nWrite it again and fix exactly those problems.` : base);
        } catch (e) {
          reason = `model call failed: ${e?.message ?? e}`;
          feedback = reason;
          continue;
        }
        let parsed;
        try {
          parsed = extractJson(reply);
        } catch (e) {
          reason = e.message;
          feedback = reason;
          continue;
        }
        if (parsed.thesis == null) return { ok: false, reason: `model found no supportable thesis${parsed.reason ? `: ${String(parsed.reason).slice(0, 120)}` : ''}`, attempts: attempt };
        const thesis = String(parsed.thesis).replace(/\s+/g, ' ').trim();
        const take = Array.isArray(parsed.take) ? parsed.take.map((p) => String(p).replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
        const problems = verifyThesis(thesis, take, draft, pack);
        if (!problems.length) return { ok: true, thesis, take, label: TAKE_LABEL, model, attempts: attempt };
        reason = problems.slice(0, 3).join('; ');
        feedback = problems.slice(0, 6).join('; ');
      }
      return { ok: false, reason, attempts: 2 };
    },
  };
}

export const META_RE = /\n?<!-- bl3-08 (\{[\s\S]*?\}) -->\s*$/;

/** Put the verified thesis and Take into the manuscript and record them, with the model id, as a trailing comment. */
export function applyThesis(draft, w) {
  const take = w.take.map((p, i) => (i === 0 ? `**${w.label}.** ${p}` : p));
  const out = applyPolish(draft, { hypothesis: w.thesis, take });
  const meta = JSON.stringify({ thesis: w.thesis, take: w.take, label: w.label, model: w.model, attempts: w.attempts }).replace(/-->/g, '--\\u003e');
  return { ...out, polished: false, thesis: { text: w.thesis, take: w.take, label: w.label, model: w.model, attempts: w.attempts }, manuscript_md: `${out.manuscript_md.replace(META_RE, '').replace(/\s+$/, '')}\n\n<!-- bl3-08 ${meta} -->\n` };
}

/** Read the thesis record back out of a staged manuscript (G1 uses this); null when absent or unparseable. */
export function readThesisMeta(manuscript) {
  const m = String(manuscript ?? '').match(META_RE);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    return j && typeof j.thesis === 'string' && j.thesis.trim() ? j : null;
  } catch {
    return null;
  }
}
