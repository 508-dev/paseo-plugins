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
const sha = "c223d05522bba90dc30490964e90d0d43029d55f1f1d4a0d23ca29dd39d54c4e";
export const installHint =
  "Install the approved IronProxy v0.61.0 Linux AMD64 binary on the Paseo host at " + binary;
export class ProxySetupError extends Error {}
export async function verifyProxy() {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw new ProxySetupError("IronProxy mode requires a Linux AMD64 host.");
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
  throw new ProxySetupError(installHint);
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

function get(port: number, url: URL, ca: Buffer, token: string, signal: AbortSignal) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        ca,
        servername: url.hostname,
        path: url.pathname,
        headers: { Host: url.hostname, Authorization: "Bearer " + token },
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
    req.end();
  });
}

export async function proxyGet(
  route: string,
  value: string,
  secrets: string[],
  canceled: AbortSignal,
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
    const rule = { host: url.hostname, methods: ["GET"], paths: [url.pathname] };
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
    // Bound the subprocess lifetime even if the plugin itself exits abruptly.
    const child = spawn("/usr/bin/timeout", ["-k", "1", "35", binary, "--config", config], {
      env: { UPSTREAM_CREDENTIAL: value },
      stdio: "ignore",
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
          const result = await get(port, url, ca, token, signal);
          return { status: result.status, body: redact(result.body, [...secrets, token]) };
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ECONNREFUSED"))
            throw error;
          await delay(50, undefined, { signal });
        }
      }
    } finally {
      child.kill();
      await closed;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
