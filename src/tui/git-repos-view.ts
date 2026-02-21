import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { GitReposData, GitRepoEntry } from "../collectors/git-repos.js";
import { formatBytes } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

const execFileAsync = promisify(execFile);

type ViewState =
  | { mode: "list" }
  | { mode: "checking"; repo: GitRepoEntry }
  | { mode: "confirm"; repo: GitRepoEntry; warnings: string[] }
  | { mode: "deleting"; repo: GitRepoEntry }
  | { mode: "done"; repo: GitRepoEntry; success: boolean };

export class GitReposView implements Component {
  private data: GitReposData | null = null;
  private scrollOffset = 0;
  private selectedIndex = 0;
  private state: ViewState = { mode: "list" };
  private spinnerTick = 0;
  private spinnerStart = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  focused = false;
  onRefreshData?: () => void;
  onRequestRender?: () => void;

  setData(data: GitReposData) {
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
          if (this.selectedIndex < this.data.repos.length - 1) {
            this.selectedIndex++;
          }
        } else if (matchesKey(data, "enter") || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
          const repo = this.data.repos[this.selectedIndex];
          if (repo) {
            this.checkAndConfirm(repo);
          }
        }
        break;
      case "confirm":
        if (data === "y" || data === "Y") {
          this.deleteRepo((this.state as { mode: "confirm"; repo: GitRepoEntry }).repo);
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

  private async checkAndConfirm(repo: GitRepoEntry) {
    this.state = { mode: "checking", repo };
    const warnings: string[] = [];

    try {
      // Check for uncommitted changes
      const { stdout: statusOut } = await execFileAsync(
        "git", ["-C", repo.path, "status", "--porcelain"],
        { timeout: 5000 }
      );
      if (statusOut.trim()) {
        const count = statusOut.trim().split("\n").length;
        warnings.push(`${count} uncommitted change${count > 1 ? "s" : ""}`);
      }

      // Check for unpushed commits
      try {
        const { stdout: unpushed } = await execFileAsync(
          "git", ["-C", repo.path, "log", "--oneline", "@{u}..HEAD"],
          { timeout: 5000 }
        );
        if (unpushed.trim()) {
          const count = unpushed.trim().split("\n").length;
          warnings.push(`${count} unpushed commit${count > 1 ? "s" : ""}`);
        }
      } catch {
        // No upstream configured — check if there's a remote at all
        try {
          const { stdout: remotes } = await execFileAsync(
            "git", ["-C", repo.path, "remote"],
            { timeout: 5000 }
          );
          if (!remotes.trim()) {
            warnings.push("No remote configured — local-only repo");
          }
        } catch {}
      }

      // Check for stashed changes
      try {
        const { stdout: stashOut } = await execFileAsync(
          "git", ["-C", repo.path, "stash", "list"],
          { timeout: 5000 }
        );
        if (stashOut.trim()) {
          const count = stashOut.trim().split("\n").length;
          warnings.push(`${count} stash entr${count > 1 ? "ies" : "y"}`);
        }
      } catch {}
    } catch {
      // If git commands fail, proceed without warnings
    }

    this.state = { mode: "confirm", repo, warnings };
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

  private deleteRepo(repo: GitRepoEntry) {
    this.state = { mode: "deleting", repo };
    this.startSpinner();

    const child = spawn("rm", ["-rf", repo.path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code: number | null) => {
      this.stopSpinner();
      this.state = { mode: "done", repo, success: code === 0 };
      this.onRequestRender?.();
    });
    child.on("error", () => {
      this.stopSpinner();
      this.state = { mode: "done", repo, success: false };
      this.onRequestRender?.();
    });
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");
    lines.push(pad + chalk.bold("Git Repos"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.state.mode === "checking") {
      lines.push(pad + chalk.yellow("Checking " + (this.state as any).repo.name + "..."));
      return lines;
    }

    if (this.state.mode === "confirm") {
      return this.renderConfirm(width, lines);
    }

    if (this.state.mode === "deleting") {
      const repo = (this.state as { mode: "deleting"; repo: GitRepoEntry }).repo;
      lines.push(pad + chalk.yellow(`Deleting ${repo.name}... ${spinnerFrame(this.spinnerTick)} ${formatElapsed(this.spinnerStart)}`));
      return lines;
    }

    if (this.state.mode === "done") {
      const { repo, success } = this.state as { mode: "done"; repo: GitRepoEntry; success: boolean };
      if (success) {
        lines.push(pad + chalk.green("Deleted ") + chalk.bold(repo.name));
      } else {
        lines.push(pad + chalk.red("Failed to delete ") + chalk.bold(repo.name));
      }
      lines.push("");
      lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));
      return lines;
    }

    if (this.data.repos.length === 0) {
      lines.push(pad + chalk.dim("No git repos found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(
        `${this.data.repos.length} repos, ` +
        `${formatBytes(this.data.totalBytes)} total, ` +
        `${formatBytes(this.data.totalGitBytes)} in .git`
      )
    );
    lines.push(pad + chalk.dim(`Scanned: ~/*/  (up to 3 levels deep)`));
    lines.push("");

    const maxVisible = 30;
    if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }

    const visibleSlice = this.data.repos.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisible
    );

    for (let i = 0; i < visibleSlice.length; i++) {
      const repo = visibleSlice[i];
      const idx = this.scrollOffset + i;
      const isSelected = idx === this.selectedIndex;

      let prefix: string;
      let label: string;

      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        label = chalk.bold.cyan(repo.name);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        label = chalk.white(repo.name);
      } else {
        prefix = "  ";
        label = chalk.white(repo.name);
      }

      const size = chalk.yellow(formatBytes(repo.sizeBytes));
      const gitSize = chalk.dim(` (.git ${formatBytes(repo.gitSizeBytes)})`);
      lines.push(pad + truncateToWidth(prefix + label + "  " + size + gitSize, maxW));
      lines.push(pad + "    " + chalk.dim(repo.path));
    }

    if (this.data.repos.length > maxVisible) {
      lines.push("");
      const pos = this.scrollOffset + 1;
      lines.push(pad + chalk.dim(
        `${pos}–${Math.min(pos + maxVisible - 1, this.data.repos.length)} of ${this.data.repos.length}`
      ));
    }

    lines.push("");
    lines.push(pad + chalk.dim("↑/↓ navigate  Enter delete"));

    return lines;
  }

  private renderConfirm(width: number, lines: string[]): string[] {
    const pad = "  ";
    const { repo, warnings } = this.state as { mode: "confirm"; repo: GitRepoEntry; warnings: string[] };

    lines.push(pad + chalk.bold.red("Delete ") + chalk.bold(repo.name) + chalk.bold.red("?"));
    lines.push("");
    lines.push(pad + chalk.dim("Path: ") + repo.path);
    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(repo.sizeBytes)));

    if (warnings.length > 0) {
      lines.push("");
      lines.push(pad + chalk.bold.red("⚠ Warning — you may lose work:"));
      for (const w of warnings) {
        lines.push(pad + chalk.yellow("  • " + w));
      }
    }

    lines.push("");
    lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));
    return lines;
  }
}
