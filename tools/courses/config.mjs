import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "../..");
const DOTENV_PATH = path.join(REPO_ROOT, ".env");

function stripWrappingQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseDotenv(content) {
  const env = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = stripWrappingQuotes(rawValue);
  }

  return env;
}

export function resolveAgainstCanonicalBase(canonicalBase, value) {
  return path.isAbsolute(value) ? value : path.resolve(canonicalBase, value);
}

export async function loadCoursesEnv() {
  let fileEnv = {};

  try {
    fileEnv = parseDotenv(await readFile(DOTENV_PATH, "utf8"));
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  const env = {
    ...fileEnv,
    ...process.env,
  };

  const canonicalBase =
    env.COURSES_CANONICAL_BASE || "/Users/aultac/Miscellaneous/FBT_SundaySchool";

  return {
    canonicalBase,
    notesAccount: env.COURSES_NOTES_ACCOUNT || "iCloud",
    notesFolder: env.COURSES_NOTES_FOLDER || "FBT Sunday School",
    notesCacheRoot: resolveAgainstCanonicalBase(
      canonicalBase,
      env.COURSES_NOTES_CACHE_DIR || "notes-cache"
    ),
    summariesRoot: resolveAgainstCanonicalBase(
      canonicalBase,
      env.COURSES_SUMMARIES_DIR || "Summaries"
    ),
    resourcesRoot: resolveAgainstCanonicalBase(
      canonicalBase,
      env.COURSES_RESOURCES_DIR || "resources"
    ),
    finalNotesRoot: resolveAgainstCanonicalBase(
      canonicalBase,
      env.COURSES_FINAL_NOTES_DIR || "FinalNotes"
    ),
    youtubePlaylistUrl: env.COURSES_YOUTUBE_PLAYLIST_URL || "",
  };
}
