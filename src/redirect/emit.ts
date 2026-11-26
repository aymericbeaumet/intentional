import { transformSync } from "esbuild";
import type { Redirect, Select, Site } from "../model.ts";
import { intentionalRegister, intentionalResolve, intentionalRun } from "./runtime.js";

export interface HostConfig {
  redirects: Redirect[];
  select: Select[];
}

const RUNTIME = [intentionalResolve, intentionalRun].map(String).join("\n");

const minify = (code: string) => transformSync(code, { minify: true, target: "es2020" }).code.trim();

const appliesTo = (host: string, item: { hosts?: string[] }) => !item.hosts || item.hosts.includes(host);

/** Per-hostname runtime config for one site. */
export function hostConfigs(site: Site): Record<string, HostConfig> {
  const configs: Record<string, HostConfig> = {};
  for (const host of site.spec.hosts) {
    const redirects = (site.spec.redirects ?? []).filter((r) => appliesTo(host, r));
    const select = (site.spec.select ?? []).filter((s) => appliesTo(host, s));
    if (redirects.length + select.length === 0) continue;
    configs[host] = {
      redirects: redirects.map(({ from, to }) => ({ from, to })),
      select: select.map(({ when, click, selected }) => ({ when, click, selected })),
    };
  }
  return configs;
}

/** Self-contained script that runs the config matching `location.hostname`. */
export function runtimeScript(configs: Record<string, HostConfig>): string {
  return minify(
    `(function(){${RUNTIME}\nvar c=${JSON.stringify(configs)}[location.hostname];if(c)intentionalRun(c,window);})();`,
  );
}

/** AdGuard: one `#%#` JS rule per site. AdGuard runs it only from a list added as Trusted. */
export function adguardRules(site: Site): string[] {
  const configs = hostConfigs(site);
  const hosts = Object.keys(configs);
  return hosts.length === 0 ? [] : [`${hosts.join(",")}#%#${runtimeScript(configs)}`];
}

/** uBO splits scriptlet arguments on commas; a literal comma is written `\,`. */
const ublockArg = (value: string) => value.replaceAll(",", "\\,");

/** uBO: scriptlet filters served by `scriptlets.js` through `userResourcesLocation`. */
export function ublockRules(site: Site): string[] {
  const filter = (hosts: string[], scriptlet: string, args: string[]) => {
    if (hosts.length === 0 || hosts.some((host) => !site.spec.hosts.includes(host))) {
      throw new Error(
        `sites/${site.spec.id}/site.yaml: ${scriptlet} must use hosts from the site's hosts list`,
      );
    }
    return `${hosts.join(",")}##+js(intentional-${scriptlet}, ${[...args, hosts.join("|")].map(ublockArg).join(", ")})`;
  };
  return [
    ...(site.spec.redirects ?? []).map((r, order) =>
      filter(r.hosts ?? site.spec.hosts, "redirect", [String(order), r.from, r.to]),
    ),
    ...(site.spec.select ?? []).map((s) =>
      filter(s.hosts ?? site.spec.hosts, "select", [s.when, s.click, s.selected]),
    ),
  ];
}

/**
 * The uBO resources file (`userResourcesLocation`), in uBO's function format.
 * uBO rewrites resource source before injecting it and chokes on comments, so
 * each body ships minified.
 */
export function ublockResources(): string {
  const scriptlet = (name: string, kind: string, params: string[]) => {
    const body = minify(
      `(()=>{${RUNTIME}\n${String(intentionalRegister)}\nintentionalRegister(${JSON.stringify(kind)},[${params.join(",")}],hosts);})();`,
    );
    const fn = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
    return [
      `/// ${name}.js`,
      `function ${fn}(${[...params, "hosts"].map((p) => `${p} = ''`).join(", ")}) {`,
      body,
      "}",
    ].join("\n");
  };
  return `${[
    "// Scriptlets for the intentional filter lists: https://aymericbeaumet.github.io/intentional/",
    "// Load them in uBlock Origin with the advanced setting `userResourcesLocation`.",
    "",
    scriptlet("intentional-redirect", "redirect", ["order", "from", "to"]),
    "",
    scriptlet("intentional-select", "select", ["when", "click", "selected"]),
  ].join("\n")}\n`;
}

export function userscript(sites: Site[], version: string, homepage: string): string {
  const configs = Object.assign({}, ...sites.map(hostConfigs)) as Record<string, HostConfig>;
  const matches = Object.keys(configs).map((host) => `// @match        https://${host}/*`);
  return `${[
    "// ==UserScript==",
    "// @name         Intentional",
    "// @namespace    https://aymericbeaumet.github.io/intentional/",
    `// @version      ${version}`,
    "// @description  Redirects algorithmic feeds to the views you chose: subscriptions, following, notifications.",
    `// @homepageURL  ${homepage}`,
    `// @downloadURL  ${homepage}userscript/intentional.user.js`,
    `// @updateURL    ${homepage}userscript/intentional.user.js`,
    "// @license      MIT",
    ...matches,
    "// @run-at       document-start",
    "// @grant        none",
    "// ==/UserScript==",
    "",
    runtimeScript(configs),
  ].join("\n")}\n`;
}
