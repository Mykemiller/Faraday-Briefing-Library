import { Masthead } from "@/lib/faraday-masthead/ui/Masthead.tsx";
import { LibraryAppBar } from "./LibraryAppBar";

/** The Library's app name in the masthead's context slot (FDY-449). */
export const LIBRARY_APP_NAME = "Briefing Library";
/** The Library's own home. /library answers on every host; on library.faraday-intelligence.ai "/" rewrites to it. */
export const LIBRARY_HOME = "/library";
/**
 * No sign-in route exists in this app yet (Clerk runs as middleware only, no hosted sign-in page),
 * so "Sign in" points at My Briefings, the Library's account surface (FDY-449 decision; same pattern
 * as Jurisdiction Watch's /account).
 */
export const LIBRARY_SIGN_IN = "/library/owned";

/**
 * FDY-449 (CC-BRAND-MASTHEAD-1.0): the shared Faraday masthead (vendored at
 * src/lib/faraday-masthead, never edited here) plus the Library's AppBar. Rendered once by
 * src/app/library/layout.tsx for every /library page. Shelf navigation (Theaters, type chips,
 * search) stays in the page; only top-level links live in the AppBar.
 *
 * Fonts: the masthead names IBM Plex Serif / Bricolage Grotesque / IBM Plex Mono, which this app
 * self-hosts (globals.css aliases those family names to the files in src/app/fonts), so no
 * Google Fonts link is loaded (loadFonts stays off).
 */
export function LibraryMasthead({ email, edition }: { email: string | null; edition: string }) {
  return (
    <>
      <Masthead appName={LIBRARY_APP_NAME} homeHref={LIBRARY_HOME} email={email} signInHref={LIBRARY_SIGN_IN} />
      <LibraryAppBar edition={edition} />
    </>
  );
}
