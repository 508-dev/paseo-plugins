import { useEffect, useState, useSyncExternalStore } from "react";
import { FlatList, Switch, Text, View } from "react-native";
import {
  getPaseoClient,
  useSettings,
  useTranslation,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { inboxPreferences } from "../shared/preferences";
import { filterCards, isUnread, markRead, respondToCard, type InboxCard } from "./inbox-model";
import { createApprovalStore } from "./inbox-approvals";
import { InboxButton, InboxFilter } from "./inbox-controls";
import { InboxRow } from "./inbox-row";
import { useInbox } from "./use-inbox";
import { messages } from "./messages";

export function InboxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const { t, locale } = useTranslation(messages);
  const inbox = useInbox();
  const preferences = useSettings(inboxPreferences);
  const [hostId, setHostId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [approvalStore] = useState(createApprovalStore);
  const approvals = useSyncExternalStore(
    approvalStore.subscribe,
    approvalStore.getSnapshot,
    approvalStore.getSnapshot,
  );
  useEffect(() => {
    if (approvals.size > 0) approvalStore.prune(new Set(inbox.cards.map(({ key }) => key)));
  }, [approvalStore, approvals, inbox.cards]);
  const readReady = preferences.status === "ready";
  const read = readReady ? preferences.values.readTokens : {};
  const showFailures = readReady && preferences.values.showFailures;
  const attentionCount = filterCards(inbox.cards, { showFailures }, read).length;
  const unreadCount = filterCards(inbox.cards, { showFailures, unreadOnly: true }, read).length;
  const filters = { hostId, projectKey, showFailures };
  const visible = filterCards(inbox.cards, { ...filters, unreadOnly }, read);
  const scopedUnreadCount = filterCards(inbox.cards, { ...filters, unreadOnly: true }, read).length;
  const unreadFailures = readReady
    ? filterCards(
        inbox.cards.filter((card) => card.kind === "failed"),
        { hostId, projectKey, unreadOnly: true, showFailures: true },
        read,
      ).length
    : 0;
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
  ].sort((a, b) => a.label.localeCompare(b.label, locale));
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
          approval={approvals.get(card.key)}
          onRespond={(action) =>
            void approvalStore.run(card.key, action.id, async () => {
              try {
                await respondToCard(card, action, () =>
                  getPaseoClient(card.hostId).agents.ref(card.agentId),
                );
              } finally {
                await inbox.refresh();
              }
            })
          }
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
                {inbox.loading ? t("inbox") : t("attentionCount", { count: attentionCount })}
              </Text>
              <Text style={muted}>
                {readReady
                  ? t("unreadCount", { count: unreadCount })
                  : preferences.status === "loading"
                    ? t("loadingRead")
                    : t("readUnavailable")}{" "}
                · {t("onlineHosts", { count: onlineCount })}
              </Text>
            </View>
            <InboxButton
              theme={theme}
              compact={layout.compact}
              onPress={() => void inbox.refresh()}
              disabled={inbox.refreshing}
              label={t("refresh")}
              icon="RefreshCw"
              variant="outline"
            />
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <InboxFilter
                title={t("hosts")}
                allLabel={t("allHosts")}
                selectedLabel={t("selectedHost")}
                filterTitle={t("filterHosts")}
                searchLabel={t("searchHosts")}
                value={hostId}
                options={inbox.hosts.map((host) => ({
                  value: host.serverId,
                  label: host.label,
                  description: host.status === "online" ? t("online") : t("offline"),
                }))}
                onChange={(value) => {
                  setHostId(value);
                  setProjectKey(null);
                }}
                theme={theme}
                compact={layout.compact}
              />
              <InboxFilter
                title={t("projects")}
                allLabel={t("allProjects")}
                selectedLabel={t("selectedProject")}
                filterTitle={t("filterProjects")}
                searchLabel={t("searchProjects")}
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
                    unreadFailures > 0
                      ? t("unreadFailures", { count: unreadFailures })
                      : t("failures")
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
                  {unreadFailures > 0
                    ? t("failuresCount", { count: unreadFailures })
                    : t("failures")}
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
                  {t("all")}
                </InboxButton>
                <InboxButton
                  theme={theme}
                  compact={layout.compact}
                  selected={unreadOnly}
                  disabled={!readReady}
                  onPress={() => setUnreadOnly(true)}
                >
                  {readReady ? t("unreadTab", { count: scopedUnreadCount }) : t("unread")}
                </InboxButton>
              </View>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                disabled={
                  !readReady || preferences.saving || !visible.some((card) => isUnread(card, read))
                }
                onPress={() => void setRead(visible, true)}
                label={t("markVisible")}
                icon="CheckCheck"
                variant="outline"
              >
                {t("markAll")}
              </InboxButton>
            </View>
          </View>
          {offline.length ? (
            <Text style={muted}>
              {t("offlineHosts", { hosts: offline.map((host) => host.label).join(", ") })}
            </Text>
          ) : null}
          {inbox.truncatedHosts.length ? (
            <Text style={muted}>
              {t("truncated", { limit: 1000, hosts: inbox.truncatedHosts.join(", ") })}
            </Text>
          ) : null}
          {inbox.errors.map(({ hostId, host, detail }) => (
            <Text key={hostId} style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {t("loadAgentsError", { host, detail })}
            </Text>
          ))}
          {preferences.status === "error" ||
          preferences.status === "invalid" ||
          preferences.saveError ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                {preferences.saveError ? t("savePreferencesError") : t("loadPreferencesError")}
              </Text>
              <InboxButton
                theme={theme}
                compact={layout.compact}
                onPress={() => void preferences.reload()}
              >
                {t("reloadPreferences")}
              </InboxButton>
            </View>
          ) : null}
          {filtered ? (
            <Text style={muted}>
              {t("shown", { count: visible.length })}
              {hostId
                ? ` · ${inbox.hosts.find((host) => host.serverId === hostId)?.label ?? t("selectedHost")}`
                : ""}
            </Text>
          ) : null}
          {inbox.loading ? <Text style={muted}>{t("loadingAgents")}</Text> : null}
          {!inbox.loading && visible.length === 0 ? (
            <View style={{ paddingVertical: 32, gap: 8, alignItems: "center" }}>
              <Text style={muted}>
                {unreadOnly ? t("noUnread") : filtered ? t("noItems") : t("noAttention")}
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
                  {t("clearFilters")}
                </InboxButton>
              ) : null}
            </View>
          ) : null}
        </View>
      }
    />
  );
}
