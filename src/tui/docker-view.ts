import { spawn } from "node:child_process";
import type { Component } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { DockerData, DockerImage, DockerContainer, DockerVolume } from "../collectors/docker.js";
import { formatBytes } from "../utils.js";
import { spinnerFrame, formatElapsed } from "./spinner.js";

interface FlatItem {
  type: "image" | "container" | "volume" | "header" | "build-cache";
  label: string;
  sizeStr: string;
  extra: string;
  selectable: boolean;
  // For delete operations
  image?: DockerImage;
  container?: DockerContainer;
  volume?: DockerVolume;
}

type ViewState =
  | { mode: "list" }
  | { mode: "confirm"; item: FlatItem }
  | { mode: "deleting"; item: FlatItem }
  | { mode: "done"; item: FlatItem; success: boolean; output: string };

export class DockerView implements Component {
  private data: DockerData | null = null;
  private items: FlatItem[] = [];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private state: ViewState = { mode: "list" };
  private spinnerTick = 0;
  private spinnerStart = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  focused = false;
  onRefreshData?: () => void;
  onRequestRender?: () => void;
  onBack?: () => void;

  setData(data: DockerData) {
    this.data = data;
    this.buildItemList();
  }

  private buildItemList() {
    const d = this.data;
    if (!d || !d.online) {
      this.items = [];
      return;
    }

    const items: FlatItem[] = [];

    // Images section
    const imgTotal = d.images.reduce((s, i) => s + i.sizeBytes, 0);
    items.push({
      type: "header", label: `Images (${d.images.length})`,
      sizeStr: formatSizeApprox(imgTotal), extra: "", selectable: false,
    });
    for (const img of d.images) {
      const name = `${img.repository}:${img.tag}`;
      const projStr = img.linkedProjects.length > 0
        ? " → " + img.linkedProjects.join(", ")
        : "";
      items.push({
        type: "image", label: name, sizeStr: img.sizeStr,
        extra: projStr, selectable: true, image: img,
      });
    }
    if (d.images.length === 0) {
      items.push({ type: "header", label: "  No images", sizeStr: "", extra: "", selectable: false });
    }

    // Containers section
    items.push({ type: "header", label: "", sizeStr: "", extra: "", selectable: false }); // spacer
    items.push({
      type: "header", label: `Containers (${d.containers.length})`,
      sizeStr: "", extra: "", selectable: false,
    });
    for (const c of d.containers) {
      const projStr = c.linkedProjects.length > 0
        ? " → " + c.linkedProjects.join(", ")
        : "";
      items.push({
        type: "container", label: c.name, sizeStr: c.sizeStr,
        extra: `${c.state}${projStr}`, selectable: true, container: c,
      });
    }
    if (d.containers.length === 0) {
      items.push({ type: "header", label: "  No containers", sizeStr: "", extra: "", selectable: false });
    }

    // Volumes section
    items.push({ type: "header", label: "", sizeStr: "", extra: "", selectable: false });
    items.push({
      type: "header", label: `Volumes (${d.volumes.length})`,
      sizeStr: "", extra: "", selectable: false,
    });
    for (const v of d.volumes) {
      items.push({
        type: "volume", label: v.name, sizeStr: v.sizeStr,
        extra: "", selectable: true, volume: v,
      });
    }
    if (d.volumes.length === 0) {
      items.push({ type: "header", label: "  No volumes", sizeStr: "", extra: "", selectable: false });
    }

    // Build cache
    items.push({ type: "header", label: "", sizeStr: "", extra: "", selectable: false });
    items.push({
      type: "build-cache",
      label: "Build Cache",
      sizeStr: d.buildCacheSizeStr,
      extra: `${d.buildCacheReclaimableStr} reclaimable`,
      selectable: false,
    });

    this.items = items;
    // Ensure selectedIndex is on a selectable item
    if (this.items.length > 0 && !this.items[this.selectedIndex]?.selectable) {
      this.moveToNextSelectable(1);
    }
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
        } else if (matchesKey(data, "enter") || matchesKey(data, "delete") || matchesKey(data, "backspace")) {
          const item = this.items[this.selectedIndex];
          if (item?.selectable) {
            this.state = { mode: "confirm", item };
          }
        } else if (matchesKey(data, "left")) {
          this.onBack?.();
        }
        break;
      case "confirm":
        if (data === "y" || data === "Y") {
          this.deleteItem((this.state as { mode: "confirm"; item: FlatItem }).item);
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

  private deleteItem(item: FlatItem) {
    this.state = { mode: "deleting", item };
    this.startSpinner();

    let cmd: string;
    let args: string[];

    if (item.type === "image" && item.image) {
      cmd = "docker";
      args = ["rmi", item.image.id];
    } else if (item.type === "container" && item.container) {
      cmd = "docker";
      args = ["rm", "-f", item.container.name];
    } else if (item.type === "volume" && item.volume) {
      cmd = "docker";
      args = ["volume", "rm", item.volume.name];
    } else {
      this.stopSpinner();
      return;
    }

    const output: string[] = [];
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString().trim()));
    child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString().trim()));
    child.on("close", (code: number | null) => {
      this.stopSpinner();
      this.state = { mode: "done", item, success: code === 0, output: output.join("\n") };
      this.onRequestRender?.();
    });
    child.on("error", (err: Error) => {
      this.stopSpinner();
      this.state = { mode: "done", item, success: false, output: err.message };
      this.onRequestRender?.();
    });
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const pad = "  ";
    const maxW = width - 4;

    lines.push("");
    lines.push(pad + chalk.bold("Docker"));
    lines.push("");

    if (!this.data) {
      lines.push(pad + chalk.dim("Loading..."));
      return lines;
    }

    if (!this.data.online) {
      lines.push(pad + chalk.yellow("Docker is offline"));
      lines.push(pad + chalk.dim("Start Docker/Colima to see Docker data"));
      return lines;
    }

    if (this.state.mode === "confirm") {
      return this.renderConfirm(width, lines);
    }
    if (this.state.mode === "deleting") {
      const item = (this.state as { mode: "deleting"; item: FlatItem }).item;
      lines.push(pad + chalk.yellow(`Deleting ${item.label}... ${spinnerFrame(this.spinnerTick)} ${formatElapsed(this.spinnerStart)}`));
      return lines;
    }
    if (this.state.mode === "done") {
      return this.renderDone(width, lines);
    }

    // List view
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

      if (item.type === "header") {
        if (item.label === "") {
          lines.push("");
        } else if (item.sizeStr) {
          lines.push(pad + chalk.bold.white(item.label) + chalk.dim(`  ${item.sizeStr}`));
          lines.push(pad + chalk.dim("─".repeat(Math.min(maxW, 60))));
        } else if (item.label.startsWith("  ")) {
          lines.push(pad + chalk.dim(item.label));
        } else {
          lines.push(pad + chalk.bold.white(item.label));
          lines.push(pad + chalk.dim("─".repeat(Math.min(maxW, 60))));
        }
        continue;
      }

      if (item.type === "build-cache") {
        lines.push(
          pad + chalk.bold.white(item.label) +
          "  " + chalk.yellow(item.sizeStr) +
          chalk.dim(` (${item.extra})`)
        );
        continue;
      }

      let prefix: string;
      let label: string;

      if (isSelected && this.focused) {
        prefix = chalk.cyan("▸ ");
        label = chalk.bold.cyan(item.label);
      } else if (isSelected) {
        prefix = chalk.dim("▸ ");
        label = chalk.white(item.label);
      } else {
        prefix = "  ";
        label = chalk.white(item.label);
      }

      let extraStr = "";
      if (item.extra) {
        if (item.type === "container") {
          const parts = item.extra.split(" → ");
          const stateColor = parts[0] === "running" ? chalk.green : chalk.dim;
          extraStr = "  " + stateColor(parts[0]);
          if (parts[1]) {
            extraStr += chalk.dim(" → ") + chalk.green(parts[1]);
          }
        } else {
          extraStr = chalk.dim(" → ") + chalk.green(item.extra);
        }
      }

      lines.push(pad + truncateToWidth(
        prefix + label + "  " + chalk.yellow(item.sizeStr) + extraStr,
        maxW
      ));
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

  getFooterHint(): string {
    switch (this.state.mode) {
      case "confirm": return "y confirm  any key cancel";
      case "deleting": return "";
      case "done": return "Enter continue";
      default: return "↑↓ navigate  Enter delete";
    }
  }

  private renderConfirm(width: number, lines: string[]): string[] {
    const pad = "  ";
    const item = (this.state as { mode: "confirm"; item: FlatItem }).item;

    const typeLabel = item.type === "image" ? "image" : item.type === "container" ? "container" : "volume";
    lines.push(pad + chalk.bold.red(`Remove Docker ${typeLabel} `) + chalk.bold(item.label) + chalk.bold.red("?"));
    lines.push("");
    lines.push(pad + chalk.dim("Size: ") + chalk.yellow(item.sizeStr));

    if (item.type === "container" && item.container?.state === "running") {
      lines.push("");
      lines.push(pad + chalk.yellow("Warning: Container is running — it will be force-stopped."));
    }

    if (item.extra && item.extra.includes("→")) {
      lines.push("");
      lines.push(pad + chalk.yellow("Linked to: ") + item.extra.replace(/.*→\s*/, ""));
    }

    lines.push("");
    lines.push(pad + chalk.white("Press ") + chalk.bold.red("y") + chalk.white(" to confirm, any other key to cancel"));
    return lines;
  }

  private renderDone(width: number, lines: string[]): string[] {
    const pad = "  ";
    const { item, success } = this.state as { mode: "done"; item: FlatItem; success: boolean; output: string };

    if (success) {
      lines.push(pad + chalk.green("Removed ") + chalk.bold(item.label));
    } else {
      lines.push(pad + chalk.red("Failed to remove ") + chalk.bold(item.label));
    }
    lines.push("");
    lines.push(pad + chalk.dim("Press Enter to continue (data will refresh)"));
    return lines;
  }
}

function formatSizeApprox(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
