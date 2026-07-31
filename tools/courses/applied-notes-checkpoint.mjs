import { readFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import { writeJsonAtomic } from "./weekly-cache.mjs";

export const APPLIED_NOTES_CHECKPOINT_KIND =
  "apple-notes-applied-checkpoint";
export const APPLIED_NOTES_CHECKPOINT_RELATIVE_PATH =
  "apps/courses/content/apple-notes-checkpoint.json";

export function getAppliedNotesCheckpointPath(repoRoot = REPO_ROOT) {
  return path.join(repoRoot, APPLIED_NOTES_CHECKPOINT_RELATIVE_PATH);
}

export async function loadAppliedNotesCheckpoint(checkpointPath) {
  if (!checkpointPath) {
    return null;
  }
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.kind !== APPLIED_NOTES_CHECKPOINT_KIND ||
      !checkpoint.source ||
      !Array.isArray(checkpoint.notes)
    ) {
      throw new Error(
        `Applied Apple Notes checkpoint has an unsupported format: ${checkpointPath}`
      );
    }
    return checkpoint;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function loadAppliedNotesCheckpointAsSnapshot(checkpointPath) {
  const manifest = await loadAppliedNotesCheckpoint(checkpointPath);
  return manifest
    ? {
        snapshotRoot: null,
        manifestPath: checkpointPath,
        manifest,
      }
    : null;
}

export async function writeAppliedNotesCheckpoint({
  checkpointPath,
  cacheRoot,
  report,
  appliedAt = new Date().toISOString(),
}) {
  const manifest = JSON.parse(
    await readFile(path.join(cacheRoot, "manifest.json"), "utf8")
  );
  const comparisonsByNoteId = new Map();
  for (const comparison of [
    ...(report.updates || []),
    ...(report.unchangedNotes || []),
  ]) {
    if (!comparison.noteId) {
      continue;
    }
    if (comparisonsByNoteId.has(comparison.noteId)) {
      throw new Error(
        `Apple Note appears more than once in the applied report: ${comparison.noteId}`
      );
    }
    comparisonsByNoteId.set(comparison.noteId, comparison);
  }

  const notes = (manifest.notes || []).map((note) => {
    const comparison = comparisonsByNoteId.get(note.id);
    if (
      !comparison?.relativeLessonDirectory ||
      !comparison.sourceMarkdownHash
    ) {
      throw new Error(
        `Applied Apple Note has no canonical comparison metadata: ${note.title}`
      );
    }
    return {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt || null,
      updatedAt: note.updatedAt || null,
      relativeLessonDirectory: comparison.relativeLessonDirectory,
      sourceMarkdownHash: comparison.sourceMarkdownHash,
    };
  });
  const checkpoint = {
    schemaVersion: 1,
    kind: APPLIED_NOTES_CHECKPOINT_KIND,
    appliedAt,
    source: manifest.source,
    noteCount: notes.length,
    notes,
  };
  await writeJsonAtomic(checkpointPath, checkpoint);
  return {
    checkpoint,
    checkpointPath,
  };
}
