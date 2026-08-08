import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addYoutubeSpecialMatch,
  loadYoutubeSpecialMatches,
  removeYoutubeSpecialMatch,
  resolvePlaylistVideoMatches,
  saveYoutubeSpecialMatches,
  validateYoutubeSpecialMatches,
} from "./youtube-special-matches.mjs";

const temporaryDirectories = [];
const lessons = [
  {
    sequenceNumber: 0,
    lessonKind: "promo",
    displayTitle: "Why Know Your Bible?",
  },
  {
    sequenceNumber: 1,
    lessonKind: "intro",
    displayTitle: "Intro",
  },
  {
    sequenceNumber: 2,
    lessonKind: "passage",
    displayTitle: "Genesis 1-2",
    passage: { display: "Genesis 1-2" },
  },
  {
    sequenceNumber: 28,
    lessonKind: "passage",
    displayTitle: "Exodus 2:16-3:12",
    passage: { display: "Exodus 2:16-3:12" },
  },
];

function playlist(videos) {
  return {
    schemaVersion: 3,
    playlistId: "playlist",
    videoCount: videos.length,
    videos: videos.map((video, index) => ({
      position: index + 1,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      ...video,
    })),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("YouTube special matches", () => {
  it("resolves current titles automatically before applying a special fallback", () => {
    const resolved = resolvePlaylistVideoMatches(
      playlist([
        { videoId: "promo", title: "Why Know Your Bible?" },
        { videoId: "intro", title: "Intro to Know Your Bible" },
        { videoId: "genesis", title: "Genesis 1-2" },
        { videoId: "typo", title: "Exodus 2:16-3-:13" },
      ]),
      {
        lessons,
        specialMatches: {
          schemaVersion: 1,
          matches: [
            {
              videoId: "typo",
              lessonSequenceNumber: 28,
              videoTitle: "Exodus 2:16-3-:13",
              lessonTitle: "Exodus 2:16-3:12",
            },
          ],
        },
      }
    );

    expect(resolved.matching).toMatchObject({
      automaticMatchCount: 3,
      specialMatchCount: 1,
      unmatchedCount: 0,
      diagnostics: [],
      specialMatches: [
        expect.objectContaining({ videoId: "typo", status: "active" }),
      ],
    });
    expect(
      resolved.videos.find((video) => video.videoId === "typo")
    ).toMatchObject({
      lessonSequenceNumber: 28,
      matchMethod: "special",
    });
  });

  it("reports redundant, conflicting, and stale mappings without overriding automatic matches", () => {
    const resolved = resolvePlaylistVideoMatches(
      playlist([
        { videoId: "corrected", title: "Exodus 2:16-3:12" },
        { videoId: "week-two", title: "Know Your Bible - Week 2" },
      ]),
      {
        lessons,
        specialMatches: {
          schemaVersion: 1,
          matches: [
            {
              videoId: "corrected",
              lessonSequenceNumber: 28,
              videoTitle: "Old typo",
              lessonTitle: "Exodus 2:16-3:12",
            },
            {
              videoId: "week-two",
              lessonSequenceNumber: 0,
              videoTitle: "Old title",
              lessonTitle: "Why Know Your Bible?",
            },
            {
              videoId: "removed-video",
              lessonSequenceNumber: 1,
              videoTitle: "Removed",
              lessonTitle: "Intro",
            },
          ],
        },
      }
    );

    expect(
      resolved.matching.specialMatches.map((match) => match.status)
    ).toEqual(["conflict", "stale", "redundant"]);
    expect(
      resolved.matching.diagnostics.map((finding) => finding.code)
    ).toEqual(
      expect.arrayContaining([
        "special-match-redundant",
        "special-match-conflict",
        "special-match-video-stale",
      ])
    );
    expect(
      resolved.videos.find((video) => video.videoId === "week-two")
    ).toMatchObject({
      lessonSequenceNumber: 2,
      matchMethod: "week-number",
    });
  });

  it("rejects duplicate video and lesson identities", () => {
    const findings = validateYoutubeSpecialMatches({
      schemaVersion: 1,
      matches: [
        { videoId: "video", lessonSequenceNumber: 2 },
        { videoId: "video", lessonSequenceNumber: 28 },
        { videoId: "other", lessonSequenceNumber: 2 },
      ],
    });

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "special-match-video-duplicate",
        "special-match-lesson-duplicate",
      ])
    );
  });

  it("adds, saves, loads, and removes mappings atomically", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "youtube-special-matches-")
    );
    temporaryDirectories.push(directory);
    const manifestPath = path.join(directory, "matches.json");
    const video = { videoId: "typo", title: "Exodus typo" };
    const lesson = lessons.find((item) => item.sequenceNumber === 28);
    const added = addYoutubeSpecialMatch(
      { schemaVersion: 1, matches: [] },
      video,
      lesson
    );

    await saveYoutubeSpecialMatches(added, manifestPath);
    await expect(loadYoutubeSpecialMatches(manifestPath)).resolves.toEqual(
      added
    );
    expect(await readFile(manifestPath, "utf8")).toContain(
      '"videoId": "typo"'
    );

    const removed = removeYoutubeSpecialMatch(added, "typo");
    await saveYoutubeSpecialMatches(removed, manifestPath);
    await expect(loadYoutubeSpecialMatches(manifestPath)).resolves.toEqual({
      schemaVersion: 1,
      matches: [],
    });
  });
});
