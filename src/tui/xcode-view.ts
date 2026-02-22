import type { Component } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { XcodeData } from "../types.js";
import { formatBytes } from "../utils.js";

export class XcodeView implements Component {
  private data: XcodeData | null = null;

  setData(data: XcodeData) {
    this.data = data;
  }

  invalidate(): void { }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";

    lines.push("");
    lines.push(pad + chalk.bold("Xcode & Developer Tools"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (this.data.entries.length === 0) {
      lines.push(pad + chalk.dim("No Xcode/developer tool installations found"));
      return lines;
    }

    lines.push(
      pad + chalk.dim(`Total: ${formatBytes(this.data.totalBytes)}`)
    );
    lines.push("");

    for (const entry of this.data.entries) {
      lines.push(
        pad + "  " +
        chalk.white(entry.label) + "  " +
        chalk.yellow(formatBytes(entry.sizeBytes))
      );
      lines.push(pad + "  " + chalk.dim(entry.path));
      lines.push("");
    }

    return lines;
  }
}
