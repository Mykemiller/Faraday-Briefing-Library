// BL2-05 (FDY-281): deterministic composer — EvidencePack → tier manuscript (Markdown) + editorial
// columns (hypothesis, contents[], byline, source_refs[]).
//
// Rules enforced here, not in prose:
//   - Every factual sentence restates a Faraday record and carries [Sn]; every Sn resolves to a
//     source_refs entry with url + title (+ kind, id, publisher, published_at). validate() fails the
//     draft otherwise. Statements ABOUT the record ("The record holds no dated Signal …") are the
//     one uncited form and are whitelisted by pattern.
//   - Public vocabulary only: Theater / Sector / Thread / Signal. "Key Player" never appears;
//     internal codes (D3, D3.1, T-001) appear only on the Sources page.
//   - Profiles: no Take, no CTA, no rating, no byline, ≤ 8 Signals, `thin` when < 6 sourced Signals.
//   - Jurisdiction briefs use the Standard template with the six fixed headings and carry
//     "Informational, not legal advice." in the method note.
//   - Bylines: Deep → Faraday Editorial · Standard → Gilbert Faraday · Profile → none.
//
// The composer takes a `budget` (entries per section) so the generator can fit the rendered PDF to
// the tier's page range by re-composing, never by shrinking type.

import { filterJurisdictionItems, postureStale, subjectOf, RECONCILIATION_SENTENCE } from './jurisdiction.mjs';
import { JURISDICTION_SECTIONS, MORATORIUM_NATION_ATTRIBUTION, clip, clipSentence, decodeEntities, extractFigures } from './evidence.mjs';

export const TIERS = Object.freeze(['deep', 'standard', 'profile']);
export const BYLINES = Object.freeze({ deep: 'Faraday Editorial', standard: 'Gilbert Faraday', profile: null });
export const PAGE_RANGE = Object.freeze({ deep: [10, 15], standard: [8, 10], profile: [2, 2] });
export const PROFILE_MAX_SIGNALS = 8;
export const PROFILE_THIN_BELOW = 6;
export const DEFAULT_BUDGET = Object.freeze({ deep: { maxEntries: 40, perSection: 7, maxSections: 7, minSections: 4, sentences: 3, glance: 6, headline: 110 }, standard: { maxEntries: 24, perSection: 6, maxSections: 5, minSections: 3, sentences: 3, glance: 6, headline: 100 }, profile: { perSection: 8, sentences: 2, lead: 2, headline: 56 } });

export const KICKER = Object.freeze({ theater: 'Theater Briefing', sector: 'Sector Briefing', thread: 'Thread Briefing', company: 'Company Briefing', institution: 'Institution Briefing', jurisdiction: 'Jurisdiction Briefing' });

/**
 * Housekeeping sentences (BL3-06, FDY-330): statements composed from the record's own counts and dates
 * ("The record holds 12 dated Signals …"). They carry no marker and no figure from a Signal body.
 */
export const HOUSEKEEPING = [
  /^The record holds \d+ dated Signals? (?:for this Sector|under this heading) in the Sources table, set out below newest first\.$/,
  /^The record in this Briefing is \d+ sourced items\b/,
];

/**
 * Counts printed in housekeeping and register lines are taken from the FINAL Sources table (amendment 5):
 * composers write a token, finish() replaces it once every citation is made. COUNT(key) = refs cited
 * under that section key; COUNT('*') = the whole table.
 */
const COUNT = (key) => `⟦n:${key}⟧`;
const COUNT_RE = /⟦n:([^⟧]+)⟧/g;

/** Uncited lines the validator accepts: statements about the record itself, labels, sign-offs. */
export const UNCITED_OK = [
  ...HOUSEKEEPING,
  /^The record holds no /,
  /^No Signal in the record /,
  /^No dated triggers in the record/,
  /^\*\*(?:Source-reported|Verified|Faraday view)\.\*\* (?:Faraday's reading|Our view)/,
  /^The posture score above was last recorded before /,
  /^Each row is an event a source names/,
  /^Statements about the record itself/,
  /^Faraday's reading/,
  /^Our view is/,
  /^\*[^*]+\*$/,
  /^Named parties that appear/,
  /^\*— /,
  /^\*Claim: /,
  /^Informational, not legal advice\.$/,
  /^_?Only facts/,
];

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'undated');
const MONTH_WORDS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

// ---------------------------------------------------------------------------------------------
// Citation registry
// ---------------------------------------------------------------------------------------------

/**
 * Identity of the record an evidence item restates. Keyed on the record (kind + id), never on the URL:
 * two records that share a URL (an index page, a re-crawled redirect) must never share a marker.
 */
export const recordKey = (item) => (item.id != null && item.ref_kind ? `${item.ref_kind}:${item.id}` : `url:${item.url}`);

export function createRegistry() {
  const refs = [];
  const byKey = new Map();
  const housekeeping = [];
  const reg = {
    /**
     * Register (once) and return the marker for the evidence item a sentence was composed from. The
     * marker is always that item's own (decision 1): never picked by position or id order.
     */
    register(item, usedIn) {
      const key = recordKey(item);
      let r = byKey.get(key);
      if (!r) {
        r = {
          ref: `S${refs.length + 1}`,
          n: refs.length + 1,
          url: item.url,
          title: item.title ?? item.headline,
          kind: item.ref_kind,
          id: item.id,
          publisher: item.publisher ?? null,
          published_at: item.published_at ?? item.date ?? null,
          artifact_id: item.artifact_id ?? null,
          license_status: item.license ?? null,
          vendor_or_sponsored: Boolean(item.vendor_or_sponsored),
          attribution: item.attribution ?? undefined,
          used_in: [],
        };
        refs.push(r);
        byKey.set(key, r);
      }
      if (usedIn && !r.used_in.includes(usedIn)) r.used_in.push(usedIn);
      return `[${r.ref}]`;
    },
    /** A factual sentence restating `item`, followed by that item's marker. Throws if the sentence is not the item's own. */
    fact(item, sentence, usedIn) {
      const t = String(sentence ?? '').trim();
      if (!t || !item.text.join(' ').includes(t)) throw new Error(`citation picker: sentence is not drawn from record ${recordKey(item)}: ${clip(t, 80)}`);
      return `${t} ${reg.register(item, usedIn)}`;
    },
    /** A housekeeping sentence (kind 'housekeeping'): about the record itself, so no marker and no figure. */
    housekeeping(sentence) {
      const t = String(sentence ?? '').trim();
      const probe = t.replace(COUNT_RE, '0');
      if (/\[S\d+\]/.test(t) || extractFigures(probe).length || !HOUSEKEEPING.some((re) => re.test(probe))) throw new Error(`housekeeping sentence carries a marker or a figure, or is not a record statement: ${clip(t, 80)}`);
      housekeeping.push(t);
      return t;
    },
    /** The name the composers have always used; same as register(). */
    cite(item, usedIn) {
      return reg.register(item, usedIn);
    },
    /** @returns {string[]} */
    housekeepingLines: () => housekeeping.map((h) => reg.resolveCounts(h)),
    /**
     * Replace COUNT tokens with counts from the Sources table as it stands (call after the last citation).
     * @param {string} text
     * @returns {string}
     */
    resolveCounts(text) {
      return String(text).replace(COUNT_RE, (_, key) => String(key === '*' ? refs.length : refs.filter((r) => r.used_in.includes(key)).length));
    },
    refs: () => refs.map((r) => ({ ...r, attribution: r.attribution ?? undefined })),
    size: () => refs.length,
  };
  return reg;
}

// ---------------------------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------------------------

const primaryDomain = (it) => it.domain_tags?.[0] ?? (it.subdomain_tags?.[0] ? String(it.subdomain_tags[0]).split('.')[0] : null);

/** Group items by a key fn, sections ordered by size (desc), items newest first. */
export function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
}

export const NO_TRIGGERS = 'No dated triggers in the record.';
export const MIN_WATCH_ROWS = 2;
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const monthIdx = (w) => MONTH_INDEX[String(w).slice(0, 3).toLowerCase()];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const endOfMonth = (y, m) => iso(y, m, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());

/** The LAST day a forward phrase can mean ("Q1 2027" → 2027-03-31, "by 2028" → 2028-12-31, "Dec 15" → this year's Dec 15). */
export function forwardEnd(phrase, now) {
  const year = now.getUTCFullYear();
  let m = phrase.match(/^Q([1-4])\s?(\d{4})$/);
  if (m) return endOfMonth(Number(m[2]), Number(m[1]) * 3 - 1);
  m = phrase.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return phrase;
  m = phrase.match(new RegExp(`^(${MONTH_WORDS})\\.?\\s(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s(\\d{4}))?$`, 'i'));
  if (m) return iso(Number(m[3] ?? year), monthIdx(m[1]), Number(m[2]));
  m = phrase.match(new RegExp(`^(${MONTH_WORDS})\\.?\\s(\\d{4})$`, 'i'));
  if (m) return endOfMonth(Number(m[2]), monthIdx(m[1]));
  m = phrase.match(/(\d{4})$/);
  if (m) return iso(Number(m[1]), 11, 31);
  return null;
}

/**
 * Sentences that name a forward date or window (for "Signals to watch"). Every row resolves to an end date
 * and is kept only if that date is AFTER the preparation date: a phrase that has already passed is history.
 */
export function forwardMentions(items, now) {
  const year = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const re = new RegExp(`\\b(?:Q[1-4]\\s?(?:${year}|${year + 1}|${year + 2})|(?:${MONTH_WORDS})\\.?\\s\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s(?:${year}|${year + 1}|${year + 2}))?|\\d{4}-\\d{2}-\\d{2}|(?:${MONTH_WORDS})\\.?\\s(?:${year}|${year + 1}|${year + 2})|(?:early|mid|late|first half of|second half of|by|before|through|until|in)\\s(?:${year + 1}|${year + 2})|(?:${year + 1}|${year + 2}|${year + 3}))\\b`, 'g');
  const out = [];
  for (const it of items) {
    for (const s of it.text) {
      for (const m of s.matchAll(re)) {
        const phrase = m[0].replace(/^(?:early|mid|late|first half of|second half of|by|before|through|until|in)\s/, '');
        const end = forwardEnd(phrase, now);
        if (!end || end <= today) continue;
        out.push({ when: m[0], sentence: s, item: it, date: end });
        break; // one row per sentence
      }
    }
  }
  return out;
}

/** Derived JW rows are reporting-period buckets (month/week deltas), not triggers: their period_end never feeds the watch list. */
export const BUCKETED_JW_TYPES = /(?:_delta|^permit_velocity_)/;

/** Forward-dated triggers: forwardMentions() plus JW events whose forward_date is after the preparation date (bucketed types excluded). Dated rows first, earliest first. */
export function watchList(items, now, max = 10) {
  const today = now.toISOString().slice(0, 10);
  const rows = forwardMentions(items, now);
  for (const it of items) {
    if (it.ref_kind !== 'jw_event' || !it.forward_date || it.forward_date <= today) continue;
    if (BUCKETED_JW_TYPES.test(it.signal_type ?? '')) continue;
    rows.push({ when: `Period ends ${fmtDate(it.forward_date)}`, sentence: it.text[0], item: it, date: it.forward_date });
  }
  const seen = new Set();
  return rows
    .filter((r) => (seen.has(r.sentence) ? false : (seen.add(r.sentence), true)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, max);
}

function watchBlock(reg, rows, key = 'signals') {
  const lines = ['## Signals to watch', ''];
  if (rows.length >= MIN_WATCH_ROWS) {
    lines.push('Each row is an event a source names with a date or window.', '', '| When | Signal | Source |', '|---|---|---|');
    for (const f of rows) lines.push(`| ${md(f.when)} | ${md(clipSentence(f.sentence, 160))} | ${reg.cite(f.item, key)} |`);
  } else lines.push(NO_TRIGGERS);
  return lines.join('\n');
}

/** Named parties in the cited Signals (companies map → canonical name + recorded type). */
export function register(items, pack) {
  const counts = new Map();
  for (const it of items) {
    for (const uid of it.company_tags ?? []) {
      const c = pack.companies.get(uid);
      if (!c) continue;
      const e = counts.get(uid) ?? { uid, name: c.canonical_name, type: c.company_type, items: [] };
      e.items.push(it);
      counts.set(uid, e);
    }
  }
  return [...counts.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

/** Items whose first sentences state figures, for the "At a glance" table. */
export function glanceRows(items, max = 8) {
  const rows = [];
  for (const it of items) {
    if (!it.figures?.length) continue;
    const fig = it.figures[0];
    const sentence = it.text.find((s) => s.includes(fig.replace(/\s/g, ' '))) ?? it.text[0];
    rows.push({ figure: fig, sentence, item: it });
    if (rows.length >= max) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Rendering blocks (Markdown)
// ---------------------------------------------------------------------------------------------

export const BOILERPLATE = /Primary Image|Image Caption|^\w+ \w+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2}\/\d{2}\/\d{4}|Read more|Click here|Subscribe/i;
export const ENTRY_MAX_SENTENCES = 3;
export const ENTRY_MAX_SENTENCE_CHARS = 380;

function entry(it, reg, section, maxSentences = ENTRY_MAX_SENTENCES, headClip = 110) {
  const c = reg.cite(it, section);
  const usable = it.text.filter((s) => !BOILERPLATE.test(s));
  const short = usable.filter((s) => s.length <= ENTRY_MAX_SENTENCE_CHARS);
  const body = (short.length ? short : usable).slice(0, Math.max(1, maxSentences)).map((s) => s.trim()).join(' ') || it.text[0];
  const attrib = it.attribution ? ` _${it.attribution}._` : '';
  return `### ${md(clip(it.headline, headClip))}\n*${fmtDate(it.date)} · ${md(clip(it.publisher, 40))}*\n\n${body} ${c}${attrib}`;
}

function figureTable(items, reg, section, max = 6) {
  const rows = glanceRows(items, max);
  if (rows.length < 3) return '';
  const lines = ['| Figure | Stated in the record | Date | Source |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${md(r.figure)} | ${md(clipSentence(r.sentence, 140))} | ${fmtDate(r.item.date)} | ${reg.cite(r.item, section)} |`);
  return lines.join('\n');
}

function sourcesPage(reg, pack, brief, method, heading = 'Sources & methodology') {
  const refs = reg.refs();
  const lines = [`## ${heading}`, '', '| Ref | Source | Publisher | Date | Faraday record |', '|---|---|---|---|---|'];
  for (const r of refs) {
    const rec = r.artifact_id ? `artifacts ${r.artifact_id}` : `${r.kind} ${r.id}`;
    lines.push(`| ${r.ref} | [${md(clip(r.title, 120))}](${r.url}) | ${md(r.publisher ?? '')}${r.vendor_or_sponsored ? ' (vendor/sponsored)' : ''} | ${r.published_at ?? ''} | ${md(rec)} |`);
  }
  lines.push('');
  for (const p of method) lines.push(p, '');
  const jsonRefs = refs.map(({ n, ...rest }) => rest);
  lines.push('```json source_refs', JSON.stringify(jsonRefs, null, 0).replace(/},{/g, '},\n{'), '```');
  return lines.join('\n');
}

function methodNote(pack, brief, extra = []) {
  const base = [
    `**Method.** Drafted by the Briefing Library generator from Faraday records only — public.signals, public.artifacts (envelope title and summary; body text where fetched), public.companies, public.institutions, the Faraday taxonomy${brief.briefing_type === 'jurisdiction' ? ' and the Jurisdiction Watch tables (read-only)' : ''}. Evidence window ${fmtDate(pack.window.from)} to ${fmtDate(pack.window.to)}; ${pack.items.length} dated records in scope, ${pack.items_used ?? pack.items.length} cited. Sentences restate what each record says; truncated summaries contribute only complete clauses; nothing comes from model memory, the retired Gamma decks or any unrecorded source. Statements about the record itself are not cited; every statement about the world is.`,
    `**Coverage (internal codes, Sources page only):** ${brief.tier} · ${brief.briefing_type}${brief.sector_id ? ` · ${brief.sector_id}` : ''}${brief.thread_id ? ` · ${brief.thread_id}` : ''}${brief.theme_tags?.length ? ` · ${brief.theme_tags.join(', ')}` : ''}${brief.jurisdiction_id ? ` · ${brief.jurisdiction_id}` : ''}${brief.company_id ? ` · ${brief.company_id}` : ''}${brief.institution_id ? ` · ${brief.institution_id}` : ''} · record ${brief.airtable_record_id ?? brief.id} v${Number(brief.version ?? 1) + 1} · draft, not signed off.`,
  ];
  const hy = pack.hygiene;
  if (hy?.dropped) base.push(`**Source hygiene.** ${hy.dropped} of ${hy.items_in} in-window records were not cited: ${hy.by_reason.redirect} news items recorded only at a news.google.com redirect, ${hy.by_reason.index_page + hy.by_reason.shared_url} index or listing pages, ${hy.by_reason.no_source_name} with no nameable publisher. Sources marked (vendor/sponsored) are the issuer's own release or paid content.`);
  return [...base, ...extra];
}

const coverMeta = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`).join('\n');

// ---------------------------------------------------------------------------------------------
// Deep (Theater)
// ---------------------------------------------------------------------------------------------

export function composeDeep(brief, pack, budget, now) {
  const reg = createRegistry();
  const tax = pack.taxonomy;
  const theme = tax.theme(brief.theme_tags?.[0]) ?? tax.theme(brief.title) ?? { name: brief.title, tagline: null };
  // Theater membership is defined on Threads. Threads tagged to (almost) every Theater — media
  // coverage, the conference circuit — are generic and never decide membership or the Sector split.
  const generic = new Set([...tax.subdomains.values()].filter((sd) => Array.isArray(sd.theme_tags) && sd.theme_tags.length >= 6).map((sd) => sd.subdomain_code));
  const themeSubs = new Set(theme.theme_code ? tax.subdomainsOfTheme(theme.theme_code).filter((c) => !generic.has(c)) : []);
  const themed = themeSubs.size ? pack.items.filter((it) => (it.subdomain_tags ?? []).some((c) => themeSubs.has(c))) : pack.items;
  const sectorOf = (it) => {
    const hit = (it.subdomain_tags ?? []).find((c) => themeSubs.has(c));
    return hit ? String(hit).split('.')[0] : primaryDomain(it);
  };
  const groups = groupBy(themed, sectorOf).filter(([, its]) => its.length >= 2);
  const nSections = Math.max(Math.min(groups.length, budget.maxSections), Math.min(groups.length, budget.minSections));
  const sections = groups.slice(0, nSections).map(([code, its]) => ({ code, name: tax.domainName(code), items: its.slice(0, budget.perSection), total: its.length }));
  const used = sections.flatMap((s) => s.items);
  if (!used.length) throw new Error(`no sourced evidence for theater "${theme.name}" in window ${pack.window.from}..${pack.window.to}`);
  pack.items_in_theater = themed.length;

  const top = sections.slice(0, 2);
  const lead = (s) => s.items[0];
  const thesis =
    `**Faraday's thesis.** Over the ${pack.window.months} months to ${fmtDate(pack.window.to)}, the record for ${theme.name} is densest in ${top.map((s) => s.name).join(' and ')}. ` +
    top.map((s) => reg.fact(lead(s), lead(s).text[0], 'summary')).join(' ');

  const findings = sections.slice(0, 6).map((s, i) => `${i + 1}. **${md(s.name)}.** ${reg.fact(lead(s), lead(s).text[0], 'summary')}`);
  const watch = [...used].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);
  const watchLine = `**What to watch:** ${watch.map((it) => `${md(clip(it.headline, 70))} (${fmtDate(it.date)}) ${reg.cite(it, 'summary')}`).join('; ')}.`;

  const body = sections.map((s, i) => {
    const key = `s${i + 1}`;
    const l = lead(s);
    const parts = [
      `## ${i + 1}. ${md(s.name)}`,
      '',
      `*Claim: ${md(l.text[0].replace(/\.$/, ''))}.* ${reg.register(l, key)}`,
      '',
      reg.housekeeping(`The record holds ${COUNT(key)} dated Signal${s.items.length === 1 ? '' : 's'} for this Sector in the Sources table, set out below newest first.`),
      '',
      ...s.items.map((it) => entry(it, reg, key, budget.sentences, budget.headline)),
    ];
    const tbl = figureTable(s.items, reg, key, budget.glance);
    if (tbl) parts.push('', tbl);
    return parts.join('\n\n').replace(/\n\n\n+/g, '\n\n');
  });

  const watchRows = watchList(used, now);
  const signals = watchBlock(reg, watchRows).split('\n');

  const takeFacts = top.map((s) => reg.fact(lead(s), lead(s).text[0], 'take'));
  const take = [
    ':::take',
    "## Faraday's Take",
    '',
    ...(theme.tagline ? [`*${md(theme.tagline)}*`, ''] : []),
    `Faraday's reading of this record is that ${top.length > 1 ? `${top[0].name} and ${top[1].name} are moving together` : `${top[0].name} is carrying the Theater`}: ${sections.map((s, i) => `${COUNT(`s${i + 1}`)} of the ${COUNT('*')} sources fall in ${s.name}`).slice(0, 3).join(', ')}.`,
    '',
    `The two facts the record puts first are these. ${takeFacts.join(' ')}`,
    '',
    `Our view is that the Theater's center of gravity sits where those Signals cluster, and that the weight of the record, not any single headline, is the finding to act on. The risk Faraday would watch is the gap between what the record states and what it does not yet show: forward dates are listed above only where a source names them.`,
    '',
    `*— ${BYLINES.deep}*`,
    ':::',
  ].join('\n');

  pack.items_used = reg.size();
  const cover = [
    ':::cover',
    `# ${md(brief.title)}`,
    '',
    reg.fact(lead(top[0]), lead(top[0]).text[0], 'cover'),
    '',
    coverMeta([
      ['Tier', 'Deep brief'],
      ['Coverage', `Theater: ${theme.name} › Sectors: ${sections.map((s) => s.name).join(' · ')}`],
      ['Byline', BYLINES.deep],
      ['Evidence window', `${fmtDate(pack.window.from)} – ${fmtDate(pack.window.to)}, ${COUNT('*')} sources, de-duplicated by URL`],
      ['Status', 'DRAFT. Staged by the Briefing Library generator. Requires Myke sign-off (Deep tier).'],
    ]),
    ':::',
  ].join('\n');

  const summary = ['## Summary', '', thesis, '', '**Findings**', '', ...findings, '', watchLine].join('\n');
  const sources = sourcesPage(reg, pack, brief, methodNote(pack, brief));
  const blocks = [cover, summary, ...body, signals.join('\n'), take, sources];
  return finish(brief, pack, reg, blocks, { hypothesis: thesis.replace(/^\*\*Faraday's thesis\.\*\*\s*/, ''), byline: BYLINES.deep, kind: 'deep', watch: { rows: watchRows.length, empty: watchRows.length < MIN_WATCH_ROWS }, sections: sections.map((s) => ({ code: s.code, name: s.name, items: s.items.length, total: s.total })) });
}

// ---------------------------------------------------------------------------------------------
// Standard (Sector / Thread) and Jurisdiction
// ---------------------------------------------------------------------------------------------

const KEYWORD_HINTS = [
  ['Legislation & rules', /\bmoratori|\bbill\b|legislat|ordinance|statute|\blaw\b|senate|house bill|\bSB ?\d|\bHB ?\d|executive order|governor|ban\b/i],
  ['Incentives & tax', /\btax\b|abatement|incentive|exemption|subsid|rebate|credit\b/i],
  ['Water/environment', /\bwater\b|aquifer|environment|emission|\bcooling\b|drought|wastewater|climate/i],
  ['Permitting & siting', /permit|zoning|siting|rezon|site plan|parcel|\bacres?\b|land use|planning commission|entitlement/i],
  ['Power & utility regulation', /ERCOT|\bPUC\b|utility|tariff|interconnection|\bgrid\b|rate case|transmission|\bMW\b|\bGW\b|substation|load/i],
];

const JURISDICTION_HINT = (it) => {
  if (it.section) return it.section;
  const blob = `${it.headline} ${it.text.slice(0, 2).join(' ')}`;
  for (const [name, re] of KEYWORD_HINTS) if (re.test(blob)) return name;
  const subs = it.subdomain_tags ?? [];
  const doms = it.domain_tags ?? [];
  const has = (re) => subs.some((s) => re.test(s)) || doms.some((d) => re.test(`${d}.`));
  if (has(/^D3\.2|^D18\.|^D13\.2|^D13\.5/)) return 'Legislation & rules';
  if (has(/^D13\.3|^D13\.1|^D14\.|^D18\.2|^D10\./)) return 'Permitting & siting';
  if (has(/^D3\.|^D2\.|^D23\.2|^D9\.4/)) return 'Power & utility regulation';
  if (has(/^D19\./)) return 'Incentives & tax';
  if (has(/^D11\.|^D7\.3|^D21\.3/)) return 'Water/environment';
  return 'Signals to watch';
};

/**
 * Template entry budget (BL3-08): at most `max` entries across all sections. Trims the OLDEST entry of the
 * fullest section (ties: the later section) until the total fits; a section never drops below one entry.
 * Items are already newest first, so what is dropped is the least current evidence.
 */
export function applyEntryBudget(sections, max) {
  if (!Number.isFinite(max)) return sections;
  const total = () => sections.reduce((n, s) => n + s.items.length, 0);
  while (total() > max) {
    let pick = -1;
    sections.forEach((s, i) => {
      if (s.items.length > 1 && (pick < 0 || s.items.length >= sections[pick].items.length)) pick = i;
    });
    if (pick < 0) break;
    sections[pick] = { ...sections[pick], items: sections[pick].items.slice(0, -1) };
  }
  return sections;
}

export const OTHER_ACTIVITY = 'Other recorded activity';

export function composeStandard(brief, pack, budget, now) {
  const reg = createRegistry();
  const tax = pack.taxonomy;
  const isJur = brief.briefing_type === 'jurisdiction';
  const kicker = KICKER[brief.briefing_type] ?? 'Sector Briefing';

  let sections;
  let jurFilter = null;
  if (isJur) {
    // BL3-08: only items that name this jurisdiction (plus up to two explicitly federal / EU items under a
    // labelled heading). Off-jurisdiction items are dropped and counted; empty headings are omitted.
    const filt = filterJurisdictionItems(pack.items, subjectOf(pack.jurisdiction));
    jurFilter = { by_class: filt.by_class, dropped: filt.dropped, context_heading: filt.context_heading };
    const topical = JURISDICTION_SECTIONS.filter((h) => h !== 'Signals to watch');
    const grouped = new Map([...topical, OTHER_ACTIVITY].map((h) => [h, []]));
    for (const it of filt.local) {
      const h = JURISDICTION_HINT(it);
      grouped.get(h === 'Signals to watch' ? OTHER_ACTIVITY : h).push(it);
    }
    // Derived Jurisdiction Watch rows (queue deltas, permit velocity) are period-stamped and would
    // otherwise crowd out the dated prose; at most two per heading, the rest is prose, newest first.
    const PROSE_KINDS = new Set(['signal', 'artifact', 'moratorium', 'puc']);
    const pick = (its) => {
      const derived = its.filter((it) => !PROSE_KINDS.has(it.ref_kind)).slice(0, 2);
      const prose = its.filter((it) => PROSE_KINDS.has(it.ref_kind)).slice(0, Math.max(0, budget.perSection - derived.length));
      return [...prose, ...derived].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, budget.perSection);
    };
    sections = [...grouped.entries()].map(([h, its]) => ({ code: h, name: h, items: pick(its), total: its.length })).filter((x) => x.items.length);
    if (filt.context.length) sections.push({ code: filt.context_heading, name: filt.context_heading, items: filt.context, total: filt.context.length });
  } else if (brief.briefing_type === 'sector') {
    const groups = groupBy(pack.items, (it) => (it.subdomain_tags ?? []).find((s) => s.startsWith(`${brief.sector_id}.`)) ?? (it.domain_tags?.includes(brief.sector_id) ? `${brief.sector_id} (Sector-level)` : null)).filter(([, its]) => its.length >= 2);
    const n = Math.max(Math.min(groups.length, budget.maxSections), Math.min(groups.length, budget.minSections));
    sections = groups.slice(0, n).map(([code, its]) => ({ code, name: code.endsWith('(Sector-level)') ? `${tax.domainName(brief.sector_id)} — Sector-level Signals` : tax.subdomainName(code), items: its.slice(0, budget.perSection), total: its.length }));
  } else {
    // Thread brief: the Thread itself, then the Threads most often co-tagged in the same Signals.
    const own = pack.items;
    const co = groupBy(own.flatMap((it) => (it.subdomain_tags ?? []).filter((s) => s !== brief.thread_id).map((s) => ({ ...it, _co: s }))), (x) => x._co).filter(([, its]) => its.length >= 3);
    const ownIds = new Set();
    sections = [{ code: brief.thread_id, name: tax.subdomainName(brief.thread_id), items: own.slice(0, budget.perSection * 2), total: own.length }];
    own.slice(0, budget.perSection * 2).forEach((it) => ownIds.add(it.id));
    for (const [code, its] of co) {
      if (sections.length >= budget.maxSections) break;
      const fresh = its.filter((it) => !ownIds.has(it.id));
      if (fresh.length < 2) continue;
      sections.push({ code, name: `${tax.subdomainName(code)} (co-tagged Thread)`, items: fresh.slice(0, budget.perSection), total: its.length });
      fresh.slice(0, budget.perSection).forEach((it) => ownIds.add(it.id));
    }
  }
  applyEntryBudget(sections, budget.maxEntries);
  sections.forEach((s, i) => {
    s.key = `t${i + 1}`;
  });
  const used = sections.flatMap((s) => s.items);
  if (!used.length) throw new Error(`no sourced evidence for ${brief.briefing_type} "${brief.title}" in window ${pack.window.from}..${pack.window.to}`);
  const PROSE = new Set(['signal', 'artifact', 'moratorium', 'puc']);
  const newestAll = [...used].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const newest = [...newestAll.filter((it) => PROSE.has(it.ref_kind)), ...newestAll.filter((it) => !PROSE.has(it.ref_kind))];

  // The argument — hypothesis-led, every factual sentence cited.
  const jrec = isJur ? pack.jurisdiction_record : null;
  const openers = [];
  const stale = isJur ? postureStale(jrec, used) : { stale: false };
  if (jrec) openers.push(reg.fact(jrec, jrec.text.slice(0, 3).join(' '), 'argument'), '');
  if (stale.stale) openers.push(RECONCILIATION_SENTENCE, '');
  const dense = sections.filter((s) => s.items.length).sort((a, b) => b.total - a.total);
  const subjectName = isJur ? pack.jurisdiction?.name ?? brief.title : brief.briefing_type === 'sector' ? tax.domainName(brief.sector_id) : tax.subdomainName(brief.thread_id);
  const thesisLead = jrec ? `${reg.fact(jrec, jrec.text[0], 'cover')} ${reg.fact(newest[0], newest[0].text[0], 'cover')}` : reg.fact(newest[0], newest[0].text[0], 'cover');
  // Housekeeping (counts and dates of the record itself): its own paragraph, no marker, no Signal figure.
  const p1 = reg.housekeeping(`The record in this Briefing is ${COUNT('*')} sourced items, Faraday Signals${pack.items.some((i) => i.ref_kind === 'artifact') ? ' and crawled articles' : ''}${isJur ? ' and Jurisdiction Watch records' : ''}, dated between ${fmtDate(pack.window.from)} and ${fmtDate(pack.window.to)}. The weight of the record for ${md(subjectName)} sits under ${dense.slice(0, 2).map((s) => s.name).join(' and ')}.`);
  const leadsOf = (s) => [...s.items.filter((it) => PROSE.has(it.ref_kind)), ...s.items.filter((it) => !PROSE.has(it.ref_kind))];
  const p2 = dense.slice(0, 2).map((s) => reg.fact(leadsOf(s)[0], leadsOf(s)[0].text[0], 'argument')).join(' ');
  const p3 = dense.slice(0, 2).map((s) => (leadsOf(s)[1] ? reg.fact(leadsOf(s)[1], leadsOf(s)[1].text[0], 'argument') : '')).filter(Boolean).join(' ');
  const glance = glanceRows(used, budget.glance ?? 8);
  const glanceTbl = glance.length >= 3 ? ['| Figure | What the record shows | Date |', '|---|---|---|', ...glance.map((g) => `| ${md(g.figure)} | ${md(clip(g.sentence, 110))} ${reg.cite(g.item, 'argument')} | ${fmtDate(g.item.date)} |`)].join('\n') : '';

  const argument = ['## The argument', '', ...openers, p1, '', p2, ...(p3 ? ['', p3] : []), ...(glanceTbl ? ['', '**At a glance**', '', glanceTbl] : [])].join('\n');

  const body = sections.map((s, i) => {
    const key = s.key;
    const head = `## ${md(s.name)}`;
    if (!s.items.length) return `${head}\n\nThe record holds no dated Signal for this heading in the window.`;
    const intro = reg.housekeeping(`The record holds ${COUNT(key)} dated Signal${s.items.length === 1 ? '' : 's'} under this heading in the Sources table, set out below newest first.`);
    return [head, '', intro, '', ...s.items.map((it) => entry(it, reg, key, budget.sentences, budget.headline))].join('\n\n');
  });

  // Signal register — named parties and their recorded type (companies record), cited to the Signals.
  const parties = register(used, pack).slice(0, 10);
  const regLines = ['## Signal register', '', `Named parties that appear in the cited Signals, with the role recorded for them in Faraday's companies table${parties.length ? '' : ' — none of the cited records carries a resolved company tag'}.`];
  if (parties.length) {
    regLines.push('', '| Party | Role in the cited Signals | Sources |', '|---|---|---|');
    for (const p of parties) {
      const n = new Set(p.items.map((it) => reg.register(it))).size; // distinct Sources-table rows naming the party
      regLines.push(`| ${md(p.name)} | ${md(p.type ?? 'recorded party')} — named in ${n} Signal${n === 1 ? '' : 's'} | ${p.items.slice(0, 4).map((it) => reg.cite(it, 'register')).join(' ')} |`);
    }
  }

  const take = [
    ':::take',
    "## Faraday's Take",
    '',
    `Faraday's reading of this record: ${dense.slice(0, 2).map((s) => `${COUNT(s.key)} of the ${COUNT('*')} sources in this Briefing sit under ${s.name}`).join(' and ')}, which is where the sourced facts concentrate.`,
    '',
    `${reg.fact(leadsOf(dense[0])[0], leadsOf(dense[0])[0].text[0], 'take')}${dense[1] ? ` ${reg.fact(leadsOf(dense[1])[0], leadsOf(dense[1])[0].text[0], 'take')}` : ''}`,
    '',
    `Our view is that these are the facts to weigh first; the Take introduces no claim that the body does not already source.`,
    '',
    `*— ${BYLINES.standard}*`,
    ':::',
  ].join('\n');

  const extraMethod = [];
  if (isJur) extraMethod.push('Informational, not legal advice.');
  if (used.some((it) => it.attribution)) extraMethod.push(`${MORATORIUM_NATION_ATTRIBUTION}.`);
  pack.items_used = reg.size();
  const sources = sourcesPage(reg, pack, brief, methodNote(pack, brief, extraMethod));

  const cover = [
    ':::cover',
    `# ${md(brief.title)}`,
    '',
    thesisLead,
    '',
    coverMeta([
      ['Kicker', `Library · ${kicker}`],
      ['Tier', `Standard (${brief.page_target ?? '8–10'} pp target)`],
      ['Coverage', isJur ? `Jurisdiction: ${md(subjectName)}` : brief.briefing_type === 'sector' ? `Sector: ${md(subjectName)} › Threads: ${sections.map((s) => s.name).join(' · ')}` : `Thread: ${md(subjectName)}`],
      ['Byline', BYLINES.standard],
      ['Evidence window', `${fmtDate(pack.window.from)} – ${fmtDate(pack.window.to)}, ${COUNT('*')} sources`],
      ['Status', 'DRAFT (not signed off)'],
      ['Record', `${brief.airtable_record_id ?? brief.id} · v${Number(brief.version ?? 1) + 1} · prepared ${fmtDate(now.toISOString().slice(0, 10))}`],
    ]),
    ':::',
  ].join('\n');

  // Jurisdiction Briefings carry the forward watch list (decision 2): forward-dated triggers only.
  const watchRows = isJur ? watchList(used, now) : [];
  const watch = isJur ? watchBlock(reg, watchRows) : null;
  const blocks = [cover, argument, ...body, ...(watch ? [watch] : []), regLines.join('\n'), take, sources];
  return finish(brief, pack, reg, blocks, { hypothesis: thesisLead, byline: BYLINES.standard, kind: isJur ? 'jurisdiction' : 'standard', jurisdiction_filter: jurFilter, posture_stale: isJur ? stale : null, watch: isJur ? { rows: watchRows.length, empty: watchRows.length < MIN_WATCH_ROWS } : null, sections: sections.map((s) => ({ code: s.code, name: s.name, items: s.items.length, total: s.total })) });
}

// ---------------------------------------------------------------------------------------------
// Profile (Company / Institution)
// ---------------------------------------------------------------------------------------------

export function composeProfile(brief, pack, budget, now) {
  const reg = createRegistry();
  const ent = pack.entity;
  if (!ent) throw new Error(`profile brief ${brief.id} has no companies/institutions record`);
  const available = pack.items.filter((it) => it.ref_kind !== 'record');
  const signals = available.slice(0, Math.min(budget.perSection, PROFILE_MAX_SIGNALS));
  const thin = available.length < PROFILE_THIN_BELOW; // a property of the record, never of the page budget
  const kicker = brief.institution_id && !brief.company_id ? KICKER.institution : KICKER.company;
  const idCite = reg.cite(ent, 'identity');

  const identity = ['## Identity card', '', ...ent.identity.map((kv) => `- **${md(kv.label)}:** ${md(kv.value)} ${idCite}`)];
  // "What the record shows" adds information rather than repeating the entries: it prefers records
  // the Dated Signals list did not have room for, then a printed record's SECOND sentence.
  const leadN = Math.max(1, budget.lead ?? 2);
  const unprinted = available.slice(signals.length).filter((it) => it.figures?.length).concat(available.slice(signals.length).filter((it) => !it.figures?.length));
  const leadParts = [];
  for (const it of unprinted) {
    if (leadParts.length >= leadN) break;
    const t = it.text.find((x) => x.length <= ENTRY_MAX_SENTENCE_CHARS) ?? it.text[0];
    leadParts.push(`${t} ${reg.cite(it, 'lead')}`);
  }
  for (const it of signals) {
    if (leadParts.length >= leadN) break;
    const second = it.text.slice(1).find((x) => x.length <= ENTRY_MAX_SENTENCE_CHARS && !BOILERPLATE.test(x));
    if (second) leadParts.push(`${second} ${reg.cite(it, 'lead')}`);
  }
  if (!leadParts.length && signals[0]) leadParts.push(`${signals[0].text[0]} ${reg.cite(signals[0], 'lead')}`);
  const lead = leadParts;
  const shows = ['## What the record shows', '', lead.length ? lead.join(' ') : `The record holds no dated Signal for ${md(ent.name)} in the window.`];
  const dated = ['## Dated Signals', '', ...(signals.length ? signals.map((it) => entry(it, reg, 'signals', budget.sentences, budget.headline)) : ['The record holds no dated Signal in the window.'])];

  const extra = [
    `_Only facts recorded in Faraday's tables are printed: no Take, no forecast, no rating. Reported, planned or unconfirmed items say so in the source's own words._`,
  ];
  if (thin) extra.push(`**Thin record.** Fewer than ${PROFILE_THIN_BELOW} sourced Signals (${available.length}) exist for this entity in the window; the Profile is flagged thin rather than padded.`);
  pack.items_used = reg.size();
  const sources = sourcesPage(reg, pack, brief, methodNote(pack, brief, extra), 'Sources & method');

  const cover = [
    ':::cover',
    `# ${md(ent.name)}`,
    '',
    coverMeta([
      ['Kicker', `Library · ${kicker}`],
      ['Tier', 'Profile (2 pp) · Sourced facts only'],
      ['Status', 'DRAFT (not signed off)'],
      ['Record', `${brief.airtable_record_id ?? brief.id} · v${Number(brief.version ?? 1) + 1} · prepared ${fmtDate(now.toISOString().slice(0, 10))}`],
      ['Evidence window', `${fmtDate(pack.window.from)} – ${fmtDate(pack.window.to)}, ${reg.size()} sources`],
    ]),
    ':::',
  ].join('\n');

  const blocks = [cover, identity.join('\n'), shows.join('\n'), dated.join('\n\n'), sources];
  const hypothesis = lead.length ? lead[0] : `The record holds no dated Signal for ${md(ent.name)} in the window.`;
  return finish(brief, pack, reg, blocks, { hypothesis, byline: null, kind: 'profile', thin, signal_count: available.length, title: ent.name });
}

// ---------------------------------------------------------------------------------------------
// Assembly + validation
// ---------------------------------------------------------------------------------------------

function finish(brief, pack, reg, blocks, meta) {
  const manuscript = String(reg.resolveCounts(blocks.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n'));
  const contents = splitSections(manuscript);
  const source_refs = reg.refs().map(({ n, ...r }) => r);
  const draft = {
    title: meta.title ?? brief.title,
    tier: brief.tier,
    kind: meta.kind,
    hypothesis: meta.hypothesis,
    byline: meta.byline,
    contents,
    source_refs,
    manuscript_md: manuscript,
    evidence_from: new Date(`${pack.window.from}T00:00:00Z`).toISOString(),
    evidence_to: new Date(`${pack.window.to}T23:59:59Z`).toISOString(),
    meta: { source_count: source_refs.length, items_in_scope: pack.items.length, thin: Boolean(meta.thin), jurisdiction_filter: meta.jurisdiction_filter ?? null, posture_stale: meta.posture_stale ?? null, watch: meta.watch ?? null, signal_count: meta.signal_count ?? pack.items.length, sections: meta.sections ?? [], housekeeping: reg.housekeepingLines(), hygiene: pack.hygiene ?? null },
  };
  const v = validate(draft);
  if (!v.ok) throw new Error(`composer produced an invalid draft: ${v.problems.join('; ')}`);
  return draft;
}

/** Top-level sections of a manuscript (cover block first, then each "## " heading; the Take block stays whole). */
export function splitSections(mdText) {
  const out = [];
  let cur = [];
  let inFence = false;
  let inBlock = false;
  for (const line of mdText.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    if (!inFence && line.startsWith(':::')) {
      if (!inBlock && cur.join('').trim()) {
        out.push(cur.join('\n').trim());
        cur = [];
      }
      inBlock = line.trim() !== ':::';
      cur.push(line);
      if (!inBlock) {
        out.push(cur.join('\n').trim());
        cur = [];
      }
      continue;
    }
    if (!inFence && !inBlock && line.startsWith('## ') && cur.join('').trim()) {
      out.push(cur.join('\n').trim());
      cur = [];
    }
    cur.push(line);
  }
  if (cur.join('').trim()) out.push(cur.join('\n').trim());
  return out;
}

const CODE_RE = /\b(?:D\d{1,2}(?:\.\d{1,2})?|T-00\d)\b/;

/**
 * Marker ↔ source_refs parity, cited-sentence rule, vocabulary and code hygiene.
 * Returns { ok, problems[], markers, refs }.
 */
export function validate(draft) {
  const problems = [];
  const text = draft.manuscript_md ?? '';
  const refs = draft.source_refs ?? [];
  const refSet = new Set(refs.map((r) => r.ref));
  const used = new Set();
  for (const m of text.matchAll(/\[S(\d+)\]/g)) used.add(`S${m[1]}`);
  for (const u of used) if (!refSet.has(u)) problems.push(`marker ${u} has no source_refs entry`);
  for (const r of refs) {
    if (!used.has(r.ref)) problems.push(`source_refs ${r.ref} is never cited`);
    if (!r.url || !r.title) problems.push(`source_refs ${r.ref} lacks url/title`);
  }
  refs.forEach((r, i) => {
    if (r.ref !== `S${i + 1}`) problems.push(`source_refs out of order at ${r.ref}`);
  });

  // Body text: split out cover, Sources page and fenced blocks; every prose line must cite.
  const lines = text.split('\n');
  let inFence = false;
  let inCover = false;
  let inSources = false;
  let inTake = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line === ':::cover') {
      inCover = true;
      continue;
    }
    if (line === ':::take') {
      inTake = true;
      continue;
    }
    if (line === ':::') {
      inCover = false;
      inTake = false;
      continue;
    }
    if (/^## Sources & method/.test(line)) inSources = true;
    if (inSources) continue;
    if (/\bKey Players?\b/i.test(line)) problems.push(`forbidden term "Key Player": ${clip(line, 60)}`);
    if (!inCover && CODE_RE.test(line.replace(/\[S\d+\]/g, ''))) problems.push(`internal code in body copy: ${clip(line, 60)}`);
    if (inCover || !line || line.startsWith('#') || line.startsWith('|') || line.startsWith('- **') && inCover) continue;
    if (/^\*\w{3,4} \d{1,2}, \d{4} · /.test(line) || /^\*undated · /.test(line)) continue; // entry date line
    if (line.startsWith('**Findings**') || line.startsWith('**At a glance**')) continue;
    if (UNCITED_OK.some((re) => re.test(line))) continue;
    const prose = line.replace(/^(\d+\.\s|-\s)/, '');
    if (prose.length >= 25 && !/\[S\d+\]/.test(prose)) problems.push(`uncited prose${inTake ? ' (Take)' : ''}: ${clip(prose, 70)}`);
  }
  return { ok: problems.length === 0, problems, markers: used.size, refs: refs.length };
}

/** Every digit-bearing token in a generated sentence must appear in the cited items' text. */
export function numbersSupported(sentence, items) {
  const pool = items.map((it) => it.text.join(' ')).join(' ');
  const toks = decodeEntities(sentence).match(/\$?\d[\d,.]*\s?(?:billion|million|GW|MW|%|percent)?/g) ?? [];
  return toks.every((t) => pool.includes(t.trim()));
}

/**
 * Dispatch on tier (+ jurisdiction variant).
 * @param {object} brief public.briefings row
 * @param {object} pack EvidencePack from buildPack()
 * @param {{ budget?: Record<string, any>, now?: Date }} [opts]
 */
export function compose(brief, pack, { budget, now = new Date() } = {}) {
  const tier = brief?.tier;
  if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}" (expected ${TIERS.join('|')})`);
  const b = { ...DEFAULT_BUDGET[tier], ...(budget ?? {}) };
  if (tier === 'deep') return composeDeep(brief, pack, b, now);
  if (tier === 'profile') return composeProfile(brief, pack, b, now);
  return composeStandard(brief, pack, b, now);
}

export { extractFigures };
