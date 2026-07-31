import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefsPage } from "./App";

describe("course references page", () => {
  it("renders the introduction and one ordered card per commentator", () => {
    const html = renderToStaticMarkup(RefsPage());
    const names = [
      "Dr. Bill Creasy",
      "Dennis Prager",
      "David Guzik",
      "J. Vernon McGee",
      "Skip Heitzig",
      "Mike Winger",
      "OpenBible.info",
    ];

    expect(html).toContain("deeply helpful in forming this course");
    expect(html.match(/class="reference-card"/gu)).toHaveLength(7);
    for (let index = 0; index < names.length - 1; index += 1) {
      expect(html.indexOf(names[index])).toBeLessThan(
        html.indexOf(names[index + 1])
      );
    }
    expect(html).toContain('href="https://logosbiblestudy.com"');
    expect(html).toContain('href="https://enduringword.com"');
    expect(html).toContain('href="https://www.ttb.org/"');
    expect(html).toContain('href="https://calvarynm.church/"');
    expect(html).toContain('href="https://biblethinker.org/"');
    expect(html).toContain('href="https://www.openbible.info/"');
    expect(html).toContain(
      "Google earth files for every place mentioned in the Bible."
    );
  });
});
