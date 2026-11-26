import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse } from "yaml";
import type { Site, SiteSpec, SiteTests } from "./model.ts";

export const ROOT = join(import.meta.dirname, "..");
export const SITES_DIR = join(ROOT, "sites");

const ajv = new Ajv2020({ allErrors: true, strict: true });
const readSchema = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, "schema", name), "utf8"));
const validateSite = ajv.compile<SiteSpec>(readSchema("site.schema.json"));
const validateTests = ajv.compile<SiteTests>(readSchema("tests.schema.json"));

export class SiteError extends Error {}

function readYaml<T>(file: string, validate: typeof validateSite | typeof validateTests): T {
  const data: unknown = parse(readFileSync(file, "utf8"));
  if (!validate(data)) {
    const details = (validate.errors ?? []).map((e) => `  ${e.instancePath || "/"} ${e.message}`).join("\n");
    throw new SiteError(`${file} is invalid:\n${details}`);
  }
  return data as T;
}

export function loadSite(id: string): Site {
  const dir = join(SITES_DIR, id);
  const spec = readYaml<SiteSpec>(join(dir, "site.yaml"), validateSite);
  if (spec.id !== id) throw new SiteError(`${dir}/site.yaml: id "${spec.id}" must match its folder "${id}"`);
  const tests = readYaml<SiteTests>(join(dir, "tests.yaml"), validateTests);
  const rules = readFileSync(join(dir, "rules.txt"), "utf8");
  for (const { file } of tests.fixtures) {
    if (!existsSync(join(dir, "fixtures", file))) {
      throw new SiteError(`${dir}/tests.yaml references missing fixture fixtures/${file}`);
    }
  }
  return { spec, tests, rules, dir };
}

/** Site folders, optionally narrowed with INTENTIONAL_SITES=youtube,reddit while working on a few. */
export function siteIds(): string[] {
  const ids = readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SITES_DIR, d.name, "site.yaml")))
    .map((d) => d.name)
    .sort();
  const selection = process.env.INTENTIONAL_SITES?.trim();
  if (!selection) return ids;
  const only = selection.split(/\s*,\s*/).filter(Boolean);
  if (only.length === 0) throw new SiteError("INTENTIONAL_SITES must include a site ID");
  for (const id of only) {
    if (!ids.includes(id))
      throw new SiteError(`unknown site "${id}" in INTENTIONAL_SITES (available: ${ids.join(", ")})`);
  }
  return ids.filter((id) => only.includes(id));
}

export function loadSites(): Site[] {
  return siteIds().map(loadSite);
}
