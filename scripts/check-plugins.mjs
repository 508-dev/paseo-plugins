import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const plugins = JSON.parse(await readFile(path.join(root, "plugins.json"), "utf8"));
const [script, ...requested] = process.argv.slice(2);
if (!["typecheck", "lint"].includes(script)) throw new Error("Choose typecheck or lint");
for (const slug of requested) {
  if (!plugins.some((plugin) => plugin.slug === slug)) throw new Error(`Unknown plugin: ${slug}`);
}
for (const plugin of plugins) {
  if (requested.length && !requested.includes(plugin.slug)) continue;
  const cwd = path.join(root, "plugins", plugin.slug);
  const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  if (!pkg.scripts?.[script]) continue;
  const result = spawnSync("npm", ["run", script], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
