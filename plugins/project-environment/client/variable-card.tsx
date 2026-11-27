import { useTranslation } from "@getpaseo/plugin/client";
import { messages } from "./messages";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { AllowedRequests } from "./allowed-requests";
import { ActionButton } from "./action-button";
import { ProxyRouteField } from "./proxy-route-field";
import { Field } from "./field";
import { SavedVariableEditor } from "./saved-variable-editor";
import { ValueControls } from "./value";
import {
  proxyRoute,
  type AllowedRequest,
  type variableInput,
  type VariableTarget,
} from "../shared/environment";
import type { z } from "zod";

interface VariableCardProps {
  target: VariableTarget;
  hostId: string;
  workspaceId: string;
  scope: "workspace" | "project";
  requests?: AllowedRequest[];
  proxyUrl?: string;
  setRoute(
    name: string,
    expected: string | null,
    url: string | null,
    previousRequests: AllowedRequest[],
    requests: AllowedRequest[],
  ): Promise<void>;
  name: string;
  description: string;
  theme: PluginTheme;
  save(variable: z.infer<typeof variableInput>): Promise<void>;
  remove(name: string): Promise<void>;
}
export function VariableCard({
  target,
  hostId,
  workspaceId,
  scope,
  requests,
  proxyUrl,
  setRoute,
  name,
  description,
  theme,
  save,
  remove,
}: VariableCardProps) {
  const { t } = useTranslation(messages);
  const [routing, setRouting] = useState(false);
  const [items, setItems] = useState(requests ?? []);
  const [route, setUrl] = useState(proxyUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const apply = useCallback(
    async (url: string | null) => {
      setBusy(true);
      setRouteError("");
      try {
        await setRoute(name, proxyUrl ?? null, url, requests ?? [], items);
        setRouting(false);
      } catch {
        setRouteError(
          "Could not change credential access. Check the saved entry and install the approved IronProxy v0.61.0 binary on the Paseo host.",
        );
      } finally {
        setBusy(false);
      }
    },
    [name, proxyUrl, setRoute, requests, items],
  );
  const saveRoute = useCallback(() => void apply(route), [apply, route]);
  const clearRoute = useCallback(() => void apply(null), [apply]);
  const toggleRouting = useCallback(() => {
    setItems(requests ?? []);
    setUrl(proxyUrl ?? "");
    setRouteError("");
    setRouting((open) => !open);
  }, [requests, proxyUrl]);
  const closeRouting = useCallback(() => setRouting(false), []);
  const [editor] = useState(() => new SavedVariableEditor(name, { save, remove }));
  const state = useSyncExternalStore(editor.subscribe, editor.getState);
  const pending = state.status === "pending";
  const begin = useCallback(() => editor.beginReplacement(description), [editor, description]);
  const setDescription = useCallback((text: string) => editor.set("description", text), [editor]);
  const setValue = useCallback((text: string) => editor.set("value", text), [editor]);
  const submit = useCallback(() => {
    void editor.save();
  }, [editor]);
  const confirm = useCallback(() => {
    void editor.remove();
  }, [editor]);
  const styles = useMemo(
    () => ({
      card: {
        padding: 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        gap: 12,
      },
      title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" as const },
      description: { color: theme.colors.foregroundMuted, fontSize: 13 },
      actions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
        alignItems: "center" as const,
      },
      confirmation: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.surface2,
        gap: 10,
      },
      success: { color: theme.colors.statusSuccess, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [theme],
  );
  let messageStyle = styles.description;
  if (state.status === "error") messageStyle = styles.error;
  if (state.status === "success") messageStyle = styles.success;
  return (
    <View style={styles.card}>
      {state.mode !== "view" ? (
        <Text selectable style={styles.title}>
          {name}
        </Text>
      ) : null}
      {state.mode === "view" ? (
        <ValueControls
          proxyUrl={proxyUrl}
          target={target}
          hostId={hostId}
          name={name}
          description={description}
          theme={theme}
        >
          <ActionButton
            label={proxyUrl ? "Protected settings" : "Protect"}
            onPress={toggleRouting}
            theme={theme}
          />
          <ActionButton label={t("replace")} onPress={begin} theme={theme} />
          <ActionButton label={t("remove")} onPress={editor.confirmRemove} theme={theme} />
        </ValueControls>
      ) : null}
      {routing && state.mode === "view" && (
        <View style={styles.confirmation}>
          <ProxyRouteField value={route} onChangeText={setUrl} disabled={busy} theme={theme} />
          <AllowedRequests
            {...{ theme, workspaceId, scope, hostId, name, items, setItems }}
            base={route}
            disabled={busy}
          />
          <ActionButton
            label="Save allowed requests"
            onPress={saveRoute}
            disabled={busy || !proxyRoute.safeParse(route).success}
            theme={theme}
          />
          {proxyUrl && (
            <ActionButton
              label="Allow commands to read the raw value again"
              variant="destructive"
              disabled={busy}
              theme={theme}
              onPress={clearRoute}
            />
          )}
          <ActionButton label={t("cancel")} disabled={busy} theme={theme} onPress={closeRouting} />
          {routeError && (
            <Text accessibilityRole="alert" style={styles.error}>
              {routeError}
            </Text>
          )}
        </View>
      )}
      {state.mode === "replace" ? (
        <>
          <Field
            label={t("newValue")}
            accessibilityLabel={t("newValueFor", { name })}
            value={state.value}
            onChangeText={setValue}
            theme={theme}
            secure
            disabled={pending}
          />
          <Field
            label={t("description")}
            accessibilityLabel={t("descriptionFor", { name })}
            value={state.description}
            onChangeText={setDescription}
            theme={theme}
            disabled={pending}
          />
          <View style={styles.actions}>
            <ActionButton
              label={pending ? t("saving") : t("saveReplacement")}
              onPress={submit}
              theme={theme}
              variant="primary"
              disabled={pending}
            />
            <ActionButton
              label={t("cancel")}
              onPress={editor.cancel}
              theme={theme}
              disabled={pending}
            />
          </View>
        </>
      ) : null}
      {state.mode === "confirm-remove" ? (
        <View style={styles.confirmation}>
          <Text style={styles.description}>{t("confirmRemoveHint")}</Text>
          <View style={styles.actions}>
            <ActionButton
              label={t("cancel")}
              onPress={editor.cancel}
              theme={theme}
              disabled={pending}
            />
            <ActionButton
              label={pending ? t("removing") : t("confirmRemove")}
              onPress={confirm}
              theme={theme}
              variant="destructive"
              disabled={pending}
            />
          </View>
        </View>
      ) : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={messageStyle}>
          {state.message === "removed" ? t("removed", { name }) : t(state.message)}
        </Text>
      ) : null}
    </View>
  );
}
