import { defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

const file = z.object({
  status: z.string(),
  path: z.string(),
  oldPath: z.string().optional(),
});

export const coreComparison = z.object({
  turnId: z.string(),
  before: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  after: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
});

const changeState = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("running") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("oversized") }),
  z.object({ kind: z.literal("ready"), files: z.array(file), patch: z.string() }),
]);

const snapshot = z.object({
  timing: z.enum(["approximate", "core"]),
  state: changeState,
});

export type ChangeState = z.infer<typeof changeState>;
export type ChangeSnapshot = z.infer<typeof snapshot>;

export const watchChanges = defineSubscription({
  name: "turn-changes.watch",
  input: z.object({ agentId: z.string().min(1), workspaceId: z.string().min(1) }),
  event: snapshot,
});
