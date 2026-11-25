import { messages } from "./client/messages";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AssociationPanel } from "./client/association-panel";
import { IssueField } from "./client/issue-field";
import { defineAttachmentSource } from "@getpaseo/plugin";
import { searchIssuesRpc } from "./shared/issues";

export default function contribute(client: PluginClientContext) {
  client.addNewWorkspaceItem({ id: "github-issue", Component: IssueField });
  client.addAttachmentSource(
    defineAttachmentSource({
      id: "github-issues",
      title: messages.message("issue"),
      icon: "CircleDot",
      pickerTitle: messages.message("attachIssue"),
      searchPlaceholder: messages.message("searchIssues"),
      search: searchIssuesRpc,
    }),
  );
  client.addWorkspacePanel({
    id: "github-issue",
    title: messages.message("issue"),
    icon: "CircleDot",
    Component: AssociationPanel,
  });
  client.addCommandCenterItem({
    id: "open-github-issue",
    title: messages.message("openIssue"),
    icon: "CircleDot",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("github-issue");
    },
  });
  return () => {};
}
