import type { Config } from "tailwindcss";

// Brand tokens copied from the root app (Faraday Brand Bible 4.0 / Briefing Library Brand Bible V2).
// Every hex lives here; components use token classes only.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#1C3424",
        "forest-mid": "#244228",
        "forest-light": "#325638",
        "forest-deep": "#16281C",
        gold: "#C4922A",
        "gold-light": "#DAB050",
        "gold-ink": "#8A6416", // gold darkened for text on paper (AA at small sizes)
        amber: "#B8710A",
        paper: "#F8F5F0", // warm white, never #FFFFFF
        cream: "#FBF8F2",
        "cream-dark": "#EEE6DA",
        hairline: "#DDD5C7",
        ink: "#141210",
        "ink-soft": "#5C564D",
        "warm-gray": "#736A61", // darkened from #8C8279 to pass AA on paper
        "warm-gray-2": "#B2A898",
        sage: "#8CA68A",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: { measure: "68ch", page: "76rem" },
      letterSpacing: { eyebrow: "0.14em" },
    },
  },
  plugins: [],
};

export default config;
