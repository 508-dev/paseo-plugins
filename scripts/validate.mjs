import { readFile, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const records = JSON.parse(await readFile(path.join(root, "plugins.json"), "utf8"));
const ids = new Set();
const names = new Set();

function placeholders(message) {
  return [...new Set([...message.matchAll(/{{\s*([^},\s]+)/g)].map((match) => match[1]))]
    .toSorted()
    .join(",");
}

async function validateTranslations(directory, slug) {
  const localeDirectory = path.join(directory, "client", "locales");
  const files = await readdir(localeDirectory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (!files.length) return;
  const read = async (file) => JSON.parse(await readFile(path.join(localeDirectory, file), "utf8"));
  const english = await read("en.json");
  const messages = Object.keys(english).filter((key) => !/_(one|other)$/.test(key));
  const plurals = Object.keys(english)
    .filter((key) => key.endsWith("_other"))
    .map((key) => key.slice(0, -6));
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const locale = file.slice(0, -5);
    const resource = await read(file);
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    const keys = new Set([
      ...messages,
      ...plurals.flatMap((key) => categories.map((form) => `${key}_${form}`)),
    ]);
    for (const key of keys) {
      const source = english[key] ?? english[key.replace(/_[^_]+$/, "_other")];
      const value = resource[key];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${slug}/${locale}: missing translation for ${key}`);
      }
      if (placeholders(value) !== placeholders(source)) {
        throw new Error(`${slug}/${locale}: mismatched placeholders for ${key}`);
      }
    }
    for (const key of Object.keys(resource)) {
      if (!keys.has(key)) throw new Error(`${slug}/${locale}: unexpected translation key ${key}`);
    }
  }
}

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
  await validateTranslations(directory, record.slug);
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
  `Validated ${records.length} independent plugin manifests, IDs, locks, source pins, and translations.`,
);
