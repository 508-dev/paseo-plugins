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
import { useRpc } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { readVariableValue, type VariableTarget } from "../shared/environment";
import { ActionButton } from "./action-button";
import { CopyDestination } from "./copy-destination";
import { VariableValueController } from "./value-controller";

interface ValueControlsProps {
  target: VariableTarget;
  hostId: string;
  name: string;
  description: string;
  theme: PluginTheme;
  children?: ReactNode;
}
export function ValueControls({
  target,
  hostId,
  name,
  description,
  theme,
  children,
}: ValueControlsProps) {
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
        minWidth: 0,
      },
      heading: {
        flexDirection: "row" as const,
        gap: 4,
        alignItems: "center" as const,
      },
    }),
    [theme],
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
        <ActionButton
          label={`${revealed ? "Hide" : "Reveal"} value for ${name}`}
          icon={revealed ? "EyeOff" : "Eye"}
          disabled={busy}
          onPress={reveal}
          theme={theme}
        />
        <ActionButton
          label={`Copy value for ${name}`}
          icon="Clipboard"
          disabled={busy}
          onPress={copy}
          theme={theme}
        />
      </View>
      {description ? <Text style={styles.detail}>{description}</Text> : null}
      {state.revealed !== null ? (
        <Text selectable style={styles.value}>
          {state.revealed}
        </Text>
      ) : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={messageStyle}>
          {state.message}
        </Text>
      ) : null}
      <CopyDestination name={name} source={target} hostId={hostId} theme={theme}>
        {children}
      </CopyDestination>
    </>
  );
}
