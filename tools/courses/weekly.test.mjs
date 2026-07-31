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
    expect(parseWeeklyArgs(["--build-test"])).toMatchObject({
      mode: "validate",
    });
    expect(parseWeeklyArgs(["--dev"])).toMatchObject({ mode: "dev" });
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
      expect(prompt.choices.slice(0, 5).map((choice) => choice.value)).toEqual([
        "prepare",
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
