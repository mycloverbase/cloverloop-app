"""Convert the Help Centre content master (.docx) into Markdown files under content/help.

Usage: python tools/import-help-content.py "<path to CloverLoop_Help_for_Creators_Content_Master.docx>"

Requires python-docx. Text is copied verbatim from the document; nothing is authored here.
Re-running overwrites article files, so edit the .docx and re-import, or edit the Markdown directly
and stop using this script.
"""
import json
import re
import shutil
import sys
from pathlib import Path

import docx
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "help"
LAST_UPDATED = "2026-11-01"

# Category slugs follow the Sprint 2 route list. Document category 3 maps to managing-products.
CATEGORY_SLUGS = {
    "Getting Started": "getting-started",
    "Your Storefront": "creating-your-storefront",
    "Products and Digital Downloads": "managing-products",
    "Razorpay Setup": "razorpay-setup",
    "Payments and Settlements": "payments-and-settlements",
    "Pricing and Platform Fees": "pricing-and-platform-fees",
    "Free Products": "free-products",
    "Account and Security": "account-and-security",
    "Troubleshooting": "troubleshooting",
}
LABELS = ("GENERAL GUIDANCE", "GENERAL GUIDE", "GENERAL TROUBLESHOOTING")
CALLOUT_HEADINGS = {"Important": "important"}
REVIEW_NOTE_HEADINGS = {"Editorial dependency"}


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def q(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def main(path: str) -> None:
    d = docx.Document(path)
    paras = [Paragraph(el, d) for el in d.element.body.iterchildren() if el.tag.endswith("}p")]

    categories, articles = [], []
    cur_cat = cur = None
    editorial, references, ref_note, checklist = [], [], [], []
    mode = "editorial"

    for p in paras:
        text, style = p.text.strip(), p.style.name
        if not text:
            continue
        if style == "Heading 1":
            m_cat = re.match(r"Category (\d+)\s+—\s+(.*)", text)
            m_art = re.match(r"(\d+)\.\s+(.*)", text)
            if m_cat:
                name = m_cat.group(2).strip()
                cur_cat = {"slug": CATEGORY_SLUGS[name], "title": name, "order": int(m_cat.group(1))}
                categories.append(cur_cat)
                cur, mode = None, "article"
            elif m_art and mode == "article":
                cur = {"order": int(m_art.group(1)), "title": m_art.group(2).strip(), "category": cur_cat["slug"],
                       "label": None, "review": [], "blocks": [], "target": "body"}
                articles.append(cur)
            elif text == "Official external references":
                cur, mode = None, "references"
            elif text == "Editorial QA checklist":
                cur, mode = None, "checklist"
            continue
        if mode == "editorial":
            editorial.append(text)
        elif mode == "references":
            (references if re.search(r"https?://", text) else ref_note).append(text)
        elif mode == "checklist":
            checklist.append(text)
        elif cur is not None:
            if style == "Heading 2":
                cur["target"] = "review" if text in REVIEW_NOTE_HEADINGS else "body"
                if cur["target"] == "body":
                    kind = CALLOUT_HEADINGS.get(text)
                    cur["blocks"].append(("callout", kind, text) if kind else ("h2", text))
            elif cur["target"] == "review":
                cur["review"].append(text)
            elif style.startswith("List"):
                cur["blocks"].append(("li", text))
            elif text.startswith(LABELS) and not cur["blocks"]:
                cur["label"] = text
            else:
                cur["blocks"].append(("p", text))

    for sub in OUT.iterdir() if OUT.exists() else []:
        if sub.is_dir():
            shutil.rmtree(sub)
    OUT.mkdir(parents=True, exist_ok=True)

    slugs = set()
    for a in articles:
        a["slug"] = slugify(a["title"])
        assert a["slug"] not in slugs, a["slug"]
        slugs.add(a["slug"])
        lines, i, blocks = [], 0, a["blocks"]
        while i < len(blocks):
            b = blocks[i]
            if b[0] == "h2":
                lines += [f"## {b[1]}", ""]
            elif b[0] == "callout":
                body = blocks[i + 1][1] if i + 1 < len(blocks) and blocks[i + 1][0] == "p" else ""
                lines += [f":::{b[1]} {b[2]}", body, ":::", ""]
                i += 1 if body else 0
            elif b[0] == "li":
                lines.append(f"- {b[1]}")
                if i + 1 >= len(blocks) or blocks[i + 1][0] != "li":
                    lines.append("")
            else:
                lines += [b[1], ""]
            i += 1
        intro = next((b[1] for b in blocks if b[0] == "p"), "")
        front = ["---", f"title: {q(a['title'])}", f"slug: {q(a['slug'])}", f"category: {q(a['category'])}",
                 f"order: {a['order']}", f"description: {q(intro)}", 'status: "published"',
                 f"lastUpdated: {q(LAST_UPDATED)}", "related: []"]
        if a["label"]:
            front.append(f"editorialLabel: {q(a['label'])}")
        if a["review"]:
            front.append(f"reviewNote: {q(' '.join(a['review']))}")
        front.append("---")
        folder = OUT / a["category"]
        folder.mkdir(exist_ok=True)
        (folder / f"{a['slug']}.md").write_text("\n".join(front) + "\n\n" + "\n".join(lines).rstrip() + "\n", encoding="utf-8")

    (OUT / "categories.json").write_text(
        json.dumps([{"slug": c["slug"], "title": c["title"], "order": c["order"]} for c in categories], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    (OUT / "references.md").write_text("\n\n".join(references) + "\n", encoding="utf-8")
    (OUT / "EDITORIAL_NOTES.md").write_text(
        "# Editorial notes (internal, not rendered)\n\n" + "\n\n".join(editorial)
        + "\n\n## Note on external references\n\n" + "\n\n".join(ref_note)
        + "\n\n## Editorial QA checklist\n\n" + "\n".join(f"- {c}" for c in checklist) + "\n",
        encoding="utf-8")
    print(f"{len(categories)} categories, {len(articles)} articles")


if __name__ == "__main__":
    main(sys.argv[1])
