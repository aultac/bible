# Know Your Bible Weekly Workflow

The weekly refresh is intentionally review-gated. Preparing, applying, building,
and deploying are separate steps so that exported notes and AI-generated summaries
can be inspected before they reach the website.

## 1. Prepare the weekly update

From the repository root, run:

```bash
yarn courses:weekly
```

This command:

- checks that the Grok CLI is installed and authenticated;
- exports the configured Apple Notes folder;
- compares exported notes with canonical lesson `notes.md` files;
- stages only new or changed notes;
- identifies lessons marked `NOPUBLISH`;
- generates eligible `notes-summary.md` candidates with Grok; and
- prints a readable apply preview showing what is new, what will be updated, what already exists, and what will be skipped.

It does **not** change canonical lesson files, regenerate the site, build, or deploy.

Use `yarn courses:weekly --json` when you want the machine-readable version of the same report.

## 2. Review the staged candidates

Open the candidate directory and report printed by the prepare command. Review:

- every staged `notes.md`;
- every staged `notes-summary.md`;
- each `notes-summary.meta.json` generation record;
- lessons reported as unmatched or renamed;
- lessons skipped because of `NOPUBLISH`; and
- any Grok failures or protected manual summaries.

Do not apply the update until the staged notes and summaries are acceptable.

## 3. Apply and regenerate

After reviewing the candidates, run:

```bash
yarn courses:weekly --apply
```

This command:

- validates that staged notes have not changed since the report was created;
- validates each summary against the SHA-256 hash of its source notes;
- applies the reviewed notes and summaries to the canonical lesson folders;
- regenerates manifests, Markdown, resources, maps, playlist matches, and search data;
- archives `NOPUBLISH` lessons outside the published frontend content; and
- runs the required offline course audit.

It still does **not** deploy the website.

To apply a specific report instead of the latest one:

```bash
yarn courses:weekly --apply --report /path/to/canonical-note-backup-report.json
```

## 4. Review the generated repository changes

Inspect the working tree:

```bash
git status --short
git diff
```

Pay particular attention to:

- lesson manifests and Markdown under `apps/courses/content/`;
- archived lessons under `apps/courses/content/unpublished/`;
- copied assets under `apps/courses/public/resources/`;
- generated maps under `apps/courses/public/maps/`;
- `apps/courses/public/search/notes-index.json.gz`; and
- the audit totals and findings.

Missing optional content is reported as a warning. Broken declared files, invalid routes, and publication leaks are errors.

## 5. Validate before deployment

Run:

```bash
yarn test:courses
yarn courses:audit
yarn build:courses
```

Optional stricter or remote checks:

```bash
yarn courses:audit --strict
yarn courses:audit --online
```

- `--strict` makes content-gap warnings fail the audit.
- `--online` checks YouTube, ESV, and Markdown HTTP links. Remote failures are reported separately because they can be transient.

## 6. Deploy when ready

The weekly command never deploys. Use the repository's normal deployment command only after reviewing and validating all changes:

```bash
yarn deploy
```

## NOPUBLISH rules

A lesson is excluded from the website when either condition is true:

1. Any file anywhere in the canonical lesson folder has `NOPUBLISH` in its filename, case-insensitively.
2. The lesson's `notes.md` contains `NOPUBLISH`, case-insensitively.

During regeneration, unpublished lesson manifests and Markdown are stored under `apps/courses/content/unpublished/`. They remain available to commit to GitHub but are excluded from:

- published section manifests;
- book, section, and direct navigation;
- lesson routes;
- adjacent/latest lesson selection;
- copied public resources and maps;
- notes search data; and
- the production application bundle.

Remove every filename and notes-content marker, then run the apply/regenerate workflow again to republish the lesson.

## AI summary commands

The normal weekly prepare phase summarizes only new or changed staged notes.

To create candidates for all canonical notes that do not yet have a notes summary:

```bash
yarn courses:notes:summarize --all-missing
```

Other useful options:

```bash
yarn courses:notes:summarize --dry-run
yarn courses:notes:summarize --model MODEL_ID
yarn courses:notes:summarize --timeout 180
yarn courses:notes:summarize --force
```

- `--dry-run` reports work without authenticating, writing candidates, or using Grok.
- `--force` may replace a manually authored summary, so use it carefully.
- Canonical summaries without generation metadata are treated as manual and are protected by default.
- Unchanged generated summaries are skipped using their source hash, prompt version, and model metadata.
- `NOPUBLISH` notes are never sent to Grok by the normal workflow.

The workflow uses the official authenticated Grok CLI. Run `grok login` or set `XAI_API_KEY` if authentication is missing. Automated Grok or API usage is not guaranteed to be free and may count against a paid plan or metered API usage.

### Hand-editing AI summaries

You can hand-edit generated summaries in either the staged candidates before apply or the canonical lesson folder after apply.

If you edit a staged `notes-summary.md` candidate before running `yarn courses:weekly --apply`, the edited candidate is what will be copied into the canonical lesson folder. Keep the adjacent `notes-summary.meta.json` file unless you want to make the canonical summary fully manual after apply.

After apply, each canonical generated summary normally has two files:

- `notes-summary.md`
- `notes-summary.meta.json`

Keep `notes-summary.meta.json` when you want the summary to remain AI-managed. The workflow will leave it alone while the source notes, prompt hash, prompt version, and model metadata still match. If the notes or prompt change later, the workflow may generate a replacement candidate for review.

Delete `notes-summary.meta.json` when you want the hand-edited `notes-summary.md` to become manually protected. A canonical summary without generation metadata is reported as a manual summary and is skipped by default. It will only be replaced if you intentionally run summary generation with `--force`.

To skip AI during an urgent weekly refresh:

```bash
yarn courses:weekly --skip-ai
yarn courses:weekly --apply --skip-ai
```

In apply mode, `--skip-ai` applies reviewed notes without applying staged AI summaries, preserving existing canonical summaries.

## Lesson names and metadata

Manual lesson title, description, status, and tags survive regeneration while the canonical lesson folder path remains unchanged.

Renaming a canonical source lesson folder changes its lookup key and generated slug. Existing metadata does not automatically follow the renamed folder. The prepare report lists unmatched or renamed candidates so the metadata can be moved deliberately rather than silently attached to the wrong lesson.

## Lower-level troubleshooting commands

The individual commands remain available when diagnosing one part of the workflow:

```bash
yarn courses:notes:snapshot
yarn courses:notes:backups:prepare
yarn courses:notes:summarize
yarn courses:notes:backups:apply
yarn courses:update
yarn courses:audit
```

Use `--help` with any command to see its supported options.
