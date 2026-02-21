import { run } from "../utils.js";

export interface DockerImage {
  repository: string;
  tag: string;
  id: string;
  sizeBytes: number;
  sizeStr: string;
  linkedProjects: string[];
}

export interface DockerContainer {
  name: string;
  image: string;
  state: string;
  sizeStr: string;
  linkedProjects: string[];
}

export interface DockerVolume {
  name: string;
  driver: string;
  sizeStr: string;
  linkedContainers: string[];
}

export interface DockerData {
  online: boolean;
  images: DockerImage[];
  containers: DockerContainer[];
  volumes: DockerVolume[];
  buildCacheSizeStr: string;
  buildCacheReclaimableStr: string;
  totalSizeStr: string;
  reclaimableSizeStr: string;
}

function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB|TB|kB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
  };
  return val * (multipliers[unit] ?? 1);
}

export async function collectDocker(): Promise<DockerData> {
  // Check if Docker is online
  const pingResult = await run("docker", ["info", "--format", "{{.ID}}"], 10_000);
  if (!pingResult.trim()) {
    return {
      online: false,
      images: [],
      containers: [],
      volumes: [],
      buildCacheSizeStr: "—",
      buildCacheReclaimableStr: "—",
      totalSizeStr: "—",
      reclaimableSizeStr: "—",
    };
  }

  // Collect images, containers, volumes in parallel
  const [imagesJson, containersJson, volumesJson, dfOutput] = await Promise.all([
    run("docker", ["images", "--format", "{{json .}}"]),
    run("docker", ["ps", "-a", "--format", "{{json .}}"]),
    run("docker", ["volume", "ls", "--format", "{{json .}}"]),
    run("docker", ["system", "df", "-v"]),
  ]);

  // Parse images
  const images: DockerImage[] = [];
  for (const line of imagesJson.trim().split("\n").filter(Boolean)) {
    try {
      const img = JSON.parse(line);
      images.push({
        repository: img.Repository,
        tag: img.Tag,
        id: img.ID,
        sizeBytes: parseSize(img.Size),
        sizeStr: img.Size,
        linkedProjects: [],
      });
    } catch {}
  }
  images.sort((a, b) => b.sizeBytes - a.sizeBytes);

  // Parse containers
  const containers: DockerContainer[] = [];
  for (const line of containersJson.trim().split("\n").filter(Boolean)) {
    try {
      const c = JSON.parse(line);
      containers.push({
        name: c.Names,
        image: c.Image,
        state: c.State,
        sizeStr: c.Size ?? "—",
        linkedProjects: [],
      });
    } catch {}
  }

  // Parse volumes
  const volumes: DockerVolume[] = [];
  for (const line of volumesJson.trim().split("\n").filter(Boolean)) {
    try {
      const v = JSON.parse(line);
      volumes.push({
        name: v.Name,
        driver: v.Driver,
        sizeStr: "—",
        linkedContainers: [],
      });
    } catch {}
  }

  // Parse docker system df -v for build cache info
  let buildCacheSizeStr = "—";
  let buildCacheReclaimableStr = "—";
  let totalSizeStr = "—";
  let reclaimableSizeStr = "—";

  if (dfOutput) {
    const lines = dfOutput.split("\n");
    for (const line of lines) {
      if (line.startsWith("Build Cache")) {
        const parts = line.split(/\s{2,}/).filter(Boolean);
        if (parts.length >= 4) {
          buildCacheSizeStr = parts[2] ?? "—";
          buildCacheReclaimableStr = parts[3] ?? "—";
        }
      }
    }

    // Calculate totals from df header section
    const typeLines = lines.filter(l => /^(Images|Containers|Local Volumes|Build Cache)\s/.test(l));
    let totalBytes = 0;
    let reclaimableBytes = 0;
    for (const tl of typeLines) {
      const parts = tl.split(/\s{2,}/).filter(Boolean);
      if (parts.length >= 4) {
        totalBytes += parseSize(parts[2]);
        reclaimableBytes += parseSize(parts[3]);
      }
    }
    if (totalBytes > 0) {
      totalSizeStr = formatDockerSize(totalBytes);
      reclaimableSizeStr = formatDockerSize(reclaimableBytes);
    }
  }

  // Link containers to projects via inspect
  await linkDockerProjects(containers, images);

  return {
    online: true,
    images,
    containers,
    volumes,
    buildCacheSizeStr,
    buildCacheReclaimableStr,
    totalSizeStr,
    reclaimableSizeStr,
  };
}

function formatDockerSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

async function linkDockerProjects(containers: DockerContainer[], images: DockerImage[]) {
  for (const container of containers) {
    const inspectJson = await run("docker", ["inspect", container.name]);
    if (!inspectJson) continue;

    try {
      const info = JSON.parse(inspectJson);
      const inspectData = info[0];

      // Check bind mounts
      const mounts = inspectData?.Mounts ?? [];
      for (const mount of mounts) {
        if (mount.Type === "bind" && mount.Source?.startsWith("/Users/")) {
          const projectMatch = mount.Source.match(/^\/Users\/[^/]+\/([^/]+)/);
          if (projectMatch && !container.linkedProjects.includes(projectMatch[1])) {
            container.linkedProjects.push(projectMatch[1]);
          }
        }
      }

      // Check compose label
      const labels = inspectData?.Config?.Labels ?? {};
      const workDir = labels["com.docker.compose.project.working_dir"];
      if (workDir) {
        const projectMatch = workDir.match(/^\/Users\/[^/]+\/([^/]+)/);
        if (projectMatch && !container.linkedProjects.includes(projectMatch[1])) {
          container.linkedProjects.push(projectMatch[1]);
        }
      }

      // Link images to the same projects
      for (const img of images) {
        if (`${img.repository}:${img.tag}` === container.image || img.repository === container.image) {
          for (const proj of container.linkedProjects) {
            if (!img.linkedProjects.includes(proj)) {
              img.linkedProjects.push(proj);
            }
          }
        }
      }
    } catch {}
  }
}
