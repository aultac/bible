export interface BibleBook {
  name: string;
  slug: string;
  aliases: string[];
}

export interface BibleReference {
  bookSlug: string;
  chapter: number | null;
  verse: number | null;
}

interface LessonPassagePoint {
  bookName: string;
  chapter: number;
  verse: number | null;
}

export interface RoutableLesson {
  sequenceNumber: number;
  lessonKind: string;
  bookSlug: string;
  passage: {
    start?: LessonPassagePoint;
    end?: LessonPassagePoint;
  } | null;
}

const BOOK_DEFINITIONS: Array<[string, string[]]> = [
  ["Genesis", ["gen", "ge"]],
  ["Exodus", ["exod", "exo", "ex"]],
  ["Leviticus", ["lev", "lv"]],
  ["Numbers", ["num", "nu"]],
  ["Deuteronomy", ["deut", "dt"]],
  ["Joshua", ["josh", "jos"]],
  ["Judges", ["judg", "jdg"]],
  ["Ruth", ["ru"]],
  ["1 Samuel", ["1 sam", "1sam", "i samuel"]],
  ["2 Samuel", ["2 sam", "2sam", "ii samuel"]],
  ["1 Kings", ["1 kgs", "1kgs", "i kings"]],
  ["2 Kings", ["2 kgs", "2kgs", "ii kings"]],
  ["1 Chronicles", ["1 chr", "1chr", "i chronicles"]],
  ["2 Chronicles", ["2 chr", "2chr", "ii chronicles"]],
  ["Ezra", ["ezr"]],
  ["Nehemiah", ["neh"]],
  ["Esther", ["esth", "est"]],
  ["Job", []],
  ["Psalms", ["psalm", "ps", "psa"]],
  ["Proverbs", ["prov", "pr"]],
  ["Ecclesiastes", ["eccl", "ecc"]],
  ["Song of Solomon", ["song of songs", "songs", "song", "sos"]],
  ["Isaiah", ["isa", "is"]],
  ["Jeremiah", ["jer"]],
  ["Lamentations", ["lam"]],
  ["Ezekiel", ["ezek", "eze"]],
  ["Daniel", ["dan", "dn"]],
  ["Hosea", ["hos"]],
  ["Joel", ["jl"]],
  ["Amos", ["am"]],
  ["Obadiah", ["obad", "ob"]],
  ["Jonah", ["jon"]],
  ["Micah", ["mic"]],
  ["Nahum", ["nah"]],
  ["Habakkuk", ["hab"]],
  ["Zephaniah", ["zeph", "zep"]],
  ["Haggai", ["hag"]],
  ["Zechariah", ["zech", "zec"]],
  ["Malachi", ["mal"]],
  ["Matthew", ["matt", "mt"]],
  ["Mark", ["mk"]],
  ["Luke", ["lk"]],
  ["John", ["jn", "jhn"]],
  ["Acts", ["ac"]],
  ["Romans", ["rom", "ro"]],
  ["1 Corinthians", ["1 cor", "1cor", "i corinthians"]],
  ["2 Corinthians", ["2 cor", "2cor", "ii corinthians"]],
  ["Galatians", ["gal"]],
  ["Ephesians", ["eph"]],
  ["Philippians", ["phil", "php"]],
  ["Colossians", ["col"]],
  ["1 Thessalonians", ["1 thess", "1thess", "i thessalonians"]],
  ["2 Thessalonians", ["2 thess", "2thess", "ii thessalonians"]],
  ["1 Timothy", ["1 tim", "1tim", "i timothy"]],
  ["2 Timothy", ["2 tim", "2tim", "ii timothy"]],
  ["Titus", ["tit"]],
  ["Philemon", ["phlm", "phm"]],
  ["Hebrews", ["heb"]],
  ["James", ["jas", "jm"]],
  ["1 Peter", ["1 pet", "1pet", "i peter"]],
  ["2 Peter", ["2 pet", "2pet", "ii peter"]],
  ["1 John", ["1 jn", "1jn", "i john"]],
  ["2 John", ["2 jn", "2jn", "ii john"]],
  ["3 John", ["3 jn", "3jn", "iii john"]],
  ["Jude", ["jud"]],
  ["Revelation", ["rev", "revelations"]],
];

function slugifyBookName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function normalizeBookAlias(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export const BIBLE_BOOKS: BibleBook[] = BOOK_DEFINITIONS.map(
  ([name, aliases]) => ({
    name,
    slug: slugifyBookName(name),
    aliases: [name, slugifyBookName(name), ...aliases],
  })
);

const BOOK_BY_SLUG = new Map(BIBLE_BOOKS.map((book) => [book.slug, book]));
const BOOK_ORDER = new Map(BIBLE_BOOKS.map((book, index) => [book.slug, index]));
const ALIAS_ENTRIES = BIBLE_BOOKS.flatMap((book) =>
  book.aliases.map((alias) => ({
    alias: normalizeBookAlias(alias),
    book,
  }))
).sort((left, right) => right.alias.length - left.alias.length);

export function getBibleBook(bookSlug: string) {
  return BOOK_BY_SLUG.get(bookSlug) || null;
}

export function parseBibleReference(value: string): BibleReference | null {
  const normalized = normalizeBookAlias(
    value
      .trim()
      .replace(/^https?:\/\/[^/]+/iu, "")
      .replace(/^\/+|\/+$/gu, "")
      .replace(/\//gu, " ")
  );

  if (!normalized) {
    return null;
  }

  for (const { alias, book } of ALIAS_ENTRIES) {
    if (normalized === alias) {
      return {
        bookSlug: book.slug,
        chapter: null,
        verse: null,
      };
    }

    if (!normalized.startsWith(`${alias} `)) {
      continue;
    }

    const referencePart = normalized.slice(alias.length).trim();
    const referenceMatch = referencePart.match(
      /^(?<chapter>\d+)(?:(?::|\s)+(?<verse>\d+))?$/u
    );

    if (!referenceMatch?.groups) {
      continue;
    }

    const chapter = Number.parseInt(referenceMatch.groups.chapter, 10);
    const verse = referenceMatch.groups.verse
      ? Number.parseInt(referenceMatch.groups.verse, 10)
      : null;

    if (chapter < 1 || verse !== null && verse < 0) {
      return null;
    }

    return {
      bookSlug: book.slug,
      chapter,
      verse,
    };
  }

  return null;
}

export function formatBibleReference(reference: BibleReference) {
  const book = getBibleBook(reference.bookSlug);

  if (!book) {
    return reference.bookSlug;
  }

  if (reference.chapter === null) {
    return book.name;
  }

  return `${book.name} ${reference.chapter}${
    reference.verse === null ? "" : `:${reference.verse}`
  }`;
}

export function bibleReferencePath(reference: BibleReference) {
  const pathParts = [reference.bookSlug];

  if (reference.chapter !== null) {
    pathParts.push(String(reference.chapter));
  }

  if (reference.verse !== null) {
    pathParts.push(String(reference.verse));
  }

  return `/${pathParts.join("/")}`;
}

function lessonPointToReference(point: LessonPassagePoint): BibleReference | null {
  const parsedBook = parseBibleReference(point.bookName);

  if (!parsedBook) {
    return null;
  }

  return {
    bookSlug: parsedBook.bookSlug,
    chapter: point.chapter,
    verse: point.verse,
  };
}

export function canonicalLessonPath(lesson: RoutableLesson) {
  if (lesson.lessonKind === "intro") {
    return `/${lesson.bookSlug}/1/0`;
  }

  const start = lesson.passage?.start;

  if (!start) {
    return `/${lesson.bookSlug}`;
  }

  return bibleReferencePath({
    bookSlug: lesson.bookSlug,
    chapter: start.chapter,
    verse: start.verse,
  });
}

function compareReferences(left: BibleReference, right: BibleReference) {
  const leftBook = BOOK_ORDER.get(left.bookSlug);
  const rightBook = BOOK_ORDER.get(right.bookSlug);

  if (leftBook === undefined || rightBook === undefined) {
    return left.bookSlug.localeCompare(right.bookSlug);
  }

  if (leftBook !== rightBook) {
    return leftBook - rightBook;
  }

  const leftChapter = left.chapter ?? 0;
  const rightChapter = right.chapter ?? 0;

  if (leftChapter !== rightChapter) {
    return leftChapter - rightChapter;
  }

  return (left.verse ?? 0) - (right.verse ?? 0);
}

function lessonContainsReference(
  lesson: RoutableLesson,
  reference: BibleReference
) {
  const startPoint = lesson.passage?.start;
  const endPoint = lesson.passage?.end;

  if (!startPoint || !endPoint) {
    return false;
  }

  const start = lessonPointToReference(startPoint);
  const end = lessonPointToReference(endPoint);

  if (!start || !end) {
    return false;
  }

  if (reference.chapter === null) {
    return lesson.bookSlug === reference.bookSlug;
  }

  if (reference.verse === null) {
    const chapterStart = {
      ...reference,
      verse: 0,
    };
    const chapterEnd = {
      ...reference,
      verse: Number.MAX_SAFE_INTEGER,
    };
    const normalizedStart = {
      ...start,
      verse: start.verse ?? 0,
    };
    const normalizedEnd = {
      ...end,
      verse: end.verse ?? Number.MAX_SAFE_INTEGER,
    };

    return (
      compareReferences(normalizedStart, chapterEnd) <= 0 &&
      compareReferences(normalizedEnd, chapterStart) >= 0
    );
  }

  const normalizedStart = {
    ...start,
    verse: start.verse ?? 0,
  };
  const normalizedEnd = {
    ...end,
    verse: end.verse ?? Number.MAX_SAFE_INTEGER,
  };

  return (
    compareReferences(normalizedStart, reference) <= 0 &&
    compareReferences(normalizedEnd, reference) >= 0
  );
}

export function resolveLessonByReference<TLesson extends RoutableLesson>(
  lessons: TLesson[],
  reference: BibleReference
): TLesson | null {
  const bookLessons = lessons
    .filter((lesson) => lesson.bookSlug === reference.bookSlug)
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber);

  if (reference.chapter === null) {
    return bookLessons[0] || null;
  }

  if (reference.verse === 0) {
    return (
      bookLessons.find(
        (lesson) =>
          lesson.lessonKind === "intro" &&
          reference.chapter === 1
      ) || null
    );
  }

  if (reference.verse !== null) {
    const exactStart = bookLessons.find((lesson) => {
      const start = lesson.passage?.start;
      return (
        start?.chapter === reference.chapter &&
        start.verse === reference.verse
      );
    });

    if (exactStart) {
      return exactStart;
    }
  }

  return (
    bookLessons.find(
      (lesson) =>
        lesson.lessonKind !== "intro" &&
        lessonContainsReference(lesson, reference)
    ) || null
  );
}
