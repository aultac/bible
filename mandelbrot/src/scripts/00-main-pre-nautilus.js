        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

        (function() {
            const ESCAPE_RADIUS = 2;
            const ESCAPE_RADIUS_SQUARED = ESCAPE_RADIUS * ESCAPE_RADIUS;
            const DEFAULT_VIEW_HALF_WIDTH = 2.1;
            const MIN_PLOT_VIEW_HALF_WIDTH = 0.000005;
            const MAX_PLOT_VIEW_HALF_WIDTH = 3.5;
            const BASE_PLOT_VIEW_SIGNATURE_STEP = 0.0001;
            const PLOT_VIEW_SIGNATURE_PIXEL_FRACTION = 0.25;
            const DENSITY_COLUMNS_BY_LEVEL = [32, 64, 128, 256, 512, 576, 640, 704, 768, 832];
            const MAX_DENSITY_LEVEL = DENSITY_COLUMNS_BY_LEVEL.length;
            const AUTO_PLOT_DENSIFY_DEBOUNCE_MS = 200;
            const DISPLAY_CAP = 16;
            const REAL_POINT_COUNT = 12;
            const COMPLEX_PREVIEW_POINT_COUNT = 10;
            const COMPLEX_PREVIEW_ESCAPE_RADIUS = 3;
            const COMPLEX_PLANE_HALF_SPAN = 4;
            const COMPLEX_PLANE_WORLD_SPAN = COMPLEX_PLANE_HALF_SPAN;
            const COMPLEX_STORY_HALF_SPAN = 4;
            const COMPLEX_STORY_STEP_TOTAL = 5;
            const COMPLEX_PLANE_EDGE_MARGIN = 0.02;
            const MAX_TREE_GENERATION = 7;
            const EMPTY_FLOAT32 = new Float32Array(0);
            const DEFAULT_MANDELBROT_COLOR_SCHEME_KEY = 'blue';
            const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
            const GOLDEN_ANGLE_DEGREES = 360 / (GOLDEN_RATIO * GOLDEN_RATIO);
            const GOLDEN_ANGLE_RADIANS = GOLDEN_ANGLE_DEGREES * (Math.PI / 180);
            const NAUTILUS_FIBONACCI_SEQUENCE = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
            const NAUTILUS_SQUARE_TOTAL = NAUTILUS_FIBONACCI_SEQUENCE.length;
            const SUNFLOWER_PARASTICHY_COUNTS = [34, 55];
            const SUNFLOWER_MAX_SEEDS = 377;
            const MANDELBROT_COLOR_SCHEMES = {
                blue: {
                    label: 'Blue',
                    interiorRgb: [17, 24, 39],
                    representativeEscapeRgb: [59, 130, 246],
                    escapedPalette: {
                        type: 'stops',
                        stops: [
                            { at: 0, rgb: [244, 249, 255] },
                            { at: 1, rgb: [59, 130, 246] }
                        ]
                    }
                },
                annie: {
                    label: 'Annie',
                    interiorRgb: [255, 57, 162],
                    representativeEscapeRgb: [178, 2, 205],
                    escapedPalette: {
                        type: 'stops',
                        stops: [
                            { at: 0, rgb: [178, 2, 205] },
                            { at: 1, rgb: [0, 0, 0] }
                        ]
                    }
                },
                sunset: {
                    label: 'Sunset',
                    interiorRgb: [24, 18, 52],
                    representativeEscapeRgb: [242, 116, 84],
                    escapedPalette: {
                        type: 'stops',
                        stops: [
                            { at: 0, rgb: [255, 244, 214] },
                            { at: 0.22, rgb: [255, 191, 105] },
                            { at: 0.48, rgb: [242, 116, 84] },
                            { at: 0.72, rgb: [181, 69, 142] },
                            { at: 1, rgb: [34, 26, 86] }
                        ]
                    }
                },
                fire: {
                    label: 'Fire',
                    interiorRgb: [18, 4, 4],
                    representativeEscapeRgb: [255, 140, 44],
                    escapedPalette: {
                        type: 'stops',
                        stops: [
                            { at: 0, rgb: [255, 247, 236] },
                            { at: 0.18, rgb: [255, 210, 115] },
                            { at: 0.42, rgb: [255, 140, 44] },
                            { at: 0.72, rgb: [200, 36, 23] },
                            { at: 1, rgb: [0, 0, 0] }
                        ]
                    }
                },
                viridis: {
                    label: 'Viridis',
                    interiorRgb: [16, 22, 39],
                    representativeEscapeRgb: [33, 145, 140],
                    escapedPalette: {
                        type: 'stops',
                        stops: [
                            { at: 0, rgb: [253, 231, 37] },
                            { at: 0.25, rgb: [94, 201, 98] },
                            { at: 0.5, rgb: [33, 145, 140] },
                            { at: 0.75, rgb: [59, 82, 139] },
                            { at: 1, rgb: [68, 1, 84] }
                        ]
                    }
                },
                'hsv-cycle': {
                    label: 'HSV Cycle',
                    interiorRgb: [0, 0, 0],
                    representativeEscapeRgb: [92, 90, 255],
                    escapedPalette: {
                        type: 'hsv-cycle',
                        cycles: 4.8,
                        hueOffset: 250,
                        saturation: 0.82,
                        minValue: 0.22,
                        maxValue: 1
                    }
                }
            };
            const SUNFLOWER_STEP_DESCRIPTORS = [
                {
                    title: 'Split the circle into golden arcs',
                    copy: 'If the long arc a and the short arc b satisfy a : b = φ : 1, then the smaller sweep is the golden angle used in phyllotaxis.',
                    metrics: ['a : b = φ : 1', 'a ≈ 222.5°', 'b ≈ 137.5°']
                },
                {
                    title: 'The short arc sweeps 137.5°',
                    copy: 'Rotating by the short arc b skips the crowded directions and keeps each new seed from landing directly behind an older one.',
                    metrics: ['b = 360° / φ²', 'golden angle ≈ 137.5°', 'even spacing']
                },
                {
                    title: 'Seeds appear one golden angle at a time',
                    copy: 'Each new seed advances by 137.5° and moves a little farther from the center. That simple rule builds the phyllotaxis disk.',
                    metrics: ['θₙ = n · 137.5°', 'rₙ ∝ √n', 'seeds fill the disk']
                },
                {
                    title: 'Counter-spirals reveal Fibonacci counts',
                    copy: 'When the seeds are connected by neighboring lanes, two opposite families of spirals emerge, often in consecutive Fibonacci numbers like 34 and 55.',
                    metrics: ['34 clockwise arms', '55 counter arms', 'Fibonacci parastichies']
                },
                {
                    title: 'A sunflower head grows over the pattern',
                    copy: 'Placing a sunflower image behind the computed seed pattern shows how the same golden-angle placement matches the natural seed head.',
                    metrics: ['sunflower overlay', 'seed disk aligned', '34 / 55 spiral families']
                }
            ];
            const NAUTILUS_STEP_TOTAL = NAUTILUS_SQUARE_TOTAL + 1;
            const SUNFLOWER_STEP_TOTAL = SUNFLOWER_STEP_DESCRIPTORS.length;

            const realInput = document.getElementById('real-c-input');
            const realSummary = document.getElementById('real-summary');
            const realBody = document.getElementById('real-sequence-body');
            const realCanvas = document.getElementById('real-sequence-canvas');
            const complexStoryPrevButton = document.getElementById('complex-story-prev');
            const complexStoryNextButton = document.getElementById('complex-story-next');
            const complexStoryResetButton = document.getElementById('complex-story-reset');
            const complexStoryStepCount = document.getElementById('complex-story-step-count');
            const complexStoryTitle = document.getElementById('complex-story-title');
            const complexStoryShell = document.getElementById('complex-story-shell');
            const complexStoryCanvas = document.getElementById('complex-story-canvas');
            const complexStoryOverlay = document.getElementById('complex-story-overlay');
            const complexStoryActions = document.getElementById('complex-story-actions');
            const complexStoryRotateButton = document.getElementById('complex-story-rotate');
            const complexStoryRotateEquation = document.getElementById('complex-story-rotate-equation');
            const complexStoryFootnote = document.getElementById('complex-story-footnote');

            const complexRealInput = document.getElementById('complex-real-input');
            const complexImagInput = document.getElementById('complex-imag-input');
            const complexBody = document.getElementById('complex-sequence-body');
            const complexPlaneStage = document.getElementById('complex-plane-stage');
            const complexCPill = document.getElementById('complex-c-pill');
            const complexGrowthCanvas = document.getElementById('complex-growth-canvas');

            const plotIterationsInput = document.getElementById('plot-iterations-input');
            const plotColorSchemeSelect = document.getElementById('plot-color-scheme-select');
            const plotStatus = document.getElementById('plot-status');
            const plotCenterPill = document.getElementById('plot-center-pill');
            const plotScalePill = document.getElementById('plot-scale-pill');
            const plotDensityPill = document.getElementById('plot-density-pill');
            const plotHoverTrackToggle = document.getElementById('plot-hover-track-toggle');
            const plotDensifyButton = document.getElementById('plot-densify');
            const plotAutoDensifyToggle = document.getElementById('plot-auto-densify-toggle');
            const plotMeshToggle = document.getElementById('plot-mesh-toggle');
            const plotResetButton = document.getElementById('plot-reset');
            const plotResetViewButton = document.getElementById('plot-reset-view');
            const plotFullscreenButton = document.getElementById('plot-fullscreen-toggle');
            const plotFrame = document.getElementById('plot-frame');
            const plotFullscreenTarget = plotFrame ? plotFrame.closest('.plot-card') : null;
            const glCanvas = document.getElementById('mandelbrot-gl');
            const overlayCanvas = document.getElementById('mandelbrot-overlay');

            const cardioidCanvas = document.getElementById('cardioid-canvas');
            const cardioidPlayButton = document.getElementById('cardioid-play');
            const cardioidResetButton = document.getElementById('cardioid-reset');

            const treeStage = document.getElementById('tree-stage');
            const treeSummary = document.getElementById('tree-summary');
            const treeGrowButton = document.getElementById('tree-grow');
            const treeResetButton = document.getElementById('tree-reset');
            const treeRandomizeButton = document.getElementById('tree-randomize');
            const treeOrbitButton = document.getElementById('tree-orbit-toggle');
            const treeTrunkHeightInput = document.getElementById('tree-trunk-height');
            const treeBranchAngleInput = document.getElementById('tree-branch-angle');
            const treeAngleRandomInput = document.getElementById('tree-angle-random');
            const treeLengthShrinkInput = document.getElementById('tree-length-shrink');
            const treeBranchCountInput = document.getElementById('tree-branch-count');
            const treeLeafSizeInput = document.getElementById('tree-leaf-size');
            const exampleTabButtons = Array.from(document.querySelectorAll('[data-example-tab-button]'));
            const exampleTabPanels = Array.from(document.querySelectorAll('[data-example-tab-panel]'));
            const treePanel = document.getElementById('example-panel-tree');
            const kochPanel = document.getElementById('example-panel-snowflake');
            const barnsleyPanel = document.getElementById('example-panel-fern');
            const nautilusPanel = document.getElementById('example-panel-nautilus');
            const sunflowerPanel = document.getElementById('example-panel-sunflower');
            const exampleSection = treePanel ? treePanel.closest('.presentation-section') : null;
            const complexStorySection = complexStoryCanvas ? complexStoryCanvas.closest('.presentation-section') : null;
            const complexSection = complexPlaneStage ? complexPlaneStage.closest('.presentation-section') : null;
            const plotSection = plotFrame ? plotFrame.closest('.presentation-section') : null;
            const cardioidSection = cardioidCanvas ? cardioidCanvas.closest('.presentation-section') : null;

            const kochSnowflakeStage = document.getElementById('koch-snowflake-stage');
            const kochSnowflakePrevButton = document.getElementById('koch-snowflake-prev');
            const kochSnowflakePlayButton = document.getElementById('koch-snowflake-play');
            const kochSnowflakeNextButton = document.getElementById('koch-snowflake-next');
            const kochSnowflakeResetButton = document.getElementById('koch-snowflake-reset');
            const barnsleyFernStage = document.getElementById('barnsley-fern-stage');
            const barnsleyFernPrevButton = document.getElementById('barnsley-fern-prev');
            const barnsleyFernPlayButton = document.getElementById('barnsley-fern-play');
            const barnsleyFernNextButton = document.getElementById('barnsley-fern-next');
            const barnsleyFernResetButton = document.getElementById('barnsley-fern-reset');
            const nautilusStage = document.getElementById('nautilus-stage');
            const nautilusLiveControls = document.getElementById('nautilus-live-controls');
            const nautilusPrevButton = document.getElementById('nautilus-prev');
            const nautilusPlayButton = document.getElementById('nautilus-play');
            const nautilusNextButton = document.getElementById('nautilus-next');
            const nautilusResetButton = document.getElementById('nautilus-reset');
            const nautilusStageCount = document.getElementById('nautilus-stage-count');
            const nautilusStepTitle = document.getElementById('nautilus-step-title');
            const nautilusStepCopy = document.getElementById('nautilus-step-copy');
            const nautilusStepMetrics = document.getElementById('nautilus-step-metrics');
            const nautilusShellModelStage = document.getElementById('nautilus-shell-model-stage');
            const nautilusHandModelStage = document.getElementById('nautilus-hand-model-stage');
            const nautilusFaceModelStage = document.getElementById('nautilus-face-model-stage');
            const sunflowerStage = document.getElementById('sunflower-stage');
            const sunflowerCanvas = document.getElementById('sunflower-canvas');
            const sunflowerPrevButton = document.getElementById('sunflower-prev');
            const sunflowerPlayButton = document.getElementById('sunflower-play');
            const sunflowerNextButton = document.getElementById('sunflower-next');
            const sunflowerResetButton = document.getElementById('sunflower-reset');
            const sunflowerStepTitle = document.getElementById('sunflower-step-title');
            const sunflowerStepCopy = document.getElementById('sunflower-step-copy');
            const sunflowerStepMetrics = document.getElementById('sunflower-step-metrics');

            const gl = glCanvas ? glCanvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false }) : null;
            const overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
            const complexStoryCtx = complexStoryCanvas ? complexStoryCanvas.getContext('2d') : null;

            let lastRealResult = null;
            let lastComplexResult = null;
            const storyMathTargets = new Set();
            const complexStoryState = {
                stepIndex: 0,
                linePoints: [],
                planePoints: [],
                axisReveal: 0,
                hoverPoint: null,
                pinnedPoint: null,
                distancePoint: null,
                rotationDemoMode: 'start',
                rotationDemoProgress: 0,
                rotationLabelsSimplified: false,
                rotateEquationOverride: '',
                drawScheduled: false,
                overlayLabels: Object.create(null),
                mathQueued: false,
                animationFrameId: null,
                activeAnimation: null
            };

            function clamp(value, min, max) {
                return Math.min(max, Math.max(min, value));
            }

            function safeNumber(value, fallback) {
                const number = Number(value);
                return Number.isFinite(number) ? number : fallback;
            }

            function lerp(start, end, t) {
                return start + (end - start) * t;
            }

            function mixRgb(start, end, t) {
                return [
                    Math.round(lerp(start[0], end[0], t)),
                    Math.round(lerp(start[1], end[1], t)),
                    Math.round(lerp(start[2], end[2], t))
                ];
            }

            function rgbToCss(rgb, alpha) {
                if (typeof alpha === 'number') {
                    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + alpha.toFixed(3) + ')';
                }
                return 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
            }

            function rgbToFloatRgb(rgb) {
                return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
            }

            function getMandelbrotColorScheme(colorSchemeKey) {
                if (colorSchemeKey && MANDELBROT_COLOR_SCHEMES[colorSchemeKey]) {
                    return MANDELBROT_COLOR_SCHEMES[colorSchemeKey];
                }
                return MANDELBROT_COLOR_SCHEMES[DEFAULT_MANDELBROT_COLOR_SCHEME_KEY];
            }

            function sampleRgbStops(stops, t) {
                const clampedT = clamp(t, 0, 1);
                if (!stops || !stops.length) {
                    return [0, 0, 0];
                }
                if (clampedT <= stops[0].at) {
                    return stops[0].rgb.slice();
                }
                for (let index = 1; index < stops.length; index += 1) {
                    const previous = stops[index - 1];
                    const next = stops[index];
                    if (clampedT <= next.at) {
                        const span = next.at - previous.at;
                        const localT = span <= 0 ? 0 : (clampedT - previous.at) / span;
                        return mixRgb(previous.rgb, next.rgb, localT);
                    }
                }
                return stops[stops.length - 1].rgb.slice();
            }

            function hsvToRgb(hue, saturation, value) {
                const normalizedHue = ((hue % 360) + 360) % 360;
                const chroma = value * saturation;
                const huePrime = normalizedHue / 60;
                const x = chroma * (1 - Math.abs(huePrime % 2 - 1));
                let red = 0;
                let green = 0;
                let blue = 0;

                if (huePrime < 1) {
                    red = chroma;
                    green = x;
                } else if (huePrime < 2) {
                    red = x;
                    green = chroma;
                } else if (huePrime < 3) {
                    green = chroma;
                    blue = x;
                } else if (huePrime < 4) {
                    green = x;
                    blue = chroma;
                } else if (huePrime < 5) {
                    red = x;
                    blue = chroma;
                } else {
                    red = chroma;
                    blue = x;
                }

                const match = value - chroma;
                return [
                    Math.round((red + match) * 255),
                    Math.round((green + match) * 255),
                    Math.round((blue + match) * 255)
                ];
            }

            function sampleEscapePaletteRgb(colorScheme, smoothEscape, maxIterations, escapeMix) {
                const palette = colorScheme && colorScheme.escapedPalette ? colorScheme.escapedPalette : null;
                if (!palette) {
                    return [0, 0, 0];
                }
                if (palette.type === 'hsv-cycle') {
                    const normalized = clamp((smoothEscape == null ? 0 : smoothEscape / Math.max(1, maxIterations)), 0, 1);
                    const hue = (palette.hueOffset || 0) + Math.pow(normalized, 0.82) * palette.cycles * 360;
                    const value = lerp(
                        palette.minValue == null ? 0.25 : palette.minValue,
                        palette.maxValue == null ? 1 : palette.maxValue,
                        Math.pow(normalized, 0.6)
                    );
                    return hsvToRgb(hue, palette.saturation == null ? 0.82 : palette.saturation, value);
                }
                return sampleRgbStops(palette.stops, escapeMix);
            }

            function disposeThreeMaterial(material) {
                if (!material) {
                    return;
                }
                if (Array.isArray(material)) {
                    material.forEach(disposeThreeMaterial);
                    return;
                }
                material.dispose();
            }

            function disposeThreeGraph(root) {
                if (!root || typeof root.traverse !== 'function') {
                    return;
                }
                const geometries = new Set();
                const materials = new Set();
                root.traverse(function(object) {
                    if (object.geometry && typeof object.geometry.dispose === 'function') {
                        geometries.add(object.geometry);
                    }
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(function(material) {
                                materials.add(material);
                            });
                        } else {
                            materials.add(object.material);
                        }
                    }
                });
                geometries.forEach(function(geometry) {
                    geometry.dispose();
                });
                materials.forEach(function(material) {
                    disposeThreeMaterial(material);
                });
            }

            function removeDomNode(node) {
                if (node && node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            }

            function isSectionOpen(section) {
                return !!(section && section.open);
            }

            function isExampleTabActive(tabName) {
                if (!isSectionOpen(exampleSection)) {
                    return false;
                }
                const panel = tabName === 'tree'
                    ? treePanel
                    : tabName === 'snowflake'
                        ? kochPanel
                        : tabName === 'fern'
                            ? barnsleyPanel
                            : tabName === 'nautilus'
                                ? nautilusPanel
                                : tabName === 'sunflower'
                                    ? sunflowerPanel
                            : null;
                return !!(panel && !panel.hidden);
            }

            function isComplexStorySectionActive() {
                return isSectionOpen(complexStorySection);
            }

            function isComplexSectionActive() {
                return isSectionOpen(complexSection);
            }

            function isCardioidSectionActive() {
                return isSectionOpen(cardioidSection);
            }

            function isPlotSectionActive() {
                return isSectionOpen(plotSection);
            }

            function queueMathTypeset(elements) {
                if (!window.MathJax || typeof window.MathJax.typesetPromise !== 'function') {
                    return;
                }
                elements.forEach(function(element) {
                    if (element) {
                        storyMathTargets.add(element);
                    }
                });
                if (complexStoryState.mathQueued || !storyMathTargets.size) {
                    return;
                }
                complexStoryState.mathQueued = true;
                requestAnimationFrame(function() {
                    complexStoryState.mathQueued = false;
                    if (!storyMathTargets.size) {
                        return;
                    }
                    const targets = Array.from(storyMathTargets);
                    storyMathTargets.clear();
                    window.MathJax.typesetPromise(targets).catch(function() {});
                });
            }

            function getSmoothEscapeIteration(escapedAt, magnitude, escapeRadius) {
                const limit = escapeRadius == null ? ESCAPE_RADIUS : escapeRadius;
                if (!Number.isFinite(magnitude) || magnitude <= limit) {
                    return escapedAt;
                }
                return escapedAt + 1 - Math.log(Math.log(magnitude)) / Math.LN2;
            }

            function getEscapeMix(smoothEscape, maxIterations) {
                return clamp(1 - smoothEscape / Math.max(1, maxIterations), 0, 1);
            }

            function buildMandelbrotAppearance(stayedSmall, smoothEscape, maxIterations, paletteMode, colorSchemeKey) {
                const colorScheme = getMandelbrotColorScheme(colorSchemeKey);
                if (stayedSmall) {
                    return {
                        className: 'black',
                        mix: 0,
                        rgb: colorScheme.interiorRgb,
                        css: rgbToCss(colorScheme.interiorRgb),
                        backgroundCss: rgbToCss(colorScheme.interiorRgb, 0.12),
                        borderCss: rgbToCss(colorScheme.interiorRgb, 0.28)
                    };
                }
                const mix = getEscapeMix(smoothEscape, maxIterations);
                if (paletteMode === 'gradient') {
                    const rgb = sampleEscapePaletteRgb(colorScheme, smoothEscape, maxIterations, mix);
                    return {
                        className: 'red',
                        mix: mix,
                        rgb: rgb,
                        css: rgbToCss(rgb),
                        backgroundCss: rgbToCss(rgb, 0.12),
                        borderCss: rgbToCss(rgb, 0.28)
                    };
                }
                return {
                    className: 'red',
                    mix: mix,
                    rgb: colorScheme.representativeEscapeRgb,
                    css: rgbToCss(colorScheme.representativeEscapeRgb),
                    backgroundCss: rgbToCss(colorScheme.representativeEscapeRgb, 0.12),
                    borderCss: rgbToCss(colorScheme.representativeEscapeRgb, 0.28)
                };
            }

            function buildEscapeClassification(stayedSmall, escapedAt, escapedMagnitude, maxIterations, paletteMode, escapeRadius, colorSchemeKey) {
                const limit = escapeRadius == null ? ESCAPE_RADIUS : escapeRadius;
                const smoothEscape = stayedSmall || escapedAt == null
                    ? null
                    : getSmoothEscapeIteration(escapedAt, escapedMagnitude, limit);
                const appearance = buildMandelbrotAppearance(stayedSmall, smoothEscape, maxIterations, paletteMode, colorSchemeKey);
                return {
                    stayedSmall: stayedSmall,
                    escapedAt: escapedAt,
                    escapeRadius: limit,
                    smoothEscape: smoothEscape,
                    escapeMix: appearance.mix,
                    pointColorRgb: appearance.rgb,
                    pointColorCss: appearance.css,
                    pointBackgroundCss: appearance.backgroundCss,
                    pointBorderCss: appearance.borderCss,
                    pointClassName: appearance.className
                };
            }

            function clearPlotMeshData() {
                plotState.meshPositions = null;
                plotState.meshColors = null;
                plotState.meshStrips = [];
                plotState.meshVertexCount = 0;
                plotState.meshSignature = '';
                plotState.meshPendingUpload = false;
            }

            function invalidatePlotGridData() {
                plotState.densityLevel = 0;
                plotState.densifySignature = '';
                plotState.lastGridSamples = null;
                setPlotGridData(EMPTY_FLOAT32, EMPTY_FLOAT32);
                clearPlotMeshData();
            }

            function markPlotGridDataStale() {
                plotState.densityLevel = 0;
                plotState.densifySignature = '';
            }

            function setPlotGridData(positions, colors) {
                plotState.points = positions || EMPTY_FLOAT32;
                plotState.colors = colors || EMPTY_FLOAT32;
                plotState.pendingUpload = true;
            }

            function cancelPlotDensify(statusText) {
                const wasInProgress = plotState.densifyInProgress;
                plotState.activeDensifyJobId += 1;
                if (plotState.densifyFrameId != null) {
                    cancelAnimationFrame(plotState.densifyFrameId);
                    plotState.densifyFrameId = null;
                }
                plotState.densifyInProgress = false;
                if (wasInProgress) {
                    updateDensifyButtonLabel();
                    if (statusText) {
                        setStatusPill(plotStatus, true, statusText);
                    }
                }
            }

            function hasCurrentPlotGridForView() {
                return plotState.densityLevel > 0 && densifySignature() === plotState.densifySignature;
            }

            function getPlotTargetDensityLevel() {
                return clamp(plotState.targetDensityLevel || 1, 1, MAX_DENSITY_LEVEL);
            }

            function hasReachedPlotTargetDensityForView() {
                return hasCurrentPlotGridForView() && plotState.densityLevel >= getPlotTargetDensityLevel();
            }

            function cancelPlotAutoDensify() {
                if (plotState.autoDensifyTimeoutId == null) {
                    return;
                }
                clearTimeout(plotState.autoDensifyTimeoutId);
                plotState.autoDensifyTimeoutId = null;
            }

            function schedulePlotAutoDensify(delayMs) {
                if (!plotState.autoDensifyEnabled || !plotState.supported || !isPlotSectionActive() || hasReachedPlotTargetDensityForView()) {
                    return;
                }
                cancelPlotAutoDensify();
                const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : AUTO_PLOT_DENSIFY_DEBOUNCE_MS;
                plotState.autoDensifyTimeoutId = window.setTimeout(function() {
                    plotState.autoDensifyTimeoutId = null;
                    if (!plotState.autoDensifyEnabled || !plotState.supported || !isPlotSectionActive() || plotState.drag || hasReachedPlotTargetDensityForView()) {
                        return;
                    }
                    densifyCurrentView({ mode: 'auto' });
                }, delay);
            }
            function getPlotPointColorFloats(real, imag, maxIterations, colorSchemeKey) {
                const colorScheme = getMandelbrotColorScheme(colorSchemeKey);
                const xMinusQuarter = real - 0.25;
                const q = xMinusQuarter * xMinusQuarter + imag * imag;
                if (q * (q + xMinusQuarter) <= 0.25 * imag * imag || (real + 1) * (real + 1) + imag * imag <= 0.0625) {
                    return rgbToFloatRgb(colorScheme.interiorRgb);
                }

                let zr = 0;
                let zi = 0;
                for (let step = 1; step <= maxIterations; step += 1) {
                    const nextReal = zr * zr - zi * zi + real;
                    const nextImag = 2 * zr * zi + imag;
                    zr = nextReal;
                    zi = nextImag;
                    const magnitudeSquared = zr * zr + zi * zi;
                    if (magnitudeSquared > ESCAPE_RADIUS_SQUARED) {
                        const smoothEscape = getSmoothEscapeIteration(step, Math.sqrt(magnitudeSquared));
                        const mix = getEscapeMix(smoothEscape, maxIterations);
                        return rgbToFloatRgb(sampleEscapePaletteRgb(colorScheme, smoothEscape, maxIterations, mix));
                    }
                }
                return rgbToFloatRgb(colorScheme.interiorRgb);
            }

            function classifyAndAddPlotPoint(real, imag, maxIterations, colorSchemeKey) {
                return getPlotPointColorFloats(real, imag, maxIterations, colorSchemeKey);
            }

            function getStatusPillMarkup(label, classification) {
                const styleAttribute = classification && !classification.stayedSmall
                    ? ' style="color: ' + classification.pointColorCss + '; border-color: ' + classification.pointBorderCss + '; background: ' + classification.pointBackgroundCss + ';"'
                    : '';
                return '<span class="status-pill ' + (classification.stayedSmall ? 'black' : 'red') + '"' + styleAttribute + '><span class="status-dot"></span><span>' + label + '</span></span>';
            }

            function getEscapeTextStyleAttribute(classification) {
                return classification && !classification.stayedSmall
                    ? ' style="color: ' + classification.pointColorCss + ';"'
                    : '';
            }

            function activateExampleTab(tabName, shouldRedraw) {
                let foundActiveTab = false;
                exampleTabButtons.forEach(function(button) {
                    const isActive = button.dataset.exampleTabButton === tabName;
                    button.classList.toggle('is-active', isActive);
                    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
                    button.tabIndex = isActive ? 0 : -1;
                    if (isActive) {
                        foundActiveTab = true;
                    }
                });

                exampleTabPanels.forEach(function(panel) {
                    panel.hidden = panel.dataset.exampleTabPanel !== tabName;
                });

                if (!foundActiveTab) {
                    return;
                }
                syncSectionLifecycles();
                if (shouldRedraw !== false) {
                    requestAnimationFrame(redrawAllCanvases);
                }
            }

            function setupExampleTabs() {
                if (!exampleTabButtons.length || !exampleTabPanels.length) {
                    return;
                }

                const initialButton = exampleTabButtons.find(function(button) {
                    return button.classList.contains('is-active');
                }) || exampleTabButtons[0];

                activateExampleTab(initialButton.dataset.exampleTabButton, false);

                exampleTabButtons.forEach(function(button, index) {
                    button.addEventListener('click', function() {
                        activateExampleTab(button.dataset.exampleTabButton);
                    });

                    button.addEventListener('keydown', function(event) {
                        const key = event.key;
                        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
                            return;
                        }
                        event.preventDefault();

                        let nextIndex = index;
                        if (key === 'Home') {
                            nextIndex = 0;
                        } else if (key === 'End') {
                            nextIndex = exampleTabButtons.length - 1;
                        } else if (key === 'ArrowDown' || key === 'ArrowRight') {
                            nextIndex = (index + 1) % exampleTabButtons.length;
                        } else {
                            nextIndex = (index - 1 + exampleTabButtons.length) % exampleTabButtons.length;
                        }

                        const nextButton = exampleTabButtons[nextIndex];
                        activateExampleTab(nextButton.dataset.exampleTabButton);
                        nextButton.focus();
                    });
                });
            }

            function formatNumber(value) {
                if (!Number.isFinite(value)) {
                    return value > 0 ? '∞' : value < 0 ? '-∞' : 'NaN';
                }
                const abs = Math.abs(value);
                if (abs === 0) {
                    return '0';
                }
                if (abs >= 100000 || abs < 0.0001) {
                    return value.toExponential(3).replace('e+', 'e');
                }
                const fixed = abs >= 100 ? value.toFixed(2) : abs >= 10 ? value.toFixed(3) : value.toFixed(4);
                return fixed.replace(/\.?0+$/, '');
            }

            function formatComplex(real, imag) {
                const realText = formatNumber(real);
                const imagAbs = formatNumber(Math.abs(imag));
                const sign = imag >= 0 ? '+' : '-';
                return realText + ' ' + sign + ' ' + imagAbs + 'i';
            }

            function evaluateRealSequence(c, pointCount, paletteMode, escapeRadius, colorSchemeKey) {
                const limit = escapeRadius == null ? ESCAPE_RADIUS : escapeRadius;
                const entries = [];
                let current = 0;
                let escapedAt = null;
                for (let step = 0; step < pointCount; step += 1) {
                    if (step > 0) {
                        current = current * current + c;
                    }
                    const magnitude = Math.abs(current);
                    const escaped = magnitude > limit;
                    entries.push({ step: step, value: current, magnitude: magnitude, escaped: escaped });
                    if (escaped && escapedAt === null) {
                        escapedAt = step;
                    }
                }
                return Object.assign({
                    c: c,
                    escapeRadius: limit,
                    pointCount: pointCount,
                    entries: entries
                }, buildEscapeClassification(
                    escapedAt === null,
                    escapedAt,
                    escapedAt === null ? null : entries[escapedAt].magnitude,
                    pointCount,
                    paletteMode,
                    limit,
                    colorSchemeKey
                ));
            }

            function evaluateComplexSequence(cReal, cImag, pointCount, paletteMode, escapeRadius, colorSchemeKey) {
                const limit = escapeRadius == null ? ESCAPE_RADIUS : escapeRadius;
                const entries = [];
                let zr = 0;
                let zi = 0;
                let escapedAt = null;
                for (let step = 0; step < pointCount; step += 1) {
                    if (step > 0) {
                        const nextReal = zr * zr - zi * zi + cReal;
                        const nextImag = 2 * zr * zi + cImag;
                        zr = nextReal;
                        zi = nextImag;
                    }
                    const magnitude = !Number.isFinite(zr) || !Number.isFinite(zi) ? Number.POSITIVE_INFINITY : Math.hypot(zr, zi);
                    const escaped = magnitude > limit;
                    entries.push({
                        step: step,
                        real: zr,
                        imag: zi,
                        magnitude: magnitude,
                        escaped: escaped
                    });
                    if (escaped && escapedAt === null) {
                        escapedAt = step;
                    }
                }
                return Object.assign({
                    cReal: cReal,
                    cImag: cImag,
                    escapeRadius: limit,
                    pointCount: pointCount,
                    entries: entries
                }, buildEscapeClassification(
                    escapedAt === null,
                    escapedAt,
                    escapedAt === null ? null : entries[escapedAt].magnitude,
                    pointCount,
                    paletteMode,
                    limit,
                    colorSchemeKey
                ));
            }

            function classifyPoint(cReal, cImag, maxIterations, escapeRadius, colorSchemeKey) {
                const limit = escapeRadius == null ? ESCAPE_RADIUS : escapeRadius;
                const limitSquared = limit * limit;
                const xMinusQuarter = cReal - 0.25;
                const q = xMinusQuarter * xMinusQuarter + cImag * cImag;
                if (q * (q + xMinusQuarter) <= 0.25 * cImag * cImag) {
                    return buildEscapeClassification(true, null, null, maxIterations, undefined, limit, colorSchemeKey);
                }
                if ((cReal + 1) * (cReal + 1) + cImag * cImag <= 0.0625) {
                    return buildEscapeClassification(true, null, null, maxIterations, undefined, limit, colorSchemeKey);
                }
                let zr = 0;
                let zi = 0;
                for (let step = 1; step <= maxIterations; step += 1) {
                    const nextReal = zr * zr - zi * zi + cReal;
                    const nextImag = 2 * zr * zi + cImag;
                    zr = nextReal;
                    zi = nextImag;
                    if (zr * zr + zi * zi > limitSquared) {
                        return buildEscapeClassification(false, step, Math.hypot(zr, zi), maxIterations, undefined, limit, colorSchemeKey);
                    }
                }
                return buildEscapeClassification(true, null, null, maxIterations, undefined, limit, colorSchemeKey);
            }

            function setStatusPill(element, classificationOrStayedSmall, text) {
                if (!element) {
                    return;
                }
                const classification = classificationOrStayedSmall && typeof classificationOrStayedSmall === 'object'
                    ? classificationOrStayedSmall
                    : null;
                const stayedSmall = classification ? classification.stayedSmall : !!classificationOrStayedSmall;
                element.classList.remove('black', 'red');
                element.classList.add(stayedSmall ? 'black' : 'red');
                element.style.removeProperty('color');
                element.style.removeProperty('background');
                element.style.removeProperty('border-color');
                if (classification && !classification.stayedSmall) {
                    element.style.color = classification.pointColorCss;
                    element.style.background = classification.pointBackgroundCss;
                    element.style.borderColor = classification.pointBorderCss;
                }
                element.innerHTML = '<span class="status-dot"></span><span>' + text + '</span>';
            }

            function resizeCanvasToDisplaySize(canvas) {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const width = Math.max(1, Math.round(rect.width * dpr));
                const height = Math.max(1, Math.round(rect.height * dpr));
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
                return { width: width, height: height, dpr: dpr, cssWidth: rect.width, cssHeight: rect.height };
            }

            function clearCanvas(canvas) {
                if (!canvas) {
                    return;
                }
                const ctx = canvas.getContext('2d');
                const size = resizeCanvasToDisplaySize(canvas);
                ctx.clearRect(0, 0, size.width, size.height);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, size.width, size.height);
            }

            function getStatusDescriptor(entry, result) {
                const limitText = formatNumber(result && result.escapeRadius != null ? result.escapeRadius : ESCAPE_RADIUS);
                if (entry.escaped && result.escapedAt === entry.step) {
                    return {
                        className: 'escape',
                        label: 'First above ' + limitText,
                        styleAttribute: getEscapeTextStyleAttribute(result)
                    };
                }
                if (entry.escaped) {
                    return {
                        className: 'escape',
                        label: 'Above ' + limitText,
                        styleAttribute: getEscapeTextStyleAttribute(result)
                    };
                }
                return { className: 'bounded', label: 'Within ' + limitText, styleAttribute: '' };
            }

            function renderRealTable(result) {
                realBody.innerHTML = result.entries.map(function(entry) {
                    const status = getStatusDescriptor(entry, result);
                    return '<tr>' +
                        '<td>' + entry.step + '</td>' +
                        '<td>' + formatNumber(entry.value) + '</td>' +
                        '<td>' + formatNumber(entry.magnitude) + '</td>' +
                        '<td class="' + status.className + '"' + status.styleAttribute + '>' + status.label + '</td>' +
                        '</tr>';
                }).join('');
            }

            function renderComplexTable(body, result) {
                if (!body) {
                    return;
                }
                body.innerHTML = result.entries.map(function(entry) {
                    const status = getStatusDescriptor(entry, result);
                    return '<tr>' +
                        '<td>' + entry.step + '</td>' +
                        '<td>' + formatComplex(entry.real, entry.imag) + '</td>' +
                        '<td>' + formatNumber(entry.magnitude) + '</td>' +
                        '<td class="' + status.className + '"' + status.styleAttribute + '>' + status.label + '</td>' +
                        '</tr>';
                }).join('');
            }

            function computeDisplayRange(entries, valueAccessor, options) {
                const finiteValues = entries
                    .map(valueAccessor)
                    .filter(function(value) { return Number.isFinite(value); });

                if (!finiteValues.length) {
                    return options.symmetric ? { min: -1, max: 1 } : { min: 0, max: 1 };
                }

                if (options.symmetric) {
                    const maxAbs = finiteValues.reduce(function(maximum, value) {
                        return Math.max(maximum, Math.abs(value));
                    }, 0);
                    const displayAbs = Math.max(options.floorAbs || 1, Math.min(options.hardCapAbs || DISPLAY_CAP, maxAbs));
                    return { min: -displayAbs, max: displayAbs };
                }

                const maximum = finiteValues.reduce(function(maximumValue, value) {
                    return Math.max(maximumValue, value);
                }, Number.NEGATIVE_INFINITY);
                const minimum = options.minValue || 0;
                const displayMax = Math.max(minimum, Math.min(options.hardCap || DISPLAY_CAP, maximum));
                return { min: minimum, max: Math.max(displayMax, minimum + 1) };
            }

            function clampForDisplay(value, range) {
                if (!Number.isFinite(value)) {
                    return value > 0 ? range.max : range.min;
                }
                return Math.min(range.max, Math.max(range.min, value));
            }

            function drawScalarSequenceChart(canvas, entries, options) {
                if (!canvas || !entries || !entries.length) {
                    clearCanvas(canvas);
                    return;
                }
                const ctx = canvas.getContext('2d');
                const size = resizeCanvasToDisplaySize(canvas);
                const width = size.width;
                const height = size.height;
                const pad = 42 * size.dpr;
                const seriesColor = options.seriesColor || '#111827';
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);

                const range = computeDisplayRange(entries, options.valueAccessor, options);
                const xMax = Math.max(1, entries.length - 1);
                const xTickStep = Math.max(1, Math.ceil(xMax / 12));

                function mapX(step) {
                    return pad + (step / xMax) * (width - pad * 1.5);
                }

                function mapY(value) {
                    const displayValue = clampForDisplay(value, range);
                    return height - pad - ((displayValue - range.min) / Math.max(1e-9, range.max - range.min)) * (height - pad * 2);
                }

                ctx.strokeStyle = '#d3dceb';
                ctx.lineWidth = 1 * size.dpr;
                for (let tick = 0; tick <= xMax; tick += xTickStep) {
                    const x = mapX(tick);
                    ctx.beginPath();
                    ctx.moveTo(x, pad * 0.6);
                    ctx.lineTo(x, height - pad);
                    ctx.stroke();
                }

                (options.guideValues || []).forEach(function(guideValue) {
                    if (guideValue < range.min || guideValue > range.max) {
                        return;
                    }
                    const y = mapY(guideValue);
                    ctx.beginPath();
                    ctx.moveTo(pad, y);
                    ctx.lineTo(width - pad * 0.5, y);
                    ctx.strokeStyle = guideValue === 0 ? '#94a3b8' : '#dbeafe';
                    ctx.stroke();
                });

                for (let index = 1; index < entries.length; index += 1) {
                    const previous = entries[index - 1];
                    const current = entries[index];
                    ctx.strokeStyle = seriesColor;
                    ctx.lineWidth = 2.5 * size.dpr;
                    ctx.beginPath();
                    ctx.moveTo(mapX(previous.step), mapY(options.valueAccessor(previous)));
                    ctx.lineTo(mapX(current.step), mapY(options.valueAccessor(current)));
                    ctx.stroke();
                }

                entries.forEach(function(entry) {
                    ctx.fillStyle = seriesColor;
                    ctx.beginPath();
                    ctx.arc(mapX(entry.step), mapY(options.valueAccessor(entry)), 4.2 * size.dpr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
                    ctx.lineWidth = 1.2 * size.dpr;
                    ctx.stroke();
                });

                ctx.fillStyle = '#5f6b84';
                ctx.font = (12 * size.dpr) + 'px Arial';
                ctx.fillText(options.xLabel || 'point', width - pad * 0.85, height - pad * 0.35);
                ctx.save();
                ctx.translate(pad * 0.42, pad * 1.05);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(options.yLabel || 'value', 0, 0);
                ctx.restore();
            }

            function drawRealSequence(result) {
                if (!result) {
                    clearCanvas(realCanvas);
                    return;
                }
                drawScalarSequenceChart(realCanvas, result.entries, {
                    valueAccessor: function(entry) { return entry.value; },
                    yLabel: 'value',
                    xLabel: 'point',
                    symmetric: true,
                    floorAbs: ESCAPE_RADIUS,
                    hardCapAbs: DISPLAY_CAP,
                    guideValues: [-ESCAPE_RADIUS, 0, ESCAPE_RADIUS],
                    seriesColor: result.pointColorCss
                });
            }

            function drawComplexPlaneSequence(result) {
                if (result) {
                    complexPlaneState.displayedResult = result;
                }
                if (!complexPlaneStage || !complexPlaneState.renderer || !isComplexSectionActive()) {
                    return;
                }
                resizeComplexPlaneScene();
                updateComplexPlanePath(result);
                renderComplexPlaneScene();
            }

            function drawComplexGrowthChart(result) {
                if (!result) {
                    clearCanvas(complexGrowthCanvas);
                    return;
                }
                drawScalarSequenceChart(complexGrowthCanvas, result.entries, {
                    valueAccessor: function(entry) { return entry.magnitude; },
                    yLabel: 'distance',
                    xLabel: 'point',
                    minValue: 0,
                    hardCap: DISPLAY_CAP,
                    guideValues: [0, result.escapeRadius || ESCAPE_RADIUS],
                    seriesColor: result.pointColorCss
                });
            }


            function renderRealTool(startValue) {
                const start = safeNumber(startValue != null ? startValue : realInput.value, -1);
                const pointCount = REAL_POINT_COUNT;
                realInput.value = start;
                const result = evaluateRealSequence(start, pointCount);
                lastRealResult = result;
                renderRealTable(result);
                drawRealSequence(result);
                if (result.stayedSmall) {
                    realSummary.innerHTML = getStatusPillMarkup('Black example', result) + ' ' +
                        'Using <code>start = ' + formatNumber(start) + '</code>, all ' + pointCount +
                        ' shown points stayed within <code>|x| ≤ 2</code>.';
                } else {
                    realSummary.innerHTML = getStatusPillMarkup('Escaping example', result) + ' ' +
                        'Using <code>start = ' + formatNumber(start) + '</code>, the first point above 2 appeared at point ' +
                        result.escapedAt + ', and the full ' + pointCount + '-point sequence remains visible after that.';
                }
            }

            function renderComplexTool(realValue, imagValue, options) {
                options = options || {};
                const cReal = safeNumber(realValue != null ? realValue : complexRealInput.value, -1);
                const cImag = safeNumber(imagValue != null ? imagValue : complexImagInput.value, 0);
                const pointCount = COMPLEX_PREVIEW_POINT_COUNT;
                if (options.syncInputs !== false) {
                    complexRealInput.value = cReal;
                    complexImagInput.value = cImag;
                }
                const result = evaluateComplexSequence(cReal, cImag, pointCount, undefined, COMPLEX_PREVIEW_ESCAPE_RADIUS);
                complexPlaneState.displayedResult = result;
                complexPlaneState.isHovering = !!options.transient;
                if (!options.transient) {
                    lastComplexResult = result;
                    complexPlaneState.pinnedPoint = {
                        real: cReal,
                        imag: cImag
                    };
                }
                renderComplexTable(complexBody, result);
                drawComplexPlaneSequence(result);
                drawComplexGrowthChart(result);
                updateComplexCPill(cReal, cImag, !!options.transient);
                return result;
            }

            function normalizeNearZero(value) {
                return Math.abs(value) < 1e-9 ? 0 : value;
            }

            function formatComplexStoryPlain(real, imag) {
                return formatComplex(normalizeNearZero(real), normalizeNearZero(imag));
            }

            function formatComplexStoryMath(real, imag) {
                const normalizedReal = normalizeNearZero(real);
                const normalizedImag = normalizeNearZero(imag);
                return formatNumber(normalizedReal) + (normalizedImag >= 0 ? ' + ' : ' - ') + formatNumber(Math.abs(normalizedImag)) + 'i';
            }

            function formatComplexStoryOrderedPair(real, imag) {
                return '(' + formatNumber(normalizeNearZero(real)) + ', ' + formatNumber(normalizeNearZero(imag)) + ')';
            }

            function getComplexStoryDistanceFormula(real, imag) {
                const normalizedReal = normalizeNearZero(real);
                const normalizedImag = normalizeNearZero(imag);
                const distance = Math.hypot(normalizedReal, normalizedImag);
                return 'r = \\sqrt{(' + formatNumber(normalizedReal) + ')^2 + (' + formatNumber(normalizedImag) + ')^2} = ' + formatNumber(distance);
            }

            function inlineComplexStoryMath(tex) {
                return '&nbsp;\\(' + tex + '\\)&nbsp;';
            }

            function setStoryElementHtml(element, html, needsMath) {
                if (!element) {
                    return;
                }
                const nextHtml = html || '';
                if (element.__rawHtml === nextHtml) {
                    return;
                }
                element.innerHTML = nextHtml;
                element.__rawHtml = nextHtml;
                if (needsMath && nextHtml) {
                    queueMathTypeset([element]);
                }
            }

            function pulseStoryLabel(label) {
                if (!label) {
                    return;
                }
                label.classList.remove('is-changing');
                void label.offsetWidth;
                label.classList.add('is-changing');
            }

            function ensureComplexStoryLabel(id, options) {
                if (!complexStoryOverlay) {
                    return null;
                }
                let label = complexStoryState.overlayLabels[id];
                if (!label) {
                    label = document.createElement('div');
                    complexStoryOverlay.appendChild(label);
                    complexStoryState.overlayLabels[id] = label;
                }
                label.hidden = false;
                label.className = 'complex-story-label' + (options.className ? ' ' + options.className : '');
                let changed = false;
                if (options.html != null) {
                    if (label.__rawHtml !== options.html) {
                        label.innerHTML = options.html;
                        label.__rawHtml = options.html;
                        label.__rawText = null;
                        changed = true;
                        if (options.math) {
                            queueMathTypeset([label]);
                        }
                    }
                } else if (label.__rawText !== options.text) {
                    label.textContent = options.text || '';
                    label.__rawText = options.text || '';
                    label.__rawHtml = null;
                    changed = true;
                }
                if (changed && options.pulse) {
                    pulseStoryLabel(label);
                }
                const overlayWidth = Math.max(1, complexStoryOverlay.clientWidth);
                const overlayHeight = Math.max(1, complexStoryOverlay.clientHeight);
                const padding = 26;
                const finalX = clamp((options.x || 0) + (options.offsetX || 0), padding, overlayWidth - padding);
                const finalY = clamp((options.y || 0) + (options.offsetY || 0), padding, overlayHeight - padding);
                label.style.left = finalX + 'px';
                label.style.top = finalY + 'px';
                label.style.transform = options.transform || 'translate(-50%, -50%)';
                label.style.opacity = typeof options.opacity === 'number' ? String(options.opacity) : '';
                return label;
            }

            function hideUnusedComplexStoryLabels(activeIds) {
                Object.keys(complexStoryState.overlayLabels).forEach(function(id) {
                    complexStoryState.overlayLabels[id].hidden = !activeIds.has(id);
                });
            }

            function getComplexStoryMetrics() {
                if (!complexStoryCanvas || !complexStoryCtx) {
                    return null;
                }
                const size = resizeCanvasToDisplaySize(complexStoryCanvas);
                const aspect = size.cssWidth / Math.max(1, size.cssHeight);
                const halfWidth = aspect >= 1 ? COMPLEX_STORY_HALF_SPAN * aspect : COMPLEX_STORY_HALF_SPAN;
                const halfHeight = aspect >= 1 ? COMPLEX_STORY_HALF_SPAN : COMPLEX_STORY_HALF_SPAN / aspect;
                return {
                    size: size,
                    bounds: {
                        left: -halfWidth,
                        right: halfWidth,
                        top: halfHeight,
                        bottom: -halfHeight,
                        halfWidth: halfWidth,
                        halfHeight: halfHeight
                    }
                };
            }

            function complexStoryWorldToScreen(real, imag, metrics) {
                return {
                    x: ((real - metrics.bounds.left) / (metrics.bounds.right - metrics.bounds.left)) * metrics.size.width,
                    y: ((metrics.bounds.top - imag) / (metrics.bounds.top - metrics.bounds.bottom)) * metrics.size.height
                };
            }

            function complexStoryWorldToCss(real, imag, metrics) {
                return {
                    x: ((real - metrics.bounds.left) / (metrics.bounds.right - metrics.bounds.left)) * metrics.size.cssWidth,
                    y: ((metrics.bounds.top - imag) / (metrics.bounds.top - metrics.bounds.bottom)) * metrics.size.cssHeight
                };
            }

            function complexStoryScreenToWorld(clientX, clientY) {
                const metrics = getComplexStoryMetrics();
                if (!metrics) {
                    return { real: 0, imag: 0, metrics: null };
                }
                const rect = complexStoryCanvas.getBoundingClientRect();
                const x = clamp(clientX - rect.left, 0, rect.width);
                const y = clamp(clientY - rect.top, 0, rect.height);
                return {
                    real: metrics.bounds.left + (x / rect.width) * (metrics.bounds.right - metrics.bounds.left),
                    imag: metrics.bounds.top - (y / rect.height) * (metrics.bounds.top - metrics.bounds.bottom),
                    metrics: metrics
                };
            }

            function clampComplexStoryPoint(point, metrics) {
                const marginX = (metrics.bounds.right - metrics.bounds.left) * 0.03;
                const marginY = (metrics.bounds.top - metrics.bounds.bottom) * 0.03;
                return {
                    real: normalizeNearZero(clamp(point.real, metrics.bounds.left + marginX, metrics.bounds.right - marginX)),
                    imag: normalizeNearZero(clamp(point.imag, metrics.bounds.bottom + marginY, metrics.bounds.top - marginY))
                };
            }

            function isComplexStoryHit(testPoint, targetPoint, metrics, pixelRadius) {
                const a = complexStoryWorldToCss(testPoint.real, testPoint.imag, metrics);
                const b = complexStoryWorldToCss(targetPoint.real, targetPoint.imag, metrics);
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                return dx * dx + dy * dy <= pixelRadius * pixelRadius;
            }

            function getComplexStoryPointLabelOffset(real, imag, distance) {
                const labelDistance = distance == null ? 28 : distance;
                const side = real < -0.35 ? -1 : 1;
                if (Math.abs(imag) < 0.35) {
                    return {
                        offsetX: side * labelDistance,
                        offsetY: -18
                    };
                }
                if (imag > 0) {
                    return {
                        offsetX: side * Math.max(26, labelDistance),
                        offsetY: -6
                    };
                }
                return {
                    offsetX: side * Math.max(26, labelDistance),
                    offsetY: 16
                };
            }

            function getComplexStorySequenceLabelOffset(index) {
                return {
                    offsetX: index % 2 === 0 ? 18 : -18,
                    offsetY: -24 - (index % 3) * 12
                };
            }

            function requestComplexStoryDraw() {
                if (!complexStoryCtx || !complexStoryCanvas) {
                    return;
                }
                if (complexStoryState.drawScheduled) {
                    return;
                }
                complexStoryState.drawScheduled = true;
                requestAnimationFrame(function() {
                    complexStoryState.drawScheduled = false;
                    drawComplexStoryScene();
                });
            }

            function stopComplexStoryAnimation() {
                if (complexStoryState.animationFrameId != null) {
                    cancelAnimationFrame(complexStoryState.animationFrameId);
                    complexStoryState.animationFrameId = null;
                }
                complexStoryState.activeAnimation = null;
            }

            function easeInOutSine(t) {
                return -(Math.cos(Math.PI * t) - 1) / 2;
            }

            function runComplexStoryAnimation(timestamp) {
                const animation = complexStoryState.activeAnimation;
                if (!animation) {
                    complexStoryState.animationFrameId = null;
                    return;
                }
                if (animation.startTime == null) {
                    animation.startTime = timestamp;
                }
                const linear = clamp((timestamp - animation.startTime) / animation.duration, 0, 1);
                const eased = easeInOutSine(linear);
                animation.update(eased, linear, animation);
                requestComplexStoryDraw();
                if (linear < 1) {
                    complexStoryState.animationFrameId = requestAnimationFrame(runComplexStoryAnimation);
                    return;
                }
                const complete = animation.complete;
                complexStoryState.activeAnimation = null;
                complexStoryState.animationFrameId = null;
                if (complete) {
                    complete();
                }
                requestComplexStoryDraw();
            }

            function startComplexStoryAnimation(kind, duration, update, complete, extraFields) {
                stopComplexStoryAnimation();
                complexStoryState.activeAnimation = Object.assign({
                    kind: kind,
                    duration: duration,
                    startTime: null,
                    update: update,
                    complete: complete
                }, extraFields || {});
                complexStoryState.animationFrameId = requestAnimationFrame(runComplexStoryAnimation);
            }

            function drawComplexStoryPoint(ctx, x, y, radius, fillStyle, strokeStyle, lineWidth) {
                ctx.save();
                ctx.fillStyle = fillStyle;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = strokeStyle || 'rgba(255, 255, 255, 0.95)';
                ctx.lineWidth = lineWidth || radius * 0.34;
                ctx.stroke();
                ctx.restore();
            }

            function drawComplexStoryGrid(ctx, metrics) {
                const size = metrics.size;
                ctx.save();
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
                ctx.lineWidth = 1 * size.dpr;
                for (let real = Math.ceil(metrics.bounds.left); real <= Math.floor(metrics.bounds.right); real += 1) {
                    const start = complexStoryWorldToScreen(real, metrics.bounds.bottom, metrics);
                    const end = complexStoryWorldToScreen(real, metrics.bounds.top, metrics);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                }
                for (let imag = Math.ceil(metrics.bounds.bottom); imag <= Math.floor(metrics.bounds.top); imag += 1) {
                    const start = complexStoryWorldToScreen(metrics.bounds.left, imag, metrics);
                    const end = complexStoryWorldToScreen(metrics.bounds.right, imag, metrics);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                }
                ctx.restore();
            }

            function drawComplexStoryAxes(ctx, metrics, options) {
                options = options || {};
                const size = metrics.size;
                const origin = complexStoryWorldToScreen(0, 0, metrics);
                ctx.save();
                ctx.strokeStyle = 'rgba(30, 41, 59, 0.62)';
                ctx.lineWidth = 2.1 * size.dpr;
                if (options.showXAxis !== false) {
                    ctx.beginPath();
                    ctx.moveTo(0, origin.y);
                    ctx.lineTo(size.width, origin.y);
                    ctx.stroke();
                }
                if (options.showYAxis !== false) {
                    const reveal = clamp(options.yReveal == null ? 1 : options.yReveal, 0, 1);
                    const top = complexStoryWorldToScreen(0, metrics.bounds.top * reveal, metrics);
                    const bottom = complexStoryWorldToScreen(0, metrics.bounds.bottom * reveal, metrics);
                    ctx.beginPath();
                    ctx.moveTo(origin.x, top.y);
                    ctx.lineTo(origin.x, bottom.y);
                    ctx.stroke();
                }
                ctx.fillStyle = '#334155';
                ctx.font = (15 * size.dpr) + 'px Arial';
                if (options.xLabel) {
                    ctx.fillText(options.xLabel, size.width - 28 * size.dpr, origin.y - 12 * size.dpr);
                }
                if (options.yLabel && (options.yReveal == null || options.yReveal > 0.04)) {
                    ctx.fillText(options.yLabel, origin.x + 12 * size.dpr, 26 * size.dpr);
                }
                drawComplexStoryPoint(ctx, origin.x, origin.y, 4.3 * size.dpr, '#0f172a', 'rgba(255, 255, 255, 0.92)', 1.4 * size.dpr);
                ctx.restore();
            }

            function drawComplexStoryArrow(ctx, from, to, options) {
                options = options || {};
                const color = options.color || '#2563eb';
                const lineWidth = options.lineWidth || 2;
                const dpr = options.dpr || 1;
                ctx.save();
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = lineWidth * dpr;
                if (options.dashed) {
                    ctx.setLineDash([8 * dpr, 6 * dpr]);
                }
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
                ctx.setLineDash([]);
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.hypot(dx, dy);
                if (length > 0.0001) {
                    const angle = Math.atan2(dy, dx);
                    const headLength = 11 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(to.x, to.y);
                    ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }

            function drawComplexStoryArc(ctx, metrics, radius, startAngle, endAngle, options) {
                options = options || {};
                const size = metrics.size;
                const delta = endAngle - startAngle;
                const segments = Math.max(18, Math.ceil(Math.abs(delta) / (Math.PI / 28)));
                ctx.save();
                ctx.strokeStyle = options.strokeStyle || 'rgba(220, 38, 38, 0.55)';
                ctx.lineWidth = (options.lineWidth || 2) * size.dpr;
                if (options.dashed) {
                    ctx.setLineDash([8 * size.dpr, 6 * size.dpr]);
                }
                ctx.beginPath();
                for (let index = 0; index <= segments; index += 1) {
                    const angle = startAngle + delta * (index / segments);
                    const point = complexStoryWorldToScreen(
                        Math.cos(angle) * radius,
                        Math.sin(angle) * radius,
                        metrics
                    );
                    if (index === 0) {
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                }
                ctx.stroke();
                ctx.restore();
            }

            function drawComplexStoryPolyline(ctx, points, color, lineWidth) {
                if (points.length < 2) {
                    return;
                }
                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                points.forEach(function(point, index) {
                    if (index === 0) {
                        ctx.moveTo(point.x, point.y);
                    } else {
                        ctx.lineTo(point.x, point.y);
                    }
                });
                ctx.stroke();
                ctx.restore();
            }

            function drawComplexStoryStepOneD(ctx, metrics) {
                const size = metrics.size;
                drawComplexStoryAxes(ctx, metrics, {
                    showXAxis: true,
                    showYAxis: false
                });
                const points = complexStoryState.linePoints.map(function(point) {
                    return complexStoryWorldToScreen(point.real, 0, metrics);
                });
                drawComplexStoryPolyline(ctx, points, '#dc2626', 4.2 * size.dpr);
                points.forEach(function(point) {
                    drawComplexStoryPoint(ctx, point.x, point.y, 7.6 * size.dpr, '#2563eb', 'rgba(255, 255, 255, 0.95)', 2.1 * size.dpr);
                });
            }

            function drawComplexStoryStepCartesian(ctx, metrics) {
                const size = metrics.size;
                drawComplexStoryGrid(ctx, metrics);
                drawComplexStoryAxes(ctx, metrics, {
                    xLabel: 'x',
                    yLabel: 'y',
                    yReveal: complexStoryState.axisReveal
                });
                const points = complexStoryState.planePoints.map(function(point) {
                    return complexStoryWorldToScreen(point.real, point.imag, metrics);
                });
                drawComplexStoryPolyline(ctx, points, '#dc2626', 4.2 * size.dpr);
                points.forEach(function(point) {
                    drawComplexStoryPoint(ctx, point.x, point.y, 7.6 * size.dpr, '#2563eb', 'rgba(255, 255, 255, 0.95)', 2.1 * size.dpr);
                });
            }

            function drawComplexStoryStepRotationDemo(ctx, metrics) {
                const size = metrics.size;
                drawComplexStoryGrid(ctx, metrics);
                drawComplexStoryAxes(ctx, metrics, {
                    yLabel: 'i',
                    yReveal: 1
                });
                const rightPoint = complexStoryWorldToScreen(2, 0, metrics);
                drawComplexStoryPoint(ctx, rightPoint.x, rightPoint.y, 9 * size.dpr, '#2563eb', 'rgba(255, 255, 255, 0.96)', 2.1 * size.dpr);
                if (complexStoryState.rotationDemoMode !== 'start') {
                    const endAngle = complexStoryState.rotationDemoProgress * Math.PI * 1.5;
                    drawComplexStoryArc(ctx, metrics, 2, 0, endAngle, {
                        dashed: true,
                        strokeStyle: 'rgba(220, 38, 38, 0.58)',
                        lineWidth: 2.1
                    });
                    const movingPoint = complexStoryWorldToScreen(2 * Math.cos(endAngle), 2 * Math.sin(endAngle), metrics);
                    drawComplexStoryPoint(ctx, movingPoint.x, movingPoint.y, 9 * size.dpr, '#0f766e', 'rgba(255, 255, 255, 0.96)', 2.3 * size.dpr);
                }
                if (
                    complexStoryState.rotationDemoMode === 'expanded' ||
                    complexStoryState.rotationDemoMode === 'simplified' ||
                    complexStoryState.rotationDemoMode === 'question' ||
                    complexStoryState.rotationDemoMode === 'answer'
                ) {
                    [
                        { real: 0, imag: 2, color: '#2563eb' },
                        { real: -2, imag: 0, color: '#2563eb' },
                        { real: 0, imag: -2, color: '#0f766e' }
                    ].forEach(function(point) {
                        const screen = complexStoryWorldToScreen(point.real, point.imag, metrics);
                        drawComplexStoryPoint(ctx, screen.x, screen.y, 9 * size.dpr, point.color, 'rgba(255, 255, 255, 0.96)', 2.3 * size.dpr);
                    });
                }
            }

            function drawComplexStoryStepComplexParts(ctx, metrics) {
                const size = metrics.size;
                drawComplexStoryGrid(ctx, metrics);
                drawComplexStoryAxes(ctx, metrics, {
                    xLabel: 'real',
                    yLabel: 'i',
                    yReveal: 1
                });
                const animation = complexStoryState.activeAnimation;
                if (animation && animation.kind === 'complex-story-rotate-point' && animation.radius > 0.0001) {
                    drawComplexStoryArc(ctx, metrics, animation.radius, animation.startAngle, animation.currentAngle, {
                        dashed: true,
                        strokeStyle: 'rgba(220, 38, 38, 0.54)',
                        lineWidth: 2.1
                    });
                }
                if (complexStoryState.hoverPoint) {
                    const hover = complexStoryWorldToScreen(complexStoryState.hoverPoint.real, complexStoryState.hoverPoint.imag, metrics);
                    drawComplexStoryPoint(ctx, hover.x, hover.y, 7 * size.dpr, 'rgba(37, 99, 235, 0.28)', '#2563eb', 1.7 * size.dpr);
                }
                if (complexStoryState.pinnedPoint) {
                    const pinned = complexStoryWorldToScreen(complexStoryState.pinnedPoint.real, complexStoryState.pinnedPoint.imag, metrics);
                    drawComplexStoryPoint(ctx, pinned.x, pinned.y, 9 * size.dpr, '#0f766e', 'rgba(255, 255, 255, 0.96)', 2.3 * size.dpr);
                }
            }

            function drawComplexStoryStepDistance(ctx, metrics) {
                const size = metrics.size;
                drawComplexStoryGrid(ctx, metrics);
                drawComplexStoryAxes(ctx, metrics, {
                    xLabel: 'real',
                    yLabel: 'i',
                    yReveal: 1
                });
                if (!complexStoryState.distancePoint) {
                    return;
                }
                const origin = complexStoryWorldToScreen(0, 0, metrics);
                const base = complexStoryWorldToScreen(complexStoryState.distancePoint.real, 0, metrics);
                const point = complexStoryWorldToScreen(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag, metrics);
                drawComplexStoryArrow(ctx, origin, base, {
                    color: '#2563eb',
                    lineWidth: 2.1,
                    dpr: size.dpr
                });
                drawComplexStoryArrow(ctx, base, point, {
                    color: '#0f766e',
                    lineWidth: 2.1,
                    dpr: size.dpr
                });
                drawComplexStoryArrow(ctx, origin, point, {
                    color: '#dc2626',
                    lineWidth: 2.1,
                    dashed: true,
                    dpr: size.dpr
                });
                drawComplexStoryPoint(ctx, base.x, base.y, 5.8 * size.dpr, '#93c5fd', 'rgba(255, 255, 255, 0.94)', 1.5 * size.dpr);
                drawComplexStoryPoint(ctx, point.x, point.y, 8.8 * size.dpr, '#0f766e', 'rgba(255, 255, 255, 0.96)', 2.2 * size.dpr);
            }

            function updateComplexStoryOverlay(metrics) {
                if (!complexStoryOverlay) {
                    return;
                }
                const activeIds = new Set();
                if (complexStoryState.stepIndex === 0) {
                    complexStoryState.linePoints.forEach(function(point, index) {
                        const cssPoint = complexStoryWorldToCss(point.real, 0, metrics);
                        const offset = getComplexStorySequenceLabelOffset(index);
                        const id = 'line-point-' + index;
                        activeIds.add(id);
                        ensureComplexStoryLabel(id, {
                            text: String(index + 1),
                            className: 'subtle',
                            x: cssPoint.x,
                            y: cssPoint.y,
                            offsetX: offset.offsetX,
                            offsetY: offset.offsetY
                        });
                    });
                } else if (complexStoryState.stepIndex === 1) {
                    complexStoryState.planePoints.forEach(function(point, index) {
                        const cssPoint = complexStoryWorldToCss(point.real, point.imag, metrics);
                        const offset = getComplexStorySequenceLabelOffset(index);
                        const id = 'plane-point-' + index;
                        activeIds.add(id);
                        ensureComplexStoryLabel(id, {
                            text: formatComplexStoryOrderedPair(point.real, point.imag),
                            className: 'subtle',
                            x: cssPoint.x,
                            y: cssPoint.y,
                            offsetX: offset.offsetX,
                            offsetY: offset.offsetY
                        });
                    });
                } else if (complexStoryState.stepIndex === 2) {
                    const rightPoint = complexStoryWorldToCss(2, 0, metrics);
                    const rightOffset = getComplexStoryPointLabelOffset(2, 0, 28);
                    activeIds.add('rotation-right');
                    ensureComplexStoryLabel('rotation-right', {
                        html: '\\(2\\)',
                        math: true,
                        className: 'math subtle',
                        x: rightPoint.x,
                        y: rightPoint.y,
                        offsetX: rightOffset.offsetX,
                        offsetY: rightOffset.offsetY
                    });
                    if (
                        complexStoryState.rotationDemoMode === 'expanded' ||
                        complexStoryState.rotationDemoMode === 'simplified' ||
                        complexStoryState.rotationDemoMode === 'question' ||
                        complexStoryState.rotationDemoMode === 'answer'
                    ) {
                        const topPoint = complexStoryWorldToCss(0, 2, metrics);
                        const leftPoint = complexStoryWorldToCss(-2, 0, metrics);
                        const bottomPoint = complexStoryWorldToCss(0, -2, metrics);
                        const topOffset = getComplexStoryPointLabelOffset(0, 2, 34);
                        const leftOffset = getComplexStoryPointLabelOffset(-2, 0, 36);
                        const bottomOffset = getComplexStoryPointLabelOffset(0, -2, 34);
                        activeIds.add('rotation-top');
                        activeIds.add('rotation-left');
                        activeIds.add('rotation-bottom');
                        ensureComplexStoryLabel('rotation-top', {
                            html: '\\(i \\cdot 2\\)',
                            math: true,
                            className: 'math',
                            x: topPoint.x,
                            y: topPoint.y,
                            offsetX: topOffset.offsetX,
                            offsetY: topOffset.offsetY
                        });
                        ensureComplexStoryLabel('rotation-left', {
                            html: complexStoryState.rotationDemoMode === 'answer'
                                ? '\\(i^2 \\cdot 2 = -1 \\cdot 2;\\ i = \\sqrt{-1}\\)'
                                : complexStoryState.rotationDemoMode === 'question'
                                    ? '\\(i^2 \\cdot 2 = -1 \\cdot 2;\\ i = ?\\)'
                                : complexStoryState.rotationDemoMode === 'simplified'
                                    ? '\\(i^2 \\cdot 2\\)'
                                    : '\\(i \\cdot i \\cdot 2\\)',
                            math: true,
                            className: 'math',
                            x: leftPoint.x,
                            y: leftPoint.y,
                            offsetX: leftOffset.offsetX,
                            offsetY: leftOffset.offsetY
                        });
                        ensureComplexStoryLabel('rotation-bottom', {
                            html: complexStoryState.rotationLabelsSimplified ? '\\(i^3 \\cdot 2\\)' : '\\(i \\cdot i \\cdot i \\cdot 2\\)',
                            math: true,
                            className: 'math',
                            x: bottomPoint.x,
                            y: bottomPoint.y,
                            offsetX: bottomOffset.offsetX,
                            offsetY: bottomOffset.offsetY
                        });
                    }
                } else if (complexStoryState.stepIndex === 3) {
                    if (complexStoryState.hoverPoint && !(complexStoryState.activeAnimation && complexStoryState.activeAnimation.kind === 'complex-story-rotate-point')) {
                        const hover = complexStoryWorldToCss(complexStoryState.hoverPoint.real, complexStoryState.hoverPoint.imag, metrics);
                        const hoverOffset = getComplexStoryPointLabelOffset(complexStoryState.hoverPoint.real, complexStoryState.hoverPoint.imag, 34);
                        activeIds.add('hover-point');
                        ensureComplexStoryLabel('hover-point', {
                            text: formatComplexStoryPlain(complexStoryState.hoverPoint.real, complexStoryState.hoverPoint.imag),
                            className: 'subtle',
                            x: hover.x,
                            y: hover.y,
                            offsetX: hoverOffset.offsetX,
                            offsetY: hoverOffset.offsetY
                        });
                    }
                    if (complexStoryState.pinnedPoint) {
                        const pinned = complexStoryWorldToCss(complexStoryState.pinnedPoint.real, complexStoryState.pinnedPoint.imag, metrics);
                        const pinnedOffset = getComplexStoryPointLabelOffset(complexStoryState.pinnedPoint.real, complexStoryState.pinnedPoint.imag, 42);
                        activeIds.add('pinned-point');
                        ensureComplexStoryLabel('pinned-point', {
                            text: formatComplexStoryPlain(complexStoryState.pinnedPoint.real, complexStoryState.pinnedPoint.imag),
                            x: pinned.x,
                            y: pinned.y,
                            offsetX: pinnedOffset.offsetX,
                            offsetY: pinnedOffset.offsetY
                        });
                    }
                } else if (complexStoryState.stepIndex === 4 && complexStoryState.distancePoint) {
                    const point = complexStoryWorldToCss(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag, metrics);
                    const pointOffset = getComplexStoryPointLabelOffset(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag, 46);
                    const basePoint = complexStoryWorldToCss(complexStoryState.distancePoint.real, 0, metrics);
                    const baseOffset = {
                        offsetX: complexStoryState.distancePoint.real < 0 ? -26 : 26,
                        offsetY: 22
                    };
                    const originPoint = complexStoryWorldToCss(0, 0, metrics);
                    const midpoint = {
                        x: (originPoint.x + point.x) / 2,
                        y: (originPoint.y + point.y) / 2
                    };
                    const dx = point.x - originPoint.x;
                    const dy = point.y - originPoint.y;
                    const length = Math.hypot(dx, dy) || 1;
                    const normalX = -dy / length;
                    const normalY = dx / length;
                    activeIds.add('distance-point');
                    activeIds.add('distance-base-point');
                    activeIds.add('distance-hypotenuse');
                    ensureComplexStoryLabel('distance-point', {
                        text: formatComplexStoryPlain(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag),
                        x: point.x,
                        y: point.y,
                        offsetX: pointOffset.offsetX,
                        offsetY: pointOffset.offsetY
                    });
                    ensureComplexStoryLabel('distance-base-point', {
                        text: formatNumber(normalizeNearZero(complexStoryState.distancePoint.real)),
                        className: 'subtle',
                        x: basePoint.x,
                        y: basePoint.y,
                        offsetX: baseOffset.offsetX,
                        offsetY: baseOffset.offsetY
                    });
                    ensureComplexStoryLabel('distance-hypotenuse', {
                        html: '\\(' + getComplexStoryDistanceFormula(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag) + '\\)',
                        math: true,
                        className: 'math subtle',
                        x: midpoint.x,
                        y: midpoint.y,
                        offsetX: normalX * 26,
                        offsetY: normalY * 26
                    });
                }
                hideUnusedComplexStoryLabels(activeIds);
            }

            function drawComplexStoryScene() {
                if (!complexStoryCtx || !complexStoryCanvas) {
                    return;
                }
                const metrics = getComplexStoryMetrics();
                if (!metrics) {
                    return;
                }
                const ctx = complexStoryCtx;
                ctx.clearRect(0, 0, metrics.size.width, metrics.size.height);
                if (complexStoryState.stepIndex === 0) {
                    drawComplexStoryStepOneD(ctx, metrics);
                } else if (complexStoryState.stepIndex === 1) {
                    drawComplexStoryStepCartesian(ctx, metrics);
                } else if (complexStoryState.stepIndex === 2) {
                    drawComplexStoryStepRotationDemo(ctx, metrics);
                } else if (complexStoryState.stepIndex === 3) {
                    drawComplexStoryStepComplexParts(ctx, metrics);
                } else if (complexStoryState.stepIndex === 4) {
                    drawComplexStoryStepDistance(ctx, metrics);
                }
                updateComplexStoryOverlay(metrics);
            }

            function getComplexStoryTitleHtml() {
                if (complexStoryState.stepIndex === 0) {
                    return '1D is uninteresting';
                }
                if (complexStoryState.stepIndex === 1) {
                    return 'What you are used to: X,Y';
                }
                if (complexStoryState.stepIndex === 2) {
                    return 'Rotate by Multiplying';
                }
                if (complexStoryState.stepIndex === 3) {
                    return 'Complex numbers have real and imaginary (\\(\\sqrt{-1}\\)) parts';
                }
                return '“Gets Big” = “Far from center”';
            }

            function updateComplexStoryFootnote() {
                let html = '';
                let needsMath = false;
                if (complexStoryState.stepIndex === 0) {
                    html = 'Click anywhere in the graph to drop points onto the one-dimensional line.';
                } else if (complexStoryState.stepIndex === 1) {
                    html = 'The new y-axis grows out of the center, then your clicks can finally separate into a visible path.';
                } else if (complexStoryState.stepIndex === 2) {
                    needsMath = true;
                    if (complexStoryState.rotationDemoMode === 'start') {
                        html = 'Click anywhere in the graph to start rotating ' + inlineComplexStoryMath('2') + ' by multiplying with ' + inlineComplexStoryMath('i') + '.';
                    } else if (complexStoryState.rotationDemoMode === 'animating') {
                        html = 'Each multiplication by ' + inlineComplexStoryMath('i') + ' turns the point by 90° without changing its distance from the center.';
                    } else if (complexStoryState.rotationDemoMode === 'expanded') {
                        html = 'Click anywhere in the graph to rewrite repeated multiplication using powers of ' + inlineComplexStoryMath('i') + '.';
                    } else if (complexStoryState.rotationDemoMode === 'simplified') {
                        html = 'Click anywhere again to replace ' + inlineComplexStoryMath('i^2') + ' with ' + inlineComplexStoryMath('-1') + '.';
                    } else if (complexStoryState.rotationDemoMode === 'question') {
                        html = 'Since ' + inlineComplexStoryMath('2i^2 = -2') + ', that means ' + inlineComplexStoryMath('i^2 = -1') + '. What is ' + inlineComplexStoryMath('i') + '?';
                    } else {
                        html = 'So ' + inlineComplexStoryMath('i = \\sqrt{-1}') + '.';
                    }
                } else if (complexStoryState.stepIndex === 3) {
                    needsMath = true;
                    html = 'Move the mouse to read a complex number, click to pin one in place, then multiply by ' + inlineComplexStoryMath('i') + ' to rotate it.';
                } else if (complexStoryState.stepIndex === 4) {
                    if (complexStoryState.distancePoint) {
                        html = 'Distance from origin: ' + inlineComplexStoryMath(getComplexStoryDistanceFormula(complexStoryState.distancePoint.real, complexStoryState.distancePoint.imag));
                        needsMath = true;
                    } else {
                        html = 'Click anywhere in the graph to break the point into real, imaginary, and distance-from-center pieces.';
                    }
                }
                setStoryElementHtml(complexStoryFootnote, html, needsMath);
            }

            function updateComplexStoryRotateUi() {
                const showRotateStep = complexStoryState.stepIndex === 3;
                if (complexStoryActions) {
                    complexStoryActions.hidden = !showRotateStep;
                }
                if (!showRotateStep) {
                    complexStoryState.rotateEquationOverride = '';
                    setStoryElementHtml(complexStoryRotateEquation, '', false);
                    return;
                }
                if (complexStoryRotateButton) {
                    complexStoryRotateButton.disabled = !complexStoryState.pinnedPoint || !!(complexStoryState.activeAnimation && complexStoryState.activeAnimation.kind === 'complex-story-rotate-point');
                }
                let equationHtml = complexStoryState.rotateEquationOverride;
                if (!equationHtml && complexStoryState.pinnedPoint) {
                    const nextReal = normalizeNearZero(-complexStoryState.pinnedPoint.imag);
                    const nextImag = normalizeNearZero(complexStoryState.pinnedPoint.real);
                    equationHtml = '\\((' + formatComplexStoryMath(complexStoryState.pinnedPoint.real, complexStoryState.pinnedPoint.imag) + ') \\cdot i = ' + formatComplexStoryMath(nextReal, nextImag) + '\\)';
                }
                setStoryElementHtml(complexStoryRotateEquation, equationHtml, !!equationHtml);
            }

            function updateComplexStoryControls() {
                if (complexStoryStepCount) {
                    complexStoryStepCount.textContent = (complexStoryState.stepIndex + 1) + ' / ' + COMPLEX_STORY_STEP_TOTAL;
                }
                if (complexStoryPrevButton) {
                    complexStoryPrevButton.disabled = complexStoryState.stepIndex === 0;
                }
                if (complexStoryNextButton) {
                    complexStoryNextButton.disabled = complexStoryState.stepIndex === COMPLEX_STORY_STEP_TOTAL - 1;
                }
                if (complexStoryCanvas) {
                    complexStoryCanvas.style.cursor = complexStoryState.stepIndex === 2 ? 'pointer' : 'crosshair';
                }
                setStoryElementHtml(complexStoryTitle, getComplexStoryTitleHtml(), complexStoryState.stepIndex === 2 || complexStoryState.stepIndex === 3);
                updateComplexStoryRotateUi();
                updateComplexStoryFootnote();
            }

            function setComplexStoryStep(stepIndex) {
                stopComplexStoryAnimation();
                complexStoryState.stepIndex = clamp(stepIndex, 0, COMPLEX_STORY_STEP_TOTAL - 1);
                complexStoryState.linePoints = [];
                complexStoryState.planePoints = [];
                complexStoryState.axisReveal = complexStoryState.stepIndex === 1 ? 0 : 1;
                complexStoryState.hoverPoint = null;
                complexStoryState.pinnedPoint = null;
                complexStoryState.distancePoint = null;
                complexStoryState.rotationDemoMode = 'start';
                complexStoryState.rotationDemoProgress = 0;
                complexStoryState.rotationLabelsSimplified = false;
                complexStoryState.rotateEquationOverride = '';
                hideUnusedComplexStoryLabels(new Set());
                updateComplexStoryControls();
                if (complexStoryState.stepIndex === 1) {
                    startComplexStoryAnimation('complex-story-y-axis', 700, function(eased) {
                        complexStoryState.axisReveal = eased;
                    }, function() {
                        complexStoryState.axisReveal = 1;
                        updateComplexStoryFootnote();
                    });
                }
                requestComplexStoryDraw();
            }

            function handleComplexStoryCanvasClick(event) {
                const conversion = complexStoryScreenToWorld(event.clientX, event.clientY);
                if (!conversion.metrics) {
                    return;
                }
                const point = clampComplexStoryPoint({
                    real: conversion.real,
                    imag: conversion.imag
                }, conversion.metrics);
                if (complexStoryState.stepIndex === 0) {
                    complexStoryState.linePoints.push({ real: point.real });
                } else if (complexStoryState.stepIndex === 1) {
                    complexStoryState.planePoints.push(point);
                } else if (complexStoryState.stepIndex === 2) {
                    if (complexStoryState.activeAnimation) {
                        return;
                    }
                    if (complexStoryState.rotationDemoMode === 'start') {
                        complexStoryState.rotationDemoMode = 'animating';
                        complexStoryState.rotationDemoProgress = 0;
                        updateComplexStoryFootnote();
                        startComplexStoryAnimation('complex-story-demo-rotate', 1500, function(eased) {
                            complexStoryState.rotationDemoProgress = eased;
                        }, function() {
                            complexStoryState.rotationDemoProgress = 1;
                            complexStoryState.rotationDemoMode = 'expanded';
                            updateComplexStoryFootnote();
                        });
                    } else if (complexStoryState.rotationDemoMode === 'expanded') {
                        complexStoryState.rotationDemoMode = 'simplified';
                        complexStoryState.rotationLabelsSimplified = true;
                        updateComplexStoryFootnote();
                    } else if (complexStoryState.rotationDemoMode === 'simplified') {
                        complexStoryState.rotationDemoMode = 'question';
                        updateComplexStoryFootnote();
                    } else if (complexStoryState.rotationDemoMode === 'question') {
                        complexStoryState.rotationDemoMode = 'answer';
                        updateComplexStoryFootnote();
                    }
                } else if (complexStoryState.stepIndex === 3) {
                    if (complexStoryState.activeAnimation && complexStoryState.activeAnimation.kind === 'complex-story-rotate-point') {
                        return;
                    }
                    complexStoryState.pinnedPoint = point;
                    complexStoryState.rotateEquationOverride = '';
                    updateComplexStoryRotateUi();
                } else if (complexStoryState.stepIndex === 4) {
                    complexStoryState.distancePoint = point;
                    updateComplexStoryFootnote();
                }
                requestComplexStoryDraw();
            }

            function handleComplexStoryPointerMove(event) {
                if (complexStoryState.stepIndex !== 3 || (complexStoryState.activeAnimation && complexStoryState.activeAnimation.kind === 'complex-story-rotate-point')) {
                    return;
                }
                const conversion = complexStoryScreenToWorld(event.clientX, event.clientY);
                if (!conversion.metrics) {
                    return;
                }
                complexStoryState.hoverPoint = clampComplexStoryPoint({
                    real: conversion.real,
                    imag: conversion.imag
                }, conversion.metrics);
                requestComplexStoryDraw();
            }

            function handleComplexStoryPointerLeave() {
                if (complexStoryState.hoverPoint) {
                    complexStoryState.hoverPoint = null;
                    requestComplexStoryDraw();
                }
            }

            function rotateComplexStoryPinnedPoint() {
                if (complexStoryState.stepIndex !== 3 || !complexStoryState.pinnedPoint || (complexStoryState.activeAnimation && complexStoryState.activeAnimation.kind === 'complex-story-rotate-point')) {
                    return;
                }
                const from = {
                    real: complexStoryState.pinnedPoint.real,
                    imag: complexStoryState.pinnedPoint.imag
                };
                const to = {
                    real: normalizeNearZero(-from.imag),
                    imag: normalizeNearZero(from.real)
                };
                complexStoryState.rotateEquationOverride = '\\((' + formatComplexStoryMath(from.real, from.imag) + ') \\cdot i = ' + formatComplexStoryMath(to.real, to.imag) + '\\)';
                updateComplexStoryRotateUi();
                const radius = Math.hypot(from.real, from.imag);
                const startAngle = Math.atan2(from.imag, from.real);
                const endAngle = startAngle + Math.PI / 2;
                startComplexStoryAnimation('complex-story-rotate-point', 900, function(eased, linear, animation) {
                    animation.radius = radius;
                    animation.startAngle = startAngle;
                    animation.endAngle = endAngle;
                    animation.currentAngle = startAngle + (endAngle - startAngle) * eased;
                    if (radius < 1e-9) {
                        complexStoryState.pinnedPoint = { real: 0, imag: 0 };
                        return;
                    }
                    complexStoryState.pinnedPoint = {
                        real: normalizeNearZero(Math.cos(animation.currentAngle) * radius),
                        imag: normalizeNearZero(Math.sin(animation.currentAngle) * radius)
                    };
                }, function() {
                    complexStoryState.pinnedPoint = to;
                    complexStoryState.rotateEquationOverride = '';
                    updateComplexStoryRotateUi();
                    requestComplexStoryDraw();
                }, {
                    radius: radius,
                    startAngle: startAngle,
                    endAngle: endAngle,
                    currentAngle: startAngle
                });
                updateComplexStoryRotateUi();
                requestComplexStoryDraw();
            }

            function initializeComplexStory() {
                if (!complexStoryCanvas) {
                    return;
                }
                complexStoryCanvas.addEventListener('click', handleComplexStoryCanvasClick);
                complexStoryCanvas.addEventListener('pointermove', handleComplexStoryPointerMove);
                complexStoryCanvas.addEventListener('pointerleave', handleComplexStoryPointerLeave);
                if (complexStoryPrevButton) {
                    complexStoryPrevButton.addEventListener('click', function() {
                        setComplexStoryStep(complexStoryState.stepIndex - 1);
                    });
                }
                if (complexStoryNextButton) {
                    complexStoryNextButton.addEventListener('click', function() {
                        setComplexStoryStep(complexStoryState.stepIndex + 1);
                    });
                }
                if (complexStoryResetButton) {
                    complexStoryResetButton.addEventListener('click', function() {
                        setComplexStoryStep(0);
                    });
                }
                if (complexStoryRotateButton) {
                    complexStoryRotateButton.addEventListener('click', rotateComplexStoryPinnedPoint);
                }
                setComplexStoryStep(0);
            }

            document.getElementById('run-real').addEventListener('click', function() {
                renderRealTool();
            });

            Array.prototype.forEach.call(document.querySelectorAll('.real-preset'), function(button) {
                button.addEventListener('click', function() {
                    renderRealTool(Number(button.getAttribute('data-start')));
                });
            });

            Array.prototype.forEach.call(document.querySelectorAll('.complex-preset'), function(button) {
                button.addEventListener('click', function() {
                    renderComplexTool(
                        Number(button.getAttribute('data-real')),
                        Number(button.getAttribute('data-imag'))
                    );
                });
            });

            function tryRenderComplexToolFromInputs() {
                const realText = complexRealInput.value.trim();
                const imagText = complexImagInput.value.trim();
                if (!realText || !imagText) {
                    return;
                }
                const cReal = Number(realText);
                const cImag = Number(imagText);
                if (!Number.isFinite(cReal) || !Number.isFinite(cImag)) {
                    return;
                }
                renderComplexTool(cReal, cImag, { syncInputs: false });
            }

            if (complexRealInput) {
                complexRealInput.addEventListener('input', tryRenderComplexToolFromInputs);
                complexRealInput.addEventListener('change', tryRenderComplexToolFromInputs);
            }

            if (complexImagInput) {
                complexImagInput.addEventListener('input', tryRenderComplexToolFromInputs);
                complexImagInput.addEventListener('change', tryRenderComplexToolFromInputs);
            }

            const plotState = {
                supported: !!gl,
                centerX: -0.5,
                centerY: 0,
                halfWidth: DEFAULT_VIEW_HALF_WIDTH,
                halfHeight: DEFAULT_VIEW_HALF_WIDTH,
                colorSchemeKey: DEFAULT_MANDELBROT_COLOR_SCHEME_KEY,
                points: EMPTY_FLOAT32,
                colors: EMPTY_FLOAT32,
                manualPoints: [],
                manualColors: [],
                selectedPoint: null,
                densityLevel: 0,
                targetDensityLevel: 1,
                densifySignature: '',
                autoDensifyEnabled: !!(plotAutoDensifyToggle ? plotAutoDensifyToggle.checked : true),
                autoDensifyTimeoutId: null,
                densifyInProgress: false,
                densifyFrameId: null,
                activeDensifyJobId: 0,
                pendingUpload: false,
                manualPendingUpload: false,
                drawScheduled: false,
                drag: null,
                dragChangedView: false,
                positionBuffer: null,
                colorBuffer: null,
                manualPositionBuffer: null,
                manualColorBuffer: null,
                program: null,
                attribs: null,
                uniforms: null,
                meshEnabled: false,
                meshProgram: null,
                meshAttribs: null,
                meshUniforms: null,
                meshPositionBuffer: null,
                meshColorBuffer: null,
                meshPositions: null,
                meshColors: null,
                meshStrips: [],
                meshVertexCount: 0,
                meshSignature: '',
                meshPendingUpload: false,
                lastGridSamples: null,
                hoverTrackerEnabled: false,
                hoverTrackerResult: null,
                pendingHoverPoint: null,
                hoverFrameId: null
            };
            const complexPlaneState = {
                initialized: false,
                renderer: null,
                scene: null,
                camera: null,
                bounds: {
                    left: -COMPLEX_PLANE_HALF_SPAN,
                    right: COMPLEX_PLANE_HALF_SPAN,
                    top: COMPLEX_PLANE_HALF_SPAN,
                    bottom: -COMPLEX_PLANE_HALF_SPAN
                },
                width: 0,
                height: 0,
                pathGeometry: null,
                pointGeometry: null,
                pathMaterial: null,
                pointMaterial: null,
                pathLine: null,
                pointsObject: null,
                sampleOuterMarker: null,
                sampleInnerMarker: null,
                displayedResult: null,
                pinnedPoint: {
                    real: -1,
                    imag: 0
                },
                pendingHoverSample: null,
                hoverFrameId: null,
                isHovering: false
            };

            const cardioidState = {
                initialized: false,
                angle: 0,
                playing: true,
                lastTimestamp: null,
                animationFrameId: null,
                trace: []
            };

            function getActiveComplexResult() {
                return complexPlaneState.displayedResult || lastComplexResult;
            }

            function getActivePlotColorSchemeKey() {
                return MANDELBROT_COLOR_SCHEMES[plotState.colorSchemeKey]
                    ? plotState.colorSchemeKey
                    : DEFAULT_MANDELBROT_COLOR_SCHEME_KEY;
            }

            function rebuildManualPlotColors(maxIterations, colorSchemeKey) {
                plotState.manualColors = [];
                for (let index = 0; index < plotState.manualPoints.length; index += 2) {
                    const rgb = getPlotPointColorFloats(
                        plotState.manualPoints[index],
                        plotState.manualPoints[index + 1],
                        maxIterations,
                        colorSchemeKey
                    );
                    plotState.manualColors.push(rgb[0], rgb[1], rgb[2]);
                }
                plotState.manualPendingUpload = true;
            }

            function recolorStoredPlotGrid(maxIterations, colorSchemeKey) {
                if (!plotState.lastGridSamples || !plotState.lastGridSamples.positions) {
                    return;
                }
                const positions = plotState.lastGridSamples.positions;
                const colors = new Float32Array((positions.length / 2) * 3);
                const sampleCount = positions.length / 2;
                for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
                    const rgb = getPlotPointColorFloats(
                        positions[sampleIndex * 2],
                        positions[sampleIndex * 2 + 1],
                        maxIterations,
                        colorSchemeKey
                    );
                    colors[sampleIndex * 3] = rgb[0];
                    colors[sampleIndex * 3 + 1] = rgb[1];
                    colors[sampleIndex * 3 + 2] = rgb[2];
                }
                plotState.lastGridSamples.colors = colors;
                setPlotGridData(positions, colors);
                if (plotState.meshEnabled) {
                    buildPlotMeshFromSamples(plotState.lastGridSamples);
                } else {
                    clearPlotMeshData();
                }
            }

            function refreshPlotColors() {
                const maxIterations = clamp(Math.round(safeNumber(plotIterationsInput.value, 80)), 10, 500);
                const colorSchemeKey = getActivePlotColorSchemeKey();
                rebuildManualPlotColors(maxIterations, colorSchemeKey);
                recolorStoredPlotGrid(maxIterations, colorSchemeKey);
                if (plotState.selectedPoint) {
                    const selectedPointResult = evaluateComplexSequence(
                        plotState.selectedPoint.real,
                        plotState.selectedPoint.imag,
                        maxIterations + 1,
                        'gradient',
                        undefined,
                        colorSchemeKey
                    );
                    plotState.selectedPoint.stayedSmall = selectedPointResult.stayedSmall;
                    plotState.selectedPoint.pointColorCss = selectedPointResult.pointColorCss;
                    if (plotStatus && /Last tested point/.test(plotStatus.textContent || '')) {
                        setStatusPill(
                            plotStatus,
                            selectedPointResult,
                            selectedPointResult.stayedSmall ? 'Last tested point stayed small' : 'Last tested point escaped'
                        );
                    }
                }
                if (plotState.hoverTrackerResult) {
                    plotState.hoverTrackerResult = buildPlotHoverSequenceResult(
                        plotState.hoverTrackerResult.cReal,
                        plotState.hoverTrackerResult.cImag
                    );
                }
                requestPlotDraw();
            }

            function getFullscreenElement() {
                return document.fullscreenElement || document.webkitFullscreenElement || null;
            }

            function getPlotFullscreenTarget() {
                return plotFullscreenTarget || plotFrame || null;
            }

            function isPlotFrameFullscreen() {
                const fullscreenTarget = getPlotFullscreenTarget();
                return !!(fullscreenTarget && getFullscreenElement() === fullscreenTarget);
            }
            function plotFullscreenSupported() {
                const fullscreenTarget = getPlotFullscreenTarget();
                return !!(fullscreenTarget && (
                    typeof fullscreenTarget.requestFullscreen === 'function' ||
                    typeof fullscreenTarget.webkitRequestFullscreen === 'function'
                ));
            }

            function updatePlotFullscreenButton() {
                if (!plotFullscreenButton) {
                    return;
                }
                plotFullscreenButton.disabled = !plotFullscreenSupported();
                const fullscreen = isPlotFrameFullscreen();
                plotFullscreenButton.textContent = fullscreen ? 'Exit Fullscreen' : 'Fullscreen';
                plotFullscreenButton.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
            }

            function requestPlotFullscreen() {
                const fullscreenTarget = getPlotFullscreenTarget();
                if (!fullscreenTarget) {
                    return Promise.resolve();
                }
                if (typeof fullscreenTarget.requestFullscreen === 'function') {
                    const requestResult = fullscreenTarget.requestFullscreen();
                    return requestResult && typeof requestResult.then === 'function'
                        ? requestResult
                        : Promise.resolve();
                }
                if (typeof fullscreenTarget.webkitRequestFullscreen === 'function') {
                    fullscreenTarget.webkitRequestFullscreen();
                }
                return Promise.resolve();
            }

            function exitPlotFullscreen() {
                if (typeof document.exitFullscreen === 'function') {
                    const exitResult = document.exitFullscreen();
                    return exitResult && typeof exitResult.then === 'function'
                        ? exitResult
                        : Promise.resolve();
                }
                if (typeof document.webkitExitFullscreen === 'function') {
                    document.webkitExitFullscreen();
                }
                return Promise.resolve();
            }

            function togglePlotFullscreen() {
                if (!getPlotFullscreenTarget()) {
                    return;
                }
                if (isPlotFrameFullscreen()) {
                    exitPlotFullscreen().catch(function() {});
                    return;
                }
                requestPlotFullscreen().catch(function() {});
            }

            function handlePlotFullscreenChange() {
                updatePlotFullscreenButton();
                requestAnimationFrame(function() {
                    requestPlotDraw();
                });
            }

            function updateComplexCPill(cReal, cImag, isHoverPreview) {
                if (!complexCPill) {
                    return;
                }
                complexCPill.textContent = (isHoverPreview ? 'hover start = ' : 'start = ') + formatComplex(cReal, cImag);
            }

            function createComplexPlaneMarker(size, color) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
                return new THREE.Points(
                    geometry,
                    new THREE.PointsMaterial({
                        color: color,
                        size: size,
                        sizeAttenuation: false,
                        transparent: true,
                        opacity: 0.98
                    })
                );
            }

            function buildComplexPlaneCircle(radius, segmentCount) {
                const points = [];
                for (let index = 0; index < segmentCount; index += 1) {
                    const angle = (index / segmentCount) * Math.PI * 2;
                    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
                }
                return new THREE.LineLoop(
                    new THREE.BufferGeometry().setFromPoints(points),
                    new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.92 })
                );
            }

            function resizeComplexPlaneScene() {
                if (!complexPlaneState.renderer || !complexPlaneStage) {
                    return;
                }
                const width = Math.max(1, complexPlaneStage.clientWidth);
                const height = Math.max(1, complexPlaneStage.clientHeight);
                if (complexPlaneState.width === width && complexPlaneState.height === height) {
                    return;
                }
                complexPlaneState.width = width;
                complexPlaneState.height = height;
                complexPlaneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                complexPlaneState.renderer.setSize(width, height, false);
                const aspect = width / height;
                const halfWidth = aspect >= 1 ? COMPLEX_PLANE_HALF_SPAN * aspect : COMPLEX_PLANE_HALF_SPAN;
                const halfHeight = aspect >= 1 ? COMPLEX_PLANE_HALF_SPAN : COMPLEX_PLANE_HALF_SPAN / aspect;
                complexPlaneState.camera.left = -halfWidth;
                complexPlaneState.camera.right = halfWidth;
                complexPlaneState.camera.top = halfHeight;
                complexPlaneState.camera.bottom = -halfHeight;
                complexPlaneState.camera.updateProjectionMatrix();
                complexPlaneState.bounds = {
                    left: -halfWidth,
                    right: halfWidth,
                    top: halfHeight,
                    bottom: -halfHeight
                };
            }

            function setComplexPlaneSeriesColor(rgb) {
                if (!rgb) {
                    return;
                }
                const red = rgb[0] / 255;
                const green = rgb[1] / 255;
                const blue = rgb[2] / 255;
                if (complexPlaneState.pathMaterial) {
                    complexPlaneState.pathMaterial.color.setRGB(red, green, blue);
                }
                if (complexPlaneState.pointMaterial) {
                    complexPlaneState.pointMaterial.color.setRGB(red, green, blue);
                }
            }

            function moveComplexPlaneSampleMarker(cReal, cImag) {
                if (!complexPlaneState.sampleOuterMarker || !complexPlaneState.sampleInnerMarker) {
                    return;
                }
                const bounds = complexPlaneState.bounds;
                const xMargin = (bounds.right - bounds.left) * COMPLEX_PLANE_EDGE_MARGIN;
                const yMargin = (bounds.top - bounds.bottom) * COMPLEX_PLANE_EDGE_MARGIN;
                const x = clampForDisplay(cReal, { min: bounds.left + xMargin, max: bounds.right - xMargin });
                const y = clampForDisplay(cImag, { min: bounds.bottom + yMargin, max: bounds.top - yMargin });
                complexPlaneState.sampleOuterMarker.position.set(x, y, 0.03);
                complexPlaneState.sampleInnerMarker.position.set(x, y, 0.04);
                complexPlaneState.sampleOuterMarker.visible = true;
                complexPlaneState.sampleInnerMarker.visible = true;
            }

            function updateComplexPlanePath(result) {
                if (!complexPlaneState.pathGeometry || !complexPlaneState.pointGeometry || !complexPlaneState.pathLine || !complexPlaneState.pointsObject) {
                    return;
                }
                if (!result || !result.entries || !result.entries.length) {
                    complexPlaneState.pathGeometry.setDrawRange(0, 0);
                    complexPlaneState.pointGeometry.setDrawRange(0, 0);
                    complexPlaneState.pathLine.visible = false;
                    complexPlaneState.pointsObject.visible = false;
                    if (complexPlaneState.sampleOuterMarker) {
                        complexPlaneState.sampleOuterMarker.visible = false;
                    }
                    if (complexPlaneState.sampleInnerMarker) {
                        complexPlaneState.sampleInnerMarker.visible = false;
                    }
                    return;
                }
                const bounds = complexPlaneState.bounds;
                const xRange = {
                    min: bounds.left + (bounds.right - bounds.left) * COMPLEX_PLANE_EDGE_MARGIN,
                    max: bounds.right - (bounds.right - bounds.left) * COMPLEX_PLANE_EDGE_MARGIN
                };
                const yRange = {
                    min: bounds.bottom + (bounds.top - bounds.bottom) * COMPLEX_PLANE_EDGE_MARGIN,
                    max: bounds.top - (bounds.top - bounds.bottom) * COMPLEX_PLANE_EDGE_MARGIN
                };
                const pathPositions = complexPlaneState.pathGeometry.getAttribute('position');
                const pointPositions = complexPlaneState.pointGeometry.getAttribute('position');
                result.entries.forEach(function(entry, index) {
                    const offset = index * 3;
                    const real = clampForDisplay(entry.real, xRange);
                    const imag = clampForDisplay(entry.imag, yRange);
                    pathPositions.array[offset] = real;
                    pathPositions.array[offset + 1] = imag;
                    pathPositions.array[offset + 2] = 0;
                    pointPositions.array[offset] = real;
                    pointPositions.array[offset + 1] = imag;
                    pointPositions.array[offset + 2] = 0;
                });
                pathPositions.needsUpdate = true;
                pointPositions.needsUpdate = true;
                complexPlaneState.pathGeometry.setDrawRange(0, result.entries.length);
                complexPlaneState.pointGeometry.setDrawRange(0, result.entries.length);
                complexPlaneState.pathLine.visible = true;
                complexPlaneState.pointsObject.visible = true;
                setComplexPlaneSeriesColor(result.pointColorRgb);
                moveComplexPlaneSampleMarker(result.cReal, result.cImag);
            }

            function renderComplexPlaneScene() {
                if (!complexPlaneState.renderer || !complexPlaneState.scene || !complexPlaneState.camera) {
                    return;
                }
                complexPlaneState.renderer.render(complexPlaneState.scene, complexPlaneState.camera);
            }

            function getComplexPlanePointFromEvent(event) {
                if (!complexPlaneStage) {
                    return null;
                }
                const rect = complexPlaneStage.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return null;
                }
                const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
                const bounds = complexPlaneState.bounds;
                return {
                    real: lerp(bounds.left, bounds.right, x),
                    imag: lerp(bounds.bottom, bounds.top, 1 - y)
                };
            }

            function requestComplexPlaneHover(point) {
                if (!complexPlaneState.initialized || !isComplexSectionActive()) {
                    return;
                }
                complexPlaneState.pendingHoverSample = point;
                if (complexPlaneState.hoverFrameId != null) {
                    return;
                }
                complexPlaneState.hoverFrameId = requestAnimationFrame(function() {
                    complexPlaneState.hoverFrameId = null;
                    const nextPoint = complexPlaneState.pendingHoverSample;
                    complexPlaneState.pendingHoverSample = null;
                    if (!nextPoint) {
                        return;
                    }
                    renderComplexTool(nextPoint.real, nextPoint.imag, {
                        syncInputs: false,
                        transient: true
                    });
                });
            }

            function restorePinnedComplexPlaneResult() {
                complexPlaneState.pendingHoverSample = null;
                if (complexPlaneState.hoverFrameId != null) {
                    cancelAnimationFrame(complexPlaneState.hoverFrameId);
                    complexPlaneState.hoverFrameId = null;
                }
                if (!complexPlaneState.isHovering) {
                    updateComplexCPill(complexPlaneState.pinnedPoint.real, complexPlaneState.pinnedPoint.imag, false);
                    return;
                }
                complexPlaneState.isHovering = false;
                renderComplexTool(complexPlaneState.pinnedPoint.real, complexPlaneState.pinnedPoint.imag, {
                    syncInputs: false
                });
            }

            function setupComplexPlaneScene() {
                if (!complexPlaneStage || complexPlaneState.initialized) {
                    return;
                }
                try {
                    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                    renderer.setClearColor(0x000000, 0);
                    complexPlaneStage.replaceChildren(renderer.domElement);

                    const scene = new THREE.Scene();
                    const camera = new THREE.OrthographicCamera(-COMPLEX_PLANE_HALF_SPAN, COMPLEX_PLANE_HALF_SPAN, COMPLEX_PLANE_HALF_SPAN, -COMPLEX_PLANE_HALF_SPAN, 0.1, 20);
                    camera.position.set(0, 0, 5);

                    const gridPositions = [];
                    [-3, -2, -1, 1, 2, 3].forEach(function(value) {
                        gridPositions.push(value, -COMPLEX_PLANE_WORLD_SPAN, 0, value, COMPLEX_PLANE_WORLD_SPAN, 0);
                        gridPositions.push(-COMPLEX_PLANE_WORLD_SPAN, value, 0, COMPLEX_PLANE_WORLD_SPAN, value, 0);
                    });
                    const grid = new THREE.LineSegments(
                        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3)),
                        new THREE.LineBasicMaterial({ color: 0xd7e5f6, transparent: true, opacity: 0.88 })
                    );
                    const axes = new THREE.LineSegments(
                        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
                            -COMPLEX_PLANE_WORLD_SPAN, 0, 0, COMPLEX_PLANE_WORLD_SPAN, 0, 0,
                            0, -COMPLEX_PLANE_WORLD_SPAN, 0, 0, COMPLEX_PLANE_WORLD_SPAN, 0
                        ], 3)),
                        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.96 })
                    );
                    scene.add(grid);
                    scene.add(axes);
                    scene.add(buildComplexPlaneCircle(COMPLEX_PREVIEW_ESCAPE_RADIUS, 128));

                    const pathGeometry = new THREE.BufferGeometry();
                    pathGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COMPLEX_PREVIEW_POINT_COUNT * 3), 3));
                    pathGeometry.setDrawRange(0, 0);
                    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.9 });
                    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
                    pathLine.visible = false;
                    scene.add(pathLine);

                    const pointGeometry = new THREE.BufferGeometry();
                    pointGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COMPLEX_PREVIEW_POINT_COUNT * 3), 3));
                    pointGeometry.setDrawRange(0, 0);
                    const pointsObject = new THREE.Points(
                        pointGeometry,
                        new THREE.PointsMaterial({
                            color: 0x2563eb,
                            size: 8.5,
                            sizeAttenuation: false,
                            transparent: true,
                            opacity: 0.95
                        })
                    );
                    pointsObject.visible = false;
                    scene.add(pointsObject);

                    const originOuterMarker = createComplexPlaneMarker(12.5, 0xffffff);
                    const originInnerMarker = createComplexPlaneMarker(6.5, 0x111827);
                    originOuterMarker.position.z = 0.01;
                    originInnerMarker.position.z = 0.02;
                    scene.add(originOuterMarker);
                    scene.add(originInnerMarker);

                    const sampleOuterMarker = createComplexPlaneMarker(14.5, 0xffffff);
                    const sampleInnerMarker = createComplexPlaneMarker(8, 0x0f766e);
                    sampleOuterMarker.visible = false;
                    sampleInnerMarker.visible = false;
                    sampleOuterMarker.position.z = 0.03;
                    sampleInnerMarker.position.z = 0.04;
                    scene.add(sampleOuterMarker);
                    scene.add(sampleInnerMarker);

                    complexPlaneState.renderer = renderer;
                    complexPlaneState.scene = scene;
                    complexPlaneState.camera = camera;
                    complexPlaneState.pathGeometry = pathGeometry;
                    complexPlaneState.pointGeometry = pointGeometry;
                    complexPlaneState.pathMaterial = pathMaterial;
                    complexPlaneState.pointMaterial = pointsObject.material;
                    complexPlaneState.pathLine = pathLine;
                    complexPlaneState.pointsObject = pointsObject;
                    complexPlaneState.sampleOuterMarker = sampleOuterMarker;
                    complexPlaneState.sampleInnerMarker = sampleInnerMarker;
                    complexPlaneState.initialized = true;

                    resizeComplexPlaneScene();
                    renderComplexPlaneScene();

                    complexPlaneStage.addEventListener('pointermove', function(event) {
                        const point = getComplexPlanePointFromEvent(event);
                        if (!point) {
                            return;
                        }
                        requestComplexPlaneHover(point);
                    });
                    complexPlaneStage.addEventListener('pointerleave', function() {
                        restorePinnedComplexPlaneResult();
                    });
                } catch (error) {
                    complexPlaneStage.innerHTML = '<div style=\"padding:20px;color:#5f6b84;line-height:1.6;\">The complex-plane explorer could not start in this browser.</div>';
                }
            }

            function getPlotViewportCssSize() {
                if (!glCanvas) {
                    return { width: 1, height: 1 };
                }
                const rect = glCanvas.getBoundingClientRect();
                let width = rect.width;
                let height = rect.height;
                if (!(width > 0) || !(height > 0)) {
                    const dpr = window.devicePixelRatio || 1;
                    width = glCanvas.width > 0 ? glCanvas.width / dpr : 1;
                    height = glCanvas.height > 0 ? glCanvas.height / dpr : 1;
                }
                return {
                    width: Math.max(1, width),
                    height: Math.max(1, height)
                };
            }

            function getPlotViewSignatureSteps() {
                const viewportSize = getPlotViewportCssSize();
                return {
                    x: Math.max(
                        Number.EPSILON,
                        Math.min(
                            BASE_PLOT_VIEW_SIGNATURE_STEP,
                            ((plotState.halfWidth * 2) / viewportSize.width) * PLOT_VIEW_SIGNATURE_PIXEL_FRACTION
                        )
                    ),
                    y: Math.max(
                        Number.EPSILON,
                        Math.min(
                            BASE_PLOT_VIEW_SIGNATURE_STEP,
                            ((plotState.halfHeight * 2) / viewportSize.height) * PLOT_VIEW_SIGNATURE_PIXEL_FRACTION
                        )
                    )
                };
            }

            function quantizePlotViewSignatureValue(value, step) {
                return (Math.round(value / step) * step).toExponential(12);
            }

            function densifySignature() {
                const signatureSteps = getPlotViewSignatureSteps();
                return [
                    quantizePlotViewSignatureValue(plotState.centerX, signatureSteps.x),
                    quantizePlotViewSignatureValue(plotState.centerY, signatureSteps.y),
                    quantizePlotViewSignatureValue(plotState.halfWidth, signatureSteps.x),
                    quantizePlotViewSignatureValue(plotState.halfHeight, signatureSteps.y)
                ].join('|');
            }

            function updateAspectDependentScale() {
                if (!glCanvas) {
                    return;
                }
                const rect = glCanvas.getBoundingClientRect();
                const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
                plotState.halfHeight = plotState.halfWidth / aspect;
            }

            function compileShader(type, source) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
                }
                return shader;
            }

            function createWebGLProgram(vertexSource, fragmentSource) {
                const program = gl.createProgram();
                const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
                const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
                gl.attachShader(program, vertexShader);
                gl.attachShader(program, fragmentShader);
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    throw new Error(gl.getProgramInfoLog(program) || 'Program link failed');
                }
                gl.deleteShader(vertexShader);
                gl.deleteShader(fragmentShader);
                return program;
            }

            function setupWebGL() {
                if (!gl) {
                    return;
                }
                const pointVertexSource = [
                    'attribute vec2 aPosition;',
                    'attribute vec3 aColor;',
                    'uniform vec2 uCenter;',
                    'uniform vec2 uScale;',
                    'uniform float uPointSize;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '  vec2 clip = (aPosition - uCenter) / uScale;',
                    '  gl_Position = vec4(clip, 0.0, 1.0);',
                    '  gl_PointSize = uPointSize;',
                    '  vColor = aColor;',
                    '}'
                ].join('\n');
                const pointFragmentSource = [
                    'precision mediump float;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '  vec2 centered = gl_PointCoord - vec2(0.5, 0.5);',
                    '  if (dot(centered, centered) > 0.25) {',
                    '    discard;',
                    '  }',
                    '  gl_FragColor = vec4(vColor, 1.0);',
                    '}'
                ].join('\n');
                const meshVertexSource = [
                    'attribute vec2 aPosition;',
                    'attribute vec3 aColor;',
                    'uniform vec2 uCenter;',
                    'uniform vec2 uScale;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '  vec2 clip = (aPosition - uCenter) / uScale;',
                    '  gl_Position = vec4(clip, 0.0, 1.0);',
                    '  vColor = aColor;',
                    '}'
                ].join('\n');
                const meshFragmentSource = [
                    'precision mediump float;',
                    'varying vec3 vColor;',
                    'void main() {',
                    '  gl_FragColor = vec4(vColor, 1.0);',
                    '}'
                ].join('\n');

                const program = createWebGLProgram(pointVertexSource, pointFragmentSource);
                const meshProgram = createWebGLProgram(meshVertexSource, meshFragmentSource);

                plotState.program = program;
                plotState.attribs = {
                    position: gl.getAttribLocation(program, 'aPosition'),
                    color: gl.getAttribLocation(program, 'aColor')
                };
                plotState.uniforms = {
                    center: gl.getUniformLocation(program, 'uCenter'),
                    scale: gl.getUniformLocation(program, 'uScale'),
                    pointSize: gl.getUniformLocation(program, 'uPointSize')
                };
                plotState.positionBuffer = gl.createBuffer();
                plotState.colorBuffer = gl.createBuffer();
                plotState.manualPositionBuffer = gl.createBuffer();
                plotState.manualColorBuffer = gl.createBuffer();
                plotState.meshProgram = meshProgram;
                plotState.meshAttribs = {
                    position: gl.getAttribLocation(meshProgram, 'aPosition'),
                    color: gl.getAttribLocation(meshProgram, 'aColor')
                };
                plotState.meshUniforms = {
                    center: gl.getUniformLocation(meshProgram, 'uCenter'),
                    scale: gl.getUniformLocation(meshProgram, 'uScale')
                };
                plotState.meshPositionBuffer = gl.createBuffer();
                plotState.meshColorBuffer = gl.createBuffer();

                gl.clearColor(0.984, 0.984, 0.976, 1);
            }

            function uploadPlotBuffers() {
                if (!gl || !plotState.program) {
                    return;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, plotState.points, gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.colorBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, plotState.colors, gl.DYNAMIC_DRAW);
                plotState.pendingUpload = false;
            }

            function uploadManualPlotBuffers() {
                if (!gl || !plotState.program) {
                    return;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.manualPositionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(plotState.manualPoints), gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.manualColorBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(plotState.manualColors), gl.DYNAMIC_DRAW);
                plotState.manualPendingUpload = false;
            }

            function uploadPlotMeshBuffers() {
                if (!gl || !plotState.meshProgram || !plotState.meshPositions || !plotState.meshColors) {
                    return;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.meshPositionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, plotState.meshPositions, gl.DYNAMIC_DRAW);
                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.meshColorBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, plotState.meshColors, gl.DYNAMIC_DRAW);
                plotState.meshPendingUpload = false;
            }

            function requestPlotDraw() {
                if (plotState.drawScheduled) {
                    return;
                }
                plotState.drawScheduled = true;
                requestAnimationFrame(function() {
                    plotState.drawScheduled = false;
                    drawPlot();
                });
            }

            function updatePlotHoverTrackerButton() {
                if (!plotHoverTrackToggle) {
                    return;
                }
                plotHoverTrackToggle.textContent = 'Mouse sequence tracker: ' + (plotState.hoverTrackerEnabled ? 'On' : 'Off');
                plotHoverTrackToggle.setAttribute('aria-pressed', plotState.hoverTrackerEnabled ? 'true' : 'false');
                plotHoverTrackToggle.classList.toggle('button-primary', plotState.hoverTrackerEnabled);
                if (glCanvas) {
                    glCanvas.classList.toggle('tracking', plotState.hoverTrackerEnabled);
                }
            }

            function clearPlotHoverTracker() {
                const hadHover = !!plotState.hoverTrackerResult;
                plotState.pendingHoverPoint = null;
                if (plotState.hoverFrameId != null) {
                    cancelAnimationFrame(plotState.hoverFrameId);
                    plotState.hoverFrameId = null;
                }
                plotState.hoverTrackerResult = null;
                if (hadHover) {
                    requestPlotDraw();
                }
            }

            function buildPlotHoverSequenceResult(real, imag) {
                return evaluateComplexSequence(
                    real,
                    imag,
                    COMPLEX_PREVIEW_POINT_COUNT,
                    'gradient',
                    undefined,
                    getActivePlotColorSchemeKey()
                );
            }

            function requestPlotHoverSequence(point) {
                if (!plotState.hoverTrackerEnabled || !isPlotSectionActive()) {
                    return;
                }
                plotState.pendingHoverPoint = point;
                if (plotState.hoverFrameId != null) {
                    return;
                }
                plotState.hoverFrameId = requestAnimationFrame(function() {
                    plotState.hoverFrameId = null;
                    const nextPoint = plotState.pendingHoverPoint;
                    plotState.pendingHoverPoint = null;
                    if (!plotState.hoverTrackerEnabled || !nextPoint) {
                        return;
                    }
                    plotState.hoverTrackerResult = buildPlotHoverSequenceResult(nextPoint.real, nextPoint.imag);
                    requestPlotDraw();
                });
            }

            function drawOverlay() {
                if (!overlayCtx) {
                    return;
                }
                const size = resizeCanvasToDisplaySize(overlayCanvas);
                const width = size.width;
                const height = size.height;
                overlayCtx.clearRect(0, 0, width, height);

                function worldToScreen(real, imag) {
                    return {
                        x: ((real - plotState.centerX) / plotState.halfWidth) * (width / 2) + width / 2,
                        y: height / 2 - ((imag - plotState.centerY) / plotState.halfHeight) * (height / 2)
                    };
                }

                const realRange = {
                    min: plotState.centerX - plotState.halfWidth * (1 + COMPLEX_PLANE_EDGE_MARGIN),
                    max: plotState.centerX + plotState.halfWidth * (1 + COMPLEX_PLANE_EDGE_MARGIN)
                };
                const imagRange = {
                    min: plotState.centerY - plotState.halfHeight * (1 + COMPLEX_PLANE_EDGE_MARGIN),
                    max: plotState.centerY + plotState.halfHeight * (1 + COMPLEX_PLANE_EDGE_MARGIN)
                };

                function worldToClampedScreen(real, imag) {
                    return worldToScreen(
                        clampForDisplay(real, realRange),
                        clampForDisplay(imag, imagRange)
                    );
                }

                const origin = worldToScreen(0, 0);
                overlayCtx.strokeStyle = 'rgba(91, 106, 132, 0.28)';
                overlayCtx.lineWidth = 1.2 * size.dpr;
                overlayCtx.beginPath();
                overlayCtx.moveTo(0, origin.y);
                overlayCtx.lineTo(width, origin.y);
                overlayCtx.moveTo(origin.x, 0);
                overlayCtx.lineTo(origin.x, height);
                overlayCtx.stroke();

                overlayCtx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
                overlayCtx.strokeRect(0.5 * size.dpr, 0.5 * size.dpr, width - size.dpr, height - size.dpr);

                if (plotState.hoverTrackerEnabled && plotState.hoverTrackerResult && plotState.hoverTrackerResult.entries.length) {
                    const hoverResult = plotState.hoverTrackerResult;
                    const trackerPoints = hoverResult.entries.map(function(entry) {
                        return worldToClampedScreen(entry.real, entry.imag);
                    });
                    const hoverPoint = worldToClampedScreen(hoverResult.cReal, hoverResult.cImag);

                    if (trackerPoints.length > 1) {
                        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
                        overlayCtx.lineWidth = 4.2 * size.dpr;
                        overlayCtx.beginPath();
                        trackerPoints.forEach(function(point, index) {
                            if (index === 0) {
                                overlayCtx.moveTo(point.x, point.y);
                            } else {
                                overlayCtx.lineTo(point.x, point.y);
                            }
                        });
                        overlayCtx.stroke();

                        overlayCtx.strokeStyle = hoverResult.pointColorCss;
                        overlayCtx.lineWidth = 2.2 * size.dpr;
                        overlayCtx.beginPath();
                        trackerPoints.forEach(function(point, index) {
                            if (index === 0) {
                                overlayCtx.moveTo(point.x, point.y);
                            } else {
                                overlayCtx.lineTo(point.x, point.y);
                            }
                        });
                        overlayCtx.stroke();
                    }

                    trackerPoints.forEach(function(point, index) {
                        overlayCtx.fillStyle = hoverResult.pointColorCss;
                        overlayCtx.beginPath();
                        overlayCtx.arc(point.x, point.y, (index === 0 ? 4.8 : 4.1) * size.dpr, 0, Math.PI * 2);
                        overlayCtx.fill();
                        overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                        overlayCtx.lineWidth = 1.3 * size.dpr;
                        overlayCtx.stroke();
                    });

                    overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
                    overlayCtx.lineWidth = 4.8 * size.dpr;
                    overlayCtx.beginPath();
                    overlayCtx.arc(hoverPoint.x, hoverPoint.y, 8 * size.dpr, 0, Math.PI * 2);
                    overlayCtx.stroke();
                    overlayCtx.beginPath();
                    overlayCtx.moveTo(hoverPoint.x - 11 * size.dpr, hoverPoint.y);
                    overlayCtx.lineTo(hoverPoint.x + 11 * size.dpr, hoverPoint.y);
                    overlayCtx.moveTo(hoverPoint.x, hoverPoint.y - 11 * size.dpr);
                    overlayCtx.lineTo(hoverPoint.x, hoverPoint.y + 11 * size.dpr);
                    overlayCtx.stroke();

                    overlayCtx.strokeStyle = '#0f766e';
                    overlayCtx.lineWidth = 2.4 * size.dpr;
                    overlayCtx.beginPath();
                    overlayCtx.arc(hoverPoint.x, hoverPoint.y, 8 * size.dpr, 0, Math.PI * 2);
                    overlayCtx.stroke();
                    overlayCtx.beginPath();
                    overlayCtx.moveTo(hoverPoint.x - 11 * size.dpr, hoverPoint.y);
                    overlayCtx.lineTo(hoverPoint.x + 11 * size.dpr, hoverPoint.y);
                    overlayCtx.moveTo(hoverPoint.x, hoverPoint.y - 11 * size.dpr);
                    overlayCtx.lineTo(hoverPoint.x, hoverPoint.y + 11 * size.dpr);
                    overlayCtx.stroke();
                }

                if (plotState.selectedPoint) {
                    const screen = worldToScreen(plotState.selectedPoint.real, plotState.selectedPoint.imag);
                    overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
                    overlayCtx.lineWidth = 4.8 * size.dpr;
                    overlayCtx.beginPath();
                    overlayCtx.arc(screen.x, screen.y, 8 * size.dpr, 0, Math.PI * 2);
                    overlayCtx.stroke();
                    overlayCtx.beginPath();
                    overlayCtx.moveTo(screen.x - 11 * size.dpr, screen.y);
                    overlayCtx.lineTo(screen.x + 11 * size.dpr, screen.y);
                    overlayCtx.moveTo(screen.x, screen.y - 11 * size.dpr);
                    overlayCtx.lineTo(screen.x, screen.y + 11 * size.dpr);
                    overlayCtx.stroke();
                    overlayCtx.strokeStyle = plotState.selectedPoint.pointColorCss;
                    overlayCtx.lineWidth = 2.4 * size.dpr;
                    overlayCtx.beginPath();
                    overlayCtx.arc(screen.x, screen.y, 8 * size.dpr, 0, Math.PI * 2);
                    overlayCtx.stroke();
                    overlayCtx.beginPath();
                    overlayCtx.moveTo(screen.x - 11 * size.dpr, screen.y);
                    overlayCtx.lineTo(screen.x + 11 * size.dpr, screen.y);
                    overlayCtx.moveTo(screen.x, screen.y - 11 * size.dpr);
                    overlayCtx.lineTo(screen.x, screen.y + 11 * size.dpr);
                    overlayCtx.stroke();
                }
            }

            function getDensityIndexForCurrentPoints() {
                const sameView = densifySignature() === plotState.densifySignature;
                if (!sameView || plotState.densityLevel === 0) {
                    return 0;
                }
                return plotState.densifyInProgress
                    ? clamp(plotState.densityLevel, 0, MAX_DENSITY_LEVEL - 1)
                    : clamp(plotState.densityLevel - 1, 0, MAX_DENSITY_LEVEL - 1);
            }

            function getPlotPointSize(size) {
                const columns = DENSITY_COLUMNS_BY_LEVEL[getDensityIndexForCurrentPoints()];
                const rows = Math.max(18, Math.round(columns * (plotState.halfHeight / plotState.halfWidth)));
                const spacing = Math.min(
                    size.cssWidth / Math.max(1, columns),
                    size.cssHeight / Math.max(1, rows)
                );
                return clamp(spacing * 0.52, 2.2, 9.5) * size.dpr;
            }

            function buildPlotMeshFromSamples(gridSamples) {
                if (!gridSamples || !gridSamples.positions || !gridSamples.colors) {
                    plotState.meshPositions = null;
                    plotState.meshColors = null;
                    plotState.meshStrips = [];
                    plotState.meshVertexCount = 0;
                    plotState.meshSignature = '';
                    plotState.meshPendingUpload = false;
                    return;
                }
                const sampleColumns = gridSamples.columns + 1;
                const stripVertexCount = sampleColumns * 2;
                const stripCount = gridSamples.rows;
                const meshPositions = new Float32Array(stripCount * stripVertexCount * 2);
                const meshColors = new Float32Array(stripCount * stripVertexCount * 3);
                const meshStrips = [];
                let vertexOffset = 0;
                for (let row = 0; row < gridSamples.rows; row += 1) {
                    const stripFirst = vertexOffset;
                    for (let column = 0; column < sampleColumns; column += 1) {
                        const topIndex = row * sampleColumns + column;
                        const bottomIndex = (row + 1) * sampleColumns + column;
                        meshPositions[vertexOffset * 2] = gridSamples.positions[topIndex * 2];
                        meshPositions[vertexOffset * 2 + 1] = gridSamples.positions[topIndex * 2 + 1];
                        meshColors[vertexOffset * 3] = gridSamples.colors[topIndex * 3];
                        meshColors[vertexOffset * 3 + 1] = gridSamples.colors[topIndex * 3 + 1];
                        meshColors[vertexOffset * 3 + 2] = gridSamples.colors[topIndex * 3 + 2];
                        vertexOffset += 1;

                        meshPositions[vertexOffset * 2] = gridSamples.positions[bottomIndex * 2];
                        meshPositions[vertexOffset * 2 + 1] = gridSamples.positions[bottomIndex * 2 + 1];
                        meshColors[vertexOffset * 3] = gridSamples.colors[bottomIndex * 3];
                        meshColors[vertexOffset * 3 + 1] = gridSamples.colors[bottomIndex * 3 + 1];
                        meshColors[vertexOffset * 3 + 2] = gridSamples.colors[bottomIndex * 3 + 2];
                        vertexOffset += 1;
                    }
                    meshStrips.push({
                        first: stripFirst,
                        count: vertexOffset - stripFirst
                    });
                }
                plotState.meshPositions = meshPositions;
                plotState.meshColors = meshColors;
                plotState.meshStrips = meshStrips;
                plotState.meshVertexCount = vertexOffset;
                plotState.meshSignature = gridSamples.signature;
                plotState.meshPendingUpload = true;
            }

            function ensurePlotMeshReady() {
                if (!plotState.meshEnabled || !plotState.lastGridSamples) {
                    return;
                }
                if (plotState.meshSignature === plotState.lastGridSamples.signature && plotState.meshVertexCount > 0) {
                    return;
                }
                buildPlotMeshFromSamples(plotState.lastGridSamples);
            }

            function hasRenderablePlotMesh() {
                return plotState.meshEnabled && plotState.meshVertexCount > 0;
            }

            function drawPlotPoints(positionBuffer, colorBuffer, vertexCount, pointSize) {
                if (!vertexCount) {
                    return;
                }
                gl.useProgram(plotState.program);
                gl.uniform2f(plotState.uniforms.center, plotState.centerX, plotState.centerY);
                gl.uniform2f(plotState.uniforms.scale, plotState.halfWidth, plotState.halfHeight);
                gl.uniform1f(plotState.uniforms.pointSize, pointSize);

                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                gl.enableVertexAttribArray(plotState.attribs.position);
                gl.vertexAttribPointer(plotState.attribs.position, 2, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
                gl.enableVertexAttribArray(plotState.attribs.color);
                gl.vertexAttribPointer(plotState.attribs.color, 3, gl.FLOAT, false, 0, 0);

                gl.drawArrays(gl.POINTS, 0, vertexCount);
            }

            function drawPlotMesh() {
                if (!plotState.meshVertexCount) {
                    return;
                }
                gl.useProgram(plotState.meshProgram);
                gl.uniform2f(plotState.meshUniforms.center, plotState.centerX, plotState.centerY);
                gl.uniform2f(plotState.meshUniforms.scale, plotState.halfWidth, plotState.halfHeight);

                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.meshPositionBuffer);
                gl.enableVertexAttribArray(plotState.meshAttribs.position);
                gl.vertexAttribPointer(plotState.meshAttribs.position, 2, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, plotState.meshColorBuffer);
                gl.enableVertexAttribArray(plotState.meshAttribs.color);
                gl.vertexAttribPointer(plotState.meshAttribs.color, 3, gl.FLOAT, false, 0, 0);

                plotState.meshStrips.forEach(function(strip) {
                    gl.drawArrays(gl.TRIANGLE_STRIP, strip.first, strip.count);
                });
            }

            function drawPlot() {
                if (!gl || !plotState.supported || !isPlotSectionActive()) {
                    return;
                }
                const glSize = resizeCanvasToDisplaySize(glCanvas);
                resizeCanvasToDisplaySize(overlayCanvas);
                updateAspectDependentScale();

                gl.viewport(0, 0, glSize.width, glSize.height);
                gl.clear(gl.COLOR_BUFFER_BIT);

                if (plotState.pendingUpload) {
                    uploadPlotBuffers();
                }
                if (plotState.manualPendingUpload) {
                    uploadManualPlotBuffers();
                }
                if (plotState.meshEnabled) {
                    ensurePlotMeshReady();
                    if (plotState.meshPendingUpload) {
                        uploadPlotMeshBuffers();
                    }
                }

                if (hasRenderablePlotMesh()) {
                    drawPlotMesh();
                } else {
                    drawPlotPoints(
                        plotState.positionBuffer,
                        plotState.colorBuffer,
                        plotState.points.length / 2,
                        getPlotPointSize(glSize)
                    );
                }
                drawPlotPoints(
                    plotState.manualPositionBuffer,
                    plotState.manualColorBuffer,
                    plotState.manualPoints.length / 2,
                    Math.max(getPlotPointSize(glSize), 7 * glSize.dpr)
                );

                plotCenterPill.textContent = 'Center: ' + formatComplex(plotState.centerX, plotState.centerY);
                plotScalePill.textContent = 'Width: ' + formatNumber(plotState.halfWidth * 2);
                plotDensityPill.textContent = 'Grid level: ' + (densifySignature() === plotState.densifySignature ? plotState.densityLevel : 0);
                drawOverlay();
            }

            function addPlotPoint(real, imag, classification) {
                const colorScheme = getMandelbrotColorScheme(getActivePlotColorSchemeKey());
                const rgb = classification && classification.pointColorRgb
                    ? classification.pointColorRgb
                    : colorScheme.interiorRgb;
                addManualPlotPointWithFloats(
                    real,
                    imag,
                    rgb[0] / 255,
                    rgb[1] / 255,
                    rgb[2] / 255
                );
            }

            function addManualPlotPointWithFloats(real, imag, red, green, blue) {
                plotState.manualPoints.push(real, imag);
                plotState.manualColors.push(red, green, blue);
                plotState.manualPendingUpload = true;
            }


            function selectPlotPoint(real, imag) {
                const iterations = clamp(Math.round(safeNumber(plotIterationsInput.value, 80)), 10, 500);
                const result = evaluateComplexSequence(
                    real,
                    imag,
                    iterations + 1,
                    'gradient',
                    undefined,
                    getActivePlotColorSchemeKey()
                );
                addPlotPoint(real, imag, result);
                plotState.selectedPoint = {
                    real: real,
                    imag: imag,
                    stayedSmall: result.stayedSmall,
                    pointColorCss: result.pointColorCss
                };
                setStatusPill(plotStatus, result, result.stayedSmall ? 'Last tested point stayed small' : 'Last tested point escaped');
                requestPlotDraw();
            }

            function screenToWorld(clientX, clientY) {
                const rect = glCanvas.getBoundingClientRect();
                const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
                const normalizedY = 1 - ((clientY - rect.top) / rect.height) * 2;
                return {
                    real: plotState.centerX + normalizedX * plotState.halfWidth,
                    imag: plotState.centerY + normalizedY * plotState.halfHeight
                };
            }

            function getNormalizedWheelDeltaY(event) {
                let deltaY = event.deltaY;
                if (event.deltaMode === 1) {
                    deltaY *= 16;
                } else if (event.deltaMode === 2) {
                    deltaY *= Math.max(window.innerHeight, 1);
                }
                return clamp(deltaY, -240, 240);
            }

            function updateDensifyButtonLabel() {
                const sameView = densifySignature() === plotState.densifySignature;
                const levelForView = sameView ? plotState.densityLevel : 0;
                plotDensifyButton.textContent = 'Compute Grid';
                plotDensifyButton.disabled = plotState.densifyInProgress || levelForView >= MAX_DENSITY_LEVEL;
            }

            function resetPlot() {
                cancelPlotAutoDensify();
                plotState.centerX = -0.5;
                plotState.centerY = 0;
                plotState.halfWidth = DEFAULT_VIEW_HALF_WIDTH;
                updateAspectDependentScale();
                cancelPlotDensify();
                invalidatePlotGridData();
                plotState.manualPoints = [];
                plotState.manualColors = [];
                plotState.selectedPoint = null;
                plotState.manualPendingUpload = true;
                clearPlotHoverTracker();
                setStatusPill(plotStatus, true, 'No points yet');
                updateDensifyButtonLabel();
                requestPlotDraw();
            }

            function resetPlotViewport() {
                cancelPlotAutoDensify();
                cancelPlotDensify('Sampling canceled');
                invalidatePlotGridData();
                plotState.centerX = -0.5;
                plotState.centerY = 0;
                plotState.halfWidth = DEFAULT_VIEW_HALF_WIDTH;
                updateAspectDependentScale();
                clearPlotHoverTracker();
                updateDensifyButtonLabel();
                requestPlotDraw();
            }

            function densifyCurrentView(options) {
                options = options || {};
                cancelPlotAutoDensify();
                const signature = densifySignature();
                if (signature !== plotState.densifySignature) {
                    markPlotGridDataStale();
                }
                if (options.mode === 'auto' && plotState.densityLevel >= getPlotTargetDensityLevel()) {
                    updateDensifyButtonLabel();
                    requestPlotDraw();
                    return;
                }
                if (plotState.densifyInProgress || plotState.densityLevel >= MAX_DENSITY_LEVEL) {
                    updateDensifyButtonLabel();
                    requestPlotDraw();
                    return;
                }

                const level = plotState.densityLevel;
                const columns = DENSITY_COLUMNS_BY_LEVEL[level];
                const rows = Math.max(18, Math.round(columns * (plotState.halfHeight / plotState.halfWidth)));
                const minReal = plotState.centerX - plotState.halfWidth;
                const maxReal = plotState.centerX + plotState.halfWidth;
                const minImag = plotState.centerY - plotState.halfHeight;
                const maxImag = plotState.centerY + plotState.halfHeight;
                const maxIterations = clamp(Math.round(safeNumber(plotIterationsInput.value, 80)), 10, 500);
                const colorSchemeKey = getActivePlotColorSchemeKey();
                const realStep = (maxReal - minReal) / Math.max(1, columns);
                const imagStep = (maxImag - minImag) / Math.max(1, rows);
                const totalPoints = (rows + 1) * (columns + 1);
                const gridPositions = new Float32Array(totalPoints * 2);
                const gridColors = new Float32Array(totalPoints * 3);
                const jobId = plotState.activeDensifyJobId + 1;
                plotState.activeDensifyJobId = jobId;

                plotState.densifyInProgress = true;
                plotState.densifyFrameId = null;
                updateDensifyButtonLabel();
                setStatusPill(plotStatus, true, 'Sampling ' + totalPoints + ' points in the current view...');

                let sampled = 0;
                let xIndex = 0;
                let yIndex = 0;

                function processChunk() {
                    if (plotState.activeDensifyJobId !== jobId) {
                        return;
                    }
                    const start = performance.now();
                    while (sampled < totalPoints && performance.now() - start < 12) {
                        const real = minReal + xIndex * realStep;
                        const imag = minImag + yIndex * imagStep;
                        const rgb = classifyAndAddPlotPoint(real, imag, maxIterations, colorSchemeKey);
                        gridPositions[sampled * 2] = real;
                        gridPositions[sampled * 2 + 1] = imag;
                        gridColors[sampled * 3] = rgb[0];
                        gridColors[sampled * 3 + 1] = rgb[1];
                        gridColors[sampled * 3 + 2] = rgb[2];
                        sampled += 1;
                        xIndex += 1;
                        if (xIndex > columns) {
                            xIndex = 0;
                            yIndex += 1;
                        }
                    }

                    requestPlotDraw();

                    if (sampled < totalPoints) {
                        plotState.densifyFrameId = requestAnimationFrame(processChunk);
                    } else {
                        if (plotState.activeDensifyJobId !== jobId) {
                            return;
                        }
                        setPlotGridData(gridPositions, gridColors);
                        plotState.lastGridSamples = {
                            signature: signature,
                            columns: columns,
                            rows: rows,
                            positions: gridPositions,
                            colors: gridColors
                        };
                        if (plotState.meshEnabled) {
                            buildPlotMeshFromSamples(plotState.lastGridSamples);
                        } else {
                            clearPlotMeshData();
                        }
                        plotState.densifySignature = signature;
                        plotState.densityLevel = Math.min(MAX_DENSITY_LEVEL, level + 1);
                        plotState.densifyInProgress = false;
                        plotState.densifyFrameId = null;
                        updateDensifyButtonLabel();
                        setStatusPill(plotStatus, true, 'Sampled ' + sampled + ' points at grid level ' + plotState.densityLevel);
                        if (plotState.autoDensifyEnabled && plotState.densityLevel < getPlotTargetDensityLevel()) {
                            schedulePlotAutoDensify(0);
                        }
                        requestPlotDraw();
                    }
                }
                plotState.densifyFrameId = requestAnimationFrame(processChunk);
            }

            function handleWheel(event) {
                event.preventDefault();
                const world = screenToWorld(event.clientX, event.clientY);
                const rect = glCanvas.getBoundingClientRect();
                const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const normalizedY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
                const zoomFactor = Math.exp(getNormalizedWheelDeltaY(event) * 0.0015);
                plotState.halfWidth = clamp(plotState.halfWidth * zoomFactor, MIN_PLOT_VIEW_HALF_WIDTH, MAX_PLOT_VIEW_HALF_WIDTH);
                updateAspectDependentScale();
                plotState.centerX = world.real - normalizedX * plotState.halfWidth;
                plotState.centerY = world.imag - normalizedY * plotState.halfHeight;
                cancelPlotDensify('Sampling canceled');
                if (plotState.densityLevel !== 0 || plotState.densifySignature || plotState.lastGridSamples) {
                    markPlotGridDataStale();
                }
                updateDensifyButtonLabel();
                schedulePlotAutoDensify();
                requestPlotHoverSequence(world);
                requestPlotDraw();
            }

            function handlePointerDown(event) {
                cancelPlotAutoDensify();
                plotState.drag = {
                    startX: event.clientX,
                    startY: event.clientY,
                    centerX: plotState.centerX,
                    centerY: plotState.centerY
                };
                plotState.dragChangedView = false;
                clearPlotHoverTracker();
                glCanvas.classList.add('dragging');
                glCanvas.setPointerCapture(event.pointerId);
            }

            function handlePointerMove(event) {
                if (!plotState.drag) {
                    requestPlotHoverSequence(screenToWorld(event.clientX, event.clientY));
                    return;
                }
                const rect = glCanvas.getBoundingClientRect();
                const dx = event.clientX - plotState.drag.startX;
                const dy = event.clientY - plotState.drag.startY;
                plotState.centerX = plotState.drag.centerX - (dx / rect.width) * plotState.halfWidth * 2;
                plotState.centerY = plotState.drag.centerY + (dy / rect.height) * plotState.halfHeight * 2;
                cancelPlotDensify('Sampling canceled');
                if (plotState.densityLevel !== 0 || plotState.densifySignature || plotState.lastGridSamples) {
                    markPlotGridDataStale();
                }
                plotState.dragChangedView = true;
                updateDensifyButtonLabel();
                schedulePlotAutoDensify();
                requestPlotDraw();
            }

            function handlePointerUp(event) {
                const shouldScheduleAutoDensify = plotState.dragChangedView;
                if (plotState.drag) {
                    glCanvas.releasePointerCapture(event.pointerId);
                }
                glCanvas.classList.remove('dragging');
                plotState.drag = null;
                plotState.dragChangedView = false;
                if (plotState.hoverTrackerEnabled && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
                    requestPlotHoverSequence(screenToWorld(event.clientX, event.clientY));
                }
                if (shouldScheduleAutoDensify) {
                    schedulePlotAutoDensify();
                }
            }

            function handlePlotPointerLeave(event) {
                handlePointerUp(event);
                clearPlotHoverTracker();
            }

            function initializePlotInteractions() {
                if (!glCanvas) {
                    return;
                }
                glCanvas.addEventListener('wheel', handleWheel, { passive: false });
                glCanvas.addEventListener('pointerdown', handlePointerDown);
                glCanvas.addEventListener('pointermove', handlePointerMove);
                glCanvas.addEventListener('pointerup', handlePointerUp);
                glCanvas.addEventListener('pointerleave', handlePlotPointerLeave);
                glCanvas.addEventListener('dblclick', function(event) {
                    const world = screenToWorld(event.clientX, event.clientY);
                    selectPlotPoint(world.real, world.imag);
                });
            }

            Array.prototype.forEach.call(document.querySelectorAll('.plot-preset'), function(button) {
                button.addEventListener('click', function() {
                    selectPlotPoint(
                        Number(button.getAttribute('data-real')),
                        Number(button.getAttribute('data-imag'))
                    );
                });
            });

            plotResetButton.addEventListener('click', function() {
                resetPlot();
            });

            plotResetViewButton.addEventListener('click', function() {
                resetPlotViewport();
            });

            plotDensifyButton.addEventListener('click', function() {
                if (densifySignature() === plotState.densifySignature && plotState.densityLevel >= getPlotTargetDensityLevel()) {
                    plotState.targetDensityLevel = Math.min(MAX_DENSITY_LEVEL, getPlotTargetDensityLevel() + 1);
                }
                densifyCurrentView({ mode: 'manual' });
            });
            if (plotColorSchemeSelect) {
                plotColorSchemeSelect.value = plotState.colorSchemeKey;
                plotColorSchemeSelect.addEventListener('change', function() {
                    if (!MANDELBROT_COLOR_SCHEMES[plotColorSchemeSelect.value]) {
                        plotColorSchemeSelect.value = plotState.colorSchemeKey;
                        return;
                    }
                    plotState.colorSchemeKey = plotColorSchemeSelect.value;
                    cancelPlotDensify();
                    refreshPlotColors();
                });
            }

            if (plotMeshToggle) {
                plotMeshToggle.addEventListener('change', function() {
                    plotState.meshEnabled = !!plotMeshToggle.checked;
                    if (plotState.meshEnabled) {
                        ensurePlotMeshReady();
                    }
                    requestPlotDraw();
                });
            }

            if (plotAutoDensifyToggle) {
                plotAutoDensifyToggle.checked = plotState.autoDensifyEnabled;
                plotAutoDensifyToggle.addEventListener('change', function() {
                    plotState.autoDensifyEnabled = !!plotAutoDensifyToggle.checked;
                    if (plotState.autoDensifyEnabled) {
                        if (!hasReachedPlotTargetDensityForView()) {
                            schedulePlotAutoDensify();
                        }
                    } else {
                        cancelPlotAutoDensify();
                    }
                });
            }

            if (plotHoverTrackToggle) {
                plotHoverTrackToggle.addEventListener('click', function() {
                    plotState.hoverTrackerEnabled = !plotState.hoverTrackerEnabled;
                    if (!plotState.hoverTrackerEnabled) {
                        clearPlotHoverTracker();
                    }
                    updatePlotHoverTrackerButton();
                });
            }

            plotIterationsInput.addEventListener('change', function() {
                plotIterationsInput.value = clamp(Math.round(safeNumber(plotIterationsInput.value, 80)), 10, 500);
                resetPlot();
            });

            if (plotFullscreenButton) {
                plotFullscreenButton.addEventListener('click', function() {
                    togglePlotFullscreen();
                });
            }

            document.addEventListener('fullscreenchange', handlePlotFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handlePlotFullscreenChange);

            function getCardioidGeometry(angle) {
                const radius = 0.25;
                const fixedCenter = { x: 0, y: 0 };
                const rollingCenter = {
                    x: 2 * radius * Math.cos(angle),
                    y: 2 * radius * Math.sin(angle)
                };
                const contactPoint = {
                    x: radius * Math.cos(angle),
                    y: radius * Math.sin(angle)
                };
                const tracePoint = {
                    x: rollingCenter.x - radius * Math.cos(2 * angle),
                    y: rollingCenter.y - radius * Math.sin(2 * angle)
                };
                return {
                    radius: radius,
                    fixedCenter: fixedCenter,
                    rollingCenter: rollingCenter,
                    contactPoint: contactPoint,
                    tracePoint: tracePoint
                };
            }

            function cardioidWorldToCanvas(x, y, size) {
                const world = { minX: -0.98, maxX: 0.48, minY: -0.86, maxY: 0.86 };
                const pad = 28 * size.dpr;
                const usableWidth = size.width - pad * 2;
                const usableHeight = size.height - pad * 2;
                const scale = Math.min(
                    usableWidth / (world.maxX - world.minX),
                    usableHeight / (world.maxY - world.minY)
                );
                const centerX = (world.minX + world.maxX) / 2;
                const centerY = (world.minY + world.maxY) / 2;
                return {
                    x: size.width / 2 + (x - centerX) * scale,
                    y: size.height / 2 - (y - centerY) * scale
                };
            }

            function drawWorldCircle(ctx, size, center, radius, strokeStyle, lineWidth) {
                const canvasCenter = cardioidWorldToCanvas(center.x, center.y, size);
                const canvasEdge = cardioidWorldToCanvas(center.x + radius, center.y, size);
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.arc(canvasCenter.x, canvasCenter.y, Math.abs(canvasEdge.x - canvasCenter.x), 0, Math.PI * 2);
                ctx.stroke();
            }

            function updateCardioidButton() {
                if (!cardioidPlayButton) {
                    return;
                }
                if (cardioidState.playing) {
                    cardioidPlayButton.textContent = 'Pause';
                } else {
                    cardioidPlayButton.textContent = 'Play';
                }
            }

            function drawCardioidScene() {
                if (!cardioidCanvas) {
                    return;
                }
                const ctx = cardioidCanvas.getContext('2d');
                const size = resizeCanvasToDisplaySize(cardioidCanvas);
                const width = size.width;
                const height = size.height;
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);

                const geometry = getCardioidGeometry(cardioidState.angle);
                const fixedCenter = cardioidWorldToCanvas(geometry.fixedCenter.x, geometry.fixedCenter.y, size);
                const rollingCenter = cardioidWorldToCanvas(geometry.rollingCenter.x, geometry.rollingCenter.y, size);
                const contactPoint = cardioidWorldToCanvas(geometry.contactPoint.x, geometry.contactPoint.y, size);
                const tracePoint = cardioidWorldToCanvas(geometry.tracePoint.x, geometry.tracePoint.y, size);

                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 1.1 * size.dpr;
                ctx.beginPath();
                ctx.moveTo(0, fixedCenter.y);
                ctx.lineTo(width, fixedCenter.y);
                ctx.moveTo(fixedCenter.x, 0);
                ctx.lineTo(fixedCenter.x, height);
                ctx.stroke();

                if (cardioidState.trace.length > 1) {
                    ctx.strokeStyle = '#7c3aed';
                    ctx.lineWidth = 2.4 * size.dpr;
                    ctx.beginPath();
                    cardioidState.trace.forEach(function(point, index) {
                        const canvasPoint = cardioidWorldToCanvas(point.x, point.y, size);
                        if (index === 0) {
                            ctx.moveTo(canvasPoint.x, canvasPoint.y);
                        } else {
                            ctx.lineTo(canvasPoint.x, canvasPoint.y);
                        }
                    });
                    ctx.stroke();
                }

                drawWorldCircle(ctx, size, geometry.fixedCenter, geometry.radius, '#94a3b8', 2 * size.dpr);
                drawWorldCircle(ctx, size, geometry.rollingCenter, geometry.radius, '#0f766e', 2 * size.dpr);

                ctx.strokeStyle = '#fb923c';
                ctx.lineWidth = 2 * size.dpr;
                ctx.beginPath();
                ctx.moveTo(rollingCenter.x, rollingCenter.y);
                ctx.lineTo(tracePoint.x, tracePoint.y);
                ctx.stroke();

                ctx.strokeStyle = '#64748b';
                ctx.setLineDash([5 * size.dpr, 5 * size.dpr]);
                ctx.beginPath();
                ctx.moveTo(fixedCenter.x, fixedCenter.y);
                ctx.lineTo(contactPoint.x, contactPoint.y);
                ctx.lineTo(rollingCenter.x, rollingCenter.y);
                ctx.stroke();
                ctx.setLineDash([]);

                [
                    { point: fixedCenter, color: '#64748b' },
                    { point: rollingCenter, color: '#0f766e' },
                    { point: tracePoint, color: '#fb923c' }
                ].forEach(function(item) {
                    ctx.fillStyle = item.color;
                    ctx.beginPath();
                    ctx.arc(item.point.x, item.point.y, 5 * size.dpr, 0, Math.PI * 2);
                    ctx.fill();
                });

                ctx.fillStyle = '#5f6b84';
                ctx.font = (12 * size.dpr) + 'px Arial';
                ctx.fillText('fixed circle', fixedCenter.x - 38 * size.dpr, fixedCenter.y - 20 * size.dpr);
                ctx.fillText('rolling circle', rollingCenter.x - 44 * size.dpr, rollingCenter.y - 20 * size.dpr);
                ctx.fillText('trace point', tracePoint.x + 10 * size.dpr, tracePoint.y - 10 * size.dpr);
            }

            function appendCardioidTracePoint() {
                const point = getCardioidGeometry(cardioidState.angle).tracePoint;
                const previous = cardioidState.trace[cardioidState.trace.length - 1];
                if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.000001) {
                    cardioidState.trace.push(point);
                }
            }

            function stopCardioidAnimation() {
                if (cardioidState.animationFrameId) {
                    cancelAnimationFrame(cardioidState.animationFrameId);
                }
                cardioidState.animationFrameId = null;
            }

            function startCardioidAnimation() {
                if (!cardioidState.initialized || !cardioidState.playing || cardioidState.animationFrameId != null || cardioidState.angle >= Math.PI * 2 || !isCardioidSectionActive()) {
                    return;
                }
                cardioidState.lastTimestamp = null;
                cardioidState.animationFrameId = requestAnimationFrame(stepCardioidAnimation);
            }

            function ensureCardioidAnimationInitialized() {
                if (cardioidState.initialized || !cardioidCanvas) {
                    return;
                }
                resetCardioidAnimation(cardioidState.playing);
            }

            function stepCardioidAnimation(timestamp) {
                cardioidState.animationFrameId = null;
                if (!cardioidState.playing || !isCardioidSectionActive()) {
                    cardioidState.lastTimestamp = null;
                    return;
                }
                if (cardioidState.lastTimestamp == null) {
                    cardioidState.lastTimestamp = timestamp;
                }
                const delta = timestamp - cardioidState.lastTimestamp;
                cardioidState.lastTimestamp = timestamp;
                cardioidState.angle = Math.min(Math.PI * 2, cardioidState.angle + delta * 0.00115);
                appendCardioidTracePoint();
                drawCardioidScene();

                if (cardioidState.angle >= Math.PI * 2) {
                    cardioidState.playing = false;
                    cardioidState.lastTimestamp = null;
                    updateCardioidButton();
                    return;
                }

                cardioidState.animationFrameId = requestAnimationFrame(stepCardioidAnimation);
            }

            function resetCardioidAnimation(autoplay) {
                stopCardioidAnimation();
                cardioidState.initialized = true;
                cardioidState.angle = 0;
                cardioidState.lastTimestamp = null;
                cardioidState.playing = autoplay;
                cardioidState.trace = [];
                appendCardioidTracePoint();
                drawCardioidScene();
                updateCardioidButton();
                startCardioidAnimation();
            }

            if (cardioidPlayButton) {
                cardioidPlayButton.addEventListener('click', function() {
                    if (cardioidState.playing) {
                        cardioidState.playing = false;
                        cardioidState.lastTimestamp = null;
                        stopCardioidAnimation();
                        updateCardioidButton();
                        drawCardioidScene();
                    } else if (cardioidState.angle >= Math.PI * 2) {
                        resetCardioidAnimation(true);
                    } else {
                        cardioidState.playing = true;
                        updateCardioidButton();
                        startCardioidAnimation();
                    }
                });
            }

            if (cardioidResetButton) {
                cardioidResetButton.addEventListener('click', function() {
                    resetCardioidAnimation(true);
                });
            }

            function setupFractalMedia() {
                Array.prototype.forEach.call(document.querySelectorAll('.fractal-motion'), function(motion) {
                    const tile = motion.closest('.fractal-tile');
                    const button = tile ? tile.querySelector('.media-toggle') : null;
                    const image = motion.querySelector('img');
                    const canvas = motion.querySelector('canvas');
                    const mode = motion.getAttribute('data-motion-kind');
                    if (!button || !image) {
                        return;
                    }

                    function updateButton() {
                        if (mode === 'snapshot') {
                            button.textContent = motion.classList.contains('is-paused') ? 'Play animation' : 'Pause animation';
                        } else {
                            button.textContent = motion.classList.contains('is-paused') ? 'Play motion' : 'Pause motion';
                        }
                    }

                    button.addEventListener('click', function() {
                        if (mode === 'snapshot') {
                            if (motion.classList.contains('is-paused')) {
                                motion.classList.remove('is-paused');
                                updateButton();
                                return;
                            }
                            try {
                                const size = resizeCanvasToDisplaySize(canvas);
                                const ctx = canvas.getContext('2d');
                                ctx.clearRect(0, 0, size.width, size.height);
                                ctx.drawImage(image, 0, 0, size.width, size.height);
                                motion.classList.add('is-paused');
                            } catch (error) {
                                button.disabled = true;
                                button.textContent = 'Pause unavailable';
                                return;
                            }
                        } else {
                            motion.classList.toggle('is-paused');
                        }
                        updateButton();
                    });

                    updateButton();
                });
            }

            function randomSeed() {
                return Math.floor(Math.random() * 2147483647);
            }

            function mulberry32(seed) {
                let value = seed >>> 0;
                return function() {
                    value += 0x6D2B79F5;
                    let t = value;
                    t = Math.imul(t ^ (t >>> 15), t | 1);
                    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            }

            const KOCH_ROTATION_COS = 0.5;
            const KOCH_ROTATION_SIN = Math.sqrt(3) / 2;

            const kochSnowflakeState = {
                initialized: false,
                running: false,
                canvas: null,
                ctx: null,
                elapsedMs: 0,
                lastTimestamp: null,
                playing: false,
                currentStep: 0,
                manualTransition: null,
                animationFrameId: null,
                polylines: null,
                bounds: null,
                maxDepth: 5,
                morphDurationMs: 2200,
                holdDurationMs: 650,
                manualStepDurationMs: 900
            };

            function clonePoint(point) {
                return { x: point.x, y: point.y };
            }

            function interpolatePoint(start, end, t) {
                return {
                    x: start.x + (end.x - start.x) * t,
                    y: start.y + (end.y - start.y) * t
                };
            }

            function rotateVectorMinusSixty(vector) {
                return {
                    x: vector.x * KOCH_ROTATION_COS + vector.y * KOCH_ROTATION_SIN,
                    y: -vector.x * KOCH_ROTATION_SIN + vector.y * KOCH_ROTATION_COS
                };
            }

            function createBaseKochPolyline() {
                const halfWidth = Math.sqrt(3) / 2;
                return [
                    { x: 0, y: 1.03 },
                    { x: -halfWidth, y: -0.49 },
                    { x: halfWidth, y: -0.49 },
                    { x: 0, y: 1.03 }
                ];
            }

            function buildNextKochPolyline(polyline) {
                const next = [];
                for (let index = 0; index < polyline.length - 1; index += 1) {
                    const start = polyline[index];
                    const end = polyline[index + 1];
                    const oneThird = interpolatePoint(start, end, 1 / 3);
                    const twoThird = interpolatePoint(start, end, 2 / 3);
                    const thirdVector = {
                        x: twoThird.x - oneThird.x,
                        y: twoThird.y - oneThird.y
                    };
                    const peakVector = rotateVectorMinusSixty(thirdVector);
                    const peak = {
                        x: oneThird.x + peakVector.x,
                        y: oneThird.y + peakVector.y
                    };

                    if (index === 0) {
                        next.push(clonePoint(start));
                    }
                    next.push(oneThird, peak, twoThird, clonePoint(end));
                }
                return next;
            }

            function buildKochPolylines(maxDepth) {
                const polylines = [createBaseKochPolyline()];
                for (let depth = 0; depth < maxDepth; depth += 1) {
                    polylines.push(buildNextKochPolyline(polylines[depth]));
                }
                return polylines;
            }

            function computePolylineBounds(polyline) {
                return polyline.reduce(function(bounds, point) {
                    return {
                        minX: Math.min(bounds.minX, point.x),
                        maxX: Math.max(bounds.maxX, point.x),
                        minY: Math.min(bounds.minY, point.y),
                        maxY: Math.max(bounds.maxY, point.y)
                    };
                }, {
                    minX: Number.POSITIVE_INFINITY,
                    maxX: Number.NEGATIVE_INFINITY,
                    minY: Number.POSITIVE_INFINITY,
                    maxY: Number.NEGATIVE_INFINITY
                });
            }

            function morphKochPolyline(polyline, t) {
                const next = [];
                for (let index = 0; index < polyline.length - 1; index += 1) {
                    const start = polyline[index];
                    const end = polyline[index + 1];
                    const oneThird = interpolatePoint(start, end, 1 / 3);
                    const twoThird = interpolatePoint(start, end, 2 / 3);
                    const thirdVector = {
                        x: twoThird.x - oneThird.x,
                        y: twoThird.y - oneThird.y
                    };
                    const peakVector = rotateVectorMinusSixty(thirdVector);
                    const finalPeak = {
                        x: oneThird.x + peakVector.x,
                        y: oneThird.y + peakVector.y
                    };
                    const midpoint = interpolatePoint(oneThird, twoThird, 0.5);
                    const currentPeak = interpolatePoint(midpoint, finalPeak, t);

                    if (index === 0) {
                        next.push(clonePoint(start));
                    }
                    next.push(oneThird, currentPeak, twoThird, clonePoint(end));
                }
                return next;
            }

            function getKochSnowflakeElapsedForStep(step) {
                if (step <= 0) {
                    return 0;
                }
                return (step - 1) * (kochSnowflakeState.morphDurationMs + kochSnowflakeState.holdDurationMs) + kochSnowflakeState.morphDurationMs;
            }

            function getCurrentKochSnowflakeFrame() {
                if (!kochSnowflakeState.polylines) {
                    return null;
                }
                if (kochSnowflakeState.manualTransition) {
                    const transition = kochSnowflakeState.manualTransition;
                    const progress = clamp(transition.elapsedMs / transition.durationMs, 0, 1);
                    const eased = easeInOutCubic(progress);
                    if (transition.toStep > transition.fromStep) {
                        return {
                            depth: transition.fromStep,
                            isMorphing: true,
                            guidePolyline: kochSnowflakeState.polylines[transition.fromStep],
                            polyline: morphKochPolyline(kochSnowflakeState.polylines[transition.fromStep], eased),
                            labelText: 'Step ' + transition.fromStep + ' → ' + transition.toStep
                        };
                    }
                    return {
                        depth: transition.fromStep,
                        isMorphing: true,
                        guidePolyline: kochSnowflakeState.polylines[transition.toStep],
                        polyline: morphKochPolyline(kochSnowflakeState.polylines[transition.toStep], 1 - eased),
                        labelText: 'Step ' + transition.fromStep + ' → ' + transition.toStep
                    };
                }
                if (!kochSnowflakeState.playing) {
                    return {
                        depth: kochSnowflakeState.currentStep,
                        isMorphing: false,
                        guidePolyline: null,
                        polyline: kochSnowflakeState.polylines[kochSnowflakeState.currentStep],
                        labelText: 'Step ' + kochSnowflakeState.currentStep
                    };
                }
                const cycleMs = kochSnowflakeState.maxDepth * (kochSnowflakeState.morphDurationMs + kochSnowflakeState.holdDurationMs);
                let time = kochSnowflakeState.elapsedMs % cycleMs;

                for (let depth = 0; depth < kochSnowflakeState.maxDepth; depth += 1) {
                    if (time < kochSnowflakeState.morphDurationMs) {
                        return {
                            depth: depth,
                            isMorphing: true,
                            guidePolyline: kochSnowflakeState.polylines[depth],
                            polyline: morphKochPolyline(
                                kochSnowflakeState.polylines[depth],
                                easeInOutCubic(time / kochSnowflakeState.morphDurationMs)
                            ),
                            labelText: 'Step ' + depth + ' → ' + (depth + 1)
                        };
                    }
                    time -= kochSnowflakeState.morphDurationMs;

                    if (time < kochSnowflakeState.holdDurationMs) {
                        return {
                            depth: depth + 1,
                            isMorphing: false,
                            guidePolyline: null,
                            polyline: kochSnowflakeState.polylines[depth + 1],
                            labelText: 'Step ' + (depth + 1)
                        };
                    }
                    time -= kochSnowflakeState.holdDurationMs;
                }

                return {
                    depth: 0,
                    isMorphing: false,
                    guidePolyline: null,
                    polyline: kochSnowflakeState.polylines[0],
                    labelText: 'Step 0'
                };
            }

            function getCurrentKochSnowflakeStep() {
                if (kochSnowflakeState.manualTransition) {
                    return kochSnowflakeState.manualTransition.toStep;
                }
                if (!kochSnowflakeState.playing) {
                    return kochSnowflakeState.currentStep;
                }
                const frame = getCurrentKochSnowflakeFrame();
                return frame ? clamp(frame.depth, 0, kochSnowflakeState.maxDepth) : 0;
            }

            function updateKochSnowflakeControls() {
                const currentStep = getCurrentKochSnowflakeStep();
                const isTransitioning = !!kochSnowflakeState.manualTransition;
                if (kochSnowflakePlayButton) {
                    kochSnowflakePlayButton.textContent = kochSnowflakeState.playing ? 'Pause' : 'Play';
                }
                if (kochSnowflakePrevButton) {
                    kochSnowflakePrevButton.disabled = isTransitioning || currentStep <= 0;
                }
                if (kochSnowflakeNextButton) {
                    kochSnowflakeNextButton.disabled = isTransitioning || currentStep >= kochSnowflakeState.maxDepth;
                }
            }

            function setKochSnowflakeStep(step) {
                const targetStep = clamp(Math.round(step), 0, kochSnowflakeState.maxDepth);
                kochSnowflakeState.playing = false;
                kochSnowflakeState.currentStep = targetStep;
                kochSnowflakeState.manualTransition = null;
                kochSnowflakeState.elapsedMs = getKochSnowflakeElapsedForStep(targetStep);
                kochSnowflakeState.lastTimestamp = null;
                updateKochSnowflakeControls();
                renderKochSnowflakeFrame();
            }

            function nudgeKochSnowflakeStep(direction) {
                if (kochSnowflakeState.manualTransition) {
                    return;
                }
                const startStep = clamp(getCurrentKochSnowflakeStep(), 0, kochSnowflakeState.maxDepth);
                const targetStep = clamp(startStep + direction, 0, kochSnowflakeState.maxDepth);
                if (targetStep === startStep) {
                    return;
                }
                kochSnowflakeState.playing = false;
                kochSnowflakeState.currentStep = startStep;
                kochSnowflakeState.manualTransition = {
                    fromStep: startStep,
                    toStep: targetStep,
                    elapsedMs: 0,
                    durationMs: kochSnowflakeState.manualStepDurationMs
                };
                kochSnowflakeState.elapsedMs = getKochSnowflakeElapsedForStep(startStep);
                kochSnowflakeState.lastTimestamp = null;
                updateKochSnowflakeControls();
                renderKochSnowflakeFrame();
            }

            function toggleKochSnowflakePlayback() {
                if (kochSnowflakeState.playing) {
                    kochSnowflakeState.playing = false;
                    kochSnowflakeState.currentStep = getCurrentKochSnowflakeStep();
                    kochSnowflakeState.elapsedMs = getKochSnowflakeElapsedForStep(kochSnowflakeState.currentStep);
                } else {
                    kochSnowflakeState.playing = true;
                    kochSnowflakeState.elapsedMs = getKochSnowflakeElapsedForStep(kochSnowflakeState.currentStep);
                }
                kochSnowflakeState.manualTransition = null;
                kochSnowflakeState.lastTimestamp = null;
                updateKochSnowflakeControls();
                renderKochSnowflakeFrame();
            }

            function resetKochSnowflake() {
                setKochSnowflakeStep(0);
            }

            function mapKochPointToCanvas(point, size) {
                const bounds = kochSnowflakeState.bounds;
                const padding = 24 * size.dpr;
                const spanX = Math.max(1e-9, bounds.maxX - bounds.minX);
                const spanY = Math.max(1e-9, bounds.maxY - bounds.minY);
                const scale = Math.min(
                    (size.width - padding * 2) / spanX,
                    (size.height - padding * 2) / spanY
                );
                const centerX = (bounds.minX + bounds.maxX) / 2;
                const centerY = (bounds.minY + bounds.maxY) / 2;
                return {
                    x: size.width / 2 + (point.x - centerX) * scale,
                    y: size.height / 2 - (point.y - centerY) * scale
                };
            }

            function getMappedKochPoints(size, polyline) {
                return polyline.map(function(point) {
                    return mapKochPointToCanvas(point, size);
                });
            }

            function traceKochPath(ctx, mappedPoints, offsetX, offsetY) {
                if (!mappedPoints || mappedPoints.length < 2) {
                    return;
                }
                ctx.beginPath();
                mappedPoints.forEach(function(point, index) {
                    const x = point.x + (offsetX || 0);
                    const y = point.y + (offsetY || 0);
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.closePath();
            }

            function drawKochPolyline(ctx, size, polyline, strokeStyle, lineWidth, lineDash) {
                if (!polyline || polyline.length < 2) {
                    return;
                }
                traceKochPath(ctx, getMappedKochPoints(size, polyline));
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth * size.dpr;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.setLineDash((lineDash || []).map(function(value) {
                    return value * size.dpr;
                }));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            function drawKochBackdrop(ctx, size) {
                const background = ctx.createLinearGradient(0, 0, 0, size.height);
                background.addColorStop(0, '#071220');
                background.addColorStop(0.46, '#143a66');
                background.addColorStop(1, '#9ec9f4');
                ctx.fillStyle = background;
                ctx.fillRect(0, 0, size.width, size.height);

                const glow = ctx.createRadialGradient(
                    size.width * 0.52,
                    size.height * 0.24,
                    0,
                    size.width * 0.52,
                    size.height * 0.24,
                    size.width * 0.8
                );
                glow.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
                glow.addColorStop(0.45, 'rgba(125, 211, 252, 0.14)');
                glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, size.width, size.height);

                const twinklePhase = kochSnowflakeState.elapsedMs * 0.0016;
                for (let index = 0; index < 26; index += 1) {
                    const x = (Math.sin(index * 91.37) * 0.5 + 0.5) * size.width;
                    const y = (Math.cos(index * 57.11) * 0.5 + 0.5) * size.height * 0.72;
                    const radius = (0.7 + (index % 3) * 0.45) * size.dpr;
                    const alpha = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(twinklePhase + index * 0.8));
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')';
                    ctx.fill();
                }
            }

            function drawKochExtrusion(ctx, size, mappedPoints) {
                const phase = kochSnowflakeState.elapsedMs * 0.0011;
                const depthX = (13 + Math.sin(phase) * 1.7) * size.dpr;
                const depthY = (18 + Math.cos(phase * 0.8) * 1.5) * size.dpr;

                ctx.save();
                ctx.shadowColor = 'rgba(7, 17, 34, 0.35)';
                ctx.shadowBlur = 18 * size.dpr;
                for (let layer = 10; layer >= 1; layer -= 1) {
                    const t = layer / 10;
                    traceKochPath(ctx, mappedPoints, depthX * t * 0.42, depthY * t);
                    const fill = ctx.createLinearGradient(0, size.height * 0.2, 0, size.height);
                    fill.addColorStop(0, 'rgba(19, 45, 79, ' + (0.16 + t * 0.03).toFixed(3) + ')');
                    fill.addColorStop(1, 'rgba(4, 16, 33, ' + (0.42 + t * 0.035).toFixed(3) + ')');
                    ctx.fillStyle = fill;
                    ctx.fill();
                }
                ctx.restore();
            }

            function drawKochSurface(ctx, size, mappedPoints) {
                traceKochPath(ctx, mappedPoints);
                const fill = ctx.createLinearGradient(size.width * 0.28, size.height * 0.12, size.width * 0.76, size.height * 0.92);
                fill.addColorStop(0, '#ffffff');
                fill.addColorStop(0.2, '#dff6ff');
                fill.addColorStop(0.55, '#88d8ff');
                fill.addColorStop(1, '#1d63c6');

                ctx.save();
                ctx.shadowColor = 'rgba(103, 232, 249, 0.42)';
                ctx.shadowBlur = 24 * size.dpr;
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.restore();

                ctx.save();
                traceKochPath(ctx, mappedPoints);
                ctx.clip();

                const sheen = ctx.createLinearGradient(0, 0, size.width, size.height);
                sheen.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
                sheen.addColorStop(0.22, 'rgba(255, 255, 255, 0.18)');
                sheen.addColorStop(0.62, 'rgba(191, 219, 254, 0.12)');
                sheen.addColorStop(1, 'rgba(14, 116, 144, 0.16)');
                ctx.fillStyle = sheen;
                ctx.fillRect(0, 0, size.width, size.height);

                const iceGlow = ctx.createRadialGradient(
                    size.width * 0.34,
                    size.height * 0.24,
                    0,
                    size.width * 0.34,
                    size.height * 0.24,
                    size.width * 0.42
                );
                iceGlow.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
                iceGlow.addColorStop(0.5, 'rgba(224, 242, 254, 0.16)');
                iceGlow.addColorStop(1, 'rgba(224, 242, 254, 0)');
                ctx.fillStyle = iceGlow;
                ctx.fillRect(0, 0, size.width, size.height);
                ctx.restore();

                traceKochPath(ctx, mappedPoints);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
                ctx.lineWidth = 4.8 * size.dpr;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.stroke();

                traceKochPath(ctx, mappedPoints);
                ctx.strokeStyle = 'rgba(8, 47, 73, 0.72)';
                ctx.lineWidth = 1.6 * size.dpr;
                ctx.stroke();
            }

            function drawKochSparkles(ctx, size, mappedPoints) {
                const stride = Math.max(12, Math.floor(mappedPoints.length / 28));
                ctx.save();
                ctx.shadowColor = 'rgba(255, 255, 255, 0.72)';
                ctx.shadowBlur = 10 * size.dpr;
                for (let index = 0; index < mappedPoints.length - 1; index += stride) {
                    const point = mappedPoints[index];
                    if (point.y > size.height * 0.84) {
                        continue;
                    }
                    const radius = (1.15 + ((index / stride) % 3) * 0.55) * size.dpr;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.fill();
                }
                ctx.restore();
            }

            function drawKochStepLabel(ctx, size, frame) {
                const text = frame.labelText || (frame.isMorphing
                    ? 'Step ' + frame.depth + ' → ' + (frame.depth + 1)
                    : 'Step ' + frame.depth);
                ctx.font = '700 ' + (12 * size.dpr) + 'px Arial';
                const textWidth = ctx.measureText(text).width;
                const padX = 10 * size.dpr;
                const padY = 7 * size.dpr;
                const boxWidth = textWidth + padX * 2;
                const boxHeight = 28 * size.dpr;
                const x = size.width - boxWidth - 12 * size.dpr;
                const y = 12 * size.dpr;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
                ctx.lineWidth = 1 * size.dpr;
                ctx.beginPath();
                ctx.moveTo(x + 14 * size.dpr, y);
                ctx.lineTo(x + boxWidth - 14 * size.dpr, y);
                ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + 14 * size.dpr);
                ctx.lineTo(x + boxWidth, y + boxHeight - 14 * size.dpr);
                ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - 14 * size.dpr, y + boxHeight);
                ctx.lineTo(x + 14 * size.dpr, y + boxHeight);
                ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - 14 * size.dpr);
                ctx.lineTo(x, y + 14 * size.dpr);
                ctx.quadraticCurveTo(x, y, x + 14 * size.dpr, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#334155';
                ctx.fillText(text, x + padX, y + boxHeight / 2 + 4 * size.dpr);
            }

            function renderKochSnowflakeFrame() {
                if (!kochSnowflakeState.canvas || !kochSnowflakeState.ctx || !kochSnowflakeState.bounds) {
                    return;
                }
                const frame = getCurrentKochSnowflakeFrame();
                if (!frame) {
                    return;
                }
                const size = resizeCanvasToDisplaySize(kochSnowflakeState.canvas);
                const ctx = kochSnowflakeState.ctx;
                ctx.clearRect(0, 0, size.width, size.height);
                drawKochBackdrop(ctx, size);

                if (frame.guidePolyline) {
                    drawKochPolyline(ctx, size, frame.guidePolyline, 'rgba(226, 232, 240, 0.34)', 1.15, [5, 5]);
                }
                const mappedPoints = getMappedKochPoints(size, frame.polyline);
                drawKochExtrusion(ctx, size, mappedPoints);
                drawKochSurface(ctx, size, mappedPoints);
                drawKochSparkles(ctx, size, mappedPoints);
                drawKochStepLabel(ctx, size, frame);
                updateKochSnowflakeControls();
            }

            function animateKochSnowflake(timestamp) {
                if (!kochSnowflakeState.running) {
                    kochSnowflakeState.animationFrameId = null;
                    kochSnowflakeState.lastTimestamp = null;
                    return;
                }
                kochSnowflakeState.animationFrameId = requestAnimationFrame(animateKochSnowflake);
                if (kochSnowflakeState.lastTimestamp == null) {
                    kochSnowflakeState.lastTimestamp = timestamp;
                }
                const delta = timestamp - kochSnowflakeState.lastTimestamp;
                kochSnowflakeState.lastTimestamp = timestamp;
                if (kochSnowflakeState.playing) {
                    kochSnowflakeState.elapsedMs += delta;
                } else if (kochSnowflakeState.manualTransition) {
                    kochSnowflakeState.manualTransition.elapsedMs += delta;
                    if (kochSnowflakeState.manualTransition.elapsedMs >= kochSnowflakeState.manualTransition.durationMs) {
                        kochSnowflakeState.currentStep = kochSnowflakeState.manualTransition.toStep;
                        kochSnowflakeState.elapsedMs = getKochSnowflakeElapsedForStep(kochSnowflakeState.currentStep);
                        kochSnowflakeState.manualTransition = null;
                    }
                }
                renderKochSnowflakeFrame();
            }

            function stopKochSnowflakeDemo() {
                kochSnowflakeState.running = false;
                kochSnowflakeState.lastTimestamp = null;
                if (kochSnowflakeState.animationFrameId != null) {
                    cancelAnimationFrame(kochSnowflakeState.animationFrameId);
                    kochSnowflakeState.animationFrameId = null;
                }
            }

            function startKochSnowflakeDemo() {
                if (!kochSnowflakeState.initialized) {
                    setupKochSnowflakeDemo();
                }
                if (!kochSnowflakeState.canvas || kochSnowflakeState.running) {
                    return;
                }
                kochSnowflakeState.running = true;
                kochSnowflakeState.lastTimestamp = null;
                renderKochSnowflakeFrame();
                kochSnowflakeState.animationFrameId = requestAnimationFrame(animateKochSnowflake);
            }

            function setupKochSnowflakeDemo() {
                if (!kochSnowflakeStage || kochSnowflakeState.initialized) {
                    return;
                }
                const canvas = document.createElement('canvas');
                kochSnowflakeStage.replaceChildren(canvas);
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    [kochSnowflakePrevButton, kochSnowflakePlayButton, kochSnowflakeNextButton, kochSnowflakeResetButton].forEach(function(button) {
                        if (button) {
                            button.disabled = true;
                        }
                    });
                    if (kochSnowflakePlayButton) {
                        kochSnowflakePlayButton.textContent = 'Unavailable';
                    }
                    return;
                }

                const polylines = buildKochPolylines(kochSnowflakeState.maxDepth);
                kochSnowflakeState.canvas = canvas;
                kochSnowflakeState.ctx = ctx;
                kochSnowflakeState.polylines = polylines;
                kochSnowflakeState.bounds = computePolylineBounds(polylines[polylines.length - 1]);
                kochSnowflakeState.initialized = true;
                kochSnowflakeState.running = false;

                renderKochSnowflakeFrame();
                if (kochSnowflakePrevButton) {
                    kochSnowflakePrevButton.addEventListener('click', function() {
                        nudgeKochSnowflakeStep(-1);
                    });
                }
                if (kochSnowflakePlayButton) {
                    kochSnowflakePlayButton.addEventListener('click', function() {
                        toggleKochSnowflakePlayback();
                    });
                }
                if (kochSnowflakeNextButton) {
                    kochSnowflakeNextButton.addEventListener('click', function() {
                        nudgeKochSnowflakeStep(1);
                    });
                }
                if (kochSnowflakeResetButton) {
                    kochSnowflakeResetButton.addEventListener('click', function() {
                        resetKochSnowflake();
                    });
                }
            }

            const BARNSLEY_LEAF_TRANSFORM = { a: -0.15, b: 0.28, c: 0.26, d: 0.24, e: 0, f: 0.44 };
            const BARNSLEY_POINT_COUNTS_BY_STEP = [120000, 280000, 520000, 820000];
            const BARNSLEY_MAX_POINT_COUNT = BARNSLEY_POINT_COUNTS_BY_STEP[BARNSLEY_POINT_COUNTS_BY_STEP.length - 1];
            const BARNSLEY_MAX_DEPTH = BARNSLEY_POINT_COUNTS_BY_STEP.length - 1;

            const barnsleyFernState = {
                initialized: false,
                running: false,
                controlsBound: false,
                renderer: null,
                scene: null,
                camera: null,
                geometry: null,
                overlayPoints: null,
                elapsedMs: 0,
                lastTimestamp: null,
                playing: false,
                currentStep: 0,
                manualTransition: null,
                animationFrameId: null,
                bounds: null,
                transformDurationMs: 2350,
                resetDurationMs: 1150,
                maxDepth: BARNSLEY_MAX_DEPTH,
                manualStepDurationMs: 950
            };

            function identityAffine() {
                return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            }

            function multiplyAffine(left, right) {
                return {
                    a: left.a * right.a + left.b * right.c,
                    b: left.a * right.b + left.b * right.d,
                    c: left.c * right.a + left.d * right.c,
                    d: left.c * right.b + left.d * right.d,
                    e: left.a * right.e + left.b * right.f + left.e,
                    f: left.c * right.e + left.d * right.f + left.f
                };
            }

            function affinePower(base, exponent) {
                let result = identityAffine();
                for (let index = 0; index < exponent; index += 1) {
                    result = multiplyAffine(result, base);
                }
                return result;
            }

            function lerpAffine(start, end, t) {
                return {
                    a: start.a + (end.a - start.a) * t,
                    b: start.b + (end.b - start.b) * t,
                    c: start.c + (end.c - start.c) * t,
                    d: start.d + (end.d - start.d) * t,
                    e: start.e + (end.e - start.e) * t,
                    f: start.f + (end.f - start.f) * t
                };
            }

            function applyAffineToPoint(point, affine) {
                return {
                    x: affine.a * point.x + affine.b * point.y + affine.e,
                    y: affine.c * point.x + affine.d * point.y + affine.f
                };
            }

            function transformBounds(bounds, affine) {
                const corners = [
                    applyAffineToPoint({ x: bounds.minX, y: bounds.minY }, affine),
                    applyAffineToPoint({ x: bounds.minX, y: bounds.maxY }, affine),
                    applyAffineToPoint({ x: bounds.maxX, y: bounds.minY }, affine),
                    applyAffineToPoint({ x: bounds.maxX, y: bounds.maxY }, affine)
                ];
                return corners.reduce(function(result, point) {
                    return {
                        minX: Math.min(result.minX, point.x),
                        maxX: Math.max(result.maxX, point.x),
                        minY: Math.min(result.minY, point.y),
                        maxY: Math.max(result.maxY, point.y)
                    };
                }, {
                    minX: Number.POSITIVE_INFINITY,
                    maxX: Number.NEGATIVE_INFINITY,
                    minY: Number.POSITIVE_INFINITY,
                    maxY: Number.NEGATIVE_INFINITY
                });
            }

            function lerpBarnsleyFernView(start, end, t) {
                return {
                    left: start.left + (end.left - start.left) * t,
                    right: start.right + (end.right - start.right) * t,
                    top: start.top + (end.top - start.top) * t,
                    bottom: start.bottom + (end.bottom - start.bottom) * t
                };
            }

            function easeInOutCubic(t) {
                return t < 0.5
                    ? 4 * t * t * t
                    : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }

            function applyAffineToObject(object, affine) {
                if (!object) {
                    return;
                }
                object.matrixAutoUpdate = false;
                object.matrix.set(
                    affine.a, affine.b, 0, affine.e,
                    affine.c, affine.d, 0, affine.f,
                    0, 0, 1, 0,
                    0, 0, 0, 1
                );
                object.matrixWorldNeedsUpdate = true;
            }

            function buildBarnsleyFernGeometry(pointCount) {
                const rng = mulberry32(1776);
                let x = 0;
                let y = 0;
                const positions = new Float32Array(pointCount * 3);
                const colors = new Float32Array(pointCount * 3);
                let minX = Number.POSITIVE_INFINITY;
                let maxX = Number.NEGATIVE_INFINITY;
                let minY = Number.POSITIVE_INFINITY;
                let maxY = Number.NEGATIVE_INFINITY;

                function stepPoint() {
                    const roll = rng();
                    let nextX;
                    let nextY;
                    if (roll < 0.01) {
                        nextX = 0;
                        nextY = 0.16 * y;
                    } else if (roll < 0.86) {
                        nextX = 0.85 * x + 0.04 * y;
                        nextY = -0.04 * x + 0.85 * y + 1.6;
                    } else if (roll < 0.93) {
                        nextX = 0.2 * x - 0.26 * y;
                        nextY = 0.23 * x + 0.22 * y + 1.6;
                    } else {
                        nextX = -0.15 * x + 0.28 * y;
                        nextY = 0.26 * x + 0.24 * y + 0.44;
                    }
                    x = nextX;
                    y = nextY;
                }

                for (let warmup = 0; warmup < 24; warmup += 1) {
                    stepPoint();
                }

                for (let index = 0; index < pointCount; index += 1) {
                    stepPoint();
                    const offset = index * 3;
                    positions[offset] = x;
                    positions[offset + 1] = y;
                    positions[offset + 2] = 0;

                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);

                    const heightMix = clamp(y / 10, 0, 1);
                    colors[offset] = 0.05 + 0.08 * heightMix;
                    colors[offset + 1] = 0.22 + 0.56 * heightMix;
                    colors[offset + 2] = 0.07 + 0.15 * heightMix;
                }

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geometry.computeBoundingSphere();

                return {
                    geometry: geometry,
                    bounds: {
                        minX: minX,
                        maxX: maxX,
                        minY: minY,
                        maxY: maxY
                    }
                };
            }

            function getBarnsleyFernElapsedForStep(step) {
                return clamp(Math.round(step), 0, barnsleyFernState.maxDepth) * barnsleyFernState.transformDurationMs;
            }

            function getCurrentBarnsleyFernStep() {
                if (barnsleyFernState.manualTransition) {
                    return barnsleyFernState.manualTransition.toStep;
                }
                if (!barnsleyFernState.playing) {
                    return barnsleyFernState.currentStep;
                }
                const transformPhaseMs = barnsleyFernState.maxDepth * barnsleyFernState.transformDurationMs;
                const totalCycleMs = transformPhaseMs + barnsleyFernState.resetDurationMs;
                const cycleTime = barnsleyFernState.elapsedMs % totalCycleMs;

                if (cycleTime < transformPhaseMs) {
                    const step = Math.floor(cycleTime / barnsleyFernState.transformDurationMs);
                    const localProgress = (cycleTime - step * barnsleyFernState.transformDurationMs) / barnsleyFernState.transformDurationMs;
                    return clamp(localProgress >= 0.5 ? step + 1 : step, 0, barnsleyFernState.maxDepth);
                }

                const resetProgress = (cycleTime - transformPhaseMs) / barnsleyFernState.resetDurationMs;
                return resetProgress < 0.5 ? barnsleyFernState.maxDepth : 0;
            }

            function getCurrentBarnsleyFernFrame() {
                if (barnsleyFernState.manualTransition) {
                    const transition = barnsleyFernState.manualTransition;
                    const progress = clamp(transition.elapsedMs / transition.durationMs, 0, 1);
                    const eased = easeInOutCubic(progress);
                    return {
                        affine: lerpAffine(
                            affinePower(BARNSLEY_LEAF_TRANSFORM, transition.fromStep),
                            affinePower(BARNSLEY_LEAF_TRANSFORM, transition.toStep),
                            eased
                        ),
                        opacity: 0.92,
                        view: lerpBarnsleyFernView(
                            getBarnsleyFernViewForStep(transition.fromStep),
                            getBarnsleyFernViewForStep(transition.toStep),
                            eased
                        ),
                        pointCount: getBarnsleyFernPointCountForStep(transition.fromStep)
                            + (getBarnsleyFernPointCountForStep(transition.toStep) - getBarnsleyFernPointCountForStep(transition.fromStep)) * eased
                    };
                }
                if (!barnsleyFernState.playing) {
                    return {
                        affine: affinePower(BARNSLEY_LEAF_TRANSFORM, barnsleyFernState.currentStep),
                        opacity: 0.92,
                        view: getBarnsleyFernViewForStep(barnsleyFernState.currentStep),
                        pointCount: getBarnsleyFernPointCountForStep(barnsleyFernState.currentStep)
                    };
                }
                const transformPhaseMs = barnsleyFernState.maxDepth * barnsleyFernState.transformDurationMs;
                const totalCycleMs = transformPhaseMs + barnsleyFernState.resetDurationMs;
                const cycleTime = barnsleyFernState.elapsedMs % totalCycleMs;
                let affine = identityAffine();
                let opacity = 0.92;
                let view = getBarnsleyFernViewForStep(0);
                let pointCount = getBarnsleyFernPointCountForStep(0);

                if (cycleTime < transformPhaseMs) {
                    const step = Math.floor(cycleTime / barnsleyFernState.transformDurationMs);
                    const localProgress = (cycleTime - step * barnsleyFernState.transformDurationMs) / barnsleyFernState.transformDurationMs;
                    const eased = easeInOutCubic(localProgress);
                    affine = lerpAffine(
                        affinePower(BARNSLEY_LEAF_TRANSFORM, step),
                        affinePower(BARNSLEY_LEAF_TRANSFORM, step + 1),
                        eased
                    );
                    view = lerpBarnsleyFernView(
                        getBarnsleyFernViewForStep(step),
                        getBarnsleyFernViewForStep(step + 1),
                        eased
                    );
                    pointCount = getBarnsleyFernPointCountForStep(step)
                        + (getBarnsleyFernPointCountForStep(step + 1) - getBarnsleyFernPointCountForStep(step)) * eased;
                } else {
                    const resetProgress = (cycleTime - transformPhaseMs) / barnsleyFernState.resetDurationMs;
                    const easedReset = easeInOutCubic(resetProgress);
                    affine = lerpAffine(
                        affinePower(BARNSLEY_LEAF_TRANSFORM, barnsleyFernState.maxDepth),
                        identityAffine(),
                        easedReset
                    );
                    view = lerpBarnsleyFernView(
                        getBarnsleyFernViewForStep(barnsleyFernState.maxDepth),
                        getBarnsleyFernViewForStep(0),
                        easedReset
                    );
                    opacity = 0.92 - Math.sin(resetProgress * Math.PI) * 0.14;
                    pointCount = getBarnsleyFernPointCountForStep(barnsleyFernState.maxDepth)
                        + (getBarnsleyFernPointCountForStep(0) - getBarnsleyFernPointCountForStep(barnsleyFernState.maxDepth)) * easedReset;
                }

                return {
                    affine: affine,
                    opacity: opacity,
                    view: view,
                    pointCount: pointCount
                };
            }

            function getBarnsleyFernPointCountForStep(step) {
                return BARNSLEY_POINT_COUNTS_BY_STEP[clamp(Math.round(step), 0, barnsleyFernState.maxDepth)] || BARNSLEY_MAX_POINT_COUNT;
            }

            function applyBarnsleyFernPointCount(pointCount) {
                if (!barnsleyFernState.geometry) {
                    return;
                }
                barnsleyFernState.geometry.setDrawRange(0, clamp(Math.round(pointCount), 1, BARNSLEY_MAX_POINT_COUNT));
            }

            function updateBarnsleyFernControls() {
                const currentStep = getCurrentBarnsleyFernStep();
                const isTransitioning = !!barnsleyFernState.manualTransition;
                if (barnsleyFernPlayButton) {
                    barnsleyFernPlayButton.textContent = barnsleyFernState.playing ? 'Pause' : 'Play';
                }
                if (barnsleyFernPrevButton) {
                    barnsleyFernPrevButton.disabled = isTransitioning || currentStep <= 0;
                }
                if (barnsleyFernNextButton) {
                    barnsleyFernNextButton.disabled = isTransitioning || currentStep >= barnsleyFernState.maxDepth;
                }
            }

            function setBarnsleyFernStep(step) {
                const targetStep = clamp(Math.round(step), 0, barnsleyFernState.maxDepth);
                barnsleyFernState.playing = false;
                barnsleyFernState.currentStep = targetStep;
                barnsleyFernState.manualTransition = null;
                barnsleyFernState.elapsedMs = getBarnsleyFernElapsedForStep(targetStep);
                barnsleyFernState.lastTimestamp = null;
                updateBarnsleyFernControls();
                renderBarnsleyFernFrame();
            }

            function nudgeBarnsleyFernStep(direction) {
                if (barnsleyFernState.manualTransition) {
                    return;
                }
                const startStep = clamp(getCurrentBarnsleyFernStep(), 0, barnsleyFernState.maxDepth);
                const targetStep = clamp(startStep + direction, 0, barnsleyFernState.maxDepth);
                if (targetStep === startStep) {
                    return;
                }
                barnsleyFernState.playing = false;
                barnsleyFernState.currentStep = startStep;
                barnsleyFernState.manualTransition = {
                    fromStep: startStep,
                    toStep: targetStep,
                    elapsedMs: 0,
                    durationMs: barnsleyFernState.manualStepDurationMs
                };
                barnsleyFernState.elapsedMs = getBarnsleyFernElapsedForStep(startStep);
                barnsleyFernState.lastTimestamp = null;
                updateBarnsleyFernControls();
                renderBarnsleyFernFrame();
            }

            function toggleBarnsleyFernPlayback() {
                if (barnsleyFernState.playing) {
                    barnsleyFernState.playing = false;
                    barnsleyFernState.currentStep = getCurrentBarnsleyFernStep();
                    barnsleyFernState.elapsedMs = getBarnsleyFernElapsedForStep(barnsleyFernState.currentStep);
                } else {
                    barnsleyFernState.playing = true;
                    barnsleyFernState.elapsedMs = getBarnsleyFernElapsedForStep(barnsleyFernState.currentStep);
                }
                barnsleyFernState.manualTransition = null;
                barnsleyFernState.lastTimestamp = null;
                updateBarnsleyFernControls();
                renderBarnsleyFernFrame();
            }

            function resetBarnsleyFern() {
                setBarnsleyFernStep(0);
            }

            function bindBarnsleyFernControls() {
                if (barnsleyFernState.controlsBound) {
                    return;
                }
                if (barnsleyFernPrevButton) {
                    barnsleyFernPrevButton.addEventListener('click', function() {
                        nudgeBarnsleyFernStep(-1);
                    });
                }
                if (barnsleyFernPlayButton) {
                    barnsleyFernPlayButton.addEventListener('click', function() {
                        toggleBarnsleyFernPlayback();
                    });
                }
                if (barnsleyFernNextButton) {
                    barnsleyFernNextButton.addEventListener('click', function() {
                        nudgeBarnsleyFernStep(1);
                    });
                }
                if (barnsleyFernResetButton) {
                    barnsleyFernResetButton.addEventListener('click', function() {
                        resetBarnsleyFern();
                    });
                }
                barnsleyFernState.controlsBound = true;
            }

            function getBarnsleyFernViewForBounds(bounds) {
                if (!barnsleyFernStage) {
                    return null;
                }
                const width = Math.max(1, barnsleyFernStage.clientWidth);
                const height = Math.max(1, barnsleyFernStage.clientHeight);
                const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
                const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
                const centerX = (bounds.minX + bounds.maxX) / 2;
                const centerY = bounds.minY + spanY * 0.53;
                const aspect = width / height;
                let viewWidth = spanX * 1.52;
                let viewHeight = spanY * 1.18;

                if (viewWidth / viewHeight < aspect) {
                    viewWidth = viewHeight * aspect;
                } else {
                    viewHeight = viewWidth / aspect;
                }

                return {
                    left: centerX - viewWidth / 2,
                    right: centerX + viewWidth / 2,
                    top: centerY + viewHeight / 2,
                    bottom: centerY - viewHeight / 2
                };
            }

            function getBarnsleyFernViewForStep(step) {
                if (!barnsleyFernState.bounds) {
                    return null;
                }
                return getBarnsleyFernViewForBounds(
                    transformBounds(
                        barnsleyFernState.bounds,
                        affinePower(BARNSLEY_LEAF_TRANSFORM, clamp(Math.round(step), 0, barnsleyFernState.maxDepth))
                    )
                );
            }

            function applyBarnsleyFernCameraView(view) {
                if (!view || !barnsleyFernState.camera) {
                    return;
                }
                barnsleyFernState.camera.left = view.left;
                barnsleyFernState.camera.right = view.right;
                barnsleyFernState.camera.top = view.top;
                barnsleyFernState.camera.bottom = view.bottom;
                barnsleyFernState.camera.updateProjectionMatrix();
            }

            function resizeBarnsleyFernScene() {
                if (!barnsleyFernState.renderer || !barnsleyFernStage || !barnsleyFernState.bounds) {
                    return;
                }
                const width = Math.max(1, barnsleyFernStage.clientWidth);
                const height = Math.max(1, barnsleyFernStage.clientHeight);
                barnsleyFernState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                barnsleyFernState.renderer.setSize(width, height, false);
                applyBarnsleyFernCameraView(getBarnsleyFernViewForStep(getCurrentBarnsleyFernStep()));
            }

            function renderBarnsleyFernFrame() {
                if (!barnsleyFernState.renderer || !barnsleyFernState.scene || !barnsleyFernState.camera || !barnsleyFernState.overlayPoints) {
                    return;
                }
                const frame = getCurrentBarnsleyFernFrame();
                applyBarnsleyFernPointCount(frame.pointCount);
                applyAffineToObject(barnsleyFernState.overlayPoints, frame.affine);
                barnsleyFernState.overlayPoints.material.opacity = frame.opacity;
                applyBarnsleyFernCameraView(frame.view);
                barnsleyFernState.renderer.render(barnsleyFernState.scene, barnsleyFernState.camera);
                updateBarnsleyFernControls();
            }

            function animateBarnsleyFern(timestamp) {
                if (!barnsleyFernState.running) {
                    barnsleyFernState.animationFrameId = null;
                    barnsleyFernState.lastTimestamp = null;
                    return;
                }
                barnsleyFernState.animationFrameId = requestAnimationFrame(animateBarnsleyFern);
                if (!barnsleyFernState.renderer) {
                    return;
                }
                if (barnsleyFernState.lastTimestamp == null) {
                    barnsleyFernState.lastTimestamp = timestamp;
                }
                const delta = timestamp - barnsleyFernState.lastTimestamp;
                barnsleyFernState.lastTimestamp = timestamp;
                if (barnsleyFernState.playing) {
                    barnsleyFernState.elapsedMs += delta;
                } else if (barnsleyFernState.manualTransition) {
                    barnsleyFernState.manualTransition.elapsedMs += delta;
                    if (barnsleyFernState.manualTransition.elapsedMs >= barnsleyFernState.manualTransition.durationMs) {
                        barnsleyFernState.currentStep = barnsleyFernState.manualTransition.toStep;
                        barnsleyFernState.elapsedMs = getBarnsleyFernElapsedForStep(barnsleyFernState.currentStep);
                        barnsleyFernState.manualTransition = null;
                    }
                }
                renderBarnsleyFernFrame();
            }

            function stopBarnsleyFernDemo() {
                barnsleyFernState.running = false;
                barnsleyFernState.lastTimestamp = null;
                if (barnsleyFernState.animationFrameId != null) {
                    cancelAnimationFrame(barnsleyFernState.animationFrameId);
                    barnsleyFernState.animationFrameId = null;
                }
            }

            function startBarnsleyFernDemo() {
                if (!barnsleyFernState.initialized) {
                    setupBarnsleyFernDemo();
                }
                if (!barnsleyFernState.renderer || barnsleyFernState.running) {
                    return;
                }
                barnsleyFernState.running = true;
                barnsleyFernState.lastTimestamp = null;
                resizeBarnsleyFernScene();
                renderBarnsleyFernFrame();
                barnsleyFernState.animationFrameId = requestAnimationFrame(animateBarnsleyFern);
            }

            function disposeBarnsleyFernDemo() {
                stopBarnsleyFernDemo();
                if (!barnsleyFernState.initialized) {
                    return;
                }
                disposeThreeGraph(barnsleyFernState.scene);
                if (barnsleyFernState.renderer) {
                    if (typeof barnsleyFernState.renderer.dispose === 'function') {
                        barnsleyFernState.renderer.dispose();
                    }
                    if (typeof barnsleyFernState.renderer.forceContextLoss === 'function') {
                        barnsleyFernState.renderer.forceContextLoss();
                    }
                }
                if (barnsleyFernStage) {
                    barnsleyFernStage.replaceChildren();
                }
                barnsleyFernState.initialized = false;
                barnsleyFernState.renderer = null;
                barnsleyFernState.scene = null;
                barnsleyFernState.camera = null;
                barnsleyFernState.geometry = null;
                barnsleyFernState.overlayPoints = null;
                barnsleyFernState.bounds = null;
            }

            function setupBarnsleyFernDemo() {
                if (!barnsleyFernStage || barnsleyFernState.initialized) {
                    return;
                }
                try {
                    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                    renderer.setClearColor(0x000000, 0);
                    barnsleyFernStage.replaceChildren(renderer.domElement);

                    const scene = new THREE.Scene();
                    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
                    camera.position.set(0, 0, 5);

                    const fernData = buildBarnsleyFernGeometry(BARNSLEY_MAX_POINT_COUNT);
                    const basePoints = new THREE.Points(
                        fernData.geometry,
                        new THREE.PointsMaterial({
                            size: 1.6,
                            sizeAttenuation: false,
                            vertexColors: true,
                            transparent: true,
                            opacity: 0.7
                        })
                    );
                    const overlayPoints = new THREE.Points(
                        fernData.geometry,
                        new THREE.PointsMaterial({
                            size: 2.15,
                            sizeAttenuation: false,
                            color: 0x7dff9d,
                            transparent: true,
                            opacity: 0.92
                        })
                    );

                    scene.add(basePoints);
                    scene.add(overlayPoints);

                    barnsleyFernState.renderer = renderer;
                    barnsleyFernState.scene = scene;
                    barnsleyFernState.camera = camera;
                    barnsleyFernState.geometry = fernData.geometry;
                    barnsleyFernState.overlayPoints = overlayPoints;
                    barnsleyFernState.bounds = fernData.bounds;
                    barnsleyFernState.initialized = true;
                    barnsleyFernState.running = false;
                    bindBarnsleyFernControls();

                    resizeBarnsleyFernScene();
                    renderBarnsleyFernFrame();
                } catch (error) {
                    barnsleyFernStage.innerHTML = '<div style="padding:20px;color:#5f6b84;line-height:1.6;">The Barnsley fern animation could not start in this browser.</div>';
                    [barnsleyFernPrevButton, barnsleyFernPlayButton, barnsleyFernNextButton, barnsleyFernResetButton].forEach(function(button) {
                        if (button) {
                            button.disabled = true;
                        }
                    });
                    if (barnsleyFernPlayButton) {
                        barnsleyFernPlayButton.textContent = 'Unavailable';
                    }
                    return;
                }
            }

            function traceRoundedRectPath(ctx, x, y, width, height, radius) {
                const appliedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
                ctx.beginPath();
                ctx.moveTo(x + appliedRadius, y);
                ctx.lineTo(x + width - appliedRadius, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + appliedRadius);
                ctx.lineTo(x + width, y + height - appliedRadius);
                ctx.quadraticCurveTo(x + width, y + height, x + width - appliedRadius, y + height);
                ctx.lineTo(x + appliedRadius, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - appliedRadius);
                ctx.lineTo(x, y + appliedRadius);
                ctx.quadraticCurveTo(x, y, x + appliedRadius, y);
                ctx.closePath();
            }

            function renderStepMetricChips(container, metrics) {
                if (!container) {
                    return;
                }
                container.innerHTML = Array.isArray(metrics)
                    ? metrics.map(function(metric) {
                        return '<span class="fractal-step-chip">' + metric + '</span>';
                    }).join('')
                    : '';
            }

            function updateStoryStepCopy(titleElement, copyElement, metricsElement, descriptors, stepIndex) {
                if (!descriptors || !descriptors.length) {
                    return;
                }
                const descriptor = descriptors[clamp(Math.round(stepIndex), 0, descriptors.length - 1)] || descriptors[0];
                if (titleElement) {
                    titleElement.textContent = descriptor.title;
                }
                if (copyElement) {
                    copyElement.textContent = descriptor.copy;
                }
                renderStepMetricChips(metricsElement, descriptor.metrics);
            }

            function drawCanvasChip(ctx, text, x, y, options) {
                options = options || {};
                const dpr = options.dpr || 1;
                const fontSize = (options.fontSize || 11) * dpr;
                const paddingX = (options.paddingX || 9) * dpr;
                const paddingY = (options.paddingY || 6) * dpr;
                const radius = (options.radius || 12) * dpr;
                const background = options.background || 'rgba(255, 255, 255, 0.92)';
                const borderColor = options.borderColor || 'rgba(148, 163, 184, 0.55)';
                const textColor = options.textColor || '#334155';
                const align = options.align || 'left';
                const verticalAlign = options.verticalAlign || 'top';
                ctx.save();
                ctx.font = '700 ' + fontSize + 'px Arial';
                const width = ctx.measureText(text).width + paddingX * 2;
                const height = fontSize + paddingY * 2;
                let drawX = x;
                let drawY = y;
                if (align === 'center') {
                    drawX -= width / 2;
                } else if (align === 'right') {
                    drawX -= width;
                }
                if (verticalAlign === 'middle') {
                    drawY -= height / 2;
                } else if (verticalAlign === 'bottom') {
                    drawY -= height;
                }
                traceRoundedRectPath(ctx, drawX, drawY, width, height, radius);
                ctx.fillStyle = background;
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1 * dpr;
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = textColor;
                ctx.textBaseline = 'middle';
                ctx.fillText(text, drawX + paddingX, drawY + height / 2 + 0.5 * dpr);
                ctx.restore();
                return {
                    x: drawX,
                    y: drawY,
                    width: width,
                    height: height
                };
            }

            function traceCapsulePath(ctx, start, end, radius) {
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const length = Math.hypot(dx, dy);
                if (length < 0.0001) {
                    ctx.beginPath();
                    ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
                    return;
                }
                const angle = Math.atan2(dy, dx);
                ctx.save();
                ctx.translate(start.x, start.y);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(0, -radius);
                ctx.lineTo(length, -radius);
                ctx.arc(length, 0, radius, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(0, radius);
                ctx.arc(0, 0, radius, Math.PI / 2, Math.PI * 1.5);
                ctx.closePath();
                ctx.restore();
            }

            function getInterpolatedTransitionStep(transition) {
                if (!transition) {
                    return null;
                }
                return clamp(transition.elapsedMs / transition.durationMs, 0, 1);
            }

