/** Empty-state illustration: a library shelf with a lamp, forest/gold/sage on paper. */
export function ShelfIllustration() {
  return (
    <svg viewBox="0 0 320 180" className="h-auto w-full max-w-[280px]" aria-hidden="true">
      <circle cx="252" cy="44" r="40" className="fill-gold" opacity="0.12" />
      <path d="M244 18h16l8 22h-32z" className="fill-forest" />
      <rect x="250" y="40" width="4" height="70" className="fill-forest" />
      {/* books, leaning toward the gap */}
      <rect x="40" y="62" width="18" height="48" className="fill-forest" />
      <rect x="60" y="54" width="14" height="56" className="fill-forest-light" />
      <rect x="76" y="68" width="20" height="42" className="fill-forest-deep" />
      <rect x="77" y="80" width="18" height="2" className="fill-gold" />
      <rect x="98" y="58" width="12" height="52" className="fill-sage" />
      <g transform="rotate(-14 150 110)">
        <rect x="140" y="62" width="16" height="48" className="fill-forest-mid" />
        <rect x="141" y="72" width="14" height="2" className="fill-gold" />
      </g>
      {/* empty run of shelf, dashed: room for what is coming */}
      <rect x="172" y="70" width="14" height="40" fill="none" strokeDasharray="3 3" className="stroke-warm-gray-2" />
      <rect x="190" y="62" width="18" height="48" fill="none" strokeDasharray="3 3" className="stroke-warm-gray-2" />
      <rect x="212" y="74" width="12" height="36" fill="none" strokeDasharray="3 3" className="stroke-warm-gray-2" />
      <rect x="24" y="110" width="272" height="6" className="fill-forest" />
      <rect x="24" y="117" width="272" height="2" className="fill-gold" />
    </svg>
  );
}
