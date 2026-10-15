import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocumentationSource } from "./lua-table.mjs";
import { normalizeDocument } from "./normalize.mjs";
import { buildSurfaces, familyKey } from "./surfaces.mjs";
import { describedCalls, diffSymbols, draftLua, readExamples, seedDescribed, seedMissing, usageLua } from "./examples.mjs";

const sample = `
local AchievementInfo =
{
	Name = "AchievementInfo",
	Type = "System",
	Namespace = "C_AchievementInfo",
	Functions =
	{
		{
			Name = "IsValidAchievement",
			Type = "Function",
			SecretArguments = "AllowedWhenUntainted",
			Arguments =
			{
				{ Name = "achievementId", Type = "number", Nilable = false },
			},
			Returns =
			{
				{ Name = "isValidAchievement", Type = "bool", Nilable = false },
			},
		},
	},
	Events = {},
	Tables =
	{
		{
			Name = "ItemConsts",
			Type = "Constants",
			Values =
			{
				{ Name = "INVALID_BANK_TAB_SLOT", Type = "number", Value = 0xFF },
				{ Name = "DEFAULT_ITEM_SAVE_VERSION", Type = "number", Value = 2 },
				{ Name = "CURRENT_ITEM_SAVE_VERSION", Type = "number", Value = DEFAULT_ITEM_SAVE_VERSION },
				{ Name = "NEGATIVE", Type = "number", Value = -1 },
				{ Name = "HEAL", Type = "number", Value = 3.76 },
				{ Name = "GET", Type = "CalendarGetEventType", Value = Enum.CalendarGetEventType.Get },
				{ Name = "SUM", Type = "number", Value = Constants.PetConsts.MAX_STABLE_SLOTS + Constants.PetConsts.NUM_PET_SLOTS_THAT_NEED_LEARNED_SPELL },
			},
		},
	},
};

APIDocumentation:AddDocumentationTable(AchievementInfo);
`;

const parsed = parseDocumentationSource(sample);
assert.equal(parsed.localName, "AchievementInfo");
const system = normalizeDocument(parsed.value, parsed.localName);
assert.equal(system.namespace, "C_AchievementInfo");
assert.equal(system.functions[0].name, "IsValidAchievement");
assert.equal(system.functions[0].flags.SecretArguments, "AllowedWhenUntainted");
assert.equal(system.functions[0].arguments[0].nilable, false);
const values = Object.fromEntries(system.tables[0].fields.map((field) => [field.name, field.value]));
assert.equal(values.INVALID_BANK_TAB_SLOT, 255);
assert.equal(values.NEGATIVE, -1);
assert.equal(values.HEAL, 3.76);
assert.deepEqual(values.CURRENT_ITEM_SAVE_VERSION, { ref: "DEFAULT_ITEM_SAVE_VERSION" });
assert.deepEqual(values.GET, { ref: "Enum.CalendarGetEventType.Get" });
assert.deepEqual(values.SUM, {
  expr: "Constants.PetConsts.MAX_STABLE_SLOTS + Constants.PetConsts.NUM_PET_SLOTS_THAT_NEED_LEARNED_SPELL",
});

const escaped = parseDocumentationSource(String.raw`
local Trim = {
  Name = "Trim",
  Type = "System",
  Functions = {
    {
      Name = "ltrim",
      Type = "Function",
      Arguments = {
        { Name = "characters", Type = "stringView", Nilable = false, Default = " \r\n\t", Documentation = { "Keep \"quotes\" and apostrophes." } },
      },
    },
  },
}
`);
const trim = normalizeDocument(escaped.value, escaped.localName);
assert.equal(trim.functions[0].arguments[0].default, " \r\n\t");
assert.equal(trim.functions[0].arguments[0].documentation[0], 'Keep "quotes" and apostrophes.');

const definitions = parseDocumentationSource(`
local AccountConstants = {
  Tables = {
    { Name = "AccountData", Type = "Enumeration", NumValues = 2, MinValue = 0, MaxValue = 1, Fields = {
      { Name = "Config", Type = "AccountData", EnumValue = 0 },
    } },
  },
}
`);
const bundle = normalizeDocument(definitions.value, definitions.localName);
assert.equal(bundle.name, "AccountConstants");
assert.equal(bundle.type, "Definitions");
assert.equal(bundle.tables[0].fields[0].enumValue, 0);

assert.equal(familyKey("AuctionHouseEnums"), "AuctionHouse");
assert.equal(familyKey("CombatLogInternal"), "CombatLog");
assert.equal(familyKey("CraftingOrderUI"), "CraftingOrderUI");
assert.equal(familyKey("WeatherScript"), "Weather");

const auction = buildSurfaces([
  {
    name: "AuctionHouse",
    slug: "auctionhouse",
    type: "System",
    namespace: "C_AuctionHouse",
    functions: [{ name: "GetAuctionInfoByID" }, { name: "PostItem" }, { name: "CancelAuction" }],
    events: [{ name: "AuctionHouseShow" }],
    tables: [{ name: "AuctionInfo" }],
  },
  {
    name: "AuctionHouseEnums",
    slug: "auctionhouseenums",
    type: "Definitions",
    functions: [],
    events: [],
    tables: [{ name: "AuctionHouseFilter" }],
  },
  {
    name: "Unit",
    slug: "unit",
    type: "System",
    functions: [{ name: "UnitName" }],
    events: [],
    tables: [],
  },
]);
assert.equal(auction.length, 2);
const house = auction.find((surface) => surface.primarySlug === "auctionhouse");
assert.equal(house.namespace, "C_AuctionHouse");
assert.deepEqual(
  house.members.map((member) => member.slug),
  ["auctionhouse", "auctionhouseenums"],
);
assert.match(house.blurb, /C_AuctionHouse is the Auction House API/);
assert.match(house.blurb, /lookups \(1\)/);
assert.equal(house.tables, 2);

const previous = [
  { kind: "function", qualified: "C_Bank.FetchNumBankTabs", name: "FetchNumBankTabs", systemSlug: "bank", args: "result" },
  { kind: "function", qualified: "GetMoney", name: "GetMoney", systemSlug: "player", args: "money" },
];
const current = [
  {
    kind: "function",
    qualified: "C_Bank.FetchNumBankTabs",
    name: "FetchNumBankTabs",
    systemSlug: "bank",
    args: "bankType result",
    arguments: [{ name: "bankType" }],
    returns: [{ name: "result" }],
  },
  {
    kind: "function",
    qualified: "C_Bank.NewCall",
    name: "NewCall",
    systemSlug: "bank",
    args: "id",
    arguments: [{ name: "id" }],
    returns: [],
  },
];
const diff = diffSymbols(previous, current);
assert.deepEqual(diff.added.map((item) => item.qualified), ["C_Bank.NewCall"]);
assert.deepEqual(diff.removed.map((item) => item.qualified), ["GetMoney"]);
assert.equal(diff.changed[0].qualified, "C_Bank.FetchNumBankTabs");
assert.equal(diff.changed[0].before, "result");
assert.equal(diff.changed[0].after, "bankType result");
assert.equal(draftLua(current[1]), "C_Bank.NewCall(id)");
assert.equal(
  draftLua({ kind: "event", qualified: "AUCTION_HOUSE_SHOW", literalName: "AUCTION_HOUSE_SHOW", payload: [] }),
  'frame:RegisterEvent("AUCTION_HOUSE_SHOW")\n-- no payload',
);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "libram-examples-"));
seedMissing(scratch, [current[0]], { versionId: "older", now: "2026-10-15T00:00:00Z" });
const seeded = seedMissing(scratch, current, { versionId: "newer", now: "2026-10-15T01:00:00Z" });
assert.deepEqual(seeded.created, ["C_Bank.NewCall"]);
assert.deepEqual(seeded.kept, ["C_Bank.FetchNumBankTabs"]);
const stored = readExamples(scratch);
assert.equal(stored["function:C_Bank.FetchNumBankTabs"].addedIn, "older");
assert.match(stored["function:C_Bank.NewCall"].lua, /C_Bank.NewCall\(id\)/);
assert.equal(stored["function:C_Bank.NewCall"].origin, "signature");

const replicate = usageLua({
  kind: "function",
  name: "ReplicateItems",
  qualified: "C_AuctionHouse.ReplicateItems",
  namespace: "C_AuctionHouse",
  documentation: ["This function should be used in place of an 'allItem' QueryAuctionItems call to query the entire auction house."],
  arguments: [],
  returns: [],
});
assert.match(replicate, /The client says: This function should be used in place of an 'allItem' QueryAuctionItems call/);
assert.match(replicate, /C_AuctionHouse\.ReplicateItems\(\)/);

const check = usageLua({
  kind: "function",
  name: "CanCancelAuction",
  qualified: "C_AuctionHouse.CanCancelAuction",
  namespace: "C_AuctionHouse",
  documentation: ["Returns whether the auction can be cancelled."],
  arguments: [{ name: "ownedAuctionID", type: "number" }],
  returns: [{ name: "canCancelAuction", type: "bool" }],
});
assert.match(check, /if C_AuctionHouse\.CanCancelAuction\(ownedAuctionID\) then/);

const method = usageLua({
  kind: "function",
  name: "AddBreakpoint",
  qualified: "AddBreakpoint",
  systemName: "AbbreviatedNumberFormatterAPI",
  documentation: ["Adds a new breakpoint to the formatter."],
  arguments: [{ name: "breakpoint", type: "NumberAbbreviationBreakpoint" }],
  returns: [],
});
assert.match(method, /object:AddBreakpoint\(breakpoint\)/);
assert.match(method, /an AbbreviatedNumberFormatterAPI object/);

const shown = usageLua({
  kind: "event",
  qualified: "AUCTION_HOUSE_AUCTION_CREATED",
  literalName: "AUCTION_HOUSE_AUCTION_CREATED",
  documentation: ["This signal is not used in the base UI but is included for AddOn ease-of-use."],
  payload: [{ name: "auctionID", type: "number" }],
});
assert.match(shown, /RegisterEvent\("AUCTION_HOUSE_AUCTION_CREATED"\)/);
assert.match(shown, /function\(self, event, auctionID\)/);

const describedHouse = {
  name: "AuctionHouse",
  slug: "auctionhouse",
  namespace: "C_AuctionHouse",
  functions: [
    {
      name: "ReplicateItems",
      documentation: ["This function should be used in place of an 'allItem' QueryAuctionItems call to query the entire auction house."],
      arguments: [],
      returns: [],
    },
    { name: "GetAuctionInfoByID", arguments: [{ name: "auctionID" }], returns: [{ name: "priceInfo" }] },
  ],
  events: [],
};
assert.deepEqual(describedCalls([describedHouse]).map((call) => call.qualified), ["C_AuctionHouse.ReplicateItems"]);
const describedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "libram-described-"));
const first = seedDescribed(describedRoot, describedCalls([describedHouse]), { versionId: "build", now: "2026-10-15T02:00:00Z" });
assert.deepEqual(first.created, ["C_AuctionHouse.ReplicateItems"]);
const hand = {
  kind: "function",
  qualified: "C_AuctionHouse.ReplicateItems",
  lua: "hand written",
  origin: "note",
  args: [],
  returns: [],
};
fs.writeFileSync(path.join(describedRoot, "function", "C_AuctionHouse.ReplicateItems.json"), `${JSON.stringify(hand)}\n`);
const second = seedDescribed(describedRoot, describedCalls([describedHouse]), { versionId: "build", now: "2026-10-15T03:00:00Z" });
assert.deepEqual(second.kept, ["C_AuctionHouse.ReplicateItems"]);
assert.equal(readExamples(describedRoot)["function:C_AuctionHouse.ReplicateItems"].lua, "hand written");

console.log("parser selftest ok");
