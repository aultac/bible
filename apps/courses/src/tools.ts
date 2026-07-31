import packageJson from "../../../package.json";
import { toolsData } from "./toolsData";

export interface ToolCatalogEntry {
  path: string;
  title: string;
  relatedLessonIds: readonly string[];
}

const TOOL_LINK_MARKER = "TOOL_LINK:";
const RESOURCE_LINK_MARKER = "RESOURCE_LINK:";

export const toolCatalog = toolsData as readonly ToolCatalogEntry[];
export const productionHomepage = packageJson.homepage.replace(/\/+$/u, "");

function normalizeToolPath(value: string) {
  const path = `/${value.split("/").filter(Boolean).join("/")}`;
  return /\.[^/]+$/u.test(path) ? path : `${path}/`;
}

function getDirectiveToolPath(line: string) {
  const markerIndex = line.indexOf(TOOL_LINK_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const remainder = line
    .slice(markerIndex + TOOL_LINK_MARKER.length)
    .trim()
    .replace(/^[*_]{1,3}\s*/u, "");
  const token = remainder
    .match(/^\S+/u)?.[0]
    ?.replace(/[*_]{1,3}$/u, "")
    .trim();

  return token?.startsWith("/") ? normalizeToolPath(token) : null;
}

function formatLessonNotesTitle(line: string) {
  const titleMatch = line.match(/^#\s+(\d+)_([^\s].*)$/u);
  if (!titleMatch) {
    return line;
  }

  const weekNumber = Number.parseInt(titleMatch[1], 10);
  const passage = titleMatch[2]
    .replace(/_/gu, ":")
    .replace(/([A-Za-z])(\d)/gu, "$1 $2");
  return `# Week ${weekNumber} - ${passage}`;
}

export function getToolsForLesson(
  lessonId: string,
  catalog: readonly ToolCatalogEntry[] = toolCatalog
) {
  return catalog.filter((tool) => tool.relatedLessonIds.includes(lessonId));
}

export function sortToolsByEarliestWeek<TTool extends ToolCatalogEntry>(
  catalog: readonly TTool[],
  getWeekNumber: (lessonId: string) => number | null | undefined
) {
  return catalog
    .map((tool, sourceIndex) => {
      const weekNumbers = tool.relatedLessonIds
        .map(getWeekNumber)
        .filter(
          (weekNumber): weekNumber is number =>
            typeof weekNumber === "number" && Number.isFinite(weekNumber)
        );
      return {
        tool,
        sourceIndex,
        earliestWeek:
          weekNumbers.length > 0 ? Math.min(...weekNumbers) : Infinity,
      };
    })
    .sort(
      (left, right) =>
        left.earliestWeek - right.earliestWeek ||
        left.sourceIndex - right.sourceIndex
    )
    .map(({ tool }) => tool);
}

export function transformLessonNotes(
  markdown: string,
  catalog: readonly ToolCatalogEntry[] = toolCatalog,
  homepage = productionHomepage
) {
  const toolByPath = new Map(catalog.map((tool) => [tool.path, tool]));

  return markdown
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line, index) =>
      index === 0 ? formatLessonNotesTitle(line) : line
    )
    .flatMap((line) => {
      if (line.includes(RESOURCE_LINK_MARKER)) {
        return [];
      }
      if (!line.includes(TOOL_LINK_MARKER)) {
        return [line];
      }

      const toolPath = getDirectiveToolPath(line);
      const tool = toolPath ? toolByPath.get(toolPath) : null;
      if (!tool) {
        return [];
      }
      const url = new URL(tool.path, `${homepage}/`).href;
      return [`${tool.title}: [${url}](${url})`];
    })
    .join("\n")
    .trim();
}
