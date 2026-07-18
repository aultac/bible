import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { REPO_ROOT } from "./config.mjs";

const DEFAULT_CONTENT_ROOT = path.join(
  REPO_ROOT,
  "apps",
  "courses",
  "content"
);
const DEFAULT_PUBLIC_ROOT = path.join(REPO_ROOT, "apps", "courses", "public");
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function getAuditExitCode(result, { strict = false } = {}) {
  return result.totals.errors > 0 ||
    (strict && result.totals.warnings > 0)
    ? 1
    : 0;
}

async function listDirectories(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }
  return (await readdir(rootPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function collectFiles(rootPath, relativeRoot = "") {
  if (!(await pathExists(rootPath))) {
    return [];
  }
  const files = [];
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const absolutePath = path.join(rootPath, entry.name);
    const relativePath = relativeRoot
      ? path.posix.join(relativeRoot, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }
  return files;
}

function canonicalLessonPath(lesson, fallbackBookName = "course") {
  const bookName =
    lesson.passage?.start?.bookName || fallbackBookName || "course";
  const bookSlug = bookName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

  if (lesson.lessonKind === "intro") {
    return `/${bookSlug}/1/0`;
  }
  if (!lesson.passage?.start) {
    return `/${bookSlug}`;
  }
  return `/${bookSlug}/${lesson.passage.start.chapter}${
    lesson.passage.start.verse === null
      ? ""
      : `/${lesson.passage.start.verse}`
  }`;
}

function publicUrlToPath(publicRoot, publicUrl) {
  if (!publicUrl || /^https?:\/\//iu.test(publicUrl)) {
    return null;
  }
  let pathname;
  try {
    pathname = decodeURI(new URL(publicUrl, "https://audit.invalid").pathname);
  } catch {
    return null;
  }
  if (pathname.startsWith("/courses/")) {
    pathname = pathname.slice("/courses".length);
  }
  return path.join(publicRoot, pathname.replace(/^\/+/u, ""));
}

function resolvedDeploymentUrls(publicUrl) {
  if (!publicUrl || /^https?:\/\//iu.test(publicUrl)) {
    return null;
  }
  const localUrl = publicUrl.startsWith("/courses/")
    ? publicUrl.slice("/courses".length)
    : publicUrl.startsWith("/")
      ? publicUrl
      : `/${publicUrl}`;
  return {
    local: localUrl,
    githubPages: `/bible${localUrl}`,
  };
}

function isValidImage(filePath, bytes) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return (
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9
    );
  }
  if (extension === ".gif") {
    return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  }
  if (extension === ".webp") {
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (extension === ".avif") {
    return (
      bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
      /avif|avis/u.test(bytes.subarray(8, 32).toString("ascii"))
    );
  }
  if (extension === ".svg") {
    return /<svg(?:\s|>)/iu.test(bytes.toString("utf8", 0, 4096));
  }
  return true;
}

async function checkOnlineUrl(url, timeoutMs) {
  async function request(method) {
    return fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
  }

  let response = await request("HEAD");
  if (response.status === 405 || response.status === 403) {
    response = await request("GET");
  }
  return {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url,
  };
}

async function mapWithConcurrency(values, concurrency, operation) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  );
  return results;
}

export async function auditCourses({
  repoRoot = REPO_ROOT,
  contentRoot = DEFAULT_CONTENT_ROOT,
  publicRoot = DEFAULT_PUBLIC_ROOT,
  online = false,
  onlineConcurrency = 6,
  onlineTimeoutMs = 10_000,
} = {}) {
  const findings = [];
  const declaredPublicFiles = new Set();
  const publishedLessonKeys = new Set();
  const routeOwners = new Map();
  const markdownFiles = [];
  const onlineUrls = new Set();
  const add = (severity, category, code, message, details = {}) => {
    findings.push({ severity, category, code, message, ...details });
  };
  let sectionsIndex;

  try {
    sectionsIndex = JSON.parse(
      await readFile(path.join(contentRoot, "sections.json"), "utf8")
    );
  } catch (error) {
    add(
      "error",
      "manifest",
      "sections-index-invalid",
      "The published sections index is missing or invalid.",
      {
        path: path.join(contentRoot, "sections.json"),
        error: error?.message || String(error),
      }
    );
    return buildResult(findings, { sections: 0, lessons: 0 });
  }

  const totals = {
    sections: 0,
    lessons: 0,
    unpublishedLessons: 0,
    declaredAssets: 0,
    markdownFiles: 0,
    onlineUrls: 0,
  };

  async function checkDeclaredFile({
    filePath,
    publicUrl = null,
    lessonKey,
    field,
  }) {
    if (!filePath) {
      add(
        "error",
        "asset",
        "declared-path-invalid",
        `${lessonKey} has an invalid declared ${field} path.`,
        { lessonKey, field, publicUrl }
      );
      return;
    }
    const normalizedPath = path.resolve(filePath);
    if (normalizedPath.startsWith(path.resolve(publicRoot))) {
      declaredPublicFiles.add(normalizedPath);
    }
    totals.declaredAssets += 1;
    try {
      const fileStat = await stat(normalizedPath);
      if (!fileStat.isFile() || fileStat.size === 0) {
        add(
          "error",
          "asset",
          "declared-file-empty",
          `${lessonKey} declares an empty or non-file ${field}.`,
          {
            lessonKey,
            field,
            path: normalizedPath,
            publicUrl,
            resolvedUrls: resolvedDeploymentUrls(publicUrl),
          }
        );
        return;
      }
      if (IMAGE_EXTENSION_PATTERN.test(normalizedPath)) {
        const bytes = await readFile(normalizedPath);
        if (!isValidImage(normalizedPath, bytes)) {
          add(
            "error",
            "asset",
            "image-invalid",
            `${lessonKey} declares an invalid image.`,
            {
              lessonKey,
              field,
              path: normalizedPath,
              publicUrl,
              resolvedUrls: resolvedDeploymentUrls(publicUrl),
            }
          );
        }
      }
    } catch (error) {
      add(
        "error",
        "asset",
        "declared-file-missing",
        `${lessonKey} declares a missing ${field}.`,
        {
          lessonKey,
          field,
          path: normalizedPath,
          publicUrl,
          resolvedUrls: resolvedDeploymentUrls(publicUrl),
          error: error?.message || String(error),
        }
      );
    }
  }

  for (const sectionEntry of sectionsIndex.sections || []) {
    const sectionManifestPath = path.join(
      contentRoot,
      "sections",
      sectionEntry.slug,
      "section.json"
    );
    let section;
    try {
      section = JSON.parse(await readFile(sectionManifestPath, "utf8"));
      totals.sections += 1;
    } catch (error) {
      add(
        "error",
        "manifest",
        "section-manifest-invalid",
        `Section manifest is missing or invalid: ${sectionEntry.slug}`,
        { path: sectionManifestPath, error: error?.message || String(error) }
      );
      continue;
    }

    for (const lessonEntry of section.lessons || []) {
      const lessonManifestPath = path.join(
        contentRoot,
        "sections",
        sectionEntry.slug,
        "lessons",
        lessonEntry.slug,
        "lesson.json"
      );
      let lesson;
      try {
        lesson = JSON.parse(await readFile(lessonManifestPath, "utf8"));
      } catch (error) {
        add(
          "error",
          "manifest",
          "lesson-manifest-invalid",
          `Lesson manifest is missing or invalid: ${sectionEntry.slug}/${lessonEntry.slug}`,
          { path: lessonManifestPath, error: error?.message || String(error) }
        );
        continue;
      }

      totals.lessons += 1;
      const lessonKey = `${lesson.sectionSlug}:${lesson.slug}`;
      publishedLessonKeys.add(lessonKey);
      if (
        String(lesson.status).toUpperCase() === "NOPUBLISH" ||
        (lesson.publishReasons || []).length > 0
      ) {
        add(
          "error",
          "publication",
          "unpublished-manifest-leak",
          `${lessonKey} is marked NOPUBLISH but appears in published content.`,
          { lessonKey, path: lessonManifestPath }
        );
      }

      const route = canonicalLessonPath(
        lesson,
        section.passage?.start?.bookName
      );
      const existingOwner = routeOwners.get(route);
      if (existingOwner) {
        add(
          "error",
          "route",
          "duplicate-route",
          `Canonical route ${route} is shared by ${existingOwner} and ${lessonKey}.`,
          { route, lessonKey, existingOwner }
        );
      } else {
        routeOwners.set(route, lessonKey);
      }

      for (const [field, content] of [
        ["notes", lesson.notes],
        ["notesSummary", lesson.notesSummary],
        ["summary", lesson.summary],
      ]) {
        if (content?.available && content.path) {
          const filePath = path.resolve(repoRoot, content.path);
          await checkDeclaredFile({ filePath, lessonKey, field });
          if (field !== "notesSummary" || filePath.endsWith(".md")) {
            markdownFiles.push({ filePath, lessonKey, field });
          }
        } else {
          const label = {
            notes: "lesson notes",
            notesSummary: "notes summary",
            summary: "storyline summary",
          }[field];
          add(
            "warning",
            "content-gap",
            `${field}-missing`,
            `${lessonKey} has no ${label}.`,
            { lessonKey, field }
          );
        }
      }

      if (!lesson.youtube?.url) {
        add(
          "warning",
          "content-gap",
          "video-missing",
          `${lessonKey} has no lesson video.`,
          { lessonKey }
        );
      } else {
        onlineUrls.add(lesson.youtube.url);
      }
      if (lesson.passage?.esvUrl) {
        onlineUrls.add(lesson.passage.esvUrl);
      }

      for (const resource of lesson.resources || []) {
        const filePath =
          resource.path && path.resolve(repoRoot, resource.path);
        const urlPath = publicUrlToPath(publicRoot, resource.publicUrl);
        await checkDeclaredFile({
          filePath,
          publicUrl: resource.publicUrl,
          lessonKey,
          field: `resource:${resource.name}`,
        });
        if (urlPath && filePath && path.resolve(urlPath) !== path.resolve(filePath)) {
          add(
            "error",
            "asset",
            "public-url-mismatch",
            `${lessonKey} resource URL does not resolve to its declared file.`,
            {
              lessonKey,
              field: resource.name,
              path: filePath,
              publicUrl: resource.publicUrl,
              expectedPath: urlPath,
              resolvedUrls: resolvedDeploymentUrls(resource.publicUrl),
            }
          );
        }
      }

      if (lesson.map) {
        for (const [field, publicUrl, declaredPath] of [
          ["map-source", lesson.map.sourcePublicUrl, null],
          [
            "map-geojson",
            lesson.map.geoJsonPublicUrl,
            lesson.map.geoJsonPath
              ? path.resolve(repoRoot, lesson.map.geoJsonPath)
              : null,
          ],
        ]) {
          const urlPath = publicUrlToPath(publicRoot, publicUrl);
          await checkDeclaredFile({
            filePath: declaredPath || urlPath,
            publicUrl,
            lessonKey,
            field,
          });
          if (
            field === "map-geojson" &&
            (declaredPath || urlPath) &&
            (await pathExists(declaredPath || urlPath))
          ) {
            try {
              const geoJson = JSON.parse(
                await readFile(declaredPath || urlPath, "utf8")
              );
              if (
                geoJson?.type !== "FeatureCollection" ||
                !Array.isArray(geoJson.features)
              ) {
                throw new Error("Expected a GeoJSON FeatureCollection.");
              }
            } catch (error) {
              add(
                "error",
                "map",
                "geojson-invalid",
                `${lessonKey} has invalid generated GeoJSON.`,
                {
                  lessonKey,
                  path: declaredPath || urlPath,
                  error: error?.message || String(error),
                }
              );
            }
          }
          if (
            declaredPath &&
            urlPath &&
            path.resolve(declaredPath) !== path.resolve(urlPath)
          ) {
            add(
              "error",
              "asset",
              "public-url-mismatch",
              `${lessonKey} ${field} URL does not resolve to its declared file.`,
              {
                lessonKey,
                field,
                path: declaredPath,
                expectedPath: urlPath,
                publicUrl,
                resolvedUrls: resolvedDeploymentUrls(publicUrl),
              }
            );
          }
        }
      } else if (lesson.source?.mapPath) {
        add(
          "error",
          "map",
          "map-conversion-missing",
          `${lessonKey} has a source map but no generated map manifest.`,
          { lessonKey, sourcePath: lesson.source.mapPath }
        );
      }
    }
  }

  const validRoutes = new Set(["/", ...routeOwners.keys()]);
  for (const markdownFile of markdownFiles) {
    let markdown;
    try {
      markdown = await readFile(markdownFile.filePath, "utf8");
      totals.markdownFiles += 1;
    } catch {
      continue;
    }

    for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
      const rawUrl = match[1].replace(/^<|>$/gu, "");
      if (/^https?:\/\//iu.test(rawUrl)) {
        onlineUrls.add(rawUrl);
        continue;
      }
      if (
        !rawUrl ||
        rawUrl.startsWith("#") ||
        /^(?:mailto|tel|data):/iu.test(rawUrl)
      ) {
        continue;
      }
      const pathname = rawUrl.split(/[?#]/u)[0];
      if (pathname.startsWith("/")) {
        const normalizedRoute = pathname.replace(/^\/bible(?=\/|$)/u, "") || "/";
        const assetPath = publicUrlToPath(publicRoot, normalizedRoute);
        if (
          !validRoutes.has(normalizedRoute.replace(/\/+$/u, "") || "/") &&
          (!assetPath || !(await pathExists(assetPath)))
        ) {
          add(
            "error",
            "link",
            "internal-link-broken",
            `${markdownFile.lessonKey} contains a broken internal link.`,
            {
              lessonKey: markdownFile.lessonKey,
              path: markdownFile.filePath,
              url: rawUrl,
            }
          );
        }
      } else {
        const targetPath = path.resolve(path.dirname(markdownFile.filePath), pathname);
        if (!(await pathExists(targetPath))) {
          add(
            "error",
            "link",
            "relative-link-broken",
            `${markdownFile.lessonKey} contains a broken relative link.`,
            {
              lessonKey: markdownFile.lessonKey,
              path: markdownFile.filePath,
              url: rawUrl,
              expectedPath: targetPath,
            }
          );
        }
      }
    }
  }

  for (const generatedRoot of [
    path.join(publicRoot, "resources"),
    path.join(publicRoot, "maps"),
  ]) {
    for (const file of await collectFiles(generatedRoot)) {
      if (
        path.basename(file.absolutePath) !== ".gitkeep" &&
        !declaredPublicFiles.has(path.resolve(file.absolutePath))
      ) {
        add(
          "warning",
          "asset",
          "orphan-public-file",
          "Generated public asset is not declared by a published lesson.",
          { path: file.absolutePath }
        );
      }
    }
  }

  const unpublishedRoot = path.join(contentRoot, "unpublished");
  for (const sectionSlug of await listDirectories(unpublishedRoot)) {
    const lessonsRoot = path.join(unpublishedRoot, sectionSlug, "lessons");
    for (const lessonSlug of await listDirectories(lessonsRoot)) {
      const manifestPath = path.join(lessonsRoot, lessonSlug, "lesson.json");
      try {
        const lesson = JSON.parse(await readFile(manifestPath, "utf8"));
        totals.unpublishedLessons += 1;
        const lessonKey = `${lesson.sectionSlug}:${lesson.slug}`;
        if (publishedLessonKeys.has(lessonKey)) {
          add(
            "error",
            "publication",
            "unpublished-key-leak",
            `${lessonKey} appears in both published and unpublished content.`,
            { lessonKey, path: manifestPath }
          );
        }
        for (const publicDirectory of ["resources", "maps"]) {
          const leakedPath = path.join(
            publicRoot,
            publicDirectory,
            lesson.sectionSlug,
            lesson.slug
          );
          if (await pathExists(leakedPath)) {
            add(
              "error",
              "publication",
              "unpublished-asset-leak",
              `${lessonKey} has public ${publicDirectory}.`,
              { lessonKey, path: leakedPath }
            );
          }
        }
      } catch (error) {
        add(
          "error",
          "publication",
          "unpublished-manifest-invalid",
          "An unpublished lesson manifest is invalid.",
          { path: manifestPath, error: error?.message || String(error) }
        );
      }
    }
  }

  const searchIndexPath = path.join(publicRoot, "search", "notes-index.json.gz");
  if (await pathExists(searchIndexPath)) {
    try {
      const index = JSON.parse(
        gunzipSync(await readFile(searchIndexPath)).toString("utf8")
      );
      const indexedRoutes = new Set((index.d || []).map((document) => document[0]));
      for (const route of indexedRoutes) {
        if (!validRoutes.has(route)) {
          add(
            "error",
            "publication",
            "search-route-leak",
            `Search index contains an unpublished or unknown route: ${route}`,
            { route, path: searchIndexPath }
          );
        }
      }
    } catch (error) {
      add(
        "error",
        "search",
        "search-index-invalid",
        "The gzip search index is invalid.",
        { path: searchIndexPath, error: error?.message || String(error) }
      );
    }
  }

  totals.onlineUrls = onlineUrls.size;
  if (online && onlineUrls.size > 0) {
    const urls = [...onlineUrls].sort();
    const checks = await mapWithConcurrency(
      urls,
      onlineConcurrency,
      async (url) => {
        try {
          return { url, ...(await checkOnlineUrl(url, onlineTimeoutMs)) };
        } catch (error) {
          return { url, ok: false, error: error?.message || String(error) };
        }
      }
    );
    for (const check of checks) {
      if (!check.ok) {
        add(
          "warning",
          "online",
          "external-link-unreachable",
          `External link could not be verified: ${check.url}`,
          check
        );
      }
    }
  }

  return buildResult(findings, totals);
}

function buildResult(findings, totals) {
  const orderedFindings = findings.sort(
    (left, right) =>
      left.severity.localeCompare(right.severity) ||
      left.category.localeCompare(right.category) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message)
  );
  return {
    schemaVersion: 1,
    totals: {
      sections: 0,
      lessons: 0,
      unpublishedLessons: 0,
      declaredAssets: 0,
      markdownFiles: 0,
      onlineUrls: 0,
      ...totals,
      errors: orderedFindings.filter((finding) => finding.severity === "error")
        .length,
      warnings: orderedFindings.filter(
        (finding) => finding.severity === "warning"
      ).length,
    },
    findings: orderedFindings,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--online") {
      options.online = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: yarn courses:audit [--strict] [--json] [--online]

Audits published course manifests, routes, local files, images, maps, internal
links, content gaps, orphan assets, search data, and NOPUBLISH isolation.

  --strict  Fail on content-gap and other warnings as well as errors
  --json    Print the complete machine-readable result
  --online  Also verify YouTube, ESV, and Markdown HTTP links`);
}

function printHumanResult(result) {
  console.log(
    `Course audit: ${result.totals.errors} errors, ${result.totals.warnings} warnings`
  );
  console.log(
    `${result.totals.sections} sections, ${result.totals.lessons} published lessons, ${result.totals.unpublishedLessons} unpublished lessons`
  );
  for (const finding of result.findings) {
    console.log(
      `${finding.severity.toUpperCase()} [${finding.category}/${finding.code}] ${finding.message}`
    );
    if (finding.path) {
      console.log(`  ${finding.path}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await auditCourses({ online: options.online });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
  process.exitCode = getAuditExitCode(result, { strict: options.strict });
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
