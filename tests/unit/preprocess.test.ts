import { describe, expect, it } from "vitest";
import { DirectiveError, evaluate, preprocess } from "../../src/compile/preprocess.ts";

const texts = (source: string, target: Parameters<typeof preprocess>[1]) =>
  preprocess(source, target).map((l) => l.text);

describe("evaluate", () => {
  it.each([
    ["ext_ublock", "ublock", true],
    ["ext_ublock", "adguard", false],
    ["!ext_ublock", "brave", true],
    ["ext_ublock || ext_brave", "brave", true],
    ["adguard && !ext_brave", "adguard", true],
    ["!(ext_ublock || ext_brave)", "adguard", true],
    ["!(ext_ublock || ext_brave)", "ublock", false],
  ] as const)("%s on %s is %s", (expression, target, expected) => {
    expect(evaluate(expression, target)).toBe(expected);
  });

  it("rejects runtime identifiers, which Brave would silently ignore", () => {
    expect(() => evaluate("env_mobile", "ublock")).toThrow(/unknown identifier "env_mobile"/);
    expect(() => evaluate("constructor", "ublock")).toThrow(/unknown identifier "constructor"/);
  });

  it("rejects malformed expressions", () => {
    expect(() => evaluate("ext_ublock &&", "ublock")).toThrow(DirectiveError);
    expect(() => evaluate("(adguard", "adguard")).toThrow(/missing "\)"/);
    expect(() => evaluate("adguard adguard", "adguard")).toThrow(/unexpected/);
    expect(() => evaluate("a-b", "adguard")).toThrow(/cannot parse/);
  });
});

describe("preprocess", () => {
  const source = ["a", "!#if ext_ublock", "u", "!#else", "not-u", "!#endif", "z"].join("\n");

  it("keeps the matching branch and drops directives", () => {
    expect(texts(source, "ublock")).toEqual(["a", "u", "z"]);
    expect(texts(source, "adguard")).toEqual(["a", "not-u", "z"]);
  });

  it("handles nesting", () => {
    const nested = ["!#if !ext_brave", "x", "!#if adguard", "y", "!#endif", "!#endif"].join("\n");
    expect(texts(nested, "adguard")).toEqual(["x", "y"]);
    expect(texts(nested, "ublock")).toEqual(["x"]);
    expect(texts(nested, "brave")).toEqual([]);
  });

  it("resolves indented directives before the lists are published", () => {
    const input = "  !#if ext_ublock\nu\n\t!#else\nother\n !#endif";
    expect(texts(input, "ublock")).toEqual(["u"]);
    expect(texts(input, "brave")).toEqual(["other"]);
  });

  it("keeps source line numbers", () => {
    expect(preprocess(source, "adguard").map((l) => l.line)).toEqual([1, 5, 7]);
  });

  it.each([
    ["!#if adguard\nx", /never closed/],
    ["!#endif", /without `!#if`/],
    ["!#if adguard\n!#else\n!#else\n!#endif", /duplicate/],
    ["!#include other.txt", /unsupported directive/],
    [" !#include other.txt", /unsupported directive/],
    ["!#if ext_ublock\n!#else if adguard\n!#endif", /unexpected text/],
  ])("rejects %j", (bad, message) => {
    expect(() => preprocess(bad, "ublock")).toThrow(message);
  });
});
