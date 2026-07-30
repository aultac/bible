import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ResolvedLessonMap } from "./courseData";
import {
  collectDescendantFeatureIds,
  getDisplayLayerNodes,
  getFolderCheckState,
  normalizeLessonMapPayload,
  setFeatureIdsVisible,
  type FolderCheckState,
  type LessonMapFeature,
  type MapLayerContainerNode,
  type MapLayerNode,
  type NormalizedLessonMap,
} from "./lessonMapData";
import {
  buildFeatureLegendSymbol,
  buildFeatureLayerStyles,
  focusFeatureLayer,
  getFeatureSymbolKind,
  setFeatureLayerSelected,
  setFeatureLayerVisibility,
  type FeatureLayerStyles,
} from "./lessonMapLeaflet";

const DEFAULT_MAP_VIEW: L.LatLngExpression = [31.5, 35.5];
const DEFAULT_MAP_ZOOM = 5;
const EOX_WMS_URL = "https://tiles.maps.eox.at/wms";
const EOX_WMS_ATTRIBUTION =
  'Sentinel-2 cloudless - <a href="https://s2maps.eu/" target="_blank" rel="noreferrer noopener">https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)';
const PORTRAIT_DRAWER_QUERY =
  "(max-width: 820px) and (orientation: portrait)";

type GeoJsonLoadState = {
  status: "loading" | "loaded" | "error";
  data: NormalizedLessonMap | null;
  error: string | null;
};

function geometryIncludesPoint(geometry: GeoJSON.Geometry | null): boolean {
  if (!geometry) {
    return false;
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some(geometryIncludesPoint);
  }
  return geometry.type.includes("Point");
}

function createPointMarkerIcon(feature: LessonMapFeature) {
  const symbol = buildFeatureLegendSymbol(feature);
  const width = Math.round(24 * symbol.scale);
  const height = Math.round(34 * symbol.scale);

  return L.divIcon({
    className: "map-point-marker",
    html: `<svg aria-hidden="true" viewBox="0 0 24 34" width="${width}" height="${height}"><path d="M12 1.5c-5.8 0-10.5 4.6-10.5 10.4 0 7.9 10.5 20.6 10.5 20.6s10.5-12.7 10.5-20.6C22.5 6.1 17.8 1.5 12 1.5Z" fill="${symbol.primaryColor}" fill-opacity="${symbol.fillOpacity}" stroke="${symbol.secondaryColor}" stroke-width="1.8"/><circle cx="12" cy="11.8" r="3.7" fill="#fff" fill-opacity=".92"/></svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    tooltipAnchor: [Math.round(width * 0.35), -Math.round(height * 0.58)],
  });
}

function FeatureLegendIcon({ feature }: { feature: LessonMapFeature }) {
  const symbol = buildFeatureLegendSymbol(feature);

  if (symbol.kind === "point") {
    return (
      <svg
        className="map-layer-feature-icon"
        aria-hidden="true"
        viewBox="0 0 18 22"
      >
        <path
          d="M9 1.2A7 7 0 0 0 2 8.3C2 13.4 9 21 9 21s7-7.6 7-12.7a7 7 0 0 0-7-7.1Z"
          fill={symbol.primaryColor}
          fillOpacity={symbol.fillOpacity}
          stroke={symbol.secondaryColor}
          strokeWidth="1.4"
        />
        <circle cx="9" cy="8.2" r="2.2" fill="#fff" fillOpacity=".92" />
      </svg>
    );
  }

  if (symbol.kind === "polygon") {
    return (
      <svg
        className="map-layer-feature-icon"
        aria-hidden="true"
        viewBox="0 0 24 18"
      >
        <path
          d="m3 13 4-10 12 2 2 9-11 2Z"
          fill={symbol.primaryColor}
          fillOpacity={symbol.fillOpacity}
          stroke={symbol.secondaryColor}
          strokeOpacity={symbol.strokeOpacity}
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (symbol.kind === "line") {
    return (
      <svg
        className="map-layer-feature-icon"
        aria-hidden="true"
        viewBox="0 0 24 18"
      >
        <path
          d="M2 14 8 5l6 6 8-8"
          fill="none"
          stroke={symbol.primaryColor}
          strokeOpacity={symbol.strokeOpacity}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (symbol.kind === "collection") {
    return (
      <svg
        className="map-layer-feature-icon"
        aria-hidden="true"
        viewBox="0 0 24 20"
      >
        <path
          d="M2 16 8 8l6 5 8-9"
          fill="none"
          stroke={symbol.secondaryColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M7 1.5A4.5 4.5 0 0 0 2.5 6C2.5 9.2 7 14 7 14s4.5-4.8 4.5-8A4.5 4.5 0 0 0 7 1.5Z"
          fill={symbol.primaryColor}
          fillOpacity={symbol.fillOpacity}
          stroke="#fff"
          strokeWidth="1"
        />
      </svg>
    );
  }

  return (
    <svg
      className="map-layer-feature-icon"
      aria-hidden="true"
      viewBox="0 0 20 20"
    >
      <path
        d="m10 2 8 8-8 8-8-8Z"
        fill={symbol.primaryColor}
        fillOpacity=".65"
      />
    </svg>
  );
}

function LayerCheckbox({
  state,
  ariaLabel,
  onChange,
}: {
  state: FolderCheckState;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === "mixed";
    }
  }, [state]);

  return (
    <input
      ref={inputRef}
      className="map-layer-checkbox"
      type="checkbox"
      checked={state === "checked"}
      disabled={state === "empty"}
      aria-label={ariaLabel}
      onChange={() => onChange(state !== "checked")}
    />
  );
}

function MapLayerTree({
  nodes,
  featureById,
  visibleFeatureIds,
  expandedFolderIds,
  selectedFeatureId,
  onFeatureVisibility,
  onFolderVisibility,
  onFolderExpansion,
  onFeatureSelect,
}: {
  nodes: MapLayerNode[];
  featureById: ReadonlyMap<string, LessonMapFeature>;
  visibleFeatureIds: ReadonlySet<string>;
  expandedFolderIds: ReadonlySet<string>;
  selectedFeatureId: string | null;
  onFeatureVisibility: (featureId: string, visible: boolean) => void;
  onFolderVisibility: (
    folder: MapLayerContainerNode,
    visible: boolean
  ) => void;
  onFolderExpansion: (folderId: string) => void;
  onFeatureSelect: (featureId: string) => void;
}) {
  return (
    <ul className="map-layer-list">
      {nodes.map((node) => {
        if (node.type === "folder") {
          const expanded = expandedFolderIds.has(node.id);
          const checkState = getFolderCheckState(node, visibleFeatureIds);

          return (
            <li key={node.id} className="map-layer-folder">
              <div className="map-layer-row map-layer-folder-row">
                <LayerCheckbox
                  state={checkState}
                  ariaLabel={`Show all layers in ${node.label}`}
                  onChange={(checked) =>
                    onFolderVisibility(node, checked)
                  }
                />
                <button
                  className="map-layer-name map-layer-folder-name"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => onFolderExpansion(node.id)}
                >
                  <span className="map-layer-disclosure" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                  </span>
                  <span>{node.label}</span>
                  {checkState === "empty" ? (
                    <small>Empty</small>
                  ) : null}
                </button>
              </div>
              {expanded ? (
                <MapLayerTree
                  nodes={node.children}
                  featureById={featureById}
                  visibleFeatureIds={visibleFeatureIds}
                  expandedFolderIds={expandedFolderIds}
                  selectedFeatureId={selectedFeatureId}
                  onFeatureVisibility={onFeatureVisibility}
                  onFolderVisibility={onFolderVisibility}
                  onFolderExpansion={onFolderExpansion}
                  onFeatureSelect={onFeatureSelect}
                />
              ) : null}
            </li>
          );
        }

        const visible = visibleFeatureIds.has(node.id);
        const selected = selectedFeatureId === node.id;
        const feature = featureById.get(node.id);
        const featureKind = feature
          ? getFeatureSymbolKind(feature)
          : "feature";

        return (
          <li key={node.id}>
            <div
              className={`map-layer-row map-layer-feature-row${
                selected ? " map-layer-row-selected" : ""
              }`}
            >
              <LayerCheckbox
                state={visible ? "checked" : "unchecked"}
                ariaLabel={`Show ${node.label}`}
                onChange={(checked) =>
                  onFeatureVisibility(node.id, checked)
                }
              />
              <button
                className="map-layer-name map-layer-feature-name"
                type="button"
                aria-label={`${node.label}, ${featureKind}`}
                aria-pressed={selected}
                onClick={() => onFeatureSelect(node.id)}
              >
                {feature ? <FeatureLegendIcon feature={feature} /> : null}
                <span>{node.label}</span>
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function LessonMapPanel({
  lessonTitle,
  map,
}: {
  lessonTitle: string;
  map: ResolvedLessonMap;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const featureLayersRef = useRef(new Map<string, L.GeoJSON>());
  const baseStylesRef = useRef(new Map<string, FeatureLayerStyles>());
  const [geoJsonState, setGeoJsonState] = useState<GeoJsonLoadState>({
    status: "loading",
    data: null,
    error: null,
  });
  const [visibleFeatureIds, setVisibleFeatureIds] = useState<Set<string>>(
    new Set()
  );
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null
  );
  const [isPortraitDrawer, setIsPortraitDrawer] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(PORTRAIT_DRAWER_QUERY);
    const updateLayout = () => {
      setIsPortraitDrawer(mediaQuery.matches);
      setLayerPanelOpen(!mediaQuery.matches);
    };

    updateLayout();
    mediaQuery.addEventListener?.("change", updateLayout);
    return () => {
      mediaQuery.removeEventListener?.("change", updateLayout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGeoJson() {
      try {
        const response = await fetch(map.geoJsonHref);

        if (!response.ok) {
          throw new Error(
            `GeoJSON request failed with status ${response.status}.`
          );
        }

        const normalized = normalizeLessonMapPayload(
          (await response.json()) as unknown
        );

        if (!normalized) {
          throw new Error(
            "GeoJSON payload was not a valid lesson map feature collection."
          );
        }

        if (!cancelled) {
          setVisibleFeatureIds(
            new Set(normalized.initialVisibleFeatureIds)
          );
          setExpandedFolderIds(
            new Set(normalized.initiallyOpenFolderIds)
          );
          setSelectedFeatureId(null);
          setGeoJsonState({
            status: "loaded",
            data: normalized,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`Unable to load the map for "${lessonTitle}".`, error);
          setGeoJsonState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    setGeoJsonState({
      status: "loading",
      data: null,
      error: null,
    });
    void loadGeoJson();

    return () => {
      cancelled = true;
    };
  }, [lessonTitle, map.geoJsonHref]);

  useEffect(() => {
    const normalizedMap = geoJsonState.data;
    if (
      geoJsonState.status !== "loaded" ||
      !normalizedMap ||
      !mapContainerRef.current
    ) {
      return undefined;
    }

    const leafletMap = L.map(mapContainerRef.current, {
      scrollWheelZoom: true,
      touchZoom: true,
      dragging: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      preferCanvas: true,
    });
    leafletMapRef.current = leafletMap;

    L.tileLayer.wms(EOX_WMS_URL, {
      layers: "s2cloudless-2024_3857",
      format: "image/jpeg",
      transparent: false,
      attribution: EOX_WMS_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(leafletMap);

    const featureLayers = new Map<string, L.GeoJSON>();
    const baseStyles = new Map<string, FeatureLayerStyles>();
    const allBounds = L.latLngBounds([]);
    const visibleBounds = L.latLngBounds([]);

    for (const feature of normalizedMap.features) {
      const baseStylesForFeature = buildFeatureLayerStyles(feature);
      const label = normalizedMap.featureNodeById.get(feature.id)?.label;
      const isPointOnly =
        feature.geometry?.type === "Point" ||
        feature.geometry?.type === "MultiPoint";
      const featureLayer = L.geoJSON(feature, {
        style: () =>
          isPointOnly
            ? baseStylesForFeature.point
            : baseStylesForFeature.path,
        pointToLayer: (_leafletFeature, latlng) => {
          const marker = L.marker(latlng, {
            icon: createPointMarkerIcon(feature),
            keyboard: true,
            riseOnHover: true,
            title: label || undefined,
          });
          if (label) {
            marker.bindTooltip(label, {
              permanent: true,
              direction: "right",
              opacity: 1,
              className: "map-point-label",
            });
          }
          return marker;
        },
      });
      setFeatureLayerSelected(
        featureLayer,
        baseStylesForFeature,
        false
      );
      if (label && !geometryIncludesPoint(feature.geometry)) {
        featureLayer.bindTooltip(label, { sticky: true });
      }

      featureLayers.set(feature.id, featureLayer);
      baseStyles.set(feature.id, baseStylesForFeature);

      const bounds = featureLayer.getBounds();
      if (bounds.isValid()) {
        allBounds.extend(bounds);
        if (normalizedMap.initialVisibleFeatureIds.has(feature.id)) {
          visibleBounds.extend(bounds);
        }
      }

      if (normalizedMap.initialVisibleFeatureIds.has(feature.id)) {
        featureLayer.addTo(leafletMap);
      }
    }

    featureLayersRef.current = featureLayers;
    baseStylesRef.current = baseStyles;

    const initialBounds = visibleBounds.isValid()
      ? visibleBounds
      : allBounds;
    if (initialBounds.isValid()) {
      leafletMap.fitBounds(initialBounds.pad(0.12));
    } else {
      leafletMap.setView(DEFAULT_MAP_VIEW, DEFAULT_MAP_ZOOM);
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            leafletMap.invalidateSize({ pan: false });
          });
    resizeObserver?.observe(mapContainerRef.current);

    return () => {
      resizeObserver?.disconnect();
      leafletMapRef.current = null;
      featureLayersRef.current = new Map();
      baseStylesRef.current = new Map();
      leafletMap.remove();
    };
  }, [geoJsonState.data, geoJsonState.status]);

  useEffect(() => {
    const leafletMap = leafletMapRef.current;
    if (!leafletMap) {
      return;
    }

    for (const [featureId, layer] of featureLayersRef.current) {
      setFeatureLayerVisibility(
        leafletMap,
        layer,
        visibleFeatureIds.has(featureId)
      );
    }
  }, [visibleFeatureIds]);

  useEffect(() => {
    for (const [featureId, layer] of featureLayersRef.current) {
      const baseStyle = baseStylesRef.current.get(featureId);
      if (baseStyle) {
        setFeatureLayerSelected(
          layer,
          baseStyle,
          featureId === selectedFeatureId
        );
      }
    }
  }, [selectedFeatureId]);

  const normalizedMap = geoJsonState.data;
  if (geoJsonState.status !== "loaded" || !normalizedMap) {
    return null;
  }

  const handleFeatureVisibility = (
    featureId: string,
    visible: boolean
  ) => {
    setVisibleFeatureIds((current) =>
      setFeatureIdsVisible(current, [featureId], visible)
    );
    if (!visible && selectedFeatureId === featureId) {
      setSelectedFeatureId(null);
    }
  };

  const handleFolderVisibility = (
    folder: MapLayerContainerNode,
    visible: boolean
  ) => {
    const featureIds = collectDescendantFeatureIds(folder);
    setVisibleFeatureIds((current) =>
      setFeatureIdsVisible(current, featureIds, visible)
    );
    if (
      !visible &&
      selectedFeatureId &&
      featureIds.includes(selectedFeatureId)
    ) {
      setSelectedFeatureId(null);
    }
  };

  const handleFolderExpansion = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleFeatureSelect = (featureId: string) => {
    setVisibleFeatureIds((current) =>
      setFeatureIdsVisible(current, [featureId], true)
    );
    setSelectedFeatureId(featureId);
    if (isPortraitDrawer) {
      setLayerPanelOpen(false);
    }

    const leafletMap = leafletMapRef.current;
    if (leafletMap) {
      focusFeatureLayer(
        leafletMap,
        featureLayersRef.current.get(featureId)
      );
    }
  };

  const displayNodes = getDisplayLayerNodes(normalizedMap.root);
  const selectedLabel = selectedFeatureId
    ? normalizedMap.featureNodeById.get(selectedFeatureId)?.label
    : null;

  return (
    <section className="study-panel map-panel standalone-study-panel">
      <div className="section-title">
        <p className="eyebrow">Geography</p>
        <h2>Lesson map</h2>
      </div>
      <p className="map-intro" id="lesson-map-instructions">
        Use the layer list to show or hide places. Select a place name to
        reveal it, center the map, and highlight it.
      </p>

      <div className="map-frame">
        <details
          className="map-layer-panel"
          open={layerPanelOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            if (open !== layerPanelOpen) {
              setLayerPanelOpen(open);
            }
          }}
        >
          <summary>
            <span>Map layers</span>
            <small>{normalizedMap.features.length} items</small>
          </summary>
          <div className="map-layer-scroll">
            <MapLayerTree
              nodes={displayNodes}
              featureById={normalizedMap.featureById}
              visibleFeatureIds={visibleFeatureIds}
              expandedFolderIds={expandedFolderIds}
              selectedFeatureId={selectedFeatureId}
              onFeatureVisibility={handleFeatureVisibility}
              onFolderVisibility={handleFolderVisibility}
              onFolderExpansion={handleFolderExpansion}
              onFeatureSelect={handleFeatureSelect}
            />
          </div>
        </details>
        <div className="map-canvas-shell">
          <div
            ref={mapContainerRef}
            className="map-canvas"
            role="region"
            aria-label={`${lessonTitle} lesson map`}
            aria-describedby="lesson-map-instructions"
          />
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {selectedLabel ? `${selectedLabel} selected and centered.` : ""}
      </p>

      <div className="map-meta">
        <div className="map-actions">
          <a className="text-link" href={map.sourceHref}>
            Download original map
          </a>
        </div>
        <p className="map-disclaimer">
          Satellite basemap: EOX Sentinel-2 cloudless 2024.
        </p>
      </div>
    </section>
  );
}