"use client";

import { useEffect, useRef, useState } from "react";
import type { JurisdictionOption } from "@/lib/model";

/**
 * Jurisdiction filter (`?jurisdiction=US-TX|DE|…`). A plain GET form that works with no
 * JavaScript (the Apply button submits it); once hydrated, changing the menu submits directly
 * and the button steps aside. The other active filters ride along as hidden inputs.
 */
export function JurisdictionSelect({
  options,
  value,
  tier,
  type,
}: {
  options: JurisdictionOption[];
  value: string | null;
  tier: string | null;
  type: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const disabled = options.length === 0;
  const states = options.filter((o) => o.group === "us");
  const countries = options.filter((o) => o.group === "country");
  const render = (o: JurisdictionOption) => (
    <option key={o.id} value={o.id}>
      {o.name} ({o.count})
    </option>
  );

  return (
    <form ref={formRef} action="/" method="get" className="flex items-end gap-2">
      {type ? <input type="hidden" name="type" value={type} /> : null}
      {tier ? <input type="hidden" name="tier" value={tier} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="jurisdiction" className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-warm-gray">
          Jurisdiction
        </label>
        <select
          id="jurisdiction"
          name="jurisdiction"
          defaultValue={value ?? ""}
          disabled={disabled}
          aria-describedby={disabled ? "jurisdiction-help" : undefined}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-11 min-w-[13rem] appearance-none rounded-none border border-warm-gray-2 bg-paper bg-[length:10px] bg-[right_0.9rem_center] bg-no-repeat pl-3 pr-9 font-sans text-sm text-ink transition-colors hover:border-forest disabled:cursor-not-allowed disabled:text-warm-gray"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%231C3424' stroke-width='1.5'/%3E%3C/svg%3E\")",
          }}
        >
          <option value="">All jurisdictions</option>
          {states.length && countries.length ? (
            <>
              <optgroup label="United States">{states.map(render)}</optgroup>
              <optgroup label="Countries">{countries.map(render)}</optgroup>
            </>
          ) : (
            options.map(render)
          )}
        </select>
        {disabled ? (
          <span id="jurisdiction-help" className="text-xs text-warm-gray">
            No jurisdiction briefings are published yet.
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
