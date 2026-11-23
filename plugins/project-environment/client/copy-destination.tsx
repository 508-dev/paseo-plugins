import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
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
const PAGE_SIZE = 6;
const failures: Partial<Record<CopyStatus, string>> = {
  "same-scope": "Choose a different scope.",
  missing: "The source variable is no longer available.",
  full: "The destination has reached its variable limit.",
};

export function CopyDestination({
  name,
  source,
  hostId,
  theme,
  children,
}: {
  name: string;
  source: VariableTarget;
  hostId: string;
  theme: PluginTheme;
  children?: ReactNode;
}) {
  const list = useRpc(variableDestinations);
  const copy = useRpc(copyVariable);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Destination["target"]["kind"]>("project");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [requiresOverwrite, setRequiresOverwrite] = useState(false);
  const destinations = useQuery({
    queryKey: ["project-environment-destinations", hostId],
    queryFn: () => list({}),
    enabled: open,
    staleTime: 15_000,
  });
  const transfer = useMutation({
    mutationFn: ({ target, overwrite }: { target: Destination["target"]; overwrite: boolean }) =>
      copy({ name, source, destination: target, overwrite }),
    onSuccess(result) {
      if (result.status === "exists") setRequiresOverwrite(true);
      if (result.status !== "copied" && result.status !== "overwritten") return;
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["project-environment", hostId] });
      void queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue", hostId] });
    },
  });
  const { mutate, reset, isPending } = transfer;
  const show = useCallback(() => {
    reset();
    setQuery("");
    setScope("project");
    setVisible(PAGE_SIZE);
    setRequiresOverwrite(false);
    setDestination(null);
    setOpen(true);
  }, [reset]);
  const cancel = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);
  const confirm = useCallback(() => {
    if (destination && !isPending)
      mutate({ target: destination.target, overwrite: requiresOverwrite });
  }, [destination, isPending, mutate, requiresOverwrite]);
  const choose = useCallback(
    (next: Destination) => {
      reset();
      setRequiresOverwrite(false);
      setDestination(next);
    },
    [reset],
  );
  const changeDestination = useCallback(() => {
    reset();
    setRequiresOverwrite(false);
    setDestination(null);
  }, [reset]);
  const search = useCallback((value: string) => {
    setQuery(value);
    setVisible(PAGE_SIZE);
  }, []);
  const selectScope = useCallback((next: typeof scope) => {
    setScope(next);
    setVisible(PAGE_SIZE);
  }, []);
  const showProjects = useCallback(() => selectScope("project"), [selectScope]);
  const showWorkspaces = useCallback(() => selectScope("workspace"), [selectScope]);
  const showMore = useCallback(() => setVisible((count) => count + PAGE_SIZE), []);
  const { refetch } = destinations;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const styles = useMemo(
    () => ({
      panel: { backgroundColor: theme.colors.surface2, borderRadius: 8, padding: 12, gap: 12 },
      heading: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      headingText: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "600" as const,
        flex: 1,
      },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      results: {
        backgroundColor: theme.colors.surface0,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
        overflow: "hidden" as const,
      },
      selection: { backgroundColor: theme.colors.surface0, borderRadius: 8, padding: 12, gap: 4 },
      more: { alignSelf: "flex-start" as const },
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
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    destinations.data?.destinations.filter(({ target, label, directory, projectName }) => {
      if (target.kind !== scope) return false;
      if (
        source.kind === "workspace" &&
        target.kind === "workspace" &&
        source.workspaceId === target.workspaceId
      )
        return false;
      const text = `${label} ${projectName ?? ""} ${directory}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    }) ?? [];
  const status = transfer.data?.status;
  const error = transfer.isError
    ? "Could not copy the variable. Try again."
    : status && failures[status];
  const completed = status === "copied" || status === "overwritten";

  if (!open)
    return (
      <View style={styles.actions}>
        <ActionButton label="Copy to…" onPress={show} theme={theme} />
        {children}
        {completed && destination ? (
          <Text accessibilityRole="alert" style={styles.success}>
            {status === "overwritten" ? "Overwrote the variable in" : "Copied to"}{" "}
            {destination.label}.
          </Text>
        ) : null}
      </View>
    );

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.headingText}>Copy {name}</Text>
        <ActionButton
          label="Cancel copy"
          icon="X"
          onPress={cancel}
          theme={theme}
          disabled={isPending}
        />
      </View>
      {destination ? (
        <>
          <View style={styles.selection}>
            <Text style={styles.title}>{destination.label}</Text>
            <Text style={styles.detail}>
              {destination.target.kind === "project"
                ? "Project defaults"
                : [destination.projectName, "Workspace variables"].filter(Boolean).join(" · ")}
            </Text>
            <Text selectable style={styles.detail}>
              {destination.directory}
            </Text>
          </View>
          {requiresOverwrite ? (
            <Text accessibilityRole="alert" style={styles.detail}>
              {name} already exists here. Overwriting replaces its saved value and description.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              label={requiresOverwrite ? "Overwrite variable" : "Copy variable"}
              onPress={confirm}
              theme={theme}
              variant={requiresOverwrite ? "destructive" : "primary"}
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
          <View style={styles.actions}>
            <ActionButton
              label="Projects"
              onPress={showProjects}
              theme={theme}
              selected={scope === "project"}
              variant={scope === "project" ? "primary" : "outline"}
            />
            <ActionButton
              label="Workspaces"
              onPress={showWorkspaces}
              theme={theme}
              selected={scope === "workspace"}
              variant={scope === "workspace" ? "primary" : "outline"}
            />
          </View>
          <Field
            label={scope === "project" ? "Search projects" : "Search workspaces"}
            value={query}
            onChangeText={search}
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
          {matches.length ? (
            <View style={styles.results}>
              {matches.slice(0, visible).map((option, index) => (
                <DestinationRow
                  key={
                    option.target.kind === "project"
                      ? `project:${option.target.projectId}`
                      : `workspace:${option.target.workspaceId}`
                  }
                  option={option}
                  theme={theme}
                  choose={choose}
                  divider={index > 0}
                />
              ))}
            </View>
          ) : null}
          {matches.length > visible ? (
            <View style={styles.more}>
              <ActionButton label="Show more" onPress={showMore} theme={theme} />
            </View>
          ) : null}
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function DestinationRow({
  option,
  theme,
  choose,
  divider,
}: {
  option: Destination;
  theme: PluginTheme;
  choose(option: Destination): void;
  divider: boolean;
}) {
  const select = useCallback(() => choose(option), [choose, option]);
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: divider ? 1 : 0,
        borderColor: theme.colors.border,
      },
      pressed: { backgroundColor: theme.colors.surface1 },
      text: { flex: 1, minWidth: 0, gap: 2 },
      title: { color: theme.colors.foreground, fontSize: 13, fontWeight: "500" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, divider],
  );
  const style = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.row, pressed && styles.pressed],
    [styles],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        option.projectName ? `${option.label}, ${option.projectName}` : option.label
      }
      onPress={select}
      style={style}
    >
      <Icon
        name={option.target.kind === "project" ? "Folder" : "PanelsTopLeft"}
        size={16}
        color={theme.colors.foregroundMuted}
      />
      <View style={styles.text}>
        <Text numberOfLines={2} style={styles.title}>
          {option.label}
        </Text>
        {option.projectName ? (
          <Text numberOfLines={1} style={styles.detail}>
            {option.projectName}
          </Text>
        ) : null}
      </View>
      <Icon name="ChevronRight" size={16} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}
