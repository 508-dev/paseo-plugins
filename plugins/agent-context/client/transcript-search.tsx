import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import * as ui from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  agentTranscriptAttachmentSourceId,
  EXCERPT_AGENT_LIMIT,
  EXCERPT_TIMELINE_LIMIT,
  excerptQuerySchema,
  type searchTranscriptExcerptsRpc,
} from "../shared/agent-context";
import { getDestination } from "./destination";

type SearchResult = RpcOutput<typeof searchTranscriptExcerptsRpc>;
type Excerpt = SearchResult["items"][number];

interface Props extends PluginScreenProps {
  search(query: string): Promise<SearchResult>;
}

function excerptText(item: Excerpt, hostLabel: string): string {
  const header = [
    `Source session: ${item.title}`,
    `Source host: ${hostLabel.replace(/\s+/g, " ").slice(0, 160)}`,
    item.subtitle,
  ].filter(Boolean);
  return `${header.join("\n")}\n\n${item.text}`;
}

export function TranscriptSearch({ host, theme, layout, params, search }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Excerpt | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const destination = getDestination(params.destination);
  const canAttach = Boolean(destination?.composer);
  const canCopy = typeof ui.copyText === "function";
  const validQuery = excerptQuerySchema.safeParse(query);
  const { colors } = theme;

  async function runSearch() {
    if (!validQuery.success || pending.current) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    setSelected(null);
    setMessage("");
    try {
      setResult(await search(validQuery.data));
    } catch {
      setMessage(`Couldn’t search ${host.label}. Check the host connection and try again.`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function attach(item: Excerpt) {
    const id = JSON.stringify([host.id, item.id]);
    const sourceId = agentTranscriptAttachmentSourceId;
    try {
      const composer = getDestination(params.destination)?.composer?.();
      if (!composer) {
        setMessage("The destination is unavailable. You can still copy the excerpt.");
        return;
      }
      if (
        composer.attachments.some(
          (attachment) => attachment.sourceId === sourceId && attachment.item.id === id,
        )
      ) {
        setMessage(
          "This conversation already has an excerpt in the draft. Remove it before attaching another.",
        );
        return;
      }
      composer.addAttachment({
        sourceId,
        item: {
          ...item,
          id,
          text: excerptText(item, host.label),
        },
      });
      setMessage("Excerpt added to the draft.");
      await composer.focus().catch(() => {
        setMessage("Excerpt added. Return to the destination agent to review it.");
      });
    } catch {
      setMessage("Couldn’t attach the excerpt. You can still copy it.");
    }
  }

  async function copy(item: Excerpt) {
    try {
      await ui.copyText(excerptText(item, host.label));
      setMessage("Excerpt copied.");
    } catch {
      setMessage("Couldn’t copy the excerpt. You can select the text in the preview.");
    }
  }

  const actionStyle = {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: colors.surface1,
  } as const;
  const muted = { color: colors.foregroundMuted } as const;
  const foreground = { color: colors.foreground } as const;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12 }}
    >
      <Text style={muted}>
        Search reads matching excerpts from {host.label} into this app. Only the excerpt you attach
        goes to the destination agent when you send the draft.
      </Text>
      <TextInput
        accessibilityLabel="Search transcript text"
        placeholder="Search what was said"
        placeholderTextColor={colors.foregroundMuted}
        value={query}
        onChangeText={setQuery}
        maxLength={160}
        editable={!busy}
        returnKeyType="search"
        onSubmitEditing={() => void runSearch()}
        style={{ ...foreground, backgroundColor: colors.surface1, padding: 10, borderRadius: 6 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !validQuery.success, busy }}
        disabled={busy || !validQuery.success}
        onPress={() => void runSearch()}
        style={[actionStyle, (busy || !validQuery.success) && { opacity: 0.5 }]}
      >
        <Text style={foreground}>{busy ? "Searching…" : `Search ${host.label}`}</Text>
      </Pressable>
      <Text style={muted}>
        Searches the latest {EXCERPT_TIMELINE_LIMIT} timeline entries of up to {EXCERPT_AGENT_LIMIT}{" "}
        recent agents.
      </Text>
      {result?.unavailable ? (
        <Text style={muted}>{result.unavailable} transcripts could not be searched.</Text>
      ) : null}
      {result?.items.length === 0 ? (
        <Text style={foreground}>No matches in this search window.</Text>
      ) : null}
      {result?.items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ selected: selected?.id === item.id }}
          onPress={() => {
            setSelected(item);
            setMessage("");
          }}
          style={{ padding: 12, borderRadius: 6, backgroundColor: colors.surface1 }}
        >
          <Text style={foreground}>{item.title}</Text>
          {item.subtitle ? <Text style={muted}>{item.subtitle}</Text> : null}
        </Pressable>
      ))}
      {selected ? (
        <View style={{ gap: 12, padding: 12, backgroundColor: colors.surface1, borderRadius: 6 }}>
          <Text style={muted}>Excerpt preview</Text>
          <Text selectable style={foreground}>
            {excerptText(selected, host.label)}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {canAttach ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void attach(selected)}
                style={actionStyle}
              >
                <Text style={foreground}>Attach to {destination?.title}</Text>
              </Pressable>
            ) : null}
            {canCopy ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void copy(selected)}
                style={actionStyle}
              >
                <Text style={foreground}>Copy excerpt</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={foreground}>
          {message}
        </Text>
      ) : null}
    </ScrollView>
  );
}
