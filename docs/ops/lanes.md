# Lane runner, generator and status-log writer (BL2-04 · BL2-05)

**Linear:** FDY-280 (BL2-04) and FDY-281 (BL2-05), release 46-26-v01, Briefing Library project.
**State: generator LIVE in code, no production writes made by this work.** `generate()` is the
sourced BL2-05 generator; the BL2-04 stub is gone. Written 2026-11-09 CT against the live
`ycadmmngkdhvpcsrcuaq` schema. Full generator notes are in §7 of this file.

| Script | Job |
|---|---|
| `scripts/statuslog.mjs` | Appends one line per stage gate to the Notion **Briefing Library V2.0 Regeneration Status Log** (page `41389a0c1680803dbb99e929c19d402d`) through the public Notion API. |
| `scripts/lanes/run.mjs` | Runs one lane: reads `briefing_lanes`, selects candidate briefings, generates a sourced draft per brief (`--width` at a time), stages one `briefings_versions` row each, logs `DRAFTED` (+ `G1-AUTO · FAIL` for out-of-range or thin drafts), writes one `automation_health_log` row. |
| `scripts/lanes/run-all.mjs` | One worker per lane (7) in one process, sharing one Chromium page counter and one model-call semaphore (12). |
| `scripts/lanes/generate.mjs` · `evidence.mjs` · `compose.mjs` · `llm.mjs` | The generator: evidence retrieval → deterministic citation-first composition → render-check fit loop → optional model polish. |
| `scripts/templates/manuscript.mjs` | Markdown manuscript → tier HTML (Deep shell / BL-09 stylesheet) → Letter PDF page count. `node scripts/templates/render.mjs --manuscript <file|dir>` is the render check. |

The Notion **API** was chosen over MCP (the issue's recommendation) so the same module runs from
pg_cron-driven workers, Vercel and Claude Code alike.

## 1. Environment

| Variable | Used by | Notes |
|---|---|---|
| `NOTION_TOKEN` | statuslog | Internal-integration token with access to the status page. **Never committed.** Absent ⇒ the writer prints lines to stdout instead of sending. |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | runner | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | runner | Must be a JWT whose `role` claim is `service_role`; any other role (or a non-JWT) makes the runner **refuse to start**. The lane and version tables are deny-all RLS, so nothing else could work anyway. |
| `ANTHROPIC_API_KEY` | generator (optional) | Enables the model polish of the thesis + Faraday's Take (`llm.mjs`). Absent ⇒ deterministic composition only; the drafts are still complete and valid. `BL2_MODEL` (default `claude-opus-5-5`) and `BL2_MODEL_CONCURRENCY` (default 12) tune it. |
| `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH` | render check (optional) | Override where Playwright / Chromium are found. By default the pre-installed `playwright` package resolves via CommonJS from any directory. If neither is available the runner stages drafts with pages **unmeasured** and says so. |

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
node scripts/lanes/run.mjs --lane <lane> [--quota N] [--dry-run] [--fixtures <dir>] [--evidence <dir>]
                           [--emit <dir>] [--width 3] [--no-render] [--no-llm] [--flush-every N]
node scripts/lanes/run-all.mjs [--dry-run] [--emit <dir>] [--lanes a,b] [--quota N] [--width 3] [--fixtures] [--no-render] [--no-llm]
```

| Flag | Meaning |
|---|---|
| `--lane` | One of `theaters · domains · subdomains · companies · states · countries · institutions` (the BL2-01 `briefing_lanes` vocabulary). Required. |
| `--quota N` | Overrides `briefing_lanes.daily_quota`. Required while the lane row does not exist. |
| `--dry-run` | **Writes nothing anywhere** — no `briefings_versions` row, no cursor update, no health row, no Notion line. Every line that would be logged is printed. Without Supabase env it reads `scripts/lanes/fixtures/`. |
| `--fixtures <dir>` | Read `briefing_lanes.json` + `briefings.json` from a directory instead of Supabase (writes stay in memory and are summarised). |
| `--flush-every N` | Status-log flush cadence in briefs (default 10; always flushes at the end). |
| `--evidence <dir>` | Read evidence packs (`<briefing_id>.json`, captured read-only from production) instead of querying Supabase. Default in fixture mode: `scripts/lanes/fixtures/evidence/`. |
| `--emit <dir>` | Also write every manuscript as `<dir>/<lane>-<slug>.md` with a header carrying the measured page count and source count (how `docs/briefs/samples/` was produced). |
| `--width N` | Briefs drafted concurrently per lane (default 3). |
| `--no-render` | Skip the Playwright page-count check (drafts stage with pages unmeasured). |
| `--no-llm` | Force deterministic composition even when `ANTHROPIC_API_KEY` is set. |

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
  manuscript_md,                                            -- BL2-05 column (migration 20261109150000); until it is
                                                            -- applied the manuscript is stored as contents[0]
  last_refreshed = null, published_at = null, job = 'lane-<lane>', created_by = 'briefing-lane-runner_v0.2'
```

Plus, only when an automatic G1 blocker fires, **one** `briefing_reviews` row
(`gate='G1-AUTO'`, `result='FAIL'`, `reviewer='briefing-lane-runner_v0.2'`, `blockers[]` =
`page_range` and/or `thin`). The draft is staged regardless; the review row is what the BL2-06
gates and the sign-off queue read.

The live `briefings` row is **never** touched (BL-10 rule; promotion is a separate human step via
`briefings_version_promote`). Then one status line per brief —
`… · <lane> · <tier> · DRAFTED · PASS · Staged draft vN of "<title>" (<tier>, <N> pp, <M> sources).` —
and, when the measured page count is outside the tier range or a Profile is thin, a second line
`… · G1-AUTO · FAIL · Page count 11 outside the standard range 8–10; draft vN staged for review.` /
`… · G1-AUTO · FAIL · Thin record: 4 sourced Signals (< 6); draft vN staged and flagged thin.`

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

### 3.5 `generate()` — see §7

The runner's contract is `generate(brief, { now, lane }) → { title, hypothesis, contents[],
source_refs[], byline, evidence_from, evidence_to, manuscript_md, pages, page_range, in_range,
render_checked, thin, signal_count, source_count, … }`. `buildGenerator()` in `run.mjs` wires the
evidence source, the shared page counter, the polisher and the `--emit` writer; `run-all.mjs`
shares one of each across the seven lanes.

## 4. Dry run against local fixtures

```sh
npm run lanes:samples            # = node scripts/lanes/run-all.mjs --dry-run --emit docs/briefs/samples
node scripts/templates/render.mjs --manuscript docs/briefs/samples   # re-measure the emitted files
```

`scripts/lanes/fixtures/` holds seven lane rows and eleven briefings: one per lane (the Theater,
Sector, Thread, Company, Institution, US-state and country subjects below), plus a published row
and an untiered row (never selected), a `tier = 'brief'` row in `domains` that exercises the FAIL
path, and a second Theater (The Inference Economy) with **no evidence pack**, which exercises the
missing-evidence FAIL path. `scripts/lanes/fixtures/evidence/<briefing_id>.json` are **real
records captured read-only from production on 2026-11-09** (signals + artifact envelopes +
companies/institutions rows + taxonomy; for the two jurisdictions also the Jurisdiction Watch
posture row, `jps_history`, Moratorium Nation rows, PUC signals with their docket URLs,
`jw_signal_events`, and a full-text artifact search). Fixture drafts are generated **as of the
capture time**, so they are reproducible.

Output on 2026-11-09 (all seven inside their tier range; counts re-measured from the committed
files with `render.mjs --manuscript`):

| Lane | Sample | Tier | Pages | Range | Sources | In scope |
|---|---|---|---|---|---|---|
| theaters | `theaters-the-power-reckoning.md` | Deep | **13** | 10–15 | 42 | 220 |
| domains | `domains-grid-regulatory.md` | Standard | **8** | 8–10 | 30 | 157 |
| subdomains | `subdomains-interconnection-queue-grid-access.md` | Standard | **10** | 8–10 | 36 | 111 |
| companies | `companies-coreweave.md` | Profile | **2** | 2 | 8 | 35 |
| institutions | `institutions-electric-reliability-council-of-texas.md` | Profile | **2** | 2 | 7 | 32 |
| states | `states-texas.md` | Standard (jurisdiction) | **10** | 8–10 | 19 | 168 |
| countries | `countries-germany.md` | Standard (jurisdiction) | **10** | 8–10 | 20 | 21 |

Marker ↔ `source_refs` parity is 100 % on all seven (asserted by `validate()` at compose time
and again by the tests). Fonts (Source Serif 4, IBM Plex Sans/Mono, Spectral) loaded on every
measurement; without them the fallback stack sets wider and counts can rise by a page.

## 5. Tests

`npm test` → `src/tests/statuslog.test.ts` (formatting incl. CST/CDT, section placement via `after`,
100-block batching, 429 backoff, no-token/dry-run behaviour, token never in errors),
`src/tests/lane-runner.test.ts` (arg parsing, service-role refusal, per-lane selection, version+1 draft
row shape incl. the `manuscript_md` ↔ `contents[0]` fallback, DRAFTED sentence, G1 review rows,
per-brief try/catch, `--width` concurrency with a monotonic cursor, cursor resume + wrap + duplicate
detection, blocked lane, dry-run writes nothing), `src/tests/generator.test.ts` (evidence text helpers,
every fixture pack normalised, every tier composed and validated — parity, cited prose, vocabulary —
Deep/Standard/Jurisdiction/Profile structure, thin flag, fit-loop budget rules, renderer parse +
HTML citations) and `src/tests/llm-polish.test.ts` (semaphore, polish validation, mocked model
client incl. refusal and failure paths, `run-all` arguments). Notion, Supabase and the model are
mocked; no test touches the network. PDF page counting is exercised by the dry run, not by the unit
tests. `npm run typecheck` is clean.

## 6. Not done here / follow-ons

- **No schedule.** Nothing runs on its own; cron entries (via `cron_http_post` + Vault, FAR-344) are a
  later ticket (BL2-08 pilots first).
- **Production has nothing to select yet.** All 436 live `briefings` rows carry `tier = NULL` and
  `briefing_type = NULL`, so every lane selects nothing on the live DB until the BL2-08 pilot sets
  tier/type on its 35 rows. `briefing_lanes.daily_quota` is 0 on all seven lanes (BL2-01 seed).
- **Live Supabase evidence queries are untested against production** — the dev container's egress
  blocks `*.supabase.co`, so `createSupabaseEvidence()` was written against the live schema (read
  via the Supabase MCP) and exercised only through the captured packs, which share the same
  normalisation code. First live run: `node scripts/lanes/run.mjs --lane companies --quota 1 --dry-run`
  with `SUPABASE_URL` + the service key set.
- **Model polish is opt-in and unexercised against the API** (no key in the build environment);
  it is covered by mocked tests and falls back to the deterministic text on any failure.
- **Registry id** for the health row is provisional (`AUTO-PROVISIONAL`); replace the constant in
  `scripts/lanes/run.mjs` when granted.
- **Branch note:** the issues named `brief/bl2-04-runner` / `brief/bl2-05-generator`; this
  session's harness pins its work to `claude/code-prompt-fdy-281-66x97r`, so the PR comes from that branch.

## 7. Generator (BL2-05)

### 7.1 Evidence — `scripts/lanes/evidence.mjs`

Evidence comes **only** from Faraday records: `public.signals` (framing — stored truncated at 240
chars, so `faradays_take` is used when it is the full text — with `event_date`, tags,
`source_url`, `artifact_id`), `public.artifacts` (envelope `title` / `source_name` / `summary`,
`published_at`, `license_status`; body text where fetched), `public.companies`,
`public.institutions`, the `faraday_*` taxonomy and, for jurisdiction briefs, the Jurisdiction
Watch tables read-only (`jurisdictions` posture row + `jps_history`, `moratorium_nation_inventory`,
`puc_signals → puc_filings → puc_dockets` for the docket URL, `jw_signal_events`, `jw_facilities`,
`state_incentive_disclosures`, plus an `artifacts.fts` search for "<name> data center"). Nothing
comes from model memory.

Retrieval per type: **theater** → Signals whose Thread tags belong to the Theater
(`faraday_subdomains.theme_tags`; Threads tagged to ≥ 6 Theaters — media coverage, the conference
circuit — are generic and never decide membership); **sector** → `domain_tags` ∪ the Sector's
Threads; **thread** → `subdomain_tags`; **company / institution** → `company_tags`
(institutions through `institutions.company_uid`); **jurisdiction** → Signals naming the
jurisdiction or its ISO + the JW tables + the artifact search. Window: Deep 12 mo · Standard
6 mo · Profile 12 mo · jurisdiction 12 mo. Items are filtered to the window, de-duplicated by URL
and headline, blocked licences dropped, and only **complete clauses** of a recorded summary are
kept. Each item carries `date · publisher · headline · text[] · url · title · kind · id ·
artifact_id · published_at · license` — exactly the `source_refs` shape the templates specify
(`url` + `title` required; `kind`, `id`, `publisher`, `published_at`, `artifact_id`, `used_in`).

### 7.2 Composition — `scripts/lanes/compose.mjs`

Deterministic and citation-first. Every factual sentence is a record's own clause followed by
its `[Sn]`; markers are issued in order of first appearance and never reused; the Sources page
lists exactly the `source_refs` array. `validate()` rejects a draft (the generator throws) when a
marker lacks an entry, an entry is never cited, a prose line of ≥ 25 characters outside the cover
and Sources carries no marker (statements *about the record* — "The record holds no dated Signal
…" — are the whitelisted exception), "Key Player" appears, or an internal code (`D3.1`, `T-001`)
appears outside the Sources page.

| Tier | Structure | Byline | Notes |
|---|---|---|---|
| Deep (Theater) | Cover · Summary (thesis, 4–6 findings, what to watch) · 4–7 Sector sections (claim deck, dated entries, figure table) · Signals to watch (only sentences naming a forward date) · Faraday's Take · Sources & methodology | Faraday Editorial | Take argues only over cited facts; opinion sentences start "Faraday's reading" / "Our view". |
| Standard (Sector / Thread) | Cover · The argument (+ At a glance) · 3–5 Thread sections · Signal register (named parties with the `companies` role) · Faraday's Take · Sources | Gilbert Faraday | Thread briefs add the Threads most co-tagged in the same Signals. |
| Standard (Jurisdiction) | Cover (posture record first) · The argument · **Legislation & rules · Permitting & siting · Power & utility regulation · Incentives & tax · Water/environment · Signals to watch** · Signal register · Take · Sources | Gilbert Faraday | "Informational, not legal advice." in the method note; an empty heading is stated, never padded; CC-BY attribution printed whenever a Moratorium Nation record is cited. |
| Profile (Company / Institution) | Header · Identity card (each value cited to the companies/institutions record) · What the record shows · Dated Signals (≤ 8, newest first) · Sources & method | none | No Take, no CTA, no rating. **Thin** when < 6 sourced Signals exist in the window (a `briefing_reviews` G1 blocker; still staged). |

### 7.3 Render check and fit loop — `scripts/templates/manuscript.mjs`, `scripts/lanes/generate.mjs`

The manuscript renders to the Deep shell (`scripts/deep-brief/shell.html`) or the BL-09
stylesheet (`scripts/templates/styles.mjs`, shared with `render.mjs`) and is printed to a Letter
PDF by Playwright + the pre-installed Chromium; pages are counted from the PDF's `/Type /Page`
objects (the BL-09 method). When the count is outside the tier range the draft is **re-composed on
a smaller or larger budget** — sentences per entry, entries per section, number of sections; for
Profiles the lead, then sentences, then entries down to 4 — never by shrinking type, up to six
times. An out-of-range draft is still staged and logged `G1-AUTO · FAIL` with the count.

### 7.4 Model polish (optional) — `scripts/lanes/llm.mjs`

With `ANTHROPIC_API_KEY` set, the thesis paragraph and Faraday's Take are rewritten by
`claude-opus-5-5` (override with `BL2_MODEL`) from **only** the sentences already cited in the
draft, each tagged with its marker. The reply is accepted only if every marker exists, every
factual sentence carries a marker, every digit-bearing token appears in the cited evidence, the
vocabulary rules hold and the re-measured page count stays in range; otherwise the deterministic
text stands and the reason is recorded (`polish_reason`). Model calls across all lanes share one
semaphore of 12 (`BL2_MODEL_CONCURRENCY`). Profiles are never polished.

### 7.5 Migration — `supabase/migrations/20261109150000_bl2_05_manuscript_md.sql`

Adds `manuscript_md text` to `briefings` and `briefings_versions` and carries it through the
BL-10 snapshot / promote / restore functions. Additive only (two nullable columns, three
`CREATE OR REPLACE` bodies); per the FDY-281 rule it may be applied once the PR is merged. Until
then the runner probes for the column once per run and stores the manuscript as `contents[0]`.
