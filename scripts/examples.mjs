import fs from "node:fs";
import path from "node:path";

const KINDS = new Set(["function", "event"]);

export function exampleKey(kind, qualified) {
  return `${kind}:${qualified}`;
}

export function exampleFile(root, kind, qualified) {
  const safe = String(qualified).replace(/[\\/]/g, "_");
  return path.join(root, kind, `${safe}.json`);
}

function storageQualified(call) {
  if (call.systemType === "ScriptObject" && call.systemSlug && call.name) return `${call.systemSlug}.${call.name}`;
  return call.qualified;
}

function names(fields) {
  return (fields || []).map((field) => field.name).filter(Boolean);
}

function article(word) {
  return /^[aeiou]/i.test(word || "") ? "an" : "a";
}

function clientSentence(call) {
  const line = (call.documentation || []).find((item) => item && String(item).trim());
  if (!line) return "";
  const text = String(line).replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function usageLua(call) {
  const sentence = clientSentence(call);
  const head = sentence ? `-- The client says: ${sentence}` : "-- Possible call from the signature.";
  if (call.kind === "event") {
    const name = call.literalName || call.qualified;
    const payload = names(call.payload);
    if (call.callback) {
      const listed = payload.length ? payload.join(", ") : "none";
      return `${head}\n-- Register through the callback API, not frame:RegisterEvent.\n-- payload: ${listed}`;
    }
    const params = ["self", "event", ...payload].join(", ");
    return [
      head,
      'local frame = CreateFrame("Frame")',
      `frame:RegisterEvent(${JSON.stringify(name)})`,
      `frame:SetScript("OnEvent", function(${params})`,
      "end)",
    ].join("\n");
  }
  const args = (call.arguments || []).map((field) => field.name || "_").join(", ");
  const invoke = call.namespace ? `${call.qualified}(${args})` : `object:${call.name}(${args})`;
  const returns = call.returns || [];
  const returnNames = names(returns);
  const lines = [head];
  if (!call.namespace && call.systemName) lines.push(`-- Call this on ${article(call.systemName)} ${call.systemName} object.`);
  const onlyBool = returnNames.length === 1 && (returns[0].type === "bool" || returns[0].type === "boolean");
  if (onlyBool) {
    lines.push(`if ${invoke} then`);
    lines.push(`  -- ${returnNames[0]} is true`);
    lines.push("end");
  } else if (returnNames.length) {
    lines.push(`local ${returnNames.join(", ")} = ${invoke}`);
  } else {
    lines.push(invoke);
  }
  return lines.join("\n");
}

const USAGE_NOTE = "A possible call shaped from the signature. The comment quotes the client description. This is not a script from Blizzard.";

export function describedCalls(systems) {
  const calls = [];
  for (const system of systems) {
    for (const fn of system.functions || []) {
      if (!(fn.documentation || []).some((line) => line && String(line).trim())) continue;
      const call = callRecord(system, "function", fn.name);
      if (call) calls.push(call);
    }
    for (const event of system.events || []) {
      if (!(event.documentation || []).some((line) => line && String(line).trim())) continue;
      const call = callRecord(system, "event", event.name);
      if (call) calls.push(call);
    }
  }
  return calls;
}

export function seedDescribed(root, calls, meta) {
  const created = [];
  const updated = [];
  const kept = [];
  for (const call of calls) {
    if (!KINDS.has(call.kind) || !call.qualified) continue;
    const stored = storageQualified(call);
    const file = exampleFile(root, call.kind, stored);
    const next = {
      kind: call.kind,
      qualified: stored,
      lua: usageLua(call),
      note: USAGE_NOTE,
      args: names(call.arguments || call.payload),
      returns: names(call.returns),
      origin: "signature",
      addedIn: meta.versionId,
      updatedAt: meta.now,
    };
    if (!fs.existsSync(file)) {
      writeExample(root, next);
      created.push(stored);
      if (stored !== call.qualified) {
        const bare = exampleFile(root, call.kind, call.qualified);
        if (fs.existsSync(bare)) {
          const old = JSON.parse(fs.readFileSync(bare, "utf8"));
          if (old.origin === "signature" && old.qualified === call.qualified) fs.unlinkSync(bare);
        }
      }
      continue;
    }
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    if (existing.origin === "signature" && existing.lua === draftLua(call)) {
      writeExample(root, { ...next, addedIn: existing.addedIn || meta.versionId });
      updated.push(call.qualified);
      continue;
    }
    kept.push(call.qualified);
  }
  return { created, updated, kept };
}

export function draftLua(call) {
  if (call.kind === "event") {
    const name = call.literalName || call.qualified;
    const payload = names(call.payload);
    const header = payload.length ? `-- payload: ${payload.join(", ")}` : "-- no payload";
    if (call.callback) return `-- Register through the callback API, not frame:RegisterEvent.\n${header}`;
    return `frame:RegisterEvent(${JSON.stringify(name)})\n${header}`;
  }
  const args = (call.arguments || []).map((field) => field.name || "_").join(", ");
  const callText = `${call.qualified}(${args})`;
  const returns = names(call.returns);
  if (!returns.length) return callText;
  return `local ${returns.join(", ")} = ${callText}`;
}

export function callRecord(system, kind, name) {
  if (kind === "function") {
    const fn = (system.functions || []).find((item) => item.name === name);
    if (!fn) return null;
    const qualified = system.namespace ? `${system.namespace}.${fn.name}` : fn.name;
    return {
      kind,
      name: fn.name,
      qualified,
      systemSlug: system.slug,
      systemName: system.name,
      systemType: system.type,
      namespace: system.namespace,
      documentation: fn.documentation || [],
      arguments: fn.arguments || [],
      returns: fn.returns || [],
      args: names(fn.arguments).concat(names(fn.returns)).join(" "),
    };
  }
  if (kind === "event") {
    const event = (system.events || []).find((item) => item.name === name || item.literalName === name);
    if (!event) return null;
    return {
      kind,
      name: event.name,
      qualified: event.literalName || event.name,
      literalName: event.literalName,
      systemSlug: system.slug,
      systemName: system.name,
      systemType: system.type,
      namespace: system.namespace,
      documentation: event.documentation || [],
      callback: Boolean(event.callback),
      payload: event.payload || [],
      args: names(event.payload).join(" "),
    };
  }
  return null;
}

export function readExamples(root) {
  const examples = {};
  for (const kind of KINDS) {
    const dir = path.join(root, kind);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const example = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (!example?.kind || !example?.qualified) continue;
      examples[exampleKey(example.kind, example.qualified)] = example;
    }
  }
  return examples;
}

export function publishExamples(root, publicFile, now = new Date().toISOString()) {
  const index = { updated: now, examples: readExamples(root) };
  fs.mkdirSync(path.dirname(publicFile), { recursive: true });
  fs.writeFileSync(publicFile, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

export function writeExample(root, example) {
  const file = exampleFile(root, example.kind, example.qualified);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(example, null, 2)}\n`);
  return file;
}

export function seedMissing(root, calls, meta) {
  const created = [];
  const kept = [];
  for (const call of calls) {
    if (!KINDS.has(call.kind) || !call.qualified) continue;
    const file = exampleFile(root, call.kind, call.qualified);
    if (fs.existsSync(file)) {
      kept.push(call.qualified);
      continue;
    }
    const example = {
      kind: call.kind,
      qualified: call.qualified,
      lua: draftLua(call),
      note: "Drafted from the signature when this call was added or its arguments changed. This is not client documentation.",
      args: names(call.arguments || call.payload),
      returns: names(call.returns),
      origin: "signature",
      addedIn: meta.versionId,
      updatedAt: meta.now,
    };
    writeExample(root, example);
    created.push(call.qualified);
  }
  return { created, kept };
}

export function diffSymbols(previous, current) {
  const calls = (symbols) => (symbols || []).filter((symbol) => KINDS.has(symbol.kind));
  const keyOf = (symbol) => exampleKey(symbol.kind, symbol.qualified);
  const before = new Map(calls(previous).map((symbol) => [keyOf(symbol), symbol]));
  const after = new Map(calls(current).map((symbol) => [keyOf(symbol), symbol]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, symbol] of after) {
    const prior = before.get(key);
    if (!prior) added.push(symbol);
    else if ((prior.args || "") !== (symbol.args || "")) {
      changed.push({ ...symbol, before: prior.args || "", after: symbol.args || "" });
    }
  }
  for (const [key, symbol] of before) {
    if (!after.has(key)) removed.push(symbol);
  }
  const byName = (a, b) => a.qualified.localeCompare(b.qualified) || a.kind.localeCompare(b.kind);
  added.sort(byName);
  removed.sort(byName);
  changed.sort(byName);
  return { added, removed, changed };
}
