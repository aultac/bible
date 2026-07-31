import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";

export const EXPORTED_LESSONS_FILENAME = "exported-lessons.csv";
export const EXPORTED_LESSON_COLUMNS = [
  "Week Number",
  "Chapter/Verse Start",
  "Chapter/Verse End",
  "Title",
  "Description",
];

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(text)
    ? `"${text.replace(/"/gu, '""')}"`
    : text;
}

export function buildExportedLessonTitle(lesson) {
  return `Know Your Bible - Week ${lesson.sequenceNumber} - ${lesson.title}`;
}

export function buildExportedLessonRow(lesson) {
  return [
    lesson.sequenceNumber,
    lesson.startVerse,
    lesson.endVerse,
    buildExportedLessonTitle(lesson),
    lesson.videoSummary,
  ];
}

export function serializeLessonTitleCsv(lessons) {
  const rows = [
    EXPORTED_LESSON_COLUMNS,
    ...lessons
      .filter((lesson) => lesson.lessonKind !== "promo")
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map(buildExportedLessonRow),
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

export async function exportLessonTitles({
  repoRoot = REPO_ROOT,
  outputPath = path.join(repoRoot, EXPORTED_LESSONS_FILENAME),
} = {}) {
  const lessons = await loadPublishedLessons(repoRoot);
  const exportedLessons = lessons.filter(
    (lesson) => lesson.lessonKind !== "promo"
  );
  await writeFile(outputPath, serializeLessonTitleCsv(lessons), "utf8");
  return {
    outputPath,
    lessonCount: exportedLessons.length,
  };
}
