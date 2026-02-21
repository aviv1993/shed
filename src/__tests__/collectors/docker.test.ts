import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils.js", () => ({
  run: vi.fn(),
}));

import { run } from "../../utils.js";
import { collectDocker } from "../../collectors/docker.js";

const mockRun = vi.mocked(run);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectDocker", () => {
  it("returns offline when docker info fails", async () => {
    mockRun.mockResolvedValue("");
    const result = await collectDocker();
    expect(result.online).toBe(false);
    expect(result.images).toEqual([]);
    expect(result.containers).toEqual([]);
  });

  it("parses images from docker output", async () => {
    mockRun.mockImplementation(async (cmd, args) => {
      if (args?.[0] === "info") return "abc123\n";
      if (args?.[0] === "images") {
        return JSON.stringify({
          Repository: "node",
          Tag: "20-alpine",
          ID: "abc123",
          Size: "150MB",
        }) + "\n";
      }
      if (args?.[0] === "ps") return "";
      if (args?.[0] === "volume") return "";
      if (args?.[0] === "system") return "";
      if (args?.[0] === "inspect") return "[]";
      return "";
    });

    const result = await collectDocker();
    expect(result.online).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].repository).toBe("node");
    expect(result.images[0].tag).toBe("20-alpine");
  });

  it("parses containers", async () => {
    mockRun.mockImplementation(async (cmd, args) => {
      if (args?.[0] === "info") return "abc123\n";
      if (args?.[0] === "images") return "";
      if (args?.[0] === "ps") {
        return JSON.stringify({
          Names: "my-container",
          Image: "node:20",
          State: "running",
          Size: "50MB",
        }) + "\n";
      }
      if (args?.[0] === "volume") return "";
      if (args?.[0] === "system") return "";
      if (args?.[0] === "inspect") return "[]";
      return "";
    });

    const result = await collectDocker();
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].name).toBe("my-container");
    expect(result.containers[0].state).toBe("running");
  });

  it("parses docker system df output for build cache", async () => {
    // docker system df output: TYPE  TOTAL  ACTIVE  SIZE  RECLAIMABLE
    const dfOutput = [
      "TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE",
      "Images          5         2         1.5GB     500MB",
      "Containers      3         1         100MB     50MB",
      "Local Volumes   2         1         200MB     100MB",
      "Build Cache     10        0         800MB     800MB",
    ].join("\n");

    mockRun.mockImplementation(async (_cmd, args) => {
      const a = args ?? [];
      if (a[0] === "info") return "abc\n";
      if (a[0] === "images") return "";
      if (a[0] === "ps") return "";
      if (a[0] === "volume") return "";
      if (a[0] === "system") return dfOutput;
      if (a[0] === "inspect") return "[]";
      return "";
    });

    const result = await collectDocker();
    expect(result.buildCacheSizeStr).toBe("800MB");
    expect(result.buildCacheReclaimableStr).toBe("800MB");
  });
});
