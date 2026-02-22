import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { duSize } from "../utils.js";
import type { NpmGlobalPackage, NpmGlobalsData } from "../../types.js";


const GLOBAL_MODULES = "/opt/homebrew/lib/node_modules";

export async function collectNpmGlobals(): Promise<NpmGlobalsData> {
  let entries: string[];
  try {
    entries = await readdir(GLOBAL_MODULES);
  } catch {
    return { packages: [], totalBytes: 0 };
  }

  const packages: NpmGlobalPackage[] = [];
  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "npm") continue;

    if (entry.startsWith("@")) {
      // Scoped package — read subdirectories
      const scopeDir = join(GLOBAL_MODULES, entry);
      promises.push(
        (async () => {
          try {
            const subEntries = await readdir(scopeDir);
            const subPromises = subEntries.map(async (sub) => {
              const pkgDir = join(scopeDir, sub);
              const pkg = await readPackageInfo(pkgDir, `${entry}/${sub}`);
              if (pkg) packages.push(pkg);
            });
            await Promise.all(subPromises);
          } catch { }
        })()
      );
    } else {
      const pkgDir = join(GLOBAL_MODULES, entry);
      promises.push(
        (async () => {
          const pkg = await readPackageInfo(pkgDir, entry);
          if (pkg) packages.push(pkg);
        })()
      );
    }
  }

  await Promise.all(promises);
  packages.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = packages.reduce((sum, p) => sum + p.sizeBytes, 0);

  return { packages, totalBytes };
}

async function readPackageInfo(dir: string, name: string): Promise<NpmGlobalPackage | null> {
  try {
    const [pkgJson, size] = await Promise.all([
      readFile(join(dir, "package.json"), "utf-8").catch(() => "{}"),
      duSize(dir),
    ]);
    const parsed = JSON.parse(pkgJson);
    return {
      name,
      version: parsed.version ?? "?",
      description: parsed.description ?? "",
      sizeBytes: size,
    };
  } catch {
    return null;
  }
}
