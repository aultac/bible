import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--snapshot-root") {
      options.snapshotRoot = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-root") {
      options.sourceRoot = argv[index + 1];
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
  console.log(`Usage: yarn courses:notes:compare [--snapshot-root <dir>] [--source-root <dir>]

Reads the latest checked-in Notes snapshot pointer and compares note titles to existing
section lesson folders plus legacy summary/resource/final note names.

Defaults come from the repo-level .env and are resolved against COURSES_CANONICAL_BASE.`);
}

function normalizeKey(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\.[^.]+$/u, "")
    .replace(/[_\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function isSectionDirectory(name) {
  return /^\d{2}-Section-/u.test(name);
}

function isLessonDirectory(name) {
  return /^\d{3}-/u.test(name);
}

function canonicalizeLegacyBaseName(name) {
  return name
    .replace(/^0*(\d{3})_/u, "$1-")
    .replace(/^0*(\d{3})-/u, "$1-")
    .replace(/_/gu, "-")
    .replace(/\.[^.]+$/u, "");
}

function compareArtifacts(noteTitle, artifacts) {
  const normalizedNoteTitle = normalizeKey(noteTitle);
  const noteSequence = noteTitle.match(/^(\d{3})-/u)?.[1] || null;

  const exact = [];
  const normalized = [];
  const sameSequence = [];

  for (const artifact of artifacts) {
    if (artifact.name === noteTitle) {
      exact.push(artifact);
      continue;
    }

    if (artifact.normalizedName === normalizedNoteTitle) {
      normalized.push(artifact);
      continue;
    }

    if (noteSequence && artifact.sequence === noteSequence) {
      sameSequence.push(artifact);
    }
  }

  return {
    exact,
    normalized,
    sameSequence,
  };
}

async function listDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function collectCanonicalLessonArtifacts(sourceRoot) {
  const sectionNames = (await listDirectories(sourceRoot)).filter(isSectionDirectory);
  const artifacts = [];

  for (const sectionName of sectionNames) {
    const sectionPath = path.join(sourceRoot, sectionName);
    const lessonNames = (await listDirectories(sectionPath)).filter(isLessonDirectory);

    for (const lessonName of lessonNames) {
      artifacts.push({
        type: "canonical-lesson-directory",
        name: lessonName,
        normalizedName: normalizeKey(lessonName),
        sequence: lessonName.match(/^(\d{3})-/u)?.[1] || null,
        path: path.join(sectionPath, lessonName),
      });
    }
  }

  return artifacts;
}

async function collectLegacySummaryArtifacts(summariesRoot) {
  const sectionNames = await listDirectories(summariesRoot);
  const artifacts = [];

  for (const sectionName of sectionNames) {
    const sectionPath = path.join(summariesRoot, sectionName);
    const entries = await readdir(sectionPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.endsWith(".docx")) {
        continue;
      }

      if (entry.name.startsWith("~$")) {
        continue;
      }

      if (entry.name.includes("_Questions")) {
        continue;
      }

      if (entry.name.includes("AllCollectedSummaries")) {
        continue;
      }

      const rawName = entry.name.replace(/\.docx$/u, "");
      if (!/^\d{3}[-_]/u.test(rawName)) {
        continue;
      }

      const canonicalName = canonicalizeLegacyBaseName(rawName);

      artifacts.push({
        type: "legacy-summary-docx",
        name: canonicalName,
        normalizedName: normalizeKey(canonicalName),
        sequence: canonicalName.match(/^(\d{3})-/u)?.[1] || null,
        path: path.join(sectionPath, entry.name),
        rawName,
      });
    }
  }

  return artifacts;
}

async function collectLegacyResourceArtifacts(resourcesRoot) {
  const folderNames = await listDirectories(resourcesRoot);

  return folderNames.map((folderName) => {
    const canonicalName = canonicalizeLegacyBaseName(folderName);
    return {
      type: "legacy-resource-directory",
      name: canonicalName,
      normalizedName: normalizeKey(canonicalName),
      sequence: canonicalName.match(/^(\d{3})-/u)?.[1] || null,
      path: path.join(resourcesRoot, folderName),
      rawName: folderName,
    };
  });
}

async function collectLegacyFinalNoteArtifacts(finalNotesRoot) {
  const entries = await readdir(finalNotesRoot, { withFileTypes: true });
  const artifacts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".pdf")) {
      continue;
    }

    const rawName = entry.name.replace(/\.pdf$/u, "");
    if (!/^\d{3}[-_]/u.test(rawName)) {
      continue;
    }

    const canonicalName = canonicalizeLegacyBaseName(rawName);

    artifacts.push({
      type: "legacy-final-note-pdf",
      name: canonicalName,
      normalizedName: normalizeKey(canonicalName),
      sequence: canonicalName.match(/^(\d{3})-/u)?.[1] || null,
      path: path.join(finalNotesRoot, entry.name),
      rawName,
    });
  }

  return artifacts;
}

async function loadLatestSnapshotManifest(snapshotRoot) {
  const latestPointer = JSON.parse(
    await readFile(path.join(snapshotRoot, "latest.json"), "utf8")
  );
  const manifestPath = path.join(snapshotRoot, latestPointer.latestSnapshotDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  return {
    manifest,
    manifestPath,
  };
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.help) {
    printHelp();
    return;
  }

  const coursesEnv = await loadCoursesEnv();
  const options = {
    snapshotRoot: cliOptions.snapshotRoot
      ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.snapshotRoot)
      : coursesEnv.notesCacheRoot,
    sourceRoot: cliOptions.sourceRoot
      ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.sourceRoot)
      : coursesEnv.canonicalBase,
    summariesRoot: coursesEnv.summariesRoot,
    resourcesRoot: coursesEnv.resourcesRoot,
    finalNotesRoot: coursesEnv.finalNotesRoot,
  };

  const [{ manifest, manifestPath }, canonicalLessonArtifacts, legacySummaryArtifacts, legacyResourceArtifacts, legacyFinalNoteArtifacts] =
    await Promise.all([
      loadLatestSnapshotManifest(options.snapshotRoot),
      collectCanonicalLessonArtifacts(options.sourceRoot),
      collectLegacySummaryArtifacts(options.summariesRoot),
      collectLegacyResourceArtifacts(options.resourcesRoot),
      collectLegacyFinalNoteArtifacts(options.finalNotesRoot),
    ]);

  const allArtifacts = [
    ...canonicalLessonArtifacts,
    ...legacySummaryArtifacts,
    ...legacyResourceArtifacts,
    ...legacyFinalNoteArtifacts,
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    manifestPath,
    sourceRoot: options.sourceRoot,
    noteCount: manifest.noteCount,
    notes: manifest.notes.map((note) => ({
      title: note.title,
      comparison: compareArtifacts(note.title, allArtifacts),
    })),
    unmatchedArtifacts: allArtifacts.filter((artifact) => {
      return !manifest.notes.some((note) => {
        const comparison = compareArtifacts(note.title, [artifact]);
        return (
          comparison.exact.length > 0 ||
          comparison.normalized.length > 0 ||
          comparison.sameSequence.length > 0
        );
      });
    }),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
