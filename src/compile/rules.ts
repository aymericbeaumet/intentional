import { type AnyRule, defaultParserOptions, RawRuleConverter, RuleParser } from "@adguard/agtree";
import type { Site, Target } from "../model.ts";
import { preprocess, type SourceLine } from "./preprocess.ts";

export interface Problem {
  line: number;
  text: string;
  message: string;
}

export class RulesError extends Error {
  readonly problems: Problem[];
  constructor(file: string, problems: Problem[]) {
    super(`${file}:\n${problems.map((p) => `  line ${p.line}: ${p.message}\n    ${p.text}`).join("\n")}`);
    this.problems = problems;
  }
}

/** Network options that need a trusted list, or that we keep out for portability. */
const FORBIDDEN_OPTIONS = new Set(["uritransform", "urlskip", "replace", "urltransform", "removeparam"]);

/** Pseudo-classes with arguments that uBO, AdGuard and Brave all understand. */
const PORTABLE_PSEUDOS = new Set([
  "has",
  "has-text",
  "upward",
  "matches-path",
  "remove",
  "style",
  "not",
  "is",
  "where",
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
  "min-text-length",
]);

export const within = (host: string, domains: readonly string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

const escapedDomain = (domain: string) => domain.replaceAll(".", "\\.");

function networkProblem(node: Extract<AnyRule, { category: "Network" }>, domains: string[]): string | null {
  if (node.type !== "NetworkRule") return "host rules are not supported, use `||host^` network rules";
  const pattern = node.pattern.value;
  const options = node.modifiers?.children ?? [];
  for (const option of options) {
    if (FORBIDDEN_OPTIONS.has(option.name.value)) return `\`$${option.name.value}\` is not allowed`;
  }
  const domainOption = options.find((o) => o.name.value === "domain" || o.name.value === "from");
  const optionDomains = domainOption?.value?.value.split("|").filter((d) => !d.startsWith("~")) ?? [];
  if (optionDomains.length > 0 && optionDomains.every((d) => within(d, domains))) return null;
  if (pattern.startsWith("||")) {
    const host = pattern.slice(2).split(/[/^*$|:?]/)[0] ?? "";
    return within(host, domains) ? null : `\`${host}\` is not one of this site's domains`;
  }
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    return domains.some((d) => pattern.includes(escapedDomain(d)))
      ? null
      : "regex rules must name one of this site's domains";
  }
  return "network rules must be anchored with `||` to one of this site's domains";
}

function cosmeticProblem(
  node: Extract<AnyRule, { category: "Cosmetic" }>,
  domains: string[],
  target: Target,
): string | null {
  const listed = node.domains.children;
  const positive = listed.filter((d) => !d.exception).map((d) => d.value);
  if (positive.length === 0) return "cosmetic rules must name at least one of this site's domains";
  const foreign = positive.find((d) => !within(d, domains));
  if (foreign) return `\`${foreign}\` is not one of this site's domains`;
  if (target !== "adguard" && node.syntax === "AdGuard") {
    return "AdGuard-only syntax must sit inside `!#if adguard`";
  }
  if (node.type === "ScriptletInjectionRule") {
    const name = node.body.children[0]?.children[0]?.value ?? "";
    if (name.startsWith("trusted-")) return `\`${name}\` needs a trusted list`;
    if (name.startsWith("intentional-"))
      return `\`${name}\` is generated from site.yaml, do not write it by hand`;
    return null;
  }
  if (node.type === "HtmlFilteringRule") return "HTML filtering is not portable";
  if (node.type === "ElementHidingRule" || node.type === "CssInjectionRule") {
    const raw = "selectorList" in node.body ? (node.body.selectorList?.value ?? "") : "";
    for (const [, pseudo] of raw.matchAll(/:([a-z-]+)\(/g)) {
      if (pseudo && !PORTABLE_PSEUDOS.has(pseudo))
        return `\`:${pseudo}()\` is not supported by every blocker`;
    }
  }
  return null;
}

export interface CompiledRule {
  /** Source line the output came from (0 for generated lines). */
  line: number;
  source: string;
  output: string[];
}

/**
 * Validates a site's rules for one target and converts them to that target's
 * syntax. Throws a RulesError listing every problem at once.
 */
export function compileRules(site: Site, target: Target): CompiledRule[] {
  const file = `sites/${site.spec.id}/rules.txt`;
  const problems: Problem[] = [];
  const seen = new Map<string, number>();
  const out: CompiledRule[] = [];

  let lines: SourceLine[];
  try {
    lines = preprocess(site.rules, target);
  } catch (error) {
    throw new RulesError(file, [{ line: 0, text: "", message: (error as Error).message }]);
  }

  for (const { line, text } of lines) {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("!")) {
      out.push({ line, source: text, output: [trimmed] });
      continue;
    }
    const fail = (message: string) => problems.push({ line, text, message });
    if (text !== trimmed) {
      fail("remove leading or trailing whitespace");
      continue;
    }
    const previous = seen.get(trimmed);
    if (previous !== undefined) {
      fail(`duplicate of line ${previous}`);
      continue;
    }
    seen.set(trimmed, line);

    let node: AnyRule;
    try {
      node = RuleParser.parse(trimmed, { ...defaultParserOptions, tolerant: false });
    } catch (error) {
      fail(`cannot parse: ${(error as Error).message}`);
      continue;
    }
    const problem =
      node.category === "Network"
        ? networkProblem(node, site.spec.domains)
        : node.category === "Cosmetic"
          ? cosmeticProblem(node, site.spec.domains, target)
          : node.category === "Comment"
            ? null
            : `unsupported rule (${node.category})`;
    if (problem) {
      fail(problem);
      continue;
    }

    if (target !== "adguard") {
      out.push({ line, source: trimmed, output: [trimmed] });
      continue;
    }
    try {
      const { result } = RawRuleConverter.convertToAdg(trimmed);
      if (result.length === 0) fail("AdGuard conversion produced nothing");
      else out.push({ line, source: trimmed, output: result });
    } catch (error) {
      fail(`cannot convert to AdGuard syntax: ${(error as Error).message}`);
    }
  }

  if (problems.length > 0) throw new RulesError(file, problems);
  return out;
}
