import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCanonicalLessonIndex,
  parseSectionDirectoryName,
  resolveCanonicalLessonDirectory,
} from "./lesson-paths.mjs";
import { prepareCanonicalNoteBackups } from "./notes-backups.mjs";

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
});
