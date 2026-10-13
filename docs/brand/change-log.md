# Briefing Library Brand Bible: V2 change log (FDY-179 / BL-13)

**Source read:** the Notion page *Briefing Library — Brand Bible*, page id
`34689a0c-1680-8149-9d93-c8421fd21413`
(<https://app.notion.com/p/34689a0c168081499d93c8421fd21413>). Read on 2026-10-13 at 00:12:17Z.
**Page last edited:** `2026-07-06T13:35:58.820Z`.
**Notion page edited:** no. This was a read-only pass. The V2 text is
[`briefing-library-brand-bible-v2.md`](./briefing-library-brand-bible-v2.md).

**Candidates considered:** `notion-search "Briefing Library Brand Bible"` returned only one page with
that Brand Bible title. The other hits were sibling storefront Brand Bibles (Intelligent Alert, Live
Agent, Thought Forge, Jurisdiction Watch, Academy), the Storefront Registry, the Engine Registry, the
Project Hub, and the child page *🛠 Build Status — Briefing Library Storefront (v1.0)*
(`38589a0c-1680-81fd-b30f-e3c972e10928`). That child page is a build-status log, not split Brand Bible
content, so it is linked from the V2 text but not transcribed. The fetch was not truncated.

**Replacement rules applied (from the issue):**
- **R1:** Gamma is replaced by the artifact types Design, Docs, Dashboard and Slides.
- **R2:** the 6–10 slide standard is replaced by tier page targets: Deep 10–15 pp, Standard 8–10 pp, Profile 2 pp.
- **R3:** the Sub-Domain figure becomes 117, alongside 23 Domains and 7 Themes.
- **R4:** the Library's home is Supabase, per DEC-IDF-25.
- **R5:** "Key Player" terminology is retired under IDF 5.0 and replaced by "company" / "Company Briefing".
- **R6:** the public vocabulary stays Theater / Sector / Thread / Signal, under the heading IDF 5.0 §02.

| # | Section | Original (verbatim) | Replacement | Rule |
|---|---|---|---|---|
| 1 | Header blockquote | "maintaining a continuously-produced inventory of Gamma Briefings across Themes, Domains, Sub-Domains, and Key Player companies" | "maintaining a continuously-produced inventory of Briefings, rendered as artifacts (Design, Docs, Dashboard, Slides), across Themes, Domains, Sub-Domains, and tracked companies" | R1, R5 |
| 2 | Header blockquote | "Automation pipeline documentation lives in the Gamma Company Brief — Session Log." | "The Library's home is Supabase (DEC-IDF-25); V2 pipeline documentation lives in the Faraday-Briefing-Library repository. The Gamma Company Brief — Session Log is retained as the historical record of the V1 pipeline." | R1, R4 |
| 3 | 01 Purpose & Scope | "a continuously-produced inventory of Gamma Briefings covering the cultivated intelligence architecture" | "a continuously-produced inventory of Briefings covering the cultivated intelligence architecture" | R1 |
| 4 | 01 Purpose & Scope | "carrying a current Briefing for every Theme, Domain, Sub-Domain, and tracked Key Player company" | "carrying a current Briefing for every Theme, Domain, Sub-Domain, and tracked company" | R5 |
| 5 | 01 Purpose & Scope | "A prospect in a sales conversation receives a Key Player Briefing on their target company." | "A prospect in a sales conversation receives a Company Briefing on their target company." | R5 |
| 6 | 01 Purpose & Scope (governs) | "Briefing categories and inventory scope (Themes, Domains, Sub-Domains, Key Players, Business Plans, Jurisdiction, Thought Forge outputs)" | "… (Themes, Domains, Sub-Domains, Companies, Business Plans, Jurisdiction, Thought Forge outputs)" | R5 |
| 7 | 01 Purpose & Scope (governs) | "Gamma theme mapping by Briefing type" | "Artifact type and tier page-target mapping by Briefing type" | R1, R2 |
| 8 | 01 Purpose & Scope | *(no statement of where the Library lives; the original names the "Tracking Companies table", an Airtable table, as its company input)* | Added: "**Library home:** the Library's catalog and records live in **Supabase** (per DEC-IDF-25). Airtable is not the Library's home." | R4 |
| 9 | 02.1 Sales Prospects | "A prospect at a hyperscaler receives relevant Key Player Briefings on their competitors." | "… receives relevant Company Briefings on their competitors." | R5 |
| 10 | 03 Inventory Scope (intro) | "The Library carries Briefings across the full Faraday intelligence architecture." | "… across the full Faraday intelligence architecture — 7 Themes, 23 Domains, 117 Sub-Domains — plus tracked companies." Also added the tier page targets (Deep 10–15 pp · Standard 8–10 pp · Profile 2 pp) and the four artifact types. | R1, R2, R3 |
| 11 | 03.1 Theme Briefings | "Gamma theme: **lux**." | "Tier: **Deep**." | R1, R2 |
| 12 | 03.2 Domain Briefings | "Gamma theme: **lux**." | "Tier: **Standard**." | R1, R2 |
| 13 | 03.3 Sub-Domain Briefings | "One Briefing per Sub-Domain (~95–100 at IDF v3.0 scale)." | "One Briefing per Sub-Domain (117 Sub-Domains across 23 Domains and 7 Themes)." | R3 |
| 14 | 03.3 Sub-Domain Briefings | "Gamma theme: **lux**." | "Tier: **Standard**." | R1, R2 |
| 15 | 03.4 (heading) | "Key Player Briefings" | "Company Briefings" | R5 |
| 16 | 03.4 | "One Briefing per tracked Key Player company in the Tracking Companies table." | "One Briefing per tracked company in the tracking companies table (Supabase)." | R4, R5 |
| 17 | 03.4 | "Gamma theme: **lux**." | "Tier: **Profile**." | R1, R2 |
| 18 | 03.4 | "11 decks built to date per the Gamma Company Brief session log." | Removed. This was a V1 Gamma-era count. | R1 |
| 19 | 03.5 Business Plan Briefings | "Gamma theme: **aurum**." | "Artifact type: **Slides**." | R1 |
| 20 | 03.6 Thought Forge Briefings | "Gamma theme: **editoria**." | "Tier: **Deep**." | R1, R2 |
| 21 | 03.7 Jurisdiction Briefings | "Gamma theme varies (lux primary)." | "Tier: **Standard**; artifact type **Docs** primary, **Dashboard** where JPS data renders live." | R1, R2 |
| 22 | 03.8 Academy-Adjacent Briefings | "Gamma theme: **sage**." | "Artifact type: **Docs**." | R1 |
| 23 | 04.1 Refresh Rules | "**Key Player Briefings:** Monthly refresh automation pulls latest signals from Tracking Companies table, AUTO-035 (Gamma Company Overviews Refresh), and related intelligence feeds" | "**Company Briefings:** Monthly refresh automation pulls latest signals from the tracking companies table (Supabase), AUTO-035 (Company Overviews Refresh), and related intelligence feeds" | R1, R4, R5 |
| 24 | 04.2 Production Pipeline | "Inputs: Tracking Companies table, IDF Domain/Sub-Domain Registry, …" | "Inputs: tracking companies table (Supabase), IDF Domain/Sub-Domain Registry, …" | R4 |
| 25 | 04.2 Production Pipeline | "Gamma API call produces the deck." | "The Briefing is rendered as an artifact (Design, Docs, Dashboard or Slides) to its tier's page target, and its Library record is stored in Supabase (DEC-IDF-25)." | R1, R2, R4 |
| 26 | 04.2 Production Pipeline | "Myke sign-off required. Every deck." | "Myke sign-off required. Every Briefing." | R1 |
| 27 | 05 (heading) | "05. Gamma Theme Mapping" | "05. Artifact Type & Tier Mapping" | R1, R2 |
| 28 | 05 (table) | The table "Briefing Type / Gamma Theme": Theme, Domain, Sub-Domain, Key Player → Lux; Business Plan → Aurum; Thought Forge commission → Editoria; Academy-adjacent → Sage; Jurisdiction → "Lux (primary); forest variant for Restricted-tier jurisdictions under consideration" | The table "Briefing Type / Tier / Artifact Type": Theme → Deep/Docs; Domain, Sub-Domain → Standard/Docs; Company → Profile/Docs; Business Plan → Standard/Slides; Thought Forge → Deep/Docs; Academy-adjacent → Standard/Docs; Jurisdiction → Standard/Docs (Dashboard where JPS renders live). Design is used for visual one-offs. | R1, R2, R5 |
| 29 | 06 Voice Variant | "**Sources & methodology slide** as final slide, always" | "**Sources & methodology page** as the final page, always" | R2 |
| 30 | 09 Engine Capabilities | "**IDF** — every Briefing is mapped to Theme / Domain / Sub-Domain / Key Player" | "… Theme / Domain / Sub-Domain / company" | R5 |
| 31 | 09 Engine Capabilities | "**Velocity Play** — hypothesis generation for Key Player and Theme Briefings" | "… hypothesis generation for Company and Theme Briefings" | R5 |
| 32 | 10 Output Formats | "**Briefing** (primary format, multiple variants by scope and theme)" | "**Briefing** (primary format, multiple variants by scope, tier and artifact type)" | R1, R2 |
| 33 | 10 Output Formats | "the variation is in scope (what the Briefing is about) and Gamma theme (lux / aurum / editoria / sage), not in format structure." | "the variation is in scope (what the Briefing is about), tier (Deep / Standard / Profile) and artifact type (Design / Docs / Dashboard / Slides), not in format structure." | R1, R2 |
| 34 | 11.5 Briefing Library → Academy | "companion Briefings (Academy-adjacent, sage theme)" | "companion Briefings (Academy-adjacent)" | R1 |
| 35 | 12 Open Decisions | "Briefing length standards (current working range 6–10 slides; whether longer Fellow-level Briefings deserve a distinct format)" | Struck through and marked "resolved in V2: tier page targets Deep 10–15 pp · Standard 8–10 pp · Profile 2 pp (see §05)" | R2 |
| 36 | 12 Open Decisions | "Gamma folder organization (currently all decks land in root workspace — Gamma API doesn't support folder creation)" | Removed. It no longer applies. | R1 |
| 37 | Related | "🗂️ Gamma Company Brief — Session Log & Prompt Registry" | The link is kept, with the label "historical (V1 Gamma pipeline, retired)" | R1 |
| 38 | Public Coverage Vocabulary (heading) | "## Public Coverage Vocabulary (4.0)" | "### Public Coverage Vocabulary (IDF 5.0 §02)" | R6 |
| 39 | Public Coverage Vocabulary | "plus Key Player Briefing (unchanged)" | "plus Company Briefing" | R5 |
| 40 | Public Coverage Vocabulary | "Canonical map: IDF 4.0 §01; Faraday-wide record in the parent Brand Bible 4.0." | "Canonical map: IDF 5.0 §02 (previously IDF 4.0 §01); Faraday-wide record in the parent Brand Bible." | R6 |

**Total: 40 replaced statements.** That is 34 replacements, 3 removals (#18, #36, plus the strike-through in #35) and 3 insertions or relabels (#8, #10, #37).

## Key Player terminology removed (R5, logged separately)

Every occurrence of "Key Player" was removed. The 12 occurrences are in entries
#1, #4, #5, #6, #9, #15, #16, #23, #28, #30, #31 and #39. "Key Player" no longer appears anywhere in
the V2 text.

## Points that need confirmation

1. **Tier and artifact-type assignments (§03, §05).** The issue gives the tier page targets, but the
   original page never said which Briefing type gets which tier. The V2 assignments are defaults and
   are marked **[V2 — confirm]** in the text: Theme/Thought Forge = Deep, Domain/Sub-Domain/Jurisdiction/
   Academy/Business Plan = Standard, Company = Profile; Docs is the default artifact type, Slides for
   Business Plans, Dashboard for live JPS.
2. **The Key Player replacement term.** IDF 5.0 is not quoted in this repo, so the replacement name is
   unconfirmed. V2 uses "Company Briefing" and "tracked company". If IDF 5.0 names it differently,
   change it in one pass.
3. **The Supabase / DEC-IDF-25 statement.** The original never says the Library lives in Airtable.
   The only Airtable dependency is the "Tracking Companies table". So R4 was applied as an explicit
   "Library home" line plus repointing that input to the Supabase tracking companies table.
4. **AUTO-035.** The id is kept and only "Gamma" was dropped from its name. Whether AUTO-035 itself
   was retired with the Gamma pipeline is not verified.
5. **Remaining "deck" mention.** The open decision "Theme Overview deck generation sprint (OA-014)"
   keeps its original title because it names an external ticket.
