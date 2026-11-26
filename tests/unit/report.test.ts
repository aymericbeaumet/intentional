import { expect, it, vi } from "vitest";
import { reportSites } from "../live/report.ts";

it("only updates breakage issues when a site has a result", () => {
  const assertion = (site: string, status: string) => ({
    ancestorTitles: [site],
    title: "page check",
    status,
    failureMessages: [],
  });
  const gh = vi.fn((...args: string[]) => (args[1] === "list" ? "42" : ""));
  const summary = reportSites(
    [
      assertion("Skipped", "pending"),
      assertion("Passing", "passed"),
      assertion("Passing", "pending"),
      assertion("Failing", "passed"),
      assertion("Failing", "failed"),
    ],
    "test run",
    gh,
  );
  expect(summary).toEqual({ checked: 2, inconclusive: 1, failures: 1 });
  expect(gh.mock.calls.filter((call) => call[1] === "list").map((call) => call[5])).toEqual([
    "breakage:passing",
    "breakage:failing",
  ]);
  expect(gh.mock.calls.map((call) => call[1])).toEqual(["list", "close", "list", "comment"]);
});
