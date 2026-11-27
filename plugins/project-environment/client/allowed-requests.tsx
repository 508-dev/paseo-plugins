import { useCallback, useMemo, useState, useEffect } from "react";
import { Text, View } from "react-native";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import {
  allowedRequest,
  watchProposals,
  requestMethod,
  type VariableTarget,
  type AllowedRequest,
} from "../shared/environment";
import { ActionButton } from "./action-button";
import { Field } from "./field";

const actions = { flexDirection: "row", flexWrap: "wrap", gap: 6 } as const;
const methods = requestMethod.options.map((value) => ({ value, label: value }));
export function AllowedRequests({
  theme,
  target,
  name,
  base,
  items,
  save,
  disabled,
  editing,
  edit,
}: {
  theme: PluginTheme;
  target: VariableTarget;
  name: string;
  base: string;
  items: AllowedRequest[];
  save(next: AllowedRequest[]): Promise<boolean>;
  disabled: boolean;
  editing: boolean;
  edit(value: boolean): void;
}) {
  const [editingSuggestion, setEditingSuggestion] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [method, setMethod] = useState<AllowedRequest["method"]>("GET");
  const [url, setUrl] = useState("");
  const [snapshot, setSnapshot] = useState<{ requests: AllowedRequest[] }>();
  const read = useRpc(watchProposals);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    async function follow() {
      let revision: number | undefined;
      for (;;) {
        if (!active) return;
        try {
          const result = await read({ target, name, revision });
          if (!active) return;
          setSnapshot(result);
          setOffline(false);
          revision = result.revision;
        } catch {
          if (!active) return;
          setOffline(true);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
    void follow();
    return () => {
      active = false;
    };
  }, [read, target, name]);
  const drafts = snapshot?.requests.filter(
    (r) => !items.some((v) => v.id === r.id && v.method === r.method && v.url === r.url),
  );
  const start = useCallback(() => {
    setEditingSuggestion(null);
    setId("");
    setMethod("GET");
    setUrl(base);
    edit(true);
  }, [base, edit]);
  const review = useCallback(
    (request: AllowedRequest) => {
      setEditingSuggestion(request.id);
      setId(request.id);
      setMethod(request.method);
      setUrl(request.url);
      edit(true);
    },
    [edit],
  );
  const cancel = useCallback(() => edit(false), [edit]);
  const allow = useCallback((r: AllowedRequest) => save([...items, r]), [items, save]);
  const add = useCallback(async () => {
    if (await allow({ id, method, url })) edit(false);
  }, [allow, id, method, url, edit]);
  const remove = useCallback(
    (r: AllowedRequest) => save(items.filter((v) => v.id !== r.id)),
    [items, save],
  );
  const title = useMemo(
    () => ({ color: theme.colors.foreground, fontWeight: "600" as const }),
    [theme],
  );
  const detail = useMemo(() => ({ color: theme.colors.foregroundMuted, fontSize: 13 }), [theme]);
  const form = (
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
      <View style={actions}>
        <ActionButton
          label="Allow request"
          variant="primary"
          onPress={add}
          disabled={
            disabled ||
            !allowedRequest.safeParse({ id, method, url }).success ||
            items.length >= 32 ||
            items.some((v) => v.id === id)
          }
          theme={theme}
        />
        <ActionButton label="Cancel request" onPress={cancel} disabled={disabled} theme={theme} />
      </View>
    </>
  );
  return (
    <>
      <Text style={title}>Agent suggestions{drafts?.length ? ` · ${drafts.length}` : ""}</Text>
      {offline ? (
        <Text style={detail}>Live suggestions are unavailable. Reconnecting…</Text>
      ) : !snapshot ? (
        <Text style={detail}>Loading suggestions…</Text>
      ) : !drafts?.length ? (
        <Text style={detail}>No pending suggestions.</Text>
      ) : null}
      {drafts?.map((r) => (
        <View key={r.id}>
          <RequestRow
            request={r}
            onEdit={review}
            editing={editing}
            action="Allow"
            onPress={allow}
            theme={theme}
            disabled={disabled || items.length >= 32 || items.some((v) => v.id === r.id)}
          />
          {editing && editingSuggestion === r.id && form}
        </View>
      ))}
      <Text style={title}>Additional allowed requests · {items.length}</Text>
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
      {editing && !editingSuggestion ? (
        form
      ) : !editing ? (
        <View style={actions}>
          <ActionButton
            label="Add custom request"
            onPress={start}
            disabled={disabled || items.length >= 32}
            theme={theme}
          />
        </View>
      ) : null}
    </>
  );
}
function RequestRow({
  request,
  action,
  onPress,
  onEdit,
  editing,
  theme,
  disabled,
}: {
  request: AllowedRequest;
  action: "Allow" | "Remove";
  onPress(r: AllowedRequest): Promise<boolean>;
  onEdit?(r: AllowedRequest): void;
  editing?: boolean;
  theme: PluginTheme;
  disabled: boolean;
}) {
  const review = useCallback(() => onEdit?.(request), [onEdit, request]);
  const press = useCallback(() => {
    void onPress(request);
  }, [onPress, request]);
  const styles = useMemo(
    () =>
      ({
        row: { borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 8, gap: 4 },
        heading: { flexDirection: "row", alignItems: "center", gap: 8 },
        method: {
          color:
            request.method === "GET" ? theme.colors.foregroundMuted : theme.colors.statusWarning,
          fontWeight: "600",
        },
        name: { color: theme.colors.foreground, flex: 1 },
        detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      }) as const,
    [theme, request.method],
  );
  return (
    <View style={styles.row}>
      <View style={styles.heading}>
        <Text style={styles.method}>{request.method}</Text>
        <Text selectable style={styles.name}>
          {request.id}
        </Text>
        {onEdit && (
          <ActionButton
            label="Edit suggestion"
            icon="Pencil"
            compact
            theme={theme}
            disabled={editing}
            onPress={review}
          />
        )}
        <ActionButton label={action} theme={theme} onPress={press} disabled={disabled || editing} />
      </View>
      <Text selectable style={styles.detail}>
        {request.url}
      </Text>
    </View>
  );
}
