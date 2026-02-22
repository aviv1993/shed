/**
 * Windows linker — scans project directories to build a link map
 * mapping package names to projects that depend on them.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { LinkMap, ProjectLink } from "../types.js";
import { DEFAULT_PROJECT_ROOTS, SKIP_DIRS } from "./constants.js";

/**
 * Build a link map from package names to project names that use them.
 * Scans package.json files in project roots for dependencies.
 */
export async function buildLinkMap(packageNames: string[]): Promise<LinkMap> {
    const map: LinkMap = new Map();
    if (packageNames.length === 0) return map;

    const nameSet = new Set(packageNames);

    for (const root of DEFAULT_PROJECT_ROOTS) {
        try {
            const entries = await fs.readdir(root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (SKIP_DIRS.has(entry.name)) continue;

                const pkgJsonPath = path.join(root, entry.name, "package.json");
                try {
                    const content = await fs.readFile(pkgJsonPath, "utf-8");
                    const pkg = JSON.parse(content);
                    const allDeps = {
                        ...pkg.dependencies,
                        ...pkg.devDependencies,
                        ...pkg.peerDependencies,
                    };

                    for (const dep of Object.keys(allDeps)) {
                        if (nameSet.has(dep)) {
                            if (!map.has(dep)) map.set(dep, []);
                            const link: ProjectLink = { projectName: entry.name, files: [pkgJsonPath] };
                            map.get(dep)!.push(link);
                        }
                    }
                } catch {
                    // No package.json or not valid JSON — skip
                }
            }
        } catch {
            // Root doesn't exist
        }
    }

    return map;
}
