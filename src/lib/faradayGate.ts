// FDY-417 (ADM-1.7a) — the Faraday beta access gate, wired for the Briefing Library (app code BL,
// access_key "briefinglibrary"). Follow-up to FDY-414.
//
// The gate itself is the vendored package in ./faraday-gate/ (byte-identical to
// Mykemiller/faraday-workbench/packages/faraday-gate; never edit it here — see its README and
// MANIFEST.sha256). Since faraday-gate 1.1.0 its GatePage imports the sibling vendored
// ./faraday-masthead/ (already here since FDY-449). This file is the app-side wrapper: config from
// this app's existing env names, the enforce flag, the Clerk identity hand-off, and the one policy
// the package deliberately does not make for us.
//
// THE POLICY (copied from the FDY-414 JW/TF/Predicts wiring): if the estate_entitled probe cannot get
// an answer (RPC missing, timeout, no env), every probe answers { allowed:false, reason:"error" } and
// the package would show "unavailable". That must not close the Library. So an "error" answer PASSES
// THROUGH unless FARADAY_GATE_ENFORCE === "1", in which case it fails closed (the package's own
// behaviour). Only "error" is softened: a real denial (no_grant, expired, waitlist_mode, …) and
// "unknown_app" are always honoured.
//
// Pure apart from the injected guard: no next/* or @clerk/* imports, so Vitest loads it directly.

import { guardRoute, type GuardResult } from "./faraday-gate/server/guard.ts";
import type { GateServerConfig } from "./faraday-gate/server/check.ts";
import type { GateCopy } from "./faraday-gate/core.ts";
import briefingLibraryCopy from "./faraday-gate/gate-copy/briefinglibrary.json";

/** estate_entitled access_key for the Briefing Library (app code BL). */
export const LIBRARY_GATE_APP = "briefinglibrary";
export const LIBRARY_GATE_APP_NAME = "Briefing Library";
export const LIBRARY_GATE_COPY = briefingLibraryCopy as GateCopy;

type Env = Record<string, string | undefined>;

/**
 * Gate config from env names this app already uses (no new secret):
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only) for the check — the same pair
 * src/lib/supabase/admin.ts reads — and NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable) only for the
 * gate's own email one-time code.
 */
export function gateConfig(env: Env = process.env): GateServerConfig {
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  };
}

/** FARADAY_GATE_ENFORCE === "1" turns a probe error into a closed gate. Anything else: pass through. */
export function gateEnforced(env: Env = process.env): boolean {
  return env.FARADAY_GATE_ENFORCE === "1";
}

/** The slice of a Clerk User the gate reads. Structural, so this file needs no @clerk import. */
export interface ClerkUserLike {
  primaryEmailAddress?: {
    emailAddress?: string | null;
    verification?: { status?: string | null } | null;
  } | null;
}

/**
 * The app's own verified sign-in email: the Clerk user's PRIMARY address, and only when Clerk reports
 * it verified. Anything else (no user, no primary address, unverified) ⇒ null, and the gate falls
 * back to its own fgate_at one-time-code cookie.
 */
export function verifiedClerkEmail(user: ClerkUserLike | null | undefined): string | null {
  const primary = user?.primaryEmailAddress;
  const email = primary?.emailAddress?.trim();
  if (!email || primary?.verification?.status !== "verified") return null;
  return email;
}

export interface LibraryGuardResult extends GuardResult {
  /** True when the gate could not get an answer and let the visitor through (enforce off). */
  failOpen: boolean;
}

/** Apply the enforce policy to a package GuardResult. */
export function applyEnforcePolicy(g: GuardResult, enforce: boolean): LibraryGuardResult {
  if (!g.pass && g.entitlement.reason === "error" && !enforce) {
    return { ...g, pass: true, view: "pass", failOpen: true };
  }
  return { ...g, failOpen: false };
}

export interface GuardDeps {
  cfg?: GateServerConfig;
  enforce?: boolean;
  guard?: typeof guardRoute;
}

/**
 * Guard the /library route group. `cookieHeader` is the raw Cookie header (the gate reads its own
 * httpOnly fgate_at cookie from it). `appEmail` is the Clerk-verified email (verifiedClerkEmail) when
 * the visitor is signed in to the Library; the package uses it first and only then the gate cookie.
 * In mode "open" the package does no identity lookup at all. Never throws: an unexpected exception is
 * treated as a probe error and the same policy applies.
 */
export async function guardLibrary(
  opts: { cookieHeader?: string | null; appEmail?: string | null },
  deps: GuardDeps = {},
): Promise<LibraryGuardResult> {
  const cfg = deps.cfg ?? gateConfig();
  const enforce = deps.enforce ?? gateEnforced();
  const guard = deps.guard ?? guardRoute;
  let g: GuardResult;
  try {
    g = await guard({ app: LIBRARY_GATE_APP, appEmail: opts.appEmail ?? null, cookieHeader: opts.cookieHeader ?? null }, cfg);
  } catch {
    g = {
      pass: false,
      view: "unavailable",
      email: null,
      identitySource: "none",
      entitlement: { allowed: false, reason: "error", mode: null, role: null, grant_kind: null, expires_at: null },
    };
  }
  return applyEnforcePolicy(g, enforce);
}
