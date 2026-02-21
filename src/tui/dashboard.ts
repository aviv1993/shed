import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { CollectedData } from "../types.js";
import { formatBytes, renderProgressBar } from "../utils.js";

export class DashboardView implements Component {
  private data: CollectedData | null = null;
  private stale = false;
  private progressDone: number | null = null;
  private progressTotal: number | null = null;

  setData(data: CollectedData, stale = false) {
    this.data = data;
    this.stale = stale;
  }

  setProgress(done: number | null, total: number | null) {
    this.progressDone = done;
    this.progressTotal = total;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = Math.min(width - 4, 70);

    lines.push("");
    lines.push(pad + chalk.bold("Overview") + (this.stale ? chalk.dim.yellow("  (cached — refreshing...)") : ""));
    lines.push("");

    if (this.progressDone !== null && this.progressTotal !== null) {
      lines.push(pad + chalk.dim("Scanning... ") + chalk.cyan(renderProgressBar(this.progressDone, this.progressTotal, 20)));
      lines.push("");
    }

    if (!this.data) {
      if (this.progressDone === null) {
        lines.push(pad + chalk.dim("Loading data..."));
      }
      return lines;
    }

    const d = this.data;

    const rows: [string, string, string][] = [];
    rows.push([
      `Homebrew (${d.brew.packages.length})`,
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
      "Docker",
      d.docker.online ? d.docker.totalSizeStr : chalk.dim("offline"),
      d.docker.online ? d.docker.reclaimableSizeStr : "—",
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

    const col1W = 24;
    const col2W = 12;
    const col3W = 18;

    lines.push(pad + chalk.dim(
      padR("Category", col1W) + padR("Size", col2W) + "Reclaimable"
    ));
    lines.push(pad + chalk.dim("─".repeat(Math.min(col1W + col2W + col3W, maxW))));

    for (const [cat, size, reclaim] of rows) {
      lines.push(
        pad +
        padR(cat, col1W) +
        padR(chalk.bold(size), col2W) +
        chalk.dim(reclaim)
      );
    }

    const totalDevBytes =
      d.brew.totalBytes +
      d.npmGlobals.totalBytes +
      (d.nodeModules?.totalBytes ?? 0) +
      (d.docker.online ? parseApproxSize(d.docker.totalSizeStr) : 0) +
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
      pad +
      padR(chalk.bold("Total"), col1W) +
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

    lines.push("");
    lines.push(pad + chalk.dim("Use ↑/↓ to navigate categories"));

    return lines;
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
