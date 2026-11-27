import { expect, it } from "vitest";
import type { InboxPullRequest } from "../shared/pull-requests";
import {
  collectPullRequestPages,
  replacePullRequestPage,
  type PullRequestPages,
} from "./pull-request-pages";

function pr(number: number, workspaceId: string): InboxPullRequest {
  return {
    number,
    repository: "example/app",
    url: `https://github.com/example/app/pull/${number}`,
    title: `PR ${number}`,
    status: "open",
    issues: ["failedChecks"],
    watches: [],
    targets: [{ workspaceId, workspaceName: workspaceId, expectedBranch: workspaceId }],
  };
}

it("replaces the cached load-more page while keeping contributions from other pages", () => {
  const rootOnly = pr(1, "root");
  const rootShared = pr(2, "root");
  const cachedShared = pr(2, "cached");
  const cachedOnly = pr(3, "cached");
  const refreshedOnly = pr(4, "fresh");
  let pages: PullRequestPages = replacePullRequestPage(new Map(), undefined, {
    pullRequests: [rootOnly, rootShared],
    errors: ["root error"],
    nextCursor: "page-two",
  });
  pages = replacePullRequestPage(pages, "page-two", {
    pullRequests: [cachedShared, cachedOnly],
    errors: ["cached error"],
    nextCursor: "cached-next",
  });
  expect(collectPullRequestPages(pages).rows).toEqual([
    rootOnly,
    { ...rootShared, targets: [...rootShared.targets, ...cachedShared.targets] },
    cachedOnly,
  ]);

  pages = replacePullRequestPage(pages, "page-two", {
    pullRequests: [refreshedOnly],
    errors: [],
    nextCursor: null,
  });
  expect(collectPullRequestPages(pages)).toEqual({
    rows: [rootOnly, rootShared, refreshedOnly],
    skipped: ["root error"],
    cursor: null,
  });
});
