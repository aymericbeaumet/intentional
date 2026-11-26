// Install guides, one per platform. The website renders these; keep every
// claim checkable and link to the blocker's own docs where a step lives.

import type { Target } from "../model.ts";

/** A step is plain text with optional inline actions rendered as buttons. */
export type Step =
  | string
  | { text: string; subscribe: Target }
  | { text: string; copy: "ublock-resources" | Target }
  | { text: string; install: "userscript" };

export interface Setup {
  title: string;
  steps: Step[];
}

export interface Platform {
  id: string;
  name: string;
  devices: string;
  recommended: Setup;
  redirects: Setup;
  alternatives: Setup[];
  notes?: string[];
}

const UBO_REDIRECTS: Setup = {
  title: "Turn on redirects in uBlock Origin",
  steps: [
    "Open the uBlock Origin dashboard → Settings, and tick “I am an advanced user”.",
    "Click the gears icon next to it to open the advanced settings.",
    {
      text: "Find userResourcesLocation and set its value to this URL (if it already holds a URL other than unset, add ours after a space):",
      copy: "ublock-resources",
    },
    "Click “Apply changes”, then in Filter lists click “Update now”.",
  ],
};

const LITE_LIST: Step = {
  text: "In the uBlock Origin Lite dashboard, select Optimal or Complete filtering so feeds can be hidden. Open Filter lists → Add filter list and enter this URL:",
  copy: "ublock",
};

const USERSCRIPT = (manager: string, ...settings: string[]): Setup => ({
  title: `Redirects with a userscript (${manager})`,
  steps: [
    `Install ${manager}.`,
    ...settings,
    { text: "Open the userscript and confirm the install:", install: "userscript" },
  ],
});

const CHROMIUM_USERSCRIPTS = USERSCRIPT(
  "Tampermonkey",
  "In your browser's extensions page, open Tampermonkey's details and enable “Allow user scripts”.",
);

export const PLATFORMS: Platform[] = [
  {
    id: "firefox",
    name: "Firefox",
    devices: "Windows, macOS, Linux",
    recommended: {
      title: "uBlock Origin",
      steps: [
        "Install uBlock Origin from addons.mozilla.org (developer: Raymond Hill).",
        {
          text: "Subscribe to the list, then confirm in the uBlock Origin tab that opens:",
          subscribe: "ublock",
        },
      ],
    },
    redirects: UBO_REDIRECTS,
    alternatives: [USERSCRIPT("Violentmonkey")],
  },
  {
    id: "chromium",
    name: "Chrome, Edge, Opera, Vivaldi",
    devices: "Windows, macOS, Linux, ChromeOS",
    recommended: {
      title: "AdGuard AdBlocker",
      steps: [
        "Install AdGuard AdBlocker from your browser's extension store.",
        "Open your browser's extensions page, open AdGuard's details and turn on “Allow user scripts” (Chrome needs it for custom lists).",
        {
          text: "Subscribe to the list. In the dialog, tick “Trusted” so redirects work, then add it:",
          subscribe: "adguard",
        },
      ],
    },
    redirects: {
      title: "Redirects",
      steps: ["Included: they run because the list was added as Trusted."],
    },
    alternatives: [
      {
        title: "uBlock Origin Lite",
        steps: [
          "Install uBlock Origin Lite, then turn on “Allow user scripts” for it in your extensions page before importing anything.",
          LITE_LIST,
          "Add the userscript below for redirects.",
        ],
      },
      CHROMIUM_USERSCRIPTS,
    ],
  },
  {
    id: "brave",
    name: "Brave",
    devices: "Windows, macOS, Linux, Android",
    recommended: {
      title: "Brave Shields",
      steps: [
        "Open brave://settings/shields/filters (on Android: brave://adblock).",
        { text: "Under “Add custom filter lists”, paste this URL:", copy: "brave" },
      ],
    },
    redirects: { ...CHROMIUM_USERSCRIPTS, title: "Redirects on desktop with Tampermonkey" },
    alternatives: [],
    notes: ["Brave on Android can't run userscripts: lists hide feeds there, but don't redirect."],
  },
  {
    id: "safari-mac",
    name: "Safari",
    devices: "macOS",
    recommended: {
      title: "AdGuard for Safari",
      steps: [
        "Install AdGuard for Safari (or AdGuard Mini) from the Mac App Store.",
        "In Safari → Settings → Extensions, enable every AdGuard extension, including the advanced one (it runs procedural rules and scripts).",
        {
          text: "In AdGuard → Filters → Custom, add this list and tick “Trusted” so redirects work:",
          copy: "adguard",
        },
      ],
    },
    redirects: { title: "Redirects", steps: ["Included: they run because the list was added as Trusted."] },
    alternatives: [
      {
        title: "uBlock Origin Lite + Userscripts",
        steps: [
          "Install uBlock Origin Lite from the App Store and enable it in Safari → Settings → Extensions.",
          LITE_LIST,
          "For redirects, enable the Userscripts extension in Safari.",
          { text: "Open the script in Safari and save it with Userscripts:", install: "userscript" },
        ],
      },
    ],
  },
  {
    id: "android",
    name: "Android",
    devices: "Phones and tablets",
    recommended: {
      title: "Firefox + uBlock Origin",
      steps: [
        "Install Firefox from the Play Store.",
        "Menu → Extensions → install uBlock Origin.",
        { text: "Open this page in Firefox and subscribe:", subscribe: "ublock" },
      ],
    },
    redirects: UBO_REDIRECTS,
    alternatives: [
      {
        title: "AdGuard for Android",
        steps: [
          "Install AdGuard for Android (system-wide; it filters browsers once HTTPS filtering is on).",
          { text: "Filters → Custom filters → add this URL and tick “Trusted”:", copy: "adguard" },
        ],
      },
      {
        title: "Brave",
        steps: [{ text: "brave://adblock → Custom filter lists → add:", copy: "brave" }],
      },
    ],
  },
  {
    id: "ios",
    name: "iPhone and iPad",
    devices: "iOS, iPadOS",
    recommended: {
      title: "Safari + uBlock Origin Lite (free)",
      steps: [
        "Install uBlock Origin Lite from the App Store (developer: Raymond Hill).",
        "Settings → Apps → Safari → Extensions → uBlock Origin Lite: turn it on and allow it on all websites.",
        LITE_LIST,
      ],
    },
    redirects: {
      title: "Redirects with the Userscripts app (free)",
      steps: [
        "Install “Userscripts” from the App Store and enable it in Settings → Apps → Safari → Extensions.",
        { text: "Open the userscript in Safari and save it with Userscripts:", install: "userscript" },
      ],
    },
    alternatives: [
      {
        title: "AdGuard for iOS",
        steps: [
          {
            text: "AdGuard → Protection → Safari protection → Filters → Custom → add this URL, tick “Trusted”:",
            copy: "adguard",
          },
          "Without Premium (Advanced protection), only basic hiding and network rules apply: no procedural rules, no redirects.",
        ],
      },
    ],
  },
];
