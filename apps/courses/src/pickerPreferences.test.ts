import { describe, expect, it } from "vitest";
import {
  createEmptyPickerPreferences,
  parsePickerPreferences,
  PICKER_PREFERENCES_STORAGE_KEY,
  readPickerPreferences,
  resolvePickerPreferences,
  writePickerPreferences,
} from "./pickerPreferences";

const stored = {
  schemaVersion: 1 as const,
  mode: "section" as const,
  bookSlug: "genesis",
  sectionNumber: 2,
};
const catalog = {
  validBookSlugs: new Set(["genesis", "exodus"]),
  validSectionNumbers: new Set([1, 2, 3]),
  defaultBookSlug: "exodus",
  defaultSectionNumber: 1,
};

describe("course picker preferences", () => {
  it("round-trips valid values and rejects malformed or unknown versions", () => {
    expect(parsePickerPreferences(JSON.stringify(stored))).toEqual(stored);
    expect(parsePickerPreferences("{broken")).toEqual(
      createEmptyPickerPreferences()
    );
    expect(
      parsePickerPreferences(
        JSON.stringify({ ...stored, schemaVersion: 2 })
      )
    ).toEqual(createEmptyPickerPreferences());
  });

  it("gives valid URL fields precedence over stored preferences", () => {
    expect(
      resolvePickerPreferences({
        requestedMode: "book",
        requestedBookSlug: "exodus",
        requestedSectionNumber: "3",
        stored,
        ...catalog,
      })
    ).toEqual({
      schemaVersion: 1,
      mode: "book",
      bookSlug: "exodus",
      sectionNumber: 3,
    });
  });

  it("uses stored values for a bare URL and defaults removed selections", () => {
    expect(
      resolvePickerPreferences({
        requestedMode: null,
        requestedBookSlug: null,
        requestedSectionNumber: null,
        stored,
        ...catalog,
      })
    ).toEqual(stored);
    expect(
      resolvePickerPreferences({
        requestedMode: "unknown",
        requestedBookSlug: "removed-book",
        requestedSectionNumber: "99",
        stored: {
          ...stored,
          bookSlug: "removed-book",
          sectionNumber: 99,
        },
        ...catalog,
      })
    ).toEqual({
      schemaVersion: 1,
      mode: "section",
      bookSlug: "exodus",
      sectionNumber: 1,
    });
  });

  it("tolerates unavailable storage while reading and writing", () => {
    const unavailableStorage = {
      getItem() {
        throw new Error("unavailable");
      },
      setItem() {
        throw new Error("unavailable");
      },
    };
    expect(readPickerPreferences(unavailableStorage)).toEqual(
      createEmptyPickerPreferences()
    );
    expect(() =>
      writePickerPreferences(unavailableStorage, stored)
    ).not.toThrow();

    const values = new Map<string, string>();
    const memoryStorage = {
      getItem(key: string) {
        return values.get(key) || null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    };
    writePickerPreferences(memoryStorage, stored);
    expect(values.has(PICKER_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(readPickerPreferences(memoryStorage)).toEqual(stored);
  });
});
