# Variable management browser checks

These captures use synthetic variables on an isolated Paseo 0.15.3 daemon. The browser preview renders the plugin's React Native components through React Native Web and forwards requests to real plugin RPCs. Native iOS and Android rendering and the full desktop shell are outside this browser check.

## Project defaults and workspace overrides

Browser checks covered adding and revealing a workspace override, confirming that a sibling worktree still sees the project default, finding both entries by name, and removing the override while keeping the default. A search for the synthetic value returned no results. The compact light layout fit the viewport without horizontal overflow.

- [Project defaults, desktop dark](project-defaults-desktop.png)
- [Workspace override saved, compact light](workspace-override-compact.png)
- [Project and workspace results, desktop dark](scoped-search-desktop.png)

## Inline editing and search

Earlier browser checks covered replacing a value inside its card, saving and canceling deletion, revealing and copying the updated value, and filtering across projects.

- [Inline replacement, desktop dark](replacement-desktop.png)
- [Compact removal confirmation, desktop dark](remove-desktop.png)
- [Inline replacement, compact light](replacement-mobile.png)
- [Cross-project search, desktop dark](search-desktop.png)
