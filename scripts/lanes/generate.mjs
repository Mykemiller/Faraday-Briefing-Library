// BL2-05 (FDY-281): generate(brief) — the sourced generator that replaces the BL2-04 stub.
//
//   const gen = await generate(brief, { evidence, now, counter, polisher });
//
// Pipeline for ONE public.briefings row:
//   1. evidence window by tier (Deep 12 mo · Standard 6 mo · Profile 12 mo · jurisdiction 12 mo);
//   2. evidence.fetchRaw(brief, window) → buildPack (Faraday records only — see evidence.mjs);
//   3. compose(brief, pack, budget) → manuscript (Markdown) + hypothesis/contents/byline/source_refs,
//      validated for marker ↔ source_refs parity, cited sentences and vocabulary (compose.mjs);
//   4. render check: manuscript → tier HTML → Letter PDF page count (manuscript.mjs). When the count
//      falls outside the tier range the draft is RE-COMPOSED on a smaller/larger budget (entries per
//      section, sentences per entry) — never by shrinking type — up to `maxIterations` times. An
//      out-of-range draft is still returned (the runner stages it and logs G1-AUTO FAIL).
//   5. optional model polish of the thesis + Take (llm.mjs), accepted only if it validates and the
//      page count stays in range; otherwise the deterministic text stands.
//
// The contract the lane runner relies on (superset of BL2-04's):
//   { title, hypothesis, contents[], source_refs[], byline, evidence_from, evidence_to,
//     manuscript_md, html, pages, page_range, in_range, render_checked, fonts_loaded, thin,
//     signal_count, source_count, items_in_scope, fit[], polished, polish_reason, stub: false }

import { buildPack, evidenceWindow as evidenceWindowFor, EVIDENCE_MONTHS } from './evidence.mjs';
import { compose, DEFAULT_BUDGET, BYLINES, TIERS, PAGE_RANGE, PROFILE_THIN_BELOW, splitSections, validate } from './compose.mjs';
import { renderManuscript, inRange } from '../templates/manuscript.mjs';
import { NoThesisError, applyThesis } from './thesis.mjs';

export { EVIDENCE_MONTHS, BYLINES, TIERS, PAGE_RANGE };
export const MAX_FIT_ITERATIONS = 6;

/** Kept for callers that import the BL2-04 name; the window now follows briefing_type too. */
export function evidenceWindow(tier, now = new Date(), briefingType = null) {
  const w = evidenceWindowFor({ tier, briefing_type: briefingType }, now);
  return { evidence_from: w.from.toISOString(), evidence_to: w.to.toISOString() };
}

/** Next budget to try, or null when nothing can move. Shrinks on over-length, grows on under-length. */
export function nextBudget(budget, pages, tier, draft) {
  const [lo, hi] = PAGE_RANGE[tier];
  const b = { ...budget };
  if (pages > hi) {
    if (tier === 'profile') {
      // Lead sentences, then sentences per entry, then entries (never below 4). `thin` is a property
      // of the record (fewer than 6 sourced Signals EXIST), never of this page budget; a Profile that
      // still overflows at 4 × 1 is staged out of range and logged G1-AUTO FAIL.
      if (b.lead > 1) b.lead -= 1;
      else if (b.sentences > 1) b.sentences -= 1;
      else if (b.perSection > 4) b.perSection -= 1;
      else return null;
      return b;
    }
    if (b.sentences > 2) {
      b.sentences -= 1;
      return b;
    }
    if (b.perSection > 2) {
      const scaled = Math.floor(b.perSection * (hi / pages));
      b.perSection = Math.max(2, Math.min(b.perSection - 1, scaled));
      return b;
    }
    if (b.sentences > 1) {
      b.sentences -= 1;
      return b;
    }
    if (b.maxSections > b.minSections) {
      b.maxSections -= 1;
      return b;
    }
    return null;
  }
  if (pages < lo) {
    if (tier === 'profile') return null; // page 2 is forced by the Sources page; page 1 is never padded
    const available = Math.max(0, ...(draft?.meta?.sections ?? []).map((s) => s.total - s.items));
    if (available > 0 && b.perSection < 14) {
      b.perSection += Math.max(1, Math.ceil((lo - pages) * 1.5));
      return b;
    }
    if (b.sentences < 4) {
      b.sentences += 1;
      return b;
    }
    return null;
  }
  return null;
}

/**
 * @param {object} brief public.briefings row
 * @param {object} opts
 * @param {object} opts.evidence  createSupabaseEvidence(...) | createFixtureEvidence(...)
 * @param {Date}   [opts.now]
 * @param {object} [opts.counter] createPageCounter() instance (shared across briefs); null ⇒ no render check
 * @param {object} [opts.polisher] createPolisher() instance; null ⇒ deterministic text only
 * @param {object} [opts.thesisWriter] createThesisWriter() instance (BL3-08)
 * @param {boolean} [opts.requireThesis] BL3-08 gate: a Deep/Standard draft needs a verified thesis + Take, else NoThesisError (not staged). Profiles are exempt.
 */
export async function generate(brief, { evidence, now = new Date(), counter = null, polisher = null, thesisWriter = null, requireThesis = false, maxIterations = MAX_FIT_ITERATIONS, budget: budgetOverride = null } = {}) {
  const tier = brief?.tier;
  if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}" (expected ${TIERS.join('|')})`);
  if (!evidence) throw new Error('generate() needs an evidence source (createSupabaseEvidence or createFixtureEvidence)');

  let window = evidenceWindowFor(brief, now);
  const raw = await evidence.fetchRaw(brief, window);
  // A captured pack carries its own clock; drafting from it reproducibly means drafting as of then.
  const at = evidence.kind === 'fixture' && raw?.captured_at ? new Date(raw.captured_at) : now;
  if (at.getTime() !== now.getTime()) window = evidenceWindowFor(brief, at);
  const pack = buildPack(raw, brief, window);

  let budget = { ...DEFAULT_BUDGET[tier], ...(budgetOverride ?? {}) };
  const fit = [];
  let draft = null;
  let html = null;
  let pages = null;
  let fontsLoaded = null;

  for (let i = 0; i < Math.max(1, maxIterations); i += 1) {
    draft = compose(brief, pack, { budget, now: at });
    if (!counter) break;
    html = renderManuscript(draft.manuscript_md, tier);
    const r = await counter.count(html);
    pages = r.pages;
    fontsLoaded = r.fontsLoaded;
    fit.push({ perSection: budget.perSection, sentences: budget.sentences, ...(budget.lead != null ? { lead: budget.lead } : {}), pages });
    if (inRange(pages, tier)) break;
    const next = nextBudget(budget, pages, tier, draft);
    if (!next || i === maxIterations - 1) break;
    budget = next;
  }

  // BL3-08: thesis + Take, written by the model and verified in code. Fails closed: no key, a failed call
  // or a failed verification throws NoThesisError and nothing is staged (no deterministic padding).
  let thesis = null;
  if (requireThesis && tier !== 'profile') {
    if (!thesisWriter) throw new NoThesisError('no model client (set ANTHROPIC_API_KEY)');
    const w = await thesisWriter.write(draft, pack);
    if (!w.ok) throw new NoThesisError(w.reason);
    const cand = applyThesis(draft, w);
    const withSections = { ...cand, contents: splitSections(cand.manuscript_md) };
    const v = validate(withSections);
    if (!v.ok) throw new NoThesisError(`thesis draft failed composer validation: ${v.problems[0]}`);
    draft = withSections;
    thesis = cand.thesis;
    if (counter) {
      html = renderManuscript(draft.manuscript_md, tier);
      const rr = await counter.count(html);
      pages = rr.pages;
      fit.push({ perSection: budget.perSection, sentences: budget.sentences, pages, after: 'thesis' });
    }
  }

  let polished = false;
  let polishReason = thesis ? 'thesis writer used; polish skipped' : polisher ? null : 'polish disabled';
  if (!thesis && polisher && draft.kind !== 'profile') {
    const r = await polisher.polish(draft, pack);
    if (r.polished) {
      const cand = { ...r.draft, contents: splitSections(r.draft.manuscript_md) };
      const v = validate(cand);
      let ok = v.ok;
      let candHtml = html;
      let candPages = pages;
      if (ok && counter) {
        candHtml = renderManuscript(cand.manuscript_md, tier);
        const rr = await counter.count(candHtml);
        candPages = rr.pages;
        ok = inRange(candPages, tier) || !inRange(pages, tier);
      }
      if (ok) {
        draft = cand;
        html = candHtml;
        pages = candPages;
        polished = true;
      } else polishReason = v.ok ? `polished draft left the page range (${candPages} pp)` : v.problems[0];
    } else polishReason = r.reason;
  } else if (polisher && !thesis) polishReason = 'profiles are never polished';

  return {
    title: draft.title,
    hypothesis: draft.hypothesis,
    contents: draft.contents,
    source_refs: draft.source_refs,
    byline: draft.byline,
    evidence_from: draft.evidence_from,
    evidence_to: draft.evidence_to,
    manuscript_md: draft.manuscript_md,
    html,
    pages,
    page_range: PAGE_RANGE[tier],
    in_range: pages == null ? null : inRange(pages, tier),
    render_checked: pages != null,
    fonts_loaded: fontsLoaded,
    thin: Boolean(draft.meta.thin),
    thin_below: PROFILE_THIN_BELOW,
    signal_count: draft.meta.signal_count,
    source_count: draft.meta.source_count,
    items_in_scope: draft.meta.items_in_scope,
    sections: draft.meta.sections,
    fit,
    polished,
    polish_reason: polishReason,
    thesis,
    watch: draft.meta?.watch ?? null,
    kind: draft.kind,
    stub: false,
  };
}
