import {
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyLessonPublication } from "./repo-content.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function lessonFixture(notes = "Published notes\n") {
  const lessonPath = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-publication-")
  );
  temporaryDirectories.push(lessonPath);
  const notesPath = path.join(lessonPath, "notes.md");
  await writeFile(notesPath, notes, "utf8");
  return { lessonPath, notesPath };
}

describe("NOPUBLISH classification", () => {
  it("publishes a lesson with no marker", async () => {
    const fixture = await lessonFixture();
    await expect(
      classifyLessonPublication(fixture.lessonPath, fixture.notesPath)
    ).resolves.toEqual({
      published: true,
      publishReasons: [],
    });
  });

  it("finds case-insensitive marker filenames at any depth", async () => {
    const fixture = await lessonFixture();
    const nestedDirectory = path.join(
      fixture.lessonPath,
      "resources",
      "private"
    );
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(
      path.join(nestedDirectory, "draft-NoPublish-marker.txt"),
      "",
      "utf8"
    );

    const publication = await classifyLessonPublication(
      fixture.lessonPath,
      fixture.notesPath
    );
    expect(publication.published).toBe(false);
    expect(publication.publishReasons).toContainEqual({
      type: "filename",
      path: "resources/private/draft-NoPublish-marker.txt",
    });
  });

  it("finds a case-insensitive marker anywhere in notes content", async () => {
    const fixture = await lessonFixture(
      "# Lesson\n\nThis lesson is marked noPublish until review.\n"
    );

    await expect(
      classifyLessonPublication(fixture.lessonPath, fixture.notesPath)
    ).resolves.toMatchObject({
      published: false,
      publishReasons: [{ type: "notes-content", path: "notes.md" }],
    });
  });

  it("returns to published after every filename and content marker is removed", async () => {
    const fixture = await lessonFixture("NOPUBLISH\n");
    const markerPath = path.join(fixture.lessonPath, "NOPUBLISH");
    await writeFile(markerPath, "", "utf8");
    expect(
      (
        await classifyLessonPublication(
          fixture.lessonPath,
          fixture.notesPath
        )
      ).published
    ).toBe(false);

    await unlink(markerPath);
    await writeFile(fixture.notesPath, "Reviewed lesson notes\n", "utf8");
    expect(
      (
        await classifyLessonPublication(
          fixture.lessonPath,
          fixture.notesPath
        )
      ).published
    ).toBe(true);
  });
});
