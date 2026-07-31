import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import { courseLibrary } from "./courseData";
import { useProgress } from "./ProgressProvider";
import { createEmptyProgress, getProgressStats } from "./progress";
import {
  createProgressWorkbookBuffer,
  MAX_PROGRESS_FILE_BYTES,
  parseProgressWorkbook,
  type ImportedProgressWorkbook,
  type ProgressWorkbookLesson,
} from "./progressWorkbook";

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function getWorkbookLessons(): ProgressWorkbookLesson[] {
  return courseLibrary.trackableLessons.map((lesson) => ({
    id: lesson.id,
    bookName: lesson.bookName,
    sectionTitle:
      courseLibrary.getSection(lesson.sectionSlug)?.title ||
      lesson.sectionSlug,
    title: lesson.title,
    canonicalPath: lesson.canonicalPath,
  }));
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice().buffer], {
    type: XLSX_MIME_TYPE,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ProgressMenu() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importPreview, setImportPreview] =
    useState<ImportedProgressWorkbook | null>(null);
  const { progress, replaceProgress } = useProgress();
  const workbookLessons = useMemo(getWorkbookLessons, []);
  const validLessonIds = useMemo(
    () => new Set(workbookLessons.map((lesson) => lesson.id)),
    [workbookLessons]
  );
  const stats = getProgressStats(
    courseLibrary.trackableLessons,
    progress.completedLessons
  );
  const lastViewedLesson = progress.lastViewed
    ? courseLibrary.getLessonById(progress.lastViewed.lessonId)
    : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  function closeModal() {
    setIsOpen(false);
  }

  function handleDialogClose() {
    setIsOpen(false);
    setIsDragging(false);
    setImportPreview(null);
    setError("");
    triggerRef.current?.focus();
  }

  async function handleDownload() {
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const now = new Date();
      const bytes = await createProgressWorkbookBuffer(
        progress,
        workbookLessons,
        now.toISOString()
      );
      downloadBytes(
        bytes,
        `know-your-bible-progress-${now.toISOString().slice(0, 10)}.xlsx`
      );
      setMessage("Progress workbook exported.");
    } catch {
      setError("Unable to create the progress workbook.");
    } finally {
      setIsBusy(false);
    }
  }

  async function prepareImport(file: File | null) {
    if (!file) {
      return;
    }

    setError("");
    setMessage("");
    setImportPreview(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose an .xlsx progress workbook.");
      return;
    }
    if (file.size > MAX_PROGRESS_FILE_BYTES) {
      setError("Progress workbook must be 2 MB or smaller.");
      return;
    }

    setIsBusy(true);
    try {
      const imported = await parseProgressWorkbook(
        await file.arrayBuffer(),
        validLessonIds
      );
      setImportPreview(imported);
      setMessage(
        "Workbook validated. Review the summary before replacing this browser's progress."
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to read the progress workbook."
      );
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void prepareImport(event.dataTransfer.files[0] || null);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function applyImport() {
    if (!importPreview) {
      return;
    }
    replaceProgress(importPreview.progress);
    setImportPreview(null);
    setError("");
    setMessage("Progress restored from the workbook.");
  }

  function clearProgress() {
    const confirmed = window.confirm(
      "Clear your last viewed lesson and all completed lessons from this device? This cannot be undone unless you have an exported backup."
    );
    if (!confirmed) {
      return;
    }

    replaceProgress(createEmptyProgress());
    setImportPreview(null);
    setError("");
    setMessage("Progress cleared from this device.");
  }

  const previewStats = importPreview
    ? getProgressStats(
        courseLibrary.trackableLessons,
        importPreview.progress.completedLessons
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        className="progress-menu-trigger"
        type="button"
        aria-label="Open progress and backup"
        aria-haspopup="dialog"
        onClick={() => {
          setMessage("");
          setError("");
          setIsOpen(true);
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21c.7-4.2 3.2-6.4 7.5-6.4s6.8 2.2 7.5 6.4" />
        </svg>
        {stats.completed > 0 ? (
          <span className="progress-menu-badge">{stats.completed}</span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        className="progress-dialog"
        aria-labelledby="progress-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeModal();
        }}
        onClose={handleDialogClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeModal();
          }
        }}
      >
        <div className="progress-dialog-card">
          <header className="progress-dialog-header">
            <div>
              <p className="eyebrow">Your course</p>
              <h2 id="progress-dialog-title">Progress and backup</h2>
            </div>
            <button
              className="progress-dialog-close"
              type="button"
              aria-label="Close progress"
              onClick={closeModal}
            >
              ×
            </button>
          </header>

          <div className="progress-dialog-summary">
            <strong>
              {stats.completed} of {stats.total} lessons complete
            </strong>
            {lastViewedLesson ? (
              <p>
                Last viewed:{" "}
                <Link to={lastViewedLesson.canonicalPath} onClick={closeModal}>
                  {lastViewedLesson.title}
                </Link>
              </p>
            ) : (
              <p>Your last viewed lesson will appear here.</p>
            )}
          </div>
          <p className="progress-privacy">
            <strong>Your progress stays on this device.</strong> It is stored
            and processed only in your browser, never sent to a server, and
            never used to track you. Exporting creates a file that you control.
          </p>

          <section className="progress-dialog-section">
            <h3>Export progress</h3>
            <p>
              Export the last viewed lesson and completed lessons to an Excel
              workbook.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={isBusy}
              onClick={() => void handleDownload()}
            >
              Export Excel backup
            </button>
          </section>

          <section className="progress-dialog-section">
            <h3>Import previous progress</h3>
            <p>
              Importing a validated backup replaces the progress saved in this
              browser.
            </p>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              id="progress-workbook-upload"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) =>
                void prepareImport(event.target.files?.[0] || null)
              }
            />
            <div
              className={`progress-dropzone${
                isDragging ? " progress-dropzone-active" : ""
              }`}
              role="button"
              tabIndex={0}
              aria-label="Choose or drop an Excel progress workbook"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={handleDropzoneKeyDown}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setIsDragging(false);
                }
              }}
              onDrop={handleDrop}
            >
              <strong>Choose an Excel workbook</strong>
              <span>or drop an .xlsx file here</span>
            </div>

            {importPreview && previewStats ? (
              <div className="progress-import-preview">
                <strong>Ready to restore</strong>
                <span>
                  {previewStats.completed} completed{" "}
                  {previewStats.completed === 1 ? "lesson" : "lessons"}
                </span>
                <span>
                  Last viewed:{" "}
                  {importPreview.progress.lastViewed
                    ? courseLibrary.getLessonById(
                        importPreview.progress.lastViewed.lessonId
                      )?.title || "Unknown lesson"
                    : "None"}
                </span>
                {importPreview.ignoredLessonIds.length > 0 ? (
                  <span>
                    {importPreview.ignoredLessonIds.length} unavailable{" "}
                    {importPreview.ignoredLessonIds.length === 1
                      ? "lesson was"
                      : "lessons were"}{" "}
                    ignored
                  </span>
                ) : null}
                <div className="button-row">
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={applyImport}
                  >
                    Replace saved progress
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setImportPreview(null);
                      setMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          <section className="progress-dialog-section">
            <h3>Clear saved progress</h3>
            <p>
              Remove your last viewed lesson and all completed lessons from
              this browser. Export a backup first if you may want to restore
              them later.
            </p>
            <button
              className="button button-danger"
              type="button"
              disabled={isBusy}
              onClick={clearProgress}
            >
              Clear Progress
            </button>
          </section>

          <p
            className={
              error
                ? "progress-status progress-status-error"
                : "progress-status"
            }
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {error || message}
          </p>
        </div>
      </dialog>
    </>
  );
}
