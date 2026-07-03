# Patch note for `Mykemiller/v0-faraday-daily-challenge` — Briefing Library tile (FBL 1.0)

**Do not apply from this repo — this is the hand-off note for the engine.** The live home
(faraday-intelligence.ai) is served by the engine; only the tile behavior changes there.

## Change

Point the Faraday home page's **Briefing Library** tile at the FBL 1.0 storefront:

```
href: https://faraday-briefing-library.vercel.app/library
```

(Once PR #2 in `Mykemiller/Faraday-Briefing-Library` is merged, that production URL serves
FBL 1.0. Until then the fbl-1.0 branch preview is
`https://faraday-briefing-library-git-fbl-10-project-foundry.vercel.app/library`. If/when the
Library gets a first-party domain — e.g. a path or subdomain of faraday-intelligence.ai —
swap the href; nothing else changes.)

## Tile styling (per FBL 1.0 README §"Faraday Home entry")

The Briefing Library tile is the **highlighted** tile in the home grid
(`repeat(auto-fit, minmax(230px, 1fr))`, gap 16px; ordinary tiles: `#244228` bg,
1px `#325638` border, 24px padding):

- Background warm-white `#F8F5F0`, border **2px `#C4922A`**, padding 24px; hover bg `#EEE6DA`.
- Eyebrow: `SHELF STOREFRONT` — IBM Plex Mono 10.5px, letter-spacing 1.5px, uppercase, `#B8710A`.
- Title: `Briefing Library` — IBM Plex Serif 700, 21px, `#141210`, margin-top 6px.
- Body: `Every Theater, Sector, and Thread — a Briefing, ready.` — 13.5px/1.55, `#5c564d`,
  margin-top 10px.
- Footer link: `Enter the Library →` — IBM Plex Mono 12px, weight 500, `#1C3424`, margin-top 16px.
- Whole tile is the click target → the href above (real navigation, scroll to top).

No counts, no token amounts, no D-codes on the tile.
