// BL2-05 (FDY-281): evidence retrieval for the briefing generator.
//
// Every fact a draft prints comes from a Faraday record and nothing else: public.signals,
// public.artifacts (envelope title/summary, body text when fetched), public.companies,
// public.institutions, the faraday_* taxonomy and, for jurisdiction briefs, the Jurisdiction
// Watch tables (jurisdictions, jps_history, moratorium_nation_inventory, puc_*, jw_signal_events,
// jw_facilities, state_incentive_disclosures) — all read-only. Model memory is never a source.
//
// Two sources implement one interface, `fetchRaw(brief, window) → RawPack`:
//   createSupabaseEvidence(client)  — service-role supabase-js client (production)
//   createFixtureEvidence(dir)      — JSON packs captured from the same tables
//                                     (scripts/lanes/fixtures/evidence/<briefing_id>.json)
// and `buildPack(raw, brief, window)` turns a RawPack into the normalised EvidencePack the
// composer reads, so fixture and live runs go through identical code after the fetch.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const EVIDENCE_MONTHS = Object.freeze({ deep: 12, standard: 6, profile: 12, jurisdiction: 12 });
export const JW_BASE = 'https://faraday-jurisdiction-watch.vercel.app/jurisdiction';
export const MORATORIUM_NATION_URL = 'https://github.com/mjbommar/moratorium-data-2026';
export const MORATORIUM_NATION_ATTRIBUTION = 'Data: Moratorium Nation (mjbommar) — CC-BY-4.0';
export const BLOCKED_LICENSES = Object.freeze(['blocked', 'restricted', 'denied', 'prohibited']);
export const LIMITS = Object.freeze({ deep: 220, standard: 160, profile: 60, jurisdictionSignals: 120, jurisdictionArtifacts: 140 });

/** Jurisdiction section hints (Standard template, jurisdiction variant — FDY-281). */
export const JURISDICTION_SECTIONS = Object.freeze([
  'Legislation & rules',
  'Permitting & siting',
  'Power & utility regulation',
  'Incentives & tax',
  'Water/environment',
  'Signals to watch',
]);

// ---------------------------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------------------------

export function evidenceWindow(brief, now = new Date()) {
  const months = brief?.briefing_type === 'jurisdiction' ? EVIDENCE_MONTHS.jurisdiction : EVIDENCE_MONTHS[brief?.tier];
  if (!months) throw new Error(`unknown tier "${brief?.tier}" (expected deep|standard|profile)`);
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - months);
  return { from, to, months };
}

// ---------------------------------------------------------------------------------------------
// Text helpers (pure)
// ---------------------------------------------------------------------------------------------

const GOOGLE_NEWS = /^Google News search/i;
const TERMINAL = /[.!?…]["')\]]?$/;

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split prose into sentences, keeping common abbreviations and decimals whole. */
export function sentences(text) {
  const t = decodeEntities(text);
  if (!t) return [];
  const out = [];
  let buf = '';
  const parts = t.split(/(?<=[.!?…]["')\]]?)\s+(?=[A-Z0-9"'(\[])/);
  for (const p of parts) {
    const cand = buf ? `${buf} ${p}` : p;
    // Do not break after "U.S.", "Inc.", "No.", "vs." and single-letter initials.
    if (/\b(U\.S|U\.K|Inc|Ltd|Co|Corp|No|vs|St|Mr|Ms|Dr|Gov|Sen|Rep|approx|est|[A-Z])\.$/.test(p)) {
      buf = cand;
      continue;
    }
    out.push(cand);
    buf = '';
  }
  if (buf) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Only complete clauses may be printed (templates §4): drop a trailing sentence cut mid-way. */
export function completeSentences(text) {
  const ss = sentences(text);
  if (!ss.length) return [];
  if (!TERMINAL.test(ss[ss.length - 1])) ss.pop();
  return ss;
}

/** signals.framing is stored truncated at 240 chars; faradays_take often carries the full text. */
export function fullText(signal) {
  const framing = decodeEntities(signal?.framing);
  const take = decodeEntities(signal?.faradays_take);
  if (take && framing && take.length > framing.length && take.startsWith(framing.slice(0, Math.min(80, framing.length)))) return take;
  return framing || take;
}

/** "Headline - Outlet" (Google News RSS) → { headline, outlet }. */
export function splitOutlet(title) {
  const t = decodeEntities(title);
  const m = t.match(/^(.*\S)\s+[-–—|]\s+([^-–—|]{2,40})$/);
  // The trailing segment is an outlet only when it looks like a name: short, no digits, ≤ 5 words.
  if (m && !/\d/.test(m[2]) && m[2].trim().split(/\s+/).length <= 5 && !/^(the|a|an)\s+\w+\s+\w+/i.test(m[2])) return { headline: m[1].trim(), outlet: m[2].trim() };
  return { headline: t, outlet: null };
}

/** Recorded URLs are sometimes protocol-relative ("//www…", BL-09 test-results note); print them absolute. */
export function absUrl(url) {
  const u = String(url ?? '').trim();
  return u.startsWith('//') ? `https:${u}` : u;
}

export function hostOf(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return h === 'news.google.com' ? 'Google News' : h;
  } catch {
    return null;
  }
}

export function isoDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function clip(s, n = 110) {
  const t = decodeEntities(s);
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}…`;
}

/** Figures a sentence states — "$104B", "2.7 GW", "890 MW", "18%", "$1.45 billion". */
export function extractFigures(text) {
  const t = decodeEntities(text);
  const re = /(\$\s?\d[\d,.]*\s?(?:billion|million|trillion|bn|m|B|M|T)?(?!\w)|\b\d[\d,.]*\s?(?:GW|MW|kW|TWh|GWh|MWh|%|percent|acres?|sq\s?ft|square feet|miles?|jobs|years?|months?|days?)(?!\w))/g;
  const out = [];
  for (const m of t.matchAll(re)) {
    const f = m[1].replace(/\s+/g, ' ').trim();
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

const normUrl = (u) => String(u ?? '').trim().replace(/^\/\//, 'https://').replace(/[?#].*$/, (q) => (/[?&]utm_/.test(q) ? '' : q)).replace(/\/$/, '');

// ---------------------------------------------------------------------------------------------
// Normalisation: RawPack → EvidencePack
// ---------------------------------------------------------------------------------------------

function signalItem(g, companies) {
  if (!g) return null;
  const a = g.artifact ?? null;
  const license = a?.license_status ?? null;
  if (license && BLOCKED_LICENSES.includes(String(license).toLowerCase())) return null;
  const url = absUrl(g.source_url || a?.source_url);
  if (!url) return null;
  const text = completeSentences(fullText(g));
  if (!text.length) return null;
  let publisher = a?.source_name ?? null;
  let headline = a?.title ? decodeEntities(a.title) : null;
  if (!publisher || GOOGLE_NEWS.test(publisher)) {
    const sp = splitOutlet(headline ?? '');
    headline = sp.headline || headline;
    publisher = sp.outlet || hostOf(url) || 'Source';
  }
  if (!headline) headline = clip(text[0]);
  const date = isoDate(g.event_date) ?? isoDate(a?.published_at) ?? isoDate(g.fired_at);
  return {
    ref_kind: 'signal',
    id: g.id,
    date,
    publisher,
    headline,
    text,
    url,
    title: headline,
    artifact_id: g.artifact_id ?? null,
    published_at: isoDate(a?.published_at) ?? date,
    license,
    domain_tags: Array.isArray(g.domain_tags) ? g.domain_tags : [],
    subdomain_tags: Array.isArray(g.subdomain_tags) ? g.subdomain_tags : [],
    company_tags: Array.isArray(g.company_tags) ? g.company_tags : [],
    company_names: (Array.isArray(g.company_tags) ? g.company_tags : []).map((c) => companies.get(c)?.canonical_name).filter(Boolean),
    conviction: g.conviction ?? null,
    figures: extractFigures(text.join(' ')),
  };
}

function artifactItem(a) {
  if (!a?.source_url) return null;
  a = { ...a, source_url: absUrl(a.source_url) };
  const license = a.license_status ?? null;
  if (license && BLOCKED_LICENSES.includes(String(license).toLowerCase())) return null;
  const text = completeSentences(a.summary);
  if (!text.length) return null;
  let publisher = a.source_name ?? null;
  let headline = decodeEntities(a.title);
  if (!publisher || GOOGLE_NEWS.test(publisher)) {
    const sp = splitOutlet(headline);
    headline = sp.headline || headline;
    publisher = sp.outlet || hostOf(a.source_url) || 'Source';
  }
  // Aggregator summaries that merely repeat the title carry no clause worth printing.
  if (text.length === 1 && decodeEntities(text[0]).replace(/[.…]$/, '').toLowerCase() === headline.toLowerCase()) return null;
  return {
    ref_kind: 'artifact',
    id: a.artifact_id,
    date: isoDate(a.published_at),
    publisher,
    headline,
    text,
    url: a.source_url,
    title: headline,
    artifact_id: a.artifact_id,
    published_at: isoDate(a.published_at),
    license,
    domain_tags: Array.isArray(a.ifs_domains) ? a.ifs_domains : [],
    subdomain_tags: Array.isArray(a.ifs_subdomains) ? a.ifs_subdomains : [],
    company_tags: [],
    company_names: [],
    figures: extractFigures(text.join(' ')),
  };
}

function jwItems(raw, jurisdiction) {
  const jw = raw?.jw ?? {};
  const slug = jurisdiction?.slug;
  const jwUrl = slug ? `${JW_BASE}/${slug}` : JW_BASE;
  const items = [];
  for (const m of jw.moratoria ?? []) {
    const parts = [];
    if (m.current_status) parts.push(...completeSentences(m.current_status));
    if (!parts.length && m.legal_basis) parts.push(`${decodeEntities(m.legal_basis)}.`);
    if (m.trigger_text) parts.push(`Recorded trigger: ${decodeEntities(m.trigger_text).replace(/[.]$/, '')}.`);
    if (!parts.length) continue;
    items.push({
      ref_kind: 'moratorium',
      id: m.moratorium_id,
      date: m.date_enacted_iso ?? null,
      publisher: 'Moratorium Nation (CC-BY-4.0)',
      headline: `${m.jurisdiction_name}${m.jurisdiction_type ? ` (${m.jurisdiction_type})` : ''}: data center moratorium ${m.enacted_status ? `— ${m.enacted_status}` : ''}`.trim(),
      text: parts,
      url: m.source_url || `${MORATORIUM_NATION_URL}#${encodeURIComponent(m.moratorium_id)}`,
      title: `Moratorium Nation inventory — ${m.jurisdiction_name} (${m.moratorium_id})`,
      artifact_id: null,
      published_at: m.date_enacted_iso ?? null,
      license: 'CC-BY-4.0',
      domain_tags: ['D3'],
      subdomain_tags: ['D3.2'],
      company_tags: [],
      company_names: [],
      section: 'Legislation & rules',
      attribution: MORATORIUM_NATION_ATTRIBUTION,
      figures: [],
    });
  }
  for (const p of jw.puc ?? []) {
    const text = [];
    if (p.docket_title) text.push(`Docket ${p.docket_number}: ${decodeEntities(p.docket_title)}.`);
    if (p.doc_title) text.push(`Filing of ${p.filed_date ?? 'undated'}${p.filing_party ? ` by ${decodeEntities(p.filing_party)}` : ''}: ${decodeEntities(p.doc_title).replace(/[.]$/, '')}.`);
    if (p.magnitude_mw) text.push(`Recorded magnitude: ${p.magnitude_mw} MW.`);
    if (!text.length) continue;
    items.push({
      ref_kind: 'puc',
      id: p.id,
      date: p.filed_date ?? isoDate(p.extracted_at),
      publisher: 'State utility commission docket',
      headline: `Docket ${p.docket_number} — ${clip(p.doc_title || p.docket_title, 90)}`,
      text,
      url: p.source_url,
      title: `${p.docket_number} · ${decodeEntities(p.doc_title || p.docket_title)}`,
      artifact_id: null,
      published_at: p.filed_date ?? null,
      license: 'public-record',
      domain_tags: ['D3'],
      subdomain_tags: ['D3.3'],
      company_tags: [],
      company_names: [],
      section: 'Power & utility regulation',
      figures: p.magnitude_mw ? [`${p.magnitude_mw} MW`] : [],
    });
  }
  for (const e of jw.permit_events ?? []) {
    if (!e.headline) continue;
    const text = [`${decodeEntities(e.headline).replace(/[.]$/, '')}.`];
    if (e.prior_count != null && e.current_count != null) text.push(`Recorded count ${e.prior_count} → ${e.current_count} for ${e.period_key}${e.pct_change != null ? ` (${Number(e.pct_change).toFixed(0)}%)` : ''}.`);
    const isQueue = /queue|interconnection/i.test(e.signal_type ?? '');
    items.push({
      ref_kind: 'jw_event',
      id: e.id,
      date: e.period_end ?? e.period_start ?? null,
      date_floor: e.period_start ?? null,
      publisher: 'Jurisdiction Watch signal',
      headline: clip(e.headline, 100),
      text,
      url: `${e.jurisdiction_slug ? `${JW_BASE}/${e.jurisdiction_slug}` : jwUrl}#signal-${e.id}`,
      title: `Jurisdiction Watch ${String(e.signal_type ?? 'signal').replace(/_/g, ' ')} — ${e.period_key ?? ''}`.trim(),
      artifact_id: null,
      published_at: e.period_end ?? null,
      license: 'faraday-record',
      domain_tags: ['D3'],
      subdomain_tags: [isQueue ? 'D3.1' : 'D13.3'],
      company_tags: [],
      company_names: [],
      section: isQueue ? 'Power & utility regulation' : 'Permitting & siting',
      figures: extractFigures(e.headline),
    });
  }
  for (const f of jw.facilities ?? []) {
    if (!f.source_url) continue;
    const bits = [];
    bits.push(`${decodeEntities(f.facility_name)}${f.operator ? ` (${decodeEntities(f.operator)})` : ''}${f.city ? `, ${decodeEntities(f.city)}` : ''}, is recorded as ${decodeEntities(f.status ?? 'listed')}${f.capacity_mw ? ` at ${f.capacity_mw} MW` : ''}.`);
    items.push({
      ref_kind: 'facility',
      id: f.id,
      date: f.announced_date ?? isoDate(f.updated_at),
      publisher: f.source_name ?? hostOf(f.source_url) ?? 'Source',
      headline: `${decodeEntities(f.facility_name)} — ${decodeEntities(f.status ?? 'facility record')}`,
      text: bits,
      url: f.source_url,
      title: decodeEntities(f.facility_name),
      artifact_id: null,
      published_at: f.announced_date ?? null,
      license: null,
      domain_tags: ['D14'],
      subdomain_tags: ['D14.8'],
      company_tags: [],
      company_names: f.operator ? [decodeEntities(f.operator)] : [],
      section: 'Signals to watch',
      figures: f.capacity_mw ? [`${f.capacity_mw} MW`] : [],
    });
  }
  for (const i of jw.incentives ?? []) {
    if (!i.source_url) continue;
    const text = [`${decodeEntities(i.recipient_name ?? i.project_name ?? 'A recipient')} is recorded under ${decodeEntities(i.program_name ?? i.incentive_type ?? 'a state incentive program')}${i.award_value_usd ? ` with an award value of $${Number(i.award_value_usd).toLocaleString('en-US')}` : ''}${i.place_name || i.county_name ? ` in ${decodeEntities(i.place_name ?? i.county_name)}` : ''}.`];
    if (i.statute_citation) text.push(`Statutory basis recorded: ${decodeEntities(i.statute_citation)}.`);
    items.push({
      ref_kind: 'incentive',
      id: i.id,
      date: i.term_start ?? null,
      publisher: 'State incentive disclosure',
      headline: `${clip(i.recipient_name ?? i.project_name, 70)} — ${decodeEntities(i.program_name ?? i.incentive_type ?? 'incentive')}`,
      text,
      url: i.source_url,
      title: `${decodeEntities(i.program_name ?? i.incentive_type ?? 'incentive')} · ${decodeEntities(i.recipient_name ?? '')}`,
      artifact_id: null,
      published_at: i.term_start ?? null,
      license: 'public-record',
      domain_tags: ['D19'],
      subdomain_tags: ['D19.1'],
      company_tags: [],
      company_names: [],
      section: 'Incentives & tax',
      figures: i.award_value_usd ? [`$${Number(i.award_value_usd).toLocaleString('en-US')}`] : [],
    });
  }
  return items;
}

/** The Jurisdiction Watch posture record itself, as one citable Faraday record. */
export function jurisdictionRecord(j) {
  if (!j) return null;
  const facts = [];
  if (j.current_tier) facts.push(`Jurisdiction Watch records ${j.name}'s current posture as ${j.current_tier}${j.current_score != null ? ` (score ${Number(j.current_score).toFixed(1)} on the 0–100 scale)` : ''}${j.last_scored_date ? `, last scored ${isoDate(j.last_scored_date)}` : ''}.`);
  if (j.jps_trend) facts.push(`The recorded trend is ${j.jps_trend}.`);
  if (j.iso_rto) facts.push(`The grid operator on record is ${j.iso_rto}${j.is_competitive_market != null ? `, in a ${j.is_competitive_market ? 'competitive' : 'regulated'} market` : ''}.`);
  const tax = [];
  if (j.tax_equipment_exemption) tax.push('a data center equipment exemption');
  if (j.tax_electricity_exemption) tax.push('an electricity exemption');
  if (j.tax_property_abatement) tax.push('property abatement');
  if (tax.length) facts.push(`The incentive record lists ${tax.join(', ')}${j.tax_statute_citation ? ` under ${j.tax_statute_citation}` : ''}${j.tax_source_last_verified ? `, last verified ${j.tax_source_last_verified}` : ''}.`);
  if (j.jpas_completeness_grade) facts.push(`Data completeness for the jurisdiction is graded ${j.jpas_completeness_grade}${j.jpas_quality_tier ? ` with quality tier ${j.jpas_quality_tier}` : ''}.`);
  if (j.population) facts.push(`Recorded population: ${Number(j.population).toLocaleString('en-US')}.`);
  const hist = Array.isArray(j.jps_history) ? j.jps_history.filter((h) => h?.scored_at) : [];
  return {
    ref_kind: 'record',
    id: j.id,
    date: isoDate(j.last_scored_date) ?? isoDate(hist[0]?.scored_at),
    publisher: 'Faraday Jurisdiction Watch',
    headline: `${j.name}: Jurisdiction Watch posture record`,
    text: facts,
    url: `${JW_BASE}/${j.slug}`,
    title: `Jurisdiction Watch record — ${j.name}`,
    artifact_id: null,
    published_at: isoDate(j.last_scored_date),
    license: 'faraday-record',
    domain_tags: [],
    subdomain_tags: [],
    company_tags: [],
    company_names: [],
    section: 'Power & utility regulation',
    history: hist.map((h) => ({ date: isoDate(h.scored_at), score: h.score, tier: h.tier, reason: h.change_reason, scale: h.scale_version })),
    figures: [],
  };
}

/** The companies / institutions row as one citable identity record. */
export function entityRecord(raw) {
  const c = raw?.company ?? null;
  const i = raw?.institution ?? null;
  if (!c && !i) return null;
  const name = i?.canonical_name ?? c?.canonical_name;
  const url = i?.website_url ?? c?.website_url ?? null;
  const identity = [];
  if (i) {
    const band = String(i.archetype_band ?? '').replace(/_/g, ' ');
    if (band) identity.push({ label: 'Institution type', value: band.charAt(0).toUpperCase() + band.slice(1) });
    if (i.hq_country || c?.hq_location_raw) identity.push({ label: 'Headquarters', value: c?.hq_location_raw ?? i.hq_country });
    if (Array.isArray(i.aliases) && i.aliases.length) identity.push({ label: 'Also known as', value: i.aliases.slice(0, 3).join(', ') });
    if (i.website_url) identity.push({ label: 'Website', value: i.website_url });
    if (c?.company_type) identity.push({ label: 'Company type', value: c.company_type });
  } else {
    if (c.company_type) identity.push({ label: 'Company type', value: c.company_type });
    if (c.ownership_public_private) identity.push({ label: 'Ownership', value: c.ownership_public_private });
    if (c.ticker) identity.push({ label: 'Ticker', value: c.ticker });
    if (c.hq_location_raw || c.hq_country) identity.push({ label: 'Headquarters', value: c.hq_location_raw ?? c.hq_country });
    if (c.legal_structure) identity.push({ label: 'Legal structure', value: c.legal_structure });
    if (c.size_band) identity.push({ label: 'Size band', value: c.size_band });
    if (c.business_role) identity.push({ label: 'Business role', value: c.business_role });
    if (c.website_url) identity.push({ label: 'Website', value: c.website_url });
    if (c.nvidia_dsx_partner === true) identity.push({ label: 'NVIDIA DSX partner', value: 'Yes' });
  }
  const text = identity.map((kv) => `${kv.label}: ${kv.value}.`);
  return {
    ref_kind: 'record',
    id: i?.institution_uid ?? c?.company_uid,
    date: isoDate(i?.updated_at ?? c?.updated_at),
    publisher: i ? 'Faraday institutions record' : 'Faraday companies record',
    headline: `${name}: identity record`,
    text,
    url: url ?? `https://faraday.ai/records/${i?.institution_uid ?? c?.company_uid}`,
    title: `${i ? 'Faraday institutions record' : 'Faraday companies record'} — ${name}`,
    artifact_id: null,
    published_at: isoDate(i?.updated_at ?? c?.updated_at),
    license: 'faraday-record',
    domain_tags: [],
    subdomain_tags: [],
    company_tags: c ? [c.company_uid] : [],
    company_names: [name],
    identity,
    name,
    figures: [],
  };
}

const inWindow = (date, window) => {
  if (!date) return false;
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d >= new Date(isoDate(window.from) + 'T00:00:00Z').getTime() && d <= new Date(isoDate(window.to) + 'T23:59:59Z').getTime();
};

/**
 * Normalise a RawPack into the EvidencePack the composer reads.
 * Items are de-duplicated by URL and by headline, filtered to the evidence window, newest first.
 */
export function buildPack(raw, brief, window) {
  const taxonomy = indexTaxonomy(raw?.taxonomy ?? {});
  const companies = new Map((raw?.companies ?? []).map((c) => [c.company_uid, c]));
  const jurisdiction = raw?.jurisdiction ?? null;
  const entity = entityRecord(raw);
  const jrec = jurisdictionRecord(jurisdiction);

  const candidates = [
    ...(raw?.signals ?? []).map((g) => signalItem(g, companies)),
    ...(raw?.artifacts ?? []).map(artifactItem),
    ...jwItems(raw, jurisdiction),
  ].filter(Boolean);

  const seenUrl = new Set();
  const seenHead = new Set();
  const items = [];
  for (const it of candidates.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))) {
    if (!inWindow(it.date, window)) {
      if (it.date_floor && inWindow(it.date_floor, window) && it.date > isoDate(window.to)) it.date = isoDate(window.to);
      else continue;
    }
    const u = normUrl(it.url);
    const h = it.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenUrl.has(u) || (h && seenHead.has(h))) continue;
    seenUrl.add(u);
    if (h) seenHead.add(h);
    items.push(it);
  }

  return {
    captured_at: raw?.captured_at ?? null,
    subject: raw?.subject ?? null,
    window: { from: isoDate(window.from), to: isoDate(window.to), months: window.months },
    taxonomy,
    companies,
    entity,
    jurisdiction,
    jurisdiction_record: jrec && jrec.text.length ? jrec : null,
    items,
  };
}

export function indexTaxonomy(t) {
  const themes = new Map((t.themes ?? []).map((x) => [x.theme_code, x]));
  const domains = new Map((t.domains ?? []).map((x) => [x.domain_code, x]));
  const subdomains = new Map((t.subdomains ?? []).map((x) => [x.subdomain_code, x]));
  const themeByName = new Map((t.themes ?? []).map((x) => [String(x.name).toLowerCase(), x]));
  return {
    themes,
    domains,
    subdomains,
    theme(codeOrName) {
      if (!codeOrName) return null;
      return themes.get(codeOrName) ?? themeByName.get(String(codeOrName).toLowerCase()) ?? null;
    },
    domainName: (code) => domains.get(code)?.domain_name ?? code,
    subdomainName: (code) => subdomains.get(code)?.display_name ?? code,
    subdomainsOfTheme: (themeCode) => [...subdomains.values()].filter((s) => Array.isArray(s.theme_tags) && s.theme_tags.includes(themeCode)).map((s) => s.subdomain_code),
    subdomainsOfDomain: (domainCode) => [...subdomains.values()].filter((s) => s.domain_code === domainCode).map((s) => s.subdomain_code),
  };
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

/** Fixture packs captured from production (read-only) — one file per briefing id. */
export function createFixtureEvidence(dir) {
  return {
    kind: 'fixture',
    async fetchRaw(brief) {
      const p = join(dir, `${brief.id}.json`);
      if (!existsSync(p)) throw new Error(`no evidence pack for briefing ${brief.id} in ${dir}`);
      return JSON.parse(readFileSync(p, 'utf8'));
    },
  };
}

const SIGNAL_COLS = 'id, fired_at, event_date, source, framing, faradays_take, byline, conviction, theme_tags, domain_tags, subdomain_tags, company_tags, source_url, artifact_id';
const ARTIFACT_ENVELOPE = (a) => ({
  title: a?.signal_envelope?.title ?? null,
  source_name: a?.signal_envelope?.source_name ?? null,
  summary: a?.signal_envelope?.summary ? String(a.signal_envelope.summary).slice(0, 1500) : null,
  published_at: a?.published_at ?? null,
  source_type: a?.source_type ?? null,
  license_status: a?.signal_envelope?.license_status ?? null,
  source_url: a?.source_url ?? null,
});

const must = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? [];
};

/** Live Supabase source over a service-role client. Reads only. */
export function createSupabaseEvidence(client, limits = LIMITS) {
  async function taxonomy() {
    const [themes, domains, subdomains] = await Promise.all([
      client.from('faraday_themes').select('theme_code, name, tagline').then(must),
      client.from('faraday_domains').select('domain_code, domain_name, short_desc').then(must),
      client.from('faraday_subdomains').select('subdomain_code, domain_code, display_name, theme_tags, active').then(must),
    ]);
    return { themes, domains, subdomains };
  }

  async function withArtifacts(signals) {
    const ids = [...new Set(signals.map((g) => g.artifact_id).filter(Boolean))];
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await client
        .from('artifacts')
        .select('artifact_id, source_url, published_at, source_type, signal_envelope')
        .in('artifact_id', ids.slice(i, i + 100))
        .then(must);
      for (const a of rows) map.set(a.artifact_id, ARTIFACT_ENVELOPE(a));
    }
    return signals.map((g) => ({ ...g, artifact: map.get(g.artifact_id) ?? null }));
  }

  async function companiesFor(signals) {
    const uids = [...new Set(signals.flatMap((g) => (Array.isArray(g.company_tags) ? g.company_tags : [])))];
    const out = [];
    for (let i = 0; i < uids.length; i += 200) {
      out.push(...(await client.from('companies').select('company_uid, canonical_name, company_type').in('company_uid', uids.slice(i, i + 200)).then(must)));
    }
    return out;
  }

  const base = (window, limit) =>
    client.from('signals').select(SIGNAL_COLS).gte('fired_at', window.from.toISOString()).lte('fired_at', window.to.toISOString()).order('fired_at', { ascending: false }).limit(limit);

  /** PostgREST `cs` (jsonb contains) OR-ed over a code list, chunked so the filter string stays short. */
  async function signalsByJsonbAny(column, codes, window, limit) {
    const seen = new Map();
    for (let i = 0; i < codes.length; i += 12) {
      const or = codes.slice(i, i + 12).map((c) => `${column}.cs.["${c}"]`).join(',');
      const rows = await base(window, limit).or(or).then(must);
      for (const r of rows) seen.set(r.id, r);
    }
    return [...seen.values()].sort((a, b) => String(b.event_date ?? b.fired_at).localeCompare(String(a.event_date ?? a.fired_at))).slice(0, limit);
  }

  return {
    kind: 'supabase',
    async fetchRaw(brief, window) {
      const tax = await taxonomy();
      const idx = indexTaxonomy(tax);
      const raw = { captured_at: new Date().toISOString(), window: { from: window.from.toISOString(), to: window.to.toISOString() }, subject: null, taxonomy: tax, signals: [], companies: [], artifacts: [], company: null, institution: null, jurisdiction: null, jw: null };
      const type = brief.briefing_type;

      if (type === 'theater') {
        const theme = idx.theme(brief.theme_tags?.[0]) ?? idx.theme(brief.title);
        if (!theme) throw new Error(`theater brief ${brief.id} has no resolvable theme (theme_tags=${JSON.stringify(brief.theme_tags)})`);
        raw.subject = { kind: 'theater', code: theme.theme_code };
        raw.signals = await signalsByJsonbAny('subdomain_tags', idx.subdomainsOfTheme(theme.theme_code), window, limits.deep);
      } else if (type === 'sector') {
        if (!brief.sector_id) throw new Error(`sector brief ${brief.id} has no sector_id`);
        raw.subject = { kind: 'sector', code: brief.sector_id };
        const a = await base(window, limits.standard).contains('domain_tags', [brief.sector_id]).then(must);
        const b = await signalsByJsonbAny('subdomain_tags', idx.subdomainsOfDomain(brief.sector_id), window, limits.standard);
        const m = new Map([...a, ...b].map((r) => [r.id, r]));
        raw.signals = [...m.values()].slice(0, limits.standard);
      } else if (type === 'thread') {
        if (!brief.thread_id) throw new Error(`thread brief ${brief.id} has no thread_id`);
        raw.subject = { kind: 'thread', code: brief.thread_id };
        raw.signals = await base(window, limits.standard).contains('subdomain_tags', [brief.thread_id]).then(must);
      } else if (type === 'company') {
        let companyUid = brief.company_id ?? null;
        if (brief.institution_id) {
          const inst = await client.from('institutions').select('institution_uid, canonical_name, aliases, archetype_band, secondary_archetypes, website_url, hq_country, company_uid, jurisdiction_ids, status, license_status, updated_at').eq('institution_uid', brief.institution_id).maybeSingle().then(must);
          raw.institution = inst ?? null;
          companyUid = companyUid ?? inst?.company_uid ?? null;
        }
        if (companyUid) {
          raw.company = await client.from('companies').select('company_uid, canonical_name, company_type, ownership_public_private, hq_location_raw, hq_country, ticker, website_url, nvidia_dsx_partner, legal_structure, size_band, business_role, status, updated_at').eq('company_uid', companyUid).maybeSingle().then(must);
          raw.signals = await base(window, limits.profile).contains('company_tags', [companyUid]).then(must);
        }
        raw.subject = { kind: brief.institution_id && !brief.company_id ? 'institution' : 'company', code: brief.institution_id ?? companyUid };
      } else if (type === 'jurisdiction') {
        const jid = brief.jurisdiction_id;
        const isState = /^US-[A-Z]{2}$/.test(jid);
        let q = client.from('jurisdictions').select('id, name, slug, level, state_abbr, country_code, iso_code, fips_code, current_tier, current_score, jps_trend, last_scored_date, jpas_quality, jpas_quality_tier, jpas_completeness, jpas_completeness_grade, jds_tier, jds_score, iso_rto, is_competitive_market, utility_type, tax_equipment_exemption, tax_electricity_exemption, tax_property_abatement, tax_statute_citation, tax_source_last_verified, population, dim_regulatory, dim_permitting, dim_power, dim_opposition, dim_incentives');
        q = isState ? q.eq('level', 'state').eq('state_abbr', jid.slice(3)) : q.eq('level', 'country').eq('country_code', jid);
        const j = await q.maybeSingle().then(must);
        if (!j?.id) throw new Error(`jurisdiction brief ${brief.id}: no jurisdictions row for ${jid}`);
        j.jps_history = await client.from('jps_history').select('scored_at, score, tier, change_reason, scale_version').eq('jurisdiction_id', j.id).order('scored_at', { ascending: false }).limit(12).then(must);
        raw.jurisdiction = j;
        raw.subject = { kind: 'jurisdiction', code: jid };
        const names = [j.name, j.iso_rto].filter(Boolean);
        const or = names.flatMap((n) => [`framing.ilike.%${n}%`, `faradays_take.ilike.%${n}%`]).join(',');
        raw.signals = await base(window, limits.jurisdictionSignals).or(or).then(must);
        raw.artifacts = (
          await client
            .from('artifacts')
            .select('artifact_id, source_url, published_at, source_type, signal_envelope, ifs_domains, ifs_subdomains')
            .textSearch('fts', `${j.name} data center`, { type: 'plain', config: 'english' })
            .gte('published_at', window.from.toISOString())
            .not('source_url', 'is', null)
            .order('published_at', { ascending: false })
            .limit(limits.jurisdictionArtifacts)
            .then(must)
        ).map((a) => ({ ...ARTIFACT_ENVELOPE(a), artifact_id: a.artifact_id, ifs_domains: a.ifs_domains, ifs_subdomains: a.ifs_subdomains }));
        const jw = { moratoria: [], puc: [], permit_events: [], facilities: [], incentives: [] };
        if (isState) {
          const st = j.state_abbr;
          jw.moratoria = (await client.from('moratorium_nation_inventory').select('moratorium_id, jurisdiction_name, jurisdiction_type, date_enacted_iso, duration, legal_basis, trigger_text, current_status, activity_level, enacted_status, raw, release_tag').eq('state_abbr', st).order('date_enacted_iso', { ascending: false }).then(must)).map((m) => ({ ...m, source_url: m.raw?.source_url ?? null, raw: undefined }));
          if (j.fips_code) {
            const sigs = await client.from('puc_signals').select('id, filing_id, signal_type, keyword, signal_text, jps_dimension, magnitude_mw, extracted_at').eq('state_fips', j.fips_code).gte('extracted_at', window.from.toISOString()).order('extracted_at', { ascending: false }).limit(80).then(must);
            const fids = [...new Set(sigs.map((s) => s.filing_id).filter(Boolean))];
            const filings = fids.length ? await client.from('puc_filings').select('id, docket_id, filed_date, doc_title, filing_party, source_url, dc_relevant').in('id', fids).then(must) : [];
            const dids = [...new Set(filings.map((f) => f.docket_id).filter(Boolean))];
            const dockets = dids.length ? await client.from('puc_dockets').select('id, docket_number, docket_title, utility_name, source_url, dc_relevant').in('id', dids).then(must) : [];
            const fm = new Map(filings.map((f) => [f.id, f]));
            const dm = new Map(dockets.map((d) => [d.id, d]));
            jw.puc = sigs
              .map((s) => {
                const f = fm.get(s.filing_id);
                const d = f ? dm.get(f.docket_id) : null;
                if (!f || !d || !d.dc_relevant) return null;
                return { id: s.id, signal_type: s.signal_type, keyword: s.keyword, signal_text: String(s.signal_text ?? '').slice(0, 600), jps_dimension: s.jps_dimension, magnitude_mw: s.magnitude_mw, extracted_at: s.extracted_at, filed_date: f.filed_date, doc_title: f.doc_title, filing_party: f.filing_party, source_url: f.source_url ?? d.source_url, docket_number: d.docket_number, docket_title: d.docket_title, utility_name: d.utility_name };
              })
              .filter(Boolean)
              .slice(0, 40);
          }
          jw.permit_events = await client.from('jw_signal_events').select('id, signal_type, period_key, period_start, period_end, direction, prior_count, current_count, pct_change, headline, jurisdiction_id').eq('state', st).gte('triggered_at', window.from.toISOString()).is('quarantine_reason', null).order('period_end', { ascending: false }).limit(24).then(must);
          jw.facilities = await client.from('jw_facilities').select('id, facility_name, operator, status, capacity_mw, city, source_name, source_url, announced_date, jds_layer, updated_at').eq('state_abbr', st).not('source_url', 'is', null).gte('updated_at', window.from.toISOString()).order('updated_at', { ascending: false }).limit(30).then(must);
          jw.incentives = await client.from('state_incentive_disclosures').select('id, recipient_name, project_name, place_name, county_name, incentive_type, program_name, statute_citation, award_value_usd, term_start, source_url').eq('state_abbr', st).order('term_start', { ascending: false, nullsFirst: false }).limit(30).then(must);
        } else {
          jw.facilities = await client.from('jw_facilities').select('id, facility_name, operator, status, capacity_mw, city, source_name, source_url, announced_date, jds_layer, updated_at').eq('country_code', jid).not('source_url', 'is', null).gte('updated_at', window.from.toISOString()).order('updated_at', { ascending: false }).limit(30).then(must);
        }
        raw.jw = jw;
      } else {
        throw new Error(`unknown briefing_type "${type}"`);
      }

      raw.signals = await withArtifacts(raw.signals);
      raw.companies = await companiesFor(raw.signals);
      return raw;
    },
  };
}
