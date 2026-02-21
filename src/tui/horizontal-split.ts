import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

/**
 * Custom component that renders two children side-by-side.
 * Left child gets a fixed width, right child gets the remainder.
 * Fills to minHeight so the split occupies the full terminal.
 */
export class HorizontalSplit implements Component {
  left: Component;
  right: Component;
  leftWidth: number;
  minHeight = 0;
  private focus: "left" | "right" = "left";

  constructor(left: Component, right: Component, leftWidth: number) {
    this.left = left;
    this.right = right;
    this.leftWidth = leftWidth;
  }

  setFocus(side: "left" | "right") {
    this.focus = side;
  }

  invalidate(): void {
    this.left.invalidate();
    this.right.invalidate();
  }

  render(width: number): string[] {
    const lw = this.leftWidth;
    const borderWidth = 1;
    const rw = width - lw - borderWidth;

    if (rw < 10) {
      return this.right.render(width);
    }

    const leftLines = this.left.render(lw);
    const rightLines = this.right.render(rw);
    const contentLines = Math.max(leftLines.length, rightLines.length);
    const totalLines = Math.max(contentLines, this.minHeight);

    const borderChar = chalk.dim("│");

    const result: string[] = [];
    const emptyLeft = " ".repeat(lw);
    const emptyRight = " ".repeat(rw);

    for (let i = 0; i < totalLines; i++) {
      const ll = i < leftLines.length ? padToWidth(leftLines[i], lw) : emptyLeft;
      const rl = i < rightLines.length ? padToWidth(rightLines[i], rw) : emptyRight;
      result.push(ll + borderChar + rl);
    }

    return result;
  }
}

function padToWidth(line: string, targetWidth: number): string {
  const w = visibleWidth(line);
  if (w >= targetWidth) {
    return truncateToWidth(line, targetWidth, "", true);
  }
  return line + " ".repeat(targetWidth - w);
}
