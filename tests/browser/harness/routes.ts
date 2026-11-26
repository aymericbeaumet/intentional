import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Site } from "../../../src/model.ts";
import { LISTS_HOST, SENTINEL, SENTINEL_HOST } from "./legs.ts";
import type { Resolver } from "./proxy.ts";

const html = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

/**
 * Serves compiled lists under https://lists.intentional.test/, fixtures under
 * each site's real hostnames, and an empty page for any other site URL (so
 * redirect targets without a fixture still load).
 */
export function routes(sites: Site[], files: Map<string, string>): Resolver {
  const fixtures = sites.flatMap((site) =>
    site.tests.fixtures.map((f) => ({
      pattern: new RegExp(f.url),
      body: readFileSync(join(site.dir, "fixtures", f.file), "utf8"),
    })),
  );
  const siteHosts = new Set(sites.flatMap((s) => s.spec.hosts));
  const text = { "content-type": "text/plain; charset=utf-8" };

  return (url) => {
    if (url.hostname === LISTS_HOST) {
      const path = url.pathname.slice(1);
      const content = files.get(path);
      if (content === undefined) return null;
      if (path === "ublock/intentional.txt") {
        return { status: 200, headers: text, body: [content, ...SENTINEL.ublock].join("\n") };
      }
      return { status: 200, headers: text, body: content };
    }
    if (url.hostname === SENTINEL_HOST) {
      return { status: 200, body: html(`<p class="sentinel">sentinel</p><p id="path">${url.pathname}</p>`) };
    }
    if (url.pathname === "/favicon.ico") return { status: 204, body: "" };
    const fixture = fixtures.find((f) => f.pattern.test(url.href));
    if (fixture) return { status: 200, body: fixture.body };
    if (siteHosts.has(url.hostname))
      return { status: 200, body: html(`<p data-unrouted>${url.pathname}</p>`) };
    return null;
  };
}
