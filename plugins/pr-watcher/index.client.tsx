import { messages } from "./client/messages.js";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { WatchScreen } from "./client/watch-screen.js";
import { addWatch, listWatches } from "./shared/contracts.js";
import { contributeWorkspaceControls } from "./client/workspace-controls.js";
import { watchChanged } from "./client/watch-events.js";

export default function contribute(client: PluginClientContext) {
  // Attach the host's SDK session even when a user opens Action Inbox first.
  void client.rpc(listWatches, {}).catch(() => undefined);
  client.addScreen({ id: "watches", title: messages.message("watcher"), Component: WatchScreen });
  client.addCommandCenterItem({
    id: "open-watches",
    title: messages.message("watched"),
    icon: "GitPullRequest",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "watches" });
    },
  });
  client.addSlashCommand({
    name: "watch-pr",
    description: messages.message("command"),
    argumentHint: messages.message("argument"),
    context: "agent",
    async onSubmit({ args, agent, rpc, openScreen }) {
      try {
        await rpc(addWatch, { agentId: agent.id, pullRequest: args });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(client.i18n.t(messages, "actionError", { detail }), { cause });
      }
      watchChanged();
      openScreen({ screenId: "watches" });
    },
  });
  return contributeWorkspaceControls(client);
}
