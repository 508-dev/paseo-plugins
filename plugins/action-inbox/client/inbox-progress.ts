import type { PaseoAgentHandle } from "@getpaseo/client";

type TimelinePage = Awaited<ReturnType<PaseoAgentHandle["timeline"]["refetch"]>>;
type TimelineEntry = Pick<TimelinePage["entries"][number], "item" | "turnId">;

const excerptLimit = 120;

function* proseBlocks(message: string) {
  let fence = "";
  let block: string[] = [];
  const listItem = /^(?:[-*+]\s+|\d+[.)]\s+)/;
  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    const marker = trimmed.match(/^(?:`{3,}|~{3,})/)?.[0];
    if (!fence && /^(?:=+|-+)$/.test(trimmed)) {
      // A setext underline turns the preceding paragraph into a heading.
      block = [];
      continue;
    }
    const heading =
      /^(?:#{1,6}\s|>)/.test(trimmed) ||
      /^(?:summary|update|progress|results?)[:.!]*$/i.test(trimmed.replace(/\*\*|__/g, ""));
    const boundary = !trimmed || marker || heading;
    if (boundary || listItem.test(trimmed)) {
      if (block.length) yield block.join(" ");
      block = [];
    }
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && trimmed === marker) {
        fence = "";
      }
    } else if (!fence && !boundary) {
      block.push(trimmed.replace(listItem, ""));
    }
  }
  if (block.length) yield block.join(" ");
}

function openingSentence(message: string): string | null {
  for (const block of proseBlocks(message)) {
    const plain = block
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*|__|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
      if (
        !sentence ||
        /^(?:done|sure|okay|ok|summary|update|progress|results?)[:.!]*$/i.test(sentence)
      ) {
        continue;
      }
      const characters = Array.from(sentence);
      if (characters.length <= excerptLimit) return sentence;
      const prefix = characters.slice(0, excerptLimit - 1).join("");
      const lastSpace = prefix.lastIndexOf(" ");
      return `${lastSpace > excerptLimit - 24 ? prefix.slice(0, lastSpace) : prefix}…`;
    }
  }
  return null;
}

export function latestProgress(
  entries: readonly TimelineEntry[],
  activeTurnId?: string,
): string | null {
  let turnId = activeTurnId;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { item, turnId: entryTurnId } = entries[index];
    if (item.type === "user_message") break;
    if (turnId && entryTurnId && entryTurnId !== turnId) break;
    turnId ??= entryTurnId;
    if (item.type !== "assistant_message" || (turnId && entryTurnId !== turnId)) {
      continue;
    }
    const excerpt = openingSentence(item.text);
    if (excerpt) return excerpt;
  }
  return null;
}

type ProgressEntry = {
  listeners: Set<() => void>;
  load: () => Promise<string | null>;
  status: "queued" | "loading" | "ready" | "failed";
  excerpt: string | null;
};

/** Share a bounded set of reads between cards and discard queued work for unmounted rows. */
export function createProgressStore() {
  const entries = new Map<string, ProgressEntry>();
  let inFlight = 0;

  function prune() {
    for (const [key, entry] of entries) {
      if (entries.size <= 400) break;
      if (entry.status === "ready" && entry.listeners.size === 0) entries.delete(key);
    }
  }

  async function fetchEntry(key: string, entry: ProgressEntry) {
    entry.status = "loading";
    inFlight += 1;
    try {
      entry.excerpt = await entry.load();
      entry.status = "ready";
    } catch {
      entry.status = "failed";
      if (entry.listeners.size === 0) entries.delete(key);
    } finally {
      inFlight -= 1;
      for (const listener of entry.listeners) listener();
      prune();
      pump();
    }
  }

  function pump() {
    for (const [key, entry] of entries) {
      if (inFlight >= 4) break;
      if (entry.status === "queued") void fetchEntry(key, entry);
    }
  }

  return {
    get: (key: string) => entries.get(key)?.excerpt ?? null,
    retryFailed() {
      for (const entry of entries.values()) {
        if (entry.status === "failed") entry.status = "queued";
      }
      pump();
    },
    subscribe(key: string, load: ProgressEntry["load"], listener: () => void) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { listeners: new Set(), load, status: "queued", excerpt: null };
        entries.set(key, entry);
      }
      const subscribed = entry;
      subscribed.listeners.add(listener);
      if (subscribed.status === "failed") subscribed.status = "queued";
      pump();
      return () => {
        subscribed.listeners.delete(listener);
        if (
          (subscribed.status === "queued" || subscribed.status === "failed") &&
          subscribed.listeners.size === 0
        )
          entries.delete(key);
        prune();
      };
    },
  };
}
