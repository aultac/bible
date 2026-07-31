import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import { loadDocumentSummaries } from "./document-summaries.mjs";
import { loadCanonicalNoteBackupReport } from "./notes-backups.mjs";
import {
  computeComponentsFingerprint,
  hashContent,
  loadCacheState,
  repairLatestPointer,
  writeJsonAtomic,
} from "./weekly-cache.mjs";

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

async function collectLessonManifests(rootPath, manifests = []) {
  if (!(await pathExists(rootPath))) {
    return manifests;
  }
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await collectLessonManifests(absolutePath, manifests);
    } else if (entry.isFile() && entry.name === "lesson.json") {
      manifests.push({
        path: absolutePath,
        manifest: JSON.parse(await readFile(absolutePath, "utf8")),
      });
    }
  }
  return manifests;
}

function mismatch(component, code, message, details = {}) {
  return { component, code, message, ...details };
}

export async function reconcileWeeklyCache({
  cacheRoot,
  repoRoot = REPO_ROOT,
}) {
  const state = await loadCacheState(cacheRoot);
  const mismatches = [];
  if (state.status !== "applied" || !state.applied) {
    mismatches.push(
      mismatch(
        "cache",
        "not-applied",
        "Cache has no successful applied marker."
      )
    );
    return { safeToDelete: false, state, mismatches };
  }

  const componentsFingerprint = computeComponentsFingerprint(
    state.components
  );
  if (componentsFingerprint !== state.applied.componentsFingerprint) {
    mismatches.push(
      mismatch(
        "cache",
        "components-changed",
        "Cache components changed after apply."
      )
    );
  }

  for (const note of state.applied.notes || []) {
    if (!(await pathExists(note.path))) {
      mismatches.push(
        mismatch("notes", "canonical-note-missing", "Applied note is missing.", {
          path: note.path,
        })
      );
    } else if (hashContent(await readFile(note.path)) !== note.hash) {
      mismatches.push(
        mismatch(
          "notes",
          "canonical-note-changed",
          "Applied note no longer matches the cache.",
          { path: note.path }
        )
      );
    }
  }

  const appliedPlaylist = state.applied.playlist;
  if (appliedPlaylist) {
    if (!(await pathExists(appliedPlaylist.path))) {
      mismatches.push(
        mismatch(
          "youtube",
          "applied-playlist-missing",
          "Applied playlist snapshot is missing.",
          { path: appliedPlaylist.path }
        )
      );
    } else if (
      hashContent(await readFile(appliedPlaylist.path)) !==
      appliedPlaylist.hash
    ) {
      mismatches.push(
        mismatch(
          "youtube",
          "applied-playlist-changed",
          "Repository playlist no longer matches this cache.",
          { path: appliedPlaylist.path }
        )
      );
    }
  }

  const appliedToolsData = state.applied.toolsData;
  if (appliedToolsData) {
    if (!(await pathExists(appliedToolsData.path))) {
      mismatches.push(
        mismatch(
          "tools",
          "applied-tools-data-missing",
          "Generated tool relationships are missing.",
          { path: appliedToolsData.path }
        )
      );
    } else if (
      hashContent(await readFile(appliedToolsData.path)) !==
      appliedToolsData.hash
    ) {
      mismatches.push(
        mismatch(
          "tools",
          "applied-tools-data-changed",
          "Generated tool relationships no longer match this cache.",
          { path: appliedToolsData.path }
        )
      );
    }
  }
  const appliedNotesCheckpoint = state.applied.notesCheckpoint;
  if (appliedNotesCheckpoint) {
    if (!(await pathExists(appliedNotesCheckpoint.path))) {
      mismatches.push(
        mismatch(
          "notes",
          "applied-checkpoint-missing",
          "Applied Apple Notes checkpoint is missing.",
          { path: appliedNotesCheckpoint.path }
        )
      );
    } else if (
      hashContent(await readFile(appliedNotesCheckpoint.path)) !==
      appliedNotesCheckpoint.hash
    ) {
      mismatches.push(
        mismatch(
          "notes",
          "applied-checkpoint-changed",
          "Applied Apple Notes checkpoint no longer matches this cache.",
          { path: appliedNotesCheckpoint.path }
        )
      );
    }
  }

  const documentSummaries = await loadDocumentSummaries(cacheRoot);
  const lessonManifests = await collectLessonManifests(
    path.join(repoRoot, "apps", "courses", "content")
  );
  const manifestsBySource = new Map(
    lessonManifests.map((entry) => [
      entry.manifest.source?.relativeLessonDirectory,
      entry,
    ])
  );
  for (const record of (documentSummaries.records || []).filter(
    (entry) => entry.kind === "lesson"
  )) {
    const relativeLessonDirectory = `${record.sectionDirectory}/${record.lessonDirectory}`;
    const generated = manifestsBySource.get(relativeLessonDirectory);
    if (!generated) {
      mismatches.push(
        mismatch(
          "documents",
          "generated-lesson-missing",
          `${relativeLessonDirectory} has no generated lesson manifest.`
        )
      );
      continue;
    }
    if (
      (generated.manifest.videoSummary || null) !==
      (record.videoSummary || null)
    ) {
      mismatches.push(
        mismatch(
          "documents",
          "video-summary-mismatch",
          `${relativeLessonDirectory} video summary does not match the cache.`,
          { path: generated.path }
        )
      );
    }
  }

  const reportPath = path.join(
    cacheRoot,
    "canonical-note-backup-report.json"
  );
  if (await pathExists(reportPath)) {
    const report = await loadCanonicalNoteBackupReport(reportPath);
    for (const update of
      report.legacySummaryUpdates || report.summaryUpdates || []) {
      if (
        !update.stagedSummaryPath ||
        !(await pathExists(update.stagedSummaryPath))
      ) {
        mismatches.push(
          mismatch(
            "legacy-summary",
            "candidate-missing",
            `${update.title} legacy summary candidate is missing.`,
            { path: update.stagedSummaryPath || null }
          )
        );
        continue;
      }
      if (
        !update.canonicalSummaryPath ||
        !(await pathExists(update.canonicalSummaryPath))
      ) {
        mismatches.push(
          mismatch(
            "legacy-summary",
            "canonical-missing",
            `${update.title} legacy summary was never applied.`,
            { path: update.canonicalSummaryPath || null }
          )
        );
        continue;
      }
      const [candidate, canonical] = await Promise.all([
        readFile(update.stagedSummaryPath),
        readFile(update.canonicalSummaryPath),
      ]);
      if (!candidate.equals(canonical)) {
        mismatches.push(
          mismatch(
            "legacy-summary",
            "canonical-mismatch",
            `${update.title} legacy summary differs from its canonical file.`,
            { path: update.canonicalSummaryPath }
          )
        );
      }
    }
  }

  return {
    safeToDelete: mismatches.length === 0,
    state,
    mismatches,
  };
}

export function formatCacheReconciliation(result) {
  if (result.safeToDelete) {
    return "All cached candidates match their applied outputs. This cache is safe to delete.";
  }
  return [
    `Cache deletion warning: ${result.mismatches.length} issue(s) may represent unapplied or changed cached data.`,
    ...result.mismatches.map(
      (item) => `- [${item.component}/${item.code}] ${item.message}`
    ),
  ].join("\n");
}

export async function deleteWeeklyCache({
  cacheRoot,
  notesCacheRoot,
  deletedAt = new Date().toISOString(),
  repoRoot = REPO_ROOT,
  allowUnsafe = false,
}) {
  const reconciliation = await reconcileWeeklyCache({
    cacheRoot,
    repoRoot,
  });
  if (!reconciliation.safeToDelete && !allowUnsafe) {
    const error = new Error(formatCacheReconciliation(reconciliation));
    error.reconciliation = reconciliation;
    throw error;
  }

  const cacheId = reconciliation.state.cacheId || path.basename(cacheRoot);
  const tombstonePath = path.join(
    notesCacheRoot,
    "history",
    `${cacheId}.json`
  );
  await writeJsonAtomic(tombstonePath, {
    schemaVersion: 1,
    cacheId,
    deletedAt,
    previousStatus: reconciliation.state.status,
    safeToDelete: reconciliation.safeToDelete,
    warningCodes: reconciliation.mismatches.map(
      (item) => `${item.component}/${item.code}`
    ),
    appliedAt: reconciliation.state.applied?.appliedAt || null,
    componentsFingerprint:
      reconciliation.state.applied?.componentsFingerprint || null,
  });
  await rm(cacheRoot, { recursive: true, force: true });
  await repairLatestPointer(notesCacheRoot);
  return {
    cacheId,
    deletedAt,
    tombstonePath,
    reconciliation,
  };
}
