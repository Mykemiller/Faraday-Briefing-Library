import { NextResponse } from "next/server";
import { getShelfPage } from "@/lib/catalog";
import type { ShelfQuery, SortKey } from "@/lib/types";
import type { ShelfStatus } from "@/config/constants";

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
