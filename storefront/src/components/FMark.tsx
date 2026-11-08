/** The Faraday F mark: cream F on forest with gold terminals (same geometry as the root app). */
export function FMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" aria-hidden="true" className="block shrink-0">
      <rect x="1" y="1" width="108" height="108" rx="13" className="fill-forest-deep stroke-forest-light" strokeWidth="2" />
      <rect x="34" y="20" width="13" height="70" className="fill-paper" />
      <rect x="34" y="20" width="46" height="12" className="fill-paper" />
      <rect x="34" y="50" width="36" height="11" className="fill-paper" />
      <rect x="76" y="20" width="6" height="12" className="fill-gold" />
      <rect x="66" y="50" width="6" height="11" className="fill-gold" />
      <rect x="34" y="84" width="13" height="6" className="fill-gold" />
    </svg>
  );
}
