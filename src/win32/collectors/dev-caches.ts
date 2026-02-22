/**
 * Windows dev caches collector — scans IDE and tool cache directories.
 */
import fs from "node:fs/promises";
import type { DevCacheEntry, DevCacheGroup, DevCachesData } from "../../types.js";
import { DEV_CACHE_GROUPS } from "../constants.js";
import { getSize } from "../utils.js";

export async function collectDevCaches(): Promise<DevCachesData> {
    const entries: DevCacheEntry[] = [];
    const groups: DevCacheGroup[] = [];

    for (const group of DEV_CACHE_GROUPS) {
        let groupTotal = 0;
        const groupEntries: DevCacheEntry[] = [];

        for (const p of group.paths) {
            try {
                await fs.access(p);
                const sizeBytes = await getSize(p);
                groupTotal += sizeBytes;
                groupEntries.push({
                    label: group.name,
                    path: p,
                    sizeBytes,
                    cleanable: group.cleanable,
                });
            } catch {
                // Path doesn't exist — skip
            }
        }

        if (groupEntries.length > 0) {
            entries.push(...groupEntries);
            groups.push({
                tool: group.name,
                entries: groupEntries,
                totalBytes: groupTotal,
            });
        }
    }

    entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);
    return { entries, totalBytes, groups };
}
