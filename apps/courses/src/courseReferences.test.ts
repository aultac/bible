import { describe, expect, it } from "vitest";
import { courseReferences } from "./courseReferences";

describe("course references", () => {
  it("preserves the requested commentator order and attributions", () => {
    expect(courseReferences).toEqual([
      {
        name: "Dr. Bill Creasy",
        attribution: "Logos Bible Study",
        url: "https://logosbiblestudy.com",
      },
      {
        name: "Dennis Prager",
        attribution:
          "The Rational Bible, his five-volume written commentary on the Torah",
      },
      {
        name: "David Guzik",
        attribution: "Enduring Word",
        url: "https://enduringword.com",
      },
      {
        name: "J. Vernon McGee",
        attribution: "Thru the Bible",
        url: "https://www.ttb.org/",
      },
      {
        name: "Skip Heitzig",
        attribution: "Calvary Church",
        url: "https://calvarynm.church/",
      },
      {
        name: "Mike Winger",
        attribution: "BibleThinker",
        url: "https://biblethinker.org/",
      },
      {
        name: "OpenBible.info",
        attribution: "Google earth files for every place mentioned in the Bible.",
        url: "https://www.openbible.info/",
      },
    ]);
  });
});
