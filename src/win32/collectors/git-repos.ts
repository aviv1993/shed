/**
 * Windows git repos collector — scans default project directories for git repositories.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { GitRepoEntry, GitReposData } from "../../types.js";
import { DEFAULT_PROJECT_ROOTS, SKIP_DIRS } from "../constants.js";
import { getSize } from "../utils.js";

async function findGitRepos(roots: string[], maxDepth = 4): Promise<string[]> {
    const repos: string[] = [];

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > maxDepth) return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        const hasGit = entries.some((e) => e.isDirectory() && e.name === ".git");
        if (hasGit) {
            repos.push(dir);
            return;
        }

        for (const entry of entries) {
            if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".")) continue;
            await walk(path.join(dir, entry.name), depth + 1);
        }
    }

    await Promise.all(roots.map((root) => walk(root, 0)));
    return repos;
}

export async function collectGitRepos(extraPaths?: { path: string; depth: number }[]): Promise<GitReposData> {
    const scanRoots = [
        ...DEFAULT_PROJECT_ROOTS,
        ...(extraPaths?.map((p) => p.path) ?? []),
    ];
    const repoPaths = await findGitRepos(scanRoots);
    const repos: GitRepoEntry[] = [];

    const promises = repoPaths.map(async (repoPath): Promise<GitRepoEntry> => {
        const name = path.basename(repoPath);
        const gitDir = path.join(repoPath, ".git");
        const nodeModulesDir = path.join(repoPath, "node_modules");

        const [sizeBytes, gitSizeBytes, nodeModulesSizeBytes] = await Promise.all([
            getSize(repoPath),
            getSize(gitDir),
            getSize(nodeModulesDir),
        ]);

        return {
            name,
            path: repoPath,
            sizeBytes,
            gitSizeBytes,
            nodeModulesSizeBytes,
            linkedDockerImages: [],
        };
    });

    const results = await Promise.all(promises);
    repos.push(...results);
    repos.sort((a, b) => b.sizeBytes - a.sizeBytes);

    const totalBytes = repos.reduce((s, r) => s + r.sizeBytes, 0);
    const totalGitBytes = repos.reduce((s, r) => s + r.gitSizeBytes, 0);
    const totalNodeModulesBytes = repos.reduce((s, r) => s + r.nodeModulesSizeBytes, 0);

    return { repos, totalBytes, totalGitBytes, totalNodeModulesBytes };
}
