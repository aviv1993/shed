import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("../../darwin/utils.js", () => ({
  duSize: vi.fn(),
}));

import { readdir, readFile } from "node:fs/promises";
import { duSize } from "../../darwin/utils.js";
import { collectNpmGlobals } from "../../darwin/collectors/npm-globals.js";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectNpmGlobals", () => {
  it("returns empty when readdir fails", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await collectNpmGlobals();
    expect(result.packages).toEqual([]);
    expect(result.totalBytes).toBe(0);
  });

  it("parses regular packages", async () => {
    mockReaddir.mockResolvedValue(["typescript", "npm", ".package-lock.json"] as any);
    mockReadFile.mockResolvedValue('{"version":"5.0.0","description":"TypeScript language"}' as any);
    mockDuSize.mockResolvedValue(50 * 1024);

    const result = await collectNpmGlobals();
    // Should skip "npm" and dotfiles
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe("typescript");
    expect(result.packages[0].version).toBe("5.0.0");
  });

  it("handles scoped packages", async () => {
    mockReaddir
      .mockResolvedValueOnce(["@angular"] as any) // top-level
      .mockResolvedValueOnce(["cli"] as any);     // inside @angular

    mockReadFile.mockResolvedValue('{"version":"16.0.0"}' as any);
    mockDuSize.mockResolvedValue(100 * 1024);

    const result = await collectNpmGlobals();
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe("@angular/cli");
  });

  it("sorts by size descending", async () => {
    mockReaddir.mockResolvedValue(["small-pkg", "big-pkg"] as any);
    mockReadFile.mockResolvedValue('{"version":"1.0.0"}' as any);

    let callCount = 0;
    mockDuSize.mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? 100 : 5000;
    });

    const result = await collectNpmGlobals();
    expect(result.packages[0].name).toBe("big-pkg");
  });
});
