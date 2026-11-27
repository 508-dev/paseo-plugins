import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const descriptor = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function callPrWatcher<T>(input: unknown, output: z.ZodType<T>): Promise<T> {
  const path = join(
    process.env.PASEO_HOME || join(homedir(), ".paseo"),
    "plugins",
    "pr-watcher-inbox-v1.json",
  );
  let local: z.infer<typeof descriptor>;
  try {
    local = descriptor.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    throw new Error("Install or update PR Watcher on this host to use Pull requests.");
  }
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(`http://127.0.0.1:${local.port}/v1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${local.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      redirect: "error",
      signal: controller.signal,
    });
    payload = await response.json();
  } catch {
    throw new Error("Could not reach PR Watcher on this host. Try refreshing.");
  } finally {
    clearTimeout(deadline);
  }
  if (!response.ok) {
    const detail = z.object({ error: z.string() }).safeParse(payload);
    throw new Error(
      detail.success ? detail.data.error : "Could not complete the PR Watcher request.",
    );
  }
  return output.parse(payload);
}
