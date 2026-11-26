import { join } from "node:path";
import { getInstalledBrowsers } from "@puppeteer/browsers";

export const CACHE_DIR = join(import.meta.dirname, "..", "..", "..", ".cache", "puppeteer");

/** Executable of the newest browser installed by `npm run browsers`. */
export async function installedExecutable(browser: "chrome" | "firefox"): Promise<string> {
  const installed = (await getInstalledBrowsers({ cacheDir: CACHE_DIR }))
    .filter((b) => b.browser === browser)
    .sort((a, b) => b.buildId.localeCompare(a.buildId, undefined, { numeric: true }));
  const newest = installed[0];
  if (!newest) throw new Error(`${browser} is not installed: run \`npm run browsers\``);
  return newest.executablePath;
}
