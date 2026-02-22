import { duSize, run } from "../utils.js";
import { homedir } from "node:os";
import { join } from "node:path";
import type { NpmCacheData } from "../../types.js";


export async function collectNpmCache(): Promise<NpmCacheData> {
  const home = homedir();

  // Get pnpm store path
  const pnpmStorePath = (await run("pnpm", ["store", "path"])).trim();

  const [npmCacheBytes, pnpmStoreBytes] = await Promise.all([
    duSize(join(home, ".npm")),
    pnpmStorePath ? duSize(pnpmStorePath) : Promise.resolve(0),
  ]);

  return {
    npmCacheBytes,
    pnpmStoreBytes,
    totalBytes: npmCacheBytes + pnpmStoreBytes,
  };
}
