export type CalloutKind = "tip" | "warning" | "important" | "note";

export type HelpBlock =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "callout"; kind: CalloutKind; title: string; blocks: HelpBlock[] };

export function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CALLOUT_RE = /^:::(tip|warning|important|note)\s*(.*)$/;
const splitRow = (line: string) =>
  line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export function parseHelpMarkdown(source: string): HelpBlock[] {
  const used = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugifyHeading(text) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  };

  const lines = source.replace(/\r\n/g, "\n").split("\n");

  function parse(from: number, until: (line: string) => boolean): { blocks: HelpBlock[]; next: number } {
    const blocks: HelpBlock[] = [];
    let i = from;
    while (i < lines.length && !until(lines[i])) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const callout = line.match(CALLOUT_RE);
      if (callout) {
        const inner = parse(i + 1, (l) => l.trim() === ":::");
        blocks.push({ type: "callout", kind: callout[1] as CalloutKind, title: callout[2].trim(), blocks: inner.blocks });
        i = inner.next + 1;
        continue;
      }
      const heading = line.match(/^(#{2,3})\s+(.*)$/);
      if (heading) {
        const text = heading[2].trim();
        blocks.push({ type: "heading", level: heading[1].length as 2 | 3, text, id: uniqueId(text) });
        i++;
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items: string[] = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) {
          items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "").trim());
          i++;
        }
        blocks.push({ type: "list", ordered, items });
        continue;
      }
      if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
        const header = splitRow(line);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
        blocks.push({ type: "table", header, rows });
        continue;
      }
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !until(lines[i]) &&
        !/^(#{2,3}\s|:::|\s*([-*]|\d+\.)\s)/.test(lines[i])
      ) {
        para.push(lines[i].trim());
        i++;
      }
      blocks.push({ type: "paragraph", text: para.join(" ") });
    }
    return { blocks, next: i };
  }

  return parse(0, () => false).blocks;
}

const stripInline = (text: string) =>
  text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");

export function blocksToPlainText(blocks: HelpBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
        case "paragraph":
          return stripInline(block.text);
        case "list":
          return block.items.map(stripInline).join(" ");
        case "table":
          return [...block.header, ...block.rows.flat()].map(stripInline).join(" ");
        case "callout":
          return `${block.title} ${blocksToPlainText(block.blocks)}`;
      }
    })
    .join(" ");
}
