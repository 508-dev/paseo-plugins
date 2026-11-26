import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { addVariables, bulkPasteLimit } from "../shared/environment";
import { parseBulkVariables } from "../shared/bulk-paste";
import { ActionButton } from "./action-button";

interface BulkEditorProps {
  theme: PluginTheme;
  workspaceId: string;
  scope: "project" | "workspace";
  onCancel(): void;
  savedVariables: readonly { name: string }[] | undefined;
  onSaved(added: number, updated: number): void;
  refreshSaved(): Promise<void>;
}

export function BulkEditor({
  theme,
  workspaceId,
  scope,
  savedVariables,
  onCancel,
  onSaved,
  refreshSaved,
}: BulkEditorProps) {
  const save = useRpc(addVariables);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [protect, setProtect] = useState(false);
  const toggleProtection = useCallback(() => {
    setProtect((current) => !current);
    setError("");
  }, []);
  const checkboxState = useMemo(
    () => ({ checked: protect, disabled: pending }),
    [protect, pending],
  );
  const changeText = useCallback((value: string) => {
    setText(value);
    setError("");
  }, []);
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    if (text.length > bulkPasteLimit)
      return { message: "This paste is too large. Split it into smaller batches." };
    return parseBulkVariables(text);
  }, [text]);
  const preview = useMemo(() => {
    if (!parsed || !("variables" in parsed)) return null;
    const savedNames = new Set(savedVariables?.map(({ name }) => name));
    const existing = parsed.variables
      .map(({ name }) => name)
      .filter((name) => savedNames.has(name));
    return { existing, newCount: parsed.variables.length - existing.length };
  }, [parsed, savedVariables]);
  const blocked = protect && Boolean(preview?.existing.length);
  const submit = useCallback(async () => {
    if (pending || !preview || blocked) return;
    setPending(true);
    setError("");
    try {
      const result = await save({ workspaceId, scope, text, overwriteNames: preview.existing });
      if (result.status === "rejected") {
        setError(result.message);
        await refreshSaved();
        return;
      }
      setText("");
      onSaved(result.added, result.updated);
    } catch {
      setError("Could not confirm the save. Check Saved variables before retrying.");
      void refreshSaved();
    } finally {
      setPending(false);
    }
  }, [blocked, onSaved, pending, preview, refreshSaved, save, scope, text, workspaceId]);
  const validation = parsed && "message" in parsed ? parsed.message : "";
  const actions = [
    preview?.newCount ? `Add ${preview.newCount}` : "",
    preview?.existing.length
      ? `${preview.newCount ? "update" : "Update"} ${preview.existing.length}`
      : "",
  ].filter(Boolean);
  const label = pending ? "Saving…" : actions.join(", ") || "Save variables";
  const styles = useMemo(
    () => ({
      detail: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      checkbox: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        minHeight: 44,
      },
      mark: { color: theme.colors.foreground, fontSize: 17 },
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
        Paste one NAME=value per line. Values are visible while editing.
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
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Protect existing values"
        accessibilityState={checkboxState}
        disabled={pending}
        onPress={toggleProtection}
        style={styles.checkbox}
      >
        <Text style={styles.mark}>{protect ? "☑" : "☐"}</Text>
        <Text style={styles.detail}>Protect existing values</Text>
      </Pressable>
      {preview ? (
        <View>
          <Text style={styles.detail}>
            {preview.newCount} new · {preview.existing.length} existing
          </Text>
          {preview.existing.length ? (
            <Text style={blocked ? styles.error : styles.detail}>
              {blocked
                ? "Remove these names from the paste to continue: "
                : "Values to overwrite: "}
              {preview.existing.join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
      {error || validation ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error || validation}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          label={label}
          theme={theme}
          onPress={submit}
          variant="primary"
          disabled={pending || !preview || blocked}
        />
        <ActionButton label="Cancel" theme={theme} onPress={onCancel} disabled={pending} />
      </View>
    </>
  );
}
