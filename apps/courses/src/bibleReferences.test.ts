import { describe, expect, it } from "vitest";
import {
  bibleReferencePath,
  canonicalLessonPath,
  parseBibleReference,
  resolveLessonByReference,
  type RoutableLesson,
} from "./bibleReferences";

function lesson(
  sequenceNumber: number,
  startChapter: number,
  startVerse: number | null,
  endChapter: number,
  endVerse: number | null,
  lessonKind = "passage"
): RoutableLesson {
  return {
    sequenceNumber,
    lessonKind,
    bookSlug: "genesis",
    passage: {
      start: {
        bookName: "Genesis",
        chapter: startChapter,
        verse: startVerse,
      },
      end: {
        bookName: "Genesis",
        chapter: endChapter,
        verse: endVerse,
      },
    },
  };
}

describe("Bible reference parsing", () => {
  it.each([
    ["Genesis", { bookSlug: "genesis", chapter: null, verse: null }],
    ["gen/1/24", { bookSlug: "genesis", chapter: 1, verse: 24 }],
    ["Genesis 1:24", { bookSlug: "genesis", chapter: 1, verse: 24 }],
    ["1 Sam 3:4", { bookSlug: "1-samuel", chapter: 3, verse: 4 }],
    ["Song of Songs 2", { bookSlug: "song-of-solomon", chapter: 2, verse: null }],
  ])("parses %s", (input, expected) => {
    expect(parseBibleReference(input)).toEqual(expected);
  });

  it.each(["", "Genesis zero", "Genesis 0", "Unknown 1", "Genesis 1:"])(
    "rejects %s",
    (input) => {
      expect(parseBibleReference(input)).toBeNull();
    }
  );

  it("formats clean slash paths", () => {
    expect(
      bibleReferencePath({
        bookSlug: "genesis",
        chapter: 12,
        verse: 7,
      })
    ).toBe("/genesis/12/7");
  });
});

describe("lesson canonical paths and resolution", () => {
  it("uses the intro special case and passage start paths", () => {
    expect(canonicalLessonPath(lesson(1, 1, null, 1, null, "intro"))).toBe(
      "/genesis/1/0"
    );
    expect(canonicalLessonPath(lesson(2, 1, null, 2, null))).toBe(
      "/genesis/1"
    );
    expect(canonicalLessonPath(lesson(3, 37, 29, 39, null))).toBe(
      "/genesis/37/29"
    );
  });

  it("prefers an exact lesson start at an overlapping boundary", () => {
    const earlier = lesson(17, 36, null, 37, 29);
    const exact = lesson(18, 37, 29, 39, null);

    expect(
      resolveLessonByReference([earlier, exact], {
        bookSlug: "genesis",
        chapter: 37,
        verse: 29,
      })
    ).toBe(exact);
  });

  it("falls back to the earliest lesson when ranges overlap", () => {
    const earlier = lesson(4, 3, null, 4, null);
    const later = lesson(5, 3, null, 5, null);

    expect(
      resolveLessonByReference([later, earlier], {
        bookSlug: "genesis",
        chapter: 3,
        verse: 5,
      })
    ).toBe(earlier);
  });

  it("resolves book, chapter, and intro references consistently", () => {
    const intro = lesson(1, 1, null, 1, null, "intro");
    const firstPassage = lesson(2, 1, null, 2, null);
    const laterPassage = lesson(3, 3, null, 4, null);
    const lessons = [intro, firstPassage, laterPassage];

    expect(
      resolveLessonByReference(lessons, {
        bookSlug: "genesis",
        chapter: null,
        verse: null,
      })
    ).toBe(intro);
    expect(
      resolveLessonByReference(lessons, {
        bookSlug: "genesis",
        chapter: 2,
        verse: null,
      })
    ).toBe(firstPassage);
    expect(
      resolveLessonByReference(lessons, {
        bookSlug: "genesis",
        chapter: 1,
        verse: 0,
      })
    ).toBe(intro);
  });
});
