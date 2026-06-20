"use client";

import type { Facets } from "@/lib/types";

/**
 * Faceted left rail (§5.2, §7.1) with LIVE counts — e.g. "Power Architecture (14)". Counts come
 * from the read-model, so every number is bound to live data (Precision value). Top-sheet on mobile.
 */
export function FacetRail({
  facets,
  active,
  onSelect,
}: {
  facets: Facets;
  active: Record<string, string | undefined>;
  onSelect: (axis: string, value: string | undefined) => void;
}) {
  const axes: { key: keyof Facets; label: string }[] = [
    { key: "theme", label: "Theme" },
    { key: "domain", label: "Domain" },
    { key: "subdomain", label: "Sub-Domain" },
    { key: "company", label: "Company" },
  ];
  return (
    <nav aria-label="Filter the shelf" className="space-y-5">
      {axes.map(({ key, label }) => (
        <div key={key}>
          <h4 className="font-serif font-bold text-forest mb-1">{label}</h4>
          <ul className="space-y-0.5">
            {facets[key].slice(0, 12).map((f) => {
              const selected = active[key] === f.value;
              return (
                <li key={f.value}>
                  <button
                    type="button"
                    onClick={() => onSelect(key, selected ? undefined : f.value)}
                    aria-pressed={selected}
                    className={`touch-target text-left w-full text-sm flex justify-between gap-2 px-1 rounded-sm ${
                      selected ? "bg-gold/20 text-forest font-semibold" : "text-forest/80"
                    }`}
                  >
                    <span>{f.value}</span>
                    <span className="font-mono text-forest/60">({f.count})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
