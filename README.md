# Libram

Searchable World of Warcraft API reference. Each game build you ingest stays in the version menu, and the page explains every call from the client’s own documentation tables.

The name is the old word for a book of spells: a libram you can actually search.

The handoff for the current build, the data source, and the product plan is [PLAN.md](PLAN.md).

## What is already on this machine

Classic Beta `1.60.1.70374` has an `ExportInterfaceFiles` dump. Classic Era `1.15.9.70003` is installed and does not have a dump yet. Libram’s first snapshot is the beta export.

## Use it

```bash
cd /home/scribe/projects/work/libram
npm install
npm test
npm run ingest
npm run dev
```

Open the URL Vite prints. Search from the top bar (`/` focuses it). Pick a system on the left. The version menu is how you move between ingested builds.

## When the client patches

The game has to write the documentation itself. Libram cannot run that command.

1. In the Battle.net launcher, add `-console` to that client’s additional command line arguments.
2. In game, open the console (`~`, or `^` on a German keyboard) and run:

   ```
   ExportInterfaceFiles code
   ```

   The client writes `BlizzardInterfaceCode` next to its executable.
3. From this folder:

   ```bash
   npm run status
   npm run ingest
   ```

`npm run watch` checks `.build.info` every five minutes and raises a desktop notice when an installed build no longer matches the snapshot. Pass `--interval 120` to poll faster. The minimum is 15 seconds.

Ingest parses the export and updates `public/data`. It does not commit or push. One bad dump should not become the live site until you say so.

Useful flags:

```bash
npm run ingest -- --product wow_classic_beta
npm run status
node tools/libram.mjs ingest --from /path/to/Blizzard_APIDocumentationGenerated --product wow_classic --version 1.15.7.60000
```

If auto-detection misses the install, copy `libram.config.example.json` to `libram.config.json` and set `wowRoot`. `LIBRAM_WOW_ROOT` overrides that file.

## Versions

A snapshot id looks like `wow-classic-beta-1.60.1.70374`. Ingesting a newer build adds a menu entry and marks that build latest for its product. Older snapshots stay, so a signature that moved is still readable.

The browser cannot see the live client. “Latest” means the newest build you have ingested for that product. `npm run status` is the check against the installed game.

## Hosting

The app is a static Vite build. Links use the URL hash, so GitHub Pages and Vercel both work without a server rewrite.

GitHub Pages: push the repo, enable Pages with “GitHub Actions”, and the workflow in `.github/workflows/deploy.yml` publishes `dist`. Project sites are served from `/<repository-name>/`. A user site (`<user>.github.io`) needs a repository variable `BASE_PATH` set to `/`.

Vercel: import the repo and leave the build as `npm run build` with output `dist`. Do not set `BASE_PATH`.

## Layout

- `tools/libram.mjs` reads `.build.info`, finds the export, and writes versioned JSON.
- `scripts/lua-table.mjs` parses the documentation tables. They are data, not general Lua.
- `public/data/<build>/` is what the site loads: one index, plus one file per system.
- `src/` is the explorer.

Blizzard’s `Documentation` strings are shown as written. Calls without that prose get a description built from the arguments, returns, and restriction flags that are in the export. Flags Libram does not have a specific sentence for are listed by the name the client used.

The live SavedVariables websocket from the original sketch is a separate tool. This app is the reference, not a mirror of a running game.
