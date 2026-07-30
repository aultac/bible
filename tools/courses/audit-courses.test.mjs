import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditCourses, getAuditExitCode } from "./audit-courses.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function writeJson(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function lessonManifest({
  slug = "001-genesis1-2",
  status = "published",
  resources = [],
  sourceMapPath = null,
} = {}) {
  return {
    schemaVersion: 1,
    id: slug,
    slug,
    sectionSlug: "01-section-genesis1-11",
    sequenceNumber: 1,
    lessonKind: "passage",
    title: "Genesis 1-2",
    status,
    publishReasons: status === "NOPUBLISH" ? [{ type: "filename" }] : [],
    passage: {
      start: { bookName: "Genesis", chapter: 1, verse: null },
      end: { bookName: "Genesis", chapter: 2, verse: null },
      esvUrl: "https://www.esv.org/Genesis+1-2/",
    },
    notes: { available: false, path: null },
    summary: { available: false, path: null },
    videoSummary: null,
    youtube: null,
    map: null,
    resources,
    source: { mapPath: sourceMapPath },
  };
}

async function auditFixture({ lessons }) {
  const repoRoot = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-audit-")
  );
  temporaryDirectories.push(repoRoot);
  const contentRoot = path.join(repoRoot, "apps", "courses", "content");
  const publicRoot = path.join(repoRoot, "apps", "courses", "public");
  const sectionSlug = "01-section-genesis1-11";
  await writeJson(path.join(contentRoot, "sections.json"), {
    schemaVersion: 1,
    sections: [{ slug: sectionSlug, sectionnum: 1 }],
  });
  await writeJson(
    path.join(contentRoot, "sections", sectionSlug, "section.json"),
    {
      schemaVersion: 1,
      slug: sectionSlug,
      sectionnum: 1,
      passage: {
        start: { bookName: "Genesis", chapter: 1, verse: null },
      },
      lessons: lessons.map((lesson) => ({
        slug: lesson.slug,
        sequenceNumber: lesson.sequenceNumber,
      })),
    }
  );
  for (const lesson of lessons) {
    await writeJson(
      path.join(
        contentRoot,
        "sections",
        sectionSlug,
        "lessons",
        lesson.slug,
        "lesson.json"
      ),
      lesson
    );
  }
  await mkdir(publicRoot, { recursive: true });
  return { repoRoot, contentRoot, publicRoot };
}

describe("course audit", () => {
  it("treats optional content gaps as warnings unless strict mode is requested", async () => {
    const fixture = await auditFixture({ lessons: [lessonManifest()] });
    const result = await auditCourses(fixture);

    expect(result.totals.errors).toBe(0);
    expect(result.totals.warnings).toBe(3);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "notes-missing",
        "summary-missing",
        "video-missing",
      ])
    );
    expect(getAuditExitCode(result)).toBe(0);
    expect(getAuditExitCode(result, { strict: true })).toBe(1);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });

  it("allows Promo without a passage and rejects passage lessons without ranges", async () => {
    const promo = {
      ...lessonManifest({ slug: "000-promo" }),
      sequenceNumber: 0,
      lessonKind: "promo",
      title: "Promo",
      passage: null,
    };
    const invalidPassage = {
      ...lessonManifest({ slug: "002-missing-passage" }),
      sequenceNumber: 2,
      passage: null,
    };
    const fixture = await auditFixture({
      lessons: [promo, invalidPassage],
    });

    const result = await auditCourses(fixture);
    const passageFindings = result.findings.filter(
      (finding) => finding.code === "passage-missing"
    );

    expect(passageFindings).toHaveLength(1);
    expect(passageFindings[0].lessonKey).toContain("002-missing-passage");
    expect(
      result.findings.some(
        (finding) =>
          finding.code === "passage-missing" &&
          finding.lessonKey.includes("000-promo")
      )
    ).toBe(false);
  });

  it("reports invalid images, broken maps, duplicate routes, and publication leaks", async () => {
    const brokenResourcePath =
      "apps/courses/public/resources/01-section-genesis1-11/001-genesis1-2/broken.jpg";
    const first = lessonManifest({
      status: "NOPUBLISH",
      resources: [
        {
          name: "broken.jpg",
          path: brokenResourcePath,
          publicUrl:
            "/courses/resources/01-section-genesis1-11/001-genesis1-2/broken.jpg",
          sourceUrl: "ftp://example.test/broken.jpg",
        },
      ],
      sourceMapPath: "source/map.kmz",
    });
    const duplicate = {
      ...lessonManifest({ slug: "002-genesis1-2" }),
      sequenceNumber: 2,
    };
    const fixture = await auditFixture({ lessons: [first, duplicate] });
    const imagePath = path.join(fixture.repoRoot, brokenResourcePath);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, "not a jpeg", "utf8");
    const orphanPath = path.join(
      fixture.publicRoot,
      "maps",
      "orphan.geojson"
    );
    await mkdir(path.dirname(orphanPath), { recursive: true });
    await writeFile(orphanPath, "{}", "utf8");
    await writeJson(
      path.join(
        fixture.contentRoot,
        "unpublished",
        first.sectionSlug,
        "lessons",
        first.slug,
        "lesson.json"
      ),
      first
    );

    const result = await auditCourses(fixture);
    const codes = result.findings.map((finding) => finding.code);

    expect(result.totals.errors).toBeGreaterThanOrEqual(5);
    expect(codes).toEqual(
      expect.arrayContaining([
        "image-invalid",
        "map-conversion-missing",
        "duplicate-route",
        "unpublished-manifest-leak",
        "unpublished-key-leak",
        "unpublished-asset-leak",
        "orphan-public-file",
        "resource-source-url-invalid",
      ])
    );
    expect(getAuditExitCode(result)).toBe(1);
  });

  it("rejects generated maps with invalid layer-tree references", async () => {
    const lesson = lessonManifest();
    const relativeMapRoot =
      "apps/courses/public/maps/01-section-genesis1-11/001-genesis1-2";
    lesson.map = {
      sourcePath: "source/fixture.kml",
      sourceFormat: "kml",
      sourcePublicUrl:
        "/courses/maps/01-section-genesis1-11/001-genesis1-2/fixture.kml",
      geoJsonPath: `${relativeMapRoot}/fixture.geojson`,
      geoJsonPublicUrl:
        "/courses/maps/01-section-genesis1-11/001-genesis1-2/fixture.geojson",
      available: true,
      featureCount: 1,
      geometryTypes: ["Point"],
    };
    const fixture = await auditFixture({ lessons: [lesson] });
    const publicMapRoot = path.join(
      fixture.publicRoot,
      "maps",
      "01-section-genesis1-11",
      "001-genesis1-2"
    );
    await mkdir(publicMapRoot, { recursive: true });
    await writeFile(path.join(publicMapRoot, "fixture.kml"), "<kml />");
    await writeJson(path.join(publicMapRoot, "fixture.geojson"), {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "feature-0001",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
      layerTree: {
        schemaVersion: 1,
        root: {
          type: "root",
          id: "root",
          name: "Broken fixture",
          sourceOrder: 0,
          visibility: null,
          initiallyVisible: true,
          open: null,
          children: [
            {
              type: "feature",
              id: "missing-feature",
              name: "Missing",
              sourceOrder: 1,
              visibility: null,
              initiallyVisible: true,
              geometryType: "Point",
            },
          ],
        },
      },
    });

    const result = await auditCourses(fixture);
    const finding = result.findings.find(
      (candidate) => candidate.code === "geojson-invalid"
    );

    expect(finding).toBeTruthy();
    expect(finding.error).toContain(
      "Layer tree references missing feature: missing-feature."
    );
  });
});
