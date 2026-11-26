import type { Target } from "../model.ts";

/**
 * Identifiers contributors can test in `!#if`. They are resolved at build time:
 * each output file targets one blocker, and Brave ignores directives entirely,
 * so no directive may survive into the output.
 */
const IDENTIFIERS: Record<string, Target> = {
  ext_ublock: "ublock",
  adguard: "adguard",
  ext_brave: "brave",
};

export class DirectiveError extends Error {}

export interface SourceLine {
  /** 1-based line number in the source file. */
  line: number;
  text: string;
}

/** Recursive-descent evaluator for `!`, `&&`, `||`, parentheses and identifiers. */
export function evaluate(expression: string, target: Target): boolean {
  const tokens = expression.match(/\s*(\(|\)|!|&&|\|\||[A-Za-z_][A-Za-z0-9_]*)\s*/gy)?.map((t) => t.trim());
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new DirectiveError(`cannot parse \`${expression}\``);
  }
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const or = (): boolean => {
    let value = and();
    while (peek() === "||") {
      next();
      value = and() || value;
    }
    return value;
  };
  const and = (): boolean => {
    let value = unary();
    while (peek() === "&&") {
      next();
      value = unary() && value;
    }
    return value;
  };
  const unary = (): boolean => {
    const token = next();
    if (token === "!") return !unary();
    if (token === "(") {
      const value = or();
      if (next() !== ")") throw new DirectiveError(`missing ")" in \`${expression}\``);
      return value;
    }
    if (token === undefined || !Object.hasOwn(IDENTIFIERS, token)) {
      const known = Object.keys(IDENTIFIERS).join(", ");
      throw new DirectiveError(`unknown identifier "${token}" in \`${expression}\` (known: ${known})`);
    }
    return IDENTIFIERS[token] === target;
  };

  const value = or();
  if (i !== tokens.length) throw new DirectiveError(`unexpected "${peek()}" in \`${expression}\``);
  return value;
}

/** Keeps the lines that apply to `target`, dropping every directive line. */
export function preprocess(source: string, target: Target): SourceLine[] {
  const out: SourceLine[] = [];
  const stack: { active: boolean; sawElse: boolean; line: number }[] = [];
  const active = () => stack.every((frame) => frame.active);

  source.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    const trimmed = text.trim();
    const directive = trimmed.match(/^!#(if|else|endif)\b\s*(.*)$/);
    try {
      if (!directive) {
        if (trimmed.startsWith("!#")) throw new DirectiveError(`unsupported directive \`${trimmed}\``);
        if (active()) out.push({ line, text });
        return;
      }
      const [, keyword, rest] = directive;
      if (keyword === "if") {
        stack.push({ active: evaluate(rest ?? "", target), sawElse: false, line });
      } else {
        if (rest) throw new DirectiveError(`unexpected text after \`!#${keyword}\``);
        const frame = stack.at(-1);
        if (!frame) throw new DirectiveError(`\`!#${keyword}\` without \`!#if\``);
        if (keyword === "else") {
          if (frame.sawElse) throw new DirectiveError("duplicate `!#else`");
          frame.sawElse = true;
          frame.active = !frame.active;
        } else {
          stack.pop();
        }
      }
    } catch (error) {
      if (error instanceof DirectiveError) throw new DirectiveError(`line ${line}: ${error.message}`);
      throw error;
    }
  });

  const open = stack.at(-1);
  if (open) throw new DirectiveError(`line ${open.line}: \`!#if\` is never closed`);
  return out;
}
