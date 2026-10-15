import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
};

const SKIP = new Set(["node_modules", "build", ".cache", ".git"]);

function newest(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let max = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    max = Math.max(max, newest(path.join(target, entry.name)));
  }
  return max;
}

function siteUrlFor(siteBase) {
  const origin = (process.env.SITE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
  const prefix = !siteBase || siteBase === "/" ? "" : siteBase.replace(/\/$/, "");
  return `${origin}${prefix}`;
}

function guideDir(root) {
  if (process.env.LIBRAM_GUIDE) return path.resolve(process.env.LIBRAM_GUIDE);
  const sibling = path.resolve(root, "..", "libram-guide");
  if (fs.existsSync(path.join(sibling, "antora.yml"))) return sibling;
  return path.join(root, ".libram-guide");
}

function branchList(dir) {
  let name = "";
  try {
    name = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    name = "";
  }
  // A v* checkout is already HEAD. Listing that branch again would publish the same version twice.
  if (name.startsWith("v")) return "[HEAD]";
  return "[HEAD, v*]";
}

export function libramGuide(siteBase) {
  const root = process.cwd();
  const guide = guideDir(root);
  const publicDir = path.join(root, "public");
  const marker = path.join(publicDir, "guide", ".guide-base");
  let pending = null;

  function stale(siteUrl) {
    if (!fs.existsSync(path.join(publicDir, "guide", "index.html"))) return true;
    if (!fs.existsSync(marker) || fs.readFileSync(marker, "utf8") !== siteUrl) return true;
    const built = fs.statSync(path.join(publicDir, "guide", "index.html")).mtimeMs;
    return [guide, path.join(root, "ui"), path.join(root, "antora-playbook.yml")].some((target) => newest(target) > built);
  }

  function zipUi() {
    const uiDir = path.join(root, "ui");
    const dest = path.join(uiDir, "build", "ui-bundle.zip");
    const stamp = path.join(uiDir, "build", ".zip-stamp");
    if (fs.existsSync(dest) && fs.existsSync(stamp) && Number(fs.readFileSync(stamp, "utf8")) >= newest(uiDir)) {
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    execFileSync("zip", ["-qr", dest, ".", "-x", "build/*", "-x", "build/**"], { cwd: uiDir });
    fs.writeFileSync(stamp, String(Date.now()));
  }

  function playbook(siteUrl) {
    const prefix = new URL(siteUrl).pathname.replace(/\/$/, "");
    const manual = `${prefix}/guide/lua-5.1`;
    let text = fs.readFileSync(path.join(root, "antora-playbook.yml"), "utf8");
    text = text.replace(/^  url: .*$/m, `  url: ${siteUrl}`);
    text = text.replace(/^      branches: .*$/m, `      branches: ${branchList(guide)}`);
    text = text.replace(/^    - url: .*$/m, `    - url: ${guide}`);
    text = text.replace(/^    url: \.\/ui\/build\/ui-bundle\.zip$/m, `    url: ${path.join(root, "ui/build/ui-bundle.zip")}`);
    text = text.replace(/^  dir: \.cache\/antora-site$/m, `  dir: ${path.join(root, ".cache/antora-site")}`);
    text = text.replace(/^  cache_dir: \.cache\/antora$/m, `  cache_dir: ${path.join(root, ".cache/antora")}`);
    text = text.replace(/^    lua-manual: .*$/m, `    lua-manual: ${manual}/manual.html`);
    text = text.replace(/^    lua-contents: .*$/m, `    lua-contents: ${manual}/contents.html`);
    text = text.replace(/^    lua-license: .*$/m, `    lua-license: ${manual}/license.html`);
    const dest = path.join(root, ".cache", "antora-playbook.yml");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    return dest;
  }

  function publish(siteUrl) {
    const pathname = new URL(siteUrl).pathname.replace(/\/$/, "");
    const produced = pathname ? path.join(root, ".cache", "antora-site", pathname) : path.join(root, ".cache", "antora-site");
    if (!fs.existsSync(produced)) {
      throw new Error(`Antora did not write ${produced}`);
    }
    for (const name of fs.readdirSync(produced)) {
      if (name === "data" || name === "index.html" || name === "404.html") continue;
      const dest = path.join(publicDir, name);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(path.join(produced, name), dest, { recursive: true });
    }
    const manualDest = path.join(publicDir, "guide", "lua-5.1");
    fs.cpSync(path.join(guide, "lua-5.1"), manualDest, { recursive: true });
    const rootIndex = path.join(produced, "index.html");
    const redirect = fs.existsSync(rootIndex) ? fs.readFileSync(rootIndex, "utf8") : "";
    const target = redirect.match(/url=guide\/([^"'\s]+)/)?.[1] || "1.60.1/index.html";
    fs.writeFileSync(
      path.join(publicDir, "guide", "index.html"),
      `<!DOCTYPE html>
<meta charset="utf-8">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=${target}">
<script>location.replace("${target}")</script>
<title>Libram</title>
`,
    );
    fs.writeFileSync(marker, siteUrl);
  }

  function build() {
    const siteUrl = siteUrlFor(siteBase);
    if (!stale(siteUrl)) return Promise.resolve();
    if (pending) return pending;
    const bin = path.join(root, "node_modules", ".bin", "antora");
    if (!fs.existsSync(bin)) {
      return Promise.reject(new Error("Antora is not installed. Run npm install."));
    }
    if (!fs.existsSync(path.join(guide, "antora.yml")) || !fs.existsSync(path.join(guide, ".git"))) {
      return Promise.reject(new Error(`Antora reads the Lua guide from its own git repository at ${guide}.`));
    }
    zipUi();
    const file = playbook(siteUrl);
    console.log(`Building the Lua guide at ${new URL(siteUrl).pathname || "/"}guide/`);
    pending = new Promise((resolve, reject) => {
      const child = spawn(bin, [file], { cwd: root, stdio: "inherit" });
      child.on("exit", (code) => {
        pending = null;
        if (code !== 0) {
          reject(new Error(`Lua guide build exited ${code}`));
          return;
        }
        try {
          publish(siteUrl);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    return pending;
  }

  const urlPrefix = !siteBase || siteBase === "/" ? "" : siteBase.replace(/\/$/, "");

  function serveGuide(req, res, next) {
    const raw = decodeURIComponent((req.url || "").split("?")[0]);
    const mounts = [
      [`${urlPrefix}/guide`, path.join(publicDir, "guide")],
      [`${urlPrefix}/_`, path.join(publicDir, "_")],
    ];
    let file = "";
    for (const [prefix, dir] of mounts) {
      if (raw === prefix || raw.startsWith(`${prefix}/`)) {
        const rel = raw.slice(prefix.length) || "/";
        file = path.normalize(path.join(dir, rel));
        if (!file.startsWith(dir)) {
          next();
          return;
        }
        break;
      }
    }
    if (!file && raw === `${urlPrefix}/search-index.js`) file = path.join(publicDir, "search-index.js");
    if (!file) {
      next();
      return;
    }
    const candidates = [file, `${file}.html`, path.join(file, "index.html")];
    const hit = candidates.find((item) => {
      try {
        return fs.statSync(item).isFile();
      } catch {
        return false;
      }
    });
    if (!hit) {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", TYPES[path.extname(hit)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(hit).pipe(res);
  }

  function watchGuide(server) {
    const watch = [guide, path.join(root, "ui"), path.join(root, "antora-playbook.yml")];
    server.watcher.add(watch);
    server.watcher.on("change", (changed) => {
      const file = path.normalize(changed);
      if (!watch.some((dir) => file === dir || file.startsWith(`${dir}${path.sep}`))) return;
      if (file.includes(`${path.sep}ui${path.sep}build${path.sep}`)) return;
      build()
        .then(() => server.ws.send({ type: "full-reload" }))
        .catch((error) => server.config.logger.error(error.message));
    });
  }

  return [
    {
      name: "libram-guide-build",
      apply: "build",
      async buildStart() {
        await build();
      },
    },
    {
      name: "libram-guide-serve",
      apply: "serve",
      async configureServer(server) {
        await build();
        server.middlewares.use(serveGuide);
        watchGuide(server);
      },
    },
    {
      name: "libram-guide-preview",
      configurePreviewServer(server) {
        server.middlewares.use(serveGuide);
      },
    },
  ];
}
