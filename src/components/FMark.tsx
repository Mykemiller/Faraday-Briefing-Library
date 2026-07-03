/** The geometric cream F mark on forest with gold terminals (design handoff §Assets). */
export function FMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" className="block" aria-hidden="true">
      <rect x="0" y="0" width="110" height="110" rx="14" className="fill-forest" />
      <rect x="34" y="20" width="13" height="70" className="fill-warm-white" />
      <rect x="34" y="20" width="46" height="12" className="fill-warm-white" />
      <rect x="34" y="50" width="36" height="11" className="fill-warm-white" />
      <rect x="76" y="20" width="6" height="12" className="fill-gold" />
      <rect x="66" y="50" width="6" height="11" className="fill-gold" />
      <rect x="34" y="84" width="13" height="6" className="fill-gold" />
    </svg>
  );
}
