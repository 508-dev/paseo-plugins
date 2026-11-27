import { messages } from "./messages";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useTranslation, useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { VariableMenu, type VariableAction } from "./variable-menu";
import { ProtectControl } from "./protect-control";
import { readVariableValue, type AllowedRequest, type VariableTarget } from "../shared/environment";
import { ActionButton } from "./action-button";
import { CopyDestination } from "./copy-destination";
import { VariableValueController } from "./value-controller";

interface ValueControlsProps {
  target: VariableTarget;
  hostId: string;
  proxyUrl?: string;
  proxyMethod?: AllowedRequest["method"];
  requests?: AllowedRequest[];
  name: string;
  description: string;
  theme: PluginTheme;
  children?: ReactNode;
  compact?: boolean;
}
export function ValueControls({
  target,
  hostId,
  proxyUrl,
  proxyMethod,
  requests,
  name,
  description,
  theme,
  children,
  compact = false,
}: ValueControlsProps) {
  const { t } = useTranslation(messages);
  const [action, setAction] = useState<VariableAction | null>(null);
  const closeAction = useCallback(() => setAction(null), []);
  const read = useRpc(readVariableValue);
  const [controller] = useState(
    () =>
      new VariableValueController({
        async read() {
          const result = await read({ target, name });
          return result.value;
        },
        copy: copyText,
      }),
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") controller.hide();
    });
    return () => {
      subscription.remove();
      controller.hide();
    };
  }, [controller]);
  const reveal = useCallback(() => {
    if (state.revealed !== null) controller.hide();
    else void controller.reveal();
  }, [controller, state.revealed]);
  const copy = useCallback(() => {
    void controller.copy();
  }, [controller]);
  const styles = useMemo(
    () => ({
      value: {
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        padding: 10,
        borderRadius: 6,
        fontSize: 13,
      },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      success: { color: theme.colors.statusSuccess, fontSize: 12 },
      title: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "600" as const,
        flexShrink: 1,
        flexGrow: compact ? 1 : 0,
        minWidth: 0,
      },
      heading: {
        flexDirection: "row" as const,
        gap: compact ? 0 : 4,
        alignItems: "center" as const,
      },
    }),
    [theme, compact],
  );
  const busy = state.pending !== null;
  let messageStyle = styles.detail;
  if (state.status === "error") messageStyle = styles.error;
  if (state.status === "success") messageStyle = styles.success;
  const revealed = state.revealed !== null;
  return (
    <>
      <View style={styles.heading}>
        <Text selectable style={styles.title}>
          {name}
        </Text>
        {!proxyUrl && (
          <>
            <ActionButton
              label={t(revealed ? "hideValueFor" : "revealValueFor", { name })}
              icon={revealed ? "EyeOff" : "Eye"}
              compact={compact}
              disabled={busy}
              onPress={reveal}
              theme={theme}
            />
            <ActionButton
              label={t("copyValueFor", { name })}
              icon="Clipboard"
              compact={compact}
              disabled={busy}
              onPress={copy}
              theme={theme}
            />
          </>
        )}
        {compact && (
          <VariableMenu
            theme={theme}
            protectedCredential={Boolean(proxyUrl)}
            onSelect={setAction}
          />
        )}
      </View>
      {action === "copy" && (
        <CopyDestination
          name={name}
          source={target}
          hostId={hostId}
          theme={theme}
          compact
          onClose={closeAction}
        />
      )}
      {action === "protect" && (
        <ProtectControl
          {...{ name, target, hostId, theme, proxyUrl, proxyMethod, requests }}
          dialogOnly
          onClose={closeAction}
        />
      )}
      {proxyUrl && (
        <Text style={styles.detail}>
          Protected · {proxyMethod ?? "GET"} {proxyUrl}
        </Text>
      )}
      {description ? <Text style={styles.detail}>{description}</Text> : null}
      {!proxyUrl && state.revealed !== null ? (
        <Text selectable style={styles.value}>
          {state.revealed}
        </Text>
      ) : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={messageStyle}>
          {t(state.message)}
        </Text>
      ) : null}
      {!compact && (
        <CopyDestination name={name} source={target} hostId={hostId} theme={theme}>
          {children}
        </CopyDestination>
      )}
    </>
  );
}
