import type { Entity } from "@/lib/entities";

/**
 * A tracked company or institution. Shows the logo only when the BL-11 register cleared it;
 * otherwise the text name, set as a quiet small-caps label (never a fake logo tile).
 */
export function EntityMark({ entity, size = "sm" }: { entity: Entity | null; size?: "sm" | "lg" }) {
  if (!entity) return null;
  if (entity.logo) {
    const h = size === "lg" ? 36 : 22;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={entity.logo} alt={entity.name} height={h} style={{ height: h, width: "auto" }} className="block" />;
  }
  return (
    <span
      className={`inline-block border-l-2 border-gold pl-2 font-mono uppercase tracking-eyebrow text-ink-soft ${
        size === "lg" ? "text-xs" : "text-[0.68rem]"
      }`}
    >
      {entity.name}
    </span>
  );
}
