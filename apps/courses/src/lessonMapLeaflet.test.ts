import { describe, expect, it, vi } from "vitest";
import {
  buildFeatureLegendSymbol,
  buildFeatureLayerStyles,
  buildFeatureStyle,
  buildPointStyle,
  buildSelectedStyle,
  focusFeatureLayer,
  setFeatureLayerSelected,
  setFeatureLayerVisibility,
} from "./lessonMapLeaflet";
import type { LessonMapFeature } from "./lessonMapData";

function feature(
  geometry: GeoJSON.Geometry,
  properties: GeoJSON.GeoJsonProperties = {}
): LessonMapFeature {
  return {
    type: "Feature",
    id: "feature-0001",
    properties,
    geometry,
  };
}

function mapAdapter(initiallyVisible = false) {
  let visible = initiallyVisible;
  return {
    map: {
      hasLayer: vi.fn(() => visible),
      addLayer: vi.fn(() => {
        visible = true;
      }),
      removeLayer: vi.fn(() => {
        visible = false;
      }),
      fitBounds: vi.fn(),
    },
    isVisible: () => visible,
  };
}

describe("lesson map Leaflet helpers", () => {
  it("maps authored KML polygon styles and clamps unsafe numeric values", () => {
    const style = buildFeatureStyle(
      feature(
        {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [0, 0],
            ],
          ],
        },
        {
          stroke: "#123456",
          "stroke-width": 40,
          "stroke-opacity": -1,
          fill: "#abcdef",
          "fill-opacity": 0.5,
        }
      )
    );

    expect(style).toEqual({
      color: "#123456",
      weight: 20,
      opacity: 0,
      fillColor: "#abcdef",
      fillOpacity: 0.5,
    });
  });

  it("uses authored point color, opacity, and scale with safe fallbacks", () => {
    expect(
      buildPointStyle(
        feature(
          { type: "Point", coordinates: [0, 0] },
          {
            "icon-color": "#fc0107",
            "icon-opacity": 0.4,
            "icon-scale": 2,
          }
        )
      )
    ).toMatchObject({
      radius: 12,
      fillColor: "#fc0107",
      fillOpacity: 0.4,
    });
    expect(
      buildPointStyle(
        feature(
          { type: "Point", coordinates: [0, 0] },
          {
            icon:
              "https://maps.google.com/mapfiles/kml/paddle/wht-circle.png",
          }
        )
      )
    ).toMatchObject({
      fillColor: "#f8fafc",
    });
    expect(
      buildFeatureStyle(
        feature(
          {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
          { stroke: "not-a-color" }
        )
      )
    ).toMatchObject({
      color: "#38bdf8",
      weight: 3,
      fillOpacity: 0,
    });
  });

  it("builds color-matched marker, polygon, and collection legend symbols", () => {
    expect(
      buildFeatureLegendSymbol(
        feature(
          { type: "Point", coordinates: [0, 0] },
          { "icon-color": "#21ff06", "icon-opacity": 0.6 }
        )
      )
    ).toMatchObject({
      kind: "point",
      primaryColor: "#21ff06",
      fillOpacity: 0.6,
    });
    expect(
      buildFeatureLegendSymbol(
        feature(
          {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [0, 0],
              ],
            ],
          },
          {
            fill: "#abcdef",
            stroke: "#123456",
            "fill-opacity": 0.4,
          }
        )
      )
    ).toMatchObject({
      kind: "polygon",
      primaryColor: "#abcdef",
      secondaryColor: "#123456",
      fillOpacity: 0.4,
    });
    expect(
      buildFeatureLegendSymbol(
        feature(
          {
            type: "GeometryCollection",
            geometries: [
              { type: "Point", coordinates: [0, 0] },
              {
                type: "LineString",
                coordinates: [
                  [0, 0],
                  [1, 1],
                ],
              },
            ],
          },
          { "icon-color": "#fc0107", stroke: "#123456" }
        )
      )
    ).toMatchObject({
      kind: "collection",
      primaryColor: "#fc0107",
      secondaryColor: "#123456",
    });
  });

  it("adds and removes feature layers only when visibility changes", () => {
    const adapter = mapAdapter();
    const layer = {};

    expect(setFeatureLayerVisibility(adapter.map, layer, true)).toBe(true);
    expect(adapter.map.addLayer).toHaveBeenCalledOnce();
    expect(adapter.isVisible()).toBe(true);

    setFeatureLayerVisibility(adapter.map, layer, true);
    expect(adapter.map.addLayer).toHaveBeenCalledOnce();

    setFeatureLayerVisibility(adapter.map, layer, false);
    expect(adapter.map.removeLayer).toHaveBeenCalledOnce();
    expect(adapter.isVisible()).toBe(false);
    expect(setFeatureLayerVisibility(adapter.map, null, true)).toBe(false);
  });

  it("focuses valid bounds and restores the authored style after selection", () => {
    const adapter = mapAdapter();
    const paddedBounds = {};
    const layer = {
      getBounds: vi.fn(() => ({
        isValid: () => true,
        pad: vi.fn(() => paddedBounds),
      })),
      setStyle: vi.fn(),
      bringToFront: vi.fn(),
    };
    const baseStyles = {
      path: { color: "#123456", fillOpacity: 0.2 },
      point: {
        radius: 7,
        color: "#ffffff",
        fillColor: "#654321",
        fillOpacity: 0.8,
      },
    };

    expect(focusFeatureLayer(adapter.map, layer)).toBe(true);
    expect(adapter.map.fitBounds).toHaveBeenCalledWith(paddedBounds, {
      maxZoom: 10,
    });

    expect(setFeatureLayerSelected(layer, baseStyles, true)).toBe(true);
    expect(layer.setStyle).toHaveBeenLastCalledWith(
      buildSelectedStyle(baseStyles.path)
    );
    expect(layer.bringToFront).toHaveBeenCalledOnce();

    setFeatureLayerSelected(layer, baseStyles, false);
    expect(layer.setStyle).toHaveBeenLastCalledWith(baseStyles.path);
    expect(
      focusFeatureLayer(adapter.map, {
        getBounds: () => ({ isValid: () => false }),
      })
    ).toBe(false);
  });

  it("restores point and path descendants with their distinct authored styles", () => {
    const pointLayer = {
      getRadius: () => 8,
      setStyle: vi.fn(),
      bringToFront: vi.fn(),
    };
    const pathLayer = {
      setStyle: vi.fn(),
      bringToFront: vi.fn(),
    };
    const group = {
      eachLayer(
        callback: (layer: typeof pointLayer | typeof pathLayer) => void
      ) {
        callback(pointLayer);
        callback(pathLayer);
      },
    };
    const styles = buildFeatureLayerStyles(
      feature(
        {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [0, 0] },
            {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        },
        {
          stroke: "#123456",
          "icon-color": "#abcdef",
        }
      )
    );

    expect(setFeatureLayerSelected(group, styles, false)).toBe(true);
    expect(pointLayer.setStyle).toHaveBeenCalledWith(styles.point);
    expect(pathLayer.setStyle).toHaveBeenCalledWith(styles.path);

    setFeatureLayerSelected(group, styles, true);
    expect(pointLayer.setStyle).toHaveBeenLastCalledWith(
      buildSelectedStyle(styles.point)
    );
    expect(pathLayer.setStyle).toHaveBeenLastCalledWith(
      buildSelectedStyle(styles.path)
    );
    expect(pointLayer.bringToFront).toHaveBeenCalledOnce();
    expect(pathLayer.bringToFront).toHaveBeenCalledOnce();
  });

  it("toggles selection state for DOM-based marker descendants", () => {
    const classList = { toggle: vi.fn() };
    const markerLayer = {
      getElement: () => ({ classList }) as unknown as HTMLElement,
      setZIndexOffset: vi.fn(),
    };
    const group = {
      eachLayer(callback: (layer: typeof markerLayer) => void) {
        callback(markerLayer);
      },
    };
    const styles = buildFeatureLayerStyles(
      feature({ type: "Point", coordinates: [0, 0] })
    );

    expect(setFeatureLayerSelected(group, styles, true)).toBe(true);
    expect(classList.toggle).toHaveBeenCalledWith(
      "map-point-marker-selected",
      true
    );
    expect(markerLayer.setZIndexOffset).toHaveBeenCalledWith(1000);

    setFeatureLayerSelected(group, styles, false);
    expect(classList.toggle).toHaveBeenLastCalledWith(
      "map-point-marker-selected",
      false
    );
    expect(markerLayer.setZIndexOffset).toHaveBeenLastCalledWith(0);
  });
});
