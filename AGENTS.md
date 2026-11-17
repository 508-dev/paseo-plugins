# 508-dev Paseo plugins

Each directory under `plugins/` is an independent Paseo plugin. Work from that plugin's directory when installing or checking its dependencies. Keep its package name, runtime plugin ID, storage paths, SDK compatibility range, lockfile, license, and attribution intact unless the task explicitly changes them.

There are no npm workspaces. SDK versions differ between plugins, and Git installs prepare only the selected directory. Do not rely on root dependencies or another plugin's node_modules. Runtime imports must remain inside the plugin's client/server/shared boundaries or use host-provided modules. The runtime compiler resolves type-only imports too; production-only installation must work when a manifest uses `--omit=dev`.

Inspect package scripts and install hooks before executing them. Prefer locked installs with lifecycle scripts disabled. On the shared Linux host, run installs, typechecks, builds, and tests through `paseo-resources job -- <command>`. Do not run broad local test suites; target the changed test files and use CI for collection-wide tests. Never restart the main Paseo daemon.

Run relevant typecheck and lint scripts after changes and `npm run format` before committing. Root formatting covers collection files and plugin metadata/docs; use a plugin's own formatter for its implementation. Stage only task-owned files. Keep credentials, .env files, caches, local settings, and agent data out of commits.

Published registry pins and installed sources are independent of this repository layout. Follow [docs/migration.md](docs/migration.md) before changing a listing's artifact remote or pluginPath. Keep the original repositories installable during migration, and do not remove/reinstall a user's plugin as a source-migration shortcut.
