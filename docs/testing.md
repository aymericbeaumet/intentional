# Testing

`make check` is what CI runs on every pull request. Nothing reaches the network
except the one-time downloads (browsers, the pinned uBO release).

| Layer     | Command                | What it proves                                                                               |
| --------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| Lint      | `npm run lint`         | Biome on the code, AGLint on the sources and on every compiled list                          |
| Typecheck | `npm run typecheck`    | `tsc --noEmit` over the code, the redirect runtime included                                  |
| Unit      | `npm test`             | Rule validation, `!#if` resolution, the redirect runtime, the website                        |
| Engine    | `npm test`             | Every `network` case against uBO's and AdGuard's engines; redirect cases; no redirect chains |
| Browser   | `npm run test:browser` | Every `pages` case with real uBO (Firefox) and AdGuard's engine (Chrome), on fixtures        |
| Live      | `npm run test:live`    | Nightly: the real sites still have the markup we rely on, and the lists still work there     |

## Coverage gates

- Every network rule must block at least one `network` case.
- Every cosmetic rule must match an element in at least one fixture page
  (measured in the AdGuard legs).
- Every redirect must be the first matching rule for at least one positive
  `redirects` case on a host where it runs. Every intentional view and every
  redirect target must stay where it is.

## Browser legs

See [CONTRIBUTING.md](../CONTRIBUTING.md#tests-are-required) for the five legs
and how a page case picks them. Handy switches:

```shell
INTENTIONAL_SITES=youtube,x npm run test:browser   # only these sites
LEGS=ublock,adguard npm run test:browser           # only these legs
HEADFUL=1 LEGS=ublock-base npm run test:browser    # watch it happen
```

How it's wired ([decision 0003](decisions/0003-test-harness.md)):

- `tests/browser/harness/proxy.ts`: an HTTPS proxy serving fixtures under the
  real hostnames and the compiled lists under `lists.intentional.test`.
- `firefox.ts`: Firefox with uBO force-installed and configured by enterprise
  policy. Launches take a lock because the policy file is shared.
- `adguard.ts`: AdGuard's engine, ExtendedCss and scriptlets applied in Chrome.
- `checks.ts`: loads a case in a fresh tab, replays in-app navigation (a
  `pushState` plus a DOM change, like a real app), polls until the page
  matches or 5 seconds pass, then reports every difference.

## Fixtures

Fixtures are skeletons of real pages: the elements the rules target, and the
elements that must stay. Keep them small and free of personal data.

```shell
npm run capture -- login youtube                    # once: log in, cookies go to .auth/ (gitignored)
npm run capture -- youtube https://www.youtube.com/feed/subscriptions subscriptions --force
```

`capture` keeps tags, ids, classes, `data-*`, `aria-*`, `href` paths and short
UI labels. It drops scripts, media and most text. Trim the result to what your
checks need and read it through before committing.

## Live canary

`.github/workflows/canary.yml` runs `npm run test:live` every night, logged out,
from GitHub's runners. Locally, `npm run capture -- login <site>` lets the
`login: true` cases run with your session.

- `exists` selectors failing means the site changed its markup: recapture the
  fixture, watch the browser tests fail, fix the rules.
- `hidden` / `expectUrl` failing on the live site while fixtures pass means the
  fixture no longer reflects reality.

Some sites show little to logged-out visitors from data-center IPs (Reddit and
the Meta sites in particular), so their live cases mostly need `login: true`
and a maintainer running them locally.

## When a blocker updates

- The uBO release is pinned in `tests/browser/ublock.json`; engines are pinned in
  `package.json`.
- `.github/workflows/engines.yml` runs the suite every week against the latest
  uBO release and the latest AdGuard packages, and opens a pull request when
  they pass, or an issue when they don't. For automatic pull requests, enable
  **Allow GitHub Actions to create and approve pull requests** in the repository's
  Actions settings.
