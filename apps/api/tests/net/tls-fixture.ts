import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createTcpServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

export const fixtureHostname = "selo-test.example";
export const fixtureOrigin = `https://${fixtureHostname}`;
export const opensslAvailable = spawnSync("openssl", ["version"]).status === 0;

export type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void;

export interface TlsFixture {
  readonly port: number;
  readonly close: () => Promise<void>;
}

function mintCertificate(): { key: string; cert: string } {
  const directory = mkdtempSync(join(tmpdir(), "selo-tls-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      `/CN=${fixtureHostname}`,
      "-addext",
      `subjectAltName=DNS:${fixtureHostname}`,
    ],
    { stdio: "ignore" },
  );
  const material = { key: readFileSync(keyPath, "utf8"), cert: readFileSync(certPath, "utf8") };
  rmSync(directory, { recursive: true, force: true });
  return material;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address: AddressInfo | string | null = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });
}

export async function startTlsFixture(
  routes: Readonly<Record<string, RouteHandler>>,
): Promise<TlsFixture> {
  const { key, cert } = mintCertificate();
  const defaults = getCACertificates("default");
  setDefaultCACertificates([...defaults, cert]);
  const server = createServer({ key, cert }, (request, response) => {
    const path = new URL(request.url ?? "/", fixtureOrigin).pathname;
    const handler = routes[path];
    if (handler === undefined) {
      response.writeHead(404).end();
      return;
    }
    handler(request, response);
  });
  const port = await listen(server);
  return {
    port,
    close: () =>
      new Promise((resolve) => {
        setDefaultCACertificates(defaults);
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

export function unusedPort(): Promise<number> {
  const probe = createTcpServer();
  return new Promise((resolve) => {
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

export function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}
