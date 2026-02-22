import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { CollectedData } from "../types.js";
import type { SidebarTab } from "./sidebar.js";
import { formatBytes } from "../utils.js";

const ROW_TABS: SidebarTab[] = [
  "brew", "npm", "node-modules", "git-repos", "docker", "apps", "ides",
];

export class DashboardView implements Component {
  private data: CollectedData | null = null;
  private stale = false;
  private selectedIndex = 0;
  focused = false;
  onNavigate?: (tab: SidebarTab) => void;
  onBack?: () => void;

  setData(data: CollectedData, stale = false) {
    this.data = data;
    this.stale = stale;
  }

  invalidate(): void { }

  handleInput(data: string): void {
    if (!this.data) return;

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (this.selectedIndex > 0) this.selectedIndex--;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.selectedIndex < ROW_TABS.length - 1) this.selectedIndex++;
    } else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
      this.onNavigate?.(ROW_TABS[this.selectedIndex]);
    } else if (matchesKey(data, "left")) {
      this.onBack?.();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = Math.min(width - 4, 70);

    lines.push("");
    lines.push(pad + chalk.bold("Overview") + (this.stale ? chalk.dim.yellow("  (cached — refreshing...)") : ""));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading data..."));
      return lines;
    }

    const d = this.data;

    // Git repos size excluding node_modules (already counted separately)
    const gitRepoBytes = (d.gitRepos?.totalBytes ?? 0) - (d.gitRepos?.totalNodeModulesBytes ?? 0);

    // Docker: compute image size total as fallback when totalSizeStr is "—"
    const dockerImageBytes = d.docker.images.reduce((s, i) => s + i.sizeBytes, 0);
    const dockerTotal = d.docker.online
      ? (d.docker.totalSizeStr !== "—" ? d.docker.totalSizeStr : formatBytes(dockerImageBytes))
      : chalk.dim("offline");
    const dockerReclaimable = d.docker.online
      ? (d.docker.reclaimableSizeStr !== "—" ? d.docker.reclaimableSizeStr : "—")
      : "—";

    const dockerCount = d.docker.images.length + d.docker.containers.length + d.docker.volumes.length;

    const rows: [string, string, string][] = [];
    rows.push([
      `${process.platform === "win32" ? "Winget" : "Homebrew"} (${d.brew.packages.length})`,
      formatBytes(d.brew.totalBytes),
      d.brew.cacheBytes > 0 ? `${formatBytes(d.brew.cacheBytes)} cache` : "—",
    ]);
    rows.push([
      `npm globals (${d.npmGlobals.packages.length})`,
      formatBytes(d.npmGlobals.totalBytes),
      d.npmCache.totalBytes > 0 ? `${formatBytes(d.npmCache.totalBytes)} cache` : "—",
    ]);
    rows.push([
      `node_modules (${d.nodeModules?.entries.length ?? 0})`,
      formatBytes(d.nodeModules?.totalBytes ?? 0),
      formatBytes(d.nodeModules?.totalBytes ?? 0) + " cleanable",
    ]);
    rows.push([
      `Git Repos (${d.gitRepos?.repos.length ?? 0})`,
      formatBytes(gitRepoBytes),
      formatBytes(d.gitRepos?.totalGitBytes ?? 0) + " .git",
    ]);
    rows.push([
      `Docker (${dockerCount})`,
      dockerTotal,
      dockerReclaimable,
    ]);
    rows.push([
      `Apps (${d.apps.apps.length})`,
      formatBytes(d.apps.totalBytes),
      "—",
    ]);
    rows.push([
      `IDEs & Tools (${d.devCaches.groups?.length ?? 0})`,
      formatBytes(d.devCaches.totalBytes),
      formatBytes(d.devCaches.entries.filter(e => e.cleanable).reduce((s, e) => s + e.sizeBytes, 0)) + " cleanable",
    ]);

    const col1W = 26;
    const col2W = 12;
    const col3W = 18;

    lines.push(pad + chalk.dim(
      padR("Category", col1W) + padR("Size", col2W) + "Reclaimable"
    ));
    lines.push(pad + chalk.dim("─".repeat(Math.min(col1W + col2W + col3W, maxW))));

    for (let i = 0; i < rows.length; i++) {
      const [cat, size, reclaim] = rows[i];
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected && this.focused
        ? chalk.cyan("▸ ")
        : isSelected
          ? chalk.dim("▸ ")
          : "  ";

      const catStr = isSelected && this.focused ? chalk.cyan(cat) : cat;

      lines.push(
        pad + prefix +
        padR(catStr, col1W - 2) +
        padR(chalk.bold(size), col2W) +
        chalk.dim(reclaim)
      );
    }

    const dockerSizeBytes = d.docker.online
      ? (d.docker.totalSizeStr !== "—" ? parseApproxSize(d.docker.totalSizeStr) : dockerImageBytes)
      : 0;

    const totalDevBytes =
      d.brew.totalBytes +
      d.npmGlobals.totalBytes +
      (d.nodeModules?.totalBytes ?? 0) +
      gitRepoBytes +
      dockerSizeBytes +
      d.apps.totalBytes +
      d.devCaches.totalBytes;

    const totalReclaimable =
      d.brew.cacheBytes +
      d.npmCache.totalBytes +
      (d.nodeModules?.totalBytes ?? 0) +
      (d.docker.online ? parseApproxSize(d.docker.reclaimableSizeStr) : 0) +
      d.devCaches.entries.filter(e => e.cleanable).reduce((s, e) => s + e.sizeBytes, 0);

    lines.push(pad + chalk.dim("─".repeat(Math.min(col1W + col2W + col3W, maxW))));
    lines.push(
      pad + "  " +
      padR(chalk.bold("Total"), col1W - 2) +
      padR(chalk.bold.yellow(formatBytes(totalDevBytes)), col2W) +
      chalk.green(formatBytes(totalReclaimable))
    );

    if (d.totalDiskBytes > 0) {
      const pct = ((totalDevBytes / d.totalDiskBytes) * 100).toFixed(1);
      lines.push("");
      lines.push(
        pad +
        chalk.dim(
          `${formatBytes(totalDevBytes)} of ${formatBytes(d.totalDiskBytes)} total disk (${pct}%)`
        )
      );
    }

    return lines;
  }

  getFooterHint(): string {
    return "↑↓ navigate  Enter/→ open";
  }
}

function padR(str: string, len: number): string {
  const w = visibleWidth(str);
  return w >= len ? str : str + " ".repeat(len - w);
}

function parseApproxSize(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const m: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return val * (m[unit] ?? 1);
}
