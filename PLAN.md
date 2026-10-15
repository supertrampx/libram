# Libram — current state and plan

Handoff written 14 October 2026. Open this repository at `/home/scribe/projects/work/libram`. When this file and the code disagree, the code wins, then correct this file.

TekGoblin stays in `/home/scribe/projects/work/goldspy`. This file does not move that addon. It records how Libram relates to it.

## Where the API data came from

The Classic Beta export was already on disk. Nothing in this session launched World of Warcraft or typed `ExportInterfaceFiles`.

The setup conversation included a sample path under `World of Warcraft`. From WSL that install is visible at `/mnt/c/Program Files (x86)/World of Warcraft`. `.build.info` in that folder listed two active products:

| Product | Version | Export on disk |
| --- | --- | --- |
| `wow_classic_beta` | 1.60.1.70374 | Yes |
| `wow_classic_era` | 1.15.9.70003 | No |

The only export present was:

`/mnt/c/Program Files (x86)/World of Warcraft/_classic_beta_/BlizzardInterfaceCode/Interface/AddOns/Blizzard_APIDocumentationGenerated`

That is the Windows Classic Beta client (folder `_classic_beta_`, flavor `wow_classic_beta`, Interface 16001). It is the same client TekGoblin targets. The folder is the result of `ExportInterfaceFiles code` run in that client before this session. Libram read those 640 Lua files and parsed them. It did not copy the raw Lua into git.

Ingest time: `2026-10-14T19:17:29Z`. Snapshot id: `wow-classic-beta-1.60.1.70374`.

Counts from that parse: 640 systems, 6,604 functions, 1,810 events, 1,753 tables.

If the client has been exported again since that timestamp, run `npm run ingest` once. A second export of the same build replaces this snapshot. It does not delete older builds.

## What is built

Libram is a static site that browses one ingested client build at a time.

- Version menu. Each ingest is kept as `product + build`. "Latest" means the newest ingested build for that product, not a live check of the running game.
- Search across functions, events, structures, enums, and constants. Exact and prefix matches rank first. A short typo falls through to fuzzy search.
- A page for each symbol: official `Documentation` text when the client wrote it, a plain-language reading of the signature when it did not, arguments, returns, and restriction flags.
- API surfaces. A namespace and the enum or constant files beside it are one entry in `index.json` `surfaces`. The page leads with what that API is in this build, then lists its calls underneath. The sentence is read from the call names. It is not a client description unless the export wrote one. Calls and APIs with no client description stay hidden. Show unknown in the sidebar lists them, and the browser remembers that choice. A later ingest that adds a client description moves that call into the main list on its own. The build does not say which calls are unused.
- Call examples live in `examples/`, outside the build snapshot. Each function and event page has an Example panel. A new ingest does not replace those files.
- Type names that exist as tables in the same build are links.
- Hash URLs, so GitHub Pages and Vercel can host the build without a rewrite rule.
- Desktop tool, `tools/libram.mjs`. `npm run status` compares `.build.info` with the manifest. `npm run ingest` parses an export into `public/data`. `npm run watch` polls and can raise a Windows notification when an installed build moves. `npm run changes` lists calls that appeared, disappeared, or changed arguments since the previous snapshot. `npm run examples -- --seed` drafts missing examples for that list and leaves existing ones alone. `npm run examples -- --described` drafts a possible call for every function and event the client described. A file whose origin is `note` is left alone. Ingest does not commit, push, or edit `examples/`.

A local preview was served at `http://127.0.0.1:4173/` during the setup session. Start a fresh one with `npm run dev` or `npm run preview`.

Checked in the browser against the ingested snapshot: search, `string.ltrim`, the link from `C_AuctionHouse.GetAuctionInfoByID` to `AuctionInfo`, the `AccountData` enum, the version menu, and the phone layout.

## Repository map

| Path | Role |
| --- | --- |
| `src/` | React UI. Vite, TypeScript, Tailwind. |
| `../libram-guide/` | Separate repository for the Lua guide. Antora component at its root. Versions come from `antora.yml` and from git branches named `v*`. |
| `ui/` | Antora default UI, recolored to the API site. This stays with the API site. |
| `antora-playbook.yml` | Builds `../libram-guide` into the API site at `/guide/`. |
| `scripts/lua-table.mjs` | Parser for the documentation tables. |
| `scripts/normalize.mjs` | Turns those tables into the site schema. |
| `scripts/selftest.mjs` | Parser fixture. `npm test`. |
| `tools/libram.mjs` | Status, ingest, and watch. |
| `public/data/manifest.json` | Version list. |
| `public/data/<id>/` | Index plus one JSON file per system. About 7.7 MB for the current beta snapshot. |
| `.github/workflows/deploy.yml` | GitHub Pages build. Set repository variable `BASE_PATH` to `/` for a user site. Leave it unset on Vercel. |
| `libram.config.example.json` | Optional `wowRoot` override. Copy to `libram.config.json` (gitignored). |

The API site and the Lua guide are separate git repositories on the supertrampx account: `libram` and `libram-guide`. The guide is checked out beside this repository. Version branches named `v*` belong to the guide repository. `node_modules` and `dist` stay untracked.

## Product plan

Two products, one client line.

**TekGoblin** is the in-game addon. It stays free, complete, and offline. Scanning, the tape, Buy now, and Sell now do not require an account, a subscription, or Libram. The addon does not open a network connection. That rule stands until it is changed on purpose in the goldspy tree.

**Libram** is the out-of-game API reference for people writing addons against a specific build. The first public slice is the explorer that is already running locally: searchable, versioned, and explained. Hosting is GitHub Pages or Vercel after a repository exists.

**Market insights** are a third piece, and they are not started. The shape, if we build it:

1. The player runs a desktop app they installed themselves. TekGoblin never uploads.
2. The app reads the tape the addon already wrote: item id, listing count, quantity, cheapest unit copper, quantity at that price, realm, and scan time.
3. Upload is opt-in, per machine, and revocable. The default is off.
4. The upload follows the addon’s current privacy line: no seller names, no bidder names, no gold balances, no character names of other players.
5. The free addon remains useful with no network and no paid feed. A paid view must not be required to scan, buy, or post.

Do not start the uploader until the reference and the ingest loop are boringly reliable.

## Blizzard rules we will follow

The written UI Add-On Development Policy is the constraint, not community habit.

- The addon is free of charge. No premium addon, no paid feature inside the addon, no charge to download it, and no charge required to use it.
- The addon shows no advertisements and does not ask for donations in game.
- Addon code stays visible.
- One hardware click remains required for every buy, post, and cancel. TekGoblin does not buy, post, or cancel by itself.
- No memory readers, packet sniffers, or unattended play.

Policy point 1 also says a developer may not charge for services related to the add-on. A paid market site fed by TekGoblin sits on that sentence. Sites in the wider community have sold out-of-game data for years, and enforcement has been uneven. That history is not permission. Before any price exists, write to `WoWUI@blizzard.com` with the design: free addon, separate opt-in desktop uploader, paid analytics that are not required to play or to use the addon. Ship the charge only after a clear answer.

Libram’s pages quote documentation the client wrote. We can arrange and explain it. We do not claim that text as ours. The public site should say the descriptions come from the World of Warcraft client.

The official Blizzard Developer API (the community web API behind an API key) is a different contract. Its terms forbid using that Data for marketing or monetization, and forbid selling it. Market insights, if built, come from scans a player chose to upload, not from that API.

Players in the EU mean a real privacy notice: what is uploaded, why, how long it is kept, and how to delete it. Collect the minimum the tape already stores.

## Next work, in order

1. Done on 14 October 2026. `npm run dev` serves Classic Beta `1.60.1.70374`, and `npm run status` says that build matches the installed client. The export folder is older than the 19:17 UTC ingest, so it was not parsed again.
2. The attribution line is on the page. A footer says the API descriptions are quoted from the World of Warcraft client, and each quoted block repeats that. A sentence Libram writes from the signature is labeled as such. The API site and the Lua guide publish from the supertrampx GitHub account. GitHub Pages is wired in `.github/workflows/deploy.yml` and checks out `libram-guide` while it builds.
3. Export Classic Era the same way, then `npm run ingest -- --product wow_classic_era`, so the version menu has a second client.
4. Keep the ingest loop: `npm run watch` on a machine that can see `.build.info`, export in the client after a patch, ingest, then commit the new `public/data` snapshot on purpose.
5. Only after that, design the opt-in desktop uploader as its own program. The addon stays offline. Ask Blizzard before any fee.

## Commands

```bash
cd /home/scribe/projects/work/libram
npm install
npm test
npm run status
npm run dev
```

After a fresh in-game export:

```bash
npm run ingest
npm run changes
npm run examples -- --seed
```

`npm run changes` compares the two newest ingested builds of a client and writes `examples/changes.json`. `npm run examples -- --seed` drafts a signature example for each added or changed call that does not already have one. `npm run examples -- --described` drafts a possible Lua call for every function and event that has a client description, and refreshes an old one-line signature draft. An example saved with origin `note` is left in place. The pages read `public/examples/index.json`, which `npm run examples` publishes from the `examples/` folder. Ingest does not write that folder. Lua on a call page is colored. The Lua item in the top nav opens `/guide/`, the Antora guide built into the API site. `npm run dev` and `npm run build` build that guide when its sources are newer than the last build. The guide repository is `../libram-guide`. Each client line is a version in that repository's `antora.yml`, and a kept line is a git branch named `v*` in the guide repository. The playbook reads that repository's working tree plus those branches. Interface number, build, and client folder are AsciiDoc attributes from that file, so the prose updates with the version. `npm run docs:import-lua` saves the Lua 5.1 reference manual into `../libram-guide/lua-5.1`. The guide's auction chapters use the calls in the current snapshot. Search in the guide is Lunr, built with the site.
