// Build step: turn the BL-11 licence register into the storefront's entity table.
//
// Inputs (repo root, read-only):
//   docs/assets/sources.csv        source_id, name, entity_type, tier
//   docs/assets/logo-register.csv  source_id, ..., status (approved | excluded), ...
//   assets/logos/<source_id>.svg|png  approved logo files only
//
// Output: src/generated/entities.json  { [source_id]: { name, logo } }
//   logo is set ONLY when the register row is `approved` AND the file exists.
//   Every other source renders as its text name. Approved logos are copied to public/logos/.
//
// The build fails if either CSV is missing, so a broken register can never silently
// fall back to "show everything".
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const out = resolve(here, "..", "src", "generated", "entities.json");
const publicLogos = resolve(here, "..", "public", "logos");

/** RFC 4180 CSV parser (quoted fields, doubled quotes, embedded newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new Error(`sync-entity-register: missing ${rel}`);
  return readFileSync(p, "utf8");
}

const sources = parseCsv(read("docs/assets/sources.csv"));
const register = new Map(parseCsv(read("docs/assets/logo-register.csv")).map((r) => [r.source_id, r]));

rmSync(publicLogos, { recursive: true, force: true });
const entities = {};
let cleared = 0;
for (const s of sources) {
  if (!s.source_id) continue;
  const reg = register.get(s.source_id);
  let logo = null;
  if (reg && reg.status === "approved") {
    for (const ext of ["svg", "png"]) {
      const file = join(root, "assets", "logos", `${s.source_id}.${ext}`);
      if (existsSync(file)) {
        mkdirSync(publicLogos, { recursive: true });
        copyFileSync(file, join(publicLogos, `${s.source_id}.${ext}`));
        logo = `/logos/${s.source_id}.${ext}`;
        cleared++;
        break;
      }
    }
  }
  entities[s.source_id] = { name: s.name, logo };
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(entities, null, 2) + "\n");
console.log(`sync-entity-register: ${Object.keys(entities).length} sources, ${cleared} cleared logos`);
