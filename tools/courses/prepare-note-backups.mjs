import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";
import {
  loadLatestSnapshotRoot,
  prepareCanonicalNoteBackups,
} from "./notes-backups.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--snapshot-root") {
      options.snapshotRoot = argv[index + 1];
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
  console.log(`Usage: yarn courses:notes:backups:prepare [--snapshot-root <dir>]

Converts the latest Notes snapshot HTML to Markdown backup candidates, compares them to
canonical lesson notes.md files, and stages only new or changed backups for review.`);
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.help) {
    printHelp();
    return;
  }

  const coursesEnv = await loadCoursesEnv();
  const snapshotRoot = cliOptions.snapshotRoot
    ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.snapshotRoot)
    : await loadLatestSnapshotRoot(coursesEnv.notesCacheRoot);

  const { report, reportPath, candidatesRoot } = await prepareCanonicalNoteBackups({
    snapshotRoot,
    canonicalBase: coursesEnv.canonicalBase,
  });

  console.log(
    JSON.stringify(
      {
        snapshotRoot,
        reportPath,
        candidatesRoot,
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
