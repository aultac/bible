import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatWeeklyRefreshResult,
  runWeeklyRefresh,
} from "./weekly-refresh.mjs";
import { getWeeklyStatus } from "./weekly.mjs";
import {
  computeComponentsFingerprint,
  createWeeklyCache,
  loadCacheState,
  recordCacheComponent,
  writeCacheState,
  writeJsonAtomic,
} from "./weekly-cache.mjs";

const temporaryRoots = [];
async function mutateCacheState(cacheRoot, update) {
  const nextState = update(await loadCacheState(cacheRoot));
  await writeCacheState(cacheRoot, nextState);
  return nextState;
}

async function makeEnvironment() {
  const root = await mkdtemp(path.join(os.tmpdir(), "weekly-refresh-test-"));
  temporaryRoots.push(root);
  const canonicalBase = path.join(root, "canonical");
  const notesCacheRoot = path.join(root, "cache");
  await mkdir(canonicalBase, { recursive: true });
  await mkdir(notesCacheRoot, { recursive: true });
  return {
    root,
    canonicalBase,
    notesCacheRoot,
    notesAccount: "iCloud",
    notesFolder: "Know Your Bible",
    youtubePlaylistUrl: "https://www.youtube.com/playlist?list=test",
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
  vi.restoreAllMocks();
});

describe("weekly cache preparation and apply", () => {
  it("prepares every cache component and audits the result", async () => {
    const coursesEnv = await makeEnvironment();
    const progress = [];
    const previousCache = await createWeeklyCache(coursesEnv.notesCacheRoot, {
      now: new Date("2026-07-22T00:00:00.000Z"),
    });
    await writeJsonAtomic(
      path.join(previousCache.cacheRoot, "manifest.json"),
      { notes: [] }
    );

    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        onProgress: (message) => progress.push(message),
      },
      {
        prepareDocumentSummaries: async ({ cacheRoot }) => {
          const records = [
            {
              kind: "lesson",
              sectionDirectory: "section_01",
              lessonDirectory: "lesson_01",
              videoSummary: "A title",
            },
          ];
          const manifest = { recordCount: records.length, records };
          const manifestPath = path.join(
            cacheRoot,
            "document-summaries.json"
          );
          await writeJsonAtomic(manifestPath, manifest);
          return { manifest, manifestPath };
        },
        createNotesSnapshot: async ({ output, previousSnapshotRoot }) => {
          expect(previousSnapshotRoot).toBe(previousCache.cacheRoot);
          const snapshotRoot = path.join(output, "snapshots", "test");
          const stagedNote = path.join(snapshotRoot, "notes", "note.html");
          await mkdir(path.dirname(stagedNote), { recursive: true });
          await writeFile(stagedNote, "<div>Note</div>\n");
          await writeJsonAtomic(path.join(snapshotRoot, "manifest.json"), {
            notes: [{ title: "Lesson One", bodyPath: "notes/note.html" }],
          });
          await writeFile(
            path.join(snapshotRoot, "titles.txt"),
            "Lesson One\n"
          );
          return {
            snapshotRoot,
            exportStats: { exported: 0, reused: 1 },
          };
        },
        prepareCanonicalNoteBackups: async ({ snapshotRoot }) => {
          const report = {
            snapshotRoot,
            totals: {
              processed: 1,
              updated: 0,
              new: 0,
              unchanged: 1,
            },
            updates: [],
          };
          const reportPath = path.join(
            snapshotRoot,
            "canonical-note-backup-report.json"
          );
          await writeJsonAtomic(reportPath, report);
          return { report, reportPath };
        },
        fetchPlaylistSnapshot: async () => ({
          playlistId: "playlist",
          videoCount: 1,
          videos: [{ videoId: "video", title: "Lesson One" }],
        }),
        prepareSourceInventory: async ({ cacheRoot }) => {
          const inventory = {
            sectionCount: 1,
            fileCount: 1,
            sections: [],
          };
          const inventoryPath = path.join(cacheRoot, "source-inventory.json");
          await writeJsonAtomic(inventoryPath, inventory);
          return { inventory, inventoryPath };
        },
        auditWeeklyCache: async ({ cacheRoot }) => {
          const state = await mutateCacheState(cacheRoot, (current) => ({
            ...current,
            status: "ready",
            latestAudit: {
              auditedAt: "2026-07-23T00:00:00.000Z",
              ready: true,
              errors: 0,
              warnings: 0,
              componentsFingerprint: computeComponentsFingerprint(
                current.components
              ),
            },
          }));
          return {
            cacheRoot,
            state,
            audit: {
              ready: true,
              totals: { errors: 0, warnings: 0 },
              findings: [],
            },
          };
        },
      }
    );

    expect(result.phase).toBe("prepare");
    expect(result.state.status).toBe("ready");
    expect(Object.keys(result.state.components).sort()).toEqual([
      "documents",
      "inventory",
      "notes",
      "youtube",
    ]);
    expect(progress).toContain("Auditing the prepared cache.");
    expect(progress).toContain(
      "Apple Notes bodies: 0 exported, 1 reused."
    );
    expect(progress).toContain(
      "Canonical notes comparison: 0 staged, 1 unchanged."
    );
    expect(formatWeeklyRefreshResult(result)).toContain(
      "Next: apply this cache"
    );
    await expect(
      readFile(path.join(result.cacheRoot, "playlist.json"), "utf8")
    ).resolves.toContain('"videoId": "video"');
  });

  it("applies only audited cached inputs and records applied state", async () => {
    const coursesEnv = await makeEnvironment();
    const { cacheRoot } = await createWeeklyCache(coursesEnv.notesCacheRoot);
    await writeJsonAtomic(path.join(cacheRoot, "document-summaries.json"), {
      records: [
        {
          kind: "lesson",
          sectionDirectory: "section_01",
          lessonDirectory: "lesson_01",
          videoSummary: "Cached title",
        },
      ],
    });
    await writeJsonAtomic(path.join(cacheRoot, "playlist.json"), {
      playlistId: "playlist",
      videos: [{ videoId: "cached-video", title: "Cached title" }],
    });
    await writeJsonAtomic(
      path.join(cacheRoot, "canonical-note-backup-report.json"),
      { updates: [] }
    );

    for (const component of [
      "documents",
      "notes",
      "youtube",
      "inventory",
    ]) {
      const outputPath = path.join(cacheRoot, `${component}-component.json`);
      await writeJsonAtomic(outputPath, { component });
      const state = await loadCacheState(cacheRoot);
      await recordCacheComponent({
        cacheRoot,
        state,
        componentName: component,
        outputPath,
      });
    }
    const draft = await loadCacheState(cacheRoot);
    await mutateCacheState(cacheRoot, (state) => ({
      ...state,
      status: "ready",
      latestAudit: {
        auditedAt: "2026-07-23T00:00:00.000Z",
        ready: true,
        errors: 0,
        warnings: 0,
        componentsFingerprint: computeComponentsFingerprint(draft.components),
      },
    }));

    const applyCanonicalNoteBackups = vi.fn(async () => ({
      report: { updates: [] },
      applied: [],
    }));
    const toolsDataPath = path.join(coursesEnv.root, "toolsData.ts");
    await writeFile(toolsDataPath, "export const toolsData = [] as const;\n");
    const syncCoursesContent = vi.fn(async (options) => {
      expect(options.playlistSnapshot.videos[0].videoId).toBe("cached-video");
      expect(options.documentSummaries.records[0].videoSummary).toBe(
        "Cached title"
      );
      expect(options.documentCacheRoot).toBe(cacheRoot);
      return {
        sectionCount: 1,
        lessonCount: 1,
        matchedYoutubeLessons: 1,
        toolsDataPath,
      };
    });
    const auditCourses = vi.fn(async () => ({
      totals: { errors: 0, warnings: 0 },
    }));

    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        apply: true,
        cacheRoot,
      },
      {
        applyCanonicalNoteBackups,
        syncCoursesContent,
        auditCourses,
      }
    );

    expect(result.phase).toBe("apply");
    expect(result.state.status).toBe("applied");
    expect(result.state.applied.componentsFingerprint).toBeTruthy();
    expect(result.state.applied.toolsData).toMatchObject({
      path: toolsDataPath,
    });
    expect(result.state.applied.toolsData.hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(applyCanonicalNoteBackups).toHaveBeenCalledTimes(1);
    expect(syncCoursesContent).toHaveBeenCalledTimes(1);
    expect(auditCourses).toHaveBeenCalledTimes(1);
  });

  it("rejects apply when the ready audit no longer matches components", async () => {
    const coursesEnv = await makeEnvironment();
    const { cacheRoot } = await createWeeklyCache(coursesEnv.notesCacheRoot);
    await mutateCacheState(cacheRoot, (state) => ({
      ...state,
      status: "ready",
      latestAudit: {
        ready: true,
        errors: 0,
        warnings: 0,
        componentsFingerprint: "stale",
      },
    }));

    await expect(
      runWeeklyRefresh({ coursesEnv, apply: true, cacheRoot })
    ).rejects.toThrow("changed after its successful audit");
  });

  it("treats reapplying an applied cache as a no-op", async () => {
    const coursesEnv = await makeEnvironment();
    const { cacheRoot } = await createWeeklyCache(coursesEnv.notesCacheRoot);
    await mutateCacheState(cacheRoot, (state) => ({
      ...state,
      status: "applied",
      applied: {
        appliedAt: "2026-07-23T00:00:00.000Z",
        componentsFingerprint: computeComponentsFingerprint(state.components),
      },
    }));
    const applyCanonicalNoteBackups = vi.fn();

    const result = await runWeeklyRefresh(
      { coursesEnv, apply: true, cacheRoot },
      { applyCanonicalNoteBackups }
    );

    expect(result).toMatchObject({
      phase: "apply",
      alreadyApplied: true,
      notesApplied: 0,
    });
    expect(formatWeeklyRefreshResult(result)).toContain(
      "already applied. No files were changed."
    );
    expect(applyCanonicalNoteBackups).not.toHaveBeenCalled();
  });

  it("summarizes lifecycle status for all caches", async () => {
    const coursesEnv = await makeEnvironment();
    const one = await createWeeklyCache(coursesEnv.notesCacheRoot, {
      now: new Date("2026-07-23T01:00:00.000Z"),
    });
    await mutateCacheState(one.cacheRoot, (state) => ({
      ...state,
      status: "ready",
      latestAudit: { errors: 0, warnings: 1 },
    }));

    const status = await getWeeklyStatus(coursesEnv, {
      listWeeklyCaches: async () => [
        {
          cacheId: one.cacheId,
          cacheRoot: one.cacheRoot,
          state: await loadCacheState(one.cacheRoot),
          noteUpdateCount: 0,
        },
      ],
    });

    expect(status.caches).toHaveLength(1);
    expect(status.caches[0]).toMatchObject({
      cacheId: one.cacheId,
      status: "ready",
      audit: { errors: 0, warnings: 1 },
    });
  });
});
