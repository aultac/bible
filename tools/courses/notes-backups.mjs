import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { NodeHtmlMarkdown } from "node-html-markdown";
import {
  buildCanonicalLessonIndex,
  canonicalLessonDirectoryNameFromNoteTitle,
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
    missingCanonicalLessonFolders: [],
  };

  for (const note of manifest.notes) {
    const expectedLessonDirectoryName = canonicalLessonDirectoryNameFromNoteTitle(note.title);
    const canonicalLessonDirectoryPath = lessonIndex.get(expectedLessonDirectoryName);

    if (!canonicalLessonDirectoryPath) {
      report.totals.missingCanonicalLessonFolder += 1;
      report.missingCanonicalLessonFolders.push({
        title: note.title,
        expectedLessonDirectoryName,
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

    if (existingMarkdownHash === sourceMarkdownHash) {
      report.totals.unchanged += 1;
      continue;
    }

    const changeType = existingMarkdownHash ? "updated" : "new";
    report.totals[changeType] += 1;

    const relativeLessonDirectory = path.relative(
      canonicalBase,
      canonicalLessonDirectoryPath
    );
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

export async function applyCanonicalNoteBackups({ reportPath }) {
  const report = await loadCanonicalNoteBackupReport(reportPath);
  const applied = [];

  for (const update of report.updates) {
    await mkdir(path.dirname(update.canonicalNotesPath), { recursive: true });
    await copyFile(update.stagedNotesPath, update.canonicalNotesPath);
    applied.push({
      title: update.title,
      changeType: update.changeType,
      canonicalNotesPath: update.canonicalNotesPath,
    });
  }

  return {
    report,
    applied,
  };
}
