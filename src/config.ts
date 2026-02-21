import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface ShedConfig {
  gitScanPaths: { path: string; depth: number }[];
}

const CONFIG_PATH = join(homedir(), ".config", "shed", "config.json");

const DEFAULT_CONFIG: ShedConfig = {
  gitScanPaths: [{ path: homedir(), depth: 3 }],
};

export async function loadConfig(): Promise<ShedConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.gitScanPaths) && parsed.gitScanPaths.length > 0) {
      return parsed as ShedConfig;
    }
  } catch {}
  return { ...DEFAULT_CONFIG, gitScanPaths: [...DEFAULT_CONFIG.gitScanPaths] };
}

export async function saveConfig(config: ShedConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
