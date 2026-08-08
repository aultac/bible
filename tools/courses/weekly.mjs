import {
  checkbox,
  confirm,
  input,
  select,
} from "@inquirer/prompts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCoursesEnv } from "./config.mjs";
import { exportLessonTitles } from "./lesson-title-export.mjs";
import { buildCanonicalPublishedLessonCatalog } from "./lesson-paths.mjs";
import {
  CACHED_PLAYLIST_FILENAME,
  formatCacheChoice,
  listWeeklyCaches,
  loadCacheState,
  recordCacheComponent,
  resolveWeeklyCache,
  writeJsonAtomic,
} from "./weekly-cache.mjs";
import {
  auditWeeklyCache,
  formatCacheAudit,
} from "./weekly-cache-audit.mjs";
import {
  deleteWeeklyCache,
  formatCacheReconciliation,
  reconcileWeeklyCache,
} from "./weekly-cache-delete.mjs";
import {
  releaseWeeklyUpdate,
  retryWeeklyRelease,
  runWeeklyValidation,
  startDevelopmentServer,
} from "./weekly-release.mjs";
import {
  formatWeeklyRefreshResult,
  runWeeklyRefresh,
} from "./weekly-refresh.mjs";
import {
  addYoutubeSpecialMatch,
  formatYoutubeMatchReview,
  loadYoutubeSpecialMatches,
  removeYoutubeSpecialMatch,
  resolvePlaylistVideoMatches,
  saveYoutubeSpecialMatches,
} from "./youtube-special-matches.mjs";

const EXECUTION_MODES = new Map([
  ["--prepare", "prepare"],
  ["--manage-youtube-matches", "manage-youtube"],
  ["--audit", "audit"],
  ["--apply", "apply"],
  ["--delete-cache", "delete"],
  ["--build-test", "validate"],
  ["--validate", "validate"],
  ["--dev", "dev"],
  ["--export-titles", "export-titles"],
  ["--release", "release"],
  ["--retry-push", "retry-push"],
  ["--retry-deploy", "retry-deploy"],
  ["--status", "status"],
]);

function setMode(options, mode) {
  if (options.mode && options.mode !== "interactive" && options.mode !== mode) {
    throw new Error("Choose only one weekly execution mode.");
  }
  options.mode = mode;
}

export function parseWeeklyArgs(argv) {
  const options = { mode: "interactive" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (EXECUTION_MODES.has(arg)) {
      setMode(options, EXECUTION_MODES.get(arg));
    } else if (
      ["--cache", "--components", "--commit-message"].includes(arg)
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.`);
      }
      if (arg === "--cache") {
        options.cacheRoot = value;
      } else if (arg === "--components") {
        options.components = value.split(",").map((item) => item.trim());
      } else {
        options.commitMessage = value;
      }
      index += 1;
    } else if (arg === "--full-notes-export") {
      options.fullNotesExport = true;
    } else if (arg === "--online-audit") {
      options.onlineAudit = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function writeLine(output, text = "") {
  output.write(`${text}\n`);
}

function progressLogger(errorOutput, enabled) {
  return enabled
    ? (message) => errorOutput.write(`[weekly] ${message}\n`)
    : null;
}

function promptContext(dependencies) {
  return {
    input: dependencies.input,
    output: dependencies.output,
    clearPromptOnDone: false,
  };
}

async function chooseCache(
  coursesEnv,
  dependencies,
  {
    states = null,
    message = "Choose a weekly cache",
    includeInvalid = false,
  } = {}
) {
  const caches = (await dependencies.listWeeklyCaches(
    coursesEnv.notesCacheRoot
  )).filter(
    (cache) =>
      (includeInvalid || cache.selectable) &&
      (!states || states.includes(cache.state.status))
  );
  if (caches.length === 0) {
    throw new Error("No matching weekly caches are available.");
  }
  return dependencies.selectPrompt(
    {
      message,
      loop: false,
      choices: caches.map((cache) => {
        const choice = formatCacheChoice(cache);
        return includeInvalid ? { ...choice, disabled: false } : choice;
      }),
    },
    promptContext(dependencies)
  );
}

async function resolveSelectedCache(
  selectedCacheRoot,
  coursesEnv,
  dependencies,
  options = {}
) {
  if (selectedCacheRoot) {
    const cacheRoot = await dependencies.resolveWeeklyCache(
      coursesEnv.notesCacheRoot,
      selectedCacheRoot
    );
    if (options.states) {
      const state = await dependencies.loadCacheState(cacheRoot);
      if (!options.states.includes(state.status)) {
        throw new Error(
          `Cache ${path.basename(cacheRoot)} is ${state.status}; expected ${options.states.join(
            " or "
          )}.`
        );
      }
    }
    return cacheRoot;
  }
  return chooseCache(coursesEnv, dependencies, options);
}

async function runPrepare(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot = null
) {
  let cacheRoot = selectedCacheRoot;
  let components = options.components;

  if (!options.direct) {
    const prepareMode = await dependencies.selectPrompt(
      {
        message: "Prepare cache from source documents",
        default: "create",
        loop: false,
        choices: [
          {
            name: "Create a new cache",
            value: "create",
            description: "Full refresh from Word, Apple Notes, YouTube, and assets",
          },
          {
            name: "Refresh an existing unapplied cache",
            value: "refresh",
            description: "Update all or selected source components in place",
          },
        ],
      },
      promptContext(dependencies)
    );
    if (prepareMode === "create") {
      cacheRoot = null;
      components = null;
    } else {
      cacheRoot = await chooseCache(coursesEnv, dependencies, {
        states: ["draft", "ready", "legacy"],
        message: "Cache to refresh",
      });
      const refreshMode = await dependencies.selectPrompt(
        {
          message: "Refresh scope",
          default: "all",
          loop: false,
          choices: [
            {
              name: "Refresh everything",
              value: "all",
              description: "Recommended complete cache update",
            },
            {
              name: "Choose specific updates",
              value: "specific",
              description: "Rerun only the source components that need repair",
            },
          ],
        },
        promptContext(dependencies)
      );
      if (refreshMode === "specific") {
        components = await dependencies.checkboxPrompt(
          {
            message: "Source updates to run",
            required: true,
            choices: [
              {
                name: "Parse Word summaries and video titles",
                value: "documents",
                checked: true,
              },
              {
                name: "Grab notes from Apple Notes",
                value: "notes",
              },
              {
                name: "Refresh YouTube links",
                value: "youtube",
              },
              {
                name: "Scan lesson folders, assets, and publication markers",
                value: "inventory",
              },
            ],
          },
          promptContext(dependencies)
        );
      } else {
        components = null;
      }
    }
  }

  const result = await dependencies.runWeeklyRefresh(
    {
      coursesEnv,
      cacheRoot,
      components,
      fullNotesExport: Boolean(options.fullNotesExport),
      onProgress: progressLogger(dependencies.errorOutput, !options.json),
    },
    dependencies.weeklyRefreshDependencies || {}
  );
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : dependencies.formatWeeklyRefreshResult(result)
  );
  return result;
}

async function loadYoutubeMatchContext(
  cacheRoot,
  coursesEnv,
  dependencies
) {
  const playlistPath = path.join(cacheRoot, CACHED_PLAYLIST_FILENAME);
  let playlistSnapshot;
  try {
    playlistSnapshot = JSON.parse(await readFile(playlistPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "The selected cache has no YouTube snapshot. Refresh its YouTube component first."
      );
    }
    throw error;
  }
  const [lessons, specialMatches] = await Promise.all([
    dependencies.buildCanonicalPublishedLessonCatalog(
      coursesEnv.canonicalBase
    ),
    dependencies.loadYoutubeSpecialMatches(
      coursesEnv.youtubeSpecialMatchesPath
    ),
  ]);
  return {
    cacheRoot,
    playlistPath,
    lessons,
    specialMatches,
    playlistSnapshot: dependencies.resolvePlaylistVideoMatches(
      playlistSnapshot,
      { lessons, specialMatches }
    ),
  };
}

async function persistYoutubeMatchContext(
  context,
  coursesEnv,
  dependencies
) {
  const specialMatches = await dependencies.saveYoutubeSpecialMatches(
    context.specialMatches,
    coursesEnv.youtubeSpecialMatchesPath
  );
  const playlistSnapshot = dependencies.resolvePlaylistVideoMatches(
    context.playlistSnapshot,
    {
      lessons: context.lessons,
      specialMatches,
    }
  );
  await writeJsonAtomic(context.playlistPath, playlistSnapshot);
  const state = await dependencies.loadCacheState(context.cacheRoot);
  await dependencies.recordCacheComponent({
    cacheRoot: context.cacheRoot,
    state,
    componentName: "youtube",
    outputPath: context.playlistPath,
    summary: {
      videos: playlistSnapshot.videoCount,
      automaticMatches: playlistSnapshot.matching.automaticMatchCount,
      specialMatches: playlistSnapshot.matching.specialMatchCount,
      unmatched: playlistSnapshot.matching.unmatchedCount,
    },
  });
  const audited = await dependencies.auditWeeklyCache({
    cacheRoot: context.cacheRoot,
    canonicalBase: coursesEnv.canonicalBase,
    youtubeSpecialMatchesPath: coursesEnv.youtubeSpecialMatchesPath,
  });
  return {
    ...context,
    specialMatches,
    playlistSnapshot,
    audit: audited.audit,
  };
}

export async function runYoutubeMatchManager(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot = null
) {
  const cacheRoot = await resolveSelectedCache(
    selectedCacheRoot,
    coursesEnv,
    dependencies,
    {
      states: ["draft", "ready"],
      message: "Cache whose YouTube matches should be managed",
    }
  );
  let context = await loadYoutubeMatchContext(
    cacheRoot,
    coursesEnv,
    dependencies
  );

  while (true) {
    const action = await dependencies.selectPrompt(
      {
        message: "YouTube special matches",
        loop: false,
        choices: [
          { name: "Review current matches", value: "review" },
          { name: "Add a special match", value: "add" },
          { name: "Remove a special match", value: "remove" },
          { name: "Back", value: "back" },
        ],
      },
      promptContext(dependencies)
    );

    if (action === "back") {
      return {
        status: "managed",
        cacheRoot,
        playlistSnapshot: context.playlistSnapshot,
        specialMatches: context.specialMatches,
      };
    }
    if (action === "review") {
      writeLine(
        dependencies.output,
        dependencies.formatYoutubeMatchReview(context.playlistSnapshot)
      );
      continue;
    }

    if (action === "add") {
      const unmatchedVideos = context.playlistSnapshot.videos.filter(
        (video) => !Number.isInteger(video.lessonSequenceNumber)
      );
      const ownedLessonSequences = new Set(
        context.playlistSnapshot.videos
          .map((video) => video.lessonSequenceNumber)
          .filter((sequenceNumber) => Number.isInteger(sequenceNumber))
      );
      const availableLessons = context.lessons.filter(
        (lesson) => !ownedLessonSequences.has(lesson.sequenceNumber)
      );
      if (unmatchedVideos.length === 0 || availableLessons.length === 0) {
        writeLine(
          dependencies.output,
          unmatchedVideos.length === 0
            ? "There are no unmatched playlist videos."
            : "There are no unmatched published lessons."
        );
        continue;
      }

      const videoId = await dependencies.selectPrompt(
        {
          message: "Unmatched playlist video",
          loop: false,
          choices: unmatchedVideos.map((video) => ({
            name: video.title,
            value: video.videoId,
            description: video.videoId,
          })),
        },
        promptContext(dependencies)
      );
      const lessonSequenceNumber = await dependencies.selectPrompt(
        {
          message: "Local lesson without a video",
          loop: false,
          choices: availableLessons.map((lesson) => ({
            name: `${lesson.sequenceNumber}. ${
              lesson.displayTitle || lesson.title
            }`,
            value: lesson.sequenceNumber,
            description: lesson.relativeLessonDirectory,
          })),
        },
        promptContext(dependencies)
      );
      const video = unmatchedVideos.find((item) => item.videoId === videoId);
      const lesson = availableLessons.find(
        (item) => item.sequenceNumber === lessonSequenceNumber
      );
      const approved = await dependencies.confirmPrompt(
        {
          message: `Match "${video.title}" to lesson ${lesson.sequenceNumber} "${lesson.displayTitle || lesson.title}"?`,
          default: false,
        },
        promptContext(dependencies)
      );
      if (!approved) {
        writeLine(dependencies.output, "Special match not added.");
        continue;
      }

      context.specialMatches = dependencies.addYoutubeSpecialMatch(
        context.specialMatches,
        video,
        lesson
      );
      context = await persistYoutubeMatchContext(
        context,
        coursesEnv,
        dependencies
      );
      writeLine(
        dependencies.output,
        dependencies.formatYoutubeMatchReview(context.playlistSnapshot)
      );
      writeLine(dependencies.output, dependencies.formatCacheAudit(context.audit));
      continue;
    }

    const statusByVideoId = new Map(
      (context.playlistSnapshot.matching?.specialMatches || []).map(
        (match) => [match.videoId, match]
      )
    );
    if (context.specialMatches.matches.length === 0) {
      writeLine(dependencies.output, "There are no special matches to remove.");
      continue;
    }
    const videoId = await dependencies.selectPrompt(
      {
        message: "Special match to remove",
        loop: false,
        choices: context.specialMatches.matches.map((match) => {
          const status = statusByVideoId.get(match.videoId);
          return {
            name: `${status?.status || "unknown"}: ${
              status?.currentVideoTitle || match.videoTitle || match.videoId
            } → ${match.lessonSequenceNumber} ${
              status?.currentLessonTitle || match.lessonTitle
            }`,
            value: match.videoId,
          };
        }),
      },
      promptContext(dependencies)
    );
    const approved = await dependencies.confirmPrompt(
      {
        message: `Remove the special match for video ${videoId}?`,
        default: false,
      },
      promptContext(dependencies)
    );
    if (!approved) {
      writeLine(dependencies.output, "Special match not removed.");
      continue;
    }

    context.specialMatches = dependencies.removeYoutubeSpecialMatch(
      context.specialMatches,
      videoId
    );
    context = await persistYoutubeMatchContext(
      context,
      coursesEnv,
      dependencies
    );
    writeLine(
      dependencies.output,
      dependencies.formatYoutubeMatchReview(context.playlistSnapshot)
    );
    writeLine(dependencies.output, dependencies.formatCacheAudit(context.audit));
  }
}

async function runAudit(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot
) {
  const cacheRoot = await resolveSelectedCache(
    selectedCacheRoot,
    coursesEnv,
    dependencies
  );
  const result = await dependencies.auditWeeklyCache({
    cacheRoot,
    canonicalBase: coursesEnv.canonicalBase,
    youtubeSpecialMatchesPath: coursesEnv.youtubeSpecialMatchesPath,
  });
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : dependencies.formatCacheAudit(result.audit)
  );
  return { ...result, cacheRoot };
}

async function runApply(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot
) {
  const cacheRoot = await resolveSelectedCache(
    selectedCacheRoot,
    coursesEnv,
    dependencies,
    { states: ["ready", "applied"] }
  );
  if (!options.yes && !options.direct) {
    const approved = await dependencies.confirmPrompt(
      {
        message: `Apply cache ${path.basename(cacheRoot)}?`,
        default: false,
      },
      promptContext(dependencies)
    );
    if (!approved) {
      writeLine(dependencies.output, "Apply skipped.");
      return { status: "cancelled", cacheRoot };
    }
  }
  const result = await dependencies.runWeeklyRefresh(
    {
      coursesEnv,
      cacheRoot,
      apply: true,
      onlineAudit: Boolean(options.onlineAudit),
      onProgress: progressLogger(dependencies.errorOutput, !options.json),
    },
    dependencies.weeklyRefreshDependencies || {}
  );
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : dependencies.formatWeeklyRefreshResult(result)
  );
  return result;
}

async function runDelete(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot
) {
  const cacheRoot = await resolveSelectedCache(
    options.direct ? selectedCacheRoot : null,
    coursesEnv,
    dependencies,
    {
      includeInvalid: true,
      message: "Cache to delete",
    }
  );
  const reconciliation = await dependencies.reconcileWeeklyCache({
    cacheRoot,
  });
  writeLine(
    dependencies.output,
    dependencies.formatCacheReconciliation(reconciliation)
  );
  if (!options.yes) {
    const approved = await dependencies.confirmPrompt(
      {
        message: reconciliation.safeToDelete
          ? `Permanently delete cache ${path.basename(cacheRoot)}?`
          : `Warning: cached data may be unapplied or changed. Permanently delete ${path.basename(cacheRoot)} anyway?`,
        default: false,
      },
      promptContext(dependencies)
    );
    if (!approved) {
      writeLine(dependencies.output, "Cache deletion skipped.");
      return { status: "cancelled", cacheRoot, reconciliation };
    }
  }
  const result = await dependencies.deleteWeeklyCache({
    cacheRoot,
    notesCacheRoot: coursesEnv.notesCacheRoot,
    allowUnsafe: !reconciliation.safeToDelete,
  });
  writeLine(dependencies.output, `Deleted cache ${result.cacheId}.`);
  return { status: "deleted", cacheRoot, ...result };
}

async function runValidate(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot
) {
  const cacheRoot = await resolveSelectedCache(
    selectedCacheRoot,
    coursesEnv,
    dependencies,
    { states: ["applied"] }
  );
  const result = await dependencies.runWeeklyValidation(
    {
      cacheRoot,
      onProgress: progressLogger(dependencies.errorOutput, !options.json),
    },
    dependencies.validationDependencies || {}
  );
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : `Validation passed for cache ${path.basename(cacheRoot)}.`
  );
  return { ...result, cacheRoot };
}

async function runDev(options, dependencies) {
  await dependencies.startDevelopmentServer(
    {
      onProgress: progressLogger(dependencies.errorOutput, !options.json),
    },
    dependencies.validationDependencies || {}
  );
  return { status: "stopped" };
}

async function runExportTitles(options, dependencies) {
  const result = await dependencies.exportLessonTitles();
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : `Exported ${result.lessonCount} lessons to ${result.outputPath}.`
  );
  return result;
}

async function runRelease(
  options,
  coursesEnv,
  dependencies,
  selectedCacheRoot,
  stage = "release"
) {
  const cacheRoot = await resolveSelectedCache(
    selectedCacheRoot,
    coursesEnv,
    dependencies,
    { states: ["applied"] }
  );
  if (stage !== "release") {
    const result = await dependencies.retryWeeklyRelease(
      {
        cacheRoot,
        stage: stage === "retry-push" ? "push" : "deploy",
        onProgress: progressLogger(dependencies.errorOutput, !options.json),
      },
      dependencies.releaseDependencies || {}
    );
    writeLine(
      dependencies.output,
      options.json
        ? JSON.stringify(result, null, 2)
        : `Release ${result.status}.`
    );
    return { ...result, cacheRoot };
  }

  let commitMessage = options.commitMessage || null;
  if (!options.direct) {
    commitMessage = await dependencies.inputPrompt(
      {
        message: "Commit message",
        default: "Publish Know Your Bible weekly update",
      },
      promptContext(dependencies)
    );
    const approved = await dependencies.confirmPrompt(
      {
        message: "Bump the patch version, commit, push main, and deploy dist/?",
        default: false,
      },
      promptContext(dependencies)
    );
    if (!approved) {
      writeLine(dependencies.output, "Release skipped.");
      return { status: "cancelled", cacheRoot };
    }
  } else if (!options.yes) {
    throw new Error("Direct release requires --yes.");
  }

  const result = await dependencies.releaseWeeklyUpdate(
    {
      cacheRoot,
      commitMessage,
      onProgress: progressLogger(dependencies.errorOutput, !options.json),
    },
    dependencies.releaseDependencies || {}
  );
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : `Released v${result.version} from ${result.commit}.`
  );
  return { ...result, cacheRoot };
}

export async function getWeeklyStatus(coursesEnv, dependencies) {
  const caches = await dependencies.listWeeklyCaches(
    coursesEnv.notesCacheRoot
  );
  return {
    cacheRoot: coursesEnv.notesCacheRoot,
    caches: caches.map((cache) => ({
      cacheId: cache.cacheId,
      cacheRoot: cache.cacheRoot,
      status: cache.state.status,
      audit: cache.state.latestAudit,
      noteUpdateCount: cache.noteUpdateCount,
      releaseStatus: cache.state.release?.status || null,
    })),
  };
}

export function formatWeeklyStatus(status) {
  const lines = [
    "Know Your Bible weekly caches",
    `Cache folder: ${status.cacheRoot}`,
  ];
  if (status.caches.length === 0) {
    lines.push("No caches found.");
  } else {
    for (const cache of status.caches) {
      const audit = cache.audit
        ? `; ${cache.audit.errors} errors, ${cache.audit.warnings} warnings`
        : "; not audited";
      lines.push(
        `- ${cache.cacheId}: ${cache.status}${audit}${
          cache.releaseStatus ? `; release ${cache.releaseStatus}` : ""
        }`
      );
    }
  }
  return lines.join("\n");
}

async function runStatus(options, coursesEnv, dependencies) {
  const result = await getWeeklyStatus(coursesEnv, dependencies);
  writeLine(
    dependencies.output,
    options.json
      ? JSON.stringify(result, null, 2)
      : formatWeeklyStatus(result)
  );
  return result;
}

async function runInteractive(options, coursesEnv, dependencies) {
  writeLine(dependencies.output, "Know Your Bible weekly workflow");
  let selectedCacheRoot = options.cacheRoot
    ? await dependencies.resolveWeeklyCache(
        coursesEnv.notesCacheRoot,
        options.cacheRoot
      )
    : null;

  while (true) {
    if (selectedCacheRoot) {
      writeLine(
        dependencies.output,
        `Selected cache: ${path.basename(selectedCacheRoot)}`
      );
    }
    const action = await dependencies.selectPrompt(
      {
        message: "Weekly workflow step",
        loop: false,
        choices: [
          {
            name: "1. Prepare cache from source documents",
            value: "prepare",
          },
          {
            name: "2. Manage YouTube special matches",
            value: "manage-youtube",
          },
          {
            name: "3. Audit cache until ready",
            value: "audit",
          },
          {
            name: "4. Apply selected cache",
            value: "apply",
          },
          {
            name: "5. Build and test",
            value: "validate",
          },
          {
            name: "6. Dev",
            value: "dev",
          },
          {
            name: "7. Version, commit, and deploy",
            value: "release-menu",
          },
          {
            name: "8. Delete a cache",
            value: "delete",
          },
          {
            name: "9. Export titles",
            value: "export-titles",
          },
          {
            name: "Show all cache status",
            value: "status",
          },
          {
            name: "Quit",
            value: "quit",
          },
        ],
      },
      promptContext(dependencies)
    );
    if (action === "quit") {
      writeLine(dependencies.output, "Weekly workflow stopped.");
      return { mode: "interactive", selectedCacheRoot };
    }
    if (action === "prepare") {
      const result = await runPrepare(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "manage-youtube") {
      const result = await runYoutubeMatchManager(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "audit") {
      const result = await runAudit(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "apply") {
      const result = await runApply(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "delete") {
      const result = await runDelete(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      if (
        result.status === "deleted" &&
        selectedCacheRoot === result.cacheRoot
      ) {
        selectedCacheRoot = null;
      }
    } else if (action === "validate") {
      const result = await runValidate(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "dev") {
      await runDev(options, dependencies);
    } else if (action === "export-titles") {
      await runExportTitles(options, dependencies);
    } else if (action === "release-menu") {
      const releaseAction = await dependencies.selectPrompt(
        {
          message: "Release action",
          default: "release",
          loop: false,
          choices: [
            { name: "Release validated update", value: "release" },
            { name: "Retry push", value: "retry-push" },
            { name: "Retry deployment", value: "retry-deploy" },
          ],
        },
        promptContext(dependencies)
      );
      const result = await runRelease(
        options,
        coursesEnv,
        dependencies,
        selectedCacheRoot,
        releaseAction
      );
      selectedCacheRoot = result.cacheRoot;
    } else if (action === "status") {
      await runStatus(options, coursesEnv, dependencies);
    }
  }
}

function buildDependencies(dependencies) {
  return {
    loadCoursesEnv,
    listWeeklyCaches,
    loadCacheState,
    recordCacheComponent,
    resolveWeeklyCache,
    buildCanonicalPublishedLessonCatalog,
    runWeeklyRefresh,
    formatWeeklyRefreshResult,
    auditWeeklyCache,
    formatCacheAudit,
    reconcileWeeklyCache,
    formatCacheReconciliation,
    deleteWeeklyCache,
    runWeeklyValidation,
    startDevelopmentServer,
    exportLessonTitles,
    loadYoutubeSpecialMatches,
    saveYoutubeSpecialMatches,
    resolvePlaylistVideoMatches,
    addYoutubeSpecialMatch,
    removeYoutubeSpecialMatch,
    formatYoutubeMatchReview,
    releaseWeeklyUpdate,
    retryWeeklyRelease,
    selectPrompt: select,
    checkboxPrompt: checkbox,
    confirmPrompt: confirm,
    inputPrompt: input,
    input: process.stdin,
    output: process.stdout,
    errorOutput: process.stderr,
    ...dependencies,
  };
}

export async function runWeeklyCommand(options = {}, dependencies = {}) {
  const resolvedDependencies = buildDependencies(dependencies);
  const coursesEnv =
    options.coursesEnv || (await resolvedDependencies.loadCoursesEnv());
  const directOptions = { ...options, direct: options.mode !== "interactive" };

  if (options.mode === "prepare") {
    return runPrepare(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (options.mode === "manage-youtube") {
    return runYoutubeMatchManager(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (options.mode === "dev") {
    return runDev(directOptions, resolvedDependencies);
  }
  if (options.mode === "export-titles") {
    return runExportTitles(directOptions, resolvedDependencies);
  }
  if (options.mode === "audit") {
    return runAudit(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (options.mode === "apply") {
    return runApply(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (options.mode === "delete") {
    return runDelete(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (options.mode === "validate") {
    return runValidate(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null
    );
  }
  if (["release", "retry-push", "retry-deploy"].includes(options.mode)) {
    return runRelease(
      directOptions,
      coursesEnv,
      resolvedDependencies,
      options.cacheRoot || null,
      options.mode
    );
  }
  if (options.mode === "status") {
    return runStatus(directOptions, coursesEnv, resolvedDependencies);
  }
  return runInteractive(options, coursesEnv, resolvedDependencies);
}

function printHelp() {
  console.log(`Usage: yarn weekly [options]

With no execution option, opens the guided workflow:
  1. Prepare cache from source documents
  2. Manage YouTube special matches
  3. Audit cache until ready
  4. Apply selected cache
  5. Build and test
  6. Dev
  7. Version, commit, and deploy
  8. Delete a cache
  9. Export titles

Direct execution:
  --prepare | --manage-youtube-matches | --audit | --apply
  --build-test | --validate | --dev
  --release | --delete-cache | --export-titles
  --retry-push | --retry-deploy | --status

Shared options:
  --cache <id|path>       Select a cache explicitly
  --components <list>     documents,notes,youtube,inventory
  --full-notes-export     Re-export every Apple Note body
  --online-audit          Check remote links after apply
  --commit-message <text> Override the release commit message
  --yes                   Confirm direct delete or release
  --json                  Print machine-readable direct-mode output`);
}

async function main() {
  const options = parseWeeklyArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await runWeeklyCommand(options);
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
