<!-- Deep brief sample (BL-08 / FDY-174). Manuscript of record for deep-sample.html.
     Source Draft: Airtable Briefing Library recMlmb655VUUXSFl — see Sources & methodology.
     Markers [Sn] resolve to the source_refs array at the end of this file. -->

:::cover
# The Power Reckoning

The grid has stopped rationing electrons and started rationing permission. In 2026 every layer of American power governance moved to the same rule: a data center that wants to connect must pay its own way, wait its turn, or agree to be switched off.

- **Tier:** Deep brief
- **Coverage:** Theater: The Power Reckoning › Sector: Grid & Regulatory (secondary: Power Architecture) › Thread: Large-Load Tariff Design & Co-Location Rules
- **Byline:** Gilbert Faraday, with the forward call by Mach Eigen
- **Evidence window:** 7 May – 7 Oct 2026, eleven sources, de-duplicated by URL
- **Status:** DRAFT. Template sample, not for distribution. Requires Myke sign-off (Deep tier).
:::

## Summary

**Faraday's thesis.** Power is no longer the binding constraint on American data center growth in the way the industry describes it. The binding constraint is the terms of connection. Between May and October 2026, federal regulators, every state that legislated, and the largest grid operator in Texas converged on one bargain: large loads connect faster if they pay the full incremental cost of serving them, bring or contract their own generation, and accept curtailment. Developers who structure projects around that bargain will connect. Developers who wait for the old terms will wait in a queue that is already longer than a construction cycle.

**Findings**

1. **The queue is longer than the build.** Lawrence Berkeley National Laboratory counts over 2,060 GW of generation and storage seeking interconnection at the end of 2025, with a median of more than five years from request to commercial operation for projects built in 2025 [S2]. Large loads face a similar clock: connecting a load of 200 MW or more typically takes at least five years [S4].
2. **Demand requests dwarf the system.** ERCOT is tracking more than 438,000 MW of large-load requests, nearly 89% of them from data centers [S1]. PJM's July 2026 capacity auction identified a reliability shortfall of 6,831 MW for the 2028–29 delivery year [S5].
3. **Washington chose speed by order, not by rule.** On 18 June 2026 FERC issued six tailored show-cause orders instead of a national rulemaking, giving grid operators 60 days to justify or reform their large-load tariffs and 30 days to report on generation adequacy [S3][S4].
4. **The states are writing the bill.** Only 13 states lack any utility tariff setting requirements for data centers and other large loads [S6]. Eight states had enacted cost-protection laws by July 2026 [S7]. The House passed the Ratepayer Protection Act 417–3 on 16 September [S6].
5. **"Bring your own power" is now a product.** Black Hills' agreements to serve Google in Cheyenne pair up to 590 MW of grid service with about 2.1 GW of third-party resources run through a private microgrid [S10]. Vertiv agreed to pay about $1.45 billion for a microgrid and behind-the-meter specialist [S11].
6. **Permission is a second grid.** New York, Montgomery County (Maryland) and Prince William County (Virginia) have each paused data center approvals or seen them invalidated [S9]; one legal survey counts more than 140 local groups blocking or delaying about $60 billion or more of investment [S8].

**What to watch:** Pennsylvania's curtailment order (vote targeted 28 January) [S5]; ERCOT's Batch Zero transmission plan (fall 2027) [S1]; Senate action on the Ratepayer Protection Act [S6]; Vertiv–UIG close (Q4 2026) [S11].

## 1. The queue is longer than the build

*Claim: the time it takes to connect, not the volume of power available, now sets the pace of the buildout.*

The clearest measure of the constraint is the interconnection queue. Lawrence Berkeley National Laboratory's *Queued Up: 2026 Edition*, built with GridTracker from all seven ISOs/RTOs and 50 non-ISO utilities covering about 98% of installed US generating capacity, reports that over 2,060 GW of generation and storage capacity was actively seeking grid connection at the end of 2025 [S2]. That total is about 8,200 projects: 1,312 GW of generation and roughly 749 GW of storage [S2].

The volume is not the problem. The conversion rate is. Only 13% of the capacity that requested interconnection from 2000 to 2020 had reached commercial operation by the end of 2025; 75% had been withdrawn and 10% was still active [S2]. And the projects that do get built take longer: for regions with available data, the median time from interconnection request to commercial operation exceeded five years for projects built in 2025 [S2].

The mix inside the queue is shifting toward firm power. Active natural gas capacity rose 86% in 2025 to 253 GW, while solar fell 19% to 773 GW, storage fell 16% to 749 GW and wind fell 19% to 220 GW [S2]. Total active queue volume fell 10% year over year on high withdrawals and fewer new requests [S2]. A further 549 GW already holds a draft or executed interconnection agreement but has not reached operation, including 45 GW of gas [S2].

Load faces its own version of the clock. The American Action Forum's analysis of FERC's June action states that a large energy user of 200 MW or more typically waits at least five years from initial interconnection request to commercial operation [S4]. For a data center, that is longer than the construction schedule of the building it is meant to power.

| Indicator | Value | Source |
|---|---|---|
| Generation + storage seeking interconnection, end-2025 | > 2,060 GW | [S2] |
| Median request-to-operation, projects built 2025 | > 5 years | [S2] |
| Share of 2000–2020 requested capacity operating by end-2025 | 13% | [S2] |
| Active gas capacity in queues, change in 2025 | 253 GW, +86% | [S2] |
| Typical time to connect a ≥ 200 MW load | ≥ 5 years | [S4] |

LBNL itself cautions that FERC Order 2023 and other reforms are being implemented but that it is too early to measure their full effect [S2]. Faraday's reading: any siting model that assumes a grid connection inside a normal construction cycle is assuming a reform outcome that the data do not yet show.

## 2. Demand requests dwarf the system

*Claim: the requests now filed by large loads are so large that grid operators have stopped treating them as individual customers and started treating them as a system-planning event.*

ERCOT reports that it is tracking more than 438,000 MW of large-load requests, nearly 89% of them from data centers alone [S1]. ERCOT's own description of its system gives the scale: it serves more than 27 million Texas customers, about 90% of the state's electric load, over 55,000 miles of transmission and more than 1,460 generation units [S1]. Not every request becomes a project, and ERCOT says so; it also says its data show the majority of requests expect to be operational by 2030 [S1].

In New York, Executive Order 62 points to nearly 12 GW of data center load requests in the NYISO queue as of May 2026, according to Data Center Frontier's account of the order [S9].

In PJM the pressure shows up in the capacity market. Pennsylvania's Public Utility Commission, announcing its September action, stated that PJM's July 2026 capacity auction identified a system-wide reliability shortfall of 6,831 MW for the 2028–29 delivery year [S5]. The commission's August report projected industrial load growth of 18.56% in Pennsylvania over the next five years, driven primarily by PPL Electric Utilities' large-load forecast, even though electricity usage declined from 2024 to 2025 [S5]. The report attributed the strain to "an insufficient level of construction of electric generation and continued retirement of base load electric generation" [S5].

Households feel the result. Clean Energy Group cites a Duke Energy proposal in North Carolina for an 18% rate increase to prepare for data center demand, adding $280–$355 a year to the average household bill, and an expectation that data centers will raise household bills in the PJM region by $70 a month by 2028 [S7]. Nixon Peabody reports that PJM data center demand drove a 20% increase in New Jersey household bills in 2025 [S8].

Those bill figures are the political fuel for everything in the next three sections.

## 3. Washington chose speed by order, not by rule

*Claim: the federal government accelerated large-load interconnection in 2026 while leaving the cost question to the states, and that division of labor is now the operating framework.*

The federal sequence ran over eight months. On 23 October 2025, Energy Secretary Chris Wright asked FERC, using the rarely invoked Section 403 of the Department of Energy Organization Act, to consider rules for connecting loads above 20 MW to the interstate transmission system [S4]. In December 2025 FERC directed PJM to adopt transparent tariff rules for loads co-located with generation [S3], and on 14 January 2026 it accepted Southwest Power Pool's High Impact Large Loads framework [S8]. On 16 April 2026 FERC issued an Order Regarding Intent to Act in Docket RM26-4-000 [S8].

On 18 June 2026 FERC acted, but not with the national rulemaking many expected. It issued tailored show-cause orders under Section 206 of the Federal Power Act to each of the six RTOs/ISOs under its jurisdiction: PJM, MISO, SPP, CAISO, ISO New England and NYISO [S3]. Each operator and its transmission owners had 60 days to justify their tariffs as just and reasonable without large-load provisions, or to file changes, and 30 days to report how they would ensure adequate generation for existing and new large loads [S3]. The orders set out five reform categories [S3]:

- efficient transmission service application and study processes;
- preventing cost shifting, with transparency into transmission costs;
- accommodating co-location agreements and behind-the-meter generation;
- new transmission services for flexible large loads;
- a process to study generation serving electrically proximate and co-located loads.

The American Action Forum's analysis argues that a rulemaking would likely have taken two to five years, and that the region-specific orders, confined to FERC's jurisdiction, are built to withstand challenges from state stakeholders [S4]. FERC's orders state that nothing in them intrudes on state authority to site generation or set retail rates, and that they leave to the states the job of preventing cost shifting among retail customers [S4]. State regulators had asked for exactly that line: the National Association of Regulatory Utility Commissioners told FERC on 13 April 2026 that federal regulation of large-load interconnection would impede states' ability to protect affordability [S4].

Reliability regulation moved in parallel. On 4 May 2026 NERC issued a Level 3 Essential Action Alert on computational load risks and created a Computational Load Entity registration class for sites of 20 MW or more aggregate connected capacity at a single point of interconnection of 60 kV or more [S8]. Nixon Peabody expects enforceable obligations for in-scope data centers and utilities starting in 2027 [S8].

The political layer came last. On 4 March 2026 Amazon, Google, Meta, Microsoft, OpenAI, Oracle and xAI signed the White House Ratepayer Protection Pledge, committing to build, bring or buy all new generation and to pay for delivery upgrades [S8]. The pledge is voluntary and, per Clean Energy Group, has no enforcement mechanism [S7]. On 16 September the House passed the Ratepayer Protection Act 417–3; it requires states to consider standards for loads above 100 MW covering the full incremental cost of generation, transmission and distribution upgrades [S6]. ClearView Energy Partners, quoted by Utility Dive, judged the bill unlikely to pass the Senate before the November midterms [S6].

## 4. The states are writing the bill

*Claim: cost allocation for data center load is now settled policy in most of the country; what remains open is how much each state charges and how it collects.*

The count is already lopsided. Citing the Smart Electric Power Alliance's large-load tariff database, Utility Dive reports that only 13 states lack any utility tariff setting requirements for data centers and other large loads, and at least three of those were considering requirements as of July [S6]. Nixon Peabody counts more than 300 data center bills filed in more than 30 states in 2026 [S8].

Clean Energy Group lists eight states that had enacted ratepayer-protection legislation by July 2026 [S7]:

| State | Law | Signed | Core provision (per [S7]) |
|---|---|---|---|
| Florida | SB 484 | May 2026 | Prevents cost pass-through; preserves local siting authority |
| Tennessee | HB 1847 | May 2026 | Data Center Cost Responsibility Act |
| Oklahoma | HB 2992 | May 2026 | Separate tariffs for large-load customers |
| South Dakota | SB 135 | March 2026 | Protects residents from cost increases and shortages |
| Oregon | HB 3546 (POWER Act) | August 2025 | Separate rate category for large loads |
| Texas | SB 6 | June 2025 | Expanded oversight of new large loads |
| Minnesota | HF 16 | June 2025 | Separate customer class; ends electricity sales-tax exemption |
| New Jersey | A796 | July 2026 | Large-load rate class; efficiency-for-capacity incentive |

The mechanisms are converging. State regulators increasingly require large loads to pay upfront for system impact studies, ramp to full load within a set number of months, and pay exit fees if they stop development or cut service [S6]. Virginia's State Corporation Commission approved a large-customer rate starting January 2027 under which affected customers pay for at least 85% of contracted distribution and transmission demand and 60% of generation demand [S4]. Virginia's HB 1393 requires loads of 25 MW or more to pay for new generation capacity [S8]. Alabama's SB 270 requires contracts of 150 MW or more to pass a ratepayer benefit test [S8]. Texas SB 6 regulates loads of 75 MW or more, with disconnection protocols [S8].

Georgia went furthest. Its Public Service Commission approved the Customer-Identified Resource program on 15 April 2026, under which large customers bring their own clean power through sleeved power purchase agreements; Nixon Peabody calls participation a de facto interconnection prerequisite [S8]. Georgia's SB 476 also eliminated data center tax credits, which Nixon Peabody puts at $2.5 billion a year in forgone revenue [S8].

Pennsylvania shows the next step: regulators examining curtailment and cost of capital together. On 11 September its PUC voted unanimously to have staff propose updated emergency curtailment rules, to hold a technical conference on large-load cost allocation, and to form a ratemaking working group examining return on equity [S5]. A tentative curtailment order was due at the 1 October meeting, with a final vote targeted for 28 January [S5].

## 5. The queue, redesigned

*Claim: grid operators are trading faster connection for control; flexibility and self-supply have become the price of admission.*

ERCOT's Batch Zero is the template. Approved by the Public Utility Commission of Texas on 18 June 2026, it groups qualified large projects of 75 MW or more into a single study so ERCOT can see future demand at once, allocate available capacity and identify transmission upgrades, replacing project-by-project review [S1]. ERCOT describes itself as the first ISO in the nation to use a batch process for large users [S1].

Two features matter more than the batch itself. First, the framework gives a pathway to large customers that build onsite generation to self-supply some or all of their electricity; facilities truly islanded with no grid connection generally fall outside ERCOT's interconnection process, though they may still have to register with the PUCT [S1]. Second, it creates a connection pathway for large customers who agree to let ERCOT curtail their power use in response to local transmission constraints [S1].

The timetable is long. ERCOT expected to notify Batch Zero applicants of their classification in August 2026, expects to publish a final transmission plan for the whole batch in fall 2027, and expects applications for Batch 1 to open in summer 2027 [S1].

FERC's orders point the same way. Two of the five reform categories are accommodating co-location and behind-the-meter generation, and new transmission services for flexible large loads [S3]. FERC singled out SPP's High Impact Large Load and related generation assessment processes as standing out, which the American Action Forum reads as a potential model for other operators [S4].

The economics of hiding load are closing. Nixon Peabody expected FERC's large-load rules to require behind-the-meter generation to be reported and modeled in load forecasts, co-located loads above 50 MW to pay full transmission charges without netting, and generators serving co-located load to reduce their capacity interconnection rights dollar for dollar. Its conclusion: the prior cost advantage of masking load behind the meter is being eliminated [S8]. That expectation predates the June orders, and the orders as issued set categories, not those specific terms [S3]. It is a forecast to test against the compliance filings, not a settled outcome.

## 6. Bring your own power becomes a product

*Claim: self-supply has moved from a workaround to a contract structure and an acquisition category.*

The Black Hills–Google agreements in Cheyenne, Wyoming, effective 30 September 2026 and running through 2048, are the clearest public example [S10]. They combine up to 590 MW of grid-connected service with about 2.1 GW of Wyoming third-party contracted resources managed through a privately run microgrid under Black Hills' Large Power Contract Service tariff, for a total resource portfolio of about 2.7 GW including reserve margins [S10].

| Term | Value (per [S10]) |
|---|---|
| Black Hills investment, 2027–2029 | $1.8 billion |
| New company-owned gas generation | 564 MW, at Cheyenne Prairie Generating Station, via a non-regulated affiliate |
| Grid-connected service | Up to 590 MW |
| Third-party resources via private microgrid | ≈ 2.1 GW |
| First power / peak ramp | Late 2027 / 2030 |
| Google refundable advances for long-lead equipment | $399 million |
| Expected Black Hills net income contribution, 2030 | ≈ $150 million |

The structure answers the cost question directly. Black Hills says Google bears all costs of serving the data center over the life of the project, with cost pass-through, full recovery of the generation investment over the contract term, stranded-asset protection, early-termination provisions and collateral requirements [S10]. Converge Digest's analysis draws the conclusion: the utility connection and the total energy architecture are no longer the same thing [S10].

The equipment market is pricing the same shift. On 2 September 2026 Vertiv agreed to acquire UtilityInnovation Group for about $1.45 billion in cash, with up to $1.15 billion more tied to 12- and 24-month EBITDA targets, for potential total consideration of about $2.6 billion [S11]. UIG designs grid-connected, bridge-to-grid and islanded power architectures with its own controls platform and microgrid switchgear [S11]. The initial price is about 13 times UIG's expected 2027 EBITDA, and the deal is expected to close in Q4 2026 [S11]. Vertiv's chief executive framed the rationale as speed: competitive advantage "increasingly depends on how quickly they can move from site selection to first token" [S11].

Self-supply is not free of time cost. ClearView Energy Partners warned that requiring data centers to bring their own new capacity could extend construction by years, because a power plant typically takes far longer to build than a data center [S6]. Black Hills' first service date is late 2027 for an agreement signed in 2026 [S10].

## 7. Permission is a second grid

*Claim: local and state consent now constrains siting as tightly as megawatts do, and it is failing in the same places power is scarcest.*

Data Center Frontier's editor-in-chief described the summer of 2026 as the moment "the public has entered the room" [S9]. His account, citing Reuters, records 142 demonstrations across 42 states on 18 July in what Reuters described as the first coordinated national protest against the buildout, and a June Reuters/Ipsos poll in which 57% of respondents would oppose a data center in their community and 14% said they would be comfortable with one nearby [S9]. Clean Energy Group cites a separate Gallup poll in which 70% of Americans oppose data center construction in their area [S7]. The two polls ask different questions; both point the same way.

The actions are concrete:

- **New York** imposed a one-year pause on certain environmental approvals for new hyperscale data centers while it develops standards and a host-community benefits framework [S9]. Clean Energy Group describes New York as the first state to initiate a moratorium on data centers over 40 MW [S7].
- **Montgomery County, Maryland** voted unanimously on 28 July to pause new data center permits for 18 months [S9].
- **Prince William County, Virginia:** the Digital Gateway collapsed after years of opposition and litigation; approvals were invalidated over public-notice defects and QTS withdrew the last appeal [S9].
- **Nationally**, Nixon Peabody counts more than 140 local groups blocking or delaying about $60 billion or more in investment, and 12 or more moratorium bills [S8].

Nixon Peabody names the shift: from "energy-first" siting to "power-plus-permission", in which a project needs a social license (legislative durability, ratepayer-protection commitments, transparent operations and community acceptance) alongside power access [S8]. Water is becoming part of that license. Florida's SB 484, effective 1 July 2026, creates a consumptive-use permitting framework for data centers of 50 MW or more [S8].

Faraday's reading: the opposition maps onto the cost fight in sections 2 and 4. The bill impact is the argument residents use, and the cost-allocation laws are the concession states make. A developer that arrives with a cost-bearing tariff and its own supply has answered the most common objection before the hearing.

## Signals to watch

Each row is an event a source names with a date or window.

| When | Signal | Source |
|---|---|---|
| Q4 2026 | Vertiv–UtilityInnovation Group acquisition expected to close | [S11] |
| Fall 2026 | Pennsylvania PUC technical conference on large-load cost allocation | [S5] |
| 31 Dec 2026 | NERC revised registry criteria filing due (Computational Load Entity class) | [S8] |
| Jan 2027 | Virginia SCC large-customer rate takes effect (85% T&D / 60% generation minimums) | [S4] |
| 28 Jan 2027 | Pennsylvania PUC target vote on curtailment order | [S5] |
| Before Nov 2026 midterms | Senate action on the Ratepayer Protection Act, judged unlikely by ClearView | [S6] |
| Late 2027 | Google Cheyenne begins taking power from Black Hills | [S10] |
| Summer 2027 | ERCOT opens Batch 1 applications | [S1] |
| Fall 2027 | ERCOT publishes the Batch Zero transmission plan | [S1] |

:::take
## Faraday's Take

The industry still talks about power as a commodity it cannot buy enough of. The record of 2026 says something narrower and more useful: power is available on new terms, and the terms are now written down. FERC told every grid operator to justify or rewrite its large-load rules. Most states have a large-load tariff. Texas built a queue that rewards self-supply and curtailment. The largest buyers signed a pledge to build, bring or buy their own generation.

Read together, these are not obstacles. They are a price list. Pay the full incremental cost. Bring capacity, or contract for it. Accept that the grid can switch you off when it is short. A developer that accepts all three gets a path to connection that the queue alone cannot offer. A developer that waits for the old bargain, cheap shared upgrades and firm service on demand, is waiting for terms that no regulator in this record is offering.

Our view is that the winners of the next cycle are the ones who treat the connection agreement as the product, and the data hall as the part that follows. Black Hills and Google show the shape: a modest grid connection wrapped in a much larger private supply portfolio, with the customer carrying the cost. Vertiv's purchase shows the supply chain has already priced it.

The risk we would watch is time. Self-supply moves the bottleneck from the queue to the power plant, and power plants are slower to build than data centers. The firms that solve that, with bridge power, staged ramps and curtailable designs, will set the pace for everyone else.

*— Mach Eigen, with Gilbert Faraday*
:::

## Sources & methodology

| Ref | Source | Publisher | Date | Supabase artifact |
|---|---|---|---|---|
| S1 | [PUCT Approves ERCOT's Batch Zero Process for Connecting Large Electricity Users](https://www.ercot.com/news/release/06182026-puct-approves-ercots) | ERCOT | 2026-06-18 | 911412db-8990-4cc6-a691-1d94bf1d8440 |
| S2 | [Queued Up: 2026 Edition, Characteristics of Power Plants Seeking Transmission Interconnection](https://emp.lbl.gov/queues) | Lawrence Berkeley National Laboratory | 2026-07-16 | 3ea143bd-49fe-46f5-bd4a-afdfd780500f |
| S3 | [FERC Launches Aggressive Targeted Action to Speed Large Load Integration](https://www.ferc.gov/news-events/news/ferc-launches-aggressive-targeted-action-speed-large-load-integration) | FERC | 2026-06-18 | 807d50ba-3b0b-44ba-8a86-74bbdf8d9dda |
| S4 | [FERC Data Center Orders Accelerate Grid Connection](https://www.americanactionforum.org/insight/ferc-data-center-orders-accelerate-grid-connection/) | American Action Forum | 2026-06-18 | 1583a02d-d937-4ca7-91fa-9f6d6dfb88ac |
| S5 | [Pennsylvania PUC to consider ratemaking, ROE and curtailment as data center load grows](https://www.utilitydive.com/news/pennsylvania-puc-to-consider-rates-and-curtailment-as-data-centers-grow/830174/) | Utility Dive | 2026-09-11 | 54205445-b2a4-4774-b023-00316abb0ea9 |
| S6 | [House passes ratepayer protection bill to limit data center cost shifts](https://www.utilitydive.com/news/house-passes-ratepayer-protection-bill-data-centers/830658/) | Utility Dive | 2026-09-17 | 8f567e0f-c354-46df-a9a4-9763ec606cdd |
| S7 | [States are stepping up to protect households from rising energy bills due to data centers](https://www.cleanegroup.org/states-are-stepping-up-to-protect-households-from-rising-energy-bills-due-to-data-centers/) | Clean Energy Group | 2026-07-16 | 9dcfbf68-74c0-46c1-a78f-91fae6bb3eee |
| S8 | [Data center site selection strategy update](https://www.nixonpeabody.com/insights/alerts/2026/05/07/data-center-site-selection-strategy-update) | Nixon Peabody | 2026-05-07 | e471f64d-384d-457b-a4d8-e35fdf1199bd |
| S9 | [The Data Center Industry's Permission to Build](https://www.datacenterfrontier.com/site-selection/blog/55394817/the-data-center-industrys-permission-to-build) | Data Center Frontier | 2026-07-31 | c5dc5867-e321-4702-b30e-03b8c872ad7c |
| S10 | [Black Hills to Invest $1.8B to Power Google Data Center in Wyoming](https://convergedigest.com/black-hills-google-cheyenne-data-center-power/) | Converge Digest | 2026-10-07 | e63e54d5-1b17-442a-bacb-f179249724a7 |
| S11 | [Vertiv to Acquire UtilityInnovation Group for $1.45B](https://convergedigest.com/vertiv-acquire-uig-ai-data-center-microgrids/) | Converge Digest | 2026-09-03 | ee94462b-f6c8-44c5-8b0e-c8676a19762d |

**Method.** This sample was built for the BL-08 Deep template from the Briefing Library Draft *The Power Reckoning* (Airtable `appxfti7VuoHYUeu6` / `tbl4kbby85nx6Z891`, record `recMlmb655VUUXSFl`, read-only). That record holds a title, a one-line description ("Thematic brief on power as the binding constraint on AI data center growth"), links to the Sectors Power Architecture and Grid & Regulatory, and a link to a retired Gamma deck. It holds no source list. The Gamma deck was not opened (Gamma is retired from the V2 pipeline), so none of its claims are carried here. Every claim in this brief was read from the body text of a Supabase `artifacts` row (project `ycadmmngkdhvpcsrcuaq`, read-only), cited by the row's `source_url`.

**Coverage mapping (proposed, for the `briefings` row):** `tier = deep`, `sector_id = D3` (Grid & Regulatory; secondary D2 Power Architecture), `thread_id = D3.5` (Large-Load Tariff Design & Co-Location Rules), `status = draft`.

**Excluded for lack of a source in the corpus read:** transformer and gas-turbine lead times, equipment backlogs, and any data center electricity consumption forecast. None of the artifacts read supported a figure, so the brief makes no claim about them. Where a source attributes a figure to a third party (Reuters, Reuters/Ipsos, Gallup, SEPA, ClearView), the brief names the third party and cites the source it read.

```json source_refs
[
  {"ref":"S1","url":"https://www.ercot.com/news/release/06182026-puct-approves-ercots","title":"PUCT Approves ERCOT's Batch Zero Process for Connecting Large Electricity Users While Protecting System Reliability for Texans","publisher":"ERCOT","published_at":"2026-06-18","artifact_id":"911412db-8990-4cc6-a691-1d94bf1d8440","used_in":["summary","s2","s5","signals"]},
  {"ref":"S2","url":"https://emp.lbl.gov/queues","title":"Queued Up: 2026 Edition, Characteristics of Power Plants Seeking Transmission Interconnection","publisher":"Lawrence Berkeley National Laboratory","published_at":"2026-07-16","artifact_id":"3ea143bd-49fe-46f5-bd4a-afdfd780500f","used_in":["summary","s1"]},
  {"ref":"S3","url":"https://www.ferc.gov/news-events/news/ferc-launches-aggressive-targeted-action-speed-large-load-integration","title":"FERC Launches Aggressive Targeted Action to Speed Large Load Integration","publisher":"Federal Energy Regulatory Commission","published_at":"2026-06-18","artifact_id":"807d50ba-3b0b-44ba-8a86-74bbdf8d9dda","used_in":["summary","s3","s5"]},
  {"ref":"S4","url":"https://www.americanactionforum.org/insight/ferc-data-center-orders-accelerate-grid-connection/","title":"FERC Data Center Orders Accelerate Grid Connection","publisher":"American Action Forum","published_at":"2026-06-18","artifact_id":"1583a02d-d937-4ca7-91fa-9f6d6dfb88ac","used_in":["summary","s1","s3","s4","s5","signals"]},
  {"ref":"S5","url":"https://www.utilitydive.com/news/pennsylvania-puc-to-consider-rates-and-curtailment-as-data-centers-grow/830174/","title":"Pennsylvania PUC to consider ratemaking, ROE and curtailment as data center load grows","publisher":"Utility Dive","published_at":"2026-09-11","artifact_id":"54205445-b2a4-4774-b023-00316abb0ea9","used_in":["summary","s2","s4","signals"]},
  {"ref":"S6","url":"https://www.utilitydive.com/news/house-passes-ratepayer-protection-bill-data-centers/830658/","title":"House passes ratepayer protection bill to limit data center cost shifts","publisher":"Utility Dive","published_at":"2026-09-17","artifact_id":"8f567e0f-c354-46df-a9a4-9763ec606cdd","used_in":["summary","s3","s4","s6","signals"]},
  {"ref":"S7","url":"https://www.cleanegroup.org/states-are-stepping-up-to-protect-households-from-rising-energy-bills-due-to-data-centers/","title":"States are stepping up to protect households from rising energy bills due to data centers","publisher":"Clean Energy Group","published_at":"2026-07-16","artifact_id":"9dcfbf68-74c0-46c1-a78f-91fae6bb3eee","used_in":["summary","s2","s3","s4","s7"]},
  {"ref":"S8","url":"https://www.nixonpeabody.com/insights/alerts/2026/05/07/data-center-site-selection-strategy-update","title":"Data center site selection strategy update","publisher":"Nixon Peabody","published_at":"2026-05-07","artifact_id":"e471f64d-384d-457b-a4d8-e35fdf1199bd","used_in":["summary","s2","s3","s4","s5","s7","signals"]},
  {"ref":"S9","url":"https://www.datacenterfrontier.com/site-selection/blog/55394817/the-data-center-industrys-permission-to-build","title":"The Data Center Industry's Permission to Build","publisher":"Data Center Frontier","published_at":"2026-07-31","artifact_id":"c5dc5867-e321-4702-b30e-03b8c872ad7c","used_in":["summary","s2","s7"]},
  {"ref":"S10","url":"https://convergedigest.com/black-hills-google-cheyenne-data-center-power/","title":"Black Hills to Invest $1.8B to Power Google Data Center in Wyoming","publisher":"Converge Digest","published_at":"2026-10-07","artifact_id":"e63e54d5-1b17-442a-bacb-f179249724a7","used_in":["summary","s6","signals"]},
  {"ref":"S11","url":"https://convergedigest.com/vertiv-acquire-uig-ai-data-center-microgrids/","title":"Vertiv to Acquire UtilityInnovation Group for $1.45B","publisher":"Converge Digest","published_at":"2026-09-03","artifact_id":"ee94462b-f6c8-44c5-8b0e-c8676a19762d","used_in":["summary","s6","signals"]}
]
```
