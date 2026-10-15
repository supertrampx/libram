import type { EventDoc, FieldDoc, FunctionDoc, Scalar, SymbolKind, SystemDoc, TableDoc } from "./types";

const PRIMITIVES = new Set([
  "number",
  "string",
  "bool",
  "boolean",
  "cstring",
  "stringView",
  "table",
  "luaIndex",
  "nil",
  "unknown",
]);

function tagged(value: unknown, key: "ref" | "expr"): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== key || typeof record[key] !== "string") return null;
  return record[key];
}

export function isRef(value: unknown): value is { ref: string } {
  return tagged(value, "ref") !== null;
}

export function isExpr(value: unknown): value is { expr: string } {
  return tagged(value, "expr") !== null;
}

export function showScalar(value: Scalar | unknown): string {
  const ref = tagged(value, "ref");
  if (ref) return ref;
  const expr = tagged(value, "expr");
  if (expr) return expr;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "nil";
  return JSON.stringify(value);
}

export function isOptional(field: FieldDoc) {
  return field.default !== undefined || field.nilable === true;
}

export function formatType(field: Pick<FieldDoc, "type" | "innerType">) {
  return field.innerType ? `${field.type} of ${field.innerType}` : field.type;
}

export function canLinkType(type: string) {
  return !PRIMITIVES.has(type);
}

export function kindLabel(kind: SymbolKind | string) {
  if (kind === "function") return "Function";
  if (kind === "event") return "Event";
  if (kind === "structure") return "Structure";
  if (kind === "enumeration") return "Enum";
  if (kind === "constants") return "Constants";
  return "Table";
}

export function kindTone(kind: string) {
  if (kind === "function") return "text-foam";
  if (kind === "event") return "text-lilac";
  if (kind === "enumeration" || kind === "constants") return "text-gold";
  return "text-sky";
}

export function functionSignature(system: SystemDoc, fn: FunctionDoc) {
  const args = (fn.arguments ?? []).map((arg) => (isOptional(arg) ? `${arg.name}?` : arg.name)).join(", ");
  const call = system.namespace ? `${system.namespace}.${fn.name}(${args})` : `${fn.name}(${args})`;
  const returns = (fn.returns ?? []).map((item) => item.name).join(", ");
  return returns ? `${returns} = ${call}` : call;
}

export function copyCall(system: SystemDoc, fn: FunctionDoc) {
  const signature = functionSignature(system, fn);
  if (!fn.returns?.length) return signature;
  const returns = fn.returns.map((item) => item.name).join(", ");
  const call = signature.slice(signature.indexOf("=") + 2);
  return `local ${returns} = ${call}`;
}

export function eventSignature(event: EventDoc) {
  const args = (event.payload ?? []).map((field) => (isOptional(field) ? `${field.name}?` : field.name)).join(", ");
  return `${event.literalName || event.name}(${args})`;
}

export function fallbackDescription(system: SystemDoc, fn: FunctionDoc) {
  const args = fn.arguments ?? [];
  const returns = fn.returns ?? [];
  const where = system.namespace
    ? `${fn.name} belongs to ${system.name} and is called as ${system.namespace}.${fn.name}.`
    : `${fn.name} belongs to ${system.name}.`;
  const argText =
    args.length === 0
      ? "It takes no arguments."
      : args.length > 4
        ? `It takes ${args.length} arguments, listed below.`
        : `Pass ${args.map((arg) => `${arg.name}, ${isOptional(arg) ? "an optional" : article(formatType(arg))} ${formatType(arg)}`).join("; ")}.`;
  let returned = "It does not return a value.";
  if (returns.length === 1) {
    returned = `It returns ${returns[0].name}, ${article(formatType(returns[0]))} ${formatType(returns[0])}${returns[0].nilable ? " that may be nil" : ""}.`;
  } else if (returns.length > 4) {
    returned = `It returns ${returns.length} values, listed below.`;
  } else if (returns.length > 1) {
    returned = `It returns ${returns.map((item) => `${item.name} (${formatType(item)})`).join(", ")}.`;
  }
  const empty = fn.flags && "MayReturnNothing" in fn.flags ? " The call may also return nothing." : "";
  return `${where} ${argText} ${returned}${empty}`;
}

export function explainField(field: FieldDoc, role: "argument" | "return" | "payload" | "field") {
  if (field.documentation?.length) return field.documentation.join(" ");
  const type = formatType(field);
  if (field.enumValue !== undefined) return `${field.name} is stored as ${showScalar(field.enumValue)}.`;
  if (field.value !== undefined) {
    if (isRef(field.value)) return `Value is the client constant ${field.value.ref}.`;
    if (isExpr(field.value)) return `Value is computed in the client as ${field.value.expr}.`;
    return `The value is ${showScalar(field.value)}.`;
  }
  if (role === "argument") {
    if (!isOptional(field)) return `Required ${type}.`;
    if (field.default !== undefined) return `Optional ${type}. If you omit it, the client uses ${showScalar(field.default)}.`;
    return `Optional ${type}. You can omit it or pass nil.`;
  }
  if (field.nilable) return `${type}, and may be nil.`;
  return `${type}.`;
}

const HANDLED_FLAGS = new Set(["IsProtectedFunction", "MayReturnNothing", "SecureHooksAllowed", "SecretArguments"]);

export function restrictionNotes(flags: Record<string, unknown> | undefined, event?: EventDoc) {
  const notes: string[] = [];
  if (event?.synchronous) notes.push("Fires immediately, during the action that caused it, rather than on a later frame.");
  if (event?.unique) notes.push("Only one registration is kept. A later registration replaces the previous one.");
  if (event?.callback) notes.push("Register this through the callback API rather than frame:RegisterEvent.");
  if (!flags) return notes;
  if (flags.IsProtectedFunction === true) {
    notes.push("Protected function. Addon code can call it from a hardware event, or from a secure template.");
  }
  if (flags.MayReturnNothing === true) {
    notes.push("May return no values at all. Check that a result exists before you use it.");
  }
  if (flags.SecureHooksAllowed === true) notes.push("Addon code may wrap this with hooksecurefunc.");
  if (typeof flags.SecretArguments === "string") {
    notes.push(
      flags.SecretArguments === "AllowedWhenUntainted"
        ? "Arguments may be secret values. Addon code can pass them while it is untainted."
        : `Secret-argument policy: ${flags.SecretArguments}.`,
    );
  }
  return notes;
}

export function otherFlags(flags: Record<string, unknown> | undefined) {
  if (!flags) return [];
  return Object.entries(flags)
    .filter(([key, value]) => !HANDLED_FLAGS.has(key) && value !== false && value != null)
    .map(([key, value]) => [humanize(key), value === true ? "" : showScalar(value)] as const);
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export function humanize(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function memberOf(system: SystemDoc, kind: string, name: string) {
  if (kind === "function") return system.functions.find((item) => item.name === name) ?? null;
  if (kind === "event") return system.events.find((item) => item.name === name) ?? null;
  return system.tables.find((item) => item.name === name) ?? null;
}

export function isFunction(member: FunctionDoc | EventDoc | TableDoc, kind: string): member is FunctionDoc {
  void member;
  return kind === "function";
}

export function isEvent(member: FunctionDoc | EventDoc | TableDoc, kind: string): member is EventDoc {
  void member;
  return kind === "event";
}

export function isTable(member: FunctionDoc | EventDoc | TableDoc, kind: string): member is TableDoc {
  void member;
  return kind !== "function" && kind !== "event";
}
