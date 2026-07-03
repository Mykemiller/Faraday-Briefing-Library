import type { BriefingType, Byline } from "@/config/constants";
import type { CatalogBriefing } from "@/lib/types";

/**
 * Public vocabulary + brand rules (Faraday Brand Bible 4.0 / Briefing Library Brand Bible).
 * The schema speaks Theme/Domain/Subdomain/Company; the UI speaks Theater/Sector/Thread/
 * Key Player. Internal D-codes never render; counts of Theaters/Sectors/Threads never render.
 */

/** Card/room eyebrow per type. */
export const TYPE_EYEBROW: Record<BriefingType, string> = {
  theater: "Theater Briefing",
  sector: "Sector Briefing",
  thread: "Thread Briefing",
  keyplayer: "Key Player Briefing",
  jurisdiction: "Jurisdiction Briefing",
};

/** The Shelf's fixed group order, with headers + notes (README §Result groups). */
export const SHELF_GROUPS: { type: BriefingType; label: string; note: string }[] = [
  { type: "theater", label: "Theater Briefings", note: "The strategic arenas of the buildout" },
  { type: "sector", label: "Sector Briefings", note: "Analyst coverage areas inside each Theater" },
  { type: "thread", label: "Thread Briefings", note: "Persistent storylines, followed Signal by Signal" },
  { type: "keyplayer", label: "Key Player Briefings", note: "The companies that move the market" },
  { type: "jurisdiction", label: "Jurisdiction Briefings", note: "The rules of the ground, read closely" },
];

/** Type chips: All / Theater / Sector / Thread / Key Player → library_search p_type. */
export const TYPE_CHIPS: { key: BriefingType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "theater", label: "Theater" },
  { key: "sector", label: "Sector" },
  { key: "thread", label: "Thread" },
  { key: "keyplayer", label: "Key Player" },
];

/** Byline brand rule: Gilbert — empirical; Mach — forward thesis. */
export function bylineLine(byline: Byline): string {
  return byline === "Mach" ? "Byline · Mach — forward thesis" : "Byline · Gilbert — empirical";
}

/** Typographic-cover gradient token by type/status (tailwind backgroundImage tokens). */
export function coverBgClass(b: Pick<CatalogBriefing, "briefingType" | "status">): string {
  if (b.status === "Coming Soon") return "bg-cover-soon";
  switch (b.briefingType) {
    case "theater":
      return "bg-cover-theater";
    case "thread":
      return "bg-cover-thread";
    case "keyplayer":
      return "bg-cover-keyplayer";
    default:
      return "bg-cover-sector"; // sector + jurisdiction share the sector treatment
  }
}

/** "June 2026" from an ISO go_live_date; null-safe. */
export function monthYear(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Masthead right slot, e.g. "July 2026 · Shelf Edition". */
export function shelfEdition(now = new Date()): string {
  return `${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })} · Shelf Edition`;
}
