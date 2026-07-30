import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditCourses } from "./audit-courses.mjs";
import { REPO_ROOT, loadCoursesEnv } from "./config.mjs";
import {
  loadDocumentSummaries,
  prepareDocumentSummaries,
} from "./document-summaries.mjs";
import {
  applyCanonicalNoteBackups,
  getCanonicalNoteBackupReportPath,
  loadCanonicalNoteBackupReport,
  prepareCanonicalNoteBackups,
} from "./notes-backups.mjs";
import { createNotesSnapshot } from "./notes-snapshot.mjs";
import { syncCoursesContent } from "./repo-content.mjs";
import {
  CACHE_COMPONENT_NAMES,
  CACHED_PLAYLIST_FILENAME,
  computeComponentsFingerprint,
  createWeeklyCache,
  findReusableNotesSnapshotRoot,
  hashContent,
  loadCacheState,
  prepareSourceInventory,
  recordCacheComponent,
  resolveWeeklyCache,
  updateLatestPointer,
  writeCacheState,
  writeJsonAtomic,
} from "./weekly-cache.mjs";
import {
  auditWeeklyCache,
  formatCacheAudit,
} from "./weekly-cache-audit.mjs";
import { fetchPlaylistSnapshot } from "./youtube-playlist.mjs";

const NOTES_REPORT_FILENAME = "canonical-note-backup-report.json";

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

function createProgressLogger(onProgress) {
  return typeof onProgress === "function" ? onProgress : () => {};
}

function normalizeComponents(components) {
  if (!components || components.length === 0) {
    return [...CACHE_COMPONENT_NAMES];
  }
  const unique = [...new Set(components)];
  const unknown = unique.filter(
    (component) => !CACHE_COMPONENT_NAMES.includes(component)
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown cache component(s): ${unknown.join(", ")}`);
  }
  return unique;
}

async function replaceDirectory(sourceDirectory, destinationDirectory) {
  const nextDirectory = `${destinationDirectory}.next-${process.pid}`;
  const backupDirectory = `${destinationDirectory}.backup-${process.pid}`;
  await rm(nextDirectory, { recursive: true, force: true });
  await rm(backupDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, nextDirectory, { recursive: true });
  if (await pathExists(destinationDirectory)) {
    await rename(destinationDirectory, backupDirectory);
  }
  try {
    await rename(nextDirectory, destinationDirectory);
    await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    await rm(destinationDirectory, { recursive: true, force: true });
    if (await pathExists(backupDirectory)) {
      await rename(backupDirectory, destinationDirectory);
    }
    throw error;
  }
}

async function preserveLegacySummaryCandidates(cacheRoot) {
  const reportPath = path.join(cacheRoot, NOTES_REPORT_FILENAME);
  if (!(await pathExists(reportPath))) {
    return [];
  }
  const report = await loadCanonicalNoteBackupReport(reportPath);
  const legacyUpdates =
    report.legacySummaryUpdates || report.summaryUpdates || [];
  const preserved = [];

  for (const [index, update] of legacyUpdates.entries()) {
    if (
      !update.stagedSummaryPath ||
      !(await pathExists(update.stagedSummaryPath))
    ) {
      preserved.push({ ...update });
      continue;
    }
    const lessonName =
      path.basename(path.dirname(update.canonicalSummaryPath || "")) ||
      `summary-${index + 1}`;
    const destinationDirectory = path.join(
      cacheRoot,
      "legacy-ai-summaries",
      lessonName
    );
    await mkdir(destinationDirectory, { recursive: true });
    const stagedSummaryPath = path.join(
      destinationDirectory,
      path.basename(update.stagedSummaryPath)
    );
    await copyFile(update.stagedSummaryPath, stagedSummaryPath);
    let stagedMetadataPath = null;
    if (
      update.stagedMetadataPath &&
      (await pathExists(update.stagedMetadataPath))
    ) {
      stagedMetadataPath = path.join(
        destinationDirectory,
        path.basename(update.stagedMetadataPath)
      );
      await copyFile(update.stagedMetadataPath, stagedMetadataPath);
    }
    preserved.push({
      ...update,
      stagedSummaryPath,
      stagedMetadataPath,
    });
  }
  return preserved;
}

async function prepareNotesComponent({
  cacheRoot,
  coursesEnv,
  fullNotesExport,
  previousSnapshotRoot,
  progress,
  dependencies,
}) {
  const legacySummaryUpdates =
    await preserveLegacySummaryCandidates(cacheRoot);
  const temporaryOutput = await mkdtemp(
    path.join(os.tmpdir(), "bible-weekly-notes-")
  );
  try {
    progress("Refreshing Apple Notes and staging changed notes.md files.");
    const snapshot = await dependencies.createNotesSnapshot(
      {
        coursesEnv,
        account: coursesEnv.notesAccount,
        folder: coursesEnv.notesFolder,
        output: temporaryOutput,
        fullExport: Boolean(fullNotesExport),
        previousSnapshotRoot,
        prepareBackups: false,
      },
      dependencies.notesSnapshotDependencies || {}
    );
    if (snapshot.exportStats) {
      progress(
        `Apple Notes bodies: ${snapshot.exportStats.exported} exported, ${snapshot.exportStats.reused} reused.`
      );
    }
    await replaceDirectory(
      path.join(snapshot.snapshotRoot, "notes"),
      path.join(cacheRoot, "notes")
    );
    await copyFile(
      path.join(snapshot.snapshotRoot, "manifest.json"),
      path.join(cacheRoot, "manifest.json")
    );
    await copyFile(
      path.join(snapshot.snapshotRoot, "titles.txt"),
      path.join(cacheRoot, "titles.txt")
    );
    const backups = await dependencies.prepareCanonicalNoteBackups({
      snapshotRoot: cacheRoot,
      canonicalBase: coursesEnv.canonicalBase,
    });
    progress(
      `Canonical notes comparison: ${
        backups.report.totals.new + backups.report.totals.updated
      } staged, ${backups.report.totals.unchanged} unchanged.`
    );
    if (legacySummaryUpdates.length > 0) {
      backups.report.legacySummaryUpdates = legacySummaryUpdates;
      delete backups.report.summaryUpdates;
      await writeJsonAtomic(backups.reportPath, backups.report);
    }
    return {
      snapshot,
      report: backups.report,
      reportPath: backups.reportPath,
    };
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
}

async function prepareWeeklyCache(options, coursesEnv, dependencies) {
  const progress = createProgressLogger(options.onProgress);
  const components = normalizeComponents(options.components);
  let cacheRoot = options.cacheRoot
    ? await resolveWeeklyCache(coursesEnv.notesCacheRoot, options.cacheRoot)
    : null;
  let state;
  let created = false;

  if (!cacheRoot) {
    const cache = await dependencies.createWeeklyCache(
      coursesEnv.notesCacheRoot
    );
    cacheRoot = cache.cacheRoot;
    state = cache.state;
    created = true;
  } else {
    state = await dependencies.loadCacheState(cacheRoot);
    if (state.status === "applied") {
      throw new Error(
        "Applied caches are immutable. Create a new cache instead."
      );
    }
    await updateLatestPointer(coursesEnv.notesCacheRoot, cacheRoot);
  }
  const previousNotesSnapshotRoot =
    components.includes("notes") && !options.fullNotesExport
      ? await dependencies.findReusableNotesSnapshotRoot(
          coursesEnv.notesCacheRoot,
          { preferredCacheRoot: cacheRoot }
        )
      : null;

  const componentResults = {};
  if (components.includes("documents")) {
    progress("Parsing Word summaries and extracting video titles.");
    const documents = await dependencies.prepareDocumentSummaries({
      cacheRoot,
      canonicalBase: coursesEnv.canonicalBase,
    });
    state = await dependencies.recordCacheComponent({
      cacheRoot,
      state,
      componentName: "documents",
      outputPath: documents.manifestPath,
      summary: {
        records: documents.manifest.recordCount,
        titles: documents.manifest.records.filter(
          (record) => record.videoSummary
        ).length,
      },
    });
    componentResults.documents = documents;
  }

  if (components.includes("notes")) {
    const notes = await prepareNotesComponent({
      cacheRoot,
      coursesEnv,
      fullNotesExport: options.fullNotesExport,
      previousSnapshotRoot: previousNotesSnapshotRoot,
      progress,
      dependencies,
    });
    state = await dependencies.recordCacheComponent({
      cacheRoot,
      state,
      componentName: "notes",
      outputPath: notes.reportPath,
      summary: notes.report.totals,
    });
    componentResults.notes = notes;
  }

  if (components.includes("youtube")) {
    if (!coursesEnv.youtubePlaylistUrl) {
      throw new Error(
        "COURSES_YOUTUBE_PLAYLIST_URL is required to refresh YouTube."
      );
    }
    progress("Refreshing the YouTube playlist snapshot.");
    const playlist = await dependencies.fetchPlaylistSnapshot(
      coursesEnv.youtubePlaylistUrl,
      { onRetry: (message) => progress(message) }
    );
    const playlistPath = path.join(cacheRoot, CACHED_PLAYLIST_FILENAME);
    await writeJsonAtomic(playlistPath, playlist);
    state = await dependencies.recordCacheComponent({
      cacheRoot,
      state,
      componentName: "youtube",
      outputPath: playlistPath,
      summary: { videos: playlist.videoCount },
    });
    componentResults.youtube = { playlist, playlistPath };
  }

  if (components.includes("inventory")) {
    progress("Scanning lesson folders, assets, and publication markers.");
    const inventory = await dependencies.prepareSourceInventory({
      cacheRoot,
      canonicalBase: coursesEnv.canonicalBase,
    });
    state = await dependencies.recordCacheComponent({
      cacheRoot,
      state,
      componentName: "inventory",
      outputPath: inventory.inventoryPath,
      summary: {
        sections: inventory.inventory.sectionCount,
        files: inventory.inventory.fileCount,
      },
    });
    componentResults.inventory = inventory;
  }

  progress("Auditing the prepared cache.");
  const audited = await dependencies.auditWeeklyCache({
    cacheRoot,
    canonicalBase: coursesEnv.canonicalBase,
  });
  return {
    phase: "prepare",
    cacheId: path.basename(cacheRoot),
    cacheRoot,
    created,
    refreshedComponents: components,
    componentResults,
    state: audited.state,
    audit: audited.audit,
    reviewRequired: true,
    deployRun: false,
  };
}

async function loadReadyCache(cacheRoot) {
  const state = await loadCacheState(cacheRoot);
  if (state.status !== "ready" || !state.latestAudit?.ready) {
    throw new Error(
      "The selected cache is not ready. Run the cache audit and fix its errors first."
    );
  }
  const currentFingerprint = computeComponentsFingerprint(state.components);
  if (currentFingerprint !== state.latestAudit.componentsFingerprint) {
    throw new Error(
      "The selected cache changed after its successful audit. Audit it again."
    );
  }
  return state;
}

async function collectAppliedNoteHashes(report) {
  const notes = [];
  for (const update of report.updates || []) {
    notes.push({
      path: update.canonicalNotesPath,
      hash: hashContent(await readFile(update.canonicalNotesPath)),
    });
  }
  return notes;
}

async function applyWeeklyCache(options, coursesEnv, dependencies) {
  const progress = createProgressLogger(options.onProgress);
  const cacheRoot = await resolveWeeklyCache(
    coursesEnv.notesCacheRoot,
    options.cacheRoot
  );
  const existingState = await loadCacheState(cacheRoot);
  if (existingState.status === "applied" && existingState.applied) {
    return {
      phase: "apply",
      cacheId: path.basename(cacheRoot),
      cacheRoot,
      alreadyApplied: true,
      notesApplied: 0,
      appliedNotes: [],
      state: existingState,
      deployRun: false,
    };
  }
  const state = await loadReadyCache(cacheRoot);
  const reportPath = getCanonicalNoteBackupReportPath(cacheRoot);

  progress(`Applying reviewed notes from ${path.basename(cacheRoot)}.`);
  const backups = await dependencies.applyCanonicalNoteBackups({
    reportPath,
  });
  const [documentSummaries, playlistSnapshot] = await Promise.all([
    loadDocumentSummaries(cacheRoot),
    JSON.parse(
      await readFile(path.join(cacheRoot, CACHED_PLAYLIST_FILENAME), "utf8")
    ),
  ]);

  progress("Regenerating course content from audited cached inputs.");
  const refresh = await dependencies.syncCoursesContent({
    documentSummaries,
    documentCacheRoot: cacheRoot,
    playlistSnapshot,
  });
  progress("Running the repository course audit.");
  const audit = await dependencies.auditCourses({
    online: Boolean(options.onlineAudit),
  });
  if (audit.totals.errors > 0) {
    const error = new Error(
      `Course regeneration completed, but the audit found ${audit.totals.errors} error(s).`
    );
    error.result = { audit, refresh };
    throw error;
  }

  const appliedAt = new Date().toISOString();
  const playlistPath = path.join(
    REPO_ROOT,
    "apps",
    "courses",
    "content",
    "playlist.json"
  );
  const toolsData = refresh.toolsDataPath
    ? {
        path: refresh.toolsDataPath,
        hash: hashContent(await readFile(refresh.toolsDataPath)),
      }
    : null;
  const nextState = {
    ...state,
    updatedAt: appliedAt,
    status: "applied",
    applied: {
      appliedAt,
      componentsFingerprint: computeComponentsFingerprint(state.components),
      notes: await collectAppliedNoteHashes(backups.report),
      playlist: {
        path: playlistPath,
        hash: hashContent(await readFile(playlistPath)),
      },
      toolsData,
      documentsFingerprint:
        state.components.documents?.fingerprint || null,
      repositoryAudit: audit.totals,
    },
    release: null,
  };
  await writeCacheState(cacheRoot, nextState);

  return {
    phase: "apply",
    cacheId: path.basename(cacheRoot),
    cacheRoot,
    reportPath,
    notesApplied: backups.applied.length,
    appliedNotes: backups.applied,
    refresh,
    audit: audit.totals,
    state: nextState,
    deployRun: false,
  };
}

export function formatWeeklyRefreshResult(result) {
  if (result.phase === "prepare") {
    return [
      `Prepared cache ${result.cacheId}`,
      `Cache folder: ${result.cacheRoot}`,
      `Refreshed: ${result.refreshedComponents.join(", ")}`,
      formatCacheAudit(result.audit),
      "",
      result.audit.ready
        ? "Next: apply this cache or review its warnings."
        : "Fix the reported errors, refresh the affected component, and rerun the audit.",
    ].join("\n");
  }
  if (result.alreadyApplied) {
    return [
      `Cache ${result.cacheId} is already applied. No files were changed.`,
      "",
      "Next: build and test locally.",
    ].join("\n");
  }
  return [
    `Applied cache ${result.cacheId}`,
    `Applied notes: ${result.notesApplied}`,
    `Published lessons: ${result.refresh.lessonCount}`,
    `YouTube matches: ${result.refresh.matchedYoutubeLessons}`,
    `Repository audit: ${result.audit.errors} errors, ${result.audit.warnings} warnings`,
    "",
    "Next: build and test locally.",
  ].join("\n");
}

export async function runWeeklyRefresh(
  options = {},
  injectedDependencies = {}
) {
  const coursesEnv = options.coursesEnv || (await loadCoursesEnv());
  const dependencies = {
    createWeeklyCache,
    findReusableNotesSnapshotRoot,
    loadCacheState,
    recordCacheComponent,
    prepareDocumentSummaries,
    createNotesSnapshot,
    prepareCanonicalNoteBackups,
    fetchPlaylistSnapshot,
    prepareSourceInventory,
    auditWeeklyCache,
    applyCanonicalNoteBackups,
    syncCoursesContent,
    auditCourses,
    ...injectedDependencies,
  };
  return options.apply
    ? applyWeeklyCache(options, coursesEnv, dependencies)
    : prepareWeeklyCache(options, coursesEnv, dependencies);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cache") {
      options.cacheRoot = argv[index + 1];
      if (!options.cacheRoot) {
        throw new Error("--cache requires a folder or cache ID.");
      }
      index += 1;
    } else if (arg === "--components") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--components requires a comma-separated value.");
      }
      options.components = value.split(",").map((item) => item.trim());
      index += 1;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--full-notes-export") {
      options.fullNotesExport = true;
    } else if (arg === "--online-audit") {
      options.onlineAudit = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: yarn courses:weekly [options]

Lower-level selected-cache prepare/apply command. Use yarn weekly for the guided
six-step workflow.

Options:
  --cache <id|path>       Refresh or apply a specific cache
  --components <list>     documents,notes,youtube,inventory
  --apply                 Apply a ready cache (requires --cache)
  --full-notes-export     Re-export every Apple Note body
  --online-audit          Check remote links after apply
  --json                  Print machine-readable JSON`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await runWeeklyRefresh({
    ...options,
    onProgress: options.json
      ? null
      : (message) => process.stderr.write(`[courses:weekly] ${message}\n`),
  });
  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : formatWeeklyRefreshResult(result)
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    if (error?.result) {
      console.error(JSON.stringify(error.result, null, 2));
    }
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
