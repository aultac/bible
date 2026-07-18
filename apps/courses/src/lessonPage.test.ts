import { describe, expect, it } from "vitest";
import { getLessonPageContent } from "./App";
import { courseLibrary, type HydratedLesson } from "./courseData";

const hiddenState = {
  status: "idle" as const,
  markdown: null,
};

function lesson(overrides: Partial<HydratedLesson> = {}) {
  const source = courseLibrary.allLessons[0];
  if (!source) {
    throw new Error("Course fixture requires at least one lesson.");
  }
  return {
    ...source,
    youtube: null,
    resolvedMap: null,
    passage: null,
    description: "",
    ...overrides,
  };
}

describe("content-driven lesson pages", () => {
  it("hides every optional region when its content is absent", () => {
    expect(
      getLessonPageContent({
        lesson: lesson(),
        notesState: hiddenState,
        notesSummaryState: hiddenState,
        storylineState: hiddenState,
      })
    ).toEqual({
      storylineTitle: null,
      storylineBody: null,
      notesSummary: null,
      lessonNotes: null,
      hasVideo: false,
      hasSummaries: false,
      hasMap: false,
      hasActions: false,
    });
  });

  it("shows a notes summary by itself at full-grid eligibility", () => {
    const content = getLessonPageContent({
      lesson: lesson(),
      notesState: hiddenState,
      notesSummaryState: {
        status: "loaded",
        markdown: "A concise notes overview.",
      },
      storylineState: hiddenState,
    });

    expect(content.notesSummary).toBe("A concise notes overview.");
    expect(content.storylineBody).toBeNull();
    expect(content.hasSummaries).toBe(true);
  });

  it("shows both distinct summaries without title metadata in the storyline body", () => {
    const content = getLessonPageContent({
      lesson: lesson(),
      notesState: hiddenState,
      notesSummaryState: {
        status: "loaded",
        markdown: "Notes overview",
      },
      storylineState: {
        status: "loaded",
        markdown:
          "**Title:** The Promised Son\n**Summary:** Metadata\n\nThe class traced the promise.",
      },
    });

    expect(content.storylineTitle).toBe("The Promised Son");
    expect(content.storylineBody).toBe("The class traced the promise.");
    expect(content.notesSummary).toBe("Notes overview");
    expect(content.hasSummaries).toBe(true);
  });

  it("hides loading, empty, and failed Markdown instead of exposing placeholders", () => {
    for (const status of ["loading", "error"] as const) {
      const content = getLessonPageContent({
        lesson: lesson(),
        notesState: { status, markdown: null },
        notesSummaryState: { status, markdown: null },
        storylineState: { status, markdown: null },
      });
      expect(content.lessonNotes).toBeNull();
      expect(content.hasSummaries).toBe(false);
    }
  });

  it("tracks full-width notes/maps and available lesson actions independently", () => {
    const source = courseLibrary.allLessons.find(
      (candidate) => candidate.youtube && candidate.resolvedMap
    );
    if (!source) {
      throw new Error("Course fixture requires a mapped video lesson.");
    }

    const content = getLessonPageContent({
      lesson: source,
      notesState: {
        status: "loaded",
        markdown: "# Lesson notes",
      },
      notesSummaryState: hiddenState,
      storylineState: hiddenState,
    });

    expect(content.hasVideo).toBe(true);
    expect(content.hasMap).toBe(true);
    expect(content.hasActions).toBe(true);
    expect(content.lessonNotes).toBe("# Lesson notes");
  });
});
