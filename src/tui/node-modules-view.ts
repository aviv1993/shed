import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { NodeModulesData, NodeModulesEntry } from "../collectors/node-modules.js";
import { formatBytes } from "../utils.js";

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; entry: NodeModulesEntry }
  | { mode: "deleting"; entry: NodeModulesEntry }
  | { mode: "done"; entry: NodeModulesEntry; success: boolean };

export class NodeModulesView implements Component {
  private data: NodeModulesData | null = null;
  private scrollOffset = 0;
  private selectedIndex = 0;
  private state: ViewState = { mode: "list" };
  focused = false;
  onRefreshData?: () => void;

  setData(data: NodeModulesData) {
    this.data = data;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (!this.data) return;

    switch (this.state.mode) {
      case "list":
        if (matchesKey(data, "up") || matchesKey(data, "k")) {
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            if (this.selectedIndex < this.scrollOffset) {
              this.scrollOffset = this.selectedIndex;
            }
          }
        } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
          if (this.selectedIndex < this.data.entries.length - 1) {
            this.selectedIndex++;
          }
        } else if (matchesKey(data, "enter") || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
          const entry = this.data.entries[this.selectedIndex];
          if (entry) {
            this.state = { mode: "confirm", entry };
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

  private deleteEntry(entry: NodeModulesEntry) {
    this.state = { mode: "deleting", entry };

    const child = spawn("rm", ["-rf", entry.path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code: number | null) => {
      this.state = { mode: "done", entry, success: code === 0 };
    });
    child.on("error", () => {
      this.state = { mode: "done", entry, success: false };
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
      lines.push(pad + chalk.dim("You can reinstall with ") + chalk.white("npm install") + chalk.dim(" / ") + chalk.white("pnpm install"));
      lines.push("");
      lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));
      return lines;
    }

    if (this.state.mode === "deleting") {
      lines.push(pad + chalk.yellow("Deleting " + (this.state as any).entry.path + "..."));
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
      pad + chalk.dim(`${this.data.entries.length} directories, ${formatBytes(this.data.totalBytes)} total`)
    );
    lines.push("");

    const maxVisible = 30;
    if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }

    const visibleSlice = this.data.entries.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisible
    );

    for (let i = 0; i < visibleSlice.length; i++) {
      const entry = visibleSlice[i];
      const idx = this.scrollOffset + i;
      const isSelected = idx === this.selectedIndex;

      let prefix: string;
      let label: string;

      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        label = chalk.bold.cyan(entry.projectName);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        label = chalk.white(entry.projectName);
      } else {
        prefix = "  ";
        label = chalk.white(entry.projectName);
      }

      const size = chalk.yellow(formatBytes(entry.sizeBytes));
      lines.push(pad + truncateToWidth(prefix + label + "  " + size, maxW));
      lines.push(pad + "    " + chalk.dim(entry.path));
    }

    if (this.data.entries.length > maxVisible) {
      lines.push("");
      const pos = this.scrollOffset + 1;
      lines.push(pad + chalk.dim(
        `${pos}–${Math.min(pos + maxVisible - 1, this.data.entries.length)} of ${this.data.entries.length}`
      ));
    }

    lines.push("");
    lines.push(pad + chalk.dim("↑/↓ navigate  Enter delete"));

    return lines;
  }
}
