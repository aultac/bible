import packageMetadata from "../../../package.json";

export const SITE_TITLE = `Know Your Bible - v${packageMetadata.version}`;
export const YOUTUBE_PLAYLIST_URL =
  "https://youtube.com/playlist?list=PLhEOtft6GPkCh5d27mIMwF8rJHsl6M6fz&si=32O-vtvpCaUhoGHE";

export function setInitialDocumentTitle(
  target: { title: string } = document
) {
  target.title = SITE_TITLE;
}
