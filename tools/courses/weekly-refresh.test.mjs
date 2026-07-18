import { describe, expect, it, vi } from "vitest";
import { metadataBehavior, runWeeklyRefresh } from "./weekly-refresh.mjs";

const coursesEnv = {
  canonicalBase: "/canonical",
  notesCacheRoot: "/cache",
};

const report = {
  totals: { updated: 1 },
  missingCanonicalLessonFolders: [
    { title: "Renamed Lesson", expectedLessonDirectoryName: "Renamed Lesson" },
  ],
};

describe("weekly refresh orchestration", () => {
  it("preflights AI before snapshot and returns a review-only prepare report", async () => {
    const calls = [];
    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        grokBin: "/mock/grok",
      },
      {
        preflightGrok: vi.fn(async () => calls.push("preflight")),
        runNotesSnapshot: vi.fn(async () => {
          calls.push("snapshot");
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
            totals: { generated: 1, failed: 0 },
            skipped: [],
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
    const applyBackups = vi.fn(async (options) => {
      calls.push("apply");
      expect(options).toEqual({
        reportPath: "/cache/report.json",
        applySummaries: true,
      });
      return {
        applied: [{}],
        summariesApplied: [{}],
        report,
      };
    });
    const result = await runWeeklyRefresh(
      {
        coursesEnv,
        apply: true,
        reportPath: "/cache/report.json",
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
    expect(result).toMatchObject({
      phase: "apply",
      deployRun: false,
      notesApplied: 1,
      summariesApplied: 1,
      audit: { errors: 0, warnings: 2 },
    });
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
