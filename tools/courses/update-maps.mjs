import { syncLessonMaps } from "./repo-content.mjs";

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
  console.log(`Usage: yarn courses:maps:update

Regenerates published lesson map sources and enriched GeoJSON assets from the
map paths already recorded in lesson manifests. Only map assets and changed map
manifest records are written; notes, summaries, playlist/search data, and weekly
caches are not read or regenerated.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  console.log(JSON.stringify(await syncLessonMaps(), null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
