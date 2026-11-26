import { describe, expect, it } from "vitest";
import { build } from "../../src/compile/build.ts";
import { TARGETS } from "../../src/model.ts";
import { loadSites, siteIds } from "../../src/sites.ts";

const sites = loadSites();
const files = build(sites, { version: "0.0.0-snapshot" });

describe("compiled lists", () => {
  it.each(TARGETS.flatMap((t) => [`${t}/intentional.txt`, ...siteIds().map((id) => `${t}/${id}.txt`)]))(
    "%s has the headers blockers read",
    (path) => {
      const content = files.get(path) ?? "";
      for (const header of [
        "! Title: ",
        "! Homepage: ",
        "! License: MIT",
        "! Version: ",
        "! Expires: 1 day",
      ]) {
        expect(content).toContain(header);
      }
      expect(content.endsWith("\n")).toBe(true);
    },
  );

  it("never ships a preprocessor directive (Brave would apply both branches)", () => {
    for (const [path, content] of files) {
      if (path.endsWith(".txt")) expect(content, path).not.toMatch(/^!#/m);
    }
  });

  it("keeps redirect scriptlets out of the Brave list (Brave can't load them)", () => {
    expect(files.get("brave/intentional.txt")).not.toContain("intentional-redirect");
  });

  it.each([{ hosts: [] }, { hosts: ["unlisted.example"] }])(
    "rejects invalid redirect hosts $hosts",
    ({ hosts }) => {
      const site = sites[0]!;
      const redirects = [{ from: "^/$", to: "/following", hosts }];
      expect(() => build([{ ...site, spec: { ...site.spec, redirects } }], { version: "test" })).toThrow(
        /must use hosts from the site's hosts list/,
      );
    },
  );
});

// Golden files: a pull request shows exactly what subscribers will receive.
// Update with `npx vitest run --project unit -u` after reviewing the change.
describe.skipIf(Boolean(process.env.INTENTIONAL_SITES))("golden outputs", () => {
  it.each([
    "ublock/intentional.txt",
    "ublock/scriptlets.js",
    "adguard/intentional.txt",
    "brave/intentional.txt",
    "userscript/intentional.user.js",
  ])("%s", async (path) => {
    await expect(files.get(path)).toMatchFileSnapshot(`__snapshots__/dist/${path}`);
  });
});
