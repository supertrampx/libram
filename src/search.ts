import Fuse from "fuse.js";
import type { SurfaceInfo, SymbolEntry } from "./types";

export interface PreparedSymbol {
  symbol: SymbolEntry;
  name: string;
  qualified: string;
  literal: string;
  summary: string;
  args: string;
  system: string;
}

export function prepareSymbols(symbols: SymbolEntry[]): PreparedSymbol[] {
  return symbols.map((symbol) => ({
    symbol,
    name: symbol.name.toLowerCase(),
    qualified: symbol.qualified.toLowerCase(),
    literal: symbol.literalName?.toLowerCase() ?? "",
    summary: symbol.summary.toLowerCase(),
    args: symbol.args.toLowerCase(),
    system: symbol.system.toLowerCase(),
  }));
}

export function scopeSymbols(symbols: SymbolEntry[], kind: string, systemSlugs: string[] | null) {
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

function rank(item: PreparedSymbol, query: string) {
  if (item.name === query || item.qualified === query || item.literal === query) return 0;
  if (item.name.startsWith(query)) return 1;
  if (item.qualified.startsWith(query) || item.literal.startsWith(query)) return 2;
  if (item.name.includes(query)) return 3;
  if (item.qualified.includes(query) || item.literal.includes(query)) return 4;
  if (item.args.includes(query) && item.args.split(/\s+/).includes(query)) return 5;
  if (item.summary.includes(query)) return 6;
  if (item.args.includes(query)) return 7;
  if (item.system.includes(query)) return 8;
  return 99;
}

export function searchSymbols(
  prepared: PreparedSymbol[],
  query: string,
  browsing: boolean,
  fuzzy?: (query: string) => SymbolEntry[],
) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    const items = browsing ? prepared.slice(0, 400).map((item) => item.symbol) : [];
    return { items, total: browsing ? prepared.length : 0 };
  }
  const buckets: PreparedSymbol[][] = [[], [], [], [], [], [], [], [], []];
  for (const item of prepared) {
    const score = rank(item, trimmed);
    if (score < 99) buckets[score].push(item);
  }
  let total = 0;
  for (const bucket of buckets) total += bucket.length;
  if (total === 0 && trimmed.length >= 3 && fuzzy) {
    const items = fuzzy(trimmed);
    return { items, total: items.length };
  }
  const items: SymbolEntry[] = [];
  for (const bucket of buckets) {
    if (items.length >= 80) break;
    bucket.sort((a, b) => a.symbol.name.localeCompare(b.symbol.name));
    for (const item of bucket) {
      items.push(item.symbol);
      if (items.length === 80) break;
    }
  }
  return { items, total };
}

function scoreSurface(surface: SurfaceInfo, query: string) {
  const fields = [surface.name, surface.namespace, surface.primarySlug, ...surface.namespaces];
  let best = 99;
  for (const field of fields) {
    const value = field?.toLowerCase();
    if (!value) continue;
    if (value === query) return 0;
    if (value.startsWith(query)) best = Math.min(best, 1);
    else if (value.includes(query)) best = Math.min(best, 2);
  }
  return best;
}

export function matchingSurface(surfaces: SurfaceInfo[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 3) return null;
  let bestScore = 99;
  let winners: SurfaceInfo[] = [];
  for (const surface of surfaces) {
    if (surface.functions + surface.events === 0) continue;
    const score = scoreSurface(surface, trimmed);
    if (score > 2 || score > bestScore) continue;
    if (score < bestScore) {
      bestScore = score;
      winners = [surface];
    } else winners.push(surface);
  }
  return winners.length === 1 ? winners[0] : null;
}

export function surfaceForResults(surfaces: SurfaceInfo[], symbols: SymbolEntry[]) {
  if (!symbols.length) return null;
  const top = symbols.slice(0, 8);
  const slug = top[0].systemSlug;
  const count = top.filter((symbol) => symbol.systemSlug === slug).length;
  if (top.length > 1 && count < Math.ceil(top.length * 0.6)) return null;
  return surfaces.find((surface) => surface.primarySlug === slug || surface.members.some((member) => member.slug === slug)) ?? null;
}
