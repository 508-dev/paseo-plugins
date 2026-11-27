import { messages } from "./messages";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import {
  useTranslation,
  type PluginWorkspacePanelProps,
  useRpc,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  type AllowedRequest,
  configureProxy,
  proxyRoute,
  listVariables,
  saveVariable,
  removeVariable,
  type variableInput,
} from "../shared/environment";
import { VariableCard } from "./variable-card";
import { ActionButton } from "./action-button";
import { BulkEditor } from "./bulk-editor";
import { ProxyRouteField } from "./proxy-route-field";
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
  const { t } = useTranslation(messages);
  const project = useWorkspace(workspaceId, (workspace) => workspace.projectDisplayName);
  const workspaceName = useWorkspace(workspaceId, (workspace) => workspace.name);
  const isProject = scope === "project";
  const [useProxy, setUseProxy] = useState(false);
  const toggleProxy = useCallback(() => setUseProxy((active) => !active), []);
  const [url, setUrl] = useState("");
  const configure = useRpc(configureProxy);
  const list = useRpc(listVariables);
  const save = useRpc(saveVariable);
  const remove = useRpc(removeVariable);
  const queryClient = useQueryClient();
  const variables = useQuery({
    queryKey: ["project-environment", host.id, workspaceId],
    queryFn: () => list({ workspaceId }),
  });
  const [notice, setNotice] = useState<
    { name: string } | { added: number; updated: number } | null
  >(null);
  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-environment"] }),
      queryClient.invalidateQueries({ queryKey: ["project-environment-catalogue"] }),
    ]);
  }, [queryClient]);
  const setRoute = useCallback(
    async (
      name: string,
      expected: string | null,
      endpoint: string | null,
      previousRequests: AllowedRequest[],
      requests: AllowedRequest[],
    ) => {
      await configure({
        workspaceId,
        scope,
        name,
        expected,
        url: endpoint,
        previousRequests,
        requests,
      });
      await invalidate();
    },
    [configure, workspaceId, scope, invalidate],
  );
  const [bulk, setBulk] = useState(false);
  const openBulk = useCallback(() => {
    setNotice(null);
    setBulk(true);
  }, []);
  const closeBulk = useCallback(() => setBulk(false), []);
  const completeBulk = useCallback(
    (added: number, updated: number) => {
      setBulk(false);
      setNotice({ added, updated });
      void invalidate();
    },
    [invalidate],
  );
  const saveExisting = useCallback(
    async (variable: z.infer<typeof variableInput>) => {
      setNotice(null);
      await save({ workspaceId, scope, variable });
      await invalidate();
    },
    [save, workspaceId, scope, invalidate],
  );
  const removeExisting = useCallback(
    async (name: string) => {
      setNotice(null);
      await remove({ workspaceId, scope, name });
      setNotice({ name });
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
    void editor.save(existingNames, useProxy ? url : undefined);
  }, [editor, savedVariables, useProxy, url]);
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
        <Text style={styles.title}>{t("environment")}</Text>
        <View style={styles.actions}>
          <ActionButton
            label={t("projectDefaults")}
            theme={theme}
            onPress={showProject}
            variant={isProject ? "primary" : "outline"}
            selected={isProject}
          />
          <ActionButton
            label={t("workspaceVariables")}
            theme={theme}
            onPress={showWorkspace}
            variant={isProject ? "outline" : "primary"}
            selected={!isProject}
          />
        </View>
        <Text style={styles.detail}>
          {isProject
            ? t("projectScope", { project: project ?? t("thisProject") })
            : t("workspaceScope", { workspace: workspaceName ?? t("thisWorkspace") })}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.subtitle}>{t("savedVariables")}</Text>
        {notice ? (
          <Text accessibilityRole="alert" style={styles.success}>
            {"name" in notice ? t("removed", { name: notice.name }) : t("bulkSaved", notice)}
          </Text>
        ) : null}
        {variables.isPending ? <Text style={styles.detail}>{t("loading")}</Text> : null}
        {variables.isError ? (
          <>
            <Text style={styles.error}>{t("loadError")}</Text>
            <ActionButton label={t("retry")} onPress={retry} theme={theme} />
          </>
        ) : null}
        {savedVariables?.length === 0 ? (
          <Text style={styles.detail}>{t("noVariables")}</Text>
        ) : null}
        {target &&
          savedVariables?.map((variable) => (
            <VariableCard
              key={JSON.stringify([variable.name, variable.proxyUrl, variable.requests])}
              workspaceId={workspaceId}
              scope={scope}
              requests={variable.requests}
              proxyUrl={variable.proxyUrl}
              setRoute={setRoute}
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
        <Text style={styles.subtitle}>{t(bulk ? "pasteVariables" : "addVariable")}</Text>
        {bulk ? (
          <BulkEditor
            workspaceId={workspaceId}
            scope={scope}
            theme={theme}
            savedVariables={savedVariables}
            onSaved={completeBulk}
            refreshSaved={invalidate}
            onCancel={closeBulk}
          />
        ) : (
          <>
            <Field
              label={t("variableName")}
              value={form.name}
              placeholder="STRIPE_API_KEY"
              onChangeText={setName}
              theme={theme}
              disabled={pending}
            />
            <Field
              label={t("description")}
              value={form.description}
              placeholder={t("purpose")}
              onChangeText={setDescription}
              theme={theme}
              disabled={pending}
            />
            <Field
              label={t("value")}
              value={form.value}
              secure
              onChangeText={setValue}
              theme={theme}
              disabled={pending}
            />
            <ActionButton
              label="Protected"
              selected={useProxy}
              variant={useProxy ? "primary" : "outline"}
              disabled={pending}
              theme={theme}
              onPress={toggleProxy}
            />
            {useProxy && (
              <ProxyRouteField theme={theme} value={url} onChangeText={setUrl} disabled={pending} />
            )}
            <View style={styles.actions}>
              <ActionButton
                label={pending ? t("adding") : t("addVariable")}
                onPress={submit}
                theme={theme}
                variant="primary"
                disabled={
                  pending ||
                  !variables.isSuccess ||
                  (useProxy && !proxyRoute.safeParse(url).success)
                }
              />
              <ActionButton
                label={t("pasteVariables")}
                onPress={openBulk}
                theme={theme}
                disabled={pending || !variables.isSuccess}
              />
            </View>
            {form.message ? (
              <Text accessibilityRole="alert" style={messageStyle}>
                {typeof form.message === "string"
                  ? t(form.message)
                  : t("added", { name: form.message.name })}
              </Text>
            ) : null}
          </>
        )}
      </View>
      <Text style={styles.detail}>{t("environmentPrivacy")}</Text>
    </ScrollView>
  );
}
