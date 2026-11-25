import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("snapshot comparisons cover the whole repository from a subdirectory with diff.relative enabled", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "paseo-plugin-turn-relative-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const agentDirectory = join(cwd, "app");
  const signal = new AbortController().signal;
  try {
    git("init", "-q");
    git("config", "diff.relative", "true");
    mkdirSync(agentDirectory);
    writeFileSync(join(agentDirectory, "agent.txt"), "agent before\n");
    writeFileSync(join(cwd, "shared.txt"), "shared before\n");
    git("add", ".");
    const before = git("write-tree").trim();

    writeFileSync(join(agentDirectory, "agent.txt"), "agent after\n");
    writeFileSync(join(cwd, "shared.txt"), "shared after\n");
    git("add", ".");
    const after = git("write-tree").trim();

    const result = await readComparison(agentDirectory, before, after, signal);
    assert.equal(result.kind, "ready");
    assert.deepEqual(result.files, [
      { status: "M", path: "app/agent.txt" },
      { status: "M", path: "shared.txt" },
    ]);
    assert.match(result.patch, /diff --git a\/app\/agent\.txt b\/app\/agent\.txt/);
    assert.match(result.patch, /diff --git a\/shared\.txt b\/shared\.txt/);
    assert.match(result.patch, /\+shared after/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
