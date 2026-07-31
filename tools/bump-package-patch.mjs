import { bumpPackagePatch } from "./courses/weekly-release.mjs";

const { previousVersion, version } = await bumpPackagePatch();
console.log(
  `Prepared the next deployment version: ${previousVersion} -> ${version}.`
);
