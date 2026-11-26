// @ts-check
// The redirect runtime. These functions are serialized with `Function#toString`
// and shipped inside filter lists and the userscript, so each one must stay
// self-contained: no imports, no references to module scope other than each
// other by name.

/**
 * @typedef {{ from: string, to: string }} Redirect
 * @typedef {{ when: string, click: string, selected: string }} Select
 * @typedef {{ redirects: Redirect[], select: Select[] }} HostConfig
 */

/**
 * Where an algorithmic URL should lead instead, or null to stay.
 * @param {string} path pathname + search of the current page
 * @param {Redirect[]} redirects
 * @returns {string | null}
 */
export function intentionalResolve(path, redirects) {
  for (const redirect of redirects) {
    const match = new RegExp(redirect.from).exec(path);
    if (!match) continue;
    const to = redirect.to.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? "");
    return to === path ? null : to;
  }
  return null;
}

/**
 * Applies a host's config now and on every later in-app navigation.
 * @param {HostConfig} config
 * @param {Window & typeof globalThis} win
 */
export function intentionalRun(config, win) {
  const doc = win.document;
  let lastClick = 0;
  let pending = false;
  /** @type {string | null} */
  let handledRedirectPath = null;

  /* If a site sends us back where we came from (e.g. it rewrites the target URL),
     stop after 3 redirects in 10 seconds instead of reloading forever. */
  const allowRedirect = () => {
    try {
      const key = "intentional:redirects";
      const now = Date.now();
      const recent = JSON.parse(win.sessionStorage.getItem(key) || "[]").filter(
        (/** @type {number} */ t) => now - t < 10000,
      );
      if (recent.length >= 3) return false;
      recent.push(now);
      win.sessionStorage.setItem(key, JSON.stringify(recent));
    } catch {
      /* No sessionStorage (sandboxed frame): redirect anyway. */
    }
    return true;
  };

  const check = () => {
    pending = false;
    const path = win.location.pathname + win.location.search;
    if (path === handledRedirectPath) return;
    const to = intentionalResolve(path, config.redirects);
    if (to !== null) {
      handledRedirectPath = path;
      if (allowRedirect()) win.location.replace(to);
      return;
    }
    handledRedirectPath = null;
    for (const select of config.select) {
      if (!new RegExp(select.when).test(path) || doc.querySelector(select.selected)) continue;
      const tab = doc.querySelector(select.click);
      const now = Date.now();
      if (tab instanceof win.HTMLElement && now - lastClick > 1000) {
        lastClick = now;
        tab.click();
      }
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    win.setTimeout(check, 50);
  };

  for (const method of /** @type {const} */ (["pushState", "replaceState"])) {
    const original = win.history[method];
    win.history[method] = function (...args) {
      const result = original.apply(this, args);
      check();
      return result;
    };
  }
  win.addEventListener("popstate", check);
  if (config.select.length > 0) {
    new win.MutationObserver(schedule).observe(doc, { childList: true, subtree: true });
  }
  win.setInterval(check, 1000);
  check();
}

/**
 * uBO entry points (scriptlets loaded through `userResourcesLocation`). Each
 * filter registers one redirect (with its position in site.yaml, since uBO
 * doesn't keep filter order) or one tab selection; the first one starts the
 * runtime once every filter of the page had a chance to register.
 * @param {string} kind
 * @param {string[]} args
 * @param {string} hosts
 */
export function intentionalRegister(kind, args, hosts) {
  const key = Symbol.for("intentional");
  /** @type {any} */
  const win = window;
  // uBO's domain filters include subdomains. Routes in site.yaml belong to exact hosts.
  if (hosts && !hosts.split("|").includes(win.location.hostname)) return;
  if (!win[key]) win[key] = { redirects: [], select: [], ordered: [] };
  /** @type {HostConfig & { started?: boolean, ordered: [number, Redirect][] }} */
  const state = win[key];
  if (kind === "redirect") {
    state.ordered.push([Number(args[0]), { from: args[1] ?? "", to: args[2] ?? "" }]);
  }
  if (kind === "select") {
    state.select.push({ when: args[0] ?? "", click: args[1] ?? "", selected: args[2] ?? "" });
  }
  if (state.started) return;
  state.started = true;
  queueMicrotask(() => {
    state.redirects = state.ordered.sort((a, b) => a[0] - b[0]).map(([, redirect]) => redirect);
    intentionalRun(state, win);
  });
}
