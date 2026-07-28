import { describe, expect, it, vi } from "vitest";
import {
  buildPlaylistVideoMatchMap,
  fetchPlaylistSnapshot,
  parsePlaylistSnapshotHtml,
} from "./youtube-playlist.mjs";

const PLAYLIST_ID = "playlist-id";

function playlistHtml(contents) {
  return `<script>var ytInitialData = ${JSON.stringify({
    metadata: {
      playlistMetadataRenderer: {
        title: "Know Your Bible",
      },
    },
    contents,
  })};</script>`;
}

describe("YouTube playlist parsing", () => {
  it("parses the current lockupViewModel playlist shape", () => {
    const snapshot = parsePlaylistSnapshotHtml(
      playlistHtml([
        {
          lockupViewModel: {
            contentId: "video-one",
            contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
            contentImage: {
              thumbnailViewModel: {
                image: {
                  sources: [
                    { url: "https://example.test/small.jpg" },
                    { url: "https://example.test/large.jpg" },
                  ],
                },
                overlays: [
                  {
                    thumbnailBottomOverlayViewModel: {
                      badges: [
                        {
                          thumbnailBadgeViewModel: {
                            text: "43:13",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            metadata: {
              lockupMetadataViewModel: {
                title: {
                  content: "Know Your Bible - Week 1",
                },
              },
            },
            rendererContext: {
              commandContext: {
                onTap: {
                  innertubeCommand: {
                    watchEndpoint: {
                      videoId: "video-one",
                      playlistId: PLAYLIST_ID,
                      index: 0,
                    },
                  },
                },
              },
            },
          },
        },
      ]),
      PLAYLIST_ID,
      { fetchedAt: "2026-01-01T00:00:00.000Z" }
    );

    expect(snapshot).toMatchObject({
      fetchedAt: "2026-01-01T00:00:00.000Z",
      videoCount: 1,
      videos: [
        {
          videoId: "video-one",
          title: "Know Your Bible - Week 1",
          position: 1,
          weekNumber: 1,
          videoKind: "lesson",
          lessonSequenceNumber: 1,
          durationText: "43:13",
          thumbnailUrl: "https://example.test/large.jpg",
        },
      ],
    });
  });

  it("continues to parse the legacy playlistVideoRenderer shape", () => {
    const snapshot = parsePlaylistSnapshotHtml(
      playlistHtml([
        {
          playlistVideoRenderer: {
            videoId: "legacy-video",
            title: { simpleText: "Know Your Bible - Week 2" },
            index: { simpleText: "2" },
            lengthText: { simpleText: "45:55" },
            thumbnail: {
              thumbnails: [{ url: "https://example.test/legacy.jpg" }],
            },
          },
        },
      ]),
      PLAYLIST_ID
    );

    expect(snapshot.videos[0]).toMatchObject({
      videoId: "legacy-video",
      position: 2,
      weekNumber: 2,
      videoKind: "lesson",
      lessonSequenceNumber: 2,
      durationText: "45:55",
    });
  });

  it("rejects an empty parse so a cached playlist is not replaced", () => {
    expect(() =>
      parsePlaylistSnapshotHtml(playlistHtml([]), PLAYLIST_ID)
    ).toThrow("no recognizable videos");
  });

  it("maps Promo and explicit weeks without using shifted playlist positions", () => {
    const snapshot = parsePlaylistSnapshotHtml(
      playlistHtml([
        {
          playlistVideoRenderer: {
            videoId: "promo",
            title: { simpleText: "Know Your Bible Promo" },
            index: { simpleText: "1" },
          },
        },
        {
          playlistVideoRenderer: {
            videoId: "intro",
            title: { simpleText: "Know Your Bible - Week 1" },
            index: { simpleText: "2" },
          },
        },
        {
          playlistVideoRenderer: {
            videoId: "week-two",
            title: { simpleText: "Know Your Bible - Week 2" },
            index: { simpleText: "3" },
          },
        },
      ]),
      PLAYLIST_ID
    );
    const matches = buildPlaylistVideoMatchMap(snapshot);

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.videos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          videoId: "promo",
          position: 1,
          videoKind: "promo",
          weekNumber: null,
          lessonSequenceNumber: 0,
        }),
        expect.objectContaining({
          videoId: "intro",
          position: 2,
          lessonSequenceNumber: 1,
        }),
        expect.objectContaining({
          videoId: "week-two",
          position: 3,
          lessonSequenceNumber: 2,
        }),
      ])
    );
    expect(matches.get(0).videoId).toBe("promo");
    expect(matches.get(1).videoId).toBe("intro");
    expect(matches.get(2).videoId).toBe("week-two");
    expect(matches.has(3)).toBe(false);
  });

  it("rejects duplicate lesson sequence matches", () => {
    expect(() =>
      buildPlaylistVideoMatchMap({
        videos: [
          { videoId: "first", lessonSequenceNumber: 1 },
          { videoId: "second", lessonSequenceNumber: 1 },
        ],
      })
    ).toThrow("Multiple YouTube videos map to lesson sequence 1");
  });

  it("retries a transient transport failure before parsing the playlist", async () => {
    const transportError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("socket disconnected"), {
        code: "ECONNRESET",
      }),
    });
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(transportError)
      .mockResolvedValueOnce(
        new Response(
          playlistHtml([
            {
              playlistVideoRenderer: {
                videoId: "video-after-retry",
                title: { simpleText: "Know Your Bible - Week 1" },
                index: { simpleText: "1" },
              },
            },
          ])
        )
      );
    const sleepFn = vi.fn();
    const onRetry = vi.fn();

    const snapshot = await fetchPlaylistSnapshot(PLAYLIST_ID, {
      fetchImpl,
      retryDelaysMs: [25],
      sleepFn,
      onRetry,
    });

    expect(snapshot.videos[0].videoId).toBe("video-after-retry");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(25);
    expect(onRetry).toHaveBeenCalledWith(
      expect.stringContaining("ECONNRESET")
    );
  });

  it("reports the nested cause after transport retries are exhausted", async () => {
    const transportError = new TypeError("fetch failed", {
      cause: Object.assign(new Error("host lookup failed"), {
        code: "ENOTFOUND",
      }),
    });

    await expect(
      fetchPlaylistSnapshot(PLAYLIST_ID, {
        fetchImpl: vi.fn().mockRejectedValue(transportError),
        retryDelaysMs: [],
      })
    ).rejects.toThrow(
      "YouTube playlist request failed after 1 attempt: ENOTFOUND: host lookup failed"
    );
  });
});
