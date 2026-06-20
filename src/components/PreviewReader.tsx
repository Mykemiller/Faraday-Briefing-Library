"use client";

import { useState } from "react";
import { ReadingChair } from "./ReadingChair";

/**
 * The 3-slide preview reader (§7.3, §7.4). Keyboard-operable carousel (arrows), alt text on each
 * slide ("<title>, preview slide N of M"), no auto-advance (§13). When slides are null, the caller
 * renders the preview-missing fallback instead of this component.
 */
export function PreviewReader({ title, slides }: { title: string; slides: string[] }) {
  const [i, setI] = useState(0);
  const n = slides.length;
  if (n === 0) return <ReadingChair label="Preview forthcoming" />;

  return (
    <div className="select-none">
      <div className="bg-cream rounded-sm overflow-hidden border border-forest/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slides[i]} alt={`${title}, preview slide ${i + 1} of ${n}`} className="w-full h-auto block" />
      </div>
      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          className="touch-target text-forest disabled:opacity-40"
          onClick={() => setI((p) => Math.max(0, p - 1))}
          disabled={i === 0}
          aria-label="Previous slide"
        >
          ←
        </button>
        <span className="font-mono text-xs text-forest/70" aria-live="polite">
          {i + 1} / {n}
        </span>
        <button
          type="button"
          className="touch-target text-forest disabled:opacity-40"
          onClick={() => setI((p) => Math.min(n - 1, p + 1))}
          disabled={i === n - 1}
          aria-label="Next slide"
        >
          →
        </button>
      </div>
    </div>
  );
}
