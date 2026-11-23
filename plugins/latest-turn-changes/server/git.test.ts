import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { capture, createSnapshotSpace, readComparison } from "./git";

test("approximate Git capture compares only the two snapshots and leaves the Git index intact", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "paseo-plugin-turn-test-"));
  const signal = new AbortController().signal;
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  try {
    git("init");
    writeFileSync(join(cwd, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(cwd, "existing.txt"), "before\n");
    git("add", ".");
    writeFileSync(join(cwd, "existing.txt"), "dirty before turn\n");
    const realIndex = readFileSync(join(cwd, ".git", "index"));
    const space = await createSnapshotSpace(cwd, signal);
    try {
      const before = await capture(space, signal);
      writeFileSync(join(cwd, "new.txt"), "made during turn\n");
      writeFileSync(join(cwd, "ignored.txt"), "ignored\n");
      rmSync(join(cwd, "existing.txt"));
      const after = await capture(space, signal);
      const result = await readComparison(cwd, before, after, signal, space.env);
      assert.equal(result.kind, "ready");
      assert.deepEqual(result.files, [
        { status: "D", path: "existing.txt" },
        { status: "A", path: "new.txt" },
      ]);
      assert.match(result.patch, /-dirty before turn/);
      assert.doesNotMatch(result.patch, /ignored.txt/);
      assert.deepEqual(await readComparison(cwd, after, after, signal, space.env), {
        kind: "ready",
        files: [],
        patch: "",
      });
      writeFileSync(join(cwd, "new.txt"), "a".repeat(200_000));
      const large = await capture(space, signal);
      assert.deepEqual(await readComparison(cwd, after, large, signal, space.env), {
        kind: "oversized",
      });
    } finally {
      await space.dispose();
    }
    assert.deepEqual(readFileSync(join(cwd, ".git", "index")), realIndex);
    assert.equal(git("for-each-ref"), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
