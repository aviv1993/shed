/**
 * Windows-specific utility functions for shed.
 */
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { SKIP_DIRS } from "./constants.js";

// Re-export shared pure formatting utilities
export { formatBytes, padRight, padLeft, renderProgressBar } from "../utils.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * Run a command and return stdout. Throws on non-zero exit.
 */
export async function run(cmd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 50 * 1024 * 1024 });
    return stdout;
}

/**
 * Run a shell command (allows pipes, redirection, etc.) and return stdout.
 */
export async function runShell(cmd: string): Promise<string> {
    const { stdout } = await execAsync(cmd, {
        maxBuffer: 50 * 1024 * 1024,
        shell: "cmd.exe",
    });
    return stdout;
}

/**
 * Get directory size in bytes by recursively walking the directory.
 * Uses a fast iterative approach to avoid stack overflows on deep trees.
 */
export async function getDirSize(dirPath: string): Promise<number> {
    let total = 0;
    const stack = [dirPath];

    while (stack.length > 0) {
        const current = stack.pop()!;
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        } catch {
            continue; // Permission denied or not found — skip
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) {
                    stack.push(fullPath);
                }
            } else if (entry.isFile()) {
                try {
                    const stat = await fs.stat(fullPath);
                    total += stat.size;
                } catch {
                    // Skip files we can't stat
                }
            }
        }
    }
    return total;
}

/**
 * Get total disk size of the system drive (usually C:) using wmic.
 */
export async function getTotalDiskSize(): Promise<number> {
    try {
        const out = await runShell(
            'wmic logicaldisk where "DeviceID=\'C:\'" get Size /format:value'
        );
        const match = out.match(/Size=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    } catch {
        // Fallback: try PowerShell
        try {
            const out = await runShell(
                "powershell -NoProfile -Command \"(Get-PSDrive C).Used + (Get-PSDrive C).Free\""
            );
            return parseInt(out.trim(), 10) || 0;
        } catch {
            return 0;
        }
    }
}

/**
 * Get size of a single file or directory quickly.
 * For directories, calls getDirSize.
 */
export async function getSize(targetPath: string): Promise<number> {
    try {
        const stat = await fs.stat(targetPath);
        if (stat.isFile()) return stat.size;
        if (stat.isDirectory()) return getDirSize(targetPath);
        return 0;
    } catch {
        return 0;
    }
}
