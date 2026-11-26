# 0002: Redirects to the intentional view

**Status:** accepted (2026-11)

## Context

Users want opening YouTube to land on Subscriptions, not on an empty page. No
blocker lets a third-party list rewrite URLs or run custom code without an
explicit opt-in, and single-page apps navigate without loading a new document,
so network-level redirects miss most navigations.

What we measured with real uBlock Origin 1.77.0 in Firefox (browser harness,
offline fixtures):

| Mechanism                                    | Result                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `$doc,uritransform=` from a subscribed list  | No redirect, with or without `trustedListPrefixes`. Also marked "candidate for deprecation" upstream.                    |
| Custom scriptlet via `userResourcesLocation` | Works **without** trust: a list may call scriptlets that don't start with `trusted-`.                                    |
| Same scriptlet with comments in its source   | Fails with `SyntaxError: expected expression, got ')'`; uBO rewrites resource source. Shipping minified bodies fixes it. |

AdGuard runs `#%#` JavaScript rules only from lists added as **Trusted**.

## Decision

- Redirects are **data** in `site.yaml` (`redirects`: regex on path+query → path;
  `select`: tab to click when a view has no URL).
- One runtime (`src/redirect/runtime.js`) watches `history.pushState`,
  `replaceState`, `popstate` and polls once a second. It's shipped three ways
  from the same source:
  - **uBO:** `+js(intentional-redirect, order, from, to)` rules + `ublock/scriptlets.js`,
    enabled by setting `userResourcesLocation`;
  - **AdGuard:** one `#%#` rule per site, enabled by ticking Trusted;
  - **userscript:** for uBO Lite, Brave, and Safari via the Userscripts app.
- Redirect rules live **in the main list**. Without the opt-in they're inert, so
  there is one list per blocker instead of a base list plus a redirects list.
- Redirected pages are never `$document`-blocked: the block would win.

## Consequences

- Redirects work on full loads and in-app navigation, everywhere the opt-in is
  possible. Without it, the lists still hide every blocked surface.
- uBO users change one advanced setting. If uBO starts requiring trust for user
  resources, the fallback is `trustedListPrefixes` + the same scriptlets.
- Redirect targets must never redirect again; the engine tests enforce it.
