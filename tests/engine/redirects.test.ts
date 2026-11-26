import { describe, expect, it } from "vitest";
import { hostConfigs } from "../../src/redirect/emit.ts";
import { intentionalResolve } from "../../src/redirect/runtime.js";
import { loadSites } from "../../src/sites.ts";

const sites = loadSites();

/** What the runtime does to a URL: the absolute URL it redirects to, or null. */
function redirect(siteIndex: number, href: string): string | null {
  const url = new URL(href);
  const config = hostConfigs(sites[siteIndex]!)[url.hostname];
  if (!config) return null;
  const to = intentionalResolve(url.pathname + url.search, config.redirects);
  return to === null ? null : new URL(to, url.origin).href;
}

describe.each(sites.map((site, i) => [site.spec.name, i] as const))("%s", (_name, i) => {
  const site = sites[i]!;

  it.each(site.tests.redirects ?? [])("$url → $expect", ({ url, expect: expected }) => {
    expect(redirect(i, url)).toBe(expected);
  });

  it("redirect targets never redirect again (no chains, no loops)", () => {
    for (const { expect: target } of site.tests.redirects ?? []) {
      if (target) expect(redirect(i, target), target).toBeNull();
    }
  });

  it("intentional views are never redirected", () => {
    for (const { url } of site.spec.intentional) expect(redirect(i, url), url).toBeNull();
  });

  it("page cases with expectUrl agree with the resolver", () => {
    for (const page of site.tests.pages) {
      // A page that doesn't redirect (e.g. a tab-select case) must expect its own URL.
      if (page.expectUrl && !page.steps) {
        expect(redirect(i, page.url) ?? page.url, page.name).toBe(page.expectUrl);
      }
    }
  });

  it("every redirect rule is exercised by a test", () => {
    const rules = site.spec.redirects ?? [];
    const untested = new Set(rules);
    for (const test of site.tests.redirects ?? []) {
      if (test.expect === null) continue;
      const { hostname, pathname, search } = new URL(test.url);
      const winner = rules.find(
        (rule) =>
          (rule.hosts ?? site.spec.hosts).includes(hostname) && new RegExp(rule.from).test(pathname + search),
      );
      if (winner) untested.delete(winner);
    }
    expect([...untested], "add a positive redirect case for each of these rules").toEqual([]);
  });

  it("the policy is documented", () => {
    expect(site.spec.policy.allowed.length).toBeGreaterThan(0);
    expect(site.spec.policy.blocked.length).toBeGreaterThan(0);
  });
});
