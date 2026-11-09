# Publish batch and sign-off queue (BL2-07)

**Linear:** FDY-283 (BL2-07), release 46-26-v01, Briefing Library project. **State: script + tests
on the branch; migration written, NOT applied — the merged PR is the approval to apply it (founder
decision 4, 2026-11-09).** Written 2026-11-09 CT against the live `ycadmmngkdhvpcsrcuaq` schema, where
BL2-01 (`20261109120000`) is applied and `briefings_versions` holds 0 staged drafts.

Publishing is the one step in the V2.0 pipeline a human owns (Brand Bible 04.2: "Myke sign-off
required. Every Briefing."). The lane runner stages drafts; the review chain writes verdicts; **this
batch publishes only what Myke has signed off**, and nothing else can.

## 1. Objects — migration `20261109150000_bl2_07_briefing_signoff.sql`

| Object | What it is |
|---|---|
| `briefing_signoff` | One row per `(briefing_id, version)` Myke approves. `approved` (default true; `false` records an explicit hold), `signed_by` (default `Myke`), `note`, `signed_at`. Unique per version. RLS on, `service_role` only, anon/authenticated revoked by name. **Human-written only** — no runner inserts here. |
| `v_briefing_signoff_queue` | Every staged draft (`briefings_versions.kind = 'draft'`) whose version is ahead of the live `briefings.version`, with the latest `G1-AUTO` / `G2-PANEL` / `G3-XCHECK` verdict from `briefing_reviews` and `approved` = a sign-off row exists. `security_invoker`, no anon/authenticated grant. A row leaves the queue when the live row reaches its version, so a re-run has nothing to do. |

The prompt offered two designs for the approval flag — a `briefing_reviews.notes = 'MYKE-APPROVED'`
string or a dedicated table — and recommended the table. The table is what shipped: a review row is a
gate verdict written by a runner; a sign-off is a human decision. Keeping them apart means a runner
can never mint an approval by writing a string, and the decision carries its own who/when/note.

The migration is **additive only** (one table, one view, grants; no DELETE/DROP/TRUNCATE anywhere in
the file), so it is safe under the 2026-11-09 04:22 CT unattended-apply rule. It was validated against
production on 2026-11-09 in a self-rolling-back transaction (the whole file ran, the verification gate
passed, a trailing `RAISE` rolled it back; zero residue confirmed). It is still held to merge-approval.

### Verify after apply

```sql
select to_regclass('public.briefing_signoff'), to_regclass('public.v_briefing_signoff_queue');
select relrowsecurity from pg_class where relname = 'briefing_signoff';              -- t
select count(*) from information_schema.role_table_grants
  where table_name in ('briefing_signoff','v_briefing_signoff_queue')
    and grantee in ('anon','authenticated');                                         -- 0
select count(*) from public.v_briefing_signoff_queue;                                -- 0 today
```

## 2. How Myke approves a brief

Service role (Supabase SQL editor), one row per staged version:

```sql
-- what is waiting
select briefing_id, version, title, tier, briefing_type, g1_auto, g2_panel, g3_xcheck, approved
from public.v_briefing_signoff_queue order by staged_at;

-- approve one
insert into public.briefing_signoff (briefing_id, version, note)
values ('<briefing uuid>', <staged version>, 'optional note');

-- hold one explicitly (the batch skips it; the row documents the decision)
insert into public.briefing_signoff (briefing_id, version, approved, note)
values ('<briefing uuid>', <staged version>, false, 'why');
```

## 3. The batch — `scripts/publish-batch.mjs`

```
node scripts/publish-batch.mjs                       # DRY RUN: prints the plan, writes nothing
node scripts/publish-batch.mjs --apply               # promote + publish every approved row
node scripts/publish-batch.mjs --apply --limit 5     # cap the run
node scripts/publish-batch.mjs --apply --briefing <uuid>
node scripts/publish-batch.mjs --fixtures scripts/lanes/fixtures   # offline, in-memory
```

| Variable | Notes |
|---|---|
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Must be a JWT whose `role` is `service_role`; anything else and the batch **refuses to start** (`assertServiceRole`, shared with the lane runner). |
| `NOTION_TOKEN` | Status-log writer. Absent ⇒ lines print to stdout. A dry run never sends a line even when the token is present. |

For each approved row, oldest `staged_at` first:

1. `briefings_version_promote(briefing_id, version)` — the BL-10 function snapshots the live row
   (`kind='snapshot'`, `job='promote'`) and copies the staged draft onto it, setting
   `briefings.version` to the draft's version. **The snapshot is the rollback.**
2. `update briefings set status = 'published', published_at = now() where id = $1 and version = $2`
   — the version guard means the status flip can only land on the row promote just wrote. If zero
   rows match, the brief is counted as failed and `status` is left as it was.
3. One status-log line, under `## Log` on the V2.0 status page:
   `YYYY-MM-DD HH:MM CT · <id8> · <lane> · <tier> · PUBLISHED · PUBLISHED · Published vN of "<title>" (…)`.
   Lane comes from the staged row's `job` (`lane-<lane>`), else from the type.

Then one `automation_health_log` row (`crawler_id = 'briefing-publish-batch_v0.1'`,
`auto_id = 'AUTO-PROVISIONAL'` — registry grant pending, do not self-assign), `success = no errors`.

Safety properties, all covered by `src/tests/publish-batch.test.ts`:

- **Dry run by default.** Without `--apply`: no RPC, no UPDATE, no Notion line, no health row.
- **Per-brief isolation.** A failing promote (e.g. the draft row vanished) is logged as `FAIL`,
  counted in `errors[]`, and the batch continues; the process exits 1.
- **Idempotent.** A promoted row leaves the queue, so a second `--apply` finds nothing.
- **No sign-off is ever written by the batch.** It reads `approved`; Myke writes it.
- **Missing view** (migration not applied) stops the run with a message naming the migration.

## 4. Rollback

Undo one publish: `select public.briefings_version_restore('<briefing uuid>', <previous version>)`
restores the snapshot promote took, then `update briefings set status = '<prior status>' where id = …`
(restore never changes `status`, by BL-10 rule).

Remove the objects (nothing else depends on them):

```sql
drop view if exists public.v_briefing_signoff_queue;
drop table if exists public.briefing_signoff;
```
