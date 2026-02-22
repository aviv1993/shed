// Re-export shared pure formatting utilities
export { formatBytes, padRight, padLeft, renderProgressBar } from "../utils.js";

import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Run a command and return stdout. Returns empty string on failure. */
export async function run(command: string, args: string[] = [], timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Run a shell command string (allows pipes, etc.). Returns empty string on failure. */
export async function runShell(command: string, timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    });
    return stdout;
  } catch {
    return "";
  }
}

/** Run du -sk on a path, return size in bytes. Returns 0 on failure. */
export async function duSize(path: string): Promise<number> {
  const output = await run("du", ["-sk", path]);
  const match = output.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) * 1024 : 0;
}

/** Run du -sk on multiple paths concurrently with a concurrency limit. */
export async function duSizeBatch(paths: string[], concurrency = 8): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const queue = [...paths];

  async function worker() {
    while (queue.length > 0) {
      const path = queue.shift()!;
      result.set(path, await duSize(path));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker));
  return result;
}

/** Get total disk size in bytes */
export async function getTotalDiskSize(): Promise<number> {
  const output = await run("df", ["-k", "/"]);
  const lines = output.trim().split("\n");
  if (lines.length < 2) return 0;
  const parts = lines[1].split(/\s+/);
  return parts.length >= 2 ? parseInt(parts[1], 10) * 1024 : 0;
}
