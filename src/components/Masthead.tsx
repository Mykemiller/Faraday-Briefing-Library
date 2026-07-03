import { FMark } from "./FMark";

/**
 * The Library masthead (all views): 3px gold top border, forest bar 64px, F mark + wordmark,
 * italic-serif context line, mono edition slot, 2px gold rule below (README §Masthead).
 * The wordmark links home — the Faraday home lives in the engine (faraday-intelligence.ai).
 */
export function Masthead({ context, edition }: { context: string; edition: string }) {
  return (
    <div className="border-t-[3px] border-gold">
      <div className="bg-forest flex items-center justify-between px-8 h-16">
        <a href="https://faraday-intelligence.ai" className="flex items-center gap-0.5" aria-label="Faraday home">
          <FMark />
          <span className="font-serif font-bold text-2xl text-warm-white tracking-[2.5px]">ARADAY</span>
        </a>
        <div className="font-serif italic text-[17px] text-sage max-sm:hidden">{context}</div>
        <div className="font-mono text-[11.5px] text-sage tracking-[1px] uppercase max-md:hidden">{edition}</div>
      </div>
      <div className="h-0.5 bg-gold" />
    </div>
  );
}
