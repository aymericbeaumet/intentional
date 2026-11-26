// Minimal types for the parts of @gorhill/ubo-core the engine tests use.
declare module "@gorhill/ubo-core" {
  export class StaticNetFilteringEngine {
    static create(): Promise<StaticNetFilteringEngine>;
    useLists(lists: { name: string; raw: string }[]): Promise<void>;
    /** 0: no match, 1: blocked, 2: allowed by an exception. */
    matchRequest(details: { originURL: string; url: string; type: string }): 0 | 1 | 2;
    toLogData(): { raw: string } | undefined;
  }
}
