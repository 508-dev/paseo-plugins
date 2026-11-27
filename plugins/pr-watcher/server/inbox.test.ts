import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PaseoApi } from "@getpaseo/client";
import { beforeEach, expect, it, vi } from "vitest";
import { discoverPullRequests, readBranch } from "./discovery.js";
import { readPullRequest } from "./github.js";
import { runCommand, startInboxBridge, summarizePullRequest } from "./inbox.js";

vi.mock("./discovery.js", () => ({ discoverPullRequests: vi.fn(), readBranch: vi.fn() }));
vi.mock("./github.js", async (original) => ({
  ...(await original<typeof import("./github.js")>()),
  readPullRequest: vi.fn(),
}));

const pr = {
  title: "Fix retries",
  url: "https://github.com/example/app/pull/12",
  repository: "example/app",
  number: 12,
};
const selection = {
  workspaceId: "work",
  expectedBranch: "fix-retries",
  agentId: "agent",
  pullRequest: pr.url,
};
const base = {
  state: "OPEN",
  headRefOid: "head",
  mergeStateStatus: "CLEAN",
  checks: [],
  reviews: [],
};
const failure = { name: "CI", conclusion: "FAILURE", completedAt: null, detailsUrl: null };

function setup(status = "idle") {
  const send = vi.fn(async (_message: string, _options: { messageId: string }) => {});
  const workspaces = {
    list: vi.fn(async () => ({
      entries: [{ id: "work", name: "Retries", workspaceDirectory: "/work" }],
      pageInfo: { nextCursor: "next" },
    })),
    ref: () => ({ refresh: async () => ({ workspaceDirectory: "/work" }) }),
  };
  const paseo = {
    workspaces,
    agents: {
      ref: () => ({
        send,
        refresh: async () => ({
          agent: { workspaceId: "work", status, pendingPermissions: [] },
        }),
      }),
    },
  } as unknown as PaseoApi;
  const watcher = { list: vi.fn(() => []), add: vi.fn(), remove: vi.fn() };
  return { paseo, watcher, send };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readBranch).mockResolvedValue("fix-retries");
  vi.mocked(discoverPullRequests).mockResolvedValue({ branch: "fix-retries", pullRequests: [pr] });
  vi.mocked(readPullRequest).mockResolvedValue({ ...base, checks: [failure] });
});

it("distinguishes attention issues from pending checks or review", () => {
  expect(
    summarizePullRequest({
      ...base,
      mergeStateStatus: "DIRTY",
      reviewDecision: "CHANGES_REQUESTED",
      checks: [failure],
    }).issues,
  ).toEqual(["conflict", "failedChecks", "changesRequested"]);
  expect(
    summarizePullRequest({ ...base, checks: [{ ...failure, conclusion: "NEUTRAL" }] }),
  ).toEqual({ status: "ready", issues: [] });
  expect(
    summarizePullRequest({ ...base, checks: [{ ...failure, conclusion: "IN_PROGRESS" }] }).status,
  ).toBe("checking");
  expect(summarizePullRequest({ ...base, reviewDecision: "REVIEW_REQUIRED" }).status).toBe(
    "awaitingReview",
  );
});

it("lists actionable workspace PRs before any watch is created", async () => {
  const { paseo, watcher } = setup();
  expect(await runCommand({ operation: "list" }, paseo, watcher)).toMatchObject({
    nextCursor: "next",
    pullRequests: [
      {
        title: pr.title,
        issues: ["failedChecks"],
        targets: [{ workspaceId: "work" }],
        watches: [],
      },
    ],
  });
  expect(watcher.add).not.toHaveBeenCalled();
});

it("sends a one-time message with the confirmed recipient, verified URL and stable message ID", async () => {
  const { paseo, watcher, send } = setup();
  await runCommand({ ...selection, operation: "fix", messageId: "fix-1" }, paseo, watcher);
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(pr.url), {
    messageId: "fix-1",
  });
  expect(send.mock.calls[0]?.[0]).toContain("Do not merge");
  expect(watcher.add).not.toHaveBeenCalled();
});

it("rejects a stale or already resolved pull request and a busy recipient", async () => {
  const { paseo, watcher, send } = setup("running");
  const fix = { ...selection, operation: "fix", messageId: "fix-1" } as const;
  await expect(runCommand(fix, paseo, watcher)).rejects.toThrow("idle agent");
  vi.mocked(readPullRequest).mockResolvedValue(base);
  await expect(runCommand(fix, paseo, watcher)).rejects.toThrow(
    "no longer has an actionable issue",
  );
  vi.mocked(discoverPullRequests).mockResolvedValue({ branch: "fix-retries", pullRequests: [] });
  await expect(runCommand(fix, paseo, watcher)).rejects.toThrow("no longer matches");
  expect(send).not.toHaveBeenCalled();
});

it("delegates watch enrollment and removal to the existing watcher", async () => {
  const { paseo, watcher, send } = setup();
  await runCommand({ ...selection, operation: "watch" }, paseo, watcher);
  expect(watcher.add).toHaveBeenCalledExactlyOnceWith("agent", pr.url, { workspaceId: "work" });
  await runCommand({ operation: "stop", id: "watch" }, paseo, watcher);
  expect(watcher.remove).toHaveBeenCalledExactlyOnceWith("watch");
  expect(send).not.toHaveBeenCalled();
});

it("serves only authenticated local commands and removes its endpoint on stop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-pr-inbox-"));
  const file = join(directory, "bridge.json");
  const { paseo, watcher, send } = setup();
  const stop = startInboxBridge(() => paseo, watcher, Promise.resolve(), file);
  try {
    const { port, token } = JSON.parse(await vi.waitFor(() => readFile(file, "utf8"))) as {
      port: number;
      token: string;
    };
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    const url = `http://127.0.0.1:${port}/v1`;
    const options = {
      method: "POST",
      body: JSON.stringify({ ...selection, operation: "fix", messageId: "fix-2" }),
    };
    expect((await fetch(url, options)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
  } finally {
    await stop();
    try {
      await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
