import assert from "node:assert/strict";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const credential = JSON.parse(fs.readFileSync("/credential.json", "utf8"));
assert.deepEqual(Object.keys(credential).toSorted(), [
  "caPath",
  "description",
  "host",
  "method",
  "mode",
  "name",
  "path",
  "socketPath",
  "usage",
]);
assert.equal(credential.mode, "ironproxy");

function request(method, path, hostname = "localhost") {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        socketPath: credential.socketPath,
        servername: hostname,
        headers: { host: hostname },
        ca: fs.readFileSync(credential.caPath),
        method,
        path,
        agent: false,
      },
      (res) => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve([res.statusCode, body]));
      },
    );
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("request timeout")));
    req.end();
  });
}

assert.equal(process.env[credential.name], undefined);
for (const path of ["/fixture", "/var/run/docker.sock", "/iron-proxy"]) {
  assert.equal(fs.existsSync(path), false);
}
assert.ok(
  Object.values(os.networkInterfaces())
    .flat()
    .every((addr) => addr.internal),
);
await assert.rejects(
  new Promise((resolve, reject) => {
    const direct = net.connect(443, "127.0.0.1", () => {
      direct.destroy();
      resolve();
    });
    direct.on("error", reject);
  }),
  { code: "ECONNREFUSED" },
);
console.log("PASS workload has only loopback; direct fixture connection refused");
if (process.argv[2] === "proxy-offline") {
  await assert.rejects(request(credential.method, credential.path, credential.host), (error) =>
    ["ECONNREFUSED", "ENOENT"].includes(error.code),
  );
  console.log("PASS stopping the proxy removes the only route");
  process.exit(0);
}
let result;
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    result = await request(credential.method, credential.path, credential.host);
    break;
  } catch (error) {
    if (attempt === 49) throw error;
    await delay(100);
  }
}
assert.deepEqual(result, [200, "fixture identity"]);
console.log("PASS authenticated GET over verified TLS with no workload credential");
for (const args of [
  ["POST", "/identity"],
  ["GET", "/other"],
  ["GET", "/identity", "other.invalid"],
]) {
  assert.equal((await request(...args))[0], 403);
}
console.log("PASS IronProxy denied the wrong method, path and host");
