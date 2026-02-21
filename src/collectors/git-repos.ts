import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { duSize } from "../utils.js";

export interface GitRepoEntry {
  name: string;
  path: string;
  sizeBytes: number;
  gitSizeBytes: number; // size of .git directory alone
  nodeModulesSizeBytes: number;
  linkedDockerImages: string[];
}

export interface GitReposData {
  repos: GitRepoEntry[];
  totalBytes: number;
  totalGitBytes: number;
  totalNodeModulesBytes: number;
}

const SKIP_DIRS = new Set([
  "Library", "Desktop", "Downloads", "Documents", "Pictures", "Music",
  "Movies", "Public", ".Trash", ".cache", ".local", ".config", ".npm",
  ".pnpm-store", ".docker", "node_modules", ".git", "Applications",
  ".bun", ".cargo", ".rustup", ".pyenv", ".rbenv", ".deno",
]);

export async function collectGitRepos(): Promise<GitReposData> {
  const home = homedir();
  let topLevelDirs: string[];
  try {
    topLevelDirs = await readdir(home);
  } catch {
    return { repos: [], totalBytes: 0, totalGitBytes: 0, totalNodeModulesBytes: 0 };
  }

  const searchDirs = topLevelDirs.filter(
    (d) => !d.startsWith(".") && !SKIP_DIRS.has(d)
  );

  const repos: GitRepoEntry[] = [];

  await Promise.all(
    searchDirs.map(async (dirName) => {
      const dirPath = join(home, dirName);
      try {
        const s = await stat(dirPath);
        if (!s.isDirectory()) return;
      } catch {
        return;
      }
      await findGitRepos(dirPath, repos, 0);
    })
  );

  repos.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = repos.reduce((s, r) => s + r.sizeBytes, 0);
  const totalGitBytes = repos.reduce((s, r) => s + r.gitSizeBytes, 0);
  const totalNodeModulesBytes = repos.reduce((s, r) => s + r.nodeModulesSizeBytes, 0);

  return { repos, totalBytes, totalGitBytes, totalNodeModulesBytes };
}

async function findGitRepos(
  dirPath: string,
  results: GitRepoEntry[],
  depth: number,
): Promise<void> {
  if (depth > 3) return;

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    return;
  }

  if (entries.includes(".git")) {
    // This is a git repo
    const gitDir = join(dirPath, ".git");
    const hasNodeModules = entries.includes("node_modules");
    const nmDir = join(dirPath, "node_modules");
    const [totalSize, gitSize, nmSize] = await Promise.all([
      duSize(dirPath),
      duSize(gitDir),
      hasNodeModules ? duSize(nmDir) : Promise.resolve(0),
    ]);
    results.push({
      name: basename(dirPath),
      path: dirPath,
      sizeBytes: totalSize,
      gitSizeBytes: gitSize,
      nodeModulesSizeBytes: nmSize,
      linkedDockerImages: [],
    });
    // Don't recurse into git repos (submodules would be found via .git files anyway)
    return;
  }

  // Recurse into subdirectories
  const promises: Promise<void>[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" ||
        entry === "build" || entry === ".next" || entry === "vendor") continue;

    const subPath = join(dirPath, entry);
    promises.push(
      stat(subPath)
        .then(async (s) => {
          if (s.isDirectory()) {
            await findGitRepos(subPath, results, depth + 1);
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);
}
