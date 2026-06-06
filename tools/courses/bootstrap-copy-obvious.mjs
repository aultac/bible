import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { loadCoursesEnv } from "./config.mjs";

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

async function copyFileIfMissing(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (await pathExists(destinationPath)) {
    console.log(`SKIP existing file: ${destinationPath}`);
    return;
  }

  await copyFile(sourcePath, destinationPath);
  console.log(`COPIED file: ${sourcePath} -> ${destinationPath}`);
}

async function copyDirectoryRecursiveIfMissing(sourcePath, destinationPath) {
  const entries = (await readdir(sourcePath, { withFileTypes: true })).filter(
    (entry) => entry.name !== ".DS_Store"
  );

  if (entries.length === 0) {
    console.log(`SKIP empty resource directory: ${sourcePath}`);
    return;
  }

  await mkdir(destinationPath, { recursive: true });

  for (const entry of entries) {

    const sourceEntryPath = path.join(sourcePath, entry.name);
    const destinationEntryPath = path.join(destinationPath, entry.name);

    if (await pathExists(destinationEntryPath)) {
      console.log(`SKIP existing resource: ${destinationEntryPath}`);
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectoryRecursiveIfMissing(sourceEntryPath, destinationEntryPath);
      continue;
    }

    await mkdir(path.dirname(destinationEntryPath), { recursive: true });
    await copyFile(sourceEntryPath, destinationEntryPath);
    console.log(`COPIED resource: ${sourceEntryPath} -> ${destinationEntryPath}`);
  }
}

async function main() {
  const coursesEnv = await loadCoursesEnv();
  const base = coursesEnv.canonicalBase;

  const summaryMappings = [
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/015-Genesis31-32.docx"),
      path.join(base, "02-Section-Genesis12-50/015_Genesis31-33/015_Genesis31-33_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/001_Section1_Genesis1-11_FinalSummary.docx"),
      path.join(base, "01-Section-Genesis1-11/01-Section-Genesis1-11_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/002-Genesis1-2.docx"),
      path.join(base, "01-Section-Genesis1-11/002_Genesis1-2/002_Genesis1-2_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/003-Genesis3-4.docx"),
      path.join(base, "01-Section-Genesis1-11/003_Genesis3-4/003_Genesis3-4_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/004-Genesis5-6.docx"),
      path.join(base, "01-Section-Genesis1-11/004_Genesis5-6/004_Genesis5-6_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/005-Genesis7-8.docx"),
      path.join(base, "01-Section-Genesis1-11/005_Genesis7-8/005_Genesis7-8_summary.docx"),
    ],
    [
      path.join(base, "Summaries/01-Section_Genesis1-11/006-Genesis9-11.docx"),
      path.join(base, "01-Section-Genesis1-11/006_Genesis9-11/006_Genesis9-11_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/007-Genesis12-14.docx"),
      path.join(base, "02-Section-Genesis12-50/007_Genesis12-15/007_Genesis12-15_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/008-Genesis15-16.docx"),
      path.join(base, "02-Section-Genesis12-50/008_Genesis15-16/008_Genesis15-16_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/009-Genesis17-19.docx"),
      path.join(base, "02-Section-Genesis12-50/009_Genesis17-19/009_Genesis17-19_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/010-Genesis20-22.docx"),
      path.join(base, "02-Section-Genesis12-50/010_Genesis20-22/010_Genesis20-22_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/011-Genesis22-25.docx"),
      path.join(base, "02-Section-Genesis12-50/011_Genesis23-25/011_Genesis23-25_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/012-Genesis26-27.docx"),
      path.join(base, "02-Section-Genesis12-50/012_Genesis26-27/012_Genesis26-27_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/013-Genesis27-28.docx"),
      path.join(base, "02-Section-Genesis12-50/013_Genesis27-28/013_Genesis27-28_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/014-Genesis29-30.docx"),
      path.join(base, "02-Section-Genesis12-50/014_Genesis29-30/014_Genesis29-30_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/016-Genesis33-35.docx"),
      path.join(base, "02-Section-Genesis12-50/016_Genesis33-35/016_Genesis33-35_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/017-Genesis36-37_38.docx"),
      path.join(base, "02-Section-Genesis12-50/017_Genesis36-37_29/017_Genesis36-37_29_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/018-Genesis37_38-39.docx"),
      path.join(base, "02-Section-Genesis12-50/018_Genesis37_29-39/018_Genesis37_29-39_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/019-Genesis40-41_45.docx"),
      path.join(base, "02-Section-Genesis12-50/019_Genesis40-43/019_Genesis40-43_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/020-Genesis41_45-43.docx"),
      path.join(base, "02-Section-Genesis12-50/020_Genesis41_46-43/020_Genesis41_46-43_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/021-Genesis44-45_24.docx"),
      path.join(base, "02-Section-Genesis12-50/021_Genesis44-45/021_Genesis44-45_summary.docx"),
    ],
    [
      path.join(base, "Summaries/02_Section_Genesis12-50/022-Genesis45_25-46_30.docx"),
      path.join(base, "02-Section-Genesis12-50/022_Genesis45_25-46_30/022_Genesis45_25-46_30_summary.docx"),
    ],
  ];

  const resourceMappings = [
    [
      path.join(base, "resources/005_Genesis7-8"),
      path.join(base, "01-Section-Genesis1-11/005_Genesis7-8/resources"),
    ],
    [
      path.join(base, "resources/009_Genesis17-19"),
      path.join(base, "02-Section-Genesis12-50/009_Genesis17-19/resources"),
    ],
    [
      path.join(base, "resources/011_Genesis23-25"),
      path.join(base, "02-Section-Genesis12-50/011_Genesis23-25/resources"),
    ],
    [
      path.join(base, "resources/014_Genesis29-31"),
      path.join(base, "02-Section-Genesis12-50/015_Genesis31-33/resources"),
    ],
    [
      path.join(base, "resources/017_Genesis36-38"),
      path.join(base, "02-Section-Genesis12-50/017_Genesis36-37_29/resources"),
    ],
    [
      path.join(base, "resources/018_Genesis37_29-41"),
      path.join(base, "02-Section-Genesis12-50/018_Genesis37_29-39/resources"),
    ],
    [
      path.join(base, "resources/021_Genesis44-45"),
      path.join(base, "02-Section-Genesis12-50/021_Genesis44-45/resources"),
    ],
    [
      path.join(base, "resources/023_Genesis47-49"),
      path.join(base, "02-Section-Genesis12-50/023_Genesis46_31-47_26/resources"),
    ],
  ];

  const accidentalPath = path.join(
    base,
    "02-Section-Genesis12-50/009_Genesis17-19/copy_dir_contents "
  );

  if (await pathExists(accidentalPath)) {
    await rm(accidentalPath, { recursive: true, force: true });
    console.log(`REMOVED accidental directory: ${accidentalPath}`);
  }

  for (const [sourcePath, destinationPath] of summaryMappings) {
    await copyFileIfMissing(sourcePath, destinationPath);
  }

  for (const [sourcePath, destinationPath] of resourceMappings) {
    await copyDirectoryRecursiveIfMissing(sourcePath, destinationPath);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
