import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

vi.mock("../../utils.js", () => ({
  duSize: vi.fn(),
}));

import { readdir } from "node:fs/promises";
import { duSize } from "../../utils.js";
import { collectApps } from "../../collectors/apps.js";

const mockReaddir = vi.mocked(readdir);
const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectApps", () => {
  it("returns empty when readdir fails", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await collectApps();
    expect(result.apps).toEqual([]);
    expect(result.totalBytes).toBe(0);
  });

  it("only includes .app entries", async () => {
    mockReaddir.mockResolvedValue(["Chrome.app", "README.txt", "Firefox.app", "Utilities"] as any);
    mockDuSize.mockResolvedValue(100 * 1024 * 1024);

    const result = await collectApps();
    expect(result.apps).toHaveLength(2);
    expect(result.apps.every(a => a.name.endsWith(".app"))).toBe(true);
  });

  it("sorts by size descending", async () => {
    mockReaddir.mockResolvedValue(["Small.app", "Big.app"] as any);
    let call = 0;
    mockDuSize.mockImplementation(async () => {
      call++;
      return call === 1 ? 100 : 5000;
    });

    const result = await collectApps();
    expect(result.apps[0].name).toBe("Big.app");
  });

  it("calculates total bytes", async () => {
    mockReaddir.mockResolvedValue(["A.app", "B.app"] as any);
    mockDuSize.mockResolvedValue(1000);

    const result = await collectApps();
    expect(result.totalBytes).toBe(2000);
  });
});
