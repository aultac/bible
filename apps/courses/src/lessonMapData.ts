export type LayerVisibility = boolean | null;

export interface LessonMapFeature extends GeoJSON.Feature {
  id: string;
}

interface MapLayerNodeBase {
  id: string;
  name: string | null;
  label: string;
  sourceOrder: number;
  visibility: LayerVisibility;
  initiallyVisible: boolean;
}

export interface MapLayerFeatureNode extends MapLayerNodeBase {
  type: "feature";
  geometryType: string | null;
}

export interface MapLayerFolderNode extends MapLayerNodeBase {
  type: "folder";
  open: LayerVisibility;
  children: MapLayerNode[];
}

export interface MapLayerRootNode extends MapLayerNodeBase {
  type: "root";
  open: LayerVisibility;
  children: MapLayerNode[];
}

export type MapLayerNode = MapLayerFolderNode | MapLayerFeatureNode;
export type MapLayerContainerNode = MapLayerRootNode | MapLayerFolderNode;
type UnlabeledMapLayerFeatureNode = Omit<MapLayerFeatureNode, "label">;
type UnlabeledMapLayerFolderNode = Omit<
  MapLayerFolderNode,
  "label" | "children"
> & {
  children: UnlabeledMapLayerNode[];
};
type UnlabeledMapLayerNode =
  | UnlabeledMapLayerFeatureNode
  | UnlabeledMapLayerFolderNode;

export interface NormalizedLessonMap {
  features: LessonMapFeature[];
  featureById: Map<string, LessonMapFeature>;
  featureNodeById: Map<string, MapLayerFeatureNode>;
  root: MapLayerRootNode;
  initialVisibleFeatureIds: Set<string>;
  initiallyOpenFolderIds: Set<string>;
}

export type FolderCheckState =
  | "checked"
  | "unchecked"
  | "mixed"
  | "empty";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLayerVisibility(value: unknown): value is LayerVisibility {
  return value === null || typeof value === "boolean";
}

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function getFeatureName(feature: GeoJSON.Feature) {
  if (!isRecord(feature.properties)) {
    return null;
  }

  for (const candidate of [
    feature.properties.name,
    feature.properties.Name,
    feature.properties.title,
    feature.properties.Title,
  ]) {
    const name = cleanName(candidate);
    if (name) {
      return name;
    }
  }

  return null;
}

function geometryLabel(geometryType: string | null) {
  if (geometryType?.includes("Point")) {
    return "point";
  }
  if (geometryType?.includes("LineString")) {
    return "route";
  }
  if (geometryType?.includes("Polygon")) {
    return "area";
  }
  if (geometryType === "GeometryCollection") {
    return "group";
  }
  return "feature";
}

function addDisplayLabels(children: UnlabeledMapLayerNode[]): MapLayerNode[] {
  let unnamedFolderIndex = 0;
  let unnamedFeatureIndex = 0;
  const baseLabels = children.map((child) => {
    if (child.name) {
      return child.name;
    }
    if (child.type === "folder") {
      unnamedFolderIndex += 1;
      return `Unnamed folder ${unnamedFolderIndex}`;
    }
    unnamedFeatureIndex += 1;
    return `Unnamed feature ${unnamedFeatureIndex}`;
  });
  const featureKindCounts = new Map<string, number>();

  children.forEach((child, index) => {
    if (child.type === "feature") {
      const base = baseLabels[index];
      const key = `${base}\u0000${geometryLabel(child.geometryType)}`;
      featureKindCounts.set(key, (featureKindCounts.get(key) || 0) + 1);
    }
  });
  const featureKindIndexes = new Map<string, number>();

  return children.map((child, index): MapLayerNode => {
    let label = baseLabels[index];

    if (child.type === "feature") {
      const key = `${label}\u0000${geometryLabel(child.geometryType)}`;
      const nextIndex = (featureKindIndexes.get(key) || 0) + 1;
      featureKindIndexes.set(key, nextIndex);
      if ((featureKindCounts.get(key) || 0) > 1) {
        label = `${label} ${nextIndex}`;
      }
    }

    if (child.type === "folder") {
      return {
        ...child,
        label,
        children: addDisplayLabels(child.children),
      };
    }

    return {
      ...child,
      label,
    };
  });
}

function normalizeFeature(
  value: unknown,
  id: string
): LessonMapFeature | null {
  if (!isRecord(value) || value.type !== "Feature" || !("geometry" in value)) {
    return null;
  }

  return {
    ...(value as unknown as GeoJSON.Feature),
    id,
  };
}

function normalizeTreeNode(
  value: unknown,
  featureById: Map<string, LessonMapFeature>,
  referencedFeatureIds: string[]
): UnlabeledMapLayerNode | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !isNullableString(value.name) ||
    !Number.isInteger(value.sourceOrder) ||
    !isLayerVisibility(value.visibility) ||
    typeof value.initiallyVisible !== "boolean"
  ) {
    return null;
  }

  if (value.type === "feature") {
    if (
      !isNullableString(value.geometryType) ||
      !featureById.has(value.id)
    ) {
      return null;
    }

    referencedFeatureIds.push(value.id);
    return {
      type: "feature",
      id: value.id,
      name: cleanName(value.name),
      sourceOrder: value.sourceOrder as number,
      visibility: value.visibility,
      initiallyVisible: value.initiallyVisible,
      geometryType: value.geometryType,
    };
  }

  if (
    value.type !== "folder" ||
    !isLayerVisibility(value.open) ||
    !Array.isArray(value.children)
  ) {
    return null;
  }

  const children = value.children.map((child) =>
    normalizeTreeNode(child, featureById, referencedFeatureIds)
  );

  if (children.some((child) => !child)) {
    return null;
  }

  return {
    type: "folder",
    id: value.id,
    name: cleanName(value.name),
    sourceOrder: value.sourceOrder as number,
    visibility: value.visibility,
    initiallyVisible: value.initiallyVisible,
    open: value.open,
    children: children as UnlabeledMapLayerNode[],
  };
}

function buildNormalizedMap(
  features: LessonMapFeature[],
  root: MapLayerRootNode
): NormalizedLessonMap {
  const featureById = new Map(
    features.map((feature) => [feature.id, feature])
  );
  const featureNodeById = new Map<string, MapLayerFeatureNode>();
  const initialVisibleFeatureIds = new Set<string>();
  const initiallyOpenFolderIds = new Set<string>();

  function visit(node: MapLayerNode) {
    if (node.type === "feature") {
      featureNodeById.set(node.id, node);
      if (node.initiallyVisible) {
        initialVisibleFeatureIds.add(node.id);
      }
      return;
    }

    if (node.open === true) {
      initiallyOpenFolderIds.add(node.id);
    }
    node.children.forEach(visit);
  }

  root.children.forEach(visit);

  return {
    features,
    featureById,
    featureNodeById,
    root,
    initialVisibleFeatureIds,
    initiallyOpenFolderIds,
  };
}

function normalizeEnrichedMap(value: Record<string, unknown>) {
  if (
    !Array.isArray(value.features) ||
    !isRecord(value.layerTree) ||
    value.layerTree.schemaVersion !== 1 ||
    !isRecord(value.layerTree.root)
  ) {
    return null;
  }

  const features = [];
  const featureIds = new Set<string>();

  for (const rawFeature of value.features) {
    if (
      !isRecord(rawFeature) ||
      typeof rawFeature.id !== "string" ||
      !rawFeature.id ||
      featureIds.has(rawFeature.id)
    ) {
      return null;
    }

    const feature = normalizeFeature(rawFeature, rawFeature.id);
    if (!feature) {
      return null;
    }
    featureIds.add(feature.id);
    features.push(feature);
  }

  const rawRoot = value.layerTree.root;
  if (
    rawRoot.type !== "root" ||
    rawRoot.id !== "root" ||
    !isNullableString(rawRoot.name) ||
    !Number.isInteger(rawRoot.sourceOrder) ||
    !isLayerVisibility(rawRoot.visibility) ||
    typeof rawRoot.initiallyVisible !== "boolean" ||
    !isLayerVisibility(rawRoot.open) ||
    !Array.isArray(rawRoot.children)
  ) {
    return null;
  }

  const featureById = new Map(
    features.map((feature) => [feature.id, feature])
  );
  const referencedFeatureIds: string[] = [];
  const children = rawRoot.children.map((child) =>
    normalizeTreeNode(child, featureById, referencedFeatureIds)
  );

  if (
    children.some((child) => !child) ||
    referencedFeatureIds.length !== featureIds.size ||
    new Set(referencedFeatureIds).size !== referencedFeatureIds.length ||
    referencedFeatureIds.some((id) => !featureIds.has(id))
  ) {
    return null;
  }

  const labeledChildren = addDisplayLabels(
    children as UnlabeledMapLayerNode[]
  );
  const root: MapLayerRootNode = {
    type: "root",
    id: "root",
    name: cleanName(rawRoot.name),
    label: cleanName(rawRoot.name) || "Map layers",
    sourceOrder: rawRoot.sourceOrder as number,
    visibility: rawRoot.visibility,
    initiallyVisible: rawRoot.initiallyVisible,
    open: rawRoot.open,
    children: labeledChildren,
  };

  return buildNormalizedMap(features, root);
}

function normalizeLegacyMap(value: Record<string, unknown>) {
  if (!Array.isArray(value.features)) {
    return null;
  }

  const features = [];
  const children = [];
  const usedIds = new Set<string>();

  for (const [index, rawFeature] of value.features.entries()) {
    const candidateId =
      isRecord(rawFeature) &&
      typeof rawFeature.id === "string" &&
      rawFeature.id &&
      !usedIds.has(rawFeature.id)
        ? rawFeature.id
        : `feature-${String(index + 1).padStart(4, "0")}`;
    let id = candidateId;
    let collisionIndex = index + 1;

    while (usedIds.has(id)) {
      collisionIndex += 1;
      id = `feature-${String(collisionIndex).padStart(4, "0")}`;
    }

    const feature = normalizeFeature(rawFeature, id);
    if (!feature) {
      return null;
    }

    usedIds.add(id);
    features.push(feature);
    const rawVisibility = isRecord(feature.properties)
      ? feature.properties.visibility
      : null;
    const visibility =
      rawVisibility === false || rawVisibility === 0 || rawVisibility === "0"
        ? false
        : rawVisibility === true ||
            rawVisibility === 1 ||
            rawVisibility === "1"
          ? true
          : null;
    children.push({
      type: "feature" as const,
      id,
      name: getFeatureName(feature),
      sourceOrder: index + 1,
      visibility,
      initiallyVisible: visibility ?? true,
      geometryType: feature.geometry?.type || null,
    });
  }

  const root: MapLayerRootNode = {
    type: "root",
    id: "root",
    name: null,
    label: "Map layers",
    sourceOrder: 0,
    visibility: null,
    initiallyVisible: true,
    open: true,
    children: addDisplayLabels(children),
  };

  return buildNormalizedMap(features, root);
}

export function normalizeLessonMapPayload(
  value: unknown
): NormalizedLessonMap | null {
  if (!isRecord(value) || value.type !== "FeatureCollection") {
    return null;
  }

  return value.layerTree
    ? normalizeEnrichedMap(value)
    : normalizeLegacyMap(value);
}

export function collectDescendantFeatureIds(
  node: MapLayerContainerNode | MapLayerFeatureNode
): string[] {
  if (node.type === "feature") {
    return [node.id];
  }

  return node.children.flatMap(collectDescendantFeatureIds);
}

export function getDisplayLayerNodes(root: MapLayerRootNode): MapLayerNode[] {
  const [onlyChild] = root.children;
  return root.children.length === 1 && onlyChild?.type === "folder"
    ? onlyChild.children
    : root.children;
}

export function getFolderCheckState(
  node: MapLayerContainerNode,
  visibleFeatureIds: ReadonlySet<string>
): FolderCheckState {
  const featureIds = collectDescendantFeatureIds(node);
  if (featureIds.length === 0) {
    return "empty";
  }

  const visibleCount = featureIds.filter((id) =>
    visibleFeatureIds.has(id)
  ).length;

  if (visibleCount === 0) {
    return "unchecked";
  }
  if (visibleCount === featureIds.length) {
    return "checked";
  }
  return "mixed";
}

export function setFeatureIdsVisible(
  current: ReadonlySet<string>,
  featureIds: Iterable<string>,
  visible: boolean
) {
  const next = new Set(current);
  for (const id of featureIds) {
    if (visible) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}
