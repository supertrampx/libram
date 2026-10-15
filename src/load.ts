import type { ExampleIndex, Manifest, RouteState, SystemDoc, VersionIndex } from "./types";

const base = import.meta.env.BASE_URL;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.json() as Promise<T>;
}

export function loadManifest(): Promise<Manifest> {
  return getJson(`${base}data/manifest.json`);
}

export function loadIndex(versionId: string, stamp: string): Promise<VersionIndex> {
  return getJson(`${base}data/${versionId}/index.json?v=${encodeURIComponent(stamp)}`);
}

export function loadSystem(versionId: string, slug: string, stamp: string): Promise<SystemDoc> {
  return getJson(`${base}data/${versionId}/systems/${slug}.json?v=${encodeURIComponent(stamp)}`);
}

export function loadExamples(): Promise<ExampleIndex> {
  return getJson(`${base}examples/index.json`);
}

export function readRoute(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return {};
  const parts = raw.split("/").map(decodeURIComponent);
  const [versionId, systemSlug, kind, ...nameParts] = parts;
  return {
    versionId,
    systemSlug,
    kind,
    name: nameParts.length ? nameParts.join("/") : undefined,
  };
}

export function writeRoute(route: RouteState, replace: boolean) {
  const parts = [route.versionId, route.systemSlug, route.kind, route.name].filter(
    (part): part is string => Boolean(part),
  );
  const next = parts.length ? `#/${parts.map(encodeURIComponent).join("/")}` : "#/";
  if (window.location.hash === next) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}
