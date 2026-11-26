import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TurnChangesPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addAgentPanel({
    id: "latest-turn",
    title: "Latest turn changes",
    icon: "GitCompare",
    Component: TurnChangesPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-latest-turn",
    title: "Open latest turn changes",
    icon: "GitCompare",
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("latest-turn");
    },
  });
  return () => {
    removeCommand();
    removePanel();
  };
}
