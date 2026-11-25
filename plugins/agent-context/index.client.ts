import { messages } from "./client/messages";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { defineAttachmentSource } from "@getpaseo/plugin";
import { searchAgentTranscriptsRpc } from "./shared/agent-context";

export default function contribute(client: PluginClientContext) {
  return client.addAttachmentSource(
    defineAttachmentSource({
      id: "agent-transcripts",
      title: messages.message("transcript"),
      icon: "MessagesSquare",
      pickerTitle: messages.message("attach"),
      searchPlaceholder: messages.message("search"),
      newAgentShortcut: true,
      search: searchAgentTranscriptsRpc,
    }),
  );
}
