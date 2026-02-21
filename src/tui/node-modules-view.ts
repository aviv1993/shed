import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { NodeModulesData, NodeModulesEntry, NodeModulePackage } from "../collectors/node-modules.js";
import { scanNodeModulesPackages } from "../collectors/node-modules.js";
import { formatBytes } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

interface FlatItem {
  type: "project" | "package";
  entry?: NodeModulesEntry;
  pkg?: NodeModulePackage;
  selectable: boolean;
}

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; entry: NodeModulesEntry }
  | { mode: "deleting"; entry: NodeModulesEntry }
  | { mode: "done"; entry: NodeModulesEntry; success: boolean };

export class NodeModulesView implements Component {
  private data: NodeModulesData | null = null;
  private items: FlatItem[] = [];
  private expandedProjects = new Set<string>();
  private loadingProjects = new Set<string>();
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

  setData(data: NodeModulesData) {
    this.data = data;
    this.buildItemList();
  }

  private buildItemList() {
    if (!this.data) return;
    const items: FlatItem[] = [];

    for (const entry of this.data.entries) {
      items.push({ type: "project", entry, selectable: true });
      if (this.expandedProjects.has(entry.path)) {
        for (const pkg of entry.packages) {
          items.push({ type: "package", pkg, selectable: false });
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

  private toggleExpand(entry: NodeModulesEntry) {
    const path = entry.path;
    if (this.expandedProjects.has(path)) {
      this.expandedProjects.delete(path);
      this.buildItemList();
    } else {
      if (entry.packages.length > 0) {
        // Already scanned
        this.expandedProjects.add(path);
        this.buildItemList();
      } else if (!this.loadingProjects.has(path)) {
        // Lazy load packages
        this.loadingProjects.add(path);
        scanNodeModulesPackages(path).then((packages) => {
          entry.packages = packages;
          this.loadingProjects.delete(path);
          this.expandedProjects.add(path);
          this.buildItemList();
          this.onRequestRender?.();
        });
      }
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (!this.data) return;

    switch (this.state.mode) {
      case "list":
        if (matchesKey(data, "up") || matchesKey(data, "k")) {
          this.moveToNextSelectable(-1);
          if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset = this.selectedIndex;
          }
        } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
          this.moveToNextSelectable(1);
        } else if (matchesKey(data, "right")) {
          const item = this.items[this.selectedIndex];
          if (item?.type === "project" && item.entry) {
            this.toggleExpand(item.entry);
          }
        } else if (matchesKey(data, "enter") || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
          const item = this.items[this.selectedIndex];
          if (item?.type === "project" && item.entry) {
            this.state = { mode: "confirm", entry: item.entry };
          }
        } else if (matchesKey(data, "left")) {
          const item = this.items[this.selectedIndex];
          if (item?.type === "project" && item.entry && this.expandedProjects.has(item.entry.path)) {
            this.expandedProjects.delete(item.entry.path);
            this.buildItemList();
          } else {
            this.onBack?.();
          }
        }
        break;
      case "confirm":
        if (data === "y" || data === "Y") {
          this.deleteEntry((this.state as { mode: "confirm"; entry: NodeModulesEntry }).entry);
        } else {
          this.state = { mode: "list" };
        }
        break;
      case "done":
        if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
          this.state = { mode: "list" };
          this.onRefreshData?.();
        }
        break;
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

  private deleteEntry(entry: NodeModulesEntry) {
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
    lines.push(pad + chalk.bold("node_modules"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.state.mode === "confirm") {
      const entry = (this.state as { mode: "confirm"; entry: NodeModulesEntry }).entry;
      lines.push(pad + chalk.bold.red("Delete ") + chalk.bold(entry.path) + chalk.bold.red("?"));
      lines.push("");
      lines.push(pad + chalk.dim("Project: ") + entry.projectName);
      lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(entry.sizeBytes)));
      lines.push(pad + chalk.dim("Reinstall with ") + chalk.white("npm install") + chalk.dim(" / ") + chalk.white("pnpm install"));
      lines.push("");
      lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));
      return lines;
    }

    if (this.state.mode === "deleting") {
      const entry = (this.state as { mode: "deleting"; entry: NodeModulesEntry }).entry;
      lines.push(pad + chalk.yellow(`Deleting ${entry.projectName}... ${spinnerFrame(this.spinnerTick)} ${formatElapsed(this.spinnerStart)}`));
      return lines;
    }

    if (this.state.mode === "done") {
      const { entry, success } = this.state as { mode: "done"; entry: NodeModulesEntry; success: boolean };
      if (success) {
        lines.push(pad + chalk.green("Deleted ") + chalk.bold(entry.path));
      } else {
        lines.push(pad + chalk.red("Failed to delete ") + chalk.bold(entry.path));
      }
      lines.push("");
      lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));
      return lines;
    }

    if (this.data.entries.length === 0) {
      lines.push(pad + chalk.dim("No node_modules found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(`${this.data.entries.length} projects, ${formatBytes(this.data.totalBytes)} total`)
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

      if (item.type === "project" && item.entry) {
        const entry = item.entry;
        const expanded = this.expandedProjects.has(entry.path);
        const loading = this.loadingProjects.has(entry.path);
        const arrow = loading ? "⟳" : expanded ? "▾" : "▸";

        let prefix: string;
        let label: string;

        if (isSelected && this.focused) {
          prefix = chalk.cyan(arrow + " ");
          label = chalk.bold.cyan(entry.projectName);
        } else if (isSelected) {
          prefix = chalk.dim(arrow + " ");
          label = chalk.white(entry.projectName);
        } else {
          prefix = chalk.dim(arrow) + " ";
          label = chalk.white(entry.projectName);
        }

        const size = chalk.yellow(formatBytes(entry.sizeBytes));
        lines.push(pad + truncateToWidth(prefix + label + "  " + size, maxW));
      } else if (item.type === "package" && item.pkg) {
        const pkg = item.pkg;
        lines.push(pad + truncateToWidth(
          "    " + chalk.dim(pkg.name) + "  " + chalk.yellow(formatBytes(pkg.sizeBytes)),
          maxW
        ));
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
      const entry = (this.state as { mode: "deleting"; entry: NodeModulesEntry }).entry;
      return { label: `Deleting ${entry.projectName}...`, tick: this.spinnerTick, startMs: this.spinnerStart };
    }
    return null;
  }

  getFooterHint(): string {
    switch (this.state.mode) {
      case "confirm": return "y confirm  any key cancel";
      case "deleting": return "";
      case "done": return "Enter continue";
      default: return "↑↓ navigate  → expand  ← collapse  Enter/Del delete";
    }
  }
}
