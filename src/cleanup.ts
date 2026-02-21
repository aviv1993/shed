import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { duSize, run } from "./utils.js";

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

const home = homedir();

const CLEANUP_DEFS: Omit<CleanupAction, "sizeBytes">[] = [
  {
    id: "brew-cleanup",
    label: "Homebrew Cleanup",
    description: "Remove stale downloads and old versions (brew cleanup)",
    command: "brew",
    args: ["cleanup", "--prune=all", "-s"],
    warning: "Next brew install may take longer to download packages",
  },
  {
    id: "brew-autoremove",
    label: "Homebrew Autoremove",
    description: "Remove unused dependencies (brew autoremove)",
    command: "brew",
    args: ["autoremove"],
    warning: "Removed packages will be reinstalled if still needed by other formulae",
  },
  {
    id: "npm-cache-clean",
    label: "npm Cache Clean",
    description: "Clear the npm cache (~/.npm)",
    command: "npm",
    args: ["cache", "clean", "--force"],
    warning: "Next npm install will re-download all packages",
  },
  {
    id: "pnpm-store-prune",
    label: "pnpm Store Prune",
    description: "Remove unreferenced packages from pnpm store",
    command: "pnpm",
    args: ["store", "prune"],
    warning: "Removed packages will be re-downloaded when needed",
  },
  {
    id: "docker-prune",
    label: "Docker System Prune",
    description: "Remove unused containers, networks, and dangling images",
    command: "docker",
    args: ["system", "prune", "-f"],
    warning: "Unused images will be re-pulled on next docker run",
  },
  {
    id: "docker-builder-prune",
    label: "Docker Builder Prune",
    description: "Remove build cache",
    command: "docker",
    args: ["builder", "prune", "-f"],
    warning: "Next docker build will be slower (no layer cache)",
  },
  {
    id: "derived-data",
    label: "Clear DerivedData",
    description: "Remove Xcode DerivedData (~/Library/Developer/Xcode/DerivedData)",
    command: "rm",
    args: ["-rf", join(home, "Library/Developer/Xcode/DerivedData")],
    warning: "Next Xcode build will do a full rebuild",
  },
];

async function estimateSize(id: string): Promise<number> {
  try {
    switch (id) {
      case "brew-cleanup": {
        const cachePath = (await run("brew", ["--cache"])).trim();
        return cachePath ? await duSize(cachePath) : 0;
      }
      case "npm-cache-clean":
        return await duSize(join(home, ".npm"));
      case "pnpm-store-prune": {
        const storePath = (await run("pnpm", ["store", "path"])).trim();
        return storePath ? await duSize(storePath) : 0;
      }
      case "derived-data":
        return await duSize(join(home, "Library/Developer/Xcode/DerivedData"));
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

export async function collectCleanupActions(): Promise<CleanupActionsData> {
  const actions = await Promise.all(
    CLEANUP_DEFS.map(async (def) => ({
      ...def,
      sizeBytes: await estimateSize(def.id),
    }))
  );
  return { actions };
}

export function runCleanupAction(
  action: CleanupAction,
  onData: (text: string) => void,
  onDone: (code: number | null) => void,
): () => void {
  const child = spawn(action.command, action.args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LC_ALL: "C" },
  });

  child.stdout?.on("data", (chunk: Buffer) => onData(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => onData(chunk.toString()));
  child.on("close", (code) => onDone(code));
  child.on("error", (err) => {
    onData(`Error: ${err.message}\n`);
    onDone(1);
  });

  return () => {
    try { child.kill(); } catch {}
  };
}
