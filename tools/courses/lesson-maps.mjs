import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { kml as kmlToGeoJson } from "@tmcw/togeojson";
import JSZip from "jszip";

const MAP_SOURCE_EXTENSIONS = new Set([".kml", ".kmz"]);

function getMapSourceExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function collectGeometryTypes(geometry, geometryTypes) {
  if (!geometry || typeof geometry !== "object") {
    return;
  }

  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    for (const childGeometry of geometry.geometries) {
      collectGeometryTypes(childGeometry, geometryTypes);
    }
    return;
  }

  if (typeof geometry.type === "string" && geometry.type) {
    geometryTypes.add(geometry.type);
  }
}

async function readKmlTextFromKmz(kmzPath) {
  const zip = await JSZip.loadAsync(await readFile(kmzPath));
  const kmlFiles = Object.values(zip.files)
    .filter(
      (file) =>
        !file.dir && path.extname(file.name).toLowerCase() === ".kml"
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const preferredKmlFile =
    kmlFiles.find((file) => path.basename(file.name).toLowerCase() === "doc.kml") ||
    kmlFiles[0];

  if (!preferredKmlFile) {
    throw new Error(`No KML file found inside KMZ archive: ${kmzPath}`);
  }

  return preferredKmlFile.async("string");
}

export function isLessonMapFileName(fileName) {
  return MAP_SOURCE_EXTENSIONS.has(getMapSourceExtension(fileName));
}

export async function convertMapSourceToGeoJson(sourcePath) {
  const sourceExtension = getMapSourceExtension(sourcePath);
  let kmlText = null;

  if (sourceExtension === ".kmz") {
    kmlText = await readKmlTextFromKmz(sourcePath);
  } else if (sourceExtension === ".kml") {
    kmlText = await readFile(sourcePath, "utf8");
  } else {
    throw new Error(`Unsupported lesson map source format: ${sourceExtension}`);
  }

  const document = new DOMParser().parseFromString(kmlText, "text/xml");
  const geoJson = kmlToGeoJson(document);

  if (
    !geoJson ||
    geoJson.type !== "FeatureCollection" ||
    !Array.isArray(geoJson.features)
  ) {
    throw new Error(`Could not convert ${sourcePath} into a GeoJSON feature collection.`);
  }

  return geoJson;
}

export function summarizeGeoJson(geoJson) {
  const geometryTypes = new Set();

  for (const feature of geoJson.features || []) {
    collectGeometryTypes(feature?.geometry, geometryTypes);
  }

  return {
    featureCount: Array.isArray(geoJson.features) ? geoJson.features.length : 0,
    geometryTypes: Array.from(geometryTypes).sort((left, right) =>
      left.localeCompare(right)
    ),
  };
}
