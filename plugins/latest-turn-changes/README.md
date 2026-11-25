# Latest turn changes

Prototype for [Paseo discussion #4204](https://github.com/getpaseo/paseo/discussions/4204). Requires Paseo 0.17.0-beta.1 or later and Git on the daemon.

Install the directory into a demo daemon, then open an agent’s Command Center and choose **Open latest turn changes**.

```sh
paseo --host 127.0.0.1:6768 plugin add /absolute/path/to/plugins/latest-turn-changes
```

The stock preview keeps one result per agent in memory. It captures at asynchronous notifications, so fast edits or a fast follow-up can cross its boundaries. The plugin labels this **Approximate timing**. When the daemon supplies core capture, the panel reads the core comparison from the agent snapshot. Only the settled comparison is shown. This is a worktree comparison and can include concurrent edits from other sources.
