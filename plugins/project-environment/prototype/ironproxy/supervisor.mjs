import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";

const secret = randomBytes(32).toString("hex");
const upstream = https.createServer(
  { key: readFileSync("/fixture/origin.key"), cert: readFileSync("/fixture/origin.crt") },
  (req, res) => {
    // A denial must come from IronProxy. Every request reaching the fixture has
    // a different status so a false positive cannot pass the denial checks.
    const accepted =
      req.method === "GET" &&
      req.url === "/identity" &&
      req.headers.authorization === "Bearer " + secret;
    res.writeHead(accepted ? 200 : 401);
    res.end(accepted ? "fixture identity" : "unauthorized");
  },
);
upstream.listen(443, "127.0.0.1");
const proxy = spawn("/iron-proxy", ["--config", "/policy.yaml"], {
  env: { FIXTURE_SECRET: secret, SSL_CERT_FILE: "/fixture/origin.crt" },
  stdio: "ignore",
});
proxy.on("exit", () => process.exit(1));
proxy.on("error", () => process.exit(1));

// The only transport shared with the workload. Its peer is fixed by the supervisor.
net
  .createServer((client) => {
    const target = net.connect(8443, "127.0.0.1");
    target.on("error", () => client.destroy());
    client.on("error", () => target.destroy());
    target.on("close", () => client.destroy());
    client.on("close", () => target.destroy());
    client.pipe(target).pipe(client);
  })
  .listen("/transport/egress.sock");
