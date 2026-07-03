"use client";

import { useStore } from "zustand";
import { reservedStore, useReserved } from "@/store/reserved-client";

/**
 * "Select this Briefing" — the FBL 1.1 point of purchase; in 1.0 it RESERVES.
 * A reservation is a cart line (library_cart_items): signed-in adds are optimistic with
 * the rollback buffer; anonymous adds ride the localStorage courier and merge on sign-in.
 * No token amounts, no price UI.
 */
export function ReserveButton({ briefing }: { briefing: { id: string; slug: string; title: string } }) {
  const { reservedIds, toggle } = useReserved();
  const toast = useStore(reservedStore, (s) => s.toast);
  const reserved = reservedIds.has(briefing.id);

  return (
    <div className="flex gap-4 items-center mt-[38px] flex-wrap">
      <button
        type="button"
        onClick={() => toggle(briefing)}
        aria-pressed={reserved}
        className={`border-[1.5px] border-gold px-[30px] py-3.5 text-[15px] font-semibold tracking-[0.3px] hover:bg-gold-light hover:text-ink ${
          reserved ? "bg-gold text-ink" : "bg-transparent text-gold-light"
        }`}
      >
        {reserved ? "Reserved ✓" : "Select this Briefing"}
      </button>
      {reserved ? (
        <div className="font-mono text-xs text-sage">
          Reserved on your shelf — acquisition arrives in FBL 1.1.
        </div>
      ) : null}
      {toast ? (
        <div role="status" className="font-mono text-xs text-gold-light">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
