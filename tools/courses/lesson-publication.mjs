import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function collectFilesRecursive(rootPath, currentRelativePath = "") {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const relativePath = currentRelativePath
      ? path.join(currentRelativePath, entry.name)
      : entry.name;
    const absolutePath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursive(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ relativePath });
    }
  }

  return files;
}

export async function classifyLessonPublication(
  lessonPath,
  notesSourcePath = null
) {
  const publishReasons = (await collectFilesRecursive(lessonPath))
    .filter((file) => /NOPUBLISH/iu.test(path.basename(file.relativePath)))
    .map((file) => ({
      type: "filename",
      path: file.relativePath,
    }));

  if (
    notesSourcePath &&
    /NOPUBLISH/iu.test(await readFile(notesSourcePath, "utf8"))
  ) {
    publishReasons.push({
      type: "notes-content",
      path: "notes.md",
    });
  }

  return {
    published: publishReasons.length === 0,
    publishReasons,
  };
}
