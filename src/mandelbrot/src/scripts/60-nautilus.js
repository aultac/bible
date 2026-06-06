            function formatNautilusRatio(value, digits) {
                const precision = digits == null ? 3 : digits;
                if (!Number.isFinite(value)) {
                    return '—';
                }
                return value.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
            }

            const NAUTILUS_GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
            const NAUTILUS_GOLDEN_RATIO_TEXT = formatNautilusRatio(NAUTILUS_GOLDEN_RATIO, 5) + '…';

            function cloneNautilusBounds(bounds) {
                if (!bounds) {
                    return null;
                }
                return {
                    minX: bounds.minX,
                    maxX: bounds.maxX,
                    minY: bounds.minY,
                    maxY: bounds.maxY
                };
            }

            function createNautilusBoundsFromSquare(square) {
                return {
                    minX: square.x,
                    maxX: square.x + square.size,
                    minY: square.y,
                    maxY: square.y + square.size
                };
            }

            function expandNautilusBounds(bounds, square) {
                return {
                    minX: Math.min(bounds.minX, square.x),
                    maxX: Math.max(bounds.maxX, square.x + square.size),
                    minY: Math.min(bounds.minY, square.y),
                    maxY: Math.max(bounds.maxY, square.y + square.size)
                };
            }

            const NAUTILUS_ARC_CORNERS = ['tl', 'tr', 'br', 'bl'];
            const NAUTILUS_EXPLAINER_PHASE_MAX = 3;
            const NAUTILUS_GOLDEN_RECTANGLE_RATIO_MIN = 1.2;
            const NAUTILUS_GOLDEN_RECTANGLE_RATIO_MAX = 2.2;
            const NAUTILUS_SPIRAL_REFERENCES = {
                galaxy: {
                    assetUrl: 'mandelbrot/assets/spirals/spiral-galaxy-messier-77.jpg',
                    controlTitle: 'Spiral galaxy alignment',
                    hint: 'Blue marks the spiral pole; gold marks the galactic core; use rotate, mirror, scale, and skew to compare the arm sweep.',
                    anchorWorldX: 1,
                    anchorWorldY: 1,
                    minHeightScale: 0.62,
                    opacity: 0.8,
                    calibrationDefaults: {
                        anchorImageX: 0.492,
                        anchorImageY: 0.453,
                        widthScale: 1.495,
                        rotationDegrees: 0,
                        offsetX: 0,
                        offsetY: 0,
                        skewX: 0,
                        skewY: 0,
                        flipX: false
                    }
                }
            };
            const NAUTILUS_SHELL_CALIBRATION_FIELDS = [
                { key: 'anchorImageX', label: 'Anchor x', min: 0.08, max: 0.92, step: 0.001, format: 'fraction' },
                { key: 'anchorImageY', label: 'Anchor y', min: 0.08, max: 0.92, step: 0.001, format: 'fraction' },
                { key: 'widthScale', label: 'Scale', min: 0.6, max: 1.6, step: 0.005, format: 'scale' },
                { key: 'rotationDegrees', label: 'Rotate', min: -180, max: 180, step: 0.1, format: 'degrees' },
                { key: 'offsetX', label: 'Nudge x', min: -0.3, max: 0.3, step: 0.002, format: 'offset' },
                { key: 'offsetY', label: 'Nudge y', min: -0.3, max: 0.3, step: 0.002, format: 'offset' },
                { key: 'skewX', label: 'Skew x', min: -24, max: 24, step: 0.1, format: 'degrees' },
                { key: 'skewY', label: 'Skew y', min: -24, max: 24, step: 0.1, format: 'degrees' }
            ];
            const NAUTILUS_MEDIA_ASSETS = {
                shellModel: 'mandelbrot/assets/nautilus/nautilus-shell.glb',
                handModel: 'mandelbrot/assets/nautilus/skeletal-hand.glb',
                faceModel: 'mandelbrot/assets/nautilus/head-scan.fbx',
                faceAlbedo: 'mandelbrot/assets/nautilus/head-scan-albedo.jpg',
                faceBump: 'mandelbrot/assets/nautilus/head-scan-bump.png'
            };
            function cloneNautilusShellCalibration(defaults) {
                defaults = defaults || NAUTILUS_SPIRAL_REFERENCES.galaxy.calibrationDefaults;
                return {
                    anchorImageX: defaults.anchorImageX,
                    anchorImageY: defaults.anchorImageY,
                    widthScale: defaults.widthScale,
                    rotationDegrees: defaults.rotationDegrees || 0,
                    offsetX: defaults.offsetX,
                    offsetY: defaults.offsetY,
                    skewX: defaults.skewX,
                    skewY: defaults.skewY,
                    flipX: !!defaults.flipX
                };
            }

            function getNautilusArcCorner(index) {
                return NAUTILUS_ARC_CORNERS[index % NAUTILUS_ARC_CORNERS.length];
            }

            function buildNautilusLayout() {
                const squares = [];
                const cumulativeBounds = [null];
                let activeBounds = null;

                function addSquare(square) {
                    squares.push(square);
                    activeBounds = activeBounds
                        ? expandNautilusBounds(activeBounds, square)
                        : createNautilusBoundsFromSquare(square);
                    cumulativeBounds[squares.length] = cloneNautilusBounds(activeBounds);
                }

                if (!NAUTILUS_FIBONACCI_SEQUENCE.length) {
                    return {
                        squares: [],
                        cumulativeBounds: [null],
                        totalBounds: null
                    };
                }

                addSquare({
                    index: 0,
                    value: NAUTILUS_FIBONACCI_SEQUENCE[0],
                    size: NAUTILUS_FIBONACCI_SEQUENCE[0],
                    x: 1,
                    y: 0,
                    arcCorner: getNautilusArcCorner(0)
                });

                if (NAUTILUS_FIBONACCI_SEQUENCE.length > 1) {
                    addSquare({
                        index: 1,
                        value: NAUTILUS_FIBONACCI_SEQUENCE[1],
                        size: NAUTILUS_FIBONACCI_SEQUENCE[1],
                        x: 0,
                        y: 0,
                        arcCorner: getNautilusArcCorner(1)
                    });
                }

                let currentBounds = cloneNautilusBounds(activeBounds);
                const directionCycle = ['top', 'right', 'bottom', 'left'];

                for (let index = 2; index < NAUTILUS_FIBONACCI_SEQUENCE.length; index += 1) {
                    const size = NAUTILUS_FIBONACCI_SEQUENCE[index];
                    const direction = directionCycle[(index - 2) % directionCycle.length];
                    let square = null;

                    if (direction === 'top') {
                        square = {
                            index: index,
                            value: size,
                            size: size,
                            x: currentBounds.minX,
                            y: currentBounds.maxY,
                            arcCorner: getNautilusArcCorner(index)
                        };
                    } else if (direction === 'right') {
                        square = {
                            index: index,
                            value: size,
                            size: size,
                            x: currentBounds.maxX,
                            y: currentBounds.minY,
                            arcCorner: getNautilusArcCorner(index)
                        };
                    } else if (direction === 'bottom') {
                        square = {
                            index: index,
                            value: size,
                            size: size,
                            x: currentBounds.minX,
                            y: currentBounds.minY - size,
                            arcCorner: getNautilusArcCorner(index)
                        };
                    } else {
                        square = {
                            index: index,
                            value: size,
                            size: size,
                            x: currentBounds.minX - size,
                            y: currentBounds.minY,
                            arcCorner: getNautilusArcCorner(index)
                        };
                    }

                    addSquare(square);
                    currentBounds = cloneNautilusBounds(activeBounds);
                }

                return {
                    squares: squares,
                    cumulativeBounds: cumulativeBounds,
                    totalBounds: cloneNautilusBounds(activeBounds)
                };
            }

            const nautilusState = {
                initialized: false,
                running: false,
                controlsBound: false,
                canvas: null,
                ctx: null,
                layout: null,
                referenceImages: {},
                mediaViewers: [],
                viewerLoadToken: 0,
                gltfLoader: null,
                fbxLoader: null,
                textureLoader: null,
                animationFrameId: null,
                lastTimestamp: null,
                playing: false,
                currentCount: 0,
                detailPhase: 0,
                detailTransition: null,
                goldenRectangleRatio: NAUTILUS_GOLDEN_RATIO,
                goldenRatioSliderShell: null,
                goldenRatioSlider: null,
                shellCalibrations: {
                    galaxy: cloneNautilusShellCalibration(NAUTILUS_SPIRAL_REFERENCES.galaxy.calibrationDefaults)
                },
                shellCalibrationShell: null,
                shellCalibrationResetButton: null,
                shellCalibrationMirrorButton: null,
                shellCalibrationTitleElement: null,
                shellCalibrationHintElement: null,
                shellCalibrationInputs: {},
                shellCalibrationReadouts: {},
                transition: null,
                stepDurationMs: 820,
                manualStepDurationMs: 520,
                finalStepDurationMs: 5000,
                detailTransitionDurationMs: 860
            };

            function isNautilusConstructionComplete() {
                return !nautilusState.transition && nautilusState.currentCount >= NAUTILUS_STEP_TOTAL;
            }

            function getNautilusOuterStageTotal() {
                return NAUTILUS_EXPLAINER_PHASE_MAX + 1;
            }

            function getNautilusOuterStageIndex() {
                return clamp(nautilusState.detailPhase + 1, 1, getNautilusOuterStageTotal());
            }

            function clampNautilusGoldenRectangleRatio(value) {
                return clamp(
                    safeNumber(value, NAUTILUS_GOLDEN_RATIO),
                    NAUTILUS_GOLDEN_RECTANGLE_RATIO_MIN,
                    NAUTILUS_GOLDEN_RECTANGLE_RATIO_MAX
                );
            }

            function syncNautilusGoldenRatioSlider() {
                if (!nautilusState.goldenRatioSlider) {
                    return;
                }
                nautilusState.goldenRatioSlider.value = nautilusState.goldenRectangleRatio.toFixed(5);
            }

            function updateNautilusGoldenRatioSliderVisibility() {
                const isVisible = nautilusState.detailPhase === 3;
                if (nautilusState.goldenRatioSliderShell) {
                    nautilusState.goldenRatioSliderShell.hidden = !isVisible;
                }
                if (nautilusState.goldenRatioSlider) {
                    nautilusState.goldenRatioSlider.disabled = !isVisible;
                }
                updateNautilusLiveControlsVisibility();
            }

            function updateNautilusLiveControlsVisibility() {
                if (!nautilusLiveControls) {
                    return;
                }
                const hasVisibleControls = !!(
                    nautilusState.goldenRatioSliderShell && !nautilusState.goldenRatioSliderShell.hidden
                );
                nautilusLiveControls.hidden = !hasVisibleControls;
            }

            function shouldShowNautilusShellCalibration() {
                return false;
            }

            function getNautilusReferenceKeyForPhase(detailPhase) {
                if (detailPhase === 1) {
                    return 'galaxy';
                }
                return null;
            }

            function getNautilusActiveReferenceKey() {
                return getNautilusReferenceKeyForPhase(nautilusState.detailPhase);
            }

            function getNautilusReferenceConfig(referenceKey) {
                return referenceKey ? NAUTILUS_SPIRAL_REFERENCES[referenceKey] || null : null;
            }

            function getNautilusActiveShellCalibration() {
                const referenceKey = getNautilusActiveReferenceKey();
                return referenceKey ? nautilusState.shellCalibrations[referenceKey] || null : null;
            }

            function formatNautilusShellCalibrationValue(field, value) {
                if (field.format === 'scale') {
                    return value.toFixed(3) + '×';
                }
                if (field.format === 'degrees') {
                    const signedDegrees = value > 0 ? '+' : '';
                    return signedDegrees + value.toFixed(1) + '°';
                }
                const signedPrefix = field.format === 'offset' && value > 0 ? '+' : '';
                return signedPrefix + (value * 100).toFixed(1) + '%';
            }

            function clampNautilusShellCalibrationValue(key, value) {
                const field = NAUTILUS_SHELL_CALIBRATION_FIELDS.find(function(candidate) {
                    return candidate.key === key;
                });
                if (!field) {
                    return safeNumber(value, 0);
                }
                const activeCalibration = getNautilusActiveShellCalibration();
                return clamp(
                    safeNumber(value, activeCalibration ? activeCalibration[key] : field.min),
                    field.min,
                    field.max
                );
            }

            function syncNautilusShellCalibrationControls() {
                const referenceKey = getNautilusActiveReferenceKey();
                const referenceConfig = getNautilusReferenceConfig(referenceKey);
                const calibration = getNautilusActiveShellCalibration();
                if (nautilusState.shellCalibrationTitleElement) {
                    nautilusState.shellCalibrationTitleElement.textContent = referenceConfig
                        ? referenceConfig.controlTitle
                        : 'Spiral alignment';
                }
                if (nautilusState.shellCalibrationHintElement) {
                    nautilusState.shellCalibrationHintElement.textContent = referenceConfig
                        ? referenceConfig.hint
                        : 'Use the controls below to line the reference image up with the spiral.';
                }
                if (nautilusState.shellCalibrationMirrorButton) {
                    const mirrored = !!(calibration && calibration.flipX);
                    nautilusState.shellCalibrationMirrorButton.textContent = mirrored ? 'Mirrored' : 'Mirror';
                    nautilusState.shellCalibrationMirrorButton.setAttribute('aria-pressed', mirrored ? 'true' : 'false');
                }
                NAUTILUS_SHELL_CALIBRATION_FIELDS.forEach(function(field) {
                    const value = calibration ? calibration[field.key] : field.min;
                    if (nautilusState.shellCalibrationInputs[field.key]) {
                        nautilusState.shellCalibrationInputs[field.key].value = String(value);
                    }
                    if (nautilusState.shellCalibrationReadouts[field.key]) {
                        nautilusState.shellCalibrationReadouts[field.key].textContent = formatNautilusShellCalibrationValue(field, value);
                    }
                });
            }

            function updateNautilusShellCalibrationVisibility() {
                const isVisible = shouldShowNautilusShellCalibration();
                if (nautilusState.shellCalibrationShell) {
                    nautilusState.shellCalibrationShell.hidden = !isVisible;
                }
                Object.keys(nautilusState.shellCalibrationInputs).forEach(function(key) {
                    nautilusState.shellCalibrationInputs[key].disabled = !isVisible;
                });
                if (nautilusState.shellCalibrationResetButton) {
                    nautilusState.shellCalibrationResetButton.disabled = !isVisible;
                }
                if (nautilusState.shellCalibrationMirrorButton) {
                    nautilusState.shellCalibrationMirrorButton.disabled = !isVisible;
                }
                syncNautilusShellCalibrationControls();
                updateNautilusLiveControlsVisibility();
            }

            function getNautilusGLTFLoader() {
                if (!nautilusState.gltfLoader) {
                    nautilusState.gltfLoader = new GLTFLoader();
                }
                return nautilusState.gltfLoader;
            }

            function getNautilusFBXLoader() {
                if (!nautilusState.fbxLoader) {
                    nautilusState.fbxLoader = new FBXLoader();
                }
                return nautilusState.fbxLoader;
            }

            function getNautilusTextureLoader() {
                if (!nautilusState.textureLoader) {
                    nautilusState.textureLoader = new THREE.TextureLoader();
                }
                return nautilusState.textureLoader;
            }

            function createNautilusViewerFallback(container, message) {
                if (!container) {
                    return;
                }
                container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:16px;color:#5f6b84;line-height:1.5;text-align:center;">' + message + '</div>';
            }

            function createNautilusViewer(config) {
                if (!config || !config.container) {
                    return null;
                }
                try {
                    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                    renderer.setClearColor(config.clearColor || 0xf5f1ea, 1);
                    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
                        renderer.outputColorSpace = THREE.SRGBColorSpace;
                    }
                    renderer.domElement.setAttribute('aria-hidden', 'true');
                    config.container.replaceChildren(renderer.domElement);

                    const scene = new THREE.Scene();
                    const camera = new THREE.PerspectiveCamera(config.fov || 34, 1, 0.01, 60);
                    const controls = new OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;
                    controls.enablePan = false;
                    controls.autoRotate = config.autoRotate !== false;
                    controls.autoRotateSpeed = config.autoRotateSpeed || 0.72;
                    controls.minDistance = config.minDistance || 1.4;
                    controls.maxDistance = config.maxDistance || 8;

                    const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd6d3d1, 1.5);
                    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.45);
                    keyLight.position.set(3.8, 4.4, 5.2);
                    const fillLight = new THREE.PointLight(0x93c5fd, 0.42, 18);
                    fillLight.position.set(-3.2, 2.4, 2.8);
                    scene.add(hemisphere);
                    scene.add(keyLight);
                    scene.add(fillLight);

                    const modelRoot = new THREE.Group();
                    scene.add(modelRoot);

                    const viewer = {
                        key: config.key,
                        config: config,
                        container: config.container,
                        renderer: renderer,
                        scene: scene,
                        camera: camera,
                        controls: controls,
                        modelRoot: modelRoot,
                        disposed: false,
                        ready: false
                    };

                    const cameraPosition = config.cameraPosition || [0, 0.45, 3];
                    const target = config.target || [0, 0, 0];
                    camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
                    controls.target.set(target[0], target[1], target[2]);
                    controls.update();
                    resizeNautilusViewer(viewer);
                    loadNautilusViewerAsset(viewer, nautilusState.viewerLoadToken);
                    return viewer;
                } catch (error) {
                    createNautilusViewerFallback(config.container, 'The 3D reference could not start here.');
                    return null;
                }
            }

            function normalizeNautilusViewerObject(root, config) {
                const wrapper = new THREE.Group();
                wrapper.rotation.set(
                    config.rotation ? config.rotation[0] : 0,
                    config.rotation ? config.rotation[1] : 0,
                    config.rotation ? config.rotation[2] : 0
                );
                wrapper.position.set(
                    config.offset ? config.offset[0] : 0,
                    config.offset ? config.offset[1] : 0,
                    config.offset ? config.offset[2] : 0
                );
                wrapper.add(root);

                const bounds = new THREE.Box3().setFromObject(root);
                if (!bounds.isEmpty()) {
                    const center = new THREE.Vector3();
                    const size = new THREE.Vector3();
                    bounds.getCenter(center);
                    bounds.getSize(size);
                    root.position.sub(center);
                    const scale = ((config.fitSize || 2.1) / Math.max(size.x, size.y, size.z, 0.0001)) * (config.scaleMultiplier || 1);
                    root.scale.multiplyScalar(scale);
                    const scaledBounds = new THREE.Box3().setFromObject(root);
                    const scaledCenter = new THREE.Vector3();
                    scaledBounds.getCenter(scaledCenter);
                    root.position.sub(scaledCenter);
                    if (config.lift) {
                        root.position.y += config.lift;
                    }
                }

                return wrapper;
            }

            function applyNautilusFaceMaterial(root, config) {
                const materialOptions = {
                    color: 0xffffff,
                    roughness: 0.74,
                    metalness: 0.04
                };
                if (config.albedoUrl) {
                    const albedo = getNautilusTextureLoader().load(config.albedoUrl, renderNautilusMediaViewers);
                    if ('colorSpace' in albedo && THREE.SRGBColorSpace) {
                        albedo.colorSpace = THREE.SRGBColorSpace;
                    }
                    materialOptions.map = albedo;
                }
                if (config.bumpUrl) {
                    materialOptions.bumpMap = getNautilusTextureLoader().load(config.bumpUrl, renderNautilusMediaViewers);
                    materialOptions.bumpScale = config.bumpScale || 0.18;
                }
                const material = new THREE.MeshStandardMaterial(materialOptions);
                root.traverse(function(object) {
                    if (!object.isMesh) {
                        return;
                    }
                    object.material = material;
                });
            }

            function finalizeNautilusViewerLoad(viewer, root) {
                if (!viewer || viewer.disposed) {
                    disposeThreeGraph(root);
                    return;
                }
                root.traverse(function(object) {
                    if (!object.isMesh) {
                        return;
                    }
                    object.castShadow = false;
                    object.receiveShadow = false;
                });
                viewer.modelRoot.add(normalizeNautilusViewerObject(root, viewer.config));
                viewer.ready = true;
                resizeNautilusViewer(viewer);
                renderNautilusViewer(viewer);
            }

            function handleNautilusViewerLoadError(viewer) {
                if (!viewer || viewer.disposed) {
                    return;
                }
                viewer.disposed = true;
                createNautilusViewerFallback(viewer.container, 'The 3D asset could not be loaded.');
                if (viewer.controls && typeof viewer.controls.dispose === 'function') {
                    viewer.controls.dispose();
                }
                if (viewer.renderer) {
                    if (typeof viewer.renderer.dispose === 'function') {
                        viewer.renderer.dispose();
                    }
                    if (typeof viewer.renderer.forceContextLoss === 'function') {
                        viewer.renderer.forceContextLoss();
                    }
                }
            }

            function loadNautilusViewerAsset(viewer, loadToken) {
                const config = viewer.config;
                if (config.type === 'gltf') {
                    getNautilusGLTFLoader().load(config.url, function(gltf) {
                        const root = gltf.scene || gltf.scenes[0];
                        if (viewer.disposed || loadToken !== nautilusState.viewerLoadToken) {
                            disposeThreeGraph(root);
                            return;
                        }
                        finalizeNautilusViewerLoad(viewer, root);
                    }, undefined, function() {
                        handleNautilusViewerLoadError(viewer);
                    });
                    return;
                }
                getNautilusFBXLoader().load(config.url, function(root) {
                    if (viewer.disposed || loadToken !== nautilusState.viewerLoadToken) {
                        disposeThreeGraph(root);
                        return;
                    }
                    applyNautilusFaceMaterial(root, config);
                    finalizeNautilusViewerLoad(viewer, root);
                }, undefined, function() {
                    handleNautilusViewerLoadError(viewer);
                });
            }

            function renderNautilusViewer(viewer) {
                if (!viewer || viewer.disposed || !viewer.renderer || !viewer.scene || !viewer.camera) {
                    return;
                }
                if (viewer.controls) {
                    viewer.controls.update();
                }
                viewer.renderer.render(viewer.scene, viewer.camera);
            }

            function renderNautilusMediaViewers() {
                nautilusState.mediaViewers.forEach(renderNautilusViewer);
            }

            function resizeNautilusViewer(viewer) {
                if (!viewer || viewer.disposed || !viewer.renderer || !viewer.container) {
                    return;
                }
                const width = Math.max(1, viewer.container.clientWidth);
                const height = Math.max(1, viewer.container.clientHeight);
                viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                viewer.renderer.setSize(width, height, false);
                viewer.camera.aspect = width / height;
                viewer.camera.updateProjectionMatrix();
            }

            function disposeNautilusViewer(viewer) {
                if (!viewer) {
                    return;
                }
                viewer.disposed = true;
                if (viewer.controls && typeof viewer.controls.dispose === 'function') {
                    viewer.controls.dispose();
                }
                disposeThreeGraph(viewer.scene);
                if (viewer.renderer) {
                    if (typeof viewer.renderer.dispose === 'function') {
                        viewer.renderer.dispose();
                    }
                    if (typeof viewer.renderer.forceContextLoss === 'function') {
                        viewer.renderer.forceContextLoss();
                    }
                }
                if (viewer.container) {
                    viewer.container.replaceChildren();
                }
            }

            function disposeNautilusMediaViewers() {
                nautilusState.viewerLoadToken += 1;
                nautilusState.mediaViewers.forEach(disposeNautilusViewer);
                nautilusState.mediaViewers = [];
            }

            function initNautilusMediaViewers() {
                disposeNautilusMediaViewers();
                [
                    {
                        key: 'shell',
                        container: nautilusShellModelStage,
                        type: 'gltf',
                        url: NAUTILUS_MEDIA_ASSETS.shellModel,
                        fitSize: 2.5,
                        scaleMultiplier: 1.08,
                        rotation: [0.18, -1.08, 0],
                        cameraPosition: [2.2, 1.1, 3.2],
                        target: [0, 0.1, 0],
                        autoRotateSpeed: 0.8,
                        clearColor: 0xf6efe4
                    },
                    {
                        key: 'hand',
                        container: nautilusHandModelStage,
                        type: 'gltf',
                        url: NAUTILUS_MEDIA_ASSETS.handModel,
                        fitSize: 2.3,
                        scaleMultiplier: 1.02,
                        rotation: [0.38, -0.64, 0.2],
                        cameraPosition: [1.8, 1.2, 3.1],
                        target: [0, 0.05, 0],
                        autoRotateSpeed: 0.74,
                        clearColor: 0xf4f4f3
                    },
                    {
                        key: 'face',
                        container: nautilusFaceModelStage,
                        type: 'fbx',
                        url: NAUTILUS_MEDIA_ASSETS.faceModel,
                        albedoUrl: NAUTILUS_MEDIA_ASSETS.faceAlbedo,
                        bumpUrl: NAUTILUS_MEDIA_ASSETS.faceBump,
                        bumpScale: 0.16,
                        fitSize: 2.05,
                        scaleMultiplier: 1,
                        rotation: [0.02, Math.PI, 0],
                        cameraPosition: [0, 0.12, 2.85],
                        target: [0, 0.06, 0],
                        autoRotateSpeed: 0.62,
                        clearColor: 0xf2f4f5
                    }
                ].forEach(function(config) {
                    const viewer = createNautilusViewer(config);
                    if (viewer) {
                        nautilusState.mediaViewers.push(viewer);
                    }
                });
            }

            function bindNautilusControls() {
                if (nautilusState.controlsBound) {
                    return;
                }
                if (nautilusPrevButton) {
                    nautilusPrevButton.addEventListener('click', function() {
                        nudgeNautilusPhase(-1);
                    });
                }
                if (nautilusPlayButton) {
                    nautilusPlayButton.addEventListener('click', function() {
                        toggleNautilusPlayback();
                    });
                }
                if (nautilusNextButton) {
                    nautilusNextButton.addEventListener('click', function() {
                        nudgeNautilusPhase(1);
                    });
                }
                if (nautilusResetButton) {
                    nautilusResetButton.addEventListener('click', function() {
                        resetNautilusDemo();
                    });
                }
                if (nautilusStage) {
                    nautilusStage.addEventListener('click', function() {
                        if (!isExampleTabActive('nautilus')) {
                            return;
                        }
                        if (replayNautilusFinalSpiral()) {
                            return;
                        }
                        nudgeNautilusStep(1);
                    });
                }
                nautilusState.controlsBound = true;
            }

            function updateNautilusControls() {
                const isTransitioning = !!nautilusState.transition || !!nautilusState.detailTransition;
                const constructionComplete = isNautilusConstructionComplete();
                const canReplaySpiral = canReplayNautilusFinalSpiral();
                if (nautilusPlayButton) {
                    nautilusPlayButton.textContent = nautilusState.playing ? 'Pause' : 'Play';
                    nautilusPlayButton.disabled = nautilusState.detailPhase > 0 || (constructionComplete && !nautilusState.playing);
                }
                if (nautilusPrevButton) {
                    nautilusPrevButton.disabled = isTransitioning || nautilusState.detailPhase <= 0;
                }
                if (nautilusNextButton) {
                    nautilusNextButton.disabled = nautilusState.detailPhase >= NAUTILUS_EXPLAINER_PHASE_MAX;
                }
                if (nautilusStage) {
                    nautilusStage.style.cursor = canReplaySpiral || (!(nautilusState.detailPhase > 0 || constructionComplete || isTransitioning || nautilusState.playing))
                        ? 'pointer'
                        : 'default';
                }
                if (nautilusState.canvas) {
                    nautilusState.canvas.style.cursor = canReplaySpiral || (!(nautilusState.detailPhase > 0 || constructionComplete || isTransitioning || nautilusState.playing))
                        ? 'pointer'
                        : 'default';
                }
                if (nautilusStageCount) {
                    nautilusStageCount.textContent = getNautilusOuterStageIndex() + '/' + getNautilusOuterStageTotal();
                }
                updateNautilusGoldenRatioSliderVisibility();
                updateNautilusShellCalibrationVisibility();
            }

            function createNautilusTransition(fromCount, toCount, durationMs) {
                return {
                    fromCount: fromCount,
                    toCount: toCount,
                    elapsedMs: 0,
                    durationMs: durationMs
                };
            }

            function finalizeNautilusTransition(commitToTarget) {
                if (!nautilusState.transition) {
                    return;
                }
                if (commitToTarget) {
                    nautilusState.currentCount = nautilusState.transition.toCount;
                } else {
                    const progress = getInterpolatedTransitionStep(nautilusState.transition);
                    nautilusState.currentCount = progress >= 0.5
                        ? nautilusState.transition.toCount
                        : nautilusState.transition.fromCount;
                }
                nautilusState.transition = null;
            }

            function completeNautilusSubstage() {
                let changed = false;
                nautilusState.playing = false;
                if (nautilusState.transition) {
                    finalizeNautilusTransition(true);
                    changed = true;
                }
                if (nautilusState.currentCount < NAUTILUS_STEP_TOTAL) {
                    nautilusState.currentCount = NAUTILUS_STEP_TOTAL;
                    changed = true;
                }
                if (nautilusState.detailTransition) {
                    nautilusState.detailTransition = null;
                    changed = true;
                }
                if (changed) {
                    nautilusState.lastTimestamp = null;
                }
                return changed;
            }

            function beginNautilusAutoTransition() {
                if (nautilusState.detailPhase > 0 || !nautilusState.playing || nautilusState.transition || nautilusState.currentCount >= NAUTILUS_STEP_TOTAL) {
                    if (nautilusState.currentCount >= NAUTILUS_STEP_TOTAL) {
                        nautilusState.playing = false;
                    }
                    return;
                }
                const targetCount = nautilusState.currentCount + 1;
                nautilusState.transition = createNautilusTransition(
                    nautilusState.currentCount,
                    targetCount,
                    targetCount === NAUTILUS_STEP_TOTAL ? nautilusState.finalStepDurationMs : nautilusState.stepDurationMs
                );
            }

            function setNautilusStep(step) {
                nautilusState.playing = false;
                nautilusState.transition = null;
                nautilusState.detailTransition = null;
                nautilusState.currentCount = clamp(Math.round(step), 0, NAUTILUS_STEP_TOTAL);
                if (nautilusState.currentCount < NAUTILUS_STEP_TOTAL) {
                    nautilusState.detailPhase = 0;
                }
                nautilusState.lastTimestamp = null;
                updateNautilusControls();
                renderNautilusFrame();
            }

            function canReplayNautilusFinalSpiral() {
                return !!nautilusState.layout
                    && nautilusState.detailPhase === 0
                    && !nautilusState.playing
                    && !nautilusState.transition
                    && !nautilusState.detailTransition
                    && nautilusState.currentCount >= NAUTILUS_STEP_TOTAL;
            }

            function replayNautilusFinalSpiral() {
                if (!canReplayNautilusFinalSpiral()) {
                    return false;
                }
                nautilusState.playing = false;
                nautilusState.currentCount = NAUTILUS_STEP_TOTAL - 1;
                nautilusState.transition = createNautilusTransition(
                    NAUTILUS_STEP_TOTAL - 1,
                    NAUTILUS_STEP_TOTAL,
                    nautilusState.finalStepDurationMs
                );
                nautilusState.lastTimestamp = null;
                updateNautilusControls();
                renderNautilusFrame();
                return true;
            }

            function nudgeNautilusPhase(direction) {
                if (direction > 0) {
                    completeNautilusSubstage();
                } else if (nautilusState.transition || nautilusState.detailTransition || !isNautilusConstructionComplete()) {
                    return;
                }
                if (!isNautilusConstructionComplete()) {
                    return;
                }
                const targetPhase = clamp(nautilusState.detailPhase + direction, 0, NAUTILUS_EXPLAINER_PHASE_MAX);
                if (targetPhase === nautilusState.detailPhase) {
                    return;
                }
                nautilusState.playing = false;
                nautilusState.detailPhase = targetPhase;
                nautilusState.detailTransition = targetPhase === 2 && direction > 0
                    ? {
                        elapsedMs: 0,
                        durationMs: nautilusState.detailTransitionDurationMs
                    }
                    : null;
                nautilusState.lastTimestamp = null;
                updateNautilusControls();
                renderNautilusFrame();
            }

            function nudgeNautilusStep(direction) {
                if (!nautilusState.layout || nautilusState.detailPhase > 0 || nautilusState.transition) {
                    return;
                }
                const targetCount = clamp(nautilusState.currentCount + direction, 0, NAUTILUS_STEP_TOTAL);
                if (targetCount === nautilusState.currentCount) {
                    if (direction > 0) {
                        replayNautilusFinalSpiral();
                    }
                    return;
                }
                nautilusState.playing = false;
                nautilusState.transition = createNautilusTransition(
                    nautilusState.currentCount,
                    targetCount,
                    targetCount === NAUTILUS_STEP_TOTAL
                        ? nautilusState.finalStepDurationMs
                        : nautilusState.manualStepDurationMs
                );
                nautilusState.lastTimestamp = null;
                updateNautilusControls();
                renderNautilusFrame();
            }

            function toggleNautilusPlayback() {
                if (nautilusState.detailPhase > 0) {
                    return;
                }
                if (nautilusState.playing) {
                    nautilusState.playing = false;
                    finalizeNautilusTransition(true);
                } else {
                    if (nautilusState.currentCount >= NAUTILUS_STEP_TOTAL) {
                        nautilusState.currentCount = 0;
                    }
                    nautilusState.playing = true;
                    beginNautilusAutoTransition();
                }
                nautilusState.lastTimestamp = null;
                updateNautilusControls();
                renderNautilusFrame();
            }

            function resetNautilusDemo() {
                nautilusState.goldenRectangleRatio = NAUTILUS_GOLDEN_RATIO;
                syncNautilusGoldenRatioSlider();
                Object.keys(NAUTILUS_SPIRAL_REFERENCES).forEach(function(referenceKey) {
                    nautilusState.shellCalibrations[referenceKey] = cloneNautilusShellCalibration(
                        NAUTILUS_SPIRAL_REFERENCES[referenceKey].calibrationDefaults
                    );
                });
                syncNautilusShellCalibrationControls();
                nautilusState.detailPhase = 0;
                nautilusState.detailTransition = null;
                setNautilusStep(0);
            }

            function getNautilusSquareCountForStep(count) {
                if (!nautilusState.layout) {
                    return 0;
                }
                return clamp(Math.round(count), 0, nautilusState.layout.squares.length);
            }

            function getActualNautilusBoundsForCount(count) {
                if (!nautilusState.layout || !nautilusState.layout.cumulativeBounds.length) {
                    return null;
                }
                const squareCount = getNautilusSquareCountForStep(count);
                return cloneNautilusBounds(
                    nautilusState.layout.cumulativeBounds[squareCount]
                    || nautilusState.layout.cumulativeBounds[1]
                    || nautilusState.layout.totalBounds
                );
            }

            function getNautilusBoundsForCount(count) {
                if (!nautilusState.layout || !nautilusState.layout.squares.length) {
                    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
                }
                const squareCount = getNautilusSquareCountForStep(count);
                const preferredCount = clamp(Math.max(2, squareCount), 1, nautilusState.layout.squares.length);
                return cloneNautilusBounds(
                    nautilusState.layout.cumulativeBounds[preferredCount]
                    || nautilusState.layout.totalBounds
                );
            }

            function interpolateNautilusBounds(startBounds, endBounds, t) {
                return {
                    minX: lerp(startBounds.minX, endBounds.minX, t),
                    maxX: lerp(startBounds.maxX, endBounds.maxX, t),
                    minY: lerp(startBounds.minY, endBounds.minY, t),
                    maxY: lerp(startBounds.maxY, endBounds.maxY, t)
                };
            }

            function getCurrentNautilusFrame() {
                if (!nautilusState.layout) {
                    return null;
                }
                const ratioRevealProgress = nautilusState.detailPhase >= 2
                    ? nautilusState.detailTransition
                        ? easeInOutCubic(getInterpolatedTransitionStep(nautilusState.detailTransition))
                        : 1
                    : 0;
                if (!nautilusState.transition) {
                    const squareCount = getNautilusSquareCountForStep(nautilusState.currentCount);
                    return {
                        fromCount: nautilusState.currentCount,
                        toCount: nautilusState.currentCount,
                        fromSquareCount: squareCount,
                        toSquareCount: squareCount,
                        squareCount: squareCount,
                        progress: 1,
                        adding: false,
                        removing: false,
                        spiralTransition: false,
                        animatedIndex: -1,
                        animatedAlpha: 1,
                        animatedScale: 1,
                        bounds: getNautilusBoundsForCount(squareCount),
                        spiralProgress: nautilusState.currentCount >= NAUTILUS_STEP_TOTAL ? 1 : 0,
                        narrativeCount: nautilusState.currentCount,
                        detailPhase: nautilusState.detailPhase,
                        ratioRevealProgress: ratioRevealProgress,
                        goldenRectangleRatio: nautilusState.goldenRectangleRatio
                    };
                }

                const transitionProgress = getInterpolatedTransitionStep(nautilusState.transition);
                const fromCount = nautilusState.transition.fromCount;
                const toCount = nautilusState.transition.toCount;
                const fromSquareCount = getNautilusSquareCountForStep(fromCount);
                const toSquareCount = getNautilusSquareCountForStep(toCount);
                const adding = toCount > fromCount;
                const removing = toCount < fromCount;
                const spiralTransition = (adding && toCount === NAUTILUS_STEP_TOTAL) || (removing && fromCount === NAUTILUS_STEP_TOTAL);
                const progress = spiralTransition ? transitionProgress : easeInOutCubic(transitionProgress);
                let spiralProgress = nautilusState.currentCount >= NAUTILUS_STEP_TOTAL ? 1 : 0;
                if (adding && toCount === NAUTILUS_STEP_TOTAL) {
                    spiralProgress = Math.max(transitionProgress, 0.002);
                } else if (removing && fromCount === NAUTILUS_STEP_TOTAL) {
                    spiralProgress = 1 - transitionProgress;
                }
                const animatedIndex = spiralTransition
                    ? -1
                    : adding
                        ? toSquareCount - 1
                        : removing
                            ? fromSquareCount - 1
                            : -1;
                return {
                    fromCount: fromCount,
                    toCount: toCount,
                    fromSquareCount: fromSquareCount,
                    toSquareCount: toSquareCount,
                    squareCount: spiralTransition ? fromSquareCount : (adding ? toSquareCount : removing ? fromSquareCount : toSquareCount),
                    progress: progress,
                    adding: adding,
                    removing: removing,
                    spiralTransition: spiralTransition,
                    animatedIndex: animatedIndex,
                    animatedAlpha: spiralTransition ? 1 : adding ? progress : removing ? 1 - progress : 1,
                    animatedScale: spiralTransition ? 1 : adding ? lerp(0.38, 1, progress) : removing ? lerp(1, 0.38, progress) : 1,
                    bounds: interpolateNautilusBounds(
                        getNautilusBoundsForCount(fromSquareCount),
                        getNautilusBoundsForCount(toSquareCount),
                        progress
                    ),
                    spiralProgress: spiralProgress,
                    narrativeCount: spiralTransition
                        ? (adding ? toCount : (transitionProgress <= 0.5 ? fromCount : toCount))
                        : (adding ? (progress >= 0.54 ? toCount : fromCount) : removing ? (progress < 0.45 ? fromCount : toCount) : toCount),
                    detailPhase: nautilusState.detailPhase,
                    ratioRevealProgress: ratioRevealProgress,
                    goldenRectangleRatio: nautilusState.goldenRectangleRatio
                };
            }

            function getNautilusViewportTransform(size, bounds, frame) {
                const horizontalPad = 28 * size.dpr;
                const topPad = 68 * size.dpr;
                const bottomPad = (frame && frame.detailPhase === 2 ? 168 : 128) * size.dpr;
                const availableWidth = Math.max(1, size.width - horizontalPad * 2);
                const availableHeight = Math.max(1, size.height - topPad - bottomPad);
                const worldWidth = Math.max(1e-6, bounds.maxX - bounds.minX);
                const worldHeight = Math.max(1e-6, bounds.maxY - bounds.minY);
                const scale = Math.min(availableWidth / worldWidth, availableHeight / worldHeight);
                const drawWidth = worldWidth * scale;
                const drawHeight = worldHeight * scale;
                return {
                    dpr: size.dpr,
                    scale: scale,
                    offsetX: horizontalPad + (availableWidth - drawWidth) / 2 - bounds.minX * scale,
                    offsetY: topPad + (availableHeight - drawHeight) / 2 + bounds.maxY * scale
                };
            }

            function nautilusWorldToScreen(x, y, transform) {
                return {
                    x: transform.offsetX + x * transform.scale,
                    y: transform.offsetY - y * transform.scale
                };
            }

            function getNautilusSquareScreenRect(square, transform) {
                const topLeft = nautilusWorldToScreen(square.x, square.y + square.size, transform);
                return {
                    x: topLeft.x,
                    y: topLeft.y,
                    size: square.size * transform.scale
                };
            }

            function getNautilusBoundsScreenRect(bounds, transform) {
                if (!bounds) {
                    return null;
                }
                const topLeft = nautilusWorldToScreen(bounds.minX, bounds.maxY, transform);
                const bottomRight = nautilusWorldToScreen(bounds.maxX, bounds.minY, transform);
                return {
                    x: topLeft.x,
                    y: topLeft.y,
                    width: bottomRight.x - topLeft.x,
                    height: bottomRight.y - topLeft.y
                };
            }

            function getNautilusSquarePalette(index) {
                const hue = 30 + index * 8;
                const lightness = Math.max(56, 84 - index * 2.5);
                return {
                    fill: 'hsla(' + hue + ', 86%, ' + lightness + '%, 1)',
                    fillGlow: 'hsla(' + hue + ', 92%, ' + Math.min(92, lightness + 7) + '%, 1)',
                    stroke: 'hsla(' + (hue + 6) + ', 56%, 38%, 1)',
                    text: index >= 7 ? '#fffaf0' : '#7c2d12'
                };
            }

            function drawNautilusBackdrop(ctx, size, shellMix) {
                const reveal = clamp(shellMix || 0, 0, 1);
                const background = ctx.createLinearGradient(0, 0, 0, size.height);
                background.addColorStop(0, '#fffaf1');
                background.addColorStop(0.55, '#fff4df');
                background.addColorStop(1, '#f9ebd1');
                ctx.save();
                ctx.globalAlpha = lerp(1, 0.72, reveal);
                ctx.fillStyle = background;
                ctx.fillRect(0, 0, size.width, size.height);
                ctx.restore();

                const glow = ctx.createRadialGradient(
                    size.width * 0.24,
                    size.height * 0.18,
                    0,
                    size.width * 0.24,
                    size.height * 0.18,
                    size.width * 0.72
                );
                glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
                glow.addColorStop(0.6, 'rgba(255, 255, 255, 0.22)');
                glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.save();
                ctx.globalAlpha = lerp(1, 0.58, reveal);
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, size.width, size.height);
                ctx.restore();

                ctx.save();
                ctx.strokeStyle = 'rgba(191, 219, 254, ' + lerp(0.18, 0.06, reveal).toFixed(3) + ')';
                ctx.lineWidth = 1 * size.dpr;
                const gridStep = 48 * size.dpr;
                for (let x = gridStep * 0.5; x < size.width; x += gridStep) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, size.height);
                    ctx.stroke();
                }
                for (let y = gridStep * 0.5; y < size.height; y += gridStep) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(size.width, y);
                    ctx.stroke();
                }
                ctx.restore();
            }

            function getNautilusShellRenderMetrics(transform, frame) {
                const referenceKey = getNautilusReferenceKeyForPhase(frame.detailPhase);
                const referenceConfig = getNautilusReferenceConfig(referenceKey);
                const image = referenceKey ? nautilusState.referenceImages[referenceKey] : null;
                if (!referenceConfig || !image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
                    return null;
                }
                const shellBounds = getNautilusBoundsScreenRect(nautilusState.layout.totalBounds || frame.bounds, transform);
                if (!shellBounds) {
                    return null;
                }
                const calibration = nautilusState.shellCalibrations[referenceKey];
                if (!calibration) {
                    return null;
                }
                const spiralAnchor = nautilusWorldToScreen(
                    referenceConfig.anchorWorldX,
                    referenceConfig.anchorWorldY,
                    transform
                );
                const imageAspect = image.naturalWidth / image.naturalHeight;
                let drawWidth = shellBounds.width * calibration.widthScale;
                let drawHeight = drawWidth / imageAspect;
                if (drawHeight < shellBounds.height * referenceConfig.minHeightScale) {
                    drawHeight = shellBounds.height * referenceConfig.minHeightScale;
                    drawWidth = drawHeight * imageAspect;
                }
                return {
                    image: image,
                    referenceKey: referenceKey,
                    referenceConfig: referenceConfig,
                    calibration: calibration,
                    spiralAnchorX: spiralAnchor.x,
                    spiralAnchorY: spiralAnchor.y,
                    anchorX: spiralAnchor.x + calibration.offsetX * shellBounds.width,
                    anchorY: spiralAnchor.y + calibration.offsetY * shellBounds.height,
                    rotationRadians: (calibration.rotationDegrees || 0) * Math.PI / 180,
                    shearX: Math.tan((calibration.skewX || 0) * Math.PI / 180),
                    shearY: Math.tan((calibration.skewY || 0) * Math.PI / 180),
                    drawWidth: drawWidth,
                    drawHeight: drawHeight,
                    opacity: referenceConfig.opacity == null ? 0.82 : referenceConfig.opacity
                };
            }

            function drawNautilusShellReference(ctx, transform, frame) {
                const metrics = getNautilusShellRenderMetrics(transform, frame);
                if (!metrics) {
                    return null;
                }
                ctx.save();
                ctx.globalAlpha = metrics.opacity;
                if ('filter' in ctx) {
                    ctx.filter = 'saturate(0.96) contrast(1.08)';
                }
                ctx.translate(metrics.anchorX, metrics.anchorY);
                ctx.rotate(metrics.rotationRadians);
                ctx.scale(metrics.calibration.flipX ? -1 : 1, 1);
                ctx.transform(1, metrics.shearY, metrics.shearX, 1, 0, 0);
                ctx.drawImage(
                    metrics.image,
                    -metrics.drawWidth * metrics.calibration.anchorImageX,
                    -metrics.drawHeight * metrics.calibration.anchorImageY,
                    metrics.drawWidth,
                    metrics.drawHeight
                );
                ctx.restore();
                return metrics;
            }

            function drawNautilusShellCalibrationGuides(ctx, metrics, dpr) {
                if (!metrics || !shouldShowNautilusShellCalibration()) {
                    return;
                }
                ctx.save();
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.78)';
                ctx.lineWidth = 1.4 * dpr;
                ctx.setLineDash([6 * dpr, 5 * dpr]);
                ctx.beginPath();
                ctx.moveTo(metrics.spiralAnchorX, metrics.spiralAnchorY);
                ctx.lineTo(metrics.anchorX, metrics.anchorY);
                ctx.stroke();
                ctx.setLineDash([]);

                function drawCrosshair(x, y, color) {
                    const radius = 7 * dpr;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.6 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(x - radius, y);
                    ctx.lineTo(x + radius, y);
                    ctx.moveTo(x, y - radius);
                    ctx.lineTo(x, y + radius);
                    ctx.stroke();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(x, y, 2.2 * dpr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    ctx.arc(x, y, 4.8 * dpr, 0, Math.PI * 2);
                    ctx.stroke();
                }

                drawCrosshair(metrics.spiralAnchorX, metrics.spiralAnchorY, 'rgba(37, 99, 235, 0.96)');
                drawCrosshair(metrics.anchorX, metrics.anchorY, 'rgba(217, 119, 6, 0.96)');
                ctx.restore();
            }

            function drawNautilusSquare(ctx, square, transform, options) {
                options = options || {};
                const alpha = clamp(options.alpha == null ? 1 : options.alpha, 0, 1);
                if (alpha <= 0.01) {
                    return;
                }
                const appearanceScale = clamp(options.scale == null ? 1 : options.scale, 0.2, 1.2);
                const rect = getNautilusSquareScreenRect(square, transform);
                const drawSize = rect.size * appearanceScale;
                const drawX = rect.x + (rect.size - drawSize) / 2;
                const drawY = rect.y + (rect.size - drawSize) / 2;
                const palette = getNautilusSquarePalette(square.index);
                const radius = Math.min(16 * transform.dpr, drawSize * 0.12);

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.shadowColor = 'rgba(180, 83, 9, 0.18)';
                ctx.shadowBlur = 14 * transform.dpr;
                ctx.shadowOffsetY = 5 * transform.dpr;
                traceRoundedRectPath(ctx, drawX, drawY, drawSize, drawSize, radius);
                const fill = ctx.createLinearGradient(drawX, drawY, drawX + drawSize, drawY + drawSize);
                fill.addColorStop(0, palette.fillGlow);
                fill.addColorStop(1, palette.fill);
                ctx.fillStyle = fill;
                ctx.lineWidth = Math.max(1.2 * transform.dpr, rect.size * 0.03);
                ctx.strokeStyle = palette.stroke;
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;

                if (drawSize > 22 * transform.dpr) {
                    const fontSize = clamp(drawSize * 0.22, 11 * transform.dpr, 22 * transform.dpr);
                    ctx.fillStyle = palette.text;
                    ctx.font = '700 ' + fontSize + 'px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(square.value), drawX + drawSize / 2, drawY + drawSize / 2 + 0.5 * transform.dpr);
                }
                ctx.restore();
            }

            function getNautilusArcDefinition(square, transform) {
                const rect = getNautilusSquareScreenRect(square, transform);
                if (square.arcCorner === 'bl') {
                    return {
                        x: rect.x,
                        y: rect.y + rect.size,
                        radius: rect.size,
                        startAngle: Math.PI * 1.5,
                        endAngle: Math.PI * 2
                    };
                }
                if (square.arcCorner === 'br') {
                    return {
                        x: rect.x + rect.size,
                        y: rect.y + rect.size,
                        radius: rect.size,
                        startAngle: Math.PI,
                        endAngle: Math.PI * 1.5
                    };
                }
                if (square.arcCorner === 'tr') {
                    return {
                        x: rect.x + rect.size,
                        y: rect.y,
                        radius: rect.size,
                        startAngle: Math.PI * 0.5,
                        endAngle: Math.PI
                    };
                }
                return {
                    x: rect.x,
                    y: rect.y,
                    radius: rect.size,
                    startAngle: 0,
                    endAngle: Math.PI * 0.5
                };
            }

            function getNautilusArcEndPoint(square, transform, progress) {
                const arc = getNautilusArcDefinition(square, transform);
                const angle = arc.startAngle + (arc.endAngle - arc.startAngle) * clamp(progress, 0, 1);
                return {
                    x: arc.x + Math.cos(angle) * arc.radius,
                    y: arc.y + Math.sin(angle) * arc.radius
                };
            }

            function strokeNautilusArcPass(ctx, square, transform, progress) {
                if (progress <= 0.001) {
                    return;
                }
                const arc = getNautilusArcDefinition(square, transform);
                const endAngle = arc.startAngle + (arc.endAngle - arc.startAngle) * clamp(progress, 0, 1);
                ctx.beginPath();
                ctx.arc(arc.x, arc.y, arc.radius, arc.startAngle, endAngle, false);
                ctx.stroke();
            }

            function getNautilusSpiralState(transform, spiralProgress) {
                const reveal = clamp(spiralProgress, 0, 1);
                if (!nautilusState.layout || !nautilusState.layout.squares.length || reveal <= 0.001) {
                    return null;
                }
                const totalArcs = nautilusState.layout.squares.length;
                let totalLengthUnits = 0;
                const arcLengthUnits = nautilusState.layout.squares.map(function(square) {
                    totalLengthUnits += square.size;
                    return square.size;
                });
                let remainingLengthUnits = reveal * totalLengthUnits;
                let fullArcs = 0;
                while (fullArcs < totalArcs && remainingLengthUnits >= arcLengthUnits[fullArcs]) {
                    remainingLengthUnits -= arcLengthUnits[fullArcs];
                    fullArcs += 1;
                }
                const partialProgress = fullArcs >= totalArcs
                    ? 0
                    : clamp(remainingLengthUnits / arcLengthUnits[fullArcs], 0, 1);
                const headIndex = fullArcs >= totalArcs ? totalArcs - 1 : fullArcs;
                const headProgress = fullArcs >= totalArcs ? 1 : Math.max(partialProgress, 0.001);
                return {
                    totalArcs: totalArcs,
                    fullArcs: fullArcs,
                    partialProgress: partialProgress,
                    headPoint: getNautilusArcEndPoint(nautilusState.layout.squares[headIndex], transform, headProgress)
                };
            }

            function drawNautilusSpiral(ctx, transform, spiralProgress) {
                const spiralState = getNautilusSpiralState(transform, spiralProgress);
                if (!spiralState) {
                    return;
                }
                const underlayWidth = Math.max(4.8 * transform.dpr, Math.min(15 * transform.dpr, transform.scale * 0.5));
                const overlayWidth = Math.max(3 * transform.dpr, Math.min(8.8 * transform.dpr, transform.scale * 0.3));

                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.56)';
                ctx.lineWidth = underlayWidth;
                ctx.shadowColor = 'rgba(180, 83, 9, 0.24)';
                ctx.shadowBlur = 22 * transform.dpr;
                for (let index = 0; index < spiralState.fullArcs; index += 1) {
                    strokeNautilusArcPass(ctx, nautilusState.layout.squares[index], transform, 1);
                }
                if (spiralState.fullArcs < spiralState.totalArcs) {
                    strokeNautilusArcPass(ctx, nautilusState.layout.squares[spiralState.fullArcs], transform, spiralState.partialProgress);
                }
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(13, 148, 136, 0.98)';
                ctx.lineWidth = overlayWidth;
                for (let index = 0; index < spiralState.fullArcs; index += 1) {
                    strokeNautilusArcPass(ctx, nautilusState.layout.squares[index], transform, 1);
                }
                if (spiralState.fullArcs < spiralState.totalArcs) {
                    strokeNautilusArcPass(ctx, nautilusState.layout.squares[spiralState.fullArcs], transform, spiralState.partialProgress);
                }

                const head = spiralState.headPoint;
                if (head) {
                    const glowRadius = clamp(transform.scale * 0.28, 22 * transform.dpr, 42 * transform.dpr);
                    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, glowRadius);
                    glow.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
                    glow.addColorStop(0.2, 'rgba(253, 224, 71, 0.96)');
                    glow.addColorStop(0.58, 'rgba(251, 191, 36, 0.38)');
                    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(head.x, head.y, glowRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff7ed';
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
                    ctx.lineWidth = Math.max(1.4 * transform.dpr, 2.2 * transform.dpr);
                    ctx.beginPath();
                    ctx.arc(head.x, head.y, Math.max(5.2 * transform.dpr, overlayWidth * 0.9), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();
            }

            function getNautilusSequenceItems(frame) {
                const items = [];
                if (!nautilusState.layout) {
                    return items;
                }
                if (!nautilusState.transition || frame.spiralTransition) {
                    for (let index = 0; index < frame.squareCount; index += 1) {
                        items.push({
                            index: index,
                            alpha: 1,
                            highlight: index === frame.squareCount - 1
                        });
                    }
                    return items;
                }
                if (frame.adding) {
                    for (let index = 0; index < frame.fromSquareCount; index += 1) {
                        items.push({
                            index: index,
                            alpha: 1,
                            highlight: false
                        });
                    }
                    if (frame.animatedIndex >= 0 && frame.animatedAlpha > 0.01) {
                        items.push({
                            index: frame.animatedIndex,
                            alpha: frame.animatedAlpha,
                            highlight: true
                        });
                    }
                    return items;
                }
                for (let index = 0; index < frame.toSquareCount; index += 1) {
                    items.push({
                        index: index,
                        alpha: 1,
                        highlight: index === frame.toSquareCount - 1
                    });
                }
                if (frame.animatedIndex >= 0 && frame.animatedAlpha > 0.01) {
                    items.push({
                        index: frame.animatedIndex,
                        alpha: frame.animatedAlpha,
                        highlight: true
                    });
                    items.sort(function(left, right) {
                        return left.index - right.index;
                    });
                }
                return items;
            }

            function getNautilusExpressionState(frame) {
                const expressionCount = (!nautilusState.transition || frame.spiralTransition)
                    ? frame.squareCount
                    : frame.adding
                        ? frame.toSquareCount
                        : frame.removing
                            ? frame.fromSquareCount
                            : frame.squareCount;
                if (expressionCount < 3) {
                    return null;
                }
                return {
                    leftIndex: expressionCount - 3,
                    rightIndex: expressionCount - 2,
                    resultIndex: expressionCount - 1,
                    resultAlpha: frame.animatedIndex === expressionCount - 1 ? frame.animatedAlpha : 1
                };
            }

            function getNautilusChipPreset(ctx, size, texts, availableWidth) {
                const presets = [
                    { fontSize: 13, paddingX: 11, paddingY: 6, gap: 8 },
                    { fontSize: 12, paddingX: 9, paddingY: 6, gap: 6 },
                    { fontSize: 11, paddingX: 7, paddingY: 5, gap: 4 },
                    { fontSize: 10, paddingX: 6, paddingY: 5, gap: 3 }
                ];
                for (let presetIndex = 0; presetIndex < presets.length; presetIndex += 1) {
                    const preset = presets[presetIndex];
                    ctx.save();
                    ctx.font = '700 ' + (preset.fontSize * size.dpr) + 'px Arial';
                    const widths = texts.map(function(text) {
                        return ctx.measureText(text).width + preset.paddingX * 2 * size.dpr;
                    });
                    ctx.restore();
                    const totalWidth = widths.reduce(function(total, width) {
                        return total + width;
                    }, 0) + Math.max(0, texts.length - 1) * preset.gap * size.dpr;
                    if (totalWidth <= availableWidth || presetIndex === presets.length - 1) {
                        return {
                            fontSize: preset.fontSize,
                            paddingX: preset.paddingX,
                            paddingY: preset.paddingY,
                            gap: preset.gap,
                            widths: widths,
                            totalWidth: totalWidth
                        };
                    }
                }
                return null;
            }
            function getNautilusViewportTitleText(frame) {
                if (frame.detailPhase >= 3) {
                    return 'Golden Ratio';
                }
                if (frame.detailPhase >= 2) {
                    return 'Fibonacci ratios';
                }
                if (frame.detailPhase >= 1) {
                    return 'Spiral galaxy comparison';
                }
                return 'Fibonacci spiral';
            }

            function drawNautilusViewportTitle(ctx, size, frame) {
                drawCanvasChip(ctx, getNautilusViewportTitleText(frame), size.width / 2, 16 * size.dpr, {
                    dpr: size.dpr,
                    align: 'center',
                    background: 'rgba(255, 250, 235, 0.95)',
                    borderColor: 'rgba(217, 119, 6, 0.34)',
                    textColor: '#9a3412',
                    fontSize: 14,
                    paddingX: 14,
                    paddingY: 7
                });
            }

            function getNautilusViewportProgressCount(frame) {
                return clamp(
                    Math.round(frame && Number.isFinite(frame.narrativeCount) ? frame.narrativeCount : nautilusState.currentCount),
                    0,
                    NAUTILUS_STEP_TOTAL
                );
            }

            function drawNautilusViewportProgressCounter(ctx, size, frame) {
                drawCanvasChip(ctx, getNautilusViewportProgressCount(frame) + '/' + NAUTILUS_STEP_TOTAL, 16 * size.dpr, 16 * size.dpr, {
                    dpr: size.dpr,
                    align: 'left',
                    background: 'rgba(255, 250, 235, 0.95)',
                    borderColor: 'rgba(217, 119, 6, 0.28)',
                    textColor: '#9a3412',
                    fontSize: 13,
                    paddingX: 12,
                    paddingY: 7
                });
            }

            function getNautilusStripFrame(size, detailPhase) {
                const stripX = 18 * size.dpr;
                const stripHeight = (detailPhase === 2 ? 142 : 78) * size.dpr;
                return {
                    x: stripX,
                    y: size.height - stripHeight - 18 * size.dpr,
                    width: size.width - stripX * 2,
                    height: stripHeight
                };
            }

            function drawNautilusStripBackground(ctx, strip, size) {
                ctx.save();
                traceRoundedRectPath(ctx, strip.x, strip.y, strip.width, strip.height, 20 * size.dpr);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.strokeStyle = 'rgba(191, 203, 220, 0.56)';
                ctx.lineWidth = 1 * size.dpr;
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            function getNautilusSequenceRowPreset(ctx, size, values, availableWidth) {
                const texts = values.filter(function(value) {
                    return value != null && value !== '';
                }).map(function(value) {
                    return String(value);
                });
                if (!values.length || !texts.length) {
                    return null;
                }
                const presets = [
                    { fontSize: 16, paddingX: 13, paddingY: 8, gap: 12 },
                    { fontSize: 15, paddingX: 12, paddingY: 8, gap: 10 },
                    { fontSize: 14, paddingX: 11, paddingY: 7, gap: 8 },
                    { fontSize: 13, paddingX: 9, paddingY: 6, gap: 7 },
                    { fontSize: 12, paddingX: 8, paddingY: 6, gap: 6 }
                ];
                for (let presetIndex = 0; presetIndex < presets.length; presetIndex += 1) {
                    const preset = presets[presetIndex];
                    ctx.save();
                    ctx.font = '700 ' + (preset.fontSize * size.dpr) + 'px Arial';
                    const maxTextWidth = texts.reduce(function(maximum, text) {
                        return Math.max(maximum, ctx.measureText(text).width);
                    }, 0);
                    ctx.restore();
                    const columnWidth = maxTextWidth + preset.paddingX * 2 * size.dpr;
                    const gapPx = preset.gap * size.dpr;
                    const totalWidth = columnWidth * values.length + gapPx * Math.max(0, values.length - 1);
                    if (totalWidth <= availableWidth || presetIndex === presets.length - 1) {
                        return {
                            fontSize: preset.fontSize,
                            paddingX: preset.paddingX,
                            paddingY: preset.paddingY,
                            gapPx: gapPx,
                            columnWidth: columnWidth,
                            totalWidth: totalWidth
                        };
                    }
                }
                return null;
            }

            function getNautilusSequenceRowLayout(ctx, size, values, strip) {
                const preset = getNautilusSequenceRowPreset(ctx, size, values, strip.width - 28 * size.dpr);
                if (!preset) {
                    return null;
                }
                const firstCenterX = strip.x + (strip.width - preset.totalWidth) / 2 + preset.columnWidth / 2;
                return {
                    preset: preset,
                    centers: values.map(function(_value, index) {
                        return firstCenterX + index * (preset.columnWidth + preset.gapPx);
                    }),
                    columnWidth: preset.columnWidth
                };
            }

            function drawNautilusRowToken(ctx, text, x, y, size, preset, options) {
                if (text == null || text === '') {
                    return;
                }
                options = options || {};
                ctx.save();
                ctx.globalAlpha = clamp(options.alpha == null ? 1 : options.alpha, 0, 1);
                ctx.translate(x, y);
                const scale = options.scale == null ? 1 : options.scale;
                ctx.scale(scale, scale);
                drawCanvasChip(ctx, String(text), 0, 0, {
                    dpr: size.dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    fontSize: preset.fontSize,
                    paddingX: preset.paddingX,
                    paddingY: preset.paddingY,
                    background: options.background || 'rgba(255, 255, 255, 0.96)',
                    borderColor: options.borderColor || 'rgba(191, 203, 220, 0.74)',
                    textColor: options.textColor || '#334155'
                });
                ctx.restore();
            }

            function drawNautilusEquationMarkers(ctx, centers, y, size, count, opacity) {
                if (count < 3) {
                    return;
                }
                const alpha = clamp(opacity == null ? 1 : opacity, 0, 1);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#9a3412';
                ctx.font = '800 ' + (18 * size.dpr) + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', (centers[count - 3] + centers[count - 2]) / 2, y);
                ctx.fillText('=', (centers[count - 2] + centers[count - 1]) / 2, y);
                ctx.restore();
            }

            function drawNautilusNumberRow(ctx, size, values, strip, rowY, options) {
                options = options || {};
                const layout = getNautilusSequenceRowLayout(ctx, size, values, strip);
                if (!layout) {
                    return null;
                }
                const tokenOptions = options.tokenOptions || [];
                values.forEach(function(value, index) {
                    const token = tokenOptions[index] || {};
                    const highlight = token.highlight || index === options.highlightIndex;
                    drawNautilusRowToken(ctx, value, layout.centers[index], rowY, size, layout.preset, {
                        alpha: token.alpha,
                        scale: token.scale,
                        background: token.background || (highlight ? 'rgba(255, 247, 214, 0.98)' : 'rgba(255, 255, 255, 0.96)'),
                        borderColor: token.borderColor || (highlight ? 'rgba(217, 119, 6, 0.54)' : 'rgba(191, 203, 220, 0.74)'),
                        textColor: token.textColor || (highlight ? '#92400e' : '#334155')
                    });
                });
                if (options.showEquation !== false) {
                    drawNautilusEquationMarkers(ctx, layout.centers, rowY, size, values.length, options.markerAlpha);
                }
                return layout;
            }

            function drawNautilusFractionBars(ctx, layout, firstRowY, secondRowY, size, alpha, endIndex) {
                const appliedAlpha = clamp(alpha == null ? 1 : alpha, 0, 1);
                if (!layout || appliedAlpha <= 0.001) {
                    return;
                }
                const barY = (firstRowY + secondRowY) / 2;
                const maxIndex = endIndex == null ? layout.centers.length : Math.min(layout.centers.length, endIndex);
                ctx.save();
                ctx.globalAlpha = appliedAlpha;
                ctx.strokeStyle = 'rgba(217, 119, 6, 0.34)';
                ctx.lineWidth = 1.2 * size.dpr;
                for (let index = 1; index < maxIndex; index += 1) {
                    ctx.beginPath();
                    ctx.moveTo(layout.centers[index] - layout.columnWidth / 2 + 5 * size.dpr, barY);
                    ctx.lineTo(layout.centers[index] + layout.columnWidth / 2 - 5 * size.dpr, barY);
                    ctx.stroke();
                }
                ctx.restore();
            }

            function drawNautilusRatioTextRow(ctx, size, values, layout, rowY, alpha) {
                if (!layout) {
                    return;
                }
                const appliedAlpha = clamp(alpha == null ? 1 : alpha, 0, 1);
                if (appliedAlpha <= 0.001) {
                    return;
                }
                const fontSize = clamp((layout.columnWidth / size.dpr) * 0.27, 9.8, 12.4) * size.dpr;
                values.forEach(function(value, index) {
                    if (value == null || value === '') {
                        return;
                    }
                    ctx.save();
                    ctx.globalAlpha = appliedAlpha;
                    ctx.fillStyle = value === '→'
                        ? '#d97706'
                        : index >= values.length - 4
                            ? '#0f766e'
                            : '#1d4ed8';
                    ctx.font = '700 ' + (value === '→' ? fontSize * 1.18 : fontSize) + 'px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(value), layout.centers[index], rowY);
                    ctx.restore();
                });
            }

            function drawNautilusRatioCallout(ctx, strip, size, alpha) {
                if (alpha <= 0.001) {
                    return;
                }
                ctx.save();
                ctx.globalAlpha = clamp(alpha, 0, 1);
                drawCanvasChip(ctx, NAUTILUS_GOLDEN_RATIO_TEXT, strip.x + strip.width - 16 * size.dpr, strip.y + strip.height - 16 * size.dpr, {
                    dpr: size.dpr,
                    align: 'right',
                    verticalAlign: 'bottom',
                    fontSize: 13,
                    paddingX: 12,
                    paddingY: 7,
                    background: 'rgba(255, 247, 214, 0.98)',
                    borderColor: 'rgba(217, 119, 6, 0.44)',
                    textColor: '#92400e'
                });
                ctx.restore();
            }

            function drawNautilusGoldenRatioStrip(ctx, size, frame) {
                const strip = getNautilusStripFrame(size, frame.detailPhase);
                const rowOneY = strip.y + 30 * size.dpr;
                const rowTwoY = strip.y + 63 * size.dpr;
                const rowThreeY = strip.y + 100 * size.dpr;
                const fibValues = NAUTILUS_FIBONACCI_SEQUENCE.map(function(value) {
                    return String(value);
                });
                const topValues = fibValues.concat('…');
                const shiftedValues = [null].concat(fibValues.slice(0, -1), '…');
                const ratioValues = [null].concat(NAUTILUS_FIBONACCI_SEQUENCE.slice(1).map(function(value, index) {
                    return formatNautilusRatio(value / NAUTILUS_FIBONACCI_SEQUENCE[index]);
                })).concat('→');
                const shiftedReveal = frame.ratioRevealProgress;
                const shiftedStaticAlpha = shiftedReveal >= 1 ? 1 : clamp((shiftedReveal - 0.72) / 0.28, 0, 1);
                const ratioAlpha = clamp((shiftedReveal - 0.34) / 0.66, 0, 1);

                drawNautilusStripBackground(ctx, strip, size);
                const topLayout = drawNautilusNumberRow(ctx, size, topValues, strip, rowOneY, {
                    highlightIndex: topValues.length - 2
                });
                if (!topLayout) {
                    return;
                }

                if (shiftedStaticAlpha > 0.001) {
                    drawNautilusNumberRow(ctx, size, shiftedValues, strip, rowTwoY, {
                        showEquation: false,
                        tokenOptions: shiftedValues.map(function() {
                            return {
                                alpha: shiftedStaticAlpha,
                                background: 'rgba(255, 250, 235, 0.98)',
                                borderColor: 'rgba(217, 119, 6, 0.34)',
                                textColor: '#7c2d12'
                            };
                        })
                    });
                }

                if (shiftedReveal < 0.999) {
                    for (let index = 0; index < fibValues.length - 1; index += 1) {
                        drawNautilusRowToken(
                            ctx,
                            fibValues[index],
                            lerp(topLayout.centers[index], topLayout.centers[index + 1], shiftedReveal),
                            lerp(rowOneY, rowTwoY, shiftedReveal),
                            size,
                            topLayout.preset,
                            {
                                alpha: 0.96,
                                scale: 1 + Math.sin(shiftedReveal * Math.PI) * 0.14,
                                background: 'rgba(255, 250, 235, 0.98)',
                                borderColor: 'rgba(217, 119, 6, 0.4)',
                                textColor: '#7c2d12'
                            }
                        );
                    }
                }

                drawNautilusFractionBars(ctx, topLayout, rowOneY, rowTwoY, size, ratioAlpha, NAUTILUS_FIBONACCI_SEQUENCE.length);
                drawNautilusRatioTextRow(ctx, size, ratioValues, topLayout, rowThreeY, ratioAlpha);
                drawNautilusRatioCallout(ctx, strip, size, ratioAlpha);
            }

            function getNautilusGoldenRectangleGlow(ratio) {
                return clamp(1 - Math.abs(ratio - NAUTILUS_GOLDEN_RATIO) / 0.18, 0, 1);
            }

            function drawNautilusDimensionGuide(ctx, startX, startY, endX, endY, label, size, options) {
                options = options || {};
                const capSize = (options.capSize || 7) * size.dpr;
                const isVertical = Math.abs(endX - startX) < Math.abs(endY - startY);
                ctx.save();
                ctx.strokeStyle = options.strokeStyle || 'rgba(148, 163, 184, 0.86)';
                ctx.lineWidth = (options.lineWidth || 1.6) * size.dpr;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                ctx.beginPath();
                if (isVertical) {
                    ctx.moveTo(startX - capSize, startY);
                    ctx.lineTo(startX + capSize, startY);
                    ctx.moveTo(endX - capSize, endY);
                    ctx.lineTo(endX + capSize, endY);
                } else {
                    ctx.moveTo(startX, startY - capSize);
                    ctx.lineTo(startX, startY + capSize);
                    ctx.moveTo(endX, endY - capSize);
                    ctx.lineTo(endX, endY + capSize);
                }
                ctx.stroke();
                drawCanvasChip(ctx, label, (startX + endX) / 2, (startY + endY) / 2, {
                    dpr: size.dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    fontSize: options.fontSize || 12,
                    paddingX: 10,
                    paddingY: 6,
                    background: options.background || 'rgba(255, 255, 255, 0.94)',
                    borderColor: options.borderColor || 'rgba(191, 203, 220, 0.78)',
                    textColor: options.textColor || '#475569'
                });
                ctx.restore();
            }

            function drawNautilusGoldenRectangleStage(ctx, size, frame) {
                const ratio = clampNautilusGoldenRectangleRatio(frame.goldenRectangleRatio);
                const glow = getNautilusGoldenRectangleGlow(ratio);
                const frameBox = {
                    x: 42 * size.dpr,
                    y: 82 * size.dpr,
                    width: size.width - 84 * size.dpr,
                    height: size.height - 238 * size.dpr
                };
                const rectHeight = Math.min(frameBox.height, (frameBox.width * 0.94) / ratio);
                const rectWidth = rectHeight * ratio;
                const rectX = frameBox.x + (frameBox.width - rectWidth) / 2;
                const rectY = frameBox.y + Math.max(0, (frameBox.height - rectHeight) / 2 - 10 * size.dpr);
                const dividerX = rectX + rectHeight;
                const guideYTop = rectY - 20 * size.dpr;
                const guideYBottom = rectY + rectHeight + 22 * size.dpr;
                const rectangleStroke = glow > 0.72 ? '#d97706' : '#2563eb';
                const rectangleFill = glow > 0.72 ? 'rgba(255, 247, 214, 0.28)' : 'rgba(219, 234, 254, 0.2)';
                const squareFill = glow > 0.72 ? 'rgba(250, 204, 21, 0.2)' : 'rgba(191, 219, 254, 0.18)';
                const remainderFill = glow > 0.72 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(96, 165, 250, 0.12)';

                ctx.save();
                ctx.shadowColor = glow > 0.45
                    ? 'rgba(250, 204, 21, ' + (0.2 + glow * 0.3).toFixed(3) + ')'
                    : 'rgba(59, 130, 246, 0.12)';
                ctx.shadowBlur = (12 + glow * 24) * size.dpr;
                traceRoundedRectPath(ctx, rectX, rectY, rectWidth, rectHeight, 18 * size.dpr);
                ctx.fillStyle = rectangleFill;
                ctx.strokeStyle = rectangleStroke;
                ctx.lineWidth = 2.2 * size.dpr;
                ctx.fill();
                ctx.stroke();
                ctx.shadowBlur = 0;

                traceRoundedRectPath(ctx, rectX, rectY, rectHeight, rectHeight, 18 * size.dpr);
                ctx.fillStyle = squareFill;
                ctx.fill();
                ctx.fillStyle = remainderFill;
                ctx.fillRect(dividerX, rectY, rectWidth - rectHeight, rectHeight);
                ctx.restore();

                ctx.save();
                ctx.strokeStyle = glow > 0.72 ? 'rgba(217, 119, 6, 0.92)' : 'rgba(37, 99, 235, 0.84)';
                ctx.lineWidth = 1.8 * size.dpr;
                ctx.beginPath();
                ctx.moveTo(dividerX, rectY);
                ctx.lineTo(dividerX, rectY + rectHeight);
                ctx.stroke();
                ctx.restore();

                drawNautilusDimensionGuide(ctx, rectX, guideYTop, rectX + rectWidth, guideYTop, 'a + b', size, {
                    strokeStyle: 'rgba(148, 163, 184, 0.88)',
                    textColor: '#475569'
                });
                drawNautilusDimensionGuide(ctx, rectX, guideYBottom, dividerX, guideYBottom, 'a', size, {
                    strokeStyle: glow > 0.72 ? 'rgba(217, 119, 6, 0.9)' : 'rgba(37, 99, 235, 0.82)',
                    background: glow > 0.72 ? 'rgba(255, 247, 214, 0.98)' : 'rgba(239, 246, 255, 0.94)',
                    borderColor: glow > 0.72 ? 'rgba(217, 119, 6, 0.4)' : 'rgba(37, 99, 235, 0.28)',
                    textColor: glow > 0.72 ? '#92400e' : '#1d4ed8'
                });
                drawNautilusDimensionGuide(ctx, dividerX, guideYBottom, rectX + rectWidth, guideYBottom, 'b', size, {
                    strokeStyle: glow > 0.72 ? 'rgba(217, 119, 6, 0.9)' : 'rgba(37, 99, 235, 0.82)',
                    background: glow > 0.72 ? 'rgba(255, 247, 214, 0.98)' : 'rgba(239, 246, 255, 0.94)',
                    borderColor: glow > 0.72 ? 'rgba(217, 119, 6, 0.4)' : 'rgba(37, 99, 235, 0.28)',
                    textColor: glow > 0.72 ? '#92400e' : '#1d4ed8'
                });

                ctx.save();
                ctx.fillStyle = '#7c2d12';
                ctx.font = '700 ' + (17 * size.dpr) + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('a / b = (a + b) / a', size.width / 2, rectY + rectHeight + 66 * size.dpr);
                ctx.restore();

                drawCanvasChip(ctx, NAUTILUS_GOLDEN_RATIO_TEXT, size.width / 2, rectY + rectHeight + 98 * size.dpr, {
                    dpr: size.dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    fontSize: 14,
                    paddingX: 14,
                    paddingY: 8,
                    background: glow > 0.72 ? 'rgba(255, 247, 214, 0.98)' : 'rgba(255, 255, 255, 0.96)',
                    borderColor: glow > 0.72 ? 'rgba(217, 119, 6, 0.44)' : 'rgba(191, 203, 220, 0.72)',
                    textColor: glow > 0.72 ? '#92400e' : '#475569'
                });
            }

            function drawNautilusSequenceStrip(ctx, size, frame) {
                if (frame.detailPhase === 2) {
                    drawNautilusGoldenRatioStrip(ctx, size, frame);
                    return;
                }
                const strip = getNautilusStripFrame(size, frame.detailPhase);
                const items = getNautilusSequenceItems(frame);
                drawNautilusStripBackground(ctx, strip, size);
                if (!items.length) {
                    return;
                }
                const values = items.map(function(item) {
                    return String(NAUTILUS_FIBONACCI_SEQUENCE[item.index]);
                });
                drawNautilusNumberRow(ctx, size, values, strip, strip.y + strip.height / 2, {
                    tokenOptions: items.map(function(item) {
                        return {
                            alpha: item.alpha,
                            highlight: item.highlight
                        };
                    }),
                    highlightIndex: -1
                });
            }

            function formatNautilusEquation(squareCount) {
                const clamped = clamp(squareCount, 0, NAUTILUS_SQUARE_TOTAL);
                if (clamped < 3) {
                    return '1 + 1 = 2';
                }
                return NAUTILUS_FIBONACCI_SEQUENCE[clamped - 3]
                    + ' + '
                    + NAUTILUS_FIBONACCI_SEQUENCE[clamped - 2]
                    + ' = '
                    + NAUTILUS_FIBONACCI_SEQUENCE[clamped - 1];
            }

            function updateNautilusNarrative(frame) {
                const count = clamp(frame && Number.isFinite(frame.narrativeCount) ? frame.narrativeCount : 0, 0, NAUTILUS_STEP_TOTAL);
                const squareCount = getNautilusSquareCountForStep(count);
                const actualBounds = getActualNautilusBoundsForCount(count);
                const rectangleWidth = actualBounds ? actualBounds.maxX - actualBounds.minX : 0;
                const rectangleHeight = actualBounds ? actualBounds.maxY - actualBounds.minY : 0;
                const latest = squareCount > 0 ? NAUTILUS_FIBONACCI_SEQUENCE[squareCount - 1] : null;
                const previous = squareCount > 1 ? NAUTILUS_FIBONACCI_SEQUENCE[squareCount - 2] : null;
                let title = '';
                let copy = '';
                let metrics = [];

                if (frame.detailPhase >= 3) {
                    title = 'Tune the rectangle until both ratios match';
                    copy = 'The last stage turns the spiral story into a golden-rectangle test. Drag the slider below to change the rectangle ratio and watch for the moment when a / b and (a + b) / a agree at φ ≈ 1.618.';
                    metrics = [
                        'drag the ratio slider',
                        'a / b = (a + b) / a',
                        'φ ≈ ' + formatNautilusRatio(NAUTILUS_GOLDEN_RATIO, 5)
                    ];
                } else if (frame.detailPhase >= 2) {
                    title = 'Successive Fibonacci ratios settle toward the golden ratio';
                    copy = 'After the galaxy comparison, the strip shifts the Fibonacci sequence by one term so each value can divide by the previous one. The early ratios wobble, but they quickly converge toward φ ≈ 1.618.';
                    metrics = [
                        '21 / 13 = ' + formatNautilusRatio(21 / 13),
                        '34 / 21 = ' + formatNautilusRatio(34 / 21),
                        '55 / 34 = ' + formatNautilusRatio(55 / 34) + ' → φ'
                    ];
                } else if (frame.detailPhase >= 1) {
                    title = 'Compare the finished spiral with a spiral galaxy';
                    copy = 'First, the completed Fibonacci spiral is laid over the spiral galaxy image using the saved alignment. Compare how closely the galactic core and outer arms follow the curve before moving on to the ratio and golden-rectangle stages.';
                    metrics = [
                        'reference: Messier 77',
                        'saved core ↔ pole alignment',
                        'compare the arm sweep'
                    ];
                } else if (count <= 0) {
                    title = 'Build the Fibonacci tiling and spiral step by step';
                    copy = 'Two unit squares start the tiling. Each new square uses the sum of the previous two side lengths, and the quarter-circle arcs will trace the spiral once the rectangle is complete.';
                    metrics = ['start with 1 and 1', 'each square adds the last two', 'click in the viewport'];
                } else if (squareCount === 1) {
                    title = 'The first 1 × 1 square anchors the construction';
                    copy = 'One unit square is in place. The next step adds the second 1 × 1 square so the first visible Fibonacci addition can build the 2-square.';
                    metrics = ['sequence: 1', 'next equation: 1 + 1 = 2', 'one square placed'];
                } else if (squareCount === 2) {
                    title = 'The second unit square sets up the first addition';
                    copy = 'With both 1 × 1 squares visible, the next square has side length 2 because Fibonacci always adds the previous two terms.';
                    metrics = ['equation: 1 + 1 = 2', 'current rectangle: 2 × 1', 'next square: 2'];
                } else if (count < NAUTILUS_STEP_TOTAL) {
                    title = 'Each new square is the sum of the previous two';
                    copy = 'After placing ' + squareCount + ' squares, the rectangle is ' + rectangleWidth + ' × ' + rectangleHeight + '. The newest side length is ' + latest + ', formed directly from the two previous Fibonacci lengths.';
                    metrics = [
                        'equation: ' + formatNautilusEquation(squareCount),
                        'rectangle: ' + rectangleWidth + ' × ' + rectangleHeight,
                        latest + ' / ' + previous + ' = ' + formatNautilusRatio(latest / previous)
                    ];
                } else if (frame.spiralProgress < 1) {
                    title = 'Trace the full Fibonacci spiral';
                    copy = 'All ten Fibonacci squares are now fixed. The last construction step sweeps the full quarter-circle spiral across them so the curve is complete before the comparisons begin.';
                    metrics = [
                        'equation: ' + formatNautilusEquation(squareCount),
                        'rectangle: 89 × 55',
                        'next: galaxy comparison'
                    ];
                } else {
                    title = 'The Fibonacci construction is complete';
                    copy = 'The squares and spiral are finished. Click in the viewport to replay the final trace, or use the forward arrow to compare the curve with a spiral galaxy, then the ratio strip, and finally the golden ratio rectangle.';
                    metrics = [
                        'equation: ' + formatNautilusEquation(squareCount),
                        'rectangle: 89 × 55',
                        'click viewport to replay trace'
                    ];
                }

                if (nautilusStepTitle) {
                    nautilusStepTitle.textContent = title;
                }
                if (nautilusStepCopy) {
                    nautilusStepCopy.textContent = copy;
                }
                renderStepMetricChips(nautilusStepMetrics, metrics);
            }

            function updateNautilusBackdropVisibility(detailPhase) {
                if (nautilusStage) {
                    nautilusStage.classList.toggle('is-shell-visible', detailPhase === 1);
                }
                updateNautilusGoldenRatioSliderVisibility();
                updateNautilusShellCalibrationVisibility();
            }

            function resizeNautilusScene() {
                if (nautilusState.canvas) {
                    resizeCanvasToDisplaySize(nautilusState.canvas);
                }
                nautilusState.mediaViewers.forEach(resizeNautilusViewer);
            }

            function renderNautilusFrame() {
                if (!nautilusState.canvas || !nautilusState.ctx || !nautilusState.layout) {
                    return;
                }
                const size = resizeCanvasToDisplaySize(nautilusState.canvas);
                const frame = getCurrentNautilusFrame();
                if (!frame) {
                    return;
                }
                const ctx = nautilusState.ctx;
                ctx.clearRect(0, 0, size.width, size.height);
                updateNautilusBackdropVisibility(frame.detailPhase);
                drawNautilusBackdrop(ctx, size, frame.detailPhase >= 1 ? 1 : frame.spiralProgress);
                if (frame.detailPhase >= 3) {
                    drawNautilusGoldenRectangleStage(ctx, size, frame);
                    drawNautilusViewportTitle(ctx, size, frame);
                    drawNautilusViewportProgressCounter(ctx, size, frame);
                    updateNautilusNarrative(frame);
                    updateNautilusControls();
                    renderNautilusMediaViewers();
                    return;
                }
                const transform = getNautilusViewportTransform(size, frame.bounds, frame);

                const stableCount = frame.spiralTransition
                    ? frame.fromSquareCount
                    : frame.adding
                        ? frame.fromSquareCount
                        : frame.removing
                            ? frame.toSquareCount
                            : frame.squareCount;
                for (let index = 0; index < stableCount; index += 1) {
                    drawNautilusSquare(ctx, nautilusState.layout.squares[index], transform, {
                        alpha: 1,
                        scale: 1
                    });
                }
                if (frame.animatedIndex >= 0 && nautilusState.layout.squares[frame.animatedIndex]) {
                    drawNautilusSquare(ctx, nautilusState.layout.squares[frame.animatedIndex], transform, {
                        alpha: frame.animatedAlpha,
                        scale: frame.animatedScale
                    });
                }
                const shellMetrics = drawNautilusShellReference(ctx, transform, frame);

                drawNautilusSpiral(ctx, transform, frame.spiralProgress);
                drawNautilusShellCalibrationGuides(ctx, shellMetrics, transform.dpr);
                drawNautilusSequenceStrip(ctx, size, frame);
                drawNautilusViewportTitle(ctx, size, frame);
                drawNautilusViewportProgressCounter(ctx, size, frame);
                updateNautilusNarrative(frame);
                updateNautilusControls();
                renderNautilusMediaViewers();
            }

            function animateNautilusDemo(timestamp) {
                if (!nautilusState.running) {
                    nautilusState.animationFrameId = null;
                    nautilusState.lastTimestamp = null;
                    return;
                }
                nautilusState.animationFrameId = requestAnimationFrame(animateNautilusDemo);
                if (nautilusState.lastTimestamp == null) {
                    nautilusState.lastTimestamp = timestamp;
                }
                const delta = timestamp - nautilusState.lastTimestamp;
                nautilusState.lastTimestamp = timestamp;

                if (nautilusState.transition) {
                    nautilusState.transition.elapsedMs += delta;
                    if (nautilusState.transition.elapsedMs >= nautilusState.transition.durationMs) {
                        nautilusState.currentCount = nautilusState.transition.toCount;
                        nautilusState.transition = null;
                        if (nautilusState.currentCount >= NAUTILUS_STEP_TOTAL) {
                            nautilusState.playing = false;
                        }
                    }
                }
                if (nautilusState.detailTransition) {
                    nautilusState.detailTransition.elapsedMs += delta;
                    if (nautilusState.detailTransition.elapsedMs >= nautilusState.detailTransition.durationMs) {
                        nautilusState.detailTransition = null;
                    }
                }
                if (nautilusState.playing && !nautilusState.transition) {
                    beginNautilusAutoTransition();
                }
                renderNautilusFrame();
            }

            function stopNautilusDemo() {
                nautilusState.running = false;
                nautilusState.playing = false;
                finalizeNautilusTransition(false);
                nautilusState.detailTransition = null;
                nautilusState.lastTimestamp = null;
                if (nautilusState.animationFrameId != null) {
                    cancelAnimationFrame(nautilusState.animationFrameId);
                    nautilusState.animationFrameId = null;
                }
            }

            function startNautilusDemo() {
                if (!nautilusState.initialized) {
                    setupNautilusDemo();
                }
                if (!nautilusState.canvas || nautilusState.running) {
                    return;
                }
                nautilusState.running = true;
                nautilusState.lastTimestamp = null;
                resizeNautilusScene();
                renderNautilusFrame();
                nautilusState.animationFrameId = requestAnimationFrame(animateNautilusDemo);
            }

            function disposeNautilusDemo() {
                stopNautilusDemo();
                if (!nautilusState.initialized) {
                    return;
                }
                disposeNautilusMediaViewers();
                if (nautilusStage) {
                    nautilusStage.replaceChildren();
                }
                if (nautilusLiveControls) {
                    nautilusLiveControls.replaceChildren();
                    nautilusLiveControls.hidden = true;
                }
                nautilusState.initialized = false;
                nautilusState.canvas = null;
                nautilusState.ctx = null;
                nautilusState.layout = null;
                nautilusState.referenceImages = {};
                nautilusState.goldenRatioSliderShell = null;
                nautilusState.goldenRatioSlider = null;
                nautilusState.shellCalibrationShell = null;
                nautilusState.shellCalibrationResetButton = null;
                nautilusState.shellCalibrationMirrorButton = null;
                nautilusState.shellCalibrationTitleElement = null;
                nautilusState.shellCalibrationHintElement = null;
                nautilusState.shellCalibrationInputs = {};
                nautilusState.shellCalibrationReadouts = {};
            }

            function setupNautilusDemo() {
                if (!nautilusStage || nautilusState.initialized) {
                    return;
                }
                try {
                    const referenceImages = {};
                    Object.keys(NAUTILUS_SPIRAL_REFERENCES).forEach(function(referenceKey) {
                        const referenceConfig = NAUTILUS_SPIRAL_REFERENCES[referenceKey];
                        const referenceImage = document.createElement('img');
                        referenceImage.src = referenceConfig.assetUrl;
                        referenceImage.alt = '';
                        referenceImage.decoding = 'async';
                        referenceImage.loading = 'eager';
                        referenceImage.addEventListener('load', renderNautilusFrame);
                        referenceImages[referenceKey] = referenceImage;
                    });

                    const canvas = document.createElement('canvas');
                    canvas.className = 'nautilus-background-canvas';
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        throw new Error('2D context unavailable');
                    }
                    const goldenRatioSliderShell = document.createElement('div');
                    goldenRatioSliderShell.className = 'nautilus-ratio-slider-shell';
                    goldenRatioSliderShell.hidden = true;
                    const goldenRatioSlider = document.createElement('input');
                    goldenRatioSlider.type = 'range';
                    goldenRatioSlider.className = 'nautilus-ratio-slider';
                    goldenRatioSlider.min = String(NAUTILUS_GOLDEN_RECTANGLE_RATIO_MIN);
                    goldenRatioSlider.max = String(NAUTILUS_GOLDEN_RECTANGLE_RATIO_MAX);
                    goldenRatioSlider.step = '0.001';
                    goldenRatioSlider.value = nautilusState.goldenRectangleRatio.toFixed(5);
                    goldenRatioSlider.setAttribute('aria-label', 'Golden rectangle ratio');
                    ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(function(eventName) {
                        goldenRatioSlider.addEventListener(eventName, function(event) {
                            event.stopPropagation();
                        });
                    });
                    goldenRatioSlider.addEventListener('input', function(event) {
                        nautilusState.goldenRectangleRatio = clampNautilusGoldenRectangleRatio(event.target.value);
                        renderNautilusFrame();
                    });
                    goldenRatioSliderShell.appendChild(goldenRatioSlider);
                    const shellCalibrationShell = document.createElement('div');
                    shellCalibrationShell.className = 'nautilus-shell-calibration-shell';
                    shellCalibrationShell.hidden = true;
                    ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(function(eventName) {
                        shellCalibrationShell.addEventListener(eventName, function(event) {
                            event.stopPropagation();
                        });
                    });

                    const shellCalibrationHeader = document.createElement('div');
                    shellCalibrationHeader.className = 'nautilus-shell-calibration-header';
                    const shellCalibrationTitle = document.createElement('div');
                    shellCalibrationTitle.className = 'nautilus-shell-calibration-title';
                    shellCalibrationTitle.textContent = 'Spiral alignment';
                    const shellCalibrationActions = document.createElement('div');
                    shellCalibrationActions.className = 'nautilus-shell-calibration-actions';
                    const shellCalibrationMirrorButton = document.createElement('button');
                    shellCalibrationMirrorButton.type = 'button';
                    shellCalibrationMirrorButton.className = 'nautilus-shell-calibration-mirror';
                    shellCalibrationMirrorButton.textContent = 'Mirror';
                    shellCalibrationMirrorButton.setAttribute('aria-pressed', 'false');
                    shellCalibrationMirrorButton.addEventListener('click', function(event) {
                        const calibration = getNautilusActiveShellCalibration();
                        event.stopPropagation();
                        if (!calibration) {
                            return;
                        }
                        calibration.flipX = !calibration.flipX;
                        syncNautilusShellCalibrationControls();
                        renderNautilusFrame();
                    });
                    const shellCalibrationResetButton = document.createElement('button');
                    shellCalibrationResetButton.type = 'button';
                    shellCalibrationResetButton.className = 'nautilus-shell-calibration-reset';
                    shellCalibrationResetButton.textContent = 'Reset';
                    shellCalibrationResetButton.addEventListener('click', function(event) {
                        event.stopPropagation();
                        const referenceKey = getNautilusActiveReferenceKey();
                        if (!referenceKey) {
                            return;
                        }
                        nautilusState.shellCalibrations[referenceKey] = cloneNautilusShellCalibration(
                            NAUTILUS_SPIRAL_REFERENCES[referenceKey].calibrationDefaults
                        );
                        syncNautilusShellCalibrationControls();
                        renderNautilusFrame();
                    });
                    shellCalibrationActions.appendChild(shellCalibrationMirrorButton);
                    shellCalibrationActions.appendChild(shellCalibrationResetButton);
                    shellCalibrationHeader.appendChild(shellCalibrationTitle);
                    shellCalibrationHeader.appendChild(shellCalibrationActions);
                    shellCalibrationShell.appendChild(shellCalibrationHeader);

                    const shellCalibrationHint = document.createElement('div');
                    shellCalibrationHint.className = 'nautilus-shell-calibration-hint';
                    shellCalibrationHint.textContent = 'Use the controls below to line the reference image up with the spiral.';
                    shellCalibrationShell.appendChild(shellCalibrationHint);

                    const shellCalibrationGrid = document.createElement('div');
                    shellCalibrationGrid.className = 'nautilus-shell-calibration-grid';
                    const shellCalibrationInputs = {};
                    const shellCalibrationReadouts = {};
                    NAUTILUS_SHELL_CALIBRATION_FIELDS.forEach(function(field) {
                        const row = document.createElement('label');
                        row.className = 'nautilus-shell-calibration-row';

                        const rowHeader = document.createElement('span');
                        rowHeader.className = 'nautilus-shell-calibration-row-header';

                        const label = document.createElement('span');
                        label.className = 'nautilus-shell-calibration-label';
                        label.textContent = field.label;

                        const readout = document.createElement('span');
                        readout.className = 'nautilus-shell-calibration-readout';

                        const input = document.createElement('input');
                        input.type = 'range';
                        input.className = 'nautilus-shell-calibration-slider';
                        input.min = String(field.min);
                        input.max = String(field.max);
                        input.step = String(field.step);
                        input.value = String((getNautilusActiveShellCalibration() || {})[field.key] || field.min);
                        input.setAttribute('aria-label', field.label);
                        ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach(function(eventName) {
                            input.addEventListener(eventName, function(event) {
                                event.stopPropagation();
                            });
                        });
                        input.addEventListener('input', function(event) {
                            const calibration = getNautilusActiveShellCalibration();
                            if (!calibration) {
                                return;
                            }
                            calibration[field.key] = clampNautilusShellCalibrationValue(field.key, event.target.value);
                            syncNautilusShellCalibrationControls();
                            renderNautilusFrame();
                        });

                        rowHeader.appendChild(label);
                        rowHeader.appendChild(readout);
                        row.appendChild(rowHeader);
                        row.appendChild(input);
                        shellCalibrationGrid.appendChild(row);

                        shellCalibrationInputs[field.key] = input;
                        shellCalibrationReadouts[field.key] = readout;
                    });
                    shellCalibrationShell.appendChild(shellCalibrationGrid);
                    nautilusStage.replaceChildren(canvas);
                    if (nautilusLiveControls) {
                        nautilusLiveControls.replaceChildren(shellCalibrationShell, goldenRatioSliderShell);
                        nautilusLiveControls.hidden = true;
                    }
                    nautilusState.canvas = canvas;
                    nautilusState.ctx = ctx;
                    nautilusState.referenceImages = referenceImages;
                    nautilusState.goldenRatioSliderShell = goldenRatioSliderShell;
                    nautilusState.goldenRatioSlider = goldenRatioSlider;
                    nautilusState.shellCalibrationShell = shellCalibrationShell;
                    nautilusState.shellCalibrationResetButton = shellCalibrationResetButton;
                    nautilusState.shellCalibrationMirrorButton = shellCalibrationMirrorButton;
                    nautilusState.shellCalibrationTitleElement = shellCalibrationTitle;
                    nautilusState.shellCalibrationHintElement = shellCalibrationHint;
                    nautilusState.shellCalibrationInputs = shellCalibrationInputs;
                    nautilusState.shellCalibrationReadouts = shellCalibrationReadouts;
                    nautilusState.layout = buildNautilusLayout();
                    nautilusState.currentCount = clamp(nautilusState.currentCount, 0, NAUTILUS_STEP_TOTAL);
                    syncNautilusGoldenRatioSlider();
                    syncNautilusShellCalibrationControls();
                    nautilusState.initialized = true;
                    bindNautilusControls();
                    initNautilusMediaViewers();
                    resizeNautilusScene();
                    updateNautilusControls();
                    renderNautilusFrame();
                } catch (error) {
                    nautilusStage.innerHTML = '<div style=\"padding:20px;color:#5f6b84;line-height:1.6;\">The spirals explainer could not start in this browser.</div>';
                    [nautilusPrevButton, nautilusPlayButton, nautilusNextButton, nautilusResetButton].forEach(function(button) {
                        if (button) {
                            button.disabled = true;
                        }
                    });
                    if (nautilusPlayButton) {
                        nautilusPlayButton.textContent = 'Unavailable';
                    }
                }
            }