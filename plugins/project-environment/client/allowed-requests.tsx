import { useCallback, useState, useMemo } from "react";
import { Text, View } from "react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import {
  allowedRequest,
  proposedRequests,
  requestMethod,
  type AllowedRequest,
} from "../shared/environment";
import { ActionButton } from "./action-button";
import { Field } from "./field";

const methods = requestMethod.options.map((value) => ({ value, label: value }));
export function AllowedRequests({
  theme,
  workspaceId,
  scope,
  hostId,
  name,
  base,
  items,
  setItems,
  disabled,
}: {
  theme: PluginTheme;
  workspaceId: string;
  scope: "project" | "workspace";
  hostId: string;
  name: string;
  base: string;
  items: AllowedRequest[];
  setItems(items: AllowedRequest[]): void;
  disabled: boolean;
}) {
  const [id, setId] = useState("");
  const [method, setMethod] = useState<AllowedRequest["method"]>("GET");
  const [url, setUrl] = useState("");
  const [editing, edit] = useState(false);
  const read = useRpc(proposedRequests);
  const drafts = useQuery({
    queryKey: ["environment-proposals", hostId, workspaceId, scope, name],
    queryFn: () => read({ workspaceId, scope, name }),
    refetchInterval: 5000,
  });
  const valid = allowedRequest.safeParse({ id, method, url });
  const start = useCallback(() => {
    setId("");
    setMethod("GET");
    setUrl(base);
    edit(true);
  }, [base]);
  const add = useCallback(() => {
    setItems([...items, { id, method, url }]);
    edit(false);
  }, [items, setItems, id, method, url]);
  const remove = useCallback(
    (r: AllowedRequest) => setItems(items.filter((v) => v.id !== r.id)),
    [items, setItems],
  );
  const review = useCallback((r: AllowedRequest) => {
    setId(r.id);
    setMethod(r.method);
    setUrl(r.url);
    edit(true);
  }, []);
  const title = useMemo(
    () => ({ color: theme.colors.foreground, fontWeight: "600" as const }),
    [theme],
  );
  return (
    <>
      <Text style={title}>Allowed requests</Text>
      {items.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          action="Remove"
          onPress={remove}
          theme={theme}
          disabled={disabled}
        />
      ))}
      <ActionButton label="Add request" theme={theme} onPress={start} disabled={disabled} />
      {drafts.data?.requests
        .filter(
          (r) => !items.some((v) => v.id === r.id && v.method === r.method && v.url === r.url),
        )
        .map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            action="Review agent suggestion"
            onPress={review}
            theme={theme}
            disabled={disabled}
          />
        ))}
      {editing && (
        <>
          <Field
            label="Operation name"
            placeholder="update-dns-record"
            value={id}
            onChangeText={setId}
            theme={theme}
            disabled={disabled}
          />
          <SettingsSelect<AllowedRequest["method"]>
            label="HTTP method"
            options={methods}
            value={method}
            onValueChange={setMethod}
            disabled={disabled}
          />
          <Field
            label="Exact HTTPS endpoint"
            value={url}
            onChangeText={setUrl}
            theme={theme}
            disabled={disabled}
          />
          <ActionButton
            label="Add to allowed requests"
            onPress={add}
            disabled={
              disabled || !valid.success || items.length >= 32 || items.some((v) => v.id === id)
            }
            theme={theme}
          />
        </>
      )}
    </>
  );
}
function RequestRow({
  request,
  action,
  onPress,
  theme,
  disabled,
}: {
  request: AllowedRequest;
  action: string;
  onPress(r: AllowedRequest): void;
  theme: PluginTheme;
  disabled: boolean;
}) {
  const press = useCallback(() => onPress(request), [onPress, request]);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  return (
    <View>
      <Text selectable style={style}>
        {request.id} · {request.method} {request.url}
      </Text>
      <ActionButton label={action} onPress={press} theme={theme} disabled={disabled} />
    </View>
  );
}
