import { proxyRoute, requestMethod, type AllowedRequest } from "../shared/environment";
import { useCallback, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { Field } from "./field";

const methods = requestMethod.options.map((value) => ({ label: value, value }));
const requestRow = {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
} as const;
const stacked = { gap: 8 } as const;
const endpoint = { flexBasis: 260, flexGrow: 1, minWidth: 0 } as const;
const picker = { maxWidth: 400, width: "100%" } as const;

const presets = [
  { label: "Custom endpoint", value: "" },
  { label: "Cloudflare · List zones", value: "https://api.cloudflare.com/client/v4/zones" },
  {
    label: "Cloudflare · Verify user token",
    value: "https://api.cloudflare.com/client/v4/user/tokens/verify",
  },
  { label: "GitHub · Get signed-in user", value: "https://api.github.com/user" },
  { label: "GitHub · List your repositories", value: "https://api.github.com/user/repos" },
];

export function ProxyRouteField({
  value,
  onChangeText,
  theme,
  disabled,
  method,
  setMethod,
}: {
  value: string;
  onChangeText(value: string): void;
  theme: PluginTheme;
  disabled: boolean;
  method: AllowedRequest["method"];
  setMethod(value: AllowedRequest["method"]): void;
}) {
  const [compact, setCompact] = useState(true);
  const measure = useCallback((event: LayoutChangeEvent) => {
    setCompact(event.nativeEvent.layout.width < 560);
  }, []);
  const valid = proxyRoute.safeParse(value).success;
  const detail = useMemo(
    () => ({
      color:
        value && (!valid || method !== "GET")
          ? theme.colors.statusWarning
          : theme.colors.foregroundMuted,
      fontSize: 13,
    }),
    [value, valid, method, theme],
  );
  const group = useMemo(
    () => ({
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      gap: 8,
    }),
    [theme],
  );
  const preset = presets.some((option) => option.value === value) ? value : "";
  const selectPreset = useCallback(
    (url: string) => {
      onChangeText(url);
      if (url) setMethod("GET");
    },
    [onChangeText, setMethod],
  );
  let hint =
    method === "GET"
      ? "Agents can read from this endpoint."
      : `Agents can send ${method} requests to this endpoint with their own JSON bodies.`;
  if (!value) hint = "Choose a preset or enter an exact HTTPS URL.";
  else if (!valid)
    hint = "Use an exact public HTTPS URL without a query string, fragment, or wildcard.";
  const presetPicker = (
    <View style={picker}>
      <SettingsSelect
        label="API preset"
        value={method === "GET" ? preset : ""}
        options={presets}
        onValueChange={selectPreset}
        disabled={disabled}
      />
    </View>
  );
  return (
    <View style={group} onLayout={measure}>
      {compact && presetPicker}
      <View style={compact ? stacked : requestRow}>
        <SettingsSelect
          label="HTTP method"
          value={method}
          options={methods}
          onValueChange={setMethod}
          disabled={disabled}
        />
        <View style={compact ? undefined : endpoint}>
          <Field
            label="HTTPS endpoint"
            value={value}
            onChangeText={onChangeText}
            theme={theme}
            disabled={disabled}
            placeholder="https://api.example.com/v1/account"
          />
        </View>
      </View>
      {!compact && presetPicker}
      <Text style={detail}>{hint}</Text>
    </View>
  );
}
