import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { runCleanupAction, type CleanupAction, type CleanupActionsData } from "../cleanup.js";
import { formatBytes } from "../utils.js";

export class CleanupView implements Component {
  private actions: CleanupAction[] = [];
  private selectedIndex = 0;
  private running = false;
  private runningAction: CleanupAction | null = null;
  private runningStart = 0;
  private output: string[] = [];
  private outputScrollOffset = 0;
  private exitCode: number | null = null;
  private killFn: (() => void) | null = null;
  private spinnerTick = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  focused = false;
  onRefreshData?: () => void;
  onRequestRender?: () => void;
  onBack?: () => void;

  setData(data: CleanupActionsData) {
    this.actions = data.actions;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (this.running) {
      if (matchesKey(data, "up") || matchesKey(data, "k")) {
        if (this.outputScrollOffset > 0) this.outputScrollOffset--;
      } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
        this.outputScrollOffset++;
      }
      return;
    }

    if (this.runningAction && this.exitCode !== null) {
      if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "q")) {
        this.runningAction = null;
        this.output = [];
        this.exitCode = null;
        this.outputScrollOffset = 0;
        this.onRefreshData?.();
      }
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (this.selectedIndex > 0) this.selectedIndex--;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.selectedIndex < this.actions.length - 1) this.selectedIndex++;
    } else if (matchesKey(data, "enter")) {
      if (this.actions[this.selectedIndex]) {
        this.startAction(this.actions[this.selectedIndex]);
      }
    } else if (matchesKey(data, "left")) {
      this.onBack?.();
    }
  }

  private startAction(action: CleanupAction) {
    this.runningAction = action;
    this.running = true;
    this.runningStart = Date.now();
    this.output = [];
    this.exitCode = null;
    this.outputScrollOffset = 0;
    this.spinnerTick = 0;
    this.spinnerInterval = setInterval(() => {
      this.spinnerTick++;
      this.onRequestRender?.();
    }, 100);

    this.killFn = runCleanupAction(
      action,
      (text) => {
        const newLines = text.split("\n");
        this.output.push(...newLines.filter((l) => l.length > 0));
        this.outputScrollOffset = Math.max(0, this.output.length - 15);
        this.onRequestRender?.();
      },
      (code) => {
        this.running = false;
        this.exitCode = code;
        this.killFn = null;
        if (this.spinnerInterval) {
          clearInterval(this.spinnerInterval);
          this.spinnerInterval = null;
        }
        this.onRequestRender?.();
      }
    );
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");
    lines.push(pad + chalk.bold("Cache Cleanups"));
    lines.push("");

    if (this.actions.length === 0) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.runningAction) {
      return this.renderRunning(width, lines);
    }

    for (let i = 0; i < this.actions.length; i++) {
      const action = this.actions[i];
      const isSelected = i === this.selectedIndex;

      let prefix: string;
      let label: string;
      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        label = chalk.bold.cyan(action.label);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        label = chalk.white(action.label);
      } else {
        prefix = "  ";
        label = chalk.white(action.label);
      }

      const sizeStr = action.sizeBytes > 0
        ? "  " + chalk.yellow(formatBytes(action.sizeBytes))
        : "";

      lines.push(pad + prefix + label + sizeStr);
      lines.push(pad + "    " + chalk.dim(action.description));
      lines.push("");
    }

    return lines;
  }

  private renderRunning(width: number, lines: string[]): string[] {
    const pad = "  ";
    const maxW = width - 4;
    const action = this.runningAction!;

    const status = this.running
      ? chalk.yellow("⟳ Running...")
      : this.exitCode === 0
        ? chalk.green("✓ Done")
        : chalk.red(`✗ Failed (exit ${this.exitCode})`);

    lines.push(pad + chalk.bold(action.label) + "  " + status);
    lines.push("");

    // Output window
    const maxOutputLines = 20;
    const outputSlice = this.output.slice(
      this.outputScrollOffset,
      this.outputScrollOffset + maxOutputLines
    );

    if (outputSlice.length === 0 && this.running) {
      lines.push(pad + chalk.dim("Waiting for output..."));
    }

    for (const ol of outputSlice) {
      lines.push(pad + truncateToWidth(chalk.dim(ol), maxW));
    }

    lines.push("");

    if (!this.running) {
      lines.push(pad + chalk.dim("Press Esc/Enter to go back (data will refresh)"));
    } else {
      lines.push(pad + chalk.dim("↑/↓ scroll output"));
    }

    return lines;
  }

  getOperationStatus(): { label: string; tick: number; startMs: number } | null {
    if (this.running && this.runningAction) {
      return { label: `Running ${this.runningAction.label}...`, tick: this.spinnerTick, startMs: this.runningStart };
    }
    return null;
  }

  getFooterHint(): string {
    if (this.running) return "↑↓ scroll output";
    if (this.runningAction && this.exitCode !== null) return "Enter continue";
    return "↑↓ navigate  Enter run";
  }
}
