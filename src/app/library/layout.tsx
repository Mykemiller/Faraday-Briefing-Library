import { headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { LibraryMasthead } from "@/components/LibraryMasthead";
import { viewerIdentity } from "@/lib/viewer";
import { shelfEdition } from "@/lib/brand";
import GatePage from "@/lib/faraday-gate/ui/GatePage.tsx";
import { LIBRARY_GATE_APP, LIBRARY_GATE_APP_NAME, LIBRARY_GATE_COPY, guardLibrary } from "@/lib/faradayGate";

/**
 * Every /library page (shelf, Reading Room, reading table, My Briefings, Blueprint) renders the
 * shared Faraday masthead + the Library AppBar once, here (FDY-449). Each page keeps its own
 * <main id="main">, which the masthead's skip link targets. Not a routing change: layouts add no
 * routes, and the next.config rewrites still land on the same pages.
 *
 * FDY-417 (ADM-1.7a): the Faraday beta access gate runs first, for every /library page and for the
 * rewritten short paths (/, /b/:slug, /cart, /owned, /blueprint), which render these same pages. In
 * mode "open" (the seeded default) it passes straight through and the masthead + page below render
 * exactly as before. If the probe errors it also passes through unless FARADAY_GATE_ENFORCE=1
 * (src/lib/faradayGate.ts). noStore() is Next 14's equivalent of Next 15's connection(): it keeps the
 * gate a per-request decision, so a build with no Supabase env can never freeze a pass-through.
 * Identity: the Clerk-verified primary email first, else the gate's own fgate_at one-time-code cookie.
 */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  noStore();
  const { email, verifiedEmail } = await viewerIdentity();
  const gate = await guardLibrary({ cookieHeader: headers().get("cookie"), appEmail: verifiedEmail });
  if (!gate.pass) {
    return (
      <GatePage
        app={LIBRARY_GATE_APP}
        appName={LIBRARY_GATE_APP_NAME}
        copy={LIBRARY_GATE_COPY}
        view={gate.view}
        email={gate.email}
      />
    );
  }
  return (
    <>
      <LibraryMasthead email={email} edition={shelfEdition()} />
      {children}
    </>
  );
}
