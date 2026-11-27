import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useTranslation } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { ActionButton } from "./action-button";
import { messages } from "./messages";

export type VariableAction = "copy" | "protect";
const edge = 8;
const spacing = 4;
const itemHeight = 44;
const menuHeight = itemHeight * 2 + 2;
const backdrop = { position: "absolute", inset: 0 } as const;

export function VariableMenu({
  theme,
  protectedCredential,
  onSelect,
}: {
  theme: PluginTheme;
  protectedCredential: boolean;
  onSelect(action: VariableAction): void;
}) {
  const { t } = useTranslation(messages);
  const anchor = useRef<View>(null);
  const pending = useRef<VariableAction | null>(null);
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const close = useCallback(() => setPosition(null), []);
  const open = useCallback(() => {
    anchor.current?.measureInWindow((x, y, w, h) => {
      const menuWidth = Math.min(208, width - edge * 2);
      const left = Math.max(edge, Math.min(width - menuWidth - edge, x + w - menuWidth));
      const top =
        y + h + spacing + menuHeight <= height - edge
          ? y + h + spacing
          : Math.max(edge, y - menuHeight - spacing);
      setPosition({ top, left, width: menuWidth });
    });
  }, [height, width]);
  const afterDismiss = useCallback(() => {
    if (pending.current) {
      const action = pending.current;
      pending.current = null;
      onSelect(action);
    }
  }, [onSelect]);
  const select = useCallback(
    (action: VariableAction) => {
      close();
      if (Platform.OS === "ios") pending.current = action;
      else onSelect(action);
    },
    [close, onSelect],
  );
  const copy = useCallback(() => select("copy"), [select]);
  const protect = useCallback(() => select("protect"), [select]);
  const styles = useMemo(
    () => ({
      root: { flex: 1 },
      menu: {
        ...position,
        position: "absolute" as const,
        backgroundColor: theme.colors.surface2,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 8,
      },
      item: { minHeight: itemHeight, justifyContent: "center" as const, paddingHorizontal: 12 },
      label: { fontSize: 13, color: theme.colors.foreground },
    }),
    [position, theme],
  );
  return (
    <>
      <View ref={anchor} collapsable={false}>
        <ActionButton
          icon="Ellipsis"
          compact
          label={t("variableActions")}
          expanded={Boolean(position)}
          onPress={open}
          theme={theme}
        />
      </View>
      <Modal
        visible={Boolean(position)}
        transparent
        animationType="none"
        onRequestClose={close}
        onDismiss={afterDismiss}
        statusBarTranslucent
        navigationBarTranslucent
      >
        {position && (
          <View style={styles.root}>
            <Pressable style={backdrop} onPress={close} accessible={false} />
            <View
              style={styles.menu}
              accessibilityRole="menu"
              accessibilityLabel={t("variableActions")}
            >
              <Pressable style={styles.item} onPress={copy} accessibilityRole="menuitem">
                <Text style={styles.label}>{t("copyTo")}</Text>
              </Pressable>
              <Pressable style={styles.item} onPress={protect} accessibilityRole="menuitem">
                <Text style={styles.label}>
                  {protectedCredential ? "Protected settings" : "Protect"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}
