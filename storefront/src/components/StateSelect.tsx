"use client";

import { useEffect, useRef, useState } from "react";

type Option = { code: string; name: string; count: number };

/**
 * State filter. A plain GET form that works with no JavaScript (the Apply button submits it);
 * once hydrated, changing the menu submits directly and the button steps aside.
 */
export function StateSelect({ options, value, tier }: { options: Option[]; value: string | null; tier: string | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const disabled = options.length === 0;

  return (
    <form ref={formRef} action="/" method="get" className="flex items-end gap-2">
      {tier ? <input type="hidden" name="tier" value={tier} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="state" className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-warm-gray">
          State
        </label>
        <select
          id="state"
          name="state"
          defaultValue={value ?? ""}
          disabled={disabled}
          aria-describedby={disabled ? "state-help" : undefined}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-11 min-w-[13rem] appearance-none rounded-none border border-warm-gray-2 bg-paper bg-[length:10px] bg-[right_0.9rem_center] bg-no-repeat pl-3 pr-9 font-sans text-sm text-ink transition-colors hover:border-forest disabled:cursor-not-allowed disabled:text-warm-gray"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%231C3424' stroke-width='1.5'/%3E%3C/svg%3E\")",
          }}
        >
          <option value="">All states</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name} ({o.count})
            </option>
          ))}
        </select>
        {disabled ? (
          <span id="state-help" className="text-xs text-warm-gray">
            No state-level briefings are published yet.
          </span>
        ) : null}
      </div>
      {!hydrated && !disabled ? (
        <button type="submit" className="h-11 border border-forest bg-forest px-4 font-sans text-sm font-medium text-paper hover:bg-forest-mid">
          Apply
        </button>
      ) : null}
    </form>
  );
}
