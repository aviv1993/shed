import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils.js", () => ({
  duSize: vi.fn(),
}));

import { duSize } from "../../utils.js";
import { collectDevCaches } from "../../collectors/dev-caches.js";

const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectDevCaches", () => {
  it("returns empty when nothing exists", async () => {
    mockDuSize.mockResolvedValue(0);
    const result = await collectDevCaches();
    expect(result.groups).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.totalBytes).toBe(0);
  });

  it("groups entries by tool", async () => {
    // Only VS Code entries will have size > 0
    mockDuSize.mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("vscode")) return 1024 * 1024;
      if (typeof path === "string" && path.includes("Code")) return 512 * 1024;
      return 0;
    });

    const result = await collectDevCaches();
    const vsCodeGroup = result.groups.find(g => g.tool === "VS Code");
    if (vsCodeGroup) {
      expect(vsCodeGroup.entries.length).toBeGreaterThan(0);
      expect(vsCodeGroup.totalBytes).toBeGreaterThan(0);
    }
  });

  it("sorts groups by total size descending", async () => {
    mockDuSize.mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("DerivedData")) return 10 * 1024 * 1024;
      if (typeof path === "string" && path.includes("vscode")) return 1024;
      return 0;
    });

    const result = await collectDevCaches();
    if (result.groups.length >= 2) {
      expect(result.groups[0].totalBytes).toBeGreaterThanOrEqual(result.groups[1].totalBytes);
    }
  });

  it("includes warning messages for non-cleanable entries", async () => {
    // Make VS Code Extensions have size
    mockDuSize.mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("vscode/extensions")) return 500 * 1024 * 1024;
      return 0;
    });

    const result = await collectDevCaches();
    const extEntry = result.entries.find(e => e.label === "Extensions");
    expect(extEntry).toBeDefined();
    expect(extEntry!.cleanable).toBe(false);
    expect(extEntry!.warningMessage).toContain("VS Code extensions");
  });

  it("marks cleanable entries correctly", async () => {
    mockDuSize.mockImplementation(async (path) => {
      if (typeof path === "string" && path.includes("DerivedData")) return 1024;
      if (typeof path === "string" && path.includes("Xcode.app")) return 5000;
      return 0;
    });

    const result = await collectDevCaches();
    const derived = result.entries.find(e => e.label === "DerivedData");
    const xcode = result.entries.find(e => e.label === "Xcode.app");
    if (derived) expect(derived.cleanable).toBe(true);
    if (xcode) expect(xcode.cleanable).toBe(false);
  });
});
