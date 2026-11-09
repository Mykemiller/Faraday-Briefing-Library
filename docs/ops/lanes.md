# Lane runner and status-log writer (BL2-04)

**Linear:** FDY-280 (BL2-04), release 46-26-v01, Briefing Library project. **State: skeleton —
no production writes have been made by this work; `generate()` is a stub until BL2-05 (FDY-281).**
Written 2026-11-09 CT against the live `ycadmmngkdhvpcsrcuaq` schema.

Two scripts, both plain Node ESM (Node ≥ 20, no build step), both covered by `npm test`:

| Script | Job |
|---|---|
| `scripts/statuslog.mjs` | Appends one line per stage gate to the Notion **Briefing Library V2.0 Regeneration Status Log** (page `41389a0c1680803dbb99e929c19d402d`) through the public Notion API. |
| `scripts/lanes/run.mjs` | Runs one lane: reads `briefing_lanes`, selects candidate briefings, stages one `briefings_versions` draft per brief, logs `DRAFTED`, writes one `automation_health_log` row. |

The Notion **API** was chosen over MCP (the issue's recommendation) so the same module runs from
pg_cron-driven workers, Vercel and Claude Code alike.

## 1. Environment

| Variable | Used by | Notes |
|---|---|---|
| `NOTION_TOKEN` | statuslog | Internal-integration token with access to the status page. **Never committed.** Absent ⇒ the writer prints lines to stdout instead of sending. |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | runner | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | runner | Must be a JWT whose `role` claim is `service_role`; any other role (or a non-JWT) makes the runner **refuse to start**. The lane and version tables are deny-all RLS, so nothing else could work anyway. |

## 2. Status-log writer — `scripts/statuslog.mjs`

```js
import { createStatusLog } from './scripts/statuslog.mjs';
const sl = createStatusLog();                      // or createStatusLog({ dryRun: true })
sl.log({ briefing_id, lane, tier, gate: 'DRAFTED', result: 'PASS', sentence: '…' });
sl.question({ issue: 'FDY-280', text: '…', default: '…' });
sl.note('free-text line under Log');              // for step-style lines (e.g. BL2-01)
await sl.flush();                                  // sends everything queued
```

Formats are fixed by the page header. Time is **America/Chicago**, rendered `CT` (CST or CDT as the
date dictates):

```
log       YYYY-MM-DD HH:MM CT · <id8> · <lane> · <tier> · <gate> · <result> · <sentence>
question  YYYY-MM-DD HH:MM CT · <issue> · <text> · Default: <default>
```

- `gate` ∈ `DRAFTED · G1-AUTO · G2-PANEL · G3-XCHECK · QUEUED · PUBLISHED`; `result` ∈ `PASS · FAIL · PARKED · PUBLISHED`. Anything else throws before a request is made.
- Newlines and stray `·` inside a field are flattened so the column count stays fixed.
- **Placement:** `flush()` reads the page's top-level children once, finds the `## Log` and
  `## Questions for Myke` headings, and inserts with the API's `after` parameter at the end of each
  section. Order of the sections on the page does not matter; a missing heading is an error, never a
  silent append in the wrong place.
- **Batching:** ≤ 100 blocks per append call (Notion's limit), `after` chained through batches so
  order is preserved; one rich-text run per line, truncated at 2,000 characters.
- **Retries:** 429 and 5xx are retried up to 5 times, honouring `Retry-After` (else 1 s · 2ⁿ).
  Error messages never include the token.
- `log()` / `question()` queue and return the formatted line; nothing is sent until `flush()`.

CLI for one-off lines: `node scripts/statuslog.mjs log --briefing-id … --lane … --tier … --gate … --result … --sentence "…" [--dry-run]`,
`… question --issue … --text … --default … [--dry-run]`, `… note "text" [--dry-run]`.

## 3. Lane runner — `scripts/lanes/run.mjs`

```
node scripts/lanes/run.mjs --lane <lane> [--quota N] [--dry-run] [--fixtures <dir>] [--flush-every N]
```

| Flag | Meaning |
|---|---|
| `--lane` | One of `theaters · domains · subdomains · companies · states · countries · institutions` (the BL2-01 `briefing_lanes` vocabulary). Required. |
| `--quota N` | Overrides `briefing_lanes.daily_quota`. Required while the lane row does not exist. |
| `--dry-run` | **Writes nothing anywhere** — no `briefings_versions` row, no cursor update, no health row, no Notion line. Every line that would be logged is printed. Without Supabase env it reads `scripts/lanes/fixtures/`. |
| `--fixtures <dir>` | Read `briefing_lanes.json` + `briefings.json` from a directory instead of Supabase (writes stay in memory and are summarised). |
| `--flush-every N` | Status-log flush cadence in briefs (default 10; always flushes at the end). |

### 3.1 Selection

Base eligibility: `status in ('planned','draft')` **and** `tier is not null` **and** `briefing_type is not null`.
Then the lane filter:

| Lane | `briefing_type` | Extra condition |
|---|---|---|
| `theaters` | `theater` | — (the Deep lane) |
| `domains` | `sector` | — |
| `subdomains` | `thread` | — |
| `companies` | `company` | `company_id` set |
| `institutions` | `company` | `institution_id` set and `company_id` null |
| `states` | `jurisdiction` | `jurisdiction_id ~ '^US-[A-Z]{2}$'` |
| `countries` | `jurisdiction` | `jurisdiction_id ~ '^[A-Z]{2}$'` |

`company`/`jurisdiction` types and `jurisdiction_id` arrive with BL2-01 (FDY-277, migration
`20261109120000_bl2_01_types_and_review.sql`, not yet applied). Until then those four lanes select
nothing on the live DB, and the draft row only carries `jurisdiction_id` when the source row has it.

### 3.2 Cursor

`briefing_lanes.cursor` is `{ "last_id": <uuid|null>, "last_run_at": <iso> }` — a keyset on `briefings.id`
ascending. Selection is `id > last_id`, up to quota; the cursor is **checkpointed after every brief**, so
a killed run resumes where it stopped. When a run finds nothing past the cursor it resets `last_id` to
null (one log line on stdout) and the next run starts from the top — at which point a brief whose draft
is already staged hits the `(briefing_id, version, kind)` unique constraint and is logged `FAIL · Draft vN
already staged …` with nothing written. Whether a second pass should re-draft is BL2-05's decision.

### 3.3 Writes (exactly)

For each selected brief, `generate(brief)` is called and **one** row is inserted:

```
briefings_versions
  briefing_id, version = briefings.version + 1, kind = 'draft', status = 'draft',
  title, tier, page_target, sector_id, thread_id, theme_tags, briefing_type,
  institution_id, company_id, [jurisdiction_id],          -- copied from the briefing
  hypothesis, contents[], byline, source_refs, evidence_from, evidence_to,   -- from generate()
  last_refreshed = null, published_at = null, job = 'lane-<lane>', created_by = 'briefing-lane-runner_v0.1'
```

The live `briefings` row is **never** touched (BL-10 rule; promotion is a separate human step via
`briefings_version_promote`). Then one status line: `… · <lane> · <tier> · DRAFTED · PASS · Staged draft vN of "<title>" (…)`.

Per run, **one** `automation_health_log` row: `auto_id = 'AUTO-PROVISIONAL'` (registry grant pending —
do **not** self-assign a number), `crawler_id = 'briefing-lane-runner_v0.1'`, `artifacts_found` =
candidates, `artifacts_new` = drafts staged, `artifacts_duped` = unique-constraint skips, `errors[]`
per failed brief, `success = errors.length === 0`. A blocked lane (`blocked_reason` set) still writes
its health row and selects nothing.

### 3.4 Failure handling

Each brief is wrapped in try/catch: a failure (unknown tier, generator error, insert error) is logged
`DRAFTED · FAIL · Drafting failed: <message>`, recorded in the health row, the cursor still advances,
and the run continues. The process exits 1 if any brief failed, 2 on configuration errors
(bad args, wrong key role, missing lane row without `--quota`).

### 3.5 `generate()` stub — `scripts/lanes/generate.mjs`

Returns the tier template's section skeleton (transcribed from `docs/templates/{deep,standard,profile}.md`),
`hypothesis` = an explicit placeholder, `source_refs = []`, the byline rule (Deep → editorial,
Standard → Gilbert Faraday, Profile → none) and the FDY-281 evidence window (Deep 12 mo · Standard 6 mo ·
Profile 12 mo). Unknown tiers throw (and so land in the FAIL path). BL2-05 replaces this module; the
runner's contract is `generate(brief, { now }) → { title, hypothesis, contents[], source_refs[], byline, evidence_from, evidence_to }`.

## 4. Dry run against local fixtures

```sh
for l in theaters domains subdomains companies states countries institutions; do
  node scripts/lanes/run.mjs --lane $l --dry-run
done
```

`scripts/lanes/fixtures/` holds seven lane rows (institutions deliberately blocked) and eleven briefings:
one per lane, plus a published row and an untiered row (never selected) and a `tier = 'brief'` row in
`domains` that exercises the FAIL path. Output on 2026-11-09:

```
… · fx000100 · theaters · deep · DRAFTED · PASS · Staged draft v2 of "The Power Reckoning" (template skeleton, generator stub, 0 sources, 9 sections).
… · fx000200 · theaters · deep · DRAFTED · PASS · Staged draft v4 of "The Inference Economy" (…, 9 sections).
… · fx000300 · domains · standard · DRAFTED · PASS · Staged draft v2 of "Grid & Regulatory" (…, 6 sections).
… · fx000400 · domains · brief · DRAFTED · FAIL · Drafting failed: unknown tier "brief" (expected deep|standard|profile)
… · fx000500 · subdomains · standard · DRAFTED · PASS · Staged draft v3 of "Interconnection Queue & Grid Access" (…).
… · fx000600 · companies · profile · DRAFTED · PASS · Staged draft v2 of "CoreWeave" (…, 5 sections).
… · fx000800 · states · standard · DRAFTED · PASS · Staged draft v2 of "Texas" (…).
… · fx000900 · countries · standard · DRAFTED · PASS · Staged draft v2 of "Germany" (…).
[lane-runner] lane "institutions" is blocked: fixture: lane paused pending institution taxonomy; nothing selected
```

## 5. Tests

`npm test` → `src/tests/statuslog.test.ts` (formatting incl. CST/CDT, section placement via `after`,
100-block batching, 429 backoff, no-token/dry-run behaviour, token never in errors) and
`src/tests/lane-runner.test.ts` (arg parsing, service-role refusal, per-lane selection, version+1 draft
row shape, per-brief try/catch, cursor resume + wrap + duplicate detection, blocked lane, dry-run writes
nothing). Notion and Supabase are mocked; no test touches the network. `npm run typecheck` is clean.

## 6. Not done here / follow-ons

- **No schedule.** Nothing runs on its own; cron entries (via `cron_http_post` + Vault, FAR-344) are a
  later ticket once BL2-05's generator is in and BL2-01's tables exist.
- **`briefing_lanes` does not exist yet** (BL2-01). The runner detects the missing table and asks for `--quota`.
- **Registry id** for the health row is provisional (`AUTO-PROVISIONAL`); replace the constant in
  `scripts/lanes/run.mjs` when granted.
- **Branch note:** the issue named `brief/bl2-04-runner`; this session's harness pins its work to
  `claude/wonderful-pascal-mohf8p`, so the PR comes from that branch.
