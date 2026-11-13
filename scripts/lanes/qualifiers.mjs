// BL3-07 (FDY-331): hedges and date qualifiers survive composition verbatim.
//
//   verifyQualifiers(outputText, items) → [{ kind, figure|year, output_qualifier, source_qualifier, sentence, source }]
//
// For every figure in the output ("$600M", "casi €250 million", "20–30 MW", "18%"), the word or range in
// front of it must be the one the source sentence carries ("up to", "casi", "20–"), and the output may
// not give the figure a year its source sentence does not state. For every year with a date qualifier
// ("by 2032", "after 2032"), the qualifier must be the source's. An empty result means the output keeps
// every hedge and date qualifier of its sources. Used by the composer's tests, by G1
// (`qualifier_changed`) and, from FDY-333, on model-written text.
//
// Matching is per sentence: a figure in the output is compared with the source sentence(s) it most
// resembles among those that state the same figure (normalised: "$5 billion" = "$5B", "250 million" =
// "250M"); a year likewise, among the source sentences that state that year. A figure no source sentence
// states is left to G1's number check, not reported here.

import { decodeEntities, sentences } from './evidence.mjs';

export const HEDGE_WORDS = Object.freeze([
  'up to', 'as much as', 'as many as', 'more than', 'less than', 'fewer than', 'at least', 'at most', 'over', 'under',
  'about', 'around', 'approximately', 'approx.', 'roughly', 'nearly', 'almost', 'some', 'casi', 'circa', 'close to',
  'in excess of', 'upwards of', 'an estimated', 'estimated', 'a projected', 'projected', 'potentially', '~',
]);
export const DATE_QUALIFIERS = Object.freeze([
  'by the end of', 'by the end', 'no later than', 'as early as', 'end of', 'by', 'after', 'before', 'from', 'until', 'till',
  'through', 'since', 'in', 'during', 'starting in', 'starting', 'beginning in', 'beginning', 'early', 'mid', 'late', 'around',
]);

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLength = (ws) => [...ws].sort((a, b) => b.length - a.length).map(esc).join('|');
const HEDGE_BEFORE = new RegExp(`(?:^|[\\s(—–-])(${byLength(HEDGE_WORDS)})\\s*$`, 'i');
const DATE_BEFORE = new RegExp(`(?:^|[\\s(—–-])(${byLength(DATE_QUALIFIERS)})(?:\\s+the)?\\s+$`, 'i');
const RANGE_BEFORE = /(\d[\d,.]*)\s?(?:[–—-]|to)\s?$/;

/** Figures: currency amounts, scaled amounts and quantities with a unit. Bare integers are not figures. */
export const FIGURE_RE = /[$€£¥]\s?\d[\d,.]*(?:\s?(?:trillion|billion|million|thousand|bn|tn|[kmbt])\b)?|\b\d[\d,.]*\s?(?:trillion|billion|million|bn|gw|mw|kw|twh|gwh|mwh|%|percent|acres?|sq\.?\s?ft|square feet|miles?|jobs|years?|months?|days?)(?![\w])/gi;
const YEAR_RE = /(?<![\d.,$€£¥])\b(?:19|20)\d{2}\b(?![\d.,]?\d)/g;

/** "$4.25 billion" → "$4.25b", "250 Million" → "250m", "18 percent" → "18%", "3,000 MW" → "3000mw". */
export function normFigure(f) {
  return String(f)
    .toLowerCase()
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(/\s+/g, '')
    .replace(/trillion|tn/g, 't')
    .replace(/billion|bn/g, 'b')
    .replace(/million/g, 'm')
    .replace(/thousand/g, 'k')
    .replace(/percent/g, '%')
    .replace(/(\d)\.0+(?=\D|$)/g, '$1');
}

/** The hedge or range in front of position `i` of `text` ("up to", "range:20"), '' when none. */
export function qualifierBefore(text, i) {
  const prefix = String(text).slice(Math.max(0, i - 40), i);
  const r = prefix.match(RANGE_BEFORE);
  if (r) return `range:${normFigure(r[1])}`;
  const h = prefix.match(HEDGE_BEFORE);
  return h ? h[1].toLowerCase() : '';
}

/** The date qualifier in front of position `i` ("by", "after", "early"), '' when none. */
export function dateQualifierBefore(text, i) {
  const m = String(text).slice(Math.max(0, i - 30), i).match(DATE_BEFORE);
  return m ? m[1].toLowerCase() : '';
}

const clean = (s) => decodeEntities(String(s ?? '').replace(/\[S?\d+(?:\s*,\s*S?\d+)*\]/g, ' ').replace(/[*_|]/g, ' '));

function figuresIn(sentence) {
  const out = [];
  for (const m of sentence.matchAll(FIGURE_RE)) out.push({ figure: m[0].trim(), norm: normFigure(m[0]), q: qualifierBefore(sentence, m.index), start: m.index, end: m.index + m[0].length });
  return out;
}
function yearsIn(sentence, figs = []) {
  const out = [];
  for (const m of sentence.matchAll(YEAR_RE)) {
    if (figs.some((f) => m.index >= f.start && m.index < f.end)) continue; // "2030 jobs" is a figure, not a date
    out.push({ year: m[0], q: dateQualifierBefore(sentence, m.index) });
  }
  return out;
}

/** Source sentences of the cited items: `text[]` (evidence items) or a raw string (a resolved record). */
export function sourceSentences(items) {
  const out = [];
  for (const it of items ?? []) {
    const parts = Array.isArray(it?.text) ? it.text : typeof it?.text === 'string' ? [it.text] : typeof it === 'string' ? [it] : [];
    for (const p of parts) for (const line of String(p).split('\n')) out.push(...sentences(line));
  }
  return out.map(clean).filter(Boolean);
}

/**
 * Every figure whose hedge or range differs from its source sentence (kind 'hedge'), every figure the
 * output dates with a year its source sentences lack (kind 'year_added'), and every year whose date
 * qualifier differs from the source (kind 'date_qualifier').
 * @param {string} outputText composed or model-written prose (markers and Markdown are ignored)
 * @param {Array<{text: string[]|string}|string>} items the cited evidence items (or their record texts)
 */
const wordsOf = (t) => new Set(String(t).toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter((w) => w.length > 2));
function overlap(a, b) {
  const x = wordsOf(a);
  const y = wordsOf(b);
  let n = 0;
  for (const w of x) if (y.has(w)) n += 1;
  return n / Math.max(1, x.size + y.size - n);
}
/** The source sentences an output sentence most resembles, among those that state the same figure or year. */
function closest(o, hits) {
  if (hits.length < 2) return hits;
  const scored = hits.map((h) => ({ h, s: overlap(o, h.sentence) }));
  const top = Math.max(...scored.map((x) => x.s));
  return scored.filter((x) => x.s === top).map((x) => x.h);
}

export function verifyQualifiers(outputText, items) {
  const src = sourceSentences(items).map((s) => {
    const figs = figuresIn(s);
    return { sentence: s, figs, years: yearsIn(s, figs) };
  });
  const problems = [];
  for (const raw of sentences(clean(outputText))) {
    const o = raw.trim();
    if (!o) continue;
    const figs = figuresIn(o);
    const years = yearsIn(o, figs);
    for (const f of figs) {
      const hits = closest(o, src.filter((s) => s.figs.some((g) => g.norm === f.norm)));
      if (!hits.length) continue;
      const same = hits.find((s) => s.figs.some((g) => g.norm === f.norm && g.q === f.q));
      if (!same) {
        const g = hits[0].figs.find((x) => x.norm === f.norm);
        problems.push({ kind: 'hedge', figure: f.figure, output_qualifier: f.q || null, source_qualifier: g?.q || null, sentence: o, source: hits[0].sentence });
      }
      const srcYears = new Set(hits.flatMap((s) => s.years.map((y) => y.year)));
      for (const y of years) if (!srcYears.has(y.year) && !problems.some((p) => p.kind === 'year_added' && p.sentence === o && p.figure === f.figure && p.year === y.year)) problems.push({ kind: 'year_added', figure: f.figure, year: y.year, sentence: o, source: hits[0].sentence });
    }
    for (const y of years) {
      const hits = closest(o, src.filter((s) => s.years.some((z) => z.year === y.year)));
      if (!hits.length) continue;
      if (hits.some((s) => s.years.some((z) => z.year === y.year && z.q === y.q))) continue;
      const z = hits[0].years.find((x) => x.year === y.year);
      problems.push({ kind: 'date_qualifier', year: y.year, output_qualifier: y.q || null, source_qualifier: z?.q || null, sentence: o, source: hits[0].sentence });
    }
  }
  return problems;
}
