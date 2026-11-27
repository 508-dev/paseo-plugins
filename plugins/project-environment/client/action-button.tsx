import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";

interface ActionButtonProps {
  label: string;
  icon?: string;
  compact?: boolean;
  expanded?: boolean;
  onPress(): void;
  theme: PluginTheme;
  disabled?: boolean;
  selected?: boolean;
  variant?: "outline" | "primary" | "destructive";
}
export function ActionButton({
  label,
  icon,
  compact = false,
  expanded,
  onPress,
  theme,
  disabled = false,
  selected,
  variant = "outline",
}: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);
  const showHint = useCallback(() => setHovered(true), []);
  const hideHint = useCallback(() => setHovered(false), []);
  const press = useCallback(() => {
    hideHint();
    onPress();
  }, [hideHint, onPress]);
  const accessibilityState = useMemo(() => ({ selected, expanded }), [selected, expanded]);
  const iconSize = compact && Platform.OS === "web" ? 32 : 44;
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
        minWidth: icon ? iconSize : undefined,
        minHeight: icon ? iconSize : 40,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        borderRadius: 8,
        borderWidth: icon ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor,
        zIndex: hovered && icon ? 2 : undefined,
        opacity: disabled ? 0.5 : 1,
      },
      hint: {
        color: theme.colors.foreground,
        fontSize: 12,
        position: "absolute" as const,
        right: 0,
        bottom: "100%" as const,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        backgroundColor: theme.colors.surface2,
        borderWidth: 1,
        borderColor: theme.colors.border,
        width: 168,
      },
      text: { color, fontSize: 13, fontWeight: "500" as const },
    };
  }, [theme, variant, disabled, icon, iconSize, hovered]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={press}
      onHoverIn={icon && Platform.OS === "web" ? showHint : undefined}
      onHoverOut={icon ? hideHint : undefined}
      style={styles.button}
    >
      {icon && hovered && !disabled && (
        <Text aria-hidden pointerEvents="none" style={styles.hint}>
          {label}
        </Text>
      )}
      {icon ? (
        <Icon name={icon} size={17} color={styles.text.color} />
      ) : (
        <Text style={styles.text}>{label}</Text>
      )}
    </Pressable>
  );
}
