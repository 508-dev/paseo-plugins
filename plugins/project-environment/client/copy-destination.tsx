import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  copyVariable,
  variableDestinations,
  type CopyStatus,
  type VariableTarget,
} from "../shared/environment";
import { ActionButton } from "./action-button";
import { Field } from "./field";

type Destination = z.infer<typeof variableDestinations.output>["destinations"][number];
const failures: Record<Exclude<CopyStatus, "copied">, string> = {
  exists: "This variable already exists in the destination.",
  "same-scope": "Choose a different scope.",
  missing: "The source variable is no longer available.",
  full: "The destination has reached its variable limit.",
};

export function CopyDestination({
  name,
  source,
  theme,
  children,
}: {
  name: string;
  source: VariableTarget;
  theme: PluginTheme;
  children?: ReactNode;
}) {
  const list = useRpc(variableDestinations);
  const copy = useRpc(copyVariable);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const destinations = useQuery({
    queryKey: ["project-environment-destinations"],
    queryFn: () => list({}),
    enabled: open,
    staleTime: 15_000,
  });
  const transfer = useMutation({
    mutationFn: (target: Destination) => copy({ name, source, destination: target.target }),
    onSuccess(result) {
      if (result.status !== "copied") return;
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["project-environment"] });
      void queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue"] });
    },
  });
  const { mutate, reset, isPending } = transfer;
  const show = useCallback(() => {
    reset();
    setQuery("");
    setDestination(null);
    setOpen(true);
  }, [reset]);
  const cancel = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);
  const confirm = useCallback(() => {
    if (destination && !isPending) mutate(destination);
  }, [destination, isPending, mutate]);
  const choose = useCallback(
    (next: Destination) => {
      reset();
      setDestination(next);
    },
    [reset],
  );
  const changeDestination = useCallback(() => {
    reset();
    setDestination(null);
  }, [reset]);
  const { refetch } = destinations;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const styles = useMemo(
    () => ({
      panel: { backgroundColor: theme.colors.surface2, borderRadius: 8, padding: 12, gap: 10 },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      success: { color: theme.colors.statusSuccess, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      actions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 8,
      },
    }),
    [theme],
  );
  const term = query.trim().toLocaleLowerCase();
  const matches =
    destinations.data?.destinations.filter(({ target, label, directory }) => {
      if (
        source.kind === "workspace" &&
        target.kind === "workspace" &&
        source.workspaceId === target.workspaceId
      )
        return false;
      return `${label} ${directory}`.toLocaleLowerCase().includes(term);
    }) ?? [];
  let error = transfer.isError ? "Could not copy the variable. Try again." : "";
  const status = transfer.data?.status;
  if (status && status !== "copied") error = failures[status];

  if (!open)
    return (
      <View style={styles.actions}>
        <ActionButton label="Copy to…" onPress={show} theme={theme} />
        {children}
        {status === "copied" && destination ? (
          <Text accessibilityRole="alert" style={styles.success}>
            Copied to {destination.label}.
          </Text>
        ) : null}
      </View>
    );

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Copy {name} to</Text>
      {destination ? (
        <>
          <Text style={styles.title}>{destination.label}</Text>
          <Text style={styles.detail}>{destination.directory}</Text>
          <View style={styles.actions}>
            <ActionButton
              label={isPending ? "Copying…" : "Copy variable"}
              onPress={confirm}
              theme={theme}
              variant="primary"
              disabled={isPending}
            />
            <ActionButton
              label="Change destination"
              onPress={changeDestination}
              theme={theme}
              disabled={isPending}
            />
          </View>
        </>
      ) : (
        <>
          <Field
            label="Find a project or workspace"
            value={query}
            onChangeText={setQuery}
            theme={theme}
          />
          {destinations.isPending ? <Text style={styles.detail}>Loading destinations…</Text> : null}
          {destinations.isError ? (
            <>
              <Text style={styles.error}>Could not load destinations.</Text>
              <ActionButton label="Retry" onPress={retry} theme={theme} />
            </>
          ) : null}
          {destinations.isSuccess && !matches.length ? (
            <Text style={styles.detail}>No matching destinations.</Text>
          ) : null}
          {matches.slice(0, 12).map((option) => (
            <DestinationRow
              key={
                option.target.kind === "project"
                  ? `project:${option.target.projectId}`
                  : `workspace:${option.target.workspaceId}`
              }
              option={option}
              theme={theme}
              choose={choose}
            />
          ))}
          {matches.length > 12 ? (
            <Text style={styles.detail}>Search to see more destinations.</Text>
          ) : null}
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ActionButton label="Cancel copy" onPress={cancel} theme={theme} disabled={isPending} />
    </View>
  );
}

function DestinationRow({
  option,
  theme,
  choose,
}: {
  option: Destination;
  theme: PluginTheme;
  choose(option: Destination): void;
}) {
  const select = useCallback(() => choose(option), [choose, option]);
  return (
    <ActionButton label={`${option.label}\n${option.directory}`} onPress={select} theme={theme} />
  );
}
