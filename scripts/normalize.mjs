const SYSTEM_KEYS = new Set([
  "Name",
  "Type",
  "Namespace",
  "Environment",
  "Functions",
  "Events",
  "Tables",
  "Predicates",
  "Documentation",
]);

const FUNCTION_KEYS = new Set(["Name", "Type", "Documentation", "Arguments", "Returns"]);
const EVENT_KEYS = new Set([
  "Name",
  "Type",
  "Documentation",
  "Payload",
  "LiteralName",
  "SynchronousEvent",
  "UniqueEvent",
  "CallbackEvent",
]);
const TABLE_KEYS = new Set([
  "Name",
  "Type",
  "Documentation",
  "Fields",
  "Values",
  "NumValues",
  "MinValue",
  "MaxValue",
]);
const FIELD_KEYS = new Set([
  "Name",
  "Type",
  "Nilable",
  "Documentation",
  "Default",
  "InnerType",
  "StrideIndex",
  "Mixin",
  "EnumValue",
  "LiteralName",
  "Value",
]);

export function slugify(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "system";
}

function docs(value) {
  if (value == null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  const lines = list.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).filter(Boolean);
  return lines.length ? lines : undefined;
}

function flagsFrom(source, known) {
  const flags = {};
  for (const [key, value] of Object.entries(source)) {
    if (known.has(key) || value == null || value === false) continue;
    flags[key] = value;
  }
  return Object.keys(flags).length ? flags : undefined;
}

function field(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected a field table");
  }
  const out = {
    name: String(raw.Name ?? ""),
    type: raw.Type != null ? String(raw.Type) : "unknown",
  };
  if (typeof raw.Nilable === "boolean") out.nilable = raw.Nilable;
  const documentation = docs(raw.Documentation);
  if (documentation) out.documentation = documentation;
  if (raw.Default !== undefined) out.default = raw.Default;
  if (raw.InnerType != null) out.innerType = String(raw.InnerType);
  if (raw.StrideIndex != null) out.strideIndex = raw.StrideIndex;
  if (raw.Mixin != null) out.mixin = String(raw.Mixin);
  if (raw.EnumValue !== undefined) out.enumValue = raw.EnumValue;
  if (raw.LiteralName != null) out.literalName = String(raw.LiteralName);
  if (raw.Value !== undefined) out.value = raw.Value;
  const flags = flagsFrom(raw, FIELD_KEYS);
  if (flags) out.flags = flags;
  return out;
}

function fieldList(value) {
  if (!value) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected a list of fields");
  return value.map(field);
}

function callable(raw, { payload = false } = {}) {
  const out = { name: String(raw.Name ?? "") };
  const documentation = docs(raw.Documentation);
  if (documentation) out.documentation = documentation;
  const args = fieldList(payload ? raw.Payload : raw.Arguments);
  if (args) out[payload ? "payload" : "arguments"] = args;
  if (!payload) {
    const returns = fieldList(raw.Returns);
    if (returns) out.returns = returns;
  }
  if (raw.LiteralName) out.literalName = String(raw.LiteralName);
  if (raw.SynchronousEvent === true) out.synchronous = true;
  if (raw.UniqueEvent === true) out.unique = true;
  if (raw.CallbackEvent === true) out.callback = true;
  const flags = flagsFrom(raw, payload ? EVENT_KEYS : FUNCTION_KEYS);
  if (flags) out.flags = flags;
  return out;
}

function tableDoc(raw) {
  const out = {
    name: String(raw.Name ?? ""),
    kind: raw.Type != null ? String(raw.Type) : "Table",
  };
  const documentation = docs(raw.Documentation);
  if (documentation) out.documentation = documentation;
  const fields = fieldList(raw.Fields);
  const values = fieldList(raw.Values);
  if (fields && values) out.fields = [...fields, ...values];
  else if (fields) out.fields = fields;
  else if (values) out.fields = values;
  if (raw.NumValues != null) out.numValues = raw.NumValues;
  if (raw.MinValue != null) out.minValue = raw.MinValue;
  if (raw.MaxValue != null) out.maxValue = raw.MaxValue;
  const flags = flagsFrom(raw, TABLE_KEYS);
  if (flags) out.flags = flags;
  return out;
}

function list(value, map) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new Error("Expected a list");
  return value.map(map);
}

export function normalizeDocument(table, localName) {
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    throw new Error(`${localName || "document"} is not a documentation table`);
  }
  const name = table.Name ? String(table.Name) : localName || "Definitions";
  const system = {
    name,
    slug: slugify(name),
    type: table.Name ? String(table.Type || "System") : "Definitions",
    functions: list(table.Functions, (item) => callable(item)),
    events: list(table.Events, (item) => callable(item, { payload: true })),
    tables: list(table.Tables, tableDoc),
  };
  if (table.Namespace) system.namespace = String(table.Namespace);
  if (table.Environment) system.environment = String(table.Environment);
  const documentation = docs(table.Documentation);
  if (documentation) system.documentation = documentation;
  const predicates = list(table.Predicates, (item) => item);
  if (predicates.length) system.predicates = predicates;
  const extra = flagsFrom(table, SYSTEM_KEYS);
  if (extra) system.extra = extra;
  return system;
}

export function symbolKind(tableKind) {
  if (tableKind === "Structure") return "structure";
  if (tableKind === "Enumeration") return "enumeration";
  if (tableKind === "Constants") return "constants";
  return "table";
}

function names(fields) {
  return (fields || []).map((field) => field.name).filter(Boolean);
}

export function indexSystem(system) {
  const symbols = [];
  for (const fn of system.functions) {
    const qualified = system.namespace ? `${system.namespace}.${fn.name}` : fn.name;
    symbols.push({
      id: `${system.slug}/function/${fn.name}`,
      kind: "function",
      name: fn.name,
      qualified,
      system: system.name,
      systemSlug: system.slug,
      namespace: system.namespace,
      summary: fn.documentation?.[0] || qualified,
      args: names(fn.arguments).concat(names(fn.returns)).join(" "),
    });
  }
  for (const event of system.events) {
    const qualified = event.literalName || event.name;
    symbols.push({
      id: `${system.slug}/event/${event.name}`,
      kind: "event",
      name: event.name,
      qualified,
      literalName: event.literalName,
      system: system.name,
      systemSlug: system.slug,
      namespace: system.namespace,
      summary: event.documentation?.[0] || qualified,
      args: names(event.payload).join(" "),
    });
  }
  for (const table of system.tables) {
    const kind = symbolKind(table.kind);
    const count = table.fields?.length || 0;
    symbols.push({
      id: `${system.slug}/${kind}/${table.name}`,
      kind,
      name: table.name,
      qualified: table.name,
      system: system.name,
      systemSlug: system.slug,
      namespace: system.namespace,
      summary: table.documentation?.[0] || `${table.kind} with ${count} ${count === 1 ? "field" : "fields"}`,
      args: names(table.fields).join(" "),
    });
  }
  return symbols;
}
