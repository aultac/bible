import { describe, expect, it } from "vitest";
import { parseBibleReference } from "./bibleReferences";
import {
  courseLibrary,
  formatLessonSequenceBadge,
  formatLessonSequenceLabel,
  selectBillboardLessons,
  selectFeaturedLesson,
} from "./courseData";

describe("canonical course outline hydration", () => {
  it("keeps all eleven authored sections, including future sections", () => {
    expect(courseLibrary.courseSections).toHaveLength(11);
    expect(courseLibrary.courseSections[0]).toMatchObject({
      sectionnum: 1,
      title: "The Beginning",
      periodLabel: "?–c. 2000 BC",
      rangeLabel: "Genesis 1–11",
      descriptors: ["Creation", "Fall", "Flood", "Babel"],
      available: true,
    });
    expect(courseLibrary.courseSections[10]).toMatchObject({
      sectionnum: 11,
      title: "The End",
      rangeLabel: "Revelation",
      available: false,
      lessonsDetailed: [],
    });
  });

  it("assigns a unique canonical URL to every lesson", () => {
    const canonicalPaths = courseLibrary.allLessons.map(
      (lesson) => lesson.canonicalPath
    );

    expect(new Set(canonicalPaths).size).toBe(canonicalPaths.length);
    expect(canonicalPaths).toContain("/genesis/1/0");
    expect(canonicalPaths).toContain("/genesis/37/29");
  });

  it("lists the Promo as Genesis lesson 00 and tracks its completion", () => {
    const genesisLessons = courseLibrary.getBook("genesis")?.lessons || [];

    expect(genesisLessons.slice(0, 2)).toMatchObject([
      {
        id: "000-promo",
        lessonKind: "promo",
        sequenceNumber: 0,
      },
      {
        id: "001-intro",
        lessonKind: "intro",
        sequenceNumber: 1,
      },
    ]);
    expect(formatLessonSequenceBadge(genesisLessons[0])).toBe("00");
    expect(
      courseLibrary.trackableLessons.some(
        (lesson) => lesson.id === "000-promo"
      )
    ).toBe(true);
  });

  it("uses exact-start precedence in the current overlapping lesson data", () => {
    const reference = parseBibleReference("Genesis 37:29");
    expect(reference).not.toBeNull();

    const lesson = reference
      ? courseLibrary.resolveReference(reference)
      : null;

    expect(lesson?.slug).toBe("018-genesis37-29-39");
    expect(lesson?.canonicalPath).toBe("/genesis/37/29");
  });

  it("uses the earlier covering lesson away from an exact boundary", () => {
    const reference = parseBibleReference("Genesis 37:28");
    const lesson = reference
      ? courseLibrary.resolveReference(reference)
      : null;

    expect(lesson?.slug).toBe("017-genesis36-37-29");
  });

  it("preserves first, middle, and last authored lesson adjacency", () => {
    const lessons = courseLibrary.allLessons;
    const first = lessons[0];
    const middleIndex = Math.floor(lessons.length / 2);
    const middle = lessons[middleIndex];
    const last = lessons[lessons.length - 1];

    expect(
      courseLibrary.getAdjacentLessons(first.sectionSlug, first.slug)
    ).toEqual({
      previous: null,
      next: lessons[1],
    });
    expect(
      courseLibrary.getAdjacentLessons(middle.sectionSlug, middle.slug)
    ).toEqual({
      previous: lessons[middleIndex - 1],
      next: lessons[middleIndex + 1],
    });
    expect(
      courseLibrary.getAdjacentLessons(last.sectionSlug, last.slug)
    ).toEqual({
      previous: lessons[lessons.length - 2],
      next: null,
    });
  });

  it("prefers a video-backed Promo for the featured slot and labels it semantically", () => {
    const latest = {
      lessonKind: "passage" as const,
      sequenceNumber: 34,
      youtube: { videoId: "latest" },
    };
    const promo = {
      lessonKind: "promo" as const,
      sequenceNumber: 0,
      youtube: { videoId: "promo" },
    };

    expect(selectFeaturedLesson([latest, promo], latest)).toBe(promo);
    expect(selectFeaturedLesson([latest], latest)).toBe(latest);
    expect(formatLessonSequenceLabel(promo)).toBe("Promo");
    expect(formatLessonSequenceBadge(promo)).toBe("00");
    expect(formatLessonSequenceLabel(latest)).toBe("Week 34");
    expect(formatLessonSequenceBadge(latest)).toBe("34");
  });

  it("leads with Promo and latest video when no lesson is completed", () => {
    const promo = {
      id: "promo",
      lessonKind: "promo" as const,
      youtube: { videoId: "promo" },
    };
    const older = {
      id: "older",
      lessonKind: "passage" as const,
      youtube: { videoId: "older" },
    };
    const latest = {
      id: "latest",
      lessonKind: "passage" as const,
      youtube: { videoId: "latest" },
    };
    const expected = [
      { lesson: promo, role: "promo" },
      { lesson: latest, role: "latest" },
    ];

    expect(
      selectBillboardLessons([promo, older, latest], {
        completedLessonIds: new Set(),
      })
    ).toEqual(expected);
    expect(
      selectBillboardLessons([promo, older, latest], {
        completedLessonIds: new Set(["unavailable-lesson"]),
      })
    ).toEqual(expected);
  });

  it("leads returning learners with their earliest incomplete lesson", () => {
    const promo = {
      id: "promo",
      lessonKind: "promo" as const,
      youtube: { videoId: "promo" },
    };
    const first = {
      id: "first",
      lessonKind: "passage" as const,
      youtube: null,
    };
    const second = {
      id: "second",
      lessonKind: "passage" as const,
      youtube: null,
    };
    const latest = {
      id: "latest",
      lessonKind: "passage" as const,
      youtube: { videoId: "latest" },
    };

    expect(
      selectBillboardLessons([promo, first, second, latest], {
        completedLessonIds: new Set(["promo", "first"]),
      })
    ).toEqual([
      { lesson: second, role: "next" },
      { lesson: latest, role: "latest" },
      { lesson: promo, role: "promo" },
    ]);
  });

  it("advances from a completed Promo to the Intro lesson", () => {
    const promo = {
      id: "promo",
      lessonKind: "promo" as const,
      youtube: { videoId: "promo" },
    };
    const intro = {
      id: "intro",
      lessonKind: "intro" as const,
      youtube: { videoId: "intro" },
    };
    const latest = {
      id: "latest",
      lessonKind: "passage" as const,
      youtube: { videoId: "latest" },
    };

    expect(
      selectBillboardLessons([promo, intro, latest], {
        completedLessonIds: new Set(["promo"]),
      })
    ).toEqual([
      { lesson: intro, role: "next" },
      { lesson: latest, role: "latest" },
      { lesson: promo, role: "promo" },
    ]);
  });

  it("deduplicates the latest next lesson and falls back after full completion", () => {
    const promo = {
      id: "promo",
      lessonKind: "promo" as const,
      youtube: { videoId: "promo" },
    };
    const first = {
      id: "first",
      lessonKind: "passage" as const,
      youtube: { videoId: "first" },
    };
    const latest = {
      id: "latest",
      lessonKind: "passage" as const,
      youtube: { videoId: "latest" },
    };
    const lessons = [promo, first, latest];

    expect(
      selectBillboardLessons(lessons, {
        completedLessonIds: new Set(["promo", "first"]),
      })
    ).toEqual([
      { lesson: latest, role: "latest" },
      { lesson: promo, role: "promo" },
    ]);
    expect(
      selectBillboardLessons(lessons, {
        completedLessonIds: new Set(["promo", "first", "latest"]),
      })
    ).toEqual([
      { lesson: latest, role: "latest" },
      { lesson: promo, role: "promo" },
    ]);
    expect(
      selectBillboardLessons(
        [
          {
            id: "completed",
            lessonKind: "passage" as const,
            youtube: null,
          },
          {
            id: "reading-only",
            lessonKind: "passage" as const,
            youtube: null,
          },
        ],
        { completedLessonIds: new Set(["completed"]) }
      )
    ).toMatchObject([
      {
        lesson: { id: "reading-only" },
        role: "next",
      },
    ]);
    expect(
      selectBillboardLessons([
        {
          id: "reading-only",
          lessonKind: "passage" as const,
          youtube: null,
        },
      ])
    ).toEqual([]);
  });
});
