import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ResolvedLessonMap } from "./courseData";

const DEFAULT_MAP_VIEW: L.LatLngExpression = [31.5, 35.5];
const DEFAULT_MAP_ZOOM = 5;
const EOX_WMS_URL = "https://tiles.maps.eox.at/wms";
const EOX_WMS_ATTRIBUTION =
  'Sentinel-2 cloudless - <a href="https://s2maps.eu/" target="_blank" rel="noreferrer noopener">https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)';

type GeoJsonFeatureCollection = GeoJSON.FeatureCollection;

type GeoJsonLoadState = {
  status: "loading" | "loaded" | "error";
  data: GeoJsonFeatureCollection | null;
  error: string | null;
};

function isGeoJsonFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    features?: unknown;
  };

  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

function getFeatureLabel(feature: GeoJSON.Feature | undefined) {
  if (!feature?.properties || typeof feature.properties !== "object") {
    return null;
  }

  const properties = feature.properties as Record<string, unknown>;
  const candidates = [
    properties.name,
    properties.Name,
    properties.title,
    properties.Title,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function buildFeatureStyle(feature?: GeoJSON.Feature): L.PathOptions {
  const geometryType = feature?.geometry?.type || "";
  const isLine = geometryType.includes("LineString");
  const isPolygon = geometryType.includes("Polygon");

  return {
    color: isLine ? "#38bdf8" : "#f59e0b",
    weight: isLine ? 3 : 2,
    opacity: 0.9,
    fillColor: "#f59e0b",
    fillOpacity: isPolygon ? 0.18 : 0,
  };
}


export default function LessonMapPanel({
  lessonTitle,
  map,
}: {
  lessonTitle: string;
  map: ResolvedLessonMap;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [geoJsonState, setGeoJsonState] = useState<GeoJsonLoadState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadGeoJson() {
      try {
        const response = await fetch(map.geoJsonHref);

        if (!response.ok) {
          throw new Error(`GeoJSON request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as unknown;

        if (!isGeoJsonFeatureCollection(payload)) {
          throw new Error("GeoJSON payload was not a feature collection.");
        }

        if (!cancelled) {
          setGeoJsonState({
            status: "loaded",
            data: payload,
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
    if (
      geoJsonState.status !== "loaded" ||
      !geoJsonState.data ||
      !mapContainerRef.current
    ) {
      return undefined;
    }

    const leafletMap = L.map(mapContainerRef.current, {
      scrollWheelZoom: false,
      preferCanvas: true,
    });

    L.tileLayer.wms(EOX_WMS_URL, {
      layers: "s2cloudless-2024_3857",
      format: "image/jpeg",
      transparent: false,
      attribution: EOX_WMS_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(leafletMap);

    const geoJsonLayer = L.geoJSON(geoJsonState.data, {
      style: buildFeatureStyle,
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 0.95,
        }),
      onEachFeature: (feature, layer) => {
        const label = getFeatureLabel(feature);

        if (label) {
          layer.bindTooltip(label, {
            sticky: true,
          });
        }
      },
    }).addTo(leafletMap);

    const bounds = geoJsonLayer.getBounds();

    if (bounds.isValid()) {
      leafletMap.fitBounds(bounds.pad(0.12));
    } else {
      leafletMap.setView(DEFAULT_MAP_VIEW, DEFAULT_MAP_ZOOM);
    }

    return () => {
      leafletMap.remove();
    };
  }, [geoJsonState]);

  if (geoJsonState.status !== "loaded" || !geoJsonState.data) {
    return null;
  }

  return (
    <section className="study-panel map-panel standalone-study-panel">
      <div className="section-title">
        <p className="eyebrow">Geography</p>
        <h2>Lesson map</h2>
      </div>
      <p className="map-intro">
        Explore the places and movements connected to this passage.
      </p>

      <div className="map-frame">
        <div
          ref={mapContainerRef}
          className="map-canvas"
          aria-label={`${lessonTitle} lesson map`}
        />
      </div>

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
