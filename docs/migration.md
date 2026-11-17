# Source migration and existing submissions

The collection preserves all eight runtime IDs, npm package names, versions, lockfiles, requirements, storage paths, licenses, and attribution. Each plugin's source snapshot is pinned in `plugins.json`. Only repository/install documentation, package repository metadata, missing listing overviews, and explicit local lint configuration change during import. Original repositories remain available and installable; they are not archived or stripped of code.

## Published registry entries

| Existing registry ID     | Current source                 | Disposition                              |
| ------------------------ | ------------------------------ | ---------------------------------------- |
| `508-dev/action-inbox`   | `508-dev/paseo-action-inbox`   | Keep the approved artifact pin unchanged |
| `508-dev/agent-context`  | `508-dev/paseo-agent-context`  | Keep the approved artifact pin unchanged |
| `508-dev/issue-workflow` | `508-dev/paseo-issue-workflow` | Keep the approved artifact pin unchanged |

Do not submit duplicate registry IDs to represent the collection move. A future reviewed update can move an existing record to `https://github.com/508-dev/paseo-plugins.git` with the matching `plugins/<slug>` path.

The [registry protocol](https://github.com/getpaseo/plugins/blob/main/PROTOCOL.md#updates) rejects an automatic update if its npm package, Git remote, or pluginPath changes. Existing installations keep working at the approved old pin, but accepting the new source requires explicit reinstall approval. Keep old pins until a settings-preserving migration is available and documented. Do not tell users to remove a plugin without first accounting for its managed settings and plugin-owned files.

## Pending Project environment submission

Continue [submission #2415](https://github.com/getpaseo/plugins/issues/2415) and [review #2416](https://github.com/getpaseo/plugins/pull/2416). Provide the collection's full commit and `plugins/project-environment` path in that review, together with raw interface-image URLs at the same commit. This plugin is not listed yet, so moving its proposed source does not change an existing registry install.

The collected source is newer than the submitted 0.1.1 artifact: it includes metadata-only cross-project search, explicit Reveal/Copy, and inline variable management. Request review of the new source rather than treating it as an image-only change. Captures render the actual React Native components against an isolated daemon with synthetic variables; they use a browser preview harness and do not claim full desktop-shell or physical-device QA.

## npm and direct Git installations

Keep npm package names. Published npm tarballs are immutable; this migration does not publish replacement versions. Updated package repository metadata includes the collection URL and directory for future releases. Existing npm versions and their old repository links remain available.

Direct Git installations still point at the old repositories. A README redirect does not switch those installations or publish code updates to them. New installations can select the collection subdirectory. Future releases must state which source they target; port needed fixes to supported old sources until their users migrate.

Historical issues and open code/security PRs remain in the original repositories. Do not close them as a side effect of consolidation. Registry approval remains with the registry maintainers; the collection does not publish or approve new listings automatically.
