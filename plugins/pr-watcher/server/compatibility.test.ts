import { readFileSync } from "node:fs";
import { assertPluginCompatibility } from "@getpaseo/protocol/plugin-requirements";
import { expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../paseo-plugin.json", import.meta.url), "utf8"),
) as { id: string; requirements: { paseo: string } };

it.each(["0.16.0-beta.1", "0.17.0-beta.1", "0.17.3", "0.18.0-beta.1"])(
  "admits Paseo %s on the daemon and app",
  (version) => {
    for (const runtime of ["daemon", "app"] as const) {
      expect(() => assertPluginCompatibility({ ...manifest, version, runtime })).not.toThrow();
    }
  },
);

it("rejects a daemon below the minimum Paseo release", () => {
  expect(() =>
    assertPluginCompatibility({ ...manifest, version: "0.15.4", runtime: "daemon" }),
  ).toThrow("requires Paseo");
});
