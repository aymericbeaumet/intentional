# Architecture

```
sites/<id>/site.yaml ──┐                      ┌─ dist/ublock/{intentional,<id>}.txt + scriptlets.js
sites/<id>/rules.txt ──┼─ src/compile ────────┼─ dist/adguard/{intentional,<id>}.txt
                       │  (validate, resolve  ├─ dist/brave/{intentional,<id>}.txt
src/redirect/runtime ──┘   !#if, convert)     ├─ dist/userscript/intentional.user.js
                                              ├─ dist/index.json ── src/site ── dist/index.html
                                              └─ (all published to GitHub Pages)
```

## Pieces

| Path                        | Role                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `src/sites.ts`              | Loads `sites/*/`, validates YAML against `src/schema/*.schema.json`                 |
| `src/compile/preprocess.ts` | Resolves build-time `!#if ext_ublock / adguard / ext_brave`                         |
| `src/compile/rules.ts`      | Parses each rule with AGTree, enforces scoping and portability, converts to AdGuard |
| `src/compile/build.ts`      | Assembles every output file with headers (pure; `writeDist` does the I/O)           |
| `src/redirect/runtime.js`   | The redirect runtime, serialized into lists (self-contained functions)              |
| `src/redirect/emit.ts`      | Emits the runtime as uBO scriptlets, an AdGuard `#%#` rule, and a userscript        |
| `src/site/`                 | The website: install guides (`platforms.ts`) and the generator                      |
| `src/capture.ts`            | Fixture capture and login for local live runs                                       |
| `tests/`                    | Unit, engine, browser and live tests ([testing.md](testing.md))                     |

## Design rules

- **Policy first.** [policy.md](policy.md) decides what is blocked; `site.yaml`
  states it per site and the tests encode it.
- **One source, one file per blocker.** See [decision 0001](decisions/0001-one-list-per-blocker.md).
- **Redirect over block, opt-in per blocker.** See [decision 0002](decisions/0002-redirects.md).
- **Every rule is tested against real engines.** See [decision 0003](decisions/0003-test-harness.md).
- **Scoped rules only.** A rule that could touch another website fails the build.

## Publishing

In the repository settings, select **Pages → Build and deployment → Source → GitHub Actions**.
The checked-in [release workflow](../.github/workflows/release.yml) runs on pushes
to `main`. After CI passes, it builds the lists and install guide into `dist/`
and publishes them together at [the project site](https://aymericbeaumet.github.io/intentional/).
Every list carries a version derived from Conventional Commits. Before publishing
the [release assets](https://github.com/aymericbeaumet/intentional/releases), the workflow
downloads all three combined lists and both redirect resources from Pages and
checks that their bytes match the build.
Lists request a one-day refresh interval with `! Expires: 1 day`. The subscriber's
blocker controls when it downloads an update.

The list URLs are the project's public contract: subscribers are tied to them.
Don't rename files under `dist/`.

## Licensing

The project is MIT. Its dev-only test dependencies include GPL-3.0 engines
(`@adguard/tsurlfilter`, `@gorhill/ubo-core`); they're never shipped. Rules are
written for this project and never copied from GPL lists such as uAssets,
AdGuard filters or EasyList.
