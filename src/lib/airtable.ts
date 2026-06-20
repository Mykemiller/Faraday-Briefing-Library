import { AIRTABLE } from "@/config/constants";

/** Raw Airtable record shape (subset we read). */
export interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

const API = "https://api.airtable.com/v0";

/** Link/select cells arrive as arrays of {id,name} or a single {id,name}. Flatten to names. */
export function names(cell: unknown): string[] {
  if (cell == null) return [];
  if (Array.isArray(cell)) {
    return cell
      .map((c) => (typeof c === "object" && c && "name" in c ? String((c as any).name) : String(c)))
      .filter(Boolean);
  }
  if (typeof cell === "object" && "name" in (cell as any)) return [String((cell as any).name)];
  return [String(cell)];
}

export function singleName(cell: unknown): string | null {
  const n = names(cell);
  return n[0] ?? null;
}

/**
 * Fetch all shelf-eligible records from the Briefing Library table, paginating Airtable.
 * Filter rule (§11.3): Status ∈ {Available, Coming Soon} AND (Available ⇒ Go live Date ≤ today).
 * Nothing in Draft leaks. Field names are referenced by NAME in the formula for portability.
 */
export async function fetchShelfRecords(): Promise<AirtableRecord[]> {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY not configured");
  const base = process.env.AIRTABLE_BASE_ID || AIRTABLE.baseId;
  const table = process.env.AIRTABLE_BRIEFINGS_TABLE_ID || AIRTABLE.briefingsTableId;

  const formula = `AND(
    OR({Status}='Available', {Status}='Coming Soon'),
    OR({Status}!='Available', IS_BEFORE({Go live Date}, DATEADD(TODAY(),1,'days')))
  )`.replace(/\s+/g, " ");

  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${API}/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}
