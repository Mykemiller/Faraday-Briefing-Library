/**
 * "Faraday's Take" callout (§6.6) — warm cream background, forest-over-gold double left rule,
 * short italic-serif opinion. Note: this is the editorial CALLOUT component; it is NOT the
 * forbidden preview slide (the preview pipeline excludes the Take slide — §7.4).
 */
export function FaradaysTake({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="bg-cream pl-4 pr-5 py-4 my-6"
      style={{ borderLeft: "4px solid", borderImage: "linear-gradient(#1C3424 0 50%, #C4922A 50% 100%) 1" }}
    >
      <p className="font-mono text-xs tracking-widest text-gold uppercase mb-1">Faraday’s Take</p>
      <p className="font-serif italic text-forest leading-relaxed">{children}</p>
    </aside>
  );
}
