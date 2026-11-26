// Turns the live canary's results into one GitHub issue per broken site:
// opened (or commented) when a site fails, closed once it passes again.
// Usage: node tests/live/report.ts live-results.json   (needs GH_TOKEN, RUN_URL)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Assertion {
  ancestorTitles: string[];
  title: string;
  status: string;
  failureMessages: string[];
}

export function reportSites(assertions: Assertion[], run: string, gh: (...args: string[]) => string) {
  const bySite = new Map<string, { failed: Assertion[]; passed: number }>();
  for (const assertion of assertions) {
    const site = assertion.ancestorTitles[0] ?? "unknown";
    const entry = bySite.get(site) ?? { failed: [], passed: 0 };
    if (assertion.status === "failed") entry.failed.push(assertion);
    else if (assertion.status === "passed") entry.passed++;
    bySite.set(site, entry);
  }

  let failures = 0;
  let inconclusive = 0;
  for (const [site, { failed, passed }] of bySite) {
    if (failed.length === 0 && passed === 0) {
      inconclusive++;
      continue;
    }
    const label = `breakage:${site.toLowerCase()}`;
    const title = `${site}: live canary failing`;
    const open = gh(
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      label,
      "--json",
      "number",
      "--jq",
      ".[0].number",
    );
    if (failed.length === 0) {
      if (open) gh("issue", "close", open, "--comment", `Passing again: ${run}`);
      continue;
    }
    failures++;
    const details = failed
      .map(
        (a) =>
          `- **${a.ancestorTitles.slice(1).join(" › ")} › ${a.title}**\n\n  \`\`\`\n  ${(a.failureMessages[0] ?? "").split("\n").slice(0, 6).join("\n  ")}\n  \`\`\``,
      )
      .join("\n");
    const body = `The nightly canary found that ${site} changed in a way our rules depend on.\n\n${details}\n\nRun: ${run}\n\nSee docs/testing.md#live-canary for how to fix it.`;
    if (open) {
      gh("issue", "comment", open, "--body", body);
    } else {
      gh("label", "create", label, "--color", "d93f0b", "--force");
      gh("issue", "create", "--title", title, "--label", label, "--body", body);
    }
  }
  return { checked: bySite.size - inconclusive, inconclusive, failures };
}

if (import.meta.main) {
  const results = JSON.parse(readFileSync(process.argv[2] ?? "live-results.json", "utf8")) as {
    testResults: { assertionResults: Assertion[] }[];
  };
  const run = process.env.RUN_URL ?? "(local run)";
  const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8" }).trim();

  const { checked, inconclusive, failures } = reportSites(
    results.testResults.flatMap((r) => r.assertionResults),
    run,
    gh,
  );
  console.log(`${checked} sites checked, ${failures} failing, ${inconclusive} inconclusive`);
  process.exitCode = failures > 0 ? 1 : 0;
}
