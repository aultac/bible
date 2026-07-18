import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);
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

async function runNotesSnapshot() {

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [NOTES_SNAPSHOT_SCRIPT.pathname],
    {
      cwd: path.dirname(new URL(import.meta.url).pathname),
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  if (stderr) {
    process.stderr.write(stderr);
  }
  return JSON.parse(stdout);
}

async function prepareWeeklyRefresh(options, coursesEnv, dependencies) {
  const grokBin = options.grokBin || process.env.GROK_BIN || "grok";
  if (!options.skipAi) {
    await dependencies.preflightGrok({ grokBin });
  }

  const snapshot = await dependencies.runNotesSnapshot();
  const reportPath = snapshot.canonicalNoteBackupReportPath;
  const report = await dependencies.loadReport(reportPath);
  let summaries = null;

  if (!options.skipAi) {
    summaries = await dependencies.generateNoteSummaries({
      reportPath,
      canonicalBase: coursesEnv.canonicalBase,
      model: options.model || null,
      timeoutMs: options.timeoutMs,
      grokBin,
      preflight: async () => {},
    });
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
    metadataBehavior: metadataBehavior(report),
    next:
      "Review the staged candidates and report, then run `yarn courses:weekly --apply`. Deployment remains a separate command.",
  };
}

async function applyWeeklyRefresh(options, coursesEnv, dependencies) {
  const reportPath = await resolveReportPath(options, coursesEnv);
  const backups = await dependencies.applyBackups({
    reportPath,
    applySummaries: !options.skipAi,
  });
  const refresh = await dependencies.syncContent();
  const audit = await dependencies.auditCourses({
    online: options.onlineAudit,
  });

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
  --model <id>        Override the Grok CLI default model during prepare
  --timeout <seconds> Per-summary timeout (default: 120)
  --grok-bin <path>   Grok executable (default: GROK_BIN or grok)

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
  });
  console.log(JSON.stringify(result, null, 2));
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
