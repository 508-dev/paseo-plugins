import { messages } from "./messages";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation, type PluginScreenProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import {
  filterVariableCatalogue,
  variableCatalogue,
  type CatalogueProject,
  type VariableTarget,
} from "../shared/environment";
import { ValueControls } from "./value";
import { ActionButton } from "./action-button";
import { ProxyStatus } from "./proxy-status";
import { Field } from "./field";

type OpenEditor = (workspaceId: string) => void;
interface CatalogueScreenProps extends PluginScreenProps {
  openEditor: OpenEditor;
  initialSearch: string;
  onSearchChange(query: string): void;
}
type Workspace = CatalogueProject["workspaces"][number];
type Theme = PluginScreenProps["theme"];

function ProjectResults({
  project,
  theme,
  openEditor,
  hostId,
  compact,
  searching,
}: {
  project: CatalogueProject;
  hostId: string;
  theme: Theme;
  openEditor: OpenEditor;
  compact: boolean;
  searching: boolean;
}) {
  const { t } = useTranslation(messages);
  const [selectedId, setSelectedId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const showPicker = useCallback(() => setPickerOpen(true), []);
  const choose = useCallback((id: string) => {
    setSelectedId(id);
    setPickerOpen(false);
  }, []);
  const workspaces = useMemo(
    () =>
      project.workspaces.toSorted(
        (left, right) => Number(right.variables.length > 0) - Number(left.variables.length > 0),
      ),
    [project.workspaces],
  );
  const selected = workspaces.find(({ id }) => id === selectedId) ?? workspaces[0];
  const projectTarget = useMemo<VariableTarget>(
    () => ({ kind: "project", scopeId: project.scopeId }),
    [project.scopeId],
  );
  const selectedTarget = useMemo<VariableTarget>(
    () => ({ kind: "workspace", workspaceId: selected?.id ?? "" }),
    [selected?.id],
  );
  const pickerState = useMemo(() => ({ expanded: pickerOpen }), [pickerOpen]);
  const openSelected = useCallback(() => {
    if (selected) openEditor(selected.id);
  }, [openEditor, selected]);
  const styles = useMemo(() => {
    const borderColor = theme.colors.border;
    return {
      project: {
        gap: 16,
        borderColor,
        borderWidth: compact ? 0 : 1,
        borderTopWidth: 1,
        borderRadius: compact ? 0 : 12,
        padding: compact ? 0 : 18,
        paddingTop: compact ? 16 : 18,
        backgroundColor: compact ? theme.colors.surface0 : theme.colors.surface1,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 17,
        fontWeight: "600" as const,
        flexShrink: 1,
      },
      heading: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "600" as const,
        flexShrink: 1,
      },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      path: { color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: "monospace" },
      line: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      section: { gap: 6 },
      defaults: {
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 4,
        borderRadius: 6,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.accent,
        backgroundColor: theme.colors.surface2,
      },
      picker: {
        flex: 1,
        minWidth: 0,
        minHeight: 50,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor,
      },
      pickerText: { flex: 1, minWidth: 0, gap: 2 },
    };
  }, [compact, theme]);
  return (
    <View style={styles.project}>
      <View style={styles.section}>
        <View style={styles.line}>
          <Icon name="Folder" size={18} color={theme.colors.accent} />
          <Text accessibilityRole="header" style={styles.title}>
            {project.name}
          </Text>
        </View>
        <Text selectable numberOfLines={1} ellipsizeMode="middle" style={styles.path}>
          {project.directory ?? t("directoryUnavailable")}
        </Text>
      </View>
      {project.variables.length > 0 && (
        <View style={styles.defaults}>
          <View style={styles.line}>
            <Icon name="Layers" size={15} color={theme.colors.accent} />
            <Text accessibilityRole="header" style={styles.heading}>
              {t("projectDefaults")}
            </Text>
          </View>
          <VariableRows
            variables={project.variables}
            target={projectTarget}
            {...{ theme, hostId }}
          />
        </View>
      )}
      {searching ? (
        workspaces.map((workspace) => (
          <WorkspaceResults key={workspace.id} {...{ workspace, theme, hostId, openEditor }} />
        ))
      ) : selected ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            {t("workspaceVariables")}
          </Text>
          <View style={styles.line}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={pickerState}
              accessibilityLabel={`${t("workspacePicker")}: ${selected.name}`}
              style={styles.picker}
              onPress={showPicker}
            >
              <View style={styles.pickerText}>
                <Text numberOfLines={2} style={styles.heading}>
                  {selected.name}
                </Text>
                <Text style={styles.detail}>
                  {t("variableCount", { count: selected.variables.length })}
                </Text>
              </View>
              <Icon name="ChevronDown" size={16} color={theme.colors.foregroundMuted} />
            </Pressable>
            <ActionButton
              label={t("openVariables")}
              icon="ArrowUpRight"
              theme={theme}
              onPress={openSelected}
            />
          </View>
          <VariableRows
            key={selected.id}
            variables={selected.variables}
            target={selectedTarget}
            {...{ theme, hostId }}
          />
          {pickerOpen && (
            <Modal title={t("workspacePicker")} open={pickerOpen} onOpenChange={setPickerOpen}>
              <Modal.Content>
                {workspaces.map((workspace) => (
                  <WorkspaceOption
                    key={workspace.id}
                    {...{ workspace, theme, choose }}
                    selected={workspace.id === selected.id}
                  />
                ))}
              </Modal.Content>
            </Modal>
          )}
        </View>
      ) : (
        <Text style={styles.detail}>{t("noActiveWorkspace")}</Text>
      )}
    </View>
  );
}

function WorkspaceOption({
  workspace,
  theme,
  choose,
  selected,
}: {
  workspace: Workspace;
  theme: Theme;
  choose(id: string): void;
  selected: boolean;
}) {
  const { t } = useTranslation(messages);
  const select = useCallback(() => choose(workspace.id), [choose, workspace.id]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const styles = useMemo(
    () => ({
      option: {
        padding: 12,
        gap: 3,
        borderRadius: 8,
        backgroundColor: selected ? theme.colors.surface2 : theme.colors.surface1,
      },
      name: { color: theme.colors.foreground, fontWeight: "600" as const },
      count: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [selected, theme],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={select}
      style={styles.option}
    >
      <Text style={styles.name}>{workspace.name}</Text>
      <Text style={styles.count}>{t("variableCount", { count: workspace.variables.length })}</Text>
    </Pressable>
  );
}

const workspaceHeading = { flexDirection: "row", alignItems: "center", gap: 8 } as const;

function WorkspaceResults({
  workspace,
  theme,
  hostId,
  openEditor,
}: {
  workspace: Workspace;
  theme: Theme;
  hostId: string;
  openEditor: OpenEditor;
}) {
  const { t } = useTranslation(messages);
  const open = useCallback(() => openEditor(workspace.id), [openEditor, workspace.id]);
  const target = useMemo<VariableTarget>(
    () => ({ kind: "workspace", workspaceId: workspace.id }),
    [workspace.id],
  );
  const title = useMemo(
    () => ({ flex: 1, color: theme.colors.foreground, fontWeight: "600" as const }),
    [theme],
  );
  return (
    <View>
      <View style={workspaceHeading}>
        <Icon name="GitBranch" size={15} color={theme.colors.foregroundMuted} />
        <Text accessibilityRole="header" style={title}>
          {workspace.name}
        </Text>
        <ActionButton label={t("openVariables")} icon="ArrowUpRight" theme={theme} onPress={open} />
      </View>
      <VariableRows variables={workspace.variables} target={target} {...{ theme, hostId }} />
    </View>
  );
}

function VariableRows({
  variables,
  target,
  hostId,
  theme,
}: {
  variables: CatalogueProject["variables"];
  target: VariableTarget;
  hostId: string;
  theme: Theme;
}) {
  const row = useMemo(
    () => ({ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingVertical: 2, gap: 2 }),
    [theme],
  );
  return variables.map((variable) => (
    <View key={JSON.stringify([variable.name, variable.proxyUrl])} style={row}>
      <ValueControls {...variable} {...{ theme, hostId, target }} compact />
    </View>
  ));
}
export function VariableCatalogueScreen({
  theme,
  layout,
  host,
  openEditor,
  initialSearch,
  onSearchChange,
}: CatalogueScreenProps) {
  const { t } = useTranslation(messages);
  const read = useRpc(variableCatalogue);
  const catalogue = useQuery({
    queryKey: ["project-environment-catalogue", host.id],
    queryFn: () => read({}),
  });
  const [query, setQuery] = useState(initialSearch);
  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      onSearchChange(value);
    },
    [onSearchChange],
  );
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        padding: layout.compact ? 16 : 24,
        gap: 24,
        maxWidth: 900,
        width: "100%" as const,
        alignSelf: "center" as const,
      },
      introduction: { gap: 8 },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      toolbar: {
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
        alignItems: "center" as const,
        gap: 12,
      },
    }),
    [theme, layout.compact],
  );
  const { refetch } = catalogue;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const projects = catalogue.data ? filterVariableCatalogue(catalogue.data.projects, query) : [];
  const count = projects.reduce(
    (total, project) =>
      total +
      project.variables.length +
      project.workspaces.reduce((local, workspace) => local + workspace.variables.length, 0),
    0,
  );
  let emptyText = t("emptyCatalogue");
  if (catalogue.data?.projects.length) emptyText = t("noSearchResults");
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.introduction}>
        <Text style={styles.title}>{t("variables")}</Text>
        <Text style={styles.detail}>{t("catalogueIntro", { host: host.label })}</Text>
      </View>
      <ProxyStatus theme={theme} hostId={host.id} />
      <Field
        label={t("searchVariables")}
        value={query}
        placeholder={t("nameOrDescription")}
        onChangeText={changeQuery}
        theme={theme}
      />
      <View style={styles.toolbar}>
        <Text style={styles.detail}>
          {t("catalogueCount", {
            variables: t("variableCount", { count }),
            projects: t("projectCount", { count: projects.length }),
          })}
        </Text>
        <ActionButton
          label={catalogue.isFetching ? t("refreshing") : t("refresh")}
          disabled={catalogue.isFetching}
          onPress={refresh}
          theme={theme}
        />
      </View>
      {catalogue.isPending ? <Text style={styles.detail}>{t("loadingSaved")}</Text> : null}
      {catalogue.isError ? (
        <Text accessibilityRole="alert" style={styles.detail}>
          {t("catalogueError")}
        </Text>
      ) : null}
      {catalogue.isSuccess && !projects.length ? (
        <Text style={styles.detail}>{emptyText}</Text>
      ) : null}
      {catalogue.data && catalogue.data.unavailableDirectories > 0 ? (
        <Text style={styles.detail}>{t("unavailableDirectories")}</Text>
      ) : null}
      {projects.map((project) => (
        <ProjectResults
          key={project.scopeId}
          project={project}
          compact={layout.compact}
          searching={query.trim().length > 0}
          hostId={host.id}
          theme={theme}
          openEditor={openEditor}
        />
      ))}
      <Text style={styles.detail}>{t("cataloguePrivacy")}</Text>
    </ScrollView>
  );
}
