import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCKERS } from "../compile/build.ts";
import type { SiteSpec, Target } from "../model.ts";
import { PLATFORMS, type Setup, type Step } from "./platforms.ts";

export interface Index {
  version: string;
  homepage: string;
  sites: SiteSpec[];
}

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const listUrl = (index: Index, target: Target, id = "intentional") => `${index.homepage}${target}/${id}.txt`;
const listTitle = (target: Target) => `Intentional (${BLOCKERS[target]})`;

function subscribeHref(index: Index, target: Target): string {
  const query = `location=${encodeURIComponent(listUrl(index, target))}&title=${encodeURIComponent(listTitle(target))}`;
  return target === "adguard" ? `adguard:subscribe?${query}` : `abp:subscribe?${query}`;
}

function copyable(value: string): string {
  return `<span class="copy"><code>${escapeHtml(value)}</code><button type="button" data-copy="${escapeHtml(value)}">Copy</button></span>`;
}

function renderStep(index: Index, step: Step): string {
  if (typeof step === "string") return `<li>${escapeHtml(step)}</li>`;
  if ("subscribe" in step) {
    const target = step.subscribe;
    return `<li>${escapeHtml(step.text)}<br><a class="button" href="${escapeHtml(subscribeHref(index, target))}">Subscribe with ${escapeHtml(BLOCKERS[target])}</a> <small>or copy the URL: ${copyable(listUrl(index, target))}</small></li>`;
  }
  if ("copy" in step) {
    const value =
      step.copy === "ublock-resources" ? `${index.homepage}ublock/scriptlets.js` : listUrl(index, step.copy);
    return `<li>${escapeHtml(step.text)}<br>${copyable(value)}</li>`;
  }
  const url = `${index.homepage}userscript/intentional.user.js`;
  return `<li>${escapeHtml(step.text)}<br><a class="button" href="${escapeHtml(url)}">Install the userscript</a></li>`;
}

const renderSetup = (index: Index, setup: Setup, tag = "h4") =>
  `<${tag}>${escapeHtml(setup.title)}</${tag}><ol>${setup.steps.map((s) => renderStep(index, s)).join("")}</ol>`;

const list = (items: string[]) => `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;

function renderSite(index: Index, site: SiteSpec): string {
  const lists = (["ublock", "adguard", "brave"] as const)
    .map((t) => `<a href="${escapeHtml(listUrl(index, t, site.id))}">${escapeHtml(BLOCKERS[t])}</a>`)
    .join(" · ");
  const views = site.intentional
    .map(
      (v) => `<a href="${escapeHtml(v.url)}">${escapeHtml(v.label)}</a> <small>${escapeHtml(v.url)}</small>`,
    )
    .join("<br>");
  return `<article id="site-${escapeHtml(site.id)}">
  <h3>${escapeHtml(site.name)}</h3>
  <p class="views"><strong>Bookmark or add to your home screen:</strong><br>${views}</p>
  <div class="columns">
    <div><h4>Still there</h4>${list(site.policy.allowed)}</div>
    <div><h4>Gone</h4>${list(site.policy.blocked)}</div>
  </div>
  ${site.policy.limitations?.length ? `<h4>Limits</h4>${list(site.policy.limitations)}` : ""}
  <p><small>Only this site: ${lists}</small></p>
</article>`;
}

/** The whole website as one static page. Pure, so tests can check it. */
export function renderIndex(index: Index): string {
  const platforms = PLATFORMS.map(
    (p) => `<section id="${escapeHtml(p.id)}" class="platform">
  <h3>${escapeHtml(p.name)} <small>${escapeHtml(p.devices)}</small></h3>
  ${renderSetup(index, p.recommended)}
  ${renderSetup(index, p.redirects)}
  ${p.alternatives.length ? `<details><summary>Other options</summary>${p.alternatives.map((a) => renderSetup(index, a, "h5")).join("")}</details>` : ""}
  ${p.notes?.length ? list(p.notes) : ""}
</section>`,
  ).join("\n");

  const names = index.sites.map((s) => s.name).join(", ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intentional: see what you came for</title>
<meta name="description" content="Free filter lists that remove algorithmic feeds, Shorts and infinite scrolling from ${escapeHtml(names)}. Only what you chose stays.">
<style>
:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fbfbf8; --muted: #6b6b6b; --accent: #2f6f4f; --card: #fff; --line: #e3e3de; }
@media (prefers-color-scheme: dark) { :root { --fg: #ececec; --bg: #141414; --muted: #a0a0a0; --accent: #7fc8a0; --card: #1d1d1d; --line: #2c2c2c; } }
* { box-sizing: border-box; }
body { margin: 0; font: 17px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
main { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
h1 { font-size: 2.4rem; margin: 1rem 0 .25rem; } h1 + p { font-size: 1.25rem; color: var(--muted); margin-top: 0; }
h2 { margin-top: 3rem; border-bottom: 1px solid var(--line); padding-bottom: .3rem; }
h3 small, h4 small { color: var(--muted); font-weight: normal; font-size: .8em; }
a { color: var(--accent); }
.button { display: inline-block; margin: .35rem 0; padding: .45rem .9rem; border-radius: .5rem; background: var(--accent); color: var(--bg); text-decoration: none; font-weight: 600; }
.copy { display: inline-flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
code { font-size: .85em; background: var(--card); border: 1px solid var(--line); padding: .1rem .35rem; border-radius: .3rem; word-break: break-all; }
button { font: inherit; font-size: .8rem; padding: .15rem .5rem; border: 1px solid var(--line); border-radius: .3rem; background: var(--card); color: var(--fg); cursor: pointer; }
nav.platforms { display: flex; flex-wrap: wrap; gap: .5rem; }
nav.platforms a { padding: .35rem .75rem; border: 1px solid var(--line); border-radius: 2rem; text-decoration: none; background: var(--card); }
.platform, article { background: var(--card); border: 1px solid var(--line); border-radius: .75rem; padding: .25rem 1.25rem 1rem; margin: 1rem 0; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0 1.5rem; }
details { margin-top: .5rem; } summary { cursor: pointer; color: var(--accent); }
footer { margin-top: 4rem; color: var(--muted); font-size: .9rem; }
</style>
</head>
<body>
<main>
<header>
  <h1>Intentional</h1>
  <p>See what you came for. Nothing else.</p>
</header>

<p>Social sites are built to keep you scrolling: a home feed picked by an algorithm, Shorts that play the next one before you decide, “recommended for you” everywhere. Intentional is a set of free filter lists for the ad blocker you already trust. It removes those surfaces and keeps what you chose:</p>
<ul>
  <li><strong>Kept:</strong> any video, post or reel you open by link; the people and channels you follow; search; your messages and notifications.</li>
  <li><strong>Removed:</strong> algorithmic home feeds, For You, Explore and Trending, related videos, end screens, swiping to the next item, “who to follow”.</li>
  <li><strong>Redirected:</strong> opening YouTube lands on your Subscriptions, a Short plays in the regular player, Instagram opens on Following.</li>
</ul>
<p>Covers ${escapeHtml(names)}.</p>

<h2 id="install">Install</h2>
<p>Choose your browser and subscribe to its filter list. Your blocker will fetch new rules from that URL when it refreshes.</p>
<nav class="platforms">${PLATFORMS.map((p) => `<a href="#${escapeHtml(p.id)}">${escapeHtml(p.name)}</a>`).join("")}</nav>
${platforms}

<h2 id="apps">Leave the apps, keep the sites</h2>
<p>Native apps are where the pull is strongest, and no blocker can reach inside them. The fix is to use the websites instead, with your blocker:</p>
<ol>
  <li><strong>Uninstall the apps</strong> (YouTube, Instagram, TikTok…). Links people send you then open in your browser, where the lists apply.</li>
  <li><strong>Install the setup for your phone</strong> from the list above.</li>
  <li><strong>Add the intentional views to your home screen</strong> (the links under each site below): open the link in your browser, then Share → Add to Home Screen.</li>
  <li><strong>iPhone and iPad:</strong> when adding to the home screen, turn off “Open as Web App”. The icon then opens in Safari, where your blocker runs; web apps opened outside Safari may not run extensions.</li>
  <li><strong>Android:</strong> add the shortcut from Firefox (or Brave), so it opens in the browser that filters.</li>
</ol>
<p>Optional: turn off the sites' push notifications, and use Screen Time or Digital Wellbeing to make reinstalling the apps take a deliberate step.</p>

<h2 id="sites">What changes on each site</h2>
<p>For a single site, import its list URL below into your blocker. The optional userscript runs on all the sites it supports, independently of these subscriptions.</p>
${index.sites.map((s) => renderSite(index, s)).join("\n")}

<footer>
  <p>Version ${escapeHtml(index.version)} · <a href="https://github.com/aymericbeaumet/intentional">Source, issues and contributions</a> · MIT license</p>
  <p>If a feed returns or a direct link stops working, <a href="https://github.com/aymericbeaumet/intentional/issues/new/choose">report the page and blocker</a>.</p>
</footer>
</main>
<script>
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-copy]");
  if (!button) return;
  navigator.clipboard.writeText(button.dataset.copy).then(() => {
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1500);
  });
});
</script>
</body>
</html>
`;
}

export function generateSite(dist: string): void {
  const index = JSON.parse(readFileSync(join(dist, "index.json"), "utf8")) as Index;
  writeFileSync(join(dist, "index.html"), renderIndex(index));
  console.log(`wrote dist/index.html (${index.sites.length} sites, ${PLATFORMS.length} platforms)`);
}
