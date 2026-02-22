/**
 * Windows applications collector — scans Program Files directories.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AppEntry, AppsData } from "../../types.js";
import { PROGRAM_FILES } from "../constants.js";
import { getSize } from "../utils.js";

export async function collectApps(): Promise<AppsData> {
    const apps: AppEntry[] = [];

    for (const root of PROGRAM_FILES) {
        try {
            const entries = await fs.readdir(root, { withFileTypes: true });
            const dirs = entries.filter((e) => e.isDirectory());

            const promises = dirs.map(async (dir): Promise<AppEntry | null> => {
                const fullPath = path.join(root, dir.name);
                try {
                    const sizeBytes = await getSize(fullPath);
                    return { name: dir.name, sizeBytes };
                } catch {
                    return null;
                }
            });

            const results = await Promise.all(promises);
            for (const r of results) {
                if (r && r.sizeBytes > 0) apps.push(r);
            }
        } catch {
            // Directory doesn't exist or permission denied
        }
    }

    apps.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBytes = apps.reduce((s, a) => s + a.sizeBytes, 0);
    return { apps, totalBytes };
}
