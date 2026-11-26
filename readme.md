# Intentional

[![release](https://github.com/aymericbeaumet/intentional/actions/workflows/release.yml/badge.svg)](https://github.com/aymericbeaumet/intentional/actions/workflows/release.yml)

Filter lists that remove algorithmic feeds and infinite scrolling, so you only
see what you came for.

**[Install Intentional](https://aymericbeaumet.github.io/intentional/#install)**.
Choose your browser for the list URL and instructions to enable redirects.

## What it does

|                |                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kept**       | Any video, post or reel opened by link · the channels and people you follow · search · messages and notifications · comments                              |
| **Removed**    | Algorithmic home feeds · For You, Explore, Trending · related videos and end screens · swiping to the next Short or reel · "who to follow"                |
| **Redirected** | YouTube opens on Subscriptions · a Short plays in the regular player · Instagram opens on Following · X switches to Following · Twitch opens on Following |

Sites: [YouTube](sites/youtube/site.yaml), [X](sites/x/site.yaml),
[Reddit](sites/reddit/site.yaml), [LinkedIn](sites/linkedin/site.yaml),
[Instagram](sites/instagram/site.yaml), [Facebook](sites/facebook/site.yaml),
[TikTok](sites/tiktok/site.yaml), [Threads](sites/threads/site.yaml),
[Bluesky](sites/bluesky/site.yaml), [Pinterest](sites/pinterest/site.yaml),
[Twitch](sites/twitch/site.yaml). Each `site.yaml` states exactly what is kept,
what is removed, and the limits we couldn't get around.

## Lists

| Blocker                           | All sites                                                                                         | Redirects                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| uBlock Origin (Firefox, Android)  | [`ublock/intentional.txt`](https://aymericbeaumet.github.io/intentional/ublock/intentional.txt)   | set `userResourcesLocation` to [`ublock/scriptlets.js`](https://aymericbeaumet.github.io/intentional/ublock/scriptlets.js) |
| AdGuard web content filters       | [`adguard/intentional.txt`](https://aymericbeaumet.github.io/intentional/adguard/intentional.txt) | add the list as **Trusted** (Advanced Protection on iOS)                                                                   |
| Brave Shields                     | [`brave/intentional.txt`](https://aymericbeaumet.github.io/intentional/brave/intentional.txt)     | use the userscript                                                                                                         |
| uBlock Origin Lite                | import the uBlock Origin list                                                                     | use the userscript                                                                                                         |
| Browser with a userscript manager | use one of the lists above to hide feeds                                                          | [`userscript/intentional.user.js`](https://aymericbeaumet.github.io/intentional/userscript/intentional.user.js)            |

To filter just one site, import its list from the [site directory](https://aymericbeaumet.github.io/intentional/#sites).
The optional userscript enables redirects across all sites it covers, independently of your list selection.
Your blocker fetches new rules from the same subscription URL when it refreshes.

## On your phone

Uninstall the apps, use the websites with a blocker, and put the intentional
views (Subscriptions, Following…) on your home screen. See
[docs/mobile.md](docs/mobile.md).

## How it's built

- One source per site in uBO syntax, compiled to one list per blocker
  ([architecture](docs/architecture.md)).
- Redirects are data, run by one small runtime shipped three ways
  ([decision](docs/decisions/0002-redirects.md)).
- CI checks network rules against both filtering engines and tests page behavior
  on fixtures with uBlock Origin in Firefox and AdGuard's engine in Chrome. A
  nightly run checks selected pages on the live sites ([testing](docs/testing.md)).

## Development

```shell
mise install && npm ci && npm run browsers
make check                      # lint, typecheck, unit, engine and browser tests
npm run build && npm run site   # dist/ and dist/index.html
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) to add a site or fix a rule, and
[docs/policy.md](docs/policy.md) for what belongs in the lists.

## License

[MIT](LICENSE)
