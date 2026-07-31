import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createEmptyProgress,
  normalizeProgress,
  parseStoredProgress,
  PROGRESS_STORAGE_KEY,
  recordLessonViewed,
  serializeProgress,
  setLessonCompleted,
  type CourseProgress,
} from "./progress";

interface ProgressContextValue {
  progress: CourseProgress;
  completedLessonIds: ReadonlySet<string>;
  recordViewed: (lessonId: string) => void;
  setCompleted: (lessonId: string, completed: boolean) => void;
  replaceProgress: (progress: CourseProgress) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

function loadProgress() {
  if (typeof window === "undefined") {
    return createEmptyProgress();
  }

  try {
    return parseStoredProgress(window.localStorage.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return createEmptyProgress();
  }
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<CourseProgress>(loadProgress);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PROGRESS_STORAGE_KEY,
        serializeProgress(progress)
      );
    } catch {
      // Progress remains available for this tab when storage is unavailable.
    }
  }, [progress]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PROGRESS_STORAGE_KEY) {
        setProgress(parseStoredProgress(event.newValue));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const recordViewed = useCallback((lessonId: string) => {
    setProgress((current) => recordLessonViewed(current, lessonId));
  }, []);

  const setCompleted = useCallback(
    (lessonId: string, completed: boolean) => {
      setProgress((current) =>
        setLessonCompleted(current, lessonId, completed)
      );
    },
    []
  );

  const replaceProgress = useCallback((nextProgress: CourseProgress) => {
    setProgress(normalizeProgress(nextProgress));
  }, []);

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress,
      completedLessonIds: new Set(Object.keys(progress.completedLessons)),
      recordViewed,
      setCompleted,
      replaceProgress,
    }),
    [progress, recordViewed, replaceProgress, setCompleted]
  );

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const value = useContext(ProgressContext);
  if (!value) {
    throw new Error("useProgress must be used within ProgressProvider.");
  }
  return value;
}
