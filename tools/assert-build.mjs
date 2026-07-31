import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const distRoot = path.join(repoRoot, "dist");
const requiredFiles = ["index.html", "404.html", "CNAME"];

await Promise.all(
  requiredFiles.map((fileName) => access(path.join(distRoot, fileName)))
);

const customDomain = (
  await readFile(path.join(distRoot, "CNAME"), "utf8")
).trim();

if (customDomain !== "knowyourbible.study") {
  throw new Error(
    `Expected dist/CNAME to contain knowyourbible.study, received ${JSON.stringify(
      customDomain
    )}.`
  );
}

console.log(`Verified build artifacts: ${requiredFiles.join(", ")}`);
