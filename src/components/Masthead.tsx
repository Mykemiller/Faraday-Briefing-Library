import { FMark } from "./FMark";

/**
 * The Library masthead (all views): 3px gold top border, forest bar 64px, F mark + wordmark,
 * italic-serif context line, mono edition slot, 2px gold rule below (README §Masthead).
 * The wordmark links home — the Faraday home lives in the engine (faraday-intelligence.ai).
 *
 * BL3-04 (FDY-337): a full-width bar whose inner row uses the content column's gutters (px-6,
 * md:px-11). The wordmark and edition never shrink or wrap; the context line is the one that
 * gives way (truncates) on a narrow bar, so nothing can push past the right edge. No ancestor
 * clips with overflow-hidden.
 */
export function Masthead({ context, edition }: { context: string; edition: string }) {
  return (
    <header className="border-t-[3px] border-gold" data-masthead="">
      <div className="bg-forest w-full">
        <div className="flex items-center justify-between gap-6 h-16 px-6 md:px-11 min-w-0">
          <a href="https://faraday-intelligence.ai" className="flex items-center gap-0.5 shrink-0" aria-label="Faraday home">
            <FMark />
            <span className="font-serif font-bold text-2xl text-warm-white tracking-[2.5px]">ARADAY</span>
          </a>
          <div className="font-serif italic text-[17px] text-sage min-w-0 truncate max-sm:hidden">{context}</div>
          <div className="font-mono text-[11.5px] text-sage tracking-[1px] uppercase whitespace-nowrap shrink-0 max-md:hidden">
            {edition}
          </div>
        </div>
      </div>
      <div className="h-0.5 bg-gold" />
    </header>
  );
}
