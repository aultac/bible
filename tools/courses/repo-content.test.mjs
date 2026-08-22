import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncGeneratedLessonYoutubeMatches } from "./repo-content.mjs";
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
});
