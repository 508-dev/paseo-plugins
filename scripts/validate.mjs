import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const records = JSON.parse(await readFile(path.join(root, "plugins.json"), "utf8"));
const ids = new Set();
const names = new Set();
for (const record of records) {
  if (!/^[a-z][a-z0-9-]*$/.test(record.slug)) throw new Error("Invalid plugin directory");
  const directory = path.join(root, "plugins", record.slug);
  const manifest = JSON.parse(await readFile(path.join(directory, "paseo-plugin.json"), "utf8"));
  const pkg = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(directory, "package-lock.json"), "utf8"));
  if (ids.has(manifest.id) || manifest.id !== record.id)
    throw new Error(`Changed or duplicate ID: ${record.slug}`);
  if (names.has(pkg.name) || pkg.name !== record.package)
    throw new Error(`Changed or duplicate package: ${record.slug}`);
  ids.add(manifest.id);
  names.add(pkg.name);
  if (
    pkg.version !== record.version ||
    lock.packages[""].name !== pkg.name ||
    lock.packages[""].version !== pkg.version
  )
    throw new Error(`Package/lock mismatch: ${record.slug}`);
  if (
    pkg.repository.directory !== `plugins/${record.slug}` ||
    pkg.repository.url !== "https://github.com/508-dev/paseo-plugins.git"
  )
    throw new Error(`Wrong repository metadata: ${record.slug}`);
  if (!manifest.requirements?.paseo || manifest.requirements.paseo !== record.paseo)
    throw new Error(`Changed compatibility: ${record.slug}`);
  await access(path.join(directory, "OVERVIEW.md"));
  for (const media of manifest.media ?? []) {
    if (media.startsWith("https://")) continue;
    const resolved = path.resolve(directory, media);
    if (!resolved.startsWith(directory + path.sep))
      throw new Error(`Invalid media path: ${record.slug}`);
    await access(resolved);
  }
  if (!/^[a-f0-9]{40}$/.test(record.source.commit))
    throw new Error(`Unpinned provenance: ${record.slug}`);
}
console.log(
  `Validated ${records.length} independent plugin manifests, IDs, locks, and source pins.`,
);
