import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const target = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  expectedBranch: z.string(),
});
const watch = z.object({
  id: z.string(),
  agentId: z.string(),
  workspaceId: z.string().optional(),
  status: z.enum(["watching", "closed", "uncertain", "paused"]),
  lastError: z.string().nullable(),
});
const pullRequest = z.object({
  repository: z.string(),
  number: z.number().int().positive(),
  url: z.string().regex(/^https:\/\/github\.com\/[a-z\d_.-]+\/[a-z\d_.-]+\/pull\/\d+$/i),
  title: z.string(),
  status: z.enum(["closed", "draft", "checking", "awaitingReview", "ready", "open", "unavailable"]),
  issues: z.array(z.enum(["conflict", "failedChecks", "changesRequested"])),
  targets: z.array(target),
  watches: z.array(watch),
});
export type InboxPullRequest = z.infer<typeof pullRequest>;
export const listPullRequests = defineRpc({
  name: "pull_requests.list",
  input: z.object({
    cursor: z.string().optional(),
    refresh: z.enum(["background", "force"]).optional(),
  }),
  output: z.object({
    pullRequests: z.array(pullRequest),
    errors: z.array(z.string()),
    nextCursor: z.string().nullable(),
    stale: z.boolean().optional(),
  }),
});
const selection = z.object({
  workspaceId: z.string(),
  expectedBranch: z.string(),
  agentId: z.string(),
  pullRequest: z.string(),
});
export const pullRequestAction = defineRpc({
  name: "pull_requests.action",
  input: z.discriminatedUnion("operation", [
    selection.extend({ operation: z.literal("watch") }),
    selection.extend({ operation: z.literal("fix"), messageId: z.string() }),
    z.object({ operation: z.literal("stop"), id: z.string() }),
  ]),
  output: z.object({ watch: watch.optional() }),
});
