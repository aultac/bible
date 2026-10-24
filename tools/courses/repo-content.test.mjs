import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  preserveVolatileFields,
  syncGeneratedLessonYoutubeMatches,
} from "./repo-content.mjs";
import { writeJsonAtomic } from "./weekly-cache.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("generated YouTube match sync", () => {
  it("writes the playlist snapshot and updates published lesson videos only", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "repo-content-youtube-"));
    temporaryRoots.push(root);
    const contentRoot = path.join(root, "content");
    const publishedPath = path.join(
      contentRoot,
      "sections",
      "03-section",
      "lessons",
      "036-exodus12-21-12-51",
      "lesson.json"
    );
    const unpublishedPath = path.join(
      contentRoot,
      "unpublished",
      "03-section",
      "lessons",
      "037-exodus13-14",
      "lesson.json"
    );
    await mkdir(path.dirname(publishedPath), { recursive: true });
    await mkdir(path.dirname(unpublishedPath), { recursive: true });
    await writeJsonAtomic(publishedPath, {
      sequenceNumber: 36,
      youtube: null,
    });
    await writeJsonAtomic(unpublishedPath, {
      sequenceNumber: 37,
      youtube: { videoId: "should-clear" },
    });

    const playlistSnapshot = {
      schemaVersion: 3,
      videoCount: 1,
      videos: [
        {
          videoId: "ZYWffrz0YvE",
          title: "Exodus 12:21-51",
          lessonSequenceNumber: 36,
          matchMethod: "special",
        },
      ],
    };

    const result = await syncGeneratedLessonYoutubeMatches(playlistSnapshot, {
      contentRoot,
    });
    const published = JSON.parse(await readFile(publishedPath, "utf8"));
    const unpublished = JSON.parse(await readFile(unpublishedPath, "utf8"));
    const playlist = JSON.parse(
      await readFile(path.join(contentRoot, "playlist.json"), "utf8")
    );

    expect(result).toMatchObject({
      updatedLessonCount: 2,
      matchedYoutubeLessons: 1,
    });
    expect(published.youtube).toMatchObject({
      videoId: "ZYWffrz0YvE",
      lessonSequenceNumber: 36,
    });
    expect(unpublished.youtube).toBeNull();
    expect(playlist.videos[0].videoId).toBe("ZYWffrz0YvE");
  });

  it("keeps an unchanged playlist fetch time and writes a new video", async () => {
    const contentRoot = path.join(
      await mkdtemp(path.join(os.tmpdir(), "repo-content-playlist-")),
      "content"
    );
    temporaryRoots.push(path.dirname(contentRoot));
    const playlistPath = path.join(contentRoot, "playlist.json");
    const previous = {
      schemaVersion: 3,
      fetchedAt: "2026-10-03T11:50:43.845Z",
      videoCount: 1,
      videos: [{ videoId: "existing", title: "Exodus 16:22-17" }],
    };
    await mkdir(contentRoot, { recursive: true });
    await writeJsonAtomic(playlistPath, previous);

    await syncGeneratedLessonYoutubeMatches(
      {
        ...previous,
        fetchedAt: "2026-10-15T11:04:42.344Z",
      },
      { contentRoot }
    );
    expect(JSON.parse(await readFile(playlistPath, "utf8"))).toEqual(previous);

    const added = {
      ...previous,
      fetchedAt: "2026-10-15T11:04:42.344Z",
      videoCount: 2,
      videos: [
        ...previous.videos,
        { videoId: "iBqmOg8QfRg", title: "Exodus 18-19:15" },
      ],
    };
    await syncGeneratedLessonYoutubeMatches(added, { contentRoot });
    expect(JSON.parse(await readFile(playlistPath, "utf8"))).toEqual(added);
  });
});

describe("stable generated manifests", () => {
  function lessonManifest(generatedAt, title) {
    return {
      schemaVersion: 1,
      generatedAt,
      id: title.startsWith("Genesis 1-2") ? "002-genesis1-2" : "003-genesis3-4",
      title,
      status: "published",
    };
  }

  it("reuses the previous timestamp when a second sync has the same lesson content", () => {
    const previousLesson = lessonManifest(
      "2026-10-03T11:50:56.581Z",
      "Genesis 1-2"
    );
    const previousSection = {
      schemaVersion: 1,
      generatedAt: "2026-10-03T11:50:56.581Z",
      lessonCount: 1,
      lessons: [{ id: previousLesson.id, title: previousLesson.title }],
    };
    const nextLesson = lessonManifest(
      "2026-10-15T11:05:13.843Z",
      "Genesis 1-2"
    );
    const nextSection = {
      ...previousSection,
      generatedAt: "2026-10-15T11:05:13.843Z",
    };
    const stableLesson = preserveVolatileFields(previousLesson, nextLesson, [
      "generatedAt",
    ]);
    const stableSection = preserveVolatileFields(
      previousSection,
      nextSection,
      ["generatedAt"]
    );

    expect(`${JSON.stringify(stableLesson, null, 2)}\n`).toBe(
      `${JSON.stringify(previousLesson, null, 2)}\n`
    );
    expect(`${JSON.stringify(stableSection, null, 2)}\n`).toBe(
      `${JSON.stringify(previousSection, null, 2)}\n`
    );
  });

  it("rewrites a changed lesson and its section index without touching the other lesson", () => {
    const unchanged = lessonManifest(
      "2026-10-03T11:50:56.581Z",
      "Genesis 1-2"
    );
    const changed = lessonManifest("2026-10-03T11:50:56.581Z", "Genesis 3-4");
    const refreshedAt = "2026-10-15T11:05:13.843Z";
    const nextChanged = {
      ...changed,
      generatedAt: refreshedAt,
      title: "Genesis 3-5",
    };
    const nextSection = {
      schemaVersion: 1,
      generatedAt: refreshedAt,
      lessonCount: 2,
      lessons: [
        { id: unchanged.id, title: unchanged.title },
        { id: nextChanged.id, title: nextChanged.title },
      ],
    };
    const previousSection = {
      ...nextSection,
      generatedAt: changed.generatedAt,
      lessons: [
        { id: unchanged.id, title: unchanged.title },
        { id: changed.id, title: changed.title },
      ],
    };

    expect(
      preserveVolatileFields(
        unchanged,
        { ...unchanged, generatedAt: refreshedAt },
        ["generatedAt"]
      )
    ).toEqual(unchanged);
    expect(
      preserveVolatileFields(changed, nextChanged, ["generatedAt"])
    ).toEqual(nextChanged);
    expect(
      preserveVolatileFields(previousSection, nextSection, ["generatedAt"])
    ).toEqual(nextSection);
  });
});
