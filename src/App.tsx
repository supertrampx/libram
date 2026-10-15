import { useEffect, useMemo, useRef, useState } from "react";
import { Detail } from "./Detail";
import { kindLabel, kindTone, memberOf } from "./explain";
import { loadExamples, loadIndex, loadManifest, loadSystem, readRoute, writeRoute } from "./load";
import { describedSystemSlugs, firstUnknownIndex, groupSymbols, surfaceIsDescribed, symbolIsDescribed, symbolProse } from "./outline";
import { makeFuse, scopeSymbols, searchSymbols } from "./search";
import type { CallExample, KindFilter, Manifest, RouteState, SurfaceInfo, SymbolEntry, VersionIndex, VersionInfo } from "./types";

const FILTERS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "function", label: "Functions" },
  { id: "event", label: "Events" },
  { id: "structure", label: "Structures" },
  { id: "enumeration", label: "Enums" },
  { id: "constants", label: "Constants" },
];

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [index, setIndex] = useState<VersionIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteState>(() => readRoute());
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [systemQuery, setSystemQuery] = useState("");
  const [active, setActive] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Awaited<ReturnType<typeof loadSystem>>>());
  const [systemDoc, setSystemDoc] = useState<Awaited<ReturnType<typeof loadSystem>> | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [examples, setExamples] = useState<Record<string, CallExample>>({});
  const [showUnknown, setShowUnknown] = useState(() => localStorage.getItem("libram.showUnknown") === "1");

  const version = manifest?.versions.find((item) => item.id === route.versionId) ?? null;

  useEffect(() => {
    loadManifest().then(setManifest).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    loadExamples()
      .then((index) => setExamples(index.examples || {}))
      .catch(() => setExamples({}));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!manifest) return;
    if (route.versionId && manifest.versions.some((item) => item.id === route.versionId)) return;
    const preferred = localStorage.getItem("libram.version");
    const fallback =
      manifest.versions.find((item) => item.id === preferred) ||
      manifest.versions.find((item) => item.latest) ||
      manifest.versions[0];
    if (!fallback) return;
    const next = { ...route, versionId: fallback.id };
    writeRoute(next, true);
    setRoute(next);
  }, [manifest, route]);

  useEffect(() => {
    if (!version) return;
    let cancelled = false;
    setIndex(null);
    loadIndex(version.id, version.ingestedAt)
      .then((data) => {
        if (!cancelled) setIndex(data);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    if (!version || !route.systemSlug) {
      setSystemDoc(null);
      return;
    }
    const key = `${version.id}/${route.systemSlug}`;
    const cached = cache.current.get(key);
    if (cached) {
      setSystemDoc(cached);
      setSystemLoading(false);
      return;
    }
    let cancelled = false;
    setSystemDoc(null);
    setSystemLoading(true);
    loadSystem(version.id, route.systemSlug, version.ingestedAt)
      .then((doc) => {
        cache.current.set(key, doc);
        if (!cancelled) setSystemDoc(doc);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setSystemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version, route.systemSlug]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const label = route.name ? `${route.name} · Libram` : version ? `${version.label} ${version.version} · Libram` : "Libram";
    document.title = label;
  }, [route.name, version]);

  const surface = surfaceFor(index?.surfaces, route.systemSlug);
  const surfaceSlugs = useMemo(() => {
    const found = surfaceFor(index?.surfaces, route.systemSlug);
    if (found) return found.members.map((member) => member.slug);
    return route.systemSlug ? [route.systemSlug] : null;
  }, [index, route.systemSlug]);
  const scoped = useMemo(
    () => (index ? scopeSymbols(index.symbols, kind, surfaceSlugs) : []),
    [index, kind, surfaceSlugs],
  );
  const describedSlugs = useMemo(() => describedSystemSlugs(index?.symbols ?? []), [index]);
  const hideUndescribed = !showUnknown && (!surface || surfaceIsDescribed(surface, describedSlugs));
  const shown = useMemo(
    () => (hideUndescribed ? scoped.filter(symbolIsDescribed) : scoped),
    [scoped, hideUndescribed],
  );
  const outline = useMemo(() => groupSymbols(shown), [shown]);
  const fuse = useMemo(() => makeFuse(shown), [shown]);
  const results = useMemo(
    () => searchSymbols(shown, fuse, query, Boolean(route.systemSlug)),
    [shown, fuse, query, route.systemSlug],
  );
  const browsingCalls = Boolean(surfaceSlugs) && !query.trim();
  const listed = browsingCalls ? outline.flatMap((group) => group.items) : results.items;
  const concealed = useMemo(
    () => (hideUndescribed ? scoped.filter((symbol) => !symbolIsDescribed(symbol)).length : 0),
    [scoped, hideUndescribed],
  );

  useEffect(() => setActive(0), [query, kind, route.systemSlug, route.versionId, showUnknown]);

  function navigate(next: RouteState, replace = false) {
    writeRoute(next, replace);
    setRoute(next);
    if (next.versionId) localStorage.setItem("libram.version", next.versionId);
  }

  function openSymbol(symbol: SymbolEntry) {
    if (!version) return;
    navigate({ versionId: version.id, systemSlug: symbol.systemSlug, kind: symbol.kind, name: symbol.name });
  }

  function openType(typeName: string) {
    const refs = index?.types[typeName];
    if (!version || !refs?.length) return;
    const match =
      refs.find((item) => surfaceSlugs?.includes(item.systemSlug)) ??
      refs.find((item) => item.systemSlug === route.systemSlug) ??
      refs[0];
    navigate({ versionId: version.id, systemSlug: match.systemSlug, kind: match.kind, name: match.name });
  }

  const selected = index && route.kind && route.name && route.systemSlug
    ? index.symbols.find((symbol) => symbol.systemSlug === route.systemSlug && symbol.kind === route.kind && symbol.name === route.name) ?? null
    : null;
  const missing = Boolean(index && route.name && !selected);
  const member = systemDoc && selected ? memberOf(systemDoc, selected.kind, selected.name) : null;
  const needle = systemQuery.trim().toLowerCase();
  const catalog = index?.surfaces?.length ? index.surfaces : null;
  const visibleSurfaces = (catalog ?? []).filter((item) => {
    if (!needle) return true;
    return (
      item.name.toLowerCase().includes(needle) ||
      (item.namespace || "").toLowerCase().includes(needle) ||
      item.namespaces.some((namespace) => namespace.toLowerCase().includes(needle)) ||
      item.members.some((member) => member.name.toLowerCase().includes(needle))
    );
  });
  const apiSurfaces = visibleSurfaces.filter((item) => item.functions + item.events > 0);
  const knownApis = apiSurfaces.filter((item) => surfaceIsDescribed(item, describedSlugs));
  const unknownApis = apiSurfaces.filter((item) => !surfaceIsDescribed(item, describedSlugs));
  const unknownTotal = (catalog ?? []).filter((item) => item.functions + item.events > 0 && !surfaceIsDescribed(item, describedSlugs)).length;
  const typeSurfaces = visibleSurfaces.filter((item) => item.functions + item.events === 0);
  const systems = (index?.systems ?? []).filter((system) => {
    if (!needle) return true;
    return system.name.toLowerCase().includes(needle) || (system.namespace || "").toLowerCase().includes(needle);
  });
  const showBrowser = !narrow || !route.systemSlug || (Boolean(query.trim()) && !route.name);
  const showDetail = !narrow || Boolean(route.name) || (Boolean(route.systemSlug) && !query.trim());

  if (error) {
    return (
      <main className="grid h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl text-parchment">Libram has no API data yet</h1>
          <p className="mt-3 max-w-md text-mist">{error}</p>
          <p className="mt-3 font-mono text-sm text-gold">npm run ingest</p>
        </div>
      </main>
    );
  }

  if (!manifest || !version) {
    if (manifest && manifest.versions.length === 0) {
      return (
        <main className="grid h-dvh place-items-center px-6 text-center">
          <div>
            <h1 className="text-2xl text-parchment">No builds ingested</h1>
            <p className="mt-3 font-mono text-sm text-gold">npm run ingest</p>
          </div>
        </main>
      );
    }
    return <main className="grid h-dvh place-items-center text-mist">Loading builds…</main>;
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => navigate({ versionId: version.id })}
          className="flex items-center gap-2 text-left"
        >
          <Mark />
          <span className="text-lg font-semibold tracking-tight text-parchment">Libram</span>
        </button>
        <VersionMenu
          open={versionOpen}
          versions={manifest.versions}
          current={version}
          onToggle={() => setVersionOpen((value) => !value)}
          onClose={() => setVersionOpen(false)}
          onPick={(id) => {
            setVersionOpen(false);
            navigate({ versionId: id, systemSlug: route.systemSlug, kind: route.kind, name: route.name });
          }}
        />
        <a href={`${import.meta.env.BASE_URL}guide/`} className="ml-auto text-sm text-mist hover:text-parchment">
          Lua
        </a>
        <button type="button" onClick={() => setHelpOpen(true)} className="text-sm text-mist hover:text-parchment">
          Update
        </button>
        <form
          className="relative basis-full"
          onSubmit={(event) => {
            event.preventDefault();
            const symbol = listed[active];
            if (symbol) openSymbol(symbol);
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, Math.max(listed.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Escape") {
                setQuery("");
              }
            }}
            placeholder="Search functions, events, enums…"
            aria-label="Search the API"
            className="w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm text-parchment outline-none placeholder:text-stone focus:border-gold"
          />
          <span className="pointer-events-none absolute right-3 top-2 hidden font-mono text-xs text-stone sm:block">/</span>
        </form>
      </header>
      <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setKind(filter.id)}
            className={`rounded-full px-3 py-1 text-sm ${kind === filter.id ? "bg-gold text-ink" : "bg-raised text-mist hover:text-parchment"}`}
          >
            {filter.label}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-xs text-stone">
          {!index
            ? "Indexing…"
            : browsingCalls
              ? `${listed.length.toLocaleString()} in this API`
              : query.trim() || route.systemSlug
                ? results.total > results.items.length
                  ? `${results.items.length.toLocaleString()} of ${results.total.toLocaleString()}`
                  : `${results.total.toLocaleString()} shown`
                : `${version.counts.functions.toLocaleString()} functions`}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_340px_minmax(0,1fr)]">
        {showBrowser && (
          <aside className="flex min-h-0 flex-col border-b border-line lg:border-r lg:border-b-0">
            <label className="border-b border-line px-3 py-2">
              <span className="sr-only">Filter systems</span>
              <input
                value={systemQuery}
                onChange={(event) => setSystemQuery(event.target.value)}
                placeholder="APIs"
                aria-label="Filter APIs"
                className="w-full bg-transparent text-sm text-parchment outline-none placeholder:text-stone"
              />
            </label>
            <label className="flex items-start gap-2 border-b border-line px-3 py-2 text-sm text-mist">
              <input
                type="checkbox"
                checked={showUnknown}
                onChange={(event) => {
                  const next = event.target.checked;
                  setShowUnknown(next);
                  localStorage.setItem("libram.showUnknown", next ? "1" : "0");
                }}
                className="mt-1"
              />
              <span>
                Show unknown
                <span className="mt-0.5 block text-xs leading-relaxed text-stone">
                  {unknownTotal.toLocaleString()} APIs have no client description and stay hidden. A later build that describes a call moves it into the list on its own.
                </span>
              </span>
            </label>
            <ul className="min-h-0 flex-1 overflow-auto">
              {catalog ? (
                <>
                  <SurfaceGroup
                    title="APIs"
                    surfaces={knownApis}
                    current={route.systemSlug}
                    onPick={(slug) => navigate({ versionId: version.id, systemSlug: slug })}
                  />
                  {showUnknown && (
                    <SurfaceGroup
                      title="Unknown"
                      hint="The client never described these calls. Nothing in the build marks them unused."
                      surfaces={unknownApis}
                      current={route.systemSlug}
                      onPick={(slug) => navigate({ versionId: version.id, systemSlug: slug })}
                    />
                  )}
                  <SurfaceGroup
                    title="Types"
                    surfaces={typeSurfaces}
                    current={route.systemSlug}
                    onPick={(slug) => navigate({ versionId: version.id, systemSlug: slug })}
                  />
                </>
              ) : (
                systems.map((system) => {
                  const selectedSystem = system.slug === route.systemSlug;
                  return (
                    <li key={system.slug}>
                      <button
                        type="button"
                        onClick={() => navigate({ versionId: version.id, systemSlug: system.slug })}
                        className={`block w-full border-l-2 px-3 py-2 text-left ${selectedSystem ? "border-gold bg-raised" : "border-transparent hover:bg-raised/70"}`}
                      >
                        <span className="block text-parchment">{system.name}</span>
                        <span className="block truncate font-mono text-xs text-stone">
                          {system.namespace || system.type} · {system.functions + system.events + system.tables}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </aside>
        )}
        {showBrowser && (
          <section className="flex min-h-0 flex-col border-b border-line lg:border-r lg:border-b-0" aria-live="polite">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs uppercase tracking-wider text-stone">
              <span>{surface ? surface.namespace || surface.name : route.systemSlug ? index?.systems.find((system) => system.slug === route.systemSlug)?.name : "Results"}</span>
              {(query || route.systemSlug) && (
                <button
                  type="button"
                  className="normal-case tracking-normal text-gold"
                  onClick={() => {
                    setQuery("");
                    navigate({ versionId: version.id });
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {browsingCalls && surface && (
              <p className="border-b border-line px-3 py-3 text-sm leading-relaxed text-mist">{surface.blurb}</p>
            )}
            {browsingCalls && concealed > 0 && (
              <p className="border-b border-line px-3 py-2 text-xs leading-relaxed text-stone">
                {concealed.toLocaleString()} calls have no client description and stay hidden.
              </p>
            )}
            <ul className="min-h-0 flex-1 overflow-auto">
              {!index && <li className="px-3 py-4 text-mist">Loading this build…</li>}
              {index && !query.trim() && !route.systemSlug && (
                <li className="px-3 py-4 leading-relaxed text-mist">Type at least a few letters, or pick an API. Exact names rank first; a typo falls through to fuzzy search.</li>
              )}
              {browsingCalls
                ? outline.map((group) => {
                    const start = listed.indexOf(group.items[0]);
                    return (
                      <li key={group.id}>
                        <p className="px-3 pt-3 pb-1 text-xs uppercase tracking-wider text-stone">{group.title}</p>
                        <ul>
                          {group.items.map((symbol, position) => (
                            <SymbolRow
                              key={symbol.id}
                              symbol={symbol}
                              query={query}
                              active={start + position === active}
                              picked={selected?.id === symbol.id}
                              onOpen={() => openSymbol(symbol)}
                              onHover={() => setActive(start + position)}
                              unknownHeading={
                                (group.id === "function" || group.id === "event") && position === firstUnknownIndex(group.items)
                              }
                            />
                          ))}
                        </ul>
                      </li>
                    );
                  })
                : listed.map((symbol, position) => (
                    <SymbolRow
                      key={symbol.id}
                      symbol={symbol}
                      query={query}
                      active={position === active}
                      picked={selected?.id === symbol.id}
                      onOpen={() => openSymbol(symbol)}
                      onHover={() => setActive(position)}
                    />
                  ))}
              {index && (query.trim() || route.systemSlug) && listed.length === 0 && (
                <li className="px-3 py-4 text-mist">
                  {query.trim() && concealed > 0 && scoped.some((symbol) => !symbolIsDescribed(symbol) && symbol.name.toLowerCase().includes(query.trim().toLowerCase()))
                    ? "That call has no client description, so it stays hidden until you turn on Show unknown."
                    : "Nothing in this build matches that."}
                </li>
              )}
            </ul>
          </section>
        )}
        {showDetail && (
          <main className="min-h-0 overflow-auto">
            <Detail
              version={version}
              system={systemDoc}
              symbol={selected}
              member={member}
              types={index?.types ?? {}}
              loading={systemLoading || Boolean(route.name && !index)}
              missing={missing}
              requestedName={route.name}
              onOpenType={openType}
              onOpenHelp={() => setHelpOpen(true)}
              surface={surface}
              outline={shown}
              onOpenSymbol={openSymbol}
              onLeave={() => navigate({ versionId: version.id })}
              onBackToApi={() => navigate({ versionId: version.id, systemSlug: surface?.primarySlug || route.systemSlug })}
              compact={narrow}
              examples={examples}
            />
          </main>
        )}
      </div>
      <footer className="border-t border-line px-4 py-2 text-xs leading-relaxed text-stone">
        API descriptions are quoted from the World of Warcraft client.
      </footer>
      {helpOpen && <Help version={version} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function surfaceFor(surfaces: SurfaceInfo[] | undefined, slug?: string) {
  if (!surfaces?.length || !slug) return null;
  return surfaces.find((item) => item.primarySlug === slug || item.members.some((member) => member.slug === slug)) ?? null;
}

function SurfaceGroup({
  title,
  hint,
  surfaces,
  current,
  onPick,
}: {
  title: string;
  hint?: string;
  surfaces: SurfaceInfo[];
  current?: string;
  onPick: (slug: string) => void;
}) {
  if (!surfaces.length) return null;
  return (
    <>
      <li className="px-3 pt-3 pb-1 text-xs uppercase tracking-wider text-stone">
        {title}
        {hint && <span className="mt-1 block text-[0.7rem] font-sans normal-case tracking-normal text-stone">{hint}</span>}
      </li>
      {surfaces.map((item) => {
        const selected = item.primarySlug === current || item.members.some((member) => member.slug === current);
        const calls = item.functions + item.events;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.primarySlug)}
              className={`block w-full border-l-2 px-3 py-2 text-left ${selected ? "border-gold bg-raised" : "border-transparent hover:bg-raised/70"}`}
            >
              <span className="block text-parchment">{item.namespace || item.name}</span>
              <span className="block truncate font-mono text-xs text-stone">
                {item.namespace ? `${item.name} · ` : ""}
                {calls > 0 ? `${item.functions} calls · ${item.events} events` : `${item.tables} types`}
              </span>
            </button>
          </li>
        );
      })}
    </>
  );
}

function SymbolRow({
  symbol,
  query,
  active,
  picked,
  unknownHeading,
  onOpen,
  onHover,
}: {
  symbol: SymbolEntry;
  query: string;
  active: boolean;
  picked: boolean;
  unknownHeading?: boolean;
  onOpen: () => void;
  onHover: () => void;
}) {
  const prose = symbolProse(symbol);
  return (
    <li>
      {unknownHeading && <p className="px-3 pt-3 pb-1 text-xs uppercase tracking-wider text-stone">Unknown</p>}
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onHover}
        className={`block w-full px-3 py-2 text-left ${active ? "bg-raised" : "hover:bg-raised/60"} ${picked ? "outline outline-1 -outline-offset-1 outline-gold" : ""}`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <Highlight text={symbol.kind === "event" ? symbol.qualified : symbol.name} query={query} />
          <span className={`shrink-0 text-xs uppercase tracking-wide ${kindTone(symbol.kind)}`}>{kindLabel(symbol.kind)}</span>
        </span>
        {prose && <span className="mt-0.5 block truncate text-sm text-stone">{prose}</span>}
      </button>
    </li>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (index < 0) return <span className="font-mono text-sm text-parchment">{text}</span>;
  return (
    <span className="font-mono text-sm text-parchment">
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </span>
  );
}

function VersionMenu({
  open,
  versions,
  current,
  onToggle,
  onClose,
  onPick,
}: {
  open: boolean;
  versions: VersionInfo[];
  current: VersionInfo;
  onToggle: () => void;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const groups = new Map<string, VersionInfo[]>();
  for (const version of versions) {
    const list = groups.get(version.label) ?? [];
    list.push(version);
    groups.set(version.label, list);
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="max-w-[11rem] truncate rounded-md border border-line bg-raised px-3 py-2 text-left text-sm text-parchment hover:border-gold sm:max-w-none"
        aria-expanded={open}
      >
        {current.label} · {current.version}
        {current.latest ? "" : " · older"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close versions" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
          <div className="absolute z-20 mt-2 max-h-80 w-72 overflow-auto rounded-md border border-line bg-panel p-2 shadow-xl">
            {[...groups.entries()].map(([label, items]) => (
              <div key={label} className="mb-2">
                <p className="px-2 py-1 text-xs uppercase tracking-wider text-stone">{label}</p>
                {items
                  .slice()
                  .sort((a, b) => b.build.localeCompare(a.build, undefined, { numeric: true }))
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onPick(item.id)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${item.id === current.id ? "bg-raised text-gold" : "text-parchment hover:bg-raised"}`}
                    >
                      <span className="font-mono">{item.version}</span>
                      {item.latest && <span className="text-xs uppercase tracking-wide text-stone">Latest</span>}
                    </button>
                  ))}
              </div>
            ))}
            <p className="px-2 py-2 text-xs leading-relaxed text-stone">Older builds stay in this list after you ingest a newer patch.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Help({ version, onClose }: { version: VersionInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 px-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="help-title"
        className="max-h-[85dvh] w-full max-w-lg overflow-auto rounded-lg border border-line bg-panel p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="help-title" className="text-xl text-parchment">
          Keep Libram on the current build
        </h2>
        <p className="mt-3 text-mist">
          The site cannot see your game. The desktop tool compares <span className="font-mono text-parchment">.build.info</span> with the
          snapshot you last ingested. This page is {version.label} {version.version}.
        </p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed text-mist">
          <li>
            In the Battle.net launcher, add <span className="font-mono text-parchment">-console</span> to that client’s additional command
            line arguments.
          </li>
          <li>
            Open the console and run <span className="font-mono text-parchment">ExportInterfaceFiles code</span>. The client writes{" "}
            <span className="font-mono text-parchment">BlizzardInterfaceCode</span> next to the executable. Libram cannot run that command
            for you.
          </li>
          <li>
            <span className="font-mono text-parchment">npm run status</span> tells you which installed clients are newer than Libram.
          </li>
          <li>
            <span className="font-mono text-parchment">npm run ingest</span> parses the export and adds that build to the version menu. It
            does not commit or push.
          </li>
          <li>
            <span className="font-mono text-parchment">npm run watch</span> checks every few minutes and raises a desktop notice when a
            client build changes.
          </li>
        </ol>
        <button type="button" onClick={onClose} className="mt-6 rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
          Close
        </button>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 6.5h8.2c1.6 1.1 2.8 1.1 4.4 0H26v18h-7.2c-1.6 1.2-3 1.2-4.6 0H6v-18z" fill="none" stroke="#e2b45a" strokeWidth="1.8" />
      <path d="M16 7.2v16.6" stroke="#e2b45a" strokeWidth="1.6" />
    </svg>
  );
}
