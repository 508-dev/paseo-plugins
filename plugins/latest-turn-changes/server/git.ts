import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeState } from "../shared/changes";

const patchLimit = 192 * 1024;
const outputLimit = 4 * 1024 * 1024;

function git(
  cwd: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    signal: AbortSignal;
    maxBuffer?: number;
    input?: string;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd,
        timeout: 5_000,
        signal: options.signal,
        maxBuffer: options.maxBuffer ?? outputLimit,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...options.env },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input);
  });
}

export async function createSnapshotSpace(cwd: string, signal: AbortSignal) {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"], { signal })).trimEnd();
  const objects = (
    await git(root, ["rev-parse", "--path-format=absolute", "--git-path", "objects"], {
      signal,
    })
  ).trimEnd();
  const directory = await mkdtemp(join(tmpdir(), "paseo-turn-preview-"));
  const localObjects = join(directory, "objects");
  try {
    await mkdir(join(localObjects, "info"), { recursive: true });
    await writeFile(join(localObjects, "info", "alternates"), `${objects}\n`);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    root,
    env: { GIT_OBJECT_DIRECTORY: localObjects, GIT_INDEX_FILE: join(directory, "index") },
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

type SnapshotSpace = Awaited<ReturnType<typeof createSnapshotSpace>>;

export async function capture(space: SnapshotSpace, signal: AbortSignal): Promise<string> {
  const { root, env } = space;
  const index = await git(root, ["ls-files", "--stage", "-z"], { signal });
  await git(root, ["read-tree", "--empty"], { env, signal });
  if (index) {
    await git(root, ["update-index", "-z", "--index-info"], { env, signal, input: index });
  }
  await git(root, ["-c", "core.fsmonitor=false", "add", "--all", "--", ":/"], { env, signal });
  return (await git(root, ["write-tree"], { env, signal })).trim();
}

export async function readComparison(
  cwd: string,
  before: string,
  after: string,
  signal: AbortSignal,
  env?: NodeJS.ProcessEnv,
): Promise<ChangeState> {
  const args = [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-relative",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "-M",
  ];
  try {
    const options = { env, signal, maxBuffer: patchLimit };
    const names = await git(cwd, [...args, "--name-status", "-z", before, after, "--"], options);
    const fields = names ? names.slice(0, -1).split("\0") : [];
    const files = [];
    for (let i = 0; i < fields.length;) {
      const status = fields[i++];
      const oldPath = /^[RC]/.test(status) ? fields[i++] : undefined;
      const path = fields[i++];
      files.push({ status, path, ...(oldPath ? { oldPath } : {}) });
      if (files.length > 400) return { kind: "oversized" };
    }
    const patch = files.length ? await git(cwd, [...args, before, after, "--"], options) : "";
    if (Buffer.byteLength(JSON.stringify({ files, patch })) > patchLimit) {
      return { kind: "oversized" };
    }
    return { kind: "ready", files, patch };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { kind: "oversized" };
    }
    if (signal.aborted) throw error;
    return { kind: "unavailable" };
  }
}
