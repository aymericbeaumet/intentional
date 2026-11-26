# 0003: Testing against real engines and real extensions

**Status:** accepted (2026-11)

## Context

Filter lists break silently in two directions: a contributor's change hides the
wrong thing, or a site or a blocker changes underneath. None of the comparable
lists we looked at test beyond linting.

## Decision

- **Engines in Node** (fast, every PR): uBO's static network engine
  (`@gorhill/ubo-core`) and AdGuard's `@adguard/tsurlfilter` both answer every
  `network` case, and both must agree with the expectation.
- **Real uBlock Origin in Firefox**: the pinned signed release (SHA-256 in
  `tests/browser/ublock.json`) is force-installed and configured through Firefox
  enterprise policies (`ExtensionSettings` + `3rdparty` managed storage:
  `toOverwrite.filterLists`, `advancedSettings`). This is uBO's documented admin
  path, so there's no UI automation.
- **AdGuard's engine in Chrome**: tsurlfilter decides what applies to each URL,
  `@adguard/extended-css` runs procedural rules, and AdGuard's own generated
  scripts run in the page. We don't load the AdGuard MV3 extension itself:
  custom lists there need the "Allow user scripts" toggle flipped on
  `chrome://extensions`, which is brittle to automate. The engine and libraries
  are the same code the extension runs.
- **Offline fixtures under real hostnames**: an HTTPS-terminating proxy answers
  `www.youtube.com` etc. from `sites/<id>/fixtures/`, so cosmetic rules scoped to
  real domains apply, and no test touches the network.
- **Live canary** (nightly, not gating): the same proxy in passthrough mode,
  against the real sites, checking that the markup our rules rely on still
  exists and that the compiled list still works there.
- **Brave**: no engine test. Its Node binding (`adblock-rs`) compiles Rust on
  every `npm install`, too heavy for contributors. The build checks that Brave's
  file only uses supported syntax.

## Consequences

- A rule change that stops hiding something, or hides an allowed element, fails
  in every leg where it applies.
- `@gorhill/ubo-core` lags uBO releases (last published 2024). The Firefox leg
  runs the current release, so engine drift is still caught.
- The engines and the uBO release are pinned; the weekly `engines` workflow
  tests the latest versions and proposes the bump.
- AdGuard's Chrome (MV3) extension doesn't support path-scoped cosmetic rules
  (`[$path=…]`, what uBO's `:matches-path()` becomes). tsurlfilter does, so the
  harness can't catch that gap. Prefer selectors on page state (attributes that
  change with navigation) over `:matches-path()`, and note in `limitations` when
  a site depends on it.
