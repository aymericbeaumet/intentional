# Contributing

Thanks for helping people take their attention back. Before anything else, read
[docs/policy.md](docs/policy.md): every rule must serve it.

## Setup

```shell
mise install          # node, pinned in mise.toml
npm ci
npm run browsers      # Chrome for Testing + Firefox for the browser tests
make check            # lint, typecheck, unit, engine and browser tests
```

The browser tests download the pinned uBlock Origin release on first run and
check its SHA-256 against `tests/browser/ublock.json`.

## How a site is defined

Everything about a site lives in `sites/<id>/`:

| File              | What it holds                                                                       |
| ----------------- | ----------------------------------------------------------------------------------- |
| `site.yaml`       | Domains, the policy (allowed / blocked / limitations), intentional views, redirects |
| `rules.txt`       | Filter rules in **uBlock Origin syntax**                                            |
| `tests.yaml`      | What the rules must do: network cases, redirect cases, page checks, live checks     |
| `fixtures/*.html` | Small DOM skeletons of the site's pages, used by the browser tests                  |

The compiler turns `rules.txt` and `site.yaml` into one list per blocker
(uBlock Origin, AdGuard, Brave) plus a userscript. Run `npm run build` and look
in `dist/`.

Start a new site with `make new-site SITE=<id>`.

## Writing rules

- **Scope every rule to the site.** Cosmetic rules list the site's hosts
  (`www.youtube.com##…`); network rules start with `||<domain>`. Generic rules
  (`##.foo`) are rejected: they would hide things on every website.
- **Prefer stable hooks**: custom element names, `data-*`, `aria-*`, `href`,
  `role`. Avoid generated class names (`.x1n2onr6`); they change weekly.
- **Prefer state that follows in-app navigation.** Single-page apps don't reload
  when you click around. `ytd-browse[page-subtype="home"]` keeps working after a
  click; `:matches-path()` also re-checks the path.
  Use `:matches-path()` only when no such hook exists: AdGuard for Chrome
  ignores path-scoped rules.
- **Portable syntax only**: CSS, `:has()`, `:has-text()`, `:upward()`,
  `:matches-path()`, `:remove()`, `:style()`, and non-trusted scriptlets.
  Anything else must sit inside `!#if ext_ublock` / `!#if adguard` /
  `!#if ext_brave` blocks, which the compiler resolves per blocker.
- **Never block an allowed page.** Opening a single post or video by URL must
  keep working, as must the subscriptions/following views.
- **Redirect rather than block.** Put algorithmic landing pages in `site.yaml`
  `redirects` (a regex on path+query → a path). For pages whose intentional view
  has no URL (e.g. a "Following" tab), use `select`. Don't `$document`-block a
  page that has a redirect: the block would win and the redirect never runs.
- Keep a short comment above each group of rules saying what it removes.

## Tests are required

`make check` fails when:

- a network rule is not exercised by a `network` case with `expect: block`;
- a cosmetic rule doesn't hide anything in any fixture (add the element to a
  fixture and a `hidden` check to a page case);
- a redirect in `site.yaml` has no `redirects` test case;
- an allowed page gets redirected, or an element listed as `visible` is hidden.

Every page case runs in five browser legs:

| Leg            | Browser | Blocker                                                    |
| -------------- | ------- | ---------------------------------------------------------- |
| `ublock`       | Firefox | real uBlock Origin, redirects on (`userResourcesLocation`) |
| `ublock-base`  | Firefox | real uBlock Origin, no redirects                           |
| `adguard`      | Chrome  | AdGuard's engine, list trusted (redirects on)              |
| `adguard-base` | Chrome  | AdGuard's engine, list not trusted                         |
| `userscript`   | Chrome  | the userscript only                                        |

Cases with `expectUrl` run where redirects are on. Cases on a URL that redirects
run where they are off. Every other case runs everywhere and also asserts the
page was _not_ redirected. Each case gets a fresh tab. All legs check the
`visible` selectors, so a tab switch can assert that the chosen timeline is
on screen even when the URL stays the same. The cosmetic legs also check
`hidden` selectors.

When something can't work on one blocker, say why in `site.yaml` `limitations`
and add `skip` to the case: a blocker name (`adguard`) skips all its legs, a leg
name (`adguard-base`) skips just that one.

Gotchas we hit:

- AGLint rejects a selector list inside `:upward()`: write `:upward(:is(a, b))`.
- Redirects match in `site.yaml` order, first match wins, on every blocker.
- After three redirects in ten seconds in a tab, the runtime leaves the current
  page alone until the URL changes or the user reloads it.

Useful while iterating:

```shell
INTENTIONAL_SITES=youtube npm test                    # one site, fast tests
INTENTIONAL_SITES=youtube npm run test:browser        # one site, browser tests
LEGS=ublock-base HEADFUL=1 npm run test:browser       # watch one leg run
```

## Fixtures

Fixtures are small, hand-trimmed skeletons of a page: the elements your rules
target, plus the elements that must stay visible. No real content, no scripts,
no personal data. `npm run capture -- <site> <url>` turns a page you have open in
a logged-in browser profile into a starting skeleton (see
[docs/testing.md](docs/testing.md)).

## When a site changes

Sites change their markup without notice. The nightly canary
([docs/testing.md](docs/testing.md)) opens a `breakage:<site>` issue when a
selector our rules rely on disappears. To fix one: update the fixture to the new
structure, watch the tests fail, update the rules, watch them pass.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(youtube):
hide the new Shorts shelf`, `fix(x): follow the new tab markup`.
