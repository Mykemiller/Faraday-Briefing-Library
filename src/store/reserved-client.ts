"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { createCartStore, type CartServer } from "./cart";
import type { CartLine } from "@/lib/types";

/**
 * FBL 1.0 "Select = reserve" — a reservation IS a cart line (src/store/cart.ts →
 * /api/library/cart → library_cart_items), so FBL 1.1 can turn the reserved shelf into
 * checkout without a migration.
 *
 * Signed-in: optimistic add/remove with the store's rollback buffer against the API.
 * Anonymous: the localStorage COURIER holds the lines; on sign-in they merge via
 * /api/library/cart/merge (already built) and the courier is cleared.
 */

const COURIER_KEY = "fbl_guest_cart";

let mode: "unknown" | "guest" | "member" = "unknown";

function readCourier(): CartLine[] {
  try {
    const raw = localStorage.getItem(COURIER_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.briefingId) : [];
  } catch {
    return [];
  }
}

function writeCourier(lines: CartLine[]) {
  try {
    localStorage.setItem(COURIER_KEY, JSON.stringify(lines));
  } catch {
    /* private mode — reservation lives for the session only */
  }
}

const server: CartServer = {
  async add(line) {
    if (mode === "member") {
      const res = await fetch("/api/library/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefingId: line.briefingId, briefingSlug: line.briefingSlug }),
      });
      if (!res.ok) throw new Error(`reserve failed: ${res.status}`);
    } else {
      const lines = readCourier();
      if (!lines.some((l) => l.briefingId === line.briefingId)) writeCourier([...lines, line]);
    }
  },
  async remove(briefingId) {
    if (mode === "member") {
      const res = await fetch("/api/library/cart", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefingId }),
      });
      if (!res.ok) throw new Error(`unreserve failed: ${res.status}`);
    } else {
      writeCourier(readCourier().filter((l) => l.briefingId !== briefingId));
    }
  },
};

export const reservedStore = createCartStore({ server });

let initPromise: Promise<void> | null = null;

/** Resolve guest/member once per page load, hydrate the store, merge the courier on sign-in. */
export function initReserved(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const res = await fetch("/api/library/cart");
      if (res.ok) {
        mode = "member";
        let lines = ((await res.json()).lines ?? []) as CartLine[];
        const courier = readCourier();
        const unmerged = courier.filter((c) => !lines.some((l) => l.briefingId === c.briefingId));
        if (unmerged.length) {
          const merge = await fetch("/api/library/cart/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lines: unmerged.map(({ briefingId, briefingSlug }) => ({ briefingId, briefingSlug })),
            }),
          });
          if (merge.ok) {
            writeCourier([]);
            const refetched = await fetch("/api/library/cart");
            if (refetched.ok) lines = ((await refetched.json()).lines ?? []) as CartLine[];
          }
        } else if (courier.length) {
          writeCourier([]); // everything already on the member shelf
        }
        reservedStore.getState().hydrate(lines);
      } else {
        mode = "guest";
        reservedStore.getState().hydrate(readCourier());
      }
    } catch {
      mode = "guest";
      reservedStore.getState().hydrate(readCourier());
    }
  })();
  return initPromise;
}

/** Reserved lines + toggle for shelf cards and the Reading Room Select button. */
export function useReserved() {
  useEffect(() => {
    void initReserved();
  }, []);
  const lines = useStore(reservedStore, (s) => s.lines);
  const reservedIds = useMemo(() => new Set(lines.map((l) => l.briefingId)), [lines]);
  const toggle = useCallback(
    (b: { id: string; slug: string; title: string }) => {
      if (reservedIds.has(b.id)) void reservedStore.getState().remove(b.id);
      else void reservedStore.getState().add({ briefingId: b.id, briefingSlug: b.slug, title: b.title, addedAt: "" });
    },
    [reservedIds]
  );
  return { lines, reservedIds, toggle };
}
