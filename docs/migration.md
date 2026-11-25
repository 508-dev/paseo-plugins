# Source migration and existing submissions

The collection preserves all eight runtime IDs, npm package names, versions, lockfiles, requirements, storage paths, licenses, and attribution. Each plugin's source snapshot is pinned in `plugins.json`. Only repository/install documentation, package repository metadata, missing listing overviews, and explicit local lint configuration change during import. Original repositories remain available and installable; they are not archived or stripped of code.

## Published registry entries

| Existing registry ID          | Published source                                    | Collection directory          |
| ----------------------------- | --------------------------------------------------- | ----------------------------- |
| `508-dev/action-inbox`        | `508-dev/paseo-action-inbox`                        | `plugins/action-inbox`        |
| `508-dev/agent-context`       | `508-dev/paseo-agent-context`                       | `plugins/agent-context`       |
| `508-dev/issue-workflow`      | `508-dev/paseo-issue-workflow`                      | `plugins/issue-workflow`      |
| `508-dev/project-environment` | `508-dev/paseo-plugins:plugins/project-environment` | `plugins/project-environment` |

Propose changes to the existing records with the collection remote `https://github.com/508-dev/paseo-plugins.git`, a full reviewed commit, and the matching `pluginPath`. Project environment already uses the collection source. See its [approved registry review](https://github.com/getpaseo/plugins/pull/2416).

The [registry protocol](https://github.com/getpaseo/plugins/blob/main/PROTOCOL.md#updates) rejects an automatic update if its npm package, Git remote, or plugin path changes. Existing installations keep running from their recorded artifact. Accepting a new source requires explicit reinstall approval. Account for managed settings and plugin-owned files before switching an installation. Keep the old repositories available for users who stay on the original artifact.

## npm and direct Git installations

Keep npm package names. Published npm tarballs are immutable; this migration does not publish replacement versions. Updated package repository metadata includes the collection URL and directory for future releases. Existing npm versions and their old repository links remain available.

Direct Git installations still point at the old repositories. A README redirect does not switch those installations or publish code updates to them. New installations can select the collection subdirectory. Future releases must state which source they target; port needed fixes to supported old sources until their users migrate.

Historical issues and open code/security PRs remain in the original repositories. Do not close them as a side effect of consolidation. Registry approval remains with the registry maintainers; the collection does not publish or approve new listings automatically.
