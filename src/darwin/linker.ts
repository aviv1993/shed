import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import type { ProjectLink, LinkMap } from "../types.js";

const SKIP_DIRS = new Set([
  "Library", "Desktop", "Downloads", "Documents", "Pictures", "Music",
  "Movies", "Public", ".Trash", ".cache", ".local", ".config", ".npm",
  ".pnpm-store", ".docker", "node_modules", ".git",
]);

interface ProjectFiles {
  name: string;
  files: Map<string, string>; // relativePath → content
}

export async function buildLinkMap(packageNames: string[]): Promise<LinkMap> {
  const home = homedir();
  const linkMap: LinkMap = new Map();

  // Discover project directories
  let topLevelDirs: string[];
  try {
    topLevelDirs = await readdir(home);
  } catch {
    return linkMap;
  }

  const projectDirs = topLevelDirs.filter(
    (d) => !d.startsWith(".") && !SKIP_DIRS.has(d)
  );

  // Scan each project for relevant files
  const projects: ProjectFiles[] = [];

  await Promise.all(
    projectDirs.map(async (dirName) => {
      const dirPath = join(home, dirName);
      try {
        const s = await stat(dirPath);
        if (!s.isDirectory()) return;
      } catch {
        return;
      }

      const fileMap = new Map<string, string>();
      await scanProjectFiles(dirPath, dirName, "", fileMap, 0);

      if (fileMap.size > 0) {
        projects.push({ name: dirName, files: fileMap });
      }
    })
  );

  // For each package name, check all project files
  for (const pkgName of packageNames) {
    const matches: ProjectLink[] = [];
    const pkgLower = pkgName.toLowerCase();

    for (const project of projects) {
      const matchedFiles: string[] = [];

      for (const [relPath, content] of project.files) {
        const contentLower = content.toLowerCase();

        // Simple string matching
        if (contentLower.includes(pkgLower)) {
          matchedFiles.push(relPath);
          continue;
        }

        // Special: "node" matches "node:" in Dockerfiles
        if (pkgLower === "node" && /\bnode[:\d]/.test(contentLower)) {
          matchedFiles.push(relPath);
          continue;
        }
      }

      if (matchedFiles.length > 0) {
        matches.push({ projectName: project.name, files: matchedFiles });
      }
    }

    if (matches.length > 0) {
      linkMap.set(pkgName, matches);
    }
  }

  return linkMap;
}

async function scanProjectFiles(
  basePath: string,
  projectName: string,
  relDir: string,
  fileMap: Map<string, string>,
  depth: number,
): Promise<void> {
  if (depth > 3) return;

  let entries: string[];
  try {
    entries = await readdir(join(basePath, relDir));
  } catch {
    return;
  }

  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "vendor" || entry === "dist") continue;

    const relPath = relDir ? `${relDir}/${entry}` : entry;
    const fullPath = join(basePath, relPath);

    // Check if it's a file we care about
    if (isRelevantFile(entry)) {
      promises.push(
        readFile(fullPath, "utf-8")
          .then((content) => {
            // Limit content size to avoid memory issues
            fileMap.set(relPath, content.slice(0, 50_000));
          })
          .catch(() => { })
      );
    }

    // Check if it's a directory to recurse into
    if (entry === ".github" || entry === "workflows") {
      promises.push(
        stat(fullPath)
          .then(async (s) => {
            if (s.isDirectory()) {
              await scanProjectFiles(basePath, projectName, relPath, fileMap, depth + 1);
            }
          })
          .catch(() => { })
      );
    }
  }

  await Promise.all(promises);
}

function isRelevantFile(name: string): boolean {
  return (
    name === "package.json" ||
    name === "Makefile" ||
    name === "Brewfile" ||
    name.startsWith("Dockerfile") ||
    name.match(/^docker-compose.*\.ya?ml$/) !== null ||
    name.endsWith(".zig") ||
    (name.endsWith(".yml") || name.endsWith(".yaml")) && name !== "pnpm-lock.yaml"
  );
}
