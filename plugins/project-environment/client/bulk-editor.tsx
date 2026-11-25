import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { addVariables, bulkPasteLimit } from "../shared/environment";
import { ActionButton } from "./action-button";

interface BulkEditorProps {
  theme: PluginTheme;
  workspaceId: string;
  scope: "project" | "workspace";
  onCancel(): void;
  onAdded(count: number): void;
}

export function BulkEditor({ theme, workspaceId, scope, onCancel, onAdded }: BulkEditorProps) {
  const add = useRpc(addVariables);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const changeText = useCallback((value: string) => {
    setText(value);
    setError("");
  }, []);
  const submit = useCallback(async () => {
    if (pending || !text.trim()) return;
    if (text.length > bulkPasteLimit) {
      setError("This paste is too large. Split it into smaller batches.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await add({ workspaceId, scope, text });
      if (result.status === "rejected") {
        setError(result.message);
        return;
      }
      setText("");
      onAdded(result.count);
    } catch {
      setError("Could not confirm the save. Check Saved variables before retrying.");
    } finally {
      setPending(false);
    }
  }, [add, onAdded, pending, scope, text, workspaceId]);
  const styles = useMemo(
    () => ({
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      input: {
        minHeight: 144,
        maxHeight: 320,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        fontSize: 14,
        textAlignVertical: "top" as const,
      },
      actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
    }),
    [theme],
  );
  return (
    <>
      <Text style={styles.detail}>
        Paste one NAME=value per line. Values are visible while editing. Existing variables in this
        scope are protected from overwrites.
      </Text>
      <TextInput
        accessibilityLabel="Variable assignments"
        placeholder={"ERPNEXT_API_SECRET=example\nERPNEXT_BASE_URL=https://example.com"}
        placeholderTextColor={theme.colors.foregroundMuted}
        multiline
        value={text}
        onChangeText={changeText}
        editable={!pending}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        style={styles.input}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          label={pending ? "Adding…" : "Add variables"}
          theme={theme}
          onPress={submit}
          variant="primary"
          disabled={pending || !text.trim()}
        />
        <ActionButton label="Cancel" theme={theme} onPress={onCancel} disabled={pending} />
      </View>
    </>
  );
}
