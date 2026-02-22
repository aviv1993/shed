/**
 * Shared utility functions — platform-agnostic, pure formatting.
 * Platform-specific utilities (getDirSize, run, etc.) live in darwin/utils.ts and win32/utils.ts.
 */

export function formatBytes(bytes: number): string {
    if (bytes < 0) return "0 B";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return val >= 100 ? `${Math.round(val)} ${units[i]}` : `${val.toFixed(1)} ${units[i]}`;
}

export function padRight(str: string, len: number): string {
    return str.length >= len ? str : str + " ".repeat(len - str.length);
}

export function padLeft(str: string, len: number): string {
    return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

export function renderProgressBar(done: number, total: number, width = 20): string {
    if (total <= 0) return `[${"░".repeat(width)}] 0/0`;
    const ratio = Math.min(done / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${done}/${total}`;
}
