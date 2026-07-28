import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteWeeklyCache,
  reconcileWeeklyCache,
} from "./weekly-cache-delete.mjs";
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
});

async function createAppliedCacheFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "weekly-delete-test-"));
  temporaryRoots.push(root);
  const notesCacheRoot = path.join(root, "cache");
  const repoRoot = path.join(root, "repo");
  const cache = await createWeeklyCache(notesCacheRoot);
  const relativeLessonDirectory =
    "01-Bucket-Genesis1-11/001-Genesis1_1-2_3";
  const documentManifestPath = path.join(
    cache.cacheRoot,
    "document-summaries.json"
  );
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
  };
  await writeCacheState(cache.cacheRoot, applied);
  return {
    cacheRoot: cache.cacheRoot,
    cacheId: cache.cacheId,
    notesCacheRoot,
    repoRoot,
    lessonManifestPath,
  };
}

describe("safe weekly cache deletion", () => {
  it("reconciles matching outputs and blocks changed video summaries", async () => {
    const fixture = await createAppliedCacheFixture();
    await expect(
      reconcileWeeklyCache({
        cacheRoot: fixture.cacheRoot,
        repoRoot: fixture.repoRoot,
      })
    ).resolves.toMatchObject({ safeToDelete: true, mismatches: [] });

    await writeJsonAtomic(fixture.lessonManifestPath, {
      source: {
        relativeLessonDirectory:
          "01-Bucket-Genesis1-11/001-Genesis1_1-2_3",
      },
      videoSummary: "Changed after apply",
    });
    const changed = await reconcileWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      repoRoot: fixture.repoRoot,
    });
    expect(changed.safeToDelete).toBe(false);
    expect(changed.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "video-summary-mismatch" }),
      ])
    );
  });

  it("writes a tombstone, removes the cache, and repairs latest.json", async () => {
    const fixture = await createAppliedCacheFixture();

    const result = await deleteWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      notesCacheRoot: fixture.notesCacheRoot,
      repoRoot: fixture.repoRoot,
      deletedAt: "2026-07-23T02:00:00.000Z",
    });

    expect(result.cacheId).toBe(fixture.cacheId);
    await expect(stat(fixture.cacheRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(path.join(fixture.notesCacheRoot, "latest.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const tombstone = JSON.parse(
      await readFile(result.tombstonePath, "utf8")
    );
    expect(tombstone).toMatchObject({
      cacheId: fixture.cacheId,
      deletedAt: "2026-07-23T02:00:00.000Z",
      appliedAt: "2026-07-23T00:00:00.000Z",
    });
  });
});
