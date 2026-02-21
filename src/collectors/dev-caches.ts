import { homedir } from "node:os";
import { join } from "node:path";
import { duSize } from "../utils.js";

export interface DevCacheEntry {
  label: string;
  path: string;
  sizeBytes: number;
  cleanable: boolean; // safe to delete entirely
}

export interface DevCachesData {
  entries: DevCacheEntry[];
  totalBytes: number;
}

export async function collectDevCaches(): Promise<DevCachesData> {
  const home = homedir();

  // All candidate paths — only paths that exist (size > 0) will be included
  const candidates: { label: string; path: string; cleanable: boolean }[] = [
    // VS Code
    { label: "VS Code Extensions", path: join(home, ".vscode/extensions"), cleanable: false },
    { label: "VS Code Cache", path: join(home, "Library/Application Support/Code/Cache"), cleanable: true },
    { label: "VS Code CachedData", path: join(home, "Library/Application Support/Code/CachedData"), cleanable: true },
    { label: "VS Code CachedExtensionVSIXs", path: join(home, "Library/Application Support/Code/CachedExtensionVSIXs"), cleanable: true },
    { label: "VS Code Workspace Storage", path: join(home, "Library/Application Support/Code/User/workspaceStorage"), cleanable: true },
    { label: "VS Code System Cache", path: join(home, "Library/Caches/com.microsoft.VSCode"), cleanable: true },
    // Zig
    { label: "Zig Cache", path: join(home, ".cache/zig"), cleanable: true },
    // Bun
    { label: "Bun", path: join(home, ".bun"), cleanable: true },
    // CocoaPods
    { label: "CocoaPods Cache", path: join(home, "Library/Caches/CocoaPods"), cleanable: true },
    { label: "CocoaPods Repos", path: join(home, ".cocoapods"), cleanable: true },
    // TypeScript
    { label: "TypeScript Cache", path: join(home, "Library/Caches/typescript"), cleanable: true },
    // Claude
    { label: "Claude CLI", path: join(home, ".claude"), cleanable: false },
    // Rust (may not be installed)
    { label: "Cargo", path: join(home, ".cargo"), cleanable: false },
    { label: "Rustup", path: join(home, ".rustup"), cleanable: false },
    // Go
    { label: "Go", path: join(home, "go"), cleanable: false },
    { label: "Go Build Cache", path: join(home, "Library/Caches/go-build"), cleanable: true },
    // Python
    { label: "pip Cache", path: join(home, "Library/Caches/pip"), cleanable: true },
    { label: "pyenv", path: join(home, ".pyenv"), cleanable: false },
    { label: "uv Cache", path: join(home, "Library/Caches/uv"), cleanable: true },
    // Ruby
    { label: "Ruby Gems", path: join(home, ".gem"), cleanable: false },
    { label: "rbenv", path: join(home, ".rbenv"), cleanable: false },
    // Java
    { label: "Gradle Cache", path: join(home, ".gradle"), cleanable: true },
    { label: "Maven Cache", path: join(home, ".m2"), cleanable: true },
    // Deno
    { label: "Deno", path: join(home, ".deno"), cleanable: true },
  ];

  const entries: DevCacheEntry[] = [];

  await Promise.all(
    candidates.map(async ({ label, path, cleanable }) => {
      const sizeBytes = await duSize(path);
      if (sizeBytes > 0) {
        entries.push({ label, path, sizeBytes, cleanable });
      }
    })
  );

  entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

  return { entries, totalBytes };
}
