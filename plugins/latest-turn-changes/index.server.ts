import { EventEmitter, on } from "node:events";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { coreComparison, watchChanges, type ChangeState } from "./shared/changes";
import { capture, createSnapshotSpace, readComparison } from "./server/git";

export default function contribute(server: PluginServerContext) {
  const updates = new EventEmitter();
  updates.setMaxListeners(0);
  const lifetime = new AbortController();
  const previews = new Map<string, ChangeState>();
  const captures = new Map<
    string,
    {
      turnId: string;
      cancel: AbortController;
      baseline: Promise<Awaited<ReturnType<typeof captureStart>>>;
      settlement?: Promise<ChangeState>;
    }
  >();
  const notify = (agentId: string) => updates.emit(agentId);

  async function captureStart(cwd: string, signal: AbortSignal) {
    try {
      const space = await createSnapshotSpace(cwd, signal);
      try {
        const before = await capture(space, signal);
        return { space, before };
      } catch (error) {
        await space.dispose();
        throw error;
      }
    } catch {
      return null;
    }
  }

  async function forgetCapture(agentId: string) {
    const pending = captures.get(agentId);
    if (!pending) return;
    captures.delete(agentId);
    pending.cancel.abort();
    if (pending.settlement) {
      await pending.settlement;
    } else {
      await (await pending.baseline)?.space.dispose();
    }
  }

  server.addHook("agent.turn.before", async (event, { signal }) => {
    const { agent, turnId } = event;
    if (!agent.workspaceId || agent.background) return;
    if (Reflect.get(event, "captureOwner") === "core") {
      notify(agent.id);
      return;
    }
    if (!turnId) {
      previews.set(agent.id, { kind: "unavailable" });
      await forgetCapture(agent.id);
      notify(agent.id);
      return;
    }
    if (captures.get(agent.id)?.turnId === turnId) return;
    const cleanup = forgetCapture(agent.id);
    const cancel = new AbortController();
    const baseline = captureStart(
      agent.cwd,
      AbortSignal.any([signal, lifetime.signal, cancel.signal]),
    );
    captures.set(agent.id, { turnId, cancel, baseline });
    previews.set(agent.id, { kind: "running" });
    notify(agent.id);
    await Promise.all([baseline, cleanup]);
  });

  server.addHook("agent.turn.after", async (event, { signal }) => {
    const { agent, turnId } = event;
    if (!agent.workspaceId || agent.background) return;
    if (Reflect.get(event, "captureOwner") === "core") {
      notify(agent.id);
      return;
    }
    const pending = captures.get(agent.id);
    if (!pending || pending.turnId !== turnId) {
      if (!pending && !previews.has(agent.id)) {
        previews.set(agent.id, { kind: "unavailable" });
        notify(agent.id);
      }
      return;
    }
    if (pending.settlement) return;
    pending.settlement = (async (): Promise<ChangeState> => {
      const boundary = await pending.baseline;
      if (!boundary) return { kind: "unavailable" };
      const { space, before } = boundary;
      const captureSignal = AbortSignal.any([signal, lifetime.signal, pending.cancel.signal]);
      try {
        const after = await capture(space, captureSignal);
        return await readComparison(space.root, before, after, captureSignal, space.env);
      } catch {
        return { kind: "unavailable" };
      } finally {
        await space.dispose();
      }
    })();
    const state = await pending.settlement;
    if (captures.get(agent.id) === pending) {
      captures.delete(agent.id);
      previews.set(agent.id, state);
      notify(agent.id);
    }
  });

  server.addHook("agent.archive.after", async ({ agent }) => {
    previews.delete(agent.id);
    await forgetCapture(agent.id);
    notify(agent.id);
  });

  server.addHook("agent.close.after", async ({ agent }) => {
    if (previews.get(agent.id)?.kind !== "running") return;
    previews.delete(agent.id);
    await forgetCapture(agent.id);
    notify(agent.id);
  });

  server.handle(watchChanges, async ({ agentId, workspaceId }, { paseo, push, signal }) => {
    const watchSignal = AbortSignal.any([signal, lifetime.signal]);
    const events = on(updates, agentId, { signal: watchSignal });
    const agentHandle = paseo.agents.ref(agentId);
    let cached: { key: string; state: ChangeState } | undefined;

    async function publish() {
      const { agent } = (await agentHandle.refresh()) ?? {};
      if (!agent || agent.workspaceId !== workspaceId || agent.archivedAt || agent.background) {
        await push({ timing: "approximate", state: { kind: "unavailable" } });
        return;
      }
      const comparison = Reflect.get(agent, "latestTurnChanges");
      if (comparison === undefined) {
        await push({
          timing: "approximate",
          state: previews.get(agentId) ?? {
            kind: agent.status === "running" ? "running" : "unavailable",
          },
        });
        return;
      }
      const pair = coreComparison.safeParse(comparison);
      if (agent.status === "running" || !pair.success) {
        await push({
          timing: "core",
          state: { kind: agent.status === "running" ? "running" : "unavailable" },
        });
        return;
      }
      const { turnId, before, after } = pair.data;
      const key = JSON.stringify([agent.cwd, turnId, before, after]);
      if (cached?.key !== key) {
        cached = { key, state: await readComparison(agent.cwd, before, after, watchSignal) };
      }
      await push({ timing: "core", state: cached.state });
    }

    try {
      await publish();
      for await (const _update of events) {
        await publish();
      }
    } catch (error) {
      if (!watchSignal.aborted) throw error;
    } finally {
      await events.return?.();
    }
  });

  return async () => {
    lifetime.abort();
    await Promise.all([...captures.keys()].map(forgetCapture));
    previews.clear();
  };
}
