import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadCachedData, saveCachedData } from "../cache.js";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadCachedData", () => {
  it("returns null when no cache file", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    expect(await loadCachedData()).toBeNull();
  });

  it("returns null when cache is expired", async () => {
    const old = JSON.stringify({ _timestamp: Date.now() - 25 * 60 * 60 * 1000, foo: 1 });
    mockReadFile.mockResolvedValue(old as any);
    expect(await loadCachedData()).toBeNull();
  });

  it("returns data when cache is fresh", async () => {
    const data = { _timestamp: Date.now(), foo: "bar", links: [["a", "b"]] };
    mockReadFile.mockResolvedValue(JSON.stringify(data) as any);

    const result = await loadCachedData();
    expect(result).not.toBeNull();
    expect(result.foo).toBe("bar");
    // links should be restored as a Map
    expect(result.links).toBeInstanceOf(Map);
    expect(result.links.get("a")).toBe("b");
  });
});

describe("saveCachedData", () => {
  it("creates cache dir and writes file", async () => {
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);

    await saveCachedData({ foo: 1, links: new Map([["x", "y"]]) });

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining("depwatch"), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(written.foo).toBe(1);
    expect(written._timestamp).toBeTypeOf("number");
    // Map should be serialized to array
    expect(written.links).toEqual([["x", "y"]]);
  });

  it("swallows errors silently", async () => {
    mockMkdir.mockRejectedValue(new Error("EACCES"));
    // Should not throw
    await saveCachedData({ foo: 1, links: new Map() });
  });
});
