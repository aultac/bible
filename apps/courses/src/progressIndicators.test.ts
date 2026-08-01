import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { courseLibrary } from "./courseData";
import { ProgressMenu } from "./ProgressMenu";
import { ProgressProvider } from "./ProgressProvider";
import { ProgressSummary } from "./ProgressSummary";
import {
  createEmptyProgress,
  serializeProgress,
  type CourseProgress,
} from "./progress";

const COMPLETED_AT = "2026-08-01T12:00:00.000Z";

function progressWithCompletedLessons(lessonIds: string[]): CourseProgress {
  return {
    ...createEmptyProgress(),
    completedLessons: Object.fromEntries(
      lessonIds.map((lessonId) => [lessonId, COMPLETED_AT])
    ),
    updatedAt: COMPLETED_AT,
  };
}

function renderProgressUi(progress: CourseProgress, children: ReactNode) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => serializeProgress(progress),
    },
  });

  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: "/" },
      createElement(ProgressProvider, null, children)
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("progress indicators", () => {
  it("celebrates a fully completed available course", () => {
    const progress = progressWithCompletedLessons(
      courseLibrary.trackableLessons.map((lesson) => lesson.id)
    );
    const html = renderProgressUi(
      progress,
      createElement(
        "div",
        null,
        createElement(ProgressMenu),
        createElement(ProgressSummary, {
          scopeLabel: null,
          scopeLessons: null,
        })
      )
    );

    expect(html).toContain(
      'aria-label="Open progress and backup. All caught up."'
    );
    expect(html).toContain(
      'class="progress-menu-badge progress-menu-badge-complete"'
    );
    expect(html).toContain("progress-dialog-summary-complete");
    expect(html).toContain("course-progress-complete");
    expect(html).toContain("<h3>All caught up</h3>");
    expect(html.match(/You&#x27;re all caught up!/gu)).toHaveLength(2);
  });

  it("keeps the remaining count and neutral progress styling while incomplete", () => {
    const completedLesson = courseLibrary.trackableLessons[0];
    const progress = progressWithCompletedLessons(
      completedLesson ? [completedLesson.id] : []
    );
    const html = renderProgressUi(
      progress,
      createElement(
        "div",
        null,
        createElement(ProgressMenu),
        createElement(ProgressSummary, {
          scopeLabel: null,
          scopeLessons: null,
        })
      )
    );

    expect(html).toContain(
      `<span class="progress-menu-badge">${
        courseLibrary.trackableLessons.length - 1
      }</span>`
    );
    expect(html).not.toContain("progress-menu-badge-complete");
    expect(html).not.toContain("progress-dialog-summary-complete");
    expect(html).not.toContain("course-progress-complete");
    expect(html).toContain("<h3>Keep going</h3>");
  });
});
