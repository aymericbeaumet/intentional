import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer, { type Browser } from "puppeteer";
import { installedExecutable } from "./browsers.ts";

export const UBLOCK_ID = "uBlock0@raymondhill.net";

export interface UblockConfig {
  /** Absolute path to the signed uBO xpi. */
  xpi: string;
  /** Filter list URLs uBO must use, replacing its defaults. */
  filterLists: string[];
  /** uBO advanced settings, e.g. `trustedListPrefixes`. */
  advancedSettings?: Record<string, string>;
  /** Extra "My filters" lines (kept empty for list-fidelity tests). */
  filters?: string[];
}

/**
 * Firefox reads enterprise policies from `distribution/policies.json` next to
 * its binary. We own the Puppeteer-managed Firefox under `.cache/`, so writing
 * there is safe and keeps the user's real profile untouched.
 */
function distributionDir(executable: string): string {
  const macos = executable.match(/^(.*\.app)\/Contents\/MacOS\//);
  if (macos?.[1]) return join(macos[1], "Contents", "Resources", "distribution");
  return join(dirname(executable), "distribution");
}

export function writePolicies(executable: string, ublock: UblockConfig | null): string {
  const dir = distributionDir(executable);
  const file = join(dir, "policies.json");
  if (!ublock) {
    rmSync(file, { force: true });
    return file;
  }
  mkdirSync(dir, { recursive: true });
  const policies = {
    policies: {
      DisableAppUpdate: true,
      DisableTelemetry: true,
      ExtensionSettings: {
        [UBLOCK_ID]: {
          installation_mode: "force_installed",
          install_url: pathToFileURL(ublock.xpi).href,
          private_browsing: true,
        },
      },
      "3rdparty": {
        Extensions: {
          [UBLOCK_ID]: {
            advancedSettings: Object.entries(ublock.advancedSettings ?? {}),
            toOverwrite: {
              filterLists: ublock.filterLists,
              filters: ublock.filters ?? [],
            },
          },
        },
      },
    },
  };
  writeFileSync(file, `${JSON.stringify(policies, null, 2)}\n`);
  return file;
}

export interface FirefoxOptions {
  proxyPort: number;
  ublock: UblockConfig | null;
  headless?: boolean;
}

/**
 * Policies are one file per Firefox install, read at startup, so concurrent
 * test runs take turns between writing it and Firefox having read it.
 */
async function withPoliciesLock<T>(executable: string, fn: () => Promise<T>): Promise<T> {
  const lock = join(distributionDir(executable), "..", "intentional-policies.lock");
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = Date.now() - (statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > 60_000) rmSync(lock, { recursive: true, force: true });
      else if (Date.now() > deadline) throw new Error(`timed out waiting for ${lock}`);
      else await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export async function launchFirefox(options: FirefoxOptions): Promise<Browser> {
  const executable = await installedExecutable("firefox");
  return withPoliciesLock(executable, () => {
    writePolicies(executable, options.ublock);
    return launch(executable, options);
  });
}

function launch(executable: string, options: FirefoxOptions): Promise<Browser> {
  return puppeteer.launch({
    browser: "firefox",
    executablePath: executable,
    headless: options.headless ?? true,
    acceptInsecureCerts: true,
    extraPrefsFirefox: {
      "network.proxy.type": 1,
      "network.proxy.http": "127.0.0.1",
      "network.proxy.http_port": options.proxyPort,
      "network.proxy.ssl": "127.0.0.1",
      "network.proxy.ssl_port": options.proxyPort,
      "network.proxy.no_proxies_on": "",
      "network.proxy.allow_hijacking_localhost": true,
      "network.dns.disablePrefetch": true,
      "network.http.speculative-parallel-limit": 0,
      "browser.safebrowsing.malware.enabled": false,
      "browser.safebrowsing.phishing.enabled": false,
      "extensions.autoDisableScopes": 0,
      "extensions.enabledScopes": 15,
      "xpinstall.signatures.required": true,
    },
  });
}
