// BL2-06 (FDY-282): G1-AUTO — the deterministic review gate. No model, no network.
//
// Input: a briefings_versions draft row (kind='draft'; contents[0] is the manuscript Markdown,
// source_refs the citation list), the parent briefings row, a measured page count and a source
// resolver. Output: { result: 'PASS'|'FAIL', blockers[], stats }.
//
// Checks (FDY-282 prompt, in order):
//   1. marker ↔ source_refs parity — every [Sn]/[n] marker has a ref, every ref is cited;
//   2. every source url resolves to a Faraday record (signals / artifacts / companies /
//      institutions / jw_*) or is a primary URL recorded on the brief;
//   3. measured PDF pages inside the tier range (Deep 10–15 · Standard 8–10 · Profile exactly 2);
//   4. banned vocabulary: "Key Player" anywhere; internal codes (D3, D3.5, T-001, cmp_…, rec…,
//      supabase://, airtable://) outside the Sources page;
//   5. Profile: no Faraday's Take, no call-to-action;
//   6. jurisdiction brief carries "Informational, not legal advice.";
//   7. every number in the body appears verbatim in its cited source text (substring match after
//      normalising thousands separators and units); an uncited sentence with a number is a blocker.
//   Plus two structural blockers the skeleton drafts need: no_sources (empty source_refs) and
//   placeholder_content (the BL2-04 stub markers).
//
// Markers: `[S3]`, `[3]`, `[3, 7]`, `[S3][S4]`. Refs: `{ref:'S3'}` or `{n:3}`.

export const PAGE_RANGES = Object.freeze({ deep: [10, 15], standard: [8, 10], profile: [2, 2] });
export const CTA_PATTERN = /\b(subscribe|sign up|contact us|get in touch|book a (?:call|demo|meeting)|request a demo|buy now|learn more at|visit us|call us|email us|schedule a|reach out)\b/i;
export const NOT_LEGAL_ADVICE = 'Informational, not legal advice.';
export const INTERNAL_CODE_PATTERNS = Object.freeze([
  /(?<![\w./-])[DT]\d{1,2}(?:\.\d{1,2})?(?![\w/-])(?!\.\d)/g, // D3, D3.5, T5 (IDF domain / sub-domain ids); a trailing full stop is allowed
  /\bT-\d{3}\b/g, // theme ids
  /\bcmp_[0-9a-f]{8,}\b/g,
  /\binst_[A-Za-z0-9_]+\b/g,
  /\brec[A-Za-z0-9]{14}\b/g,
  /\bsupabase:\/\//g,
  /\bairtable:\/\//g,
]);

const MARKER_RE = /\[((?:S?\d+)(?:\s*,\s*S?\d+)*)\]/g;

/** Bare `[n]` markers are accepted only up to this many refs; `[Sn]` always counts. A title's "[2026]" is not a marker. */
export const BARE_MARKER_MAX = 500;

export function markersIn(text, { bareMax = BARE_MARKER_MAX } = {}) {
  const out = [];
  for (const m of String(text ?? '').matchAll(MARKER_RE)) {
    for (const part of m[1].split(/\s*,\s*/)) {
      const bare = !/^S/i.test(part);
      const n = Number(part.replace(/^S/i, ''));
      if (!Number.isInteger(n) || n <= 0) continue;
      if (bare && n > bareMax) continue;
      out.push(n);
    }
  }
  return out;
}

/**
 * Statements ABOUT the record (BL2-05 compose.mjs writes them deterministically from the evidence pack):
 * counts of Signals, the evidence window, register tallies, scale descriptors. Their numbers are corpus
 * statistics, not claims a source states, so they are stripped before the number check. Each pattern
 * removes only the meta phrase; any cited fact in the rest of the sentence is still checked.
 */
export const RECORD_STATEMENT_STRIPS = Object.freeze([
  /^The record holds \d+ dated Signals?\b[^;]*;\s*the newest (?:is|being)\s*/i,
  /^The record holds \d+ dated Signals?\b[^.]*\.?/i,
  /^The record in this Briefing is \d+ sourced items?\b.*?dated between [^.]*\./i,
  /^\[S\d+\]\s*The record in this Briefing is \d+ sourced items?\b.*?dated between [^.]*\./i,
  /Over the \d+ months to [A-Z][a-z]{2,8}\.? \d{1,2}, \d{4},?/,
  /;\s*the \d+ most recent are set out below,?/i,
  /\bthe \d+ most recent are set out below,?/i,
  /\(score [\d.]+ on the 0[-–]100 scale\)/i,
  /\bon the 0[-–]100 scale\b/i,
  /\bnamed in \d+ Signals?\b/i,
  /^The weight of the record for [^.]*\./i,
  /^Faraday's reading of this record:.*?records in scope sit under [^.]*\.\s*/i,
  /\b\d+ of the \d+ records in scope\b/gi,
]);

export function stripRecordStatements(text) {
  let t = String(text ?? '');
  for (const re of RECORD_STATEMENT_STRIPS) t = t.replace(re, ' ');
  return t;
}

export function refNumber(ref) {
  if (ref == null) return null;
  if (Number.isInteger(ref.n)) return ref.n;
  const m = String(ref.ref ?? '').match(/^S?(\d+)$/i);
  return m ? Number(m[1]) : null;
}

/** Split a manuscript into cover, sections (## headings) and the take; identify the Sources page. */
export function parseManuscript(md) {
  const text = String(md ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/```json[\s\S]*?```/g, '');
  const lines = text.split('\n');
  let cover = [];
  const sections = [];
  let current = null;
  let inCover = false;
  let inTake = false;
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (l.startsWith(':::')) {
      const kind = l.slice(3).trim();
      if (kind === 'cover') { inCover = true; continue; }
      if (kind === 'take') { inTake = true; continue; }
      if (!kind) { inCover = false; inTake = false; continue; }
    }
    if (inCover) { cover.push(l); continue; }
    if (l.startsWith('## ')) {
      current = { heading: l.slice(3).trim(), lines: [], take: inTake };
      sections.push(current);
      continue;
    }
    if (!current) { cover.push(l); continue; }
    current.lines.push(l);
  }
  for (const s of sections) {
    s.body = s.lines.join('\n');
    s.isSources = /^sources?\b/i.test(s.heading);
    s.isTake = s.take || /faraday'?s take/i.test(s.heading);
    s.isCoverish = /^(header|cover|identity card)$/i.test(s.heading);
  }
  return { cover: cover.join('\n'), sections, title: (text.match(/^#\s+(.+)$/m) ?? [])[1] ?? null };
}

/** Body = everything except cover and the Sources page (the Take is body for vocabulary and numbers). */
export function bodySections(parsed) {
  return parsed.sections.filter((s) => !s.isSources);
}

// ---------------------------------------------------------------------------------------------
// Sentences and numbers
// ---------------------------------------------------------------------------------------------

/**
 * Split a section body into checkable units: prose sentences, list items, and table rows (a table
 * inherits the citations of its header row and of the paragraph just before it).
 */
export function unitsOf(sectionBody) {
  const units = [];
  const lines = String(sectionBody ?? '').split('\n');
  let para = [];
  let lastParaCites = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = para.join(' ').trim();
    para = [];
    if (!p) return;
    const sentences = p.split(/(?<=[.!?])(?:\s+|$)(?=[A-Z"“(\[*]|$)/).map((s) => s.trim()).filter(Boolean);
    // A trailing citation separated from its sentence ("... years. [S2]") is re-attached.
    const merged = [];
    for (const s of sentences) {
      if (/^(\[(?:S?\d+)(?:\s*,\s*S?\d+)*\]\s*)+\.?$/.test(s) && merged.length) merged[merged.length - 1] += ' ' + s;
      else merged.push(s);
    }
    // A sentence without a marker inherits the citations of the next cited sentence in the same paragraph
    // (an end-of-paragraph marker covers the paragraph), else the paragraph's own set.
    const paraCites = markersIn(p);
    const own = merged.map((s) => markersIn(s));
    for (let k = 0; k < merged.length; k += 1) {
      let cites = own[k];
      if (!cites.length) for (let j = k + 1; j < merged.length && !cites.length; j += 1) cites = own[j];
      if (!cites.length) cites = paraCites;
      units.push({ kind: 'sentence', text: merged[k], cites });
    }
    lastParaCites = paraCites;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.startsWith('|')) {
      flushPara();
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i -= 1;
      const header = rows[0] ?? '';
      const tableCites = [...new Set([...markersIn(header), ...lastParaCites])];
      for (const r of rows.slice(2)) {
        if (!/[A-Za-z0-9]/.test(r)) continue;
        const text = r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join(' · ');
        units.push({ kind: 'row', text, cites: [...new Set([...markersIn(r), ...tableCites])] });
      }
      continue;
    }
    if (/^(\s*[-*]\s+|\s*\d+\.\s+)/.test(l)) {
      flushPara();
      const text = l.replace(/^(\s*[-*]\s+|\s*\d+\.\s+)/, '').trim();
      units.push({ kind: 'item', text, cites: [...new Set([...markersIn(text), ...lastParaCites])] });
      continue;
    }
    if (!l.trim()) { flushPara(); continue; }
    para.push(l.trim());
  }
  flushPara();
  return units;
}

const UNIT_MAP = [
  [/\b(trillion|tn)\b/g, 't'],
  [/\b(billion|bn)\b/g, 'b'],
  [/\b(million|mn|mln)\b/g, 'm'],
  [/\b(thousand)\b/g, 'k'],
  [/\bgigawatts?\b/g, 'gw'],
  [/\bmegawatts?\b/g, 'mw'],
  [/\bkilowatts?\b/g, 'kw'],
  [/\bterawatt[- ]hours?\b/g, 'twh'],
  [/\bgigawatt[- ]hours?\b/g, 'gwh'],
  [/\bmegawatt[- ]hours?\b/g, 'mwh'],
  [/\bper ?cent\b/g, '%'],
  [/\bpercentage points?\b/g, 'pp'],
];

/**
 * Normalise text for number matching: thousands separators dropped inside numbers, scale words and
 * UPPER-CASE scale abbreviations ($4.25 B, €810 M) mapped to b/m/k, SI units glued to their number,
 * "3.0" canonicalised to "3", currency signs dropped. Lower-case "m" after a number is a metre, never
 * a million (22,000 m²), so only the word forms and upper-case abbreviations become scale units.
 */
export function normaliseNumbersText(text) {
  let t = String(text ?? '').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
  t = t.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'); // thousands separator (22,000 and 22,000m2 alike)
  t = t.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2'); // decimal comma (3,5 Megawatt)
  t = t.replace(/(\d)\+(?=\s|$)/g, '$1'); // "200+ MW" → "200 MW"
  t = t.replace(/(\d)\s*([MB])(?![\w²³])/g, (_, d, u) => `${d}${u.toLowerCase()}`);
  t = t.toLowerCase();
  for (const [re, rep] of UNIT_MAP) t = t.replace(re, rep);
  t = t.replace(/(\d)\s+(t|b|k|gw|mw|kw|twh|gwh|mwh|%|pp|x)(?![\w²³])/g, '$1$2');
  t = t.replace(/(\d)\s+m(?=\s*\b)(?![²³])/g, '$1m');
  t = t.replace(/[$€£]\s*(\d)/g, '$1');
  t = t.replace(/(\d)\s*%/g, '$1%');
  t = t.replace(/(\d+)\.0+(?![\d])/g, '$1');
  return t;
}

/** "2026-10-06" → the forms a source might carry: ISO, "6 oct 2026", "oct 6 2026", "10/6/2026", "2026". */
export function dateVariants(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return [];
  const [, y, mo, d] = m;
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const name = months[Number(mo) - 1] ?? mo;
  const short = name.slice(0, 3);
  const day = String(Number(d));
  return [`${y}-${mo}-${d}`, `${day} ${name} ${y}`, `${day} ${short} ${y}`, `${name} ${day}, ${y}`, `${short} ${day}, ${y}`, `${name} ${day} ${y}`, `${Number(mo)}/${day}/${y}`, `${day}.${Number(mo)}.${y}`, `${name} ${y}`, `${short} ${y}`];
}

const TOKEN_RE = /(?<![\w./])\d+(?:\.\d+)?(?:t|b|m|k|gw|mw|kw|twh|gwh|mwh|%|pp|x)?(?![\w./])/g; // no fractions or dates (24/7, 10/6)

/**
 * Numeric tokens of one unit of text, after stripping its own citation markers. Each token is an array of
 * acceptable spellings: an ISO date yields its date variants; a range "2028-29" yields the full year and
 * the short form; everything else is a single normalised number(+unit).
 */
export function numberTokens(text) {
  const stripped = String(text ?? '').replace(MARKER_RE, ' ');
  let norm = normaliseNumbersText(stripped);
  const tokens = [];
  const seen = new Set();
  const add = (alts) => { const k = alts.join('|'); if (!seen.has(k)) { seen.add(k); tokens.push(alts); } };
  for (const m of norm.matchAll(/(?<![\w.])\d{4}-\d{2}-\d{2}(?![\w.])/g)) add(dateVariants(m[0]).map((v) => normaliseNumbersText(v)));
  norm = norm.replace(/(?<![\w.])\d{4}-\d{2}-\d{2}(?![\w.])/g, ' ');
  for (const m of norm.matchAll(/(?<![\w.])(\d{4})-(\d{2})(?![\w.])/g)) { add([m[1]]); add([m[1].slice(0, 2) + m[2], m[2]]); }
  norm = norm.replace(/(?<![\w.])\d{4}-\d{2}(?![\w.])/g, ' ');
  for (const m of norm.matchAll(TOKEN_RE)) add([m[0]]);
  return tokens;
}

export function sourceContainsToken(normalisedSource, token) {
  const alts = Array.isArray(token) ? token : [token];
  return alts.some((t) => {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\d.])${esc}(?![\\d])`).test(normalisedSource);
  });
}

/** Source-side matchable text: body/summary text, title, and the dates the record carries. */
export function matchableSourceText(hits, ref) {
  const parts = [];
  for (const h of hits ?? []) {
    if (typeof h.text === 'string' && h.text) parts.push(h.text);
    if (h.title) parts.push(h.title);
    for (const d of [h.published_at, ...(h.dates ?? [])]) parts.push(...dateVariants(d));
  }
  if (ref?.published_at) parts.push(...dateVariants(ref.published_at));
  if (ref?.title) parts.push(ref.title);
  return parts.length ? normaliseNumbersText(parts.join('\n')) : null;
}

// ---------------------------------------------------------------------------------------------
// URL resolution helpers
// ---------------------------------------------------------------------------------------------

export function normaliseUrl(u) {
  let s = String(u ?? '').trim();
  if (!s) return s;
  if (s.startsWith('//')) s = 'https:' + s;
  if (/^https?:\/\//i.test(s)) s = s.replace(/[?#].*$/, '');
  return s;
}

/** All URLs an entry carries ("a · b" joins are split). */
export function urlsOf(ref) {
  const raw = [ref?.url, ...(Array.isArray(ref?.urls) ? ref.urls : []), ...(Array.isArray(ref?.alt_urls) ? ref.alt_urls : [])]
    .filter(Boolean)
    .flatMap((u) => String(u).split(/\s+·\s+/));
  return [...new Set(raw.map((u) => u.trim()).filter(Boolean))];
}

// ---------------------------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {object} o.draft briefings_versions row (contents[0] = manuscript, source_refs[])
 * @param {object} o.briefing parent briefings row (airtable_record_id, source_refs, briefing_type)
 * @param {number|null} o.pages measured PDF page count (null = could not measure)
 * @param {(url: string, ctx: {ref: object, briefing: object}) => ({resolved: boolean, kind?: string, id?: string, text?: string|null})} o.resolve
 * @param {string} [o.manuscript] override for contents[0]
 */
export function runG1({ draft, briefing, pages, resolve, manuscript, renderNote }) {
  const blockers = [];
  const push = (code, message, extra = {}) => blockers.push({ code, message, ...extra });
  const md = manuscript ?? draft?.manuscript_md ?? (Array.isArray(draft?.contents) ? draft.contents[0] : '') ?? '';
  const refs = Array.isArray(draft?.source_refs) ? draft.source_refs : [];
  const tier = String(draft?.tier ?? '').toLowerCase();
  const type = draft?.briefing_type ?? briefing?.briefing_type ?? null;
  const parsed = parseManuscript(md);

  // 0. structural
  if (!refs.length) push('no_sources', 'source_refs is empty; a brief with no sources cannot pass the source rule.');
  if (/\[PLACEHOLDER|_Placeholder —|Placeholder — (deep|standard|profile) template skeleton/i.test(md) || /\[PLACEHOLDER/i.test(draft?.hypothesis ?? '')) {
    push('placeholder_content', 'Draft still carries BL2-04 stub placeholders (hypothesis or section bodies).');
  }

  // 1. marker ↔ refs parity
  const refNums = new Map();
  for (const r of refs) {
    const n = refNumber(r);
    if (n == null) push('ref_without_number', `source_refs entry has no ref/n: ${JSON.stringify(r).slice(0, 120)}`);
    else if (refNums.has(n)) push('ref_duplicate', `source_refs carries S${n} twice.`);
    else refNums.set(n, r);
  }
  const bodyText = [parsed.cover, ...bodySections(parsed).map((s) => s.body)].join('\n');
  const cited = new Set(markersIn(bodyText));
  for (const n of cited) if (!refNums.has(n)) push('marker_without_ref', `Marker [S${n}] has no source_refs entry.`, { marker: n });
  for (const n of refNums.keys()) if (!cited.has(n)) push('ref_uncited', `source_refs S${n} is never cited in the text.`, { marker: n });

  // 2. every url resolves
  const resolved = new Map(); // n -> [{url, resolved, kind, id, text}]
  const briefUrls = new Set((Array.isArray(briefing?.source_refs) ? briefing.source_refs : []).flatMap((r) => urlsOf(r)).map(normaliseUrl));
  for (const [n, r] of refNums) {
    const urls = urlsOf(r);
    if (!urls.length) { push('source_without_url', `S${n} has no url.`, { marker: n }); resolved.set(n, []); continue; }
    const hits = urls.map((u) => {
      const res = resolve ? resolve(u, { ref: r, briefing }) : { resolved: false };
      if (!res?.resolved && briefUrls.has(normaliseUrl(u))) return { url: u, resolved: true, kind: 'briefing_primary_url', id: briefing?.id ?? null, text: null };
      return { url: u, ...(res ?? { resolved: false }) };
    });
    resolved.set(n, hits);
    for (const h of hits) if (!h.resolved) push('source_unresolved', `S${n} url does not resolve to a Faraday record or a primary URL on the brief: ${h.url}`, { marker: n, url: h.url });
  }

  // 3. pages
  const range = PAGE_RANGES[tier];
  if (!range) push('unknown_tier', `tier "${tier}" has no page range (expected deep|standard|profile).`);
  else if (pages == null) push('pages_unmeasured', `PDF page count could not be measured${renderNote ? ` (${renderNote})` : ''}.`);
  else if (pages < range[0] || pages > range[1]) push('pages_out_of_range', `Measured ${pages} pages; ${tier} tier requires ${range[0] === range[1] ? `exactly ${range[0]}` : `${range[0]}–${range[1]}`}.`, { pages, range });

  // 4. vocabulary
  const fullText = md;
  for (const m of fullText.matchAll(/key\s+players?/gi)) push('banned_vocabulary', `"${m[0]}" is banned vocabulary (use Theater / Sector / Thread / Signal).`, { term: m[0] });
  const outsideSources = [parsed.cover, ...bodySections(parsed).map((s) => `## ${s.heading}\n${s.body}`)].join('\n');
  const codeHits = new Set();
  for (const re of INTERNAL_CODE_PATTERNS) for (const m of outsideSources.replace(MARKER_RE, ' ').matchAll(re)) codeHits.add(m[0]);
  for (const c of codeHits) push('internal_code_in_body', `Internal code "${c}" appears outside the Sources page.`, { code_value: c });

  // 5. profile rules
  if (tier === 'profile') {
    if (parsed.sections.some((s) => s.isTake) || /faraday'?s take/i.test(outsideSources)) push('profile_has_take', "Profile carries a Faraday's Take; Profiles are sourced facts only.");
    const cta = outsideSources.match(CTA_PATTERN);
    if (cta) push('profile_has_cta', `Profile carries a call-to-action ("${cta[0]}").`, { term: cta[0] });
  }

  // 6. jurisdiction line
  if (type === 'jurisdiction' && !md.includes(NOT_LEGAL_ADVICE)) push('missing_not_legal_advice', `Jurisdiction brief lacks the line "${NOT_LEGAL_ADVICE}".`);

  // 7. numbers vs cited source text
  const sourceNorm = new Map(); // n -> normalised text or null
  const textFor = (n) => {
    if (sourceNorm.has(n)) return sourceNorm.get(n);
    const hits = (resolved.get(n) ?? []).filter((h) => h.resolved);
    const v = hits.some((h) => typeof h.text === 'string' && h.text) ? matchableSourceText(hits, refNums.get(n)) : null;
    sourceNorm.set(n, v);
    return v;
  };
  const stats = { units: 0, numeric_units: 0, numbers_checked: 0, numbers_matched: 0, numbers_unverifiable: 0, numbers_mismatched: 0, uncited_numeric_units: 0 };
  for (const s of bodySections(parsed)) {
    if (s.isCoverish) continue;
    for (const u of unitsOf(s.body)) {
      stats.units += 1;
      const tokens = numberTokens(stripRecordStatements(u.text));
      if (!tokens.length) continue;
      stats.numeric_units += 1;
      if (!u.cites.length) {
        if (s.isTake) continue; // the Take may not introduce facts; that is G3-B's check, not a number check
        stats.uncited_numeric_units += 1;
        // A number with no citation cannot be checked here; FDY-281's "every factual sentence carries [Sn]"
        // is the generator's rule, so this is reported, not blocking.
        push('uncited_number', `Numeric sentence carries no citation: "${u.text.slice(0, 160)}"`, { sentence: u.text, numbers: tokens.map((t) => t[0]), section: s.heading, severity: 'warn' });
        continue;
      }
      for (const tok of tokens) {
        stats.numbers_checked += 1;
        const texts = u.cites.map((n) => textFor(n));
        if (texts.every((t) => t == null)) {
          stats.numbers_unverifiable += 1;
          push('number_unverifiable', `"${tok[0]}" cites ${u.cites.map((n) => `S${n}`).join(', ')} but no source text is available to check it.`, { sentence: u.text, number: tok, cites: u.cites, section: s.heading, severity: 'warn' });
          continue;
        }
        if (texts.some((t) => t && sourceContainsToken(t, tok))) { stats.numbers_matched += 1; continue; }
        stats.numbers_mismatched += 1;
        push('number_mismatch', `"${tok[0]}" does not appear in the cited source text (${u.cites.map((n) => `S${n}`).join(', ')}): "${u.text.slice(0, 160)}"`, { sentence: u.text, number: tok[0], cites: u.cites, section: s.heading });
      }
    }
  }

  const hard = blockers.filter((b) => b.severity !== 'warn');
  return {
    result: hard.length ? 'FAIL' : 'PASS',
    blockers: hard,
    warnings: blockers.filter((b) => b.severity === 'warn'),
    stats: { ...stats, markers: cited.size, refs: refNums.size, pages: pages ?? null, tier, briefing_type: type },
  };
}

/** One-line human summary of a G1 result (for the status log sentence). */
export function summariseG1(r) {
  const counts = {};
  for (const b of r.blockers) counts[b.code] = (counts[b.code] ?? 0) + 1;
  const parts = Object.entries(counts).map(([k, v]) => `${k}×${v}`);
  const pages = r.stats.pages == null ? 'pages unmeasured' : `${r.stats.pages} pages`;
  return r.result === 'PASS'
    ? `Automated gate passed: ${pages}, ${r.stats.refs} sources, ${r.stats.numbers_checked} numbers checked${r.warnings.length ? `, ${r.warnings.length} unverifiable` : ''}.`
    : `${r.blockers.length} blocker${r.blockers.length === 1 ? '' : 's'} (${parts.join(', ')}); ${pages}.`;
}
