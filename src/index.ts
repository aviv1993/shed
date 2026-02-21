#!/usr/bin/env node
import { program } from "commander";
import { collectBrew, type BrewData } from "./collectors/brew.js";
import { collectNpmGlobals, type NpmGlobalsData } from "./collectors/npm-globals.js";
import { collectNpmCache, type NpmCacheData } from "./collectors/npm-cache.js";
import { collectDocker, type DockerData } from "./collectors/docker.js";
import { collectApps, type AppsData } from "./collectors/apps.js";
import { collectXcode, type XcodeData } from "./collectors/xcode.js";
import { collectDevCaches, type DevCachesData } from "./collectors/dev-caches.js";
import { collectNodeModules, type NodeModulesData } from "./collectors/node-modules.js";
import { collectCleanupActions, type CleanupActionsData } from "./cleanup.js";
import { buildLinkMap } from "./linker.js";
import { getTotalDiskSize } from "./utils.js";
import type { CollectedData } from "./types.js";
import { DepwatchApp } from "./tui/app.js";
import { loadCachedData, saveCachedData } from "./cache.js";

async function settle<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

async function collectAll(): Promise<CollectedData> {
  const defaultDocker: DockerData = {
    online: false, images: [], containers: [], volumes: [],
    buildCacheSizeStr: "—", buildCacheReclaimableStr: "—",
    totalSizeStr: "—", reclaimableSizeStr: "—",
  };

  const [brewData, npmGlobalsData, npmCacheData, nodeModulesData, dockerData, appsData, xcodeData, devCachesData, cleanupActionsData, diskBytes] =
    await Promise.all([
      settle(collectBrew(), { packages: [], cacheBytes: 0, totalBytes: 0 } as BrewData),
      settle(collectNpmGlobals(), { packages: [], totalBytes: 0 } as NpmGlobalsData),
      settle(collectNpmCache(), { npmCacheBytes: 0, pnpmStoreBytes: 0, totalBytes: 0 } as NpmCacheData),
      settle(collectNodeModules(), { entries: [], totalBytes: 0 } as NodeModulesData),
      settle(collectDocker(), defaultDocker),
      settle(collectApps(), { apps: [], totalBytes: 0 } as AppsData),
      settle(collectXcode(), { entries: [], totalBytes: 0 } as XcodeData),
      settle(collectDevCaches(), { entries: [], totalBytes: 0 } as DevCachesData),
      settle(collectCleanupActions(), { actions: [] } as CleanupActionsData),
      settle(getTotalDiskSize(), 0),
    ]);

  // Build link map from all package names
  const packageNames = [
    ...brewData.packages.map((p) => p.name),
    ...npmGlobalsData.packages.map((p) => p.name),
  ];
  const links = await buildLinkMap(packageNames);

  const data: CollectedData = {
    brew: brewData,
    npmGlobals: npmGlobalsData,
    npmCache: npmCacheData,
    nodeModules: nodeModulesData,
    docker: dockerData,
    apps: appsData,
    xcode: xcodeData,
    devCaches: devCachesData,
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
