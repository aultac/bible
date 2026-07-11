import sectionsIndexData from "../content/sections.json";

export interface PassageRecord {
  display: string;
  startVerse: string | null;
  endVerse: string | null;
  spansMultipleBooks: boolean;
  esvUrl: string;
}

export interface SectionIndexEntry {
  id: string;
  slug: string;
  sectionnum: number;
  title: string;
  info: string;
  startYear: number | null;
  endYear: number | null;
  status: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  lessonCount: number;
  sectionPath: string;
  sectionSummaryPath: string | null;
}

export interface SectionsIndexManifest {
  schemaVersion: number;
  generatedAt: string;
  sectionCount: number;
  sections: SectionIndexEntry[];
}

export interface SectionLessonEntry {
  id: string;
  slug: string;
  sequenceNumber: number;
  title: string;
  lessonKind: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  lessonPath: string;
  notesAvailable: boolean;
  summaryAvailable: boolean;
  resourceCount: number;
}

export interface SectionManifest extends SectionIndexEntry {
  lessons: SectionLessonEntry[];
  sectionSummary: {
    path: string | null;
    sourcePath: string | null;
    sourceFormat: string | null;
    available: boolean;
    error: string | null;
  };
  source: {
    relativeSectionDirectory: string;
    folderName: string;
    sectionSummaryDocxPath: string | null;
  };
}

export interface LessonResource {
  name: string;
  sourcePath: string;
  path: string;
  publicUrl: string;
}
export interface LessonMap {
  sourcePath: string;
  sourceFormat: string;
  sourcePublicUrl: string;
  geoJsonPath: string;
  geoJsonPublicUrl: string;
  available: boolean;
  featureCount: number;
  geometryTypes: string[];
}

export interface ResolvedLessonMap extends LessonMap {
  sourceHref: string;
  geoJsonHref: string;
}

export interface LessonVideo {
  videoId: string;
  title: string;
  url: string;
  playlistId: string;
  position: number | null;
  weekNumber: number | null;
  durationText: string | null;
  thumbnailUrl: string | null;
}

export interface LessonManifest {
  schemaVersion: number;
  generatedAt: string;
  id: string;
  slug: string;
  sectionId: string;
  sectionSlug: string;
  sequenceNumber: number;
  lessonKind: string;
  title: string;
  description: string;
  status: string;
  startVerse: string | null;
  endVerse: string | null;
  passage: PassageRecord | null;
  notes: {
    path: string | null;
    sourcePath: string | null;
    available: boolean;
  };
  summary: {
    path: string | null;
    sourcePath: string | null;
    sourceFormat: string | null;
    available: boolean;
    error: string | null;
  };
  map: LessonMap | null;
  resources: LessonResource[];
  youtube: LessonVideo | null;
  tags: string[];
  topicTags: string[];
  peopleTags: string[];
  placeTags: string[];
  source: {
    relativeLessonDirectory: string;
    folderName: string;
    notesPath: string | null;
    summaryDocxPath: string | null;
    resourcesDirectory: string | null;
    mapPath: string | null;
  };
}

export interface HydratedLesson extends LessonManifest {
  resolvedResources: Array<LessonResource & { href: string }>;
  resolvedMap: ResolvedLessonMap | null;
}

export interface HydratedSection extends SectionManifest {
  lessonsDetailed: HydratedLesson[];
  latestLesson: HydratedLesson | null;
}

function normalizeContentPath(modulePath: string) {
  return modulePath.replace(/^.*?content\//u, "content/").replace(/\\/gu, "/");
}

function resolvePublicHref(publicUrl: string) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  if (publicUrl.startsWith("/courses/")) {
    return `${normalizedBaseUrl}${publicUrl.slice("/courses/".length)}`;
  }

  if (publicUrl.startsWith("/")) {
    return publicUrl;
  }

  return `${normalizedBaseUrl}${publicUrl}`;
}

const sectionManifestModules = import.meta.glob(
  "../content/sections/*/section.json",
  {
    eager: true,
    import: "default",
  }
) as Record<string, SectionManifest>;

const lessonManifestModules = import.meta.glob(
  "../content/sections/*/lessons/*/lesson.json",
  {
    eager: true,
    import: "default",
  }
) as Record<string, LessonManifest>;

const markdownModules = import.meta.glob(
  "../content/sections/**/*.md",
  {
    import: "default",
    query: "?raw",
  }
) as Record<string, () => Promise<string>>;

const markdownLoaderByPath = new Map<string, () => Promise<string>>(
  Object.entries(markdownModules).map(([modulePath, loader]) => [
    normalizeContentPath(modulePath),
    loader,
  ])
);
const markdownLoadCache = new Map<string, Promise<string | null>>();

const sectionManifestBySlug = new Map<string, SectionManifest>(
  Object.values(sectionManifestModules).map((sectionManifest) => [
    sectionManifest.slug,
    sectionManifest,
  ])
);

const lessonManifestByKey = new Map<string, LessonManifest>(
  Object.values(lessonManifestModules).map((lessonManifest) => [
    `${lessonManifest.sectionSlug}:${lessonManifest.slug}`,
    lessonManifest,
  ])
);

function getMarkdown(contentPath: string | null | undefined) {
  if (!contentPath) {
    return null;
  }
  const normalizedContentPath = normalizeContentPath(contentPath);
  const loader = markdownLoaderByPath.get(normalizedContentPath);
  if (!loader) {
    return null;
  }

  if (!markdownLoadCache.has(normalizedContentPath)) {
    markdownLoadCache.set(
      normalizedContentPath,
      loader()
        .then((markdown) => markdown)
        .catch(() => null)
    );
  }

  return markdownLoadCache.get(normalizedContentPath) || null;
}

function hydrateLesson(lessonManifest: LessonManifest): HydratedLesson {
  return {
    ...lessonManifest,
    resolvedResources: lessonManifest.resources.map((resource) => ({
      ...resource,
      href: resolvePublicHref(resource.publicUrl),
    })),
    resolvedMap: lessonManifest.map
      ? {
          ...lessonManifest.map,
          sourceHref: resolvePublicHref(lessonManifest.map.sourcePublicUrl),
          geoJsonHref: resolvePublicHref(lessonManifest.map.geoJsonPublicUrl),
        }
      : null,
  };
}

const sectionsIndex = sectionsIndexData as SectionsIndexManifest;

const sections = sectionsIndex.sections
  .map((sectionEntry) => {
    const sectionManifest = sectionManifestBySlug.get(sectionEntry.slug);

    if (!sectionManifest) {
      return null;
    }

    const lessonsDetailed = sectionManifest.lessons
      .map((lessonEntry) =>
        lessonManifestByKey.get(`${sectionManifest.slug}:${lessonEntry.slug}`)
      )
      .filter((lessonManifest): lessonManifest is LessonManifest => Boolean(lessonManifest))
      .map(hydrateLesson);

    const latestLesson =
      lessonsDetailed.find((lesson) => lesson.status === "current") ||
      lessonsDetailed.at(-1) ||
      null;

    return {
      ...sectionManifest,
      lessonsDetailed,
      latestLesson,
    } satisfies HydratedSection;
  })
  .filter((section): section is HydratedSection => Boolean(section));

const sectionBySlug = new Map<string, HydratedSection>(
  sections.map((section) => [section.slug, section])
);

const allLessons = sections.flatMap((section) => section.lessonsDetailed);

const lessonByKey = new Map<string, HydratedLesson>(
  allLessons.map((lesson) => [`${lesson.sectionSlug}:${lesson.slug}`, lesson])
);

const currentSection =
  sections.find((section) => section.status === "current") || sections.at(-1) || null;

const latestLesson =
  currentSection?.lessonsDetailed.find((lesson) => lesson.status === "current") ||
  currentSection?.lessonsDetailed.at(-1) ||
  allLessons.at(-1) ||
  null;

const startHereLesson = sections.at(0)?.lessonsDetailed.at(0) || null;

export const courseLibrary = {
  generatedAt: sectionsIndex.generatedAt,
  sections,
  allLessons,
  currentSection,
  latestLesson,
  startHereLesson,
  getSection(sectionSlug: string) {
    return sectionBySlug.get(sectionSlug) || null;
  },
  getLesson(sectionSlug: string, lessonSlug: string) {
    return lessonByKey.get(`${sectionSlug}:${lessonSlug}`) || null;
  },
  getAdjacentLessons(sectionSlug: string, lessonSlug: string) {
    const lessonKey = `${sectionSlug}:${lessonSlug}`;
    const lessonIndex = allLessons.findIndex(
      (lesson) => `${lesson.sectionSlug}:${lesson.slug}` === lessonKey
    );

    if (lessonIndex === -1) {
      return {
        previous: null,
        next: null,
      };
    }

    return {
      previous: allLessons[lessonIndex - 1] || null,
      next: allLessons[lessonIndex + 1] || null,
    };
  },
};

export async function loadMarkdownContent(contentPath: string | null | undefined) {
  return getMarkdown(contentPath);
}
