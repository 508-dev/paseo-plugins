import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getPaseoClient, useHosts, type PluginHostSummary } from "@getpaseo/plugin/client";
import { cardsForAgent, type InboxCard } from "./inbox-model";
import { createProgressStore, latestProgress } from "./inbox-progress";
import { createInboxStore } from "./inbox-store";

async function loadHost(host: PluginHostSummary) {
  const paseo = getPaseoClient(host.serverId);
  const cards = [];
  let cursor: string | undefined;
  let pageCount = 0;
  do {
    const result = await paseo.agents.list({
      scope: "active",
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of result.entries)
      cards.push(
        ...cardsForAgent(entry.agent, {
          hostId: host.serverId,
          hostLabel: host.label,
          projectName: entry.project.projectName,
          projectKey: entry.project.projectKey,
        }),
      );
    cursor = result.pageInfo.nextCursor ?? undefined;
    pageCount += 1;
  } while (cursor && pageCount < 5);
  return { cards, truncated: Boolean(cursor) };
}

const store = createInboxStore(loadHost);
const progressStore = createProgressStore();

export function useInboxProgress({ hostId, agentId, agentUpdatedAt, activeTurnId }: InboxCard) {
  const key = JSON.stringify([hostId, agentId, agentUpdatedAt, activeTurnId]);
  const subscribe = useCallback(
    (listener: () => void) =>
      progressStore.subscribe(
        key,
        async () => {
          const page = await getPaseoClient(hostId).agents.ref(agentId).timeline.refetch({
            direction: "tail",
            projection: "projected",
            limit: 24,
          });
          if (page.error) throw new Error(page.error);
          return latestProgress(page.entries, activeTurnId);
        },
        listener,
      ),
    [key, hostId, agentId, activeTurnId],
  );
  const snapshot = useCallback(() => progressStore.get(key), [key]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useInbox() {
  const hosts = useHosts();
  useEffect(() => store.retain(hosts), [hosts]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...snapshot,
    cards: snapshot.cards.filter((card) =>
      hosts.some((host) => host.serverId === card.hostId && host.status === "online"),
    ),
    hosts,
    refresh: () => {
      progressStore.retryFailed();
      return store.refresh(true);
    },
  };
}
