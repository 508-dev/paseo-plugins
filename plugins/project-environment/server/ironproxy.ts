import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { request } from "node:https";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { proxyRoute } from "../shared/environment";
import { redact } from "./execute";

const binary = path.join(homedir(), ".local/lib/paseo-project-environment/iron-proxy-v0.61.0");
const binaryDigests: Readonly<Record<string, string | undefined>> = {
  linux_amd64: "c223d05522bba90dc30490964e90d0d43029d55f1f1d4a0d23ca29dd39d54c4e",
  darwin_amd64: "232d15a54ee485f4c194acc2efe2f93e196e208f0c3e82c435253c9b714d5e87",
  darwin_arm64: "775df584c40958464b067cd36ddabbd919a345dec68356632ce43f5dd5267ea8",
};

export class ProxySetupError extends Error {}
export async function verifyProxy() {
  const target = `${process.platform}_${process.arch === "x64" ? "amd64" : process.arch}`;
  const sha = binaryDigests[target];
  if (!sha)
    throw new ProxySetupError(
      `Unsupported IronProxy host: ${process.platform}/${process.arch}. Supported hosts are macOS (Apple Silicon or Intel) and Linux AMD64.`,
    );
  try {
    await access(binary, constants.X_OK);
    if (
      createHash("sha256")
        .update(await readFile(binary))
        .digest("hex") === sha
    )
      return;
  } catch {
    /* Missing or unreadable executable. */
  }
  throw new ProxySetupError(
    `Extract iron-proxy_0.61.0_${target}.tar.gz from the IronProxy v0.61.0 release and install the executable at ${binary}.`,
  );
}

async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") reject(new Error("Port unavailable"));
        else resolve(address.port);
      });
    });
  });
}

function sendRequest(
  port: number,
  url: URL,
  ca: Buffer,
  token: string,
  signal: AbortSignal,
  method: string,
  body?: string,
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        ca,
        servername: url.hostname,
        method,
        path: url.pathname,
        headers: {
          Host: url.hostname,
          Authorization: "Bearer " + token,
          ...(body !== undefined
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
            : {}),
        },
        agent: false,
        signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("error", reject);
        res.on("data", (buf: Buffer) => {
          size += buf.length;
          if (size > 256 * 1024) req.destroy(new Error("Response too large"));
          else chunks.push(buf);
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

export async function proxyRequest(
  route: string,
  value: string,
  secrets: string[],
  canceled: AbortSignal,
  method = "GET",
  body?: string,
) {
  const url = new URL(proxyRoute.parse(route));
  await verifyProxy();
  const signal = AbortSignal.any([canceled, AbortSignal.timeout(30000)]);
  const dir = await mkdtemp(path.join(tmpdir(), "paseo-ironproxy-"));
  try {
    await promisify(execFile)(
      binary,
      ["generate-ca", "-alg", "ed25519", "-outdir", dir, "-expiry-hours", "1"],
      { env: {}, signal },
    );
    const token = randomBytes(32).toString("hex");
    const port = await freePort();
    const rule = { host: url.hostname, methods: [method], paths: [url.pathname] };
    const cert = path.join(dir, "ca.crt");
    const config = path.join(dir, "policy.json");
    await writeFile(
      config,
      JSON.stringify({
        dns: { enabled: false },
        metrics: { listen: "127.0.0.1:0" },
        proxy: {
          http_listen: "127.0.0.1:0",
          https_listen: "127.0.0.1:" + port,
          upstream_deny_cidrs: [
            "0.0.0.0/8",
            "10.0.0.0/8",
            "100.64.0.0/10",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.168.0.0/16",
            "224.0.0.0/4",
            "::/96",
            "::1/128",
            "fc00::/7",
            "fe80::/10",
            "ff00::/8",
          ],
        },
        tls: { ca_cert: cert, ca_key: path.join(dir, "ca.key") },
        transforms: [
          { name: "allowlist", config: { rules: [rule] } },
          {
            name: "secrets",
            config: {
              secrets: [
                {
                  source: { type: "env", var: "UPSTREAM_CREDENTIAL" },
                  replace: { proxy_value: token, match_headers: ["Authorization"], require: true },
                  rules: [rule],
                },
              ],
            },
          },
        ],
      }),
      { mode: 0o600 },
    );
    const ca = await readFile(cert);
    // macOS has no system timeout command. Its shell watches a pipe owned by
    // the plugin: EOF (including a daemon crash) or the deadline stops the proxy.
    const darwin = process.platform === "darwin";
    const launcher = darwin ? "/bin/bash" : "/usr/bin/timeout";
    const args = darwin
      ? [
          "-c",
          `
          "$@" </dev/null &
          proxy=$!
          trap 'kill -KILL "$proxy" 2>/dev/null; wait "$proxy" 2>/dev/null' EXIT
          trap 'exit 1' CHLD
          read -r -t 35
        `,
          "ironproxy-watchdog",
        ]
      : ["-k", "1", "35"];
    const child = spawn(launcher, [...args, binary, "--config", config], {
      env: { UPSTREAM_CREDENTIAL: value },
      stdio: [darwin ? "pipe" : "ignore", "ignore", "ignore"],
    });
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    let failed = false;
    child.on("error", () => {
      failed = true;
    });
    try {
      for (;;) {
        if (failed || child.exitCode !== null || child.signalCode !== null)
          throw new Error("Proxy startup failed");
        try {
          const result = await sendRequest(port, url, ca, token, signal, method, body);
          return { status: result.status, body: redact(result.body, [...secrets, token]) };
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ECONNREFUSED"))
            throw error;
          await delay(50, undefined, { signal });
        }
      }
    } finally {
      if (child.stdin) child.stdin.end();
      else child.kill();
      await closed;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
