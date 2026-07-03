import { NextResponse } from "next/server";
import { getShelfPage } from "@/lib/catalog";
import type { ShelfQuery, SortKey } from "@/lib/types";
import { BRIEFING_TYPES, type BriefingType, type ShelfStatus } from "@/config/constants";

export const runtime = "nodejs";

/** Keyset-paginated, faceted shelf reads for the client shell (§5.2, §11.2). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query: ShelfQuery = {
    q: url.searchParams.get("q") || undefined,
    theme: url.searchParams.get("theme") || undefined,
    domain: url.searchParams.get("domain") || undefined,
    subdomain: url.searchParams.get("subdomain") || undefined,
    company: url.searchParams.get("company") || undefined,
    status: (url.searchParams.get("status") as ShelfStatus | "Owned") || undefined,
    type: BRIEFING_TYPES.includes(url.searchParams.get("type") as BriefingType)
      ? (url.searchParams.get("type") as BriefingType)
      : undefined,
    sort: (url.searchParams.get("sort") as SortKey) || "newest",
    cursor: url.searchParams.get("cursor") || null,
  };
  try {
    const page = await getShelfPage(query);
    return NextResponse.json(page);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
