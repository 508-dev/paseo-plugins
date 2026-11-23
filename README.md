# 508-dev Paseo plugins

Paseo plugins maintained by [508.dev](https://508.dev). Each plugin is installed separately from its directory under `plugins/`.

| Plugin                                             | What it does                                                      | Paseo requirement        |
| -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| [Project environment](plugins/project-environment) | Search project variables and use current values in agent commands | >=0.13.2                 |
| [Agent context](plugins/agent-context)             | Attach a bounded snapshot of another agent's conversation         | >=0.13.0                 |
| [PR watcher](plugins/pr-watcher)                   | Follow GitHub checks/reviews and wake the associated agent        | >=0.16.0-beta.1, <0.17.0 |
| [GitHub issue workflow](plugins/issue-workflow)    | Start workspaces from GitHub issues                               | >=0.16.0-beta.1          |
| [Action inbox](plugins/action-inbox)               | Find agent requests and review-ready work across hosts            | >=0.16.0-beta.1          |
| [Remote browser](plugins/remote-browser)           | Control a host browser or forward a local dev site                | >=0.16.0-beta.1          |
| [Replies](plugins/replies)                         | Suggest replies you can edit before sending                       | >=0.16.0-beta.2          |
| [Worktree include](plugins/worktreeinclude)        | Copy or symlink gitignored files into new worktrees               | >=0.10.3                 |

## Install

Enable plugins in Paseo Settings on the target host, then choose a plugin:

```sh
paseo plugin add git:508-dev/paseo-plugins:plugins/project-environment
paseo plugin add git:508-dev/paseo-plugins:plugins/agent-context
paseo plugin add git:508-dev/paseo-plugins:plugins/pr-watcher
paseo plugin add git:508-dev/paseo-plugins:plugins/issue-workflow
paseo plugin add git:508-dev/paseo-plugins:plugins/action-inbox
paseo plugin add git:508-dev/paseo-plugins:plugins/remote-browser
paseo plugin add git:508-dev/paseo-plugins:plugins/replies
paseo plugin add git:508-dev/paseo-plugins:plugins/worktreeinclude
```

Read the selected plugin's README for setup, platform support, and data access. Some require beta SDK features on both the host and app. A collection checkout does not install every plugin.

## Languages

Plugin interfaces follow the Paseo app language and fall back to English. This collection bundles Simplified Chinese, Spanish, Japanese, Korean, and Traditional Chinese (Taiwan). Traditional Chinese requires a Paseo client that exposes `zh-TW` as an app language. Registry listings include Simplified Chinese overviews.

## Existing installations and registry listings

Existing installations keep their recorded source. The old repositories remain installable, and the published registry IDs stay `508-dev/action-inbox`, `508-dev/agent-context`, and `508-dev/issue-workflow`. Their approved pins have not been changed by this source move.

Paseo requires a reinstall to approve a different artifact remote or plugin path, and plugin removal can delete managed settings. Keep an existing installation while migrating source development. See [migration and submission status](docs/migration.md) before switching sources.

## Development

Each plugin retains its own package.json, committed lockfile, SDK version, and checks. Install its dependencies independently:

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm ci --prefix plugins/project-environment --ignore-scripts --legacy-peer-deps
paseo-resources job -- npm run typecheck -- project-environment
paseo-resources job -- npm run lint -- project-environment
npm run validate
npm run format
```

On this shared Linux host, also wrap dependency installs and targeted tests in `paseo-resources job --`. Elsewhere, run the same npm commands directly. Collection CI checks plugins independently with at most two plugin jobs in parallel. SDK versions are not hoisted or upgraded together by this migration.

[plugins.json](plugins.json) records each imported source commit, package name, runtime ID, and compatibility range. The original repositories retain earlier Git history. Per-plugin license files and attribution remain in their directories; this collection introduces no umbrella license. `paseohub` and `paseo-agent-orchestration` remain separate projects.
