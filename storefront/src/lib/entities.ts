import entities from "@/generated/entities.json";

/**
 * Entity display: a logo ONLY when the BL-11 register marks the source `approved` and the
 * file is in assets/logos (resolved at build time by scripts/sync-entity-register.mjs).
 * Everything else renders as its text name. Today the register has 0 approved of 200.
 */
export type Entity = { name: string; logo: string | null };

const table = entities as Record<string, Entity>;

export function entityFor(id: string | null): Entity | null {
  if (!id) return null;
  return table[id] ?? null;
}

export function clearedLogoCount(): number {
  return Object.values(table).filter((e) => e.logo).length;
}
