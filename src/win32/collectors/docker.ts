/**
 * Windows Docker collector — reuses docker CLI commands which are cross-platform.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type {
    DockerData, DockerImage, DockerContainer, DockerVolume,
} from "../../types.js";
import { run } from "../utils.js";
import { HOME } from "../constants.js";

async function isDockerRunning(): Promise<boolean> {
    try {
        await run("docker", ["info"]);
        return true;
    } catch {
        return false;
    }
}

async function collectImages(): Promise<DockerImage[]> {
    try {
        const out = await run("docker", [
            "images", "--format",
            "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}",
        ]);
        return out.split("\n").filter(Boolean).map((line) => {
            const [repository, tag, id, sizeStr] = line.split("\t");
            return {
                repository,
                tag,
                id,
                sizeStr,
                sizeBytes: parseSizeStr(sizeStr),
                linkedProjects: [],
                linkedProjectPaths: [],
            };
        });
    } catch {
        return [];
    }
}

async function collectContainers(): Promise<DockerContainer[]> {
    try {
        const out = await run("docker", [
            "ps", "-a", "--format",
            "{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Size}}",
        ]);
        return out.split("\n").filter(Boolean).map((line) => {
            const [name, image, state, sizeStr] = line.split("\t");
            return {
                name,
                image,
                state,
                sizeStr: sizeStr ?? "0B",
                linkedProjects: [],
                linkedProjectPaths: [],
            };
        });
    } catch {
        return [];
    }
}

async function collectVolumes(): Promise<DockerVolume[]> {
    try {
        const out = await run("docker", [
            "volume", "ls", "--format", "{{.Name}}\t{{.Driver}}",
        ]);
        return out.split("\n").filter(Boolean).map((line) => {
            const [name, driver] = line.split("\t");
            return { name, driver, sizeStr: "—", linkedContainers: [] };
        });
    } catch {
        return [];
    }
}

function parseSizeStr(s: string): number {
    const match = s?.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const m: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
    return val * (m[unit] ?? 1);
}

async function getSystemInfo(): Promise<{ totalSize: string; reclaimable: string; buildCache: string; buildCacheReclaimable: string }> {
    try {
        const out = await run("docker", ["system", "df", "--format", "{{.Type}}\t{{.Size}}\t{{.Reclaimable}}"]);
        const lines = out.split("\n").filter(Boolean);
        let totalSize = "—", reclaimable = "—", buildCache = "—", buildCacheReclaimable = "—";
        for (const line of lines) {
            const [type, size, reclaim] = line.split("\t");
            if (type === "Build Cache") {
                buildCache = size;
                buildCacheReclaimable = reclaim;
            }
        }
        totalSize = lines.map((l) => l.split("\t")[1]).join(" + ");
        reclaimable = lines.map((l) => l.split("\t")[2]).filter(Boolean).join(" + ");
        return { totalSize, reclaimable, buildCache, buildCacheReclaimable };
    } catch {
        return { totalSize: "—", reclaimable: "—", buildCache: "—", buildCacheReclaimable: "—" };
    }
}

async function linkProjectsToImages(images: DockerImage[]): Promise<void> {
    const projectRoot = path.join(HOME, "projects");
    try {
        const entries = await fs.readdir(projectRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const projDir = path.join(projectRoot, entry.name);
            const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
            for (const cf of composeFiles) {
                try {
                    const content = await fs.readFile(path.join(projDir, cf), "utf-8");
                    for (const img of images) {
                        if (content.includes(img.repository)) {
                            if (!img.linkedProjects.includes(entry.name)) {
                                img.linkedProjects.push(entry.name);
                                img.linkedProjectPaths.push(projDir);
                            }
                        }
                    }
                } catch {
                    // File doesn't exist — skip
                }
            }
        }
    } catch {
        // projects dir doesn't exist
    }
}

export async function collectDocker(): Promise<DockerData> {
    const online = await isDockerRunning();
    if (!online) {
        return {
            online: false,
            images: [], containers: [], volumes: [],
            buildCacheSizeStr: "—", buildCacheReclaimableStr: "—",
            totalSizeStr: "—", reclaimableSizeStr: "—",
        };
    }

    const [images, containers, volumes, sysInfo] = await Promise.all([
        collectImages(),
        collectContainers(),
        collectVolumes(),
        getSystemInfo(),
    ]);

    await linkProjectsToImages(images);

    return {
        online: true,
        images,
        containers,
        volumes,
        buildCacheSizeStr: sysInfo.buildCache,
        buildCacheReclaimableStr: sysInfo.buildCacheReclaimable,
        totalSizeStr: sysInfo.totalSize,
        reclaimableSizeStr: sysInfo.reclaimable,
    };
}
