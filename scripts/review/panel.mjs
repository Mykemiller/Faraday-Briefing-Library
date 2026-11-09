// BL2-06 (FDY-282): G2-PANEL (ThoughtForge panel) and G3-XCHECK (two independent cross-checkers).
//
// Where the reviewers come from
//   The ThoughtForge panel has no review API (its /api/ask is an SSE "ask the panel" session behind an
//   access cookie, and no ThoughtForge host answers from the review runner's network), so the panel is
//   reconstructed from the persona files in the thoughtforge repo (cast/<slug>/persona.json, dossier.md,
//   skills/*/SKILL.md, cast/_shared/skills/evidence-ladder) — THOUGHTFORGE_CAST_DIR, default
//   ../thoughtforge/cast next to this repo. Each panelist gets the same persona stack the ThoughtForge
//   app composes (identity, voice, backstory, own skills, evidence ladder) plus the review turn.
//
// Two ways to execute the reviewers
//   --panel api     Anthropic SDK (claude-opus-5-5, adaptive thinking, JSON-schema output), one request
//                   per panelist in parallel, then the chair consolidates. Needs ANTHROPIC_API_KEY.
//   --panel import  Read reviewer JSON written by independent sessions (Claude Code subagents fed the
//                   exact prompts this module emits with --emit-prompts). This is how the dry run on
//                   the fixtures was executed; see docs/ops/review-chain.md.
//
// Verdict rules live HERE, not in the model: G2 FAIL if any score < 3 or any required edit is factual;
// G3 FAIL if A finds a mismatch or B finds a template/voice violation; A and B disagreeing on the same
// sentence ⇒ PARKED. Reviewer labels: "tf-panel:<preset>", "xcheck-facts", "xcheck-voice".

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseManuscript, bodySections, unitsOf, refNumber, urlsOf } from './g1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

export const DEFAULT_MODEL = process.env.REVIEW_MODEL || 'claude-opus-5-5';
export const DEFAULT_CAST_DIR = process.env.THOUGHTFORGE_CAST_DIR || join(ROOT, '..', 'thoughtforge', 'cast');

// ---------------------------------------------------------------------------------------------
// Presets (docs/ops/review-chain.md §G2 carries the same table)
// ---------------------------------------------------------------------------------------------

export const CHAIR = 'gilbert-faraday';
export const FACT_CHECKER = 'constance-wright';
export const PRESS_LEAD = 'delia-marchetti';

export const PRESETS = Object.freeze({
  'faraday-editorial': { label: 'Faraday Editorial', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD] },
  'power-grid': { label: 'Power & Grid', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'mach-eigen', 'albert-thorne'] },
  capital: { label: 'Capital', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'victoria-stroud'] },
  'hyperscale-cloud': { label: 'Hyperscale & Cloud', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'victoria-stroud', 'margo-brandt'] },
  thermal: { label: 'Thermal', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'ingrid-halverson', 'mach-eigen'] },
  'site-build': { label: 'Site & Build', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'margo-brandt', 'hartford-nakamura'] },
  'community-policy': { label: 'Community & Policy', chair: CHAIR, members: [FACT_CHECKER, PRESS_LEAD, 'rosalind-ferraro', 'hartford-nakamura'] },
  jurisdiction: { label: 'Jurisdiction', chair: CHAIR, members: [FACT_CHECKER, 'albert-thorne', 'hartford-nakamura', 'rosalind-ferraro'] },
  'profile-light': { label: 'Profile Light', chair: null, members: [] }, // one expert, chosen by sector (PROFILE_EXPERT)
});

/** faraday_domains code → preset. Anything unmapped falls back to the default preset. */
export const SECTOR_PRESET = Object.freeze({
  D1: 'thermal', D2: 'power-grid', D3: 'power-grid', D4: 'capital', D5: 'hyperscale-cloud', D6: 'hyperscale-cloud',
  D7: 'thermal', D9: 'power-grid', D10: 'site-build', D13: 'community-policy', D14: 'site-build', D18: 'community-policy',
  D19: 'community-policy', D20: 'site-build', D22: 'faraday-editorial',
});

/** Profile light panel: the one expert by sector. */
export const PROFILE_EXPERT = Object.freeze({
  D1: 'ingrid-halverson', D2: 'mach-eigen', D3: 'albert-thorne', D4: 'victoria-stroud', D5: 'victoria-stroud', D6: 'victoria-stroud',
  D7: 'ingrid-halverson', D9: 'mach-eigen', D10: 'margo-brandt', D13: 'rosalind-ferraro', D14: 'margo-brandt', D18: 'rosalind-ferraro',
  D19: 'hartford-nakamura', D20: 'margo-brandt',
});

export function pickPreset(draft) {
  const sector = String(draft?.sector_id ?? '').split('.')[0].toUpperCase();
  if (String(draft?.tier).toLowerCase() === 'profile') {
    const expert = PROFILE_EXPERT[sector] ?? CHAIR;
    return { key: 'profile-light', label: PRESETS['profile-light'].label, chair: null, members: [expert], reviewer: 'tf-panel:profile-light' };
  }
  const key = draft?.briefing_type === 'jurisdiction' ? 'jurisdiction' : SECTOR_PRESET[sector] ?? 'faraday-editorial';
  const p = PRESETS[key];
  return { key, label: p.label, chair: p.chair, members: [...p.members], reviewer: `tf-panel:${key}` };
}

// ---------------------------------------------------------------------------------------------
// Cast loading (mirrors thoughtforge/src/cast/loader.ts + prompt.ts, read-only)
// ---------------------------------------------------------------------------------------------

function skillBody(path) {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? m[2].trim() : raw.trim();
}

function dossierSection(md, heading) {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^## ${esc}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
  return (md.match(re)?.[1] ?? '').trim();
}

export function loadPersona(slug, castDir = DEFAULT_CAST_DIR) {
  const dir = join(castDir, slug);
  if (!existsSync(join(dir, 'persona.json'))) throw new Error(`persona ${slug} not found under ${castDir} (set THOUGHTFORGE_CAST_DIR)`);
  const persona = JSON.parse(readFileSync(join(dir, 'persona.json'), 'utf8'));
  const dossier = existsSync(join(dir, 'dossier.md')) ? readFileSync(join(dir, 'dossier.md'), 'utf8') : '';
  const skills = (persona.skills ?? [])
    .filter((s) => s.kind === 'persona' && s.name !== 'gdelt-lens')
    .map((s) => {
      const p = join(castDir, String(s.path).replace(/^cast\//, ''));
      return existsSync(p) ? { name: s.name, body: skillBody(p) } : null;
    })
    .filter(Boolean);
  const ladderPath = join(castDir, '_shared', 'skills', 'evidence-ladder', 'SKILL.md');
  const ladder = existsSync(ladderPath) ? skillBody(ladderPath) : '';
  return { slug, persona, backstory: dossierSection(dossier, 'Backstory'), skills, ladder };
}

export function listCast(castDir = DEFAULT_CAST_DIR) {
  if (!existsSync(castDir)) return [];
  return readdirSync(castDir).filter((d) => !d.startsWith('_') && statSync(join(castDir, d)).isDirectory() && existsSync(join(castDir, d, 'persona.json')));
}

/** The fixed persona part of a panelist's system prompt (ThoughtForge order: identity, voice, backstory, skills, ladder). */
export function personaCore(p) {
  const domains = (p.persona.idf_domains ?? []).map((d) => `${d.code} ${d.name}`).join(', ');
  return [
    `# You are ${p.persona.display_name}, ${p.persona.role} on the ThoughtForge panel.`,
    `IDF domains: ${domains}.${p.persona.domains_as_written ? ` Domains as written: ${p.persona.domains_as_written}` : ''}`,
    `## Voice\n${p.persona.voice_brief}${p.persona.sample_line ? `\nSample line: "${p.persona.sample_line}"` : ''}`,
    p.backstory ? `## Backstory\n${p.backstory}` : null,
    ...p.skills.map((s) => `## Skill: ${s.name}\n${s.body}`),
    p.ladder ? `## Shared skill: evidence-ladder\n${p.ladder}` : null,
  ].filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// Review turns and schemas
// ---------------------------------------------------------------------------------------------

export const PANELIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    thesis_clear: { type: 'integer', minimum: 0, maximum: 5 },
    evidence_sufficient: { type: 'integer', minimum: 0, maximum: 5 },
    what_to_watch_useful: { type: 'integer', minimum: 0, maximum: 5 },
    could_a_buyer_act: { type: 'boolean' },
    required_edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['factual', 'structural', 'style'] },
          location: { type: 'string' },
          edit: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['kind', 'location', 'edit', 'reason'],
      },
    },
    note: { type: 'string' },
  },
  required: ['thesis_clear', 'evidence_sufficient', 'what_to_watch_useful', 'could_a_buyer_act', 'required_edits', 'note'],
};

export const PANEL_TURN = `## This turn: review a Briefing Library draft for the G2 panel gate

You receive the manuscript and its sources list, nothing else. The Founder's instruction is outcome
focus: judge whether a BUYER could act on this brief, not its style. Score 0–5:
- thesis_clear: does the reader know within 30 seconds what Faraday thinks and why it matters?
- evidence_sufficient: are the claims that matter carried by the cited sources, with no load-bearing gap?
- what_to_watch_useful: would the forward items (dates, triggers, calendar) change a buyer's next move?
required_edits: only edits the draft NEEDS to be actionable. kind='factual' means a stated fact, number,
date or attribution is wrong or unsupported by the sources list — a factual edit fails the gate, so use
it only when you are sure. 'structural' = a missing or misplaced part a buyer needs; 'style' = optional.
Any score below 3 fails the gate. Do not re-check vocabulary, page count or markers (G1 did that).
Return ONLY the JSON object requested, in your own voice inside "note" (under 60 words).`;

export const CHAIR_TURN = `## This turn: rule on the panel's review

You have the manuscript, the sources list and each panelist's JSON review. Consolidate into ONE
review in the same JSON shape: take the panel's evidence seriously, do not average blindly, and keep
a required edit only if you would stand behind it. Mark an edit 'factual' only when a stated fact,
number, date or attribution is wrong or unsupported by the sources list. Any score below 3 fails.
Outcome focus: could a buyer act on this brief? "note" under 60 words, your voice.`;

export const XCHECK_FACTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sentence: { type: 'string' },
          claim: { type: 'string' },
          cited: { type: 'array', items: { type: 'string' } },
          source_excerpt: { type: 'string' },
          verdict: { type: 'string', enum: ['mismatch', 'unverifiable'] },
        },
        required: ['sentence', 'claim', 'cited', 'source_excerpt', 'verdict'],
      },
    },
    cleared: { type: 'array', items: { type: 'string' } },
    numbers_checked: { type: 'integer', minimum: 0 },
    summary: { type: 'string' },
  },
  required: ['findings', 'cleared', 'numbers_checked', 'summary'],
};

export const XCHECK_FACTS_SYSTEM = `You are Reviewer A, "xcheck-facts", an independent fact cross-checker for the Faraday Briefing
Library. You receive a manuscript and the raw text of its cited sources, and NOTHING else — no lane
notes, no panel output, no house style. Your only job: re-derive every cited number and date in the
manuscript from the source text it cites.
- For each sentence that carries a citation marker ([S3], [3], [3, 7]) and contains a number, date,
  percentage, currency amount or count: find the figure in the cited source text. "Cited" means the
  marker's source; another source agreeing does not rescue a wrong citation.
- A figure that the cited source does not state, or states differently (value, unit, date, party,
  direction), is a "mismatch" — quote the sentence and the closest source excerpt (verbatim, ≤ 300 chars).
- A figure whose cited source text is absent or truncated in what you were given is "unverifiable"
  (quote what you have). Unverifiable is NOT a mismatch.
- Rounding stated as such ("about", "more than", "nearly") that the source supports is NOT a mismatch;
  unit conversions that are arithmetically right are NOT a mismatch; a different date format is NOT a
  mismatch.
- List every sentence you checked and found fully supported in "cleared", verbatim.
Never comment on tone, structure or template. Return ONLY the JSON object requested.`;

export const XCHECK_VOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sentence_or_section: { type: 'string' },
          rule: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['sentence_or_section', 'rule', 'note'],
      },
    },
    cleared: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['violations', 'cleared', 'summary'],
};

export const XCHECK_VOICE_SYSTEM = `You are Reviewer B, "xcheck-voice", an independent template-and-voice checker for the Faraday Briefing
Library. You receive the manuscript, Brand Bible §06 (the Editorial-Authoritative voice variant) and
the tier template. You check ONLY:
- structure: the template's section list, in order, each required part present;
- section budget: parts that are plainly over or under the template's page/word guidance;
- hypothesis-led opening: the thesis arrives first, not the context (the reader knows within 30
  seconds what Faraday thinks and why it matters);
- Faraday's Take rules: present where the template requires it (and ABSENT on a Profile), opinion
  only, introduces no fact that is not already sourced in the body;
- voice: sourced claims throughout (no "experts predict", no "industry observers note"), no
  hedge-padding, public vocabulary Theater / Sector / Thread / Signal.
You NEVER judge whether a fact or number is correct — that is another reviewer's job. FAIL only on a
template or voice violation; quote the sentence or name the section for each one, and name the rule.
List the sentences and sections you examined and found compliant in "cleared" (verbatim sentences,
or "section: <heading>"). Return ONLY the JSON object requested.`;

// ---------------------------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------------------------

export function sourcesListText(draft) {
  const refs = Array.isArray(draft?.source_refs) ? draft.source_refs : [];
  return refs.map((r) => {
    const n = refNumber(r);
    const bits = [r.publisher, r.published_at, r.kind ? `${r.kind}${r.id ? ` ${r.id}` : ''}` : null].filter(Boolean).join(' · ');
    return `S${n}. ${r.title ?? '(untitled)'}${bits ? ` (${bits})` : ''}\n    ${urlsOf(r).join(' · ')}`;
  }).join('\n');
}

/** Raw source texts for Reviewer A, keyed S<n>, from the resolver (fixture or live). */
export function sourceTextsFor(draft, resolve) {
  const refs = Array.isArray(draft?.source_refs) ? draft.source_refs : [];
  const out = [];
  for (const r of refs) {
    const n = refNumber(r);
    const texts = [];
    for (const u of urlsOf(r)) {
      const res = resolve ? resolve(u, { ref: r }) : null;
      if (res?.text) texts.push({ url: u, text: res.text, truncated: Boolean(res.truncated) });
    }
    out.push({ n, title: r.title, texts });
  }
  return out;
}

export function rawSourcesText(sourceTexts, { maxCharsPerSource = 12000 } = {}) {
  return sourceTexts.map((s) => {
    if (!s.texts.length) return `=== S${s.n} · ${s.title ?? ''}\n[no source text available]`;
    return s.texts.map((t) => `=== S${s.n} · ${s.title ?? ''} · ${t.url}${t.truncated ? ' · [TRUNCATED at capture]' : ''}\n${t.text.slice(0, maxCharsPerSource)}`).join('\n\n');
  }).join('\n\n');
}

export function brandBibleSection06() {
  const md = readFileSync(join(ROOT, 'docs/brand/briefing-library-brand-bible-v2.md'), 'utf8');
  const m = md.match(/## 06\.[\s\S]*?(?=\n## 07\.)/);
  return m ? m[0].trim() : '';
}

export function tierTemplateText(draft) {
  const tier = String(draft?.tier ?? '').toLowerCase();
  const file = tier === 'deep' ? 'deep.md' : tier === 'profile' ? 'profile.md' : 'standard.md';
  let text = readFileSync(join(ROOT, 'docs/templates', file), 'utf8');
  if (draft?.briefing_type === 'jurisdiction') {
    text += `\n\n## Jurisdiction variant (FDY-281)\nStandard template; the Thread sections become: Legislation & rules · Permitting & siting · Power & utility regulation · Incentives & tax · Water/environment · Signals to watch. The method note carries the line "Informational, not legal advice." Byline Gilbert.`;
  }
  return text;
}

const manuscriptOf = (draft) => draft?.manuscript_md ?? (Array.isArray(draft?.contents) ? draft.contents[0] : '') ?? '';

/** Every prompt the G2/G3 reviewers of one draft receive. Same text for api and emit modes. */
export function buildPrompts(draft, { resolve, castDir = DEFAULT_CAST_DIR, preset = pickPreset(draft) } = {}) {
  const manuscript = manuscriptOf(draft);
  const sources = sourcesListText(draft);
  const prompts = [];
  const wantPersonas = [...preset.members, ...(preset.chair ? [preset.chair] : [])];
  const castAvailable = existsSync(castDir);
  for (const slug of preset.members) {
    const core = castAvailable ? personaCore(loadPersona(slug, castDir)) : `# You are ${slug} on the ThoughtForge panel.`;
    prompts.push({
      gate: 'G2-PANEL', role: 'panelist', slug, reviewer: preset.reviewer,
      system: `${core}\n\n${PANEL_TURN}`,
      user: `## Manuscript\n\n${manuscript}\n\n## Sources list\n\n${sources}`,
      schema: PANELIST_SCHEMA,
    });
  }
  if (preset.chair) {
    const core = castAvailable ? personaCore(loadPersona(preset.chair, castDir)) : `# You are ${preset.chair}, Chief of Staff on the ThoughtForge panel.`;
    prompts.push({
      gate: 'G2-PANEL', role: 'chair', slug: preset.chair, reviewer: preset.reviewer,
      system: `${core}\n\n${CHAIR_TURN}`,
      user: `## Manuscript\n\n${manuscript}\n\n## Sources list\n\n${sources}\n\n## Panel reviews\n\n{{PANEL_REVIEWS}}`,
      schema: PANELIST_SCHEMA,
      needs: preset.members,
    });
  }
  const sourceTexts = sourceTextsFor(draft, resolve);
  prompts.push({
    gate: 'G3-XCHECK', role: 'xcheck-facts', slug: 'xcheck-facts', reviewer: 'xcheck-facts',
    system: XCHECK_FACTS_SYSTEM,
    user: `## Manuscript\n\n${manuscript}\n\n## Raw source texts\n\n${rawSourcesText(sourceTexts)}`,
    schema: XCHECK_FACTS_SCHEMA,
  });
  prompts.push({
    gate: 'G3-XCHECK', role: 'xcheck-voice', slug: 'xcheck-voice', reviewer: 'xcheck-voice',
    system: XCHECK_VOICE_SYSTEM,
    user: `## Manuscript\n\n${manuscript}\n\n## Brand Bible §06\n\n${brandBibleSection06()}\n\n## Tier template (${draft.tier}${draft.briefing_type === 'jurisdiction' ? ', jurisdiction variant' : ''})\n\n${tierTemplateText(draft)}`,
    schema: XCHECK_VOICE_SCHEMA,
  });
  for (const p of prompts) p.prompt_hash = createHash('sha256').update(p.system + '\n\n' + p.user).digest('hex').slice(0, 16);
  return { preset, personas: wantPersonas, prompts };
}

// ---------------------------------------------------------------------------------------------
// Verdicts (pure)
// ---------------------------------------------------------------------------------------------

const clamp = (v) => (Number.isInteger(v) ? Math.max(0, Math.min(5, v)) : null);

export function panelVerdict(review) {
  const scores = { thesis_clear: clamp(review?.thesis_clear), evidence_sufficient: clamp(review?.evidence_sufficient), what_to_watch_useful: clamp(review?.what_to_watch_useful) };
  const edits = Array.isArray(review?.required_edits) ? review.required_edits : [];
  const factual = edits.filter((e) => e?.kind === 'factual');
  const low = Object.entries(scores).filter(([, v]) => v == null || v < 3).map(([k]) => k);
  const blockers = [
    ...low.map((k) => ({ code: 'score_below_3', message: `${k} = ${scores[k] ?? 'missing'}`, dimension: k, score: scores[k] })),
    ...factual.map((e) => ({ code: 'factual_edit', message: `${e.location}: ${e.edit}`, edit: e })),
  ];
  const verdict = blockers.length ? 'FAIL' : 'PASS';
  const min = Math.min(...Object.values(scores).map((v) => v ?? 0));
  return { verdict, scores, min_score: min, required_edits: edits, blockers, could_a_buyer_act: review?.could_a_buyer_act ?? null, note: review?.note ?? '' };
}

const normSentence = (s) => String(s ?? '').replace(/\[(?:S?\d+)(?:\s*,\s*S?\d+)*\]/gi, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function xcheckVerdict(facts, voice) {
  const mismatches = (facts?.findings ?? []).filter((f) => f?.verdict === 'mismatch');
  const unverifiable = (facts?.findings ?? []).filter((f) => f?.verdict === 'unverifiable');
  const violations = voice?.violations ?? [];
  const aClear = new Set((facts?.cleared ?? []).map(normSentence).filter(Boolean));
  const bClear = new Set((voice?.cleared ?? []).map(normSentence).filter(Boolean));
  const disagreements = [];
  for (const m of mismatches) { const k = normSentence(m.sentence); if (k && bClear.has(k)) disagreements.push({ sentence: m.sentence, a: 'mismatch', b: 'cleared' }); }
  for (const v of violations) { const k = normSentence(v.sentence_or_section); if (k && aClear.has(k)) disagreements.push({ sentence: v.sentence_or_section, a: 'cleared', b: 'violation' }); }
  const blockers = [
    ...mismatches.map((m) => ({ code: 'fact_mismatch', reviewer: 'xcheck-facts', message: `${m.claim}: "${m.sentence}"`, sentence: m.sentence, cited: m.cited, source_excerpt: m.source_excerpt })),
    ...violations.map((v) => ({ code: 'voice_violation', reviewer: 'xcheck-voice', message: `${v.rule}: ${v.sentence_or_section}`, sentence: v.sentence_or_section, rule: v.rule, note: v.note })),
    ...disagreements.map((d) => ({ code: 'disagreement', message: `A says ${d.a}, B says ${d.b}: "${d.sentence}"`, ...d })),
  ];
  const a = mismatches.length ? 'FAIL' : facts ? 'PASS' : 'MISSING';
  const b = violations.length ? 'FAIL' : voice ? 'PASS' : 'MISSING';
  let verdict = a === 'PASS' && b === 'PASS' ? 'PASS' : 'FAIL';
  if (disagreements.length) verdict = 'PARKED';
  return { verdict, a, b, blockers, disagreements, unverifiable: unverifiable.length, mismatches: mismatches.length, violations: violations.length, numbers_checked: facts?.numbers_checked ?? null, summaries: { facts: facts?.summary ?? null, voice: voice?.summary ?? null } };
}

// ---------------------------------------------------------------------------------------------
// Execution — Anthropic SDK path
// ---------------------------------------------------------------------------------------------

let anthropicClient = null;
async function anthropic() {
  if (anthropicClient) return anthropicClient;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropicClient = new Anthropic();
  return anthropicClient;
}

/** One structured review call. JSON-schema output; streaming so long manuscripts do not time out. */
export async function callReviewer(prompt, { model = DEFAULT_MODEL, effort = 'medium' } = {}) {
  const client = await anthropic();
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    output_config: { effort, format: { type: 'json_schema', schema: prompt.schema } },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error(`reviewer ${prompt.slug} refused (${msg.stop_details?.category ?? 'unknown'})`);
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { json: parseJsonLoose(text), model: msg.model, usage: msg.usage };
}

export function parseJsonLoose(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('reviewer returned no JSON object');
  return JSON.parse(s.slice(start, end + 1));
}

/** Run the G2 panel for one draft through the API: members in parallel, then the chair. */
export async function runPanelApi(draft, opts = {}) {
  const built = buildPrompts(draft, opts);
  const members = built.prompts.filter((p) => p.role === 'panelist');
  const chair = built.prompts.find((p) => p.role === 'chair');
  const memberResults = await Promise.all(members.map(async (p) => ({ slug: p.slug, ...(await callReviewer(p, { model: opts.model, effort: 'medium' })) })));
  let final;
  if (chair) {
    const block = memberResults.map((m) => `### ${m.slug}\n${JSON.stringify(m.json)}`).join('\n\n');
    const chairPrompt = { ...chair, user: chair.user.replace('{{PANEL_REVIEWS}}', block) };
    final = { slug: chair.slug, ...(await callReviewer(chairPrompt, { model: opts.model, effort: 'high' })) };
  } else {
    final = memberResults[0];
  }
  return { preset: built.preset, members: memberResults, chair: chair ? final : null, review: final.json };
}

export async function runXcheckApi(draft, opts = {}) {
  const built = buildPrompts(draft, opts);
  const [a, b] = await Promise.all(
    ['xcheck-facts', 'xcheck-voice'].map(async (role) => {
      const p = built.prompts.find((x) => x.role === role);
      return callReviewer(p, { model: opts.model, effort: role === 'xcheck-facts' ? 'high' : 'medium' });
    }),
  );
  return { facts: a.json, voice: b.json, models: { facts: a.model, voice: b.model } };
}

// ---------------------------------------------------------------------------------------------
// Execution — import path (independent sessions wrote the JSON)
// ---------------------------------------------------------------------------------------------

export const importName = (draft, role, slug) => `${String(draft.briefing_id).slice(0, 8)}-v${draft.version}.${role === 'panelist' ? `G2.${slug}` : role === 'chair' ? `G2.chair.${slug}` : `G3.${role}`}.json`;

function readImport(dir, name) {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  return raw?.review ?? raw; // either the bare JSON or {reviewer, review}
}

export function importPanel(draft, dir, opts = {}) {
  const built = buildPrompts(draft, { ...opts, resolve: () => null, castDir: '/nonexistent' });
  const preset = built.preset;
  const members = preset.members.map((slug) => ({ slug, json: readImport(dir, importName(draft, 'panelist', slug)) }));
  const missing = members.filter((m) => !m.json).map((m) => m.slug);
  const chairJson = preset.chair ? readImport(dir, importName(draft, 'chair', preset.chair)) : null;
  if (preset.chair && !chairJson) missing.push(`chair:${preset.chair}`);
  if (missing.length) return { preset, members, chair: null, review: null, missing };
  return { preset, members, chair: preset.chair ? { slug: preset.chair, json: chairJson } : null, review: preset.chair ? chairJson : members[0].json, missing: [] };
}

export function importXcheck(draft, dir) {
  const facts = readImport(dir, importName(draft, 'xcheck-facts'));
  const voice = readImport(dir, importName(draft, 'xcheck-voice'));
  const missing = [!facts && 'xcheck-facts', !voice && 'xcheck-voice'].filter(Boolean);
  return { facts, voice, missing };
}

/** Sentences the panel can be asked about (used by tests and by the import validator). */
export function manuscriptSentences(draft) {
  return bodySections(parseManuscript(manuscriptOf(draft))).flatMap((s) => unitsOf(s.body).map((u) => u.text));
}
