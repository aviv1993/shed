import { homedir } from "node:os";
import { join } from "node:path";
import { duSize } from "../utils.js";
import type { DevCacheEntry, DevCacheGroup, DevCachesData } from "../../types.js";


interface Candidate {
  tool: string;
  label: string;
  path: string;
  cleanable: boolean;
  warningMessage?: string;
}

export async function collectDevCaches(): Promise<DevCachesData> {
  const home = homedir();

  const candidates: Candidate[] = [
    // VS Code
    { tool: "VS Code", label: "Extensions", path: join(home, ".vscode/extensions"), cleanable: false, warningMessage: "Deleting will remove all installed VS Code extensions. You'll need to reinstall them." },
    { tool: "VS Code", label: "Cache", path: join(home, "Library/Application Support/Code/Cache"), cleanable: true },
    { tool: "VS Code", label: "CachedData", path: join(home, "Library/Application Support/Code/CachedData"), cleanable: true },
    { tool: "VS Code", label: "CachedExtensionVSIXs", path: join(home, "Library/Application Support/Code/CachedExtensionVSIXs"), cleanable: true },
    { tool: "VS Code", label: "Workspace Storage", path: join(home, "Library/Application Support/Code/User/workspaceStorage"), cleanable: true },
    { tool: "VS Code", label: "System Cache", path: join(home, "Library/Caches/com.microsoft.VSCode"), cleanable: true },
    // Xcode
    { tool: "Xcode", label: "Xcode.app", path: "/Applications/Xcode.app", cleanable: false, warningMessage: "Deleting will remove Xcode. You'll lose the ability to compile native code." },
    { tool: "Xcode", label: "Command Line Tools", path: "/Library/Developer/CommandLineTools", cleanable: false, warningMessage: "Deleting will remove Command Line Tools. You'll lose compilers and git." },
    { tool: "Xcode", label: "DerivedData", path: join(home, "Library/Developer/Xcode/DerivedData"), cleanable: true },
    { tool: "Xcode", label: "CoreSimulator", path: join(home, "Library/Developer/CoreSimulator"), cleanable: true },
    { tool: "Xcode", label: "Xcode Caches", path: join(home, "Library/Caches/com.apple.dt.Xcode"), cleanable: true },
    // Claude
    { tool: "Claude", label: "Claude CLI", path: join(home, ".claude"), cleanable: false, warningMessage: "Deleting will remove Claude Code configuration and session data." },
    // Zig
    { tool: "Zig", label: "Zig Cache", path: join(home, ".cache/zig"), cleanable: true },
    // Bun
    { tool: "Bun", label: "Bun", path: join(home, ".bun"), cleanable: true },
    // CocoaPods
    { tool: "CocoaPods", label: "CocoaPods Cache", path: join(home, "Library/Caches/CocoaPods"), cleanable: true },
    { tool: "CocoaPods", label: "CocoaPods Repos", path: join(home, ".cocoapods"), cleanable: true },
    // TypeScript
    { tool: "TypeScript", label: "TypeScript Cache", path: join(home, "Library/Caches/typescript"), cleanable: true },
    // Rust
    { tool: "Rust", label: "Cargo", path: join(home, ".cargo"), cleanable: false, warningMessage: "Deleting will remove Cargo and installed Rust binaries. Reinstall via rustup." },
    { tool: "Rust", label: "Rustup", path: join(home, ".rustup"), cleanable: false, warningMessage: "Deleting will remove the Rust toolchain. Reinstall via rustup." },
    // Go
    { tool: "Go", label: "Go", path: join(home, "go"), cleanable: false, warningMessage: "Deleting will remove Go packages and compiled binaries." },
    { tool: "Go", label: "Go Build Cache", path: join(home, "Library/Caches/go-build"), cleanable: true },
    // Python
    { tool: "Python", label: "pip Cache", path: join(home, "Library/Caches/pip"), cleanable: true },
    { tool: "Python", label: "pyenv", path: join(home, ".pyenv"), cleanable: false, warningMessage: "Deleting will remove all pyenv-managed Python versions." },
    { tool: "Python", label: "uv Cache", path: join(home, "Library/Caches/uv"), cleanable: true },
    // Ruby
    { tool: "Ruby", label: "Ruby Gems", path: join(home, ".gem"), cleanable: false, warningMessage: "Deleting will remove all installed Ruby gems." },
    { tool: "Ruby", label: "rbenv", path: join(home, ".rbenv"), cleanable: false, warningMessage: "Deleting will remove all rbenv-managed Ruby versions." },
    // Java
    { tool: "Java", label: "Gradle Cache", path: join(home, ".gradle"), cleanable: true },
    { tool: "Java", label: "Maven Cache", path: join(home, ".m2"), cleanable: true },
    // Deno
    { tool: "Deno", label: "Deno", path: join(home, ".deno"), cleanable: true },
  ];

  const resolved: (DevCacheEntry & { tool: string })[] = [];

  await Promise.all(
    candidates.map(async ({ tool, label, path, cleanable, warningMessage }) => {
      const sizeBytes = await duSize(path);
      if (sizeBytes > 0) {
        resolved.push({ tool, label, path, sizeBytes, cleanable, warningMessage });
      }
    })
  );

  // Group by tool, preserving candidate order for tools
  const toolOrder: string[] = [];
  const toolMap = new Map<string, DevCacheEntry[]>();
  for (const c of candidates) {
    if (!toolMap.has(c.tool)) {
      toolOrder.push(c.tool);
      toolMap.set(c.tool, []);
    }
  }
  for (const entry of resolved) {
    toolMap.get(entry.tool)!.push(entry);
  }

  const groups: DevCacheGroup[] = [];
  for (const tool of toolOrder) {
    const entries = toolMap.get(tool)!;
    if (entries.length === 0) continue;
    entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);
    groups.push({ tool, entries, totalBytes });
  }

  // Sort groups by total size descending
  groups.sort((a, b) => b.totalBytes - a.totalBytes);

  const allEntries = groups.flatMap((g) => g.entries);
  const totalBytes = allEntries.reduce((s, e) => s + e.sizeBytes, 0);

  return { groups, entries: allEntries, totalBytes };
}
