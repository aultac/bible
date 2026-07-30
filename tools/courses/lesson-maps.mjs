import { readFile } from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { kmlWithFolders } from "@tmcw/togeojson";
import JSZip from "jszip";

const MAP_SOURCE_EXTENSIONS = new Set([".kml", ".kmz"]);
const LAYER_TREE_SCHEMA_VERSION = 1;

function getMapSourceExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}
function getChildElements(node) {
  return Array.from(node?.childNodes || []).filter(
    (child) => child.nodeType === 1
  );
}

function getDirectChildText(node, childName) {
  const child = getChildElements(node).find(
    (candidate) => candidate.localName === childName
  );
  const value = child?.textContent?.trim();
  return value || null;
}

function findFirstElement(document, localName) {
  return Array.from(document.getElementsByTagName("*")).find(
    (element) => element.localName === localName
  );
}

function normalizeKmlBoolean(value) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  if (value === true || value === 1 || value === "1") {
    return true;
  }

  if (value === false || value === 0 || value === "0") {
    return false;
  }

  return null;
}

function getFeatureName(feature) {
  const name = feature?.properties?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function buildLayeredGeoJson(document, sourcePath) {
  const convertedTree = kmlWithFolders(document);
  const sourceExtension = getMapSourceExtension(sourcePath);
  const fallbackName = path.basename(sourcePath, sourceExtension);
  const documentElement = findFirstElement(document, "Document");
  const rootVisibility = normalizeKmlBoolean(
    getDirectChildText(documentElement, "visibility")
  );
  const rootInitiallyVisible = rootVisibility ?? true;
  let sourceOrder = 0;
  let folderSequence = 0;
  let featureSequence = 0;
  const features = [];

  function nextSourceOrder() {
    sourceOrder += 1;
    return sourceOrder;
  }

  function convertChildren(
    children,
    {
      parentInitiallyVisible,
      folderIds,
      folderPath,
    }
  ) {
    return children.map((child) => {
      if (child.type === "folder") {
        folderSequence += 1;
        const id = `folder-${String(folderSequence).padStart(4, "0")}`;
        const name =
          typeof child.meta?.name === "string" && child.meta.name.trim()
            ? child.meta.name.trim()
            : null;
        const visibility = normalizeKmlBoolean(child.meta?.visibility);
        const initiallyVisible =
          parentInitiallyVisible && (visibility ?? true);
        const nextFolderIds = [...folderIds, id];
        const nextFolderPath = [...folderPath, name];

        return {
          type: "folder",
          id,
          name,
          sourceOrder: nextSourceOrder(),
          visibility,
          initiallyVisible,
          open: normalizeKmlBoolean(child.meta?.open),
          children: convertChildren(child.children || [], {
            parentInitiallyVisible: initiallyVisible,
            folderIds: nextFolderIds,
            folderPath: nextFolderPath,
          }),
        };
      }

      featureSequence += 1;
      const id = `feature-${String(featureSequence).padStart(4, "0")}`;
      const featureSourceOrder = nextSourceOrder();
      const visibility = normalizeKmlBoolean(
        child?.properties?.visibility
      );
      const initiallyVisible =
        parentInitiallyVisible && (visibility ?? true);
      const feature = {
        ...child,
        id,
        properties: {
          ...(child.properties || {}),
          kml: {
            folderIds: [...folderIds],
            folderPath: [...folderPath],
            sourceOrder: featureSourceOrder,
            visibility,
            initiallyVisible,
          },
        },
      };

      features.push(feature);

      return {
        type: "feature",
        id,
        name: getFeatureName(feature),
        sourceOrder: featureSourceOrder,
        visibility,
        initiallyVisible,
        geometryType: feature.geometry?.type || null,
      };
    });
  }

  return {
    type: "FeatureCollection",
    features,
    layerTree: {
      schemaVersion: LAYER_TREE_SCHEMA_VERSION,
      root: {
        type: "root",
        id: "root",
        name:
          getDirectChildText(documentElement, "name") ||
          fallbackName ||
          null,
        sourceOrder: 0,
        visibility: rootVisibility,
        initiallyVisible: rootInitiallyVisible,
        open: normalizeKmlBoolean(
          getDirectChildText(documentElement, "open")
        ),
        children: convertChildren(convertedTree.children || [], {
          parentInitiallyVisible: rootInitiallyVisible,
          folderIds: [],
          folderPath: [],
        }),
      },
    },
  };
}

function hasNormalizedVisibility(value) {
  return value === null || typeof value === "boolean";
}

export function validateLayeredGeoJson(geoJson) {
  const errors = [];

  if (
    !geoJson ||
    geoJson.type !== "FeatureCollection" ||
    !Array.isArray(geoJson.features)
  ) {
    return ["Expected a GeoJSON FeatureCollection."];
  }

  if (
    !geoJson.layerTree ||
    geoJson.layerTree.schemaVersion !== LAYER_TREE_SCHEMA_VERSION ||
    !geoJson.layerTree.root ||
    geoJson.layerTree.root.type !== "root" ||
    !Array.isArray(geoJson.layerTree.root.children)
  ) {
    return ["Expected a version 1 layerTree with a root node."];
  }

  const featureById = new Map();
  const featureIdsInOrder = [];

  for (const [index, feature] of geoJson.features.entries()) {
    if (typeof feature?.id !== "string" || !feature.id) {
      errors.push(`Feature at index ${index} has no string ID.`);
      continue;
    }

    if (featureById.has(feature.id)) {
      errors.push(`Duplicate feature ID: ${feature.id}.`);
      continue;
    }

    featureById.set(feature.id, feature);
    featureIdsInOrder.push(feature.id);
  }

  const seenNodeIds = new Set();
  const referencedFeatureIds = [];
  let previousSourceOrder = -1;

  function validateCommonNode(node, expectedType) {
    if (!node || node.type !== expectedType) {
      errors.push(`Expected a ${expectedType} layer-tree node.`);
      return false;
    }

    if (typeof node.id !== "string" || !node.id) {
      errors.push(`${expectedType} layer-tree node has no string ID.`);
    } else if (seenNodeIds.has(node.id)) {
      errors.push(`Duplicate layer-tree node ID: ${node.id}.`);
    } else {
      seenNodeIds.add(node.id);
    }

    if (
      typeof node.sourceOrder !== "number" ||
      !Number.isInteger(node.sourceOrder) ||
      node.sourceOrder <= previousSourceOrder
    ) {
      errors.push(
        `${node.id || expectedType} has an invalid sourceOrder.`
      );
    } else {
      previousSourceOrder = node.sourceOrder;
    }

    if (!hasNormalizedVisibility(node.visibility)) {
      errors.push(`${node.id || expectedType} has invalid visibility.`);
    }

    if (typeof node.initiallyVisible !== "boolean") {
      errors.push(
        `${node.id || expectedType} has invalid initiallyVisible.`
      );
    }

    return true;
  }

  function visitNode(node, folderIds = [], folderPath = []) {
    if (node?.type === "folder") {
      if (!validateCommonNode(node, "folder")) {
        return;
      }

      if (!hasNormalizedVisibility(node.open)) {
        errors.push(`${node.id} has invalid open state.`);
      }

      if (!Array.isArray(node.children)) {
        errors.push(`${node.id} has no children array.`);
        return;
      }

      const nextFolderIds = [...folderIds, node.id];
      const nextFolderPath = [...folderPath, node.name ?? null];
      for (const child of node.children) {
        visitNode(child, nextFolderIds, nextFolderPath);
      }
      return;
    }

    if (!validateCommonNode(node, "feature")) {
      return;
    }

    referencedFeatureIds.push(node.id);
    const feature = featureById.get(node.id);

    if (!feature) {
      errors.push(`Layer tree references missing feature: ${node.id}.`);
      return;
    }

    const metadata = feature.properties?.kml;
    if (
      !metadata ||
      metadata.sourceOrder !== node.sourceOrder ||
      metadata.visibility !== node.visibility ||
      metadata.initiallyVisible !== node.initiallyVisible ||
      !Array.isArray(metadata.folderIds) ||
      !Array.isArray(metadata.folderPath) ||
      metadata.folderIds.length !== metadata.folderPath.length ||
      metadata.folderIds.some((id, index) => id !== folderIds[index]) ||
      metadata.folderPath.some(
        (name, index) => name !== folderPath[index]
      )
    ) {
      errors.push(`Feature ${node.id} has inconsistent KML metadata.`);
    }

    if ((feature.geometry?.type || null) !== node.geometryType) {
      errors.push(`Feature ${node.id} has inconsistent geometryType.`);
    }
  }

  const root = geoJson.layerTree.root;
  validateCommonNode(root, "root");

  if (root.id !== "root" || root.sourceOrder !== 0) {
    errors.push("Layer-tree root must use ID root and sourceOrder 0.");
  }

  if (!hasNormalizedVisibility(root.open)) {
    errors.push("Layer-tree root has invalid open state.");
  }

  for (const child of root.children) {
    visitNode(child);
  }

  const referencedSet = new Set(referencedFeatureIds);
  if (
    referencedFeatureIds.length !== featureById.size ||
    referencedSet.size !== referencedFeatureIds.length ||
    featureIdsInOrder.some(
      (id, index) => id !== referencedFeatureIds[index]
    )
  ) {
    errors.push(
      "Layer tree must reference every feature exactly once in source order."
    );
  }

  return errors;
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
  const geoJson = buildLayeredGeoJson(document, sourcePath);

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
