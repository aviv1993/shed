/**
 * Windows-specific constants for shed.
 */
import path from "node:path";
import os from "node:os";

export const HOME = os.homedir();

/** Directories to skip when recursively scanning the filesystem. */
export const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".hg",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".nox",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",       // Rust / Maven
    "bin",
    "obj",          // .NET
    "packages",     // NuGet
    "vendor",
    ".terraform",
    ".gradle",
    "$RECYCLE.BIN",
    "System Volume Information",
    "Windows",
    "ProgramData",
]);

/** Default scan roots for finding projects on Windows. */
export const DEFAULT_PROJECT_ROOTS = [
    path.join(HOME, "projects"),
    path.join(HOME, "repos"),
    path.join(HOME, "source"),
    path.join(HOME, "dev"),
];

/** npm / pnpm cache paths on Windows. */
export const NPM_CACHE_DIR = path.join(HOME, "AppData", "Local", "npm-cache");
export const PNPM_STORE_DIR = path.join(HOME, "AppData", "Local", "pnpm-store");

/** npm global packages on Windows. */
export const NPM_GLOBAL_DIR = path.join(HOME, "AppData", "Roaming", "npm");

/** Common Program Files directories. */
export const PROGRAM_FILES = [
    process.env["ProgramFiles"] ?? "C:\\Program Files",
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    path.join(HOME, "AppData", "Local", "Programs"),
];

/** Dev cache locations on Windows (IDEs, tools, etc.). */
export const DEV_CACHE_GROUPS = [
    {
        name: "VS Code",
        paths: [
            path.join(HOME, "AppData", "Roaming", "Code"),
            path.join(HOME, ".vscode"),
        ],
        cleanable: false,
    },
    {
        name: "JetBrains",
        paths: [
            path.join(HOME, "AppData", "Local", "JetBrains"),
            path.join(HOME, "AppData", "Roaming", "JetBrains"),
        ],
        cleanable: false,
    },
    {
        name: "Gradle",
        paths: [path.join(HOME, ".gradle")],
        cleanable: true,
    },
    {
        name: "Maven",
        paths: [path.join(HOME, ".m2")],
        cleanable: true,
    },
    {
        name: "pip / pipx",
        paths: [
            path.join(HOME, "AppData", "Local", "pip"),
            path.join(HOME, "AppData", "Local", "pipx"),
        ],
        cleanable: true,
    },
    {
        name: "Cargo (Rust)",
        paths: [path.join(HOME, ".cargo")],
        cleanable: false,
    },
    {
        name: "NuGet",
        paths: [
            path.join(HOME, ".nuget"),
            path.join(HOME, "AppData", "Local", "NuGet"),
        ],
        cleanable: true,
    },
    {
        name: "Docker Desktop",
        paths: [
            path.join(HOME, "AppData", "Local", "Docker"),
            path.join(HOME, ".docker"),
        ],
        cleanable: false,
    },
    {
        name: "Windows Temp",
        paths: [
            path.join(HOME, "AppData", "Local", "Temp"),
        ],
        cleanable: true,
    },
];
