# BL-06 — IDF 5.0 amendments (DEC-IDF-25 / 26 / 27)

**Linear:** FDY-172 (BL-06), Briefing Library V2 program
**Decisions by:** Myke, 2026-10-13
**Target page:** IDF 5.0 — Master Framework (CANONICAL), Notion `3c889a0c168080bcac9dc4629fed7a66`
**Page state read:** `page_last_edited_at` = **2026-09-07T03:39:17.806Z** (fetched 2026-10-13T00:09:24Z).
The post-merge step must re-fetch and confirm that timestamp is unchanged before applying these edits. If the page has moved, re-derive the "current text" blocks below instead of pasting them.

This file is the proposal. It does not edit Notion. The page is changed only after this PR merges, by the post-merge step.

---

## ⚠️ Numbering collision — Myke to confirm

**DEC-IDF-25, -26 and -27 are already used in the Faraday Decision Log.** They do not appear in the text of the canonical page (§10 records DEC-IDF-01 to -24; §12 cites DEC-IDF-37), but the Decision Log has moved past the page. Existing uses, from the repo records of earlier CCs that checked the live log:

| Number | Already used for | Date | Source |
|---|---|---|---|
| DEC-IDF-25 | **Used twice:** "derivation is not a feed" **and** "municipalities leave companies" | 2026-09-02 and 2026-09-03 | `faraday-jurisdiction-watch/docs/pillar-feeds/CC-P4P5-G4-G7-CLOSEOUT.md` §4; `docs/tagspine/CC-TAGSPINE-RETIREMENT-1.0-RUN-REPORT.md` §8 |
| DEC-IDF-26 | CF0–CF5 promotion ladder | 2026-09-03 | CC-P4P5-G4-G7-CLOSEOUT §4 |
| DEC-IDF-27 | Alias policy | 2026-09-03 | CC-P4P5-G4-G7-CLOSEOUT §4 |
| DEC-IDF-28 to -43 | Allocated (28 registry policy, 29 verification means confirmed, 32/33 tagspine retirement, 34 to 36 facility rulings, 37 state overlay, 38 to 43 P4/P5 freshness lane) | 2026-09-03 to 2026-09-07 | same reports, plus `docs/dc-facilities/COMMISSION-DATE-RUN-REPORT.md` |

The highest number known in any repo record is **DEC-IDF-43** (as of 2026-09-07). The Decision Log itself was not queried for this PR, so numbers may have been allocated after that date.

This is the third time a proposal has used numbers that were already taken. CC-TAGSPINE-RETIREMENT-1.0 proposed 25/26 and had to use 32/33. CC-P4P5 proposed 24 to 29 and had to use 38 to 43.

**Proposal:** record these three rulings as **DEC-IDF-44 / -45 / -46**, *after* the post-merge step queries the live Decision Log and confirms they are still free. If they are not, take the next three free numbers. The mapping is:

| Issue number | Proposed number | Ruling |
|---|---|---|
| DEC-IDF-25 | **DEC-IDF-44** (provisional) | Briefing Library canonical home moves to Supabase `briefings` |
| DEC-IDF-26 | **DEC-IDF-45** (provisional) | Brief sign-off gate |
| DEC-IDF-27 | **DEC-IDF-46** (provisional) | Jurisdiction Briefs stay on JW; regulators via `institutions` |

As instructed, this document keeps the issue's numbers (25/26/27) in the text below. **Do not write them to Notion until Myke confirms the numbering.** If he approves 44/45/46, renumbering this file is a find-and-replace. Separately, the existing double use of DEC-IDF-25 is earlier debt that still needs a ruling. It was flagged in September and is not touched here.

---

## 1. Replacement text, section by section

Current text is quoted verbatim from the fetched page in Notion enhanced markdown. That is why it contains `****` artefacts.

### 1.1 §00 Canonical homes — Briefing Library row (DEC-IDF-25)

**Current:**
```
<tr>
<td>Briefing Library</td>
<td>Airtable (Supabase `library_catalog_cache` is its read-model)</td>
<td>388</td>
</tr>
```

**Replacement:**
```
<tr>
<td>Briefing Library</td>
<td>Supabase `briefings` — *moved from Airtable 2026-10-13, DEC-IDF-25*</td>
<td>436 · 0 Live — *baseline refreshed 2026-10-13*</td>
</tr>
```

### 1.2 §00 retired-tables line (DEC-IDF-25)

**Current:**
```
**Seven Airtable tables retired 2026-08-26** — descriptions updated in place, **no data deleted, all rows retained.** Full retirement map: S3 §1.1.
```

**Replacement:**
```
**Eight Airtable tables retired** — seven on 2026-08-26, plus the Briefing Library on 2026-10-13 (DEC-IDF-25). Descriptions updated in place, **no data deleted, all rows retained.** Full retirement map: S3 §1.1.
```
> The retirement map itself is in satellite **S3 §1.1**, not on this page. The post-merge step must add the Briefing Library as the eighth row there too, or §00 will point to a seven-row list.

### 1.3 §06 Governance — Source-of-truth bullet (DEC-IDF-25, DEC-IDF-26)

**Current:**
```
- **Source-of-truth.** Data registries live in Supabase; the framework lives here. Airtable is retained for automations, the Briefing Library, puzzles, subscribers, and the People roster until that migrates. **Two live copies of one registry is the defect this version exists to end.**
```

**Replacement:**
```
- **Source-of-truth.** Data registries live in Supabase; the framework lives here. Airtable is retained for automations, puzzles, subscribers, and the People roster until that migrates. **The Briefing Library moved to Supabase `briefings` on 2026-10-13 (DEC-IDF-25).** **Two live copies of one registry is the defect this version exists to end.**
- **Brief sign-off (DEC-IDF-26).** Myke signs every **Deep** brief. **Standard** and **Profile** briefs publish on automated QA plus a 10% human sample. This applies to briefs only: the Myke approval gate on the framework itself (carried unchanged above) does not change.
```

### 1.4 §10 Decisions — new decision entries (all three)

Append after DEC-IDF-24 (see §2 below).

### 1.5 §12 Briefing Taxonomy — Jurisdiction and Research rows (DEC-IDF-27)

**Current:**
```
<tr>
<td>**Jurisdiction Brief**</td>
<td>Country › Market › State › County</td>
<td>**Jurisdiction Watch only**</td>
</tr>
<tr>
<td>**Research Brief**</td>
<td>Research Body › output</td>
<td>TBD — likely Briefing Library</td>
</tr>
```

**Replacement:**
```
<tr>
<td>**Jurisdiction Brief**</td>
<td>Country › Market › State › County</td>
<td>**Jurisdiction Watch only** — *confirmed 2026-10-13, DEC-IDF-27*</td>
</tr>
<tr>
<td>**Research Brief**</td>
<td>Research Body › output</td>
<td>Briefing Library — institution briefs (incl. regulators, via `institutions`) are **Profile tier only** until S5 ratifies the Research Brief class (DEC-IDF-27)</td>
</tr>
```

### 1.6 §16 Decisions log — Registry and retirement (DEC-IDF-25)

**Current:**
```
**D2.11 Power Price Formation & Cost Structure** approved as net-new, setting the post-approval numbering precedent · Airtable linked records repoint to `companies` now · **seven Airtable tables retired**, descriptions updated in place, no data deleted · *Data Center People* marked **PROTECTED**.
```

**Replacement (append one sentence, leave the 2026-08-26 record intact):**
```
**D2.11 Power Price Formation & Cost Structure** approved as net-new, setting the post-approval numbering precedent · Airtable linked records repoint to `companies` now · **seven Airtable tables retired**, descriptions updated in place, no data deleted · *Data Center People* marked **PROTECTED**.
*Added 2026-10-13: the Briefing Library becomes the eighth retired Airtable table (DEC-IDF-25), and its canonical home is Supabase `briefings`.*
```

---

## 2. Decision entries, in the page's §10 format

Insert after `**DEC-IDF-24 — …**`, under a new subheading that matches the existing "## Six Pillars — RESOLVED 2026-08-29 (Myke)" pattern:

```
## Briefing Library V2 — RESOLVED 2026-10-13 (Myke)
*Recorded by BL-06 (FDY-172). Numbers provisional pending the Decision Log check. See the numbering note in the repo doc `docs/idf/DEC-IDF-25-27.md`.*
**DEC-IDF-25 — The Briefing Library's canonical home moves from Airtable to Supabase ****`briefings`****.** ✅ Amends §00 (Briefing Library row), §06 (source-of-truth bullet) and the retired-tables count (seven → eight). The Airtable table is retired the same way as the other seven: description updated in place, no data deleted. Baseline refreshed 2026-10-13: **436 records, 0 Live.**
**DEC-IDF-26 — Brief sign-off gate.** ✅ Myke signs **Deep** briefs. **Standard** and **Profile** briefs publish on automated QA plus a **10% sample**. This amends §06 for briefs only; the framework approval gate is unchanged.
**DEC-IDF-27 — Jurisdiction Briefs stay on Jurisdiction Watch; the library holds regulators through ****`institutions`****.** ✅ Confirms §12. Institution briefs (regulators and research bodies alike) are **Profile tier only** until S5 (Briefing Taxonomy) ratifies the Research Brief class.
```

---

## 3. Diff against current page text

```diff
@@ §00 Canonical homes — Briefing Library row @@
 <tr>
 <td>Briefing Library</td>
-<td>Airtable (Supabase `library_catalog_cache` is its read-model)</td>
-<td>388</td>
+<td>Supabase `briefings` — *moved from Airtable 2026-10-13, DEC-IDF-25*</td>
+<td>436 · 0 Live — *baseline refreshed 2026-10-13*</td>
 </tr>
```

```diff
@@ §00 retired tables @@
-**Seven Airtable tables retired 2026-08-26** — descriptions updated in place, **no data deleted, all rows retained.** Full retirement map: S3 §1.1.
+**Eight Airtable tables retired** — seven on 2026-08-26, plus the Briefing Library on 2026-10-13 (DEC-IDF-25). Descriptions updated in place, **no data deleted, all rows retained.** Full retirement map: S3 §1.1.
```

```diff
@@ §06 Governance — Amended @@
-- **Source-of-truth.** Data registries live in Supabase; the framework lives here. Airtable is retained for automations, the Briefing Library, puzzles, subscribers, and the People roster until that migrates. **Two live copies of one registry is the defect this version exists to end.**
+- **Source-of-truth.** Data registries live in Supabase; the framework lives here. Airtable is retained for automations, puzzles, subscribers, and the People roster until that migrates. **The Briefing Library moved to Supabase `briefings` on 2026-10-13 (DEC-IDF-25).** **Two live copies of one registry is the defect this version exists to end.**
+- **Brief sign-off (DEC-IDF-26).** Myke signs every **Deep** brief. **Standard** and **Profile** briefs publish on automated QA plus a 10% human sample. This applies to briefs only: the Myke approval gate on the framework itself (carried unchanged above) does not change.
```

```diff
@@ §10 Decisions — after DEC-IDF-24 @@
 **DEC-IDF-24 — D14.6 merges into D14.1; D14.8 is added; the Sub-Domain count stays 117.** ✅ …
+## Briefing Library V2 — RESOLVED 2026-10-13 (Myke)
+*Recorded by BL-06 (FDY-172). Numbers provisional pending the Decision Log check …*
+**DEC-IDF-25 — The Briefing Library's canonical home moves from Airtable to Supabase ****`briefings`****.** ✅ …
+**DEC-IDF-26 — Brief sign-off gate.** ✅ …
+**DEC-IDF-27 — Jurisdiction Briefs stay on Jurisdiction Watch; the library holds regulators through ****`institutions`****.** ✅ …
```

```diff
@@ §12 Briefing Taxonomy @@
 <td>**Jurisdiction Brief**</td>
 <td>Country › Market › State › County</td>
-<td>**Jurisdiction Watch only**</td>
+<td>**Jurisdiction Watch only** — *confirmed 2026-10-13, DEC-IDF-27*</td>
 </tr>
 <tr>
 <td>**Research Brief**</td>
 <td>Research Body › output</td>
-<td>TBD — likely Briefing Library</td>
+<td>Briefing Library — institution briefs (incl. regulators, via `institutions`) are **Profile tier only** until S5 ratifies the Research Brief class (DEC-IDF-27)</td>
```

```diff
@@ §16 Decisions log — Registry and retirement @@
 **D2.11 Power Price Formation & Cost Structure** approved as net-new, … · **seven Airtable tables retired**, descriptions updated in place, no data deleted · *Data Center People* marked **PROTECTED**.
+*Added 2026-10-13: the Briefing Library becomes the eighth retired Airtable table (DEC-IDF-25), and its canonical home is Supabase `briefings`.*
```

---

## 4. Post-merge checklist (for the orchestrator, not this PR)

1. **Get Myke's ruling on the numbering** (keep 25/26/27, or use 44/45/46 or the next free). Query the live Decision Log first.
2. Re-fetch the page and confirm `page_last_edited_at` is still 2026-09-07T03:39:17.806Z.
3. Edit the canonical page in **§00** (Briefing Library row + retired-tables line), **§06** (source-of-truth bullet + new brief sign-off bullet), **§10** (new subheading + three entries), **§12** (Jurisdiction Brief + Research Brief rows) and **§16** (Registry and retirement line).
4. Add the Briefing Library as row eight of the retirement map in **satellite S3 §1.1**.
5. Add one row per decision to the Faraday Decision Log.
6. Left alone on purpose: §07 point 2 ("Briefing Library still link[s] to the retired Tracking Companies table") is a dated 2026-08-26 coupling note, already overtaken by DEC-IDF-14. Removing the Airtable Briefing Library makes it moot. The post-merge step may add a dated note, but nothing here requires one.
