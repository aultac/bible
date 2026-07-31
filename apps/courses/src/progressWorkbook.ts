import ExcelJS from "exceljs";
import {
  normalizeProgress,
  PROGRESS_SCHEMA_VERSION,
  type CourseProgress,
} from "./progress";

export const MAX_PROGRESS_FILE_BYTES = 2_000_000;
const MAX_METADATA_ROWS = 50;
const MAX_COMPLETED_LESSON_ROWS = 2_000;
const METADATA_SHEET_NAME = "Progress Metadata";
const COMPLETED_SHEET_NAME = "Completed Lessons";
const METADATA_HEADERS = ["Key", "Value"] as const;

const COMPLETED_HEADERS = [
  "Lesson ID",
  "Book",
  "Section",
  "Title",
  "Canonical Path",
  "Completed At",
] as const;

export interface ProgressWorkbookLesson {
  id: string;
  bookName: string;
  sectionTitle: string;
  title: string;
  canonicalPath: string;
}

export interface ImportedProgressWorkbook {
  progress: CourseProgress;
  ignoredLessonIds: string[];
}

function normalizeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid progress timestamp: ${value || "(empty)"}.`);
  }
  return date.toISOString();
}

function readScalarCell(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  throw new Error(
    `Progress workbook cell ${cell.address} must contain a plain value, not a formula or rich object.`
  );
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF183246" },
  };
}

function metadataRows(
  progress: CourseProgress,
  lessonById: ReadonlyMap<string, ProgressWorkbookLesson>,
  exportedAt: string
) {
  const lastViewedLesson = progress.lastViewed
    ? lessonById.get(progress.lastViewed.lessonId)
    : null;

  return [
    ["Schema Version", PROGRESS_SCHEMA_VERSION],
    ["Exported At", exportedAt],
    ["Updated At", progress.updatedAt || ""],
    ["Last Viewed Lesson ID", progress.lastViewed?.lessonId || ""],
    ["Last Viewed Path", lastViewedLesson?.canonicalPath || ""],
    ["Last Viewed At", progress.lastViewed?.viewedAt || ""],
  ];
}

export async function createProgressWorkbook(
  progress: CourseProgress,
  lessons: readonly ProgressWorkbookLesson[],
  exportedAt = new Date().toISOString()
) {
  const normalized = normalizeProgress(progress);
  const normalizedExportedAt = normalizeTimestamp(exportedAt);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Know Your Bible";
  workbook.created = new Date(normalizedExportedAt);
  workbook.modified = new Date(normalizedExportedAt);

  const metadata = workbook.addWorksheet(METADATA_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  metadata.addRow(["Key", "Value"]);
  for (const row of metadataRows(
    normalized,
    lessonById,
    normalizedExportedAt
  )) {
    metadata.addRow(row);
  }
  metadata.columns = [{ width: 28 }, { width: 48 }];
  styleHeader(metadata.getRow(1));

  const completed = workbook.addWorksheet(COMPLETED_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  completed.addRow([...COMPLETED_HEADERS]);
  for (const lesson of lessons) {
    const completedAt = normalized.completedLessons[lesson.id];
    if (!completedAt) {
      continue;
    }
    completed.addRow([
      lesson.id,
      lesson.bookName,
      lesson.sectionTitle,
      lesson.title,
      lesson.canonicalPath,
      completedAt,
    ]);
  }
  completed.columns = [
    { width: 34 },
    { width: 18 },
    { width: 30 },
    { width: 38 },
    { width: 30 },
    { width: 28 },
  ];
  completed.autoFilter = {
    from: "A1",
    to: `F${Math.max(completed.rowCount, 1)}`,
  };
  styleHeader(completed.getRow(1));

  return workbook;
}

export async function createProgressWorkbookBuffer(
  progress: CourseProgress,
  lessons: readonly ProgressWorkbookLesson[],
  exportedAt = new Date().toISOString()
) {
  const workbook = await createProgressWorkbook(
    progress,
    lessons,
    exportedAt
  );
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function validateHeaders(
  worksheet: ExcelJS.Worksheet,
  expectedHeaders: readonly string[]
) {
  const actualHeaders = expectedHeaders.map((_, index) =>
    readScalarCell(worksheet.getCell(1, index + 1))
  );
  if (
    actualHeaders.some(
      (header, index) => header !== expectedHeaders[index]
    )
  ) {
    throw new Error(
      `The "${worksheet.name}" sheet has unexpected columns.`
    );
  }
}

export async function parseProgressWorkbook(
  data: ArrayBuffer | Uint8Array,
  validLessonIds: ReadonlySet<string>
): Promise<ImportedProgressWorkbook> {
  if (data.byteLength > MAX_PROGRESS_FILE_BYTES) {
    throw new Error("Progress workbook is larger than 2 MB.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data as ExcelJS.Buffer);
  } catch {
    throw new Error("The selected file is not a readable XLSX workbook.");
  }

  const metadata = workbook.getWorksheet(METADATA_SHEET_NAME);
  const completed = workbook.getWorksheet(COMPLETED_SHEET_NAME);
  if (!metadata || !completed) {
    throw new Error(
      `Progress workbook must contain "${METADATA_SHEET_NAME}" and "${COMPLETED_SHEET_NAME}" sheets.`
    );
  }
  if (metadata.rowCount > MAX_METADATA_ROWS) {
    throw new Error("Progress workbook contains too many metadata rows.");
  }
  if (completed.rowCount - 1 > MAX_COMPLETED_LESSON_ROWS) {
    throw new Error("Progress workbook contains too many completed lessons.");
  }

  validateHeaders(metadata, METADATA_HEADERS);
  validateHeaders(completed, COMPLETED_HEADERS);
  const metadataValues = new Map<string, string>();
  for (let rowNumber = 2; rowNumber <= metadata.rowCount; rowNumber += 1) {
    const key = readScalarCell(metadata.getCell(rowNumber, 1));
    const value = readScalarCell(metadata.getCell(rowNumber, 2));
    if (key) {
      if (metadataValues.has(key)) {
        throw new Error(
          `Progress workbook contains duplicate metadata key "${key}".`
        );
      }
      metadataValues.set(key, value);
    }
  }

  if (
    Number(metadataValues.get("Schema Version")) !==
    PROGRESS_SCHEMA_VERSION
  ) {
    throw new Error("Progress workbook schema version is not supported.");
  }

  const completedLessons: Record<string, string> = {};
  const ignoredLessonIds = new Set<string>();
  const seenLessonIds = new Set<string>();

  for (let rowNumber = 2; rowNumber <= completed.rowCount; rowNumber += 1) {
    const rowValues = COMPLETED_HEADERS.map((_, columnIndex) =>
      readScalarCell(completed.getCell(rowNumber, columnIndex + 1))
    );
    const lessonId = rowValues[0];
    if (!lessonId) {
      continue;
    }
    if (seenLessonIds.has(lessonId)) {
      throw new Error(`Progress workbook contains duplicate lesson ID "${lessonId}".`);
    }
    seenLessonIds.add(lessonId);

    const completedAt = normalizeTimestamp(rowValues[5]);
    if (validLessonIds.has(lessonId)) {
      completedLessons[lessonId] = completedAt;
    } else {
      ignoredLessonIds.add(lessonId);
    }
  }

  const lastViewedLessonId =
    metadataValues.get("Last Viewed Lesson ID") || "";
  const lastViewedAt = metadataValues.get("Last Viewed At") || "";
  let lastViewed: CourseProgress["lastViewed"] = null;
  if (lastViewedLessonId) {
    const viewedAt = normalizeTimestamp(lastViewedAt);
    if (validLessonIds.has(lastViewedLessonId)) {
      lastViewed = {
        lessonId: lastViewedLessonId,
        viewedAt,
      };
    } else {
      ignoredLessonIds.add(lastViewedLessonId);
    }
  }

  const updatedAtValue = metadataValues.get("Updated At") || "";
  const exportedAtValue = metadataValues.get("Exported At") || "";
  const updatedAt = updatedAtValue
    ? normalizeTimestamp(updatedAtValue)
    : exportedAtValue
      ? normalizeTimestamp(exportedAtValue)
      : null;

  return {
    progress: normalizeProgress({
      schemaVersion: PROGRESS_SCHEMA_VERSION,
      lastViewed,
      completedLessons,
      updatedAt,
    }),
    ignoredLessonIds: [...ignoredLessonIds].sort(),
  };
}
