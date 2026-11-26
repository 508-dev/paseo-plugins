import {
  defineRpc,
  PluginAttachmentItemSchema,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin";
import { z } from "zod";

export const agentTranscriptAttachmentSourceId = "agent-transcripts";

export const searchAgentTranscriptsRpc = defineRpc({
  name: "agent-context.search",
  input: z.object({ query: z.string() }),
  output: PluginAttachmentSearchPayloadSchema,
});

export const EXCERPT_AGENT_LIMIT = 20;
export const EXCERPT_TIMELINE_LIMIT = 100;
export const excerptQuerySchema = z.string().trim().min(2).max(160);

export const searchTranscriptExcerptsRpc = defineRpc({
  name: "agent-context.search-excerpts",
  input: z.object({ query: excerptQuerySchema }),
  output: z.object({
    items: z
      .array(PluginAttachmentItemSchema.extend({ contextKind: z.literal("chat_history") }))
      .max(5),
    unavailable: z.number().int().nonnegative(),
  }),
});
