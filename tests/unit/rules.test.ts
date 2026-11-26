import { describe, expect, it } from "vitest";
import { compileRules, RulesError } from "../../src/compile/rules.ts";
import type { Site, Target } from "../../src/model.ts";

const site = (rules: string): Site => ({
  dir: "/virtual/example",
  rules,
  spec: {
    id: "example",
    name: "Example",
    domains: ["example.com"],
    hosts: ["www.example.com"],
    intentional: [{ label: "Following", url: "https://www.example.com/following" }],
    policy: { allowed: ["a"], blocked: ["b"] },
  },
  tests: { fixtures: [{ url: "^https://www\\.example\\.com/", file: "home.html" }], pages: [] },
});

const outputs = (rules: string, target: Target = "ublock") =>
  compileRules(site(rules), target).flatMap((r) => r.output);

const problems = (rules: string, target: Target = "ublock") => {
  try {
    compileRules(site(rules), target);
    return [];
  } catch (error) {
    if (!(error instanceof RulesError)) throw error;
    return error.problems.map((p) => p.message);
  }
};

describe("compileRules accepts", () => {
  it.each([
    "www.example.com##.feed",
    "example.com,www.example.com##div[data-feed]:has(> a)",
    "www.example.com##:matches-path(/^\\/$/) main",
    "www.example.com##.card:has-text(/^Suggested$/):upward(2)",
    "www.example.com##+js(set-attr, a, data-x, true)",
    "||example.com/api/recommendations^$xhr,1p",
    "||cdn.example.com/feed.js$script",
    "/^https:\\/\\/www\\.example\\.com\\/feed$/$document",
    "||tracker.net^$domain=example.com",
    "www.example.com#@#.keep",
  ])("%s", (rule) => {
    expect(problems(rule)).toEqual([]);
  });

  it("keeps comments and blank lines", () => {
    expect(outputs("! hello\n\nwww.example.com##.a")).toEqual(["! hello", "", "www.example.com##.a"]);
  });

  it("converts to AdGuard syntax for the adguard target", () => {
    expect(outputs("www.example.com##:matches-path(/^\\/$/) main", "adguard")).toEqual([
      "[$path=/^\\\\/$/]www.example.com##main",
    ]);
    expect(outputs("www.example.com##.a:has-text(Suggested)", "adguard")).toEqual([
      "www.example.com#?#.a:contains(Suggested)",
    ]);
    expect(outputs("||example.com/x$xhr,1p", "adguard")).toEqual([
      "||example.com/x$xmlhttprequest,~third-party",
    ]);
  });

  it("resolves build-time directives per target", () => {
    const source =
      "!#if adguard\nwww.example.com#$#.a { color: red }\n!#else\nwww.example.com##.a:style(color: red)\n!#endif";
    expect(outputs(source, "adguard")).toEqual(["www.example.com#$#.a { color: red }"]);
    expect(outputs(source, "ublock")).toEqual(["www.example.com##.a:style(color: red)"]);
  });
});

describe("compileRules rejects", () => {
  it.each([
    ["##.generic", /must name at least one of this site's domains/],
    ["other.com##.feed", /`other.com` is not one of this site's domains/],
    ["notexample.com##.feed", /not one of this site's domains/],
    ["||other.com/feed^", /`other.com` is not one of this site's domains/],
    ["feed.js$xhr", /must be anchored/],
    ["/^https:\\/\\/other\\.com\\//$document", /must name one of this site's domains/],
    ["||example.com/x$uritransform=/a/b/", /`\$uritransform` is not allowed/],
    ["||example.com/x$removeparam=utm", /`\$removeparam` is not allowed/],
    ["www.example.com##+js(trusted-click-element, a)", /needs a trusted list/],
    ["www.example.com##+js(intentional-redirect, ^/$, /x)", /generated from site.yaml/],
    ["www.example.com##.a:matches-css(color: red)", /`:matches-css\(\)` is not supported/],
    ["www.example.com##.a:watch-attr(class)", /`:watch-attr\(\)` is not supported/],
    ["www.example.com#%#console.log(1)", /AdGuard-only syntax/],
    [" www.example.com##.a", /whitespace/],
    ["www.example.com##.a\nwww.example.com##.a", /duplicate of line 1/],
    ["!#if env_mobile\nwww.example.com##.a\n!#endif", /unknown identifier/],
  ])("%j", (rule, message) => {
    expect(problems(rule).join("\n")).toMatch(message);
  });

  it("reports every problem at once with line numbers", () => {
    try {
      compileRules(site("##.a\nwww.example.com##.ok\nother.com##.b"), "ublock");
      expect.unreachable();
    } catch (error) {
      expect((error as RulesError).problems.map((p) => p.line)).toEqual([1, 3]);
      expect((error as Error).message).toContain("sites/example/rules.txt");
    }
  });
});
