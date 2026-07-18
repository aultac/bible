import { readFile, rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  generateLessonSearchIndex,
  markdownToSearchBlocks,
  tokenizeSearchText,
} from "./search-index.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("search index normalization", () => {
  it("turns Markdown into readable, bounded snippet blocks", () => {
    const blocks = markdownToSearchBlocks(
      "# Creation\n\n- God made [the world](https://example.com).\n- " +
        "A long explanation ".repeat(40)
    );

    expect(blocks[0]).toBe("Creation");
    expect(blocks[1]).toBe("God made the world.");
    expect(Math.max(...blocks.map((block) => block.length))).toBeLessThanOrEqual(
      480
    );
  });

  it("normalizes tokens and omits stop words", () => {
    expect(tokenizeSearchText("The Messiah’s résumé")).toEqual([
      "messiah",
      "resume",
    ]);
  });

  it("builds a sorted compact term dictionary with weighted postings", () => {
    const index = buildSearchIndex([
      {
        path: "/genesis/1",
        title: "Genesis 1",
        sectionLabel: "Section 1: The Beginning",
        reference: "Genesis 1",
        tags: ["Creation"],
        blocks: ["God creates the heavens and earth."],
      },
    ]);

    expect(index.v).toBe(1);
    expect(index.t).toEqual([...index.t].sort());
    expect(index.t).toContain("creation");
    expect(index.t).not.toContain("the");
    expect(index.p[index.t.indexOf("genesis")]).toContain(-1);
  });
});

describe("generated gzip search index", () => {
  it("is deterministic, canonical, and compact against the note corpus", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "know-your-bible-search-")
    );
    temporaryDirectories.push(temporaryDirectory);
    const firstOutput = path.join(temporaryDirectory, "first.json.gz");
    const secondOutput = path.join(temporaryDirectory, "second.json.gz");

    const firstSummary = await generateLessonSearchIndex({
      outputPath: firstOutput,
    });
    const secondSummary = await generateLessonSearchIndex({
      outputPath: secondOutput,
    });
    const firstBytes = await readFile(firstOutput);
    const secondBytes = await readFile(secondOutput);
    const parsedIndex = JSON.parse(gunzipSync(firstBytes).toString("utf8"));

    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(firstSummary).toMatchObject({
      documentCount: 24,
      schemaVersion: 1,
    });
    expect(secondSummary.gzipByteCount).toBe(firstSummary.gzipByteCount);
    expect(firstSummary.gzipByteCount).toBeLessThan(
      firstSummary.notesSourceByteCount * 0.7
    );
    expect(parsedIndex.d[0][0]).toBe("/genesis/1/0");
    expect(parsedIndex.d[0][2]).toBe("Section 1: The Beginning");
    expect(parsedIndex.t).toHaveLength(parsedIndex.p.length);
  });
});
