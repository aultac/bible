import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import {
  classifyVideoLesson,
  fetchYoutubeVideoMetadata,
  normalizeYoutubeLessonTitle,
} from "./youtube-playlist.mjs";

export const EXPORTED_LESSONS_FILENAME = "exported-lessons.csv";
export const EXPORTED_LESSON_COLUMNS = [
  "Week Number",
  "Chapter/Verse Start",
  "Chapter/Verse End",
  "Title",
  "Description",
  "YouTube Link",
  "Match",
];
const YOUTUBE_METADATA_CONCURRENCY = 4;

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(text)
    ? `"${text.replace(/"/gu, '""')}"`
    : text;
}

export function buildExportedLessonTitle(lesson) {
  return lesson.lessonKind === "intro"
    ? "Intro to Know Your Bible"
    : lesson.title;
}

export function youtubeTitleMatchesLesson(lesson, youtubeTitle) {
  const classification = classifyVideoLesson(youtubeTitle);
  if (
    classification.titleFormat === "week" &&
    classification.lessonSequenceNumber === lesson.sequenceNumber
  ) {
    return true;
  }
  if (
    classification.titleFormat === "week-with-passage" &&
    classification.lessonSequenceNumber === lesson.sequenceNumber
  ) {
    return (
      normalizeYoutubeLessonTitle(classification.passageTitle) ===
      normalizeYoutubeLessonTitle(lesson.title)
    );
  }
  if (
    classification.titleFormat === "intro" &&
    lesson.lessonKind === "intro"
  ) {
    return true;
  }
  return (
    normalizeYoutubeLessonTitle(youtubeTitle) ===
    normalizeYoutubeLessonTitle(buildExportedLessonTitle(lesson))
  );
}

export function buildExportedLessonRow(lesson, youtubeMetadata = null) {
  const title = buildExportedLessonTitle(lesson);
  const description = lesson.videoSummary ?? "";
  const youtubeUrl = lesson.youtube?.url || "";
  const matchesYoutube =
    Boolean(youtubeMetadata) &&
    youtubeTitleMatchesLesson(lesson, youtubeMetadata.title) &&
    youtubeMetadata.description === description;
  return [
    lesson.sequenceNumber,
    lesson.startVerse,
    lesson.endVerse,
    title,
    description,
    youtubeUrl,
    matchesYoutube ? "MATCH" : "",
  ];
}

export function serializeLessonTitleCsv(
  lessons,
  youtubeMetadataByUrl = new Map()
) {
  const rows = [
    EXPORTED_LESSON_COLUMNS,
    ...lessons
      .filter((lesson) => lesson.lessonKind !== "promo")
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((lesson) =>
        buildExportedLessonRow(
          lesson,
          youtubeMetadataByUrl.get(lesson.youtube?.url) || null
        )
      ),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadPublishedLessons(repoRoot = REPO_ROOT) {
  const sectionsIndex = await readJson(
    path.join(repoRoot, "apps", "courses", "content", "sections.json")
  );
  const lessons = [];

  for (const sectionEntry of sectionsIndex.sections || []) {
    const sectionManifest = await readJson(
      path.join(repoRoot, sectionEntry.sectionPath)
    );
    for (const lessonEntry of sectionManifest.lessons || []) {
      lessons.push(
        await readJson(path.join(repoRoot, lessonEntry.lessonPath))
      );
    }
  }

  return lessons;
}

async function loadYoutubeMetadataByUrl(lessons, fetchVideoMetadata) {
  const urls = [
    ...new Set(
      lessons
        .map((lesson) => lesson.youtube?.url)
        .filter((url) => typeof url === "string" && url.length > 0)
    ),
  ];
  const entries = new Array(urls.length);
  let nextIndex = 0;

  async function loadNext() {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const url = urls[index];
      entries[index] = [url, await fetchVideoMetadata(url)];
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(YOUTUBE_METADATA_CONCURRENCY, urls.length) },
      () => loadNext()
    )
  );
  return new Map(entries);
}

export async function exportLessonTitles({
  repoRoot = REPO_ROOT,
  outputPath = path.join(repoRoot, EXPORTED_LESSONS_FILENAME),
  fetchVideoMetadata = fetchYoutubeVideoMetadata,
} = {}) {
  const lessons = await loadPublishedLessons(repoRoot);
  const exportedLessons = lessons.filter(
    (lesson) => lesson.lessonKind !== "promo"
  );
  const youtubeMetadataByUrl = await loadYoutubeMetadataByUrl(
    exportedLessons,
    fetchVideoMetadata
  );
  await writeFile(
    outputPath,
    serializeLessonTitleCsv(lessons, youtubeMetadataByUrl),
    "utf8"
  );
  return {
    outputPath,
    lessonCount: exportedLessons.length,
  };
}
