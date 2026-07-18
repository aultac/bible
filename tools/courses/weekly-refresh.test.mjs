import { describe, expect, it, vi } from "vitest";
import {
  formatWeeklyRefreshResult,
  metadataBehavior,
  runWeeklyRefresh,
} from "./weekly-refresh.mjs";

const coursesEnv = {
  canonicalBase: "/canonical",
  notesCacheRoot: "/cache",
};

const report = {
  totals: {
    processed: 5,
    new: 1,
    updated: 1,
    unchanged: 1,
    missingCanonicalLessonFolder: 1,
  },
  updates: [
    {
      title: "New Note",
      changeType: "new",
      relativeLessonDirectory: "01-Section-Test/001_Test1-Test2",
      stagedNotesPath: "/cache/candidates/01-Section-Test/001_Test1-Test2/notes.md",
      canonicalNotesPath: "/canonical/01-Section-Test/001_Test1-Test2/notes.md",
    },
    {
      title: "Updated Note",
      changeType: "updated",
      relativeLessonDirectory: "01-Section-Test/002_Test3-Test4",
      stagedNotesPath: "/cache/candidates/01-Section-Test/002_Test3-Test4/notes.md",
      canonicalNotesPath: "/canonical/01-Section-Test/002_Test3-Test4/notes.md",
    },
  ],
  unchangedNotes: [
    {
      title: "Already Current",
      relativeLessonDirectory: "01-Section-Test/003_Test5-Test6",
      canonicalNotesPath: "/canonical/01-Section-Test/003_Test5-Test6/notes.md",
    },
  ],
  missingCanonicalLessonFolders: [
    { title: "Renamed Lesson", expectedLessonDirectoryName: "Renamed Lesson" },
  ],
};

describe("weekly refresh orchestration", () => {
  it("preflights AI before snapshot and returns a review-only prepare report", async () => {
    const calls = [];
    const progressMessages = [];
    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        grokBin: "/mock/grok",
        onProgress: (message) => progressMessages.push(message),
      },
      {
        preflightGrok: vi.fn(async () => calls.push("preflight")),
        runNotesSnapshot: vi.fn(async (options) => {
          calls.push("snapshot");
          expect(options).toEqual({ streamStderr: true });
          return {
            snapshotRoot: "/cache/snapshot",
            canonicalNoteBackupReportPath: "/cache/report.json",
            canonicalNoteBackupCandidatesRoot: "/cache/candidates",
          };
        }),
        loadReport: vi.fn(async () => {
          calls.push("report");
          return report;
        }),
        generateNoteSummaries: vi.fn(async () => {
          calls.push("summaries");
          return {
            totals: {
              generated: 1,
              staged: 2,
              skippedManual: 1,
              skippedNoPublish: 1,
              skippedUnchanged: 2,
              failed: 0,
            },
            generated: [
              {
                title: "New Note",
                stagedSummaryPath:
                  "/cache/candidates/01-Section-Test/001_Test1-Test2/notes-summary.md",
              },
            ],
            skipped: [
              {
                title: "Already Staged",
                reason: "unchanged-staged",
                stagedSummaryPath:
                  "/cache/candidates/01-Section-Test/004_Test7-Test8/notes-summary.md",
              },
              {
                title: "Already Current",
                reason: "unchanged-canonical",
                canonicalSummaryPath:
                  "/canonical/01-Section-Test/003_Test5-Test6/notes-summary.md",
              },
              {
                title: "Manual Summary",
                reason: "manual-summary",
                canonicalSummaryPath:
                  "/canonical/01-Section-Test/005_Test9-Test10/notes-summary.md",
              },
              {
                title: "Private Draft",
                reason: "NOPUBLISH",
                publishReasons: [{ type: "filename", path: "NOPUBLISH" }],
              },
            ],
            failures: [],
          };
        }),
      }
    );

    expect(calls).toEqual(["preflight", "snapshot", "report", "summaries"]);
    expect(result).toMatchObject({
      phase: "prepare",
      deployRun: false,
      reviewRequired: true,
      reportPath: "/cache/report.json",
      summaryTotals: { generated: 1, failed: 0 },
    });
    expect(result.review.applyPreview).toMatchObject({
      notesToApply: 2,
      notesToCreate: 1,
      notesToUpdate: 1,
      summariesToApply: 2,
      willBuild: false,
      willDeploy: false,
    });
    expect(result.review.noteBackups.alreadyCurrent).toHaveLength(1);
    expect(result.review.notesSummaries.manualProtected).toHaveLength(1);
    expect(result.review.notesSummaries.noPublishSkipped).toHaveLength(1);
    expect(progressMessages).toEqual(
      expect.arrayContaining([
        'Checking Grok CLI and authentication with "/mock/grok".',
        "Grok CLI and authentication check succeeded.",
        "Exporting Apple Notes and preparing notes.md candidates.",
        "Apple Notes export complete: unknown note(s); report /cache/report.json.",
        "Preparing Grok notes-summary.md candidates.",
        "Grok summary generation complete: 1 generated, 2 staged, 0 failed.",
      ])
    );
    expect(formatWeeklyRefreshResult(result)).toContain(
      "What `yarn courses:weekly --apply` will do"
    );
    expect(formatWeeklyRefreshResult(result)).toContain(
      "Copy 2 notes.md candidate(s): 1 new, 1 updated."
    );
    expect(formatWeeklyRefreshResult(result)).toContain(
      "Already current notes; --apply will leave them alone: 1"
    );
    expect(result.next).toContain("courses:weekly --apply");
    expect(result.metadataBehavior.unmatchedCandidates).toHaveLength(1);
  });

  it("allows a prepare phase that never preflights or invokes AI", async () => {
    const preflightGrok = vi.fn();
    const generateNoteSummaries = vi.fn();
    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        skipAi: true,
      },
      {
        preflightGrok,
        runNotesSnapshot: async () => ({
          snapshotRoot: "/cache/snapshot",
          canonicalNoteBackupReportPath: "/cache/report.json",
          canonicalNoteBackupCandidatesRoot: "/cache/candidates",
        }),
        loadReport: async () => report,
        generateNoteSummaries,
      }
    );

    expect(preflightGrok).not.toHaveBeenCalled();
    expect(generateNoteSummaries).not.toHaveBeenCalled();
    expect(result.summaryTotals).toBeNull();
  });

  it("applies reviewed candidates before regeneration and audit without deploying", async () => {
    const calls = [];
    const progressMessages = [];
    const applyBackups = vi.fn(async (options) => {
      calls.push("apply");
      expect(options).toEqual({
        reportPath: "/cache/report.json",
        applySummaries: true,
      });
      return {
        applied: [
          {
            title: "Updated Note",
            canonicalNotesPath:
              "/canonical/01-Section-Test/002_Test3-Test4/notes.md",
          },
        ],
        summariesApplied: [
          {
            title: "Updated Note",
            canonicalSummaryPath:
              "/canonical/01-Section-Test/002_Test3-Test4/notes-summary.md",
          },
        ],
        report,
      };
    });
    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        apply: true,
        reportPath: "/cache/report.json",
        onProgress: (message) => progressMessages.push(message),
      },
      {
        applyBackups,
        syncContent: vi.fn(async () => {
          calls.push("sync");
          return { lessonCount: 1 };
        }),
        auditCourses: vi.fn(async () => {
          calls.push("audit");
          return { totals: { errors: 0, warnings: 2 } };
        }),
      }
    );

    expect(calls).toEqual(["apply", "sync", "audit"]);
    expect(progressMessages).toEqual(
      expect.arrayContaining([
        "Applying reviewed candidates from /cache/report.json.",
        "Applied 1 notes.md file(s) and 1 notes-summary.md file(s).",
        "Regenerating course content, assets, maps, playlist matches, and search.",
        "Course content regenerated: 1 published lesson(s), 0 unpublished lesson(s).",
        "Running offline course audit.",
        "Course audit complete: 0 error(s), 2 warning(s).",
      ])
    );
    expect(result).toMatchObject({
      phase: "apply",
      deployRun: false,
      notesApplied: 1,
      summariesApplied: 1,
      audit: { errors: 0, warnings: 2 },
    });
    expect(formatWeeklyRefreshResult(result)).toContain(
      "Applied notes.md files: 1"
    );
    expect(formatWeeklyRefreshResult(result)).toContain("Build/deploy: not run.");
  });

  it("retains summaries in skip-AI apply mode and fails on audit errors", async () => {
    const applyBackups = vi.fn(async () => ({
      applied: [],
      summariesApplied: [],
      report,
    }));

    await expect(
      runWeeklyRefresh(
        {
          coursesEnv,
          apply: true,
          skipAi: true,
          reportPath: "/cache/report.json",
        },
        {
          applyBackups,
          syncContent: async () => ({ lessonCount: 1 }),
          auditCourses: async () => ({
            totals: { errors: 1, warnings: 0 },
          }),
        }
      )
    ).rejects.toThrow("audit found 1 error");
    expect(applyBackups).toHaveBeenCalledWith({
      reportPath: "/cache/report.json",
      applySummaries: false,
    });
  });

  it("explains metadata preservation and rename limits", () => {
    const behavior = metadataBehavior(report);
    expect(behavior.preserved).toContain("folder path is unchanged");
    expect(behavior.renamed).toContain("new key/slug");
  });
});
