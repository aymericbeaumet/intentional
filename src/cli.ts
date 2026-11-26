import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, writeDist } from "./compile/build.ts";
import { RulesError } from "./compile/rules.ts";
import { TARGETS } from "./model.ts";
import { loadSites, ROOT, SITES_DIR, SiteError, siteIds } from "./sites.ts";

class LintError extends Error {}

const DIST = join(ROOT, "dist");
const AGLINT = join(ROOT, "node_modules", "@adguard", "aglint", "dist", "index.cli.js");

function version(): string {
  return (
    process.env.INTENTIONAL_VERSION ?? JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version
  );
}

function cmdBuild(): void {
  const sites = loadSites();
  const files = build(sites, { version: version() });
  writeDist(files, DIST);
  console.log(`built ${files.size} files for ${sites.length} sites into dist/`);
}

/** AGLint over the sources (uBO syntax) and over every compiled list with its own syntax. */
function cmdLint(): void {
  const files = build(loadSites(), { version: version() });
  const dir = mkdtempSync(join(tmpdir(), "intentional-lint-"));
  try {
    const syntax = {
      sources: "UblockOrigin",
      ublock: "UblockOrigin",
      brave: "UblockOrigin",
      adguard: "AdGuard",
    };
    for (const [name, value] of Object.entries(syntax)) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(
        join(dir, name, ".aglintrc.yaml"),
        `root: true\nsyntax: [${value}]\nextends: [aglint:recommended]\n`,
      );
    }
    for (const id of siteIds()) cpSync(join(SITES_DIR, id, "rules.txt"), join(dir, "sources", `${id}.txt`));
    for (const [path, content] of files) {
      const target = path.split("/")[0] ?? "";
      if (path.endsWith(".txt") && (TARGETS as readonly string[]).includes(target)) {
        writeFileSync(join(dir, path), content);
      }
    }
    for (const name of Object.keys(syntax)) {
      try {
        const cwd = join(dir, name);
        // AGLint looks for its config from INIT_CWD when npm sets it, not from cwd.
        execFileSync(process.execPath, [AGLINT, "--no-colors"], {
          cwd,
          env: { ...process.env, INIT_CWD: cwd },
          stdio: "pipe",
        });
      } catch (error) {
        const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
        const output = `${stdout?.toString() ?? ""}${stderr?.toString() ?? ""}` || String(error);
        throw new LintError(`AGLint found problems in ${name}:\n${output}`);
      }
    }
    console.log(`AGLint: sources and ${TARGETS.join(", ")} outputs are clean`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const commands: Record<string, () => void | Promise<void>> = {
  build: cmdBuild,
  lint: cmdLint,
  "new-site": async () => (await import("./scaffold.ts")).newSite(process.argv[3]),
  site: async () => (await import("./site/generate.ts")).generateSite(DIST),
  capture: async () => (await import("./capture.ts")).capture(process.argv.slice(3)),
  "bump-ublock": async () => (await import("./engines.ts")).bumpUblock(),
};

const name = process.argv[2] ?? "";
const command = commands[name];
if (!command) {
  console.error(`usage: node src/cli.ts <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
try {
  await command();
} catch (error) {
  if (error instanceof RulesError || error instanceof SiteError || error instanceof LintError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
