import { RuleParser } from "@adguard/agtree";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "../../src/compile/build.ts";
import { compileRules } from "../../src/compile/rules.ts";
import { loadSites } from "../../src/sites.ts";
import { adguardEngine, type NetworkEngine, ublockEngine } from "./engines.ts";

const sites = loadSites();
const files = build(sites, { version: "0.0.0-test" });
const engines: Record<"ublock" | "adguard", NetworkEngine> = {} as never;
/** uBO filter texts that blocked at least one `expect: block` case. */
const exercised = new Set<string>();

beforeAll(async () => {
  engines.ublock = await ublockEngine(files.get("ublock/intentional.txt")!);
  engines.adguard = adguardEngine(files.get("adguard/intentional.txt")!);
});

describe.each(sites.filter((s) => (s.tests.network ?? []).length > 0))("$spec.name", (site) => {
  describe.each(["ublock", "adguard"] as const)("%s", (target) => {
    it.each(site.tests.network ?? [])("$expect $type $url", (c) => {
      const verdict = engines[target].match(c.url, c.type, c.from);
      expect(
        verdict.blocked ? "block" : "allow",
        `${c.why ?? ""} (decided by: ${verdict.rule ?? "no rule"})`,
      ).toBe(c.expect);
      if (target === "ublock" && verdict.blocked && verdict.rule) exercised.add(verdict.rule.toLowerCase());
    });
  });
});

describe("coverage", () => {
  it.each(sites)("every network rule of $spec.name is exercised by a test", (site) => {
    const network = compileRules(site, "ublock")
      .filter((r) => r.line > 0 && !r.source.startsWith("!") && r.source !== "")
      .filter((r) => RuleParser.parse(r.source).category === "Network")
      .map((r) => `line ${r.line}: ${r.source}`);
    const untested = network.filter(
      (entry) => !exercised.has(entry.replace(/^line \d+: /, "").toLowerCase()),
    );
    expect(untested, "add a `network` case with `expect: block` to tests.yaml").toEqual([]);
  });
});
