/**
 * Windows npm cache collector — reads npm and pnpm cache directories.
 */
import type { NpmCacheData } from "../../types.js";
import { NPM_CACHE_DIR, PNPM_STORE_DIR } from "../constants.js";
import { getSize } from "../utils.js";

export async function collectNpmCache(): Promise<NpmCacheData> {
    const [npmCacheBytes, pnpmStoreBytes] = await Promise.all([
        getSize(NPM_CACHE_DIR),
        getSize(PNPM_STORE_DIR),
    ]);

    return {
        npmCacheBytes,
        pnpmStoreBytes,
        totalBytes: npmCacheBytes + pnpmStoreBytes,
    };
}
