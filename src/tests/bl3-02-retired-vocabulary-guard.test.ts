import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * BL3-02 (FDY-334) regression guard: the retired fourth briefing type's label/key must not appear
 * anywhere under src/ or storefront/src. Only this file is allow-listed (decision 4).
 */
const PATTERN = /key[ _-]?player/i;
const ROOTS = ["src", "storefront/src"];
const SELF = "src/tests/bl3-02-retired-vocabulary-guard.test.ts";
const SKIP_DIRS = new Set(["node_modules", ".next"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

describe("BL3-02 retired fourth-type vocabulary guard", () => {
  it("finds no match in src/ or storefront/src outside this file", () => {
    const root = resolve(".");
    const hits: string[] = [];
    for (const r of ROOTS) {
      for (const f of walk(join(root, r))) {
        const rel = relative(root, f).split("\\").join("/");
        if (rel === SELF) continue;
        readFileSync(f, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (PATTERN.test(line)) hits.push(`${rel}:${i + 1}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it("the pattern catches every spelling it is meant to", () => {
    for (const s of ["key" + "player", "Key" + " Player", "KEY" + "_PLAYER", "key" + "-players"]) expect(PATTERN.test(s)).toBe(true);
    expect(PATTERN.test("Theater")).toBe(false);
  });
});
