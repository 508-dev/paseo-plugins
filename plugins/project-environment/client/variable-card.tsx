import { useTranslation } from "@getpaseo/plugin/client";
import { messages } from "./messages";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { ProtectControl } from "./protect-control";
import { ActionButton } from "./action-button";

import { Field } from "./field";
import { SavedVariableEditor } from "./saved-variable-editor";
import { ValueControls } from "./value";
import {
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
  proxyMethod?: AllowedRequest["method"];
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
  requests,
  proxyUrl,
  proxyMethod,
  name,
  description,
  theme,
  save,
  remove,
}: VariableCardProps) {
  const { t } = useTranslation(messages);
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
          proxyMethod={proxyMethod}
          target={target}
          hostId={hostId}
          name={name}
          description={description}
          theme={theme}
        >
          <ProtectControl
            {...{ name, proxyMethod, proxyUrl, requests, workspaceId, hostId, theme, target }}
          />
          <ActionButton label={t("replace")} onPress={begin} theme={theme} />
          <ActionButton label={t("remove")} onPress={editor.confirmRemove} theme={theme} />
        </ValueControls>
      ) : null}
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
