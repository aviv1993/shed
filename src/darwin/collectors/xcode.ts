import { homedir } from "node:os";
import { join } from "node:path";
import { duSize } from "../utils.js";
import type { XcodeEntry, XcodeData } from "../../types.js";


export async function collectXcode(): Promise<XcodeData> {
  const home = homedir();

  const paths: { label: string; path: string }[] = [
    { label: "Xcode.app", path: "/Applications/Xcode.app" },
    { label: "Command Line Tools", path: "/Library/Developer/CommandLineTools" },
    { label: "DerivedData", path: join(home, "Library/Developer/Xcode/DerivedData") },
    { label: "CoreSimulator", path: join(home, "Library/Developer/CoreSimulator") },
    { label: "Xcode Caches", path: join(home, "Library/Caches/com.apple.dt.Xcode") },
  ];

  const entries: XcodeEntry[] = [];

  await Promise.all(
    paths.map(async ({ label, path }) => {
      const sizeBytes = await duSize(path);
      if (sizeBytes > 0) {
        entries.push({ label, path, sizeBytes });
      }
    })
  );

  entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
  const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

  return { entries, totalBytes };
}
