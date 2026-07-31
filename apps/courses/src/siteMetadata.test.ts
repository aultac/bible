import { describe, expect, it } from "vitest";
import packageMetadata from "../../../package.json";
import {
  SITE_TITLE,
  YOUTUBE_PLAYLIST_URL,
  setInitialDocumentTitle,
} from "./siteMetadata";

describe("site metadata", () => {
  it("builds the browser title from the root package version", () => {
    const target = { title: "Old title" };

    setInitialDocumentTitle(target);

    expect(SITE_TITLE).toBe(
      `Know Your Bible - v${packageMetadata.version}`
    );
    expect(target.title).toBe(SITE_TITLE);
  });

  it("uses the public Know Your Bible YouTube playlist", () => {
    expect(YOUTUBE_PLAYLIST_URL).toBe(
      "https://youtube.com/playlist?list=PLhEOtft6GPkCh5d27mIMwF8rJHsl6M6fz&si=32O-vtvpCaUhoGHE"
    );
  });
});
