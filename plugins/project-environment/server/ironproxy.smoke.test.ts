import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { proxyRequest } from "./ironproxy";

test("installed IronProxy reaches a public HTTPS endpoint with a disposable credential", async () => {
  const marker = randomUUID();
  const result = await proxyRequest(
    "https://api.github.com/user",
    marker,
    [marker],
    AbortSignal.timeout(20000),
  );
  expect(result.status).toBe(401);
  expect(result.body).toMatch(/Bad credentials/i);
  expect(result.body).not.toContain(marker);
}, 30000);

test("forwards a PATCH body to an echo fixture and redacts its disposable bearer", async () => {
  const marker = randomUUID();
  const body = JSON.stringify({ probe: "project-environment" });
  const result = await proxyRequest(
    "https://httpbingo.org/anything",
    marker,
    [marker],
    AbortSignal.timeout(20000),
    "PATCH",
    body,
  );
  expect(result.status).toBe(200);
  const echo = JSON.parse(result.body);
  expect(echo.method).toBe("PATCH");
  expect(echo.json).toEqual(JSON.parse(body));
  expect(JSON.stringify(echo.headers)).toContain("Bearer [REDACTED]");
  expect(result.body.includes(marker)).toBe(false);
}, 30000);
