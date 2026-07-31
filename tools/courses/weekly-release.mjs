import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "./config.mjs";
import {
  loadCacheState,
  writeCacheState,
} from "./weekly-cache.mjs";
import { reconcileWeeklyCache } from "./weekly-cache-delete.mjs";

const execFileAsync = promisify(execFile);
const WEEKLY_RELEASE_PATHS = [
  "apps/courses/content/",
  "apps/courses/public/",
  "dist/",
];
const WEEKLY_RELEASE_FILES = new Set([
  "apps/courses/src/toolsData.ts",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
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
      files.push({
        path: relativePath,
        hash: hash(await readFile(absolutePath)),
      });
    }
  }
  return files;
}

export async function computeReleaseFingerprint(repoRoot = REPO_ROOT) {
  const roots = [
    "apps/courses/content",
    "apps/courses/public",
    "dist",
  ];
  const files = [];
  for (const root of roots) {
    for (const file of await collectFiles(path.join(repoRoot, root))) {
      files.push({
        path: path.posix.join(root, file.path),
        hash: file.hash,
      });
    }
  }
  for (const filePath of [...WEEKLY_RELEASE_FILES].sort()) {
    const absolutePath = path.join(repoRoot, filePath);
    if (await pathExists(absolutePath)) {
      files.push({
        path: filePath,
        hash: hash(await readFile(absolutePath)),
      });
    }
  }
  return hash(JSON.stringify(files));
}

export async function runInheritedCommand(
  command,
  args,
  { cwd = REPO_ROOT, env = process.env } = {}
) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} ${
            signal ? `was stopped by ${signal}` : `exited with code ${code}`
          }.`
        )
      );
    });
  });
}

export async function runWeeklyValidation(
  { cacheRoot, onProgress = null },
  {
    runCommand = runInheritedCommand,
    computeFingerprint = computeReleaseFingerprint,
  } = {}
) {
  const progress =
    typeof onProgress === "function" ? onProgress : () => {};
  const commands = [
    ["yarn", ["test:courses"]],
    ["yarn", ["courses:audit"]],
    ["yarn", ["build"]],
  ];
  for (const [command, args] of commands) {
    progress(`Running ${command} ${args.join(" ")}.`);
    await runCommand(command, args, { cwd: REPO_ROOT });
  }

  const validatedAt = new Date().toISOString();
  const fingerprint = await computeFingerprint(REPO_ROOT);
  const state = await loadCacheState(cacheRoot);
  const nextState = {
    ...state,
    updatedAt: validatedAt,
    release: {
      ...(state.release || {}),
      validation: {
        validatedAt,
        fingerprint,
        commands: commands.map(([command, args]) =>
          [command, ...args].join(" ")
        ),
      },
    },
  };
  await writeCacheState(cacheRoot, nextState);
  return {
    validatedAt,
    fingerprint,
    commands: nextState.release.validation.commands,
    state: nextState,
  };
}

export async function startDevelopmentServer(
  { onProgress = null } = {},
  { runCommand = runInheritedCommand } = {}
) {
  if (onProgress) {
    onProgress("Starting the development site with yarn dev.");
  }
  await runCommand("yarn", ["dev"], { cwd: REPO_ROOT });
}

function parseStatusPaths(statusOutput) {
  return statusOutput
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const pathText = entry.slice(3);
      return pathText.includes(" -> ")
        ? pathText.split(" -> ").at(-1)
        : pathText;
    });
}

function isWeeklyReleasePath(filePath) {
  return (
    WEEKLY_RELEASE_FILES.has(filePath) ||
    WEEKLY_RELEASE_PATHS.some((prefix) => filePath.startsWith(prefix))
  );
}

export function assertOnlyWeeklyReleaseChanges(paths) {
  const unrelated = paths.filter(
    (filePath) => !isWeeklyReleasePath(filePath)
  );
  if (unrelated.length > 0) {
    throw new Error(
      `Release refused because unrelated working-tree changes exist:\n${unrelated
        .map((filePath) => `- ${filePath}`)
        .join("\n")}`
    );
  }
}

export function nextPatchVersion(version) {
  const match = String(version).match(
    /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u
  );
  if (!match?.groups) {
    throw new Error(`Expected a semantic version, received ${version}.`);
  }
  return `${match.groups.major}.${match.groups.minor}.${
    Number.parseInt(match.groups.patch, 10) + 1
  }`;
}

export async function bumpPackagePatch(
  packagePath = path.join(REPO_ROOT, "package.json")
) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const previousVersion = packageJson.version;
  const version = nextPatchVersion(previousVersion);
  packageJson.version = version;
  await writeFile(
    packagePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8"
  );
  return { previousVersion, version, packagePath };
}

async function git(
  args,
  {
    repoRoot = REPO_ROOT,
    exec = execFileAsync,
    allowFailure = false,
    trimOutput = true,
  } = {}
) {
  try {
    const result = await exec("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const output = String(result.stdout || "");
    return trimOutput ? output.trim() : output;
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    throw error;
  }
}

async function verifyReleasePreconditions({
  cacheRoot,
  repoRoot,
  expectedBranch,
  computeFingerprint,
  exec,
}) {
  const reconciliation = await reconcileWeeklyCache({
    cacheRoot,
    repoRoot,
  });
  if (!reconciliation.safeToDelete) {
    throw new Error(
      "Release refused because the selected cache no longer matches its applied outputs."
    );
  }
  const state = reconciliation.state;
  const validation = state.release?.validation;
  if (!validation) {
    throw new Error("Run build and local testing before release.");
  }
  const fingerprint = await computeFingerprint(repoRoot);
  if (fingerprint !== validation.fingerprint) {
    throw new Error(
      "Release inputs changed after validation. Run build and local testing again."
    );
  }
  const branch = await git(["branch", "--show-current"], {
    repoRoot,
    exec,
  });
  if (branch !== expectedBranch) {
    throw new Error(
      `Release requires branch ${expectedBranch}; current branch is ${branch || "detached HEAD"}.`
    );
  }
  const mergeHead = await git(
    ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
    { repoRoot, exec, allowFailure: true }
  );
  if (mergeHead) {
    throw new Error("Release refused while a merge is in progress.");
  }
  const statusOutput = await git(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { repoRoot, exec, trimOutput: false }
  );
  const paths = parseStatusPaths(`${statusOutput}\0`);
  assertOnlyWeeklyReleaseChanges(paths);
  if (paths.length === 0) {
    throw new Error("Release refused because there are no weekly changes.");
  }
  return { state, branch, paths, reconciliation };
}

async function writeReleaseState(cacheRoot, state, release) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
    release: {
      ...(state.release || {}),
      ...release,
    },
  };
  await writeCacheState(cacheRoot, nextState);
  return nextState;
}

export async function releaseWeeklyUpdate(
  {
    cacheRoot,
    commitMessage,
    expectedBranch = "main",
    onProgress = null,
  },
  {
    repoRoot = REPO_ROOT,
    computeFingerprint = computeReleaseFingerprint,
    bumpVersion = bumpPackagePatch,
    exec = execFileAsync,
    runCommand = runInheritedCommand,
  } = {}
) {
  const progress =
    typeof onProgress === "function" ? onProgress : () => {};
  const preflight = await verifyReleasePreconditions({
    cacheRoot,
    repoRoot,
    expectedBranch,
    computeFingerprint,
    exec,
  });
  progress("Bumping the package patch version.");
  const bumped = await bumpVersion(path.join(repoRoot, "package.json"));
  const message =
    commitMessage ||
    `Publish Know Your Bible update (v${bumped.version})`;

  await git(
    [
      "add",
      "--",
      "apps/courses/content",
      "apps/courses/public",
      "apps/courses/src/toolsData.ts",
      "dist",
      "package.json",
    ],
    { repoRoot, exec }
  );
  await git(["commit", "-m", message], { repoRoot, exec });
  const commit = await git(["rev-parse", "HEAD"], { repoRoot, exec });
  let state = await writeReleaseState(cacheRoot, preflight.state, {
    version: bumped.version,
    commit,
    branch: preflight.branch,
    status: "committed",
    committedAt: new Date().toISOString(),
  });

  progress(`Pushing ${preflight.branch}.`);
  await git(["push", "origin", preflight.branch], { repoRoot, exec });
  state = await writeReleaseState(cacheRoot, state, {
    status: "pushed",
    pushedAt: new Date().toISOString(),
  });

  progress("Publishing the validated dist/ folder to GitHub Pages.");
  await runCommand("yarn", ["deploy:dist"], { cwd: repoRoot });
  state = await writeReleaseState(cacheRoot, state, {
    status: "deployed",
    deployedAt: new Date().toISOString(),
  });
  return {
    version: bumped.version,
    commit,
    branch: preflight.branch,
    status: "deployed",
    state,
  };
}

export async function retryWeeklyRelease(
  { cacheRoot, stage, onProgress = null },
  {
    repoRoot = REPO_ROOT,
    exec = execFileAsync,
    runCommand = runInheritedCommand,
  } = {}
) {
  const progress =
    typeof onProgress === "function" ? onProgress : () => {};
  let state = await loadCacheState(cacheRoot);
  const release = state.release;
  if (!release?.commit || !release.branch) {
    throw new Error("No committed weekly release is available to retry.");
  }

  if (stage === "push") {
    progress(`Retrying push of ${release.branch}.`);
    await git(["push", "origin", release.branch], { repoRoot, exec });
    state = await writeReleaseState(cacheRoot, state, {
      status: "pushed",
      pushedAt: new Date().toISOString(),
    });
    return { stage, status: "pushed", state };
  }
  if (stage === "deploy") {
    if (!["pushed", "deployed"].includes(release.status)) {
      throw new Error("Push the committed release before deploying it.");
    }
    progress("Retrying GitHub Pages deployment.");
    await runCommand("yarn", ["deploy:dist"], { cwd: repoRoot });
    state = await writeReleaseState(cacheRoot, state, {
      status: "deployed",
      deployedAt: new Date().toISOString(),
    });
    return { stage, status: "deployed", state };
  }
  throw new Error(`Unknown release retry stage: ${stage}`);
}
