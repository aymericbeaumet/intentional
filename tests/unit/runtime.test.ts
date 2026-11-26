import { describe, expect, it, vi } from "vitest";
import { intentionalResolve, intentionalRun } from "../../src/redirect/runtime.js";

const redirects = [
  { from: "^/(\\?.*)?$", to: "/feed/subscriptions" },
  { from: "^/shorts/([A-Za-z0-9_-]+)", to: "/watch?v=$1" },
];

describe("intentionalResolve", () => {
  it.each([
    ["/", "/feed/subscriptions"],
    ["/?app=desktop", "/feed/subscriptions"],
    ["/shorts/abc_DEF-1", "/watch?v=abc_DEF-1"],
    ["/shorts/abc?feature=share", "/watch?v=abc"],
    ["/feed/subscriptions", null],
    ["/watch?v=abc", null],
    ["/shorts", null],
  ])("%s → %s", (path, expected) => {
    expect(intentionalResolve(path, redirects)).toBe(expected);
  });

  it("first matching rule wins", () => {
    expect(
      intentionalResolve("/a", [
        { from: "^/a", to: "/first" },
        { from: "^/a", to: "/second" },
      ]),
    ).toBe("/first");
  });

  it("never redirects a page to itself", () => {
    expect(intentionalResolve("/following", [{ from: "^/following", to: "/following" }])).toBeNull();
  });

  it("drops missing capture groups instead of printing them", () => {
    expect(intentionalResolve("/x", [{ from: "^/x", to: "/y/$2" }])).toBe("/y/");
  });
});

/** A just-enough Window for the runtime: location, history, timers, a DOM. */
function fakeWindow(path: string, storage = new Map<string, string>()) {
  const [pathname, search = ""] = path.split(/(?=\?)/);
  const location = {
    pathname: pathname ?? "/",
    search,
    replace: vi.fn(),
  };
  const listeners = new Map<string, () => void>();
  let poll = () => {};
  const clicks: string[] = [];
  const tabs: Record<string, { selected: boolean }> = { following: { selected: false } };
  class HTMLElement {
    readonly id: string;
    constructor(id: string) {
      this.id = id;
    }
    click() {
      clicks.push(this.id);
      if (this.id === "following") tabs.following!.selected = true;
    }
  }
  const document = {
    querySelector: (selector: string) => {
      if (selector === "#following[aria-selected=true]") return tabs.following!.selected ? {} : null;
      if (selector === "#following") return new HTMLElement("following");
      return null;
    },
  };
  const win = {
    location,
    document,
    HTMLElement,
    history: {
      pushState(_s: unknown, _t: string, url: string) {
        const [p, q = ""] = url.split(/(?=\?)/);
        location.pathname = p ?? "/";
        location.search = q;
      },
      replaceState() {},
    },
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    setInterval: (fn: () => void) => {
      poll = fn;
    },
    sessionStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    },
    setTimeout: (fn: () => void) => fn(),
    MutationObserver: class {
      observe() {}
    },
  };
  return {
    win: win as unknown as Window & typeof globalThis,
    location,
    clicks,
    listeners,
    poll: () => poll(),
  };
}

describe("intentionalRun", () => {
  it("stops redirecting when a site keeps sending us back (no reload loop)", () => {
    const storage = new Map<string, string>();
    const replaces = [1, 2, 3, 4, 5].map(() => {
      const { win, location } = fakeWindow("/", storage);
      intentionalRun({ redirects, select: [] }, win);
      return location.replace.mock.calls.length;
    });
    expect(replaces).toEqual([1, 1, 1, 0, 0]);
  });

  it("leaves a bouncing page alone until the user navigates away and comes back", () => {
    const storage = new Map<string, string>();
    const config = { redirects, select: [] };
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 3; i++) intentionalRun(config, fakeWindow("/", storage).win);
      const { win, location, poll } = fakeWindow("/", storage);
      intentionalRun(config, win);
      vi.advanceTimersByTime(15_000);
      poll();
      expect(location.replace).not.toHaveBeenCalled();
      win.history.pushState({}, "", "/feed/subscriptions");
      win.history.pushState({}, "", "/");
      expect(location.replace).toHaveBeenCalledExactlyOnceWith("/feed/subscriptions");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends one replacement while a slow destination is still loading", () => {
    const { win, location, poll } = fakeWindow("/");
    intentionalRun({ redirects, select: [] }, win);
    poll();
    expect(location.replace).toHaveBeenCalledExactlyOnceWith("/feed/subscriptions");
  });

  it("redirects on load", () => {
    const { win, location } = fakeWindow("/");
    intentionalRun({ redirects, select: [] }, win);
    expect(location.replace).toHaveBeenCalledWith("/feed/subscriptions");
  });

  it("stays on allowed pages", () => {
    const { win, location } = fakeWindow("/watch?v=abc");
    intentionalRun({ redirects, select: [] }, win);
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("redirects after in-app navigation (history.pushState)", () => {
    const { win, location } = fakeWindow("/watch?v=abc");
    intentionalRun({ redirects, select: [] }, win);
    win.history.pushState({}, "", "/shorts/xyz");
    expect(location.replace).toHaveBeenCalledWith("/watch?v=xyz");
  });

  it("redirects on back/forward (popstate)", () => {
    const { win, location, listeners } = fakeWindow("/watch?v=abc");
    intentionalRun({ redirects, select: [] }, win);
    location.pathname = "/";
    listeners.get("popstate")?.();
    expect(location.replace).toHaveBeenCalledWith("/feed/subscriptions");
  });

  it("selects the intentional tab once, then leaves it alone", () => {
    const { win, clicks } = fakeWindow("/home");
    const select = [{ when: "^/home", click: "#following", selected: "#following[aria-selected=true]" }];
    intentionalRun({ redirects: [], select }, win);
    win.history.pushState({}, "", "/home");
    expect(clicks).toEqual(["following"]);
  });

  it("does not select tabs on other pages", () => {
    const { win, clicks } = fakeWindow("/explore");
    const select = [{ when: "^/home", click: "#following", selected: "#following[aria-selected=true]" }];
    intentionalRun({ redirects: [], select }, win);
    expect(clicks).toEqual([]);
  });
});
