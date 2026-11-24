import { NextResponse } from "next/server";
import { getLibraryFlags } from "@/config/live-flags";

export const dynamic = "force-dynamic";

/**
 * FDY-297: the live Library flags for client components (the cart's Check out button). Non-secret booleans
 * only. The checkout route enforces commerceOn on its own; this only keeps the button honest.
 */
export async function GET() {
  const f = await getLibraryFlags();
  return NextResponse.json({ commerceOn: f.commerceOn }, { headers: { "Cache-Control": "no-store" } });
}
