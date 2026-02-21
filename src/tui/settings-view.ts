import type { Component } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { homedir } from "node:os";
import type { DepwatchConfig } from "../config.js";

type ViewState = "list" | "adding";

export class SettingsView implements Component {
  private config: DepwatchConfig = { gitScanPaths: [] };
  private selectedIndex = 0;
  private state: ViewState = "list";
  private inputBuffer = "";
  focused = false;
  onBack?: () => void;
  onSettingsChanged?: (config: DepwatchConfig) => void;

  setConfig(config: DepwatchConfig) {
    this.config = config;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(this.config.gitScanPaths.length - 1, 0));
  }

  getConfig(): DepwatchConfig {
    return this.config;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.state === "adding") {
      this.handleAddingInput(data);
      return;
    }

    this.handleListInput(data);
  }

  private handleListInput(data: string): void {
    const paths = this.config.gitScanPaths;

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (this.selectedIndex > 0) this.selectedIndex--;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.selectedIndex < paths.length - 1) this.selectedIndex++;
    } else if (data === "a") {
      this.state = "adding";
      this.inputBuffer = "";
    } else if (data === "d" || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
      if (paths.length > 0) {
        paths.splice(this.selectedIndex, 1);
        this.selectedIndex = Math.min(this.selectedIndex, Math.max(paths.length - 1, 0));
        this.notifyChanged();
      }
    } else if (data === "+" || data === "=") {
      if (paths[this.selectedIndex] && paths[this.selectedIndex].depth < 5) {
        paths[this.selectedIndex].depth++;
        this.notifyChanged();
      }
    } else if (data === "-") {
      if (paths[this.selectedIndex] && paths[this.selectedIndex].depth > 1) {
        paths[this.selectedIndex].depth--;
        this.notifyChanged();
      }
    } else if (matchesKey(data, "left")) {
      this.onBack?.();
    }
  }

  private handleAddingInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.state = "list";
      return;
    }

    if (matchesKey(data, "enter")) {
      if (this.inputBuffer.trim()) {
        let path = this.inputBuffer.trim();
        // Expand ~ to homedir for storage, but keep ~ prefix for display
        if (path.startsWith("~/")) {
          // Store with ~ prefix (resolved at scan time)
        } else if (path === "~") {
          path = homedir();
        } else if (!path.startsWith("/")) {
          path = homedir() + "/" + path;
        }
        this.config.gitScanPaths.push({ path, depth: 3 });
        this.selectedIndex = this.config.gitScanPaths.length - 1;
        this.notifyChanged();
      }
      this.state = "list";
      return;
    }

    if (matchesKey(data, "backspace")) {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
      return;
    }

    // Only accept printable characters
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.inputBuffer += data;
    }
  }

  private notifyChanged() {
    this.onSettingsChanged?.(this.config);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";

    lines.push("");
    lines.push(pad + chalk.bold("Settings"));
    lines.push("");
    lines.push(pad + chalk.bold("Git Scan Paths"));
    lines.push(pad + chalk.dim("─".repeat(Math.min(width - 4, 40))));
    lines.push("");

    const paths = this.config.gitScanPaths;

    if (paths.length === 0) {
      lines.push(pad + chalk.dim("No scan paths configured"));
      lines.push("");
    } else {
      for (let i = 0; i < paths.length; i++) {
        const entry = paths[i];
        const isSelected = i === this.selectedIndex && this.state === "list";
        const displayPath = entry.path.replace(homedir(), "~");
        const depthStr = chalk.dim("  depth: ") + chalk.yellow(String(entry.depth));

        if (isSelected && this.focused) {
          lines.push(pad + chalk.cyan("▸ ") + chalk.bold.cyan(displayPath) + depthStr);
        } else if (isSelected) {
          lines.push(pad + chalk.dim("▸ ") + chalk.white(displayPath) + depthStr);
        } else {
          lines.push(pad + "  " + chalk.white(displayPath) + depthStr);
        }
      }
      lines.push("");
    }

    if (this.state === "adding") {
      lines.push(pad + chalk.cyan("Add path: ") + chalk.white(this.inputBuffer) + chalk.cyan("█"));
      lines.push(pad + chalk.dim("Enter to confirm, Esc to cancel"));
      lines.push("");
    }

    lines.push(pad + chalk.dim("a add path  d delete  +/- depth"));
    lines.push("");
    lines.push(pad + chalk.dim("Default: ~/ at depth 3 (scans all dirs under home)"));

    return lines;
  }

  /** True when the view is in a text-input mode that should capture all keys (q, Esc, etc.) */
  consumesInput(): boolean {
    return this.state === "adding";
  }

  getFooterHint(): string {
    if (this.state === "adding") return "Enter confirm  Esc cancel";
    return "a add  d delete  +/- depth";
  }
}
