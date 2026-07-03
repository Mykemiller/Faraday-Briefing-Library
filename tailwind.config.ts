import type { Config } from "tailwindcss";

// Brand system per the Faraday Brand Bible 4.0 / FBL 1.0 design handoff.
// Every brand hex is bound here as a token — no scattered hex literals in components.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#1C3424", // Faraday Forest — masthead, chips active, primary dark
        "forest-mid": "#244228", // footer bar, ordinary home tiles
        "forest-light": "#325638", // borders on forest, preview double-rule top
        "forest-deep": "#16281C", // Reading Room walls, theater covers
        gold: "#C4922A", // Faraday Gold — rules, eyebrows, Select border
        "gold-light": "#DAB050", // lamplight, Select text, COMING SOON badge
        amber: "#B8710A", // Deep Amber — signal kickers, tile eyebrow
        "warm-white": "#F8F5F0", // paper / shelf canvas (never #FFFFFF)
        cream: "#FBF8F2", // legacy callout surface (owned/cart pages)
        "cream-dark": "#EEE6DA", // Faraday's Take box, highlighted-tile hover
        sidebar: "#F1EDE5", // shelf sidebar tint
        hairline: "#DDD5C7", // sidebar border, group rules
        ink: "#141210", // near black — primary text on light
        "ink-soft": "#5c564d", // body secondary
        "warm-gray": "#8C8279", // metadata, section headers
        "warm-gray-2": "#B2A898", // inactive chip borders, search border
        sage: "#8CA68A", // Faraday Sage — masthead context, dark-surface meta
        "dark-cream": "#E8E2D6", // dark-surface abstract text
        "dark-list": "#D9D3C7", // dark-surface list text
      },
      fontFamily: {
        // Display / headlines / italic voice
        serif: ["var(--font-serif)", "Georgia", "serif"],
        // Body / UI
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // Eyebrows, metadata, citations
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        // Typographic-cover gradients by briefing type (README §Briefing card)
        "cover-theater": "linear-gradient(165deg,#16281C,#1C3424)",
        "cover-sector": "linear-gradient(165deg,#1C3424 60%,#16281C)",
        "cover-thread": "linear-gradient(165deg,#1C3424,#244228)",
        "cover-keyplayer": "linear-gradient(165deg,#244228,#1C3424)",
        "cover-soon": "linear-gradient(160deg,#5a544a,#46413a)",
        // Reading Room lamplight (two radial gradients, pointer-events-none overlay)
        lamplight:
          "radial-gradient(ellipse 900px 640px at 68% 12%, rgba(218,176,80,0.16), transparent 65%), radial-gradient(ellipse 700px 500px at 12% 88%, rgba(196,146,42,0.08), transparent 60%)",
      },
      boxShadow: {
        cover: "0 2px 10px rgba(20,18,16,0.18)",
        "cover-hover": "0 6px 22px rgba(20,18,16,0.3)",
        "cover-room": "0 18px 60px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)",
        slide: "0 10px 34px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
