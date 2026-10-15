const FAMILY_SUFFIXES = ["Constants", "Shared", "Enums", "Types", "Internal", "Script"];

const VERB_LABELS = [
  ["Cancel", "canceling"],
  ["Create", "creating"],
  ["Delete", "deleting"],
  ["Remove", "removing"],
  ["Request", "requests"],
  ["Search", "search"],
  ["Update", "updates"],
  ["Start", "starting"],
  ["Stop", "stopping"],
  ["Place", "placing"],
  ["Clear", "clearing"],
  ["Toggle", "toggling"],
  ["Close", "closing"],
  ["Query", "queries"],
  ["Reset", "resetting"],
  ["Accept", "accepting"],
  ["Decline", "declining"],
  ["Invite", "inviting"],
  ["Confirm", "confirming"],
  ["Pickup", "picking up"],
  ["Equip", "equipping"],
  ["Learn", "learning"],
  ["Open", "opening"],
  ["Send", "sending"],
  ["Show", "showing"],
  ["Hide", "hiding"],
  ["Post", "posting"],
  ["Buy", "buying"],
  ["Sell", "selling"],
  ["Sort", "sorting"],
  ["Join", "joining"],
  ["Leave", "leaving"],
  ["Kick", "removing"],
  ["Get", "lookups"],
  ["Set", "changes"],
  ["Has", "checks"],
  ["Can", "checks"],
  ["Are", "checks"],
  ["Add", "adding"],
  ["Use", "using"],
  ["Put", "putting"],
  ["Is", "checks"],
];

export function familyKey(name) {
  let key = String(name || "");
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of FAMILY_SUFFIXES) {
      if (key.endsWith(suffix) && key.length - suffix.length >= 3) {
        key = key.slice(0, -suffix.length);
        stripped = true;
      }
    }
  }
  return key || String(name || "system");
}

export function humanizeName(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function joinAnd(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function verbPhrase(names) {
  const counts = new Map();
  for (const name of names) {
    const match = VERB_LABELS.find(([prefix]) => name.startsWith(prefix));
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return "";
  const top = ranked.slice(0, 3).map(([label, count]) => `${label} (${count})`);
  return `The call names cover ${joinAnd(top)}.`;
}

function describeCalls(members) {
  const functions = members.flatMap((system) => system.functions || []);
  const events = members.flatMap((system) => system.events || []);
  const tables = members.flatMap((system) => system.tables || []);
  const namespaces = [...new Set(members.map((system) => system.namespace).filter(Boolean))];
  const family = humanizeName(familyKey(members[0]?.name || ""));
  const calls = functions.length;
  const census = [calls ? plural(calls, "call") : null, events.length ? plural(events.length, "event") : null]
    .filter(Boolean)
    .join(" and ");

  if (!calls && !events.length) {
    const owner = family || humanizeName(members[0]?.name);
    return `${owner} is a set of ${plural(tables.length, "type")} in this build. There are no calls in this group.`;
  }

  let who;
  if (namespaces.length > 1) who = `${joinAnd(namespaces)} split the ${family} calls`;
  else if (namespaces.length === 1) who = `${namespaces[0]} is the ${family} API`;
  else who = `${humanizeName(members.find((system) => system.functions?.length)?.name || members[0].name)} holds these calls`;

  const sentences = [`${who} in this build, with ${census}.`];
  const verbs = verbPhrase(functions.map((fn) => fn.name));
  if (verbs) sentences.push(verbs);
  if (tables.length) {
    sentences.push(
      tables.length === 1
        ? "1 type used with these calls is listed below."
        : `${tables.length} types used with these calls are listed below.`,
    );
  }
  return sentences.join(" ");
}

function roleOf(system) {
  return system.functions?.length || system.events?.length ? "api" : "types";
}

function primaryOf(members) {
  return [...members].sort((a, b) => {
    const aCalls = (a.functions?.length || 0) + (a.events?.length || 0);
    const bCalls = (b.functions?.length || 0) + (b.events?.length || 0);
    if (bCalls !== aCalls) return bCalls - aCalls;
    if ((a.type === "System") !== (b.type === "System")) return a.type === "System" ? -1 : 1;
    return a.name.length - b.name.length || a.slug.localeCompare(b.slug);
  })[0];
}

export function buildSurfaces(systems) {
  const groups = new Map();
  for (const system of systems) {
    const key = familyKey(system.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(system);
  }

  const surfaces = [];
  for (const members of groups.values()) {
    const primary = primaryOf(members);
    const namespaces = [...new Set(members.map((system) => system.namespace).filter(Boolean))];
    const clientDocumentation = members.flatMap((system) => system.documentation || []);
    surfaces.push({
      id: primary.slug,
      name: humanizeName(familyKey(primary.name)),
      namespace: namespaces[0],
      namespaces,
      blurb: describeCalls(members),
      clientDocumentation: clientDocumentation.length ? clientDocumentation : undefined,
      primarySlug: primary.slug,
      members: members
        .slice()
        .sort((a, b) => roleOf(a).localeCompare(roleOf(b)) || a.name.localeCompare(b.name))
        .map((system) => ({
          slug: system.slug,
          name: system.name,
          role: roleOf(system),
        })),
      functions: members.reduce((sum, system) => sum + (system.functions?.length || 0), 0),
      events: members.reduce((sum, system) => sum + (system.events?.length || 0), 0),
      tables: members.reduce((sum, system) => sum + (system.tables?.length || 0), 0),
    });
  }

  surfaces.sort((a, b) => (a.namespace || a.name).localeCompare(b.namespace || b.name));
  return surfaces;
}
