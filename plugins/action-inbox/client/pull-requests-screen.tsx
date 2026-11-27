import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import {
  openExternalUrl,
  useAgent,
  useAgents,
  useRpc,
  useTranslation,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/ui";
import type { PluginAgentSnapshot } from "@getpaseo/plugin";
import {
  listPullRequests,
  pullRequestAction,
  type InboxPullRequest,
} from "../shared/pull-requests";
import { InboxButton } from "./inbox-controls";
import { messages } from "./messages";

type Selection = { pullRequest: InboxPullRequest; operation: "watch" | "fix"; messageId: string };

const issueKeys = {
  conflict: "prConflict",
  failedChecks: "prFailedChecks",
  changesRequested: "prChangesRequested",
} as const;
const statusKeys = {
  open: "prOpen",
  closed: "prClosed",
  draft: "prDraft",
  checking: "prChecking",
  awaitingReview: "prAwaitingReview",
  ready: "prReady",
  unavailable: "prUnavailable",
} as const;
const watchKeys = {
  watching: "prWatching",
  closed: "prClosed",
  uncertain: "prUncertain",
  paused: "prPaused",
} as const;

function needsAttention(pr: InboxPullRequest) {
  return (
    pr.issues.length > 0 ||
    pr.status === "unavailable" ||
    pr.watches.some(
      (watch) => watch.status === "paused" || watch.status === "uncertain" || watch.lastError,
    )
  );
}

function mergePages(current: InboxPullRequest[], next: InboxPullRequest[]) {
  const key = (pr: InboxPullRequest) => pr.url.toLowerCase();
  const rows = new Map(current.map((pr) => [key(pr), pr]));
  for (const pr of next) {
    const previous = rows.get(key(pr));
    const targets = new Map(previous?.targets.map((target) => [target.workspaceId, target]));
    for (const target of pr.targets) targets.set(target.workspaceId, target);
    rows.set(key(pr), { ...pr, targets: [...targets.values()] });
  }
  return [...rows.values()];
}

export function PullRequestsScreen({ theme, layout, host, navigation }: PluginScreenProps) {
  const { t } = useTranslation(messages);
  const list = useRpc(listPullRequests);
  const act = useRpc(pullRequestAction);
  const [rows, setRows] = useState<InboxPullRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyAttention, setOnlyAttention] = useState(true);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sent, setSent] = useState<Record<string, { agentId: string; name: string }>>({});
  const version = useRef(0);
  const stopping = useRef(new Set<string>());
  const [removingWatch, setRemovingWatch] = useState<string | null>(null);
  const buttons = { theme, compact: layout.compact };
  const muted = { color: theme.colors.foregroundMuted, fontSize: 13 };
  const refresh = useCallback(
    async (page?: string) => {
      const request = ++version.current;
      setLoading(true);
      setError("");
      try {
        const result = await list({ cursor: page });
        if (request !== version.current) return;
        setRows((current) => mergePages(page ? current : [], result.pullRequests));
        setCursor(result.nextCursor);
        setSkipped((previous) => [
          ...new Set(page ? [...previous, ...result.errors] : result.errors),
        ]);
      } catch (failure) {
        if (request === version.current)
          setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (request === version.current) setLoading(false);
      }
    },
    [list],
  );
  useEffect(() => {
    void refresh();
    return () => {
      version.current += 1;
    };
  }, [refresh]);

  async function stopWatch(id: string) {
    if (stopping.current.size > 0) return;
    stopping.current.add(id);
    setRemovingWatch(id);
    setError("");
    try {
      await act({ operation: "stop", id });
      setRows((current) =>
        current.map((pr) => ({ ...pr, watches: pr.watches.filter((item) => item.id !== id) })),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      stopping.current.delete(id);
      setRemovingWatch(null);
    }
  }

  function choose(pr: InboxPullRequest, operation: Selection["operation"]) {
    setSelection({
      pullRequest: pr,
      operation,
      messageId: `pr-inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  }

  const attention = rows.filter(needsAttention);

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
        contentContainerStyle={{
          padding: layout.compact ? 12 : 20,
          gap: 10,
          width: "100%",
          maxWidth: 920,
          alignSelf: "center",
        }}
        data={onlyAttention ? attention : rows}
        extraData={sent}
        keyExtractor={(pr) => pr.url.toLowerCase()}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
              <InboxButton
                {...buttons}
                selected={onlyAttention}
                onPress={() => setOnlyAttention(true)}
              >
                {rows.length
                  ? `${t("prNeedsAttention")} (${attention.length})`
                  : t("prNeedsAttention")}
              </InboxButton>
              <InboxButton
                {...buttons}
                selected={!onlyAttention}
                onPress={() => setOnlyAttention(false)}
              >
                {rows.length ? `${t("all")} (${rows.length})` : t("all")}
              </InboxButton>
              <View style={{ marginLeft: "auto" }}>
                <InboxButton
                  {...buttons}
                  icon="RefreshCw"
                  variant="outline"
                  label={t("refresh")}
                  disabled={loading || removingWatch !== null}
                  onPress={() => void refresh()}
                />
              </View>
            </View>
            <Text style={muted}>{t("prHost", { host: host.label })}</Text>
            {loading ? <Text style={muted}>{t("prLoading")}</Text> : null}
            {skipped.length > 0 ? (
              <Text style={muted}>{t("prSkipped", { workspaces: skipped.join(", ") })}</Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={muted}>{t(onlyAttention ? "prNothingActionable" : "prEmpty")}</Text>
          ) : null
        }
        ListFooterComponent={
          cursor ? (
            <InboxButton
              {...buttons}
              variant="outline"
              disabled={loading}
              onPress={() => void refresh(cursor)}
            >
              {t("prMore")}
            </InboxButton>
          ) : null
        }
        renderItem={({ item: pr }) => {
          const fix = sent[pr.url.toLowerCase()];
          return (
            <View
              style={{
                padding: 12,
                gap: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "600", fontSize: 15 }}>
                {pr.title}
              </Text>
              <Text style={muted}>
                {pr.repository}#{pr.number}
                {pr.targets.length > 0
                  ? ` · ${pr.targets.map((target) => target.workspaceName).join(", ")}`
                  : ""}
              </Text>
              <Text
                style={
                  pr.issues.length ? { color: theme.colors.statusDanger, fontSize: 13 } : muted
                }
              >
                {pr.issues.length > 0
                  ? pr.issues.map((issue) => t(issueKeys[issue])).join(" · ")
                  : t(statusKeys[pr.status])}
              </Text>
              {pr.watches.map((watch) => (
                <View key={watch.id} style={{ gap: 2 }}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}
                  >
                    <WatchRecipient
                      agentId={watch.agentId}
                      status={t(watchKeys[watch.status])}
                      color={theme.colors.foregroundMuted}
                    />
                    <InboxButton
                      {...buttons}
                      disabled={loading || removingWatch !== null}
                      onPress={() => void stopWatch(watch.id)}
                    >
                      {t("prStopWatch")}
                    </InboxButton>
                  </View>
                  {watch.lastError ? (
                    <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
                      {watch.lastError}
                    </Text>
                  ) : null}
                </View>
              ))}
              {fix ? (
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                  <Text accessibilityLiveRegion="polite" style={muted}>
                    {t("prFixSent", { agent: fix.name })}
                  </Text>
                  {navigation ? (
                    <InboxButton
                      {...buttons}
                      onPress={() =>
                        navigation.openAgent({ agentId: fix.agentId, serverId: host.id })
                      }
                    >
                      {t("openAgent")}
                    </InboxButton>
                  ) : null}
                </View>
              ) : null}
              <View
                style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}
              >
                {pr.issues.length > 0 &&
                pr.targets.length > 0 &&
                pr.status !== "draft" &&
                pr.status !== "closed" ? (
                  <InboxButton
                    {...buttons}
                    variant="solid"
                    disabled={loading}
                    onPress={() => choose(pr, "fix")}
                  >
                    {t(fix ? "prFixAgain" : "prFix")}
                  </InboxButton>
                ) : null}
                {pr.targets.length > 0 && pr.status !== "closed" && pr.status !== "unavailable" ? (
                  <InboxButton
                    {...buttons}
                    variant="outline"
                    disabled={loading}
                    onPress={() => choose(pr, "watch")}
                  >
                    {t(
                      pr.watches.some((watch) => watch.status !== "closed")
                        ? "prWatchAnother"
                        : "prWatch",
                    )}
                  </InboxButton>
                ) : null}
                <InboxButton
                  {...buttons}
                  icon="ExternalLink"
                  label={t("prOpenLink")}
                  onPress={() =>
                    void openExternalUrl(pr.url).catch((failure) => setError(String(failure)))
                  }
                >
                  {layout.compact ? null : t("prOpenLink")}
                </InboxButton>
              </View>
            </View>
          );
        }}
      />
      {selection ? (
        <RecipientModal
          selection={selection}
          {...buttons}
          sentBefore={Boolean(sent[selection.pullRequest.url.toLowerCase()])}
          hostId={host.id}
          onClose={() => setSelection(null)}
          onSubmit={async (agentId, name, target) => {
            const input = {
              agentId,
              workspaceId: target.workspaceId,
              expectedBranch: target.expectedBranch,
              pullRequest: selection.pullRequest.url,
            };
            const result = await act(
              selection.operation === "watch"
                ? { ...input, operation: "watch" }
                : { ...input, operation: "fix", messageId: selection.messageId },
            );
            if (result.watch) {
              const watch = result.watch;
              setRows((current) =>
                current.map((row) =>
                  row.url === selection.pullRequest.url
                    ? {
                        ...row,
                        watches: [...row.watches.filter((item) => item.id !== watch.id), watch],
                      }
                    : row,
                ),
              );
            }
            if (selection.operation === "fix") {
              setSent((previous) => ({
                ...previous,
                [selection.pullRequest.url.toLowerCase()]: { agentId, name },
              }));
            }
            setSelection(null);
          }}
        />
      ) : null}
    </>
  );
}

function WatchRecipient({
  agentId,
  status,
  color,
}: {
  agentId: string;
  status: string;
  color: string;
}) {
  const title = useAgent(agentId, (agent) => agent.title);
  return (
    <Text style={{ color, fontSize: 13 }}>
      {status} · {title || agentId.slice(0, 8)}
    </Text>
  );
}

function RecipientModal({
  selection,
  sentBefore,
  hostId,
  theme,
  compact,
  onClose,
  onSubmit,
}: {
  selection: Selection;
  sentBefore: boolean;
  hostId: string;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  onClose(): void;
  onSubmit(
    agentId: string,
    name: string,
    target: InboxPullRequest["targets"][number],
  ): Promise<void>;
}) {
  const { t } = useTranslation(messages);
  const { pullRequest, operation } = selection;
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const matchesWorkspace = (agent: PluginAgentSnapshot) =>
    agent.status !== "closed" &&
    pullRequest.targets.some((target) => target.workspaceId === agent.workspaceId) &&
    (operation === "fix" ||
      !pullRequest.watches.some(
        (watch) => watch.agentId === agent.id && watch.status !== "closed",
      ));
  const agents = useAgents({ hosts: [hostId], where: matchesWorkspace });
  const eligible = useAgents({
    hosts: [hostId],
    where: (agent) => matchesWorkspace(agent) && (operation === "watch" || agent.status === "idle"),
  });
  const selectedRef =
    eligible.find((agent) => agent.id === chosen) ??
    (chosen === null && eligible.length === 1 ? eligible[0] : undefined);
  const selected = useAgent(selectedRef ?? "");
  const selectedTarget = pullRequest.targets.find(
    (target) => target.workspaceId === selected?.workspaceId,
  );
  const button = operation === "fix" ? t(sentBefore ? "prFixAgain" : "prFix") : t("prWatch");
  async function submit() {
    if (!selected || !selectedTarget || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit(selected.id, selected.title || selected.id.slice(0, 8), selectedTarget);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={button}
      open
      onOpenChange={(open) => {
        if (!open && !inFlight.current) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          {pullRequest.title}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {t(operation === "fix" ? "prFixHint" : "prWatchHint")}
        </Text>
        {operation === "fix" ? (
          <Text style={{ color: theme.colors.foreground }}>
            {t("prFixIssues", {
              issues: pullRequest.issues.map((issue) => t(issueKeys[issue])).join(" · "),
            })}
          </Text>
        ) : null}
        {eligible.length > 0 ? (
          <Text style={{ color: theme.colors.foreground }}>{t("prChooseAgent")}</Text>
        ) : (
          <Text style={{ color: theme.colors.foregroundMuted }}>
            {t(agents.length && operation === "fix" ? "prNoIdleAgents" : "prNoAgents")}
          </Text>
        )}
        {agents.map((agent) => {
          const unavailable = !eligible.some((item) => item.id === agent.id);
          return (
            <RecipientOption
              key={agent.id}
              id={agent.id}
              targets={pullRequest.targets}
              selected={selected?.id === agent.id}
              onSelect={() => setChosen(agent.id)}
              theme={theme}
              compact={compact}
              unavailable={unavailable}
              disabled={busy || unavailable}
            />
          );
        })}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>
            {error}
          </Text>
        ) : null}
        <InboxButton
          theme={theme}
          compact={compact}
          variant="solid"
          disabled={busy || !selectedTarget}
          onPress={() => void submit()}
        >
          {busy ? t("sending") : button}
        </InboxButton>
      </Modal.Content>
    </Modal>
  );
}

function RecipientOption({
  id,
  targets,
  onSelect,
  unavailable,
  ...props
}: {
  id: string;
  targets: InboxPullRequest["targets"];
  selected: boolean;
  disabled: boolean;
  unavailable: boolean;
  onSelect(): void;
  theme: PluginScreenProps["theme"];
  compact: boolean;
}) {
  const { t } = useTranslation(messages);
  const agent = useAgent(id, ({ title, workspaceId }) => ({ title, workspaceId }));
  const target = targets.find((item) => item.workspaceId === agent?.workspaceId);
  return target ? (
    <InboxButton {...props} variant="outline" onPress={onSelect}>
      {`${agent?.title || id.slice(0, 8)} · ${target.workspaceName}${unavailable ? ` · ${t("prAgentUnavailable")}` : ""}`}
    </InboxButton>
  ) : null;
}
