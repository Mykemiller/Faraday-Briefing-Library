import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareManuscript, readerView, refreshedOn, safeHref, sourceRows, toReaderFields } from "@/lib/reader";
import { Manuscript, readerUrlTransform } from "@/components/Manuscript";
import { SourcesTable } from "@/components/SourcesTable";
import type { ReaderFields } from "@/lib/types";
import { MANUSCRIPT, SOURCE_REFS } from "./fixtures/reader-fixture";

const html = (md: string) => renderToStaticMarkup(createElement(Manuscript, { markdown: md }));

describe("BL3-11 markdown sanitisation (react-markdown + remark-gfm, no rehype-raw)", () => {
  it("drops raw HTML entirely: no <script>, no <img onerror>, no escaped tag text", () => {
    const out = html('Before.\n\n<script>alert("x")</script>\n\n<img src="x" onerror="alert(1)">\n\n<div onclick="x()">hi</div>\n\nAfter.');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/&lt;script/i);
    expect(out).toContain("Before.");
    expect(out).toContain("After.");
  });

  it("keeps only http/https links (javascript:/data: neutralised) with rel=noopener noreferrer", () => {
    const out = html("[bad](javascript:alert(1)) [data](data:text/html,x) [good](https://example.com/a) [anchor](#source-1)");
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:text/i);
    expect(out).toContain('href="https://example.com/a"');
    expect(out).toMatch(/href="https:\/\/example.com\/a"[^>]*rel="noopener noreferrer"/);
    expect(out).toContain('href="#source-1"');
    expect(readerUrlTransform("javascript:alert(1)", "href")).toBe("");
    expect(readerUrlTransform("https://x.example/p", "src")).toBe("https://x.example/p");
  });

  it("renders GFM tables", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain("<table");
    expect(out).toContain("<td");
  });

  it("safeHref accepts http/https only", () => {
    expect(safeHref("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHref("http://a.example/")).toBe("http://a.example/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "mailto:a@b.c", "/relative", "", null, 42]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe("BL3-11 manuscript preparation", () => {
  it("removes the header comment, the cover block and directive fences; splits on H2", () => {
    const p = prepareManuscript(MANUSCRIPT);
    expect(p.sections.map((s) => s.heading)).toEqual(["The argument", "Supply position", "Faraday's Take"]);
    const all = p.sections.map((s) => s.md).join("\n");
    expect(all).not.toContain("Cover sentence");
    expect(all).not.toContain("briefing-lane-runner");
    expect(all).not.toMatch(/^:::/m);
    expect(all).toContain("TAKE-MARKER");
  });

  it("splits Sources & methodology off: its table and json block go, its prose stays", () => {
    const p = prepareManuscript(MANUSCRIPT);
    expect(p.methodology).toContain("**Method.**");
    expect(p.methodology).not.toContain("| Ref |");
    expect(p.methodology).not.toContain("json source_refs");
  });

  it("ignores ## inside fenced code", () => {
    const p = prepareManuscript("## One\n\n```\n## not a heading\n```\n\n## Two\n\nx");
    expect(p.sections.map((s) => s.heading)).toEqual(["One", "Two"]);
  });
});

describe("BL3-11 Sources table rows (from source_refs)", () => {
  it("maps n, title, publisher, date, link — ordered by n, link http/https only", () => {
    const rows = sourceRows(SOURCE_REFS);
    expect(rows).toEqual([
      { n: 1, title: "Restructuring filing", publisher: "SEC", date: "2026-09-01", href: "https://example.com/filing" },
      { n: 2, title: "Capacity update", publisher: "Trade Press", date: "2026-10-01", href: "https://example.org/capacity" },
      { n: 3, title: "Hostile link", publisher: "Nowhere", date: "2026-08-01", href: null },
    ]);
  });

  it("tolerates malformed jsonb", () => {
    expect(sourceRows(null)).toEqual([]);
    expect(sourceRows("x")).toEqual([]);
    expect(sourceRows([null, 3, { url: "https://h.example/p" }])).toEqual([
      { n: 1, title: "h.example", publisher: "", date: "", href: "https://h.example/p" },
    ]);
  });

  it("renders one row per source with rel=noopener noreferrer links and no hostile href", () => {
    const out = renderToStaticMarkup(createElement(SourcesTable, { rows: sourceRows(SOURCE_REFS) }));
    expect(out.match(/<tr id="source-/g)?.length).toBe(3);
    expect(out.match(/rel="noopener noreferrer"/g)?.length).toBe(2);
    expect(out).not.toMatch(/javascript:/i);
    for (const h of ["n", "Title", "Publisher", "Date", "Link"]) expect(out).toContain(`>${h}</th>`);
  });
});

describe("BL3-11 gating matrix", () => {
  const reader: ReaderFields = toReaderFields({
    manuscript_md: MANUSCRIPT,
    source_refs: SOURCE_REFS,
    last_refreshed: "2026-11-12T15:30:00Z",
    hypothesis: "The thesis.",
  })!;
  const noMs: ReaderFields = { ...reader, manuscriptMd: null };

  it("Coming Soon → unpublished, owner or not, manuscript or not", () => {
    for (const owned of [true, false]) {
      for (const r of [reader, noMs, null]) {
        expect(readerView({ status: "Coming Soon", owned, reader: r }).kind).toBe("unpublished");
      }
    }
  });

  it("Available + owner → full: thesis, every section, sources", () => {
    const v = readerView({ status: "Available", owned: true, reader });
    expect(v.kind).toBe("full");
    if (v.kind !== "full") return;
    expect(v.hypothesis).toBe("The thesis.");
    expect(v.sections).toHaveLength(3);
    expect(v.sources).toHaveLength(3);
    expect(v.outline).toEqual(["The argument", "Supply position", "Faraday's Take"]);
  });

  it("Available + non-owner → teaser: thesis + first section only (no Take, no sources)", () => {
    const v = readerView({ status: "Available", owned: false, reader });
    expect(v.kind).toBe("teaser");
    if (v.kind !== "teaser") return;
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0].heading).toBe("The argument");
    const text = v.sections.map((s) => s.md).join("\n");
    expect(text).not.toContain("SECOND-SECTION-MARKER");
    expect(text).not.toContain("TAKE-MARKER");
    expect("sources" in v).toBe(false);
  });

  it("missing manuscript_md (null, blank, or no sections) falls back to the preview", () => {
    for (const owned of [true, false]) {
      expect(readerView({ status: "Available", owned, reader: noMs }).kind).toBe("fallback");
      expect(readerView({ status: "Available", owned, reader: null }).kind).toBe("fallback");
      const blank = toReaderFields({ manuscript_md: "   ", source_refs: [], last_refreshed: null, hypothesis: null });
      expect(readerView({ status: "Available", owned, reader: blank }).kind).toBe("fallback");
      const coverOnly = { ...reader, manuscriptMd: ":::cover\n# T\n:::\n" };
      expect(readerView({ status: "Available", owned, reader: coverOnly }).kind).toBe("fallback");
    }
  });

  it("the thesis falls back to the shelf hypothesis when the reader row has none", () => {
    const v = readerView({ status: "Available", owned: false, reader: { ...reader, hypothesis: "" }, fallbackHypothesis: "Shelf thesis." });
    expect(v.kind === "teaser" && v.hypothesis).toBe("Shelf thesis.");
  });

  it("last_refreshed renders as a US Central date", () => {
    expect(refreshedOn("2026-11-13T03:00:00Z")).toBe("Nov 12, 2026"); // 21:00 CT on the 12th
    expect(refreshedOn(null)).toBe("");
    expect(refreshedOn("not a date")).toBe("");
  });
});
