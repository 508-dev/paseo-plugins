import { useMemo } from "react";
import { Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";

interface ActionButtonProps {
  label: string;
  icon?: string;
  onPress(): void;
  theme: PluginTheme;
  disabled?: boolean;
  selected?: boolean;
  variant?: "outline" | "primary" | "destructive";
}
export function ActionButton({
  label,
  icon,
  onPress,
  theme,
  disabled = false,
  selected,
  variant = "outline",
}: ActionButtonProps) {
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const styles = useMemo(() => {
    let backgroundColor = "transparent";
    let color = theme.colors.foreground;
    if (variant === "primary") {
      backgroundColor = theme.colors.accent;
      color = theme.colors.accentForeground;
    }
    if (variant === "destructive") {
      backgroundColor = theme.colors.statusDanger;
      color = theme.colors.accentForeground;
    }
    return {
      button: {
        paddingHorizontal: icon ? 0 : 12,
        paddingVertical: icon ? 0 : 8,
        minWidth: icon ? 44 : undefined,
        minHeight: icon ? 44 : 40,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        borderRadius: 8,
        borderWidth: icon ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor,
        opacity: disabled ? 0.5 : 1,
      },
      text: { color, fontSize: 13, fontWeight: "500" as const },
    };
  }, [theme, variant, disabled, icon]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      style={styles.button}
    >
      {icon ? (
        <Icon name={icon} size={17} color={styles.text.color} />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}
