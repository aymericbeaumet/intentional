// Types mirroring src/schema/*.schema.json. The loader validates YAML against
// the schemas, so these types hold for every Site the rest of the code sees.

export type Target = "ublock" | "adguard" | "brave";
export const TARGETS: readonly Target[] = ["ublock", "adguard", "brave"];

export interface Redirect {
  from: string;
  to: string;
  hosts?: string[];
}

export interface Select {
  when: string;
  click: string;
  selected: string;
  hosts?: string[];
}

export interface SiteSpec {
  id: string;
  name: string;
  domains: string[];
  hosts: string[];
  intentional: { label: string; url: string }[];
  policy: { allowed: string[]; blocked: string[]; limitations?: string[] };
  redirects?: Redirect[];
  select?: Select[];
}

export type RequestKind =
  | "document"
  | "xhr"
  | "fetch"
  | "script"
  | "image"
  | "media"
  | "subdocument"
  | "other";

export interface NetworkCase {
  url: string;
  type: RequestKind;
  from?: string;
  expect: "block" | "allow";
  why?: string;
}

export interface PageCase {
  name: string;
  url: string;
  steps?: { navigate: string }[];
  expectUrl?: string;
  hidden?: string[];
  visible?: string[];
  /** A blocker (all its legs) or a single leg name. */
  skip?: (Target | "ublock-base" | "adguard-base" | "userscript")[];
}

export interface LiveCase {
  name: string;
  url: string;
  login?: boolean;
  cookies?: { name: string; value: string; domain: string }[];
  exists?: string[];
  hidden?: string[];
  expectUrl?: string;
}

export interface SiteTests {
  fixtures: { url: string; file: string }[];
  network?: NetworkCase[];
  redirects?: { url: string; expect: string | null }[];
  pages: PageCase[];
  live?: LiveCase[];
}

export interface Site {
  spec: SiteSpec;
  tests: SiteTests;
  /** Source rules (uBO syntax), as written. */
  rules: string;
  dir: string;
}
