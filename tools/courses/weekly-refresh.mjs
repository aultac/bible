import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditCourses } from "./audit-courses.mjs";
import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";
import {
  generateNoteSummaries,
  preflightGrok,
} from "./generate-note-summaries.mjs";
import {
  applyCanonicalNoteBackups,
  getCanonicalNoteBackupReportPath,
  loadCanonicalNoteBackupReport,
  loadLatestSnapshotRoot,
} from "./notes-backups.mjs";
import { syncCoursesContent } from "./repo-content.mjs";

const NOTES_SNAPSHOT_SCRIPT = new URL("./notes-snapshot.mjs", import.meta.url);

export function metadataBehavior(report) {
  return {
    preserved:
      "Manual title, description, status, and tags are retained when the canonical lesson folder path is unchanged.",
    renamed:
      "A renamed source lesson folder receives a new key/slug; metadata does not silently follow it.",
    unmatchedCandidates: report.missingCanonicalLessonFolders || [],
  };
}

async function resolveReportPath(options, coursesEnv) {
  if (options.reportPath) {
    return resolveAgainstCanonicalBase(
      coursesEnv.canonicalBase,
      options.reportPath
    );
  }
  return getCanonicalNoteBackupReportPath(
    await loadLatestSnapshotRoot(coursesEnv.notesCacheRoot)
  );
}

function createProgressLogger(onProgress) {
  return typeof onProgress === "function" ? onProgress : () => {};
}

async function runNotesSnapshot({ streamStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NOTES_SNAPSHOT_SCRIPT.pathname], {
      cwd: path.dirname(new URL(import.meta.url).pathname),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (streamStderr) {
        process.stderr.write(chunk);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (!streamStderr && stderr) {
        process.stderr.write(stderr);
      }
      if (code !== 0) {
        const error = new Error(
          `Apple Notes snapshot failed with exit code ${code}.`
        );
        error.stderr = stderr;
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        error.message = `Could not parse Apple Notes snapshot output: ${error.message}`;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function prepareWeeklyRefresh(options, coursesEnv, dependencies) {
  const progress = createProgressLogger(options.onProgress);
  const grokBin = options.grokBin || process.env.GROK_BIN || "grok";
  if (!options.skipAi) {
    progress(`Checking Grok CLI and authentication with "${grokBin}".`);
    await dependencies.preflightGrok({
      grokBin,
      onProgress: progress,
    });
    progress("Grok CLI and authentication check succeeded.");
  } else {
    progress("Skipping Grok CLI/authentication check because --skip-ai is set.");
  }

  progress("Exporting Apple Notes and preparing notes.md candidates.");
  const snapshot = await dependencies.runNotesSnapshot({
    streamStderr: Boolean(options.onProgress),
  });
  progress(
    `Apple Notes export complete: ${snapshot.noteCount ?? "unknown"} note(s); report ${snapshot.canonicalNoteBackupReportPath}.`
  );
  const reportPath = snapshot.canonicalNoteBackupReportPath;
  progress("Loading canonical note backup report.");
  const report = await dependencies.loadReport(reportPath);
  progress(
    `Notes candidate report: ${report.totals?.processed ?? 0} processed, ${report.totals?.new ?? 0} new, ${report.totals?.updated ?? 0} updated, ${report.totals?.unchanged ?? 0} unchanged, ${report.totals?.missingCanonicalLessonFolder ?? 0} missing canonical folder.`
  );
  let summaries = null;

  if (!options.skipAi) {
    progress("Preparing Grok notes-summary.md candidates.");
    summaries = await dependencies.generateNoteSummaries({
      reportPath,
      canonicalBase: coursesEnv.canonicalBase,
      model: options.model || null,
      timeoutMs: options.timeoutMs,
      grokBin,
      preflight: async () => {},
      onProgress: progress,
    });
    progress(
      `Grok summary generation complete: ${summaries.totals.generated} generated, ${summaries.totals.staged} staged, ${summaries.totals.failed} failed.`
    );
    if (summaries.totals.failed > 0) {
      throw new Error(
        `${summaries.totals.failed} Grok summary candidate(s) failed. Review the report before applying.`
      );
    }
  }
  return {
    phase: "prepare",
    deployRun: false,
    reviewRequired: true,
    snapshotRoot: snapshot.snapshotRoot,
    reportPath,
    candidatesRoot: snapshot.canonicalNoteBackupCandidatesRoot,
    noteTotals: report.totals,
    summaryTotals: summaries?.totals || null,
    summarySkipped: summaries?.skipped || [],
    review: buildPrepareReview({
      report,
      summaries,
      skipAi: options.skipAi,
    }),
    metadataBehavior: metadataBehavior(report),
    next:
      "Review the staged candidates and report, then run `yarn courses:weekly --apply`. Deployment remains a separate command.",
  };
}


function noteItem(update) {
  return {
    title: update.title,
    lesson: update.relativeLessonDirectory || null,
    noteUpdatedAt: update.noteUpdatedAt || null,
    matchedBy: update.matchedBy || null,
    expectedLessonDirectoryName: update.expectedLessonDirectoryName || null,
    actualLessonDirectoryName: update.actualLessonDirectoryName || null,
    expectedRelativeLessonDirectory:
      update.expectedRelativeLessonDirectory || null,
    canonicalNotesPath: update.canonicalNotesPath || null,
    stagedNotesPath: update.stagedNotesPath || null,
  };
}

function summaryItem(update) {
  return {
    title: update.title,
    reason: update.reason || null,
    stagedSummaryPath: update.stagedSummaryPath || null,
    canonicalSummaryPath: update.canonicalSummaryPath || null,
    publishReasons: update.publishReasons || [],
    error: update.error || null,
  };
}

function buildPrepareReview({ report, summaries, skipAi }) {
  const noteUpdates = report.updates || [];
  const newNotes = noteUpdates
    .filter((update) => update.changeType === "new")
    .map(noteItem);
  const updatedNotes = noteUpdates
    .filter((update) => update.changeType === "updated")
    .map(noteItem);
  const alreadyCurrentNotes = (report.unchangedNotes || []).map(noteItem);
  const unmatchedNotes = report.missingCanonicalLessonFolders || [];
  const summarySkipped = summaries?.skipped || [];
  const alreadyStagedSummaries = summarySkipped
    .filter((item) => item.reason === "unchanged-staged")
    .map(summaryItem);
  const generatedSummaries = (summaries?.generated || []).map(summaryItem);
  const summariesToApply = [
    ...generatedSummaries,
    ...alreadyStagedSummaries,
  ];

  return {
    noteBackups: {
      totals: report.totals,
      new: newNotes,
      updated: updatedNotes,
      alreadyCurrent: alreadyCurrentNotes,
      unmatched: unmatchedNotes,
    },
    notesSummaries: {
      skippedByOption: skipAi,
      totals: summaries?.totals || null,
      generated: generatedSummaries,
      alreadyStaged: alreadyStagedSummaries,
      alreadyCurrent: summarySkipped
        .filter((item) => item.reason === "unchanged-canonical")
        .map(summaryItem),
      manualProtected: summarySkipped
        .filter((item) => item.reason === "manual-summary")
        .map(summaryItem),
      noPublishSkipped: summarySkipped
        .filter((item) => item.reason === "NOPUBLISH")
        .map(summaryItem),
      failures: (summaries?.failures || []).map(summaryItem),
    },
    applyPreview: {
      notesToApply: noteUpdates.length,
      notesToCreate: newNotes.length,
      notesToUpdate: updatedNotes.length,
      summariesToApply: summariesToApply.length,
      willRegenerateCourseContent: true,
      willRunOfflineAudit: true,
      willBuild: false,
      willDeploy: false,
    },
  };
}

function itemLabel(item) {
  return item.lesson ? `${item.title} (${item.lesson})` : item.title;
}

function formatList(lines, title, items, renderItem, emptyText = "none") {
  lines.push(`${title}: ${items.length}`);
  if (items.length === 0) {
    lines.push(`  - ${emptyText}`);
    return;
  }

  for (const item of items) {
    lines.push(`  - ${renderItem(item)}`);
  }
}

function formatNoteItem(item) {
  const pathText = item.stagedNotesPath
    ? ` -> staged ${item.stagedNotesPath}`
    : "";
  const sequenceText =
    item.matchedBy === "sequence" &&
    item.expectedLessonDirectoryName !== item.actualLessonDirectoryName
      ? ` [matched by week number: expected ${item.expectedLessonDirectoryName}, found ${item.actualLessonDirectoryName}]`
      : "";
  return `${itemLabel(item)}${sequenceText}${pathText}`;
}

function formatSummaryItem(item) {
  if (item.error) {
    return `${item.title}: ${item.error}`;
  }
  if (item.reason === "NOPUBLISH") {
    const reasons = item.publishReasons
      .map((reason) => `${reason.type}:${reason.path}`)
      .join(", ");
    return `${item.title}${reasons ? ` (${reasons})` : ""}`;
  }
  return item.stagedSummaryPath
    ? `${item.title} -> staged ${item.stagedSummaryPath}`
    : item.canonicalSummaryPath
      ? `${item.title} -> ${item.canonicalSummaryPath}`
      : item.title;
}

function formatPrepareResult(result) {
  const lines = [
    "Know Your Bible weekly prepare",
    "No canonical lesson files have been changed yet.",
    "",
    "Paths",
    `  Report: ${result.reportPath}`,
    `  Candidates: ${result.candidatesRoot}`,
    `  Snapshot: ${result.snapshotRoot}`,
    "",
    "Apple Notes -> notes.md",
    `  Processed: ${result.review.noteBackups.totals?.processed ?? 0}`,
  ];

  formatList(
    lines,
    "  New notes that --apply will create",
    result.review.noteBackups.new,
    formatNoteItem
  );
  formatList(
    lines,
    "  Existing notes that --apply will update",
    result.review.noteBackups.updated,
    formatNoteItem
  );
  formatList(
    lines,
    "  Already current notes; --apply will leave them alone",
    result.review.noteBackups.alreadyCurrent,
    itemLabel
  );
  formatList(
    lines,
    "  Apple Notes without a matching canonical lesson folder",
    result.review.noteBackups.unmatched,
    (item) =>
      `${item.title} -> expected ${item.expectedRelativeLessonDirectory || item.expectedLessonDirectoryName}`
  );

  lines.push("", "Grok notes-summary.md candidates");
  if (result.review.notesSummaries.skippedByOption) {
    lines.push("  Skipped by --skip-ai; no summaries will be generated or applied.");
  } else {
    formatList(
      lines,
      "  Generated now; --apply will copy them",
      result.review.notesSummaries.generated,
      formatSummaryItem
    );
    formatList(
      lines,
      "  Already staged; --apply will copy them",
      result.review.notesSummaries.alreadyStaged,
      formatSummaryItem
    );
    formatList(
      lines,
      "  Already current in canonical lessons; --apply will leave them alone",
      result.review.notesSummaries.alreadyCurrent,
      formatSummaryItem
    );
    formatList(
      lines,
      "  Manual canonical summaries protected from overwrite",
      result.review.notesSummaries.manualProtected,
      formatSummaryItem
    );
    formatList(
      lines,
      "  NOPUBLISH lessons skipped; not sent to Grok",
      result.review.notesSummaries.noPublishSkipped,
      formatSummaryItem
    );
    formatList(
      lines,
      "  Summary failures that need review",
      result.review.notesSummaries.failures,
      formatSummaryItem
    );
  }

  lines.push(
    "",
    "What `yarn courses:weekly --apply` will do",
    `  - Copy ${result.review.applyPreview.notesToApply} notes.md candidate(s): ${result.review.applyPreview.notesToCreate} new, ${result.review.applyPreview.notesToUpdate} updated.`,
    `  - Copy ${result.review.applyPreview.summariesToApply} notes-summary.md candidate(s).`,
    "  - Regenerate course content, resources, maps, playlist matches, and search.",
    "  - Run the offline course audit.",
    "  - It will not build or deploy.",
    "",
    result.next
  );

  return lines.join("\n");
}

function formatApplyResult(result) {
  const lines = [
    "Know Your Bible weekly apply",
    "Canonical lesson files were updated from the reviewed staging report.",
    "",
    `Report: ${result.reportPath}`,
  ];

  formatList(
    lines,
    "Applied notes.md files",
    result.appliedNotes || [],
    (item) => `${item.title} -> ${item.canonicalNotesPath}`
  );
  formatList(
    lines,
    "Applied notes-summary.md files",
    result.appliedSummaries || [],
    (item) => `${item.title} -> ${item.canonicalSummaryPath}`
  );
  lines.push(
    "",
    "Regeneration",
    `  Published lessons: ${result.refresh?.lessonCount ?? 0}`,
    `  Unpublished lessons: ${result.refresh?.unpublishedLessonCount ?? 0}`,
    `  Notes copied: ${result.refresh?.notesCopied ?? 0}`,
    `  Notes summaries copied: ${result.refresh?.notesSummariesCopied ?? 0}`,
    "",
    "Audit",
    `  Errors: ${result.audit?.errors ?? 0}`,
    `  Warnings: ${result.audit?.warnings ?? 0}`,
    "",
    "Build/deploy: not run.",
    result.next
  );

  return lines.join("\n");
}

export function formatWeeklyRefreshResult(result) {
  return result.phase === "prepare"
    ? formatPrepareResult(result)
    : formatApplyResult(result);
}

async function applyWeeklyRefresh(options, coursesEnv, dependencies) {
  const progress = createProgressLogger(options.onProgress);
  const reportPath = await resolveReportPath(options, coursesEnv);
  progress(`Applying reviewed candidates from ${reportPath}.`);
  const backups = await dependencies.applyBackups({
    reportPath,
    applySummaries: !options.skipAi,
  });
  progress(
    `Applied ${backups.applied.length} notes.md file(s) and ${backups.summariesApplied.length} notes-summary.md file(s).`
  );
  progress("Regenerating course content, assets, maps, playlist matches, and search.");
  const refresh = await dependencies.syncContent();
  progress(
    `Course content regenerated: ${refresh.lessonCount ?? 0} published lesson(s), ${refresh.unpublishedLessonCount ?? 0} unpublished lesson(s).`
  );
  progress(
    options.onlineAudit
      ? "Running course audit with bounded online link checks."
      : "Running offline course audit."
  );
  const audit = await dependencies.auditCourses({
    online: options.onlineAudit,
  });
  progress(
    `Course audit complete: ${audit.totals.errors} error(s), ${audit.totals.warnings} warning(s).`
  );

  if (audit.totals.errors > 0) {
    const error = new Error(
      `Course refresh completed, but the audit found ${audit.totals.errors} error(s).`
    );
    error.result = { audit, refresh };
    throw error;
  }

  return {
    phase: "apply",
    deployRun: false,
    reportPath,
    notesApplied: backups.applied.length,
    summariesApplied: backups.summariesApplied.length,
    appliedNotes: backups.applied,
    appliedSummaries: backups.summariesApplied,
    summaryApplySkipped: options.skipAi,
    refresh,
    audit: audit.totals,
    metadataBehavior: metadataBehavior(backups.report),
    next:
      "Review generated content and audit warnings. Build or deploy separately when ready.",
  };
}

export async function runWeeklyRefresh(options = {}, injectedDependencies = {}) {
  const coursesEnv = options.coursesEnv || (await loadCoursesEnv());
  const normalizedOptions = {
    apply: Boolean(options.apply),
    skipAi: Boolean(options.skipAi),
    onlineAudit: Boolean(options.onlineAudit),
    reportPath: options.reportPath || null,
    model: options.model || null,
    grokBin: options.grokBin || null,
    timeoutMs: options.timeoutMs || 120_000,
    onProgress: options.onProgress || null,
  };
  const dependencies = {
    preflightGrok,
    runNotesSnapshot,
    loadReport: loadCanonicalNoteBackupReport,
    generateNoteSummaries,
    applyBackups: applyCanonicalNoteBackups,
    syncContent: syncCoursesContent,
    auditCourses,
    ...injectedDependencies,
  };

  return normalizedOptions.apply
    ? applyWeeklyRefresh(normalizedOptions, coursesEnv, dependencies)
    : prepareWeeklyRefresh(normalizedOptions, coursesEnv, dependencies);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--report", "--model", "--grok-bin", "--timeout"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      const key = {
        "--report": "reportPath",
        "--model": "model",
        "--grok-bin": "grokBin",
        "--timeout": "timeoutSeconds",
      }[arg];
      options[key] = value;
      index += 1;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--skip-ai") {
      options.skipAi = true;
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

Without --apply, exports Apple Notes, stages changed notes.md files, classifies
NOPUBLISH lessons, and creates Grok notes-summary.md candidates. It does not
change canonical lessons.

After reviewing the report and staged files, use --apply to validate and copy
approved candidates, regenerate course content/search/assets, and run the
offline audit. This command never builds or deploys the site.

Options:
  --apply             Apply the latest reviewed staging report
  --report <path>     Apply a specific report instead of the latest
  --skip-ai           Prepare/apply notes without generating/applying summaries
  --online-audit      Add bounded remote link checks during --apply
  --json              Print machine-readable JSON instead of the readable report
  --model <id>        Override the Grok CLI default model during prepare
  --timeout <seconds> Per-summary timeout (default: 120)
  --grok-bin <path>   Grok executable (default: GROK_BIN or grok)

Progress is printed to stderr in readable mode. Use --json for quiet,
machine-readable stdout.

Grok summary prompt:
  Edit tools/courses/SUMMARY_PROMPT.md to change the prompt. Keep the
  {{NOTES}} placeholder where the lesson notes should be inserted.

Name handling:
  Existing manual metadata is preserved while the canonical lesson folder path
  stays the same. Renaming a source folder creates a new key/slug, so unmatched
  candidates are reported rather than silently moving metadata.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const timeoutSeconds = Number(options.timeoutSeconds || 120);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("--timeout must be a positive number of seconds.");
  }
  const result = await runWeeklyRefresh({
    ...options,
    timeoutMs: timeoutSeconds * 1000,
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
