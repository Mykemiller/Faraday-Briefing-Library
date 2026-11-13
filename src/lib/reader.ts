import type { ReaderFields, SourceRef, SourceRow } from "@/lib/types";
import type { ShelfStatus } from "@/config/constants";

/**
 * BL3-11 (FDY-338): pure helpers for the Reading Room reader. No I/O and no React, so the
 * manuscript preparation, the Sources table and the gating matrix are unit tested directly.
 *
 * Manuscript format (scripts/lanes/compose.mjs, docs/ops/lanes.md §7.2): a leading HTML comment,
 * a `:::cover … :::` block, `## ` sections, a `:::take … :::` block and a closing
 * `## Sources & methodology` section that repeats source_refs as a table plus a ```json
 * source_refs``` block. The reader renders the cover itself (title, byline, dates) and the Sources
 * table from `source_refs`, so those parts of the Markdown are removed here.
 */

/** http/https only (decision 3). Anything else — javascript:, data:, mailto:, relative — is no link. */
export function safeHref(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function refNumber(r: SourceRef, index: number): number {
  if (typeof r.n === "number" && Number.isFinite(r.n) && r.n > 0) return Math.trunc(r.n);
  const m = str(r.ref).match(/(\d+)/);
  return m ? Number(m[1]) : index + 1;
}

/** `briefings.source_refs` jsonb → Sources-table rows, ordered by n. Malformed input ⇒ []. */
export function sourceRows(raw: unknown): SourceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is SourceRef => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r, i) => {
      const href = safeHref(r.url);
      return {
        n: refNumber(r, i),
        title: str(r.title) || (href ? new URL(href).hostname : "Untitled source"),
        publisher: str(r.publisher),
        date: str(r.published_at) || str(r.date),
        href,
      };
    })
    .sort((a, b) => a.n - b.n);
}

/** Reader-row columns → ReaderFields (manuscript blank ⇒ null, which means "fall back"). */
export function toReaderFields(row: {
  manuscript_md: string | null;
  source_refs: unknown;
  last_refreshed: string | null;
  hypothesis: string | null;
} | null): ReaderFields | null {
  if (!row) return null;
  return {
    manuscriptMd: row.manuscript_md && row.manuscript_md.trim() ? row.manuscript_md : null,
    sourceRefs: Array.isArray(row.source_refs) ? (row.source_refs as SourceRef[]) : [],
    lastRefreshed: row.last_refreshed,
    hypothesis: row.hypothesis ?? "",
  };
}

export interface ManuscriptSection {
  heading: string;
  /** The section's Markdown, including its own `## ` heading line. */
  md: string;
}

export interface PreparedManuscript {
  /** Body sections in order (cover removed; Sources & methodology split off). */
  sections: ManuscriptSection[];
  /** Prose from the Sources & methodology section with its table and json block removed. */
  methodology: string;
}

const SOURCES_HEADING = /^sources\b/i;

/**
 * Strip what the reader renders itself, then split on `## ` headings. Fenced code is respected so
 * a `## ` inside a code block never starts a section.
 */
export function prepareManuscript(md: string): PreparedManuscript {
  let text = md.replace(/\r\n?/g, "\n");
  text = text.replace(/<!--[\s\S]*?-->/g, ""); // generator header comments
  text = text.replace(/^:::cover[^\n]*\n[\s\S]*?^:::[ \t]*$/m, ""); // the cover block (page renders it)

  const sections: ManuscriptSection[] = [];
  let current: ManuscriptSection | null = null;
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^:::/.test(line)) continue; // directive fences (`:::take`, closing `:::`)
    const h2 = !inFence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h2) {
      current = { heading: h2[1], md: line };
      sections.push(current);
    } else if (current) {
      current.md += `\n${line}`;
    } else if (line.trim()) {
      // Prose before the first H2 (rare): keep it as an untitled opening section.
      current = { heading: "", md: line };
      sections.push(current);
    }
  }

  const body: ManuscriptSection[] = [];
  let methodology = "";
  for (const s of sections) {
    if (SOURCES_HEADING.test(s.heading)) {
      methodology = s.md
        .replace(/^##[^\n]*\n?/, "")
        .replace(/```json source_refs[\s\S]*?```/g, "")
        .replace(/^\|.*\|[ \t]*$/gm, "") // the Markdown sources table (rendered from source_refs instead)
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else {
      body.push({ heading: s.heading, md: s.md.trim() });
    }
  }
  return { sections: body.filter((s) => s.md), methodology };
}

export type ReaderView =
  | { kind: "unpublished" }
  | { kind: "fallback"; owned: boolean }
  | { kind: "teaser"; hypothesis: string; sections: ManuscriptSection[]; outline: string[] }
  | {
      kind: "full";
      hypothesis: string;
      sections: ManuscriptSection[];
      outline: string[];
      methodology: string;
      sources: SourceRow[];
    };

/**
 * The gating matrix (BL3-11 decision 2 + 4):
 *
 * | status      | manuscript | owner | view        |
 * |-------------|------------|-------|-------------|
 * | Coming Soon | any        | any   | unpublished — no manuscript, no preview |
 * | Available   | null       | any   | fallback    — the existing preview slides, no Sources table |
 * | Available   | present    | yes   | full        — thesis, every section, Sources table |
 * | Available   | present    | no    | teaser      — thesis + first section + Reserve |
 *
 * Only what the view returns is ever rendered, so a non-owner's HTML never carries the rest.
 */
export function readerView(input: {
  status: ShelfStatus;
  owned: boolean;
  reader: ReaderFields | null;
  fallbackHypothesis?: string;
}): ReaderView {
  if (input.status !== "Available") return { kind: "unpublished" };
  const md = input.reader?.manuscriptMd;
  if (!md) return { kind: "fallback", owned: input.owned };
  const prepared = prepareManuscript(md);
  if (prepared.sections.length === 0) return { kind: "fallback", owned: input.owned };
  const hypothesis = (input.reader?.hypothesis || input.fallbackHypothesis || "").trim();
  // The outline ("In this Briefing") lists section headings only — never their text.
  const outline = prepared.sections.map((s) => s.heading).filter(Boolean);
  if (!input.owned) return { kind: "teaser", hypothesis, sections: prepared.sections.slice(0, 1), outline };
  return {
    kind: "full",
    hypothesis,
    sections: prepared.sections,
    outline,
    methodology: prepared.methodology,
    sources: sourceRows(input.reader?.sourceRefs),
  };
}

/** `last_refreshed` (timestamptz) → "Nov 12, 2026", in US Central (timestamps are CT). */
export function refreshedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}
