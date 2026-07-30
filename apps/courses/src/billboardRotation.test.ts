import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLBOARD_ROTATION_MS,
  createBillboardRotationController,
} from "./billboardRotation";

afterEach(() => {
  vi.useRealTimers();
});

describe("billboard rotation controller", () => {
  it("advances every ten seconds and continues wrapping", () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const controller = createBillboardRotationController({
      slideCount: 2,
      onAdvance,
    });

    controller.start();
    expect(controller.isRunning()).toBe(true);
    vi.advanceTimersByTime(BILLBOARD_ROTATION_MS * 2);
    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it("resets the countdown after manual navigation", () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const controller = createBillboardRotationController({
      slideCount: 2,
      onAdvance,
    });

    controller.start();
    vi.advanceTimersByTime(BILLBOARD_ROTATION_MS - 1_000);
    controller.reset();
    vi.advanceTimersByTime(1_001);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BILLBOARD_ROTATION_MS - 1_001);
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("waits for every hover, focus, visibility, user, and motion pause to clear", () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const controller = createBillboardRotationController({
      slideCount: 2,
      onAdvance,
    });

    controller.start();
    for (const reason of [
      "hover",
      "focus",
      "hidden",
      "user",
      "reduced-motion",
    ]) {
      controller.setPaused(reason, true);
    }
    expect(controller.isRunning()).toBe(false);
    vi.advanceTimersByTime(BILLBOARD_ROTATION_MS * 2);
    expect(onAdvance).not.toHaveBeenCalled();

    for (const reason of ["hover", "focus", "hidden", "user"]) {
      controller.setPaused(reason, false);
    }
    expect(controller.isRunning()).toBe(false);

    controller.setPaused("reduced-motion", false);
    expect(controller.isRunning()).toBe(true);
    vi.advanceTimersByTime(BILLBOARD_ROTATION_MS);
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("does not schedule rotation for one slide and stops cleanly", () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const oneSlide = createBillboardRotationController({
      slideCount: 1,
      onAdvance,
    });
    oneSlide.start();
    expect(oneSlide.isRunning()).toBe(false);

    const twoSlides = createBillboardRotationController({
      slideCount: 2,
      onAdvance,
    });
    twoSlides.start();
    expect(twoSlides.isRunning()).toBe(true);
    twoSlides.stop();
    expect(twoSlides.isRunning()).toBe(false);
    vi.runAllTimers();
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
