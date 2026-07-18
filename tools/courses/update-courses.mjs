import { syncCoursesContent } from "./repo-content.mjs";

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: yarn courses:update

Scans the canonical Know Your Bible source tree and regenerates the git-tracked
course content in apps/courses/content/ plus copied lesson resources in
apps/courses/public/resources/. Notes markdown is copied from the approved canonical
notes.md backups, notes-summary.md is copied separately from class summary.md,
summary .docx files are converted to summary.md, lesson-root KMZ files are converted
into GeoJSON map assets, the configured YouTube playlist snapshot is refreshed,
and a gzip-compressed browser search index is generated.

Lessons containing NOPUBLISH in any filename or in notes.md are archived under
apps/courses/content/unpublished and omitted from routes, search, and public assets.
For the review-gated normal workflow, use yarn courses:weekly.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const summary = await syncCoursesContent();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
