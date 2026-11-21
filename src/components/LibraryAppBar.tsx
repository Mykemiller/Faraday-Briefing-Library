"use client";

import { usePathname } from "next/navigation";
import { AppBar } from "@/lib/faraday-masthead/ui/Masthead.tsx";

/**
 * The Library's top-level navigation under the Faraday masthead (FDY-449). Two links only:
 * the shelf (the Library's home) and Faraday Intelligence, the link target the old Library
 * masthead's wordmark carried (kept so no destination is lost now that the shared wordmark links
 * to the Library's own home). Cart, owned and blueprint stay out of the nav: pricing and checkout
 * are out of scope until commerce-on (FAR-16), and "Intelligence Blueprint" naming is unsigned.
 * The edition line ("November 2026 · Shelf Edition") moves here from the old masthead's right slot.
 */
export const LIBRARY_APPBAR_LINKS = [
  { label: "The Shelf", href: "/library" },
  { label: "Faraday Intelligence", href: "https://faraday-intelligence.ai" },
] as const;

/** "/" (the subdomain's rewritten root) and "/library" are both the shelf. */
export function isShelfPath(pathname: string | null): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "");
  return p === "" || p === "/library";
}

export function LibraryAppBar({ edition }: { edition: string }) {
  const shelf = isShelfPath(usePathname());
  return (
    <AppBar
      label="Briefing Library"
      links={LIBRARY_APPBAR_LINKS.map((l) => ({ ...l, current: l.href === "/library" && shelf }))}
    >
      <span
        className="ml-auto pl-4 font-mono text-[11.5px] text-ink-soft tracking-[1px] uppercase whitespace-nowrap shrink-0 max-md:hidden"
        data-edition=""
      >
        {edition}
      </span>
    </AppBar>
  );
}
