export const BILLBOARD_ROTATION_MS = 10_000;

export interface BillboardRotationController {
  start(): void;
  stop(): void;
  reset(): void;
  setPaused(reason: string, paused: boolean): void;
  isRunning(): boolean;
}

export function createBillboardRotationController({
  slideCount,
  onAdvance,
  intervalMs = BILLBOARD_ROTATION_MS,
}: {
  slideCount: number;
  onAdvance: () => void;
  intervalMs?: number;
}): BillboardRotationController {
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pauseReasons = new Set<string>();

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    clearTimer();
    if (!started || slideCount < 2 || pauseReasons.size > 0) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      onAdvance();
      schedule();
    }, intervalMs);
  }

  return {
    start() {
      started = true;
      schedule();
    },
    stop() {
      started = false;
      clearTimer();
    },
    reset() {
      schedule();
    },
    setPaused(reason, paused) {
      if (paused) {
        pauseReasons.add(reason);
      } else {
        pauseReasons.delete(reason);
      }
      schedule();
    },
    isRunning() {
      return timer !== null;
    },
  };
}
