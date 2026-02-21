import type { BrewData } from "./collectors/brew.js";
import type { NpmGlobalsData } from "./collectors/npm-globals.js";
import type { NpmCacheData } from "./collectors/npm-cache.js";
import type { NodeModulesData } from "./collectors/node-modules.js";
import type { DockerData } from "./collectors/docker.js";
import type { AppsData } from "./collectors/apps.js";
import type { DevCachesData } from "./collectors/dev-caches.js";
import type { GitReposData } from "./collectors/git-repos.js";
import type { CleanupActionsData } from "./cleanup.js";

export interface ProjectLink {
  projectName: string;
  files: string[];
}

export type LinkMap = Map<string, ProjectLink[]>;

export interface CollectedData {
  brew: BrewData;
  npmGlobals: NpmGlobalsData;
  npmCache: NpmCacheData;
  nodeModules: NodeModulesData;
  docker: DockerData;
  apps: AppsData;
  devCaches: DevCachesData;
  gitRepos: GitReposData;
  cleanupActions: CleanupActionsData;
  links: LinkMap;
  totalDiskBytes: number;
}
