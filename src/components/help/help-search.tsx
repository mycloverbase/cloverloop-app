"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

type Entry = { title: string; description: string; category: string; href: string; text: string };

const MAX_RESULTS = 8;

function score(entry: Entry, tokens: string[]) {
  const title = entry.title.toLowerCase();
  const category = entry.category.toLowerCase();
  const description = entry.description.toLowerCase();
  const text = entry.text.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    const hit =
      (title.includes(token) ? 10 : 0) +
      (category.includes(token) ? 5 : 0) +
      (description.includes(token) ? 3 : 0) +
      (text.includes(token) ? 1 : 0);
    if (!hit) return 0;
    total += hit;
  }
  return total;
}

export function HelpSearch({ variant = "compact" }: { variant?: "hero" | "compact" }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  async function load() {
    if (index || loading.current) return;
    loading.current = true;
    try {
      const response = await fetch("/help-center/search-index.json");
      if (!response.ok) throw new Error("Search index unavailable");
      setIndex(await response.json());
    } catch {
      loading.current = false;
      setFailed(true);
    }
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results =
    index && tokens.length
      ? index
          .map((entry) => ({ entry, value: score(entry, tokens) }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, MAX_RESULTS)
      : [];
  const showPanel = open && tokens.length > 0;

  return (
    <div ref={rootRef} className={`help-search help-search-${variant}`} role="search">
      <label htmlFor={`${id}-input`} className="sr-only">Search the Help Centre</label>
      <Search size={19} aria-hidden="true" className="help-search-icon" />
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="search"
        value={query}
        placeholder="Search help articles"
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          void load();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          void load();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        aria-controls={`${id}-panel`}
      />
      {query && (
        <button
          type="button"
          className="help-search-clear"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}
      {showPanel && (
        <div className="help-search-panel" id={`${id}-panel`}>
          {failed ? (
            <p className="help-search-empty">Search is unavailable right now. Please browse the categories instead.</p>
          ) : !index ? (
            <p className="help-search-empty">Searching…</p>
          ) : results.length === 0 ? (
            <p className="help-search-empty">No articles match “{query.trim()}”. Try different words or browse the categories.</p>
          ) : (
            <ul aria-live="polite">
              {results.map(({ entry }) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={() => {
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="help-search-result-title">{entry.title}</span>
                    <span className="help-search-result-category">{entry.category}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
