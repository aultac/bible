import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { watch as watchFileSystem } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const staticRoot = path.join(repoRoot, "static");
const distRoot = path.join(repoRoot, "dist");
const watchMode = process.argv.includes("--watch");
const ignoredNames = new Set([".DS_Store", "Thumbs.db"]);
let previousTopLevelEntries = new Set();

function shouldIgnore(name) {
  return ignoredNames.has(name) || name.startsWith(".");
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function copyDirectory(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function listTopLevelEntries() {
  const entries = await readdir(staticRoot, { withFileTypes: true });
  return entries
    .filter((entry) => !shouldIgnore(entry.name) && (entry.isDirectory() || entry.isFile()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function copyStaticSite() {
  if (!(await pathExists(staticRoot))) {
    throw new Error("static/ does not exist.");
  }

  const topLevelEntries = await listTopLevelEntries();
  const outputEntriesToRefresh = new Set([
    ...previousTopLevelEntries,
    ...topLevelEntries,
  ]);

  await mkdir(distRoot, { recursive: true });

  for (const entryName of outputEntriesToRefresh) {
    await rm(path.join(distRoot, entryName), { recursive: true, force: true });
  }

  await copyDirectory(staticRoot, distRoot);
  previousTopLevelEntries = new Set(topLevelEntries);
  console.log("Copied static/ to dist/");
}

if (!watchMode) {
  await copyStaticSite();
} else {
  let debounceTimer = null;

  function scheduleCopy() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      copyStaticSite().catch((error) => {
        console.error(error);
      });
    }, 80);
  }

  await copyStaticSite();

  const watcher = watchFileSystem(staticRoot, { recursive: true }, scheduleCopy);

  function closeWatcher() {
    watcher.close();
  }

  process.on("SIGINT", () => {
    closeWatcher();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    closeWatcher();
    process.exit(0);
  });

  console.log("Watching static/ for changes");
  await new Promise(() => {});
}
