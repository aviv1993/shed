import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../darwin/utils.js", () => ({
  duSize: vi.fn().mockResolvedValue(0),
  run: vi.fn().mockResolvedValue(""),
}));

vi.mock("node:child_process", () => {
  const EventEmitter = require("node:events");
  return {
    spawn: vi.fn(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      // Auto-close after next tick
      process.nextTick(() => child.emit("close", 0));
      return child;
    }),
  };
});

import { duSize, run } from "../darwin/utils.js";
import { collectCleanupActions, runCleanupAction } from "../darwin/cleanup.js";
import type { CleanupAction } from "../types.js";

const mockDuSize = vi.mocked(duSize);
const mockRun = vi.mocked(run);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectCleanupActions", () => {
  it("returns all cleanup action definitions", async () => {
    const data = await collectCleanupActions();
    expect(data.actions.length).toBeGreaterThan(0);
    expect(data.actions[0]).toHaveProperty("id");
    expect(data.actions[0]).toHaveProperty("label");
    expect(data.actions[0]).toHaveProperty("command");
    expect(data.actions[0]).toHaveProperty("args");
  });

  it("estimates size for brew-cleanup", async () => {
    mockRun.mockImplementation(async (cmd, args) => {
      if (cmd === "brew" && args?.[0] === "--cache") return "/cache/path\n";
      return "";
    });
    mockDuSize.mockResolvedValue(1024 * 1024);

    const data = await collectCleanupActions();
    const brewCleanup = data.actions.find(a => a.id === "brew-cleanup");
    expect(brewCleanup?.sizeBytes).toBe(1024 * 1024);
  });
});

describe("runCleanupAction", () => {
  it("calls onDone with exit code", async () => {
    const action: CleanupAction = {
      id: "test",
      label: "Test",
      description: "test",
      command: "echo",
      args: ["hello"],
      sizeBytes: 0,
    };

    const onData = vi.fn();
    const onDone = vi.fn();
    runCleanupAction(action, onData, onDone);

    // Wait for the nextTick close event
    await new Promise(r => setTimeout(r, 10));
    expect(onDone).toHaveBeenCalledWith(0);
  });

  it("returns a kill function", () => {
    const action: CleanupAction = {
      id: "test",
      label: "Test",
      description: "test",
      command: "sleep",
      args: ["10"],
      sizeBytes: 0,
    };

    const kill = runCleanupAction(action, vi.fn(), vi.fn());
    expect(typeof kill).toBe("function");
  });
});
