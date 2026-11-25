import { messages } from "./messages.js";
import {
  useTranslation,
  useAgent,
  useAgents,
  useComposers,
  useRpc,
  useWorkspace,
  type PluginButtonContentProps,
  type PluginHostProps,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import { ExternalLink, Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import type { z } from "zod";
import {
  addWorkspaceWatch,
  discoverWorkspace,
  listWatches,
  removeWatch,
  resolveUncertain,
  type watchSchema,
} from "../shared/contracts.js";
import { onWatchChanged, watchChanged } from "./watch-events.js";

type Watch = z.infer<typeof watchSchema>;

type WatchPopoverProps = PluginButtonContentProps & { preferredAgentId?: string };

export function createWatchPopover(client: Pick<PluginClientContext, "composers">) {
  return function FocusedWatchPopover(props: PluginButtonContentProps) {
    const focused = useComposers({ focused: true })[0];
    const refs = useAgents({
      hosts: [props.host.id],
      where: (agent) => agent.workspaceId === props.workspaceId,
    });
    // Both selectors resolve the same host-owned composer handle.
    const preferred = refs.find((ref) => client.composers({ agentId: ref.id }).includes(focused));
    return <WatchPopover {...props} preferredAgentId={preferred?.id} />;
  };
}

export function WatchPopover(props: WatchPopoverProps) {
  return <WorkspaceWatchForm key={props.workspaceId} {...props} />;
}

function WorkspaceWatchForm(props: WatchPopoverProps) {
  const { t } = useTranslation(messages);
  const { workspaceId, host, theme } = props;
  const workspaceBranch = useWorkspace(workspaceId, ({ branch }) => branch);
  const agentRefs = useAgents({
    hosts: [host.id],
    where: (agent) => agent.workspaceId === workspaceId && agent.status !== "closed",
  });
  const detect = useRpc(discoverWorkspace);
  const list = useRpc(listWatches);
  const add = useRpc(addWorkspaceWatch);
  const remove = useRpc(removeWatch);
  const resolve = useRpc(resolveUncertain);
  const queryClient = useQueryClient();
  const discoveryQuery = useQuery({
    queryKey: ["pr-discovery", host.id, workspaceId, workspaceBranch],
    queryFn: () => detect({ workspaceId }),
    retry: false,
    staleTime: 30_000,
  });
  const watchesQuery = useQuery({
    queryKey: ["pr-watches", host.id],
    queryFn: () => list({}),
    retry: false,
    refetchInterval: 30_000,
  });
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => {
      await action();
      watchChanged();
      await queryClient.invalidateQueries({ queryKey: ["pr-watches", host.id] });
    },
  });
  const discovery = discoveryQuery.data ?? null;
  const watches = watchesQuery.data?.watches ?? [];
  const loading = discoveryQuery.isFetching;
  const busy = mutation.isPending;
  const error = mutation.error ?? discoveryQuery.error ?? watchesQuery.error;
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedPr, setSelectedPr] = useState<string | null>(null);
  const [prSource, setPrSource] = useState<"detected" | "url" | null>(null);
  const [choosingAgent, setChoosingAgent] = useState(false);
  const [setupRequested, setSetupRequested] = useState(false);
  const [url, setUrl] = useState("");
  const currentAgent = props.context === "agent" ? props.agentId : null;
  const agentId =
    selectedAgent ??
    currentAgent ??
    props.preferredAgentId ??
    (agentRefs.length === 1 ? agentRefs[0].id : null);
  const recipient = agentRefs.find((ref) => ref.id === agentId);
  const candidates = discovery?.pullRequests ?? [];
  const selectedCandidate = candidates.find((pr) => pr.url === selectedPr);
  const detectedUrl =
    selectedCandidate?.url ?? (candidates.length === 1 ? candidates[0].url : null);
  const manual = prSource === "url" || (prSource === null && !!discovery && !candidates.length);
  const pullRequest = manual ? url.trim() : detectedUrl;
  const workspaceWatches = watches.filter((watch) =>
    watch.workspaceId
      ? watch.workspaceId === workspaceId
      : agentRefs.some((ref) => ref.id === watch.agentId),
  );
  const configuring = setupRequested || workspaceWatches.length === 0;
  const alreadyWatching = workspaceWatches.some(
    (watch) => watch.agentId === agentId && watch.url === pullRequest && watch.status !== "closed",
  );

  useEffect(
    () =>
      onWatchChanged(() => {
        void queryClient.invalidateQueries({ queryKey: ["pr-watches", host.id] });
      }),
    [queryClient, host.id],
  );

  function run(action: () => Promise<unknown>) {
    mutation.mutate(action);
  }
  function refresh() {
    mutation.reset();
    void discoveryQuery.refetch();
    void watchesQuery.refetch();
  }

  const foreground = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted, fontSize: 13 };
  const sectionLabel = { ...foreground, fontSize: 13, fontWeight: "600" as const };
  const title = configuring ? t("configure") : t("watched");

  return (
    <View
      style={{ gap: 8, width: props.layout.compact ? undefined : 344, maxWidth: "100%" }}
      testID="workspace-pr-watcher"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          accessibilityRole="header"
          style={{ ...foreground, flex: 1, fontSize: 16, fontWeight: "600" }}
        >
          {title}
        </Text>
        {configuring && workspaceWatches.length > 0 ? (
          <TextAction
            theme={theme}
            label={t("back")}
            disabled={busy}
            onPress={() => setSetupRequested(false)}
          />
        ) : null}
        <TextAction
          theme={theme}
          label={t("refresh")}
          disabled={busy || loading}
          onPress={refresh}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>
          {t(
            mutation.error ? "actionError" : discoveryQuery.error ? "discoveryError" : "loadError",
            { detail: error.message },
          )}
        </Text>
      ) : null}
      {configuring ? (
        <>
          <Text style={muted}>{t("hint")}</Text>
          <View style={{ gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text style={sectionLabel}>{t("pullRequest")}</Text>
              {candidates.length > 0 || !manual ? (
                <TextAction
                  theme={theme}
                  label={manual ? t("useDetected") : t("enterUrl")}
                  disabled={busy}
                  onPress={() => setPrSource(manual ? "detected" : "url")}
                />
              ) : null}
            </View>
            {discovery?.error ? (
              <Text
                accessibilityRole="alert"
                style={{ ...muted, color: theme.colors.statusWarning }}
              >
                {t("discoveryError", { detail: discovery.error })}
              </Text>
            ) : null}
            {manual ? (
              <TextInput
                accessibilityLabel={t("url")}
                placeholder="https://github.com/owner/repo/pull/123"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={url}
                onChangeText={(value) => {
                  setPrSource("url");
                  setUrl(value);
                }}
                editable={!busy}
                style={{
                  ...foreground,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  padding: 10,
                }}
              />
            ) : (
              <>
                {loading && !candidates.length ? <Text style={muted}>{t("finding")}</Text> : null}
                {!loading && discovery && !discovery.error && !candidates.length ? (
                  <Text style={muted}>{t("noOpen")}</Text>
                ) : null}
                {candidates.map((pr) => (
                  <SelectionRow
                    key={pr.url}
                    theme={theme}
                    title={pr.title || `#${pr.number}`}
                    detail={`${pr.repository}#${pr.number}`}
                    selected={detectedUrl === pr.url}
                    disabled={busy}
                    onPress={candidates.length > 1 ? () => setSelectedPr(pr.url) : undefined}
                  />
                ))}
              </>
            )}
          </View>
          <View style={{ gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text style={sectionLabel}>{t("recipient")}</Text>
              {recipient && agentRefs.length > 1 ? (
                <TextAction
                  theme={theme}
                  label={choosingAgent ? t("done") : t("changeAgent")}
                  disabled={busy}
                  onPress={() => setChoosingAgent(!choosingAgent)}
                />
              ) : null}
            </View>
            {agentRefs.length === 0 ? (
              <Text style={muted}>{t("noAgent")}</Text>
            ) : recipient && !choosingAgent ? (
              <AgentChoice id={recipient.id} theme={theme} />
            ) : (
              agentRefs.map((ref) => (
                <AgentChoice
                  key={ref.key}
                  id={ref.id}
                  theme={theme}
                  selected={agentId === ref.id}
                  disabled={busy}
                  onPress={() => {
                    setSelectedAgent(ref.id);
                    setChoosingAgent(false);
                  }}
                />
              ))
            )}
          </View>
          <WatchAction
            theme={theme}
            primary
            label={busy ? t("starting") : alreadyWatching ? t("already") : t("watch")}
            disabled={
              busy || loading || !discovery || !recipient || !pullRequest || alreadyWatching
            }
            onPress={() => {
              if (!discovery || !recipient || !pullRequest) return;
              void run(async () => {
                await add({
                  workspaceId,
                  agentId: recipient.id,
                  pullRequest,
                  expectedBranch: discovery.branch,
                });
                setSetupRequested(false);
              });
            }}
          />
        </>
      ) : (
        <>
          {workspaceWatches.map((watch) => (
            <WatchDetails
              key={watch.id}
              watch={watch}
              theme={theme}
              busy={busy}
              onRemove={() => void run(() => remove({ id: watch.id }))}
              onResolve={(action) => void run(() => resolve({ id: watch.id, action }))}
            />
          ))}
          <WatchAction
            theme={theme}
            label={t("add")}
            disabled={busy}
            onPress={() => setSetupRequested(true)}
          />
        </>
      )}
    </View>
  );
}

function TextAction({
  theme,
  label,
  disabled,
  onPress,
}: {
  theme: PluginHostProps["theme"];
  label: string;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        justifyContent: "center",
        minHeight: 28,
        paddingHorizontal: 4,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{ color: theme.colors.foreground, fontSize: 13, textDecorationLine: "underline" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type SelectionRowProps = {
  theme: PluginHostProps["theme"];
  title: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?(): void;
};

function SelectionRow({ theme, title, detail, selected, disabled, onPress }: SelectionRowProps) {
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: theme.colors.surface1,
    borderColor: onPress && selected ? theme.colors.accent : theme.colors.border,
  };
  const content = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={onPress ? 2 : 1}
          style={{ color: theme.colors.foreground, fontWeight: "600" }}
        >
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress && selected ? <Icon name="Check" size={16} color={theme.colors.foreground} /> : null}
    </>
  );
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityState={{ checked: !!selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { backgroundColor: theme.colors.surface2 } : null]}
    >
      {content}
    </Pressable>
  );
}

function AgentChoice({
  id,
  ...props
}: Omit<SelectionRowProps, "title" | "detail"> & { id: string }) {
  const { t } = useTranslation(messages);
  const agent = useAgent(id, ({ title, provider }) => ({ title, provider }));
  return (
    <SelectionRow
      {...props}
      title={agent?.title ?? t("agent", { id: id.slice(0, 8) })}
      detail={agent?.provider}
    />
  );
}

function WatchDetails({
  watch,
  theme,
  busy,
  onRemove,
  onResolve,
}: {
  watch: Watch;
  theme: PluginHostProps["theme"];
  busy: boolean;
  onRemove(): void;
  onResolve(action: "mark_sent" | "retry"): void;
}) {
  const { t, locale } = useTranslation(messages);
  const agent = useAgent(watch.agentId, ({ title }) => title);
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 12 }}>
      <ExternalLink href={watch.url}>
        {watch.repository}#{watch.number}
      </ExternalLink>
      <Text style={{ color: theme.colors.foreground }}>
        {t(watch.status)} · {agent ?? watch.agentId.slice(0, 8)}
      </Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>
        {t("followups", { count: watch.followupsSent, limit: 5 })}
      </Text>
      {watch.lastPollAt ? (
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {t("checked", { date: new Date(watch.lastPollAt).toLocaleString(locale) })}
        </Text>
      ) : null}
      {watch.lastSentAt ? (
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {t("lastFollowup", { date: new Date(watch.lastSentAt).toLocaleString(locale) })}
        </Text>
      ) : null}
      {watch.lastError ? (
        <Text style={{ color: theme.colors.statusWarning }}>{watch.lastError}</Text>
      ) : null}
      {watch.status === "uncertain" ? (
        <>
          <WatchAction
            theme={theme}
            label={t("handled")}
            disabled={busy}
            onPress={() => onResolve("mark_sent")}
          />
          <WatchAction
            theme={theme}
            label={t("retry")}
            disabled={busy}
            onPress={() => onResolve("retry")}
          />
        </>
      ) : null}
      <WatchAction theme={theme} label={t("stop")} disabled={busy} onPress={onRemove} />
    </View>
  );
}

export function WatchAction({
  theme,
  label,
  disabled,
  onPress,
  primary = false,
}: {
  theme: PluginHostProps["theme"];
  label: string;
  disabled: boolean;
  onPress(): void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 8,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        backgroundColor: primary ? theme.colors.accent : theme.colors.surface1,
      })}
    >
      <Text
        style={{
          color: primary ? theme.colors.accentForeground : theme.colors.foreground,
          textAlign: primary ? "center" : "left",
          fontWeight: primary ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
