import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import type { Site, Target } from "../../../src/model.ts";
import { runtimeScript } from "../../../src/redirect/emit.ts";
import { ROOT } from "../../../src/sites.ts";
import { AdguardHarness } from "./adguard.ts";
import { launchChrome } from "./chrome.ts";
import { launchFirefox } from "./firefox.ts";

export const LISTS_HOST = "lists.intentional.test";
export const SENTINEL_HOST = "sentinel.intentional.test";

const SENTINEL_REDIRECT = { redirects: [{ from: "^/go$", to: "/arrived" }], select: [] };

/** Rules appended to the served lists so a leg can tell when its blocker is ready. */
export const SENTINEL = {
  ublock: [
    `${SENTINEL_HOST}##.sentinel`,
    `${SENTINEL_HOST}##+js(intentional-redirect, 0, ^/go$, /arrived, ${SENTINEL_HOST})`,
  ],
  adguard: [
    `${SENTINEL_HOST}##.sentinel`,
    `${SENTINEL_HOST}#%#${runtimeScript({ [SENTINEL_HOST]: SENTINEL_REDIRECT })}`,
  ],
};

export const UBLOCK = JSON.parse(readFileSync(join(ROOT, "tests", "browser", "ublock.json"), "utf8")) as {
  version: string;
  url: string;
  sha256: string;
};
export const UBLOCK_XPI = join(ROOT, ".cache", "extensions", `ublock-${UBLOCK.version}`, "ublock.xpi");

export interface Leg {
  name: string;
  /** Which compiled list this leg exercises (for `skip`). */
  target: Target | null;
  /** Whether redirects are active in this leg. */
  redirects: boolean;
  /** Whether cosmetic filtering is active in this leg. */
  cosmetics: boolean;
  launch(proxyPort: number): Promise<Browser>;
  preparePage(page: Page): Promise<void>;
  adguard?: AdguardHarness;
}

export interface LegInputs {
  files: Map<string, string>;
  headless: boolean;
}

export function legs({ files, headless }: LegInputs): Leg[] {
  const ublockLeg = (redirects: boolean): Leg => ({
    name: redirects ? "ublock" : "ublock-base",
    target: "ublock",
    redirects,
    cosmetics: true,
    launch: (port) =>
      launchFirefox({
        proxyPort: port,
        headless,
        ublock: {
          xpi: UBLOCK_XPI,
          filterLists: [`https://${LISTS_HOST}/ublock/intentional.txt`],
          advancedSettings: redirects
            ? { userResourcesLocation: `https://${LISTS_HOST}/ublock/scriptlets.js` }
            : {},
        },
      }),
    preparePage: async () => {},
  });

  const adguardLeg = (trusted: boolean): Leg => {
    const list = [files.get("adguard/intentional.txt") ?? "", ...SENTINEL.adguard].join("\n");
    const harness = new AdguardHarness(list, trusted);
    return {
      name: trusted ? "adguard" : "adguard-base",
      target: "adguard",
      redirects: trusted,
      cosmetics: true,
      launch: (port) => launchChrome(port, headless),
      preparePage: (page) => harness.attach(page),
      adguard: harness,
    };
  };

  const userscript = files.get("userscript/intentional.user.js") ?? "";
  return [
    ublockLeg(true),
    ublockLeg(false),
    adguardLeg(true),
    adguardLeg(false),
    {
      name: "userscript",
      target: null,
      redirects: true,
      cosmetics: false,
      launch: (port) => launchChrome(port, headless),
      preparePage: (page) => page.evaluateOnNewDocument(userscript).then(() => {}),
    },
  ];
}

/** Which legs run a page case, and what they check. */
export function legApplies(leg: Leg, site: Site, page: Site["tests"]["pages"][number], redirected: boolean) {
  const skip: string[] = page.skip ?? [];
  if (skip.includes(leg.name) || (leg.target && skip.includes(leg.target))) return false;
  if (page.expectUrl) return leg.redirects;
  if (redirected || page.steps) return !leg.redirects;
  return site.tests.pages.length > 0;
}
