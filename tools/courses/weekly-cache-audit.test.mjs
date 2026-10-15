import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditWeeklyCache } from "./weekly-cache-audit.mjs";
import {
  computeComponentsFingerprint,
  createWeeklyCache,
  hashContent,
  loadCacheState,
  recordCacheComponent,
  writeJsonAtomic,
} from "./weekly-cache.mjs";
import { resolvePlaylistVideoMatches } from "./youtube-special-matches.mjs";

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
  const youtubeSpecialMatchesPath = path.join(
    root,
    "youtube-special-matches.json"
  );
  const specialMatches = { schemaVersion: 1, matches: [] };
  await writeJsonAtomic(youtubeSpecialMatchesPath, specialMatches);
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
  await writeJsonAtomic(
    outputs.youtube,
    resolvePlaylistVideoMatches(
      {
        schemaVersion: 3,
        videoCount: 1,
        videos: [
          {
            videoId: "video",
            title: "Week 1",
            position: 1,
          },
        ],
      },
      {
        lessons: [
          {
            sequenceNumber: 1,
            displayTitle: "Genesis 1:1-2:3",
          },
        ],
        specialMatches,
      }
    )
  );
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
    youtubeSpecialMatchesPath,
  };
}

describe("weekly cache readiness audit", () => {
  it("marks a complete, unchanged cache ready", async () => {
    const fixture = await createAuditableCache();

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
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

  it("keeps an applied cache applied after a successful audit", async () => {
    const fixture = await createAuditableCache();
    const appliedAt = "2026-08-20T00:00:00.000Z";
    const state = await loadCacheState(fixture.cacheRoot);
    await writeJsonAtomic(path.join(fixture.cacheRoot, "cache-state.json"), {
      ...state,
      status: "applied",
      applied: {
        appliedAt,
        componentsFingerprint: computeComponentsFingerprint(state.components),
      },
    });

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
    });

    expect(result.state.status).toBe("applied");
    expect(result.state.applied.appliedAt).toBe(appliedAt);
    expect(result.audit.ready).toBe(true);
  });

  it("returns to draft when converted Markdown or source files change", async () => {
    const fixture = await createAuditableCache();
    await writeFile(fixture.markdownPath, "**Title: Changed**\n");
    await writeFile(fixture.sourcePath, "changed docx source");

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
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

  it("returns to draft when special matches change after resolution", async () => {
    const fixture = await createAuditableCache();
    await writeJsonAtomic(fixture.youtubeSpecialMatchesPath, {
      schemaVersion: 1,
      matches: [
        {
          videoId: "later-video",
          lessonSequenceNumber: 1,
          videoTitle: "Later",
          lessonTitle: "Lesson One",
        },
      ],
    });

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
    });

    expect(result.audit.ready).toBe(false);
    expect(result.audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "youtube",
          code: "special-matches-stale",
        }),
      ])
    );
  });

  it("rejects duplicate YouTube lesson matches and warns on unmatched titles", async () => {
    const fixture = await createAuditableCache();
    const playlistPath = path.join(fixture.cacheRoot, "playlist.json");
    await writeJsonAtomic(
      playlistPath,
      resolvePlaylistVideoMatches(
        {
          schemaVersion: 3,
          videos: [
            {
              videoId: "promo",
              title: "Know Your Bible Promo",
            },
            {
              videoId: "duplicate-promo",
              title: "Another Promo",
            },
            {
              videoId: "extra",
              title: "Course Trailer",
            },
          ],
        },
        {
          lessons: [{ sequenceNumber: 0, displayTitle: "Promo" }],
          specialMatches: { schemaVersion: 1, matches: [] },
        }
      )
    );
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
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
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

  it("does not warn when ignored Review videos have no lesson match", async () => {
    const fixture = await createAuditableCache();
    const playlistPath = path.join(fixture.cacheRoot, "playlist.json");
    await writeJsonAtomic(
      playlistPath,
      resolvePlaylistVideoMatches(
        {
          schemaVersion: 3,
          videos: [
            {
              videoId: "week-one",
              title: "Know Your Bible - Week 1",
            },
            {
              videoId: "review",
              title: "Review 8/24/2026",
            },
          ],
        },
        {
          lessons: [{ sequenceNumber: 1, displayTitle: "Lesson One" }],
          specialMatches: { schemaVersion: 1, matches: [] },
        }
      )
    );
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
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
    });

    expect(result.audit.ready).toBe(true);
    expect(result.audit.findings.map((finding) => finding.code)).not.toContain(
      "video-lesson-unmatched"
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
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
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

  it("requires a YouTube refresh when staged notes would match an unmatched video", async () => {
    const fixture = await createAuditableCache();
    const section = "03-Bucket-ExodusLeviticusNumbersDeuteronomy";
    const lesson041 = "041_Exodus18-19_15";
    const lesson042 = "042_Exodus19_16-20";
    const lesson041Directory = path.join(
      fixture.canonicalBase,
      section,
      lesson041
    );
    await mkdir(lesson041Directory, { recursive: true });
    await mkdir(
      path.join(fixture.canonicalBase, section, lesson042),
      { recursive: true }
    );
    await writeFile(
      path.join(lesson041Directory, "notes.md"),
      "# 041_Exodus18-20\n\nNOPUBLISH\n",
      "utf8"
    );
    const staged041 = path.join(
      fixture.cacheRoot,
      "canonical-note-backup-candidates",
      section,
      lesson041,
      "notes.md"
    );
    const staged042 = path.join(
      fixture.cacheRoot,
      "canonical-note-backup-candidates",
      section,
      lesson042,
      "notes.md"
    );
    await mkdir(path.dirname(staged041), { recursive: true });
    await mkdir(path.dirname(staged042), { recursive: true });
    await writeFile(staged041, "# 041_Exodus18-19_15\n", "utf8");
    await writeFile(staged042, "# 042_Exodus19_16-20\n\nNOPUBLISH\n", "utf8");
    const reportPath = path.join(
      fixture.cacheRoot,
      "canonical-note-backup-report.json"
    );
    await writeJsonAtomic(reportPath, {
      totals: { processed: 2 },
      updates: [
        {
          title: lesson041,
          relativeLessonDirectory: `${section}/${lesson041}`,
          stagedNotesPath: staged041,
          canonicalLessonDirectoryPath: lesson041Directory,
          sourceMarkdownHash: createHash("md5")
            .update("# 041_Exodus18-19_15\n")
            .digest("hex"),
        },
        {
          title: lesson042,
          relativeLessonDirectory: `${section}/${lesson042}`,
          stagedNotesPath: staged042,
          canonicalLessonDirectoryPath: path.join(
            fixture.canonicalBase,
            section,
            lesson042
          ),
          sourceMarkdownHash: createHash("md5")
            .update("# 042_Exodus19_16-20\n\nNOPUBLISH\n")
            .digest("hex"),
        },
      ],
      missingCanonicalLessonFolders: [],
    });
    const playlistPath = path.join(fixture.cacheRoot, "playlist.json");
    await writeJsonAtomic(
      playlistPath,
      resolvePlaylistVideoMatches(
        {
          schemaVersion: 3,
          videos: [
            { videoId: "week-one", title: "Know Your Bible - Week 1" },
            { videoId: "iBqmOg8QfRg", title: "Exodus 18-19:15" },
          ],
        },
        {
          lessons: [{ sequenceNumber: 1, displayTitle: "Genesis 1:1-2:3" }],
          specialMatches: { schemaVersion: 1, matches: [] },
        }
      )
    );
    let state = await loadCacheState(fixture.cacheRoot);
    state = await recordCacheComponent({
      cacheRoot: fixture.cacheRoot,
      state,
      componentName: "notes",
      outputPath: reportPath,
    });
    await recordCacheComponent({
      cacheRoot: fixture.cacheRoot,
      state,
      componentName: "youtube",
      outputPath: playlistPath,
    });

    const result = await auditWeeklyCache({
      cacheRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
      youtubeSpecialMatchesPath: fixture.youtubeSpecialMatchesPath,
    });

    expect(result.audit.ready).toBe(false);
    expect(result.audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "youtube",
          code: "youtube-matches-stale",
          message:
            "YouTube lesson matches are stale relative to staged notes. Refresh the YouTube component.",
        }),
      ])
    );
  });
});
