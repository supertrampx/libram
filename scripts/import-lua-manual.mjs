import fs from "node:fs";
import path from "node:path";

const guide = process.env.LIBRAM_GUIDE
  ? path.resolve(process.env.LIBRAM_GUIDE)
  : path.resolve(import.meta.dirname, "..", "..", "libram-guide");
const root = path.join(guide, "lua-5.1");
const pages = [
  ["manual.html", "https://www.lua.org/manual/5.1/manual.html"],
  ["contents.html", "https://www.lua.org/manual/5.1/contents.html"],
  ["license.html", "https://www.lua.org/license.html"],
];
const assets = [
  ["lua.css", "https://www.lua.org/lua.css"],
  ["manual.css", "https://www.lua.org/manual/manual.css"],
  ["logo.gif", "https://www.lua.org/images/logo.gif"],
];

fs.mkdirSync(root, { recursive: true });

function localize(html) {
  return html
    .replaceAll("../../lua.css", "lua.css")
    .replaceAll("../manual.css", "manual.css")
    .replaceAll("../index.css", "manual.css")
    .replaceAll('href="lua.css"', 'href="lua.css"')
    .replaceAll("../../images/logo.gif", "logo.gif")
    .replaceAll("../../home.html", "https://www.lua.org/");
}

for (const [name, url] of pages) {
  const response = await fetch(url, { headers: { "user-agent": "libram-docs" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const text = localize(await response.text());
  if (!text.trim()) throw new Error(`${url} was empty`);
  fs.writeFileSync(path.join(root, name), text);
  console.log(`saved ${name} (${text.length} bytes)`);
}

for (const [name, url] of assets) {
  const response = await fetch(url, { headers: { "user-agent": "libram-docs" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`${url} was empty`);
  fs.writeFileSync(path.join(root, name), bytes);
  console.log(`saved ${name} (${bytes.length} bytes)`);
}

const stale = path.join(root, "readme.html");
if (fs.existsSync(stale)) fs.unlinkSync(stale);

fs.writeFileSync(
  path.join(root, "NOTICE.txt"),
  [
    "The HTML files in this folder are the Lua 5.1 reference manual and the Lua license.",
    "They are published by Lua.org, PUC-Rio, and are freely available under the Lua license.",
    "Source: https://www.lua.org/manual/5.1/",
    "License: https://www.lua.org/license.html",
    "",
  ].join("\n"),
);
