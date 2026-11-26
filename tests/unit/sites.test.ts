import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { within } from "../../src/compile/rules.ts";
import { loadSites, ROOT, siteIds } from "../../src/sites.ts";

const sites = loadSites();
const readme = readFileSync(join(ROOT, "readme.md"), "utf8");

describe("INTENTIONAL_SITES", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("selects every requested site even with spaces around a comma", () => {
    vi.stubEnv("INTENTIONAL_SITES", "youtube, linkedin");
    expect(siteIds()).toEqual(["linkedin", "youtube"]);
  });

  it.each(["linkedn", "youtube,linkedn"])("rejects an unknown site in %s", (selection) => {
    vi.stubEnv("INTENTIONAL_SITES", selection);
    expect(siteIds).toThrow(/unknown site.*linkedn/i);
  });

  it("uses all sites when the variable is empty", () => {
    vi.stubEnv("INTENTIONAL_SITES", undefined);
    const all = siteIds();
    vi.stubEnv("INTENTIONAL_SITES", "");
    expect(siteIds()).toEqual(all);
  });

  it("rejects a list of separators with no site IDs", () => {
    vi.stubEnv("INTENTIONAL_SITES", " , , ");
    expect(siteIds).toThrow(/must include a site ID/);
  });
});

describe.each(sites)("$spec.name", (site) => {
  it("is listed in the readme", () => {
    expect(readme).toContain(`(sites/${site.spec.id}/site.yaml)`);
  });

  it("serves only hosts inside its domains", () => {
    for (const host of site.spec.hosts) expect(within(host, site.spec.domains), host).toBe(true);
  });

  it("points intentional views at its own hosts", () => {
    for (const view of site.spec.intentional) {
      expect(site.spec.hosts, view.url).toContain(new URL(view.url).hostname);
    }
  });

  it("uses every fixture file", () => {
    const routed = new Set(site.tests.fixtures.map((f) => f.file));
    const files = readdirSync(join(site.dir, "fixtures")).filter((f) => f.endsWith(".html"));
    expect(files.filter((f) => !routed.has(f))).toEqual([]);
  });

  it("says where in-app navigation must land", () => {
    for (const page of site.tests.pages) {
      if (page.steps) expect(page.expectUrl, page.name).toBeDefined();
    }
  });

  it("has fixture routes that compile and pages that hit them", () => {
    const patterns = site.tests.fixtures.map((f) => new RegExp(f.url));
    for (const page of site.tests.pages) {
      expect(
        patterns.some((p) => p.test(page.url)),
        `${page.name}: no fixture route matches ${page.url}`,
      ).toBe(true);
    }
  });
});
