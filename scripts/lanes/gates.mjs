// BL3-05 (FDY-329): pre-draft gates and Profile-lane ranking for the lane runner.
//
// A pre-draft gate looks at a brief's built EvidencePack (evidence.mjs buildPack) BEFORE anything is
// composed, rendered or staged, and decides whether the brief is drafted at all. run.mjs calls ONE
// function, preDraftGate(lane, pack) → { ok, reason, n? }; it is a small dispatcher by lane so other
// gates (FDY-332's threadGate for the subdomains lane) slot in beside profileGate.
//
// Profile floor (Myke's decision (b)): a company/institution Profile whose pack holds fewer than
// PROFILE_THIN_BELOW (6) sourced Signals is SKIPPED — no draft, no briefings_versions row, no
// briefing_reviews row. Exactly 6 stages.
//
// Ranking (never id order):
//   companies    → company_signal_rollup.mentions_30d desc, artifact_count desc, title; companies
//                  missing from the rollup come after every ranked one (by artifact_count, then title);
//   institutions → one grouped count of sourced Signals over ALL eligible institution Profiles,
//                  count desc (title, then id, break ties).

import * as evidence from './evidence.mjs';
import { PROFILE_THIN_BELOW } from './compose.mjs';

export const PROFILE_FLOOR = PROFILE_THIN_BELOW;
/** Lanes whose briefs pass through preDraftGate() (and so need their pack before drafting). */
export const GATED_LANES = Object.freeze(['companies', 'institutions']);
/** Lanes that rank by density and keep cursor.skipped (BL3-05). */
export const PROFILE_LANES = Object.freeze(['companies', 'institutions']);
export const isProfileLane = (lane) => PROFILE_LANES.includes(lane);
export const isGatedLane = (lane) => GATED_LANES.includes(lane);

/** Evidence-pack budget per run: stop after FETCH_FACTOR × quota packs even if the quota is unmet. */
export const FETCH_FACTOR = 10;
/** A cursor.skipped entry is re-checked once it is older than this. */
export const SKIP_RECHECK_DAYS = 7;
/** The run-summary wording for a Profile skipped below the floor. */
export const THIN_SKIP = `skipped: thin (n<${PROFILE_FLOOR})`;

// ---------------------------------------------------------------------------------------------
// Sourced Signal
// ---------------------------------------------------------------------------------------------

const PLACEHOLDER_URL = /^https?:\/\/(?:www\.)?faraday\.ai\/records\//i;
const NOT_A_PUBLISHER = /^(?:google news(?: search)?\b|source$)/i;

/**
 * Local stand-in until FDY-330 lands evidence.mjs `isCitableSource(item)`.
 * TODO(FDY-330): delete this fallback once evidence.mjs exports isCitableSource (the export below
 * already prefers it when present).
 * Citable = a real absolute http(s) URL that is not the placeholder minted for identity records, and
 * a real publisher name (not empty, not the generic "Source" fallback, not a Google News feed label).
 */
export function localIsCitableSource(item) {
  const url = String(item?.url ?? item?.source_url ?? '').trim();
  if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url) || PLACEHOLDER_URL.test(url)) return false;
  const name = String(item?.publisher ?? item?.source_name ?? '').trim();
  return name.length > 0 && !NOT_A_PUBLISHER.test(name);
}

/** evidence.mjs's isCitableSource when it exists (FDY-330), else the local fallback above. */
export const isCitableSource = typeof evidence.isCitableSource === 'function' ? evidence.isCitableSource : localIsCitableSource;

/**
 * A sourced Signal: a public.signals item of the pack with a source_url and a source name (the
 * pack's `url` and `publisher`) that also passes isCitableSource(item). Identity records and
 * artifacts are not Signals.
 */
export function isSourcedSignal(item) {
  if (!item || item.ref_kind !== 'signal') return false;
  if (!String(item.url ?? '').trim() || !String(item.publisher ?? '').trim()) return false;
  // Pack items carry the outlet as both `publisher` and `source_name` (evidence.mjs); FDY-330's
  // isCitableSource reads `source_name`, so name it from `publisher` when only that is present.
  const url = String(item.url).trim();
  if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url) || PLACEHOLDER_URL.test(url)) return false; // absolute http(s) only; never the identity-record placeholder
  return Boolean(isCitableSource(item.source_name ? item : { ...item, source_name: item.publisher }));
}

export function countSourcedSignals(pack) {
  return (pack?.items ?? []).filter(isSourcedSignal).length;
}

// ---------------------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------------------

/** Profile floor: { ok, reason, n }. 5 sourced Signals ⇒ not ok; 6 ⇒ ok. */
export function profileGate(pack) {
  const n = countSourcedSignals(pack);
  return n >= PROFILE_FLOOR ? { ok: true, reason: null, n } : { ok: false, reason: THIN_SKIP, n };
}

/** The one pre-draft gate run.mjs calls. Lanes without a gate always pass. */
export function preDraftGate(lane, pack) {
  switch (lane) {
    case 'companies':
    case 'institutions':
      return profileGate(pack);
    default:
      return { ok: true, reason: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------

const byTitleThenId = (a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Companies: rollup rows first (mentions_30d desc, artifact_count desc, title); a company missing from
 * the rollup (no row, or no mentions_30d) comes after every ranked one, by artifact_count desc then title.
 * @param {any[]} rows eligible companies-lane briefings
 * @param {Map<string, {mentions_30d?: number|null, artifact_count?: number|null}>} rollup company_uid → row
 */
export function rankCompanies(rows, rollup = new Map()) {
  const r = (b) => rollup.get(b.company_id) ?? null;
  const ranked = (b) => r(b) != null && r(b).mentions_30d != null;
  const art = (b) => Number(r(b)?.artifact_count ?? b.artifact_count ?? 0);
  return [...rows].sort((a, b) => {
    const ra = ranked(a);
    const rb = ranked(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) {
      const d = Number(r(b).mentions_30d) - Number(r(a).mentions_30d);
      if (d) return d;
    }
    return art(b) - art(a) || byTitleThenId(a, b);
  });
}

/**
 * Institutions: rank by the grouped sourced-Signal count, desc; title then id break ties.
 * @param {any[]} rows eligible institutions-lane briefings
 * @param {Map<string, number>} counts briefing id → grouped sourced-Signal count
 */
export function rankInstitutions(rows, counts = new Map()) {
  return [...rows].sort((a, b) => Number(counts.get(b.id) ?? 0) - Number(counts.get(a.id) ?? 0) || byTitleThenId(a, b));
}

/**
 * One grouped count of sourced Signals over all eligible institution Profiles. `signals` are raw
 * public.signals rows (each with its `artifact` envelope, as evidence.mjs fetches them) tagged with
 * any of the institutions' company_uids; each brief's subset is normalised by the same buildPack()
 * the generator uses, so the count matches what profileGate() will see (before the per-pack limit).
 * @param {any[]} briefs institution briefings
 * @param {Map<string, string>} uidByInstitution institution_uid → company_uid
 * @param {any[]} signals raw signals with `.artifact`
 * @param {Date} now
 * @returns {Map<string, number>} briefing id → count
 */
export function groupedInstitutionCounts(briefs, uidByInstitution, signals, now = new Date()) {
  const byUid = new Map();
  for (const g of signals ?? []) {
    for (const uid of Array.isArray(g.company_tags) ? g.company_tags : []) {
      if (!byUid.has(uid)) byUid.set(uid, []);
      byUid.get(uid).push(g);
    }
  }
  const counts = new Map();
  for (const b of briefs) {
    const uid = uidByInstitution.get(b.institution_id);
    const mine = uid ? byUid.get(uid) ?? [] : [];
    const pack = evidence.buildPack({ signals: mine, companies: [] }, b, evidence.evidenceWindow(b, now));
    counts.set(b.id, countSourcedSignals(pack));
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// cursor.skipped  ([{ id, n, checked_at }], merged into briefing_lanes.cursor — never replacing it)
// ---------------------------------------------------------------------------------------------

export function readSkipped(cursor) {
  const list = Array.isArray(cursor?.skipped) ? cursor.skipped : [];
  return list.filter((e) => e && e.id != null).map((e) => ({ id: String(e.id), n: Number(e.n ?? 0), checked_at: e.checked_at ?? null }));
}

/** Entries checked within SKIP_RECHECK_DAYS of `now`; older ones are due for a re-check. */
export function freshSkipped(skipped, now = new Date(), days = SKIP_RECHECK_DAYS) {
  const cutoff = now.getTime() - days * 86400000;
  return skipped.filter((e) => e.checked_at && new Date(e.checked_at).getTime() > cutoff);
}

/** Upsert one entry (by id) and return the new list. */
export function upsertSkipped(skipped, entry) {
  return [...skipped.filter((e) => e.id !== String(entry.id)), { id: String(entry.id), n: entry.n, checked_at: entry.checked_at }];
}

/** Remove an id (a re-checked subject that now clears the floor). */
export const dropSkipped = (skipped, id) => skipped.filter((e) => e.id !== String(id));
