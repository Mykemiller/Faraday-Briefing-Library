#!/usr/bin/env node
// BL2-03 (FDY-279): generates supabase/migrations/20261109150000_bl2_03_tier_and_type.sql from
//   docs/briefs/entity-universe.csv       (BL-07 — 347 tiered rows; the 357 placeholders are not briefings)
//   docs/briefs/jurisdiction-scope.csv    (BL2-02 — states ranked 1–30 + the 15 in-scope countries)
//   scripts/bl2-03/pinned.json            (fill pool, re-link map, universe remap, lane quotas — read live 2026-11-09)
//
// The migration is ONE plpgsql DO block so that every statement shares a transaction whatever
// client runs it. `--dry-run` writes a copy whose final statement raises (so the whole block rolls
// back) carrying the verification report in the exception message — the only way to rehearse a
// data migration against production without leaving residue.
//
//   node scripts/bl2-03/build-migration.mjs            # writes the migration
//   node scripts/bl2-03/build-migration.mjs --dry-run  # writes <scratch>/bl2_03_dry_run.sql
//
// Nothing here talks to a database.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// ------------------------------------------------------------------ inputs
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1 || r[0] !== '').map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qn = (s) => (s === '' || s == null ? 'null' : q(s));
const arr = (xs) => (xs.length ? `array[${xs.map(q).join(',')}]::text[]` : "'{}'::text[]");

export function loadInputs() {
  const universe = parseCsv(readFileSync(resolve(root, 'docs/briefs/entity-universe.csv'), 'utf8'));
  const scope = parseCsv(readFileSync(resolve(root, 'docs/briefs/jurisdiction-scope.csv'), 'utf8'));
  const pinned = JSON.parse(readFileSync(resolve(here, 'pinned.json'), 'utf8'));

  const tiered = universe.filter((r) => r.tier !== '');
  if (tiered.length !== 347) throw new Error(`expected 347 tiered universe rows, found ${tiered.length}`);
  const placeholders = universe.filter((r) => r.source_status === 'coming_soon');
  if (placeholders.length !== 357) throw new Error(`expected 357 placeholders, found ${placeholders.length}`);

  const states = scope.filter((r) => r.kind === 'state').sort((a, b) => +a.rank - +b.rank).slice(0, 30);
  const countries = scope.filter((r) => r.kind === 'country' && r.in_scope === 'true').sort((a, b) => +a.rank - +b.rank);
  if (states.length !== 30) throw new Error(`expected 30 states, found ${states.length}`);
  if (countries.length !== 15) throw new Error(`expected 15 in-scope countries, found ${countries.length}`);

  return { tiered, states, countries, pinned };
}

// ------------------------------------------------------------------ SQL fragments
function universeValues(tiered) {
  return tiered
    .map((r) => {
      const recIds = [...new Set(r.reason.match(/rec[A-Za-z0-9]{14}/g) ?? [])];
      return `    (${q(r.entity_type)}, ${q(r.entity_id)}, ${q(r.name)}, ${q(r.tier.toLowerCase())}, ${qn(r.sector)}, ${qn(r.thread)}, ${qn(r.theme)}, ${arr(recIds)})`;
    })
    .join(',\n');
}

function jurisdictionValues(states, countries) {
  return [
    ...states.map((r) => `    (${q(r.jurisdiction_id)}, ${q(r.name)}, 'state', ${+r.rank})`),
    ...countries.map((r) => `    (${q(r.jurisdiction_id)}, ${q(r.name)}, 'country', ${+r.rank})`),
  ].join(',\n');
}

function fillValues(pool) {
  return pool.map(([uid, name, sd, dom, theme, m30, rk]) => `    (${q(uid)}, ${q(name)}, ${q(sd)}, ${q(dom)}, ${q(theme)}, ${m30}, ${rk})`).join(',\n');
}

function relinkValues(relink) {
  return relink.map(([rec, name, uid, how]) => `    (${q(rec)}, ${q(name)}, ${q(uid)}, ${q(how)})`).join(',\n');
}

function remapValues(remap) {
  return remap.map(([oldUid, name, newUid, why]) => `    (${q(oldUid)}, ${q(name)}, ${q(newUid)}, ${q(why)})`).join(',\n');
}

function laneValues(quotas) {
  return Object.entries(quotas).map(([lane, n]) => `    (${q(lane)}, ${n})`).join(',\n');
}

// ------------------------------------------------------------------ the migration
export function buildMigration({ tiered, states, countries, pinned }, { dryRun = false } = {}) {
  return `-- BL2-03 (FDY-279, release 46-26-v01): tier and type every briefings row; build the 467-row target shelf.
--
-- GENERATED by scripts/bl2-03/build-migration.mjs from docs/briefs/entity-universe.csv,
-- docs/briefs/jurisdiction-scope.csv and scripts/bl2-03/pinned.json. Edit the inputs and
-- regenerate; do not hand-edit this file.
--
-- NOT APPLIED by the PR that adds it. Founder decision 4 (2026-11-09): the merged PR is the approval
-- to apply. The unattended-run data rule (none of the three destructive statement kinds) is honoured —
-- this file removes nothing; rows leave the shelf by status = 'retired'. A pre-apply snapshot of every
-- briefings row is taken into public.cc_bl203_briefings_pre (RLS on, service_role only) for rollback.
--
-- Target shelf (Founder-approved 2026-11-09, 467 rows):
--   theaters 7 Deep · domains 23 Standard · sub-domains 117 Standard
--   companies 225 (45 Deep · 15 Standard · 165 Profile) · institutions 50 Profile
--   states 30 Standard (ranks 1–30 of the BL2-02 state table, regardless of in_scope)
--   countries 15 Standard.
-- Page targets: Deep 12 · Standard 9 · Profile 2 (Brand Bible V2 §05).
--
-- What the block does, in order (every step is set-based and idempotent — a second run changes nothing):
--   §0  Preconditions: BL2-01 applied (briefing_lanes, five-type CHECK), no published rows, no temp residue.
--   §1  Pinned reference data into temp tables: the 347 tiered universe rows (with the Airtable record ids
--       their reason text cites), the 45 jurisdictions, the ranked fill pool, the re-link map, the remap of
--       three universe company ids that no longer exist in companies, the lane quotas.
--   §2  Re-link the 27 planned rows whose company_id is NULL (the 21 company links that could not be kept on
--       2026-11-06 plus the 6 no_registry_row placeholders) by exact canonical-name / approved-alias match.
--       Pinned, not guessed.
--   §3  Claim one existing briefings row per target entity: (a) the Airtable record id the universe row cites,
--       (b) company_id, (c) institution_id or the institution's linked company_uid, (d) registry key,
--       (e) jurisdiction_id, (f) fill companies by company_id. A record id cited by two universe rows
--       (Williams vs. Enbridge) claims neither. Ties: draft before planned, populated before empty, then
--       airtable_record_id. A row claims at most one entity; an entity claims at most one row.
--   §4  Write tier / briefing_type / page_target / sector_id / thread_id / theme_tags / entity keys on every
--       claimed row. Placeholder titles ("Coming Soon — …") are replaced by the title format; real titles stay.
--   §5  Every planned/draft row that claimed nothing becomes status = 'retired' (reason recorded in the report;
--       the sidecar docs/briefs/retired-placeholders.csv is the dry-run output of this step).
--   §6  Insert the entities that claimed nothing as status = 'planned'.
--   §7  Seed briefing_lanes.daily_quota (theaters 2 · domains 6 · subdomains 15 · companies 25 ·
--       institutions 10 · states 6 · countries 4).
--   §8  Verify: counts by briefing_type × tier × status over planned+draft equal the target table; 0 non-retired
--       rows with tier NULL; 0 published; one live row per entity key. Any mismatch raises and rolls back.
--
-- Title formats: theater → theme name · domain → "<name>: <short_desc>" · sub-domain → "<name>: <parent
-- domain short_desc>" (faraday_subdomains carries no description column — flagged in Questions for Myke) ·
-- company / institution → canonical_name · jurisdiction → "<Name> — Data Center Regulatory Landscape".
-- Jurisdiction briefs are placed under D3 Grid & Regulatory / T-001 (default, flagged).
--
-- Rollback: restore every pre-existing row from public.cc_bl203_briefings_pre (update … from … by id);
-- inserted rows are the ones with airtable_record_id IS NULL and created_at ≥ the apply time; set
-- briefing_lanes.daily_quota back to 0. Then remove the snapshot table.
--
-- Verify after apply (the §8 block runs the same checks and raises on mismatch):
--   select briefing_type, tier, status, count(*) from briefings where status in ('planned','draft') group by 1,2,3 order by 1,2,3;
--   select count(*) from briefings where status <> 'retired' and tier is null;      -- 0
--   select count(*) from briefings where status = 'published';                      -- 0
--   select count(*) from briefings where status in ('planned','draft');             -- 467
--   select lane, daily_quota from briefing_lanes order by lane;

do $bl203$
declare
  v_dry_run constant boolean := ${dryRun ? 'true' : 'false'};
  v_n int;
  v_relinked int := 0;
  v_updated int := 0;
  v_retired int := 0;
  v_inserted int := 0;
  v_needed_fill int;
  v_report text := '';
  v_line text;
  v_bad text;
  rec record;
begin
  -- ───────────────────────────── §0 preconditions ─────────────────────────────
  if to_regclass('public.briefing_lanes') is null then
    raise exception 'BL2-03: briefing_lanes missing — apply BL2-01 (20261109120000) first';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.briefings'::regclass and conname = 'briefings_briefing_type_check'
                   and pg_get_constraintdef(oid) ~ 'jurisdiction') then
    raise exception 'BL2-03: briefing_type CHECK lacks company/jurisdiction — apply BL2-01 first';
  end if;
  if exists (select 1 from public.briefings where status = 'published') then
    raise exception 'BL2-03: published rows exist; this migration expects none (0 Live records at BL-04)';
  end if;
  if to_regclass('pg_temp.bl203_universe') is not null then
    raise exception 'BL2-03: temp residue from an earlier attempt in this session — reconnect and re-run';
  end if;

  -- ───────────────────────────── §0b pre-apply snapshot (rollback source) ─────────────────────────────
  if to_regclass('public.cc_bl203_briefings_pre') is null then
    create table public.cc_bl203_briefings_pre as select now() as snapshot_at, b.* from public.briefings b;
    alter table public.cc_bl203_briefings_pre enable row level security;
    revoke all on table public.cc_bl203_briefings_pre from public, anon, authenticated;
    comment on table public.cc_bl203_briefings_pre is
      'BL2-03 (FDY-279): every briefings row as it stood before the shelf migration. Rollback source; remove after the shelf settles.';
  end if;

  -- ───────────────────────────── §1 pinned reference data ─────────────────────────────
  create temp table bl203_universe (
    entity_type text not null, entity_id text not null, name text not null, tier text not null,
    sector text, thread text, theme text, rec_ids text[] not null, active boolean not null default true,
    note text
  );
  insert into bl203_universe (entity_type, entity_id, name, tier, sector, thread, theme, rec_ids) values
${universeValues(tiered)};
  if (select count(*) from bl203_universe) <> 347 then raise exception 'BL2-03: universe rows <> 347'; end if;

  -- Universe company ids that no longer exist in companies → their approved alias target.
  create temp table bl203_remap (old_uid text primary key, name text, new_uid text not null, why text);
  insert into bl203_remap values
${remapValues(pinned.universe_remap)};
  select string_agg(m.new_uid, ', ') into v_bad from bl203_remap m
   where not exists (select 1 from public.companies c where c.company_uid = m.new_uid);
  if v_bad is not null then raise exception 'BL2-03: remap target(s) not in companies: %', v_bad; end if;
  update bl203_universe u set entity_id = m.new_uid, note = 'remapped from ' || m.old_uid || ': ' || m.why
    from bl203_remap m where u.entity_type = 'company' and u.entity_id = m.old_uid;

  -- After the remap two universe rows may name one company; keep the higher tier, retire the other row.
  update bl203_universe u set active = false,
         note = coalesce(u.note || '; ', '') || 'collapsed into higher-tier universe row for the same company'
    from (select entity_id, min(case tier when 'deep' then 1 when 'standard' then 2 else 3 end) best
            from bl203_universe where entity_type = 'company' group by entity_id having count(*) > 1) d
   where u.entity_type = 'company' and u.entity_id = d.entity_id
     and (case u.tier when 'deep' then 1 when 'standard' then 2 else 3 end) > d.best;

  -- Every active universe key must resolve against its registry.
  select string_agg(u.entity_type || ':' || u.entity_id, ', ') into v_bad from bl203_universe u where u.active and not (
       (u.entity_type = 'theme'       and exists (select 1 from public.faraday_themes t where t.theme_code = u.entity_id and t.active))
    or (u.entity_type = 'domain'      and exists (select 1 from public.faraday_domains d where d.domain_code = u.entity_id and d.active))
    or (u.entity_type = 'subdomain'   and exists (select 1 from public.faraday_subdomains s where s.subdomain_code = u.entity_id and s.active))
    or (u.entity_type = 'company'     and exists (select 1 from public.companies c where c.company_uid = u.entity_id))
    or (u.entity_type = 'institution' and exists (select 1 from public.institutions i where i.institution_uid = u.entity_id)));
  if v_bad is not null then raise exception 'BL2-03: universe keys with no registry row: %', v_bad; end if;

  create temp table bl203_jur (jurisdiction_id text primary key, name text not null, kind text not null, rnk int not null);
  insert into bl203_jur values
${jurisdictionValues(states, countries)};
  if (select count(*) from bl203_jur where kind = 'state') <> 30 or (select count(*) from bl203_jur where kind = 'country') <> 15 then
    raise exception 'BL2-03: jurisdiction list is not 30 states + 15 countries';
  end if;

  -- Ranked fill pool (companies with a primary tag on an active sub-domain, pillar company, active, not a
  -- universe company, not a universe institution's linked company, not an alias twin of a universe company;
  -- ordered by company_signal_rollup.mentions_30d desc, artifact_count desc, name — snapshot 2026-11-09).
  create temp table bl203_fill (company_uid text primary key, name text, subdomain_code text, domain_code text, theme text, mentions_30d int, rk int unique);
  insert into bl203_fill values
${fillValues(pinned.fill_pool)};
  select string_agg(f.company_uid, ', ') into v_bad from bl203_fill f
   where not exists (select 1 from public.companies c where c.company_uid = f.company_uid and c.pillar_status = 'company' and c.status = 'active');
  if v_bad is not null then raise exception 'BL2-03: fill-pool companies no longer live: %', v_bad; end if;
  if exists (select 1 from bl203_fill f join bl203_universe u on u.active and u.entity_type = 'company' and u.entity_id = f.company_uid) then
    raise exception 'BL2-03: fill pool overlaps the universe';
  end if;

  create temp table bl203_relink (airtable_record_id text primary key, name text, company_uid text not null, matched_on text);
  insert into bl203_relink values
${relinkValues(pinned.relink)};

  create temp table bl203_lanes (lane text primary key, daily_quota int not null);
  insert into bl203_lanes values
${laneValues(pinned.lane_quotas)};

  -- Report of every decision this block takes on existing rows.
  create temp table bl203_report (airtable_record_id text, title text, status_before text, company_id text, action text, reason text);

  -- ───────────────────────────── §2 re-link ─────────────────────────────
  update public.briefings b set company_id = r.company_uid
    from bl203_relink r
   where b.airtable_record_id = r.airtable_record_id and b.company_id is null and b.institution_id is null
     and b.status in ('planned', 'draft')
     and exists (select 1 from public.companies c where c.company_uid = r.company_uid);
  get diagnostics v_relinked = row_count;
  insert into bl203_report
    select b.airtable_record_id, b.title, b.status, b.company_id, 'relinked', 'company_id set by ' || r.matched_on
      from public.briefings b join bl203_relink r using (airtable_record_id) where b.company_id = r.company_uid;
  insert into bl203_report
    select b.airtable_record_id, b.title, b.status, b.company_id, 'relink_failed', 'pinned target ' || r.company_uid || ' not accepted'
      from public.briefings b join bl203_relink r using (airtable_record_id) where b.company_id is distinct from r.company_uid;

  -- ───────────────────────────── §3 claims ─────────────────────────────
  -- Target entities = active universe rows + jurisdictions (+ fill companies, added in 3f).
  create temp table bl203_target (
    entity_type text not null, entity_id text not null, name text, tier text not null,
    sector text, thread text, theme text, src text not null,
    primary key (entity_type, entity_id)
  );
  insert into bl203_target
    select entity_type, entity_id, name, tier, sector, thread, theme, 'universe' from bl203_universe where active;
  insert into bl203_target
    select 'jurisdiction', jurisdiction_id, name, 'standard', 'D3', null, 'T-001', 'jurisdiction' from bl203_jur;

  create temp table bl203_claim (
    briefing_id uuid primary key, entity_type text not null, entity_id text not null, via text not null,
    unique (entity_type, entity_id)
  );

  -- Candidate rows: live (planned/draft) briefings with a stable tie-break key.
  create temp view bl203_candidates as
    select b.id, b.airtable_record_id, b.title, b.status, b.company_id, b.institution_id, b.jurisdiction_id,
           b.sector_id, b.thread_id, b.theme_tags,
           (case b.status when 'draft' then 0 else 1 end) as k_status,
           (case when b.sector_id is not null or b.thread_id is not null or cardinality(b.theme_tags) > 0 or b.company_id is not null then 0 else 1 end) as k_populated,
           coalesce(b.airtable_record_id, 'zzz' || b.id::text) as k_rec
      from public.briefings b where b.status in ('planned', 'draft');

  -- 3a: the Airtable record id the universe row cites. A record cited by >1 universe rows claims neither
  --     unless the row's company_id names one of them.
  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, entity_type, entity_id, 'airtable_record_id' from (
    select c.id, u.entity_type, u.entity_id,
           row_number() over (partition by u.entity_type, u.entity_id order by c.k_status, c.k_populated, c.k_rec) as rn_e,
           row_number() over (partition by c.id order by u.entity_type, u.entity_id) as rn_b
      from bl203_candidates c
      join bl203_universe u on u.active and c.airtable_record_id = any (u.rec_ids)
     where (select count(*) from bl203_universe u2 where u2.active and c.airtable_record_id = any (u2.rec_ids)) = 1
        or u.entity_id = c.company_id
  ) x where rn_e = 1 and rn_b = 1;

  -- 3b: universe companies by company_id.
  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, 'company', entity_id, 'company_id' from (
    select c.id, t.entity_id,
           row_number() over (partition by t.entity_id order by c.k_status, c.k_populated, c.k_rec) as rn
      from bl203_target t
      join bl203_candidates c on c.company_id = t.entity_id
     where t.entity_type = 'company'
       and not exists (select 1 from bl203_claim k where k.entity_type = 'company' and k.entity_id = t.entity_id)
       and not exists (select 1 from bl203_claim k where k.briefing_id = c.id)
  ) x where rn = 1;

  -- 3c: universe institutions by institution_id, else by the institution's linked company_uid.
  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, 'institution', entity_id, via from (
    select c.id, t.entity_id,
           case when c.institution_id = t.entity_id then 'institution_id' else 'institutions.company_uid' end as via,
           row_number() over (partition by t.entity_id order by (c.institution_id = t.entity_id) desc, c.k_status, c.k_populated, c.k_rec) as rn
      from bl203_target t
      join public.institutions i on i.institution_uid = t.entity_id
      join bl203_candidates c on c.institution_id = t.entity_id
                              or (c.company_id is not null and c.company_id = i.company_uid)
     where t.entity_type = 'institution'
       and not exists (select 1 from bl203_claim k where k.entity_type = 'institution' and k.entity_id = t.entity_id)
       and not exists (select 1 from bl203_claim k where k.briefing_id = c.id)
  ) x where rn = 1;

  -- 3d: registry rows by their key — ONLY rows an earlier run already typed (what makes a re-run idempotent).
  --     An untyped draft that merely carries a sector/theme tag (the topic drafts) is never repurposed as a
  --     registry briefing by this block; it retires in §5 and is listed for Myke.
  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, entity_type, entity_id, 'registry_key' from (
    select c.id, t.entity_type, t.entity_id,
           row_number() over (partition by t.entity_type, t.entity_id order by c.k_status, c.k_populated, c.k_rec) as rn
      from bl203_target t
      join bl203_candidates c
        on (t.entity_type = 'theme'     and c.briefing_type = 'theater' and c.theme_tags = array[t.entity_id] and c.sector_id is null and c.thread_id is null and c.company_id is null)
        or (t.entity_type = 'domain'    and c.briefing_type = 'sector'  and c.sector_id = t.entity_id and c.thread_id is null and c.company_id is null)
        or (t.entity_type = 'subdomain' and c.briefing_type = 'thread'  and c.thread_id = t.entity_id and c.company_id is null)
     where t.entity_type in ('theme', 'domain', 'subdomain')
       and not exists (select 1 from bl203_claim k where k.entity_type = t.entity_type and k.entity_id = t.entity_id)
       and not exists (select 1 from bl203_claim k where k.briefing_id = c.id)
  ) x where rn = 1;

  -- 3e: jurisdictions by jurisdiction_id.
  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, 'jurisdiction', entity_id, 'jurisdiction_id' from (
    select c.id, t.entity_id, row_number() over (partition by t.entity_id order by c.k_status, c.k_populated, c.k_rec) as rn
      from bl203_target t join bl203_candidates c on c.jurisdiction_id = t.entity_id
     where t.entity_type = 'jurisdiction'
       and not exists (select 1 from bl203_claim k where k.entity_type = 'jurisdiction' and k.entity_id = t.entity_id)
       and not exists (select 1 from bl203_claim k where k.briefing_id = c.id)
  ) x where rn = 1;

  -- 3f: fill companies, in rank order, until companies total 225.
  select 225 - count(*) into v_needed_fill from bl203_target where entity_type = 'company';
  if v_needed_fill < 0 or v_needed_fill > (select count(*) from bl203_fill) then
    raise exception 'BL2-03: need % fill companies but the pinned pool holds %', v_needed_fill, (select count(*) from bl203_fill);
  end if;
  insert into bl203_target
    select 'company', company_uid, name, 'profile', domain_code, subdomain_code, theme, 'fill'
      from bl203_fill where rk <= v_needed_fill;

  insert into bl203_claim (briefing_id, entity_type, entity_id, via)
  select id, 'company', entity_id, 'fill:company_id' from (
    select c.id, t.entity_id, row_number() over (partition by t.entity_id order by c.k_status, c.k_populated, c.k_rec) as rn
      from bl203_target t join bl203_candidates c on c.company_id = t.entity_id
     where t.src = 'fill'
       and not exists (select 1 from bl203_claim k where k.entity_type = 'company' and k.entity_id = t.entity_id)
       and not exists (select 1 from bl203_claim k where k.briefing_id = c.id)
  ) x where rn = 1;

  -- ───────────────────────────── §4 write the claimed rows ─────────────────────────────
  create temp view bl203_spec as
    select t.entity_type, t.entity_id, t.src, t.tier,
           case t.entity_type when 'theme' then 'theater' when 'domain' then 'sector' when 'subdomain' then 'thread'
                              when 'company' then 'company' when 'institution' then 'company' when 'jurisdiction' then 'jurisdiction' end as briefing_type,
           case t.tier when 'deep' then 12 when 'standard' then 9 when 'profile' then 2 end as page_target,
           t.sector as sector_id, t.thread as thread_id,
           case when t.theme is null then '{}'::text[] else array[t.theme] end as theme_tags,
           case when t.entity_type = 'company' then t.entity_id end as company_id,
           case when t.entity_type = 'institution' then t.entity_id end as institution_id,
           case when t.entity_type = 'jurisdiction' then t.entity_id end as jurisdiction_id,
           case t.entity_type
             when 'theme'        then (select th.name from public.faraday_themes th where th.theme_code = t.entity_id)
             when 'domain'       then (select d.domain_name || coalesce(': ' || nullif(d.short_desc, ''), '') from public.faraday_domains d where d.domain_code = t.entity_id)
             when 'subdomain'    then (select s.display_name || coalesce(': ' || nullif(d.short_desc, ''), '')
                                         from public.faraday_subdomains s join public.faraday_domains d on d.domain_code = s.domain_code
                                        where s.subdomain_code = t.entity_id)
             when 'company'      then (select c.canonical_name from public.companies c where c.company_uid = t.entity_id)
             when 'institution'  then (select i.canonical_name from public.institutions i where i.institution_uid = t.entity_id)
             when 'jurisdiction' then t.name || ' — Data Center Regulatory Landscape'
           end as title
      from bl203_target t;

  update public.briefings b set
      tier           = s.tier,
      briefing_type  = s.briefing_type,
      page_target    = s.page_target,
      sector_id      = s.sector_id,
      thread_id      = s.thread_id,
      theme_tags     = s.theme_tags,
      company_id     = s.company_id,
      institution_id = s.institution_id,
      jurisdiction_id = s.jurisdiction_id,
      title          = case when b.title like 'Coming Soon — %' then s.title else b.title end
    from bl203_claim k join bl203_spec s on s.entity_type = k.entity_type and s.entity_id = k.entity_id
   where b.id = k.briefing_id
     and (b.tier is distinct from s.tier or b.briefing_type is distinct from s.briefing_type
          or b.page_target is distinct from s.page_target or b.sector_id is distinct from s.sector_id
          or b.thread_id is distinct from s.thread_id or b.theme_tags is distinct from s.theme_tags
          or b.company_id is distinct from s.company_id or b.institution_id is distinct from s.institution_id
          or b.jurisdiction_id is distinct from s.jurisdiction_id
          or (b.title like 'Coming Soon — %' and b.title is distinct from s.title));
  get diagnostics v_updated = row_count;
  insert into bl203_report
    select b.airtable_record_id, b.title, b.status, b.company_id, 'claimed',
           k.entity_type || ' ' || k.entity_id || ' via ' || k.via
      from bl203_claim k join public.briefings b on b.id = k.briefing_id;

  -- ───────────────────────────── §5 retire what claimed nothing ─────────────────────────────
  insert into bl203_report
    select c.airtable_record_id, c.title, c.status, c.company_id, 'retired',
           case
             when c.status = 'draft' and c.title not like 'Coming Soon — %'
               then 'draft with no single entity (topic, comparison or duplicate) — see Questions for Myke'
             when c.company_id is null and c.institution_id is null
               then 'placeholder with no resolvable company link'
             when exists (select 1 from bl203_target t where t.entity_type = 'company' and t.entity_id = c.company_id)
               then 'superseded: another row already carries this company'
             else 'placeholder below the 225-company cut (ranked by company_signal_rollup.mentions_30d)'
           end
      from bl203_candidates c
     where not exists (select 1 from bl203_claim k where k.briefing_id = c.id);

  update public.briefings b set status = 'retired'
   where b.status in ('planned', 'draft')
     and not exists (select 1 from bl203_claim k where k.briefing_id = b.id);
  get diagnostics v_retired = row_count;

  -- ───────────────────────────── §6 insert what no row carries ─────────────────────────────
  insert into public.briefings (title, tier, status, page_target, sector_id, thread_id, theme_tags,
                                company_id, institution_id, jurisdiction_id, briefing_type)
  select s.title, s.tier, 'planned', s.page_target, s.sector_id, s.thread_id, s.theme_tags,
         s.company_id, s.institution_id, s.jurisdiction_id, s.briefing_type
    from bl203_spec s
   where not exists (select 1 from bl203_claim k where k.entity_type = s.entity_type and k.entity_id = s.entity_id)
   order by s.briefing_type, s.entity_id;
  get diagnostics v_inserted = row_count;

  -- ───────────────────────────── §7 lane quotas ─────────────────────────────
  update public.briefing_lanes l set daily_quota = q.daily_quota, updated_at = now()
    from bl203_lanes q where l.lane = q.lane and l.daily_quota is distinct from q.daily_quota;
  if (select count(*) from public.briefing_lanes l join bl203_lanes q using (lane) where l.daily_quota = q.daily_quota) <> 7 then
    raise exception 'BL2-03: lane quotas not seeded on all seven lanes';
  end if;

  -- ───────────────────────────── §8 verification ─────────────────────────────
  v_bad := null;
  create temp table bl203_expected (bucket text, tier text, expected int, primary key (bucket, tier));
  insert into bl203_expected values
    ('theater', 'deep', 7), ('sector', 'standard', 23), ('thread', 'standard', 117),
    ('company:company', 'deep', 45), ('company:company', 'standard', 15), ('company:company', 'profile', 165),
    ('company:institution', 'profile', 50),
    ('jurisdiction:state', 'standard', 30), ('jurisdiction:country', 'standard', 15);
  create temp table bl203_expected_keyed as
    select case when bucket like '%:%' then split_part(bucket, ':', 1) else bucket end as briefing_type,
           case when bucket like '%:%' then split_part(bucket, ':', 2) end as sub, tier, expected from bl203_expected;

  create temp view bl203_actual as
    select b.briefing_type,
           case b.briefing_type
             when 'company' then case when b.company_id is not null then 'company' else 'institution' end
             when 'jurisdiction' then case when b.jurisdiction_id ~ '^US-' then 'state' else 'country' end
           end as sub,
           b.tier, b.status, count(*) as n
      from public.briefings b where b.status in ('planned', 'draft')
     group by 1, 2, 3, 4;

  v_report := format(E'relinked=%s updated=%s retired=%s inserted=%s fill_taken=%s\\n', v_relinked, v_updated, v_retired, v_inserted, v_needed_fill);
  for rec in
    select e.briefing_type, e.sub, e.tier, e.expected,
           coalesce(sum(a.n) filter (where a.status = 'planned'), 0) as planned,
           coalesce(sum(a.n) filter (where a.status = 'draft'), 0) as draft,
           coalesce(sum(a.n), 0) as actual
      from bl203_expected_keyed e
      left join bl203_actual a on a.briefing_type = e.briefing_type and a.tier = e.tier and a.sub is not distinct from e.sub
     group by 1, 2, 3, 4 order by 1, 2, 3
  loop
    v_report := v_report || format(E'%s%s · %s · expected %s · actual %s (planned %s, draft %s)\\n',
                                   rec.briefing_type, coalesce('/' || rec.sub, ''), rec.tier, rec.expected, rec.actual, rec.planned, rec.draft);
    if rec.actual <> rec.expected then v_bad := coalesce(v_bad || '; ', '') || format('%s/%s %s: %s<>%s', rec.briefing_type, rec.sub, rec.tier, rec.actual, rec.expected); end if;
  end loop;

  select count(*) into v_n from public.briefings where status in ('planned', 'draft');
  v_report := v_report || format(E'live rows (planned+draft) = %s (expected 467)\\n', v_n);
  if v_n <> 467 then v_bad := coalesce(v_bad || '; ', '') || 'live rows ' || v_n || '<>467'; end if;

  select count(*) into v_n from public.briefings where status <> 'retired' and tier is null;
  v_report := v_report || format(E'non-retired rows with tier NULL = %s (expected 0)\\n', v_n);
  if v_n <> 0 then v_bad := coalesce(v_bad || '; ', '') || 'tier NULL ' || v_n; end if;

  select count(*) into v_n from public.briefings where status <> 'retired' and briefing_type is null;
  if v_n <> 0 then v_bad := coalesce(v_bad || '; ', '') || 'briefing_type NULL ' || v_n; end if;

  select count(*) into v_n from public.briefings where status = 'published';
  v_report := v_report || format(E'published rows = %s (expected 0)\\n', v_n);
  if v_n <> 0 then v_bad := coalesce(v_bad || '; ', '') || 'published ' || v_n; end if;

  -- One live row per entity key.
  select count(*) into v_n from (
    select briefing_type,
           coalesce(jurisdiction_id, company_id, institution_id, thread_id, sector_id, theme_tags[1]) as k, count(*)
      from public.briefings where status in ('planned', 'draft') group by 1, 2 having count(*) > 1) d;
  v_report := v_report || format(E'duplicate live entity keys = %s (expected 0)\\n', v_n);
  if v_n <> 0 then v_bad := coalesce(v_bad || '; ', '') || 'duplicate entity keys ' || v_n; end if;

  select count(*) into v_n from public.briefings where status <> 'retired' and (
       (briefing_type = 'theater' and (cardinality(theme_tags) <> 1 or sector_id is not null or thread_id is not null))
    or (briefing_type = 'sector' and (sector_id is null or thread_id is not null))
    or (briefing_type = 'thread' and thread_id is null)
    or (briefing_type = 'company' and company_id is null and institution_id is null)
    or (briefing_type = 'jurisdiction' and jurisdiction_id is null));
  if v_n <> 0 then v_bad := coalesce(v_bad || '; ', '') || 'rows whose keys do not fit their type ' || v_n; end if;

  select string_agg(l.lane || '=' || l.daily_quota, ' ' order by l.lane) into v_line from public.briefing_lanes l;
  v_report := v_report || 'lanes: ' || v_line || E'\\n';

  if v_bad is not null then
    raise exception E'BL2-03 verification failed: %\\n%', v_bad, v_report;
  end if;

  if v_dry_run then
    -- Dry run: surface the report and the per-row decisions, then roll everything back.
    -- Compact codes keep the message under the client's size cap: R=relinked X=retired ·
    -- reasons D=draft with no single entity, N=no resolvable company link, S=superseded, C=below the 225 cut.
    select string_agg(format('%s|%s|%s|%s|%s',
                             case r.action when 'relinked' then 'R' when 'retired' then 'X' else r.action end,
                             coalesce(r.airtable_record_id, ''), coalesce(r.company_id, ''),
                             case when r.action = 'relinked' then split_part(r.reason, ' set by ', 2)
                                  when r.reason like 'draft with no%' then 'D'
                                  when r.reason like 'placeholder with no%' then 'N'
                                  when r.reason like 'superseded%' then 'S'
                                  when r.reason like 'placeholder below%' then 'C' else r.reason end,
                             replace(regexp_replace(r.title, '^Coming Soon — ', ''), '|', '/')), E'\\n' order by r.action, r.title)
      into v_line from bl203_report r where r.action <> 'claimed'${dryRun && process.env.BL203_DRY_RUN_FILTER ? ` and (${process.env.BL203_DRY_RUN_FILTER})` : ''};
    raise exception E'BL2-03 DRY RUN (rolled back)\\n%\\n--- decisions (action|airtable_record_id|company_id|reason|title) ---\\n%\\n--- claims by via ---\\n%\\n--- inserts by type ---\\n%',
      v_report, v_line,
      (select string_agg(via || '=' || n, ', ' order by via) from (select via, count(*) n from bl203_claim group by via) z),
      (select string_agg(briefing_type || '=' || n, ', ' order by briefing_type) from (select s.briefing_type, count(*) n from bl203_spec s
         where not exists (select 1 from bl203_claim k where k.entity_type = s.entity_type and k.entity_id = s.entity_id) group by 1) z);
  end if;

  raise notice E'BL2-03 applied\\n%', v_report;
end
$bl203$;
`;
}

// ------------------------------------------------------------------ main
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dryRun = process.argv.includes('--dry-run');
  const inputs = loadInputs();
  const sql = buildMigration(inputs, { dryRun });
  for (const word of ['delete', 'drop', 'truncate']) {
    if (new RegExp(word, 'i').test(sql)) throw new Error(`generated SQL contains "${word}" (comments included)`);
  }
  const out = dryRun
    ? resolve(process.env.BL203_DRY_RUN_OUT ?? resolve(root, 'bl2_03_dry_run.sql'))
    : resolve(root, 'supabase/migrations/20261109150000_bl2_03_tier_and_type.sql');
  writeFileSync(out, sql);
  console.log(`${dryRun ? 'dry-run' : 'migration'} written: ${out} (${sql.length} bytes)`);
}
