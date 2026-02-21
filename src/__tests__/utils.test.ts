import { describe, it, expect } from "vitest";
import { formatBytes, renderProgressBar } from "../utils.js";

describe("formatBytes", () => {
  it("returns '0 B' for 0", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("returns '0 B' for negative", () => {
    expect(formatBytes(-5)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("rounds large values", () => {
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
  });

  it("shows one decimal for small values", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("renderProgressBar", () => {
  it("renders empty bar for 0/0", () => {
    expect(renderProgressBar(0, 0, 10)).toBe("[░░░░░░░░░░] 0/0");
  });

  it("renders full bar when done", () => {
    expect(renderProgressBar(10, 10, 10)).toBe("[██████████] 10/10");
  });

  it("renders half bar", () => {
    expect(renderProgressBar(5, 10, 10)).toBe("[█████░░░░░] 5/10");
  });

  it("renders partial progress", () => {
    const result = renderProgressBar(3, 10, 20);
    expect(result).toContain("3/10");
    expect(result).toMatch(/^\[█{6}░{14}\] 3\/10$/);
  });

  it("clamps to 100%", () => {
    expect(renderProgressBar(15, 10, 10)).toBe("[██████████] 15/10");
  });
});
