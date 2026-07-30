import type { PathOptions } from "leaflet";
import type { LessonMapFeature } from "./lessonMapData";

export interface MapLayerAdapter {
  hasLayer(layer: unknown): boolean;
  addLayer(layer: unknown): unknown;
  removeLayer(layer: unknown): unknown;
  fitBounds(bounds: unknown, options?: { maxZoom?: number }): unknown;
}

export interface FeatureLayerAdapter {
  setStyle?(style: PathOptions): unknown;
  bringToFront?(): unknown;
  eachLayer?(callback: (layer: any) => void, context?: any): unknown;
  getRadius?(): number;
  getElement?(): HTMLElement | null;
  setZIndexOffset?(offset: number): unknown;
  getBounds?(): {
    isValid(): boolean;
    pad?(ratio: number): unknown;
  };
}

export function buildFeatureLegendSymbol(
  feature: LessonMapFeature
): FeatureLegendSymbol {
  const styles = buildFeatureLayerStyles(feature);
  const kind = getFeatureSymbolKind(feature);
  const pointColor = String(styles.point.fillColor || "#2563eb");
  const pathColor = String(styles.path.color || "#f59e0b");
  const polygonColor = String(styles.path.fillColor || pathColor);

  return {
    kind,
    primaryColor:
      kind === "point" || kind === "collection"
        ? pointColor
        : kind === "polygon"
          ? polygonColor
          : pathColor,
    secondaryColor:
      kind === "point" ? String(styles.point.color || "#ffffff") : pathColor,
    fillOpacity:
      kind === "point" || kind === "collection"
        ? Number(styles.point.fillOpacity ?? 1)
        : Number(styles.path.fillOpacity ?? 0),
    strokeOpacity: Number(styles.path.opacity ?? styles.point.opacity ?? 1),
    scale: styles.point.radius / 6,
  };
}

export interface FeatureLayerStyles {
  path: PathOptions;
  point: PathOptions & { radius: number };
}

export type FeatureSymbolKind =
  | "point"
  | "polygon"
  | "line"
  | "collection"
  | "feature";

export interface FeatureLegendSymbol {
  kind: FeatureSymbolKind;
  primaryColor: string;
  secondaryColor: string;
  fillOpacity: number;
  strokeOpacity: number;
  scale: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function geometryContains(
  geometry: GeoJSON.Geometry | null,
  typeFragment: string
): boolean {
  if (!geometry) {
    return false;
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some((child) =>
      geometryContains(child, typeFragment)
    );
  }
  return geometry.type.includes(typeFragment);
}

function propertyRecord(feature: LessonMapFeature) {
  return isRecord(feature.properties) ? feature.properties : {};
}

function readColor(value: unknown, fallback: string) {
  return typeof value === "string" &&
    /^#[0-9a-f]{6}$/iu.test(value.trim())
    ? value.trim()
    : fallback;
}

function inferIconColor(properties: Record<string, unknown>) {
  const authoredColor = readColor(properties["icon-color"], "");
  if (authoredColor) {
    return authoredColor;
  }

  const iconUrl =
    typeof properties.icon === "string"
      ? properties.icon.toLowerCase()
      : "";
  for (const [fragment, color] of [
    ["red-", "#fc0107"],
    ["blu-", "#2563eb"],
    ["blue-", "#2563eb"],
    ["grn-", "#21a447"],
    ["green-", "#21a447"],
    ["ylw-", "#f2c94c"],
    ["yellow-", "#f2c94c"],
    ["purple-", "#8b5cf6"],
    ["pink-", "#ec4899"],
    ["orange-", "#f97316"],
    ["wht-", "#f8fafc"],
    ["/paddle/a.", "#fc0107"],
  ] as const) {
    if (iconUrl.includes(fragment)) {
      return color;
    }
  }

  return "#2563eb";
}

function readNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

export function buildFeatureStyle(
  feature: LessonMapFeature
): PathOptions {
  const properties = propertyRecord(feature);
  const isLine = geometryContains(feature.geometry, "LineString");
  const isPolygon = geometryContains(feature.geometry, "Polygon");
  const fallbackColor = isLine ? "#38bdf8" : "#f59e0b";
  const fallbackWeight = isLine ? 3 : 2;

  return {
    color: readColor(properties.stroke, fallbackColor),
    weight: readNumber(
      properties["stroke-width"],
      fallbackWeight,
      0,
      20
    ),
    opacity: readNumber(
      properties["stroke-opacity"],
      0.9,
      0,
      1
    ),
    fillColor: readColor(properties.fill, "#f59e0b"),
    fillOpacity: readNumber(
      properties["fill-opacity"],
      isPolygon ? 0.18 : 0,
      0,
      1
    ),
  };
}

export function buildPointStyle(
  feature: LessonMapFeature
): PathOptions & { radius: number } {
  const properties = propertyRecord(feature);
  const scale = readNumber(properties["icon-scale"], 1, 0.5, 3);

  return {
    radius: readNumber(6 * scale, 6, 4, 14),
    color: "#ffffff",
    weight: 2,
    opacity: 1,
    fillColor: inferIconColor(properties),
    fillOpacity: readNumber(
      properties["icon-opacity"],
      0.95,
      0,
      1
    ),
  };
}

export function getFeatureSymbolKind(
  feature: LessonMapFeature
): FeatureSymbolKind {
  if (feature.geometry?.type === "GeometryCollection") {
    return "collection";
  }
  if (geometryContains(feature.geometry, "Polygon")) {
    return "polygon";
  }
  if (geometryContains(feature.geometry, "LineString")) {
    return "line";
  }
  if (geometryContains(feature.geometry, "Point")) {
    return "point";
  }
  return "feature";
}

export function buildFeatureLayerStyles(
  feature: LessonMapFeature
): FeatureLayerStyles {
  return {
    path: buildFeatureStyle(feature),
    point: buildPointStyle(feature),
  };
}

export function buildSelectedStyle(baseStyle: PathOptions): PathOptions {
  return {
    ...baseStyle,
    color: "#ffffff",
    weight: Math.max(4, Number(baseStyle.weight || 2) + 2),
    opacity: 1,
    fillOpacity: Math.max(0.35, Number(baseStyle.fillOpacity || 0)),
  };
}

export function setFeatureLayerVisibility(
  map: MapLayerAdapter,
  layer: unknown,
  visible: boolean
) {
  if (!layer) {
    return false;
  }

  const currentlyVisible = map.hasLayer(layer);
  if (visible && !currentlyVisible) {
    map.addLayer(layer);
  } else if (!visible && currentlyVisible) {
    map.removeLayer(layer);
  }
  return true;
}

export function setFeatureLayerSelected(
  layer: FeatureLayerAdapter | undefined,
  baseStyles: FeatureLayerStyles,
  selected: boolean
) {
  if (!layer) {
    return false;
  }
  let styledLayerCount = 0;

  function applyStyle(current: FeatureLayerAdapter) {
    let childCount = 0;
    current.eachLayer?.((child) => {
      childCount += 1;
      applyStyle(child);
    });

    if (childCount === 0 && current.setStyle) {
      const baseStyle = current.getRadius
        ? baseStyles.point
        : baseStyles.path;
      current.setStyle(
        selected ? buildSelectedStyle(baseStyle) : baseStyle
      );
      if (selected) {
        current.bringToFront?.();
      }
      styledLayerCount += 1;
    }

    if (childCount === 0 && !current.setStyle && current.getElement) {
      const element = current.getElement();
      element?.classList.toggle("map-point-marker-selected", selected);
      current.setZIndexOffset?.(selected ? 1000 : 0);
      styledLayerCount += 1;
    }
  }

  applyStyle(layer);
  return styledLayerCount > 0;
}

export function focusFeatureLayer(
  map: MapLayerAdapter,
  layer: FeatureLayerAdapter | undefined
) {
  const bounds = layer?.getBounds?.();
  if (!bounds?.isValid()) {
    return false;
  }

  map.fitBounds(bounds.pad?.(0.18) || bounds, { maxZoom: 10 });
  return true;
}
