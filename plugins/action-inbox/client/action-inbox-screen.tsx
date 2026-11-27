import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation, type PluginScreenProps } from "@getpaseo/plugin/client";
import { InboxScreen } from "./inbox-screen";
import { PullRequestsScreen } from "./pull-requests-screen";
import { messages } from "./messages";

export function ActionInboxScreen(props: PluginScreenProps) {
  const { t } = useTranslation(messages);
  const [tab, setTab] = useState<"agents" | "pullRequests">("agents");
  const [visitedPullRequests, setVisitedPullRequests] = useState(false);
  const { theme, layout, host } = props;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
          paddingHorizontal: layout.compact ? 12 : 20,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        {(["agents", "pullRequests"] as const).map((item) => {
          const selected = tab === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                if (item === "pullRequests") setVisitedPullRequests(true);
                setTab(item);
              }}
              style={{
                minHeight: layout.compact ? 44 : 32,
                justifyContent: "center",
                paddingHorizontal: 10,
                borderBottomWidth: 2,
                borderBottomColor: selected ? theme.colors.accent : "transparent",
              }}
            >
              <Text
                style={{
                  color: selected ? theme.colors.foreground : theme.colors.foregroundMuted,
                  fontWeight: selected ? "600" : "400",
                }}
              >
                {t(item === "agents" ? "agentTab" : "pullRequestsTab")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1, display: tab === "agents" ? "flex" : "none" }}>
        <InboxScreen {...props} />
      </View>
      {visitedPullRequests ? (
        <View style={{ flex: 1, display: tab === "pullRequests" ? "flex" : "none" }}>
          <PullRequestsScreen key={host.id} {...props} />
        </View>
      ) : null}
    </View>
  );
}
