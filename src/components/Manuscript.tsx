import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref } from "@/lib/reader";

/**
 * Safe Markdown for the Reading Room (BL3-11 decision 1): react-markdown + remark-gfm, NO
 * rehype-raw. Raw HTML in a manuscript is dropped entirely (`skipHtml`), links and images keep
 * only http/https URLs (plus in-page `#anchors` for links), and external links open with
 * rel="noopener noreferrer". Server component: only the Markdown it is given reaches the HTML.
 */

export function readerUrlTransform(url: string, key: string): string {
  if (key === "href" && url.startsWith("#")) return url;
  return safeHref(url) ?? "";
}

const components: Components = {
  h2: ({ children }) => (
    <h2 className="font-serif font-semibold text-[26px] leading-[1.25] text-warm-white mt-12 mb-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-serif font-semibold text-[19px] leading-[1.3] text-gold-light mt-8 mb-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="font-mono text-xs tracking-[1.2px] uppercase text-sage mt-6 mb-0">{children}</h4>,
  p: ({ children }) => <p className="font-serif text-[17.5px] leading-[1.65] text-dark-cream mt-4 mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 mt-4 space-y-1.5 text-dark-cream font-serif text-[17px]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mt-4 space-y-1.5 text-dark-cream font-serif text-[17px]">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-warm-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gold pl-5 mt-5 text-dark-list italic">{children}</blockquote>
  ),
  hr: () => <hr className="border-0 h-px bg-sage/25 my-10" />,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    const external = !href.startsWith("#");
    return (
      <a
        href={href}
        className="text-gold-light underline decoration-gold/50 underline-offset-2 hover:text-warm-white"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px] text-dark-list">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="font-mono text-[11px] tracking-[1px] uppercase text-sage font-normal py-2 pr-4 border-b border-sage/30">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="py-2 pr-4 align-top border-b border-sage/[0.15]">{children}</td>,
  code: ({ children }) => <code className="font-mono text-[13px] text-gold-light">{children}</code>,
  pre: ({ children }) => <pre className="mt-4 overflow-x-auto bg-black/20 p-4 text-[13px]">{children}</pre>,
};

export function Manuscript({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-[720px]">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={readerUrlTransform} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
