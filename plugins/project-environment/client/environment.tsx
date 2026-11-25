import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { type PluginWorkspacePanelProps, useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  listVariables,
  saveVariable,
  removeVariable,
  type variableInput,
} from "../shared/environment";
import { VariableCard } from "./variable-card";
import { ActionButton } from "./action-button";
import { BulkEditor } from "./bulk-editor";
import { Field } from "./field";
import { EnvironmentEditor } from "./editor";

export function EnvironmentPanel(props: PluginWorkspacePanelProps) {
  return <WorkspaceEnvironment key={`${props.host.id}:${props.workspaceId}`} {...props} />;
}
function WorkspaceEnvironment({ theme, layout, host, workspaceId }: PluginWorkspacePanelProps) {
  const [scope, setScope] = useState<"project" | "workspace">("project");
  const showProject = useCallback(() => setScope("project"), []);
  const showWorkspace = useCallback(() => setScope("workspace"), []);
  return (
    <ScopedEnvironment
      key={scope}
      {...{ theme, layout, host, workspaceId, scope, showProject, showWorkspace }}
    />
  );
}

type ScopedEnvironmentProps = Pick<
  PluginWorkspacePanelProps,
  "theme" | "layout" | "host" | "workspaceId"
> & {
  scope: "project" | "workspace";
  showProject(): void;
  showWorkspace(): void;
};

function ScopedEnvironment({
  theme,
  layout,
  host,
  workspaceId,
  scope,
  showProject,
  showWorkspace,
}: ScopedEnvironmentProps) {
  const project = useWorkspace(workspaceId, (workspace) => workspace.projectDisplayName);
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const isProject = scope === "project";
  const list = useRpc(listVariables);
  const save = useRpc(saveVariable);
  const remove = useRpc(removeVariable);
  const queryClient = useQueryClient();
  const variables = useQuery({
    queryKey: ["project-environment", host.id, workspaceId],
    queryFn: () => list({ workspaceId }),
  });
  const [notice, setNotice] = useState("");
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-environment"] }),
      queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue"] }),
    ]);
  }, [queryClient]);
  const [bulk, setBulk] = useState(false);
  const openBulk = useCallback(() => {
    setNotice("");
    setBulk(true);
  }, []);
  const closeBulk = useCallback(() => setBulk(false), []);
  const completeBulk = useCallback(
    (count: number) => {
      setBulk(false);
      setNotice(`${count} ${count === 1 ? "variable" : "variables"} added.`);
      void invalidate();
    },
    [invalidate],
  );
  const saveExisting = useCallback(
    async (variable: z.infer<typeof variableInput>) => {
      setNotice("");
      await save({ workspaceId, scope, variable });
      await invalidate();
    },
    [save, workspaceId, scope, invalidate],
  );
  const removeExisting = useCallback(
    async (name: string) => {
      setNotice("");
      await remove({ workspaceId, scope, name });
      setNotice(`${name} removed.`);
      await invalidate();
    },
    [remove, workspaceId, scope, invalidate],
  );
  const [editor] = useState(() => new EnvironmentEditor({ save: saveExisting }));
  const form = useSyncExternalStore(editor.subscribe, editor.getState);
  const pending = form.status === "pending";
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        padding: layout.compact ? 16 : 24,
        gap: 20,
        maxWidth: 900,
        width: "100%" as const,
        alignSelf: "center" as const,
      },
      heading: { gap: 6 },
      title: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      subtitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      success: { color: theme.colors.statusSuccess, fontSize: 13 },
      section: { gap: 12 },
      form: {
        padding: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 12,
      },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    }),
    [theme, layout.compact],
  );
  const { refetch } = variables;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const setName = useCallback((text: string) => editor.set("name", text), [editor]);
  const setDescription = useCallback((text: string) => editor.set("description", text), [editor]);
  const setValue = useCallback((text: string) => editor.set("value", text), [editor]);
  const data = variables.data;
  const savedVariables = isProject ? data?.variables : data?.workspaceVariables;
  const target = useMemo(() => {
    if (!isProject) return { kind: "workspace" as const, workspaceId };
    return data ? { kind: "project" as const, scopeId: data.scopeId } : null;
  }, [data, isProject, workspaceId]);
  const submit = useCallback(() => {
    const existingNames = savedVariables?.map((variable) => variable.name) ?? [];
    void editor.save(existingNames);
  }, [editor, savedVariables]);
  let messageStyle = styles.detail;
  if (form.status === "error") messageStyle = styles.error;
  if (form.status === "saved") messageStyle = styles.success;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heading}>
        <Text style={styles.title}>Environment</Text>
        <View style={styles.actions}>
          <ActionButton
            label="Project defaults"
            theme={theme}
            onPress={showProject}
            variant={isProject ? "primary" : "outline"}
            selected={isProject}
          />
          <ActionButton
            label="Workspace variables"
            theme={theme}
            onPress={showWorkspace}
            variant={isProject ? "outline" : "primary"}
            selected={!isProject}
          />
        </View>
        <Text style={styles.detail}>
          {isProject
            ? `Shared across workspaces in ${project ?? "this project"}.`
            : `Saved for ${workspaceName ?? "this workspace"} only. Add a name from Project defaults to override it here. Removing the override restores the project value.`}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.subtitle}>Saved variables</Text>
        {notice ? (
          <Text accessibilityRole="alert" style={styles.success}>
            {notice}
          </Text>
        ) : null}
        {variables.isPending ? <Text style={styles.detail}>Loading…</Text> : null}
        {variables.isError ? (
          <>
            <Text style={styles.error}>Could not load variables.</Text>
            <ActionButton label="Retry" onPress={retry} theme={theme} />
          </>
        ) : null}
        {savedVariables?.length === 0 ? <Text style={styles.detail}>No variables yet.</Text> : null}
        {target &&
          savedVariables?.map((variable) => (
            <VariableCard
              key={variable.name}
              target={target}
              hostId={host.id}
              name={variable.name}
              description={variable.description}
              theme={theme}
              save={saveExisting}
              remove={removeExisting}
            />
          ))}
      </View>
      <View style={styles.form}>
        <Text style={styles.subtitle}>{bulk ? "Paste variables" : "Add variable"}</Text>
        {bulk ? (
          <BulkEditor
            workspaceId={workspaceId}
            scope={scope}
            theme={theme}
            onAdded={completeBulk}
            onCancel={closeBulk}
          />
        ) : (
          <>
            <Field
              label="Variable name"
              value={form.name}
              placeholder="STRIPE_API_KEY"
              onChangeText={setName}
              theme={theme}
              disabled={pending}
            />
            <Field
              label="Description"
              value={form.description}
              placeholder="What this variable is used for"
              onChangeText={setDescription}
              theme={theme}
              disabled={pending}
            />
            <Field
              label="Value"
              value={form.value}
              secure
              onChangeText={setValue}
              theme={theme}
              disabled={pending}
            />
            <View style={styles.actions}>
              <ActionButton
                label={pending ? "Adding…" : "Add variable"}
                onPress={submit}
                theme={theme}
                variant="primary"
                disabled={pending || !variables.isSuccess}
              />
              <ActionButton
                label="Paste variables"
                onPress={openBulk}
                theme={theme}
                disabled={pending || !variables.isSuccess}
              />
            </View>
            {form.message ? (
              <Text accessibilityRole="alert" style={messageStyle}>
                {form.message}
              </Text>
            ) : null}
          </>
        )}
      </View>
      <Text style={styles.detail}>
        Values stay hidden until you choose Reveal or Copy. Commands using a variable can access it
        and call APIs with it.
      </Text>
    </ScrollView>
  );
}
