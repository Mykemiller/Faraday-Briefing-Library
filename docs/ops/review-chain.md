# Review chain — G1 automated gate, G2 ThoughtForge panel, G3 cross-checkers (BL2-06)

**Linear:** FDY-282 (BL2-06), release 46-26-v01, Briefing Library project. **State: built and
dry-run on fixtures — no production row was written, no status-log line was sent.** Written
2026-11-09 CT against the live `ycadmmngkdhvpcsrcuaq` schema (`briefing_reviews`, `briefing_lanes`,
`briefings_versions` all present; `briefings_versions` holds 0 rows).

| Script | Job |
|---|---|
| `scripts/review/run.mjs` | The chain: selects due drafts, runs the gates, writes `briefing_reviews`, requeues/parks, logs one status line per gate per brief. |
| `scripts/review/g1.mjs` | G1-AUTO — deterministic checks, no model, no network (pure; covered by `npm test`). |
| `scripts/review/render.mjs` | Manuscript → HTML → Letter PDF → page count (Playwright + the pre-installed Chromium); also the preview the sign-off queue links to. |
| `scripts/review/panel.mjs` | G2 presets + persona prompts (from the ThoughtForge cast), G3 reviewer prompts, verdict rules, Anthropic SDK path and the import path. |
| `scripts/review/fill-chair.mjs` | Import workflow: fills the chair's prompt with the panelists' JSON once they exist. |
| `scripts/review/fixtures/` | Seven drafts (one per lane), captured source texts, the 21 review rows from the dry run. `README.md` there explains each file. |
| `docs/ops/signoff-queue.sql` | `v_briefing_signoff_queue` — the daily sign-off view (not applied; see §3.4). |

Premise check, flagged first: the FDY-282 prompt says "run the chain on the 7 BL2-05 samples".
**BL2-05 (FDY-281, the sourced generator) is in Backlog with no PR**, so no BL2-05 drafts exist. The
dry run used the nearest real material (§8): the BL-08 Deep sample, three BL-09 samples converted to
the BL2-05 manuscript shape, and — for the three lanes with no sourced sample — exactly what the BL2-04
lane runner stages today (template skeleton, no sources).

## 1. What runs

```
briefings_versions draft (kind='draft')
   │  due = no briefing_reviews row for (briefing, version, gate) and previous gate PASS
   ▼
G1-AUTO  reviewer "g1-auto"                      deterministic (§4)
   ▼ PASS
G2-PANEL reviewer "tf-panel:<preset>"            ThoughtForge panel (§5)
   ▼ PASS
G3-XCHECK reviewer "xcheck-facts+xcheck-voice"   two independent sessions, no shared context (§6)
   ▼ PASS
status-log QUEUED → v_briefing_signoff_queue → Myke signs off → briefings_version_promote (human)
```

A FAIL at any gate returns the draft to its lane (§3.2). Two consecutive FAILs at the same gate park it
(§3.3). The chain writes `briefing_reviews` only — never the live `briefings` row (BL-10 rule).

## 2. Running it

```
node scripts/review/run.mjs --gate G1|G2|G3|all [--lane <lane>] [--quota N] [--dry-run]
     [--fixtures <dir>] [--all-gates] [--panel api|import|emit] [--import <dir>]
     [--emit-prompts <dir>] [--out <dir>] [--emit-reviews <file>]
```

| Flag | Meaning |
|---|---|
| `--gate` | `G1`, `G2`, `G3` or `all` (G1 → G2 → G3, stopping at the first FAIL). Required. |
| `--lane` | Restrict to drafts whose `job = 'lane-<lane>'` (BL2-01 vocabulary). |
| `--quota N` | At most N drafts this run. |
| `--dry-run` | **Writes nothing anywhere** — no review row, no requeue, no health row, no Notion line (every line is printed). Without Supabase env it reads `scripts/review/fixtures/`. |
| `--fixtures <dir>` | Read drafts/briefings/lanes/prior reviews/sources from a directory instead of Supabase. |
| `--all-gates` | Run every requested gate even after a FAIL (dry runs and fixtures only — the flow rule is "a FAIL returns the draft to its lane"). |
| `--panel api` | G2/G3 reviewers through the Anthropic SDK (`claude-opus-5-5`, adaptive thinking, JSON-schema output). Needs `ANTHROPIC_API_KEY` (or an `ant auth login` profile). **Not exercised in this session — no key in the container.** |
| `--panel import --import <dir>` | Read reviewer JSON written by independent sessions (file names from `importName()`: `<id8>-v<n>.G2.<slug>.json`, `….G2.chair.<slug>.json`, `….G3.xcheck-facts.json`, `….G3.xcheck-voice.json`). A missing file ⇒ the gate is *incomplete*: nothing is written, the draft stays due. |
| `--panel emit --emit-prompts <dir>` | Write every reviewer's exact `{system, user, schema, output_file}` so independent sessions can run them. Then `node scripts/review/fill-chair.mjs <prompts> <import>` fills the chair prompts. |
| `--out <dir>` | Where rendered HTML/PDF previews land (default `$TMPDIR/bl2-06-review`). Live runs also upload the PDF to Storage `library-previews/review/<briefing_id>/v<n>.pdf`. |
| `--emit-reviews <file>` | Dump the review rows this run produced (how `fixtures/reviews.sample.json` was made). |

Environment: `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY` (the runner
refuses any key whose `role` is not `service_role` — every table it touches is deny-all RLS),
`NOTION_TOKEN` for the status log (absent ⇒ lines print), `THOUGHTFORGE_CAST_DIR` (default
`../thoughtforge/cast`), `REVIEW_MODEL` (default `claude-opus-5-5`). One `automation_health_log` row
per live run (`crawler_id = briefing-review-chain_v0.1`, `auto_id = AUTO-PROVISIONAL` — registry grant
pending, do not self-assign).

## 3. Selection and flow

### 3.1 Due

A draft is due at a gate when its current version has **no `briefing_reviews` row for that gate** and
(for G2/G3) the previous gate's latest row for the same version is `PASS`. The live adapter considers
only the newest draft version per briefing. Lane comes from `briefings_versions.job` (`lane-<lane>`).

### 3.2 FAIL → requeue

`briefing_lanes.cursor.requeue[]` gains (or replaces, keyed on briefing+version+gate):

```json
{ "briefing_id": "…", "version": 2, "next_version": 3, "gate": "G2-PANEL",
  "blockers": [ … ≤50 … ], "required_edits": [ {kind, location, edit, reason} … ],
  "parked": false, "requeued_at": "2026-11-09T…" }
```

The generator (BL2-05) reads this on its next pass and must address `required_edits` in version
`next_version`. One status line: `… · <gate> · FAIL · <sentence>`.

### 3.3 Two consecutive FAILs → PARKED

If the most recent earlier attempt at the same gate (an older version, or an earlier run of this
version) was FAIL, the status line reads `PARKED` ("Second consecutive FAIL at <gate> (v1 then v2);
parked. …"), a **Questions for Myke** line is written with the first blockers and the default
*"skip this brief this release"*, and the requeue entry carries `parked: true` so the generator does
not re-draft blindly. A G3 disagreement (§6) also parks. The `briefing_reviews.result` CHECK is
`PASS|FAIL`, so a parked verdict is stored as `FAIL` with `notes.parked = true`.

### 3.4 G3 PASS → QUEUED

Status line `… · QUEUED · PASS · Queued for sign-off: v2, 13 pages, panel min score 3/5; see
v_briefing_signoff_queue.` No table write is needed. BL2-07 (FDY-283, migration
`20261109150000_bl2_07_briefing_signoff.sql`) already created `v_briefing_signoff_queue` — every staged
draft ahead of the live row with its latest G1/G2/G3 result and Myke's `briefing_signoff` approval.
`docs/ops/signoff-queue.sql` is a `create or replace` of that view that keeps BL2-07's 20 columns
verbatim and **appends** the review-chain columns the ticket asked for: `lane`, `pages` (the G1 row's
score), `scores` (panel scores/min/preset/could-a-buyer-act, facts+voice verdicts with the
numbers-checked counts, G1 stats — read from `briefing_reviews.notes`), `preview_path`, and two
booleans, `queued` (latest G3 is PASS and not parked) and `parked`. It must be applied **after** the
BL2-07 migration; the daily query is `where queued and not approved`. Security-invoker, `service_role`
only. **Not applied** (Founder decision 4: the merged PR is the approval to apply).

## 4. G1-AUTO (deterministic)

Input: the draft (`contents[0]` = manuscript Markdown, `source_refs[]`), its parent `briefings` row, the
measured PDF page count, and a source resolver. Blockers, with their codes:

| # | Check (FDY-282) | Code(s) |
|---|---|---|
| 1 | marker ↔ `source_refs` parity — every `[Sn]`/`[n]`/`[n, m]` has an entry, every entry is cited | `marker_without_ref`, `ref_uncited`, `ref_duplicate`, `ref_without_number` |
| 2 | every source url resolves to a Faraday record (`artifacts`/`signals` by `source_url`, incl. the protocol-relative and `?utm_…` variants the crawlers store; `supabase://…/public.<companies|institutions|jw_*|jpas_*|jps_*>?key=val`; `airtable://…<rec>` = the brief's own record) **or** is a primary URL recorded on the brief (`briefings.source_refs`) | `source_unresolved`, `source_without_url` |
| 3 | measured PDF pages in tier range — Deep 10–15 · Standard 8–10 · Profile exactly 2 | `pages_out_of_range`, `pages_unmeasured`, `unknown_tier` |
| 4 | banned vocabulary — "Key Player" anywhere; internal codes (`D3`, `D3.5`, `T-001`, `cmp_…`, `inst_…`, `rec…`, `supabase://`, `airtable://`) outside the Sources page | `banned_vocabulary`, `internal_code_in_body` |
| 5 | Profile has no Faraday's Take and no call-to-action | `profile_has_take`, `profile_has_cta` |
| 6 | jurisdiction brief carries "Informational, not legal advice." | `missing_not_legal_advice` |
| 7 | every number in the body appears verbatim in its cited source text | `number_mismatch` (blocker), `number_unverifiable` (warning: the cited record has no captured text) |
| + | structural: empty `source_refs`; BL2-04 stub placeholders still present | `no_sources`, `placeholder_content` |

Number check, as built: body text = every section except the cover and the Sources page; units are
sentences, list items and table rows (a table inherits the citations of its header row and of the
paragraph before it; a sentence without a marker inherits the next cited sentence's markers in its
paragraph). Both sides are normalised the same way — thousands separators dropped, decimal commas
(`3,5 Megawatt`), `$4.25 billion`/`$4.25B`/`€810 M` → `4.25b`/`810m`, SI units glued (`438,000 MW` →
`438000mw`, `89 percent` → `89%`), `3.0` → `3`, `200+ MW` → `200mw`; a lower-case `m` after a number is
a metre (`22,000 m²`), never a million. ISO dates expand to the forms a source might carry, year
ranges (`2028–29`) to both spellings, fractions and dates with a slash (`24/7`) are not numbers.
Matching is on digit boundaries, against the record's text **plus** its title and dates
(`published_at`, signal `fired_at`, the ref's own `published_at`) — a Signal entry's date line is
metadata, not a claim. **A numeric sentence with no citation is a warning, not a blocker**: FDY-281's
"every factual sentence carries [Sn]" is the generator's rule, and the Take legitimately carries
none. The Deep sample's Faraday's Take and thesis paragraph are exactly that case.

`score` on the G1 row = measured pages. Rendering: Deep through `scripts/deep-brief/build.mjs` (the
BL-08 renderer of record), Standard/Profile through `render.mjs`'s Markdown renderer wearing the BL-09
stylesheet; Letter, the template's own `@page` margins, fonts awaited. Measured on the fixtures: Deep
13 · Standard 9 and 9 · Profile 2 — in line with `docs/templates/test-results.md` (12 · 10/9/9 · 2).

## 5. G2-PANEL (ThoughtForge)

**Which panel was used, and why.** The prompt says: use the ThoughtForge API if reachable, otherwise
load the persona files and run the panel as subagents with the same personas. Finding: the ThoughtForge
app has no review API — its `/api/ask` is an SSE "ask the panel" session behind the `TF_ACCESS_KEY`
cookie and returns a ruling, not the JSON this gate needs; and no ThoughtForge host answered from the
runner's network (the Vercel app's domain is not on the egress allowlist). **So the panel is
reconstructed from the persona files in the `thoughtforge` repo** (`cast/<slug>/persona.json`,
`dossier.md` Backstory, the panelist's own `skills/*/SKILL.md`, the shared `evidence-ladder` skill),
composed in the same order the ThoughtForge app composes its system prompts, plus the review turn. In
production `--panel api` sends those prompts through the Anthropic SDK; **for this dry run every
reviewer was an independent Claude Code subagent (fresh context, the exact emitted prompt file, no
other input), 41 sessions in all** — 36 panelists and cross-checkers in parallel, then the 5 chairs.
The repo copy of the cast is canonical (TF-DEC-40); nothing is copied into this repo.

The panel receives **the manuscript and the sources list only**. Founder instruction encoded in the turn:
judge whether a *buyer could act on the brief*, not style. Each member returns

```json
{ "thesis_clear": 0-5, "evidence_sufficient": 0-5, "what_to_watch_useful": 0-5,
  "could_a_buyer_act": bool, "required_edits": [{ "kind": "factual|structural|style", "location", "edit", "reason" }],
  "note": "<60 words, own voice" }
```

Members review in parallel; Gilbert Faraday (Chief of Staff) consolidates with all member reviews in
context and returns the same shape, which is the panel's verdict. **The verdict rule is code, not the
model:** `FAIL` if any score < 3 or any required edit is `factual`. `score` on the G2 row = the
minimum of the three scores; `notes` carries preset, per-member scores, the chair's edits and note.

**Presets** (by `sector_id`; default `faraday-editorial`; reviewer label `tf-panel:<preset>`). Every
full panel carries the Fact-Checker; the Press Lead sits on every non-jurisdiction panel for the
"would a buyer understand it" read.

| Preset | Sectors | Members (chair: gilbert-faraday) |
|---|---|---|
| `faraday-editorial` | default, D22 | constance-wright · delia-marchetti |
| `power-grid` | D2 D3 D9 | + mach-eigen · albert-thorne |
| `capital` | D4 | + victoria-stroud |
| `hyperscale-cloud` | D5 D6 | + victoria-stroud · margo-brandt |
| `thermal` | D1 D7 | + ingrid-halverson · mach-eigen |
| `site-build` | D10 D14 D20 | + margo-brandt · hartford-nakamura |
| `community-policy` | D13 D18 D19 | + rosalind-ferraro · hartford-nakamura |
| `jurisdiction` | `briefing_type = jurisdiction` | constance-wright · albert-thorne · hartford-nakamura · rosalind-ferraro |
| `profile-light` | `tier = profile` | **one expert, no chair** — D4/D5/D6 victoria-stroud · D2/D9 mach-eigen · D3 albert-thorne · D1/D7 ingrid-halverson · D10/D14/D20 margo-brandt · D13/D18 rosalind-ferraro · D19 hartford-nakamura · else gilbert-faraday |

## 6. G3-XCHECK (two independent sessions, in parallel)

- **Reviewer A `xcheck-facts`** receives the manuscript + the raw source texts (from the same resolver
  G1 used) and nothing else — no lane notes, no panel output, no house style. It re-derives every cited
  number and date; a `mismatch` (value, unit, date, party, direction not stated by the *cited* source)
  fails; `unverifiable` (no or truncated source text) does not. It lists every sentence it cleared.
- **Reviewer B `xcheck-voice`** receives the manuscript + Brand Bible §06 + the tier template (the
  jurisdiction variant's Thread list and method-note line appended for jurisdiction briefs). It checks
  structure, section budget, hypothesis-led opening, Take rules and voice; it never judges a fact.
- Both must PASS. **A sentence A marks `mismatch` that B lists as cleared, or a sentence B marks a
  violation that A cleared, is a disagreement ⇒ PARKED** (status-log PARKED + Questions line; stored
  as FAIL with `blockers[].code = 'disagreement'` and `notes.parked = true`).
- One `briefing_reviews` row per G3 (reviewer `xcheck-facts+xcheck-voice`), so a draft that completes
  the chain has exactly three rows; `notes` carries both verdicts, counts, disagreements and summaries.

## 7. Rows

| Gate | `reviewer` | `score` | `blockers` (jsonb array) | `notes` (JSON text) |
|---|---|---|---|---|
| G1-AUTO | `g1-auto` | measured pages | `{code, message, …}` per blocker (§4 codes) | `summary, stats, warnings, preview_path, html_path, fonts_loaded, render_error, upload_error, chain` |
| G2-PANEL | `tf-panel:<preset>` | min of the 3 scores | `score_below_3` / `factual_edit` | `preset, preset_label, members[], chair, scores, could_a_buyer_act, required_edits, note, mode` |
| G3-XCHECK | `xcheck-facts+xcheck-voice` | null | `fact_mismatch` / `voice_violation` / `disagreement` | `a, b, mismatches, violations, unverifiable, numbers_checked, disagreements, summaries, mode, parked?` |

Status-log lines use `scripts/statuslog.mjs` (BL2-04) unchanged: gates `G1-AUTO · G2-PANEL ·
G3-XCHECK · QUEUED`, results `PASS · FAIL · PARKED`, America/Chicago, one line per gate per brief.

## 8. Dry run on the seven samples (2026-11-09, fixtures, nothing written)

| Lane | Draft (tier, source) | G1-AUTO | G2-PANEL (preset · thesis/evidence/watch · factual edits) | G3-XCHECK (facts · voice) |
|---|---|---|---|---|
| theaters | The Power Reckoning (deep, BL-08 sample) | **FAIL** 13 pp · 224 numbers checked · 1 mismatch: the Signals table's "28 Jan **2027**" — the cited Utility Dive piece says only "Jan. 28" | FAIL `power-grid` · 4/3/3 · buyer could act · 1 factual ("FERC told every grid operator" → the six FERC-jurisdictional RTOs/ISOs) | FAIL · facts PASS (152 checked, 4 unverifiable: S8 truncated at capture) · voice 6 violations |
| domains | The Power Reckoning (standard, BL-09 sample) | PASS 9 pp · 154 checked | FAIL `power-grid` · 4/3/1 · 1 factual (Meta's up to 6.6 GW cited as *existing* capacity at [7]) | FAIL · facts 1 mismatch (the Take's "in eight weeks" is stated by none of [1, 5, 7]; S7 dates Meta's deals to January 2026) · voice 6 |
| subdomains | The Thermal-Power Convergence Play (standard, BL-09 sample) | PASS 9 pp · 133 checked · 1 unverifiable | FAIL `thermal` · 4/3/1 · 1 factual ("Chillers began running on 800 V DC" — one chiller was demonstrated) | FAIL · facts PASS (72 checked) · voice 8 |
| companies | CoreWeave (profile, BL-09 sample) | PASS 2 pp · 31 checked | FAIL `profile-light` (victoria-stroud) · 3/3/2 · 0 factual | FAIL · facts PASS (29 checked) · voice 1 (Dated Signals not newest-first: 7 Oct before 8 Oct) |
| institutions | Lawrence Berkeley National Laboratory (profile, BL2-04 stub) | FAIL `no_sources`, `placeholder_content` | FAIL `profile-light` (albert-thorne) · 0/0/0 | FAIL · facts PASS (nothing to check) · voice 5 |
| states | Texas (standard, jurisdiction, BL2-04 stub; prior G1 FAIL on v1) | **PARKED** — second consecutive FAIL (`no_sources`, `placeholder_content`, 2 pp, missing not-legal-advice line) + Questions line, default "skip this brief this release" | FAIL `jurisdiction` · 0/0/0 | FAIL · voice 7 |
| countries | Germany (standard, jurisdiction, BL2-04 stub) | FAIL (same four blockers) | FAIL `jurisdiction` · 0/0/0 | FAIL · voice 7 |

21 rows: 3 PASS, 17 FAIL, 1 PARKED, 0 QUEUED. Gates after a FAIL ran only because of `--all-gates`
(the dry run needed every gate exercised); in production the chain stops at the first FAIL.
`scripts/review/fixtures/reviews.sample.json` holds the rows; the 41 reviewer JSONs are summarised in
`notes`.

**What the chain caught on real, hand-curated samples** — three findings that were true before this
ticket and that no earlier gate had surfaced:

1. The Deep sample infers a year the source does not state (G1, deterministic).
2. The Standard Power Reckoning's Take says the record "in eight weeks logs agreements covering
   several gigawatts" citing [1, 5, 7]; [7] (Meta–TerraPower/Oklo/Vistra) is dated January 2026, so the
   claim is not supported by its own citations (Reviewer A); the same source is cited for "existing"
   nuclear capacity though most of it is new build (panel, factual edit).
3. The Thermal sample pluralises one chiller demonstration into "chillers began running" (panel).

And one systemic finding: **every Standard and Profile sample scored 1–2 on `what_to_watch_useful`**,
because the BL-09 Standard and Profile templates have no forward-looking section (the Deep template
has "Signals to watch"). As specified, G2 will fail every Standard brief until either the template
gains a dated watch section or the criterion is relaxed for those tiers. Decision for Myke (§9).

## 9. Deviations and flags for Myke

- **Samples.** The seven drafts ARE BL2-05 output: `docs/briefs/samples/*.md` (FDY-281) as staged by the
  lane runner, with the evidence packs it composed from standing in for the Faraday tables (fixtures
  README). An earlier pass of this ticket ran before BL2-05 landed, on BL-08/BL-09 material plus three
  BL2-04 stubs; its findings are kept in §8 as a note because they were real and are not reproduced by
  the BL2-05 corpus (different manuscripts).
- **Two fixture-side lessons from the BL2-05 run.** (1) The generator composes sentences from a
  signal's `faradays_take` as well as its `framing` — the fixture resolver first missed that and G1
  reported three false mismatches on the Malaysia sentence of the theaters brief; `recordFor` now
  includes it. A live run resolves against `signals`/`artifacts` and does not have this gap, but Reviewer
  A's "raw source texts" should include `faradays_take` for the same reason. (2) G1's remaining FAIL
  (Germany) is a genuine BL2-05 defect: the Polar "€1B" sentence is cited to the waste-heat article
  (S3) when the Polar item is S2. The lane runner's citation picker, not the chain, owns that fix.
- **`what_to_watch_useful` vs the Standard/Profile templates** (§8) — template change or tier-specific
  criterion; the chain implements the ticket as written.
- **Panel execution.** Subagents, not the ThoughtForge API (§5). `--panel api` is implemented against
  the SDK (`claude-opus-5-5`, `output_config.format` JSON schema, streaming) but could not be run here
  (no key); first live run should be a single draft with `--dry-run`. Server-side refusal fallbacks are
  not enabled on those calls — a follow-on once the path is exercised.
- **One G3 row** carrying both reviewers (keeps "21 rows for 7 samples"); the ticket named two
  reviewers but one gate. Easy to split if the sign-off view should show A and B separately.
- **Uncited numbers warn, not block** (§4). Tightening is a one-line change in `g1.mjs`.
- **Branch.** The issue named `brief/bl2-06-review-chain`; this session's harness pins its work to
  `claude/amazing-darwin-yj02j9`, so the PR comes from that branch (same as BL2-04).
- **Costs.** The dry run's G3 facts prompts carry the full captured source texts (up to ~120k
  characters for the Deep sample); the API path should cap per-source text (`maxCharsPerSource`) once
  real usage is known.

## 10. Not done here / follow-ons

- No live run and no schedule. A live `--gate all` needs staged drafts (BL2-05) and `ANTHROPIC_API_KEY`
  in the environment that runs it; cron via `cron_http_post` + Vault (FAR-344) is a later ticket.
- `v_briefing_signoff_queue` is a file, not applied.
- Registry id for the health row is provisional (`AUTO-PROVISIONAL`); replace the constant when granted.
- Reviewer A on the stubs returned `numbers_checked = 0` — fine, but the chain could skip G2/G3 outright
  when G1 reports `no_sources` or `placeholder_content`; today only `--all-gates` reaches them anyway.
