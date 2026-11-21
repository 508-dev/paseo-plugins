import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { type PluginScreenProps, useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
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
}
interface ProjectResultsProps {
  project: CatalogueProject;
  theme: PluginScreenProps["theme"];
  openEditor: OpenEditor;
}
interface WorkspaceResultsProps {
  workspace: CatalogueProject["workspaces"][number];
  openEditor: OpenEditor;
  theme: PluginScreenProps["theme"];
}
function WorkspaceResults({ workspace, openEditor, theme }: WorkspaceResultsProps) {
  const open = useCallback(() => openEditor(workspace.id), [workspace.id, openEditor]);
  const target = useMemo(
    () => ({ kind: "workspace" as const, workspaceId: workspace.id }),
    [workspace.id],
  );
  const styles = useMemo(
    () => ({
      section: { gap: 10 },
      row: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 10,
        alignItems: "center" as const,
      },
      name: { color: theme.colors.foregroundMuted, fontSize: 13, flexShrink: 1 },
    }),
    [theme],
  );
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={styles.name}>{workspace.name}</Text>
        <ActionButton label="Open variables" onPress={open} theme={theme} />
      </View>
      {workspace.variables.map((variable) => (
        <VariableResult key={variable.name} {...variable} target={target} theme={theme} />
      ))}
    </View>
  );
}
function ProjectResults({ project, theme, openEditor }: ProjectResultsProps) {
  const target = useMemo(
    () => ({ kind: "project" as const, scopeId: project.scopeId }),
    [project.scopeId],
  );
  const styles = useMemo(
    () => ({
      section: { gap: 10 },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
    }),
    [theme],
  );
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{project.name}</Text>
      <Text selectable style={styles.detail}>
        {project.directory ?? "The original project location is unavailable."}
      </Text>
      {project.variables.length ? <Text style={styles.detail}>Project defaults</Text> : null}
      {project.variables.map((variable) => (
        <VariableResult key={variable.name} {...variable} target={target} theme={theme} />
      ))}
      {project.workspaces.map((workspace) => (
        <WorkspaceResults
          key={workspace.id}
          workspace={workspace}
          openEditor={openEditor}
          theme={theme}
        />
      ))}
      {!project.workspaces.length ? (
        <Text style={styles.detail}>
          No active workspace. Saved variables are still available here.
        </Text>
      ) : null}
    </View>
  );
}

function VariableResult({
  name,
  description,
  target,
  theme,
}: CatalogueProject["variables"][number] & {
  target: VariableTarget;
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
      <ValueControls target={target} name={name} description={description} theme={theme} />
    </View>
  );
}
export function VariableCatalogueScreen({ theme, layout, host, openEditor }: CatalogueScreenProps) {
  const read = useRpc(variableCatalogue);
  const catalogue = useQuery({
    queryKey: ["project-environment-catalogue", host.id],
    queryFn: () => read({}),
  });
  const [query, setQuery] = useState("");
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
  const variableLabel = count === 1 ? "variable" : "variables";
  const projectLabel = projects.length === 1 ? "project" : "projects";
  let emptyText =
    "No saved variables on this host yet. Add one from Project environment in a workspace.";
  if (catalogue.data?.projects.length) emptyText = "No names or descriptions match your search.";
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.introduction}>
        <Text style={styles.title}>Environment variables</Text>
        <Text style={styles.detail}>
          Find variables across projects and workspaces on {host.label}. Search matches names and
          descriptions only.
        </Text>
      </View>
      <Field
        label="Search variables"
        value={query}
        placeholder="Name or description"
        onChangeText={setQuery}
        theme={theme}
      />
      <View style={styles.toolbar}>
        <Text style={styles.detail}>
          {count} {variableLabel} in {projects.length} {projectLabel}
        </Text>
        <ActionButton
          label={catalogue.isFetching ? "Refreshing…" : "Refresh"}
          disabled={catalogue.isFetching}
          onPress={refresh}
          theme={theme}
        />
      </View>
      {catalogue.isPending ? <Text style={styles.detail}>Loading saved variables…</Text> : null}
      {catalogue.isError ? (
        <Text accessibilityRole="alert" style={styles.detail}>
          Could not load saved variables. Use Refresh to try again.
        </Text>
      ) : null}
      {catalogue.isSuccess && !projects.length ? (
        <Text style={styles.detail}>{emptyText}</Text>
      ) : null}
      {catalogue.data && catalogue.data.unavailableDirectories > 0 ? (
        <Text style={styles.detail}>
          Some project locations are unavailable. Their saved variables are still included.
        </Text>
      ) : null}
      {projects.map((project) => (
        <ProjectResults
          key={project.scopeId}
          project={project}
          theme={theme}
          openEditor={openEditor}
        />
      ))}
      <Text style={styles.detail}>
        Values stay hidden until you choose Reveal or Copy. Revealed values hide after 30 seconds.
      </Text>
    </ScrollView>
  );
}
