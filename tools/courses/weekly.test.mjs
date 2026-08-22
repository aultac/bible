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
  formatWeeklyStatus,
  parseWeeklyArgs,
  runWeeklyCommand,
} from "./weekly.mjs";

const coursesEnv = {
  canonicalBase: "/canonical",
  notesCacheRoot: "/cache",
};
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

function outputBuffer() {
  let content = "";
  return {
    stream: {
      write(chunk) {
        content += chunk;
      },
    },
    get content() {
      return content;
    },
  };
}

describe("weekly workflow CLI", () => {
  it("parses the new direct execution modes and component selection", () => {
    expect(
      parseWeeklyArgs([
        "--prepare",
        "--cache",
        "cache-id",
        "--components",
        "documents,youtube",
      ])
    ).toMatchObject({
      mode: "prepare",
      cacheRoot: "cache-id",
      components: ["documents", "youtube"],
    });
    expect(
      parseWeeklyArgs(["--release", "--commit-message", "Publish week 33", "--yes"])
    ).toMatchObject({
      mode: "release",
      commitMessage: "Publish week 33",
      yes: true,
    });
    expect(parseWeeklyArgs(["--build-test"])).toMatchObject({
      mode: "validate",
    });
    expect(parseWeeklyArgs(["--dev"])).toMatchObject({ mode: "dev" });
    expect(parseWeeklyArgs(["--manage-youtube-matches"])).toMatchObject({
      mode: "manage-youtube",
    });
    expect(parseWeeklyArgs(["--export-titles"])).toMatchObject({
      mode: "export-titles",
    });
    expect(() => parseWeeklyArgs(["--audit", "--apply"])).toThrow(
      "only one"
    );
    expect(() => parseWeeklyArgs(["--summarize"])).toThrow(
      "Unknown argument"
    );
  });

  it("runs direct prepare through selected-cache refresh orchestration", async () => {
    const output = outputBuffer();
    const errorOutput = outputBuffer();
    const runWeeklyRefresh = vi.fn(async (options) => {
      expect(options).toMatchObject({
        coursesEnv,
        cacheRoot: "cache-id",
        components: ["documents"],
      });
      options.onProgress("preparing");
      return {
        phase: "prepare",
        cacheRoot: "/cache/snapshots/cache-id",
      };
    });

    const result = await runWeeklyCommand(
      {
        mode: "prepare",
        coursesEnv,
        cacheRoot: "cache-id",
        components: ["documents"],
      },
      {
        output: output.stream,
        errorOutput: errorOutput.stream,
        runWeeklyRefresh,
        formatWeeklyRefreshResult: () => "prepared",
      }
    );

    expect(result.cacheRoot).toBe("/cache/snapshots/cache-id");
    expect(output.content).toBe("prepared\n");
    expect(errorOutput.content).toContain("[weekly] preparing");
  });

  it("defaults interactive preparation to a new full cache", async () => {
    const output = outputBuffer();
    const actions = ["prepare", "create", "quit"];
    const selectPrompt = vi.fn(async () => actions.shift());
    const runWeeklyRefresh = vi.fn(async (options) => {
      expect(options.cacheRoot).toBeNull();
      expect(options.components).toBeNull();
      return {
        phase: "prepare",
        cacheRoot: "/cache/snapshots/new-cache",
      };
    });

    const result = await runWeeklyCommand(
      { coursesEnv },
      {
        output: output.stream,
        selectPrompt,
        runWeeklyRefresh,
        formatWeeklyRefreshResult: () => "prepared",
      }
    );

    expect(runWeeklyRefresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      mode: "interactive",
      selectedCacheRoot: "/cache/snapshots/new-cache",
    });
    expect(output.content).toContain("Selected cache: new-cache");
  });

  it("offers focused refresh components for an existing cache", async () => {
    const output = outputBuffer();
    const actions = ["prepare", "refresh", "/cache/snapshots/old", "specific", "quit"];
    const selectPrompt = vi.fn(async () => actions.shift());
    const checkboxPrompt = vi.fn(async () => ["documents", "youtube"]);
    const runWeeklyRefresh = vi.fn(async (options) => {
      expect(options).toMatchObject({
        cacheRoot: "/cache/snapshots/old",
        components: ["documents", "youtube"],
      });
      return { phase: "prepare", cacheRoot: options.cacheRoot };
    });

    await runWeeklyCommand(
      { coursesEnv },
      {
        output: output.stream,
        selectPrompt,
        checkboxPrompt,
        listWeeklyCaches: async () => [
          {
            cacheId: "old",
            cacheRoot: "/cache/snapshots/old",
            state: { status: "draft", latestAudit: null },
            noteUpdateCount: 1,
            selectable: true,
          },
        ],
        runWeeklyRefresh,
        formatWeeklyRefreshResult: () => "refreshed",
      }
    );

    expect(checkboxPrompt).toHaveBeenCalledTimes(1);
    expect(runWeeklyRefresh).toHaveBeenCalledTimes(1);
  });

  it("places build and dev immediately after apply in the guided menu", async () => {
    const output = outputBuffer();
    const selectPrompt = vi.fn(async (prompt) => {
      expect(prompt.choices.slice(0, 6).map((choice) => choice.value)).toEqual([
        "prepare",
        "manage-youtube",
        "audit",
        "apply",
        "validate",
        "dev",
      ]);
      return "quit";
    });

    await runWeeklyCommand(
      { mode: "interactive", coursesEnv },
      { output: output.stream, selectPrompt }
    );

    expect(selectPrompt).toHaveBeenCalledTimes(1);
  });

  it("guides an unmatched video to an unowned published lesson", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "weekly-youtube-match-"));
    temporaryRoots.push(root);
    const cacheRoot = path.join(root, "cache", "snapshots", "one");
    const playlistPath = path.join(cacheRoot, "playlist.json");
    const youtubeSpecialMatchesPath = path.join(root, "special-matches.json");
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(
      playlistPath,
      `${JSON.stringify({
        schemaVersion: 3,
        videoCount: 1,
        videos: [
          {
            videoId: "typo-video",
            title: "Genesis typo",
            position: 1,
          },
        ],
      })}\n`
    );
    const output = outputBuffer();
    const selections = ["add", "typo-video", 2, "back"];
    let savedManifest = { schemaVersion: 1, matches: [] };
    const saveYoutubeSpecialMatches = vi.fn(async (manifest) => {
      savedManifest = manifest;
      return manifest;
    });

    const result = await runWeeklyCommand(
      {
        mode: "manage-youtube",
        cacheRoot: "one",
        coursesEnv: {
          canonicalBase: "/canonical",
          notesCacheRoot: path.join(root, "cache"),
          youtubeSpecialMatchesPath,
        },
      },
      {
        output: output.stream,
        resolveWeeklyCache: async () => cacheRoot,
        loadCacheState: async () => ({ status: "draft" }),
        buildCanonicalPublishedLessonCatalog: async () => [
          {
            sequenceNumber: 2,
            displayTitle: "Genesis 1-2",
            relativeLessonDirectory: "01-Bucket/002-Genesis1-2",
          },
        ],
        loadYoutubeSpecialMatches: async () => savedManifest,
        saveYoutubeSpecialMatches,
        selectPrompt: async () => selections.shift(),
        confirmPrompt: async () => true,
        recordCacheComponent: async () => ({}),
        auditWeeklyCache: async () => ({
          audit: {
            ready: true,
            totals: { errors: 0, warnings: 0 },
            findings: [],
          },
        }),
        formatCacheAudit: () => "Cache is ready.",
      }
    );

    expect(result.specialMatches.matches).toEqual([
      expect.objectContaining({
        videoId: "typo-video",
        lessonSequenceNumber: 2,
      }),
    ]);
    expect(saveYoutubeSpecialMatches).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(playlistPath, "utf8"))).toMatchObject({
      videos: [
        expect.objectContaining({
          videoId: "typo-video",
          lessonSequenceNumber: 2,
          matchMethod: "special",
        }),
      ],
    });
    expect(output.content).toContain("1 special, 0 unmatched");
  });

  it("lists unmatched videos even when every published lesson already has a video",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "weekly-youtube-match-"));
      temporaryRoots.push(root);
      const cacheRoot = path.join(root, "cache", "snapshots", "one");
      const playlistPath = path.join(cacheRoot, "playlist.json");
      await mkdir(cacheRoot, { recursive: true });
      await writeFile(
        playlistPath,
        `${JSON.stringify({
          schemaVersion: 3,
          videoCount: 2,
          videos: [
            {
              videoId: "owned",
              title: "Genesis 1-2",
              lessonSequenceNumber: 2,
              matchMethod: "passage-title",
            },
            {
              videoId: "ZYWffrz0YvE",
              title: "Exodus 12:21-51",
              lessonSequenceNumber: null,
              titleFormat: "passage",
            },
          ],
        })}\n`
      );
      const output = outputBuffer();
      const selections = ["add", "back"];

      await runWeeklyCommand(
        {
          mode: "manage-youtube",
          cacheRoot: "one",
          coursesEnv: {
            canonicalBase: "/canonical",
            notesCacheRoot: path.join(root, "cache"),
            youtubeSpecialMatchesPath: path.join(root, "special-matches.json"),
          },
        },
        {
          output: output.stream,
          resolveWeeklyCache: async () => cacheRoot,
          loadCacheState: async () => ({ status: "ready" }),
          buildCanonicalPublishedLessonCatalog: async () => [
            {
              sequenceNumber: 2,
              displayTitle: "Genesis 1-2",
              relativeLessonDirectory: "01-Bucket/002-Genesis1-2",
            },
          ],
          loadYoutubeSpecialMatches: async () => ({
            schemaVersion: 1,
            matches: [],
          }),
          selectPrompt: async () => selections.shift(),
        }
      );

      expect(output.content).toContain(
        "There are unmatched playlist videos, but every published lesson already has a video."
      );
      expect(output.content).toContain(
        "unmatched: Exodus 12:21-51 (ZYWffrz0YvE)"
      );
    }
  );

  it("manages special matches on an applied cache without wiping applied state",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "weekly-youtube-match-"));
      temporaryRoots.push(root);
      const cacheRoot = path.join(root, "cache", "snapshots", "applied");
      const playlistPath = path.join(cacheRoot, "playlist.json");
      const generatedPlaylistPath = path.join(root, "content", "playlist.json");
      await mkdir(cacheRoot, { recursive: true });
      await writeFile(
        playlistPath,
        `${JSON.stringify({
          schemaVersion: 3,
          videoCount: 1,
          videos: [
            {
              videoId: "typo-video",
              title: "Exodus 12:21-51",
              position: 1,
            },
          ],
        })}\n`
      );
      const output = outputBuffer();
      const selections = ["add", "typo-video", 36, "back"];
      let savedManifest = { schemaVersion: 1, matches: [] };
      let cacheState = {
        status: "applied",
        applied: {
          appliedAt: "2026-08-20T00:00:00.000Z",
          playlist: { path: generatedPlaylistPath, hash: "old" },
        },
      };
      const recordCacheComponent = vi.fn(async (options) => {
        expect(options.preserveApplied).toBe(true);
        cacheState = {
          ...cacheState,
          components: { youtube: { summary: options.summary } },
        };
        return cacheState;
      });
      const writeCacheState = vi.fn(async (_cacheRoot, nextState) => {
        cacheState = nextState;
        return nextState;
      });
      const syncGeneratedLessonYoutubeMatches = vi.fn(async (playlist) => {
        expect(playlist.videos[0]).toMatchObject({
          videoId: "typo-video",
          lessonSequenceNumber: 36,
        });
        await mkdir(path.dirname(generatedPlaylistPath), { recursive: true });
        await writeFile(
          generatedPlaylistPath,
          `${JSON.stringify(playlist)}\n`
        );
        return {
          updatedLessonCount: 1,
          matchedYoutubeLessons: 1,
          playlistSnapshotPath: generatedPlaylistPath,
        };
      });

      const result = await runWeeklyCommand(
        {
          mode: "manage-youtube",
          cacheRoot: "applied",
          coursesEnv: {
            canonicalBase: "/canonical",
            notesCacheRoot: path.join(root, "cache"),
            youtubeSpecialMatchesPath: path.join(root, "special-matches.json"),
          },
        },
        {
          output: output.stream,
          resolveWeeklyCache: async () => cacheRoot,
          loadCacheState: async () => cacheState,
          writeCacheState,
          buildCanonicalPublishedLessonCatalog: async () => [
            {
              sequenceNumber: 36,
              displayTitle: "Exodus 12:21-12:51",
              relativeLessonDirectory:
                "03-Bucket-ExodusLeviticusNumbersDeuteronomy/036_Exodus12_21-12_51",
            },
          ],
          loadYoutubeSpecialMatches: async () => savedManifest,
          saveYoutubeSpecialMatches: async (manifest) => {
            savedManifest = manifest;
            return manifest;
          },
          selectPrompt: async () => selections.shift(),
          confirmPrompt: async () => true,
          recordCacheComponent,
          syncGeneratedLessonYoutubeMatches,
          auditWeeklyCache: async () => ({
            audit: {
              ready: true,
              totals: { errors: 0, warnings: 0 },
              findings: [],
            },
            state: { ...cacheState, status: "applied" },
          }),
          formatCacheAudit: () => "Cache is ready.",
        }
      );

      expect(result.specialMatches.matches).toEqual([
        expect.objectContaining({
          videoId: "typo-video",
          lessonSequenceNumber: 36,
        }),
      ]);
      expect(recordCacheComponent).toHaveBeenCalledOnce();
      expect(syncGeneratedLessonYoutubeMatches).toHaveBeenCalledOnce();
      expect(writeCacheState).toHaveBeenCalledOnce();
      expect(cacheState.status).toBe("applied");
      expect(cacheState.applied.playlist.path).toBe(generatedPlaylistPath);
      expect(cacheState.applied.playlist.hash).toMatch(/^[a-f0-9]{64}$/u);
    }
  );

  it("runs dev and title export without selecting or validating a cache", async () => {
    const output = outputBuffer();
    const startDevelopmentServer = vi.fn(async () => {});
    const exportLessonTitles = vi.fn(async () => ({
      outputPath: "/repo/exported-lessons.csv",
      lessonCount: 33,
    }));

    await expect(
      runWeeklyCommand(
        { mode: "dev", coursesEnv },
        { output: output.stream, startDevelopmentServer }
      )
    ).resolves.toEqual({ status: "stopped" });
    await expect(
      runWeeklyCommand(
        { mode: "export-titles", coursesEnv },
        { output: output.stream, exportLessonTitles }
      )
    ).resolves.toEqual({
      outputPath: "/repo/exported-lessons.csv",
      lessonCount: 33,
    });

    expect(startDevelopmentServer).toHaveBeenCalledTimes(1);
    expect(exportLessonTitles).toHaveBeenCalledTimes(1);
    expect(output.content).toContain("Exported 33 lessons");
  });

  it("allows direct deletion of an unapplied cache with confirmation", async () => {
    const output = outputBuffer();
    const deleteWeeklyCache = vi.fn(async (options) => {
      expect(options).toMatchObject({
        cacheRoot: "/cache/snapshots/dev-cache",
        notesCacheRoot: "/cache",
        allowUnsafe: true,
      });
      return { cacheId: "dev-cache" };
    });

    const result = await runWeeklyCommand(
      {
        mode: "delete",
        coursesEnv,
        cacheRoot: "dev-cache",
        yes: true,
      },
      {
        output: output.stream,
        resolveWeeklyCache: async () => "/cache/snapshots/dev-cache",
        reconcileWeeklyCache: async () => ({
          safeToDelete: false,
          mismatches: [
            {
              component: "cache",
              code: "not-applied",
              message: "Cache has no successful applied marker.",
            },
          ],
        }),
        formatCacheReconciliation: () => "Cache deletion warning",
        deleteWeeklyCache,
      }
    );

    expect(result).toMatchObject({
      status: "deleted",
      cacheRoot: "/cache/snapshots/dev-cache",
      cacheId: "dev-cache",
    });
    expect(output.content).toContain("Cache deletion warning");
  });

  it("lists every known cache for guided deletion", async () => {
    const output = outputBuffer();
    let promptCount = 0;
    const selectPrompt = vi.fn(async (prompt) => {
      promptCount += 1;
      if (promptCount === 1) {
        return "delete";
      }
      if (promptCount === 2) {
        expect(prompt.message).toBe("Cache to delete");
        expect(prompt.choices).toEqual([
          expect.objectContaining({
            value: "/cache/snapshots/incomplete-dev-cache",
            disabled: false,
          }),
        ]);
        return "/cache/snapshots/incomplete-dev-cache";
      }
      return "quit";
    });

    await runWeeklyCommand(
      { mode: "interactive", coursesEnv },
      {
        output: output.stream,
        selectPrompt,
        confirmPrompt: async () => true,
        listWeeklyCaches: async () => [
          {
            cacheId: "incomplete-dev-cache",
            cacheRoot: "/cache/snapshots/incomplete-dev-cache",
            state: { status: "invalid", latestAudit: null },
            noteUpdateCount: null,
            selectable: false,
          },
        ],
        reconcileWeeklyCache: async () => ({
          safeToDelete: false,
          mismatches: [
            {
              component: "cache",
              code: "not-applied",
              message: "Cache has no successful applied marker.",
            },
          ],
        }),
        formatCacheReconciliation: () => "Cache deletion warning",
        deleteWeeklyCache: async () => ({ cacheId: "incomplete-dev-cache" }),
      }
    );

    expect(selectPrompt).toHaveBeenCalledTimes(3);
  });

  it("formats cache lifecycle status", () => {
    expect(
      formatWeeklyStatus({
        cacheRoot: "/cache",
        caches: [
          {
            cacheId: "one",
            status: "ready",
            audit: { errors: 0, warnings: 2 },
            releaseStatus: null,
          },
        ],
      })
    ).toContain("one: ready; 0 errors, 2 warnings");
    expect(
      formatWeeklyStatus({ cacheRoot: "/cache", caches: [] })
    ).toContain("No caches found.");
  });

  it("enforces lifecycle state for an explicitly named cache", async () => {
    await expect(
      runWeeklyCommand(
        {
          mode: "validate",
          coursesEnv,
          cacheRoot: "draft-cache",
        },
        {
          resolveWeeklyCache: async () => "/cache/snapshots/draft-cache",
          loadCacheState: async () => ({ status: "draft" }),
        }
      )
    ).rejects.toThrow("is draft; expected applied");
  });
});
