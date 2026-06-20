import type { Config } from "tailwindcss";

// Brand system per spec §6.2 / §B. Bound here so no hex literal is scattered in components.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#1C3424", // walls, shelf headers, spines, primary text on light
        gold: "#C4922A", // brass detailing: price, primary CTA, active states, rules
        "warm-white": "#F8F5F0", // page "light" / paper; default canvas (never #FFFFFF)
        sage: "#8CA68A", // quiet accents, Coming-Soon tags, secondary chips
        cream: "#FBF8F2", // "Faraday's Take" callouts, card hover surface
      },
      fontFamily: {
        // Display / spines / shelf headers
        serif: ['"IBM Plex Serif"', "Georgia", "serif"],
        // Body / UI
        sans: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        // Data / price / metadata
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
