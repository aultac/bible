import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractVideoSummaryTitle,
  lessonSummaryDocumentCandidates,
  loadDocumentSummaries,
  normalizeDocumentMarkdown,
  prepareDocumentSummaries,
  resolveLessonSummaryDocumentPath,
} from "./document-summaries.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("document summary cache", () => {
  it("extracts Title fields from common Word conversion formats", () => {
    expect(extractVideoSummaryTitle("**Title: God Creates**\n")).toBe(
      "God Creates"
    );
    expect(extractVideoSummaryTitle("## __Title: “The Fall”__\n")).toBe(
      "The Fall"
    );
    expect(extractVideoSummaryTitle("Theme: Creation\n")).toBeNull();
    expect(normalizeDocumentMarkdown("One  \r\n\r\n\r\nTwo")).toBe(
      "One\n\nTwo\n"
    );
  });

  it("caches converted section and lesson summaries with source hashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "document-summary-test-"));
    temporaryRoots.push(root);
    const canonicalBase = path.join(root, "canonical");
    const cacheRoot = path.join(root, "cache");
    const sectionName = "01-Bucket-Genesis1-11";
    const lessonName = "001-Genesis1_1-2_3";
    const sectionRoot = path.join(canonicalBase, sectionName);
    const lessonRoot = path.join(sectionRoot, lessonName);
    const sectionDocx = path.join(
      sectionRoot,
      `${sectionName}_summary.docx`
    );
    const lessonDocx = path.join(lessonRoot, `${lessonName}_summary.docx`);
    await mkdir(lessonRoot, { recursive: true });
    await writeFile(sectionDocx, "section source");
    await writeFile(lessonDocx, "lesson source");

    const result = await prepareDocumentSummaries(
      {
        cacheRoot,
        canonicalBase,
        generatedAt: "2026-07-23T00:00:00.000Z",
      },
      {
        convertDocument: async (sourcePath) =>
          sourcePath === lessonDocx
            ? "**Title: Beginnings**\n\nLesson body\n"
            : "# Section body\n",
      }
    );

    expect(result.manifest.recordCount).toBe(2);
    const lessonRecord = result.manifest.records.find(
      (record) => record.kind === "lesson"
    );
    expect(lessonRecord).toMatchObject({
      sectionDirectory: sectionName,
      lessonDirectory: lessonName,
      videoSummary: "Beginnings",
      error: null,
    });
    expect(lessonRecord.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(lessonRecord.markdownHash).toMatch(/^[a-f0-9]{64}$/u);
    await expect(
      readFile(path.join(cacheRoot, lessonRecord.markdownPath), "utf8")
    ).resolves.toContain("Lesson body");
    await expect(loadDocumentSummaries(cacheRoot)).resolves.toEqual(
      result.manifest
    );
  });

  it("resolves underscore summary files for hyphenated Promo and Intro folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "special-summary-test-"));
    temporaryRoots.push(root);
    const canonicalBase = path.join(root, "canonical");
    const cacheRoot = path.join(root, "cache");
    const sectionName = "01-Bucket-Genesis1-11";
    const sectionRoot = path.join(canonicalBase, sectionName);
    const fixtures = [
      ["000-Promo", "000_Promo_summary.docx", "Course preview"],
      ["001-Intro", "001_Intro_summary.docx", "Preparing to read"],
    ];

    for (const [lessonName, fileName] of fixtures) {
      const lessonRoot = path.join(sectionRoot, lessonName);
      await mkdir(lessonRoot, { recursive: true });
      await writeFile(path.join(lessonRoot, fileName), `${lessonName} source`);
    }

    const result = await prepareDocumentSummaries(
      { cacheRoot, canonicalBase },
      {
        convertDocument: async (sourcePath) => {
          const fixture = fixtures.find(([, fileName]) =>
            sourcePath.endsWith(fileName)
          );
          return `**Title: ${fixture?.[2] || "Section"}**\n`;
        },
      }
    );
    const specialRecords = result.manifest.records.filter((record) =>
      /^(000|001)-/u.test(record.lessonDirectory || "")
    );

    expect(specialRecords).toEqual([
      expect.objectContaining({
        lessonDirectory: "000-Promo",
        sourcePath: `${sectionName}/000-Promo/000_Promo_summary.docx`,
        videoSummary: "Course preview",
      }),
      expect.objectContaining({
        lessonDirectory: "001-Intro",
        sourcePath: `${sectionName}/001-Intro/001_Intro_summary.docx`,
        videoSummary: "Preparing to read",
      }),
    ]);
    expect(lessonSummaryDocumentCandidates("000-Promo")).toEqual([
      "000-Promo_summary.docx",
      "000_Promo_summary.docx",
    ]);
  });

  it("rejects ambiguous separator variants instead of choosing one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ambiguous-summary-test-"));
    temporaryRoots.push(root);
    const lessonRoot = path.join(root, "000-Promo");
    await mkdir(lessonRoot, { recursive: true });
    await writeFile(path.join(lessonRoot, "000-Promo_summary.docx"), "one");
    await writeFile(path.join(lessonRoot, "000_Promo_summary.docx"), "two");

    await expect(
      resolveLessonSummaryDocumentPath(lessonRoot, "000-Promo")
    ).rejects.toThrow("Multiple summary documents match 000-Promo");
  });
});
