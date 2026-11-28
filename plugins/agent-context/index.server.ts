import type { PluginServerContext } from "@getpaseo/plugin/server";
import { searchAgentTranscripts, searchTranscriptExcerpts } from "./server/agent-context";
import { searchAgentTranscriptsRpc, searchTranscriptExcerptsRpc } from "./shared/agent-context";

export default function contribute(server: PluginServerContext) {
  server.handle(searchAgentTranscriptsRpc, searchAgentTranscripts);
  server.handle(searchTranscriptExcerptsRpc, searchTranscriptExcerpts);
  return () => {};
}
