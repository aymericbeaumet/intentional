import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Site, TARGETS, type Target } from "../model.ts";
import { adguardRules, ublockResources, ublockRules, userscript } from "../redirect/emit.ts";
import { compileRules } from "./rules.ts";

export const HOMEPAGE = "https://aymericbeaumet.github.io/intentional/";

export const BLOCKERS: Record<Target, string> = {
  ublock: "uBlock Origin",
  adguard: "AdGuard",
  brave: "Brave",
};

const REDIRECT_NOTE: Record<Target, string> = {
  ublock: `Redirects need the uBO advanced setting userResourcesLocation = ${HOMEPAGE}ublock/scriptlets.js`,
  adguard: "Redirects need this list to be added as Trusted",
  brave: `Redirects need the userscript: ${HOMEPAGE}userscript/intentional.user.js`,
};

function header(target: Target, title: string, description: string, version: string): string[] {
  return [
    `! Title: ${title}`,
    `! Description: ${description}`,
    `! Homepage: ${HOMEPAGE}`,
    "! License: MIT",
    `! Version: ${version}`,
    "! Expires: 1 day",
    `! ${REDIRECT_NOTE[target]}`,
  ];
}

/** Rules for one site and target, including the generated redirect rules. */
export function siteBody(site: Site, target: Target): string[] {
  const rules = compileRules(site, target).flatMap((r) => r.output);
  const generated = target === "ublock" ? ublockRules(site) : target === "adguard" ? adguardRules(site) : [];
  const body = [`! ===== ${site.spec.name} =====`, ...rules];
  if (generated.length > 0)
    body.push("", `! ${site.spec.name}: redirects to the intentional view`, ...generated);
  return trimBlankRuns(body);
}

function trimBlankRuns(lines: string[]): string[] {
  return lines.filter((line, i) => line !== "" || (i > 0 && lines[i - 1] !== "" && i < lines.length - 1));
}

export interface BuildOptions {
  version: string;
}

/** Every output file, keyed by its path under dist/. Pure: no I/O. */
export function build(sites: Site[], options: BuildOptions): Map<string, string> {
  const files = new Map<string, string>();
  const names = sites.map((s) => s.spec.name).join(", ");

  for (const target of TARGETS) {
    const blocker = BLOCKERS[target];
    const bodies = sites.map((site) => siteBody(site, target));
    files.set(
      `${target}/intentional.txt`,
      `${[
        ...header(
          target,
          `Intentional (${blocker})`,
          `Removes algorithmic feeds and infinite scrolling, so you only see what you came for. Sites: ${names}.`,
          options.version,
        ),
        "",
        ...bodies.flatMap((body) => [...body, ""]),
      ]
        .join("\n")
        .trimEnd()}\n`,
    );
    sites.forEach((site, i) => {
      files.set(
        `${target}/${site.spec.id}.txt`,
        `${[
          ...header(
            target,
            `Intentional: ${site.spec.name} (${blocker})`,
            `Removes ${site.spec.name}'s algorithmic feeds and infinite scrolling, so you only see what you came for.`,
            options.version,
          ),
          "",
          ...(bodies[i] ?? []),
        ].join("\n")}\n`,
      );
    });
  }

  files.set("ublock/scriptlets.js", ublockResources());
  files.set("userscript/intentional.user.js", userscript(sites, options.version, HOMEPAGE));
  files.set(
    "index.json",
    `${JSON.stringify(
      {
        version: options.version,
        homepage: HOMEPAGE,
        sites: sites.map((s) => ({ ...s.spec, lists: TARGETS.map((t) => `${t}/${s.spec.id}.txt`) })),
      },
      null,
      2,
    )}\n`,
  );
  return files;
}

export function writeDist(files: Map<string, string>, outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  for (const [path, content] of files) {
    const file = join(outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}
