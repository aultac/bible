import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadCoursesEnv, resolveAgainstCanonicalBase } from "./config.mjs";
import { buildCanonicalLessonIndex } from "./lesson-paths.mjs";
import {
  getCanonicalNoteBackupReportPath,
  loadCanonicalNoteBackupReport,
  loadLatestSnapshotRoot,
} from "./notes-backups.mjs";
import { classifyLessonPublication } from "./repo-content.mjs";

const execFileAsync = promisify(execFile);
const SUMMARY_FILENAME = "notes-summary.md";
const SUMMARY_METADATA_FILENAME = "notes-summary.meta.json";
const MAX_SUMMARY_LENGTH = 8_000;
const SUMMARY_WRAP_WIDTH = 88;
const SUMMARY_PROMPT_PLACEHOLDER = "{{NOTES}}";
const DEFAULT_SUMMARY_PROMPT_PATH = fileURLToPath(
  new URL("./SUMMARY_PROMPT.md", import.meta.url)
);

export const NOTES_SUMMARY_PROMPT_VERSION = 2;

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

function createProgressLogger(onProgress) {
  return typeof onProgress === "function" ? onProgress : () => {};
}

export function hashNotesSource(content) {
  return createHash("sha256").update(content).digest("hex");
}
export function hashPromptTemplate(promptTemplate) {
  return createHash("sha256").update(promptTemplate).digest("hex");
}

export async function loadSummaryPromptTemplate(
  promptPath = DEFAULT_SUMMARY_PROMPT_PATH
) {
  return readFile(promptPath, "utf8");
}
function validateSummaryPromptTemplate(promptTemplate) {
  if (!promptTemplate.includes(SUMMARY_PROMPT_PLACEHOLDER)) {
    throw new Error(
      `Summary prompt must include the ${SUMMARY_PROMPT_PLACEHOLDER} placeholder.`
    );
  }
}
export function buildNotesSummaryPrompt(notes, promptTemplate) {
  validateSummaryPromptTemplate(promptTemplate);

  return promptTemplate
    .replaceAll(SUMMARY_PROMPT_PLACEHOLDER, notes)
    .trimEnd();
}

function wrapWords(
  text,
  width,
  firstPrefix = "",
  continuationPrefix = firstPrefix
) {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines = [];
  let line = firstPrefix;
  let lineContentLength = 0;

  for (const word of words) {
    const activePrefix =
      lines.length === 0 ? firstPrefix : continuationPrefix;
    const separatorLength = lineContentLength === 0 ? 0 : 1;
    const nextLength =
      activePrefix.length + lineContentLength + separatorLength + word.length;

    if (lineContentLength > 0 && nextLength > width) {
      lines.push(line);
      line = continuationPrefix + word;
      lineContentLength = word.length;
      continue;
    }

    line += lineContentLength === 0 ? word : ` ${word}`;
    lineContentLength += separatorLength + word.length;
  }

  if (lineContentLength > 0 || firstPrefix) {
    lines.push(line);
  }

  return lines;
}

function wrapSummaryLine(line, width) {
  const trimmedEnd = line.trimEnd();
  if (!trimmedEnd.trim()) {
    return [""];
  }

  const listMatch = trimmedEnd.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(.+)$/u);
  if (listMatch) {
    return wrapWords(
      listMatch[2],
      width,
      listMatch[1],
      " ".repeat(listMatch[1].length)
    );
  }

  if (/^\s{4,}/u.test(trimmedEnd) || /^#{1,6}\s/u.test(trimmedEnd)) {
    return [trimmedEnd];
  }

  const leadingWhitespace = trimmedEnd.match(/^\s*/u)[0];
  return wrapWords(
    trimmedEnd.trim(),
    width,
    leadingWhitespace,
    leadingWhitespace
  );
}

export function wrapSummaryMarkdown(markdown, width = SUMMARY_WRAP_WIDTH) {
  return markdown
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .flatMap((line) => wrapSummaryLine(line, width))
    .join("\n")
    .trimEnd();
}

export function normalizeSummaryResponse(response) {
  let summary = response.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "").trim();
  const fencedMatch = summary.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/iu);

  if (fencedMatch) {
    summary = fencedMatch[1].trim();
  }

  if (!summary) {
    throw new Error("Grok returned an empty notes summary.");
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    throw new Error(
      `Grok returned ${summary.length} characters; maximum is ${MAX_SUMMARY_LENGTH}.`
    );
  }
  if (/```/u.test(summary)) {
    throw new Error("Grok returned an unexpected Markdown code fence.");
  }

  return `${wrapSummaryMarkdown(summary)}\n`;
}

export async function preflightGrok({
  grokBin,
  env = process.env,
  homeDirectory = os.homedir(),
  onProgress = null,
}) {
  const progress = createProgressLogger(onProgress);
  progress(`Checking Grok executable: ${grokBin}`);
  let versionText = "";
  try {
    const { stdout, stderr } = await execFileAsync(grokBin, ["--version"], {
      env,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    versionText = String(stdout || stderr || "")
      .trim()
      .split("\n")[0];
  } catch (error) {
    throw new Error(
      `Grok CLI is unavailable at "${grokBin}". Install it or pass --grok-bin.`
    );
  }
  progress(
    versionText
      ? `Grok executable responded: ${versionText}`
      : "Grok executable responded."
  );

  const cachedAuthPath = path.join(homeDirectory, ".grok", "auth.json");
  if (env.XAI_API_KEY) {
    progress("Grok authentication found via XAI_API_KEY.");
    return;
  }
  if (await pathExists(cachedAuthPath)) {
    progress("Grok authentication found via cached `grok login` credentials.");
    return;
  }

  throw new Error(
    "Grok authentication was not found. Run `grok login` or set XAI_API_KEY."
  );
}

export async function runGrokSummary({
  grokBin,
  prompt,
  model,
  timeoutMs,
  cwd,
  env = process.env,
}) {
  const args = [
    "--single",
    prompt,
    "--max-turns",
    "1",
    "--no-plan",
    "--no-subagents",
    "--no-memory",
    "--disable-web-search",
    "--tools",
    "",
    "--permission-mode",
    "dontAsk",
    "--output-format",
    "plain",
    "--verbatim",
    "--cwd",
    cwd,
  ];

  if (model) {
    args.push("--model", model);
  }

  const { stdout } = await execFileAsync(grokBin, args, {
    cwd,
    env,
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

async function readJsonIfExists(targetPath) {
  if (!(await pathExists(targetPath))) {
    return null;
  }
  return JSON.parse(await readFile(targetPath, "utf8"));
}

function buildSummaryUpdate({
  title,
  canonicalLessonDirectoryPath,
  sourceNotesPath,
  sourceNotesHash,
  stagedSummaryPath,
  stagedMetadataPath,
  model,
  promptHash,
}) {
  return {
    title,
    canonicalLessonDirectoryPath,
    sourceNotesPath,
    sourceNotesHash,
    stagedSummaryPath,
    stagedMetadataPath,
    canonicalSummaryPath: path.join(
      canonicalLessonDirectoryPath,
      SUMMARY_FILENAME
    ),
    canonicalMetadataPath: path.join(
      canonicalLessonDirectoryPath,
      SUMMARY_METADATA_FILENAME
    ),
    promptVersion: NOTES_SUMMARY_PROMPT_VERSION,
    promptHash,
    provider: "xAI Grok CLI",
    model: model || "cli-default",
  };
}

function generatedSummaryMetadataMatches({
  metadata,
  sourceNotesHash,
  model,
  promptHash,
}) {
  return (
    metadata?.sourceNotesHash === sourceNotesHash &&
    metadata?.promptVersion === NOTES_SUMMARY_PROMPT_VERSION &&
    metadata?.promptHash === promptHash &&
    metadata?.model === (model || "cli-default")
  );
}

async function collectCandidates({
  report,
  canonicalBase,
  allMissing,
}) {
  const byCanonicalDirectory = new Map();

  for (const update of report.updates || []) {
    byCanonicalDirectory.set(update.canonicalLessonDirectoryPath, {
      title: update.title,
      canonicalLessonDirectoryPath: update.canonicalLessonDirectoryPath,
      canonicalNotesPath: update.canonicalNotesPath,
      sourceNotesPath: update.stagedNotesPath,
      stagedNotesPath: update.stagedNotesPath,
      stageNotes: false,
    });
  }
  if (allMissing) {
    const lessonIndex = await buildCanonicalLessonIndex(canonicalBase);
    for (const [title, canonicalLessonDirectoryPath] of [...lessonIndex].sort(
      ([left], [right]) => left.localeCompare(right)
    )) {
      const canonicalNotesPath = path.join(
        canonicalLessonDirectoryPath,
        "notes.md"
      );
      const canonicalSummaryPath = path.join(
        canonicalLessonDirectoryPath,
        SUMMARY_FILENAME
      );

      if (
        byCanonicalDirectory.has(canonicalLessonDirectoryPath) ||
        !(await pathExists(canonicalNotesPath)) ||
        (await pathExists(canonicalSummaryPath))
      ) {
        continue;
      }

      const relativeLessonDirectory = path.relative(
        canonicalBase,
        canonicalLessonDirectoryPath
      );
      const stagedNotesPath = path.join(
        report.candidatesRoot,
        relativeLessonDirectory,
        "notes.md"
      );
      byCanonicalDirectory.set(canonicalLessonDirectoryPath, {
        title,
        canonicalLessonDirectoryPath,
        canonicalNotesPath,
        sourceNotesPath: canonicalNotesPath,
        stagedNotesPath,
        stageNotes: true,
      });
    }
  }

  return [...byCanonicalDirectory.values()];
}

export async function generateNoteSummaries({
  reportPath,
  canonicalBase,
  allMissing = false,
  force = false,
  dryRun = false,
  model = null,
  timeoutMs = 120_000,
  grokBin = process.env.GROK_BIN || "grok",
  runSummary = runGrokSummary,
  preflight = preflightGrok,
  onProgress = null,
  promptPath = DEFAULT_SUMMARY_PROMPT_PATH,
  promptTemplate = null,
} = {}) {
  const progress = createProgressLogger(onProgress);
  const resolvedPromptPath = path.resolve(promptPath);
  progress(`Loading notes-summary prompt: ${resolvedPromptPath}`);
  const resolvedPromptTemplate =
    promptTemplate || (await loadSummaryPromptTemplate(resolvedPromptPath));
  validateSummaryPromptTemplate(resolvedPromptTemplate);
  const promptHash = hashPromptTemplate(resolvedPromptTemplate);
  progress(`Loading note backup report: ${reportPath}`);
  const report = await loadCanonicalNoteBackupReport(reportPath);
  progress("Collecting notes-summary candidates.");
  const candidates = await collectCandidates({
    report,
    canonicalBase,
    allMissing,
  });
  const existingUpdates = new Map(
    (report.summaryUpdates || []).map((update) => [
      update.canonicalSummaryPath,
      update,
    ])
  );
  const summaryUpdates = [];
  const result = {
    reportPath,
    promptPath: resolvedPromptPath,
    promptHash,
    dryRun,
    totals: {
      considered: candidates.length,
      generated: 0,
      staged: 0,
      skippedManual: 0,
      skippedUnchanged: 0,
      skippedNoPublish: 0,
      failed: 0,
    },
    generated: [],
    skipped: [],
    failures: [],
  };
  const eligible = [];

  for (const candidate of candidates) {
    const notes = await readFile(candidate.sourceNotesPath, "utf8");
    const sourceNotesHash = hashNotesSource(notes);
    const publication = await classifyLessonPublication(
      candidate.canonicalLessonDirectoryPath,
      candidate.sourceNotesPath
    );
    const canonicalSummaryPath = path.join(
      candidate.canonicalLessonDirectoryPath,
      SUMMARY_FILENAME
    );
    const canonicalMetadataPath = path.join(
      candidate.canonicalLessonDirectoryPath,
      SUMMARY_METADATA_FILENAME
    );
    const stagedSummaryPath = path.join(
      path.dirname(candidate.stagedNotesPath),
      SUMMARY_FILENAME
    );
    const stagedMetadataPath = path.join(
      path.dirname(candidate.stagedNotesPath),
      SUMMARY_METADATA_FILENAME
    );

    if (!publication.published) {
      result.totals.skippedNoPublish += 1;
      result.skipped.push({
        title: candidate.title,
        reason: "NOPUBLISH",
        publishReasons: publication.publishReasons,
      });
      continue;
    }

    const canonicalMetadata = await readJsonIfExists(canonicalMetadataPath);
    if (
      !force &&
      (await pathExists(canonicalSummaryPath)) &&
      !canonicalMetadata
    ) {
      result.totals.skippedManual += 1;
      result.skipped.push({
        title: candidate.title,
        reason: "manual-summary",
        canonicalSummaryPath,
      });
      continue;
    }

    if (
      !force &&
      generatedSummaryMetadataMatches({
        metadata: canonicalMetadata,
        sourceNotesHash,
        model,
        promptHash,
      })
    ) {
      result.totals.skippedUnchanged += 1;
      result.skipped.push({
        title: candidate.title,
        reason: "unchanged-canonical",
        canonicalSummaryPath,
      });
      continue;
    }

    const stagedMetadata = await readJsonIfExists(stagedMetadataPath);
    const existingUpdate = existingUpdates.get(canonicalSummaryPath);
    if (
      !force &&
      generatedSummaryMetadataMatches({
        metadata: stagedMetadata,
        sourceNotesHash,
        model,
        promptHash,
      }) &&
      (await pathExists(stagedSummaryPath))
    ) {
      summaryUpdates.push(
        existingUpdate ||
          buildSummaryUpdate({
            title: candidate.title,
            canonicalLessonDirectoryPath:
              candidate.canonicalLessonDirectoryPath,
            sourceNotesPath: candidate.stagedNotesPath,
            sourceNotesHash,
            stagedSummaryPath,
            stagedMetadataPath,
            model,
            promptHash,
          })
      );
      result.totals.staged += 1;
      result.totals.skippedUnchanged += 1;
      result.skipped.push({
        title: candidate.title,
        reason: "unchanged-staged",
        stagedSummaryPath,
      });
      continue;
    }

    eligible.push({
      ...candidate,
      notes,
      sourceNotesHash,
      stagedSummaryPath,
      stagedMetadataPath,
      canonicalSummaryPath,
      canonicalMetadataPath,
    });
  }

  progress(
    `Grok summary candidates: ${candidates.length} considered; ${eligible.length} need Grok call(s); ${result.totals.staged} already staged; ${result.totals.skippedManual} manual protected; ${result.totals.skippedNoPublish} NOPUBLISH skipped; ${result.totals.skippedUnchanged} unchanged.`
  );
  if (eligible.length > 0 && !dryRun) {
    progress(
      `Ready to make ${eligible.length} Grok call(s) with ${Math.round(timeoutMs / 1000)}s timeout each.`
    );
    await preflight({ grokBin, onProgress: progress });
  } else if (eligible.length === 0) {
    progress("No Grok calls are needed.");
  } else if (dryRun) {
    progress(`Dry run: ${eligible.length} Grok call(s) would be made.`);
  }

  for (const [index, candidate] of eligible.entries()) {
    if (dryRun) {
      result.generated.push({
        title: candidate.title,
        action: "would-generate",
        stagedSummaryPath: candidate.stagedSummaryPath,
      });
      continue;
    }

    try {
      progress(
        `Grok summary ${index + 1}/${eligible.length}: ${candidate.title}`
      );
      await mkdir(path.dirname(candidate.stagedNotesPath), { recursive: true });
      if (candidate.stageNotes) {
        await copyFile(candidate.sourceNotesPath, candidate.stagedNotesPath);
      }
      const response = await runSummary({
        grokBin,
        prompt: buildNotesSummaryPrompt(
          candidate.notes,
          resolvedPromptTemplate
        ),
        model,
        timeoutMs,
        cwd: path.dirname(candidate.stagedNotesPath),
      });
      const summary = normalizeSummaryResponse(response);
      const metadata = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceNotesHash: candidate.sourceNotesHash,
        promptVersion: NOTES_SUMMARY_PROMPT_VERSION,
        promptHash,
        provider: "xAI Grok CLI",
        model: model || "cli-default",
      };
      await writeFile(candidate.stagedSummaryPath, summary, "utf8");
      await writeFile(
        candidate.stagedMetadataPath,
        `${JSON.stringify(metadata, null, 2)}\n`,
        "utf8"
      );
      summaryUpdates.push(
        buildSummaryUpdate({
          title: candidate.title,
          canonicalLessonDirectoryPath:
            candidate.canonicalLessonDirectoryPath,
          sourceNotesPath: candidate.stagedNotesPath,
          sourceNotesHash: candidate.sourceNotesHash,
          stagedSummaryPath: candidate.stagedSummaryPath,
          stagedMetadataPath: candidate.stagedMetadataPath,
          model,
          promptHash,
        })
      );
      result.totals.generated += 1;
      result.totals.staged += 1;
      result.generated.push({
        title: candidate.title,
        stagedSummaryPath: candidate.stagedSummaryPath,
      });
      progress(
        `Grok summary ${index + 1}/${eligible.length} complete: ${candidate.title}`
      );
    } catch (error) {
      result.totals.failed += 1;
      result.failures.push({
        title: candidate.title,
        error: error?.message || String(error),
      });
      progress(
        `Grok summary ${index + 1}/${eligible.length} failed: ${candidate.title}: ${error?.message || String(error)}`
      );
    }
  }

  if (!dryRun) {
    report.summaryUpdates = summaryUpdates;
    report.summaryTotals = result.totals;
    report.summaryPromptPath = resolvedPromptPath;
    report.summaryPromptHash = promptHash;
    report.summaryGeneratedAt = new Date().toISOString();
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  progress(
    `Grok summary staging complete: ${result.totals.generated} generated, ${result.totals.staged} staged, ${result.totals.failed} failed.`
  );

  return result;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--report", "--model", "--timeout", "--grok-bin"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      const key = {
        "--report": "reportPath",
        "--model": "model",
        "--timeout": "timeoutSeconds",
        "--grok-bin": "grokBin",
      }[arg];
      options[key] = value;
      index += 1;
      continue;
    }
    if (arg === "--all-missing") {
      options.allMissing = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: yarn courses:notes:summarize [options]

Generates reviewable notes-summary.md candidates with the authenticated Grok CLI.
It never modifies canonical lessons; review candidates, then run the apply command.

Options:
  --report <path>       Note-backup report (default: latest snapshot)
  --all-missing         Also stage summaries for canonical notes lacking one
  --force               Replace manual or previously generated summaries
  --dry-run             Report work without files, authentication, or Grok usage
  --model <id>          Override the Grok CLI default model
  --timeout <seconds>   Per-summary timeout (default: 120)
  --grok-bin <path>     Grok executable (default: GROK_BIN or grok)

Prompt:
  Edit tools/courses/SUMMARY_PROMPT.md to change the Grok prompt. Keep the
  {{NOTES}} placeholder where the lesson notes should be inserted.`);
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));
  if (cliOptions.help) {
    printHelp();
    return;
  }

  const coursesEnv = await loadCoursesEnv();
  const reportPath = cliOptions.reportPath
    ? resolveAgainstCanonicalBase(
        coursesEnv.canonicalBase,
        cliOptions.reportPath
      )
    : getCanonicalNoteBackupReportPath(
        await loadLatestSnapshotRoot(coursesEnv.notesCacheRoot)
      );
  const timeoutSeconds = Number(cliOptions.timeoutSeconds || 120);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("--timeout must be a positive number of seconds.");
  }

  const result = await generateNoteSummaries({
    reportPath,
    canonicalBase: coursesEnv.canonicalBase,
    allMissing: cliOptions.allMissing,
    force: cliOptions.force,
    dryRun: cliOptions.dryRun,
    model: cliOptions.model || null,
    timeoutMs: timeoutSeconds * 1000,
    grokBin: cliOptions.grokBin || process.env.GROK_BIN || "grok",
    onProgress: (message) =>
      process.stderr.write(`[courses:notes:summarize] ${message}\n`),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.totals.failed > 0) {
    process.exitCode = 1;
  }
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
