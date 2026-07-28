import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    if (arg === "--full-export") {
      options.fullExport = true;
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
  --output from .env COURSES_NOTES_CACHE_DIR resolved against COURSES_CANONICAL_BASE

Options:
  --full-export   Re-export every note body instead of reusing unchanged cached exports`);
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

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function loadPreviousSnapshot(outputRoot, previousLatest) {
  if (!previousLatest?.latestSnapshotDir) {
    return null;
  }

  const snapshotRoot = path.join(outputRoot, previousLatest.latestSnapshotDir);
  const manifestPath = path.join(snapshotRoot, "manifest.json");

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      snapshotRoot,
      manifestPath,
      manifest,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadSnapshotAtRoot(snapshotRoot) {
  if (!snapshotRoot) {
    return null;
  }
  const manifestPath = path.join(snapshotRoot, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      snapshotRoot,
      manifestPath,
      manifest,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
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
  return runJxaJson(
    jxaScriptPath,
    [accountName, folderName, noteId],
    16 * 1024 * 1024
  );
}

function previousSnapshotMatchesSource(previousSnapshot, match) {
  return (
    previousSnapshot?.manifest?.source?.accountName === match.accountName &&
    previousSnapshot?.manifest?.source?.folderName === match.folderName
  );
}

function buildPreviousNotesById(previousSnapshot, match) {
  if (!previousSnapshotMatchesSource(previousSnapshot, match)) {
    return new Map();
  }

  return new Map(
    (previousSnapshot.manifest.notes || []).map((note) => [note.id, note])
  );
}

async function findReusablePreviousExport({
  note,
  previousNote,
  previousSnapshotRoot,
}) {
  if (!previousNote) {
    return { reusable: false, reason: "new note" };
  }
  if (!note.updatedAt || !previousNote.updatedAt) {
    return { reusable: false, reason: "missing modification time" };
  }
  if (note.updatedAt !== previousNote.updatedAt) {
    return { reusable: false, reason: "modified" };
  }
  if (note.title !== previousNote.title) {
    return { reusable: false, reason: "title changed" };
  }
  if (!previousNote.bodyPath) {
    return { reusable: false, reason: "missing previous body path" };
  }
  if (!previousSnapshotRoot) {
    return { reusable: false, reason: "missing previous snapshot root" };
  }

  const previousBodyPath = path.join(
    previousSnapshotRoot,
    previousNote.bodyPath
  );
  if (!(await pathExists(previousBodyPath))) {
    return { reusable: false, reason: "missing cached body" };
  }

  return {
    reusable: true,
    previousBodyPath,
  };
}

export async function writeSnapshotFiles(
  snapshotRoot,
  match,
  {
    previousSnapshot = null,
    fullExport = false,
    readNoteBodyFn = readNoteBody,
    log = (message) => console.error(message),
  } = {}
) {
  const notesDir = path.join(snapshotRoot, "notes");
  await mkdir(notesDir, { recursive: true });

  const manifestNotes = [];
  const titles = [];
  const previousNotesById = fullExport
    ? new Map()
    : buildPreviousNotesById(previousSnapshot, match);
  let exportedNoteCount = 0;
  let reusedNoteCount = 0;

  for (const [index, note] of match.notes.entries()) {
    const titleSlug = slugify(note.title);
    const noteIdFragment = stableIdFragment(note.id);
    const fileName = `${titleSlug}--${noteIdFragment}.html`;
    const relativeBodyPath = path.posix.join("notes", fileName);
    const absoluteBodyPath = path.join(notesDir, fileName);
    const reuse = fullExport
      ? { reusable: false, reason: "full export requested" }
      : await findReusablePreviousExport({
          note,
          previousNote: previousNotesById.get(note.id),
          previousSnapshotRoot: previousSnapshot?.snapshotRoot,
        });

    if (reuse.reusable) {
      log(
        `Reusing cached note export ${index + 1}/${match.notes.length}: ${note.title}`
      );
      await copyFile(reuse.previousBodyPath, absoluteBodyPath);
      reusedNoteCount += 1;
    } else {
      log(
        `Exporting note ${index + 1}/${match.notes.length}: ${note.title} (${reuse.reason})`
      );
      const noteBody = await readNoteBodyFn(
        match.accountName,
        match.folderName,
        note.id
      );
      await writeFile(absoluteBodyPath, noteBody.bodyHtml, "utf8");
      exportedNoteCount += 1;
    }

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
    exportStats: {
      fullExport,
      exported: exportedNoteCount,
      reused: reusedNoteCount,
    },
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

export async function createNotesSnapshot(
  {
    coursesEnv,
    account,
    folder,
    output,
    fullExport = false,
    previousSnapshotRoot = null,
    now = new Date(),
    prepareBackups = true,
  },
  {
    readFolder = async (accountName, folderName) => {
      const jxaScriptPath = path.resolve(
        __dirname,
        "notes/export-notes-folder.jxa.js"
      );
      return runJxaJson(
        jxaScriptPath,
        [accountName, folderName],
        4 * 1024 * 1024
      );
    },
    readNoteBodyFn = readNoteBody,
    prepareBackupsFn = prepareCanonicalNoteBackups,
    log = (message) => console.error(message),
  } = {}
) {
  if (!folder) {
    throw new Error("A folder name is required.");
  }
  await mkdir(output, { recursive: true });
  const rawResult = await readFolder(account, folder);
  const match = rawResult.matches[0];
  if (!match) {
    throw new Error(`Apple Notes folder was not found: ${folder}`);
  }

  const snapshotsRoot = path.join(output, "snapshots");
  const snapshotRoot = path.join(snapshotsRoot, snapshotStamp(now));
  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });
  const previousLatest = await readExistingLatestPointer(output);
  const previousSnapshot = fullExport
    ? null
    : previousSnapshotRoot
      ? await loadSnapshotAtRoot(previousSnapshotRoot)
      : await loadPreviousSnapshot(output, previousLatest);
  const manifest = await writeSnapshotFiles(snapshotRoot, match, {
    previousSnapshot,
    fullExport,
    readNoteBodyFn,
    log,
  });
  await updateLatestPointer(output, snapshotRoot);
  const noteBackups = prepareBackups
    ? await prepareBackupsFn({
        snapshotRoot,
        canonicalBase: coursesEnv.canonicalBase,
      })
    : null;

  return {
    snapshotRoot,
    manifestPath: path.join(snapshotRoot, "manifest.json"),
    titlesPath: path.join(snapshotRoot, "titles.txt"),
    noteCount: manifest.noteCount,
    exportStats: manifest.exportStats,
    exportedNoteCount: manifest.exportStats.exported,
    reusedNoteCount: manifest.exportStats.reused,
    previousSnapshotRoot: previousSnapshot?.snapshotRoot || null,
    previousLatestSnapshotDir: previousLatest?.latestSnapshotDir || null,
    canonicalNoteBackupReportPath: noteBackups?.reportPath || null,
    canonicalNoteBackupCandidatesRoot: noteBackups?.candidatesRoot || null,
    canonicalNoteBackupTotals: noteBackups?.report.totals || null,
  };
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));

  if (cliOptions.help) {
    printHelp();
    return;
  }
  const coursesEnv = await loadCoursesEnv();
  const result = await createNotesSnapshot({
    coursesEnv,
    account: cliOptions.account || coursesEnv.notesAccount,
    folder: cliOptions.folder || coursesEnv.notesFolder,
    output: cliOptions.output
      ? resolveAgainstCanonicalBase(coursesEnv.canonicalBase, cliOptions.output)
      : coursesEnv.notesCacheRoot,
    fullExport: Boolean(cliOptions.fullExport),
  });

  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    const details = error?.stderr ? String(error.stderr).trim() : error?.message;
    console.error(details || error);
    process.exitCode = 1;
  });
}
