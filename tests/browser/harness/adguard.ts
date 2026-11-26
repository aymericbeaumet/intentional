import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CosmeticOption, Engine, Request, RequestType } from "@adguard/tsurlfilter";
import type { Page, ResourceType } from "puppeteer";

const require = createRequire(import.meta.url);
const EXTENDED_CSS = readFileSync(
  join(dirname(require.resolve("@adguard/extended-css")), "..", "dist", "extended-css.js"),
  "utf8",
);

const TYPES: Partial<Record<ResourceType, RequestType>> = {
  document: RequestType.Document,
  xhr: RequestType.XmlHttpRequest,
  fetch: RequestType.XmlHttpRequest,
  script: RequestType.Script,
  stylesheet: RequestType.Stylesheet,
  image: RequestType.Image,
  media: RequestType.Media,
  font: RequestType.Font,
  websocket: RequestType.WebSocket,
};

interface Payload {
  /** Plain CSS hiding rules: [rule text, selector]. */
  css: [string, string][];
  /** Extended CSS rules: [rule text, selector, full css rule]. */
  extCss: [string, string, string][];
  scripts: string[];
}

/**
 * Applies an AdGuard list to a page the way the AdGuard extension does: the
 * real tsurlfilter engine decides what applies to each URL, ExtendedCss runs
 * procedural selectors, and AdGuard's own script output runs in the page.
 * `trusted: false` mirrors a custom list added without the Trusted checkbox.
 */
export class AdguardHarness {
  readonly #engine: Engine;
  readonly #trusted: boolean;
  /** AdGuard rule texts that matched at least one element, across every harness. */
  static readonly matched = new Set<string>();

  constructor(list: string, trusted: boolean) {
    this.#engine = Engine.createSync({ filters: [{ id: 1, content: list, ignoreJS: !trusted }] });
    this.#trusted = trusted;
  }

  #text(rule: { getFilterListId(): number; getIndex(): number }): string {
    return this.#engine.retrieveRuleText(rule.getFilterListId(), rule.getIndex()) ?? "";
  }

  payload(href: string): Payload {
    const request = new Request(href, null, RequestType.Document);
    const result = this.#engine.getCosmeticResult(request, CosmeticOption.CosmeticOptionAll);
    const css: Payload["css"] = [];
    const extCss: Payload["extCss"] = [];
    for (const rule of [...result.elementHiding.generic, ...result.elementHiding.specific]) {
      css.push([this.#text(rule), rule.getContent()]);
    }
    for (const rule of [...result.elementHiding.genericExtCss, ...result.elementHiding.specificExtCss]) {
      extCss.push([
        this.#text(rule),
        rule.getContent(),
        `${rule.getContent()} { display: none !important; }`,
      ]);
    }
    for (const rule of [...result.CSS.specific, ...result.CSS.specificExtCss]) {
      const content = rule.getContent();
      extCss.push([this.#text(rule), content.slice(0, content.lastIndexOf("{")).trim(), content]);
    }
    const scripts = this.#trusted ? result.getScriptRules().flatMap((rule) => rule.getScript() ?? []) : [];
    return { css, extCss, scripts };
  }

  async attach(page: Page): Promise<void> {
    await page.exposeFunction("__intentionalAdguard", (href: string) => this.payload(href));
    await page.exposeFunction("__intentionalMatched", (texts: string[]) => {
      for (const text of texts) AdguardHarness.matched.add(text);
    });
    await page.evaluateOnNewDocument(`${EXTENDED_CSS};(${contentScript.toString()})();`);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = TYPES[request.resourceType()] ?? RequestType.Other;
      const frame = request.frame();
      const source = type === RequestType.Document ? null : (frame?.url() ?? null);
      const result = this.#engine.matchRequest(new Request(request.url(), source, type));
      const rule =
        type === RequestType.Document ? result.getDocumentBlockingResult() : result.getBasicResult();
      if (rule && !rule.isAllowlist()) void request.abort("blockedbyclient");
      else void request.continue();
    });
  }
}

/** Runs in the page at document start (stringified, so it must be self-contained). */
function contentScript() {
  type Win = Window & {
    __intentionalAdguard(href: string): Promise<Payload>;
    __intentionalMatched(texts: string[]): Promise<void>;
    ExtendedCss: {
      new (config: { cssRules: string[] }): { apply(): void };
      query(selector: string): HTMLElement[];
    };
  };
  const win = window as unknown as Win;
  void win.__intentionalAdguard(location.href).then((payload) => {
    const apply = () => {
      const style = document.createElement("style");
      style.textContent = payload.css
        .map(([, selector]) => `${selector} { display: none !important; }`)
        .join("\n");
      document.documentElement.append(style);
      if (payload.extCss.length > 0) {
        new win.ExtendedCss({ cssRules: payload.extCss.map(([, , rule]) => rule) }).apply();
      }
      for (const script of payload.scripts) Function(script)();
      const matched = () => {
        const texts: string[] = [];
        for (const [text, selector] of payload.css) {
          try {
            if (document.querySelector(selector)) texts.push(text);
          } catch {}
        }
        for (const [text, selector] of payload.extCss) {
          if (win.ExtendedCss.query(selector).length > 0) texts.push(text);
        }
        return texts;
      };
      document.addEventListener("DOMContentLoaded", () => void win.__intentionalMatched(matched()));
      if (document.readyState !== "loading") void win.__intentionalMatched(matched());
      document.documentElement.dataset.intentionalApplied = "1";
    };
    if (document.documentElement) apply();
    else document.addEventListener("readystatechange", apply, { once: true });
  });
}
