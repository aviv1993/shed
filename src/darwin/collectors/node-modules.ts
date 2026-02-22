import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { duSize } from "../utils.js";
import type { NodeModulePackage, NodeModulesEntry, NodeModulesData } from "../../types.js";


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
        // Don't scan packages here — done lazily on expand
        results.push({
          projectName,
          path: nmPath,
          sizeBytes: size,
          packages: [],
        });
      }
    } catch { }
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
        .catch(() => { })
    );
  }

  await Promise.all(promises);
}

/** Scan packages inside a node_modules directory. Called lazily on expand. */
export async function scanNodeModulesPackages(nmPath: string): Promise<NodeModulePackage[]> {
  let entries: string[];
  try {
    entries = await readdir(nmPath);
  } catch {
    return [];
  }

  const packages: NodeModulePackage[] = [];
  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;

    if (entry.startsWith("@")) {
      promises.push(
        (async () => {
          const scopeDir = join(nmPath, entry);
          try {
            const subEntries = await readdir(scopeDir);
            await Promise.all(
              subEntries.map(async (sub) => {
                const pkg = await readPkgInfo(join(scopeDir, sub), `${entry}/${sub}`);
                if (pkg) packages.push(pkg);
              })
            );
          } catch { }
        })()
      );
    } else {
      promises.push(
        (async () => {
          const pkg = await readPkgInfo(join(nmPath, entry), entry);
          if (pkg) packages.push(pkg);
        })()
      );
    }
  }

  await Promise.all(promises);
  packages.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return packages;
}

async function readPkgInfo(dir: string, name: string): Promise<NodeModulePackage | null> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return null;
    const [pkgJson, size] = await Promise.all([
      readFile(join(dir, "package.json"), "utf-8").catch(() => "{}"),
      duSize(dir),
    ]);
    if (size === 0) return null;
    const parsed = JSON.parse(pkgJson);
    return { name, version: parsed.version ?? "?", sizeBytes: size };
  } catch {
    return null;
  }
}
