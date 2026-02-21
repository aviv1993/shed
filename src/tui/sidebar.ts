import type { Component } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import chalk from "chalk";

export type SidebarTab =
  | "dashboard"
  | "brew"
  | "npm"
  | "node-modules"
  | "docker"
  | "apps"
  | "ides"
  | "git-repos"
  | "cache-cleanups";

interface SidebarItem {
  tab: SidebarTab | null; // null = separator
  label: string;
  count?: number;
}

export class Sidebar implements Component {
  private items: SidebarItem[] = [];
  private selectedIndex = 0;
  focused = true;
  onChange?: (tab: SidebarTab) => void;

  constructor() {
    this.items = [
      { tab: "dashboard", label: "Dashboard" },
      { tab: "brew", label: "Brew" },
      { tab: "npm", label: "npm globals" },
      { tab: "node-modules", label: "node_modules" },
      { tab: "docker", label: "Docker" },
      { tab: "apps", label: "Apps" },
      { tab: "ides", label: "IDEs" },
      { tab: "git-repos", label: "Git Repos" },
      { tab: null, label: "──────────" },
      { tab: "cache-cleanups", label: "Cache Cleanups" },
    ];
  }

  setCounts(counts: Partial<Record<SidebarTab, number>>) {
    for (const item of this.items) {
      if (item.tab && counts[item.tab] !== undefined) {
        item.count = counts[item.tab];
      }
    }
  }

  getSelectedTab(): SidebarTab {
    return this.items[this.selectedIndex].tab ?? "dashboard";
  }

  selectTab(tab: SidebarTab) {
    const idx = this.items.findIndex((item) => item.tab === tab);
    if (idx >= 0) {
      this.selectedIndex = idx;
      this.onChange?.(tab);
    }
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.moveUp();
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.moveDown();
    }
  }

  private moveUp() {
    let next = this.selectedIndex - 1;
    while (next >= 0 && this.items[next].tab === null) next--;
    if (next >= 0) {
      this.selectedIndex = next;
      this.onChange?.(this.items[next].tab!);
    }
  }

  private moveDown() {
    let next = this.selectedIndex + 1;
    while (next < this.items.length && this.items[next].tab === null) next++;
    if (next < this.items.length) {
      this.selectedIndex = next;
      this.onChange?.(this.items[next].tab!);
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(""); // top padding

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];

      if (item.tab === null) {
        lines.push(chalk.dim("  " + "─".repeat(Math.max(width - 4, 6))));
        continue;
      }

      const isSelected = i === this.selectedIndex;
      let label = item.label;
      if (item.count !== undefined && item.count > 0) {
        label += ` (${item.count})`;
      }

      if (isSelected && this.focused) {
        lines.push(chalk.cyan("▸ ") + chalk.bold.cyan(label));
      } else if (isSelected) {
        lines.push(chalk.dim("▸ ") + chalk.white(label));
      } else {
        lines.push("  " + chalk.dim(label));
      }
    }

    lines.push("");
    return lines;
  }
}
