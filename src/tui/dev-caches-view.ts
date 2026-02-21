import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { DevCachesData, DevCacheEntry, DevCacheGroup } from "../collectors/dev-caches.js";
import { formatBytes } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

interface FlatItem {
  type: "group" | "entry";
  group?: DevCacheGroup;
  entry?: DevCacheEntry;
  selectable: boolean;
}

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; entry: DevCacheEntry }
  | { mode: "deleting"; entry: DevCacheEntry }
  | { mode: "done"; entry: DevCacheEntry; success: boolean };

export class DevCachesView implements Component {
  private data: DevCachesData | null = null;
  private items: FlatItem[] = [];
  private expandedGroups = new Set<string>();
  private scrollOffset = 0;
  private selectedIndex = 0;
  private state: ViewState = { mode: "list" };
  private spinnerTick = 0;
  private spinnerStart = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  focused = false;
  onRefreshData?: () => void;
  onRequestRender?: () => void;
  onBack?: () => void;

  setData(data: DevCachesData) {
    this.data = data;
    this.buildItemList();
  }

  private buildItemList() {
    if (!this.data) return;
    const items: FlatItem[] = [];

    for (const group of this.data.groups) {
      items.push({ type: "group", group, selectable: true });
      if (this.expandedGroups.has(group.tool)) {
        for (const entry of group.entries) {
          items.push({ type: "entry", entry, selectable: true });
        }
      }
    }

    this.items = items;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(this.items.length - 1, 0));
  }

  private moveToNextSelectable(direction: 1 | -1) {
    let next = this.selectedIndex + direction;
    while (next >= 0 && next < this.items.length) {
      if (this.items[next].selectable) {
        this.selectedIndex = next;
        return;
      }
      next += direction;
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (!this.data) return;

    switch (this.state.mode) {
      case "list":
        this.handleListInput(data);
        break;
      case "confirm":
        if (data === "y" || data === "Y") {
          this.deleteEntry((this.state as { mode: "confirm"; entry: DevCacheEntry }).entry);
        } else {
          this.state = { mode: "list" };
        }
        break;
      case "deleting":
        break;
      case "done":
        if (matchesKey(data, "enter") || matchesKey(data, "escape") || matchesKey(data, "q")) {
          this.state = { mode: "list" };
          this.onRefreshData?.();
        }
        break;
    }
  }

  private handleListInput(data: string) {
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.moveToNextSelectable(-1);
      if (this.selectedIndex < this.scrollOffset) {
        this.scrollOffset = this.selectedIndex;
      }
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.moveToNextSelectable(1);
    } else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
      const item = this.items[this.selectedIndex];
      if (item?.type === "group" && item.group) {
        const tool = item.group.tool;
        if (this.expandedGroups.has(tool)) {
          this.expandedGroups.delete(tool);
        } else {
          this.expandedGroups.add(tool);
        }
        this.buildItemList();
      } else if (item?.type === "entry" && item.entry) {
        this.state = { mode: "confirm", entry: item.entry };
      }
    } else if (matchesKey(data, "left")) {
      const item = this.items[this.selectedIndex];
      if (item?.type === "group" && item.group && this.expandedGroups.has(item.group.tool)) {
        this.expandedGroups.delete(item.group.tool);
        this.buildItemList();
      } else {
        this.onBack?.();
      }
    } else if (matchesKey(data, "delete") || matchesKey(data, "backspace")) {
      const item = this.items[this.selectedIndex];
      if (item?.type === "entry" && item.entry) {
        this.state = { mode: "confirm", entry: item.entry };
      }
    }
  }

  private startSpinner() {
    this.spinnerTick = 0;
    this.spinnerStart = Date.now();
    this.spinnerInterval = setInterval(() => {
      this.spinnerTick++;
      this.onRequestRender?.();
    }, 100);
  }

  private stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  private deleteEntry(entry: DevCacheEntry) {
    this.state = { mode: "deleting", entry };
    this.startSpinner();

    const child = spawn("rm", ["-rf", entry.path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code: number | null) => {
      this.stopSpinner();
      this.state = { mode: "done", entry, success: code === 0 };
      this.onRequestRender?.();
    });
    child.on("error", () => {
      this.stopSpinner();
      this.state = { mode: "done", entry, success: false };
      this.onRequestRender?.();
    });
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");
    lines.push(pad + chalk.bold("IDEs & Tools"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.state.mode === "confirm") {
      return this.renderConfirm(width, lines);
    }
    if (this.state.mode === "deleting") {
      lines.push(pad + chalk.yellow(`Deleting ${this.state.entry.label}... ${spinnerFrame(this.spinnerTick)} ${formatElapsed(this.spinnerStart)}`));
      return lines;
    }
    if (this.state.mode === "done") {
      return this.renderDone(width, lines);
    }

    if (this.items.length === 0) {
      lines.push(pad + chalk.dim("No IDE/tool data found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(`${this.data.groups.length} tools, ${formatBytes(this.data.totalBytes)} total`)
    );
    lines.push("");

    const maxVisible = 30;
    if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }

    const visibleSlice = this.items.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisible
    );

    for (let i = 0; i < visibleSlice.length; i++) {
      const item = visibleSlice[i];
      const idx = this.scrollOffset + i;
      const isSelected = idx === this.selectedIndex;

      if (item.type === "group" && item.group) {
        const group = item.group;
        const expanded = this.expandedGroups.has(group.tool);
        const arrow = expanded ? "▾" : "▸";

        let prefix: string;
        let label: string;

        if (isSelected && this.focused) {
          prefix = chalk.cyan(arrow + " ");
          label = chalk.bold.cyan(group.tool);
        } else if (isSelected) {
          prefix = chalk.dim(arrow + " ");
          label = chalk.white(group.tool);
        } else {
          prefix = chalk.dim(arrow) + " ";
          label = chalk.white(group.tool);
        }

        const size = chalk.yellow(formatBytes(group.totalBytes));
        const count = chalk.dim(` (${group.entries.length})`);
        lines.push(pad + truncateToWidth(prefix + label + "  " + size + count, maxW));
      } else if (item.type === "entry" && item.entry) {
        const entry = item.entry;

        let prefix: string;
        let label: string;

        if (isSelected && this.focused) {
          prefix = chalk.cyan("  ▸ ");
          label = chalk.bold.cyan(entry.label);
        } else if (isSelected) {
          prefix = chalk.dim("  ▸ ");
          label = chalk.white(entry.label);
        } else {
          prefix = "    ";
          label = chalk.dim(entry.label);
        }

        const size = chalk.yellow(formatBytes(entry.sizeBytes));
        const cleanBadge = entry.cleanable ? "" : chalk.dim(" [keep]");
        lines.push(pad + truncateToWidth(prefix + label + "  " + size + cleanBadge, maxW));
        lines.push(pad + "      " + chalk.dim(entry.path));
      }
    }

    if (this.items.length > maxVisible) {
      lines.push("");
      const pos = this.scrollOffset + 1;
      lines.push(pad + chalk.dim(
        `${pos}–${Math.min(pos + maxVisible - 1, this.items.length)} of ${this.items.length}`
      ));
    }

    return lines;
  }

  getOperationStatus(): { label: string; tick: number; startMs: number } | null {
    if (this.state.mode === "deleting") {
      const entry = (this.state as { mode: "deleting"; entry: DevCacheEntry }).entry;
      return { label: `Deleting ${entry.label}...`, tick: this.spinnerTick, startMs: this.spinnerStart };
    }
    return null;
  }

  getFooterHint(): string {
    switch (this.state.mode) {
      case "confirm": return "y confirm  any key cancel";
      case "deleting": return "";
      case "done": return "Enter continue";
      default: {
        const item = this.items[this.selectedIndex];
        if (item?.type === "group") return "↑↓ navigate  Enter/→ expand  ← collapse";
        return "↑↓ navigate  Enter/Del delete  ← collapse";
      }
    }
  }

  private renderConfirm(width: number, lines: string[]): string[] {
    const pad = "  ";
    const entry = (this.state as { mode: "confirm"; entry: DevCacheEntry }).entry;

    lines.push(pad + chalk.bold.red("Delete ") + chalk.bold(entry.label) + chalk.bold.red("?"));
    lines.push("");
    lines.push(pad + chalk.dim("Path: ") + entry.path);
    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(entry.sizeBytes)));

    if (!entry.cleanable) {
      lines.push("");
      if (entry.warningMessage) {
        lines.push(pad + chalk.yellow("⚠ " + entry.warningMessage));
      } else {
        lines.push(pad + chalk.yellow("Warning: This is not a cache — deleting may require reinstalling."));
      }
    }

    lines.push("");
    lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));

    return lines;
  }

  private renderDone(width: number, lines: string[]): string[] {
    const pad = "  ";
    const { entry, success } = this.state as { mode: "done"; entry: DevCacheEntry; success: boolean };

    if (success) {
      lines.push(pad + chalk.green("Deleted ") + chalk.bold(entry.label));
    } else {
      lines.push(pad + chalk.red("Failed to delete ") + chalk.bold(entry.label));
    }

    lines.push("");
    lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));

    return lines;
  }
}
