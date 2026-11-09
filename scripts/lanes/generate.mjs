// BL2-04 (FDY-280): generate(brief) STUB. BL2-05 (FDY-281) replaces this with the sourced
// generator. Here it returns the tier template's section skeleton with a placeholder thesis and
// an EMPTY source_refs, so the lane runner can be exercised end to end without a model call.
//
// Section lists are transcribed from docs/templates/{deep,standard,profile}.md §"Section list".
// Evidence windows follow the FDY-281 spec (Deep 12 mo · Standard 6 mo · Profile 12 mo) so the
// draft row already carries evidence_from/evidence_to of the right span.

export const TIERS = Object.freeze(['deep', 'standard', 'profile']);

export const TEMPLATE_SKELETONS = Object.freeze({
  deep: Object.freeze([
    'Cover',
    'Summary',
    'Body section 1',
    'Body section 2',
    'Body section 3',
    'Body section 4',
    'Signals to watch',
    "Faraday's Take",
    'Sources & methodology',
  ]),
  standard: Object.freeze(['Cover', 'The argument', 'Thread sections', 'Signal register', "Faraday's Take", 'Sources & methodology']),
  profile: Object.freeze(['Header', 'Identity card', 'What the record shows', 'Dated Signals', 'Sources & method']),
});

export const EVIDENCE_MONTHS = Object.freeze({ deep: 12, standard: 6, profile: 12 });

// Byline rule (FDY-281 / Brand Bible V2 §06): Deep = editorial byline, Standard = Gilbert, Profile = none.
export const BYLINES = Object.freeze({ deep: 'Faraday Editorial', standard: 'Gilbert Faraday', profile: null });

export const PLACEHOLDER_THESIS =
  '[PLACEHOLDER THESIS — BL2-04 runner skeleton. No claim is made here; the BL2-05 generator supplies the sourced thesis.]';

export function evidenceWindow(tier, now = new Date()) {
  const months = EVIDENCE_MONTHS[tier];
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - months);
  return { evidence_from: from.toISOString(), evidence_to: to.toISOString() };
}

/**
 * @param {object} brief a public.briefings row
 * @returns {Promise<{title:string, hypothesis:string, contents:string[], source_refs:any[], byline:string|null, evidence_from:string, evidence_to:string, stub:true}>}
 */
export async function generate(brief, { now = new Date() } = {}) {
  const tier = brief?.tier;
  if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}" (expected ${TIERS.join('|')})`);
  const sections = TEMPLATE_SKELETONS[tier];
  return {
    title: brief.title,
    hypothesis: PLACEHOLDER_THESIS,
    contents: sections.map((s) => `## ${s}\n\n_Placeholder — ${tier} template skeleton (BL2-04). Replaced by the BL2-05 generator._`),
    source_refs: [],
    byline: BYLINES[tier],
    ...evidenceWindow(tier, now),
    stub: true,
  };
}
