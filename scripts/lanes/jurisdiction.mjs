// BL3-08 (FDY-333a): jurisdiction filter, posture-staleness flag and the forward watch list. Pure and
// deterministic — no network, no model. compose.mjs calls these; they are unit-tested on their own.

import { decodeEntities } from './evidence.mjs';

/** Evidence kinds that were fetched BY the jurisdiction (state or country query), so they are local by construction. */
export const SCOPED_KINDS = Object.freeze(new Set(['jw_event', 'moratorium', 'puc', 'facility', 'incentive', 'record']));

export const EU_MEMBER_STATES = Object.freeze(new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']));

const US_STATE_NAMES = Object.freeze({ AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' });

/** Grid operators that serve exactly one state; any other iso_rto spans states and proves nothing about one of them. */
const SINGLE_STATE_GRID = Object.freeze({ ERCOT: 'TX' });

const FEDERAL = /\b(?:FERC|DOE|Department of Energy|Congress(?:ional)?|U\.?S\.? Senate|U\.?S\.? House|House of Representatives|EPA|NERC|White House|federal|Executive Order|Treasury|IRS|NRC)\b/i;
const EU = /\b(?:EU|E\.U\.|European Union|European Commission|European Parliament|Brussels|ACER|ENTSO-E|Energy Efficiency Directive|EU AI Act|Net-Zero Industry Act)\b/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (name) => new RegExp(`(?<![\\w])${esc(name)}(?![\\w])`, 'i');

/** The jurisdiction a brief covers, from the pack's jurisdiction row. */
export function subjectOf(jurisdiction) {
  if (!jurisdiction) return null;
  const isState = jurisdiction.level === 'state';
  const abbr = isState ? jurisdiction.state_abbr : null;
  return {
    name: jurisdiction.name,
    level: jurisdiction.level,
    state_abbr: abbr,
    country_code: jurisdiction.country_code ?? null,
    names: [jurisdiction.name, abbr ? US_STATE_NAMES[abbr] : null].filter(Boolean),
  };
}

/**
 * local   — the item names this jurisdiction (or was fetched by it)
 * federal — a US-state brief and the item is explicitly a federal matter
 * eu      — an EU member-state brief and the item is explicitly an EU matter
 * off     — anything else (named elsewhere, or names no jurisdiction at all)
 */
export function classifyJurisdictionItem(item, subject) {
  if (!subject) return 'local';
  if (SCOPED_KINDS.has(item.ref_kind)) return 'local';
  const blob = decodeEntities(`${item.headline ?? ''} ${(item.text ?? []).join(' ')}`);
  if (subject.names.some((n) => wordRe(n).test(blob))) return 'local';
  if (subject.state_abbr) {
    if (new RegExp(`,\\s${subject.state_abbr}\\b`).test(blob)) return 'local'; // "Austin, TX"
    for (const [grid, st] of Object.entries(SINGLE_STATE_GRID)) if (st === subject.state_abbr && wordRe(grid).test(blob)) return 'local';
    if (FEDERAL.test(blob)) return 'federal';
  } else if (subject.country_code && EU_MEMBER_STATES.has(subject.country_code) && EU.test(blob)) return 'eu';
  return 'off';
}

export const CONTEXT_CAP = 2;

/**
 * @returns {{ local: object[], context: object[], context_heading: string|null, dropped: number, by_class: Record<string, number> }}
 * Context items (federal / EU) are capped at CONTEXT_CAP, newest first; the rest count as dropped.
 */
export function filterJurisdictionItems(items, subject) {
  const by_class = { local: 0, federal: 0, eu: 0, off: 0 };
  const local = [];
  const ctx = [];
  for (const it of items) {
    const c = classifyJurisdictionItem(it, subject);
    by_class[c] += 1;
    if (c === 'local') local.push(it);
    else if (c === 'federal' || c === 'eu') ctx.push(it);
  }
  ctx.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const kept = ctx.slice(0, CONTEXT_CAP);
  return {
    local,
    context: kept,
    context_heading: kept.length ? (subject?.state_abbr ? 'Federal context' : 'EU context') : null,
    dropped: by_class.off + (ctx.length - kept.length),
    by_class,
  };
}

// ---------------------------------------------------------------------------------------------
// Posture staleness
// ---------------------------------------------------------------------------------------------

const RESTRICTIVE = /\b(?:moratori(?:um|a)|ban(?:s|ned)?|halt(?:s|ed)?|paus(?:e|es|ed)|restrict(?:s|ed|ion|ions)?|den(?:y|ies|ied)|reject(?:s|ed)?|opposition|oppose[sd]?|curb(?:s|ed)?|suspend(?:s|ed)?|repeal(?:s|ed)?\s+(?:the\s+)?(?:sales tax|incentive|exemption))\b/i;
const SUPPORTIVE = /\b(?:approv(?:e|es|ed|al)|incentive|exempt(?:ion|ions)?|streamlin(?:e|es|ed)|welcome[sd]?|expand(?:s|ed)|fast-track(?:s|ed)?|abatement)\b/i;
const FAVORABLE_TIERS = new Set(['leading', 'favorable']);
const CAUTIOUS_TIERS = new Set(['cautious', 'restrictive', 'unfavorable']);

export const POSTURE_STALE_DAYS = 30;
export const RECONCILIATION_SENTENCE = 'The posture score above was last recorded before the newest items in this record, which point the other way, so read the score as dated rather than current.';

const dayDiff = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);

/**
 * posture_stale: the newest local news item post-dates the posture score by more than 30 days AND the
 * newest items point the other way from the posture tier (favorable tier vs restrictive items, cautious
 * tier vs supportive ones). A Mixed or unscored posture is never flagged.
 */
export function postureStale(jrec, items) {
  if (!jrec?.date) return { stale: false, reason: 'no_posture_date' };
  const tier = String(jrec.tier ?? jrec.text?.join(' ').match(/posture as (\w+)/i)?.[1] ?? '').toLowerCase();
  const favorable = FAVORABLE_TIERS.has(tier);
  const cautious = CAUTIOUS_TIERS.has(tier);
  if (!favorable && !cautious) return { stale: false, reason: 'neutral_or_unknown_tier' };
  const dated = items.filter((it) => it.date && it.ref_kind !== 'record').sort((a, b) => b.date.localeCompare(a.date));
  if (!dated.length) return { stale: false, reason: 'no_events' };
  const newest = dated[0];
  const gap = dayDiff(newest.date, jrec.date);
  if (gap <= POSTURE_STALE_DAYS) return { stale: false, reason: 'within_30_days', gap_days: gap };
  const recent = dated.filter((it) => dayDiff(newest.date, it.date) <= 30).slice(0, 5);
  // Only items that clearly lean one way vote; a queue delta or a posture sentence leans neither.
  const lean = (it) => {
    const blob = decodeEntities(`${it.headline} ${it.text.slice(0, 2).join(' ')}`);
    const r = RESTRICTIVE.test(blob);
    const sup = SUPPORTIVE.test(blob);
    return r === sup ? null : r ? 'restrictive' : 'supportive';
  };
  const voters = recent.map(lean).filter(Boolean);
  const against = voters.filter((l) => (favorable ? l === 'restrictive' : l === 'supportive'));
  const stale = voters.length > 0 && against.length > voters.length / 2;
  return { stale, reason: stale ? 'newest_items_point_the_other_way' : 'newest_items_agree', gap_days: gap, newest_date: newest.date, posture_date: jrec.date, tier };
}
