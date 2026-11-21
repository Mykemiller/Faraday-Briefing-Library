import { LibraryMasthead } from "@/components/LibraryMasthead";
import { viewerEmail } from "@/lib/viewer";
import { shelfEdition } from "@/lib/brand";

/**
 * Every /library page (shelf, Reading Room, reading table, My Briefings, Blueprint) renders the
 * shared Faraday masthead + the Library AppBar once, here (FDY-449). Each page keeps its own
 * <main id="main">, which the masthead's skip link targets. Not a routing change: layouts add no
 * routes, and the next.config rewrites still land on the same pages.
 */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const email = await viewerEmail();
  return (
    <>
      <LibraryMasthead email={email} edition={shelfEdition()} />
      {children}
    </>
  );
}
