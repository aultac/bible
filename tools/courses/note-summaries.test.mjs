import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateNoteSummaries,
  normalizeSummaryResponse,
} from "./generate-note-summaries.mjs";
import { applyCanonicalNoteBackups } from "./notes-backups.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function summaryFixture(stagedNotes = "New lesson notes\n") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-summary-")
  );
  temporaryDirectories.push(root);
  const canonicalBase = path.join(root, "canonical");
  const relativeLessonDirectory = path.join(
    "01-Section-Test",
    "001_Test1-Test2"
  );
  const canonicalLessonDirectoryPath = path.join(
    canonicalBase,
    relativeLessonDirectory
  );
  const candidatesRoot = path.join(root, "candidates");
  const stagedLessonDirectory = path.join(
    candidatesRoot,
    relativeLessonDirectory
  );
  const canonicalNotesPath = path.join(
    canonicalLessonDirectoryPath,
    "notes.md"
  );
  const stagedNotesPath = path.join(stagedLessonDirectory, "notes.md");
  const reportPath = path.join(root, "report.json");
  await mkdir(canonicalLessonDirectoryPath, { recursive: true });
  await mkdir(stagedLessonDirectory, { recursive: true });
  await writeFile(canonicalNotesPath, "Old lesson notes\n", "utf8");
  await writeFile(stagedNotesPath, stagedNotes, "utf8");
  const report = {
    schemaVersion: 1,
    candidatesRoot,
    totals: { updated: 1 },
    updates: [
      {
        title: "001_Test1-Test2",
        changeType: "updated",
        canonicalLessonDirectoryPath,
        canonicalNotesPath,
        stagedNotesPath,
        sourceMarkdownHash: createHash("md5")
          .update(stagedNotes)
          .digest("hex"),
      },
    ],
    missingCanonicalLessonFolders: [],
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    canonicalBase,
    canonicalLessonDirectoryPath,
    canonicalNotesPath,
    stagedNotesPath,
    reportPath,
  };
}

describe("Grok notes-summary staging", () => {
  it("stages a validated summary once and reuses it idempotently", async () => {
    const fixture = await summaryFixture();
    const runSummary = vi.fn(async () => "A factual lesson overview.");
    const preflight = vi.fn(async () => {});

    const first = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight,
    });
    const second = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight,
    });

    expect(first.totals.generated).toBe(1);
    expect(second.totals.skippedUnchanged).toBe(1);
    expect(second.totals.staged).toBe(1);
    expect(runSummary).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(
      await readFile(
        path.join(path.dirname(fixture.stagedNotesPath), "notes-summary.md"),
        "utf8"
      )
    ).toBe("A factual lesson overview.\n");
  });

  it("protects manual canonical summaries unless force is explicit", async () => {
    const fixture = await summaryFixture();
    await writeFile(
      path.join(fixture.canonicalLessonDirectoryPath, "notes-summary.md"),
      "Manual summary\n",
      "utf8"
    );
    const runSummary = vi.fn();

    const result = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight: vi.fn(),
    });

    expect(result.totals.skippedManual).toBe(1);
    expect(runSummary).not.toHaveBeenCalled();
  });

  it("never sends NOPUBLISH notes to the model", async () => {
    const fixture = await summaryFixture("Draft NOPUBLISH lesson notes\n");
    const runSummary = vi.fn();
    const preflight = vi.fn();

    const result = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight,
    });

    expect(result.totals.skippedNoPublish).toBe(1);
    expect(runSummary).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });

  it("makes dry runs free of model calls and filesystem staging", async () => {
    const fixture = await summaryFixture();
    const runSummary = vi.fn();
    const preflight = vi.fn();

    const result = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      dryRun: true,
      runSummary,
      preflight,
    });
    const report = JSON.parse(await readFile(fixture.reportPath, "utf8"));

    expect(result.generated).toMatchObject([{ action: "would-generate" }]);
    expect(runSummary).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
    expect(report.summaryUpdates).toBeUndefined();
  });

  it("validates source hashes before applying any reviewed notes or summary", async () => {
    const fixture = await summaryFixture();
    await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary: async () => "Generated summary.",
      preflight: async () => {},
    });
    await writeFile(fixture.stagedNotesPath, "Changed after review\n", "utf8");

    await expect(
      applyCanonicalNoteBackups({ reportPath: fixture.reportPath })
    ).rejects.toThrow("Staged notes changed after review");
    expect(await readFile(fixture.canonicalNotesPath, "utf8")).toBe(
      "Old lesson notes\n"
    );
  });

  it("applies matching notes, summary, and generation metadata together", async () => {
    const fixture = await summaryFixture();
    await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary: async () => "Generated summary.",
      preflight: async () => {},
    });

    const result = await applyCanonicalNoteBackups({
      reportPath: fixture.reportPath,
    });

    expect(result.applied).toHaveLength(1);
    expect(result.summariesApplied).toHaveLength(1);
    expect(
      await readFile(
        path.join(fixture.canonicalLessonDirectoryPath, "notes-summary.md"),
        "utf8"
      )
    ).toBe("Generated summary.\n");
    const metadata = JSON.parse(
      await readFile(
        path.join(
          fixture.canonicalLessonDirectoryPath,
          "notes-summary.meta.json"
        ),
        "utf8"
      )
    );
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      provider: "xAI Grok CLI",
      promptVersion: 1,
    });
  });

  it("strips an accidental outer fence but rejects empty or nested fences", () => {
    expect(normalizeSummaryResponse("```markdown\nSummary.\n```")).toBe(
      "Summary.\n"
    );
    expect(() => normalizeSummaryResponse("   ")).toThrow("empty");
    expect(() => normalizeSummaryResponse("Text\n```\ncode\n```")).toThrow(
      "code fence"
    );
  });
});
