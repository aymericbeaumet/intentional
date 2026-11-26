import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./sites.ts";

const PIN = join(ROOT, "tests", "browser", "ublock.json");

/** Points tests/browser/ublock.json at the latest uBlock Origin release. */
export async function bumpUblock(): Promise<void> {
  const latest = await fetch("https://github.com/gorhill/uBlock/releases/latest", { redirect: "manual" });
  const tag = latest.headers.get("location")?.split("/tag/")[1];
  if (!tag) throw new Error("cannot find the latest uBlock Origin release");
  const current = JSON.parse(readFileSync(PIN, "utf8")) as { version: string };
  if (current.version === tag) {
    console.log(`uBlock Origin ${tag} is already pinned`);
    return;
  }
  const url = `https://github.com/gorhill/uBlock/releases/download/${tag}/uBlock0_${tag}.firefox.signed.xpi`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`cannot download ${url}: HTTP ${response.status}`);
  const sha256 = createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex");
  writeFileSync(PIN, `${JSON.stringify({ version: tag, url, sha256 }, null, 2)}\n`);
  console.log(`pinned uBlock Origin ${current.version} → ${tag}`);
}
