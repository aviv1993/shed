import { homedir } from "node:os";
import { join } from "node:path";
import { run, duSize } from "../utils.js";
import type { BrewPackage, BrewData } from "../../types.js";


export async function collectBrew(): Promise<BrewData> {
  const [jsonOutput, cacheSize] = await Promise.all([
    run("brew", ["info", "--json=v1", "--installed"], 60_000),
    duSize(join(homedir(), "Library/Caches/Homebrew")).catch(() => 0),
  ]);

  if (!jsonOutput) {
    return { packages: [], cacheBytes: cacheSize, totalBytes: 0 };
  }

  let brewInfo: any[];
  try {
    brewInfo = JSON.parse(jsonOutput);
  } catch {
    return { packages: [], cacheBytes: cacheSize, totalBytes: 0 };
  }

  // Get sizes concurrently with a pool
  const packages: BrewPackage[] = [];
  const sizePromises: Promise<void>[] = [];
  const concurrency = 12;
  let running = 0;

  for (const pkg of brewInfo) {
    const entry: BrewPackage = {
      name: pkg.name,
      version: pkg.installed?.[0]?.version ?? pkg.versions?.stable ?? "?",
      description: pkg.desc ?? "",
      installedOnRequest: pkg.installed_on_request ?? false,
      sizeBytes: 0,
      installedOn: pkg.installed?.[0]?.installed_on,
      dependencies: pkg.dependencies ?? [],
    };
    packages.push(entry);

    const p = (async () => {
      const cellarPath = `/opt/homebrew/Cellar/${pkg.name}`;
      entry.sizeBytes = await duSize(cellarPath);
    })();
    sizePromises.push(p);
  }

  await Promise.all(sizePromises);

  packages.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = packages.reduce((sum, p) => sum + p.sizeBytes, 0);

  return { packages, cacheBytes: cacheSize, totalBytes };
}
