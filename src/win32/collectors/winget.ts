/**
 * Windows winget collector — lists packages installed via winget.
 * Maps to the BrewData/BrewPackage types for TUI compatibility.
 */
import type { BrewPackage, BrewData } from "../../types.js";
import { run } from "../utils.js";

/**
 * Parse `winget list` output into package entries.
 * winget output is a table with columns: Name, Id, Version, Source
 */
function parseWingetList(stdout: string): BrewPackage[] {
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    const packages: BrewPackage[] = [];

    // Find the header separator line (dashes)
    const sepIndex = lines.findIndex((l) => /^-{3,}/.test(l));
    if (sepIndex < 0) return packages;

    // Parse data lines after the separator
    for (let i = sepIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.startsWith("-")) continue;

        // winget output is space-padded columns — split on 2+ spaces
        const parts = line.split(/\s{2,}/).filter(Boolean);
        if (parts.length < 2) continue;

        const name = parts[0];
        const id = parts[1] ?? name;
        const version = parts[2] ?? "unknown";

        packages.push({
            name: id,
            version,
            description: name,       // Use display name as description
            installedOnRequest: true,
            sizeBytes: 0,             // winget doesn't report sizes
            dependencies: [],
        });
    }

    return packages;
}

export async function collectWinget(): Promise<BrewData> {
    try {
        const stdout = await run("winget", ["list", "--disable-interactivity"]);
        const packages = parseWingetList(stdout);
        const totalBytes = packages.reduce((s, p) => s + p.sizeBytes, 0);
        return { packages, cacheBytes: 0, totalBytes };
    } catch {
        // winget not installed or failed
        return { packages: [], cacheBytes: 0, totalBytes: 0 };
    }
}
