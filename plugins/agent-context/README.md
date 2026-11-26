# Agent Context for Paseo

A [Paseo](https://paseo.sh) plugin by [508.dev](https://508.dev) that attaches a bounded snapshot of an existing agent's conversation to a new prompt.

## Install

Requires Paseo 0.13.0 or newer with plugins enabled. Plugins are trusted, unsandboxed code: review this repository and its updates before installing.

```sh
paseo plugin add git:508-dev/paseo-plugins:plugins/agent-context
```

The source appears under the composer's `+` attachment menu. Paseo clients that support the New Agent shortcut also show **Attach agent transcript** next to **Import Session**. Opening the picker shows up to five recent agents; type to search by title, workspace, project, directory, provider, or ID. Select a result to attach its snapshot as a removable pill. The draft keeps the selected text after the source changes or disconnects.

The plugin runs on the daemon that owns the source agents and searches that host only. Install it on each host whose agents you want to attach. It does not copy code, files, branches, terminals, permissions, or provider-native session state.

## Snapshot and privacy

The plugin reads retained agent timelines and produces snapshots **when the picker searches**, not at prompt submission. Selecting a result attaches the snapshot returned by that search. The response carries snapshot text to the Paseo app, which stores it with the draft and later sends it to the destination daemon as a prompt attachment. Do not use it for material you would not send to a model or store in a local draft.

Paseo 0.13.0 accepts the snapshot as an ordinary text attachment through the `+` menu. The New Agent shortcut and dedicated `chat_history` ordering require a newer client that supports `newAgentShortcut` and `contextKind`. The plugin declares both fields now; older clients ignore them while retaining basic attachment behavior.

Snapshots include user and assistant messages and fixed tool-kind markers. They omit reasoning, raw tool inputs and outputs, provider tool names, and subagent logs. Each snapshot is capped at 128 KiB, keeps recent context when older context exceeds the cap, and marks omitted context in the text. Search scans up to 1,000 agents and reads at most 5,000 timeline items per candidate result. Inactive retained sessions may be hydrated while reading their timelines; no new agent turn starts.

Only non-archived top-level Paseo agents are listed. The generic attachment flow owns draft persistence, duplicate handling, preview, and removal. Removing a pill detaches it from the draft; it does not delete the source agent.

## Search what was said

In an existing agent, open **Search agent transcripts** from the Command Center. Choose a source with the screen’s host picker and press **Search** to fetch matching excerpts into the app. Search checks the latest 100 projected timeline entries of up to 20 recent eligible agents on that host. It ignores reasoning and tool calls. Each result previews the latest literal match and nearby user or assistant messages.

Choose **Attach to …** to stage the displayed excerpt in the agent that opened the screen. The source host is included in the text. The destination receives it when you send the draft. Install the plugin on both participating hosts to use this route across hosts. Direct attachment from the preview uses the composer API available in Paseo 0.16 and later. Use **Copy excerpt** on earlier clients that support plugin screens, or use the original **+** picker for same-host snapshots.

## Develop

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm test
npm pack --dry-run
```

This plugin uses only host-provided runtime libraries and has no installation preparation command. `@getpaseo/plugin`, `zod`, and test tooling are development dependencies only. The lockfile uses npm's legacy peer resolution because npm 10's peer resolver fails on the SDK's optional Vitest peer graph.

Licensed under Apache-2.0. The transcript source originated as the [Paseo agent-context example](https://github.com/getpaseo/paseo/tree/main/plugin-examples/agent-context); changes in this repository are distributed under the same license.

The existing `508-dev/agent-context` registry listing continues to use its approved source in the original repository.
