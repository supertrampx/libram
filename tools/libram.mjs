#!/usr/bin/env node
/**
 * Libram desktop tool.
 *
 *   npm run status   compare installed clients with ingested API builds
 *   npm run ingest   parse ExportInterfaceFiles output into public/data
 *   npm run watch    notify when a client build changes
 *   npm run changes  list calls added, removed, or given new arguments
 *   npm run examples publish the example folder; --seed drafts missing ones; --described drafts every call the client described
 *
 * ExportInterfaceFiles has to be run inside the game. This tool reads the
 * dump the client already wrote and the version in .build.info.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocumentationSource, LuaParseError } from "../scripts/lua-table.mjs";
import { indexSystem, normalizeDocument, slugify, symbolKind } from "../scripts/normalize.mjs";
import { buildSurfaces } from "../scripts/surfaces.mjs";
import { callRecord, describedCalls, diffSymbols, publishExamples, seedDescribed, seedMissing } from "../scripts/examples.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(projectRoot, "public", "data");
const manifestPath = path.join(dataRoot, "manifest.json");
const examplesRoot = path.join(projectRoot, "examples");
const examplesIndexPath = path.join(projectRoot, "public", "examples", "index.json");
const changesPath = path.join(examplesRoot, "changes.json");
const configPath = path.join(projectRoot, "libram.config.json");

const FOLDER_PRODUCT = {
  _retail_: "wow",
  _ptr_: "wowt",
  _xptr_: "wowx",
  _beta_: "wow_beta",
  _classic_: "wow_classic",
  _classic_era_: "wow_classic_era",
  _classic_beta_: "wow_classic_beta",
  _classic_ptr_: "wow_classic_ptr",
};

const PRODUCT_LABELS = {
  wow: "Retail",
  wowt: "Retail PTR",
  wowx: "Retail Beta",
  wow_beta: "Retail Beta",
  wow_classic: "Classic",
  wow_classic_era: "Classic Era",
  wow_classic_beta: "Classic Beta",
  wow_classic_ptr: "Classic PTR",
};

const DUMP_RELATIVE = path.join(
  "BlizzardInterfaceCode",
  "Interface",
  "AddOns",
  "Blizzard_APIDocumentationGenerated",
);
const LOOSE_DUMP_RELATIVE = path.join("Interface", "AddOns", "Blizzard_APIDocumentationGenerated");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function productLabel(product) {
  return PRODUCT_LABELS[product] || product;
}

function buildNumber(version) {
  const parts = String(version).split(".");
  const last = Number(parts[parts.length - 1]);
  return Number.isFinite(last) ? last : 0;
}

function wowRoot() {
  if (process.env.LIBRAM_WOW_ROOT) return process.env.LIBRAM_WOW_ROOT;
  const config = readJson(configPath, null);
  if (config?.wowRoot) return config.wowRoot;
  const candidates = [
    "/mnt/c/Program Files (x86)/World of Warcraft",
    "/mnt/c/Program Files/World of Warcraft",
    "C:\\Program Files (x86)\\World of Warcraft",
    "C:\\Program Files\\World of Warcraft",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function parseBuildInfo(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = lines[0].split("|").map((cell) => cell.split("!")[0].trim());
  const byProduct = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split("|");
    const row = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? "";
    });
    if (!row.Product || !row.Version) continue;
    if (row.Active && row.Active !== "1") continue;
    const current = byProduct.get(row.Product);
    if (!current || buildNumber(row.Version) >= buildNumber(current.Version)) {
      byProduct.set(row.Product, row);
    }
  }
  return [...byProduct.values()];
}

function readFlavor(dir) {
  const file = path.join(dir, ".flavor.info");
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !line.includes("!")) || null;
}

function installs(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, entry.name);
      const product = readFlavor(dir) || FOLDER_PRODUCT[entry.name] || null;
      return { folder: entry.name, dir, product };
    })
    .filter((install) => install.product);
}

function dumpDirectory(installDir) {
  const candidates = [path.join(installDir, DUMP_RELATIVE), path.join(installDir, LOOSE_DUMP_RELATIVE)];
  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  existing.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return existing[0] || null;
}

function loadManifest() {
  return readJson(manifestPath, { updated: null, versions: [] });
}

function latestFor(versions, product) {
  return versions
    .filter((version) => version.product === product)
    .sort((a, b) => buildNumber(b.version) - buildNumber(a.version))[0] || null;
}

function markLatest(versions) {
  const latest = new Set();
  for (const product of new Set(versions.map((version) => version.product))) {
    const best = latestFor(versions, product);
    if (best) latest.add(best.id);
  }
  return versions.map((version) => ({ ...version, latest: latest.has(version.id) }));
}

function clientState(root) {
  const infoFile = path.join(root, ".build.info");
  if (!fs.existsSync(root)) {
    return { root, error: `WoW folder not found: ${root}` };
  }
  if (!fs.existsSync(infoFile)) {
    return { root, error: `No .build.info in ${root}` };
  }
  const products = parseBuildInfo(fs.readFileSync(infoFile, "utf8"));
  const folders = installs(root);
  const byProduct = new Map(folders.map((folder) => [folder.product, folder]));
  const manifest = loadManifest();
  const rows = products.map((product) => {
    const install = byProduct.get(product.Product) || null;
    const dump = install ? dumpDirectory(install.dir) : null;
    const ingested = latestFor(manifest.versions, product.Product);
    const installed = product.Version;
    let state = "up to date";
    if (!install) state = "install folder missing";
    else if (!dump) state = "export needed";
    else if (!ingested) state = "ingest needed";
    else if (ingested.version !== installed) state = "client updated";
    else if (fs.statSync(dump).mtimeMs > Date.parse(ingested.ingestedAt)) state = "export waiting";
    return {
      product: product.Product,
      label: productLabel(product.Product),
      installed,
      ingested: ingested?.version || null,
      ingestedAt: ingested?.ingestedAt || null,
      dump,
      folder: install?.dir || null,
      state,
    };
  });
  return { root, rows, manifest };
}

function pad(value, width) {
  const text = value == null || value === "" ? "—" : String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printStatus(report) {
  console.log("Libram");
  console.log(`WoW folder: ${report.root}`);
  if (report.error) {
    console.log(report.error);
    return 1;
  }
  console.log("");
  console.log(
    `${pad("Product", 16)} ${pad("Installed", 16)} ${pad("Ingested", 16)} ${pad("Status", 24)}`,
  );
  for (const row of report.rows) {
    console.log(`${pad(row.label, 16)} ${pad(row.installed, 16)} ${pad(row.ingested, 16)} ${row.state}`);
  }
  console.log("");
  const pending = report.rows.filter((row) => row.state !== "up to date");
  if (!pending.length) {
    console.log("Ingested API data matches the installed clients.");
    return 0;
  }
  for (const row of pending) console.log(instruction(row));
  return 2;
}

function instruction(row) {
  if (row.state === "install folder missing") {
    return `${row.label} ${row.installed} is in .build.info, but no game folder was found.`;
  }
  if (row.state === "export needed") {
    return [
      `${row.label} ${row.installed} has no API export.`,
      "  1. Add -console to that client's extra launch arguments.",
      "  2. In game, open the console (~, or ^ on a German keyboard) and run:",
      "       ExportInterfaceFiles code",
      `  3. npm run ingest -- --product ${row.product}`,
    ].join("\n");
  }
  if (row.state === "ingest needed" || row.state === "export waiting") {
    return `${row.label} has an export that is not in Libram yet.\n  npm run ingest -- --product ${row.product}`;
  }
  return [
    `${row.label} updated from ${row.ingested} to ${row.installed}.`,
    "The site still has the older API. Refresh it:",
    "  1. Launch that client with -console.",
    "  2. In the console, run: ExportInterfaceFiles code",
    `  3. npm run ingest -- --product ${row.product}`,
  ].join("\n");
}

function notify(title, message) {
  const isWsl = Boolean(process.env.WSL_DISTRO_NAME);
  if (process.platform === "win32" || isWsl) {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.BalloonTipTitle = ${powershellString(title)}
$n.BalloonTipText = ${powershellString(message)}
$n.ShowBalloonTip(12000)
Start-Sleep -Seconds 8
$n.Dispose()
`;
    const exe = process.platform === "win32" ? "powershell" : "powershell.exe";
    const child = spawn(exe, ["-NoProfile", "-Command", ps], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return;
  }
  const child = spawn("notify-send", [title, message], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

function powershellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function readDump(dir) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".lua")).sort();
  const systems = [];
  const usedSlugs = new Map();
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    let parsed;
    try {
      parsed = parseDocumentationSource(source);
    } catch (error) {
      if (error instanceof LuaParseError) {
        throw new Error(`${file}:${error.line}:${error.column} ${error.message}`);
      }
      throw new Error(`${file}: ${error.message}`);
    }
    const system = normalizeDocument(parsed.value, parsed.localName || path.basename(file, ".lua"));
    const base = system.slug;
    const seen = usedSlugs.get(base) || 0;
    usedSlugs.set(base, seen + 1);
    if (seen > 0) system.slug = `${base}-${seen + 1}`;
    system.file = file;
    systems.push(system);
  }
  systems.sort((a, b) => a.name.localeCompare(b.name));
  return systems;
}

function buildIndex(systems) {
  const symbols = [];
  const types = {};
  const summaries = systems.map((system) => ({
    slug: system.slug,
    name: system.name,
    namespace: system.namespace,
    type: system.type,
    environment: system.environment,
    functions: system.functions.length,
    events: system.events.length,
    tables: system.tables.length,
  }));
  for (const system of systems) {
    for (const symbol of indexSystem(system)) symbols.push(symbol);
    for (const table of system.tables) {
      const ref = { systemSlug: system.slug, kind: symbolKind(table.kind), name: table.name };
      if (!types[table.name]) types[table.name] = [];
      types[table.name].push(ref);
    }
  }
  symbols.sort((a, b) => a.qualified.localeCompare(b.qualified) || a.name.localeCompare(b.name));
  return { systems: summaries, symbols, types, surfaces: buildSurfaces(systems) };
}

function countsOf(systems) {
  return {
    systems: systems.length,
    functions: systems.reduce((sum, system) => sum + system.functions.length, 0),
    events: systems.reduce((sum, system) => sum + system.events.length, 0),
    tables: systems.reduce((sum, system) => sum + system.tables.length, 0),
  };
}

function writeTextAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function writeVersion(id, systems, index) {
  const dir = path.join(dataRoot, id);
  const staging = path.join(dataRoot, `.incoming-${id}`);
  const backup = path.join(dataRoot, `.backup-${id}`);
  fs.rmSync(staging, { recursive: true, force: true });
  const systemDir = path.join(staging, "systems");
  fs.mkdirSync(systemDir, { recursive: true });
  for (const system of systems) {
    const { file, ...publicSystem } = system;
    fs.writeFileSync(path.join(systemDir, `${system.slug}.json`), JSON.stringify(publicSystem));
    void file;
  }
  fs.writeFileSync(path.join(staging, "index.json"), JSON.stringify(index));
  fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(dir)) fs.renameSync(dir, backup);
  try {
    fs.renameSync(staging, dir);
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(dir)) fs.renameSync(backup, dir);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
}

function ingestOne({ product, version, label, dump }) {
  console.log(`Reading ${dump}`);
  const systems = readDump(dump);
  if (!systems.length) fail(`No documentation files in ${dump}`);
  const index = buildIndex(systems);
  const counts = countsOf(systems);
  const id = `${slugify(product)}-${version}`;
  writeVersion(id, systems, index);
  const entry = {
    id,
    product,
    label,
    version,
    build: String(buildNumber(version)),
    ingestedAt: new Date().toISOString(),
    counts,
  };
  const manifest = loadManifest();
  const versions = markLatest([...manifest.versions.filter((item) => item.id !== id), entry]);
  const next = { updated: entry.ingestedAt, versions };
  fs.mkdirSync(dataRoot, { recursive: true });
  writeTextAtomic(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `Ingested ${label} ${version}: ${counts.systems} systems, ${counts.functions} functions, ${counts.events} events, ${counts.tables} tables.`,
  );
  console.log(`Wrote public/data/${id}`);
  console.log("Examples and notes were left in place.");
}

function resolveIngest(options) {
  if (options.from) {
    const product = options.product;
    const version = options.version;
    if (!product || !version) fail("--from requires --product and --version");
    if (!fs.existsSync(options.from)) fail(`Dump folder not found: ${options.from}`);
    return [{ product, version, label: productLabel(product), dump: options.from }];
  }
  const report = clientState(wowRoot());
  if (report.error) fail(report.error);
  let rows = report.rows.filter((row) => row.dump);
  if (options.product) {
    rows = rows.filter((row) => row.product === options.product);
    if (!rows.length) {
      const known = report.rows.find((row) => row.product === options.product);
      if (!known) fail(`No installed product named ${options.product}`);
      fail(`${known.label} has no export yet.\n${instruction(known)}`);
    }
  }
  if (!rows.length) fail("No API exports found. Run ExportInterfaceFiles code in the client first.");
  return rows.map((row) => ({
    product: row.product,
    version: row.installed,
    label: row.label,
    dump: row.dump,
  }));
}

async function watch(intervalSeconds) {
  let previous = "";
  const tick = () => {
    const report = clientState(wowRoot());
    const code = printStatus(report);
    const summary = report.error
      ? report.error
      : report.rows
          .filter((row) => row.state !== "up to date")
          .map((row) => `${row.label}: ${row.state} (${row.installed})`)
          .join("\n");
    if (summary && summary !== previous) notify("Libram", summary);
    previous = summary;
    if (code === 1) process.exitCode = 1;
  };
  tick();
  const timer = setInterval(tick, intervalSeconds * 1000);
  await new Promise((resolve) => {
    process.on("SIGINT", () => {
      clearInterval(timer);
      console.log("\nStopped.");
      resolve();
    });
  });
}

function snapshotPair(product) {
  const manifest = loadManifest();
  let versions = manifest.versions.slice();
  if (product) versions = versions.filter((item) => item.product === product);
  const products = [...new Set(versions.map((item) => item.product))];
  if (!product && products.length > 1) fail("Pass --product when more than one client is ingested.");
  versions.sort((a, b) => buildNumber(b.version) - buildNumber(a.version) || b.ingestedAt.localeCompare(a.ingestedAt));
  return { current: versions[0] || null, previous: versions[1] || null, product: versions[0]?.product || product };
}

function loadSymbols(id) {
  const file = path.join(dataRoot, id, "index.json");
  if (!fs.existsSync(file)) fail(`Missing snapshot index: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8")).symbols || [];
}

function briefCall(symbol) {
  return {
    kind: symbol.kind,
    qualified: symbol.qualified,
    name: symbol.name,
    systemSlug: symbol.systemSlug,
  };
}

function reportChanges(product) {
  const pair = snapshotPair(product);
  if (!pair.current) fail("No ingested build to compare.");
  const diff = pair.previous
    ? diffSymbols(loadSymbols(pair.previous.id), loadSymbols(pair.current.id))
    : { added: [], removed: [], changed: [] };
  const report = {
    product: pair.product,
    current: pair.current.id,
    previous: pair.previous?.id || null,
    added: diff.added.map(briefCall),
    removed: diff.removed.map(briefCall),
    changed: diff.changed.map((item) => ({ ...briefCall(item), before: item.before, after: item.after })),
  };
  fs.mkdirSync(examplesRoot, { recursive: true });
  writeTextAtomic(changesPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!pair.previous) {
    console.log(`${pair.current.label} ${pair.current.version} is the only ingested build.`);
    console.log("The next ingest of a newer build will list calls that appeared, disappeared, or changed arguments.");
  } else {
    console.log(`Compared ${pair.previous.version} → ${pair.current.version}`);
    console.log(`${report.added.length} added, ${report.removed.length} removed, ${report.changed.length} changed arguments.`);
    for (const item of report.added) console.log(`  added    ${item.qualified}`);
    for (const item of report.removed) console.log(`  removed  ${item.qualified}`);
    for (const item of report.changed) console.log(`  changed  ${item.qualified}`);
  }
  console.log(`Wrote ${path.relative(projectRoot, changesPath)}`);
}

function hydrateCall(versionId, entry) {
  const file = path.join(dataRoot, versionId, "systems", `${entry.systemSlug}.json`);
  if (!fs.existsSync(file)) return null;
  const system = JSON.parse(fs.readFileSync(file, "utf8"));
  return callRecord(system, entry.kind, entry.name);
}

function findCall(versionId, kind, qualified) {
  const symbol = loadSymbols(versionId).find((item) => item.kind === kind && item.qualified === qualified);
  if (!symbol) fail(`No ${kind} named ${qualified} in ${versionId}`);
  const call = hydrateCall(versionId, symbol);
  if (!call) fail(`Could not read ${qualified} from ${symbol.systemSlug}`);
  return call;
}

function examplesCommand(options) {
  const pair = snapshotPair(options.product);
  if (!pair.current) fail("No ingested build to attach examples to.");
  const now = new Date().toISOString();
  if (options.for) {
    const [kind, ...rest] = String(options.for).split(":");
    const qualified = rest.join(":");
    if (!kind || !qualified) fail("--for expects kind:QualifiedName, for example function:GetMoney");
    const created = seedMissing(examplesRoot, [findCall(pair.current.id, kind, qualified)], { versionId: pair.current.id, now });
    if (created.kept.length) console.log(`Kept the existing example for ${created.kept[0]}`);
    if (created.created.length) console.log(`Drafted an example for ${created.created[0]}`);
  }
  if (options.described) {
    const dir = path.join(dataRoot, pair.current.id, "systems");
    const systems = fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    const calls = describedCalls(systems);
    const seeded = seedDescribed(examplesRoot, calls, { versionId: pair.current.id, now });
    console.log(`${calls.length} calls have a client description.`);
    console.log(`Drafted ${seeded.created.length}. Updated ${seeded.updated.length} old signature drafts. Kept ${seeded.kept.length}.`);
  }
  if (options.seed) {
    if (!fs.existsSync(changesPath)) fail("Run npm run changes first.");
    const report = JSON.parse(fs.readFileSync(changesPath, "utf8"));
    if (!report.previous) {
      console.log("No older build to seed from. Existing examples were left as they are.");
    } else {
      const wanted = [...(report.added || []), ...(report.changed || [])];
      const calls = wanted.map((entry) => hydrateCall(report.current, entry)).filter(Boolean);
      const seeded = seedMissing(examplesRoot, calls, { versionId: report.current, now });
      console.log(`Drafted ${seeded.created.length} example${seeded.created.length === 1 ? "" : "s"}.`);
      console.log(`Kept ${seeded.kept.length} existing example${seeded.kept.length === 1 ? "" : "s"}.`);
      for (const name of seeded.created) console.log(`  drafted  ${name}`);
      for (const name of seeded.kept) console.log(`  kept     ${name}`);
    }
  }
  const index = publishExamples(examplesRoot, examplesIndexPath, now);
  console.log(`Published ${Object.keys(index.examples).length} examples to public/examples/index.json`);
}

const options = parseArgs(process.argv.slice(2));
const command = options._[0] || "status";

if (command === "status") {
  process.exitCode = printStatus(clientState(wowRoot()));
} else if (command === "ingest") {
  const jobs = resolveIngest(options);
  const products = new Set();
  for (const job of jobs) {
    ingestOne(job);
    products.add(job.product);
  }
  for (const product of products) reportChanges(product);
} else if (command === "watch") {
  const interval = Number(options.interval || 300);
  if (!Number.isFinite(interval) || interval < 15) fail("--interval must be at least 15 seconds");
  await watch(interval);
} else if (command === "changes") {
  reportChanges(options.product);
} else if (command === "examples") {
  examplesCommand(options);
} else {
  fail("Usage: node tools/libram.mjs <status|ingest|watch|changes|examples> [--product name] [--for kind:Name] [--seed] [--described]");
}
