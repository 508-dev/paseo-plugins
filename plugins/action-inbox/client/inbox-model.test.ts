import type { PaseoAgent, PaseoAgentHandle } from "@getpaseo/client";
import { describe, expect, it, vi } from "vitest";
import { inboxPreferences } from "../shared/preferences";
import {
  cardsForAgent,
  directActions,
  filterCards,
  InboxResponseError,
  isUnread,
  markRead,
  questionPreview,
  respondToCard,
  sortCards,
  type InboxCard,
  type Permission,
} from "./inbox-model";
import { createInboxStore } from "./inbox-store";
import { createProgressStore, latestProgress, progressFromPage } from "./inbox-progress";
import { createApprovalStore } from "./inbox-approvals";

const location = {
  hostId: "host-a",
  hostLabel: "Laptop",
  projectName: "Paseo",
  projectKey: "paseo",
};

describe("latest progress previews", () => {
  const assistant = (text: string, turnId?: string) => ({
    turnId,
    item: { type: "assistant_message" as const, text },
  });
  const prompt = { item: { type: "user_message" as const, text: "Try again" } };

  it("omits list-prefixed fenced code and keeps ordinary list prose", () => {
    expect(latestProgress([assistant("- ```sh\nnpm test\n  ```\nTests passed.")])).toBe(
      "Tests passed.",
    );
    expect(latestProgress([assistant("1. ~~~sh\nnpm test\n   ~~~\n2. Tests passed.")])).toBe(
      "Tests passed.",
    );
    expect(latestProgress([assistant("- Updated the migration\nand verified the upgrade.")])).toBe(
      "Updated the migration and verified the upgrade.",
    );
  });

  it("retries unverified timeline pages and caches only a matching revision", async () => {
    const store = createProgressStore();
    const updatedAt = "2026-11-20T08:00:00Z";
    const entries = [assistant("Preview confirmed.")];
    const read = vi
      .fn()
      .mockResolvedValueOnce({ agent: { updatedAt: "2026-11-20T08:01:00Z" }, entries, error: null })
      .mockResolvedValueOnce({ agent: null, entries, error: null })
      .mockResolvedValueOnce({ agent: { updatedAt }, entries, error: null });
    const settled = vi.fn();
    store.subscribe("revision", async () => progressFromPage(await read(), updatedAt), settled);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(store.get("revision")).toBeNull();
    store.retryFailed();
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(2));
    expect(store.get("revision")).toBeNull();
    store.retryFailed();
    await vi.waitFor(() => expect(store.get("revision")).toBe("Preview confirmed."));
    store.retryFailed();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("takes the first substantive sentence of the newest useful message", () => {
    expect(
      latestProgress([
        prompt,
        assistant("I started the migration.", "new"),
        assistant(
          "## Update\nDone. **Migrated** [workspaces](https://example.com). Next, add tests.",
          "new",
        ),
        assistant("Sure.", "new"),
      ]),
    ).toBe("Migrated workspaces.");
  });

  it("omits stale previews across prompts and turn IDs, including a silent active turn", () => {
    const older = assistant("Previous run passed.", "old");
    expect(latestProgress([older, prompt])).toBeNull();
    expect(latestProgress([older, assistant("Done.", "new")])).toBeNull();
    expect(latestProgress([older], "new")).toBeNull();
    expect(latestProgress([older, assistant("Current work is blocked.", "new")], "new")).toBe(
      "Current work is blocked.",
    );
  });

  it.each([
    ["移行が完了しました。次にテストを追加します。", "移行が完了しました。"],
    ["测试通过！接下来发布。", "测试通过！"],
    ["測試通過了嗎？接下來會確認。", "測試通過了嗎？"],
    ["Updated to v1.2. Next, run tests.", "Updated to v1.2."],
  ])("selects the first sentence from %s", (message, expected) => {
    expect(latestProgress([assistant(message)])).toBe(expected);
  });

  it("joins wrapped sentences while keeping separate paragraphs, headings, and code blocks apart", () => {
    expect(
      latestProgress([
        assistant(
          "The migration is complete\nexcept for the production database.\n\nFollow-up is scheduled.",
        ),
      ]),
    ).toBe("The migration is complete except for the production database.");
    expect(
      latestProgress([assistant("Release notes\n-------------\n**Summary**\nTests passed.")]),
    ).toBe("Tests passed.");
    for (const separator of ["\n\n", "\n## Details\n", "\n```ts\nsecretCode()\n```\n"]) {
      expect(latestProgress([assistant(`A separate paragraph${separator}starts here.`)])).toBe(
        "A separate paragraph",
      );
    }
  });

  it("skips code and caps the excerpt at 120 characters without splitting emoji", () => {
    const text = "🚀".repeat(150);
    const excerpt = latestProgress([assistant(`\`\`\`sh\nnpm run test\n\`\`\`\n${text}`)]);
    expect(excerpt).toBe(`${"🚀".repeat(119)}…`);
  });

  it("shares in-flight loads and cached excerpts for an unchanged agent revision", async () => {
    const store = createProgressStore();
    const load = vi.fn(async () => "Updated tests.");
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = store.subscribe("same revision", load, first);
    store.subscribe("same revision", load, second);
    unsubscribe();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(store.get("same revision")).toBe("Updated tests.");
    expect(store.get("new revision")).toBeNull();
  });

  it("limits parallel reads and drops queued work for unmounted rows", async () => {
    const store = createProgressStore();
    const resolves: ((value: string | null) => void)[] = [];
    const load = vi.fn(() => new Promise<string | null>((resolve) => resolves.push(resolve)));
    const noop = () => {};
    for (let index = 0; index < 4; index += 1) store.subscribe(String(index), load, noop);
    const dropped = store.subscribe("dropped", load, noop);
    const retained = vi.fn(async () => null);
    store.subscribe("retained", retained, noop);
    dropped();
    expect(load).toHaveBeenCalledTimes(4);
    expect(retained).not.toHaveBeenCalled();
    resolves[0](null);
    await Promise.resolve();
    expect(retained).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(4);
    resolves.slice(1).forEach((resolve) => resolve(null));
  });

  it("retries failed reads on refresh without reloading a successful empty preview", async () => {
    const store = createProgressStore();
    const failed = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce("Recovered preview.");
    const empty = vi.fn(async () => null);
    store.subscribe("failed", failed, () => {});
    store.subscribe("empty", empty, () => {});
    await Promise.resolve();
    expect(store.get("failed")).toBeNull();
    expect(failed).toHaveBeenCalledOnce();
    store.retryFailed();
    store.retryFailed();
    await Promise.resolve();
    expect(store.get("failed")).toBe("Recovered preview.");
    expect(failed).toHaveBeenCalledTimes(2);
    expect(empty).toHaveBeenCalledOnce();
  });

  it("retries a failed revision when a row returns", async () => {
    const store = createProgressStore();
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("Recovered preview.");
    const unsubscribe = store.subscribe("revision", load, () => {});
    await Promise.resolve();
    unsubscribe();
    store.retryFailed();
    expect(load).toHaveBeenCalledOnce();
    store.subscribe("revision", load, () => {});
    await Promise.resolve();
    expect(store.get("revision")).toBe("Recovered preview.");
  });
});

describe("approval state across row remounts", () => {
  it("blocks duplicate submissions and retains a failure for a replacement row", async () => {
    const store = createApprovalStore();
    let reject!: (error: Error) => void;
    const respond = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const operation = store.run("card-a", "accept", respond);
    store.prune(new Set());
    expect(store.getSnapshot().get("card-a")?.pending).toBe("accept");
    await store.run("card-a", "reject", respond);
    expect(respond).toHaveBeenCalledOnce();
    reject(new Error("Request changed"));
    await operation;
    store.prune(new Set(["card-a"]));
    expect(store.getSnapshot().get("card-a")).toEqual({
      pending: null,
      error: { detail: "Request changed" },
    });
    await store.run("card-a", "accept", async () => {
      throw new InboxResponseError("changedRequest", "Request changed");
    });
    expect(store.getSnapshot().get("card-a")).toEqual({
      pending: null,
      error: { key: "changedRequest" },
    });
    await store.run("card-a", "accept", async () => {});
    expect(store.getSnapshot().has("card-a")).toBe(false);
  });
});

function agent(overrides: Partial<PaseoAgent> = {}): PaseoAgent {
  return {
    id: "agent-a",
    provider: "codex",
    title: "Fix the app",
    workspaceId: "workspace-a",
    status: "idle",
    updatedAt: "2026-11-10T12:00:00Z",
    pendingPermissions: [],
    requiresAttention: false,
    attentionReason: null,
    ...overrides,
  } as PaseoAgent;
}

function permission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: "request-a",
    provider: "codex",
    name: "run_command",
    kind: "tool",
    title: "Run tests",
    input: { command: "npm test" },
    ...overrides,
  } as Permission;
}

describe("cross-host inbox classification", () => {
  it("shows individual questions and approvals before a generic attention item", () => {
    const cards = cardsForAgent(
      agent({
        requiresAttention: true,
        attentionReason: "permission",
        pendingPermissions: [permission(), permission({ id: "request-b", kind: "question" })],
      }),
      location,
    );
    expect(cards.map((card) => card.kind)).toEqual(["approval", "question"]);
    expect(cards.map((card) => card.key)).toEqual([
      "host-a:agent-a:request-a",
      "host-a:agent-a:request-b",
    ]);
  });

  it("includes completed and failed agents, but excludes archived and background work", () => {
    expect(
      cardsForAgent(agent({ requiresAttention: true, attentionReason: "finished" }), location)[0]
        ?.kind,
    ).toBe("review");
    expect(cardsForAgent(agent({ status: "error" }), location)[0]?.kind).toBe("failed");
    expect(
      cardsForAgent(agent({ requiresAttention: true, attentionReason: "permission" }), location)[0]
        ?.kind,
    ).toBe("attention");
    expect(cardsForAgent(agent({ archivedAt: "2026-11-10T12:01:00Z" }), location)).toEqual([]);
    expect(cardsForAgent(agent({ background: true }), location)).toEqual([]);
  });

  it("sorts decisions before failures and completed work", () => {
    const review = cardsForAgent(
      agent({ requiresAttention: true, attentionReason: "finished" }),
      location,
    );
    const failed = cardsForAgent(agent({ status: "error" }), location);
    const question = cardsForAgent(
      agent({ pendingPermissions: [permission({ kind: "question" })] }),
      location,
    );
    expect(sortCards([...review, ...failed, ...question]).map((card) => card.kind)).toEqual([
      "question",
      "failed",
      "review",
    ]);
  });
});

describe("direct permission actions", () => {
  it("rejects a request whose content changed after the user reviewed it", async () => {
    const original = permission();
    const card = cardsForAgent(agent({ pendingPermissions: [original] }), location)[0];
    const respondToPermission = vi.fn();
    await expect(
      respondToCard(
        card,
        directActions(original)[1],
        () =>
          ({
            refresh: async () => ({
              agent: agent({
                pendingPermissions: [permission({ input: { command: "different command" } })],
              }),
              project: null,
            }),
            respondToPermission,
          }) as Pick<PaseoAgentHandle, "refresh" | "respondToPermission">,
      ),
    ).rejects.toThrow("request changed");
    expect(respondToPermission).not.toHaveBeenCalled();
  });
  it("offers the same default tool decisions as Paseo's agent view", () => {
    expect(directActions(permission()).map(({ id, behavior }) => ({ id, behavior }))).toEqual([
      { id: "reject", behavior: "deny" },
      { id: "accept", behavior: "allow" },
    ]);
  });

  it("uses provider actions and keeps questions or lengthy requests in the native agent view", () => {
    expect(
      directActions(
        permission({ actions: [{ id: "once", label: "Allow once", behavior: "allow" }] }),
      ),
    ).toEqual([{ id: "once", label: "Allow once", behavior: "allow", variant: undefined }]);
    expect(directActions(permission({ kind: "question" }))).toEqual([]);
    expect(
      directActions(permission({ detail: { text: "x".repeat(5000) } as Permission["detail"] })),
    ).toEqual([]);
  });

  it("checks that a request is still pending before responding", async () => {
    const card = cardsForAgent(
      agent({ pendingPermissions: [permission()] }),
      location,
    )[0] as InboxCard;
    const respondToPermission = vi.fn(async () => {});
    const refresh = vi.fn(async () => ({
      agent: agent({ pendingPermissions: [] }),
      project: null,
    }));
    const getAgent = () =>
      ({ refresh, respondToPermission }) as Pick<
        PaseoAgentHandle,
        "refresh" | "respondToPermission"
      >;
    await expect(respondToCard(card, directActions(permission())[1], getAgent)).rejects.toThrow(
      "no longer pending",
    );
    expect(respondToPermission).not.toHaveBeenCalled();
  });

  it("sends the selected backend action after a fresh permission check", async () => {
    const request = permission({
      actions: [{ id: "once", label: "Allow once", behavior: "allow" }],
    });
    const card = cardsForAgent(agent({ pendingPermissions: [request] }), location)[0] as InboxCard;
    const respondToPermission = vi.fn(async () => {});
    const getAgent = () =>
      ({
        refresh: async () => ({ agent: agent({ pendingPermissions: [request] }), project: null }),
        respondToPermission,
      }) as Pick<PaseoAgentHandle, "refresh" | "respondToPermission">;
    await respondToCard(card, directActions(request)[0], getAgent);
    expect(respondToPermission).toHaveBeenCalledWith({
      requestId: "request-a",
      response: { behavior: "allow", selectedActionId: "once" },
    });
  });
});

describe("inbox read state and filters", () => {
  it("defaults to hiding failures for existing preferences and preserves read markers", () => {
    const readTokens = { "existing-card": "existing-token" };
    expect(inboxPreferences.schema.parse({ readTokens })).toEqual({
      readTokens,
      showFailures: false,
    });
    expect(inboxPreferences.schema.parse({ readTokens, showFailures: true })).toEqual({
      readTokens,
      showFailures: true,
    });
  });

  it("keeps an approval read across refreshes and saved-state reloads, but marks changed content unread", () => {
    const original = cardsForAgent(agent({ pendingPermissions: [permission()] }), location)[0];
    expect(isUnread(original, {})).toBe(true);
    const saved = JSON.parse(JSON.stringify(markRead({}, [original])));
    const refreshed = { ...original, updatedAt: "2026-11-10T13:00:00Z" };
    expect(isUnread(refreshed, saved)).toBe(false);
    const changed = {
      ...refreshed,
      permission: permission({ input: { command: "npm run build" } }),
    };
    expect(isUnread(changed, saved)).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("npm test");
  });

  it("treats a later completion as unread without removing a read item from the inbox", () => {
    const card = cardsForAgent(
      agent({
        requiresAttention: true,
        attentionReason: "finished",
        attentionTimestamp: "2026-11-10T12:00:00Z",
      }),
      location,
    )[0];
    const saved = markRead({}, [card]);
    expect(
      filterCards([card], { hostId: null, projectKey: null, unreadOnly: false }, saved),
    ).toHaveLength(1);
    expect(
      filterCards([card], { hostId: null, projectKey: null, unreadOnly: true }, saved),
    ).toEqual([]);
    expect(isUnread({ ...card, updatedAt: "2026-11-10T13:00:00Z" }, saved)).toBe(true);
  });

  it("combines host, project and unread filters without merging identically named projects", () => {
    const a = cardsForAgent(agent({ status: "error" }), location)[0];
    const b = cardsForAgent(agent({ status: "error" }), { ...location, hostId: "host-b" })[0];
    expect(a.projectKey).not.toBe(b.projectKey);
    const filters = {
      hostId: "host-a",
      projectKey: a.projectKey,
      unreadOnly: true,
      showFailures: true,
    };
    const visible = filterCards([a, b], filters, {});
    expect(visible).toEqual([a]);
    const saved = markRead({}, visible);
    expect(isUnread(a, saved)).toBe(false);
    expect(isUnread(b, saved)).toBe(true);
  });

  it("keeps hidden failures unread when marking the inbox read", () => {
    const review = cardsForAgent(
      agent({ requiresAttention: true, attentionReason: "finished" }),
      location,
    )[0];
    const unreadFailure = cardsForAgent(agent({ status: "error" }), location)[0];
    const readFailure = cardsForAgent(agent({ id: "agent-b", status: "error" }), location)[0];
    const cards = [review, unreadFailure, readFailure];
    const read = markRead({}, [readFailure]);
    const visible = filterCards(cards, {}, read);
    expect(visible).toEqual([review]);

    const afterBulkRead = markRead(read, visible);
    expect(filterCards(cards, { unreadOnly: true }, afterBulkRead)).toEqual([]);
    expect(filterCards(cards, { showFailures: true }, afterBulkRead)).toEqual(cards);
    expect(filterCards(cards, { showFailures: true, unreadOnly: true }, afterBulkRead)).toEqual([
      unreadFailure,
    ]);
  });

  it("reads question text and choices without leaking metadata into the preview", () => {
    expect(
      questionPreview(
        permission({
          kind: "question",
          metadata: { internal: "hidden" },
          input: {
            questions: [
              {
                question: "Which layout?",
                header: "Layout",
                options: [{ label: "Compact", description: "More rows" }, { label: "Roomy" }],
                multiSelect: false,
              },
            ],
          },
        }),
      ),
    ).toEqual([
      {
        question: "Which layout?",
        options: [
          { label: "Compact", description: "More rows" },
          { label: "Roomy", description: undefined },
        ],
        multiSelect: false,
      },
    ]);
    expect(
      questionPreview(
        permission({ kind: "question", input: { questions: [null, { unexpected: true }] } }),
      ),
    ).toEqual([]);
  });
});

describe("shared inbox observation", () => {
  const hosts = [{ serverId: "host-a", label: "Laptop", status: "online" as const }];

  it("shares one polling loop between sidebar and screen and stops when both unmount", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => ({ cards: [], truncated: false }));
      const store = createInboxStore(load);
      const sidebar = store.retain(hosts);
      const screen = store.retain(hosts);
      await store.refresh();
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(2);
      sidebar();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(3);
      screen();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards a pending host response after that host disconnects", async () => {
    let resolve!: (result: { cards: InboxCard[]; truncated: boolean }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ cards: InboxCard[]; truncated: boolean }>((done) => {
          resolve = done;
        }),
    );
    const store = createInboxStore(load);
    const first = store.retain(hosts);
    const second = store.retain([{ ...hosts[0], status: "offline" }]);
    await store.refresh();
    resolve({ cards: cardsForAgent(agent({ status: "error" }), location), truncated: false });
    await Promise.resolve();
    expect(store.getSnapshot().cards).toEqual([]);
    first();
    second();
  });

  it("a forced refresh after an action supersedes an older pending read", async () => {
    const resolvers: ((result: { cards: InboxCard[]; truncated: boolean }) => void)[] = [];
    const store = createInboxStore(() => new Promise((resolve) => resolvers.push(resolve)));
    const release = store.retain(hosts);
    const newest = store.refresh(true);
    resolvers[1]({ cards: [], truncated: false });
    await newest;
    resolvers[0]({ cards: cardsForAgent(agent({ status: "error" }), location), truncated: false });
    await Promise.resolve();
    expect(store.getSnapshot().cards).toEqual([]);
    release();
  });
});
