import { getShelfPage, getTheaters } from "@/lib/catalog";
import { LibraryShell } from "@/components/LibraryShell";
import { Masthead } from "@/components/Masthead";
import { LibraryFooter } from "@/components/LibraryFooter";
import { shelfEdition } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * /library — The Shelf (FBL 1.0). Masthead, sidebar (Theater › Sector › Thread public
 * vocabulary), search + type chips, grouped briefing-card grid. Served on the flag-gated
 * preview route; subscriber-live exposure waits on FAR-132. Pricing is out of scope (1.1):
 * no token amounts, no wallet chip, no checkout in nav.
 */
export default async function LibraryPage() {
  const [page, theaters] = await Promise.all([getShelfPage({ sort: "newest" }), getTheaters()]);
  // Sidebar theaters (BL3-01): distinct themes of briefing_type='theater' rows in public.briefings.

  return (
    <>
      <Masthead context="The Briefing Library" edition={shelfEdition()} />
      <LibraryShell initial={page} theaters={theaters} />
      <LibraryFooter />
    </>
  );
}
