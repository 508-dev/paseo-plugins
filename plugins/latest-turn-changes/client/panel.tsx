import { useAgent, useSubscription, type PluginAgentPanelProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { watchChanges, type ChangeSnapshot, type ChangeState } from "../shared/changes";

function describe(state: ChangeState | undefined) {
  switch (state?.kind) {
    case "running":
      return "Waiting for this turn to finish…";
    case "unavailable":
      return "No capture available. Run a turn in a Git worktree.";
    case "oversized":
      return "This turn’s diff exceeds the preview limit.";
    case "ready":
      return state.files.length === 0 ? "No changes during this turn." : null;
    default:
      return "Loading latest turn changes…";
  }
}

export function TurnChangesPanel(props: PluginAgentPanelProps) {
  return <TurnChanges key={`${props.workspaceId}:${props.params.agentId}`} {...props} />;
}

function TurnChanges({ params, workspaceId, theme, layout }: PluginAgentPanelProps) {
  const [snapshot, setSnapshot] = useState<ChangeSnapshot>();
  const status = useAgent(params.agentId, (agent) => agent.status);
  const subscription = useSubscription(
    watchChanges,
    { agentId: params.agentId, workspaceId },
    setSnapshot,
  );
  const state = status === "running" ? { kind: "running" as const } : snapshot?.state;
  const message =
    subscription.status === "error" ? "Could not load latest turn changes." : describe(state);
  const { foreground, foregroundMuted, statusDanger, surface0 } = theme.colors;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 12 : 20, gap: 10 }}
    >
      {snapshot?.timing === "approximate" && (
        <Text style={{ color: foregroundMuted }}>Approximate timing</Text>
      )}
      {message && (
        <Text style={{ color: subscription.status === "error" ? statusDanger : foregroundMuted }}>
          {message}
        </Text>
      )}
      {subscription.status !== "error" && state?.kind === "ready" && state.files.length > 0 && (
        <>
          {state.files.map(({ path, oldPath, status }) => (
            <Text key={path} style={{ color: foreground }}>
              {status} {oldPath ? `${oldPath} → ${path}` : path}
            </Text>
          ))}
          <Text
            selectable
            style={{ color: foreground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
          >
            {state.patch}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
