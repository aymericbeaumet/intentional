import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SITES_DIR } from "./sites.ts";

/** `npm run new-site -- <id>`: a site skeleton that validates, ready to fill in. */
export function newSite(id: string | undefined): void {
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error("usage: npm run new-site -- <id>   (lowercase letters, digits and dashes)");
  }
  const dir = join(SITES_DIR, id);
  if (existsSync(dir)) throw new Error(`sites/${id} already exists`);
  mkdirSync(join(dir, "fixtures"), { recursive: true });

  writeFileSync(
    join(dir, "site.yaml"),
    `# yaml-language-server: $schema=../../src/schema/site.schema.json
id: ${id}
name: ${id}
domains: [${id}.com]
hosts: [www.${id}.com]

intentional:
  - label: Following
    url: https://www.${id}.com/following

policy:
  allowed:
    - A single post opened by URL
    - The feed of accounts you follow
  blocked:
    - The algorithmic home feed (redirects to Following)
  limitations: []

redirects:
  - from: '^/(\\?.*)?$'
    to: /following
`,
  );
  writeFileSync(
    join(dir, "rules.txt"),
    `! ${id}: see site.yaml for the policy and tests.yaml for what each rule must do.

! --- Home feed ---
www.${id}.com##[data-feed="home"]
`,
  );
  writeFileSync(
    join(dir, "tests.yaml"),
    `# yaml-language-server: $schema=../../src/schema/tests.schema.json
fixtures:
  - { url: '^https://www\\.${id}\\.com/(\\?.*)?$', file: home.html }

redirects:
  - { url: 'https://www.${id}.com/', expect: 'https://www.${id}.com/following' }
  - { url: 'https://www.${id}.com/following', expect: null }

pages:
  - name: home feed is hidden
    url: https://www.${id}.com/
    hidden: ['#home-feed']
  - name: home redirects to following
    url: https://www.${id}.com/
    expectUrl: https://www.${id}.com/following
`,
  );
  writeFileSync(
    join(dir, "fixtures", "home.html"),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${id}</title></head>
<body>
  <main><section id="home-feed" data-feed="home"><a href="/post/1">Recommended post</a></section></main>
</body></html>
`,
  );
  console.log(
    `created sites/${id}: edit site.yaml, rules.txt, tests.yaml and fixtures/, then run make check`,
  );
}
