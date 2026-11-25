import { messages } from "./messages";
import { useState } from "react";
import { Text } from "react-native";
import {
  useTranslation,
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { preferences } from "../shared/preferences";

type ReadySettings = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;

function Editor({ settings }: { settings: ReadySettings }) {
  const { t } = useTranslation(messages);
  const [draft, setDraft] = useState(() => ({
    values: settings.values,
    revision: settings.revision,
  }));
  return (
    <SettingsSection title={t("replyGeneration")}>
      <SettingsCard>
        <SettingsSwitch
          label={t("generateAfterTurn")}
          value={draft.values.enabled}
          disabled={settings.saving}
          onValueChange={(enabled) => setDraft({ ...draft, values: { ...draft.values, enabled } })}
        />
        <SettingsInput
          label={t("model")}
          hint={t("modelHint")}
          initialValue={draft.values.model}
          disabled={settings.saving}
          onChangeText={(model) => setDraft({ ...draft, values: { ...draft.values, model } })}
        />
        <SettingsInput
          label={t("executable")}
          hint={t("executableHint")}
          initialValue={draft.values.executable}
          disabled={settings.saving}
          onChangeText={(executable) =>
            setDraft({ ...draft, values: { ...draft.values, executable } })
          }
        />
        <SettingsAction
          label={t("saveSettings")}
          actionLabel={t("save")}
          disabled={settings.saving}
          error={
            settings.saveError ? t("saveError", { detail: settings.saveError }) : settings.saveError
          }
          onPress={async () => {
            await settings.save(draft.values, draft.revision);
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function GenerationSettings({ theme }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const settings = useSettings(preferences);
  if (settings.status === "ready") return <Editor key={settings.revision} settings={settings} />;
  if (settings.status === "loading")
    return <Text style={{ color: theme.colors.foreground }}>{t("loading")}</Text>;
  return (
    <SettingsSection title={t("replyGeneration")}>
      <Text accessibilityRole="alert" style={{ color: theme.colors.foreground }}>
        {t("loadError", { detail: settings.error })}
      </Text>
      <SettingsAction label={t("readAgain")} actionLabel={t("retry")} onPress={settings.reload} />
      {settings.status === "invalid" ? (
        <SettingsAction label={t("restore")} actionLabel={t("reset")} onPress={settings.reset} />
      ) : null}
    </SettingsSection>
  );
}
