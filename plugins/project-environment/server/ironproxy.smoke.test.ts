import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { proxyGet } from "./ironproxy";

test("installed IronProxy reaches a public HTTPS endpoint with a disposable credential", async () => {
  const marker = randomUUID();
  const result = await proxyGet(
    "https://api.github.com/user",
    marker,
    [marker],
    AbortSignal.timeout(20000),
  );
  expect(result.status).toBe(401);
  expect(result.body).toMatch(/Bad credentials/i);
  expect(result.body).not.toContain(marker);
}, 30000);
