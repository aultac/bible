import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildToolsData,
  extractToolTitleFromHtml,
  matchResourceSourceUrls,
  normalizeToolPath,
  parseNoteDirectives,
  serializeToolsData,
  validateNoteDirectiveCandidate,
} from "./note-directives.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

async function toolFixture(toolPath, title) {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-tools-")
  );
  temporaryRoots.push(repoRoot);
  const indexPath = path.join(
    repoRoot,
    "static",
    toolPath.replace(/^\/+|\/+$/gu, ""),
    "index.html"
  );
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(
    indexPath,
    `<!doctype html><meta name="application-name" content="${title}"><h1>Fallback</h1>`,
    "utf8"
  );
  return repoRoot;
}

describe("Apple Notes directives", () => {
  it("parses Markdown-prefixed directives and normalizes tool paths", () => {
    const parsed = parseNoteDirectives(
      [
        "- **TOOL_LINK:**   /ages   trailing words",
        "> RESOURCE_LINK: family tree.png: https://example.test/source?a=1:b",
      ].join("\n")
    );

    expect(parsed.findings).toEqual([]);
    expect(parsed.toolLinks).toMatchObject([{ path: "/ages/", lineNumber: 1 }]);
    expect(parsed.resourceLinks).toMatchObject([
      {
        fileName: "family tree.png",
        sourceUrl: "https://example.test/source?a=1:b",
        lineNumber: 2,
      },
    ]);
    expect(normalizeToolPath("/ten-plagues")).toBe("/ten-plagues/");
    expect(normalizeToolPath("/tool.html")).toBe("/tool.html");
    expect(() => normalizeToolPath("/bad%20path/")).toThrow(
      "root-relative URL paths"
    );
  });

  it("reports malformed, invalid, duplicate, and conflicting directives", () => {
    const parsed = parseNoteDirectives(
      [
        "TOOL_LINK /ages/",
        "TOOL_LINK: https://example.test/ages/",
        "TOOL_LINK: /ages/",
        "TOOL_LINK: /ages",
        "RESOURCE_LINK: image.jpg: ftp://example.test/image.jpg",
        "RESOURCE_LINK: image.png: https://example.test/one",
        "RESOURCE_LINK: image.png: https://example.test/two",
      ].join("\n")
    );

    expect(parsed.findings.map((item) => item.code)).toEqual([
      "directive-marker-malformed",
      "tool-link-invalid",
      "tool-link-duplicate",
      "resource-link-url-invalid",
      "resource-link-conflict",
    ]);
  });

  it("matches source URLs by exact resource filename and rejects ambiguity", () => {
    const links = parseNoteDirectives(
      [
        "RESOURCE_LINK: unique.jpg: https://example.test/unique",
        "RESOURCE_LINK: duplicate.jpg: https://example.test/duplicate",
        "RESOURCE_LINK: missing.jpg: https://example.test/missing",
      ].join("\n")
    ).resourceLinks;
    const matched = matchResourceSourceUrls(
      [
        { fileName: "unique.jpg", relativePath: "unique.jpg" },
        { fileName: "duplicate.jpg", relativePath: "one/duplicate.jpg" },
        { fileName: "duplicate.jpg", relativePath: "two/duplicate.jpg" },
      ],
      links
    );

    expect(matched.sourceUrlByFileName.get("unique.jpg")).toBe(
      "https://example.test/unique"
    );
    expect(matched.findings.map((item) => item.code)).toEqual([
      "resource-link-file-ambiguous",
      "resource-link-file-missing",
    ]);
  });
});

describe("generated tool catalog", () => {
  it("takes canonical titles from tool-owned metadata before heading fallbacks", () => {
    expect(
      extractToolTitleFromHtml(
        '<meta name="application-name" content="Canonical Tool"><h1>Visible Heading</h1>'
      )
    ).toBe("Canonical Tool");
    expect(extractToolTitleFromHtml("<h1>Visible <em>Tool</em></h1>")).toBe(
      "Visible Tool"
    );
    expect(
      extractToolTitleFromHtml("<title>Fallback Tool - v3.1.5</title>")
    ).toBe("Fallback Tool");
  });

  it("groups published lessons many-to-many in stable path and lesson order", async () => {
    const repoRoot = await toolFixture("/ages/", "Biblical Lifespans");
    const secondToolPath = path.join(
      repoRoot,
      "static",
      "ziggurats",
      "index.html"
    );
    await mkdir(path.dirname(secondToolPath), { recursive: true });
    await writeFile(secondToolPath, "<h1>Ziggurats</h1>", "utf8");

    const tools = await buildToolsData(
      [
        {
          id: "lesson-b",
          published: true,
          directives: parseNoteDirectives(
            "TOOL_LINK: /ziggurats/\nTOOL_LINK: /ages/"
          ),
        },
        {
          id: "lesson-a",
          published: true,
          directives: parseNoteDirectives("TOOL_LINK: /ages/"),
        },
        {
          id: "lesson-private",
          published: false,
          directives: parseNoteDirectives("TOOL_LINK: /ages/"),
        },
      ],
      { repoRoot }
    );

    expect(tools).toEqual([
      {
        path: "/ages/",
        title: "Biblical Lifespans",
        relatedLessonIds: ["lesson-a", "lesson-b"],
      },
      {
        path: "/ziggurats/",
        title: "Ziggurats",
        relatedLessonIds: ["lesson-b"],
      },
    ]);
    expect(serializeToolsData(tools)).toContain(
      "generated from TOOL_LINK directives"
    );
  });

  it("validates staged resource filenames and tool documents together", async () => {
    const repoRoot = await toolFixture("/ages/", "Biblical Lifespans");
    const lessonDirectory = path.join(repoRoot, "canonical", "lesson");
    await mkdir(path.join(lessonDirectory, "resources"), { recursive: true });
    await writeFile(
      path.join(lessonDirectory, "resources", "chart.png"),
      "image",
      "utf8"
    );

    const result = await validateNoteDirectiveCandidate({
      markdown:
        "TOOL_LINK: /ages/\nRESOURCE_LINK: chart.png: https://example.test/chart",
      lessonDirectory,
      repoRoot,
    });

    expect(result.findings).toEqual([]);
    expect(result.resourceSourceUrlByName.get("chart.png")).toBe(
      "https://example.test/chart"
    );
  });
});
