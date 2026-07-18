import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  createSearchSnippet,
  searchLessonIndex,
  tokenizeSearchQuery,
  type LessonSearchIndex,
} from "./lessonSearch";

const SEARCH_INDEX: LessonSearchIndex = {
  v: 1,
  d: [
    [
      "/genesis/1",
      "Genesis 1–2",
      "Section 1: The Beginning",
      [
        "God speaks creation into an ordered world.",
        "The flood comes later in the Genesis storyline.",
      ],
    ],
    [
      "/genesis/12",
      "Genesis 12–14",
      "Section 2: The Chosen",
      ["Creationism is discussed before Abraham leaves his country."],
    ],
  ],
  t: ["abraham", "creation", "creationism", "flood", "genesis"],
  p: [
    [1, 0, 1],
    [0, 0, 3],
    [1, 0, 3],
    [0, 1, 2],
    [0, -1, 5, 1, -1, 5],
  ],
};

describe("lesson search queries", () => {
  it("normalizes punctuation and removes common stop words", () => {
    expect(tokenizeSearchQuery("The CREATION, and flood")).toEqual([
      "creation",
      "flood",
    ]);
  });

  it("ranks exact terms above longer prefix matches", () => {
    const results = searchLessonIndex(SEARCH_INDEX, "creation");

    expect(results.map((result) => result.path)).toEqual([
      "/genesis/1",
      "/genesis/12",
    ]);
  });

  it("intersects multiple tokens and chooses the matching note block", () => {
    const results = searchLessonIndex(SEARCH_INDEX, "creation flo");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "/genesis/1",
      sectionLabel: "Section 1: The Beginning",
    });
    expect(results[0].snippet.toLowerCase()).toContain("creation");
  });

  it("returns an empty result for stop-word and unmatched queries", () => {
    expect(searchLessonIndex(SEARCH_INDEX, "the and")).toEqual([]);
    expect(searchLessonIndex(SEARCH_INDEX, "exodus")).toEqual([]);
  });

  it("finds a note snippet in the generated course index", async () => {
    const compressedIndex = await readFile(
      new URL("../public/search/notes-index.json.gz", import.meta.url)
    );
    const generatedIndex = JSON.parse(
      gunzipSync(compressedIndex).toString("utf8")
    ) as LessonSearchIndex;
    const results = searchLessonIndex(generatedIndex, "butterfly");
    const genesisCreationResult = results.find(
      (result) => result.path === "/genesis/1"
    );

    expect(genesisCreationResult).toMatchObject({
      path: "/genesis/1",
      sectionLabel: "Section 1: The Beginning",
    });
    expect(genesisCreationResult?.snippet.toLowerCase()).toContain("butterfly");
  });
});

describe("search snippets", () => {
  it("centers a bounded snippet near its first match", () => {
    const prefix = "Before the important material. ".repeat(8);
    const snippet = createSearchSnippet(
      `${prefix}Creation begins here and continues with more explanation.`,
      ["creation"],
      90
    );

    expect(snippet.length).toBeLessThanOrEqual(92);
    expect(snippet.toLowerCase()).toContain("creation");
    expect(snippet.startsWith("…")).toBe(true);
  });
});
