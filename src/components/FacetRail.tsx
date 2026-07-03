"use client";

/**
 * The Shelf's left sidebar (Academy-style), 248px fixed: "The Full Shelf", THEATERS
 * (one item per live theme, names only — the COUNT-FREE brand rule supersedes the old
 * facet count badges), KEY PLAYERS, YOUR SHELF ("Reserved Briefings" filters to selected).
 * Active item: forest text, weight 600, 3px gold left rule.
 */
export type NavKey = "all" | "kp" | "reserved" | `t:${string}`;

function Item({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block w-full text-left text-sm leading-[1.4] py-[5px] pl-[10px] border-l-[3px] hover:text-forest ${
        active ? "text-forest font-semibold border-gold" : "text-ink-soft border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="font-mono text-[10.5px] tracking-[1.8px] uppercase text-warm-gray pt-3.5 pb-1">{label}</div>
  );
}

export function FacetRail({
  theaters,
  navKey,
  onNav,
}: {
  theaters: string[];
  navKey: NavKey;
  onNav: (key: NavKey) => void;
}) {
  return (
    <nav aria-label="Shelves" className="px-5">
      <Item active={navKey === "all"} label="The Full Shelf" onClick={() => onNav("all")} />
      <Header label="Theaters" />
      {theaters.map((t) => (
        <Item key={t} active={navKey === `t:${t}`} label={t} onClick={() => onNav(`t:${t}`)} />
      ))}
      <Header label="Key Players" />
      <Item active={navKey === "kp"} label="Key Player Briefings" onClick={() => onNav("kp")} />
      <Header label="Your Shelf" />
      <Item active={navKey === "reserved"} label="Reserved Briefings" onClick={() => onNav("reserved")} />
    </nav>
  );
}
