# Know Your Bible Weekly Workflow

`yarn weekly` is a review-gated, six-step workflow. Source documents are first
copied or converted into a selected cache. Nothing reaches canonical lesson
folders or generated website content until that cache passes its audit and is
explicitly applied.

Run the guided workflow from the repository root:

```bash
yarn weekly
```

The menu remembers the selected cache for the current session. Every direct
command instead requires `--cache <id|path>` when it operates on an existing
cache, so an old or unintended cache is never selected implicitly.

## 1. Prepare cache from source documents

The default guided action creates a new timestamped cache and refreshes all four
components:

1. `documents` converts section and lesson Word summaries to cached Markdown and
   extracts each lesson's `Title:` as its `videoSummary`.
2. `notes` exports Apple Notes, reuses unchanged note bodies from the selected
   cache or newest prior cache, and stages only candidates that differ from
   canonical `notes.md`.
3. `youtube` stores a validated playlist snapshot.
4. `inventory` fingerprints canonical lesson folders, publication markers, and
   assets.

The cache is audited automatically after preparation. Preparation does not
change canonical lessons or generated repository content.

To create a new full cache directly:

```bash
yarn weekly --prepare
```

To refresh an existing unapplied cache, select it in the guided menu or name it
directly:

```bash
yarn weekly --prepare --cache <cache-id>
```

An existing cache can refresh only the affected components:

```bash
yarn weekly --prepare --cache <cache-id> --components documents
yarn weekly --prepare --cache <cache-id> --components notes,youtube
```

Valid component names are `documents`, `notes`, `youtube`, and `inventory`.
Refreshing any component returns the cache to `draft` and invalidates its
previous successful audit.

Use `--full-notes-export` with preparation when every Apple Note body should be
read again instead of reusing unchanged bodies from the selected cache or the
newest prior cache.

### Word summary titles

A lesson Word summary should include a line such as:

```text
Title: God Creates the Heavens and the Earth
```

Heading and bold formatting produced by Word conversion are accepted. A missing
Word summary or missing `Title:` is an audit warning rather than an apply
blocker. The generated lesson then has no `videoSummary` and the UI uses its
generic fallback copy.

### Tool and resource link directives

Apple Notes is the source of truth for lesson-to-tool relationships and
resource provenance. Add either case-sensitive marker on its own line anywhere
in a lesson note:

```text
TOOL_LINK: /ages/
RESOURCE_LINK: family-tree.png: https://example.org/family-tree
```

`TOOL_LINK:` takes the first non-whitespace value after the marker. It must be a
root-relative served tool path. Directory paths are normalized with a trailing
slash. The tool title is read from the tool itself, preferring
`meta[name="application-name"]`, then its first `h1`, then `title`; titles are
not authored in lesson relationship data.

`RESOURCE_LINK:` takes an exact resource filename up to the next colon and an
absolute HTTP(S) source URL after it. The filename must match exactly one file
under that lesson's `resources/` folder. Duplicate filenames, duplicate or
conflicting declarations, missing files, malformed paths, and invalid URLs
block cache readiness.

Markdown wrappers and list prefixes are allowed around a directive. During
prepare, staged candidates are validated without changing repository files.
During apply, every published canonical `notes.md` is rescanned so relationships
from unchanged lessons remain present. The generated
`apps/courses/src/toolsData.ts` groups each tool with all related lesson IDs;
unpublished lessons are excluded.

Generated notes remain byte-for-byte copies of the authored Markdown. In the
lesson UI, a tool directive is displayed as the discovered title plus the full
`https://knowyourbible.study` tool URL. Resource directives are hidden, and a
matching resource displays a separate `Source` link. Both directive types are
excluded from the lesson search index.

### Special lessons and YouTube matching

The course starts with two lessons that do not represent Bible passages:

- `000-Promo` is a course preview. It has the canonical route
  `/genesis/0/0`, is omitted from normal Bible-reference and book indexes, and
  is featured on the home page when its video is available.
- `001-Intro` is the course introduction. It remains the first numbered week
  and uses the existing `/genesis/1/0` route.

Each folder can contain notes and a Word summary without defining a verse
range. A lesson summary normally follows `<lesson-folder>_summary.docx`; the
separator after the three-digit sequence may be either a hyphen or underscore.
For example, both `000-Promo_summary.docx` and `000_Promo_summary.docx` match
`000-Promo`. Providing both forms is ambiguous and fails preparation.

Playlist schema version 2 matches videos to lessons explicitly from the video
title. A title containing `Promo` maps to lesson sequence `0`; a title
containing `Week N` maps to lesson sequence `N`. Playlist position controls
display order only and is never used as a lesson match fallback. Unmatched
titles produce an audit warning, while duplicate explicit lesson matches are an
error.

## 2. Audit cache until ready

Run the audit after reviewing or repairing a cache:

```bash
yarn weekly --audit --cache <cache-id>
```

The audit verifies:

- all four required components are present;
- recorded component files still match their preparation fingerprints;
- Word source documents and converted Markdown are unchanged;
- staged Apple Notes candidates still match their hashes and map to canonical
  lesson folders;
- staged `TOOL_LINK:` and `RESOURCE_LINK:` declarations are valid and resolve
  to authored tool documents and exact lesson resource filenames;
- the cached YouTube playlist is non-empty and has valid, unique video IDs; and
- canonical source files still match the cached inventory.

Errors keep the cache in `draft`. Warnings are shown for review but do not block
readiness. Fix the source or cached candidate, refresh the affected component,
and rerun the audit until the cache is `ready`.

## 3. Apply the selected cache

Apply only after reviewing a ready cache:

```bash
yarn weekly --apply --cache <cache-id>
```

Apply:

- refuses caches whose successful audit fingerprint is stale;
- validates and copies staged `notes.md` candidates;
- uses only the cached Word conversions and cached YouTube playlist;
- regenerates course manifests, Markdown, resources, maps, search data, and
  `apps/courses/src/toolsData.ts` from all published canonical notes;
- records `videoSummary` from each Word document's `Title:` field;
- preserves unpublished lessons under generated unpublished content; and
- runs the repository course audit.

Apply does not fetch YouTube or reconvert Word documents. If either input needs
to change, return to step 1 and refresh that component. A successfully applied
cache becomes immutable.

Use `--online-audit` with apply when remote links should also be checked:

```bash
yarn weekly --apply --cache <cache-id> --online-audit
```

## 4. Delete an applied cache safely

Cache deletion first reconciles every retained candidate against what was
applied:

```bash
yarn weekly --delete-cache --cache <cache-id> --yes
```

The reconciliation checks:

- the applied component fingerprint still matches the cache;
- applied canonical notes still match their recorded hashes;
- the generated repository playlist still matches;
- the generated tool catalog still matches its applied hash;
- every generated lesson `videoSummary` matches the cached Word title; and
- any legacy summary candidates retained from an older cache were not lost.

Deletion is refused on any mismatch or when the cache has no successful applied
marker. A successful deletion writes a small tombstone under the cache history
folder and repairs `latest.json`; it does not silently discard unmatched
candidates.

The guided menu shows reconciliation results and asks for confirmation before
deleting.

## 5. Build and test locally with Vite

Validate an applied cache:

```bash
yarn weekly --validate --cache <cache-id>
```

This runs, in order:

```bash
yarn test:courses
yarn courses:audit
yarn build
```

After all three pass, the workflow records a fingerprint of generated course
content, public assets, the exact generated
`apps/courses/src/toolsData.ts` source file, and `dist/`. The release step
refuses to proceed if those files change afterward.

Use `--preview` in direct mode to start the built site on
`http://127.0.0.1:4173/`:

```bash
yarn weekly --validate --cache <cache-id> --preview
```

In guided mode, the CLI offers to start the preview after validation.

## 6. Version, commit, and deploy

Release a validated applied cache:

```bash
yarn weekly --release --cache <cache-id> --yes
```

An optional commit message can be supplied:

```bash
yarn weekly --release --cache <cache-id> --yes \
  --commit-message "Publish Know Your Bible weekly update"
```

Release refuses to run unless:

- the selected cache still reconciles with its applied outputs;
- step 5's fingerprint still matches;
- the current branch is `main`;
- no merge is in progress;
- weekly generated changes exist; and
- every working-tree change is under `apps/courses/content/`,
  `apps/courses/public/`, or `dist/`, or is the exact generated
  `apps/courses/src/toolsData.ts` file.

The command patch-bumps `package.json`, stages only those generated paths, the
generated tool catalog, and `package.json`, commits, pushes `main`, and deploys
the already validated `dist/` folder. It does not rebuild during deployment.

If a push or deployment fails after the commit succeeds, retry only that stage:

```bash
yarn weekly --retry-push --cache <cache-id>
yarn weekly --retry-deploy --cache <cache-id>
```

Implementation, documentation, or other unrelated working-tree changes must be
committed separately before using the weekly release step.

## Cache status and lifecycle

Show all caches and their lifecycle state:

```bash
yarn weekly --status
```

Managed caches live under:

```text
<notes-cache-root>/snapshots/<timestamp>/
```

Important files include:

- `cache-state.json`: component fingerprints and lifecycle state;
- `cache-audit.json`: the latest detailed readiness report;
- `document-summaries.json` and `documents/`: Word metadata and Markdown;
- `manifest.json`, `notes/`, and
  `canonical-note-backup-report.json`: Apple Notes staging;
- `playlist.json`: the cached YouTube snapshot; and
- `source-inventory.json`: canonical source fingerprints.

Lifecycle states are:

- `draft`: incomplete, changed, or failing audit;
- `ready`: successfully audited and eligible to apply;
- `applied`: applied successfully and immutable;
- `legacy`: an older cache without current lifecycle metadata; and
- `invalid`: an incomplete folder that cannot be selected.

Legacy caches must be refreshed into the current component structure and pass
the audit before they can be applied.

## NOPUBLISH rules

A lesson is excluded from the website when either condition is true:

1. Any file anywhere in the canonical lesson folder has `NOPUBLISH` in its
   filename, case-insensitively.
2. The lesson's `notes.md` contains `NOPUBLISH`, case-insensitively.

During regeneration, unpublished lesson manifests and Markdown are stored under
`apps/courses/content/unpublished/`. They are excluded from published section
manifests, routes, navigation, public resources, maps, search data, and the
production application bundle.

Remove every filename and notes-content marker, prepare and audit a new cache,
then apply it to republish the lesson.

## Lower-level troubleshooting commands

The individual commands remain available for diagnosing one part of the
workflow:

```bash
yarn courses:notes:snapshot
yarn courses:notes:snapshot --full-export
yarn courses:notes:backups:prepare
yarn courses:notes:backups:apply
yarn courses:weekly
yarn courses:update
yarn courses:audit
```

`yarn courses:weekly` is the lower-level selected-cache prepare/apply command.
`yarn courses:update` regenerates directly from live source inputs and is not
the review-gated weekly apply path. Use `--help` with a command to see its
supported options.
