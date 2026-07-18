import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";
import {
  applyCanonicalNoteBackups,
  getCanonicalNoteBackupReportPath,
  loadLatestSnapshotRoot,
} from "./notes-backups.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--report") {
      options.reportPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: yarn courses:notes:backups:apply [--report <path>]

Validates and applies the latest staged notes.md and notes-summary.md candidates.
Run this only after reviewing and approving every pending update.`);
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.help) {
    printHelp();
    return;
  }

  const coursesEnv = await loadCoursesEnv();
  const reportPath = cliOptions.reportPath
    ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.reportPath)
    : getCanonicalNoteBackupReportPath(
        await loadLatestSnapshotRoot(coursesEnv.notesCacheRoot)
      );

  const { applied, summariesApplied, report } =
    await applyCanonicalNoteBackups({ reportPath });

  console.log(
    JSON.stringify(
      {
        reportPath,
        appliedCount: applied.length,
        summariesAppliedCount: summariesApplied.length,
        totals: report.totals,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
