import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";
import { prepareCanonicalNoteBackups } from "./notes-backups.mjs";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--account") {
      options.account = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--folder") {
      options.folder = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = argv[index + 1];
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
  console.log(`Usage: yarn courses:notes:snapshot [--account <name>] [--folder <name>] [--output <dir>]

Reads a Notes folder via the checked-in JXA script at tools/courses/notes/export-notes-folder.jxa.js
and writes a local snapshot into the configured notes cache directory. It also stages
Markdown note-backup candidates for any canonical lesson folders whose notes.md file
would be new or changed.

This is the export/staging portion of yarn courses:weekly. It does not alter
canonical lesson files; review candidates before running the apply phase.

Defaults:
  --account from .env COURSES_NOTES_ACCOUNT (fallback iCloud)
  --folder from .env COURSES_NOTES_FOLDER (fallback "FBT Sunday School")
  --output from .env COURSES_NOTES_CACHE_DIR resolved against COURSES_CANONICAL_BASE`);
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "untitled";
}

function snapshotStamp(date = new Date()) {
  return date.toISOString().replace(/:/g, "-");
}

function stableIdFragment(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}
async function runJxaJson(scriptPath, args, maxBuffer) {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-l", "JavaScript", scriptPath, ...args],
    { maxBuffer }
  );

  return JSON.parse(stdout);
}

async function readNoteBody(accountName, folderName, noteId) {
  const jxaScriptPath = path.resolve(__dirname, "notes/export-note-body.jxa.js");

  return runJxaJson(jxaScriptPath, [accountName, folderName, noteId], 16 * 1024 * 1024);
}

async function writeSnapshotFiles(snapshotRoot, match) {
  const notesDir = path.join(snapshotRoot, "notes");
  await mkdir(notesDir, { recursive: true });

  const manifestNotes = [];
  const titles = [];

  for (const [index, note] of match.notes.entries()) {
    console.error(
      `Exporting note ${index + 1}/${match.notes.length}: ${note.title}`
    );
    const noteBody = await readNoteBody(match.accountName, match.folderName, note.id);
    const titleSlug = slugify(note.title);
    const noteIdFragment = stableIdFragment(note.id);
    const fileName = `${titleSlug}--${noteIdFragment}.html`;
    const relativeBodyPath = path.posix.join("notes", fileName);
    const absoluteBodyPath = path.join(notesDir, fileName);
    await writeFile(absoluteBodyPath, noteBody.bodyHtml, "utf8");

    titles.push(note.title);
    manifestNotes.push({
      id: note.id,
      title: note.title,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      bodyPath: relativeBodyPath,
    });
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      accountName: match.accountName,
      folderName: match.folderName,
    },
    noteCount: manifestNotes.length,
    notes: manifestNotes,
  };

  await writeFile(
    path.join(snapshotRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(snapshotRoot, "titles.txt"), `${titles.join("\n")}\n`, "utf8");

  return manifest;
}

async function updateLatestPointer(outputRoot, snapshotRoot) {
  const latestPointerPath = path.join(outputRoot, "latest.json");
  const payload = {
    latestSnapshotDir: path.relative(outputRoot, snapshotRoot),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(latestPointerPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readExistingLatestPointer(outputRoot) {
  const latestPointerPath = path.join(outputRoot, "latest.json");

  try {
    const content = await readFile(latestPointerPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.help) {
    printHelp();
    return;
  }
  const coursesEnv = await loadCoursesEnv();
  const options = {
    account: cliOptions.account || coursesEnv.notesAccount,
    folder: cliOptions.folder || coursesEnv.notesFolder,
    output: cliOptions.output
      ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.output)
      : coursesEnv.notesCacheRoot,
  };

  if (!options.folder) {
    throw new Error("A folder name is required.");
  }

  await mkdir(options.output, { recursive: true });

  const jxaScriptPath = path.resolve(__dirname, "notes/export-notes-folder.jxa.js");
  const rawResult = await runJxaJson(
    jxaScriptPath,
    [options.account, options.folder],
    4 * 1024 * 1024
  );
  const match = rawResult.matches[0];

  const snapshotsRoot = path.join(options.output, "snapshots");
  const snapshotRoot = path.join(snapshotsRoot, snapshotStamp());
  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });

  const previousLatest = await readExistingLatestPointer(options.output);
  const manifest = await writeSnapshotFiles(snapshotRoot, match);
  await updateLatestPointer(options.output, snapshotRoot);
  const noteBackups = await prepareCanonicalNoteBackups({
    snapshotRoot,
    canonicalBase: coursesEnv.canonicalBase,
  });

  console.log(
    JSON.stringify(
      {
        snapshotRoot,
        manifestPath: path.join(snapshotRoot, "manifest.json"),
        titlesPath: path.join(snapshotRoot, "titles.txt"),
        noteCount: manifest.noteCount,
        previousLatestSnapshotDir: previousLatest?.latestSnapshotDir || null,
        canonicalNoteBackupReportPath: noteBackups.reportPath,
        canonicalNoteBackupCandidatesRoot: noteBackups.candidatesRoot,
        canonicalNoteBackupTotals: noteBackups.report.totals,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const details = error?.stderr ? String(error.stderr).trim() : error?.message;
  console.error(details || error);
  process.exitCode = 1;
});
