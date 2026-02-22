import { collectBrew } from "./collectors/brew.js";
import { collectNpmGlobals } from "./collectors/npm-globals.js";
import { collectNpmCache } from "./collectors/npm-cache.js";
import { collectDocker } from "./collectors/docker.js";
import { collectApps } from "./collectors/apps.js";
import { collectDevCaches } from "./collectors/dev-caches.js";
import { collectNodeModules } from "./collectors/node-modules.js";
import { collectGitRepos } from "./collectors/git-repos.js";
import { collectCleanupActions } from "./cleanup.js";
import { buildLinkMap } from "./linker.js";
import { getTotalDiskSize } from "./utils.js";
import type {
    CollectedData, BrewData, NpmGlobalsData, NpmCacheData,
    NodeModulesData, DockerData, AppsData, DevCachesData,
    GitReposData, CleanupActionsData,
} from "../types.js";
import { saveCachedData } from "../cache.js";
import type { ShedConfig } from "../config.js";


async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
    try { return await p; } catch { return fallback; }
}

export async function collectAll(onProgress?: (done: number, total: number) => void, config?: ShedConfig): Promise<CollectedData> {
    const defaultDocker: DockerData = {
        online: false, images: [], containers: [], volumes: [],
        buildCacheSizeStr: "—", buildCacheReclaimableStr: "—",
        totalSizeStr: "—", reclaimableSizeStr: "—",
    };

    const total = 11; // 10 collectors + link map
    let done = 0;
    function track<T>(p: Promise<T>, fallback: T): Promise<T> {
        return settle(p, fallback).then((v) => {
            done++;
            onProgress?.(done, total);
            return v;
        });
    }

    const [brewData, npmGlobalsData, npmCacheData, nodeModulesData, dockerData, appsData, devCachesData, gitReposData, cleanupActionsData, diskBytes] =
        await Promise.all([
            track(collectBrew(), { packages: [], cacheBytes: 0, totalBytes: 0 } as BrewData),
            track(collectNpmGlobals(), { packages: [], totalBytes: 0 } as NpmGlobalsData),
            track(collectNpmCache(), { npmCacheBytes: 0, pnpmStoreBytes: 0, totalBytes: 0 } as NpmCacheData),
            track(collectNodeModules(), { entries: [], totalBytes: 0 } as NodeModulesData),
            track(collectDocker(), defaultDocker),
            track(collectApps(), { apps: [], totalBytes: 0 } as AppsData),
            track(collectDevCaches(), { entries: [], totalBytes: 0, groups: [] } as DevCachesData),
            track(collectGitRepos(config?.gitScanPaths), { repos: [], totalBytes: 0, totalGitBytes: 0, totalNodeModulesBytes: 0 } as GitReposData),
            track(collectCleanupActions(), { actions: [] } as CleanupActionsData),
            track(getTotalDiskSize(), 0),
        ]);

    // Build link map from all package names (scans ~/projects for usage)
    const packageNames = [
        ...brewData.packages.map((p) => p.name),
        ...npmGlobalsData.packages.map((p) => p.name),
    ];
    const links = await buildLinkMap(packageNames);
    done++;
    onProgress?.(done, total);

    // Cross-reference docker images ↔ git repos
    if (gitReposData.repos.length > 0) {
        const reposByName = new Map(gitReposData.repos.map((r) => [r.name, r]));
        const reposByPath = new Map(gitReposData.repos.map((r) => [r.path, r]));

        const linkRepoToDocker = (repo: typeof gitReposData.repos[0], imageTag: string) => {
            if (!repo.linkedDockerImages.includes(imageTag)) {
                repo.linkedDockerImages.push(imageTag);
            }
        };

        for (const img of dockerData.images) {
            const tag = img.tag && img.tag !== "<none>" ? `${img.repository}:${img.tag}` : img.repository;
            // Match by full path first
            for (const path of img.linkedProjectPaths) {
                const repo = reposByPath.get(path);
                if (repo) linkRepoToDocker(repo, tag);
            }
            // Fall back to basename matching
            for (const proj of img.linkedProjects) {
                const repo = reposByName.get(proj);
                if (repo) linkRepoToDocker(repo, tag);
            }
        }
        for (const container of dockerData.containers) {
            const tag = container.image;
            for (const path of container.linkedProjectPaths) {
                const repo = reposByPath.get(path);
                if (repo) linkRepoToDocker(repo, tag);
            }
            for (const proj of container.linkedProjects) {
                const repo = reposByName.get(proj);
                if (repo) linkRepoToDocker(repo, tag);
            }
        }
    }

    const data: CollectedData = {
        brew: brewData,
        npmGlobals: npmGlobalsData,
        npmCache: npmCacheData,
        nodeModules: nodeModulesData,
        docker: dockerData,
        apps: appsData,
        devCaches: devCachesData,
        gitRepos: gitReposData,
        cleanupActions: cleanupActionsData,
        links,
        totalDiskBytes: diskBytes,
    };

    // Save to cache for next launch
    await saveCachedData(data);

    return data;
}
