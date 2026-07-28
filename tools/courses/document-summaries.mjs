import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NodeHtmlMarkdown } from "node-html-markdown";
import {
  isLessonDirectory,
  isSectionDirectory,
  parseLessonDirectoryName,
  parseSectionDirectoryName,
} from "./lesson-paths.mjs";

const execFileAsync = promisify(execFile);
const markdownConverter = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
});

export const DOCUMENT_SUMMARIES_FILENAME = "document-summaries.json";
export const DOCUMENTS_DIRECTORY_NAME = "documents";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
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

function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeDocumentMarkdown(markdown) {
  return (
    markdown
      .replace(/\r\n?/gu, "\n")
      .replace(/\u00a0/gu, " ")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd() + "\n"
  );
}

export async function convertDocxToMarkdown(docxPath) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bible-courses-docx-"));

  try {
    const htmlPath = path.join(tempRoot, "converted.html");
    await execFileAsync("textutil", [
      "-convert",
      "html",
      "-output",
      htmlPath,
      docxPath,
    ]);
    const html = await readFile(htmlPath, "utf8");
    return normalizeDocumentMarkdown(markdownConverter.translate(html));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export function extractVideoSummaryTitle(markdown) {
  for (const rawLine of String(markdown || "").split(/\r?\n/u)) {
    const plainLine = rawLine
      .replace(/^\s*#{1,6}\s*/u, "")
      .replace(/\*\*/gu, "")
      .replace(/__/gu, "")
      .trim();
    const match = plainLine.match(/^Title:\s*(.+)$/iu);
    if (!match) {
      continue;
    }

    const title = match[1]
      .replace(/^["“”']+|["“”']+$/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    return title || null;
  }

  return null;
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

export function lessonSummaryDocumentCandidates(lessonName) {
  const separatorVariants = [
    lessonName,
    lessonName.replace(/^(\d{3})[-_]/u, "$1_"),
    lessonName.replace(/^(\d{3})[-_]/u, "$1-"),
  ];

  return [...new Set(separatorVariants)].map(
    (baseName) => `${baseName}_summary.docx`
  );
}

export async function resolveLessonSummaryDocumentPath(
  lessonPath,
  lessonName
) {
  const candidates = lessonSummaryDocumentCandidates(lessonName).map(
    (fileName) => path.join(lessonPath, fileName)
  );
  const matches = [];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      matches.push(candidate);
    }
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple summary documents match ${lessonName}: ${matches
        .map((match) => path.basename(match))
        .join(", ")}`
    );
  }

  return matches[0] || null;
}

async function convertSummaryRecord({
  cacheRoot,
  canonicalBase,
  sourcePath,
  sourceRelativePath,
  markdownRelativePath,
  kind,
  sectionDirectory,
  lessonDirectory = null,
  convertDocument,
}) {
  if (!sourcePath || !(await pathExists(sourcePath))) {
    return {
      kind,
      sectionDirectory,
      lessonDirectory,
      sourcePath: null,
      sourceHash: null,
      markdownPath: null,
      markdownHash: null,
      videoSummary: null,
      error: null,
    };
  }

  try {
    const sourceBytes = await readFile(sourcePath);
    const markdown = await convertDocument(sourcePath);
    const markdownPath = path.join(cacheRoot, markdownRelativePath);
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, markdown, "utf8");

    return {
      kind,
      sectionDirectory,
      lessonDirectory,
      sourcePath: sourceRelativePath,
      sourceHash: hashBytes(sourceBytes),
      markdownPath: toPosixPath(markdownRelativePath),
      markdownHash: hashBytes(markdown),
      videoSummary:
        kind === "lesson" ? extractVideoSummaryTitle(markdown) : null,
      error: null,
    };
  } catch (error) {
    return {
      kind,
      sectionDirectory,
      lessonDirectory,
      sourcePath: sourceRelativePath,
      sourceHash: null,
      markdownPath: null,
      markdownHash: null,
      videoSummary: null,
      error: error?.message || String(error),
    };
  }
}

async function swapDirectory(nextDirectory, destinationDirectory) {
  const backupDirectory = `${destinationDirectory}.backup-${process.pid}`;
  await rm(backupDirectory, { recursive: true, force: true });

  if (await pathExists(destinationDirectory)) {
    await rename(destinationDirectory, backupDirectory);
  }

  try {
    await rename(nextDirectory, destinationDirectory);
    await rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    await rm(destinationDirectory, { recursive: true, force: true });
    if (await pathExists(backupDirectory)) {
      await rename(backupDirectory, destinationDirectory);
    }
    throw error;
  }
}

export async function prepareDocumentSummaries(
  {
    cacheRoot,
    canonicalBase,
    generatedAt = new Date().toISOString(),
  },
  { convertDocument = convertDocxToMarkdown } = {}
) {
  const nextDocumentsRoot = `${path.join(
    cacheRoot,
    DOCUMENTS_DIRECTORY_NAME
  )}.next-${process.pid}`;
  await rm(nextDocumentsRoot, { recursive: true, force: true });
  await mkdir(nextDocumentsRoot, { recursive: true });

  const records = [];
  const sectionNames = (await listDirectories(canonicalBase)).filter(
    isSectionDirectory
  );

  for (const sectionName of sectionNames) {
    const section = parseSectionDirectoryName(sectionName);
    if (!section) {
      continue;
    }
    const sectionPath = path.join(canonicalBase, sectionName);
    const sectionSourcePath = path.join(
      sectionPath,
      `${sectionName}_summary.docx`
    );
    const sectionMarkdownRelativePath = path.join(
      `${DOCUMENTS_DIRECTORY_NAME}.next-${process.pid}`,
      "sections",
      sectionName,
      "summary.md"
    );
    records.push(
      await convertSummaryRecord({
        cacheRoot,
        canonicalBase,
        sourcePath: sectionSourcePath,
        sourceRelativePath: toPosixPath(
          path.relative(canonicalBase, sectionSourcePath)
        ),
        markdownRelativePath: sectionMarkdownRelativePath,
        kind: "section",
        sectionDirectory: sectionName,
        convertDocument,
      })
    );

    const lessonNames = (await listDirectories(sectionPath)).filter(
      isLessonDirectory
    );
    for (const lessonName of lessonNames) {
      const lesson = parseLessonDirectoryName(lessonName);
      if (!lesson) {
        continue;
      }
      const lessonPath = path.join(sectionPath, lessonName);
      const lessonSourcePath = await resolveLessonSummaryDocumentPath(
        lessonPath,
        lessonName
      );
      const lessonMarkdownRelativePath = path.join(
        `${DOCUMENTS_DIRECTORY_NAME}.next-${process.pid}`,
        "lessons",
        sectionName,
        lessonName,
        "summary.md"
      );
      records.push(
        await convertSummaryRecord({
          cacheRoot,
          canonicalBase,
          sourcePath: lessonSourcePath,
          sourceRelativePath: lessonSourcePath
            ? toPosixPath(path.relative(canonicalBase, lessonSourcePath))
            : null,
          markdownRelativePath: lessonMarkdownRelativePath,
          kind: "lesson",
          sectionDirectory: sectionName,
          lessonDirectory: lessonName,
          convertDocument,
        })
      );
    }
  }

  const documentsRoot = path.join(cacheRoot, DOCUMENTS_DIRECTORY_NAME);
  await swapDirectory(nextDocumentsRoot, documentsRoot);

  for (const record of records) {
    if (record.markdownPath) {
      record.markdownPath = record.markdownPath.replace(
        `${DOCUMENTS_DIRECTORY_NAME}.next-${process.pid}`,
        DOCUMENTS_DIRECTORY_NAME
      );
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt,
    canonicalBase,
    recordCount: records.length,
    records,
  };
  const manifestPath = path.join(cacheRoot, DOCUMENT_SUMMARIES_FILENAME);
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return {
    manifest,
    manifestPath,
    documentsRoot,
  };
}

export async function loadDocumentSummaries(cacheRoot) {
  return JSON.parse(
    await readFile(path.join(cacheRoot, DOCUMENT_SUMMARIES_FILENAME), "utf8")
  );
}

export function buildDocumentSummaryMaps(manifest) {
  return {
    sections: new Map(
      (manifest?.records || [])
        .filter((record) => record.kind === "section")
        .map((record) => [record.sectionDirectory, record])
    ),
    lessons: new Map(
      (manifest?.records || [])
        .filter((record) => record.kind === "lesson")
        .map((record) => [
          `${record.sectionDirectory}/${record.lessonDirectory}`,
          record,
        ])
    ),
  };
}
