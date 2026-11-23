import { messages } from "./client/messages";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BrowserPanel } from "./client/browser-panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "remote-browser",
    title: messages.message("browser"),
    icon: "Globe",
    context: "workspace",
    Component: BrowserPanel,
  });
  client.addCommandCenterItem({
    id: "open-remote-browser",
    title: messages.message("openBrowser"),
    icon: "Globe",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("remote-browser");
    },
  });
  return () => {};
}
