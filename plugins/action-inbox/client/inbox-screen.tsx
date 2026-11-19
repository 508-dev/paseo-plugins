import { useState } from "react";
import { FlatList, Switch, Text, View } from "react-native";
import { getPaseoClient, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { inboxPreferences } from "../shared/preferences";
import { filterCards, isUnread, markRead, type InboxCard } from "./inbox-model";
import { InboxButton, InboxFilter } from "./inbox-controls";
import { InboxRow } from "./inbox-row";
import { useInbox } from "./use-inbox";

export function InboxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const inbox = useInbox();
  const preferences = useSettings(inboxPreferences);
  const [hostId, setHostId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const readReady = preferences.status === "ready";
  const read = readReady ? preferences.values.readTokens : {};
  const showFailures = readReady && preferences.values.showFailures;
  const attentionCount = filterCards(inbox.cards, { showFailures }, read).length;
  const unreadCount = filterCards(inbox.cards, { showFailures, unreadOnly: true }, read).length;
  const filters = { hostId, projectKey, showFailures };
  const visible = filterCards(inbox.cards, { ...filters, unreadOnly }, read);
  const scopedUnreadCount = filterCards(inbox.cards, { ...filters, unreadOnly: true }, read).length;
  const hiddenUnreadFailures =
    showFailures || !readReady
      ? 0
      : filterCards(
          inbox.cards.filter((card) => card.kind === "failed"),
          { ...filters, unreadOnly: true, showFailures: true },
          read,
        ).length;
  const failuresToggleDisabled = !readReady || preferences.saving;
  const onlineCount = inbox.hosts.filter((host) => host.status === "online").length;
  const projects = [
    ...new Map(
      inbox.cards
        .filter((card) => !hostId || card.hostId === hostId)
        .map((card) => [
          card.projectKey,
          { value: card.projectKey, label: card.projectName, description: card.hostLabel },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const offline = inbox.hosts.filter((host) => host.status !== "online");
  const filtered = hostId !== null || projectKey !== null || unreadOnly;

  async function setRead(cards: InboxCard[], value: boolean) {
    if (preferences.status !== "ready" || preferences.saving) return;
    const next = value
      ? markRead(preferences.values.readTokens, cards)
      : { ...preferences.values.readTokens };
    if (!value) for (const card of cards) delete next[card.key];
    await preferences.save({ ...preferences.values, readTokens: next }, preferences.revision);
  }

  async function setShowFailures(value: boolean) {
    if (preferences.status !== "ready" || preferences.saving) return;
    await preferences.save({ ...preferences.values, showFailures: value }, preferences.revision);
  }

  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: layout.compact ? 904 : 920,
        alignSelf: "center",
        padding: layout.compact ? 12 : 20,
      }}
      data={visible}
      keyExtractor={(card) => card.key}
      windowSize={5}
      renderItem={({ item: card }) => (
        <InboxRow
          card={card}
          theme={theme}
          compact={layout.compact}
          tapToOpen={layout.compact || layout.platform === "ios" || layout.platform === "android"}
          unread={readReady ? isUnread(card, read) : null}
          readDisabled={!readReady || preferences.saving}
          onToggleRead={() => void setRead([card], isUnread(card, read))}
          onOpen={
            navigation?.openAgent
              ? () => {
                  void setRead([card], true);
                  navigation.openAgent({ agentId: card.agentId, serverId: card.hostId });
                }
              : undefined
          }
          getAgent={() => getPaseoClient(card.hostId).agents.ref(card.agentId)}
          onRefresh={inbox.refresh}
        />
      )}
      ListHeaderComponent={
        <View style={{ gap: 12, paddingBottom: visible.length ? 12 : 0 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View style={{ gap: 3, flex: 1 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "500" }}>
                {inbox.loading ? "Action inbox" : `${attentionCount} need attention`}
              </Text>
              <Text style={muted}>
                {readReady
                  ? `${unreadCount} unread`
                  : preferences.status === "loading"
                    ? "Loading read status..."
                    : "Read status unavailable"}{" "}
                · {onlineCount} online {onlineCount === 1 ? "host" : "hosts"}
              </Text>
            </View>
            <InboxButton
              theme={theme}
              compact={layout.compact}
              onPress={() => void inbox.refresh()}
              disabled={inbox.refreshing}
              label="Refresh inbox"
              icon="RefreshCw"
              variant="outline"
            />
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <InboxFilter
                title="Hosts"
                allLabel="All hosts"
                value={hostId}
                options={inbox.hosts.map((host) => ({
                  value: host.serverId,
                  label: host.label,
                  description: host.status === "online" ? "Online" : "Offline or connecting",
                }))}
                onChange={(value) => {
                  setHostId(value);
                  setProjectKey(null);
                }}
                theme={theme}
                compact={layout.compact}
              />
              <InboxFilter
                title="Projects"
                allLabel="All projects"
                value={projectKey}
                options={projects}
                onChange={setProjectKey}
                theme={theme}
                compact={layout.compact}
              />
              <View
                style={{
                  minHeight: layout.compact ? 44 : 32,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  opacity: failuresToggleDisabled ? 0.5 : 1,
                }}
              >
                <Switch
                  accessibilityLabel={
                    hiddenUnreadFailures > 0
                      ? `Show failures, ${hiddenUnreadFailures} hidden unread`
                      : "Show failures"
                  }
                  disabled={failuresToggleDisabled}
                  value={showFailures}
                  onValueChange={(value) => void setShowFailures(value)}
                  trackColor={{ false: theme.colors.surface2, true: theme.colors.accent }}
                  thumbColor={
                    showFailures ? theme.colors.accentForeground : theme.colors.foregroundMuted
                  }
                  ios_backgroundColor={theme.colors.surface2}
                  hitSlop={8}
                />
                <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>
                  Show failures{hiddenUnreadFailures > 0 ? ` (${hiddenUnreadFailures})` : ""}
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 4,
              }}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
                <InboxButton
                  theme={theme}
                  compact={layout.compact}
                  selected={!unreadOnly}
                  onPress={() => setUnreadOnly(false)}
                >
                  All
                </InboxButton>
                <InboxButton
                  theme={theme}
                  compact={layout.compact}
                  selected={unreadOnly}
                  disabled={!readReady}
                  onPress={() => setUnreadOnly(true)}
                >
                  Unread{readReady ? ` ${scopedUnreadCount}` : ""}
                </InboxButton>
              </View>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                disabled={
                  !readReady || preferences.saving || !visible.some((card) => isUnread(card, read))
                }
                onPress={() => void setRead(visible, true)}
                label="Mark visible items read"
                icon="CheckCheck"
                variant="outline"
              >
                Mark all read
              </InboxButton>
            </View>
          </View>
          {offline.length ? (
            <Text style={muted}>
              Offline or connecting: {offline.map((host) => host.label).join(", ")}. Showing online
              hosts only.
            </Text>
          ) : null}
          {inbox.truncatedHosts.length ? (
            <Text style={muted}>First 1,000 agents on: {inbox.truncatedHosts.join(", ")}</Text>
          ) : null}
          {inbox.errors.map((error) => (
            <Text key={error} style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {error}
            </Text>
          ))}
          {preferences.status === "error" ||
          preferences.status === "invalid" ||
          preferences.saveError ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                {preferences.saveError
                  ? "Could not save inbox preferences"
                  : "Could not load inbox preferences"}
              </Text>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                onPress={() => void preferences.reload()}
              >
                Reload inbox preferences
              </InboxButton>
            </View>
          ) : null}
          {filtered ? (
            <Text style={muted}>
              {visible.length} shown
              {hostId
                ? ` · ${inbox.hosts.find((host) => host.serverId === hostId)?.label ?? "Selected host"}`
                : ""}
            </Text>
          ) : null}
          {inbox.loading ? <Text style={muted}>Loading agents...</Text> : null}
          {!inbox.loading && visible.length === 0 ? (
            <View style={{ paddingVertical: 32, gap: 8, alignItems: "center" }}>
              <Text style={muted}>
                {unreadOnly
                  ? "No unread items in this view"
                  : filtered
                    ? "No items in this view"
                    : "No requests need attention"}
              </Text>
              {filtered ? (
                <InboxButton
                  theme={theme}
                  compact={layout.compact}
                  onPress={() => {
                    setHostId(null);
                    setProjectKey(null);
                    setUnreadOnly(false);
                  }}
                >
                  Clear filters
                </InboxButton>
              ) : null}
            </View>
          ) : null}
        </View>
      }
    />
  );
}
