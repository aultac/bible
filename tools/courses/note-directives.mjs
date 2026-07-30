import {
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";

export const TOOL_LINK_MARKER = "TOOL_LINK:";
export const RESOURCE_LINK_MARKER = "RESOURCE_LINK:";

function finding(code, message, lineNumber, source) {
  return {
    code,
    message,
    lineNumber,
    source,
  };
}

function stripMarkdownWrapperStart(value) {
  return value.replace(/^\s*(?:[*_]{1,3})?\s*/u, "");
}

function stripMarkdownWrapperEnd(value) {
  return value
    .trim()
    .replace(/(?:[*_]{1,3})$/u, "")
    .replace(/^<|>$/gu, "")
    .trim();
}

export function normalizeToolPath(value) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s?#]/u.test(value)
  ) {
    throw new Error("Tool links must be root-relative URL paths.");
  }

  let decodedPath;
  try {
    decodedPath = decodeURI(value);
  } catch {
    throw new Error("Tool link contains invalid URL encoding.");
  }
  if (/[\\\s?#]/u.test(decodedPath)) {
    throw new Error("Tool links must be root-relative URL paths.");
  }

  const segments = decodedPath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Tool links cannot contain dot path segments.");
  }

  const normalized = `/${segments.filter(Boolean).join("/")}`;
  if (normalized === "/") {
    throw new Error("Tool links must identify a tool path.");
  }

  return path.posix.extname(normalized) ? normalized : `${normalized}/`;
}

function parseHttpUrl(value) {
  const cleaned = stripMarkdownWrapperEnd(value);
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("Resource source must be an absolute HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Resource source must be an absolute HTTP(S) URL.");
  }
  return parsed.href;
}

export function isNoteDirectiveLine(line) {
  return (
    line.includes(TOOL_LINK_MARKER) ||
    line.includes(RESOURCE_LINK_MARKER)
  );
}

export function parseNoteDirectives(markdown, { source = "notes.md" } = {}) {
  const toolLinks = [];
  const resourceLinks = [];
  const findings = [];
  const toolOwners = new Map();
  const resourceOwners = new Map();
  const lines = String(markdown).replace(/\r\n?/gu, "\n").split("\n");

  for (const [lineIndex, line] of lines.entries()) {
    const lineNumber = lineIndex + 1;
    const hasToolMarker = line.includes(TOOL_LINK_MARKER);
    const hasResourceMarker = line.includes(RESOURCE_LINK_MARKER);
    const mentionsToolMarker = line.includes("TOOL_LINK");
    const mentionsResourceMarker = line.includes("RESOURCE_LINK");

    if (
      (mentionsToolMarker && !hasToolMarker) ||
      (mentionsResourceMarker && !hasResourceMarker)
    ) {
      findings.push(
        finding(
          "directive-marker-malformed",
          "Directive markers must include their trailing colon.",
          lineNumber,
          source
        )
      );
      continue;
    }

    if (hasToolMarker && hasResourceMarker) {
      findings.push(
        finding(
          "directive-line-ambiguous",
          "Use only one directive type per line.",
          lineNumber,
          source
        )
      );
      continue;
    }

    if (hasToolMarker) {
      const markerIndex = line.indexOf(TOOL_LINK_MARKER);
      const remainder = stripMarkdownWrapperStart(
        line.slice(markerIndex + TOOL_LINK_MARKER.length)
      );
      const token = stripMarkdownWrapperEnd(remainder.match(/^\S+/u)?.[0] || "");

      if (!token) {
        findings.push(
          finding(
            "tool-link-missing",
            "TOOL_LINK requires a served tool path.",
            lineNumber,
            source
          )
        );
        continue;
      }

      let toolPath;
      try {
        toolPath = normalizeToolPath(token);
      } catch (error) {
        findings.push(
          finding(
            "tool-link-invalid",
            error.message,
            lineNumber,
            source
          )
        );
        continue;
      }

      if (toolOwners.has(toolPath)) {
        findings.push(
          finding(
            "tool-link-duplicate",
            `Tool path ${toolPath} is declared more than once in this lesson.`,
            lineNumber,
            source
          )
        );
        continue;
      }

      toolOwners.set(toolPath, lineNumber);
      toolLinks.push({
        path: toolPath,
        lineNumber,
        rawLine: line,
      });
      continue;
    }

    if (hasResourceMarker) {
      const markerIndex = line.indexOf(RESOURCE_LINK_MARKER);
      const remainder = stripMarkdownWrapperStart(
        line.slice(markerIndex + RESOURCE_LINK_MARKER.length)
      );
      const separatorIndex = remainder.indexOf(":");
      if (separatorIndex === -1) {
        findings.push(
          finding(
            "resource-link-malformed",
            "RESOURCE_LINK requires a filename followed by a source URL.",
            lineNumber,
            source
          )
        );
        continue;
      }

      const fileName = stripMarkdownWrapperEnd(
        remainder.slice(0, separatorIndex)
      );
      const rawUrl = remainder.slice(separatorIndex + 1);
      if (!fileName || !rawUrl.trim()) {
        findings.push(
          finding(
            "resource-link-malformed",
            "RESOURCE_LINK requires a filename followed by a source URL.",
            lineNumber,
            source
          )
        );
        continue;
      }

      let sourceUrl;
      try {
        sourceUrl = parseHttpUrl(rawUrl);
      } catch (error) {
        findings.push(
          finding(
            "resource-link-url-invalid",
            error.message,
            lineNumber,
            source
          )
        );
        continue;
      }

      if (resourceOwners.has(fileName)) {
        const existing = resourceOwners.get(fileName);
        findings.push(
          finding(
            existing.sourceUrl === sourceUrl
              ? "resource-link-duplicate"
              : "resource-link-conflict",
            `${fileName} has more than one RESOURCE_LINK declaration.`,
            lineNumber,
            source
          )
        );
        continue;
      }

      const record = {
        fileName,
        sourceUrl,
        lineNumber,
        rawLine: line,
      };
      resourceOwners.set(fileName, record);
      resourceLinks.push(record);
    }
  }

  return {
    toolLinks,
    resourceLinks,
    findings,
  };
}

export function matchResourceSourceUrls(
  resourceFiles,
  resourceLinks,
  { source = "notes.md" } = {}
) {
  const filesByName = new Map();
  const findings = [];
  const sourceUrlByFileName = new Map();

  for (const resourceFile of resourceFiles) {
    const matches = filesByName.get(resourceFile.fileName) || [];
    matches.push(resourceFile);
    filesByName.set(resourceFile.fileName, matches);
  }

  for (const resourceLink of resourceLinks) {
    const matches = filesByName.get(resourceLink.fileName) || [];
    if (matches.length === 0) {
      findings.push(
        finding(
          "resource-link-file-missing",
          `RESOURCE_LINK filename ${resourceLink.fileName} does not match a lesson resource.`,
          resourceLink.lineNumber,
          source
        )
      );
      continue;
    }
    if (matches.length > 1) {
      findings.push(
        finding(
          "resource-link-file-ambiguous",
          `RESOURCE_LINK filename ${resourceLink.fileName} matches multiple lesson resources.`,
          resourceLink.lineNumber,
          source
        )
      );
      continue;
    }
    sourceUrlByFileName.set(resourceLink.fileName, resourceLink.sourceUrl);
  }

  return {
    sourceUrlByFileName,
    findings,
  };
}

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

async function collectHtmlFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return [];
  }
  const files = [];
  for (const entry of (await readdir(rootPath, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name)
  )) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x([0-9a-f]+);/giu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16))
    )
    .replace(/&#([0-9]+);/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 10))
    )
    .replace(
      /&(amp|apos|gt|lt|nbsp|quot);/gu,
      (_match, entity) =>
        ({
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          nbsp: " ",
          quot: "\"",
        })[entity]
    )
    .replace(/\s+/gu, " ")
    .trim();
}

function getHtmlAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\b${name}\\s*=\\s*([\"'])(.*?)\\1`, "iu")
  )?.[2] || null;
}

export function extractToolTitleFromHtml(html) {
  for (const metaTag of html.match(/<meta\b[^>]*>/giu) || []) {
    if (
      getHtmlAttribute(metaTag, "name")?.toLowerCase() ===
      "application-name"
    ) {
      const content = getHtmlAttribute(metaTag, "content");
      if (content) {
        return decodeHtml(content);
      }
    }
  }

  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
  if (heading) {
    return decodeHtml(heading);
  }

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
  if (title) {
    return decodeHtml(title).replace(/\s+-\s+v\d+(?:\.\d+)*$/iu, "");
  }

  return null;
}

async function resolveToolHtml(toolPath, repoRoot) {
  const routeName = toolPath.replace(/^\/+|\/+$/gu, "");
  const staticIndexPath = path.join(repoRoot, "static", routeName, "index.html");
  if (await pathExists(staticIndexPath)) {
    return {
      html: await readFile(staticIndexPath, "utf8"),
      sourcePath: staticIndexPath,
    };
  }

  const appSourceRoot = path.join(repoRoot, "apps", routeName, "src");
  const appHtmlFiles = await collectHtmlFiles(appSourceRoot);
  if (appHtmlFiles.length > 0) {
    const html = (
      await Promise.all(appHtmlFiles.map((filePath) => readFile(filePath, "utf8")))
    ).join("\n");
    return {
      html,
      sourcePath: appSourceRoot,
    };
  }

  const builtIndexPath = path.join(repoRoot, "dist", routeName, "index.html");
  if (await pathExists(builtIndexPath)) {
    return {
      html: await readFile(builtIndexPath, "utf8"),
      sourcePath: builtIndexPath,
    };
  }

  return null;
}

export async function resolveToolTitle(
  toolPath,
  { repoRoot = REPO_ROOT } = {}
) {
  const normalizedPath = normalizeToolPath(toolPath);
  const source = await resolveToolHtml(normalizedPath, repoRoot);
  if (!source) {
    throw new Error(
      `Tool path ${normalizedPath} has no authored or generated index document.`
    );
  }
  const title = extractToolTitleFromHtml(source.html);
  if (!title) {
    throw new Error(
      `Tool path ${normalizedPath} has no application-name, h1, or title.`
    );
  }
  return {
    path: normalizedPath,
    title,
    sourcePath: source.sourcePath,
  };
}

export async function buildToolsData(
  lessons,
  { repoRoot = REPO_ROOT } = {}
) {
  const lessonIdsByToolPath = new Map();

  for (const lesson of [...lessons].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    if (!lesson.published) {
      continue;
    }
    for (const toolLink of lesson.directives.toolLinks) {
      const lessonIds = lessonIdsByToolPath.get(toolLink.path) || new Set();
      lessonIds.add(lesson.id);
      lessonIdsByToolPath.set(toolLink.path, lessonIds);
    }
  }

  const tools = [];
  for (const toolPath of [...lessonIdsByToolPath.keys()].sort()) {
    const resolved = await resolveToolTitle(toolPath, { repoRoot });
    tools.push({
      path: resolved.path,
      title: resolved.title,
      relatedLessonIds: [...lessonIdsByToolPath.get(toolPath)].sort(),
    });
  }
  return tools;
}

export function serializeToolsData(tools) {
  return [
    "// This file is generated from TOOL_LINK directives in published lesson notes.",
    "// Do not edit it by hand.",
    "",
    `export const toolsData = ${JSON.stringify(tools, null, 2)} as const;`,
    "",
  ].join("\n");
}

export async function writeToolsData(
  tools,
  outputPath,
  { write = writeFile } = {}
) {
  await write(outputPath, serializeToolsData(tools), "utf8");
  return outputPath;
}

async function collectResourceFiles(resourcesRoot) {
  if (!(await pathExists(resourcesRoot))) {
    return [];
  }
  const files = [];
  for (const entry of await readdir(resourcesRoot, { withFileTypes: true })) {
    const absolutePath = path.join(resourcesRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectResourceFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        fileName: entry.name,
      });
    }
  }
  return files;
}

export async function validateNoteDirectiveCandidate({
  markdown,
  lessonDirectory,
  repoRoot = REPO_ROOT,
  source = "notes.md",
}) {
  const directives = parseNoteDirectives(markdown, { source });
  const resources = await collectResourceFiles(
    path.join(lessonDirectory, "resources")
  );
  const matchedResources = matchResourceSourceUrls(
    resources,
    directives.resourceLinks,
    { source }
  );
  const findings = [...directives.findings, ...matchedResources.findings];

  for (const toolLink of directives.toolLinks) {
    try {
      await resolveToolTitle(toolLink.path, { repoRoot });
    } catch (error) {
      findings.push(
        finding(
          "tool-link-unresolved",
          error.message,
          toolLink.lineNumber,
          source
        )
      );
    }
  }

  return {
    directives,
    resourceSourceUrlByName: matchedResources.sourceUrlByFileName,
    findings,
  };
}
