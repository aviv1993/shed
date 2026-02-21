import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_DIR = join(homedir(), ".cache", "shed");
const CACHE_FILE = join(CACHE_DIR, "last-scan.json");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function loadCachedData(): Promise<any | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf-8");
    const cached = JSON.parse(raw);
    // Check if cache is not too stale
    if (cached._timestamp && Date.now() - cached._timestamp < MAX_AGE_MS) {
      // Restore the Map from the serialized array
      if (cached.links && Array.isArray(cached.links)) {
        cached.links = new Map(cached.links);
      }
      return cached;
    }
  } catch {}
  return null;
}

export async function saveCachedData(data: any): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    // Serialize the Map to an array for JSON
    const serializable = {
      ...data,
      links: data.links instanceof Map ? Array.from(data.links.entries()) : data.links,
      _timestamp: Date.now(),
    };
    await writeFile(CACHE_FILE, JSON.stringify(serializable), "utf-8");
  } catch {}
}
