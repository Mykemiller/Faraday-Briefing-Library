import type { SourceRow } from "@/lib/types";

/**
 * The Sources table (BL3-11 decision 3), built from `briefings.source_refs` — never from the
 * manuscript's own table. Columns n · title · publisher · date · link; a link renders only for an
 * http/https URL and always with rel="noopener noreferrer". Owners only (the preview never shows
 * Sources, canon flag #7).
 */
export function SourcesTable({ rows, methodology }: { rows: SourceRow[]; methodology?: React.ReactNode }) {
  return (
    <section className="mt-16 max-w-[960px]" aria-labelledby="sources-heading" id="sources">
      <h2 id="sources-heading" className="font-serif font-semibold text-2xl text-warm-white m-0">
        Sources &amp; methodology
      </h2>
      <div className="w-14 h-[2.5px] bg-forest-light mt-3" />
      <div className="w-14 h-0.5 bg-gold mt-0.5" />
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-sage mt-5">No sources are recorded for this Briefing.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px] text-dark-list" data-testid="sources-table">
            <thead>
              <tr>
                {["n", "Title", "Publisher", "Date", "Link"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="font-mono text-[11px] tracking-[1px] uppercase text-sage font-normal py-2 pr-4 border-b border-sage/30"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.n}-${r.title}`} id={`source-${r.n}`}>
                  <td className="py-2 pr-4 align-top border-b border-sage/[0.15] font-mono text-gold">{r.n}</td>
                  <td className="py-2 pr-4 align-top border-b border-sage/[0.15]">{r.title}</td>
                  <td className="py-2 pr-4 align-top border-b border-sage/[0.15]">{r.publisher || "—"}</td>
                  <td className="py-2 pr-4 align-top border-b border-sage/[0.15] font-mono text-xs whitespace-nowrap">
                    {r.date || "—"}
                  </td>
                  <td className="py-2 pr-4 align-top border-b border-sage/[0.15]">
                    {r.href ? (
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold-light underline decoration-gold/50 underline-offset-2 hover:text-warm-white"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {methodology ? <div className="mt-6">{methodology}</div> : null}
    </section>
  );
}
