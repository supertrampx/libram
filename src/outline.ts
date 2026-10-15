import type { SymbolEntry, SymbolKind } from "./types";

export const CALL_GROUPS: { id: SymbolKind; title: string }[] = [
  { id: "function", title: "Functions" },
  { id: "event", title: "Events" },
  { id: "structure", title: "Structures" },
  { id: "enumeration", title: "Enums" },
  { id: "constants", title: "Constants" },
  { id: "table", title: "Tables" },
];

export function symbolProse(symbol: SymbolEntry) {
  if (!symbol.summary || symbol.summary === symbol.qualified || symbol.summary === symbol.name) return "";
  return symbol.summary;
}

export function describedSystemSlugs(symbols: SymbolEntry[]) {
  const slugs = new Set<string>();
  for (const symbol of symbols) {
    if ((symbol.kind === "function" || symbol.kind === "event") && symbolProse(symbol)) slugs.add(symbol.systemSlug);
  }
  return slugs;
}

export function symbolIsDescribed(symbol: SymbolEntry) {
  if (symbol.kind !== "function" && symbol.kind !== "event") return true;
  return Boolean(symbolProse(symbol));
}

export function surfaceIsDescribed(
  surface: { clientDocumentation?: string[]; members: { slug: string }[] },
  described: Set<string>,
) {
  return Boolean(surface.clientDocumentation?.length) || surface.members.some((member) => described.has(member.slug));
}

export function firstUnknownIndex(items: SymbolEntry[]) {
  const index = items.findIndex((symbol) => !symbolProse(symbol));
  return index > 0 ? index : -1;
}

function compareSymbols(a: SymbolEntry, b: SymbolEntry) {
  const prose = Number(symbolProse(b).length > 0) - Number(symbolProse(a).length > 0);
  return prose || a.name.localeCompare(b.name);
}

export function groupSymbols(symbols: SymbolEntry[]) {
  return CALL_GROUPS.map((group) => ({
    ...group,
    items: symbols.filter((symbol) => symbol.kind === group.id).sort(compareSymbols),
  })).filter((group) => group.items.length > 0);
}

export function leadSentence(blurb: string) {
  const match = blurb.match(/^.*?[.!?](?:\s|$)/);
  return match ? match[0].trim() : blurb;
}
