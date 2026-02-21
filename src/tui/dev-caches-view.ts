import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { DevCachesData, DevCacheEntry } from "../collectors/dev-caches.js";
import { formatBytes } from "../utils.js";

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; entry: DevCacheEntry }
  | { mode: "deleting"; entry: DevCacheEntry; output: string[] }
  | { mode: "done"; entry: DevCacheEntry; success: boolean };

export class DevCachesView implements Component {
  private data: DevCachesData | null = null;
  private scrollOffset = 0;
  private selectedIndex = 0;
  private state: ViewState = { mode: "list" };
  focused = false;
  onRefreshData?: () => void;

  setData(data: DevCachesData) {
    this.data = data;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (!this.data) return;

    switch (this.state.mode) {
      case "list":
        this.handleListInput(data);
        break;
      case "confirm":
        this.handleConfirmInput(data);
        break;
      case "deleting":
        // No input while deleting
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
    if (!this.data) return;

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
  }

  private handleConfirmInput(data: string) {
    if (this.state.mode !== "confirm") return;

    if (data === "y" || data === "Y") {
      this.deleteEntry(this.state.entry);
    } else {
      // Any other key cancels
      this.state = { mode: "list" };
    }
  }

  private deleteEntry(entry: DevCacheEntry) {
    this.state = { mode: "deleting", entry, output: [] };

    const child = spawn("rm", ["-rf", entry.path], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output: string[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      output.push(chunk.toString().trim());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output.push(chunk.toString().trim());
    });
    child.on("close", (code: number | null) => {
      this.state = { mode: "done", entry, success: code === 0 };
    });
    child.on("error", (err: Error) => {
      this.state = { mode: "done", entry, success: false };
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
      lines.push(pad + chalk.yellow("Deleting " + this.state.entry.label + "..."));
      return lines;
    }
    if (this.state.mode === "done") {
      return this.renderDone(width, lines);
    }

    if (this.data.entries.length === 0) {
      lines.push(pad + chalk.dim("No dev caches found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(`${this.data.entries.length} items, ${formatBytes(this.data.totalBytes)} total`)
    );
    lines.push("");

    // Visible window
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
        label = chalk.bold.cyan(entry.label);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        label = chalk.white(entry.label);
      } else {
        prefix = "  ";
        label = chalk.white(entry.label);
      }

      const size = chalk.yellow(formatBytes(entry.sizeBytes));
      const cleanBadge = entry.cleanable ? "" : chalk.dim(" [keep]");
      lines.push(pad + truncateToWidth(prefix + label + "  " + size + cleanBadge, maxW));
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

  private renderConfirm(width: number, lines: string[]): string[] {
    const pad = "  ";
    const entry = (this.state as { mode: "confirm"; entry: DevCacheEntry }).entry;

    lines.push(pad + chalk.bold.red("Delete ") + chalk.bold(entry.label) + chalk.bold.red("?"));
    lines.push("");
    lines.push(pad + chalk.dim("Path: ") + entry.path);
    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(entry.sizeBytes)));

    if (!entry.cleanable) {
      lines.push("");
      lines.push(pad + chalk.yellow("Warning: This is not a cache — deleting may require reinstalling."));
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
