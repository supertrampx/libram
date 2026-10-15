export interface VersionCounts {
  systems: number;
  functions: number;
  events: number;
  tables: number;
}

export interface VersionInfo {
  id: string;
  product: string;
  label: string;
  version: string;
  build: string;
  ingestedAt: string;
  latest: boolean;
  counts: VersionCounts;
}

export interface Manifest {
  updated: string | null;
  versions: VersionInfo[];
}

export type SymbolKind = "function" | "event" | "structure" | "enumeration" | "constants" | "table";

export interface SymbolEntry {
  id: string;
  kind: SymbolKind;
  name: string;
  qualified: string;
  literalName?: string;
  system: string;
  systemSlug: string;
  namespace?: string;
  summary: string;
  args: string;
}

export interface SurfaceMember {
  slug: string;
  name: string;
  role: "api" | "types";
}

export interface SurfaceInfo {
  id: string;
  name: string;
  namespace?: string;
  namespaces: string[];
  blurb: string;
  clientDocumentation?: string[];
  primarySlug: string;
  members: SurfaceMember[];
  functions: number;
  events: number;
  tables: number;
}

export interface SystemSummary {
  slug: string;
  name: string;
  namespace?: string;
  type: string;
  environment?: string;
  functions: number;
  events: number;
  tables: number;
}

export interface TypeRef {
  systemSlug: string;
  kind: SymbolKind;
  name: string;
}

export interface VersionIndex {
  systems: SystemSummary[];
  symbols: SymbolEntry[];
  types: Record<string, TypeRef[]>;
  surfaces?: SurfaceInfo[];
}

export type Scalar = string | number | boolean | null | { ref: string } | { expr: string };

export interface FieldDoc {
  name: string;
  type: string;
  nilable?: boolean;
  documentation?: string[];
  default?: Scalar;
  innerType?: string;
  strideIndex?: Scalar;
  mixin?: string;
  enumValue?: Scalar;
  literalName?: string;
  value?: Scalar;
  flags?: Record<string, unknown>;
}

export interface FunctionDoc {
  name: string;
  documentation?: string[];
  arguments?: FieldDoc[];
  returns?: FieldDoc[];
  flags?: Record<string, unknown>;
}

export interface EventDoc {
  name: string;
  documentation?: string[];
  payload?: FieldDoc[];
  literalName?: string;
  synchronous?: boolean;
  unique?: boolean;
  callback?: boolean;
  flags?: Record<string, unknown>;
}

export interface TableDoc {
  name: string;
  kind: string;
  documentation?: string[];
  fields?: FieldDoc[];
  numValues?: number;
  minValue?: number;
  maxValue?: number;
  flags?: Record<string, unknown>;
}

export interface SystemDoc {
  name: string;
  slug: string;
  type: string;
  namespace?: string;
  environment?: string;
  documentation?: string[];
  functions: FunctionDoc[];
  events: EventDoc[];
  tables: TableDoc[];
}

export interface CallExample {
  kind: "function" | "event";
  qualified: string;
  lua: string;
  note?: string;
  args?: string[];
  returns?: string[];
  origin: "signature" | "note";
  addedIn?: string;
  updatedAt?: string;
}

export interface ExampleIndex {
  updated: string | null;
  examples: Record<string, CallExample>;
}

export interface RouteState {
  versionId?: string;
  systemSlug?: string;
  kind?: string;
  name?: string;
}

export type KindFilter = "all" | SymbolKind;
