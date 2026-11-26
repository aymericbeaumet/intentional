import puppeteer, { type Browser } from "puppeteer";
import { installedExecutable } from "./browsers.ts";

export async function launchChrome(proxyPort: number, headless = true): Promise<Browser> {
  return puppeteer.launch({
    browser: "chrome",
    executablePath: await installedExecutable("chrome"),
    headless,
    acceptInsecureCerts: true,
    args: [
      `--proxy-server=127.0.0.1:${proxyPort}`,
      "--proxy-bypass-list=<-loopback>",
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
    ],
  });
}
