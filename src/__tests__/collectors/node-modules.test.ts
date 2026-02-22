import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("../../darwin/utils.js", () => ({
  duSize: vi.fn(),
}));

import { readdir, readFile, stat } from "node:fs/promises";
import { duSize } from "../../darwin/utils.js";
import { scanNodeModulesPackages } from "../../darwin/collectors/node-modules.js";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);
const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scanNodeModulesPackages", () => {
  it("returns empty when readdir fails", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await scanNodeModulesPackages("/fake/node_modules");
    expect(result).toEqual([]);
  });

  it("skips dotfiles", async () => {
    mockReaddir.mockResolvedValue([".cache", ".package-lock.json", "lodash"] as any);
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReadFile.mockResolvedValue('{"version":"4.17.21"}' as any);
    mockDuSize.mockResolvedValue(1024);

    const result = await scanNodeModulesPackages("/fake/node_modules");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("lodash");
  });

  it("handles scoped packages", async () => {
    mockReaddir
      .mockResolvedValueOnce(["@babel"] as any)
      .mockResolvedValueOnce(["core", "parser"] as any);

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReadFile.mockResolvedValue('{"version":"7.0.0"}' as any);
    mockDuSize.mockResolvedValue(2048);

    const result = await scanNodeModulesPackages("/fake/node_modules");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("@babel/core");
  });

  it("sorts by size descending", async () => {
    mockReaddir.mockResolvedValue(["small", "big"] as any);
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReadFile.mockResolvedValue('{"version":"1.0.0"}' as any);

    let callCount = 0;
    mockDuSize.mockImplementation(async () => {
      callCount++;
      return callCount === 1 ? 100 : 5000;
    });

    const result = await scanNodeModulesPackages("/fake/node_modules");
    expect(result[0].name).toBe("big");
  });

  it("skips packages with 0 size", async () => {
    mockReaddir.mockResolvedValue(["empty-pkg"] as any);
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReadFile.mockResolvedValue('{"version":"1.0.0"}' as any);
    mockDuSize.mockResolvedValue(0);

    const result = await scanNodeModulesPackages("/fake/node_modules");
    expect(result).toHaveLength(0);
  });
});
