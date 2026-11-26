# intentional agent guide

- Read `docs/policy.md` before touching rules, and `CONTRIBUTING.md` for how sites, rules and tests fit.
- Run `make check` after material changes. While iterating on one site, scope runs with
  `INTENTIONAL_SITES=<id>`.
- Every rule needs a test. For path or feed selectors, also test a similar profile, post or
  following feed that must stay visible.
- Rules are uBlock Origin syntax, scoped to the site's domains. Redirects live in `site.yaml`, never as
  hand-written `intentional-*` scriptlets or `$document` blocks on redirected pages.
- Never copy rules from GPL lists (uAssets, AdGuard filters, EasyList); this project is MIT.
- The redirect runtime (`src/redirect/runtime.js`) is serialized into lists: keep each function
  self-contained, no imports, no module-scope references.
- Browser tests share one Firefox `policies.json`; launches take a lock, keep it that way.
- uBO rewrites `userResourcesLocation` source before injecting it: scriptlet bodies must ship
  minified (comments break it). uBO also doesn't keep filter order, so redirect scriptlets carry an
  explicit order argument.
- uBO's engine reports filter text lowercased; compare rule texts case-insensitively.
- AGLint finds its config from `INIT_CWD` when run under npm; the lint command sets it per folder.
- X answers 403 to headless browsers; its live cases are `login: true`.
- Every commit message MUST follow the latest published
  [Conventional Commits specification](https://www.conventionalcommits.org/).
- Do not add `CLAUDE.md` or other client-specific instruction files.
