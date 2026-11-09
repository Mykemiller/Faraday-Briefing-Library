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
other input), 39 sessions in all** — 34 panelists and cross-checkers in parallel, then the 5 chairs.
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

## 8. Dry run on the seven BL2-05 samples (2026-11-09, fixtures, nothing written)

The seven drafts are the BL2-05 lane runner's own output (`docs/briefs/samples/*.md`, FDY-281), read
through the review fixtures (§7 of the fixtures README). All three gates ran on every draft
(`--all-gates`); in production the chain stops at the first FAIL. G1 ran locally; the 39 G2/G3 reviewer
sessions (34 panelists + cross-checkers in parallel, then the 5 chairs) were independent Claude Code
subagents on the emitted prompt files (§5). `scripts/review/fixtures/reviews.sample.json` holds the 21
rows; each reviewer's JSON is summarised in `notes`.

| Lane | Draft (tier, version) | G1-AUTO | G2-PANEL (preset · thesis/evidence/watch · factual edits) | G3-XCHECK (facts · voice) |
|---|---|---|---|---|
| theaters | The Power Reckoning (deep, v2) | PASS 13 pp · 216 numbers checked | FAIL `faraday-editorial` · 1/2/1 · buyer could not act · 2 factual ("Google News" named as publisher on S28/S30/S32; 219 vs 220 Signal count) | **PARKED** · facts PASS (87 checked, 0 mismatches) · voice FAIL (10) · 1 disagreement (the Oracle/Tencent sentence: A cleared, B flagged "reportedly") |
| domains | Grid & Regulatory (standard, v2) | PASS 8 pp · 85 checked | FAIL `power-grid` · 1/2/1 · 1 factual (Signal register undercounts Google/AEP/National Grid against the sources list) | FAIL · facts PASS (60 checked) · voice FAIL (12: no hypothesis, internal taxonomy counts and a `media_events` enum in subscriber copy, scraper residue in headlines/At-a-glance cells) |
| subdomains | Interconnection Queue & Grid Access (standard, v3) | PASS 10 pp · 100 checked | FAIL `power-grid` · 1/2/1 · 1 factual ("Google News" as publisher on S12/S13/S32); every panelist flagged the unreconciled ERCOT queue — 226 GW [S2] vs 410 GW [S27] | FAIL · facts FAIL (69 checked, 2 mismatches: "tripled" vs the source's "nearly triple" [S17]; "45%" vs "up to 45%" and an Ohio rate class stated as created where the source says pending [S4]) · voice FAIL (9) |
| companies | CoreWeave (profile, v2) | PASS 2 pp · 19 checked | FAIL `profile-light` (victoria-stroud) · 2/2/1 · 1 factual (S8 drops the lessor attribution, so a landlord's 5.7 GW reads as CoreWeave's against 526 MW supported) | FAIL · facts PASS (18 checked) · voice FAIL (2: "What the record shows" is one sentence against the template's two–three; identity card 8 pairs against 6–7) |
| institutions | Electric Reliability Council of Texas (profile, v2) | PASS 2 pp · 20 checked | FAIL `profile-light` (gilbert-faraday) · 2/2/1 · 1 factual (identity card calls the ISO a "Regulator"); three queue figures (438/226/92 GW) unreconciled | **PARKED** · facts PASS (19 checked) · voice FAIL (4: identity card 5 pairs, no Theater/Sector; "What the record shows" 1 sentence; S5 Signal does not mention the entity) · 2 disagreements |
| states | Texas (standard, jurisdiction, v2) | PASS 10 pp · 70 checked | FAIL `jurisdiction` · 1/2/1 · 2 factual (S4/S10 dated 2026-11-30, after the brief's own 9 Nov date; "18 sourced items" vs 19); cover posture "Leading, stable" (scored July) unreconciled with the post-election moratorium record | FAIL · facts FAIL (73 checked, 2 date mismatches — the same S4/S10 rows) · voice FAIL (7: no hypothesis-led opening; Take restates the body; all six Thread sections at 3 entries against the 4-entry floor) |
| countries | Germany (standard, jurisdiction, v2) | **FAIL** 10 pp · 102 checked · 2 `number_mismatch`: "€1B" Polar funding cited to S3 (the waste-heat article) — the Polar item is S2; same sentence in the argument and the Take | FAIL `jurisdiction` · 2/2/1 · 2 factual (S10 publisher is a headline fragment — the domain is enkiai.com; Microsoft register count); Amazon €2B vs €16B vs €7.8B unreconciled; "Legislation & rules" prints empty while EnEfG/National Strategy sit under other threads | FAIL · facts FAIL (62 checked, 1 mismatch: "Amazon plans to invest 2 billion euros … by 2027" [S17] — the German source says "steckt 2027 Milliarden", no 2-billion figure, 2027 is the investment year) · voice FAIL (10) |

**21 rows: 6 PASS, 13 FAIL, 2 PARKED, 0 QUEUED.** Status-log lines, requeue entries and the two
Questions-for-Myke lines (default "skip this brief this release") were printed exactly as the live
run would write them.

**What the chain caught on the BL2-05 corpus.**

1. **G1 is now clean on six of seven** — page counts match the generator's (13/8/10/2/2/10/10), every
   source resolves, no banned vocabulary or internal codes leaked, Profiles carry no Take. The one FAIL
   is a real mis-citation in the Germany sample (Polar €1B → S3 instead of S2).
2. **Reviewer A found four factual defects G1 structurally cannot:** two hedge-dropping paraphrases
   ("tripled", "45%" for "nearly triple", "up to 45%"), a status paraphrase (Ohio rate class
   created vs pending), and a mistranslation (Amazon "2 billion euros" from "2027 Milliarden"). Plus
   the Texas S4/S10 dates, which both the panel and Reviewer A flagged independently.
3. **Every draft fails G2 on `thesis_clear` (1–2) and `what_to_watch_useful` (1), and every chair
   ruled "buyer could not act".** The failure is the same in all seven: the BL2-05 templates fill the
   cover thesis, the argument and the Take with restated Signal summaries plus record housekeeping
   ("The record holds N dated Signals…"), and the "Signals to watch" block lists past headlines rather
   than dated forward triggers. This is a generator finding, not a reviewer artefact — four personas
   per panel reached it independently, and Reviewer B's violations say the same thing in template
   terms. It is the single highest-leverage fix for BL2-05.
4. **Recurring factual-edit classes the generator can fix mechanically:** "Google News" rendered as a
   publisher when the source URL is a Google News redirect (3 drafts); register counts in the
   Signal-register intro that do not match the entries printed; conflicting figures for one fact
   printed side by side with no reconciliation (ERCOT 226/410 GW; Amazon €2B/€16B); Signals dated
   after the brief's own prepare date.

**Earlier pass (BL-08/BL-09 material, before BL2-05 landed) — kept for the record.** The same chain,
run on four hand-converted BL-08/BL-09 samples and three BL2-04 stubs, caught a year the Deep sample
inferred that its source did not state ("28 Jan 2027"), a Take claim ("in eight weeks") unsupported by
its own citations, and one chiller demonstration pluralised into "chillers began running". Those
manuscripts are not in the BL2-05 corpus, so the findings do not recur here; they are evidence of the
same gates working on different material.

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
- **`what_to_watch_useful` and `thesis_clear`** (§8 finding 3) — every BL2-05 draft scores 1–2 on both,
  so as specified G2 fails the whole corpus. The chain implements the ticket as written; the fix sits in
  the BL2-05 generator (a real thesis sentence, a dated forward watch list, the Take as an opinion).
  Until then every lane will requeue at G2 and park on the second attempt.
- **PARKED fires on cross-dimension disagreement.** The ticket's rule "disagreement on the same
  sentence → PARKED" is implemented literally: a draft parks when Reviewer A lists a sentence as
  cleared and Reviewer B flags the same sentence. Because A checks facts and B checks voice, that
  happens whenever a voice violation lands on a factually-clean sentence — two of seven here
  (theaters: "reportedly" on the Oracle/Tencent sentence; institutions: two identity-card/record
  sentences), both on the FIRST attempt, which pre-empts the two-consecutive-FAILs rule. If PARKED is
  meant for genuine fact disputes, narrow `xcheckVerdict` to same-dimension conflicts (A cleared vs B
  `factual`-kind, or B cleared vs A mismatch) — a four-line change in `panel.mjs`. Decision for Myke.
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
- The chain could skip G2/G3 outright when G1 reports `no_sources` or `placeholder_content`; today
  only `--all-gates` reaches them anyway.
- The live resolver now reads `signals.faradays_take` alongside `framing` (the generator composes from
  it — §9) so Reviewer A and G1 see the same record text the fixture path does; untested live.
