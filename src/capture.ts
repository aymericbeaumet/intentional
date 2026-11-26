import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { getInstalledBrowsers } from "@puppeteer/browsers";
import puppeteer, { type Browser, type Cookie } from "puppeteer";
import { loadSite, ROOT } from "./sites.ts";

const AUTH_DIR = join(ROOT, ".auth");
export const authFile = (site: string) => join(AUTH_DIR, `${site}.json`);

async function chrome(headless: boolean): Promise<Browser> {
  const installed = await getInstalledBrowsers({ cacheDir: join(ROOT, ".cache", "puppeteer") });
  const executablePath = installed.find((b) => b.browser === "chrome")?.executablePath;
  if (!executablePath) throw new Error("Chrome for Testing is not installed: run `npm run browsers`");
  return puppeteer.launch({ executablePath, headless, defaultViewport: { width: 1280, height: 900 } });
}

export function readCookies(site: string): Cookie[] {
  return existsSync(authFile(site)) ? (JSON.parse(readFileSync(authFile(site), "utf8")) as Cookie[]) : [];
}

/** Opens a visible browser to log in, then saves that session's cookies to .auth/<site>.json (gitignored). */
async function login(id: string): Promise<void> {
  const site = loadSite(id);
  const browser = await chrome(false);
  try {
    const page = await browser.newPage();
    await page.goto(site.spec.intentional[0]?.url ?? `https://${site.spec.hosts[0]}/`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(`Log in to ${site.spec.name} in the browser window, then press Enter here. `);
    rl.close();
    const cookies = (await browser.cookies()).filter((c) =>
      site.spec.domains.some((d) => c.domain.replace(/^\./, "").endsWith(d)),
    );
    mkdirSync(AUTH_DIR, { recursive: true });
    writeFileSync(authFile(id), `${JSON.stringify(cookies, null, 2)}\n`, { mode: 0o600 });
    console.log(`saved ${cookies.length} cookies to .auth/${id}.json (never commit this file)`);
  } finally {
    await browser.close();
  }
}

/**
 * Runs in the page: a skeleton of the DOM with structure and stable hooks only.
 * Scripts, styles, media and most text are dropped; long runs of similar
 * siblings are cut to three. Review the result before committing it.
 */
function skeleton(): string {
  const DROP = new Set([
    "SCRIPT",
    "STYLE",
    "LINK",
    "META",
    "NOSCRIPT",
    "TEMPLATE",
    "IFRAME",
    "SVG",
    "PATH",
    "CANVAS",
  ]);
  const KEEP = new Set(["id", "class", "role", "href", "title", "name", "type", "hidden", "slot"]);
  const escapeAttr = (v: string) => v.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const escapeText = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const keepAttribute = (el: Element, name: string) =>
    KEEP.has(name) || name.startsWith("data-") || name.startsWith("aria-") || el.tagName.includes("-");

  const render = (el: Element, depth: number): string => {
    if (DROP.has(el.tagName) || depth > 60) return "";
    const tag = el.tagName.toLowerCase();
    const attrs = [...el.attributes]
      .filter((a) => keepAttribute(el, a.name) && a.value.length <= 120 && !a.name.startsWith("on"))
      .map((a) => {
        let value = a.value;
        if (a.name === "class") value = value.split(/\s+/).slice(0, 6).join(" ");
        if (a.name === "href") value = value.replace(/^https?:\/\/[^/]+/, "");
        return value === "" ? ` ${a.name}` : ` ${a.name}="${escapeAttr(value)}"`;
      })
      .join("");
    let previous = "";
    let run = 0;
    let inner = "";
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").trim();
        if (text && text.length <= 30 && !/[@\d]/.test(text)) inner += escapeText(text);
        continue;
      }
      if (!(child instanceof Element)) continue;
      run = child.tagName === previous ? run + 1 : 0;
      previous = child.tagName;
      if (run < 3) inner += render(child, depth + 1);
    }
    return `<${tag}${attrs}>${inner}</${tag}>`;
  };
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>captured</title></head>\n${render(document.body, 0)}\n</html>\n`;
}

async function capture(id: string, url: string, name?: string): Promise<void> {
  const site = loadSite(id);
  const headless = !process.argv.includes("--headful");
  const browser = await chrome(headless);
  try {
    const cookies = readCookies(id);
    if (cookies.length > 0) await browser.setCookie(...cookies);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const html = await page.evaluate(skeleton);
    const file = `${name ?? `captured-${new URL(url).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}`}.html`;
    const out = join(site.dir, "fixtures", file);
    if (existsSync(out) && !process.argv.includes("--force")) throw new Error(`${out} exists (use --force)`);
    writeFileSync(out, html);
    console.log(
      `wrote sites/${id}/fixtures/${file} (${Math.round(html.length / 1024)} KiB, ${cookies.length ? "logged in" : "logged out"}).\n` +
        "Trim it to the elements your rules and checks need, and check it holds no personal data.",
    );
  } finally {
    await browser.close();
  }
}

/** `npm run capture -- login <site>` or `npm run capture -- <site> <url> [name] [--headful] [--force]`. */
export async function capture_(args: string[]): Promise<void> {
  const [first, second, third] = args.filter((a) => !a.startsWith("--"));
  if (first === "login" && second) return login(second);
  if (first && second) return capture(first, second, third);
  throw new Error("usage: npm run capture -- login <site> | npm run capture -- <site> <url> [name]");
}

export { capture_ as capture };
