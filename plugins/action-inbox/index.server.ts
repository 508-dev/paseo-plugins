import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listPullRequests, pullRequestAction } from "./shared/pull-requests";
import { callPrWatcher } from "./server/pull-requests";

export default function contribute(server: PluginServerContext) {
  server.handle(listPullRequests, (input) =>
    callPrWatcher({ operation: "list", ...input }, listPullRequests.output),
  );
  server.handle(pullRequestAction, (input) => callPrWatcher(input, pullRequestAction.output));
  return () => {};
}
