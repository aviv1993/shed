# depwatch

In an era where a single developer can maintain dozens of repos, spin up containers on a whim, and accumulate toolchains across multiple languages, disk storage silently disappears. Homebrew caches, scattered `node_modules`, Docker images, IDE extensions, and forgotten git clones pile up until you're staring at a "disk full" warning with no idea where the space went.

**depwatch** gives you a single, interactive terminal view of everything dev-related eating your disk — and lets you clean it up on the spot.

> **macOS only.** Collectors rely on macOS-specific paths and tools (Homebrew, `/Applications`, Xcode, etc.).

## What it shows

- **Homebrew** — every formula with size, dependency status, and which of your projects use it
- **npm globals** — globally installed packages with project links
- **node_modules** — every `node_modules` directory across your projects, expandable to show individual packages
- **Docker** — images, containers, volumes, and build cache with project links
- **Apps** — `/Applications` sorted by size
- **IDEs & Tools** — VS Code, Xcode, Claude, Zig, Bun, CocoaPods, and more, grouped by tool
- **Git Repos** — all repos found on disk with `.git` size breakdown
- **Cache Cleanups** — one-click actions for brew cleanup, npm cache clean, docker prune, and more

Everything is interactive: navigate with arrows, expand with Enter/→, and delete with confirmation. Git repos are checked for uncommitted changes and unpushed commits before deletion.

## Install

```bash
npm install -g depwatch
```

Or for local development:

```bash
git clone <repo-url>
cd depwatch
pnpm install
pnpm build && npm link
```

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # run the TUI with tsx
pnpm test           # run tests
pnpm test:watch     # run tests in watch mode
pnpm typecheck      # check types
pnpm build          # compile to dist/
```

## Navigation

| Key | Action |
|-----|--------|
| `↑/↓` or `j/k` | Navigate items |
| `←/→` or `Tab` | Switch between sidebar and content |
| `Enter` or `→` | Expand/collapse groups, open details |
| `Del` or `Backspace` | Delete selected item (with confirmation) |
| `r` | Refresh all data |
| `q` or `Ctrl+C` | Quit |
