import { describe, expect, it } from "vitest";
import {
  FULTON_BAPTIST_URL,
  YOUTUBE_AD_DISCLAIMER,
  getLessonPageContent,
} from "./App";
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
    videoSummary: null,
    ...overrides,
  };
}

describe("content-driven lesson pages", () => {
  it("uses the canonical Fulton Baptist website for church links", () => {
    expect(FULTON_BAPTIST_URL).toBe("https://fultonbaptist.org");
  });

  it("disclaims YouTube's personalized ads beneath lesson videos", () => {
    expect(YOUTUBE_AD_DISCLAIMER).toContain(
      "not responsible for or able to control these ads"
    );
    expect(YOUTUBE_AD_DISCLAIMER).toContain(
      "inappropriate for the context of this course"
    );
  });

  it("hides every optional region when its content is absent", () => {
    expect(
      getLessonPageContent({
        lesson: lesson(),
        notesState: hiddenState,
        storylineState: hiddenState,
      })
    ).toEqual({
      storylineTitle: null,
      storylineBody: null,
      lessonNotes: null,
      hasVideo: false,
      hasSummaries: false,
      hasMap: false,
      hasActions: false,
    });
  });

  it("uses the Word title as the video summary without inventing a body", () => {
    const content = getLessonPageContent({
      lesson: lesson({ videoSummary: "A concise video description." }),
      notesState: hiddenState,
      storylineState: hiddenState,
    });

    expect(content.storylineTitle).toBe("A concise video description.");
    expect(content.storylineBody).toBeNull();
    expect(content.hasSummaries).toBe(false);
  });

  it("shows the storyline body without repeating its title metadata", () => {
    const content = getLessonPageContent({
      lesson: lesson({ videoSummary: "The Promised Son" }),
      notesState: hiddenState,
      storylineState: {
        status: "loaded",
        markdown:
          "**Title:** Different converted title\n**Summary:** Metadata\n\nThe class traced the promise.",
      },
    });

    expect(content.storylineTitle).toBe("The Promised Son");
    expect(content.storylineBody).toBe("The class traced the promise.");
    expect(content.hasSummaries).toBe(true);
  });

  it("hides loading, empty, and failed Markdown instead of exposing placeholders", () => {
    for (const status of ["loading", "error"] as const) {
      const content = getLessonPageContent({
        lesson: lesson(),
        notesState: { status, markdown: null },
        storylineState: { status, markdown: null },
      });
      expect(content.lessonNotes).toBeNull();
      expect(content.hasSummaries).toBe(false);
    }
  });

  it("tracks full-width notes/maps and available lesson actions independently", () => {
    const content = getLessonPageContent({
      lesson: lesson({
        youtube: {
          videoId: "fixture-video",
          title: "Fixture video",
          url: "https://www.youtube.com/watch?v=fixture-video",
          playlistId: "fixture-playlist",
          position: 1,
          videoKind: "lesson",
          weekNumber: 1,
          lessonSequenceNumber: 1,
          durationText: "42:00",
          thumbnailUrl: "https://example.test/fixture.jpg",
        },
        resolvedMap: {
          sourcePath: "fixture/map.kml",
          sourceFormat: "kml",
          sourcePublicUrl: "/fixture/map.kml",
          geoJsonPath: "fixture/map.geojson",
          geoJsonPublicUrl: "/fixture/map.geojson",
          available: true,
          featureCount: 1,
          geometryTypes: ["Point"],
          sourceHref: "/fixture/map.kml",
          geoJsonHref: "/fixture/map.geojson",
        },
      }),
      notesState: {
        status: "loaded",
        markdown: "# Lesson notes",
      },
      storylineState: hiddenState,
    });

    expect(content.hasVideo).toBe(true);
    expect(content.hasMap).toBe(true);
    expect(content.hasActions).toBe(true);
    expect(content.lessonNotes).toBe("# Lesson notes");
  });
});
