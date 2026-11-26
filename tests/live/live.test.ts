// Nightly canary against the real sites. Two questions per case:
//   1. Does the markup our rules rely on still exist? (`exists`, no blocker)
//   2. Do our compiled lists still work there? (`hidden`, `expectUrl`, real uBO)
// Cases with `login: true` run only when .auth/<site>.json exists
// (`npm run capture -- login <site>`).
import { resolve } from "node:path";
import type { Browser, Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCookies } from "../../src/capture.ts";
import { build } from "../../src/compile/build.ts";
import type { LiveCase, Site } from "../../src/model.ts";
import { loadSites } from "../../src/sites.ts";
import { launchChrome } from "../browser/harness/chrome.ts";
import { ensureUblock } from "../browser/harness/extensions.ts";
import { launchFirefox } from "../browser/harness/firefox.ts";
import { LISTS_HOST, UBLOCK_XPI } from "../browser/harness/legs.ts";
import { type ProxyServer, startProxy } from "../browser/harness/proxy.ts";

const sites = loadSites().filter((s) => (s.tests.live ?? []).length > 0);
const files = build(sites, { version: "0.0.0-live" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let proxy: ProxyServer;
let plain: Browser;
let blocked: Browser;

beforeAll(async () => {
  await ensureUblock();
  proxy = await startProxy(
    (url) => {
      const content = files.get(url.pathname.slice(1));
      return url.hostname === LISTS_HOST && content !== undefined
        ? { status: 200, headers: { "content-type": "text/plain" }, body: content }
        : null;
    },
    { passthrough: (host) => host !== LISTS_HOST },
  );
  plain = await launchChrome(proxy.port);
  blocked = await launchFirefox({
    proxyPort: proxy.port,
    ublock: {
      xpi: resolve(UBLOCK_XPI),
      filterLists: [`https://${LISTS_HOST}/ublock/intentional.txt`],
      advancedSettings: { userResourcesLocation: `https://${LISTS_HOST}/ublock/scriptlets.js` },
    },
  });
  await sleep(5_000); // let uBO fetch and compile the list
});

afterAll(async () => {
  await plain?.close();
  await blocked?.close();
  await proxy?.close();
});

async function open(browser: Browser, site: Site, c: LiveCase): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  if (c.login) await browser.setCookie(...readCookies(site.spec.id));
  if (c.cookies) await browser.setCookie(...c.cookies.map((k) => ({ ...k, path: "/" })));
  await page.goto(c.url, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
  await sleep(2_000);
  return page;
}

/**
 * Sites answer automated, logged-out visits from busy IPs with challenges, rate
 * limits or login walls. That says nothing about our rules, so such a run is
 * inconclusive (skipped), not failed. Returns the reason, or null for a real page.
 */
async function wall(page: Page, site: Site): Promise<string | null> {
  const text = await page
    // biome-ignore lint/performance/useDomNodeTextContent: rendered text skips inline scripts, which would crowd out the challenge message
    .evaluate(() => `${document.title}\n${document.body?.innerText.slice(0, 1000) ?? ""}`)
    .catch(() => "");
  const challenge = text.match(
    /prove your humanity|drag the slider|verify (that )?you are (a )?human|unusual traffic|are you a robot|captcha/i,
  );
  if (challenge) return `bot challenge ("${challenge[0]}")`;
  const url = new URL(page.url());
  if (url.protocol === "chrome-error:" || url.href === "about:blank")
    return "the page didn't load (blocked?)";
  if (/[?&](js_challenge|captcha|challenge)=/.test(url.search)) return `bot challenge at ${url.origin}`;
  if (!site.spec.domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))) {
    return `sent off-site to ${url.origin}${url.pathname}`;
  }
  if (/^(consent|accounts)\./.test(url.hostname) || /\/(login|signin|sorry)\b/i.test(url.pathname)) {
    return `wall at ${url.origin}${url.pathname}`;
  }
  return null;
}

const counts = (page: Page, selectors: string[]) =>
  page.evaluate(
    (list: string[]) =>
      list.map((s) => {
        const els = [...document.querySelectorAll(s)];
        return { selector: s, count: els.length, visible: els.filter((e) => e.checkVisibility()).length };
      }),
    selectors,
  );

describe.each(sites)("$spec.name", (site) => {
  for (const c of site.tests.live ?? []) {
    const runnable = !c.login || readCookies(site.spec.id).length > 0;
    describe.runIf(runnable)(c.name, () => {
      it.runIf((c.exists ?? []).length > 0)("markup our rules rely on still exists", async (ctx) => {
        const page = await open(plain, site, c);
        try {
          const reason = await wall(page, site);
          if (reason) ctx.skip(`inconclusive: ${reason}`);
          const missing = (await counts(page, c.exists ?? []))
            .filter((r) => r.count === 0)
            .map((r) => r.selector);
          expect(missing, `on ${page.url()}`).toEqual([]);
        } finally {
          await page.close();
        }
      });

      it.runIf((c.hidden ?? []).length > 0 || Boolean(c.expectUrl))(
        "the list works on the live page",
        async (ctx) => {
          const page = await open(blocked, site, c);
          try {
            const reason = await wall(page, site);
            if (reason) ctx.skip(`inconclusive: ${reason}`);
            if (c.expectUrl) expect(page.url()).toBe(c.expectUrl);
            const shown = (await counts(page, c.hidden ?? []))
              .filter((r) => r.visible > 0)
              .map((r) => r.selector);
            expect(shown, "still visible").toEqual([]);
          } finally {
            await page.close();
          }
        },
      );
    });
  }
});
