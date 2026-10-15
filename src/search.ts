import Fuse from "fuse.js";
import type { KindFilter, SymbolEntry } from "./types";

export function scopeSymbols(symbols: SymbolEntry[], kind: KindFilter, systemSlugs: string[] | null) {
  const allowed = systemSlugs?.length ? new Set(systemSlugs) : null;
  return symbols.filter((symbol) => {
    if (allowed && !allowed.has(symbol.systemSlug)) return false;
    if (kind !== "all" && symbol.kind !== kind) return false;
    return true;
  });
}

export function makeFuse(symbols: SymbolEntry[]) {
  return new Fuse(symbols, {
    keys: [
      { name: "name", weight: 0.5 },
      { name: "qualified", weight: 0.25 },
      { name: "literalName", weight: 0.2 },
      { name: "summary", weight: 0.15 },
      { name: "args", weight: 0.1 },
      { name: "system", weight: 0.05 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

function rank(symbol: SymbolEntry, query: string) {
  const name = symbol.name.toLowerCase();
  const qualified = symbol.qualified.toLowerCase();
  const literal = symbol.literalName?.toLowerCase() ?? "";
  const summary = symbol.summary.toLowerCase();
  const args = symbol.args.toLowerCase();
  const system = symbol.system.toLowerCase();
  if (name === query || qualified === query || literal === query) return 0;
  if (name.startsWith(query)) return 1;
  if (qualified.startsWith(query) || literal.startsWith(query)) return 2;
  if (name.includes(query)) return 3;
  if (qualified.includes(query) || literal.includes(query)) return 4;
  if (args.split(/\s+/).includes(query)) return 5;
  if (summary.includes(query)) return 6;
  if (args.includes(query)) return 7;
  if (system.includes(query)) return 8;
  return 99;
}

export function searchSymbols(symbols: SymbolEntry[], fuse: Fuse<SymbolEntry>, query: string, browsing: boolean) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    const items = browsing ? symbols.slice(0, 400) : [];
    return { items, total: browsing ? symbols.length : 0 };
  }
  const direct = symbols
    .map((symbol) => ({ symbol, score: rank(symbol, trimmed) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.symbol.name.localeCompare(b.symbol.name));
  if (direct.length || trimmed.length < 3) {
    return { items: direct.slice(0, 80).map((item) => item.symbol), total: direct.length };
  }
  const fuzzy = fuse.search(trimmed, { limit: 40 }).map((result) => result.item);
  return { items: fuzzy, total: fuzzy.length };
}
