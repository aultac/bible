import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildPlaylistVideoMatchMap } from "./youtube-playlist.mjs";
import {
  CACHE_AUDIT_FILENAME,
  CACHE_COMPONENT_NAMES,
  CACHED_PLAYLIST_FILENAME,
  SOURCE_INVENTORY_FILENAME,
  computeComponentsFingerprint,
  hashContent,
  loadCacheState,
  writeCacheState,
  writeJsonAtomic,
} from "./weekly-cache.mjs";
import { DOCUMENT_SUMMARIES_FILENAME } from "./document-summaries.mjs";
import { validateNoteDirectiveCandidate } from "./note-directives.mjs";

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

function md5(value) {
  return createHash("md5").update(value).digest("hex");
}

function addFinding(findings, severity, component, code, message, details = {}) {
  findings.push({
    severity,
    component,
    code,
    message,
    ...details,
  });
}

async function loadJson(targetPath) {
  return JSON.parse(await readFile(targetPath, "utf8"));
}

async function auditRecordedComponents({
  cacheRoot,
  state,
  findings,
  requiredComponents,
}) {
  for (const componentName of requiredComponents) {
    const component = state.components?.[componentName];
    if (!component) {
      addFinding(
        findings,
        "error",
        componentName,
        "component-missing",
        `Refresh the ${componentName} component before applying.`
      );
      continue;
    }
    const outputPath = path.join(cacheRoot, component.outputPath);
    if (!(await pathExists(outputPath))) {
      addFinding(
        findings,
        "error",
        componentName,
        "component-output-missing",
        `Cached ${componentName} output is missing.`,
        { path: outputPath }
      );
      continue;
    }
    const currentHash = hashContent(await readFile(outputPath));
    if (currentHash !== component.fingerprint) {
      addFinding(
        findings,
        "error",
        componentName,
        "component-output-changed",
        `Cached ${componentName} output changed after preparation.`,
        { path: outputPath }
      );
    }
  }
}

async function auditDocuments({ cacheRoot, canonicalBase, findings }) {
  const manifestPath = path.join(cacheRoot, DOCUMENT_SUMMARIES_FILENAME);
  if (!(await pathExists(manifestPath))) {
    return;
  }
  let manifest;
  try {
    manifest = await loadJson(manifestPath);
  } catch (error) {
    addFinding(
      findings,
      "error",
      "documents",
      "manifest-invalid",
      `Document summary manifest is invalid: ${error.message}`,
      { path: manifestPath }
    );
    return;
  }

  for (const record of manifest.records || []) {
    const label = record.lessonDirectory || record.sectionDirectory;
    if (record.error) {
      addFinding(
        findings,
        "error",
        "documents",
        "docx-conversion-failed",
        `${label} Word summary could not be converted: ${record.error}`,
        { sourcePath: record.sourcePath }
      );
      continue;
    }
    if (!record.sourcePath) {
      if (record.kind === "lesson") {
        addFinding(
          findings,
          "warning",
          "documents",
          "summary-document-missing",
          `${label} has no lesson Word summary.`
        );
      }
      continue;
    }
    const sourcePath = path.join(canonicalBase, record.sourcePath);
    if (!(await pathExists(sourcePath))) {
      addFinding(
        findings,
        "error",
        "documents",
        "summary-source-missing",
        `${label} Word summary was removed after preparation.`,
        { path: sourcePath }
      );
      continue;
    }
    if (hashContent(await readFile(sourcePath)) !== record.sourceHash) {
      addFinding(
        findings,
        "error",
        "documents",
        "summary-source-stale",
        `${label} Word summary changed; refresh Word summaries and video titles.`,
        { path: sourcePath }
      );
    }
    if (record.markdownPath) {
      const markdownPath = path.join(cacheRoot, record.markdownPath);
      if (!(await pathExists(markdownPath))) {
        addFinding(
          findings,
          "error",
          "documents",
          "converted-summary-missing",
          `${label} cached Markdown is missing.`,
          { path: markdownPath }
        );
      } else if (
        hashContent(await readFile(markdownPath)) !== record.markdownHash
      ) {
        addFinding(
          findings,
          "error",
          "documents",
          "converted-summary-changed",
          `${label} cached Markdown changed after conversion.`,
          { path: markdownPath }
        );
      }
    }
    if (record.kind === "lesson" && !record.videoSummary) {
      addFinding(
        findings,
        "warning",
        "documents",
        "video-summary-title-missing",
        `${label} Word summary has no parseable Title: field.`,
        { path: sourcePath }
      );
    }
  }
}

async function auditNotes({ cacheRoot, findings }) {
  const reportPath = path.join(cacheRoot, NOTES_REPORT_FILENAME);
  if (!(await pathExists(reportPath))) {
    return;
  }
  let report;
  try {
    report = await loadJson(reportPath);
  } catch (error) {
    addFinding(
      findings,
      "error",
      "notes",
      "report-invalid",
      `Apple Notes report is invalid: ${error.message}`,
      { path: reportPath }
    );
    return;
  }

  for (const update of report.updates || []) {
    if (!(await pathExists(update.stagedNotesPath))) {
      addFinding(
        findings,
        "error",
        "notes",
        "staged-note-missing",
        `${update.title} staged notes are missing.`,
        { path: update.stagedNotesPath }
      );
      continue;
    }
    if (
      md5(await readFile(update.stagedNotesPath)) !== update.sourceMarkdownHash
    ) {
      addFinding(
        findings,
        "error",
        "notes",
        "staged-note-changed",
        `${update.title} staged notes changed after preparation.`,
        { path: update.stagedNotesPath }
      );
      continue;
    }

    const directiveValidation = await validateNoteDirectiveCandidate({
      markdown: await readFile(update.stagedNotesPath, "utf8"),
      lessonDirectory:
        update.canonicalLessonDirectoryPath ||
        path.dirname(update.canonicalNotesPath || update.stagedNotesPath),
      source: update.stagedNotesPath,
    });
    for (const directiveFinding of directiveValidation.findings) {
      addFinding(
        findings,
        "error",
        "notes",
        directiveFinding.code,
        directiveFinding.message,
        {
          path: directiveFinding.source,
          lineNumber: directiveFinding.lineNumber,
        }
      );
    }
  }

  for (const missing of report.missingCanonicalLessonFolders || []) {
    addFinding(
      findings,
      "error",
      "notes",
      "lesson-match-missing",
      `${missing.title} does not map unambiguously to a canonical lesson folder.`,
      {
        expectedRelativeLessonDirectory:
          missing.expectedRelativeLessonDirectory || null,
      }
    );
  }

  for (const legacySummary of
    report.legacySummaryUpdates || report.summaryUpdates || []) {
    if (
      legacySummary.stagedSummaryPath &&
      !(await pathExists(legacySummary.stagedSummaryPath))
    ) {
      addFinding(
        findings,
        "warning",
        "notes",
        "legacy-summary-missing",
        `${legacySummary.title} has a legacy summary report entry whose candidate is missing.`,
        { path: legacySummary.stagedSummaryPath }
      );
    }
  }
}

async function auditPlaylist({ cacheRoot, findings }) {
  const playlistPath = path.join(cacheRoot, CACHED_PLAYLIST_FILENAME);
  if (!(await pathExists(playlistPath))) {
    return;
  }
  let playlist;
  try {
    playlist = await loadJson(playlistPath);
  } catch (error) {
    addFinding(
      findings,
      "error",
      "youtube",
      "playlist-invalid",
      `Cached YouTube playlist is invalid: ${error.message}`,
      { path: playlistPath }
    );
    return;
  }
  if (playlist.schemaVersion !== 2) {
    addFinding(
      findings,
      "error",
      "youtube",
      "playlist-schema-stale",
      "Cached YouTube playlist uses an older matching schema; refresh the YouTube component.",
      { path: playlistPath, schemaVersion: playlist.schemaVersion ?? null }
    );
  }
  if (!Array.isArray(playlist.videos) || playlist.videos.length === 0) {
    addFinding(
      findings,
      "error",
      "youtube",
      "playlist-empty",
      "Cached YouTube playlist contains no videos.",
      { path: playlistPath }
    );
    return;
  }

  const videoIds = new Set();
  const lessonSequenceOwners = new Map();
  for (const video of playlist.videos) {
    if (!video.videoId) {
      addFinding(
        findings,
        "error",
        "youtube",
        "video-id-missing",
        "A cached playlist entry has no video ID."
      );
    } else if (videoIds.has(video.videoId)) {
      addFinding(
        findings,
        "error",
        "youtube",
        "video-id-duplicate",
        `Cached playlist contains duplicate video ${video.videoId}.`
      );
    }
    videoIds.add(video.videoId);
    const lessonSequenceNumber = video.lessonSequenceNumber;
    if (
      !Number.isInteger(lessonSequenceNumber) ||
      lessonSequenceNumber < 0
    ) {
      addFinding(
        findings,
        "warning",
        "youtube",
        "video-lesson-unmatched",
        `${video.title || video.videoId || "A playlist video"} has no explicit Promo or Week N lesson match.`,
        { videoId: video.videoId || null, title: video.title || null }
      );
      continue;
    }
    const existingVideoId = lessonSequenceOwners.get(lessonSequenceNumber);
    if (existingVideoId) {
      addFinding(
        findings,
        "error",
        "youtube",
        "lesson-sequence-duplicate",
        `Multiple playlist videos map to lesson sequence ${lessonSequenceNumber}.`,
        {
          lessonSequenceNumber,
          videoIds: [existingVideoId, video.videoId],
        }
      );
      continue;
    }
    lessonSequenceOwners.set(lessonSequenceNumber, video.videoId);
  }
  if (
    !findings.some(
      (finding) =>
        finding.component === "youtube" &&
        finding.code === "lesson-sequence-duplicate"
    )
  ) {
    buildPlaylistVideoMatchMap(playlist);
  }
}

async function auditInventory({ cacheRoot, canonicalBase, findings }) {
  const inventoryPath = path.join(cacheRoot, SOURCE_INVENTORY_FILENAME);
  if (!(await pathExists(inventoryPath))) {
    return;
  }
  let inventory;
  try {
    inventory = await loadJson(inventoryPath);
  } catch (error) {
    addFinding(
      findings,
      "error",
      "inventory",
      "inventory-invalid",
      `Source inventory is invalid: ${error.message}`,
      { path: inventoryPath }
    );
    return;
  }
  if (!inventory.sectionCount || !inventory.fileCount) {
    addFinding(
      findings,
      "error",
      "inventory",
      "inventory-empty",
      "Canonical source inventory contains no course files."
    );
  }

  for (const section of inventory.sections || []) {
    for (const file of section.files || []) {
      const sourcePath = path.join(
        canonicalBase,
        section.directory,
        file.path
      );
      if (!(await pathExists(sourcePath))) {
        addFinding(
          findings,
          "error",
          "inventory",
          "source-file-missing",
          `Canonical source file was removed after preparation.`,
          { path: sourcePath }
        );
        continue;
      }
      if (hashContent(await readFile(sourcePath)) !== file.hash) {
        addFinding(
          findings,
          "error",
          "inventory",
          "source-file-stale",
          `Canonical source file changed; refresh the lesson folders/assets inventory.`,
          { path: sourcePath }
        );
      }
    }
  }
}

export async function auditWeeklyCache({
  cacheRoot,
  canonicalBase,
  requiredComponents = CACHE_COMPONENT_NAMES,
  auditedAt = new Date().toISOString(),
}) {
  const state = await loadCacheState(cacheRoot);
  const findings = [];

  await auditRecordedComponents({
    cacheRoot,
    state,
    findings,
    requiredComponents,
  });
  await auditDocuments({ cacheRoot, canonicalBase, findings });
  await auditNotes({ cacheRoot, findings });
  await auditPlaylist({ cacheRoot, findings });
  await auditInventory({ cacheRoot, canonicalBase, findings });

  const errors = findings.filter(
    (finding) => finding.severity === "error"
  ).length;
  const warnings = findings.filter(
    (finding) => finding.severity === "warning"
  ).length;
  const componentsFingerprint = computeComponentsFingerprint(
    state.components
  );
  const audit = {
    schemaVersion: 1,
    auditedAt,
    cacheId: state.cacheId,
    componentsFingerprint,
    ready: errors === 0,
    totals: {
      errors,
      warnings,
    },
    findings,
  };
  await writeJsonAtomic(path.join(cacheRoot, CACHE_AUDIT_FILENAME), audit);

  const nextState = {
    ...state,
    updatedAt: auditedAt,
    status: audit.ready ? "ready" : "draft",
    latestAudit: {
      auditedAt,
      ready: audit.ready,
      errors,
      warnings,
      componentsFingerprint,
    },
  };
  await writeCacheState(cacheRoot, nextState);
  return { audit, state: nextState };
}

export function formatCacheAudit(audit) {
  const lines = [
    `Cache audit: ${audit.totals.errors} errors, ${audit.totals.warnings} warnings`,
    audit.ready ? "Cache is ready to apply." : "Cache is not ready to apply.",
  ];
  for (const finding of audit.findings) {
    lines.push(
      `${finding.severity.toUpperCase()} [${finding.component}/${finding.code}] ${finding.message}`
    );
    if (finding.path) {
      lines.push(`  ${finding.path}`);
    }
  }
  return lines.join("\n");
}
