/**
 * Shared data types — used by both platform collectors and TUI.
 * All data interfaces are defined here so they are platform-agnostic.
 */

// ─── Apps ────────────────────────────────────────────────────────────

export interface AppEntry {
  name: string;
  sizeBytes: number;
}

export interface AppsData {
  apps: AppEntry[];
  totalBytes: number;
}

// ─── Brew / Package Manager ──────────────────────────────────────────

export interface BrewPackage {
  name: string;
  version: string;
  description: string;
  installedOnRequest: boolean;
  sizeBytes: number;
  installedOn?: string;
  dependencies: string[];
}

export interface BrewData {
  packages: BrewPackage[];
  cacheBytes: number;
  totalBytes: number;
}

// ─── Dev Caches ──────────────────────────────────────────────────────

export interface DevCacheEntry {
  label: string;
  path: string;
  sizeBytes: number;
  cleanable: boolean;
  warningMessage?: string;
}

export interface DevCacheGroup {
  tool: string;
  entries: DevCacheEntry[];
  totalBytes: number;
}

export interface DevCachesData {
  groups: DevCacheGroup[];
  entries: DevCacheEntry[]; // flat list of all entries
  totalBytes: number;
}

// ─── Docker ──────────────────────────────────────────────────────────

export interface DockerImage {
  repository: string;
  tag: string;
  id: string;
  sizeBytes: number;
  sizeStr: string;
  linkedProjects: string[];
  linkedProjectPaths: string[];
}

export interface DockerContainer {
  name: string;
  image: string;
  state: string;
  sizeStr: string;
  linkedProjects: string[];
  linkedProjectPaths: string[];
}

export interface DockerVolume {
  name: string;
  driver: string;
  sizeStr: string;
  linkedContainers: string[];
}

export interface DockerData {
  online: boolean;
  images: DockerImage[];
  containers: DockerContainer[];
  volumes: DockerVolume[];
  buildCacheSizeStr: string;
  buildCacheReclaimableStr: string;
  totalSizeStr: string;
  reclaimableSizeStr: string;
}

// ─── Git Repos ───────────────────────────────────────────────────────

export interface GitRepoEntry {
  name: string;
  path: string;
  sizeBytes: number;
  gitSizeBytes: number;
  nodeModulesSizeBytes: number;
  linkedDockerImages: string[];
}

export interface GitReposData {
  repos: GitRepoEntry[];
  totalBytes: number;
  totalGitBytes: number;
  totalNodeModulesBytes: number;
}

// ─── Node Modules ────────────────────────────────────────────────────

export interface NodeModulePackage {
  name: string;
  version: string;
  sizeBytes: number;
}

export interface NodeModulesEntry {
  projectName: string;
  path: string;
  sizeBytes: number;
  packages: NodeModulePackage[];
}

export interface NodeModulesData {
  entries: NodeModulesEntry[];
  totalBytes: number;
}

// ─── npm Cache ───────────────────────────────────────────────────────

export interface NpmCacheData {
  npmCacheBytes: number;
  pnpmStoreBytes: number;
  totalBytes: number;
}

// ─── npm Globals ─────────────────────────────────────────────────────

export interface NpmGlobalPackage {
  name: string;
  version: string;
  description: string;
  sizeBytes: number;
}

export interface NpmGlobalsData {
  packages: NpmGlobalPackage[];
  totalBytes: number;
}

// ─── Xcode ───────────────────────────────────────────────────────────

export interface XcodeEntry {
  label: string;
  path: string;
  sizeBytes: number;
}

export interface XcodeData {
  entries: XcodeEntry[];
  totalBytes: number;
}

// ─── Cleanup ─────────────────────────────────────────────────────────

export interface CleanupAction {
  id: string;
  label: string;
  description: string;
  command: string;
  args: string[];
  sizeBytes: number;
  warning?: string;
}

export interface CleanupActionsData {
  actions: CleanupAction[];
}

// ─── Linker ──────────────────────────────────────────────────────────

export interface ProjectLink {
  projectName: string;
  files: string[];
}

export type LinkMap = Map<string, ProjectLink[]>;

// ─── Collected Data ──────────────────────────────────────────────────

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
