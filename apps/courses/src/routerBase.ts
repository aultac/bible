declare global {
  interface Window {
    __KNOW_YOUR_BIBLE_BASE_PATH__?: string;
  }
}

function normalizeBasePath(value: string) {
  if (!value || value === "/") {
    return "";
  }

  return `/${value.replace(/^\/+|\/+$/gu, "")}`;
}

export function getSiteBasePath() {
  if (typeof window === "undefined") {
    return "";
  }

  if (window.__KNOW_YOUR_BIBLE_BASE_PATH__ !== undefined) {
    return normalizeBasePath(window.__KNOW_YOUR_BIBLE_BASE_PATH__);
  }

  if (window.location.hostname.endsWith(".github.io")) {
    const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0];
    return firstPathSegment ? `/${firstPathSegment}` : "";
  }

  return "";
}

export function sitePath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getSiteBasePath()}${normalizedPath}`;
}
