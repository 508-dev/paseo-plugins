import { requestMethod, type AllowedRequest } from "../shared/environment";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { Field } from "./field";

import { ActionButton } from "./action-button";
const methodRow = { flexDirection: "row", flexWrap: "wrap", gap: 6 } as const;
type Method = AllowedRequest["method"];
function MethodButton({
  value,
  method,
  setMethod,
  theme,
  disabled,
}: {
  value: Method;
  method: Method;
  setMethod(value: Method): void;
  theme: PluginTheme;
  disabled: boolean;
}) {
  const choose = useCallback(() => setMethod(value), [value, setMethod]);
  return (
    <ActionButton
      label={value}
      variant={method === value ? "primary" : "outline"}
      selected={method === value}
      theme={theme}
      onPress={choose}
      disabled={disabled}
    />
  );
}
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
  const detail = useMemo(() => ({ color: theme.colors.foregroundMuted, fontSize: 13 }), [theme]);
  const preset = presets.some((option) => option.value === value) ? value : "";
  const selectPreset = useCallback(
    (url: string) => {
      onChangeText(url);
      if (url) setMethod("GET");
    },
    [onChangeText, setMethod],
  );
  return (
    <>
      <SettingsSelect
        label="API preset"
        value={method === "GET" ? preset : ""}
        options={presets}
        onValueChange={selectPreset}
        disabled={disabled}
      />
      <Text style={detail}>HTTP method</Text>
      <View style={methodRow}>
        {requestMethod.options.map((verb) => (
          <MethodButton key={verb} value={verb} {...{ method, setMethod, theme, disabled }} />
        ))}
      </View>
      <Field
        label="HTTPS endpoint"
        value={value}
        onChangeText={onChangeText}
        theme={theme}
        disabled={disabled}
        placeholder="https://api.example.com/v1/account"
      />
      <Text style={detail}>
        {method === "GET"
          ? "Agents can read from this endpoint."
          : "Saving allows agents to send " + method + " requests with their own JSON bodies."}
      </Text>
    </>
  );
}
