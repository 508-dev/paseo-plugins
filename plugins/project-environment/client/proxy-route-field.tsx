import { useMemo } from "react";
import { Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { Field } from "./field";

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
}: {
  value: string;
  onChangeText(value: string): void;
  theme: PluginTheme;
  disabled: boolean;
}) {
  const detail = useMemo(() => ({ color: theme.colors.foregroundMuted, fontSize: 13 }), [theme]);
  const preset = presets.some((option) => option.value === value) ? value : "";
  return (
    <>
      <SettingsSelect
        label="API preset"
        value={preset}
        options={presets}
        onValueChange={onChangeText}
        disabled={disabled}
      />
      <Field
        label="Allowed endpoint (GET)"
        value={value}
        onChangeText={onChangeText}
        theme={theme}
        disabled={disabled}
        placeholder="https://api.example.com/v1/account"
      />
      <Text style={detail}>
        Agents can call this URL using the credential. Choose an endpoint that keeps authorization
        headers private.
      </Text>
    </>
  );
}
