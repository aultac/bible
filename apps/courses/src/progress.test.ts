import { describe, expect, it } from "vitest";
import {
  createEmptyProgress,
  getProgressStats,
  hasMeaningfulProgress,
  normalizeProgress,
  parseStoredProgress,
  recordLessonViewed,
  serializeProgress,
  setLessonCompleted,
} from "./progress";

const FIRST_TIMESTAMP = "2026-07-30T12:00:00.000Z";
const SECOND_TIMESTAMP = "2026-07-30T13:00:00.000Z";

describe("course progress", () => {
  it("normalizes versioned storage and discards malformed fields", () => {
    expect(
      normalizeProgress({
        schemaVersion: 1,
        lastViewed: {
          lessonId: " lesson-2 ",
          viewedAt: FIRST_TIMESTAMP,
        },
        completedLessons: {
          "lesson-1": FIRST_TIMESTAMP,
          "": SECOND_TIMESTAMP,
          "lesson-bad-date": "not-a-date",
        },
        updatedAt: SECOND_TIMESTAMP,
      })
    ).toEqual({
      schemaVersion: 1,
      lastViewed: {
        lessonId: "lesson-2",
        viewedAt: FIRST_TIMESTAMP,
      },
      completedLessons: {
        "lesson-1": FIRST_TIMESTAMP,
      },
      updatedAt: SECOND_TIMESTAMP,
    });

    expect(parseStoredProgress("{broken")).toEqual(createEmptyProgress());
    expect(normalizeProgress({ schemaVersion: 2 })).toEqual(
      createEmptyProgress()
    );
  });

  it("records last viewed and toggles completion immutably", () => {
    const empty = createEmptyProgress();
    const viewed = recordLessonViewed(empty, "lesson-1", FIRST_TIMESTAMP);
    const completed = setLessonCompleted(
      viewed,
      "lesson-1",
      true,
      SECOND_TIMESTAMP
    );
    const reopened = setLessonCompleted(
      completed,
      "lesson-1",
      false,
      SECOND_TIMESTAMP
    );

    expect(empty).toEqual(createEmptyProgress());
    expect(viewed.lastViewed).toEqual({
      lessonId: "lesson-1",
      viewedAt: FIRST_TIMESTAMP,
    });
    expect(completed.completedLessons).toEqual({
      "lesson-1": SECOND_TIMESTAMP,
    });
    expect(reopened.completedLessons).toEqual({});
  });

  it("round-trips the localStorage representation", () => {
    const progress = setLessonCompleted(
      recordLessonViewed(
        createEmptyProgress(),
        "lesson-2",
        FIRST_TIMESTAMP
      ),
      "lesson-1",
      true,
      SECOND_TIMESTAMP
    );

    expect(parseStoredProgress(serializeProgress(progress))).toEqual(progress);
  });

  it("personalizes only records with viewed or completed lessons", () => {
    const empty = createEmptyProgress();
    const viewed = recordLessonViewed(empty, "lesson-1", FIRST_TIMESTAMP);
    const completed = setLessonCompleted(
      empty,
      "lesson-1",
      true,
      FIRST_TIMESTAMP
    );

    expect(hasMeaningfulProgress(empty)).toBe(false);
    expect(hasMeaningfulProgress(viewed)).toBe(true);
    expect(hasMeaningfulProgress(completed)).toBe(true);
  });

  it("calculates scoped progress from unique available lesson IDs", () => {
    const lessons = [{ id: "lesson-1" }, { id: "lesson-2" }, { id: "lesson-2" }];
    const completedLessons = {
      "lesson-1": FIRST_TIMESTAMP,
      "unknown-lesson": SECOND_TIMESTAMP,
    };

    expect(getProgressStats(lessons, completedLessons)).toEqual({
      completed: 1,
      total: 2,
      percent: 50,
      allComplete: false,
    });
    expect(
      getProgressStats(lessons, {
        ...completedLessons,
        "lesson-2": SECOND_TIMESTAMP,
      })
    ).toMatchObject({
      completed: 2,
      percent: 100,
      allComplete: true,
    });
  });
});
