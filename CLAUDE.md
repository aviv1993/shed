# shed

macOS Dev Disk Usage TUI — shows disk usage for dev tools and lets you clean them up.

## Tech Stack
- TypeScript + Node.js
- pnpm as package manager
- `@mariozechner/pi-tui` for the interactive TUI
- `chalk` for colors, `commander` for CLI parsing
- `vitest` for testing

## Commands
- `pnpm dev` — run the TUI (via tsx)
- `pnpm build` — compile TypeScript to `dist/`
- `pnpm test` — run tests
- `pnpm test:watch` — run tests in watch mode
- `pnpm typecheck` — check types (`tsc --noEmit`)
- After changes: `pnpm build && npm link` to update the global `shed` command

## Architecture
- `src/collectors/` — data collectors (brew, npm, docker, apps, xcode, dev-caches, node-modules, git-repos). Each exports a `collect*()` async function and data types.
- `src/config.ts` — loads/saves user config from `~/.config/shed/config.json` (git scan paths + depth)
- `src/linker.ts` — scans ~/projects to map packages → projects where they're used
- `src/cleanup.ts` — cleanup actions (brew cleanup, npm cache clean, etc.) with size estimation and per-action warnings
- `src/cache.ts` — caches scan results to `~/.cache/shed/last-scan.json` for instant loading
- `src/tui/` — TUI components using pi-tui's Component interface
- `src/tui/app.ts` — main TUI host (`ShedApp`) with sidebar + content pane, focus management
- `src/tui/settings-view.ts` — settings view for configuring git scan paths and depth levels
- `src/tui/spinner.ts` — braille spinner animation + elapsed time formatting
- `src/__tests__/` — vitest tests with mocked fs/child_process
- ESM project (`"type": "module"`) — use `import`, not `require`

## Key Patterns
- pi-tui Component interface: `render(width): string[]`, `handleInput(data)`, `invalidate()`
- Container only stacks vertically — `horizontal-split.ts` is a custom side-by-side layout
- Kitty keyboard protocol: `addInputListener` receives raw key events including releases — must filter with `isKeyRelease()`
- Views use `ViewState` discriminated union for state machines (list → confirm → deleting → done)
- `focused` boolean on views controls whether selected item shows cyan or dim highlight
- All collectors run via `Promise.all` with `settle()` helper for graceful degradation
- Views with async operations use `onRequestRender?.()` callback to trigger re-renders
- Deletion shows animated braille spinner with elapsed time via `setInterval`
- `collectAll` reports progress via callback for dashboard progress bar; accepts optional `ShedConfig`
- Dashboard rows are selectable — Enter/→ navigates to the corresponding screen via `sidebar.selectTab()`
- Keybinding convention: →/Enter opens detail/expand, ←/Esc goes back, Enter/Del triggers delete on items
- `q` quits from anywhere; views with text-input modes expose `consumesInput()` to capture q/Esc
- Node modules: → expands packages, Enter triggers delete confirmation
- Git repos track `nodeModulesSizeBytes` and `linkedDockerImages` (cross-referenced from docker collector)
- Docker↔git linking: `index.ts` matches docker `linkedProjectPaths` (full path) and `linkedProjects` (basename) to git repos
- Docker links images to projects via: (1) container bind mounts, (2) compose labels, (3) compose file image references
- Pulled images (no compose labels) are linked by reading `docker-compose.yml` from known compose working dirs
- Cache cleanups have a confirm step showing per-action `warning` before running
- Context-aware footer bar: each view exposes `getFooterHint()` for key hints
- Settings persist to `~/.config/shed/config.json`; changes trigger data refresh
