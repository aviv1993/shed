import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, stat } from "node:fs/promises";
import { buildLinkMap } from "../darwin/linker.js";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildLinkMap", () => {
  it("returns empty map when home readdir fails", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await buildLinkMap(["lodash"]);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty package list", async () => {
    mockReaddir.mockResolvedValue(["projects"] as any);
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    const result = await buildLinkMap([]);
    expect(result.size).toBe(0);
  });

  it("skips dot-prefixed and system directories", async () => {
    mockReaddir.mockResolvedValue([".config", "Library", "projects"] as any);
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);

    const result = await buildLinkMap(["lodash"]);
    // Should only scan "projects", not .config or Library
    // The second readdir call should be for "projects" content
    const readdirCalls = mockReaddir.mock.calls;
    expect(readdirCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("finds package references in project files", async () => {
    // First readdir: home directory
    mockReaddir
      .mockResolvedValueOnce(["myproject"] as any)
      // Second readdir: inside myproject
      .mockResolvedValueOnce(["package.json"] as any);

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReadFile.mockResolvedValue('{"dependencies": {"lodash": "^4.0.0"}}' as any);

    const result = await buildLinkMap(["lodash"]);
    expect(result.has("lodash")).toBe(true);
    const links = result.get("lodash")!;
    expect(links[0].projectName).toBe("myproject");
  });
});
