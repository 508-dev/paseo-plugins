import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";

export function addWorkspaceShortcuts(client: PluginClientContext) {
  const buttons = new Map<string, PluginButtonRegistration>();
  let stopped = false;
  let generation = 0;
  let release: (() => void) | undefined;
  const removed = new Set<string>();

  function remove(workspaceId: string) {
    buttons.get(workspaceId)?.remove();
    buttons.delete(workspaceId);
  }

  function register(workspaceId: string) {
    if (buttons.has(workspaceId) || removed.has(workspaceId)) return;
    buttons.set(
      workspaceId,
      client.addHeaderButton({
        id: "environment",
        workspaceId,
        button: {
          title: "Environment variables",
          icon: "KeyRound",
          behavior: {
            kind: "action",
            onPress: () => client.openPanel("environment", { workspaceId }),
          },
        },
      }),
    );
  }

  async function loadRemaining(next: string | null, snapshot: number) {
    let cursor = next;
    while (cursor) {
      const page = await client.paseo.workspaces.list({ page: { limit: 200, cursor } });
      if (stopped || generation !== snapshot) return;
      for (const workspace of page.entries) register(workspace.id);
      cursor = page.pageInfo.nextCursor;
    }
  }

  function reportError() {
    if (!stopped) console.error("Project environment could not load workspace shortcuts.");
  }

  void client.paseo.workspaces
    .list({ subscribe: {}, page: { limit: 200 } })
    .then(({ subscription }) => {
      if (stopped) {
        void subscription.release();
        return undefined;
      }
      const unsubscribe = subscription.subscribe({
        snapshot: ({ entries, pageInfo }) => {
          for (const id of buttons.keys()) remove(id);
          removed.clear();
          for (const workspace of entries) register(workspace.id);
          void loadRemaining(pageInfo.nextCursor, ++generation).catch(reportError);
        },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            removed.delete(update.workspace.id);
            register(update.workspace.id);
          } else {
            removed.add(update.id);
            remove(update.id);
          }
        },
        error: reportError,
      });
      release = () => {
        unsubscribe();
        void subscription.release();
      };
      return undefined;
    })
    .catch(reportError);

  return () => {
    stopped = true;
    release?.();
    for (const id of buttons.keys()) remove(id);
  };
}
