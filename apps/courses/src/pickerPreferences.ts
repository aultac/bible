export const PICKER_PREFERENCES_STORAGE_KEY =
  "know-your-bible:picker-preferences:v1";
export const PICKER_PREFERENCES_SCHEMA_VERSION = 1;

export type SelectorMode = "book" | "section" | "direct";

export interface CoursePickerPreferences {
  schemaVersion: typeof PICKER_PREFERENCES_SCHEMA_VERSION;
  mode: SelectorMode;
  bookSlug: string | null;
  sectionNumber: number | null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSelectorMode(value: unknown): value is SelectorMode {
  return value === "book" || value === "section" || value === "direct";
}

function normalizeBookSlug(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const slug = value.trim();
  return slug && slug.length <= 128 ? slug : null;
}

function normalizeSectionNumber(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

export function createEmptyPickerPreferences(): CoursePickerPreferences {
  return {
    schemaVersion: PICKER_PREFERENCES_SCHEMA_VERSION,
    mode: "book",
    bookSlug: null,
    sectionNumber: null,
  };
}

export function normalizePickerPreferences(
  value: unknown
): CoursePickerPreferences {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PICKER_PREFERENCES_SCHEMA_VERSION
  ) {
    return createEmptyPickerPreferences();
  }

  return {
    schemaVersion: PICKER_PREFERENCES_SCHEMA_VERSION,
    mode: isSelectorMode(value.mode) ? value.mode : "book",
    bookSlug: normalizeBookSlug(value.bookSlug),
    sectionNumber: normalizeSectionNumber(value.sectionNumber),
  };
}

export function parsePickerPreferences(value: string | null) {
  if (!value) {
    return createEmptyPickerPreferences();
  }

  try {
    return normalizePickerPreferences(JSON.parse(value) as unknown);
  } catch {
    return createEmptyPickerPreferences();
  }
}

export function readPickerPreferences(storage: StorageLike | null) {
  if (!storage) {
    return createEmptyPickerPreferences();
  }

  try {
    return parsePickerPreferences(
      storage.getItem(PICKER_PREFERENCES_STORAGE_KEY)
    );
  } catch {
    return createEmptyPickerPreferences();
  }
}

export function writePickerPreferences(
  storage: StorageLike | null,
  preferences: CoursePickerPreferences
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      PICKER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizePickerPreferences(preferences))
    );
  } catch {
    // The picker remains usable when browser storage is unavailable.
  }
}

export function resolvePickerPreferences({
  requestedMode,
  requestedBookSlug,
  requestedSectionNumber,
  stored,
  validBookSlugs,
  validSectionNumbers,
  defaultBookSlug,
  defaultSectionNumber,
}: {
  requestedMode: string | null;
  requestedBookSlug: string | null;
  requestedSectionNumber: string | null;
  stored: CoursePickerPreferences;
  validBookSlugs: ReadonlySet<string>;
  validSectionNumbers: ReadonlySet<number>;
  defaultBookSlug: string;
  defaultSectionNumber: number;
}): CoursePickerPreferences {
  const parsedRequestedSection = Number(requestedSectionNumber);
  const requestedBook = normalizeBookSlug(requestedBookSlug);
  const storedBook = normalizeBookSlug(stored.bookSlug);
  const storedSection = normalizeSectionNumber(stored.sectionNumber);

  return {
    schemaVersion: PICKER_PREFERENCES_SCHEMA_VERSION,
    mode: isSelectorMode(requestedMode)
      ? requestedMode
      : isSelectorMode(stored.mode)
        ? stored.mode
        : "book",
    bookSlug:
      (requestedBook && validBookSlugs.has(requestedBook)
        ? requestedBook
        : null) ||
      (storedBook && validBookSlugs.has(storedBook) ? storedBook : null) ||
      defaultBookSlug,
    sectionNumber:
      (validSectionNumbers.has(parsedRequestedSection)
        ? parsedRequestedSection
        : null) ||
      (storedSection && validSectionNumbers.has(storedSection)
        ? storedSection
        : null) ||
      defaultSectionNumber,
  };
}
