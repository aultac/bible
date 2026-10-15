import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCachePublishedLessonCatalog,
  buildCanonicalLessonIndex,
  buildCanonicalPublishedLessonCatalog,
  parseLessonDirectoryName,
  parseSectionDirectoryName,
  resolveCanonicalLessonDirectory,
} from "./lesson-paths.mjs";
import { prepareCanonicalNoteBackups } from "./notes-backups.mjs";
import { resolvePlaylistVideoMatches } from "./youtube-special-matches.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeCanonicalBase() {
  const canonicalBase = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-lesson-paths-")
  );
  temporaryDirectories.push(canonicalBase);
  await mkdir(
    path.join(canonicalBase, "01-Bucket-Genesis1-11", "001-Intro"),
    { recursive: true }
  );
  await mkdir(
    path.join(
      canonicalBase,
      "02-Bucket-Genesis12-50",
      "018_Genesis37_29-39"
    ),
    { recursive: true }
  );
  await writeFile(
    path.join(
      canonicalBase,
      "02-Bucket-Genesis12-50",
      "018_Genesis37_29-39",
      "notes.md"
    ),
    "Old notes\n",
    "utf8"
  );
  return canonicalBase;
}

describe("canonical lesson path matching", () => {
  it("models Promo and Intro without passages and rejects unknown non-passage labels", () => {
    expect(parseLessonDirectoryName("000-Promo")).toMatchObject({
      sequenceNumber: 0,
      lessonKind: "promo",
      passage: null,
      displayTitle: "Why Know Your Bible?",
    });
    expect(parseLessonDirectoryName("001-Intro")).toMatchObject({
      sequenceNumber: 1,
      lessonKind: "intro",
      passage: null,
      displayTitle: "Intro",
    });
    expect(parseLessonDirectoryName("002_Genesis1-2")).toMatchObject({
      sequenceNumber: 2,
      lessonKind: "passage",
      passage: { display: "Genesis 1-2" },
    });
    expect(() => parseLessonDirectoryName("002-Overview")).toThrow(
      "neither a known special lesson nor a valid passage"
    );
  });
  it("accepts Bucket source sections while keeping generated section slugs stable", () => {
    expect(parseSectionDirectoryName("01-Bucket-Genesis1-11")).toMatchObject({
      directoryKind: "Bucket",
      folderName: "01-Bucket-Genesis1-11",
      slug: "01-section-genesis1-11",
    });
    expect(parseSectionDirectoryName("01-Section-Genesis1-11")).toMatchObject({
      directoryKind: "Section",
      slug: "01-section-genesis1-11",
    });
  });

  it("indexes lesson folders inside Bucket source sections", async () => {
    const canonicalBase = await makeCanonicalBase();
    const lessonIndex = await buildCanonicalLessonIndex(canonicalBase);

    expect(lessonIndex.get("001-Intro")).toBe(
      path.join(canonicalBase, "01-Bucket-Genesis1-11", "001-Intro")
    );
  });

  it("falls back to a unique sequence-number match and reports expected section-relative paths", async () => {
    const canonicalBase = await makeCanonicalBase();
    const lessonIndex = await buildCanonicalLessonIndex(canonicalBase);

    expect(
      resolveCanonicalLessonDirectory(
        lessonIndex,
        "018_Genesis37:30-39",
        canonicalBase
      )
    ).toMatchObject({
      matched: true,
      matchedBy: "sequence",
      expectedLessonDirectoryName: "018_Genesis37_30-39",
      actualLessonDirectoryName: "018_Genesis37_29-39",
      expectedRelativeLessonDirectory:
        "02-Bucket-Genesis12-50/018_Genesis37_30-39",
      relativeLessonDirectory:
        "02-Bucket-Genesis12-50/018_Genesis37_29-39",
    });
  });

  it("uses the section-aware matcher when preparing note backups", async () => {
    const canonicalBase = await makeCanonicalBase();
    const snapshotRoot = await mkdtemp(
      path.join(os.tmpdir(), "know-your-bible-note-snapshot-")
    );
    temporaryDirectories.push(snapshotRoot);
    await mkdir(path.join(snapshotRoot, "notes"), { recursive: true });
    await writeFile(
      path.join(snapshotRoot, "notes", "intro.html"),
      "<h1>Intro</h1>",
      "utf8"
    );
    await writeFile(
      path.join(snapshotRoot, "notes", "sequence.html"),
      "<h1>Sequence</h1>",
      "utf8"
    );
    await writeFile(
      path.join(snapshotRoot, "manifest.json"),
      `${JSON.stringify(
        {
          notes: [
            {
              id: "intro",
              title: "001-Intro",
              updatedAt: "2026-01-01T00:00:00.000Z",
              bodyPath: "notes/intro.html",
            },
            {
              id: "sequence",
              title: "018_Genesis37:30-39",
              updatedAt: "2026-01-01T00:00:00.000Z",
              bodyPath: "notes/sequence.html",
            },
          ],
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const { report } = await prepareCanonicalNoteBackups({
      snapshotRoot,
      canonicalBase,
    });

    expect(report.totals.missingCanonicalLessonFolder).toBe(0);
    expect(report.totals.new).toBe(1);
    expect(report.totals.updated).toBe(1);
    expect(report.updates.map((update) => update.relativeLessonDirectory)).toEqual(
      [
        "01-Bucket-Genesis1-11/001-Intro",
        "02-Bucket-Genesis12-50/018_Genesis37_29-39",
      ]
    );
    expect(report.updates[1]).toMatchObject({
      matchedBy: "sequence",
      expectedRelativeLessonDirectory:
        "02-Bucket-Genesis12-50/018_Genesis37_30-39",
      actualLessonDirectoryName: "018_Genesis37_29-39",
    });
  });

  it("uses staged notes to publish week 041 and hide week 042", async () => {
    const canonicalBase = await mkdtemp(
      path.join(os.tmpdir(), "know-your-bible-staged-publication-")
    );
    const cacheRoot = await mkdtemp(
      path.join(os.tmpdir(), "know-your-bible-staged-cache-")
    );
    temporaryDirectories.push(canonicalBase, cacheRoot);
    const section = "03-Bucket-ExodusLeviticusNumbersDeuteronomy";
    const lesson040 = "040_Exodus16_22-17";
    const lesson041 = "041_Exodus18-19_15";
    const lesson042 = "042_Exodus19_16-20";
    await mkdir(path.join(canonicalBase, section, lesson040), {
      recursive: true,
    });
    await mkdir(path.join(canonicalBase, section, lesson041), {
      recursive: true,
    });
    await mkdir(path.join(canonicalBase, section, lesson042), {
      recursive: true,
    });
    await writeFile(
      path.join(canonicalBase, section, lesson040, "NOPUBLISH.txt"),
      "",
      "utf8"
    );
    await writeFile(
      path.join(canonicalBase, section, lesson041, "notes.md"),
      "# 041_Exodus18-20\n\nNOPUBLISH\n",
      "utf8"
    );

    const staged040 = path.join(
      cacheRoot,
      "canonical-note-backup-candidates",
      section,
      lesson040,
      "notes.md"
    );
    const staged041 = path.join(
      cacheRoot,
      "canonical-note-backup-candidates",
      section,
      lesson041,
      "notes.md"
    );
    const staged042 = path.join(
      cacheRoot,
      "canonical-note-backup-candidates",
      section,
      lesson042,
      "notes.md"
    );
    await mkdir(path.dirname(staged040), { recursive: true });
    await mkdir(path.dirname(staged041), { recursive: true });
    await mkdir(path.dirname(staged042), { recursive: true });
    await writeFile(staged040, "# 040_Exodus16_22-17\n", "utf8");
    await writeFile(staged041, "# 041_Exodus18-19_15\n", "utf8");
    await writeFile(
      staged042,
      "# 042_Exodus19_16-20\n\nNOPUBLISH\n",
      "utf8"
    );
    await writeFile(
      path.join(cacheRoot, "canonical-note-backup-report.json"),
      `${JSON.stringify({
        updates: [
          {
            relativeLessonDirectory: `${section}/${lesson040}`,
            stagedNotesPath: staged040,
          },
          {
            relativeLessonDirectory: `${section}/${lesson041}`,
            stagedNotesPath: staged041,
          },
          {
            relativeLessonDirectory: `${section}/${lesson042}`,
            stagedNotesPath: staged042,
          },
        ],
      })}\n`,
      "utf8"
    );

    expect(
      (
        await buildCanonicalPublishedLessonCatalog(canonicalBase)
      ).map((lesson) => lesson.sequenceNumber)
    ).toEqual([42]);

    const lessons = await buildCachePublishedLessonCatalog(
      canonicalBase,
      cacheRoot
    );
    expect(lessons.map((lesson) => lesson.sequenceNumber)).toEqual([41]);
    expect(lessons[0].displayTitle).toBe("Exodus 18-19:15");

    const resolved = resolvePlaylistVideoMatches(
      {
        videos: [
          {
            videoId: "iBqmOg8QfRg",
            title: "Exodus 18-19:15",
          },
        ],
      },
      {
        lessons,
        specialMatches: { schemaVersion: 1, matches: [] },
      }
    );
    expect(resolved.videos[0]).toMatchObject({
      lessonSequenceNumber: 41,
      matchMethod: "passage-title",
    });
  });
});
