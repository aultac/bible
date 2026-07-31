import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExportedLessonRow,
  buildExportedLessonTitle,
  exportLessonTitles,
  serializeLessonTitleCsv,
} from "./lesson-title-export.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("lesson title export", () => {
  it("constructs the new YouTube title from the lesson-page heading", () => {
    expect(
      buildExportedLessonTitle({
        sequenceNumber: 33,
        title: "Exodus 8-9:12",
      })
    ).toBe("Know Your Bible - Week 33 - Exodus 8-9:12");
  });

  it("exports page descriptions and safely quotes CSV values", () => {
    const csv = serializeLessonTitleCsv(
      [
        {
          sequenceNumber: 2,
          lessonKind: "passage",
          title: "Genesis 1-2",
          startVerse: "Genesis 1",
          endVerse: "Genesis 2",
          videoSummary: 'Creation, humanity, and "rest"',
          youtube: {
            url: "https://www.youtube.com/watch?v=week-two",
          },
        },
        {
          sequenceNumber: 0,
          lessonKind: "promo",
          title: "Why Know Your Bible?",
          startVerse: null,
          endVerse: null,
          videoSummary: "Promo",
        },
      ],
      new Map([
        [
          "https://www.youtube.com/watch?v=week-two",
          {
            title: "Know Your Bible - Week 2 - Genesis 1-2",
            description: 'Creation, humanity, and "rest"',
          },
        ],
      ])
    );

    expect(csv).toBe(
      [
        "Week Number,Chapter/Verse Start,Chapter/Verse End,Title,Description,YouTube Link,Match",
        '2,Genesis 1,Genesis 2,Know Your Bible - Week 2 - Genesis 1-2,"Creation, humanity, and ""rest""",https://www.youtube.com/watch?v=week-two,MATCH',
        "",
      ].join("\n")
    );
  });

  it("requires both YouTube title and description to match", () => {
    const lesson = {
      sequenceNumber: 2,
      lessonKind: "passage",
      title: "Genesis 1-2",
      startVerse: "Genesis 1",
      endVerse: "Genesis 2",
      videoSummary: "Creation description",
      youtube: {
        url: "https://www.youtube.com/watch?v=week-two",
      },
    };
    const expectedMetadata = {
      title: "Know Your Bible - Week 2 - Genesis 1-2",
      description: "Creation description",
    };

    expect(buildExportedLessonRow(lesson, expectedMetadata).at(-1)).toBe(
      "MATCH"
    );
    expect(
      buildExportedLessonRow(lesson, {
        ...expectedMetadata,
        title: "Different title",
      }).at(-1)
    ).toBe("");
    expect(
      buildExportedLessonRow(lesson, {
        ...expectedMetadata,
        description: "Different description",
      }).at(-1)
    ).toBe("");
    expect(buildExportedLessonRow(lesson).slice(-2)).toEqual([
      "https://www.youtube.com/watch?v=week-two",
      "",
    ]);
  });

  it("overwrites exported-lessons.csv with published non-promo lessons", async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), "lesson-title-export-")
    );
    temporaryRoots.push(repoRoot);
    const sectionPath =
      "apps/courses/content/sections/01-section/section.json";
    const introPath =
      "apps/courses/content/sections/01-section/lessons/001-intro/lesson.json";
    const lessonPath =
      "apps/courses/content/sections/01-section/lessons/002-genesis/lesson.json";
    const promoPath =
      "apps/courses/content/sections/01-section/lessons/000-promo/lesson.json";

    await writeJson(
      path.join(repoRoot, "apps/courses/content/sections.json"),
      { sections: [{ sectionPath }] }
    );
    await writeJson(path.join(repoRoot, sectionPath), {
      lessons: [
        { lessonPath: promoPath },
        { lessonPath: introPath },
        { lessonPath },
      ],
    });
    await writeJson(path.join(repoRoot, promoPath), {
      sequenceNumber: 0,
      lessonKind: "promo",
      title: "Promo",
      startVerse: null,
      endVerse: null,
      videoSummary: "Promo description",
    });
    await writeJson(path.join(repoRoot, introPath), {
      sequenceNumber: 1,
      lessonKind: "intro",
      title: "Intro",
      startVerse: null,
      endVerse: null,
      videoSummary: "Introduction description",
    });
    await writeJson(path.join(repoRoot, lessonPath), {
      sequenceNumber: 2,
      lessonKind: "passage",
      title: "Genesis 1-2",
      startVerse: "Genesis 1",
      endVerse: "Genesis 2",
      videoSummary: "Lesson description",
      youtube: {
        url: "https://www.youtube.com/watch?v=week-two",
      },
    });
    const outputPath = path.join(repoRoot, "exported-lessons.csv");
    await writeFile(outputPath, "old content\n", "utf8");
    const fetchVideoMetadata = vi.fn(async () => ({
      videoId: "week-two",
      title: "Know Your Bible - Week 2 - Genesis 1-2",
      description: "Lesson description",
    }));

    const result = await exportLessonTitles({
      repoRoot,
      fetchVideoMetadata,
    });

    expect(result).toEqual({ outputPath, lessonCount: 2 });
    expect(fetchVideoMetadata).toHaveBeenCalledOnce();
    expect(fetchVideoMetadata).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=week-two"
    );
    const csv = await readFile(outputPath, "utf8");
    expect(csv).not.toContain("old content");
    expect(csv).not.toContain("Promo description");
    expect(csv).toContain("1,,,Know Your Bible - Week 1 - Intro");
    expect(csv).toContain(
      "2,Genesis 1,Genesis 2,Know Your Bible - Week 2 - Genesis 1-2,Lesson description,https://www.youtube.com/watch?v=week-two,MATCH"
    );
  });
});
