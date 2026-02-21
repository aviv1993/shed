import { readdir } from "node:fs/promises";
import { duSize } from "../utils.js";

export interface AppEntry {
  name: string;
  sizeBytes: number;
}

export interface AppsData {
  apps: AppEntry[];
  totalBytes: number;
}

export async function collectApps(): Promise<AppsData> {
  let entries: string[];
  try {
    entries = await readdir("/Applications");
  } catch {
    return { apps: [], totalBytes: 0 };
  }

  const appDirs = entries.filter((e) => e.endsWith(".app"));
  const apps: AppEntry[] = [];

  const promises = appDirs.map(async (name) => {
    const size = await duSize(`/Applications/${name}`);
    apps.push({ name, sizeBytes: size });
  });

  await Promise.all(promises);
  apps.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = apps.reduce((sum, a) => sum + a.sizeBytes, 0);

  return { apps, totalBytes };
}
