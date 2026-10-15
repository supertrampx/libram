export interface LuaToken {
  kind: "comment" | "string" | "keyword" | "number" | "name" | "plain";
  text: string;
}

const KEYWORDS = new Set(
  "and break do else elseif end false for function if in local nil not or repeat return then true until while".split(" "),
);

export function highlightLua(source: string): LuaToken[] {
  const tokens: LuaToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("--", index)) {
      let end = source.length;
      if (source.startsWith("--[[", index)) {
        const close = source.indexOf("]]", index + 4);
        end = close < 0 ? source.length : close + 2;
      } else {
        const newline = source.indexOf("\n", index);
        end = newline < 0 ? source.length : newline;
      }
      tokens.push({ kind: "comment", text: source.slice(index, end) });
      index = end;
      continue;
    }
    const long = source.slice(index).match(/^\[(=*)\[/);
    if (long) {
      const close = `]${long[1]}]`;
      const found = source.indexOf(close, index + long[0].length);
      const end = found < 0 ? source.length : found + close.length;
      tokens.push({ kind: "string", text: source.slice(index, end) });
      index = end;
      continue;
    }
    const quote = source[index];
    if (quote === '"' || quote === "'") {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === "\\") {
          end += 2;
          continue;
        }
        if (source[end] === quote) {
          end += 1;
          break;
        }
        if (source[end] === "\n") break;
        end += 1;
      }
      tokens.push({ kind: "string", text: source.slice(index, end) });
      index = end;
      continue;
    }
    const number = source.slice(index).match(/^(?:0[xX][0-9A-Fa-f]+|\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/);
    if (number && (index === 0 || !/[\w.]/.test(source[index - 1]))) {
      tokens.push({ kind: "number", text: number[0] });
      index += number[0].length;
      continue;
    }
    const word = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (word) {
      tokens.push({ kind: KEYWORDS.has(word[0]) ? "keyword" : "name", text: word[0] });
      index += word[0].length;
      continue;
    }
    tokens.push({ kind: "plain", text: source[index] });
    index += 1;
  }
  return tokens;
}
