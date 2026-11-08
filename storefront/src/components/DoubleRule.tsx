/** Forest-over-gold double rule: the Faraday editorial section break (Brand Bible §06). */
export function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-[2px] ${className}`} role="presentation">
      <span className="block h-[2px] bg-forest" />
      <span className="block h-px bg-gold" />
    </div>
  );
}
