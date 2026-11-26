import type { Browser, Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../../src/compile/build.ts";
import { hostConfigs } from "../../src/redirect/emit.ts";
import { intentionalResolve } from "../../src/redirect/runtime.js";
import { loadSites } from "../../src/sites.ts";
import { AdguardHarness } from "./harness/adguard.ts";
import { runCase, waitUntilReady } from "./harness/checks.ts";
import { ensureUblock } from "./harness/extensions.ts";
import { legApplies, legs } from "./harness/legs.ts";
import { type ProxyServer, startProxy } from "./harness/proxy.ts";
import { routes } from "./harness/routes.ts";

const sites = loadSites();
const files = build(sites, { version: "0.0.0-test" });
const headless = process.env.HEADFUL !== "1";
const only = process.env.LEGS?.split(",");
const allLegs = legs({ files, headless }).filter((leg) => !only || only.includes(leg.name));

const redirected = (url: string) => {
  const u = new URL(url);
  const site = sites.find((s) => s.spec.hosts.includes(u.hostname));
  const config = site && hostConfigs(site)[u.hostname];
  return config ? intentionalResolve(u.pathname + u.search, config.redirects) !== null : false;
};

let proxy: ProxyServer;
beforeAll(async () => {
  await ensureUblock();
  proxy = await startProxy(routes(sites, files));
});
afterAll(async () => proxy?.close());

describe.each(allLegs)("$name", (leg) => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await leg.launch(proxy.port);
    page = await browser.newPage();
    await leg.preparePage(page);
    if (leg.target) await waitUntilReady(page, leg.redirects);
  });
  afterAll(async () => browser?.close());

  for (const site of sites) {
    const cases = site.tests.pages.filter((c) => legApplies(leg, site, c, redirected(c.url)));
    describe.runIf(cases.length > 0)(site.spec.name, () => {
      it.each(cases)("$name", async (c) => {
        // A fresh tab per case: no sessionStorage, history or page state carried over.
        const tab = await browser.newPage();
        try {
          await leg.preparePage(tab);
          const outcome = await runCase(tab, c, leg);
          expect(outcome.problems, `final URL: ${outcome.url}`).toEqual([]);
        } finally {
          await tab.close();
        }
      });
    });
  }

  if (leg.name === "adguard-base" && allLegs.some((l) => l.name === "adguard")) {
    const matched = AdguardHarness.matched;
    it("coverage: every cosmetic rule hides something on some fixture", () => {
      const cosmetic = (text: string) => /#[@$?]?#/.test(text) && !text.includes("#%#");
      const untested = sites.flatMap((site) =>
        (files.get(`adguard/${site.spec.id}.txt`) ?? "")
          .split("\n")
          .filter((line) => line && !line.startsWith("!") && cosmetic(line) && !matched.has(line))
          .map((line) => `${site.spec.id}: ${line}`),
      );
      expect(untested, "add a fixture element and a `hidden` check for these rules").toEqual([]);
    });
  }
});
