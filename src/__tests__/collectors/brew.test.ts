import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils.js", () => ({
  run: vi.fn(),
  duSize: vi.fn(),
}));

import { run, duSize } from "../../utils.js";
import { collectBrew } from "../../collectors/brew.js";

const mockRun = vi.mocked(run);
const mockDuSize = vi.mocked(duSize);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectBrew", () => {
  it("returns empty data when brew is not installed", async () => {
    mockRun.mockResolvedValue("");
    mockDuSize.mockResolvedValue(0);

    const result = await collectBrew();
    expect(result.packages).toEqual([]);
    expect(result.totalBytes).toBe(0);
  });

  it("parses brew JSON output", async () => {
    const brewJson = JSON.stringify([
      {
        name: "git",
        installed: [{ version: "2.40.0", installed_on: "2024-01-01" }],
        desc: "Version control",
        installed_on_request: true,
        dependencies: ["pcre2"],
      },
      {
        name: "pcre2",
        installed: [{ version: "10.42" }],
        desc: "Perl compatible regex",
        installed_on_request: false,
        dependencies: [],
      },
    ]);

    mockRun.mockResolvedValue(brewJson);
    mockDuSize.mockResolvedValue(1024 * 1024); // 1MB each

    const result = await collectBrew();
    expect(result.packages).toHaveLength(2);
    expect(result.packages[0].name).toBe("git");
    expect(result.packages[0].version).toBe("2.40.0");
    expect(result.packages[0].installedOnRequest).toBe(true);
    expect(result.packages[0].dependencies).toEqual(["pcre2"]);
  });

  it("returns empty packages on invalid JSON", async () => {
    mockRun.mockResolvedValue("not json");
    mockDuSize.mockResolvedValue(500);

    const result = await collectBrew();
    expect(result.packages).toEqual([]);
    expect(result.cacheBytes).toBe(500);
  });

  it("sorts packages by size descending", async () => {
    const brewJson = JSON.stringify([
      { name: "small", installed: [{ version: "1.0" }], dependencies: [] },
      { name: "big", installed: [{ version: "1.0" }], dependencies: [] },
    ]);

    mockRun.mockResolvedValue(brewJson);
    let callCount = 0;
    mockDuSize.mockImplementation(async () => {
      callCount++;
      // Cache call returns 0, then alternating sizes
      if (callCount === 1) return 0; // cache
      if (callCount === 2) return 100; // small
      return 5000; // big
    });

    const result = await collectBrew();
    expect(result.packages[0].name).toBe("big");
  });
});
