import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOnlyWeeklyReleaseChanges,
  computeReleaseFingerprint,
  nextPatchVersion,
  releaseWeeklyUpdate,
  retryWeeklyRelease,
  runWeeklyValidation,
} from "./weekly-release.mjs";
import {
  computeComponentsFingerprint,
  createWeeklyCache,
  loadCacheState,
  recordCacheComponent,
  writeCacheState,
  writeJsonAtomic,
} from "./weekly-cache.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
  vi.restoreAllMocks();
});

async function createReleaseFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "weekly-release-test-"));
  temporaryRoots.push(root);
  const repoRoot = path.join(root, "repo");
  const notesCacheRoot = path.join(root, "cache");
  const cache = await createWeeklyCache(notesCacheRoot);
  const documentManifestPath = path.join(
    cache.cacheRoot,
    "document-summaries.json"
  );
  const relativeLessonDirectory =
    "01-Bucket-Genesis1-11/001-Genesis1_1-2_3";
  await writeJsonAtomic(documentManifestPath, {
    records: [
      {
        kind: "lesson",
        sectionDirectory: "01-Bucket-Genesis1-11",
        lessonDirectory: "001-Genesis1_1-2_3",
        videoSummary: "Beginnings",
      },
    ],
  });
  const lessonManifestPath = path.join(
    repoRoot,
    "apps",
    "courses",
    "content",
    "sections",
    "generated",
    "lesson.json"
  );
  await mkdir(path.dirname(lessonManifestPath), { recursive: true });
  await writeJsonAtomic(lessonManifestPath, {
    source: { relativeLessonDirectory },
    videoSummary: "Beginnings",
  });
  const draft = await recordCacheComponent({
    cacheRoot: cache.cacheRoot,
    state: await loadCacheState(cache.cacheRoot),
    componentName: "documents",
    outputPath: documentManifestPath,
  });
  const applied = {
    ...draft,
    status: "applied",
    applied: {
      appliedAt: "2026-07-23T00:00:00.000Z",
      componentsFingerprint: computeComponentsFingerprint(draft.components),
      notes: [],
      playlist: null,
      documentsFingerprint: draft.components.documents.fingerprint,
    },
    release: {
      validation: {
        validatedAt: "2026-07-23T01:00:00.000Z",
        fingerprint: "validated-fingerprint",
      },
    },
  };
  await writeCacheState(cache.cacheRoot, applied);
  return { cacheRoot: cache.cacheRoot, repoRoot };
}

describe("weekly validation and release", () => {
  it("runs tests, audit, and build before recording a fingerprint", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "weekly-release-test-"));
    temporaryRoots.push(root);
    const cache = await createWeeklyCache(path.join(root, "cache"));
    const runCommand = vi.fn(async () => {});

    const result = await runWeeklyValidation(
      { cacheRoot: cache.cacheRoot },
      {
        runCommand,
        computeFingerprint: async () => "fingerprint",
      }
    );

    expect(runCommand.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ["yarn", ["test:courses"]],
      ["yarn", ["courses:audit"]],
      ["yarn", ["build"]],
    ]);
    expect(result.fingerprint).toBe("fingerprint");
    expect(result.state.release.validation.commands).toEqual([
      "yarn test:courses",
      "yarn courses:audit",
      "yarn build",
    ]);
  });

  it("validates patch versions and weekly-only release paths", () => {
    expect(nextPatchVersion("3.1.9")).toBe("3.1.10");
    expect(() => nextPatchVersion("3.1")).toThrow("semantic version");
    expect(() =>
      assertOnlyWeeklyReleaseChanges([
        "apps/courses/content/lesson.json",
        "apps/courses/src/toolsData.ts",
        "dist/index.html",
      ])
    ).not.toThrow();
    expect(() =>
      assertOnlyWeeklyReleaseChanges([
        "apps/courses/src/toolsData.ts.backup",
      ])
    ).toThrow("unrelated working-tree changes");
    expect(() =>
      assertOnlyWeeklyReleaseChanges(["WEEKLY_WORKFLOW.md"])
    ).toThrow("unrelated working-tree changes");
  });

  it("fingerprints the exact generated tools data file but not siblings", async () => {
    const repoRoot = await mkdtemp(
      path.join(os.tmpdir(), "weekly-release-fingerprint-")
    );
    temporaryRoots.push(repoRoot);
    const toolsDataPath = path.join(
      repoRoot,
      "apps",
      "courses",
      "src",
      "toolsData.ts"
    );
    await mkdir(path.dirname(toolsDataPath), { recursive: true });
    await writeFile(toolsDataPath, "export const toolsData = [] as const;\n");
    const first = await computeReleaseFingerprint(repoRoot);

    await writeFile(
      toolsDataPath,
      "export const toolsData = [{ path: '/ages/' }] as const;\n"
    );
    const second = await computeReleaseFingerprint(repoRoot);
    await writeFile(`${toolsDataPath}.backup`, "unrelated\n");
    const third = await computeReleaseFingerprint(repoRoot);

    expect(second).not.toBe(first);
    expect(third).toBe(second);
  });

  it("commits, pushes, and deploys only after a matching validation", async () => {
    const fixture = await createReleaseFixture();
    const gitCalls = [];
    const exec = vi.fn(async (_command, args) => {
      gitCalls.push(args);
      if (args[0] === "branch") {
        return { stdout: "main\n" };
      }
      if (args[0] === "rev-parse" && args.includes("MERGE_HEAD")) {
        throw new Error("MERGE_HEAD not found");
      }
      if (args[0] === "status") {
        return { stdout: " M apps/courses/content/sections/generated/lesson.json\0" };
      }
      if (args[0] === "rev-parse" && args.includes("HEAD")) {
        return { stdout: "abc123\n" };
      }
      return { stdout: "" };
    });
    const runCommand = vi.fn(async () => {});

    const result = await releaseWeeklyUpdate(
      {
        cacheRoot: fixture.cacheRoot,
        commitMessage: "Publish weekly course",
      },
      {
        repoRoot: fixture.repoRoot,
        computeFingerprint: async () => "validated-fingerprint",
        bumpVersion: async () => ({
          previousVersion: "3.1.3",
          version: "3.1.4",
        }),
        exec,
        runCommand,
      }
    );

    expect(result).toMatchObject({
      version: "3.1.4",
      commit: "abc123",
      branch: "main",
      status: "deployed",
    });
    expect(gitCalls).toEqual(
      expect.arrayContaining([
        ["commit", "-m", "Publish weekly course"],
        ["push", "origin", "main"],
      ])
    );
    expect(gitCalls.find((call) => call[0] === "add")).toContain(
      "apps/courses/src/toolsData.ts"
    );
    expect(runCommand).toHaveBeenCalledWith(
      "yarn",
      ["deploy:dist"],
      { cwd: fixture.repoRoot }
    );
    expect((await loadCacheState(fixture.cacheRoot)).release.status).toBe(
      "deployed"
    );
  });

  it("allows push and deployment retries only from recorded release state", async () => {
    const fixture = await createReleaseFixture();
    const state = await loadCacheState(fixture.cacheRoot);
    await writeCacheState(fixture.cacheRoot, {
      ...state,
      release: {
        ...state.release,
        commit: "abc123",
        branch: "main",
        status: "committed",
      },
    });
    const exec = vi.fn(async () => ({ stdout: "" }));
    const runCommand = vi.fn(async () => {});

    await expect(
      retryWeeklyRelease(
        { cacheRoot: fixture.cacheRoot, stage: "deploy" },
        { repoRoot: fixture.repoRoot, exec, runCommand }
      )
    ).rejects.toThrow("Push the committed release");
    await expect(
      retryWeeklyRelease(
        { cacheRoot: fixture.cacheRoot, stage: "push" },
        { repoRoot: fixture.repoRoot, exec, runCommand }
      )
    ).resolves.toMatchObject({ status: "pushed" });
    await expect(
      retryWeeklyRelease(
        { cacheRoot: fixture.cacheRoot, stage: "deploy" },
        { repoRoot: fixture.repoRoot, exec, runCommand }
      )
    ).resolves.toMatchObject({ status: "deployed" });
  });
});
