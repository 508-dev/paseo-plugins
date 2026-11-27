import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/ui";
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
import { messages } from "./messages";

type Destination = z.infer<typeof variableDestinations.output>["destinations"][number];
const PAGE_SIZE = 6;
const failures = {
  "same-scope": "sameDestination",
  missing: "sourceMissing",
  full: "destinationFull",
} as const satisfies Record<Exclude<CopyStatus, "copied" | "overwritten" | "exists">, string>;

export function CopyDestination({
  name,
  source,
  hostId,
  theme,
  children,
  compact = false,
  showAction = true,
  onAction,
}: {
  name: string;
  source: VariableTarget;
  hostId: string;
  theme: PluginTheme;
  children?: ReactNode;
  compact?: boolean;
  showAction?: boolean;
  onAction?(): void;
}) {
  const { t } = useTranslation(messages);
  const toast = useToast();
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
      if (compact && destination)
        toast.show(
          t(result.status === "overwritten" ? "overwrittenTo" : "copiedTo", {
            destination: destination.label,
          }),
          { variant: "success" },
        );
      void queryClient.invalidateQueries({ queryKey: ["project-environment", hostId] });
      void queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue", hostId] });
    },
  });
  const { mutate, reset, isPending } = transfer;
  const show = useCallback(() => {
    onAction?.();
    reset();
    setQuery("");
    setScope("project");
    setVisible(PAGE_SIZE);
    setRequiresOverwrite(false);
    setDestination(null);
    setOpen(true);
  }, [reset, onAction]);
  const cancel = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);
  const dismiss = useCallback(
    (next: boolean) => {
      if (!next && !isPending) cancel();
    },
    [cancel, isPending],
  );
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
  const completed = status === "copied" || status === "overwritten";
  let error = transfer.isError ? t("transferError") : "";
  if (status && !completed && status !== "exists") error = t(failures[status]);
  const actionLabel = requiresOverwrite ? t("overwriteVariable") : t("copyVariable");

  if (!open && !compact)
    return (
      <View style={styles.actions}>
        <ActionButton label={t("copyTo")} onPress={show} theme={theme} />
        {children}
        {completed && destination ? (
          <Text accessibilityRole="alert" style={styles.success}>
            {t(status === "overwritten" ? "overwrittenTo" : "copiedTo", {
              destination: destination.label,
            })}
          </Text>
        ) : null}
      </View>
    );

  const picker = (
    <View style={styles.panel}>
      {!compact && (
        <View style={styles.heading}>
          <Text style={styles.headingText}>{t("copyNameTo", { name })}</Text>
          <ActionButton
            label={t("cancelCopy")}
            icon="X"
            onPress={cancel}
            theme={theme}
            disabled={isPending}
          />
        </View>
      )}
      {destination ? (
        <>
          <View style={styles.selection}>
            <Text style={styles.title}>{destination.label}</Text>
            <Text style={styles.detail}>
              {destination.target.kind === "project"
                ? t("projectDefaults")
                : [destination.projectName, t("workspaceVariables")].filter(Boolean).join(" · ")}
            </Text>
            <Text selectable style={styles.detail}>
              {destination.directory}
            </Text>
          </View>
          {requiresOverwrite ? (
            <Text accessibilityRole="alert" style={styles.detail}>
              {t("destinationExists")}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              label={isPending ? t("copying") : actionLabel}
              onPress={confirm}
              theme={theme}
              variant={requiresOverwrite ? "destructive" : "primary"}
              disabled={isPending}
            />
            <ActionButton
              label={t("changeDestination")}
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
              label={t("destinationProjects")}
              onPress={showProjects}
              theme={theme}
              selected={scope === "project"}
              variant={scope === "project" ? "primary" : "outline"}
            />
            <ActionButton
              label={t("destinationWorkspaces")}
              onPress={showWorkspaces}
              theme={theme}
              selected={scope === "workspace"}
              variant={scope === "workspace" ? "primary" : "outline"}
            />
          </View>
          <Field
            label={t(scope === "project" ? "searchProjects" : "searchWorkspaces")}
            value={query}
            onChangeText={search}
            theme={theme}
          />
          {destinations.isPending ? (
            <Text style={styles.detail}>{t("loadingDestinations")}</Text>
          ) : null}
          {destinations.isError ? (
            <>
              <Text style={styles.error}>{t("loadDestinationsError")}</Text>
              <ActionButton label={t("retry")} onPress={retry} theme={theme} />
            </>
          ) : null}
          {destinations.isSuccess && !matches.length ? (
            <Text style={styles.detail}>{t("noDestinations")}</Text>
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
              <ActionButton label={t("showMoreDestinations")} onPress={showMore} theme={theme} />
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
  if (!compact) return picker;
  return (
    <>
      {showAction && <ActionButton label={t("copyTo")} onPress={show} theme={theme} />}
      {open && (
        <Modal title={t("copyNameTo", { name })} open={open} onOpenChange={dismiss}>
          <Modal.Content>{picker}</Modal.Content>
        </Modal>
      )}
    </>
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
