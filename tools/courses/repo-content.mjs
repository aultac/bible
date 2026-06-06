import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { REPO_ROOT, loadCoursesEnv } from "./config.mjs";
import {
  convertMapSourceToGeoJson,
  isLessonMapFileName,
  summarizeGeoJson,
} from "./lesson-maps.mjs";
import {
  buildEsvUrlForPassage,
  formatReference,
  isSectionDirectory,
  isLessonDirectory,
  parseSectionDirectoryName,
  parseLessonDirectoryName,
} from "./lesson-paths.mjs";
import {
  buildPlaylistVideoMatchMap,
  fetchPlaylistSnapshot,
} from "./youtube-playlist.mjs";

const execFileAsync = promisify(execFile);

const markdownConverter = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
});

const CONTENT_ROOT = path.join(REPO_ROOT, "src", "content", "courses");
const BUCKETS_ROOT = path.join(CONTENT_ROOT, "sections");
const PUBLIC_RESOURCES_ROOT = path.join(
  REPO_ROOT,
  "public",
  "courses",
  "resources"
);
const PUBLIC_MAPS_ROOT = path.join(REPO_ROOT, "public", "courses", "maps");
const PLAYLIST_SNAPSHOT_PATH = path.join(CONTENT_ROOT, "playlist.json");

const BUCKET_MANUAL_FIELDS = [
  "title",
  "info",
  "startYear",
  "endYear",
  "status",
];

const LESSON_MANUAL_FIELDS = [
  "title",
  "description",
  "status",
  "tags",
  "topicTags",
  "peopleTags",
  "placeTags",
];

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function toRepoRelativePath(targetPath) {
  return toPosixPath(path.relative(REPO_ROOT, targetPath));
}

function toCanonicalRelativePath(canonicalBase, targetPath) {
  return toPosixPath(path.relative(canonicalBase, targetPath));
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

async function readJsonIfExists(targetPath) {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  return JSON.parse(await readFile(targetPath, "utf8"));
}

function buildDiscoveredFileRecord(canonicalBase, absolutePath) {
  return {
    absolutePath,
    relativePath: toCanonicalRelativePath(canonicalBase, absolutePath),
    fileName: path.basename(absolutePath),
  };
}

async function listDirectories(rootPath) {
  const entries = await readdir(rootPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function collectFilesRecursive(rootPath, currentRelativePath = "") {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const relativePath = currentRelativePath
      ? path.join(currentRelativePath, entry.name)
      : entry.name;
    const absolutePath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursive(absolutePath, relativePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath: toPosixPath(relativePath),
      fileName: entry.name,
    });
  }

  return files;
}

async function listLessonRootMapFiles(canonicalBase, lessonPath) {
  const entries = await readdir(lessonPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && isLessonMapFileName(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) =>
      buildDiscoveredFileRecord(canonicalBase, path.join(lessonPath, entry.name))
    );
}

function pickFields(source, fieldNames) {
  const picked = {};

  for (const fieldName of fieldNames) {
    if (source?.[fieldName] !== undefined) {
      picked[fieldName] = source[fieldName];
    }
  }

  return picked;
}

function normalizeMarkdown(markdown) {
  return (
    markdown
      .replace(/\r\n/gu, "\n")
      .replace(/\u00a0/gu, " ")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd() + "\n"
  );
}

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, value, "utf8");
}

async function convertDocxToMarkdown(docxPath) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bible-courses-"));

  try {
    const htmlPath = path.join(tempRoot, "converted.html");
    await execFileAsync("textutil", [
      "-convert",
      "html",
      "-output",
      htmlPath,
      docxPath,
    ]);
    const html = await readFile(htmlPath, "utf8");
    return normalizeMarkdown(markdownConverter.translate(html));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function deriveDefaultSectionStatus(sectionnum) {
  if (sectionnum === 1) {
    return "complete";
  }

  if (sectionnum === 2) {
    return "current";
  }

  return "upcoming";
}

function buildVerseString(reference) {
  return reference ? formatReference(reference) : null;
}

function buildPassageRecord(passage) {
  if (!passage) {
    return null;
  }

  return {
    display: passage.display,
    start: passage.start,
    end: passage.end,
    startVerse: buildVerseString(passage.start),
    endVerse: buildVerseString(passage.end),
    spansMultipleBooks: passage.spansMultipleBooks,
    esvUrl: buildEsvUrlForPassage(passage),
  };
}

async function loadExistingSectionManualMap() {
  const sectionManualMap = new Map();
  const topLevelManifest = await readJsonIfExists(path.join(CONTENT_ROOT, "sections.json"));

  for (const section of topLevelManifest?.sections || []) {
    const key = section?.source?.relativeSectionDirectory;
    if (key) {
      sectionManualMap.set(key, pickFields(section, BUCKET_MANUAL_FIELDS));
    }
  }

  if (!(await pathExists(BUCKETS_ROOT))) {
    return sectionManualMap;
  }

  for (const sectionSlug of await listDirectories(BUCKETS_ROOT)) {
    const sectionManifest = await readJsonIfExists(
      path.join(BUCKETS_ROOT, sectionSlug, "section.json")
    );
    const key = sectionManifest?.source?.relativeSectionDirectory;

    if (key && !sectionManualMap.has(key)) {
      sectionManualMap.set(key, pickFields(sectionManifest, BUCKET_MANUAL_FIELDS));
    }
  }

  return sectionManualMap;
}

async function loadExistingLessonManualMap() {
  const lessonManualMap = new Map();

  if (!(await pathExists(BUCKETS_ROOT))) {
    return lessonManualMap;
  }

  for (const sectionSlug of await listDirectories(BUCKETS_ROOT)) {
    const lessonsRoot = path.join(BUCKETS_ROOT, sectionSlug, "lessons");
    if (!(await pathExists(lessonsRoot))) {
      continue;
    }

    for (const lessonSlug of await listDirectories(lessonsRoot)) {
      const lessonManifest = await readJsonIfExists(
        path.join(lessonsRoot, lessonSlug, "lesson.json")
      );
      const key = lessonManifest?.source?.relativeLessonDirectory;

      if (key) {
        lessonManualMap.set(key, pickFields(lessonManifest, LESSON_MANUAL_FIELDS));
      }
    }
  }

  return lessonManualMap;
}

async function discoverCanonicalSourceTree(canonicalBase) {
  const sectionNames = (await listDirectories(canonicalBase)).filter(isSectionDirectory);
  const sections = [];

  for (const sectionName of sectionNames) {
    const sectionPath = path.join(canonicalBase, sectionName);
    const parsedSection = parseSectionDirectoryName(sectionName);

    if (!parsedSection) {
      continue;
    }

    const sectionSummaryDocxPath = path.join(sectionPath, `${sectionName}_summary.docx`);
    const sectionHasSummaryDocx = await pathExists(sectionSummaryDocxPath);
    const lessonNames = (await listDirectories(sectionPath)).filter(isLessonDirectory);
    const lessons = [];

    for (const lessonName of lessonNames) {
      const lessonPath = path.join(sectionPath, lessonName);
      const parsedLesson = parseLessonDirectoryName(lessonName);

      if (!parsedLesson) {
        continue;
      }

      const notesSourcePath = path.join(lessonPath, "notes.md");
      const summaryDocxPath = path.join(lessonPath, `${lessonName}_summary.docx`);
      const resourcesDirectoryPath = path.join(lessonPath, "resources");
      const mapFiles = await listLessonRootMapFiles(canonicalBase, lessonPath);

      const hasNotes = await pathExists(notesSourcePath);
      const hasSummaryDocx = await pathExists(summaryDocxPath);
      const hasResourcesDirectory = await pathExists(resourcesDirectoryPath);

      lessons.push({
        ...parsedLesson,
        relativeLessonDirectory: toCanonicalRelativePath(canonicalBase, lessonPath),
        notesSourcePath: hasNotes ? notesSourcePath : null,
        notesSourcePathRelative: hasNotes
          ? toCanonicalRelativePath(canonicalBase, notesSourcePath)
          : null,
        summaryDocxPath: hasSummaryDocx ? summaryDocxPath : null,
        summaryDocxPathRelative: hasSummaryDocx
          ? toCanonicalRelativePath(canonicalBase, summaryDocxPath)
          : null,
        resourcesDirectoryPath: hasResourcesDirectory ? resourcesDirectoryPath : null,
        resourcesDirectoryPathRelative: hasResourcesDirectory
          ? toCanonicalRelativePath(canonicalBase, resourcesDirectoryPath)
          : null,
        resourceFiles: hasResourcesDirectory
          ? await collectFilesRecursive(resourcesDirectoryPath)
          : [],
        mapFiles,
      });
    }

    lessons.sort((left, right) => left.sequenceNumber - right.sequenceNumber);

    sections.push({
      ...parsedSection,
      relativeSectionDirectory: toCanonicalRelativePath(canonicalBase, sectionPath),
      sectionSummaryDocxPath: sectionHasSummaryDocx ? sectionSummaryDocxPath : null,
      sectionSummaryDocxPathRelative: sectionHasSummaryDocx
        ? toCanonicalRelativePath(canonicalBase, sectionSummaryDocxPath)
        : null,
      lessons,
    });
  }

  sections.sort((left, right) => left.sectionnum - right.sectionnum);
  return sections;
}

function buildSectionManifest({
  section,
  lessonEntries,
  sectionSummaryRepoPath,
  sectionSummaryError,
  manualSectionFields,
  generatedAt,
}) {
  const title =
    manualSectionFields.title || `Section ${section.sectionnum}: ${section.displayTitle}`;

  return {
    schemaVersion: 1,
    generatedAt,
    id: section.slug,
    slug: section.slug,
    sectionnum: section.sectionnum,
    title,
    info: manualSectionFields.info || "",
    startYear: manualSectionFields.startYear ?? null,
    endYear: manualSectionFields.endYear ?? null,
    status: manualSectionFields.status || deriveDefaultSectionStatus(section.sectionnum),
    startVerse: buildVerseString(section.passage?.start),
    endVerse: buildVerseString(section.passage?.end),
    passage: buildPassageRecord(section.passage),
    lessonCount: lessonEntries.length,
    lessons: lessonEntries,
    sectionSummary: {
      path: sectionSummaryRepoPath,
      sourcePath: section.sectionSummaryDocxPathRelative,
      sourceFormat: section.sectionSummaryDocxPath ? "docx" : null,
      available: Boolean(sectionSummaryRepoPath),
      error: sectionSummaryError || null,
    },
    source: {
      relativeSectionDirectory: section.relativeSectionDirectory,
      folderName: section.folderName,
      sectionSummaryDocxPath: section.sectionSummaryDocxPathRelative,
    },
  };
}

function buildSectionListEntry(sectionManifest) {
  return {
    id: sectionManifest.id,
    slug: sectionManifest.slug,
    sectionnum: sectionManifest.sectionnum,
    title: sectionManifest.title,
    info: sectionManifest.info,
    startYear: sectionManifest.startYear,
    endYear: sectionManifest.endYear,
    status: sectionManifest.status,
    startVerse: sectionManifest.startVerse,
    endVerse: sectionManifest.endVerse,
    passage: sectionManifest.passage,
    lessonCount: sectionManifest.lessonCount,
    sectionPath: `src/content/courses/sections/${sectionManifest.slug}/section.json`,
    sectionSummaryPath: sectionManifest.sectionSummary.path,
    source: sectionManifest.source,
  };
}

async function copyLessonResources({ sectionSlug, lessonSlug, resourceFiles, canonicalBase }) {
  const outputs = [];

  for (const resourceFile of resourceFiles) {
    const destinationPath = path.join(
      PUBLIC_RESOURCES_ROOT,
      sectionSlug,
      lessonSlug,
      resourceFile.relativePath
    );

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(resourceFile.absolutePath, destinationPath);

    outputs.push({
      name: resourceFile.fileName,
      sourcePath: toCanonicalRelativePath(canonicalBase, resourceFile.absolutePath),
      path: toRepoRelativePath(destinationPath),
      publicUrl: encodeURI(
        `/courses/resources/${sectionSlug}/${lessonSlug}/${resourceFile.relativePath}`
      ),
    });
  }

  return outputs;
}

async function generateLessonMapAsset({
  sectionSlug,
  lessonSlug,
  mapFile,
}) {
  const destinationDirectory = path.join(PUBLIC_MAPS_ROOT, sectionSlug, lessonSlug);
  const sourceDestinationPath = path.join(destinationDirectory, mapFile.fileName);
  const geoJsonFileName = `${path.basename(
    mapFile.fileName,
    path.extname(mapFile.fileName)
  )}.geojson`;
  const geoJsonDestinationPath = path.join(destinationDirectory, geoJsonFileName);
  const geoJson = await convertMapSourceToGeoJson(mapFile.absolutePath);
  const geoJsonSummary = summarizeGeoJson(geoJson);

  await mkdir(destinationDirectory, { recursive: true });
  await copyFile(mapFile.absolutePath, sourceDestinationPath);
  await writeJson(geoJsonDestinationPath, geoJson);

  return {
    sourcePath: mapFile.relativePath,
    sourceFormat: path.extname(mapFile.fileName).slice(1).toLowerCase(),
    sourcePublicUrl: encodeURI(
      `/courses/maps/${sectionSlug}/${lessonSlug}/${mapFile.fileName}`
    ),
    geoJsonPath: toRepoRelativePath(geoJsonDestinationPath),
    geoJsonPublicUrl: encodeURI(
      `/courses/maps/${sectionSlug}/${lessonSlug}/${geoJsonFileName}`
    ),
    available: true,
    featureCount: geoJsonSummary.featureCount,
    geometryTypes: geoJsonSummary.geometryTypes,
  };
}

async function writeSectionManifests({
  sections,
  sectionManualMap,
  generatedAt,
  sectionSummaryOutputs = new Map(),
}) {
  const sectionList = [];

  for (const section of sections) {
    const sectionDirectory = path.join(BUCKETS_ROOT, section.slug);
    const sectionSummaryOutputPath = path.join(sectionDirectory, "section-summary.md");
    const lessonEntries = section.lessons.map((lesson) => ({
      id: lesson.slug,
      slug: lesson.slug,
      sequenceNumber: lesson.sequenceNumber,
      title: lesson.displayTitle,
      lessonKind: lesson.lessonKind,
      startVerse: buildVerseString(lesson.passage?.start),
      endVerse: buildVerseString(lesson.passage?.end),
      passage: buildPassageRecord(lesson.passage),
      lessonPath: `src/content/courses/sections/${section.slug}/lessons/${lesson.slug}/lesson.json`,
      notesAvailable: Boolean(lesson.notesSourcePath),
      summaryAvailable: Boolean(lesson.summaryDocxPath),
      resourceCount: lesson.resourceFiles.length,
      source: {
        relativeLessonDirectory: lesson.relativeLessonDirectory,
        folderName: lesson.folderName,
      },
    }));

    const sectionSummaryOutput = sectionSummaryOutputs.get(section.relativeSectionDirectory) || {};
    const existingSectionSummaryPath =
      (await pathExists(sectionSummaryOutputPath))
        ? toRepoRelativePath(sectionSummaryOutputPath)
        : null;
    const sectionManifest = buildSectionManifest({
      section,
      lessonEntries,
      sectionSummaryRepoPath:
        sectionSummaryOutput.repoPath || existingSectionSummaryPath,
      sectionSummaryError: sectionSummaryOutput.error || null,
      manualSectionFields:
        sectionManualMap.get(section.relativeSectionDirectory) || {},
      generatedAt,
    });

    await writeJson(path.join(sectionDirectory, "section.json"), sectionManifest);
    sectionList.push(buildSectionListEntry(sectionManifest));
  }

  const sectionsManifest = {
    schemaVersion: 1,
    generatedAt,
    sectionCount: sectionList.length,
    sections: sectionList,
  };

  await writeJson(path.join(CONTENT_ROOT, "sections.json"), sectionsManifest);
  return sectionsManifest;
}

export async function syncSectionManifests() {
  const coursesEnv = await loadCoursesEnv();
  const generatedAt = new Date().toISOString();
  const sections = await discoverCanonicalSourceTree(coursesEnv.canonicalBase);
  const sectionManualMap = await loadExistingSectionManualMap();

  await mkdir(BUCKETS_ROOT, { recursive: true });
  const sectionsManifest = await writeSectionManifests({
    sections,
    sectionManualMap,
    generatedAt,
  });

  return {
    generatedAt,
    sectionCount: sectionsManifest.sectionCount,
    lessonCount: sections.reduce(
      (total, section) => total + section.lessons.length,
      0
    ),
    sectionsManifestPath: path.join(CONTENT_ROOT, "sections.json"),
  };
}

export async function syncCoursesContent() {
  const coursesEnv = await loadCoursesEnv();
  const generatedAt = new Date().toISOString();
  const sections = await discoverCanonicalSourceTree(coursesEnv.canonicalBase);
  const sectionManualMap = await loadExistingSectionManualMap();
  const lessonManualMap = await loadExistingLessonManualMap();
  const conversionErrors = [];
  let playlistSnapshot = await readJsonIfExists(PLAYLIST_SNAPSHOT_PATH);
  let playlistRefreshStatus = playlistSnapshot ? "cached" : "not-configured";

  if (coursesEnv.youtubePlaylistUrl) {
    try {
      playlistSnapshot = await fetchPlaylistSnapshot(coursesEnv.youtubePlaylistUrl);
      await writeJson(PLAYLIST_SNAPSHOT_PATH, playlistSnapshot);
      playlistRefreshStatus = "refreshed";
    } catch (error) {
      conversionErrors.push({
        type: "youtube-playlist",
        sourcePath: coursesEnv.youtubePlaylistUrl,
        error: error?.message || String(error),
        usedCachedSnapshot: Boolean(playlistSnapshot),
      });
      playlistRefreshStatus = playlistSnapshot ? "cached" : "error";
    }
  }

  const playlistVideoMatchMap = buildPlaylistVideoMatchMap(playlistSnapshot);

  await rm(BUCKETS_ROOT, { recursive: true, force: true });
  await rm(PUBLIC_RESOURCES_ROOT, { recursive: true, force: true });
  await rm(PUBLIC_MAPS_ROOT, { recursive: true, force: true });
  await mkdir(BUCKETS_ROOT, { recursive: true });
  await mkdir(PUBLIC_RESOURCES_ROOT, { recursive: true });
  await mkdir(PUBLIC_MAPS_ROOT, { recursive: true });

  const sectionSummaryOutputs = new Map();

  let notesCopied = 0;
  let lessonSummariesConverted = 0;
  let sectionSummariesConverted = 0;
  let resourceFilesCopied = 0;
  let mapAssetsGenerated = 0;
  let matchedYoutubeLessons = 0;

  for (const section of sections) {
    const sectionDirectory = path.join(BUCKETS_ROOT, section.slug);
    const lessonsDirectory = path.join(sectionDirectory, "lessons");
    await mkdir(lessonsDirectory, { recursive: true });

    let sectionSummaryRepoPath = null;
    let sectionSummaryError = null;

    if (section.sectionSummaryDocxPath) {
      try {
        const markdown = await convertDocxToMarkdown(section.sectionSummaryDocxPath);
        const outputPath = path.join(sectionDirectory, "section-summary.md");
        await writeText(outputPath, markdown);
        sectionSummaryRepoPath = toRepoRelativePath(outputPath);
        sectionSummariesConverted += 1;
      } catch (error) {
        sectionSummaryError = error?.message || String(error);
        conversionErrors.push({
          type: "section-summary",
          sourcePath: section.sectionSummaryDocxPathRelative,
          error: sectionSummaryError,
        });
      }
    }

    sectionSummaryOutputs.set(section.relativeSectionDirectory, {
      repoPath: sectionSummaryRepoPath,
      error: sectionSummaryError,
    });

    const sectionStatus =
      (sectionManualMap.get(section.relativeSectionDirectory) || {}).status ||
      deriveDefaultSectionStatus(section.sectionnum);

    for (const [lessonIndex, lesson] of section.lessons.entries()) {
      const lessonDirectory = path.join(lessonsDirectory, lesson.slug);
      await mkdir(lessonDirectory, { recursive: true });

      let notesRepoPath = null;
      let summaryRepoPath = null;
      let summaryError = null;
      let resources = [];
      let map = null;

      if (lesson.notesSourcePath) {
        const outputPath = path.join(lessonDirectory, "notes.md");
        await copyFile(lesson.notesSourcePath, outputPath);
        notesRepoPath = toRepoRelativePath(outputPath);
        notesCopied += 1;
      }

      if (lesson.summaryDocxPath) {
        try {
          const markdown = await convertDocxToMarkdown(lesson.summaryDocxPath);
          const outputPath = path.join(lessonDirectory, "summary.md");
          await writeText(outputPath, markdown);
          summaryRepoPath = toRepoRelativePath(outputPath);
          lessonSummariesConverted += 1;
        } catch (error) {
          summaryError = error?.message || String(error);
          conversionErrors.push({
            type: "lesson-summary",
            sourcePath: lesson.summaryDocxPathRelative,
            error: summaryError,
          });
        }
      }

      if (lesson.resourceFiles.length > 0) {
        resources = await copyLessonResources({
          sectionSlug: section.slug,
          lessonSlug: lesson.slug,
          resourceFiles: lesson.resourceFiles,
          canonicalBase: coursesEnv.canonicalBase,
        });
        resourceFilesCopied += resources.length;
      }

      if (lesson.mapFiles.length > 0) {
        try {
          map = await generateLessonMapAsset({
            sectionSlug: section.slug,
            lessonSlug: lesson.slug,
            mapFile: lesson.mapFiles[0],
          });
          mapAssetsGenerated += 1;
        } catch (error) {
          conversionErrors.push({
            type: "lesson-map",
            sourcePath: lesson.mapFiles[0].relativePath,
            error: error?.message || String(error),
          });
        }
      }

      const manualLessonFields =
        lessonManualMap.get(lesson.relativeLessonDirectory) || {};
      const lessonStatus =
        manualLessonFields.status ||
        (sectionStatus === "current" && lessonIndex === section.lessons.length - 1
          ? "current"
          : "published");
      const matchedVideo = playlistVideoMatchMap.get(lesson.sequenceNumber) || null;

      if (matchedVideo) {
        matchedYoutubeLessons += 1;
      }

      const lessonManifest = {
        schemaVersion: 1,
        generatedAt,
        id: lesson.slug,
        slug: lesson.slug,
        sectionId: section.slug,
        sectionSlug: section.slug,
        sequenceNumber: lesson.sequenceNumber,
        lessonKind: lesson.lessonKind,
        title: manualLessonFields.title || lesson.displayTitle,
        description: manualLessonFields.description || "",
        status: lessonStatus,
        startVerse: buildVerseString(lesson.passage?.start),
        endVerse: buildVerseString(lesson.passage?.end),
        passage: buildPassageRecord(lesson.passage),
        notes: {
          path: notesRepoPath,
          sourcePath: lesson.notesSourcePathRelative,
          available: Boolean(notesRepoPath),
        },
        summary: {
          path: summaryRepoPath,
          sourcePath: lesson.summaryDocxPathRelative,
          sourceFormat: lesson.summaryDocxPath ? "docx" : null,
          available: Boolean(summaryRepoPath),
          error: summaryError,
        },
        map,
        resources,
        youtube: matchedVideo,
        tags: manualLessonFields.tags || [],
        topicTags: manualLessonFields.topicTags || [],
        peopleTags: manualLessonFields.peopleTags || [],
        placeTags: manualLessonFields.placeTags || [],
        source: {
          relativeLessonDirectory: lesson.relativeLessonDirectory,
          folderName: lesson.folderName,
          notesPath: lesson.notesSourcePathRelative,
          summaryDocxPath: lesson.summaryDocxPathRelative,
          resourcesDirectory: lesson.resourcesDirectoryPathRelative,
          mapPath: lesson.mapFiles[0]?.relativePath || null,
        },
      };

      await writeJson(path.join(lessonDirectory, "lesson.json"), lessonManifest);
    }
  }

  const sectionsManifest = await writeSectionManifests({
    sections,
    sectionManualMap,
    generatedAt,
    sectionSummaryOutputs,
  });

  return {
    generatedAt,
    sectionCount: sectionsManifest.sectionCount,
    lessonCount: sections.reduce(
      (total, section) => total + section.lessons.length,
      0
    ),
    notesCopied,
    lessonSummariesConverted,
    sectionSummariesConverted,
    resourceFilesCopied,
    mapAssetsGenerated,
    playlistVideoCount: playlistSnapshot?.videoCount || 0,
    matchedYoutubeLessons,
    playlistRefreshStatus,
    playlistSnapshotPath: playlistSnapshot ? PLAYLIST_SNAPSHOT_PATH : null,
    conversionErrors,
    sectionsManifestPath: path.join(CONTENT_ROOT, "sections.json"),
    contentRoot: CONTENT_ROOT,
    publicResourcesRoot: PUBLIC_RESOURCES_ROOT,
    publicMapsRoot: PUBLIC_MAPS_ROOT,
  };
}
