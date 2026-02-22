/**
 * Windows node_modules collector — finds node_modules directories in project roots.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { NodeModulesEntry, NodeModulesData, NodeModulePackage } from "../../types.js";
import { DEFAULT_PROJECT_ROOTS, SKIP_DIRS } from "../constants.js";
import { getSize } from "../utils.js";

async function findNodeModulesDirs(roots: string[], maxDepth = 5): Promise<string[]> {
    const results: string[] = [];

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > maxDepth) return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
            const fullPath = path.join(dir, entry.name);

            if (entry.name === "node_modules") {
                results.push(fullPath);
                continue;
            }

            if (SKIP_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".")) continue;

            await walk(fullPath, depth + 1);
        }
    }

    await Promise.all(roots.map((root) => walk(root, 0)));
    return results;
}

/**
 * Scan a node_modules directory for its top-level packages (for detail view).
 */
export async function scanNodeModulesPackages(nmPath: string): Promise<NodeModulePackage[]> {
    const packages: NodeModulePackage[] = [];

    try {
        const entries = await fs.readdir(nmPath, { withFileTypes: true });
        const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));

        for (const dir of dirs) {
            const pkgPath = path.join(nmPath, dir.name);

            // Scoped packages
            if (dir.name.startsWith("@")) {
                try {
                    const sub = await fs.readdir(pkgPath, { withFileTypes: true });
                    for (const s of sub.filter((s) => s.isDirectory())) {
                        const sp = path.join(pkgPath, s.name);
                        const sizeBytes = await getSize(sp);
                        let version = "unknown";
                        try {
                            const pkg = JSON.parse(await fs.readFile(path.join(sp, "package.json"), "utf-8"));
                            version = pkg.version ?? "unknown";
                        } catch { /* skip */ }
                        packages.push({ name: `${dir.name}/${s.name}`, version, sizeBytes });
                    }
                } catch { /* skip */ }
                continue;
            }

            const sizeBytes = await getSize(pkgPath);
            let version = "unknown";
            try {
                const pkg = JSON.parse(await fs.readFile(path.join(pkgPath, "package.json"), "utf-8"));
                version = pkg.version ?? "unknown";
            } catch { /* skip */ }
            packages.push({ name: dir.name, version, sizeBytes });
        }
    } catch {
        // Can't read dir
    }

    packages.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return packages;
}

export async function collectNodeModules(): Promise<NodeModulesData> {
    const nmPaths = await findNodeModulesDirs(DEFAULT_PROJECT_ROOTS);
    const entries: NodeModulesEntry[] = [];

    const promises = nmPaths.map(async (nmPath): Promise<NodeModulesEntry> => {
        const projectDir = path.dirname(nmPath);
        const projectName = path.basename(projectDir);
        const sizeBytes = await getSize(nmPath);
        return { projectName, path: nmPath, sizeBytes, packages: [] };
    });

    const results = await Promise.all(promises);
    entries.push(...results.filter((e) => e.sizeBytes > 0));
    entries.sort((a, b) => b.sizeBytes - a.sizeBytes);

    const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);
    return { entries, totalBytes };
}
