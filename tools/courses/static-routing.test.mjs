import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./config.mjs";

function extractFirstScript(html) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
  if (!script) {
    throw new Error("Expected an inline route-restoration script.");
  }
  return script;
}

function createSessionStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

describe("GitHub Pages clean-route fallback", () => {
  it("round-trips a project-page route, query, and hash", async () => {
    const fallbackHtml = await readFile(
      `${REPO_ROOT}/static/404.html`,
      "utf8"
    );
    const appHtml = await readFile(
      `${REPO_ROOT}/apps/courses/index.html`,
      "utf8"
    );
    const sessionStorage = createSessionStorage();
    let redirectedUrl = "";
    const fallbackLocation = {
      hostname: "aultac.github.io",
      pathname: "/bible/genesis/0/0",
      search: "?source=shared",
      hash: "#notes",
      origin: "https://aultac.github.io",
      replace(url) {
        redirectedUrl = url;
      },
    };

    vm.runInNewContext(extractFirstScript(fallbackHtml), {
      URLSearchParams,
      window: {
        location: fallbackLocation,
        sessionStorage,
      },
    });

    expect(redirectedUrl).toMatch(
      /^https:\/\/aultac\.github\.io\/bible\/\?__know_your_bible_route=/u
    );

    let restoredUrl = "";
    const redirectQuery = new URL(redirectedUrl).search;
    const appWindow = {
      location: {
        hostname: "aultac.github.io",
        pathname: "/bible/",
        search: redirectQuery,
      },
      sessionStorage,
      history: {
        replaceState(_state, _title, url) {
          restoredUrl = url;
        },
      },
    };

    vm.runInNewContext(extractFirstScript(appHtml), {
      URLSearchParams,
      window: appWindow,
    });

    expect(appWindow.__KNOW_YOUR_BIBLE_BASE_PATH__).toBe("/bible");
    expect(restoredUrl).toBe(
      "/bible/genesis/0/0?source=shared#notes"
    );
  });

  it("round-trips a custom-domain route when session storage is unavailable", async () => {
    const fallbackHtml = await readFile(
      `${REPO_ROOT}/static/404.html`,
      "utf8"
    );
    const appHtml = await readFile(
      `${REPO_ROOT}/apps/courses/index.html`,
      "utf8"
    );
    const unavailableSessionStorage = {
      getItem() {
        throw new Error("Storage is unavailable.");
      },
      removeItem() {
        throw new Error("Storage is unavailable.");
      },
      setItem() {
        throw new Error("Storage is unavailable.");
      },
    };
    let redirectedUrl = "";

    vm.runInNewContext(extractFirstScript(fallbackHtml), {
      URLSearchParams,
      window: {
        location: {
          hostname: "knowyourbible.study",
          pathname: "/genesis/37/29",
          search: "?source=shared",
          hash: "#notes",
          origin: "https://knowyourbible.study",
          replace(url) {
            redirectedUrl = url;
          },
        },
        sessionStorage: unavailableSessionStorage,
      },
    });

    expect(redirectedUrl).toMatch(
      /^https:\/\/knowyourbible\.study\/\?__know_your_bible_route=/u
    );

    let restoredUrl = "";
    const appWindow = {
      location: {
        hostname: "knowyourbible.study",
        pathname: "/",
        search: new URL(redirectedUrl).search,
      },
      sessionStorage: unavailableSessionStorage,
      history: {
        replaceState(_state, _title, url) {
          restoredUrl = url;
        },
      },
    };

    vm.runInNewContext(extractFirstScript(appHtml), {
      URLSearchParams,
      window: appWindow,
    });

    expect(appWindow.__KNOW_YOUR_BIBLE_BASE_PATH__).toBe("");
    expect(restoredUrl).toBe(
      "/genesis/37/29?source=shared#notes"
    );
  });

  it("ignores malformed stored redirects and infers the project base", async () => {
    const appHtml = await readFile(
      `${REPO_ROOT}/apps/courses/index.html`,
      "utf8"
    );
    const sessionStorage = createSessionStorage();
    sessionStorage.setItem(
      "know-your-bible:route-redirect",
      "{not valid JSON"
    );
    let restoredUrl = "";
    const appWindow = {
      location: {
        hostname: "aultac.github.io",
        pathname: "/bible/",
        search: "",
      },
      sessionStorage,
      history: {
        replaceState(_state, _title, url) {
          restoredUrl = url;
        },
      },
    };

    vm.runInNewContext(extractFirstScript(appHtml), {
      URLSearchParams,
      window: appWindow,
    });

    expect(appWindow.__KNOW_YOUR_BIBLE_BASE_PATH__).toBe("/bible");
    expect(restoredUrl).toBe("");
    expect(
      sessionStorage.getItem("know-your-bible:route-redirect")
    ).toBeNull();
  });
});
