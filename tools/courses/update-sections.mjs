import { syncSectionManifests } from "./repo-content.mjs";

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
  console.log(`Usage: yarn courses:sections:update

Scans the canonical Sunday School source tree and refreshes the git-tracked
section manifests in apps/courses/content/. Existing manual section metadata fields
already present in the repo are preserved when possible.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const summary = await syncSectionManifests();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
