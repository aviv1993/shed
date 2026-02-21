import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { BrewPackage } from "../collectors/brew.js";
import type { NpmGlobalPackage } from "../collectors/npm-globals.js";
import type { LinkMap } from "../types.js";
import { formatBytes } from "../utils.js";

interface PackageItem {
  name: string;
  version: string;
  description: string;
  sizeBytes: number;
  isDep?: boolean;
  dependencies?: string[];
}

type ViewState =
  | { mode: "list" }
  | { mode: "detail"; item: PackageItem }
  | { mode: "confirm"; item: PackageItem }
  | { mode: "uninstalling"; item: PackageItem; output: string[] }
  | { mode: "done"; item: PackageItem; success: boolean };

export class PackageListView implements Component {
  private items: PackageItem[] = [];
  private filteredItems: PackageItem[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private filter = "";
  private isFilterMode = false;
  private links: LinkMap = new Map();
  private mode: "brew" | "npm" = "brew";
  private state: ViewState = { mode: "list" };
  focused = false;
  onRefreshData?: () => void;

  setBrewData(packages: BrewPackage[], links: LinkMap) {
    this.mode = "brew";
    this.links = links;
    this.items = packages.map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      sizeBytes: p.sizeBytes,
      isDep: !p.installedOnRequest,
      dependencies: p.dependencies,
    }));
    this.applyFilter();
  }

  setNpmData(packages: NpmGlobalPackage[], links: LinkMap) {
    this.mode = "npm";
    this.links = links;
    this.items = packages.map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description,
      sizeBytes: p.sizeBytes,
    }));
    this.applyFilter();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    switch (this.state.mode) {
      case "list":
        this.handleListInput(data);
        break;
      case "detail":
        this.handleDetailInput(data);
        break;
      case "confirm":
        this.handleConfirmInput(data);
        break;
      case "uninstalling":
        break;
      case "done":
        if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
          this.state = { mode: "list" };
          this.onRefreshData?.();
        }
        break;
    }
  }

  private handleDetailInput(data: string) {
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.state = { mode: "list" };
    } else if (matchesKey(data, "enter") || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
      const item = (this.state as { mode: "detail"; item: PackageItem }).item;
      this.state = { mode: "confirm", item };
    }
  }

  private handleConfirmInput(data: string) {
    if (data === "y" || data === "Y") {
      this.uninstallPackage((this.state as any).item);
    } else {
      this.state = { mode: "list" };
    }
  }

  private uninstallPackage(item: PackageItem) {
    this.state = { mode: "uninstalling", item, output: [] };

    const cmd = this.mode === "brew" ? "brew" : "npm";
    const args = this.mode === "brew"
      ? ["uninstall", item.name]
      : ["uninstall", "-g", item.name];

    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    });

    const output: string[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString().trim()));
    child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString().trim()));
    child.on("close", (code: number | null) => {
      this.state = { mode: "done", item, success: code === 0 };
    });
    child.on("error", () => {
      this.state = { mode: "done", item, success: false };
    });
  }

  private handleListInput(data: string) {
    if (this.isFilterMode) {
      if (matchesKey(data, "escape")) {
        if (this.filter) {
          this.filter = "";
          this.applyFilter();
        } else {
          this.isFilterMode = false;
        }
        return;
      }
      if (matchesKey(data, "enter")) {
        this.isFilterMode = false;
        return;
      }
      if (matchesKey(data, "backspace")) {
        this.filter = this.filter.slice(0, -1);
        this.applyFilter();
        return;
      }
      if (data.length === 1 && data >= " ") {
        this.filter += data;
        this.applyFilter();
        return;
      }
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.adjustScroll();
      }
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.selectedIndex < this.filteredItems.length - 1) {
        this.selectedIndex++;
        this.adjustScroll();
      }
    } else if (matchesKey(data, "enter")) {
      if (this.filteredItems[this.selectedIndex]) {
        this.state = { mode: "detail", item: this.filteredItems[this.selectedIndex] };
      }
    } else if (data === "/" || data === "f") {
      this.isFilterMode = true;
    } else if (data.length === 1 && data >= " " && !this.isFilterMode) {
      this.isFilterMode = true;
      this.filter = data;
      this.applyFilter();
    }
  }

  private applyFilter() {
    const f = this.filter.toLowerCase();
    this.filteredItems = f
      ? this.items.filter((i) => i.name.toLowerCase().includes(f) || i.description.toLowerCase().includes(f))
      : [...this.items];
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(this.filteredItems.length - 1, 0));
    this.scrollOffset = 0;
  }

  private adjustScroll() {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
  }

  render(width: number): string[] {
    switch (this.state.mode) {
      case "detail":
        return this.renderDetail(width);
      case "confirm":
        return this.renderConfirm(width);
      case "uninstalling":
        return this.renderUninstalling(width);
      case "done":
        return this.renderDone(width);
      default:
        return this.renderList(width);
    }
  }

  private renderList(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");

    if (this.isFilterMode || this.filter) {
      const filterText = this.filter || "";
      lines.push(
        pad + chalk.cyan("Filter: ") + filterText + (this.isFilterMode ? chalk.cyan("▌") : "")
      );
      lines.push("");
    }

    const title = this.mode === "brew" ? "Homebrew Packages" : "npm Global Packages";
    lines.push(pad + chalk.bold(title) + chalk.dim(` (${this.filteredItems.length})`));
    lines.push("");

    if (this.filteredItems.length === 0) {
      lines.push(pad + chalk.dim("No packages found"));
      return lines;
    }

    const maxVisible = 30;
    if (this.selectedIndex >= this.scrollOffset + maxVisible) {
      this.scrollOffset = this.selectedIndex - maxVisible + 1;
    }
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }

    const visibleSlice = this.filteredItems.slice(
      this.scrollOffset,
      this.scrollOffset + maxVisible
    );

    for (let i = 0; i < visibleSlice.length; i++) {
      const item = visibleSlice[i];
      const idx = this.scrollOffset + i;
      const isSelected = idx === this.selectedIndex;

      let prefix: string;
      let nameStr: string;

      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        nameStr = chalk.bold.cyan(item.name);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        nameStr = chalk.white(item.name);
      } else {
        prefix = "  ";
        nameStr = chalk.white(item.name);
      }

      const sizeStr = chalk.yellow(formatBytes(item.sizeBytes));
      const depBadge = item.isDep ? chalk.dim(" [dep]") : "";

      const projectLinks = this.links.get(item.name);
      const linkStr = projectLinks
        ? chalk.dim(" → ") + chalk.green(projectLinks.map((l) => l.projectName).join(", "))
        : "";

      const line = prefix + nameStr + "  " + sizeStr + depBadge + linkStr;
      lines.push(pad + truncateToWidth(line, maxW));
    }

    if (this.filteredItems.length > maxVisible) {
      const total = this.filteredItems.length;
      const pos = this.scrollOffset + 1;
      lines.push("");
      lines.push(pad + chalk.dim(`${pos}–${Math.min(pos + maxVisible - 1, total)} of ${total}`));
    }

    lines.push("");
    lines.push(pad + chalk.dim("↑/↓ navigate  Enter detail  / filter  Esc clear"));

    return lines;
  }

  private renderDetail(width: number): string[] {
    const item = (this.state as { mode: "detail"; item: PackageItem }).item;
    const lines: string[] = [];
    const pad = "  ";

    lines.push("");
    lines.push(pad + chalk.bold.cyan(item.name) + chalk.dim(` v${item.version}`));
    lines.push("");

    if (item.description) {
      lines.push(pad + chalk.white(item.description));
      lines.push("");
    }

    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(item.sizeBytes)));

    if (item.isDep !== undefined) {
      lines.push(
        pad + chalk.dim("Type: ") +
        (item.isDep ? chalk.dim("Transitive dependency") : chalk.green("Directly installed"))
      );
    }

    if (item.dependencies && item.dependencies.length > 0) {
      lines.push("");
      lines.push(pad + chalk.dim("Dependencies:"));
      for (const dep of item.dependencies.slice(0, 20)) {
        lines.push(pad + "  " + chalk.white(dep));
      }
      if (item.dependencies.length > 20) {
        lines.push(pad + chalk.dim(`  ... and ${item.dependencies.length - 20} more`));
      }
    }

    const projectLinks = this.links.get(item.name);
    if (projectLinks && projectLinks.length > 0) {
      lines.push("");
      lines.push(pad + chalk.dim("Used in projects:"));
      for (const link of projectLinks) {
        lines.push(pad + "  " + chalk.green(link.projectName));
        for (const file of link.files.slice(0, 5)) {
          lines.push(pad + "    " + chalk.dim(file));
        }
      }
    } else {
      lines.push("");
      lines.push(pad + chalk.dim("No project links found"));
    }

    lines.push("");
    lines.push(pad + chalk.dim("Esc/q back  Enter uninstall"));

    return lines;
  }

  private renderConfirm(width: number): string[] {
    const item = (this.state as { mode: "confirm"; item: PackageItem }).item;
    const lines: string[] = [];
    const pad = "  ";
    const cmd = this.mode === "brew" ? `brew uninstall ${item.name}` : `npm uninstall -g ${item.name}`;

    lines.push("");
    lines.push(pad + chalk.bold.red("Uninstall ") + chalk.bold(item.name) + chalk.bold.red("?"));
    lines.push("");
    lines.push(pad + chalk.dim("Command: ") + cmd);
    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(formatBytes(item.sizeBytes)));

    const projectLinks = this.links.get(item.name);
    if (projectLinks && projectLinks.length > 0) {
      lines.push("");
      lines.push(pad + chalk.yellow("Warning: Used by ") + chalk.bold(projectLinks.map(l => l.projectName).join(", ")));
    }

    lines.push("");
    lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));

    return lines;
  }

  private renderUninstalling(width: number): string[] {
    const item = (this.state as { mode: "uninstalling"; item: PackageItem }).item;
    const lines: string[] = [];
    const pad = "  ";

    lines.push("");
    lines.push(pad + chalk.yellow("Uninstalling " + item.name + "..."));

    return lines;
  }

  private renderDone(width: number): string[] {
    const { item, success } = this.state as { mode: "done"; item: PackageItem; success: boolean };
    const lines: string[] = [];
    const pad = "  ";

    lines.push("");
    if (success) {
      lines.push(pad + chalk.green("Uninstalled ") + chalk.bold(item.name));
    } else {
      lines.push(pad + chalk.red("Failed to uninstall ") + chalk.bold(item.name));
    }
    lines.push("");
    lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));

    return lines;
  }
}
