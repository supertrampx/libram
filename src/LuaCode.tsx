import { highlightLua } from "./highlight";

const tone: Record<string, string> = {
  comment: "text-stone",
  string: "text-foam",
  keyword: "text-lilac",
  number: "text-gold",
  name: "text-parchment",
  plain: "text-mist",
};

export function LuaCode({ code, className = "" }: { code: string; className?: string }) {
  const tokens = highlightLua(code);
  return (
    <pre className={`overflow-x-auto rounded-md border border-line bg-ink px-4 py-3 font-mono text-sm leading-relaxed ${className}`}>
      <code>
        {tokens.map((token, index) => (
          <span key={index} className={tone[token.kind]}>
            {token.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
