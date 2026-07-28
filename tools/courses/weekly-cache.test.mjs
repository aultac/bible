import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeComponentsFingerprint,
  createWeeklyCache,
  listWeeklyCaches,
  loadCacheState,
  recordCacheComponent,
  resolveWeeklyCache,
} from "./weekly-cache.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("weekly cache lifecycle", () => {
  it("creates, lists, and resolves explicit cache IDs safely", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "weekly-cache-test-"));
    temporaryRoots.push(root);
    const first = await createWeeklyCache(root, {
      now: new Date("2026-07-23T01:02:03.000Z"),
    });
    const second = await createWeeklyCache(root, {
      now: new Date("2026-07-23T01:02:03.000Z"),
    });

    expect(second.cacheId).toBe(`${first.cacheId}-1`);
    expect((await listWeeklyCaches(root)).map((cache) => cache.cacheId)).toEqual(
      [second.cacheId, first.cacheId]
    );
    await expect(resolveWeeklyCache(root, first.cacheId)).resolves.toBe(
      first.cacheRoot
    );
    await expect(resolveWeeklyCache(root, "../outside")).rejects.toThrow(
      "inside"
    );
    const latest = JSON.parse(
      await readFile(path.join(root, "latest.json"), "utf8")
    );
    expect(latest.latestSnapshotDir).toBe(
      `snapshots/${second.cacheId}`
    );
  });

  it("records output fingerprints and invalidates previous readiness", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "weekly-cache-test-"));
    temporaryRoots.push(root);
    const cache = await createWeeklyCache(root);
    const outputPath = path.join(cache.cacheRoot, "playlist.json");
    await writeFile(outputPath, '{"videos":[{"videoId":"one"}]}\n');

    const state = await recordCacheComponent({
      cacheRoot: cache.cacheRoot,
      state: {
        ...cache.state,
        status: "ready",
        latestAudit: { ready: true },
      },
      componentName: "youtube",
      outputPath,
      summary: { videos: 1 },
      updatedAt: "2026-07-23T00:00:00.000Z",
    });

    expect(state.status).toBe("draft");
    expect(state.latestAudit).toBeNull();
    expect(state.components.youtube.summary).toEqual({ videos: 1 });
    expect(state.components.youtube.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(computeComponentsFingerprint(state.components)).toMatch(
      /^[a-f0-9]{64}$/u
    );
    await expect(loadCacheState(cache.cacheRoot)).resolves.toEqual(state);
  });
});
