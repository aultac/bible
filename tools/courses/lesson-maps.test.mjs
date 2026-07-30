import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import {
  convertMapSourceToGeoJson,
  summarizeGeoJson,
  validateLayeredGeoJson,
} from "./lesson-maps.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryDirectory() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-map-")
  );
  temporaryDirectories.push(directory);
  return directory;
}

const NESTED_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Fixture map</name>
    <visibility>1</visibility>
    <open>1</open>
    <Style id="styled-area">
      <LineStyle>
        <color>7f0000ff</color>
        <width>4</width>
      </LineStyle>
      <PolyStyle>
        <color>4000ff00</color>
      </PolyStyle>
    </Style>
    <Folder>
      <name>Visible places</name>
      <open>1</open>
      <Placemark>
        <name>Repeated</name>
        <styleUrl>#styled-area</styleUrl>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>0,0,0 1,0,0 1,1,0 0,0,0</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>
      <Placemark>
        <name>Repeated</name>
        <Point><coordinates>2,2,0</coordinates></Point>
      </Placemark>
      <Folder>
        <name>Hidden group</name>
        <visibility>0</visibility>
        <Placemark>
          <name>Inherited hidden</name>
          <Point><coordinates>3,3,0</coordinates></Point>
        </Placemark>
        <Placemark>
          <name>Explicitly visible under hidden parent</name>
          <visibility>1</visibility>
          <Point><coordinates>4,4,0</coordinates></Point>
        </Placemark>
      </Folder>
      <Folder>
        <name></name>
      </Folder>
      <Placemark>
        <MultiGeometry>
          <Point><coordinates>5,5,0</coordinates></Point>
          <LineString><coordinates>5,5,0 6,6,0</coordinates></LineString>
        </MultiGeometry>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

describe("lesson map conversion", () => {
  it("preserves hierarchy, order, visibility, styles, and duplicate names", async () => {
    const directory = await temporaryDirectory();
    const sourcePath = path.join(directory, "fixture.kml");
    await writeFile(sourcePath, NESTED_KML, "utf8");

    const geoJson = await convertMapSourceToGeoJson(sourcePath);
    const root = geoJson.layerTree.root;
    const visibleFolder = root.children[0];
    const hiddenFolder = visibleFolder.children[2];
    const emptyFolder = visibleFolder.children[3];
    const styledFeature = geoJson.features[0];

    expect(root).toMatchObject({
      type: "root",
      id: "root",
      name: "Fixture map",
      sourceOrder: 0,
      visibility: true,
      initiallyVisible: true,
      open: true,
    });
    expect(visibleFolder).toMatchObject({
      type: "folder",
      id: "folder-0001",
      name: "Visible places",
      sourceOrder: 1,
      visibility: null,
      initiallyVisible: true,
      open: true,
    });
    expect(visibleFolder.children.slice(0, 2)).toMatchObject([
      {
        type: "feature",
        id: "feature-0001",
        name: "Repeated",
        sourceOrder: 2,
        initiallyVisible: true,
        geometryType: "Polygon",
      },
      {
        type: "feature",
        id: "feature-0002",
        name: "Repeated",
        sourceOrder: 3,
        initiallyVisible: true,
        geometryType: "Point",
      },
    ]);
    expect(hiddenFolder).toMatchObject({
      id: "folder-0002",
      name: "Hidden group",
      visibility: false,
      initiallyVisible: false,
      children: [
        {
          id: "feature-0003",
          visibility: null,
          initiallyVisible: false,
        },
        {
          id: "feature-0004",
          visibility: true,
          initiallyVisible: false,
        },
      ],
    });
    expect(emptyFolder).toMatchObject({
      id: "folder-0003",
      name: null,
      children: [],
    });
    expect(visibleFolder.children[4]).toMatchObject({
      id: "feature-0005",
      name: null,
      geometryType: "GeometryCollection",
    });
    expect(styledFeature).toMatchObject({
      id: "feature-0001",
      properties: {
        name: "Repeated",
        stroke: "#ff0000",
        "stroke-width": 4,
        fill: "#00ff00",
        kml: {
          folderIds: ["folder-0001"],
          folderPath: ["Visible places"],
          sourceOrder: 2,
          visibility: null,
          initiallyVisible: true,
        },
      },
    });
    expect(styledFeature.properties["stroke-opacity"]).toBeCloseTo(
      127 / 255
    );
    expect(styledFeature.properties["fill-opacity"]).toBeCloseTo(64 / 255);
    expect(geoJson.features.map((feature) => feature.id)).toEqual([
      "feature-0001",
      "feature-0002",
      "feature-0003",
      "feature-0004",
      "feature-0005",
    ]);
    expect(summarizeGeoJson(geoJson)).toEqual({
      featureCount: 5,
      geometryTypes: ["LineString", "Point", "Polygon"],
    });
    expect(validateLayeredGeoJson(geoJson)).toEqual([]);
  });

  it("uses deterministic IDs across KML and KMZ conversion", async () => {
    const directory = await temporaryDirectory();
    const kmlPath = path.join(directory, "fixture.kml");
    const kmzPath = path.join(directory, "fixture.kmz");
    await writeFile(kmlPath, NESTED_KML, "utf8");

    const zip = new JSZip();
    zip.file("doc.kml", NESTED_KML);
    zip.file("ignored/readme.txt", "fixture");
    await mkdir(path.dirname(kmzPath), { recursive: true });
    await writeFile(kmzPath, await zip.generateAsync({ type: "nodebuffer" }));

    const fromKml = await convertMapSourceToGeoJson(kmlPath);
    const fromKmz = await convertMapSourceToGeoJson(kmzPath);

    expect(fromKmz).toEqual(fromKml);
    expect(fromKmz.features.every((feature) => Boolean(feature.id))).toBe(
      true
    );
  });

  it("rejects duplicate IDs, orphan references, and inconsistent metadata", async () => {
    const directory = await temporaryDirectory();
    const sourcePath = path.join(directory, "fixture.kml");
    await writeFile(sourcePath, NESTED_KML, "utf8");
    const geoJson = await convertMapSourceToGeoJson(sourcePath);

    geoJson.features[1].id = geoJson.features[0].id;
    geoJson.layerTree.root.children[0].children[0].id = "missing-feature";
    geoJson.features[0].properties.kml.folderPath = ["Wrong folder"];

    expect(validateLayeredGeoJson(geoJson)).toEqual(
      expect.arrayContaining([
        "Duplicate feature ID: feature-0001.",
        "Layer tree references missing feature: missing-feature.",
        "Layer tree must reference every feature exactly once in source order.",
      ])
    );
  });
});
