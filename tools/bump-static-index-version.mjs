import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "static", "index.html");
const semverPattern = /v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/u;
const content = await readFile(indexPath, "utf8");
const match = content.match(semverPattern);

if (!match?.groups) {
  throw new Error("Could not find a vX.Y.Z semver string in static/index.html.");
}

const nextVersion = `v${match.groups.major}.${match.groups.minor}.${
  Number.parseInt(match.groups.patch, 10) + 1
}`;
const updatedContent = content.replace(semverPattern, nextVersion);

await writeFile(indexPath, updatedContent);
console.log(`Bumped static/index.html to ${nextVersion}`);
