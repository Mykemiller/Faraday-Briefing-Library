/**
 * BL-04 (FDY-170, absorbs FDY-160 + FDY-162): migrate the Airtable Briefing Library into
 * `public.briefings` (BL-03 schema).
 *
 * Usage (Node >= 22.6):
 *   node --experimental-strip-types scripts/migrate-briefings.ts [flags]
 *
 * Flags
 *   --source <file>        Airtable snapshot (REST shape `{records:[{id,fields{<name>}}]}`).
 *                          Omit to read Airtable live (needs AIRTABLE_API_KEY; read-only GET).
 *   --registry <file>      Registry snapshot (default docs/migration/registry-snapshot-2026-10-13.json).
 *   --target <t>           none | pglite:<dataDir> | supabase:<https://<ref>.supabase.co>
 *                          supabase: needs SUPABASE_SERVICE_ROLE_KEY for that project.
 *   --prepare-local        pglite only: create roles, stub parent tables holding ONLY the real
 *                          parent keys this load references, and apply the BL-03 migration.
 *   --dry-run              Resolve and report; write nothing to the target.
 *   --upload-attachments   Upload Airtable attachments to the private Storage bucket
 *                          `briefing-attachments` on the supabase: target. OFF by default.
 *   --out-dir <dir>        Where reports go (default docs/migration).
 *
 * Safety
 *   - Airtable is only ever read (GET).
 *   - The production project (ycadmmngkdhvpcsrcuaq) is refused unless BL04_ALLOW_PRODUCTION=1,
 *     which needs Myke's explicit approval after the PR merges. Not set by BL-04.
 *   - Idempotent: upsert on `airtable_record_id`; a row is only rewritten when a mapped value
 *     changed (`IS DISTINCT FROM`), so re-runs do not bump `updated_at`.
 *   - Linked records are resolved by key only. Anything that does not resolve is written to
 *     unmatched-links.csv; nothing is guessed.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

export const AIRTABLE_BASE_ID = "appxfti7VuoHYUeu6";
export const AIRTABLE_TABLE_ID = "tbl4kbby85nx6Z891";
export const PRODUCTION_REF = "ycadmmngkdhvpcsrcuaq";
export const ATTACHMENT_BUCKET = "briefing-attachments";

/** Airtable field names (REST API keys records by name). IDs in docs/migration/airtable-field-map.md. */
export const F = {
  title: "Briefing Title",
  briefingId: "Briefing Id",
  description: "Briefing description",
  status: "Status",
  gammaUrl: "Gamma URL",
  gammaId: "Gamma ID",
  attachments: "Attachments",
  downloadCounter: "Download counter",
  canonicalFlag: "Canonical flag",
  goLiveDate: "Go live Date",
  idfDomain: "IDF Domain",
  idfSubdomain: "IDF Subdomain",
  trackingCompanies: "Tracking Companies",
  idfTheme: "IDF Theme",
} as const;

export type BriefingStatus = "planned" | "draft" | "qa" | "published" | "retired";

/** Status map (FDY-170 step 3). Unknown values throw: a status is never guessed. */
export const STATUS_MAP: Record<string, BriefingStatus> = {
  Live: "published",
  Draft: "draft",
  "Coming Soon": "planned",
  Retired: "retired",
};

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface AirtableAttachment {
  id: string;
  filename: string;
  size?: number;
  type?: string;
  url: string;
}

export interface SourceRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
}

export interface Registry {
  airtable: {
    domainRegistry: Record<string, { name: string; domainId: string }>;
    subdomainRegistry: Record<string, string>;
    themeRegistry: Record<string, string>;
    trackingCompanies: Record<string, string>;
  };
  supabase: {
    companiesByAirtableRecordId: Record<string, string>;
    faradayDomains: Record<string, { name: string; active: boolean }>;
    faradaySubdomains: Record<string, { name: string; active: boolean; domain: string }>;
    faradayThemes: Record<string, { name: string; active: boolean }>;
  };
  /** BL-07 reviewed title→sub-domain matches, keyed by Briefing Library record id. */
  bl07ReviewedSubdomainMatches: Record<string, string>;
}

export interface BriefingRow {
  airtable_record_id: string;
  title: string;
  status: BriefingStatus;
  tier: null;
  page_target: null;
  sector_id: string | null;
  thread_id: string | null;
  theme_tags: string[];
  source_refs: null;
  institution_id: null;
  company_id: string | null;
  published_at: string | null;
}

export type UnmatchedReason =
  | "no_registry_row"
  | "no_exact_name_match"
  | "multiple_links_single_column"
  | "registry_row_inactive";

export interface UnmatchedLink {
  airtable_record_id: string;
  briefing_title: string;
  airtable_status: string;
  link_field: string;
  linked_record_id: string;
  linked_record_name: string;
  target_table: string;
  reason: UnmatchedReason;
  resolved_key: string;
  note: string;
}

export interface AttachmentInventoryRow {
  airtable_record_id: string;
  attachment_id: string;
  filename: string;
  size: number | "";
  type: string;
  source_host: string;
}

export interface ResolvedRecord {
  row: BriefingRow;
  unmatched: UnmatchedLink[];
  attachments: AttachmentInventoryRow[];
  /** Columns FDY-170 can read from Airtable but BL-03 has nowhere to put (see field map). */
  unmappedValues: { description: string | null; gammaUrl: string | null; gammaId: string | null; canonicalFlag: string | null; briefingId: number | null };
  resolution: { company: string; thread: string; sector: string; themes: string };
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

export function mapStatus(airtableStatus: unknown): BriefingStatus {
  const s = typeof airtableStatus === "string" ? airtableStatus : (airtableStatus as { name?: string } | null)?.name;
  if (!s || !(s in STATUS_MAP)) throw new Error(`Unknown Airtable status: ${JSON.stringify(airtableStatus)}`);
  return STATUS_MAP[s];
}

/** Link cells: REST API returns record ids; the Airtable MCP returns {id,name}. Accept both. */
export function linkIds(cell: unknown): string[] {
  if (!Array.isArray(cell)) return [];
  return cell
    .map((c) => (typeof c === "string" ? c : (c as { id?: string })?.id))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

const norm = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

function hostOnly(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Resolve one Airtable record into a `briefings` row plus every link that did not resolve. */
export function resolveRecord(rec: SourceRecord, reg: Registry): ResolvedRecord {
  const f = rec.fields;
  const title = String(f[F.title] ?? "").trim();
  const statusRaw = typeof f[F.status] === "string" ? (f[F.status] as string) : (f[F.status] as { name?: string })?.name ?? "";
  const status = mapStatus(statusRaw);
  const unmatched: UnmatchedLink[] = [];
  const base = { airtable_record_id: rec.id, briefing_title: title, airtable_status: statusRaw };
  const miss = (link_field: string, id: string, name: string, target_table: string, reason: UnmatchedReason, resolved_key = "", note = "") =>
    unmatched.push({ ...base, link_field, linked_record_id: id, linked_record_name: name, target_table, reason, resolved_key, note });

  // Tracking Companies -> companies.company_uid via companies.airtable_record_id (exact key join).
  const companyLinks = linkIds(f[F.trackingCompanies]);
  const companyHits: { id: string; uid: string }[] = [];
  for (const id of companyLinks) {
    const uid = reg.supabase.companiesByAirtableRecordId[id];
    const name = reg.airtable.trackingCompanies[id] ?? "";
    if (uid) companyHits.push({ id, uid });
    else miss(F.trackingCompanies, id, name, "companies", "no_registry_row", "", "no companies row carries this airtable_record_id");
  }
  let company_id: string | null = null;
  let companyRes = companyLinks.length ? "unresolved" : "no_link";
  const distinctCompanies = [...new Set(companyHits.map((h) => h.uid))];
  if (distinctCompanies.length === 1) {
    company_id = distinctCompanies[0];
    companyRes = "airtable_record_id";
  } else if (distinctCompanies.length > 1) {
    companyRes = "multiple";
    for (const h of companyHits)
      miss(F.trackingCompanies, h.id, reg.airtable.trackingCompanies[h.id] ?? "", "companies", "multiple_links_single_column", h.uid,
        "briefings.company_id holds one company; this record links several. Left NULL, not chosen.");
  }

  // IDF Subdomain -> faraday_subdomains.subdomain_code.
  // The retired Airtable Sub-Domain Registry has no code field, so the key is the name:
  // (1) exact (normalised) display_name match; else (2) BL-07's hand-reviewed title match for this
  // briefing record, accepted only when the linked registry name equals the title's sub-domain part.
  const sdLinks = linkIds(f[F.idfSubdomain]);
  const sdHits: { id: string; code: string; method: string }[] = [];
  const byName = new Map<string, string>();
  for (const [code, s] of Object.entries(reg.supabase.faradaySubdomains)) byName.set(norm(s.name), code);
  for (const id of sdLinks) {
    const name = reg.airtable.subdomainRegistry[id] ?? "";
    const exact = byName.get(norm(name));
    const bl07 = reg.bl07ReviewedSubdomainMatches[rec.id];
    const titleSuffix = title.includes("—") ? title.split("—").slice(1).join("—").trim() : "";
    if (exact) {
      if (!reg.supabase.faradaySubdomains[exact].active)
        miss(F.idfSubdomain, id, name, "faraday_subdomains", "registry_row_inactive", exact, "matching sub-domain is inactive");
      else sdHits.push({ id, code: exact, method: "exact_name" });
    } else if (bl07 && norm(titleSuffix) === norm(name) && reg.supabase.faradaySubdomains[bl07]?.active) {
      sdHits.push({ id, code: bl07, method: "bl07_reviewed" });
    } else {
      miss(F.idfSubdomain, id, name, "faraday_subdomains", "no_exact_name_match", "",
        "retired registry has no code field; name has no exact match and no BL-07 reviewed match");
    }
  }
  let thread_id: string | null = null;
  let threadRes = sdLinks.length ? "unresolved" : "no_link";
  const distinctSd = [...new Set(sdHits.map((h) => h.code))];
  if (distinctSd.length === 1) {
    thread_id = distinctSd[0];
    threadRes = sdHits[0].method;
  } else if (distinctSd.length > 1) {
    threadRes = "multiple";
    for (const h of sdHits)
      miss(F.idfSubdomain, h.id, reg.airtable.subdomainRegistry[h.id] ?? "", "faraday_subdomains", "multiple_links_single_column", h.code,
        "briefings.thread_id holds one sub-domain. Left NULL, not chosen.");
  }

  // IDF Domain -> faraday_domains.domain_code via the retired registry's own "Domain ID" field.
  const domLinks = linkIds(f[F.idfDomain]);
  const domHits: { id: string; code: string }[] = [];
  for (const id of domLinks) {
    const r = reg.airtable.domainRegistry[id];
    const code = r?.domainId ?? "";
    if (code && reg.supabase.faradayDomains[code]) domHits.push({ id, code });
    else miss(F.idfDomain, id, r?.name ?? "", "faraday_domains", "no_registry_row", "", "Domain ID missing or not in faraday_domains");
  }
  let sector_id: string | null = null;
  let sectorRes = domLinks.length ? "unresolved" : "no_link";
  const distinctDom = [...new Set(domHits.map((h) => h.code))];
  if (distinctDom.length === 1) {
    sector_id = distinctDom[0];
    sectorRes = "domain_id";
  } else if (distinctDom.length > 1) {
    sectorRes = "multiple";
    for (const h of domHits)
      miss(F.idfDomain, h.id, reg.airtable.domainRegistry[h.id]?.name ?? "", "faraday_domains", "multiple_links_single_column", h.code,
        "briefings.sector_id holds one domain. Left NULL, not chosen.");
  }

  // IDF Theme -> theme_tags (faraday_themes.theme_code). Retired registry has no code: exact name.
  const themeLinks = linkIds(f[F.idfTheme]);
  const themeByName = new Map<string, string>();
  for (const [code, t] of Object.entries(reg.supabase.faradayThemes)) themeByName.set(norm(t.name), code);
  const theme_tags: string[] = [];
  for (const id of themeLinks) {
    const name = reg.airtable.themeRegistry[id] ?? "";
    const code = themeByName.get(norm(name));
    if (code) {
      if (!theme_tags.includes(code)) theme_tags.push(code);
    } else miss(F.idfTheme, id, name, "faraday_themes", "no_exact_name_match", "", "no faraday_themes row with this exact name");
  }
  theme_tags.sort();

  // Attachments: inventory only here. Host recorded, never the (signed, expiring) URL.
  const atts = (Array.isArray(f[F.attachments]) ? (f[F.attachments] as AirtableAttachment[]) : []).map((a) => ({
    airtable_record_id: rec.id,
    attachment_id: a.id,
    filename: a.filename,
    size: typeof a.size === "number" ? a.size : ("" as const),
    type: a.type ?? "",
    source_host: hostOnly(a.url),
  }));

  const goLive = typeof f[F.goLiveDate] === "string" ? (f[F.goLiveDate] as string) : null;
  const row: BriefingRow = {
    airtable_record_id: rec.id,
    title,
    status,
    tier: null,
    page_target: null,
    sector_id,
    thread_id,
    theme_tags,
    source_refs: null,
    institution_id: null,
    company_id,
    // published_at is only meaningful for published rows (0 today).
    published_at: status === "published" && goLive ? `${goLive}T00:00:00Z` : null,
  };

  return {
    row,
    unmatched,
    attachments: atts,
    unmappedValues: {
      description: typeof f[F.description] === "string" ? (f[F.description] as string) : null,
      gammaUrl: typeof f[F.gammaUrl] === "string" ? (f[F.gammaUrl] as string) : null,
      gammaId: typeof f[F.gammaId] === "string" ? (f[F.gammaId] as string) : null,
      canonicalFlag: typeof f[F.canonicalFlag] === "string" ? (f[F.canonicalFlag] as string) : null,
      briefingId: typeof f[F.briefingId] === "number" ? (f[F.briefingId] as number) : null,
    },
    resolution: { company: companyRes, thread: threadRes, sector: sectorRes, themes: themeLinks.length ? `${theme_tags.length}/${themeLinks.length}` : "no_link" },
  };
}

/** The guard a `published` row must pass (BL-03 CHECK). Reported before any write. */
export function violatesPublishedGuard(r: BriefingRow): boolean {
  return r.status === "published" && (r.source_refs == null);
}

export function csv(rows: object[], header: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(","), ...rows.map((r) => header.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\n") + "\n";
}

export const UPSERT_SQL = `
insert into public.briefings
  (airtable_record_id, title, status, tier, page_target, sector_id, thread_id, theme_tags,
   source_refs, institution_id, company_id, published_at)
values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10, $11, $12::timestamptz)
on conflict (airtable_record_id) do update set
  title = excluded.title, status = excluded.status, tier = excluded.tier,
  page_target = excluded.page_target, sector_id = excluded.sector_id,
  thread_id = excluded.thread_id, theme_tags = excluded.theme_tags,
  source_refs = excluded.source_refs, institution_id = excluded.institution_id,
  company_id = excluded.company_id, published_at = excluded.published_at
where (briefings.title, briefings.status, briefings.tier, briefings.page_target, briefings.sector_id,
       briefings.thread_id, briefings.theme_tags, briefings.source_refs, briefings.institution_id,
       briefings.company_id, briefings.published_at)
  is distinct from
      (excluded.title, excluded.status, excluded.tier, excluded.page_target, excluded.sector_id,
       excluded.thread_id, excluded.theme_tags, excluded.source_refs, excluded.institution_id,
       excluded.company_id, excluded.published_at)
returning (xmax = 0) as inserted`;

export function upsertParams(r: BriefingRow): unknown[] {
  return [r.airtable_record_id, r.title, r.status, r.tier, r.page_target, r.sector_id, r.thread_id,
    r.theme_tags, r.source_refs == null ? null : JSON.stringify(r.source_refs), r.institution_id, r.company_id, r.published_at];
}

// ---------------------------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------------------------

interface Args {
  source?: string;
  registry: string;
  target: string;
  prepareLocal: boolean;
  dryRun: boolean;
  uploadAttachments: boolean;
  outDir: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): Args {
  const a: Args = {
    registry: join(ROOT, "docs/migration/registry-snapshot-2026-10-13.json"),
    target: "none",
    prepareLocal: false,
    dryRun: false,
    uploadAttachments: false,
    outDir: join(ROOT, "docs/migration"),
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (!x) throw new Error(`${k} needs a value`);
      return x;
    };
    if (k === "--source") a.source = v();
    else if (k === "--registry") a.registry = v();
    else if (k === "--target") a.target = v();
    else if (k === "--prepare-local") a.prepareLocal = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--upload-attachments") a.uploadAttachments = true;
    else if (k === "--out-dir") a.outDir = v();
    else throw new Error(`Unknown flag ${k}`);
  }
  return a;
}

async function readAirtableLive(): Promise<SourceRecord[]> {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("No --source given and AIRTABLE_API_KEY is not set");
  const out: SourceRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } }); // GET only
    if (!res.ok) throw new Error(`Airtable read failed: ${res.status}`);
    const j = (await res.json()) as { records: SourceRecord[]; offset?: string };
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}

interface Executor {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

async function pgliteExecutor(dataDir: string): Promise<Executor> {
  // PGlite is a local-verification tool only, deliberately not a package.json dependency.
  const modName = "@electric-sql/pglite";
  const mod = (await import(modName)) as { PGlite: new (dir?: string) => any };
  const db = new mod.PGlite(dataDir);
  return {
    query: async (sql, params) => db.query(sql, params ?? []),
    exec: async (sql) => {
      await db.exec(sql);
    },
    close: async () => db.close(),
  };
}

function guardTarget(url: string) {
  if (url.includes(PRODUCTION_REF) && process.env.BL04_ALLOW_PRODUCTION !== "1")
    throw new Error(`Refusing to write to production (${PRODUCTION_REF}). BL-04 runs on a dev branch or locally only.`);
}

async function prepareLocal(ex: Executor, rows: BriefingRow[]) {
  const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const domains = [...new Set(rows.map((r) => r.sector_id).filter((x): x is string => !!x))];
  const subs = [...new Set(rows.map((r) => r.thread_id).filter((x): x is string => !!x))];
  const comps = [...new Set(rows.map((r) => r.company_id).filter((x): x is string => !!x))];
  const vals = (xs: string[]) => (xs.length ? xs.map((x) => `(${sqlLit(x)})`).join(",") : "");
  await ex.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    -- Local stubs: key columns only, holding the REAL production keys this load references.
    create table if not exists public.faraday_domains (domain_code text primary key);
    create table if not exists public.faraday_subdomains (subdomain_code text primary key);
    create table if not exists public.institutions (institution_uid text primary key);
    create table if not exists public.companies (company_uid text primary key);
    ${domains.length ? `insert into public.faraday_domains values ${vals(domains)} on conflict do nothing;` : ""}
    ${subs.length ? `insert into public.faraday_subdomains values ${vals(subs)} on conflict do nothing;` : ""}
    ${comps.length ? `insert into public.companies values ${vals(comps)} on conflict do nothing;` : ""}
  `);
  const exists = await ex.query(`select to_regclass('public.briefings') is not null as e`);
  if (!exists.rows[0]?.e) {
    const mig = readFileSync(join(ROOT, "supabase/migrations/20261013120000_bl03_briefings_canonical.sql"), "utf8");
    await ex.exec(mig);
  }
  return { domains: domains.length, subdomains: subs.length, companies: comps.length, institutions: 0 };
}

async function uploadAttachments(targetUrl: string, recs: SourceRecord[]): Promise<number> {
  // Behind --upload-attachments, supabase: target only, never production (guardTarget runs first).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for --upload-attachments");
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(targetUrl, key, { auth: { persistSession: false } });
  await sb.storage.createBucket(ATTACHMENT_BUCKET, { public: false }).catch(() => undefined);
  let n = 0;
  for (const r of recs) {
    const atts = Array.isArray(r.fields[F.attachments]) ? (r.fields[F.attachments] as AirtableAttachment[]) : [];
    for (const a of atts) {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`attachment download failed for ${r.id}/${a.id}: ${res.status}`);
      const path = `${r.id}/${a.id}/${a.filename}`;
      const { error } = await sb.storage.from(ATTACHMENT_BUCKET).upload(path, await res.arrayBuffer(), {
        contentType: a.type, upsert: true,
      });
      if (error) throw new Error(`upload failed ${path}: ${error.message}`);
      n++;
      // Storage path recording needs a column BL-03 does not have (see field map, gap G5).
    }
  }
  return n;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reg = JSON.parse(readFileSync(args.registry, "utf8")) as Registry;
  const recs: SourceRecord[] = args.source
    ? (JSON.parse(readFileSync(args.source, "utf8")) as { records: SourceRecord[] }).records
    : await readAirtableLive();

  const resolved = recs.map((r) => resolveRecord(r, reg));
  const rows = resolved.map((r) => r.row);
  const unmatched = resolved.flatMap((r) => r.unmatched);
  const inventory = resolved.flatMap((r) => r.attachments);

  const ids = new Set(rows.map((r) => r.airtable_record_id));
  if (ids.size !== rows.length) throw new Error("duplicate airtable_record_id in source");

  const bySourceStatus: Record<string, number> = {};
  for (const r of recs) {
    const s = String((r.fields[F.status] as any)?.name ?? r.fields[F.status]);
    bySourceStatus[s] = (bySourceStatus[s] ?? 0) + 1;
  }
  const guardViolations = rows.filter(violatesPublishedGuard).length;

  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });
  writeFileSync(join(args.outDir, "unmatched-links.csv"), csv(unmatched, [
    "airtable_record_id", "briefing_title", "airtable_status", "link_field", "linked_record_id",
    "linked_record_name", "target_table", "reason", "resolved_key", "note"]));
  writeFileSync(join(args.outDir, "attachments-inventory.csv"), csv(inventory, [
    "airtable_record_id", "attachment_id", "filename", "size", "type", "source_host"]));

  const summary: Record<string, unknown> = {
    source_records: recs.length,
    by_source_status: bySourceStatus,
    unmatched_links: unmatched.length,
    attachments: inventory.length,
    published_guard_violations: guardViolations,
    target: args.target,
    dry_run: args.dryRun,
  };

  if (guardViolations > 0) throw new Error(`${guardViolations} published rows without source_refs; BL-03 would reject them`);

  if (args.dryRun || args.target === "none") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let ex: Executor;
  if (args.target.startsWith("pglite:")) {
    ex = await pgliteExecutor(args.target.slice("pglite:".length));
    if (args.prepareLocal) summary.local_stubs = await prepareLocal(ex, rows);
  } else if (args.target.startsWith("supabase:")) {
    const url = args.target.slice("supabase:".length);
    guardTarget(url);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for a supabase: target");
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("briefings").upsert(rows.slice(i, i + 200), { onConflict: "airtable_record_id" });
      if (error) throw new Error(`upsert failed: ${error.message}`);
    }
    if (args.uploadAttachments) summary.attachments_uploaded = await uploadAttachments(url, recs);
    const { data, error } = await sb.from("briefings").select("status, airtable_record_id").not("airtable_record_id", "is", null);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) if (ids.has(r.airtable_record_id as string)) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
    summary.target_by_status = counts;
    console.log(JSON.stringify(summary, null, 2));
    return;
  } else throw new Error(`Unknown target ${args.target}`);

  if (args.uploadAttachments) throw new Error("--upload-attachments needs a supabase: target");

  let inserted = 0, updated = 0;
  await ex.exec("begin");
  try {
    for (const r of rows) {
      const res = await ex.query(UPSERT_SQL, upsertParams(r));
      if (res.rows.length) res.rows[0].inserted ? inserted++ : updated++;
    }
    await ex.exec("commit");
  } catch (e) {
    await ex.exec("rollback");
    throw e;
  }
  const unchanged = rows.length - inserted - updated;
  const counts = await ex.query(
    `select status, count(*)::int as n from public.briefings where airtable_record_id = any($1::text[]) group by status order by status`,
    [[...ids]]);
  const total = await ex.query(`select count(*)::int as n from public.briefings`);
  const links = await ex.query(`select count(company_id)::int as company, count(thread_id)::int as thread,
      count(sector_id)::int as sector, count(*) filter (where cardinality(theme_tags) > 0)::int as themed
    from public.briefings where airtable_record_id = any($1::text[])`, [[...ids]]);
  summary.write = { inserted, updated, unchanged };
  summary.target_by_status = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  summary.target_total_rows = total.rows[0].n;
  summary.target_links = links.rows[0];
  await ex.close();
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
