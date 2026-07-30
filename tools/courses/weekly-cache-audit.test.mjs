import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditWeeklyCache } from "./weekly-cache-audit.mjs";
import {
  createWeeklyCache,
  hashContent,
  loadCacheState,
  recordCacheComponent,
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

async function createAuditableCache() {
  const root = await mkdtemp(path.join(os.tmpdir(), "weekly-audit-test-"));
  temporaryRoots.push(root);
  const canonicalBase = path.join(root, "canonical");
  const notesCacheRoot = path.join(root, "cache");
  const sourceRelativePath =
    "01-Bucket-Genesis1-11/001-Genesis1_1-2_3/001-Genesis1_1-2_3_summary.docx";
  const sourcePath = path.join(canonicalBase, sourceRelativePath);
  const sourceBytes = Buffer.from("docx source");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, sourceBytes);
  const { cacheRoot } = await createWeeklyCache(notesCacheRoot);
  const markdownPath = path.join(
    cacheRoot,
    "documents",
    "lessons",
    "summary.md"
  );
  const markdown = "**Title: Beginnings**\n";
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, markdown);

  const outputs = {
    documents: path.join(cacheRoot, "document-summaries.json"),
    notes: path.join(cacheRoot, "canonical-note-backup-report.json"),
    youtube: path.join(cacheRoot, "playlist.json"),
    inventory: path.join(cacheRoot, "source-inventory.json"),
  };
  await writeJsonAtomic(outputs.documents, {
    recordCount: 1,
    records: [
      {
        kind: "lesson",
        sectionDirectory: "01-Bucket-Genesis1-11",
        lessonDirectory: "001-Genesis1_1-2_3",
        sourcePath: sourceRelativePath,
        sourceHash: hashContent(sourceBytes),
        markdownPath: path.relative(cacheRoot, markdownPath),
        markdownHash: hashContent(markdown),
        videoSummary: "Beginnings",
        error: null,
      },
    ],
  });
  await writeJsonAtomic(outputs.notes, {
    totals: { processed: 0 },
    updates: [],
    missingCanonicalLessonFolders: [],
  });
  await writeJsonAtomic(outputs.youtube, {
    schemaVersion: 2,
    videoCount: 1,
    videos: [
      {
        videoId: "video",
        title: "Week 1",
        position: 1,
        weekNumber: 1,
        lessonSequenceNumber: 1,
      },
    ],
  });
  await writeJsonAtomic(outputs.inventory, {
    sectionCount: 1,
    fileCount: 1,
    sections: [
      {
        directory: "01-Bucket-Genesis1-11",
        files: [
          {
            path:
              "001-Genesis1_1-2_3/001-Genesis1_1-2_3_summary.docx",
            hash: hashContent(sourceBytes),
          },
        ],
      },
    ],
  });

  let state = await loadCacheState(cacheRoot);
  for (const [componentName, outputPath] of Object.entries(outputs)) {
    state = await recordCacheComponent({
      cacheRoot,
      state,
      componentName,
      outputPath,
    });
  }
  return {
    cacheRoot,
    canonicalBase,
    markdownPath,
    sourcePath,
  };
}

describe("weekly cache readiness audit", () => {
  it("marks a complete, unchanged cache ready", async () => {
    const fixture = await createAuditableCache();

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      auditedAt: "2026-07-23T00:00:00.000Z",
    });

    expect(result.audit).toMatchObject({
      ready: true,
      totals: { errors: 0, warnings: 0 },
    });
    expect(result.state.status).toBe("ready");
    expect(result.state.latestAudit.componentsFingerprint).toMatch(
      /^[a-f0-9]{64}$/u
    );
  });

  it("returns to draft when converted Markdown or source files change", async () => {
    const fixture = await createAuditableCache();
    await writeFile(fixture.markdownPath, "**Title: Changed**\n");
    await writeFile(fixture.sourcePath, "changed docx source");

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
    });

    expect(result.audit.ready).toBe(false);
    expect(result.state.status).toBe("draft");
    expect(result.audit.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "summary-source-stale",
        "converted-summary-changed",
        "source-file-stale",
      ])
    );
  });

  it("rejects duplicate YouTube lesson matches and warns on unmatched titles", async () => {
    const fixture = await createAuditableCache();
    const playlistPath = path.join(fixture.cacheRoot, "playlist.json");
    await writeJsonAtomic(playlistPath, {
      schemaVersion: 2,
      videos: [
        {
          videoId: "promo",
          title: "Know Your Bible Promo",
          lessonSequenceNumber: 0,
        },
        {
          videoId: "duplicate-promo",
          title: "Another Promo",
          lessonSequenceNumber: 0,
        },
        {
          videoId: "extra",
          title: "Course Trailer",
          lessonSequenceNumber: null,
        },
      ],
    });
    const state = await loadCacheState(fixture.cacheRoot);
    await recordCacheComponent({
      cacheRoot: fixture.cacheRoot,
      state,
      componentName: "youtube",
      outputPath: playlistPath,
    });

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
    });
    const codes = result.audit.findings.map((finding) => finding.code);

    expect(result.audit.ready).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        "lesson-sequence-duplicate",
        "video-lesson-unmatched",
      ])
    );
  });

  it("rejects malformed directives in staged Apple Notes candidates", async () => {
    const fixture = await createAuditableCache();
    const stagedNotesPath = path.join(fixture.cacheRoot, "staged", "notes.md");
    const canonicalLessonDirectoryPath = path.join(
      fixture.canonicalBase,
      "01-Bucket-Genesis1-11",
      "001-Genesis1_1-2_3"
    );
    const markdown = "TOOL_LINK: https://example.test/ages/\n";
    await mkdir(path.dirname(stagedNotesPath), { recursive: true });
    await mkdir(canonicalLessonDirectoryPath, { recursive: true });
    await writeFile(stagedNotesPath, markdown);
    const reportPath = path.join(
      fixture.cacheRoot,
      "canonical-note-backup-report.json"
    );
    await writeJsonAtomic(reportPath, {
      totals: { processed: 1 },
      updates: [
        {
          title: "Lesson One",
          stagedNotesPath,
          canonicalLessonDirectoryPath,
          sourceMarkdownHash: createHash("md5")
            .update(markdown)
            .digest("hex"),
        },
      ],
      missingCanonicalLessonFolders: [],
    });
    await recordCacheComponent({
      cacheRoot: fixture.cacheRoot,
      state: await loadCacheState(fixture.cacheRoot),
      componentName: "notes",
      outputPath: reportPath,
    });

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
    });

    expect(result.audit.ready).toBe(false);
    expect(result.audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "notes",
          code: "tool-link-invalid",
          lineNumber: 1,
        }),
      ])
    );
  });
});
