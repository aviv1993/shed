#!/usr/bin/env node
import { program } from "commander";
import { collectBrew, type BrewData } from "./collectors/brew.js";
import { collectNpmGlobals, type NpmGlobalsData } from "./collectors/npm-globals.js";
import { collectNpmCache, type NpmCacheData } from "./collectors/npm-cache.js";
import { collectDocker, type DockerData } from "./collectors/docker.js";
import { collectApps, type AppsData } from "./collectors/apps.js";
import { collectDevCaches, type DevCachesData } from "./collectors/dev-caches.js";
import { collectNodeModules, type NodeModulesData } from "./collectors/node-modules.js";
import { collectGitRepos, type GitReposData } from "./collectors/git-repos.js";
import { collectCleanupActions, type CleanupActionsData } from "./cleanup.js";
import { buildLinkMap } from "./linker.js";
import { getTotalDiskSize } from "./utils.js";
import type { CollectedData } from "./types.js";
import { DepwatchApp } from "./tui/app.js";
import { loadCachedData, saveCachedData } from "./cache.js";
import type { DepwatchConfig } from "./config.js";

async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

async function collectAll(onProgress?: (done: number, total: number) => void, config?: DepwatchConfig): Promise<CollectedData> {
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

program
  .name("depwatch")
  .description("macOS Dev Dependency Manager TUI")
  .version("0.1.0")
  .action(async () => {
    const app = new DepwatchApp(collectAll, loadCachedData);
    await app.start();
  });

program.parse();
