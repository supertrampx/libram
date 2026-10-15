/**
 * Parser for the data tables Blizzard writes with ExportInterfaceFiles.
 * The documentation files are Lua table literals plus one registration call.
 * They are not general Lua: no function bodies, no control flow.
 */

function isBinaryOperator(character) {
  return character === "+" || character === "-" || character === "*" || character === "/";
}

function literalFrom(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "nil") return null;
  if (/^-?0[xX][0-9a-fA-F]+$/.test(text)) {
    const negative = text.startsWith("-");
    const value = Number.parseInt(text.slice(negative ? 3 : 2), 16);
    return negative ? -value : value;
  }
  if (/^-?(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(text)) return { ref: text };
  return { expr: text };
}

export class LuaParseError extends Error {
  constructor(message, line, column) {
    super(`${message} (${line}:${column})`);
    this.name = "LuaParseError";
    this.line = line;
    this.column = column;
  }
}

export function parseDocumentationSource(source) {
  const parser = new Parser(source);
  parser.skip();
  let localName = null;
  if (parser.keyword("local")) {
    localName = parser.parseIdent();
    parser.skip();
    parser.expect("=");
  }
  const value = parser.parseValue();
  return { localName, value };
}

class Parser {
  constructor(source) {
    this.s = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    this.i = 0;
    this.n = this.s.length;
  }

  position() {
    let line = 1;
    let column = 1;
    for (let i = 0; i < this.i; i++) {
      if (this.s[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column };
  }

  fail(message) {
    const { line, column } = this.position();
    throw new LuaParseError(message, line, column);
  }

  peek() {
    return this.s[this.i];
  }

  skip() {
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        this.i += 1;
        continue;
      }
      if (c === "-" && this.s[this.i + 1] === "-") {
        this.i += 2;
        if (this.s[this.i] === "[") {
          const close = this.readLongBracket();
          const end = this.s.indexOf(close, this.i);
          if (end < 0) this.fail("Unclosed long comment");
          this.i = end + close.length;
        } else {
          while (this.i < this.n && this.s[this.i] !== "\n") this.i += 1;
        }
        continue;
      }
      break;
    }
  }

  readLongBracket() {
    let level = 0;
    if (this.s[this.i] !== "[") this.fail("Expected long bracket");
    let j = this.i + 1;
    while (this.s[j] === "=") {
      level += 1;
      j += 1;
    }
    if (this.s[j] !== "[") this.fail("Expected long bracket");
    this.i = j + 1;
    return `]${"=".repeat(level)}]`;
  }

  keyword(word) {
    this.skip();
    if (!this.s.startsWith(word, this.i)) return false;
    const after = this.s[this.i + word.length];
    if (after && /[A-Za-z0-9_]/.test(after)) return false;
    this.i += word.length;
    return true;
  }

  expect(text) {
    this.skip();
    if (!this.s.startsWith(text, this.i)) this.fail(`Expected ${text}`);
    this.i += text.length;
  }

  parseIdent() {
    this.skip();
    const start = this.i;
    if (!/[A-Za-z_]/.test(this.peek() || "")) this.fail("Expected a name");
    this.i += 1;
    while (/[A-Za-z0-9_]/.test(this.peek() || "")) this.i += 1;
    return this.s.slice(start, this.i);
  }

  parseValue() {
    this.skip();
    const c = this.peek();
    if (c === "{") return this.parseTable();
    if (c === '"' || c === "'") return this.parseString();
    return this.parseExpression();
  }

  parseExpression() {
    const start = this.i;
    this.consumeExpression();
    return literalFrom(this.s.slice(start, this.i).trim());
  }

  consumeExpression() {
    this.consumeAtom();
    this.skip();
    while (isBinaryOperator(this.peek())) {
      this.i += 1;
      this.consumeAtom();
      this.skip();
    }
  }

  consumeAtom() {
    this.skip();
    const c = this.peek();
    if (c === "(") {
      this.consumeBalanced("(", ")");
      return;
    }
    if (c === '"' || c === "'") {
      this.parseString();
      return;
    }
    if (c === "-") {
      const next = this.s[this.i + 1];
      if (next >= "0" && next <= "9") {
        this.parseNumber();
        return;
      }
      this.i += 1;
      this.consumeAtom();
      return;
    }
    if (c >= "0" && c <= "9") {
      this.parseNumber();
      return;
    }
    if (/[A-Za-z_]/.test(c || "")) {
      this.parseIdent();
      while (this.peek() === ".") {
        this.i += 1;
        if (!/[A-Za-z_]/.test(this.peek() || "")) this.fail("Expected a name after '.'");
        this.parseIdent();
      }
      this.skip();
      if (this.peek() === "(") this.consumeBalanced("(", ")");
      return;
    }
    this.fail(`Unexpected ${c ? JSON.stringify(c) : "end of file"}`);
  }

  consumeBalanced(open, close) {
    if (this.peek() !== open) this.fail(`Expected ${open}`);
    let depth = 0;
    while (this.i < this.n) {
      const c = this.peek();
      if (c === '"' || c === "'") {
        this.parseString();
        continue;
      }
      this.i += 1;
      if (c === open) depth += 1;
      else if (c === close) {
        depth -= 1;
        if (depth === 0) return;
      }
    }
    this.fail(`Unbalanced ${open}`);
  }

  parseString() {
    const quote = this.peek();
    this.i += 1;
    let out = "";
    while (this.i < this.n) {
      const c = this.s[this.i];
      this.i += 1;
      if (c === quote) return out;
      if (c === "\\") {
        out += this.parseEscape();
        continue;
      }
      if (c === "\n") this.fail("Unclosed string");
      out += c;
    }
    this.fail("Unclosed string");
  }

  parseEscape() {
    const c = this.s[this.i];
    if (!c) this.fail("Unfinished escape");
    this.i += 1;
    const simple = {
      a: "\u0007",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
      "\\": "\\",
      '"': '"',
      "'": "'",
      "\n": "\n",
    };
    if (c in simple) return simple[c];
    if (c === "z") {
      while (this.s[this.i] === " " || this.s[this.i] === "\t" || this.s[this.i] === "\n" || this.s[this.i] === "\r") {
        this.i += 1;
      }
      return "";
    }
    if (c === "x") {
      const hex = this.s.slice(this.i, this.i + 2);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("Bad hex escape");
      this.i += 2;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    if (c === "u") {
      if (this.s[this.i] !== "{") this.fail("Bad unicode escape");
      const end = this.s.indexOf("}", this.i + 1);
      if (end < 0) this.fail("Bad unicode escape");
      const hex = this.s.slice(this.i + 1, end);
      this.i = end + 1;
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    if (c >= "0" && c <= "9") {
      let digits = c;
      for (let n = 0; n < 2; n++) {
        const d = this.s[this.i];
        if (d < "0" || d > "9") break;
        digits += d;
        this.i += 1;
      }
      return String.fromCharCode(Number.parseInt(digits, 10));
    }
    return c;
  }

  parseNumber() {
    const start = this.i;
    let sign = 1;
    if (this.peek() === "-") {
      sign = -1;
      this.i += 1;
    }
    if (this.s.startsWith("0x", this.i) || this.s.startsWith("0X", this.i)) {
      this.i += 2;
      const hexStart = this.i;
      while (/[0-9a-fA-F]/.test(this.peek() || "")) this.i += 1;
      if (this.i === hexStart) this.fail("Bad hex number");
      return sign * Number.parseInt(this.s.slice(hexStart, this.i), 16);
    }
    while (/[0-9]/.test(this.peek() || "")) this.i += 1;
    if (this.peek() === ".") {
      this.i += 1;
      while (/[0-9]/.test(this.peek() || "")) this.i += 1;
    }
    if (this.peek() === "e" || this.peek() === "E") {
      this.i += 1;
      if (this.peek() === "+" || this.peek() === "-") this.i += 1;
      while (/[0-9]/.test(this.peek() || "")) this.i += 1;
    }
    if (this.i === start || (sign === -1 && this.i === start + 1)) this.fail("Bad number");
    return Number(this.s.slice(start, this.i));
  }

  parseTable() {
    this.expect("{");
    const items = [];
    /** @type {Record<string, unknown> | null} */
    let named = null;
    while (true) {
      this.skip();
      if (this.peek() === "}") {
        this.i += 1;
        break;
      }
      if (this.peek() === "[") {
        this.i += 1;
        const key = this.parseValue();
        this.expect("]");
        this.expect("=");
        const value = this.parseValue();
        named = named || Object.fromEntries(items.map((value, index) => [index + 1, value]));
        named[String(key)] = value;
      } else if (/[A-Za-z_]/.test(this.peek() || "")) {
        const saved = this.i;
        const ident = this.parseIdent();
        this.skip();
        if (this.peek() === "=") {
          this.i += 1;
          const value = this.parseValue();
          named = named || Object.fromEntries(items.map((value, index) => [index + 1, value]));
          named[ident] = value;
        } else {
          this.i = saved;
          const value = this.parseValue();
          if (named) named[items.length + 1] = value;
          items.push(value);
        }
      } else {
        const value = this.parseValue();
        if (named) named[items.length + 1] = value;
        items.push(value);
      }
      this.skip();
      if (this.peek() === "," || this.peek() === ";") {
        this.i += 1;
        continue;
      }
      if (this.peek() === "}") {
        this.i += 1;
        break;
      }
      this.fail("Expected a comma or the end of a table");
    }
    return named || items;
  }
}
