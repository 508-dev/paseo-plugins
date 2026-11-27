import { messages } from "./messages";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation, type PluginScreenProps, useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import {
  filterVariableCatalogue,
  variableCatalogue,
  type CatalogueProject,
  type VariableTarget,
} from "../shared/environment";
import { ValueControls } from "./value";
import { ActionButton } from "./action-button";
import { Field } from "./field";

type OpenEditor = (workspaceId: string) => void;
interface CatalogueScreenProps extends PluginScreenProps {
  openEditor: OpenEditor;
  initialSearch: string;
  onSearchChange(query: string): void;
}
interface ProjectResultsProps {
  project: CatalogueProject;
  hostId: string;
  theme: PluginScreenProps["theme"];
  openEditor: OpenEditor;
}
interface WorkspaceResultsProps {
  workspace: CatalogueProject["workspaces"][number];
  hostId: string;
  openEditor: OpenEditor;
  theme: PluginScreenProps["theme"];
}
const workspaceStyles = { section: { gap: 10 }, action: { alignSelf: "flex-start" as const } };
function WorkspaceResults({ workspace, openEditor, theme, hostId }: WorkspaceResultsProps) {
  const { t } = useTranslation(messages);
  const open = useCallback(() => openEditor(workspace.id), [workspace.id, openEditor]);
  const target = useMemo(
    () => ({ kind: "workspace" as const, workspaceId: workspace.id }),
    [workspace.id],
  );
  return (
    <View style={workspaceStyles.section}>
      <View style={workspaceStyles.action}>
        <ActionButton label={t("openVariables")} onPress={open} theme={theme} />
      </View>
      {workspace.variables.map((variable) => (
        <VariableResult
          key={JSON.stringify([variable.name, variable.proxyUrl])}
          {...variable}
          target={target}
          hostId={hostId}
          theme={theme}
        />
      ))}
    </View>
  );
}
function ProjectResults({ project, theme, openEditor, hostId }: ProjectResultsProps) {
  const { t } = useTranslation(messages);
  const [selectedId, selectWorkspace] = useState("");
  const workspace =
    project.workspaces.find((entry) => entry.id === selectedId) ??
    project.workspaces.find((entry) => entry.variables.length > 0) ??
    project.workspaces[0];
  const options = useMemo(
    () =>
      project.workspaces.map((entry) => ({
        value: entry.id,
        label: entry.name,
      })),
    [project.workspaces],
  );
  const target = useMemo(
    () => ({ kind: "project" as const, scopeId: project.scopeId }),
    [project.scopeId],
  );
  const styles = useMemo(
    () => ({
      section: { gap: 10 },
      line: { flexDirection: "row" as const, gap: 8, alignItems: "center" as const },
      title: {
        flexShrink: 1,
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
      },
      detail: { flexShrink: 1, color: theme.colors.foregroundMuted, fontSize: 13 },
    }),
    [theme],
  );
  return (
    <View style={styles.section}>
      <View style={styles.line}>
        <Icon name="Folder" size={18} color={theme.colors.accent} />
        <Text accessibilityRole="header" style={styles.title}>
          {project.name}
        </Text>
      </View>
      <View style={styles.line}>
        <Icon name="FolderTree" size={14} color={theme.colors.foregroundMuted} />
        <Text selectable style={styles.detail}>
          {project.directory ?? t("directoryUnavailable")}
        </Text>
      </View>
      {project.variables.length ? (
        <View style={styles.line}>
          <Icon name="Layers" size={15} color={theme.colors.foregroundMuted} />
          <Text style={styles.detail}>{t("projectDefaults")}</Text>
        </View>
      ) : null}
      {project.variables.map((variable) => (
        <VariableResult
          key={JSON.stringify([variable.name, variable.proxyUrl])}
          {...variable}
          target={target}
          hostId={hostId}
          theme={theme}
        />
      ))}
      {workspace ? (
        <>
          <SettingsSelect
            label={t("workspacePicker")}
            value={workspace.id}
            options={options}
            onValueChange={selectWorkspace}
          />
          <WorkspaceResults
            key={workspace.id}
            workspace={workspace}
            hostId={hostId}
            openEditor={openEditor}
            theme={theme}
          />
        </>
      ) : (
        <Text style={styles.detail}>{t("noActiveWorkspace")}</Text>
      )}
    </View>
  );
}

function VariableResult({
  name,
  description,
  proxyUrl,
  target,
  hostId,
  theme,
}: CatalogueProject["variables"][number] & {
  target: VariableTarget;
  hostId: string;
  theme: PluginScreenProps["theme"];
}) {
  const styles = useMemo(
    () => ({
      card: {
        padding: 16,
        gap: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
    }),
    [theme],
  );
  return (
    <View style={styles.card}>
      <ValueControls
        target={target}
        hostId={hostId}
        name={name}
        description={description}
        proxyUrl={proxyUrl}
        theme={theme}
      />
    </View>
  );
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
          hostId={host.id}
          theme={theme}
          openEditor={openEditor}
        />
      ))}
      <Text style={styles.detail}>{t("cataloguePrivacy")}</Text>
    </ScrollView>
  );
}
