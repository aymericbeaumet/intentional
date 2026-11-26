import { describe, expect, it } from "vitest";
import { HOMEPAGE } from "../../src/compile/build.ts";
import { type Index, renderIndex } from "../../src/site/generate.ts";
import { PLATFORMS } from "../../src/site/platforms.ts";

const index: Index = {
  version: "1.2.3",
  homepage: HOMEPAGE,
  sites: [
    {
      id: "example",
      name: "Example <Site>",
      domains: ["example.com"],
      hosts: ["www.example.com"],
      intentional: [{ label: "Following", url: "https://www.example.com/following" }],
      policy: { allowed: ["Single posts"], blocked: ["Home feed"], limitations: ["No following URL"] },
    },
  ],
};
const html = renderIndex(index);

describe("website", () => {
  it("has an install section for every platform", () => {
    for (const platform of PLATFORMS) expect(html).toContain(`id="${platform.id}"`);
  });

  it("subscribes uBO with abp:subscribe and AdGuard with adguard:subscribe", () => {
    expect(html).toContain(
      `abp:subscribe?location=${encodeURIComponent(`${HOMEPAGE}ublock/intentional.txt`)}&amp;title=`,
    );
    expect(html).toContain(
      `adguard:subscribe?location=${encodeURIComponent(`${HOMEPAGE}adguard/intentional.txt`)}&amp;title=`,
    );
  });

  it("offers the uBO resources URL and the userscript", () => {
    expect(html).toContain(`${HOMEPAGE}ublock/scriptlets.js`);
    expect(html).toContain(`${HOMEPAGE}userscript/intentional.user.js`);
  });

  it("shows each site's policy, limits and intentional views, escaped", () => {
    expect(html).toContain("Example &lt;Site&gt;");
    expect(html).not.toContain("Example <Site>");
    expect(html).toContain("https://www.example.com/following");
    expect(html).toContain("No following URL");
    expect(html).toContain(`${HOMEPAGE}brave/example.txt`);
  });

  it("explains leaving the native apps", () => {
    expect(html).toContain('id="apps"');
    expect(html).toContain("Open as Web App");
  });
});
