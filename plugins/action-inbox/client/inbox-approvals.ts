export type ApprovalState = { pending: string; error: null } | { pending: null; error: string };

/** Approval operations belong to the screen, including when a row leaves the render window. */
export function createApprovalStore() {
  let snapshot = new Map<string, ApprovalState>();
  const listeners = new Set<() => void>();

  function publish(next: Map<string, ApprovalState>) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function set(key: string, state?: ApprovalState) {
    const next = new Map(snapshot);
    if (state) next.set(key, state);
    else next.delete(key);
    publish(next);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    prune(keys: Set<string>) {
      const expired = [...snapshot].filter(
        ([key, state]) => state.pending === null && !keys.has(key),
      );
      if (expired.length === 0) return;
      const next = new Map(snapshot);
      for (const [key] of expired) next.delete(key);
      publish(next);
    },
    async run(key: string, actionId: string, respond: () => Promise<void>) {
      if (snapshot.get(key)?.pending != null) return;
      set(key, { pending: actionId, error: null });
      try {
        await respond();
        set(key);
      } catch (failure) {
        set(key, {
          pending: null,
          error: failure instanceof Error ? failure.message : String(failure),
        });
      }
    },
  };
}
