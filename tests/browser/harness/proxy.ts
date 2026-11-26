import http from "node:http";
import https from "node:https";
import net, { type AddressInfo, type Socket } from "node:net";
import { generate } from "selfsigned";

export interface ProxyResponse {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

/** Maps a requested URL to a response, or `null` for a 404. */
export type Resolver = (url: URL) => ProxyResponse | null;

export interface ProxyServer {
  port: number;
  /** Every URL the browser requested through the proxy, in order. */
  requests: string[];
  close(): Promise<void>;
}

export interface ProxyOptions {
  /** Hosts to tunnel to the real internet instead of answering locally (live canary). */
  passthrough?: (host: string) => boolean;
}

/**
 * An HTTPS-terminating forward proxy. Browsers are pointed at it and told to
 * accept its self-signed certificate, so pages load under their real hostnames
 * (www.youtube.com, x.com, ...) while every byte comes from local fixtures.
 * Without `passthrough`, nothing ever reaches the network.
 */
export async function startProxy(resolve: Resolver, options: ProxyOptions = {}): Promise<ProxyServer> {
  const pems = await generate([{ name: "commonName", value: "intentional.test" }], { keySize: 2048 });
  const requests: string[] = [];

  const handle = (scheme: "http" | "https") => (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url =
      scheme === "http" && req.url?.startsWith("http")
        ? new URL(req.url)
        : new URL(`${scheme}://${req.headers.host}${req.url ?? "/"}`);
    requests.push(url.href);
    const out = resolve(url) ?? { status: 404, body: "" };
    res.writeHead(out.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...out.headers,
    });
    res.end(out.body);
  };

  const tls = https.createServer({ key: pems.private, cert: pems.cert }, handle("https"));
  const server = http.createServer(handle("http"));
  const sockets = new Set<Socket>();

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", (req, socket: Socket, head) => {
    const [host = "", port = "443"] = (req.url ?? "").split(":");
    if (options.passthrough?.(host)) {
      // Live mode: tunnel untouched to the real site.
      const upstream = net.connect(Number(port), host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
      return;
    }
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) socket.unshift(head);
    tls.emit("connection", socket);
  });

  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;

  return {
    port,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((ok) => server.close(() => ok()));
      tls.close();
    },
  };
}
