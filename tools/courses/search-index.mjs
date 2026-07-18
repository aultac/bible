import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./config.mjs";

const DEFAULT_CONTENT_ROOT = path.join(
  REPO_ROOT,
  "apps",
  "courses",
  "content"
);
const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  "apps",
  "courses",
  "public",
  "search",
  "notes-index.json.gz"
);

export const SEARCH_INDEX_VERSION = 1;
export const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "i",
  "in",
  "is",
  "it",
  "its",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function stripMarkdown(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<https?:\/\/[^>]+>/gu, " ")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/u, "")
    .replace(/^>\s*/u, "")
    .replace(/[*_~`]+/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function splitLongBlock(value, maximumLength = 480) {
  if (value.length <= maximumLength) {
    return [value];
  }

  const blocks = [];
  let remaining = value;

  while (remaining.length > maximumLength) {
    let splitAt = remaining.lastIndexOf(" ", maximumLength);
    if (splitAt < maximumLength / 2) {
      splitAt = maximumLength;
    }
    blocks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    blocks.push(remaining);
  }

  return blocks;
}

export function markdownToSearchBlocks(markdown) {
  const blocks = [];
  let paragraph = [];

  function flushParagraph() {
    const text = stripMarkdown(paragraph.join(" "));
    paragraph = [];
    if (text) {
      blocks.push(...splitLongBlock(text));
    }
  }

  for (const rawLine of markdown.replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line || /^```/u.test(line)) {
      flushParagraph();
      continue;
    }

    if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/u.test(line)) {
      flushParagraph();
      const text = stripMarkdown(line);
      if (text) {
        blocks.push(...splitLongBlock(text));
      }
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

export function tokenizeSearchText(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 40 &&
        !SEARCH_STOP_WORDS.has(token)
    ) || [];
}

function canonicalLessonPath(lesson, fallbackBookName) {
  const bookName =
    lesson.passage?.start?.bookName || fallbackBookName || "course";
  const bookSlug = slugify(bookName);

  if (lesson.lessonKind === "intro") {
    return `/${bookSlug}/1/0`;
  }

  const start = lesson.passage?.start;
  if (!start) {
    return `/${bookSlug}`;
  }

  return `/${bookSlug}/${start.chapter}${
    start.verse === null ? "" : `/${start.verse}`
  }`;
}

function addWeightedText(postingsByTerm, documentId, blockId, value, weight) {
  const frequencies = new Map();

  for (const token of tokenizeSearchText(value)) {
    frequencies.set(token, Math.min((frequencies.get(token) || 0) + 1, 3));
  }

  for (const [term, frequency] of frequencies) {
    let postings = postingsByTerm.get(term);
    if (!postings) {
      postings = new Map();
      postingsByTerm.set(term, postings);
    }

    const postingKey = `${documentId}:${blockId}`;
    postings.set(
      postingKey,
      (postings.get(postingKey) || 0) + frequency * weight
    );
  }
}

export function buildSearchIndex(documents) {
  const compactDocuments = [];
  const postingsByTerm = new Map();

  for (const [documentId, document] of documents.entries()) {
    compactDocuments.push([
      document.path,
      document.title,
      document.sectionLabel,
      document.blocks,
    ]);

    addWeightedText(
      postingsByTerm,
      documentId,
      -1,
      [
        document.title,
        document.reference,
        document.sectionLabel,
        ...document.tags,
      ].join(" "),
      5
    );

    for (const [blockId, block] of document.blocks.entries()) {
      addWeightedText(postingsByTerm, documentId, blockId, block, 1);
    }
  }

  const terms = [...postingsByTerm.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const postings = terms.map((term) =>
    [...postingsByTerm.get(term).entries()]
      .map(([postingKey, score]) => {
        const [documentId, blockId] = postingKey
          .split(":")
          .map((value) => Number.parseInt(value, 10));
        return [documentId, blockId, score];
      })
      .sort(
        (left, right) =>
          left[0] - right[0] || left[1] - right[1] || right[2] - left[2]
      )
      .flat()
  );

  return {
    v: SEARCH_INDEX_VERSION,
    d: compactDocuments,
    t: terms,
    p: postings,
  };
}

export async function collectSearchDocuments({
  repoRoot = REPO_ROOT,
  contentRoot = DEFAULT_CONTENT_ROOT,
} = {}) {
  const sectionsIndex = JSON.parse(
    await readFile(path.join(contentRoot, "sections.json"), "utf8")
  );
  const courseOutline = JSON.parse(
    await readFile(path.join(contentRoot, "course-outline.json"), "utf8")
  );
  const outlineBySectionNumber = new Map(
    courseOutline.sections.map((section) => [section.sectionnum, section])
  );
  const documents = [];
  const canonicalPaths = new Set();
  let notesSourceByteCount = 0;

  for (const sectionEntry of [...sectionsIndex.sections].sort(
    (left, right) => left.sectionnum - right.sectionnum
  )) {
    const sectionPath = path.join(contentRoot, "sections", sectionEntry.slug);
    const sectionManifest = JSON.parse(
      await readFile(path.join(sectionPath, "section.json"), "utf8")
    );
    const outlineSection = outlineBySectionNumber.get(
      sectionManifest.sectionnum
    );
    const sectionTitle =
      outlineSection?.title ||
      sectionManifest.outlineTitle ||
      sectionManifest.title;
    const sectionLabel = `Section ${sectionManifest.sectionnum}: ${sectionTitle}`;
    const fallbackBookName = sectionManifest.passage?.start?.bookName;

    for (const lessonEntry of [...sectionManifest.lessons].sort(
      (left, right) => left.sequenceNumber - right.sequenceNumber
    )) {
      const lessonPath = path.join(
        sectionPath,
        "lessons",
        lessonEntry.slug,
        "lesson.json"
      );
      const lesson = JSON.parse(await readFile(lessonPath, "utf8"));

      if (!lesson.notes?.available || !lesson.notes.path) {
        continue;
      }

      const notesPath = path.resolve(repoRoot, lesson.notes.path);
      const notes = await readFile(notesPath, "utf8");
      const blocks = markdownToSearchBlocks(notes);

      if (blocks.length === 0) {
        continue;
      }

      notesSourceByteCount += Buffer.byteLength(notes);
      const lessonCanonicalPath = canonicalLessonPath(
        lesson,
        fallbackBookName
      );

      if (canonicalPaths.has(lessonCanonicalPath)) {
        throw new Error(
          `Duplicate lesson search path: ${lessonCanonicalPath}`
        );
      }
      canonicalPaths.add(lessonCanonicalPath);
      documents.push({
        path: lessonCanonicalPath,
        title: lesson.title,
        reference: lesson.passage?.display || lesson.title,
        sectionLabel,
        tags: [
          ...(lesson.tags || []),
          ...(lesson.topicTags || []),
          ...(lesson.peopleTags || []),
          ...(lesson.placeTags || []),
        ],
        blocks,
      });
    }
  }

  return {
    documents,
    notesSourceByteCount,
  };
}

export async function generateLessonSearchIndex({
  repoRoot = REPO_ROOT,
  contentRoot = DEFAULT_CONTENT_ROOT,
  outputPath = DEFAULT_OUTPUT_PATH,
} = {}) {
  const { documents, notesSourceByteCount } = await collectSearchDocuments({
    repoRoot,
    contentRoot,
  });
  const index = buildSearchIndex(documents);
  const serializedIndex = JSON.stringify(index);
  const compressedIndex = gzipSync(serializedIndex, {
    level: 9,
    mtime: 0,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, compressedIndex);

  return {
    schemaVersion: SEARCH_INDEX_VERSION,
    documentCount: index.d.length,
    blockCount: index.d.reduce(
      (total, document) => total + document[3].length,
      0
    ),
    termCount: index.t.length,
    notesSourceByteCount,
    rawByteCount: Buffer.byteLength(serializedIndex),
    gzipByteCount: compressedIndex.byteLength,
    outputPath,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  generateLessonSearchIndex()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || error);
      process.exitCode = 1;
    });
}
