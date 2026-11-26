import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { UBLOCK, UBLOCK_XPI } from "./legs.ts";

/** Downloads the pinned uBO release once, and refuses anything but the pinned bytes. */
export async function ensureUblock(): Promise<string> {
  if (!existsSync(UBLOCK_XPI)) {
    const response = await fetch(UBLOCK.url);
    if (!response.ok) throw new Error(`cannot download uBO ${UBLOCK.version}: HTTP ${response.status}`);
    mkdirSync(dirname(UBLOCK_XPI), { recursive: true });
    writeFileSync(UBLOCK_XPI, Buffer.from(await response.arrayBuffer()));
  }
  const sha256 = createHash("sha256").update(readFileSync(UBLOCK_XPI)).digest("hex");
  if (sha256 !== UBLOCK.sha256) {
    throw new Error(
      `${UBLOCK_XPI} has sha256 ${sha256}, expected ${UBLOCK.sha256} (tests/browser/ublock.json)`,
    );
  }
  return UBLOCK_XPI;
}
