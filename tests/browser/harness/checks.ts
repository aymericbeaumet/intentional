import type { Page } from "puppeteer";
import type { PageCase } from "../../../src/model.ts";
import { SENTINEL_HOST } from "./legs.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function poll<T>(probe: () => Promise<T>, done: (value: T) => boolean, timeout: number): Promise<T> {
  const deadline = Date.now() + timeout;
  let value = await probe();
  while (!done(value) && Date.now() < deadline) {
    await sleep(100);
    value = await probe().catch(() => value);
  }
  return value;
}

/** Blocks until the blocker in this page has loaded our list (and redirects, when expected). */
export async function waitUntilReady(page: Page, redirects: boolean, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.goto(`https://${SENTINEL_HOST}/go`, { waitUntil: "load" }).catch(() => {});
    await sleep(300);
    const state = await page
      .evaluate(() => {
        const sentinel = document.querySelector(".sentinel");
        return {
          hidden: sentinel ? !sentinel.checkVisibility() : false,
          path: location.pathname,
        };
      })
      .catch(() => ({ hidden: false, path: "" }));
    if (state.hidden && (!redirects || state.path === "/arrived")) return;
  }
  throw new Error(`blocker not ready after ${timeout}ms (redirects: ${redirects})`);
}

interface Visibility {
  selector: string;
  count: number;
  visible: number;
}

const visibility = (page: Page, selectors: string[]) =>
  page.evaluate((list: string[]) => {
    return list.map((selector) => {
      const elements = [...document.querySelectorAll(selector)];
      const visible = elements.filter((e) =>
        e.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
      ).length;
      return { selector, count: elements.length, visible };
    });
  }, selectors) as Promise<Visibility[]>;

export interface Outcome {
  url: string;
  problems: string[];
}

/** Loads a page case and returns every way it differs from its expectations. */
export async function runCase(page: Page, c: PageCase, opts: { cosmetics: boolean; redirects: boolean }) {
  // A URL differing from the previous case only by its #fragment wouldn't reload; start clean.
  await page.goto("about:blank").catch(() => {});
  await page.goto(c.url, { waitUntil: "load" }).catch(() => {});
  for (const step of c.steps ?? []) {
    await sleep(300);
    // Like a real single-page app: change the URL, then re-render (blockers re-check on DOM changes).
    await page
      .evaluate((path: string) => {
        history.pushState({}, "", path);
        document.body?.append(Object.assign(document.createElement("div"), { hidden: true }));
      }, step.navigate)
      .catch(() => {});
  }
  const expectedUrl = c.expectUrl ?? (c.steps ? null : c.url);
  const hidden = opts.cosmetics ? (c.hidden ?? []) : [];
  const visible = c.visible ?? [];

  const probe = async (): Promise<Outcome> => {
    const url = page.url();
    const problems: string[] = [];
    if (expectedUrl && url !== expectedUrl) problems.push(`ended on ${url}, expected ${expectedUrl}`);
    if (expectedUrl === url || !expectedUrl) {
      for (const v of await visibility(page, hidden)) {
        if (v.count === 0) problems.push(`hidden: ${v.selector} matched nothing`);
        else if (v.visible > 0) problems.push(`hidden: ${v.selector} is visible`);
      }
      for (const v of await visibility(page, visible)) {
        if (v.count === 0) problems.push(`visible: ${v.selector} matched nothing`);
        else if (v.visible < v.count) problems.push(`visible: ${v.selector} is hidden`);
      }
    }
    return { url, problems };
  };

  const outcome = await poll(probe, (o) => o.problems.length === 0, 5_000);
  if (outcome.problems.length === 0 && !c.expectUrl && opts.redirects) {
    // Give a wrong redirect the time to happen before declaring the page stable.
    await sleep(400);
    return probe();
  }
  return outcome;
}
