import { describe, expect, it, vi } from "vitest";
import { scrollToPageTop } from "./routerBase";

describe("route scroll restoration", () => {
  it("resets pathname navigation to the top without smooth scrolling", () => {
    const scrollTo = vi.fn();

    scrollToPageTop(scrollTo);

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });
});
