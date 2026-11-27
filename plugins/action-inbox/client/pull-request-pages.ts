import type { InboxPullRequest } from "../shared/pull-requests";

type PullRequestPage = {
  pullRequests: InboxPullRequest[];
  errors: string[];
  nextCursor: string | null;
};

export type PullRequestPages = ReadonlyMap<string | undefined, PullRequestPage>;

export function replacePullRequestPage(
  pages: PullRequestPages,
  cursor: string | undefined,
  page: PullRequestPage,
): PullRequestPages {
  const next = cursor === undefined ? new Map() : new Map(pages);
  return next.set(cursor, page);
}

export function collectPullRequestPages(pages: PullRequestPages) {
  const rows = new Map<string, InboxPullRequest>();
  const skipped = new Set<string>();
  let cursor: string | null = null;

  for (const page of pages.values()) {
    for (const pr of page.pullRequests) {
      const key = pr.url.toLowerCase();
      const previous = rows.get(key);
      const targets = new Map(previous?.targets.map((target) => [target.workspaceId, target]));
      for (const target of pr.targets) targets.set(target.workspaceId, target);
      rows.set(key, { ...pr, targets: [...targets.values()] });
    }
    for (const workspace of page.errors) skipped.add(workspace);
    cursor = page.nextCursor;
  }

  return { rows: [...rows.values()], skipped: [...skipped], cursor };
}

export function updatePagedPullRequests(
  pages: PullRequestPages,
  update: (row: InboxPullRequest) => InboxPullRequest,
): PullRequestPages {
  return new Map(
    [...pages].map(([cursor, page]) => [
      cursor,
      { ...page, pullRequests: page.pullRequests.map(update) },
    ]),
  );
}
