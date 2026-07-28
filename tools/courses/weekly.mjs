import {
  checkbox,
  confirm,
  input,
  select,
} from "@inquirer/prompts";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCoursesEnv } from "./config.mjs";
import {
  formatCacheChoice,
  listWeeklyCaches,
  loadCacheState,
  resolveWeeklyCache,
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
  startLocalPreview,
} from "./weekly-release.mjs";
import {
  formatWeeklyRefreshResult,
  runWeeklyRefresh,
} from "./weekly-refresh.mjs";

const EXECUTION_MODES = new Map([
  ["--prepare", "prepare"],
  ["--audit", "audit"],
  ["--apply", "apply"],
  ["--delete-cache", "delete"],
  ["--validate", "validate"],
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
    } else if (arg === "--preview") {
      options.preview = true;
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
  { states = null, message = "Choose a weekly cache" } = {}
) {
  const caches = (await dependencies.listWeeklyCaches(
    coursesEnv.notesCacheRoot
  )).filter(
    (cache) =>
      cache.selectable &&
      (!states || states.includes(cache.state.status))
  );
  if (caches.length === 0) {
    throw new Error("No matching weekly caches are available.");
  }
  return dependencies.selectPrompt(
    {
      message,
      loop: false,
      choices: caches.map(formatCacheChoice),
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
    selectedCacheRoot,
    coursesEnv,
    dependencies,
    { states: ["applied"] }
  );
  const reconciliation = await dependencies.reconcileWeeklyCache({
    cacheRoot,
  });
  writeLine(
    dependencies.output,
    dependencies.formatCacheReconciliation(reconciliation)
  );
  if (!reconciliation.safeToDelete) {
    return { status: "blocked", cacheRoot, reconciliation };
  }
  if (!options.yes) {
    const approved = await dependencies.confirmPrompt(
      {
        message: `Permanently delete cache ${path.basename(cacheRoot)}?`,
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
  });
  writeLine(dependencies.output, `Deleted cache ${result.cacheId}.`);
  return { status: "deleted", ...result };
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
  let preview = Boolean(options.preview);
  if (!options.direct && !options.json) {
    preview = await dependencies.confirmPrompt(
      {
        message: "Start the built site with Vite for local testing?",
        default: true,
      },
      promptContext(dependencies)
    );
  }
  if (preview) {
    await dependencies.startLocalPreview(
      {
        onProgress: progressLogger(dependencies.errorOutput, true),
      },
      dependencies.validationDependencies || {}
    );
  }
  return { ...result, cacheRoot, preview };
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
            name: "2. Audit cache until ready",
            value: "audit",
          },
          {
            name: "3. Apply selected cache",
            value: "apply",
          },
          {
            name: "4. Delete an applied cache safely",
            value: "delete",
          },
          {
            name: "5. Build and test locally with Vite",
            value: "validate",
          },
          {
            name: "6. Version, commit, and deploy",
            value: "release-menu",
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
      if (result.status === "deleted") {
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
    resolveWeeklyCache,
    runWeeklyRefresh,
    formatWeeklyRefreshResult,
    auditWeeklyCache,
    formatCacheAudit,
    reconcileWeeklyCache,
    formatCacheReconciliation,
    deleteWeeklyCache,
    runWeeklyValidation,
    startLocalPreview,
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

With no execution option, opens the guided six-step workflow:
  1. Prepare cache from source documents
  2. Audit cache until ready
  3. Apply selected cache
  4. Delete an applied cache safely
  5. Build and test locally with Vite
  6. Version, commit, and deploy

Direct execution:
  --prepare | --audit | --apply | --delete-cache | --validate | --release
  --retry-push | --retry-deploy | --status

Shared options:
  --cache <id|path>       Select a cache explicitly
  --components <list>     documents,notes,youtube,inventory
  --full-notes-export     Re-export every Apple Note body
  --online-audit          Check remote links after apply
  --preview               Start Vite after direct validation
  --commit-message <text> Override the release commit message
  --yes                   Confirm direct delete or release after safety checks
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
