/** Stable, human slug for /library/b/[slug]. Deterministic from title + record id. */
export function briefingSlug(title: string, recordId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  // Suffix a short, collision-free token from the Airtable id (stable across syncs).
  const suffix = recordId.replace(/^rec/, "").slice(0, 6).toLowerCase();
  return `${base || "briefing"}-${suffix}`;
}
