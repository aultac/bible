import { describe, expect, it, vi } from "vitest";
import {
  formatWeeklyStatus,
  parseWeeklyArgs,
  runWeeklyCommand,
} from "./weekly.mjs";

const coursesEnv = {
  canonicalBase: "/canonical",
  notesCacheRoot: "/cache",
};

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
