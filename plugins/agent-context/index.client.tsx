import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createDestinationRegistration } from "./client/destination";
import { TranscriptSearch } from "./client/transcript-search";
import { agentTranscriptAttachments, searchTranscriptExcerptsRpc } from "./shared/agent-context";

const screenId = "transcript-search";

export default function contribute(client: PluginClientContext) {
  const removeSource = client.addAttachmentSource(agentTranscriptAttachments);
  if (typeof client.addScreen !== "function") return removeSource;

  const destination = createDestinationRegistration();
  const removeScreen = client.addScreen({
    id: screenId,
    title: "Search agent transcripts",
    Component: (props) => (
      <TranscriptSearch
        key={JSON.stringify([props.host.id, props.params.destination])}
        {...props}
        search={(query) => client.rpc(searchTranscriptExcerptsRpc, { query })}
      />
    ),
  });
  const removeCommand = client.addCommandCenterItem({
    id: screenId,
    title: "Search agent transcripts",
    icon: "TextSearch",
    context: "agent",
    onSelect({ agent, openScreen, composers }) {
      const key = destination.set({
        title: agent.title ?? "the destination agent",
        composer:
          typeof composers === "function" ? () => composers({ agentId: agent.id })[0] : undefined,
      });
      openScreen({ screenId, params: { destination: key } });
    },
  });

  return () => {
    destination.clear();
    removeCommand();
    removeScreen();
    removeSource();
  };
}
