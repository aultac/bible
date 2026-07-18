import { afterEach, describe, expect, it, vi } from "vitest";
import { courseLibrary, resolvePublicHref } from "./courseData";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWindow({
  hostname,
  pathname,
  basePath,
}: {
  hostname: string;
  pathname: string;
  basePath?: string;
}) {
  vi.stubGlobal("window", {
    location: { hostname, pathname },
    __KNOW_YOUR_BIBLE_BASE_PATH__: basePath,
  });
}

describe("deployment-aware course assets", () => {
  it("resolves legacy course asset prefixes from the local site root", () => {
    stubWindow({
      hostname: "localhost",
      pathname: "/genesis/23",
    });

    expect(
      resolvePublicHref(
        "/courses/resources/02-section/011-genesis23-25/cave.jpg"
      )
    ).toBe("/resources/02-section/011-genesis23-25/cave.jpg");
    expect(
      resolvePublicHref("/courses/maps/02-section/011-genesis23-25/map.geojson")
    ).toBe("/maps/02-section/011-genesis23-25/map.geojson");
  });

  it("keeps nested clean routes from making asset URLs route-relative", () => {
    stubWindow({
      hostname: "localhost",
      pathname: "/genesis/37/29",
    });

    expect(resolvePublicHref("resources/example.jpg")).toBe(
      "/resources/example.jpg"
    );
  });

  it("prepends the GitHub project basename to resources, KMZ, and GeoJSON", () => {
    stubWindow({
      hostname: "aaronault.github.io",
      pathname: "/bible/genesis/23",
    });

    expect(resolvePublicHref("/courses/resources/example.jpg")).toBe(
      "/bible/resources/example.jpg"
    );
    expect(resolvePublicHref("/courses/maps/example.kmz")).toBe(
      "/bible/maps/example.kmz"
    );
    expect(resolvePublicHref("/courses/maps/example.geojson")).toBe(
      "/bible/maps/example.geojson"
    );
  });

  it("declares the Cave of the Patriarchs image as a resolvable resource", () => {
    stubWindow({
      hostname: "localhost",
      pathname: "/genesis/23",
    });
    const lesson = courseLibrary.allLessons.find(
      (candidate) => candidate.slug === "011-genesis23-25"
    );
    const cave = lesson?.resolvedResources.find(
      (resource) => resource.name === "Hebron_Cave_of_the_Patriarchs.jpg"
    );

    expect(cave).toBeDefined();
    expect(cave?.href).toMatch(
      /^\/resources\/02-section-genesis12-50\/011-genesis23-25\//
    );
    expect(cave?.href).not.toContain("./");
  });
});
