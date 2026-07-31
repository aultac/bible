import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPLIED_NOTES_CHECKPOINT_KIND,
  writeAppliedNotesCheckpoint,
} from "./applied-notes-checkpoint.mjs";
import {
  applyCanonicalNoteBackups,
  prepareCanonicalNoteBackups,
} from "./notes-backups.mjs";
import { createNotesSnapshot } from "./notes-snapshot.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function createFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "applied-notes-checkpoint-")
  );
  temporaryRoots.push(root);
  const canonicalBase = path.join(root, "canonical");
  const lessonDirectory = path.join(
    canonicalBase,
    "01-Bucket-Genesis1-11",
    "001-Intro"
  );
  const cacheRoot = path.join(root, "cache-to-apply");
  const noteBodyPath = path.join(cacheRoot, "notes", "intro.html");
  const checkpointPath = path.join(
    root,
    "repo",
    "apps",
    "courses",
    "content",
    "apple-notes-checkpoint.json"
  );
  const note = {
    id: "note-1",
    title: "001-Intro",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  await mkdir(lessonDirectory, { recursive: true });
  await mkdir(path.dirname(noteBodyPath), { recursive: true });
  await writeFile(noteBodyPath, "<h1>Intro</h1>", "utf8");
  await writeFile(
    path.join(cacheRoot, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        source: {
          accountName: "iCloud",
          folderName: "Know Your Bible",
        },
        notes: [{ ...note, bodyPath: "notes/intro.html" }],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return {
    root,
    canonicalBase,
    cacheRoot,
    checkpointPath,
    lessonDirectory,
    note,
    coursesEnv: {
      canonicalBase,
      notesCheckpointPath: checkpointPath,
    },
  };
}

describe("applied Apple Notes checkpoint", () => {
  it("survives cache deletion and exports only subsequently changed notes", async () => {
    const fixture = await createFixture();
    const prepared = await prepareCanonicalNoteBackups({
      snapshotRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
    });
    await applyCanonicalNoteBackups({ reportPath: prepared.reportPath });
    await writeAppliedNotesCheckpoint({
      checkpointPath: fixture.checkpointPath,
      cacheRoot: fixture.cacheRoot,
      report: prepared.report,
      appliedAt: "2026-01-03T00:00:00.000Z",
    });
    await rm(fixture.cacheRoot, { recursive: true, force: true });

    const unchangedBodyReader = vi.fn();
    const unchanged = await createNotesSnapshot(
      {
        coursesEnv: fixture.coursesEnv,
        account: "iCloud",
        folder: "Know Your Bible",
        output: path.join(fixture.root, "fresh-cache"),
        prepareBackups: true,
      },
      {
        readFolder: async () => ({
          matches: [
            {
              accountName: "iCloud",
              folderName: "Know Your Bible",
              notes: [fixture.note],
            },
          ],
        }),
        readNoteBodyFn: unchangedBodyReader,
        log: () => {},
      }
    );

    expect(unchangedBodyReader).not.toHaveBeenCalled();
    expect(unchanged.exportStats).toEqual({
      fullExport: false,
      exported: 0,
      reused: 1,
    });
    expect(unchanged.previousCheckpointPath).toBe(
      fixture.checkpointPath
    );
    const unchangedReport = JSON.parse(
      await readFile(unchanged.canonicalNoteBackupReportPath, "utf8")
    );
    expect(unchangedReport.totals).toMatchObject({
      updated: 0,
      new: 0,
      unchanged: 1,
    });
    const refreshedBodyReader = vi.fn();
    const refreshed = await createNotesSnapshot(
      {
        coursesEnv: fixture.coursesEnv,
        account: "iCloud",
        folder: "Know Your Bible",
        output: path.join(fixture.root, "refreshed-cache"),
        previousSnapshotRoot: unchanged.snapshotRoot,
        prepareBackups: true,
      },
      {
        readFolder: async () => ({
          matches: [
            {
              accountName: "iCloud",
              folderName: "Know Your Bible",
              notes: [fixture.note],
            },
          ],
        }),
        readNoteBodyFn: refreshedBodyReader,
        log: () => {},
      }
    );

    expect(refreshedBodyReader).not.toHaveBeenCalled();
    expect(refreshed.exportStats).toMatchObject({
      exported: 0,
      reused: 1,
    });

    const changedBodyReader = vi.fn(async () => ({
      bodyHtml: "<h1>Changed Intro</h1>",
    }));
    const changed = await createNotesSnapshot(
      {
        coursesEnv: fixture.coursesEnv,
        account: "iCloud",
        folder: "Know Your Bible",
        output: path.join(fixture.root, "changed-cache"),
        prepareBackups: true,
      },
      {
        readFolder: async () => ({
          matches: [
            {
              accountName: "iCloud",
              folderName: "Know Your Bible",
              notes: [
                {
                  ...fixture.note,
                  updatedAt: "2026-01-04T00:00:00.000Z",
                },
              ],
            },
          ],
        }),
        readNoteBodyFn: changedBodyReader,
        log: () => {},
      }
    );

    expect(changedBodyReader).toHaveBeenCalledTimes(1);
    expect(changed.exportStats).toEqual({
      fullExport: false,
      exported: 1,
      reused: 0,
    });
    const changedReport = JSON.parse(
      await readFile(changed.canonicalNoteBackupReportPath, "utf8")
    );
    expect(changedReport.totals.updated).toBe(1);

    await writeFile(
      path.join(fixture.lessonDirectory, "notes.md"),
      "Locally changed canonical notes\n",
      "utf8"
    );
    const driftedBodyReader = vi.fn(async () => ({
      bodyHtml: "<h1>Intro</h1>",
    }));
    const drifted = await createNotesSnapshot(
      {
        coursesEnv: fixture.coursesEnv,
        account: "iCloud",
        folder: "Know Your Bible",
        output: path.join(fixture.root, "drifted-cache"),
        prepareBackups: true,
      },
      {
        readFolder: async () => ({
          matches: [
            {
              accountName: "iCloud",
              folderName: "Know Your Bible",
              notes: [fixture.note],
            },
          ],
        }),
        readNoteBodyFn: driftedBodyReader,
        log: () => {},
      }
    );

    expect(driftedBodyReader).toHaveBeenCalledTimes(1);
    expect(drifted.exportStats).toMatchObject({
      exported: 1,
      reused: 0,
    });
  });

  it("stores metadata and hashes without storing note bodies", async () => {
    const fixture = await createFixture();
    const prepared = await prepareCanonicalNoteBackups({
      snapshotRoot: fixture.cacheRoot,
      canonicalBase: fixture.canonicalBase,
    });
    const result = await writeAppliedNotesCheckpoint({
      checkpointPath: fixture.checkpointPath,
      cacheRoot: fixture.cacheRoot,
      report: prepared.report,
      appliedAt: "2026-01-03T00:00:00.000Z",
    });

    expect(result.checkpoint).toMatchObject({
      schemaVersion: 1,
      kind: APPLIED_NOTES_CHECKPOINT_KIND,
      noteCount: 1,
      notes: [
        {
          id: "note-1",
          title: "001-Intro",
          relativeLessonDirectory:
            "01-Bucket-Genesis1-11/001-Intro",
        },
      ],
    });
    expect(JSON.stringify(result.checkpoint)).not.toContain(
      "<h1>Intro</h1>"
    );
    expect(result.checkpoint.notes[0]).not.toHaveProperty("bodyPath");
  });
});
