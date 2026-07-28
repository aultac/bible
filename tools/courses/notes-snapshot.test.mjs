import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPreviousSnapshot,
  writeSnapshotFiles,
} from "./notes-snapshot.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function temporaryRoot() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "know-your-bible-notes-snapshot-")
  );
  temporaryDirectories.push(root);
  return root;
}

function matchForNote(overrides = {}) {
  return {
    accountName: "iCloud",
    folderName: "FBT Sunday School",
    notes: [
      {
        id: "note-1",
        title: "001 Intro",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        ...overrides,
      },
    ],
  };
}

async function previousSnapshotFixture(root, previousNote = {}) {
  const snapshotRoot = path.join(root, "snapshots", "previous");
  const previousBodyPath = path.join(snapshotRoot, "notes", "cached.html");
  await mkdir(path.dirname(previousBodyPath), { recursive: true });
  await writeFile(previousBodyPath, "<p>Cached body</p>", "utf8");
  const manifest = {
    schemaVersion: 1,
    source: {
      accountName: "iCloud",
      folderName: "FBT Sunday School",
    },
    notes: [
      {
        id: "note-1",
        title: "001 Intro",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        bodyPath: "notes/cached.html",
        ...previousNote,
      },
    ],
  };
  await writeFile(
    path.join(snapshotRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return {
    snapshotRoot,
    manifest,
  };
}

describe("Apple Notes snapshot exports", () => {
  it("reuses unchanged note body exports from the previous snapshot", async () => {
    const root = await temporaryRoot();
    const previousSnapshot = await previousSnapshotFixture(root);
    const snapshotRoot = path.join(root, "snapshots", "current");
    const logs = [];
    const readNoteBodyFn = vi.fn();

    const manifest = await writeSnapshotFiles(snapshotRoot, matchForNote(), {
      previousSnapshot,
      readNoteBodyFn,
      log: (message) => logs.push(message),
    });

    expect(readNoteBodyFn).not.toHaveBeenCalled();
    expect(manifest.exportStats).toEqual({
      fullExport: false,
      exported: 0,
      reused: 1,
    });
    expect(logs).toEqual([
      "Reusing cached note export 1/1: 001 Intro",
    ]);
    expect(
      await readFile(path.join(snapshotRoot, manifest.notes[0].bodyPath), "utf8")
    ).toBe("<p>Cached body</p>");
  });

  it("exports changed notes instead of reusing stale cached bodies", async () => {
    const root = await temporaryRoot();
    const previousSnapshot = await previousSnapshotFixture(root);
    const snapshotRoot = path.join(root, "snapshots", "current");
    const logs = [];
    const readNoteBodyFn = vi.fn(async () => ({ bodyHtml: "<p>Fresh body</p>" }));

    const manifest = await writeSnapshotFiles(
      snapshotRoot,
      matchForNote({ updatedAt: "2026-01-03T00:00:00.000Z" }),
      {
        previousSnapshot,
        readNoteBodyFn,
        log: (message) => logs.push(message),
      }
    );

    expect(readNoteBodyFn).toHaveBeenCalledWith(
      "iCloud",
      "FBT Sunday School",
      "note-1"
    );
    expect(manifest.exportStats).toEqual({
      fullExport: false,
      exported: 1,
      reused: 0,
    });
    expect(logs).toEqual([
      "Exporting note 1/1: 001 Intro (modified)",
    ]);
    expect(
      await readFile(path.join(snapshotRoot, manifest.notes[0].bodyPath), "utf8")
    ).toBe("<p>Fresh body</p>");
  });

  it("exports unchanged notes when the cached body file is missing", async () => {
    const root = await temporaryRoot();
    const previousSnapshot = await previousSnapshotFixture(root, {
      bodyPath: "notes/missing.html",
    });
    const snapshotRoot = path.join(root, "snapshots", "current");
    const logs = [];
    const readNoteBodyFn = vi.fn(async () => ({ bodyHtml: "<p>Recovered body</p>" }));

    const manifest = await writeSnapshotFiles(snapshotRoot, matchForNote(), {
      previousSnapshot,
      readNoteBodyFn,
      log: (message) => logs.push(message),
    });

    expect(readNoteBodyFn).toHaveBeenCalledTimes(1);
    expect(manifest.exportStats).toEqual({
      fullExport: false,
      exported: 1,
      reused: 0,
    });
    expect(logs).toEqual([
      "Exporting note 1/1: 001 Intro (missing cached body)",
    ]);
  });

  it("bypasses the cache when full export is requested", async () => {
    const root = await temporaryRoot();
    const previousSnapshot = await previousSnapshotFixture(root);
    const snapshotRoot = path.join(root, "snapshots", "current");
    const logs = [];
    const readNoteBodyFn = vi.fn(async () => ({ bodyHtml: "<p>Full body</p>" }));

    const manifest = await writeSnapshotFiles(snapshotRoot, matchForNote(), {
      previousSnapshot,
      fullExport: true,
      readNoteBodyFn,
      log: (message) => logs.push(message),
    });

    expect(readNoteBodyFn).toHaveBeenCalledTimes(1);
    expect(manifest.exportStats).toEqual({
      fullExport: true,
      exported: 1,
      reused: 0,
    });
    expect(logs).toEqual([
      "Exporting note 1/1: 001 Intro (full export requested)",
    ]);
  });

  it("loads the previous snapshot from the latest pointer", async () => {
    const root = await temporaryRoot();
    const previousSnapshot = await previousSnapshotFixture(root);

    await expect(
      loadPreviousSnapshot(root, { latestSnapshotDir: "snapshots/missing" })
    ).resolves.toBeNull();
    await expect(
      loadPreviousSnapshot(root, { latestSnapshotDir: "snapshots/previous" })
    ).resolves.toMatchObject({
      snapshotRoot: previousSnapshot.snapshotRoot,
      manifest: previousSnapshot.manifest,
    });
  });
});
