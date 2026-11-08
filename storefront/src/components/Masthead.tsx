import Link from "next/link";
import { FMark } from "./FMark";

function edition(now = new Date()) {
  return now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" });
}

export function Masthead() {
  return (
    <header className="bg-forest text-paper">
      <div className="mx-auto flex max-w-page items-center justify-between gap-6 px-4 py-4 sm:px-8">
        <Link href="/" className="group flex items-center gap-3 rounded-sm" aria-label="The Briefing Library, home">
          <FMark size={34} />
          <span className="flex flex-col leading-none">
            <span className="font-serif text-lg font-semibold tracking-tight">Faraday</span>
            <span className="mt-1 font-mono text-[0.68rem] uppercase tracking-eyebrow text-sage">The Briefing Library</span>
          </span>
        </Link>
        <p className="hidden font-mono text-[0.7rem] uppercase tracking-eyebrow text-sage sm:block">
          {edition()} · Shelf edition
        </p>
      </div>
      <div className="h-[3px] bg-gold" aria-hidden="true" />
    </header>
  );
}
