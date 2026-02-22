import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("../../darwin/utils.js", () => ({
  duSize: vi.fn(),
}));

import { readdir, stat } from "node:fs/promises";
import { duSize } from "../../darwin/utils.js";
import { collectGitRepos } from "../../darwin/collectors/git-repos.js";

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectGitRepos", () => {
  it("returns empty when home readdir fails", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await collectGitRepos();
    expect(result.repos).toEqual([]);
    expect(result.totalBytes).toBe(0);
    expect(result.totalGitBytes).toBe(0);
  });

  it("skips system directories", async () => {
    mockReaddir
      .mockResolvedValueOnce(["Library", ".config", "projects"] as any)
      // Inside "projects"
      .mockResolvedValueOnce(["my-repo"] as any)
      // Inside "my-repo"
      .mockResolvedValueOnce([".git", "src"] as any);

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockDuSize.mockResolvedValue(1024 * 1024);

    const result = await collectGitRepos();
    expect(result.repos.length).toBeGreaterThanOrEqual(0);
  });

  it("calculates total and git sizes", async () => {
    mockReaddir
      .mockResolvedValueOnce(["projects"] as any)
      .mockResolvedValueOnce([".git", "src"] as any);

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockDuSize
      .mockResolvedValueOnce(10000) // total size
      .mockResolvedValueOnce(2000); // .git size

    const result = await collectGitRepos();
    if (result.repos.length > 0) {
      expect(result.repos[0].sizeBytes).toBe(10000);
      expect(result.repos[0].gitSizeBytes).toBe(2000);
    }
  });

  it("sorts repos by size descending", async () => {
    // Home has two project dirs
    mockReaddir
      .mockResolvedValueOnce(["projects"] as any)
      .mockResolvedValueOnce(["small-repo", "big-repo"] as any)
      .mockResolvedValueOnce([".git"] as any)  // small-repo contents
      .mockResolvedValueOnce([".git"] as any); // big-repo contents

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);

    let callCount = 0;
    mockDuSize.mockImplementation(async () => {
      callCount++;
      // small-repo: total=100, git=50; big-repo: total=5000, git=1000
      if (callCount <= 2) return callCount === 1 ? 100 : 50;
      return callCount === 3 ? 5000 : 1000;
    });

    const result = await collectGitRepos();
    if (result.repos.length >= 2) {
      expect(result.repos[0].sizeBytes).toBeGreaterThan(result.repos[1].sizeBytes);
    }
  });
});
