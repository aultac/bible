import { describe, expect, it } from "vitest";
import {
  getToolsForLesson,
  transformLessonNotes,
  type ToolCatalogEntry,
} from "./tools";

const catalog: readonly ToolCatalogEntry[] = [
  {
    path: "/ages/",
    title: "Biblical Lifespans Visualization",
    relatedLessonIds: ["lesson-one", "lesson-two"],
  },
  {
    path: "/ziggurats/",
    title: "Ziggurat-Like Structures Worldwide",
    relatedLessonIds: ["lesson-two"],
  },
];

describe("lesson tool presentation", () => {
  it("looks up many-to-many lesson relationships", () => {
    expect(getToolsForLesson("lesson-two", catalog).map((tool) => tool.path)).toEqual([
      "/ages/",
      "/ziggurats/",
    ]);
    expect(getToolsForLesson("unrelated", catalog)).toEqual([]);
  });

  it("renders tool directives as titled production links and hides resource directives", () => {
    expect(
      transformLessonNotes(
        [
          "# Notes",
          "- **TOOL_LINK:** /ages/",
          "RESOURCE_LINK: chart.png: https://example.test/chart",
          "Visible context.",
        ].join("\n"),
        catalog,
        "https://knowyourbible.study"
      )
    ).toBe(
      [
        "# Notes",
        "Biblical Lifespans Visualization: [https://knowyourbible.study/ages/](https://knowyourbible.study/ages/)",
        "Visible context.",
      ].join("\n")
    );
  });

  it("never exposes unresolved directive placeholders", () => {
    expect(
      transformLessonNotes(
        "Before\nTOOL_LINK: /missing/\nAfter",
        catalog,
        "https://knowyourbible.study"
      )
    ).toBe("Before\nAfter");
  });
});
