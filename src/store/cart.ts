import { createStore } from "zustand/vanilla";
import type { CartLine } from "@/lib/types";

/**
 * The reading table — a persistent, identity-bound cart held in Supabase, fronted by a
 * Zustand store with a ROLLBACK SNAPSHOT BUFFER (§9.2, Eng 3).
 *
 * Each mutation: update UI instantly → push prior snapshot → dispatch server write. If the
 * write fails after a bounded retry window, a quiet toast fires and THAT item rolls back to
 * its last good state. The reading table never desyncs from the server. localStorage is only
 * a pre-auth courier (§9.4) — never the cart of record.
 */

export interface CartServer {
  add(line: CartLine): Promise<void>;
  remove(briefingId: string): Promise<void>;
}

export interface CartState {
  lines: CartLine[];
  /** Snapshot stack for rollback — one entry per in-flight mutation. */
  pending: { snapshot: CartLine[]; briefingId: string }[];
  toast: string | null;
  add: (line: CartLine) => Promise<void>;
  remove: (briefingId: string) => Promise<void>;
  hydrate: (lines: CartLine[]) => void;
  clearToast: () => void;
}

export interface CartDeps {
  server: CartServer;
  retries?: number; // bounded retry window (default 2 extra attempts)
  backoffMs?: number; // delay base; 0 in tests
  now?: () => string;
}

async function withRetry(fn: () => Promise<void>, retries: number, backoffMs: number) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < retries && backoffMs > 0) {
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

export function createCartStore(deps: CartDeps) {
  const retries = deps.retries ?? 2;
  const backoffMs = deps.backoffMs ?? 200;
  const now = deps.now ?? (() => new Date().toISOString());

  return createStore<CartState>((set, get) => ({
    lines: [],
    pending: [],
    toast: null,

    hydrate: (lines) => set({ lines }),
    clearToast: () => set({ toast: null }),

    add: async (line) => {
      const exists = get().lines.some((l) => l.briefingId === line.briefingId);
      if (exists) return; // no duplicate lines (unique constraint mirror, §9.3)
      const snapshot = get().lines;
      set({
        lines: [...snapshot, { ...line, addedAt: line.addedAt || now() }],
        pending: [...get().pending, { snapshot, briefingId: line.briefingId }],
      });
      try {
        await withRetry(() => deps.server.add(line), retries, backoffMs);
        set({ pending: get().pending.filter((p) => p.briefingId !== line.briefingId) });
      } catch {
        // Per-item rollback to last good state + quiet toast (§9.2, §12).
        set({
          lines: get().lines.filter((l) => l.briefingId !== line.briefingId),
          pending: get().pending.filter((p) => p.briefingId !== line.briefingId),
          toast: "Couldn’t add that to your table — try again.",
        });
      }
    },

    remove: async (briefingId) => {
      const snapshot = get().lines;
      const removed = snapshot.find((l) => l.briefingId === briefingId);
      if (!removed) return;
      set({
        lines: snapshot.filter((l) => l.briefingId !== briefingId),
        pending: [...get().pending, { snapshot, briefingId }],
      });
      try {
        await withRetry(() => deps.server.remove(briefingId), retries, backoffMs);
        set({ pending: get().pending.filter((p) => p.briefingId !== briefingId) });
      } catch {
        // Restore exactly the removed line (per-item rollback), preserving other concurrent edits.
        set({
          lines: get().lines.some((l) => l.briefingId === briefingId)
            ? get().lines
            : [...get().lines, removed],
          pending: get().pending.filter((p) => p.briefingId !== briefingId),
          toast: "Couldn’t remove that — restored your line.",
        });
      }
    },
  }));
}

export type CartStore = ReturnType<typeof createCartStore>;
