export const PROGRESS_STORAGE_KEY = "know-your-bible:progress:v1";
export const PROGRESS_SCHEMA_VERSION = 1;

export interface LastViewedLesson {
  lessonId: string;
  viewedAt: string;
}

export interface CourseProgress {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  lastViewed: LastViewedLesson | null;
  completedLessons: Record<string, string>;
  updatedAt: string | null;
}

export interface ProgressStats {
  completed: number;
  total: number;
  percent: number;
  allComplete: boolean;
}

export function getRemainingLessonBadgeCount(
  stats: Pick<ProgressStats, "completed" | "total">
) {
  return stats.completed > 0 ? stats.total - stats.completed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLessonId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const lessonId = value.trim();
  return lessonId && lessonId.length <= 256 ? lessonId : null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createEmptyProgress(): CourseProgress {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    lastViewed: null,
    completedLessons: {},
    updatedAt: null,
  };
}

export function normalizeProgress(value: unknown): CourseProgress {
  if (
    !isRecord(value) ||
    value.schemaVersion !== PROGRESS_SCHEMA_VERSION
  ) {
    return createEmptyProgress();
  }

  const completedLessons: Record<string, string> = {};
  if (isRecord(value.completedLessons)) {
    for (const [rawLessonId, rawCompletedAt] of Object.entries(
      value.completedLessons
    )) {
      const lessonId = normalizeLessonId(rawLessonId);
      const completedAt = normalizeTimestamp(rawCompletedAt);
      if (lessonId && completedAt) {
        completedLessons[lessonId] = completedAt;
      }
    }
  }

  let lastViewed: LastViewedLesson | null = null;
  if (isRecord(value.lastViewed)) {
    const lessonId = normalizeLessonId(value.lastViewed.lessonId);
    const viewedAt = normalizeTimestamp(value.lastViewed.viewedAt);
    if (lessonId && viewedAt) {
      lastViewed = { lessonId, viewedAt };
    }
  }

  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    lastViewed,
    completedLessons,
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
}

export function parseStoredProgress(value: string | null): CourseProgress {
  if (!value) {
    return createEmptyProgress();
  }

  try {
    return normalizeProgress(JSON.parse(value) as unknown);
  } catch {
    return createEmptyProgress();
  }
}

export function serializeProgress(progress: CourseProgress) {
  return JSON.stringify(normalizeProgress(progress));
}

export function hasMeaningfulProgress(progress: CourseProgress) {
  return (
    Boolean(progress.lastViewed) ||
    Object.keys(progress.completedLessons).length > 0
  );
}

export function recordLessonViewed(
  progress: CourseProgress,
  lessonId: string,
  viewedAt = new Date().toISOString()
): CourseProgress {
  const normalizedLessonId = normalizeLessonId(lessonId);
  const normalizedViewedAt = normalizeTimestamp(viewedAt);
  if (!normalizedLessonId || !normalizedViewedAt) {
    return progress;
  }

  return {
    ...progress,
    lastViewed: {
      lessonId: normalizedLessonId,
      viewedAt: normalizedViewedAt,
    },
    updatedAt: normalizedViewedAt,
  };
}

export function setLessonCompleted(
  progress: CourseProgress,
  lessonId: string,
  completed: boolean,
  completedAt = new Date().toISOString()
): CourseProgress {
  const normalizedLessonId = normalizeLessonId(lessonId);
  if (!normalizedLessonId) {
    return progress;
  }

  const nextCompletedLessons = { ...progress.completedLessons };
  let updatedAt = normalizeTimestamp(completedAt);

  if (completed) {
    if (!updatedAt) {
      return progress;
    }
    nextCompletedLessons[normalizedLessonId] = updatedAt;
  } else {
    if (!(normalizedLessonId in nextCompletedLessons)) {
      return progress;
    }
    delete nextCompletedLessons[normalizedLessonId];
    updatedAt ||= new Date().toISOString();
  }

  return {
    ...progress,
    completedLessons: nextCompletedLessons,
    updatedAt,
  };
}

export function getProgressStats(
  lessons: ReadonlyArray<{ id: string }>,
  completedLessons: Readonly<Record<string, string>>
): ProgressStats {
  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  const completed = Object.keys(completedLessons).filter((lessonId) =>
    lessonIds.has(lessonId)
  ).length;
  const total = lessonIds.size;

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    allComplete: total > 0 && completed === total,
  };
}
