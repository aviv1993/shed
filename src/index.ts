#!/usr/bin/env node
import { program } from "commander";
import type { CollectedData } from "./types.js";
import { ShedApp } from "./tui/app.js";
import { loadCachedData } from "./cache.js";
import type { ShedConfig } from "./config.js";

program
  .name("shed")
  .description("Dev Disk Usage TUI")
  .version("0.1.0")
  .action(async () => {
    // Platform router — load the correct collectAll implementation
    const { collectAll } = process.platform === "win32"
      ? await import("./win32/index.js")
      : await import("./darwin/index.js");

    const app = new ShedApp(
      (onProgress?: (done: number, total: number) => void, config?: ShedConfig) =>
        collectAll(onProgress, config),
      loadCachedData,
    );
    await app.start();
  });

program.parse();
