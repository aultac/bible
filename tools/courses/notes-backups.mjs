import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { NodeHtmlMarkdown } from "node-html-markdown";
import {
  buildCanonicalLessonIndex,
  resolveCanonicalLessonDirectory,
} from "./lesson-paths.mjs";

const CANONICAL_NOTES_FILENAME = "notes.md";
const CANDIDATES_DIRNAME = "canonical-note-backup-candidates";
const REPORT_FILENAME = "canonical-note-backup-report.json";

const markdownConverter = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
});

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

function hashContent(content) {
  return createHash("md5").update(content).digest("hex");
}

function hashSummarySource(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function copyFileAtomically(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await copyFile(sourcePath, temporaryPath);
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function normalizeMarkdown(markdown) {
  return (
    markdown
      .replace(/\r\n/gu, "\n")
      .replace(/\u00a0/gu, " ")
      .replace(/\\_/gu, "_")
      .replace(/\\\*/gu, "*")
      .replace(/\\>/gu, ">")
      .replace(/\\\./gu, ".")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd() + "\n"
  );
}
function normalizeAppleNotesHtml(html) {
  return html.replace(
    /<div>\s*<b>\s*<h([1-6])>(.*?)<\/h\1>\s*<\/b>\s*<\/div>/gisu,
    "<h$1>$2</h$1>"
  );
}

function convertAppleNotesHtmlToMarkdown(html) {
  return normalizeMarkdown(markdownConverter.translate(normalizeAppleNotesHtml(html)));
}

export function getCanonicalNoteBackupReportPath(snapshotRoot) {
  return path.join(snapshotRoot, REPORT_FILENAME);
}

export function getCanonicalNoteBackupCandidatesRoot(snapshotRoot) {
  return path.join(snapshotRoot, CANDIDATES_DIRNAME);
}

export async function loadLatestSnapshotRoot(notesCacheRoot) {
  const latestPointer = JSON.parse(
    await readFile(path.join(notesCacheRoot, "latest.json"), "utf8")
  );

  return path.join(notesCacheRoot, latestPointer.latestSnapshotDir);
}

export async function loadCanonicalNoteBackupReport(reportPath) {
  return JSON.parse(await readFile(reportPath, "utf8"));
}

export async function prepareCanonicalNoteBackups({
  snapshotRoot,
  canonicalBase,
}) {
  const manifestPath = path.join(snapshotRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const lessonIndex = await buildCanonicalLessonIndex(canonicalBase);
  const candidatesRoot = getCanonicalNoteBackupCandidatesRoot(snapshotRoot);
  const reportPath = getCanonicalNoteBackupReportPath(snapshotRoot);

  await rm(candidatesRoot, { recursive: true, force: true });
  await mkdir(candidatesRoot, { recursive: true });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshotRoot,
    manifestPath,
    canonicalBase,
    candidatesRoot,
    totals: {
      processed: manifest.notes.length,
      new: 0,
      updated: 0,
      unchanged: 0,
      missingCanonicalLessonFolder: 0,
    },
    updates: [],
    unchangedNotes: [],
    missingCanonicalLessonFolders: [],
  };

  for (const note of manifest.notes) {
    const lessonMatch = resolveCanonicalLessonDirectory(
      lessonIndex,
      note.title,
      canonicalBase
    );
    const canonicalLessonDirectoryPath =
      lessonMatch.canonicalLessonDirectoryPath;

    if (!canonicalLessonDirectoryPath) {
      report.totals.missingCanonicalLessonFolder += 1;
      report.missingCanonicalLessonFolders.push({
        title: note.title,
        expectedLessonDirectoryName: lessonMatch.expectedLessonDirectoryName,
        expectedRelativeLessonDirectory:
          lessonMatch.expectedRelativeLessonDirectory,
        expectedLessonDirectoryPath: lessonMatch.expectedLessonDirectoryPath,
        sequenceCandidates: lessonMatch.sequenceCandidates,
      });
      continue;
    }

    const sourceHtmlPath = path.join(snapshotRoot, note.bodyPath);
    const sourceHtml = await readFile(sourceHtmlPath, "utf8");
    const sourceMarkdown = convertAppleNotesHtmlToMarkdown(sourceHtml);
    const sourceMarkdownHash = hashContent(sourceMarkdown);
    const canonicalNotesPath = path.join(
      canonicalLessonDirectoryPath,
      CANONICAL_NOTES_FILENAME
    );

    let existingMarkdown = null;
    if (await pathExists(canonicalNotesPath)) {
      existingMarkdown = normalizeMarkdown(await readFile(canonicalNotesPath, "utf8"));
    }

    const existingMarkdownHash = existingMarkdown
      ? hashContent(existingMarkdown)
      : null;
    const relativeLessonDirectory = lessonMatch.relativeLessonDirectory;

    if (existingMarkdownHash === sourceMarkdownHash) {
      report.totals.unchanged += 1;
      report.unchangedNotes.push({
        title: note.title,
        noteId: note.id,
        noteUpdatedAt: note.updatedAt,
        relativeLessonDirectory,
        matchedBy: lessonMatch.matchedBy,
        expectedLessonDirectoryName: lessonMatch.expectedLessonDirectoryName,
        actualLessonDirectoryName: lessonMatch.actualLessonDirectoryName,
        expectedRelativeLessonDirectory:
          lessonMatch.expectedRelativeLessonDirectory,
        canonicalLessonDirectoryPath,
        canonicalNotesPath,
        sourceMarkdownHash,
      });
      continue;
    }

    const changeType = existingMarkdownHash ? "updated" : "new";
    report.totals[changeType] += 1;
    const stagedNotesPath = path.join(
      candidatesRoot,
      relativeLessonDirectory,
      CANONICAL_NOTES_FILENAME
    );

    await mkdir(path.dirname(stagedNotesPath), { recursive: true });
    await writeFile(stagedNotesPath, sourceMarkdown, "utf8");

    report.updates.push({
      title: note.title,
      noteId: note.id,
      noteUpdatedAt: note.updatedAt,
      changeType,
      relativeLessonDirectory,
      matchedBy: lessonMatch.matchedBy,
      expectedLessonDirectoryName: lessonMatch.expectedLessonDirectoryName,
      actualLessonDirectoryName: lessonMatch.actualLessonDirectoryName,
      expectedRelativeLessonDirectory:
        lessonMatch.expectedRelativeLessonDirectory,
      canonicalLessonDirectoryPath,
      canonicalNotesPath,
      stagedNotesPath,
      sourceHtmlPath,
      sourceMarkdownHash,
      existingMarkdownHash,
    });
  }


  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    report,
    reportPath,
    candidatesRoot,
  };
}

export async function applyCanonicalNoteBackups({
  reportPath,
  applySummaries = true,
}) {
  const report = await loadCanonicalNoteBackupReport(reportPath);
  const applied = [];
  const summariesApplied = [];

  for (const update of report.updates) {
    const stagedNotes = await readFile(update.stagedNotesPath, "utf8");
    if (hashContent(stagedNotes) !== update.sourceMarkdownHash) {
      throw new Error(
        `Staged notes changed after review: ${update.stagedNotesPath}`
      );
    }
  }

  for (const update of applySummaries ? report.summaryUpdates || [] : []) {
    const sourceNotes = await readFile(update.sourceNotesPath, "utf8");
    if (hashSummarySource(sourceNotes) !== update.sourceNotesHash) {
      throw new Error(
        `Summary source notes changed after generation: ${update.sourceNotesPath}`
      );
    }

    const stagedSummary = await readFile(update.stagedSummaryPath, "utf8");
    if (!stagedSummary.trim()) {
      throw new Error(`Staged summary is empty: ${update.stagedSummaryPath}`);
    }
    const metadata = JSON.parse(
      await readFile(update.stagedMetadataPath, "utf8")
    );
    if (
      metadata.sourceNotesHash !== update.sourceNotesHash ||
      metadata.promptVersion !== update.promptVersion ||
      (update.promptHash && metadata.promptHash !== update.promptHash) ||
      metadata.model !== update.model
    ) {
      throw new Error(
        `Staged summary metadata does not match the report: ${update.stagedMetadataPath}`
      );
    }
  }

  for (const update of report.updates) {
    await copyFileAtomically(update.stagedNotesPath, update.canonicalNotesPath);
    applied.push({
      title: update.title,
      changeType: update.changeType,
      canonicalNotesPath: update.canonicalNotesPath,
    });
  }

  for (const update of report.summaryUpdates || []) {
    await copyFileAtomically(
      update.stagedSummaryPath,
      update.canonicalSummaryPath
    );
    await copyFileAtomically(
      update.stagedMetadataPath,
      update.canonicalMetadataPath
    );
    summariesApplied.push({
      title: update.title,
      canonicalSummaryPath: update.canonicalSummaryPath,
      canonicalMetadataPath: update.canonicalMetadataPath,
    });
  }

  return {
    report,
    applied,
    summariesApplied,
  };
}
