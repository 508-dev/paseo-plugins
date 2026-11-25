import { messages } from "./client/messages";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback } from "react";
import { VariableCatalogueScreen } from "./client/catalogue";
import { EnvironmentPanel } from "./client/environment";
import { addWorkspaceShortcuts } from "./client/workspace-shortcut";

function CatalogueSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen({ screenId: "variables" }), [openScreen]);
  return (
    <SidebarRow icon="KeyRound" active={currentScreen?.screenId === "variables"} onPress={open} />
  );
}

export default function contribute(client: PluginClientContext) {
  const catalogueSearches = new Map<string, string>();

  function CatalogueScreen(props: PluginScreenProps) {
    const hostId = props.host.id;
    const openEditor = useCallback(
      (workspaceId: string) => client.openPanel("environment", { workspaceId }),
      [],
    );
    const saveSearch = useCallback(
      (query: string) => {
        catalogueSearches.set(hostId, query);
      },
      [hostId],
    );
    return (
      <VariableCatalogueScreen
        key={hostId}
        {...props}
        openEditor={openEditor}
        initialSearch={catalogueSearches.get(hostId) ?? ""}
        onSearchChange={saveSearch}
      />
    );
  }
  client.addScreen({
    id: "variables",
    title: messages.message("variables"),
    Component: CatalogueScreen,
  });
  client.addSidebarHeaderItem({
    id: "variables",
    title: messages.message("variables"),
    Component: CatalogueSidebarItem,
  });
  client.addCommandCenterItem({
    id: "search-variables",
    title: messages.message("searchEnvironment"),
    icon: "Search",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "variables" });
    },
  });
  client.addWorkspacePanel({
    id: "environment",
    title: messages.message("environment"),
    icon: "KeyRound",
    context: "workspace",
    Component: EnvironmentPanel,
  });
  client.addCommandCenterItem({
    id: "open-environment",
    title: messages.message("projectEnvironment"),
    icon: "KeyRound",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("environment");
    },
  });
  return addWorkspaceShortcuts(client);
}
