import { useState } from "react";
import {
  canLinkType,
  copyCall,
  eventSignature,
  explainField,
  fallbackDescription,
  functionSignature,
  humanize,
  isEvent,
  isFunction,
  isOptional,
  isTable,
  kindLabel,
  kindAccent,
  kindTone,
  otherFlags,
  restrictionNotes,
  showScalar,
} from "./explain";
import { LuaCode } from "./LuaCode";
import { firstUnknownIndex, groupSymbols, leadSentence, symbolProse } from "./outline";
import type { CallExample, EventDoc, FieldDoc, FunctionDoc, SurfaceInfo, SymbolEntry, SystemDoc, TableDoc, TypeRef, VersionInfo } from "./types";

export function Detail({
  version,
  system,
  symbol,
  member,
  types,
  loading,
  missing,
  systemError,
  requestedName,
  onOpenType,
  onOpenHelp,
  surface,
  outline,
  onOpenSymbol,
  onLeave,
  onBackToApi,
  compact,
  examples,
}: {
  version: VersionInfo | null;
  system: SystemDoc | null;
  symbol: SymbolEntry | null;
  member: FunctionDoc | EventDoc | TableDoc | null;
  types: Record<string, TypeRef[]>;
  loading: boolean;
  missing: boolean;
  systemError?: string | null;
  requestedName?: string;
  onOpenType: (typeName: string) => void;
  onOpenHelp: () => void;
  surface: SurfaceInfo | null;
  outline: SymbolEntry[];
  onOpenSymbol: (symbol: SymbolEntry) => void;
  onLeave: () => void;
  onBackToApi: () => void;
  compact: boolean;
  examples: Record<string, CallExample>;
}) {
  if (!version) return null;
  if (systemError) {
    return (
      <article className="mx-auto max-w-3xl px-8 py-10">
        {compact && (
          <button type="button" onClick={onBackToApi} className="mb-4 text-sm text-gold">
            All APIs
          </button>
        )}
        <p className="text-sm uppercase tracking-[0.16em] text-warn">Could not open this API</p>
        <h2 className="mt-2 font-mono text-2xl text-parchment">{requestedName || "This API"}</h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-mist">{systemError}</p>
      </article>
    );
  }
  if (missing) {
    return (
      <article className="mx-auto max-w-3xl px-8 py-10">
        {compact && (
          <button type="button" onClick={onBackToApi} className="mb-4 text-sm text-gold">
            All APIs
          </button>
        )}
        <p className="text-sm uppercase tracking-[0.16em] text-gold">Not in this build</p>
        <h2 className="mt-2 font-mono text-2xl text-parchment">{symbol?.qualified || requestedName || "This API"}</h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-mist">
          {version.label} {version.version} does not include this symbol. Pick another build, or clear the selection and search
          again.
        </p>
      </article>
    );
  }
  if (system && symbol && member) {
    return (
      <Member
        version={version}
        system={system}
        symbol={symbol}
        member={member}
        types={types}
        onOpenType={onOpenType}
        surface={surface}
        onLeave={onBackToApi}
        compact={compact}
        example={examples[`${symbol.kind}:${symbol.systemSlug}.${symbol.name}`] || examples[`${symbol.kind}:${symbol.qualified}`]}
      />
    );
  }
  if (symbol && (loading || !system)) {
    return <p className="px-8 py-10 text-mist">Loading {symbol.system || "this page"}…</p>;
  }
  if (surface || system) {
    return (
      <SystemOverview
        system={system}
        surface={surface}
        outline={outline}
        onOpenSymbol={onOpenSymbol}
        onLeave={onLeave}
        compact={compact}
      />
    );
  }
  return <Welcome version={version} onOpenHelp={onOpenHelp} />;
}

function Welcome({ version, onOpenHelp }: { version: VersionInfo; onOpenHelp: () => void }) {
  const ingested = new Date(version.ingestedAt).toLocaleString();
  return (
    <article className="mx-auto max-w-3xl px-8 py-10">
      <h2 className="text-4xl font-semibold tracking-tight text-parchment">WoW Forever client API</h2>
      <p className="mt-2 font-mono text-xl text-gold">{version.version}</p>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-mist">
        Libram reads the documentation tables the game writes with <code className="console">ExportInterfaceFiles code</code>.
        The descriptions on these pages are quoted from the World of Warcraft client. Each ingest is kept, so you can switch builds when a patch
        moves a signature.
      </p>
      <dl className="mt-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Systems" value={version.counts.systems} kind="system" />
        <Stat label="Functions" value={version.counts.functions} kind="function" />
        <Stat label="Events" value={version.counts.events} kind="event" />
        <Stat label="Tables" value={version.counts.tables} kind="table" />
      </dl>
      <p className="mt-6 text-mist">
        Showing <span className="text-parchment">{version.label}</span>
        {version.latest ? " · latest ingested for this client" : " · older snapshot"}. Ingested {ingested}.
      </p>
      <section className="mt-8 max-w-2xl border-t border-line pt-6 text-mist">
        <h3 className="text-parchment">When the client updates</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed">
          <li>Launch that client with <code className="font-mono text-parchment">-console</code>.</li>
          <li>
            Open the console (<code className="font-mono text-parchment">~</code>, or <code className="font-mono text-parchment">^</code> on a
            German keyboard) and run <code className="console">ExportInterfaceFiles code</code>.
          </li>
          <li>
            Run <code className="font-mono text-parchment">npm run ingest</code>. Leave <code className="font-mono text-parchment">npm run watch</code>{" "}
            running if you want a notice the moment <code className="font-mono text-parchment">.build.info</code> changes.
          </li>
        </ol>
        <button type="button" onClick={onOpenHelp} className="mt-4 text-gold underline decoration-line underline-offset-4">
          Full update steps
        </button>
      </section>
    </article>
  );
}

function Stat({ label, value, kind }: { label: string; value: number; kind: string }) {
  const accent = kindAccent(kind);
  return (
    <div className={`rounded-md border px-3 py-3 ${accent.border} ${accent.wash}`}>
      <dt className={`text-xs uppercase tracking-wider ${accent.text}`}>{label}</dt>
      <dd className={`mt-1 font-mono text-xl ${accent.text}`}>{value.toLocaleString()}</dd>
    </div>
  );
}

function SystemOverview({
  system,
  surface,
  outline,
  onOpenSymbol,
  onLeave,
  compact,
}: {
  system: SystemDoc | null;
  surface: SurfaceInfo | null;
  outline: SymbolEntry[];
  onOpenSymbol: (symbol: SymbolEntry) => void;
  onLeave: () => void;
  compact: boolean;
}) {
  const title = surface?.namespace || system?.namespace || surface?.name || system?.name || "This API";
  const subtitle = surface?.namespace ? surface.name : system?.type;
  const client = surface?.clientDocumentation || system?.documentation;
  const groups = groupSymbols(outline);
  const folded = surface?.members.filter((member) => member.role === "types") ?? [];
  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      {compact && (
        <button type="button" onClick={onLeave} className="mb-4 text-sm text-gold">
          All APIs
        </button>
      )}
      {subtitle && <p className={`text-sm uppercase tracking-[0.16em] ${kindTone("table")}`}>{subtitle}</p>}
      <h2 className="mt-2 font-mono text-3xl font-semibold text-parchment">{title}</h2>
      {client?.map((line) => (
        <p key={line} className="mt-4 max-w-2xl text-lg leading-relaxed text-mist">
          {line}
        </p>
      ))}
      {client?.length ? <p className="mt-2 text-sm text-stone">Quoted from the World of Warcraft client.</p> : null}
      {surface?.blurb && (
        <>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-parchment">{surface.blurb}</p>
          <p className="mt-2 text-sm text-stone">Read from the calls in this build.</p>
        </>
      )}
      {folded.length > 0 && (
        <p className="mt-3 text-sm text-stone">Includes {folded.map((member) => member.name).join(", ")}.</p>
      )}
      {groups.map((group) => (
        <section key={group.id} className="mt-8">
          <h3 className={`text-sm uppercase tracking-[0.14em] ${kindTone(group.id)}`}>{group.title}</h3>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {group.items.map((symbol, position) => {
              const prose = symbolProse(symbol);
              const label = symbol.kind === "event" ? symbol.qualified : symbol.name;
              const accent = kindAccent(symbol.kind);
              const unknownHeading =
                (group.id === "function" || group.id === "event") && position === firstUnknownIndex(group.items);
              return (
                <li key={symbol.id}>
                  {unknownHeading && <p className="pt-4 pb-1 text-xs uppercase tracking-wider text-stone">Unknown</p>}
                  <button type="button" onClick={() => onOpenSymbol(symbol)} className={`block w-full border-l-2 py-3 pl-3 text-left ${accent.border} hover:bg-raised/70`}>
                    <span className={`font-mono ${accent.text}`}>{label}</span>
                    {prose && <span className="mt-1 block text-sm leading-relaxed text-mist">{prose}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </article>
  );
}

function Member({
  version,
  system,
  symbol,
  member,
  types,
  onOpenType,
  surface,
  onLeave,
  compact,
  example,
}: {
  version: VersionInfo;
  system: SystemDoc;
  symbol: SymbolEntry;
  member: FunctionDoc | EventDoc | TableDoc;
  types: Record<string, TypeRef[]>;
  onOpenType: (typeName: string) => void;
  surface: SurfaceInfo | null;
  onLeave: () => void;
  compact: boolean;
  example?: CallExample;
}) {
  const signature = isFunction(member, symbol.kind)
    ? functionSignature(system, member)
    : isEvent(member, symbol.kind)
      ? eventSignature(member)
      : member.name;
  const copyText = isFunction(member, symbol.kind) ? copyCall(system, member) : signature;
  const official = "documentation" in member ? member.documentation : undefined;
  const description = official?.length
    ? official
    : isFunction(member, symbol.kind)
      ? [fallbackDescription(system, member)]
      : isEvent(member, symbol.kind)
        ? [eventFallback(member, system)]
        : isTable(member, symbol.kind)
          ? [tableFallback(member)]
          : [];
  const notes = isFunction(member, symbol.kind)
    ? restrictionNotes(member.flags)
    : isEvent(member, symbol.kind)
      ? restrictionNotes(member.flags, member)
      : restrictionNotes(isTable(member, symbol.kind) ? member.flags : undefined);
  const flags = otherFlags(
    isFunction(member, symbol.kind) || isEvent(member, symbol.kind) || isTable(member, symbol.kind) ? member.flags : undefined,
  );

  const home = surface?.namespace || surface?.name;
  return (
    <article className="mx-auto min-w-0 max-w-3xl px-4 py-8 sm:px-8">
      {compact && (
        <button type="button" onClick={onLeave} className="mb-4 text-sm text-gold">
          {home ? `Back to ${home}` : "Back to this API"}
        </button>
      )}
      {surface?.blurb && <p className="mb-4 max-w-2xl text-sm leading-relaxed text-mist">{leadSentence(surface.blurb)}</p>}
      <p className="text-sm text-mist">
        <span className={kindTone(symbol.kind)}>{kindLabel(symbol.kind)}</span>
        <span className="px-2 text-stone">/</span>
        {system.name}
        {system.namespace ? <span className="text-stone"> · {system.namespace}</span> : null}
        <span className="px-2 text-stone">/</span>
        <span className="font-mono">{version.version}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 font-mono text-2xl leading-snug break-all text-parchment">{symbol.qualified}</h2>
        <CopyButton text={copyText} />
      </div>
      <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-ink px-4 py-3 font-mono text-sm leading-relaxed text-gold">
        {signature}
      </pre>
      <div className="mt-5 space-y-3 text-lg leading-relaxed text-parchment">
        {official?.length ? (
          <>
            {official.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="text-sm text-stone">Quoted from the World of Warcraft client.</p>
          </>
        ) : (
          description.map((line) => <p key={line}>{line}</p>)
        )}
        {official?.length && isFunction(member, symbol.kind) ? (
          <>
            <p className="text-sm text-stone">Read from the signature.</p>
            <p className="text-base text-mist">{fallbackDescription(system, member)}</p>
          </>
        ) : null}
        {!official?.length ? (
          <p className="text-sm text-stone">The client did not include a description. This reading is from the signature.</p>
        ) : null}
      </div>
      {(symbol.kind === "function" || symbol.kind === "event") && (
        <ExamplePanel example={example} member={member} kind={symbol.kind} />
      )}
      {notes.length > 0 && (
        <ul className="mt-5 space-y-2 border-l-2 border-warn pl-4 text-mist">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {isFunction(member, symbol.kind) && (
        <>
          <FieldList title="Arguments" fields={member.arguments} role="argument" types={types} onOpenType={onOpenType} empty="This function takes no arguments." />
          <FieldList title="Returns" fields={member.returns} role="return" types={types} onOpenType={onOpenType} empty="This function does not return a value." />
        </>
      )}
      {isEvent(member, symbol.kind) && (
        <FieldList title="Payload" fields={member.payload} role="payload" types={types} onOpenType={onOpenType} empty="This event has no payload." />
      )}
      {isTable(member, symbol.kind) && (
        <>
          {member.numValues != null && (
            <p className="mt-5 text-mist">
              {member.numValues} values, from {String(member.minValue)} to {String(member.maxValue)}.
            </p>
          )}
          <FieldList
            title={member.kind === "Enumeration" || member.kind === "Constants" ? "Values" : "Fields"}
            fields={member.fields}
            role="field"
            types={types}
            onOpenType={onOpenType}
            empty="No fields are documented."
          />
        </>
      )}
      {flags.length > 0 && (
        <section className="mt-8">
          <h3 className="text-sm uppercase tracking-[0.14em] text-stone">Client flags</h3>
          <p className="mt-2 text-sm text-mist">Names come from the export. Libram does not add a meaning beyond that name.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {flags.map(([label, value]) => (
              <li key={label} className="flex gap-4 py-2">
                <span className="text-parchment">{label}</span>
                {value ? <span className="font-mono text-sm text-mist">{value}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function eventFallback(event: EventDoc, system: SystemDoc) {
  const payload = event.payload ?? [];
  const names = payload.length ? payload.map((field) => field.name).join(", ") : "no payload";
  return `${event.literalName || event.name} is an event on ${system.name}. Handlers receive ${names}.`;
}

function tableFallback(table: TableDoc) {
  const count = table.fields?.length ?? 0;
  if (table.kind === "Enumeration") return `${table.name} is an enumeration with ${count} named values.`;
  if (table.kind === "Constants") return `${table.name} is a set of ${count} constants shipped with the client.`;
  if (table.kind === "Structure") return `${table.name} is a table. The fields below are what the client documents.`;
  return `${table.name} is a ${humanize(table.kind).toLowerCase()} with ${count} fields.`;
}

function ExamplePanel({
  example,
  member,
  kind,
}: {
  example?: CallExample;
  member: FunctionDoc | EventDoc | TableDoc;
  kind: string;
}) {
  const current = isFunction(member, kind)
    ? (member.arguments || []).map((field) => field.name).filter(Boolean)
    : isEvent(member, kind)
      ? (member.payload || []).map((field) => field.name).filter(Boolean)
      : [];
  const recorded = example?.args || [];
  const stale = Boolean(example && recorded.join("\0") !== current.join("\0"));
  return (
    <details className="mt-6 rounded-md border border-line bg-panel px-4 py-3">
      <summary className="cursor-pointer text-sm uppercase tracking-[0.14em] text-mist">Example</summary>
      <p className="mt-3 text-sm leading-relaxed text-stone">
        Kept in the examples folder. Ingesting a new client build does not replace it.
      </p>
      {example ? (
        <>
          {stale && (
            <p className="mt-3 text-sm leading-relaxed text-warn">
              Written for {recorded.length ? recorded.join(", ") : "no arguments"}. This build takes {current.length ? current.join(", ") : "no arguments"}.
            </p>
          )}
          <LuaCode code={example.lua} className="mt-3" />
          {example.note && <p className="mt-3 text-sm leading-relaxed text-mist">{example.note}</p>}
          <p className="mt-2 text-sm text-stone">
            {example.origin === "signature" ? "Drafted from the signature." : "Written as a usage note."}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-mist">
          No example is kept for this call yet. After the next build, npm run changes lists calls that appeared or changed, and npm run examples -- --seed drafts one only where an example is missing.
        </p>
      )}
    </details>
  );
}

function FieldList({
  title,
  fields,
  role,
  types,
  onOpenType,
  empty,
}: {
  title: string;
  fields?: FieldDoc[];
  role: "argument" | "return" | "payload" | "field";
  types: Record<string, TypeRef[]>;
  onOpenType: (typeName: string) => void;
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h3 className="text-sm uppercase tracking-[0.14em] text-stone">{title}</h3>
      {!fields?.length ? (
        <p className="mt-3 text-mist">{empty}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {fields.map((field, index) => (
            <li key={`${field.name}-${index}`} className="py-3">
              {field.strideIndex === 1 && <p className="mb-2 text-sm text-warn">The argument list repeats from here.</p>}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-parchment">{field.name || "(unnamed)"}</span>
                <TypeText field={field} types={types} onOpenType={onOpenType} />
                <span className="text-sm text-stone">{requirement(field)}</span>
                {field.enumValue !== undefined && <span className="font-mono text-sm text-gold">{showScalar(field.enumValue)}</span>}
                {field.value !== undefined && <span className="font-mono text-sm text-gold">{showScalar(field.value)}</span>}
              </div>
              <p className="mt-1 text-mist">{explainField(field, role)}</p>
              {field.mixin && <p className="mt-1 text-sm text-mist">Also provides {field.mixin}.</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function requirement(field: FieldDoc) {
  if (field.value !== undefined || field.enumValue !== undefined) return "";
  if (field.default !== undefined) return `optional, default ${showScalar(field.default)}`;
  if (isOptional(field)) return "optional";
  if (field.nilable === false) return "required";
  return "";
}

function TypeText({
  field,
  types,
  onOpenType,
}: {
  field: FieldDoc;
  types: Record<string, TypeRef[]>;
  onOpenType: (typeName: string) => void;
}) {
  const names = [field.type, field.innerType].filter((name): name is string => Boolean(name));
  return (
    <span className="font-mono text-sm text-sky">
      {names.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 && <span className="text-stone"> of </span>}
          {canLinkType(name) && types[name]?.length ? (
            <button type="button" onClick={() => onOpenType(name)} className="underline decoration-line underline-offset-2 hover:text-gold">
              {name}
            </button>
          ) : (
            name
          )}
        </span>
      ))}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="rounded-md border border-line bg-raised px-3 py-1.5 text-sm text-parchment hover:border-gold"
    >
      {copied ? "Copied" : "Copy call"}
    </button>
  );
}
