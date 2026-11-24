// FDY-417 (ADM-1.7a) — the Faraday gate's server actions for the Briefing Library.
//   POST /api/faraday-gate/code     { email }                  email a one-time code
//   POST /api/faraday-gate/verify   { email, code }            verify it; sets the httpOnly fgate_at cookie
//   POST /api/faraday-gate/request  { email, kind, message? }  Request demo access / Join the waitlist
//   POST /api/faraday-gate/signout                             clears the cookie
// All logic is the vendored package (src/lib/faraday-gate/server/handlers.ts): same-origin only,
// POST only, 5 requests per IP per hour. This app gates only the Briefing Library, so the app is fixed
// to "briefinglibrary" here. Next 14: route params are a plain object (not a Promise as in Next 15).
// Clerk middleware runs on /api/* but protects nothing, so these stay reachable signed out.
import { handleGateAction } from "@/lib/faraday-gate/server/handlers.ts";
import { LIBRARY_GATE_APP, gateConfig } from "@/lib/faradayGate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { action: string } }): Promise<Response> {
  return handleGateAction(req, params.action, LIBRARY_GATE_APP, gateConfig());
}

export async function GET(req: Request, { params }: { params: { action: string } }): Promise<Response> {
  return handleGateAction(req, params.action, LIBRARY_GATE_APP, gateConfig()); // answers 405
}
