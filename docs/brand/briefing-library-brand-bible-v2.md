# 📚 Briefing Library — Brand Bible (V2)

> **Source of record.** Transcribed from the Notion page *Briefing Library — Brand Bible*
> (page id `34689a0c-1680-8149-9d93-c8421fd21413`, path *Faraday Architecture → Storefront Registry*),
> as read on 2026-10-13 (`page_last_edited_at` **2026-07-06T13:35:58.820Z**). The Notion page was
> **not edited**. This file follows the original section by section; the only changes are the V2
> replacements listed in [`change-log.md`](./change-log.md) (FDY-179 / BL-13). Wherever the V2
> change required choosing something the original did not specify, the choice is marked
> **[V2 — confirm]**.

> *Canonical reference for the Briefing Library product surface — the shelf storefront maintaining a continuously-produced inventory of Briefings, rendered as artifacts (Design, Docs, Dashboard, Slides), across Themes, Domains, Sub-Domains, and tracked companies. This sub-page governs the Briefing Library specifically. Faraday-wide decisions live in the parent [🎨 Faraday — Brand Bible](https://www.notion.so/33489a0c168081338515e1fc777b6c43).*
>
> *Established April 18, 2026. Living document. V2 revision 2026-10-13. The Library's home is Supabase (DEC-IDF-25); V2 pipeline documentation lives in the Faraday-Briefing-Library repository. The [Gamma Company Brief — Session Log](https://www.notion.so/33c89a0c168081adb540c2db742b0461) is retained as the historical record of the V1 pipeline.*

---

## 01. Purpose & Scope

The Briefing Library is the shelf storefront of Faraday — a continuously-produced inventory of Briefings covering the cultivated intelligence architecture. It is the storefront that is *always ready*, carrying a current Briefing for every Theme, Domain, Sub-Domain, and tracked company. The inventory refreshes on a monthly automation cadence; deployment happens through outbound sales motions, subscriber-facing channels, and campaign follow-ups.

**What makes the Briefing Library distinct among Storefronts:**

It is not primarily a destination subscribers visit. It is an *inventory that gets pushed out*. A prospect in a sales conversation receives a Company Briefing on their target company. A Core subscriber reading about a Theme gets directed to the full Theme Briefing. An outbound campaign targets jurisdictions with their Jurisdiction Briefing. The Library powers every proactive communication the platform makes.

**What this sub-page governs:**

- Briefing categories and inventory scope (Themes, Domains, Sub-Domains, Companies, Business Plans, Jurisdiction, Thought Forge outputs)
- Automation cadence and refresh rules
- Artifact type and tier page-target mapping by Briefing type
- Voice variant (editorial-authoritative at full register)
- Myke sign-off gate
- Deployment channels and tracking
- Subscriber access vs. outbound-only posture

**What this sub-page defers to the parent Brand Bible:**

- Palette, typography, F mark → Brand Bible Ch. 05
- Voice principles → Brand Bible Ch. 04
- Personas → Brand Bible Ch. 10

**Architectural framing:** Briefing Library is the archetypal **Shelf Storefront** per [Storefront Registry](https://www.notion.so/34689a0c1680814a8a64e4564295eb28). Inventory is produced ahead of distribution and sits ready.

**Library home:** the Library's catalog and records live in **Supabase** (per DEC-IDF-25). Airtable is not the Library's home.

---

## 02. Audience

The Library serves three distinct audiences, each reaching the inventory through a different channel:

### 02.1 Sales Prospects

Prospects in active sales conversations receive relevant Briefings as part of the outreach sequence. A prospect at a hyperscaler receives relevant Company Briefings on their competitors. A utility prospect receives the Power Architecture Theme Briefing. The Library is the sales team's library.

### 02.2 Existing Subscribers

Core- and Premier-tier subscribers access the Library as a reference resource. When a subscriber reads an Alert that references a Theme, they can click through to the full Theme Briefing for the expanded version. Subscriber access tiering is under design (see Open Decisions).

### 02.3 Outbound Campaign Recipients

Targeted outbound campaigns pair campaign messaging with relevant Briefings. A LinkedIn campaign targeting power sector executives is accompanied by the Power Architecture Theme Briefing as the value anchor. The Library makes campaigns substantive, not promotional.

---

## 03. Inventory Scope

The Library carries Briefings across the full Faraday intelligence architecture — **7 Themes, 23 Domains, 117 Sub-Domains** — plus tracked companies. Every entity that has a canonical presence in the system has a Briefing in the Library. Each Briefing is produced at one of three tiers with a page target — **Deep (10–15 pp) · Standard (8–10 pp) · Profile (2 pp)** — and rendered as one of four artifact types — **Design · Docs · Dashboard · Slides** (see §05).

### 03.1 Theme Briefings

One Briefing per IDF Theme (7). Themes are cross-domain — each Briefing covers the defining narrative of that Theme, the constituent Domains and Sub-Domains, key signals, representative companies, and Faraday's Read. Tier: **Deep**. **[V2 — confirm]**

### 03.2 Domain Briefings

One Briefing per Domain (D1–D23). Each covers the Domain's scope, constituent Sub-Domains, key companies, state of the field, and Faraday's Read. Tier: **Standard**. **[V2 — confirm]**

### 03.3 Sub-Domain Briefings

One Briefing per Sub-Domain (117 Sub-Domains across 23 Domains and 7 Themes). Produced selectively based on subscriber signal and market relevance; not every Sub-Domain warrants a full Briefing immediately. Tier: **Standard**. **[V2 — confirm]**

### 03.4 Company Briefings

One Briefing per tracked company in the tracking companies table (Supabase). Covers company profile, strategic positioning, capital and operational posture, leadership, and Faraday's Read (with Velocity Play hypothesis where applicable). Tier: **Profile**. **[V2 — confirm]**

### 03.5 Business Plan Briefings

Business plan-format Briefings for internal and investor-facing use. Artifact type: **Slides**. **[V2 — confirm]**

### 03.6 Thought Forge Briefings

Briefings produced via the Thought Forge Storefront's commission surface. Tier: **Deep**. **[V2 — confirm]** Commissioned Briefings may, with subscriber permission and generalization, be added to the Library inventory.

### 03.7 Jurisdiction Briefings

Per-jurisdiction Briefings produced for Jurisdiction Watch. Tier: **Standard**; artifact type **Docs** primary, **Dashboard** where JPS data renders live. **[V2 — confirm]** Integration point with the Jurisdiction Watch Storefront; the Library is the inventory, Jurisdiction Watch is one of the surfaces that renders them.

### 03.8 Academy-Adjacent Briefings

Briefings produced as companion reading for Academy courses. Artifact type: **Docs**. **[V2 — confirm]**

---

## 04. Automation Cadence

### 04.1 Refresh Rules

- **Company Briefings:** Monthly refresh automation pulls latest signals from the tracking companies table (Supabase), AUTO-035 (Company Overviews Refresh), and related intelligence feeds
- **Theme and Domain Briefings:** Monthly refresh on rotating schedule — roughly 2–3 Theme Briefings and 5–6 Domain Briefings regenerated per month to spread load
- **Sub-Domain Briefings:** Quarterly refresh, selective based on activity
- **Business Plan Briefings:** Refresh on-demand (not on automated cadence)
- **Thought Forge Briefings:** Produced per commission; not refreshed unless commissioned subscriber requests update
- **Jurisdiction Briefings:** Monthly refresh aligned with JPS score refresh cycle

### 04.2 Production Pipeline

Inputs: tracking companies table (Supabase), IDF Domain/Sub-Domain Registry, Intelligence Baseline, Lexicon, relevant Signals from the past 30 days.

Processing: Thought Forge (Engine) assembles the Briefing structure. Velocity Play conviction applied. Two-Analyst System byline selected per Briefing type. The Briefing is rendered as an artifact (Design, Docs, Dashboard or Slides) to its tier's page target, and its Library record is stored in Supabase (DEC-IDF-25).

Pre-publication: Myke sign-off required. Every Briefing. No automated publishing to external surfaces.

### 04.3 Retirement

Briefings that are no longer current are archived, not deleted. Archived versions retain their URL and remain accessible for historical reference. Sales and outbound distribution use only the current version.

---

## 05. Artifact Type & Tier Mapping

**Tier page targets:** Deep 10–15 pp · Standard 8–10 pp · Profile 2 pp.
**Artifact types:** Design · Docs · Dashboard · Slides.

| Briefing Type | Tier | Artifact Type |
|---|---|---|
| Theme | Deep | Docs |
| Domain, Sub-Domain | Standard | Docs |
| Company | Profile | Docs |
| Business Plan | Standard | Slides |
| Thought Forge commission | Deep | Docs |
| Academy-adjacent | Standard | Docs |
| Jurisdiction | Standard | Docs (primary); Dashboard where JPS data renders live |

Design is the artifact type for visual one-offs (posters, shareable cover pages) attached to any Briefing. **[V2 — confirm: every tier and artifact-type assignment in this table is a V2 default chosen to replace the retired Gamma theme mapping; the original page did not specify tiers.]**

---

## 06. Voice Variant — Editorial-Authoritative

Briefing Library voice is Faraday's full editorial register at maximum intensity. This is where the platform's conviction lives — not in Alerts (which are timelier but shorter) and not in Academy (which is more patient).

**Structural rules:**

- **Hypothesis-led opening.** Every Briefing opens with the thesis, not the context. The reader knows within 30 seconds what Faraday thinks and why it matters.
- **Sourced claims throughout.** Every factual claim traced to a source. No "experts predict," no "industry observers note."
- **Faraday's Take callout** on every Briefing — warm cream background, forest/gold double left rule, short opinion paragraph in italic serif
- **Gilbert byline** for empirical Briefings (Domain, Sub-Domain, Jurisdiction); **Mach byline** for forward-thesis Briefings (Theme-level if theme is forward-looking; Business Plan; Thought Forge forward commissions); **co-attributed** for Fellow-level frontier Briefings
- **Double-rule section breaks** — forest over gold — the Faraday editorial signature
- **Sources & methodology page** as the final page, always

---

## 07. Myke Sign-Off Gate

Every Briefing carries explicit Myke sign-off before external distribution. This is a standing governance rule, non-negotiable. The automation pipeline produces the draft; Myke reviews; external deployment happens only after approval.

Rationale: the Library is the highest-stakes output format in the Faraday system. Briefings are distributed through sales and outbound channels; a low-quality or factually wrong Briefing harms the brand in the most damaging possible way. Automation produces speed; Myke provides quality control.

---

## 08. Deployment & Tracking

### 08.1 Deployment Channels

- **Sales outbound** — Briefings sent with targeted prospect communications
- **Subscriber-facing surfaces** — Alerts reference Briefings with direct links; subscriber dashboard includes browsable Library access
- **Outbound campaigns** — email campaigns carry Briefings as value anchors
- **Social** — selective public release of individual Briefings as lead-gen content (with Myke approval per release)

### 08.2 Tracking

Every Briefing deployment is tracked: recipient, timestamp, channel, downstream engagement (opens, clicks, follow-up actions). This data feeds the subscriber intelligence for sales conversations and informs Library refresh prioritization.

---

## 09. Engine Capabilities Consumed

- **Thought Forge (Engine)** — brief-assembly reasoning; the Library is the primary consumption surface for Thought Forge's off-the-shelf work
- **IDF** — every Briefing is mapped to Theme / Domain / Sub-Domain / company
- **Velocity Play** — hypothesis generation for Company and Theme Briefings
- **Two-Analyst System** — byline selection per Briefing type
- **Prognostications** — prediction-anchored Briefings and forward-thesis content
- **Intelligence Baseline** — canonical figures cited throughout
- **JPS** — input to Jurisdiction Briefings

---

## 10. Output Formats Produced

- **Briefing** (primary format, multiple variants by scope, tier and artifact type) — see Output Format Registry

The Library does not produce any other format. It is a monolithic format storefront; the variation is in scope (what the Briefing is about), tier (Deep / Standard / Profile) and artifact type (Design / Docs / Dashboard / Slides), not in format structure.

---

## 11. Relationship to Other Storefronts

### 11.1 Briefing Library ↔ Thought Forge

The two are sibling storefronts with complementary scope. Briefing Library is off-the-shelf inventory; Thought Forge is custom commission. Thought Forge's commissioned Briefings may flow into Briefing Library inventory after generalization.

### 11.2 Briefing Library → Intelligent Alert

Alerts reference Briefings with direct links. A significant section in an Alert "see full [Theme] Briefing→" drives subscribers from Alert into the Library.

### 11.3 Briefing Library → Live Agent

Live Agent responses cite Briefings as linked references. "For the full treatment, see the [Domain] Briefing."

### 11.4 Briefing Library → Jurisdiction Watch

Per-jurisdiction Briefings live in the Library; Jurisdiction Watch is the Storefront that surfaces them contextually.

### 11.5 Briefing Library → Academy

Academy courses reference companion Briefings (Academy-adjacent) as structured reading.

---

## 12. Open Decisions — Deferred

- Subscriber Library access tiering (which tiers see which Briefings; full access vs. summary access)
- Public-facing Library gateway (a curated subset as lead-gen; the SEO surface)
- Briefing versioning and change log (do subscribers see that a Briefing was updated; when)
- Sub-Domain Briefing production prioritization (which Sub-Domains warrant immediate Briefings; which can wait)
- ~~Briefing length standards~~ — **resolved in V2:** tier page targets Deep 10–15 pp · Standard 8–10 pp · Profile 2 pp (see §05)
- Theme Overview deck generation sprint ([OA-014](https://www.notion.so/688f96f6620440f1a9bb61b3c114c090))
- Translation and localization for international Theaters (EMEA/APAC posture)

---

## 📎 Related

- [Faraday — Brand Bible](https://www.notion.so/33489a0c168081338515e1fc777b6c43)
- [Faraday Architecture](https://www.notion.so/34689a0c1680814285a0f6ccdc68dec0)
- [Storefront Registry](https://www.notion.so/34689a0c1680814a8a64e4564295eb28)
- [🗂️ Gamma Company Brief — Session Log & Prompt Registry](https://www.notion.so/33c89a0c168081adb540c2db742b0461) — historical (V1 Gamma pipeline, retired)
- [Engine Registry — Thought Forge entry](https://www.notion.so/34689a0c168081b38b90d7ed3008f3f4)
- [Output Format Registry — Briefing entry](https://www.notion.so/34689a0c168081c4b7aef9705c2e331f)
- [🛠 Build Status — Briefing Library Storefront (v1.0) · 2026-06-20](https://app.notion.com/p/38589a0c168081fdb30fe3c972e10928) (child page; status log, not part of the Brand Bible text)

---

### Public Coverage Vocabulary (IDF 5.0 §02)

Faraday's three taxonomy layers carry subscriber-facing names: **Theater** (Theme) › **Sector** (Domain) › **Thread** (Sub-Domain), with **Signal** as the dated event that streams into a Thread. *Follow the Thread, catch the Signals.* No counts in subscriber copy. The Library's shelf nav uses these labels: **Theater Briefing › Sector Briefing › Thread Briefing**, plus Company Briefing. Canonical map: IDF 5.0 §02 (previously [IDF 4.0 §01](https://app.notion.com/p/37189a0c16808199bca1cf304a45bbde)); Faraday-wide record in the [parent Brand Bible](https://app.notion.com/p/33489a0c168081338515e1fc777b6c43).

> Note: the 7 / 23 / 117 counts in §03 are internal-reference figures for this Brand Bible. Per the rule above, they do not appear in subscriber copy.

🔗 [Domain-Tracker](https://app.notion.com/p/39589a0c168081d497b8edc842d8e1a4) — domain registrar/DNS status, Cloudflare→Vercel migration tracking
