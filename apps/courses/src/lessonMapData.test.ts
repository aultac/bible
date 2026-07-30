import { describe, expect, it } from "vitest";
import {
  collectDescendantFeatureIds,
  getDisplayLayerNodes,
  getFolderCheckState,
  normalizeLessonMapPayload,
  setFeatureIdsVisible,
} from "./lessonMapData";

function enrichedFixture() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "feature-0001",
        properties: { name: "Midian" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: "feature-0002",
        properties: { name: "Midian" },
        geometry: { type: "Point", coordinates: [1, 1] },
      },
      {
        type: "Feature",
        id: "feature-0003",
        properties: {},
        geometry: {
          type: "GeometryCollection",
          geometries: [{ type: "Point", coordinates: [2, 2] }],
        },
      },
    ],
    layerTree: {
      schemaVersion: 1,
      root: {
        type: "root",
        id: "root",
        name: "Fixture map",
        sourceOrder: 0,
        visibility: null,
        initiallyVisible: true,
        open: true,
        children: [
          {
            type: "folder",
            id: "folder-0001",
            name: "Places",
            sourceOrder: 1,
            visibility: null,
            initiallyVisible: true,
            open: true,
            children: [
              {
                type: "feature",
                id: "feature-0001",
                name: "Midian",
                sourceOrder: 2,
                visibility: null,
                initiallyVisible: true,
                geometryType: "Polygon",
              },
              {
                type: "feature",
                id: "feature-0002",
                name: "Midian",
                sourceOrder: 3,
                visibility: false,
                initiallyVisible: false,
                geometryType: "Point",
              },
              {
                type: "feature",
                id: "feature-0003",
                name: null,
                sourceOrder: 4,
                visibility: null,
                initiallyVisible: true,
                geometryType: "GeometryCollection",
              },
            ],
          },
          {
            type: "folder",
            id: "folder-0002",
            name: null,
            sourceOrder: 5,
            visibility: false,
            initiallyVisible: false,
            open: null,
            children: [],
          },
        ],
      },
    },
  };
}

describe("lesson map normalization", () => {
  it("normalizes hierarchy, visibility, duplicate labels, and empty folders", () => {
    const map = normalizeLessonMapPayload(enrichedFixture());
    expect(map).not.toBeNull();
    if (!map) {
      return;
    }

    const places = map.root.children[0];
    const emptyFolder = map.root.children[1];
    expect(places.type).toBe("folder");
    expect(emptyFolder).toMatchObject({
      type: "folder",
      label: "Unnamed folder 1",
      children: [],
    });
    if (places.type !== "folder") {
      return;
    }

    expect(places.children.map((child) => child.label)).toEqual([
      "Midian",
      "Midian",
      "Unnamed feature 1",
    ]);
    expect(map.initialVisibleFeatureIds).toEqual(
      new Set(["feature-0001", "feature-0003"])
    );
    expect(map.initiallyOpenFolderIds).toEqual(new Set(["folder-0001"]));
    expect(collectDescendantFeatureIds(places)).toEqual([
      "feature-0001",
      "feature-0002",
      "feature-0003",
    ]);
    expect(getFolderCheckState(places, map.initialVisibleFeatureIds)).toBe(
      "mixed"
    );
    expect(
      getDisplayLayerNodes({
        ...map.root,
        children: [places],
      })
    ).toBe(places.children);
    expect(getDisplayLayerNodes(map.root)).toBe(map.root.children);
    expect(
      getFolderCheckState(
        emptyFolder.type === "folder" ? emptyFolder : map.root,
        map.initialVisibleFeatureIds
      )
    ).toBe("empty");
  });

  it("toggles aggregate visibility without mutating the current set", () => {
    const current = new Set(["feature-0001"]);
    const shown = setFeatureIdsVisible(
      current,
      ["feature-0002", "feature-0003"],
      true
    );
    const hidden = setFeatureIdsVisible(
      shown,
      ["feature-0001", "feature-0003"],
      false
    );

    expect(current).toEqual(new Set(["feature-0001"]));
    expect(shown).toEqual(
      new Set(["feature-0001", "feature-0002", "feature-0003"])
    );
    expect(hidden).toEqual(new Set(["feature-0002"]));
  });

  it("falls back to a flat tree for legacy cached FeatureCollections", () => {
    const map = normalizeLessonMapPayload({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Visible point" },
          geometry: { type: "Point", coordinates: [0, 0] },
        },
        {
          type: "Feature",
          properties: { name: "Hidden line", visibility: false },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    });

    expect(map?.root.label).toBe("Map layers");
    expect(map?.root.children.map((node) => node.id)).toEqual([
      "feature-0001",
      "feature-0002",
    ]);
    expect(map?.initialVisibleFeatureIds).toEqual(
      new Set(["feature-0001"])
    );
  });

  it("rejects malformed and orphaned enriched trees", () => {
    const fixture = enrichedFixture();
    fixture.layerTree.root.children[0].children[0].id = "missing-feature";

    expect(normalizeLessonMapPayload(fixture)).toBeNull();
    expect(
      normalizeLessonMapPayload({ type: "FeatureCollection" })
    ).toBeNull();
    expect(normalizeLessonMapPayload({ type: "Point" })).toBeNull();
  });
});
