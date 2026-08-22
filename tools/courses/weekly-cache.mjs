import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isSectionDirectory } from "./lesson-paths.mjs";

export const CACHE_STATE_FILENAME = "cache-state.json";
export const CACHE_AUDIT_FILENAME = "cache-audit.json";
export const CACHED_PLAYLIST_FILENAME = "playlist.json";
export const SOURCE_INVENTORY_FILENAME = "source-inventory.json";
export const CACHE_COMPONENT_NAMES = [
  "documents",
  "notes",
  "youtube",
  "inventory",
];

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

export function hashContent(value) {
  return createHash("sha256").update(value).digest("hex");
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

export async function writeJsonAtomic(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, targetPath);
}

async function readJsonIfExists(targetPath) {
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function getSnapshotsRoot(notesCacheRoot) {
  return path.join(notesCacheRoot, "snapshots");
}

function cacheStamp(date = new Date()) {
  return date.toISOString().replace(/:/gu, "-");
}

export async function loadCacheState(cacheRoot) {
  const state = await readJsonIfExists(
    path.join(cacheRoot, CACHE_STATE_FILENAME)
  );
  if (state) {
    return state;
  }

  const [manifest, report] = await Promise.all([
    readJsonIfExists(path.join(cacheRoot, "manifest.json")),
    readJsonIfExists(
      path.join(cacheRoot, "canonical-note-backup-report.json")
    ),
  ]);
  return {
    schemaVersion: 1,
    cacheId: path.basename(cacheRoot),
    createdAt: manifest?.generatedAt || report?.generatedAt || null,
    updatedAt: report?.generatedAt || manifest?.generatedAt || null,
    status: manifest || report ? "legacy" : "invalid",
    legacy: true,
    components: {},
    latestAudit: null,
    applied: null,
    release: null,
  };
}

export async function writeCacheState(cacheRoot, state) {
  await writeJsonAtomic(path.join(cacheRoot, CACHE_STATE_FILENAME), state);
  return state;
}

export async function createWeeklyCache(
  notesCacheRoot,
  { now = new Date() } = {}
) {
  const snapshotsRoot = getSnapshotsRoot(notesCacheRoot);
  await mkdir(snapshotsRoot, { recursive: true });
  let cacheId = cacheStamp(now);
  let cacheRoot = path.join(snapshotsRoot, cacheId);
  let suffix = 1;

  while (await pathExists(cacheRoot)) {
    cacheId = `${cacheStamp(now)}-${suffix}`;
    cacheRoot = path.join(snapshotsRoot, cacheId);
    suffix += 1;
  }

  await mkdir(cacheRoot, { recursive: true });
  const createdAt = now.toISOString();
  const state = {
    schemaVersion: 1,
    cacheId,
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    legacy: false,
    components: {},
    latestAudit: null,
    applied: null,
    release: null,
  };
  await writeCacheState(cacheRoot, state);
  await updateLatestPointer(notesCacheRoot, cacheRoot);
  return { cacheId, cacheRoot, state };
}

function isWithinDirectory(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export async function resolveWeeklyCache(notesCacheRoot, cacheValue) {
  if (!cacheValue) {
    throw new Error("Choose a weekly cache explicitly.");
  }
  const snapshotsRoot = getSnapshotsRoot(notesCacheRoot);
  const candidate = path.isAbsolute(cacheValue)
    ? path.resolve(cacheValue)
    : path.resolve(snapshotsRoot, cacheValue);

  if (!isWithinDirectory(snapshotsRoot, candidate)) {
    throw new Error(`Cache must be inside ${snapshotsRoot}.`);
  }
  if (!(await pathExists(candidate))) {
    throw new Error(`Weekly cache does not exist: ${candidate}`);
  }
  return candidate;
}

export async function listWeeklyCaches(notesCacheRoot) {
  const snapshotsRoot = getSnapshotsRoot(notesCacheRoot);
  if (!(await pathExists(snapshotsRoot))) {
    return [];
  }

  const entries = await readdir(snapshotsRoot, { withFileTypes: true });
  const caches = [];
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((left, right) => right.name.localeCompare(left.name))) {
    const cacheRoot = path.join(snapshotsRoot, entry.name);
    const state = await loadCacheState(cacheRoot);
    const report = await readJsonIfExists(
      path.join(cacheRoot, "canonical-note-backup-report.json")
    );
    caches.push({
      cacheId: entry.name,
      cacheRoot,
      state,
      noteUpdateCount: report?.updates?.length ?? null,
      legacySummaryCount:
        report?.legacySummaryUpdates?.length ??
        report?.summaryUpdates?.length ??
        null,
      selectable: state.status !== "invalid",
    });
  }
  return caches;
}

export async function findReusableNotesSnapshotRoot(
  notesCacheRoot,
  { preferredCacheRoot = null } = {}
) {
  const caches = await listWeeklyCaches(notesCacheRoot);
  const candidateRoots = [
    preferredCacheRoot,
    ...caches.map((cache) => cache.cacheRoot),
  ].filter(Boolean);

  for (const cacheRoot of new Set(candidateRoots)) {
    if (await pathExists(path.join(cacheRoot, "manifest.json"))) {
      return cacheRoot;
    }
  }
  return null;
}

export function formatCacheChoice(cache) {
  const audit = cache.state.latestAudit;
  const auditLabel = audit
    ? `${audit.errors} errors, ${audit.warnings} warnings`
    : "not audited";
  const updateLabel =
    cache.noteUpdateCount === null
      ? "unknown note updates"
      : `${cache.noteUpdateCount} note updates`;
  return {
    name: `${cache.cacheId} — ${cache.state.status}`,
    value: cache.cacheRoot,
    description: `${updateLabel}; ${auditLabel}`,
    disabled: cache.selectable ? false : "incomplete cache folder",
  };
}

export function computeComponentsFingerprint(components) {
  const normalized = Object.fromEntries(
    Object.entries(components || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, component]) => [
        name,
        {
          fingerprint: component.fingerprint,
          outputPath: component.outputPath,
        },
      ])
  );
  return hashContent(JSON.stringify(normalized));
}

export async function recordCacheComponent({
  cacheRoot,
  state,
  componentName,
  outputPath,
  summary = null,
  updatedAt = new Date().toISOString(),
  preserveApplied = false,
}) {
  const outputBytes = await readFile(outputPath);
  const keepApplied = preserveApplied && state.status === "applied";
  const components = {
    ...(state.components || {}),
    [componentName]: {
      updatedAt,
      outputPath: toPosixPath(path.relative(cacheRoot, outputPath)),
      fingerprint: hashContent(outputBytes),
      summary,
    },
  };
  const nextState = {
    ...state,
    updatedAt,
    status: keepApplied ? "applied" : "draft",
    legacy: false,
    components,
    latestAudit: null,
    applied: keepApplied
      ? {
          ...state.applied,
          componentsFingerprint: computeComponentsFingerprint(components),
        }
      : null,
    release: keepApplied ? state.release : null,
  };
  await writeCacheState(cacheRoot, nextState);
  await rm(path.join(cacheRoot, CACHE_AUDIT_FILENAME), { force: true });
  return nextState;
}

export async function updateLatestPointer(notesCacheRoot, cacheRoot) {
  await mkdir(notesCacheRoot, { recursive: true });
  await writeJsonAtomic(path.join(notesCacheRoot, "latest.json"), {
    latestSnapshotDir: toPosixPath(
      path.relative(notesCacheRoot, cacheRoot)
    ),
    updatedAt: new Date().toISOString(),
  });
}

async function collectFiles(rootPath, currentRelativePath = "") {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const absolutePath = path.join(rootPath, entry.name);
    const relativePath = currentRelativePath
      ? path.join(currentRelativePath, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      const bytes = await readFile(absolutePath);
      files.push({
        path: toPosixPath(relativePath),
        size: bytes.length,
        hash: hashContent(bytes),
      });
    }
  }
  return files;
}

export async function prepareSourceInventory({
  cacheRoot,
  canonicalBase,
  generatedAt = new Date().toISOString(),
}) {
  const sectionNames = (await readdir(canonicalBase, { withFileTypes: true }))
    .filter(
      (entry) => entry.isDirectory() && isSectionDirectory(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const sections = [];

  for (const sectionName of sectionNames) {
    const sectionPath = path.join(canonicalBase, sectionName);
    sections.push({
      directory: sectionName,
      files: await collectFiles(sectionPath),
    });
  }

  const inventory = {
    schemaVersion: 1,
    generatedAt,
    canonicalBase,
    sectionCount: sections.length,
    fileCount: sections.reduce(
      (total, section) => total + section.files.length,
      0
    ),
    sections,
  };
  const inventoryPath = path.join(cacheRoot, SOURCE_INVENTORY_FILENAME);
  await writeJsonAtomic(inventoryPath, inventory);
  return { inventory, inventoryPath };
}

export async function repairLatestPointer(notesCacheRoot) {
  const caches = await listWeeklyCaches(notesCacheRoot);
  if (caches.length === 0) {
    await rm(path.join(notesCacheRoot, "latest.json"), { force: true });
    return null;
  }
  await updateLatestPointer(notesCacheRoot, caches[0].cacheRoot);
  return caches[0].cacheRoot;
}
