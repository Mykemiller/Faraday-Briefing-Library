// BL2-06 (FDY-282): build the review-chain fixtures — seven staged drafts, one per lane.
//
//   node scripts/review/fixtures/build.mjs      # rewrites drafts.json, briefings.json, briefing_lanes.json
//
// The FDY-282 prompt asks for "the 7 BL2-05 samples". BL2-05 (FDY-281, the sourced generator) is
// still in Backlog with no PR, so no BL2-05 drafts exist. The nearest real material is used instead:
//
//   theaters     deep      docs/templates/deep-sample.md  (BL-08 manuscript of record, [Sn] markers)
//   domains      standard  docs/templates/samples/data/standard-power-reckoning.json  (BL-09, [n] markers)
//   subdomains   standard  docs/templates/samples/data/standard-thermal-power-convergence.json
//   companies    profile   docs/templates/samples/data/profile-coreweave.json
//   institutions profile   BL2-04 stub generator output (no institution sample exists)
//   states       standard  BL2-04 stub generator output (jurisdiction US-TX)
//   countries    standard  BL2-04 stub generator output (jurisdiction DE)
//
// The three stub drafts are exactly what the lane runner stages today (template skeleton, no
// sources); they exercise the FAIL → requeue → PARKED path. The BL-09 JSON samples are converted
// to the BL2-05 manuscript shape (Markdown in contents[0], numbered source_refs). One deliberate
// deviation from the BL-09 renders: Thread codes (D2.5 …) are kept OFF body headings, because
// FDY-281 confines internal codes to the Sources page and G1 enforces that.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate as stubGenerate } from '../../lanes/generate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const NOW = '2026-11-09T12:00:00.000Z';
const fmt = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function kindOf(ref) {
  const m = String(ref ?? '').match(/^(signal|artifact|artifacts|company|institution|record|read)\b/i);
  if (!m) return 'briefing_record';
  const k = m[1].toLowerCase();
  return k === 'artifacts' ? 'artifact' : k === 'read' ? 'briefing_record' : k;
}

function sourceRefsFrom(sources) {
  return sources.map((s) => {
    const urls = String(s.url).split(/\s+·\s+/).map((u) => u.trim());
    const ids = (String(s.ref).match(/[0-9a-f]{8}/g) ?? []);
    const kind = kindOf(s.ref);
    const entry = { ref: `S${s.n}`, n: s.n, kind, url: urls[0], publisher: s.pub, published_at: s.d, title: s.title };
    if (urls.length > 1) entry.alt_urls = urls.slice(1);
    if (ids.length === 1) entry.id = ids[0];
    if (ids.length > 1) entry.ids = ids;
    return entry;
  });
}

function sourcesTable(sources) {
  const rows = sources.map((s) => `| S${s.n} | [${s.title.replace(/\|/g, '/')}](${String(s.url).split(/\s+·\s+/)[0]}) | ${s.pub} | ${s.d} | ${s.ref} |`);
  return ['| Ref | Source | Publisher | Date | Faraday record |', '|---|---|---|---|---|', ...rows].join('\n');
}

/** BL-09 Standard JSON → Markdown manuscript in the BL2-05 shape. */
function standardManuscript(d) {
  const [w0, w1] = d.window;
  const lines = [];
  lines.push(':::cover', `# ${d.title}`, '', d.thesis_lead, '',
    `- **Tier:** Standard brief`,
    `- **Coverage:** Theater: ${d.theater} › Sectors: ${d.sectors.map((s) => s.replace(/\s*\([^)]*\)/, '')).join(', ')}`,
    `- **Byline:** Gilbert Faraday`,
    `- **Evidence window:** ${fmt(w0)} – ${fmt(w1)}, ${d.sources.length} sources`,
    `- **Status:** DRAFT. Staged by the lane runner; not for distribution. Requires Myke sign-off (Brand Bible §07).`,
    ':::', '');
  lines.push('## The argument', '', `### ${d.summary_heading}`, '', ...d.thesis.flatMap((p) => [p, '']));
  lines.push('**At a glance**', '', '| Figure | What it measures | Date |', '|---|---|---|', ...d.glance.map((g) => `| ${g.figure} | ${g.text} | ${g.d} |`), '');
  for (const s of d.sections) {
    lines.push(`## ${s.name}`, '', s.intro, '');
    for (const it of s.items) lines.push(`- **${fmt(it.d)} · ${it.pub} — ${it.head}.** ${it.text}`);
    lines.push('');
  }
  lines.push('## Signal register', '', d.register_intro, '', '| Party | Role as reported | Cites |', '|---|---|---|',
    ...d.register.map((r) => `| ${r.party} | ${r.role} | ${r.cites.map((c) => `[${c}]`).join(' ')} |`), '');
  lines.push(':::take', "## Faraday's Take", '', d.take, '', '*— Gilbert Faraday*', ':::', '');
  lines.push('## Sources & methodology', '', ...d.method.flatMap((m) => [m, '']), sourcesTable(d.sources), '');
  return lines.join('\n');
}

/** BL-09 Profile JSON → Markdown manuscript (header, identity card, record, dated Signals, sources). */
function profileManuscript(d) {
  const lines = [];
  lines.push(`# ${d.title}`, '', `Library · Company Briefing · Profile · ${d.record.status === 'published' ? 'signed off' : 'not signed off'} · prepared ${d.prepared}`, '');
  // The BL-09 render prints the company_uid in the identity card; FDY-281 keeps internal codes on the Sources page.
  lines.push('## Identity card', '', '| Field | Value |', '|---|---|', ...d.identity.filter((i) => !/faraday record/i.test(i.label)).map((i) => `| ${i.label} | ${i.value} |`), '');
  lines.push('## What the record shows', '', d.lead, '', '### Dated Signals', '');
  for (const it of d.items) lines.push(`- **${fmt(it.d)} · ${it.pub} — ${it.head}.** ${it.text}`);
  lines.push('');
  lines.push('## Sources & method', '', ...d.method.flatMap((m) => [m, '']), sourcesTable(d.sources), '');
  return lines.join('\n');
}

function deepDraft() {
  const md = read('docs/templates/deep-sample.md');
  const json = JSON.parse(md.match(/```json source_refs\n([\s\S]*?)\n```/)[1]);
  const refs = json.map((r) => ({ ...r, n: Number(r.ref.replace(/^S/, '')), kind: 'artifact', id: r.artifact_id }));
  return { manuscript: md, source_refs: refs, hypothesis: md.match(/\*\*Faraday's thesis\.\*\*\s*([^\n]+)/)[1] };
}

const briefings = [
  { id: 'd86677a0-0b9c-41a7-b8e5-367f9044b8cf', title: 'The Power Reckoning', tier: 'deep', status: 'draft', page_target: 12, sector_id: 'D3', thread_id: 'D3.5', theme_tags: ['T-001'], institution_id: null, company_id: null, jurisdiction_id: null, airtable_record_id: 'recMlmb655VUUXSFl', version: 1, briefing_type: 'theater', byline: null, source_refs: [] },
  { id: 'fx000300-0003-4000-8000-000000000003', title: 'The Power Reckoning (Sector Briefing)', tier: 'standard', status: 'draft', page_target: 9, sector_id: 'D3', thread_id: null, theme_tags: ['T-001'], institution_id: null, company_id: null, jurisdiction_id: null, airtable_record_id: 'recMlmb655VUUXSFl', version: 1, briefing_type: 'sector', byline: null, source_refs: [] },
  { id: '4311f8af-c04c-41b4-8af5-db9de3edc5e6', title: 'The Thermal-Power Convergence Play', tier: 'standard', status: 'draft', page_target: 9, sector_id: 'D7', thread_id: 'D7.1', theme_tags: ['T-002'], institution_id: null, company_id: null, jurisdiction_id: null, airtable_record_id: 'reccr6TZtcuXnfnXo', version: 1, briefing_type: 'thread', byline: null, source_refs: [] },
  { id: '41d4c4e2-53da-4098-8ed4-8b22481857ec', title: 'CoreWeave — From Ethereum Miners to the Fastest Cloud in History', tier: 'profile', status: 'draft', page_target: 2, sector_id: 'D6', thread_id: 'D6.1', theme_tags: ['T-005'], institution_id: null, company_id: 'cmp_115f2b3f0dc7f35f', jurisdiction_id: null, airtable_record_id: 'recIXg6yYr6MNIJGm', version: 1, briefing_type: 'company', byline: null, source_refs: [] },
  { id: 'fx000700-0007-4000-8000-000000000007', title: 'Lawrence Berkeley National Laboratory', tier: 'profile', status: 'planned', page_target: 2, sector_id: 'D3', thread_id: null, theme_tags: [], institution_id: 'inst_lbnl', company_id: null, jurisdiction_id: null, airtable_record_id: null, version: 1, briefing_type: 'company', byline: null, source_refs: [] },
  { id: 'fx000800-0008-4000-8000-000000000008', title: 'Texas', tier: 'standard', status: 'planned', page_target: 9, sector_id: 'D3', thread_id: null, theme_tags: [], institution_id: null, company_id: null, jurisdiction_id: 'US-TX', airtable_record_id: null, version: 1, briefing_type: 'jurisdiction', byline: null, source_refs: [] },
  { id: 'fx000900-0009-4000-8000-000000000009', title: 'Germany', tier: 'standard', status: 'planned', page_target: 9, sector_id: 'D3', thread_id: null, theme_tags: [], institution_id: null, company_id: null, jurisdiction_id: 'DE', airtable_record_id: null, version: 1, briefing_type: 'jurisdiction', byline: null, source_refs: [] },
];
// The Power Reckoning Draft record was rendered twice in BL-08/BL-09 (Deep and Standard). The same
// live briefings row (d86677a0…) backs both; the Standard variant takes the BL2-04 lane-fixture id for
// the domains lane (fx000300…) so the two drafts do not collide on (briefing_id, version, kind) or on
// the 8-character prefix the review chain uses for prompt and import file names.

async function main() {
  const drafts = [];
  const laneOf = { theater: 'theaters', sector: 'domains', thread: 'subdomains' };
  const draftRow = (b, gen, lane, manuscript, extra = {}) => ({
    id: `draft-${b.id.slice(0, 8)}-v${b.version + 1}`,
    briefing_id: b.id,
    version: b.version + 1,
    kind: 'draft',
    status: 'draft',
    title: gen.title ?? b.title,
    tier: b.tier,
    page_target: b.page_target,
    sector_id: b.sector_id,
    thread_id: b.thread_id,
    theme_tags: b.theme_tags,
    source_refs: gen.source_refs,
    institution_id: b.institution_id,
    company_id: b.company_id,
    jurisdiction_id: b.jurisdiction_id,
    briefing_type: b.briefing_type,
    byline: gen.byline ?? null,
    hypothesis: gen.hypothesis,
    contents: [manuscript, ...(gen.contents ?? []).slice(1)],
    last_refreshed: null,
    published_at: null,
    job: `lane-${lane}`,
    evidence_from: gen.evidence_from ?? null,
    evidence_to: gen.evidence_to ?? null,
    created_at: NOW,
    created_by: extra.created_by ?? 'bl2-06-fixture-builder',
    fixture_source: extra.fixture_source,
  });

  // 1. theaters — deep sample
  {
    const b = briefings[0];
    const d = deepDraft();
    drafts.push(draftRow(b, { title: 'The Power Reckoning', source_refs: d.source_refs, hypothesis: d.hypothesis, byline: 'Gilbert Faraday, with the forward call by Mach Eigen', evidence_from: '2026-05-07', evidence_to: '2026-10-07' }, 'theaters', d.manuscript, { fixture_source: 'docs/templates/deep-sample.md' }));
  }
  // 2. domains — standard power reckoning; 3. subdomains — thermal
  for (const [idx, file, lane] of [[1, 'standard-power-reckoning', 'domains'], [2, 'standard-thermal-power-convergence', 'subdomains']]) {
    const b = briefings[idx];
    const d = readJson(`docs/templates/samples/data/${file}.json`);
    drafts.push(draftRow(b, { title: d.title, source_refs: sourceRefsFrom(d.sources), hypothesis: d.thesis_lead, byline: 'Gilbert Faraday', evidence_from: d.window[0], evidence_to: d.window[1] }, lane, standardManuscript(d), { fixture_source: `docs/templates/samples/data/${file}.json` }));
  }
  // 4. companies — CoreWeave profile
  {
    const b = briefings[3];
    const d = readJson('docs/templates/samples/data/profile-coreweave.json');
    drafts.push(draftRow(b, { title: d.title, source_refs: sourceRefsFrom(d.sources), hypothesis: d.lead, byline: null, evidence_from: '2025-10-13', evidence_to: '2026-10-13' }, 'companies', profileManuscript(d), { fixture_source: 'docs/templates/samples/data/profile-coreweave.json' }));
  }
  // 5–7. institutions / states / countries — BL2-04 stub generator (what the lane runner stages today)
  for (const [idx, lane] of [[4, 'institutions'], [5, 'states'], [6, 'countries']]) {
    const b = briefings[idx];
    const gen = await stubGenerate(b, { now: new Date(NOW) });
    drafts.push(draftRow(b, gen, lane, gen.contents.join('\n\n'), { created_by: 'briefing-lane-runner_v0.1', fixture_source: 'scripts/lanes/generate.mjs (BL2-04 stub)' }));
  }

  const lanes = ['theaters', 'domains', 'subdomains', 'companies', 'states', 'countries', 'institutions'].map((lane) => ({ lane, daily_quota: 3, cursor: { last_id: null, last_run_at: NOW }, blocked_reason: null }));
  // A prior G1 FAIL on Texas v1: the current v2 draft failing G1 again is the second consecutive FAIL ⇒ PARKED.
  const priorReviews = [
    { id: 'rev-fixture-0001', briefing_id: 'fx000800-0008-4000-8000-000000000008', version: 1, gate: 'G1-AUTO', reviewer: 'g1-auto', result: 'FAIL', score: 2, blockers: [{ code: 'no_sources', message: 'source_refs is empty' }, { code: 'placeholder_content', message: 'stub placeholders' }], notes: '{"fixture":"prior FAIL so the v2 run exercises PARKED"}', created_at: '2026-11-08T12:00:00.000Z' },
  ];

  writeFileSync(join(HERE, 'drafts.json'), JSON.stringify(drafts, null, 1));
  writeFileSync(join(HERE, 'briefings.json'), JSON.stringify(briefings, null, 1));
  writeFileSync(join(HERE, 'briefing_lanes.json'), JSON.stringify(lanes, null, 1));
  writeFileSync(join(HERE, 'briefing_reviews.prior.json'), JSON.stringify(priorReviews, null, 1));
  console.log(`[fixtures] ${drafts.length} drafts, ${briefings.length} briefings, ${lanes.length} lanes, ${priorReviews.length} prior reviews`);
  for (const d of drafts) console.log(`  ${d.job.padEnd(18)} ${d.tier.padEnd(8)} v${d.version} ${d.source_refs.length} refs  ${d.title}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
