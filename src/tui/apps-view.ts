import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { AppsData, AppEntry } from "../collectors/apps.js";
import { formatBytes } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; app: AppEntry }
  | { mode: "deleting"; app: AppEntry }
  | { mode: "done"; app: AppEntry; success: boolean };

export class AppsView implements Component {
  private data: AppsData | null = null;
  private scrollOffset = 0;
  private selectedIndex = 0;
  private state: ViewState = { mode: "list" };
  private spinnerTick = 0;
  private spinnerStart = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  focused = false;
  onRefreshData?: () => void;
  onRequestRender?: () => void;

  setData(data: AppsData) {
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
          if (this.selectedIndex < this.data.apps.length - 1) {
            this.selectedIndex++;
          }
        } else if (matchesKey(data, "enter")) {
          const app = this.data.apps[this.selectedIndex];
          if (app) {
            this.state = { mode: "confirm", app };
          }
        }
        break;
      case "confirm": {
        if (data === "y" || data === "Y") {
          this.deleteApp((this.state as any).app);
        } else {
          this.state = { mode: "list" };
        }
        break;
      }
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

  private deleteApp(app: AppEntry) {
    this.state = { mode: "deleting", app };
    this.startSpinner();

    const child = spawn("rm", ["-rf", `/Applications/${app.name}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code: number | null) => {
      this.stopSpinner();
      this.state = { mode: "done", app, success: code === 0 };
      this.onRequestRender?.();
    });
    child.on("error", () => {
      this.stopSpinner();
      this.state = { mode: "done", app, success: false };
      this.onRequestRender?.();
    });
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");
    lines.push(pad + chalk.bold("Applications"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.state.mode === "confirm") {
      const app = (this.state as any).app as AppEntry;
      lines.push(pad + chalk.bold.red("Delete ") + chalk.bold(app.name) + chalk.bold.red("?"));
      lines.push("");
      lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(app.sizeBytes)));
      lines.push(pad + chalk.dim("Path: ") + `/Applications/${app.name}`);
      lines.push("");
      lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));
      return lines;
    }

    if (this.state.mode === "deleting") {
      const app = (this.state as { mode: "deleting"; app: AppEntry }).app;
      lines.push(pad + chalk.yellow(`Deleting ${app.name}... ${spinnerFrame(this.spinnerTick)} ${formatElapsed(this.spinnerStart)}`));
      return lines;
    }

    if (this.state.mode === "done") {
      const { app, success } = this.state as { mode: "done"; app: AppEntry; success: boolean };
      if (success) {
        lines.push(pad + chalk.green("Deleted ") + chalk.bold(app.name));
      } else {
        lines.push(pad + chalk.red("Failed to delete ") + chalk.bold(app.name));
      }
      lines.push("");
      lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));
      return lines;
    }

    if (this.data.apps.length === 0) {
      lines.push(pad + chalk.dim("No applications found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(`${this.data.apps.length} apps, ${formatBytes(this.data.totalBytes)} total`)
    );
    lines.push("");

    const maxVisible = 30;
    if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }

    const visibleSlice = this.data.apps.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisible
    );

    for (let i = 0; i < visibleSlice.length; i++) {
      const app = visibleSlice[i];
      const idx = this.scrollOffset + i;
      const isSelected = idx === this.selectedIndex;

      let prefix: string;
      let name: string;

      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        name = chalk.bold.cyan(app.name);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        name = chalk.white(app.name);
      } else {
        prefix = "  ";
        name = chalk.white(app.name);
      }

      const size = chalk.yellow(formatBytes(app.sizeBytes));
      lines.push(pad + truncateToWidth(prefix + name + "  " + size, maxW));
    }

    if (this.data.apps.length > maxVisible) {
      lines.push("");
      const pos = this.scrollOffset + 1;
      lines.push(pad + chalk.dim(
        `${pos}–${Math.min(pos + maxVisible - 1, this.data.apps.length)} of ${this.data.apps.length}`
      ));
    }

    lines.push("");
    lines.push(pad + chalk.dim("↑/↓ navigate  Enter delete"));

    return lines;
  }
}
