/**
 * The reading-chair mascot — the room's graphic for empty, loading, and preview-missing
 * states (§6.4). A premium editorial state, never a generic spinner. Forest/gold/sage only.
 */
export function ReadingChair({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={className} role="img" aria-label={label ?? "A leather reading chair and side table"}>
      <svg viewBox="0 0 240 200" width="200" height="167" aria-hidden="true">
        <rect x="0" y="0" width="240" height="200" fill="#FBF8F2" />
        {/* side table */}
        <rect x="172" y="120" width="44" height="6" rx="2" fill="#C4922A" />
        <rect x="178" y="126" width="4" height="44" fill="#1C3424" />
        <rect x="206" y="126" width="4" height="44" fill="#1C3424" />
        {/* book on the table */}
        <rect x="180" y="112" width="28" height="8" rx="1" fill="#1C3424" />
        {/* chair */}
        <path d="M40 80c0-14 10-22 26-22h36c16 0 26 8 26 22v50H40V80z" fill="#1C3424" />
        <path d="M40 96c-10 0-16 6-16 16v18h20V96H40z" fill="#1C3424" />
        <path d="M128 96c10 0 16 6 16 16v18h-20V96h4z" fill="#1C3424" />
        <rect x="48" y="120" width="72" height="18" rx="6" fill="#8CA68A" />
        <rect x="52" y="130" width="12" height="40" fill="#1C3424" />
        <rect x="104" y="130" width="12" height="40" fill="#1C3424" />
        {/* lamp glow */}
        <circle cx="194" cy="60" r="26" fill="#C4922A" opacity="0.14" />
      </svg>
      {label ? <p className="mt-3 font-serif text-forest/80">{label}</p> : null}
    </div>
  );
}
