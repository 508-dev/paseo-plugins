import { messages } from "./client/messages";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useTranslation, useSettings } from "@getpaseo/plugin/client";
import { Text } from "react-native";
import { InboxScreen } from "./client/inbox-screen";
import { useInbox } from "./client/use-inbox";
import { filterCards } from "./client/inbox-model";
import { inboxPreferences } from "./shared/preferences";

export function InboxItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const { t, locale } = useTranslation(messages);
  const inbox = useInbox();
  const preferences = useSettings(inboxPreferences);
  const count =
    preferences.status === "ready"
      ? filterCards(
          inbox.cards,
          {
            showFailures: preferences.values.showFailures,
            showSubagents: preferences.values.showSubagents,
            unreadOnly: true,
          },
          preferences.values.readTokens,
        ).length
      : 0;
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
      label={t("inbox")}
      trailing={
        count > 0 ? (
          <Text
            accessibilityLabel={t("unreadItems", { count })}
            style={{ color: theme.colors.accent, fontSize: 12, paddingHorizontal: 6 }}
          >
            {count > 99 ? "99+" : new Intl.NumberFormat(locale).format(count)}
          </Text>
        ) : undefined
      }
      onPress={() => openScreen({ screenId: "inbox" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "inbox", title: messages.message("inbox"), Component: InboxScreen });
  client.addSidebarHeaderItem({
    id: "inbox",
    title: messages.message("inbox"),
    Component: InboxItem,
  });
  client.addCommandCenterItem({
    id: "open-inbox",
    title: messages.message("openInbox"),
    icon: "Inbox",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "inbox" });
    },
  });
  return () => {};
}
