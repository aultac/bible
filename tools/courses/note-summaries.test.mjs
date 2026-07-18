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
  NOTES_SUMMARY_PROMPT_VERSION,
  buildNotesSummaryPrompt,
  generateNoteSummaries,
  hashPromptTemplate,
  normalizeSummaryResponse,
  wrapSummaryMarkdown,
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
  const summaryPromptPath = path.join(root, "SUMMARY_PROMPT.md");
  await mkdir(canonicalLessonDirectoryPath, { recursive: true });
  await mkdir(stagedLessonDirectory, { recursive: true });
  await writeFile(canonicalNotesPath, "Old lesson notes\n", "utf8");
  await writeFile(stagedNotesPath, stagedNotes, "utf8");
  await writeFile(
    summaryPromptPath,
    "Custom summary prompt.\n\n{{NOTES}}\n\nEnd custom prompt.\n",
    "utf8"
  );
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
    summaryPromptPath,
    reportPath,
  };
}

describe("Grok notes-summary staging", () => {
  it("stages a validated summary once and reuses it idempotently", async () => {
    const fixture = await summaryFixture();
    const runSummary = vi.fn(async ({ prompt }) => {
      expect(prompt).toBe(
        "Custom summary prompt.\n\nNew lesson notes\n\n\nEnd custom prompt."
      );
      return "A factual lesson overview.";
    });
    const preflight = vi.fn(async () => {});
    const progressMessages = [];

    const first = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight,
      promptPath: fixture.summaryPromptPath,
      onProgress: (message) => progressMessages.push(message),
    });
    const second = await generateNoteSummaries({
      reportPath: fixture.reportPath,
      canonicalBase: fixture.canonicalBase,
      runSummary,
      preflight,
      promptPath: fixture.summaryPromptPath,
    });

    expect(first.totals.generated).toBe(1);
    expect(second.totals.skippedUnchanged).toBe(1);
    expect(second.totals.staged).toBe(1);
    expect(runSummary).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(progressMessages).toEqual(
      expect.arrayContaining([
        `Loading note backup report: ${fixture.reportPath}`,
        "Collecting notes-summary candidates.",
        "Grok summary candidates: 1 considered; 1 need Grok call(s); 0 already staged; 0 manual protected; 0 NOPUBLISH skipped; 0 unchanged.",
        "Ready to make 1 Grok call(s) with 120s timeout each.",
        "Grok summary 1/1: 001_Test1-Test2",
        "Grok summary 1/1 complete: 001_Test1-Test2",
        "Grok summary staging complete: 1 generated, 1 staged, 0 failed.",
      ])
    );
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
      promptPath: fixture.summaryPromptPath,
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
      promptPath: fixture.summaryPromptPath,
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
      promptVersion: NOTES_SUMMARY_PROMPT_VERSION,
      promptHash: hashPromptTemplate(
        await readFile(fixture.summaryPromptPath, "utf8")
      ),
    });
  });

  it("builds prompts from a SUMMARY_PROMPT.md-style template", () => {
    expect(
      buildNotesSummaryPrompt("Lesson notes", "Prefix\n{{NOTES}}\nSuffix")
    ).toBe("Prefix\nLesson notes\nSuffix");
    expect(() =>
      buildNotesSummaryPrompt("Lesson notes", "No placeholder")
    ).toThrow("{{NOTES}}");
  });
  it("wraps generated summary Markdown for reviewable files", () => {
    expect(
      wrapSummaryMarkdown(
        "This sentence should wrap into multiple shorter lines while preserving words.",
        32
      )
    ).toBe(
      "This sentence should wrap into\nmultiple shorter lines while\npreserving words."
    );
    expect(
      wrapSummaryMarkdown(
        "- This bullet should wrap with indentation for continuation lines so Markdown remains readable.",
        44
      )
    ).toBe(
      "- This bullet should wrap with indentation\n  for continuation lines so Markdown remains\n  readable."
    );
  });

  it("strips an accidental outer fence but rejects empty or nested fences", () => {
    expect(normalizeSummaryResponse("```markdown\nSummary.\n```")).toBe(
      "Summary.\n"
    );
    expect(
      normalizeSummaryResponse(
        "This generated summary contains enough words to exceed the default wrap width so the resulting Markdown is easier to review in source control."
      )
    ).toBe(
      "This generated summary contains enough words to exceed the default wrap width so the\nresulting Markdown is easier to review in source control.\n"
    );
    expect(() => normalizeSummaryResponse("   ")).toThrow("empty");
    expect(() => normalizeSummaryResponse("Text\n```\ncode\n```")).toThrow(
      "code fence"
    );
  });
});
