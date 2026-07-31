import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./App";
import { ProgressProvider } from "./ProgressProvider";

describe("site header", () => {
  it("links to the latest lesson and full YouTube playlist", () => {
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: "/" },
        createElement(
          ProgressProvider,
          null,
          createElement(SiteHeader)
        )
      )
    );

    expect(html).toContain(">Latest</a>");
    expect(html).not.toContain("Latest lesson");
    expect(html).toContain(
      'href="https://youtube.com/playlist?list=PLhEOtft6GPkCh5d27mIMwF8rJHsl6M6fz&amp;si=32O-vtvpCaUhoGHE"'
    );
    expect(html).toContain(">Playlist</a>");
  });
});
