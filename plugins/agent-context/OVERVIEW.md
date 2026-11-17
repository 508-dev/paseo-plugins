Attach a bounded snapshot of another Paseo agent's conversation to a prompt. Choose the agent transcript source from the composer's attachment menu, search agents on the selected host, and select a result. Clients supporting the New Agent shortcut also offer Attach agent transcript there.

Snapshots contain user and assistant text and fixed tool-kind markers. They omit reasoning and raw tool inputs/outputs, retain recent context within a 128 KiB cap, and mark omitted context. The snapshot is captured during picker search, stored with the app's draft, and sent as a prompt attachment to the destination agent. Use it only for material you intend to send to that agent and its model provider.

Requires Paseo 0.9 or later. Search lists non-archived top-level agents on the selected host. It does not transfer files, branches, terminals, permissions, or provider session state.
