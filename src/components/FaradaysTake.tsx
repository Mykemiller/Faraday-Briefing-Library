/**
 * "Faraday's Take" teaser box (FBL 1.0 Reading Room): warm cream, DOUBLE LEFT RULE
 * (4px forest + 2.5px gold), italic-serif voice. This is the fixed TEASER — never the
 * real Take content (that travels only with the full Briefing).
 */
export function FaradaysTake({ children }: { children: React.ReactNode }) {
  return (
    <aside className="relative bg-cream-dark max-w-[760px] py-[26px] px-[30px] mt-14">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-forest" />
      <div className="absolute left-1 top-0 bottom-0 w-[2.5px] bg-gold" />
      <div className="font-mono text-[11px] tracking-[1.6px] uppercase text-forest">Faraday&rsquo;s Take</div>
      <p className="font-serif italic text-[17px] leading-[1.6] text-ink mt-3 m-0">{children}</p>
    </aside>
  );
}
