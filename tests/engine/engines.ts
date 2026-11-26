import { Engine, Request, RequestType } from "@adguard/tsurlfilter";
import { StaticNetFilteringEngine } from "@gorhill/ubo-core";
import type { RequestKind } from "../../src/model.ts";

const UBLOCK_TYPES: Record<RequestKind, string> = {
  document: "main_frame",
  xhr: "xmlhttprequest",
  fetch: "xmlhttprequest",
  script: "script",
  image: "image",
  media: "media",
  subdocument: "sub_frame",
  other: "other",
};

const ADGUARD_TYPES: Record<RequestKind, RequestType> = {
  document: RequestType.Document,
  xhr: RequestType.XmlHttpRequest,
  fetch: RequestType.XmlHttpRequest,
  script: RequestType.Script,
  image: RequestType.Image,
  media: RequestType.Media,
  subdocument: RequestType.SubDocument,
  other: RequestType.Other,
};

export interface Verdict {
  blocked: boolean;
  /** Text of the filter that decided, when one did. */
  rule: string | null;
}

export interface NetworkEngine {
  match(url: string, type: RequestKind, from?: string): Verdict;
}

/** uBO's own static network filtering engine (one instance per process). */
export async function ublockEngine(list: string): Promise<NetworkEngine> {
  const snfe = await StaticNetFilteringEngine.create();
  await snfe.useLists([{ name: "intentional", raw: list }]);
  return {
    match(url, type, from) {
      const result = snfe.matchRequest({ originURL: from ?? url, url, type: UBLOCK_TYPES[type] });
      const rule = result !== 0 ? (snfe.toLogData()?.raw ?? null) : null;
      return { blocked: result === 1, rule };
    },
  };
}

/** AdGuard's filtering engine, fed the converted AdGuard list. */
export function adguardEngine(list: string): NetworkEngine {
  const engine = Engine.createSync({ filters: [{ id: 1, content: list }] });
  const errors = engine.getConversionErrors();
  if (errors.length > 0) throw new Error(`AdGuard rejected rules: ${JSON.stringify(errors)}`);
  return {
    match(url, type, from) {
      const result = engine.matchRequest(new Request(url, from ?? null, ADGUARD_TYPES[type]));
      const rule = type === "document" ? result.getDocumentBlockingResult() : result.getBasicResult();
      return { blocked: rule !== null && !rule.isAllowlist(), rule: rule?.getText() ?? null };
    },
  };
}
