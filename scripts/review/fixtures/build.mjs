// BL2-06 (FDY-282): build the review-chain fixtures from the seven BL2-05 sample drafts.
//
//   node scripts/review/fixtures/build.mjs      # rewrites drafts.json, briefings.json, briefing_lanes.json,
//                                               # briefing_reviews.prior.json, sources.json
//
// Inputs (all committed by BL2-05, FDY-281):
//   docs/briefs/samples/<lane>-<slug>.md            one sourced manuscript per lane, with its
//                                                   ```json source_refs``` block and a header comment
//                                                   (briefing id, tier, measured pages, source count)
//   scripts/lanes/fixtures/briefings.json           the parent briefings rows the lane runner used
//   scripts/lanes/fixtures/briefing_lanes.json      the seven lane rows
//   scripts/lanes/fixtures/evidence/<briefing>.json the EvidencePack each draft was composed from —
//                                                   signals (framing), artifacts (summary), JW records,
//                                                   PUC/permit events, moratoria, companies/institutions
//
// sources.json is derived from the evidence packs: for every source_refs entry, the record text the
// generator composed from (a signal's framing and faradays_take, an artifact's summary, the JW/company/institution
// record, the event or moratorium text) keyed by the entry's url (raw, and normalised when distinct).
// That is exactly what G1's number check and Reviewer A should be given: the Faraday record, not a
// re-fetch. The one prior-FAIL row (Texas v1) exercises the two-consecutive-FAILs ⇒ PARKED path.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseUrl } from '../g1.mjs';
import { jwEventDate } from '../../lanes/evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

export const SAMPLES = Object.freeze({
  theaters: 'theaters-the-power-reckoning.md',
  domains: 'domains-grid-regulatory.md',
  subdomains: 'subdomains-interconnection-queue-grid-access.md',
  companies: 'companies-coreweave.md',
  institutions: 'institutions-electric-reliability-council-of-texas.md',
  states: 'states-texas.md',
  countries: 'countries-germany.md',
});

const NOW = '2026-11-09T13:30:00.000Z';

function parseHeader(md) {
  const h = md.match(/<!--([\s\S]*?)-->/)?.[1] ?? '';
  const get = (re) => h.match(re)?.[1] ?? null;
  return {
    briefing_id: get(/briefing\s+(\S+)/),
    lane: get(/lane\s+(\w+)/),
    tier: get(/tier\s+(\w+)/),
    generated: get(/generated\s+(\S+)/),
    generator: get(/by\s+(\S+)\s+\(/),
    measured_pages: Number(get(/measured pages:\s+(\d+)/)),
    source_count: Number(get(/sources:\s+(\d+)/)),
  };
}

function sourceRefsOf(md) {
  const m = md.match(/```json source_refs\n([\s\S]*?)\n```/);
  if (!m) throw new Error('sample has no source_refs block');
  return JSON.parse(m[1]);
}

const flat = (o) => Object.entries(o ?? {}).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join('; ');
const parseMaybe = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v.replace(/'/g, '"')); } catch { return null; } };

/** Record text for one source_refs entry from the pack it was composed from. */
function recordFor(ref, pack) {
  const sig = (pack.signals ?? []).find((s) => s.id === ref.id) ?? (pack.signals ?? []).find((s) => s.source_url === ref.url);
  const art = (pack.artifacts ?? []).find((a) => a.artifact_id === (ref.artifact_id ?? ref.id)) ?? (pack.artifacts ?? []).find((a) => a.source_url === ref.url);
  const parts = [];
  const dates = [];
  let title = ref.title ?? null;
  let published_at = ref.published_at ?? null;
  if (sig) { if (sig.framing) parts.push(sig.framing); if (sig.faradays_take) parts.push(sig.faradays_take); if (sig.fired_at) dates.push(sig.fired_at); if (sig.event_date) dates.push(sig.event_date); const a = typeof sig.artifact === 'object' ? sig.artifact : parseMaybe(sig.artifact); if (a?.summary) parts.push(a.summary); if (a?.title) title = title ?? a.title; }
  if (art) { if (art.summary) parts.push(art.summary); if (art.title) { parts.push(art.title); title = title ?? art.title; } published_at = published_at ?? art.published_at ?? null; }
  if (ref.kind === 'record') {
    for (const rec of [pack.jurisdiction, pack.company, pack.institution]) if (rec && (rec.id === ref.id || rec.company_uid === ref.id || rec.institution_uid === ref.id)) parts.push(flat(rec));
    if (!parts.length) for (const rec of [pack.jurisdiction, pack.company, pack.institution]) if (rec) parts.push(flat(rec));
  }
  if (ref.kind === 'jw_event') {
    for (const ev of [...(pack.jw?.permit_events ?? []), ...(pack.jw?.puc ?? [])]) if (ev.id === ref.id) { parts.push(flat(ev)); const d = jwEventDate(ev); if (d) dates.push(d); if (ev.filed_date) dates.push(ev.filed_date); } // BL3-07: event date, never period_end
  }
  if (ref.kind === 'moratorium') {
    for (const m of pack.jw?.moratoria ?? []) if (m.moratorium_id === ref.id) { parts.push(flat(m)); if (m.date_enacted_iso) dates.push(m.date_enacted_iso); }
  }
  const text = parts.filter(Boolean).join('\n');
  return { url: ref.url, kind: ref.kind, id: ref.id ?? null, artifact_id: ref.artifact_id ?? art?.artifact_id ?? null, title, published_at, text: text || null, dates, found: Boolean(sig || art || text) };
}

function main() {
  const laneBriefings = readJson('scripts/lanes/fixtures/briefings.json');
  const lanes = readJson('scripts/lanes/fixtures/briefing_lanes.json');
  const drafts = [];
  const briefings = [];
  const sources = {};
  let missing = 0;
  for (const [lane, file] of Object.entries(SAMPLES)) {
    const path = `docs/briefs/samples/${file}`;
    const md = read(path);
    const h = parseHeader(md);
    const refs = sourceRefsOf(md);
    const b = laneBriefings.find((x) => x.id === h.briefing_id);
    if (!b) throw new Error(`${file}: briefing ${h.briefing_id} not in scripts/lanes/fixtures/briefings.json`);
    briefings.push({ ...b, source_refs: b.source_refs ?? [] });
    const packPath = join(ROOT, 'scripts/lanes/fixtures/evidence', `${b.id}.json`);
    const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, 'utf8')) : {};
    for (const r of refs) {
      const rec = recordFor(r, pack);
      if (!rec.found) missing += 1;
      sources[r.url] = rec;
      const norm = normaliseUrl(r.url);
      if (norm !== r.url && !sources[norm]) sources[norm] = rec;
    }
    const cover = md.replace(/<!--[\s\S]*?-->/, '').match(/:::cover\n# [^\n]+\n\n([^\n]+)/)?.[1] ?? null;
    drafts.push({
      id: `draft-${b.id.slice(0, 8)}-v${b.version + 1}`,
      briefing_id: b.id,
      version: b.version + 1,
      kind: 'draft',
      status: 'draft',
      title: b.title,
      tier: h.tier ?? b.tier,
      page_target: b.page_target ?? null,
      sector_id: b.sector_id ?? null,
      thread_id: b.thread_id ?? null,
      theme_tags: b.theme_tags ?? [],
      source_refs: refs,
      institution_id: b.institution_id ?? null,
      company_id: b.company_id ?? null,
      jurisdiction_id: b.jurisdiction_id ?? null,
      briefing_type: b.briefing_type,
      byline: md.match(/\*\*Byline:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? null,
      hypothesis: cover,
      contents: [md],
      last_refreshed: null,
      published_at: null,
      job: `lane-${lane}`,
      evidence_from: null,
      evidence_to: null,
      created_at: h.generated ?? NOW,
      created_by: h.generator ?? 'briefing-lane-runner_v0.2',
      fixture_source: path,
      generator_measured_pages: h.measured_pages,
    });
  }
  const priorReviews = [
    { id: 'rev-fixture-0001', briefing_id: 'fx000800-0008-4000-8000-000000000008', version: 1, gate: 'G1-AUTO', reviewer: 'g1-auto', result: 'FAIL', score: 2, blockers: [{ code: 'no_sources', message: 'source_refs is empty' }, { code: 'placeholder_content', message: 'stub placeholders' }], notes: '{"fixture":"prior FAIL (the BL2-04 stub v1) so a v2 FAIL would be the second consecutive and park"}', created_at: '2026-11-08T12:00:00.000Z' },
  ];
  const meta = { built_at: NOW, from: 'docs/briefs/samples/*.md + scripts/lanes/fixtures/evidence/*.json (BL2-05, FDY-281)', method: 'per source_refs entry: the record text the generator composed from (signal framing + faradays_take, artifact summary/title, JW/company/institution record, event or moratorium fields), keyed by raw url and by normalised url when distinct', entries: Object.keys(sources).length, without_record: missing };
  writeFileSync(join(HERE, 'drafts.json'), JSON.stringify(drafts, null, 1));
  writeFileSync(join(HERE, 'briefings.json'), JSON.stringify(briefings, null, 1));
  writeFileSync(join(HERE, 'briefing_lanes.json'), JSON.stringify(lanes.map((l) => ({ ...l, cursor: l.cursor ?? {} })), null, 1));
  writeFileSync(join(HERE, 'briefing_reviews.prior.json'), JSON.stringify(priorReviews, null, 1));
  writeFileSync(join(HERE, 'sources.json'), JSON.stringify({ _meta: meta, sources, records: {} }, null, 1));
  console.log(`[fixtures] ${drafts.length} drafts from BL2-05 samples, ${Object.keys(sources).length} source entries (${missing} without a record in the evidence pack)`);
  for (const d of drafts) console.log(`  ${d.job.padEnd(18)} ${d.tier.padEnd(8)} v${d.version} ${String(d.source_refs.length).padStart(2)} refs  generator pages ${d.generator_measured_pages}  ${d.title}`);
}

main();
