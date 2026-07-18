import { readdir } from "node:fs/promises";
import path from "node:path";
const BUCKET_DIRECTORY_PATTERN = /^\d{2}-(?:Section|Bucket)-/u;
const LESSON_DIRECTORY_PATTERN = /^\d{3}[-_]/u;
const BUCKET_NAME_PATTERN = /^(?<sectionnum>\d{2})-(?<directoryKind>Section|Bucket)-(?<label>.+)$/u;
const LESSON_NAME_PATTERN = /^(?<sequence>\d{3})(?<separator>[-_])(?<label>.+)$/u;
const START_SEGMENT_PATTERN = /^(?<book>[1-3]?[A-Za-z]+)(?<chapter>\d+)(?:_(?<verse>\d+))?$/u;
const END_SEGMENT_PATTERN = /^(?:(?<book>[1-3]?[A-Za-z]+))?(?<chapter>\d+)(?:_(?<verse>\d+))?$/u;

export function isSectionDirectory(name) {
  return BUCKET_DIRECTORY_PATTERN.test(name);
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function lessonSequenceFromDirectoryName(name) {
  const match = name.match(LESSON_NAME_PATTERN);
  return match?.groups?.sequence || null;
}

export function isLessonDirectory(name) {
  return LESSON_DIRECTORY_PATTERN.test(name);
}

export function canonicalLessonDirectoryNameFromNoteTitle(title) {
  return title.trim().replace(/:/gu, "_");
}

export function slugifyPathSegment(value) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
}

export function humanizeBookId(bookId) {
  return bookId
    .replace(/^([1-3])([A-Za-z])/u, "$1 $2")
    .replace(/([a-z])([A-Z])/gu, "$1 $2");
}

export function humanizeSourceLabel(label) {
  return label
    .replace(/_/gu, ":")
    .replace(/^([1-3])([A-Za-z])/u, "$1 $2")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/([A-Za-z])(\d)/gu, "$1 $2");
}

function parsePassageSegment(segment, { allowOmittedBook }) {
  const match = segment.match(
    allowOmittedBook ? END_SEGMENT_PATTERN : START_SEGMENT_PATTERN
  );

  if (!match?.groups) {
    return null;
  }

  return {
    bookId: match.groups.book || null,
    chapter: Number.parseInt(match.groups.chapter, 10),
    verse: match.groups.verse
      ? Number.parseInt(match.groups.verse, 10)
      : null,
    raw: segment,
  };
}

export function formatReference(reference, { includeBook = true } = {}) {
  const prefix = includeBook ? `${reference.bookName} ` : "";
  const verseSuffix = reference.verse === null ? "" : `:${reference.verse}`;
  return `${prefix}${reference.chapter}${verseSuffix}`;
}

export function formatPassageDisplay(passage) {
  if (passage.start.bookId === passage.end.bookId) {
    return `${formatReference(passage.start)}-${formatReference(passage.end, {
      includeBook: false,
    })}`;
  }

  return `${formatReference(passage.start)}-${formatReference(passage.end)}`;
}

export function buildEsvUrlForPassage(passage) {
  const encodedPassage = encodeURI(formatPassageDisplay(passage).replace(/ /gu, "+"));
  return `https://www.esv.org/${encodedPassage}/`;
}

export function parsePassageLabel(label) {
  const separatorIndex = label.indexOf("-");
  if (separatorIndex === -1) {
    return null;
  }

  const startSegment = label.slice(0, separatorIndex);
  const endSegment = label.slice(separatorIndex + 1);
  const start = parsePassageSegment(startSegment, { allowOmittedBook: false });
  const parsedEnd = parsePassageSegment(endSegment, { allowOmittedBook: true });

  if (!start || !parsedEnd) {
    return null;
  }

  const endBookId = parsedEnd.bookId || start.bookId;
  const passage = {
    rawLabel: label,
    start: {
      ...start,
      bookName: humanizeBookId(start.bookId),
    },
    end: {
      ...parsedEnd,
      bookId: endBookId,
      bookName: humanizeBookId(endBookId),
    },
  };

  return {
    ...passage,
    display: formatPassageDisplay(passage),
    spansMultipleBooks: passage.start.bookId !== passage.end.bookId,
  };
}

export function parseSectionDirectoryName(name) {
  const match = name.match(BUCKET_NAME_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const passage = parsePassageLabel(match.groups.label);

  return {
    sectionnum: Number.parseInt(match.groups.sectionnum, 10),
    directoryKind: match.groups.directoryKind,
    folderName: name,
    sourceLabel: match.groups.label,
    slug: slugifyPathSegment(
      `${match.groups.sectionnum}-Section-${match.groups.label}`
    ),
    passage,
    displayTitle: passage?.display || humanizeSourceLabel(match.groups.label),
  };
}

export function parseLessonDirectoryName(name) {
  const match = name.match(LESSON_NAME_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const lessonKind =
    match.groups.label.toLowerCase() === "intro" ? "intro" : "passage";
  const passage =
    lessonKind === "intro" ? null : parsePassageLabel(match.groups.label);

  return {
    sequenceNumber: Number.parseInt(match.groups.sequence, 10),
    separator: match.groups.separator,
    folderName: name,
    sourceLabel: match.groups.label,
    slug: slugifyPathSegment(name),
    lessonKind,
    passage,
    displayTitle:
      lessonKind === "intro"
        ? "Intro"
        : passage?.display || humanizeSourceLabel(match.groups.label),
  };
}

export async function buildCanonicalLessonIndex(canonicalBase) {
  const entries = await readdir(canonicalBase, { withFileTypes: true });
  const sectionNames = entries
    .filter((entry) => entry.isDirectory() && isSectionDirectory(entry.name))
    .map((entry) => entry.name);

  const lessonIndex = new Map();

  for (const sectionName of sectionNames) {
    const sectionPath = path.join(canonicalBase, sectionName);
    const sectionEntries = await readdir(sectionPath, { withFileTypes: true });

    for (const entry of sectionEntries) {
      if (!entry.isDirectory() || !isLessonDirectory(entry.name)) {
        continue;
      }

      lessonIndex.set(entry.name, path.join(sectionPath, entry.name));
    }
  }

  return lessonIndex;
}

export function resolveCanonicalLessonDirectory(
  lessonIndex,
  noteTitle,
  canonicalBase
) {
  const expectedLessonDirectoryName =
    canonicalLessonDirectoryNameFromNoteTitle(noteTitle);
  const exactPath = lessonIndex.get(expectedLessonDirectoryName);

  if (exactPath) {
    const relativeLessonDirectory = toPosixPath(
      path.relative(canonicalBase, exactPath)
    );
    return {
      matched: true,
      matchedBy: "exact",
      canonicalLessonDirectoryPath: exactPath,
      relativeLessonDirectory,
      expectedLessonDirectoryName,
      actualLessonDirectoryName: path.basename(exactPath),
      expectedRelativeLessonDirectory: relativeLessonDirectory,
      expectedLessonDirectoryPath: exactPath,
      sequenceCandidates: [],
    };
  }

  const expectedSequence = lessonSequenceFromDirectoryName(
    expectedLessonDirectoryName
  );
  const sequenceCandidates = expectedSequence
    ? [...lessonIndex.entries()]
        .filter(
          ([lessonDirectoryName]) =>
            lessonSequenceFromDirectoryName(lessonDirectoryName) ===
            expectedSequence
        )
        .map(([lessonDirectoryName, lessonDirectoryPath]) => ({
          lessonDirectoryName,
          lessonDirectoryPath,
          relativeLessonDirectory: toPosixPath(
            path.relative(canonicalBase, lessonDirectoryPath)
          ),
        }))
    : [];

  if (sequenceCandidates.length === 1) {
    const [candidate] = sequenceCandidates;
    const expectedRelativeLessonDirectory = toPosixPath(
      path.join(
        path.dirname(candidate.relativeLessonDirectory),
        expectedLessonDirectoryName
      )
    );

    return {
      matched: true,
      matchedBy: "sequence",
      canonicalLessonDirectoryPath: candidate.lessonDirectoryPath,
      relativeLessonDirectory: candidate.relativeLessonDirectory,
      expectedLessonDirectoryName,
      actualLessonDirectoryName: candidate.lessonDirectoryName,
      expectedRelativeLessonDirectory,
      expectedLessonDirectoryPath: path.join(
        canonicalBase,
        expectedRelativeLessonDirectory
      ),
      sequenceCandidates,
    };
  }

  const expectedRelativeLessonDirectory =
    sequenceCandidates.length > 1
      ? toPosixPath(
          path.join(
            path.dirname(sequenceCandidates[0].relativeLessonDirectory),
            expectedLessonDirectoryName
          )
        )
      : expectedLessonDirectoryName;

  return {
    matched: false,
    matchedBy: null,
    canonicalLessonDirectoryPath: null,
    relativeLessonDirectory: null,
    expectedLessonDirectoryName,
    actualLessonDirectoryName: null,
    expectedRelativeLessonDirectory,
    expectedLessonDirectoryPath: path.join(
      canonicalBase,
      expectedRelativeLessonDirectory
    ),
    sequenceCandidates,
  };
}
