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

  it("orders the Promo before the latest non-Promo video for the billboard", () => {
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
    const noVideo = {
      id: "no-video",
      lessonKind: "passage" as const,
      youtube: null,
    };

    expect(
      selectBillboardLessons([promo, older, latest, noVideo])
    ).toEqual([promo, latest]);
    expect(selectBillboardLessons([older, latest])).toEqual([latest]);
    expect(selectBillboardLessons([promo])).toEqual([promo]);
    expect(selectBillboardLessons([noVideo])).toEqual([]);
  });
});
