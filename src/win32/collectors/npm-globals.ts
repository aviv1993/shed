/**
 * Windows npm globals collector — scans %APPDATA%/npm.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { NpmGlobalPackage, NpmGlobalsData } from "../../types.js";
import { NPM_GLOBAL_DIR } from "../constants.js";
import { getSize } from "../utils.js";

export async function collectNpmGlobals(): Promise<NpmGlobalsData> {
    const packages: NpmGlobalPackage[] = [];

    try {
        const nodeModulesDir = path.join(NPM_GLOBAL_DIR, "node_modules");
        const entries = await fs.readdir(nodeModulesDir, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));

        const promises = dirs.map(async (dir): Promise<NpmGlobalPackage | null> => {
            const pkgDir = path.join(nodeModulesDir, dir.name);

            // Handle scoped packages (@scope/pkg)
            if (dir.name.startsWith("@")) {
                try {
                    const sub = await fs.readdir(pkgDir, { withFileTypes: true });
                    const subPkgs = await Promise.all(
                        sub.filter((s) => s.isDirectory()).map(async (s): Promise<NpmGlobalPackage> => {
                            const sp = path.join(pkgDir, s.name);
                            const sizeBytes = await getSize(sp);
                            let version = "unknown";
                            let description = "";
                            try {
                                const pkg = JSON.parse(await fs.readFile(path.join(sp, "package.json"), "utf-8"));
                                version = pkg.version ?? "unknown";
                                description = pkg.description ?? "";
                            } catch { /* skip */ }
                            return { name: `${dir.name}/${s.name}`, sizeBytes, version, description };
                        })
                    );
                    packages.push(...subPkgs);
                    return null;
                } catch {
                    return null;
                }
            }

            const sizeBytes = await getSize(pkgDir);
            let version = "unknown";
            let description = "";
            try {
                const pkg = JSON.parse(await fs.readFile(path.join(pkgDir, "package.json"), "utf-8"));
                version = pkg.version ?? "unknown";
                description = pkg.description ?? "";
            } catch { /* skip */ }
            return { name: dir.name, sizeBytes, version, description };
        });

        const results = await Promise.all(promises);
        for (const r of results) {
            if (r) packages.push(r);
        }
    } catch {
        // npm globals dir doesn't exist
    }

    packages.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const totalBytes = packages.reduce((s, p) => s + p.sizeBytes, 0);
    return { packages, totalBytes };
}
