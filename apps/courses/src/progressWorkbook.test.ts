import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  createProgressWorkbook,
  createProgressWorkbookBuffer,
  parseProgressWorkbook,
  type ProgressWorkbookLesson,
} from "./progressWorkbook";
import {
  createEmptyProgress,
  recordLessonViewed,
  setLessonCompleted,
} from "./progress";

const FIRST_TIMESTAMP = "2026-07-30T12:00:00.000Z";
const SECOND_TIMESTAMP = "2026-07-30T13:00:00.000Z";
const lessons: ProgressWorkbookLesson[] = [
  {
    id: "lesson-1",
    bookName: "Genesis",
    sectionTitle: "The Beginning",
    title: "Genesis 1",
    canonicalPath: "/genesis/1",
  },
  {
    id: "lesson-2",
    bookName: "Genesis",
    sectionTitle: "The Beginning",
    title: "Genesis 2",
    canonicalPath: "/genesis/2",
  },
];
const validLessonIds = new Set(lessons.map((lesson) => lesson.id));

function asExcelBuffer(bytes: Uint8Array) {
  return bytes as unknown as ExcelJS.Buffer;
}

describe("Excel progress workbooks", () => {
  it("round-trips last-viewed and completed progress", async () => {
    const progress = setLessonCompleted(
      recordLessonViewed(
        createEmptyProgress(),
        "lesson-2",
        FIRST_TIMESTAMP
      ),
      "lesson-1",
      true,
      SECOND_TIMESTAMP
    );
    const buffer = await createProgressWorkbookBuffer(
      progress,
      lessons,
      SECOND_TIMESTAMP
    );
    const imported = await parseProgressWorkbook(buffer, validLessonIds);

    expect(imported).toEqual({
      progress,
      ignoredLessonIds: [],
    });
  });

  it("round-trips an empty backup", async () => {
    const workbook = await createProgressWorkbook(
      createEmptyProgress(),
      lessons,
      FIRST_TIMESTAMP
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Progress Metadata",
      "Completed Lessons",
    ]);
    const buffer = await createProgressWorkbookBuffer(
      createEmptyProgress(),
      lessons,
      FIRST_TIMESTAMP
    );
    const imported = await parseProgressWorkbook(buffer, validLessonIds);

    expect(imported.progress.completedLessons).toEqual({});
    expect(imported.progress.lastViewed).toBeNull();
    expect(imported.progress.updatedAt).toBe(FIRST_TIMESTAMP);
  });

  it("ignores unknown lesson IDs while preserving known rows", async () => {
    const progress = setLessonCompleted(
      setLessonCompleted(
        createEmptyProgress(),
        "lesson-1",
        true,
        FIRST_TIMESTAMP
      ),
      "old-lesson",
      true,
      SECOND_TIMESTAMP
    );
    const buffer = await createProgressWorkbookBuffer(
      progress,
      [
        ...lessons,
        {
          id: "old-lesson",
          bookName: "Archived",
          sectionTitle: "Archived",
          title: "Old lesson",
          canonicalPath: "/archived",
        },
      ],
      SECOND_TIMESTAMP
    );
    const imported = await parseProgressWorkbook(buffer, validLessonIds);

    expect(imported.progress.completedLessons).toEqual({
      "lesson-1": FIRST_TIMESTAMP,
    });
    expect(imported.ignoredLessonIds).toEqual(["old-lesson"]);
  });

  it("rejects malformed schemas and duplicate lesson rows", async () => {
    const missingSheets = new ExcelJS.Workbook();
    missingSheets.addWorksheet("Other");
    const missingBuffer = new Uint8Array(
      await missingSheets.xlsx.writeBuffer()
    );
    await expect(
      parseProgressWorkbook(missingBuffer, validLessonIds)
    ).rejects.toThrow("must contain");

    const progress = setLessonCompleted(
      createEmptyProgress(),
      "lesson-1",
      true,
      FIRST_TIMESTAMP
    );
    const validBuffer = await createProgressWorkbookBuffer(
      progress,
      lessons,
      SECOND_TIMESTAMP
    );
    const duplicateWorkbook = new ExcelJS.Workbook();
    await duplicateWorkbook.xlsx.load(asExcelBuffer(validBuffer));
    const completed = duplicateWorkbook.getWorksheet("Completed Lessons");
    const sourceValues = completed?.getRow(2).values;
    completed?.addRow(sourceValues || []);
    const duplicateBuffer = new Uint8Array(
      await duplicateWorkbook.xlsx.writeBuffer()
    );

    await expect(
      parseProgressWorkbook(duplicateBuffer, validLessonIds)
    ).rejects.toThrow("duplicate lesson ID");

    const invalidMetadataHeaders = new ExcelJS.Workbook();
    await invalidMetadataHeaders.xlsx.load(asExcelBuffer(validBuffer));
    const invalidMetadataSheet = invalidMetadataHeaders.getWorksheet(
      "Progress Metadata"
    );
    if (invalidMetadataSheet) {
      invalidMetadataSheet.getCell("A1").value = "Unexpected";
    }
    const invalidMetadataBuffer = new Uint8Array(
      await invalidMetadataHeaders.xlsx.writeBuffer()
    );

    await expect(
      parseProgressWorkbook(invalidMetadataBuffer, validLessonIds)
    ).rejects.toThrow("unexpected columns");
  });

  it("rejects formula cells rather than evaluating uploaded content", async () => {
    const buffer = await createProgressWorkbookBuffer(
      createEmptyProgress(),
      lessons,
      FIRST_TIMESTAMP
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(buffer));
    const metadata = workbook.getWorksheet("Progress Metadata");
    if (metadata) {
      metadata.getCell("B2").value = {
        formula: "1+0",
        result: 1,
      };
    }
    const formulaBuffer = new Uint8Array(
      await workbook.xlsx.writeBuffer()
    );

    await expect(
      parseProgressWorkbook(formulaBuffer, validLessonIds)
    ).rejects.toThrow("plain value");

    const completedFormulaWorkbook = new ExcelJS.Workbook();
    await completedFormulaWorkbook.xlsx.load(asExcelBuffer(buffer));
    completedFormulaWorkbook
      .getWorksheet("Completed Lessons")
      ?.addRow([
        "lesson-1",
        { formula: "\"Genesis\"", result: "Genesis" },
        "The Beginning",
        "Genesis 1",
        "/genesis/1",
        FIRST_TIMESTAMP,
      ]);
    const completedFormulaBuffer = new Uint8Array(
      await completedFormulaWorkbook.xlsx.writeBuffer()
    );

    await expect(
      parseProgressWorkbook(completedFormulaBuffer, validLessonIds)
    ).rejects.toThrow("plain value");
  });
});
