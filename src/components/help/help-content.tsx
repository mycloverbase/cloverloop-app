import type { ReactNode } from "react";
import {
  BadgeIndianRupee,
  BookOpen,
  CreditCard,
  Gift,
  Info,
  Landmark,
  Lightbulb,
  LifeBuoy,
  Package,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Store,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { CalloutKind, HelpBlock } from "@/lib/help-markdown";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Rocket,
  Store,
  Package,
  CreditCard,
  Landmark,
  BadgeIndianRupee,
  Gift,
  ShieldCheck,
  LifeBuoy,
};

export function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = CATEGORY_ICONS[name] ?? BookOpen;
  return <Icon size={size} aria-hidden="true" />;
}

const CALLOUT_ICONS: Record<CalloutKind, LucideIcon> = {
  tip: Lightbulb,
  warning: TriangleAlert,
  important: ShieldAlert,
  note: Info,
};

const INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)|(https?:\/\/[^\s)]+)|\*\*([^*]+)\*\*/g;

function ExternalOrInternal({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

export function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start < last) continue;
    if (start > last) nodes.push(text.slice(last, start));
    if (match[1]) {
      nodes.push(<ExternalOrInternal key={start} href={match[2]}>{match[1]}</ExternalOrInternal>);
      last = start + match[0].length;
    } else if (match[3]) {
      const url = match[3].replace(/[.,;:]+$/, "");
      nodes.push(<ExternalOrInternal key={start} href={url}>{url}</ExternalOrInternal>);
      last = start + url.length;
    } else {
      nodes.push(<strong key={start}>{match[4]}</strong>);
      last = start + match[0].length;
    }
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export function Callout({ kind, title, children }: { kind: CalloutKind; title: string; children: ReactNode }) {
  const Icon = CALLOUT_ICONS[kind];
  return (
    <aside className={`help-callout help-callout-${kind}`}>
      <Icon size={20} aria-hidden="true" />
      <div>
        {title && <p className="help-callout-title">{title}</p>}
        {children}
      </div>
    </aside>
  );
}

export function HelpTable({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="help-table-wrap" tabIndex={0}>
      <table className="help-table">
        <thead>
          <tr>{header.map((cell, i) => <th key={i} scope="col"><Inline text={cell} /></th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>{row.map((cell, c) => <td key={c}><Inline text={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} id={block.id}>{block.text}</h2>
            ) : (
              <h3 key={index} id={block.id}>{block.text}</h3>
            );
          case "paragraph":
            return <p key={index}><Inline text={block.text} /></p>;
          case "list": {
            const items = block.items.map((item, i) => <li key={i}><Inline text={item} /></li>);
            return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
          }
          case "table":
            return <HelpTable key={index} header={block.header} rows={block.rows} />;
          case "callout":
            return (
              <Callout key={index} kind={block.kind} title={block.title}>
                <HelpBlocks blocks={block.blocks} />
              </Callout>
            );
        }
      })}
    </>
  );
}
