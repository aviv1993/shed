/**
 * Windows cleanup actions — generates cache cleanup actions with dry-run support.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import type { CleanupAction, CleanupActionsData } from "../types.js";
import { NPM_CACHE_DIR, PNPM_STORE_DIR, HOME } from "./constants.js";
import { getSize } from "./utils.js";

export async function collectCleanupActions(): Promise<CleanupActionsData> {
    const actions: CleanupAction[] = [];

    // npm cache clean
    const npmCacheBytes = await getSize(NPM_CACHE_DIR);
    if (npmCacheBytes > 0) {
        actions.push({
            id: "npm-cache-clean",
            label: "npm cache clean",
            description: "Runs `npm cache clean --force` to clear the npm download cache.",
            command: "npm",
            args: ["cache", "clean", "--force"],
            sizeBytes: npmCacheBytes,
        });
    }

    // pnpm store prune
    const pnpmStoreBytes = await getSize(PNPM_STORE_DIR);
    if (pnpmStoreBytes > 0) {
        actions.push({
            id: "pnpm-store-prune",
            label: "pnpm store prune",
            description: "Runs `pnpm store prune` to remove unreferenced packages from the store.",
            command: "pnpm",
            args: ["store", "prune"],
            sizeBytes: pnpmStoreBytes,
        });
    }

    // Docker system prune
    actions.push({
        id: "docker-system-prune",
        label: "Docker system prune",
        description: "Runs `docker system prune -f` to remove stopped containers, unused networks, and dangling images.",
        command: "docker",
        args: ["system", "prune", "-f"],
        sizeBytes: 0,
        warning: "This will remove stopped containers, unused networks, and dangling images.",
    });

    // Docker builder prune
    actions.push({
        id: "docker-builder-prune",
        label: "Docker builder prune",
        description: "Runs `docker builder prune -f` to free build cache.",
        command: "docker",
        args: ["builder", "prune", "-f"],
        sizeBytes: 0,
    });

    // Windows Temp cleanup
    const tempDir = path.join(HOME, "AppData", "Local", "Temp");
    const tempBytes = await getSize(tempDir);
    if (tempBytes > 1024 * 1024) { // Only show if > 1MB
        actions.push({
            id: "windows-temp-clean",
            label: "Clear Windows Temp",
            description: "Removes files from %LOCALAPPDATA%\\Temp (some files may be locked).",
            command: "cmd",
            args: ["/c", `del /q /f /s "${tempDir}\\*" 2>nul`],
            sizeBytes: tempBytes,
            warning: "Some files may be in use and cannot be deleted.",
        });
    }

    // NuGet cache clean
    const nugetDir = path.join(HOME, ".nuget", "packages");
    const nugetBytes = await getSize(nugetDir);
    if (nugetBytes > 0) {
        actions.push({
            id: "nuget-cache-clean",
            label: "NuGet cache clean",
            description: "Runs `dotnet nuget locals all --clear` to remove NuGet package caches.",
            command: "dotnet",
            args: ["nuget", "locals", "all", "--clear"],
            sizeBytes: nugetBytes,
        });
    }

    // Gradle cache clean
    const gradleDir = path.join(HOME, ".gradle", "caches");
    const gradleBytes = await getSize(gradleDir);
    if (gradleBytes > 0) {
        actions.push({
            id: "gradle-cache-clean",
            label: "Gradle cache clean",
            description: `Removes ${path.join(HOME, ".gradle", "caches")} directory.`,
            command: "cmd",
            args: ["/c", `rmdir /s /q "${gradleDir}"`],
            sizeBytes: gradleBytes,
            warning: "Gradle will re-download dependencies on next build.",
        });
    }

    return { actions };
}

/**
 * Execute a cleanup action, streaming output.
 * Returns a function to kill the process.
 */
export function runCleanupAction(
    action: CleanupAction,
    onData: (text: string) => void,
    onExit: (code: number) => void,
): () => void {
    const proc = spawn(action.command, action.args, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (chunk: Buffer) => onData(chunk.toString()));
    proc.stderr?.on("data", (chunk: Buffer) => onData(chunk.toString()));
    proc.on("exit", (code) => onExit(code ?? 1));
    proc.on("error", () => onExit(1));

    return () => {
        try { proc.kill(); } catch { /* swallow */ }
    };
}
