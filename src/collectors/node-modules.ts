import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { duSize } from "../utils.js";

export interface NodeModulesEntry {
  projectName: string;
  path: string;
  sizeBytes: number;
}

export interface NodeModulesData {
  entries: NodeModulesEntry[];
  totalBytes: number;
}

const SKIP_DIRS = new Set([
  "Library", "Desktop", "Downloads", "Documents", "Pictures", "Music",
  "Movies", "Public", ".Trash", ".cache", ".local", ".config", ".npm",
  ".pnpm-store", ".docker", "node_modules", ".git", "Applications",
]);

export async function collectNodeModules(): Promise<NodeModulesData> {
  const home = homedir();
  let topLevelDirs: string[];
  try {
    topLevelDirs = await readdir(home);
  } catch {
    return { entries: [], totalBytes: 0 };
  }

  const projectDirs = topLevelDirs.filter(
    (d) => !d.startsWith(".") && !SKIP_DIRS.has(d)
  );

  const entries: NodeModulesEntry[] = [];

  await Promise.all(
    projectDirs.map(async (dirName) => {
      const dirPath = join(home, dirName);
      try {
        const s = await stat(dirPath);
        if (!s.isDirectory()) return;
      } catch {
        return;
      }
      await findNodeModules(dirPath, dirName, entries, 0);
    })
  );

  entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);

  return { entries, totalBytes };
}

async function findNodeModules(
  dirPath: string,
  projectName: string,
  results: NodeModulesEntry[],
  depth: number,
): Promise<void> {
  if (depth > 3) return;

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return;
  }

  if (entries.includes("node_modules")) {
    const nmPath = join(dirPath, "node_modules");
    try {
      const size = await duSize(nmPath);
      if (size > 0) {
        results.push({
          projectName,
          path: nmPath,
          sizeBytes: size,
        });
      }
    } catch {}
    // Don't recurse into this node_modules, but do check sibling dirs
  }

  const promises: Promise<void>[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" ||
        entry === "build" || entry === ".next" || entry === "vendor" ||
        entry.startsWith(".")) continue;

    const subPath = join(dirPath, entry);
    promises.push(
      stat(subPath)
        .then(async (s) => {
          if (s.isDirectory()) {
            await findNodeModules(subPath, projectName, results, depth + 1);
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);
}
