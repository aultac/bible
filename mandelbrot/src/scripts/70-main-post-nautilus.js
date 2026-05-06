            const sunflowerState = {
                initialized: false,
                running: false,
                controlsBound: false,
                ctx: sunflowerCanvas ? sunflowerCanvas.getContext('2d') : null,
                animationFrameId: null,
                lastTimestamp: null,
                ambientElapsedMs: 0,
                playing: false,
                currentStep: 0,
                transition: null,
                stepDurationMs: 1500,
                manualStepDurationMs: 720
            };

            function bindSunflowerControls() {
                if (sunflowerState.controlsBound) {
                    return;
                }
                if (sunflowerPrevButton) {
                    sunflowerPrevButton.addEventListener('click', function() {
                        nudgeSunflowerStep(-1);
                    });
                }
                if (sunflowerPlayButton) {
                    sunflowerPlayButton.addEventListener('click', function() {
                        toggleSunflowerPlayback();
                    });
                }
                if (sunflowerNextButton) {
                    sunflowerNextButton.addEventListener('click', function() {
                        nudgeSunflowerStep(1);
                    });
                }
                if (sunflowerResetButton) {
                    sunflowerResetButton.addEventListener('click', function() {
                        resetSunflowerDemo();
                    });
                }
                sunflowerState.controlsBound = true;
            }

            function updateSunflowerControls() {
                const displayedStep = sunflowerState.transition ? sunflowerState.transition.toStep : sunflowerState.currentStep;
                const isTransitioning = !!sunflowerState.transition;
                if (sunflowerPlayButton) {
                    sunflowerPlayButton.textContent = sunflowerState.playing ? 'Pause' : 'Play';
                }
                if (sunflowerPrevButton) {
                    sunflowerPrevButton.disabled = isTransitioning || displayedStep <= 0;
                }
                if (sunflowerNextButton) {
                    sunflowerNextButton.disabled = isTransitioning || displayedStep >= SUNFLOWER_STEP_TOTAL - 1;
                }
            }

            function createSunflowerTransition(fromStep, toStep, durationMs) {
                return {
                    fromStep: fromStep,
                    toStep: toStep,
                    elapsedMs: 0,
                    durationMs: durationMs
                };
            }

            function beginSunflowerAutoTransition() {
                if (!sunflowerState.playing || sunflowerState.transition || sunflowerState.currentStep >= SUNFLOWER_STEP_TOTAL - 1) {
                    if (sunflowerState.currentStep >= SUNFLOWER_STEP_TOTAL - 1) {
                        sunflowerState.playing = false;
                    }
                    return;
                }
                sunflowerState.transition = createSunflowerTransition(
                    sunflowerState.currentStep,
                    sunflowerState.currentStep + 1,
                    sunflowerState.stepDurationMs
                );
            }

            function setSunflowerStep(step) {
                sunflowerState.playing = false;
                sunflowerState.transition = null;
                sunflowerState.currentStep = clamp(Math.round(step), 0, SUNFLOWER_STEP_TOTAL - 1);
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function nudgeSunflowerStep(direction) {
                if (sunflowerState.transition) {
                    return;
                }
                const startStep = sunflowerState.currentStep;
                const targetStep = clamp(startStep + direction, 0, SUNFLOWER_STEP_TOTAL - 1);
                if (targetStep === startStep) {
                    return;
                }
                sunflowerState.playing = false;
                sunflowerState.transition = createSunflowerTransition(startStep, targetStep, sunflowerState.manualStepDurationMs);
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function toggleSunflowerPlayback() {
                if (sunflowerState.playing) {
                    sunflowerState.playing = false;
                    if (sunflowerState.transition) {
                        sunflowerState.currentStep = sunflowerState.transition.toStep;
                        sunflowerState.transition = null;
                    }
                } else {
                    if (sunflowerState.currentStep >= SUNFLOWER_STEP_TOTAL - 1) {
                        sunflowerState.currentStep = 0;
                    }
                    sunflowerState.playing = true;
                    beginSunflowerAutoTransition();
                }
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function resetSunflowerDemo() {
                setSunflowerStep(0);
            }

            function getSunflowerVisualForStep(step) {
                if (step <= 0) {
                    return {
                        circleAlpha: 1,
                        splitAlpha: 1,
                        angleSweep: 0,
                        referenceLineAlpha: 1,
                        seedCount: 0,
                        seedAlpha: 0,
                        currentSpokeAlpha: 0,
                        parastichyAlpha: 0,
                        overlayAlpha: 0,
                        petalAlpha: 0,
                        labelAlpha: 1
                    };
                }
                if (step === 1) {
                    return {
                        circleAlpha: 1,
                        splitAlpha: 1,
                        angleSweep: 1,
                        referenceLineAlpha: 1,
                        seedCount: 0,
                        seedAlpha: 0,
                        currentSpokeAlpha: 1,
                        parastichyAlpha: 0,
                        overlayAlpha: 0,
                        petalAlpha: 0,
                        labelAlpha: 1
                    };
                }
                if (step === 2) {
                    return {
                        circleAlpha: 0.42,
                        splitAlpha: 0.38,
                        angleSweep: 1,
                        referenceLineAlpha: 0.44,
                        seedCount: 233,
                        seedAlpha: 1,
                        currentSpokeAlpha: 1,
                        parastichyAlpha: 0,
                        overlayAlpha: 0,
                        petalAlpha: 0,
                        labelAlpha: 1
                    };
                }
                if (step === 3) {
                    return {
                        circleAlpha: 0.14,
                        splitAlpha: 0.12,
                        angleSweep: 1,
                        referenceLineAlpha: 0.18,
                        seedCount: SUNFLOWER_MAX_SEEDS,
                        seedAlpha: 1,
                        currentSpokeAlpha: 0.34,
                        parastichyAlpha: 1,
                        overlayAlpha: 0.18,
                        petalAlpha: 0.2,
                        labelAlpha: 1
                    };
                }
                return {
                    circleAlpha: 0.08,
                    splitAlpha: 0.08,
                    angleSweep: 1,
                    referenceLineAlpha: 0.12,
                    seedCount: SUNFLOWER_MAX_SEEDS,
                    seedAlpha: 1,
                    currentSpokeAlpha: 0.16,
                    parastichyAlpha: 0.82,
                    overlayAlpha: 1,
                    petalAlpha: 1,
                    labelAlpha: 1
                };
            }

            function interpolateSunflowerVisual(start, end, t) {
                return {
                    circleAlpha: lerp(start.circleAlpha, end.circleAlpha, t),
                    splitAlpha: lerp(start.splitAlpha, end.splitAlpha, t),
                    angleSweep: lerp(start.angleSweep, end.angleSweep, t),
                    referenceLineAlpha: lerp(start.referenceLineAlpha, end.referenceLineAlpha, t),
                    seedCount: lerp(start.seedCount, end.seedCount, t),
                    seedAlpha: lerp(start.seedAlpha, end.seedAlpha, t),
                    currentSpokeAlpha: lerp(start.currentSpokeAlpha, end.currentSpokeAlpha, t),
                    parastichyAlpha: lerp(start.parastichyAlpha, end.parastichyAlpha, t),
                    overlayAlpha: lerp(start.overlayAlpha, end.overlayAlpha, t),
                    petalAlpha: lerp(start.petalAlpha, end.petalAlpha, t),
                    labelAlpha: lerp(start.labelAlpha, end.labelAlpha, t)
                };
            }

            function getCurrentSunflowerFrame() {
                if (!sunflowerState.transition) {
                    return {
                        stepIndex: sunflowerState.currentStep,
                        visual: getSunflowerVisualForStep(sunflowerState.currentStep)
                    };
                }
                const progress = getInterpolatedTransitionStep(sunflowerState.transition);
                const eased = easeInOutCubic(progress);
                return {
                    stepIndex: sunflowerState.transition.toStep,
                    visual: interpolateSunflowerVisual(
                        getSunflowerVisualForStep(sunflowerState.transition.fromStep),
                        getSunflowerVisualForStep(sunflowerState.transition.toStep),
                        eased
                    )
                };
            }

            function getSunflowerSeeds(count, centerX, centerY, maxRadius) {
                const seeds = [];
                const radialScale = maxRadius / Math.sqrt(SUNFLOWER_MAX_SEEDS + 1);
                for (let index = 0; index < count; index += 1) {
                    const radius = radialScale * Math.sqrt(index + 0.5);
                    const angle = -Math.PI / 2 + index * GOLDEN_ANGLE_RADIANS;
                    seeds.push({
                        index: index,
                        radius: radius,
                        angle: angle,
                        x: centerX + Math.cos(angle) * radius,
                        y: centerY + Math.sin(angle) * radius
                    });
                }
                return seeds;
            }

            function drawSunflowerOverlay(ctx, centerX, centerY, outerRadius, visual, dpr) {
                if (visual.overlayAlpha <= 0.01) {
                    return;
                }
                ctx.save();
                ctx.globalAlpha = visual.overlayAlpha;

                for (let index = 0; index < 26; index += 1) {
                    const angle = (index / 26) * Math.PI * 2;
                    const petalX = centerX + Math.cos(angle) * outerRadius * 0.9;
                    const petalY = centerY + Math.sin(angle) * outerRadius * 0.9;
                    ctx.save();
                    ctx.translate(petalX, petalY);
                    ctx.rotate(angle);
                    const petalGradient = ctx.createLinearGradient(0, -outerRadius * 0.48, 0, outerRadius * 0.2);
                    petalGradient.addColorStop(0, 'rgba(255, 252, 189, 0.94)');
                    petalGradient.addColorStop(1, 'rgba(240, 166, 27, 0.95)');
                    ctx.beginPath();
                    ctx.moveTo(0, -outerRadius * 0.18);
                    ctx.quadraticCurveTo(outerRadius * 0.22, -outerRadius * 0.45, 0, -outerRadius * 0.74);
                    ctx.quadraticCurveTo(-outerRadius * 0.22, -outerRadius * 0.45, 0, -outerRadius * 0.18);
                    ctx.closePath();
                    ctx.fillStyle = petalGradient;
                    ctx.fill();
                    ctx.restore();
                }

                const diskGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius * 0.9);
                diskGradient.addColorStop(0, 'rgba(126, 78, 24, 0.82)');
                diskGradient.addColorStop(0.55, 'rgba(98, 58, 14, 0.86)');
                diskGradient.addColorStop(1, 'rgba(64, 34, 10, 0.92)');
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius * 0.88, 0, Math.PI * 2);
                ctx.fillStyle = diskGradient;
                ctx.fill();
                ctx.restore();
            }

            function drawSunflowerSplitCircle(ctx, centerX, centerY, radius, visual, dpr) {
                if (visual.circleAlpha <= 0.01) {
                    return;
                }
                const startAngle = -Math.PI / 2;
                const shortAngle = GOLDEN_ANGLE_RADIANS * visual.angleSweep;
                const endAngle = startAngle + shortAngle;
                const longAngleEnd = startAngle + Math.PI * 2;

                ctx.save();
                ctx.globalAlpha = visual.circleAlpha;
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
                ctx.lineWidth = 2 * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                if (visual.splitAlpha <= 0.01) {
                    return;
                }

                ctx.save();
                ctx.globalAlpha = visual.splitAlpha;
                ctx.lineWidth = 8 * dpr;
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.7)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, endAngle, longAngleEnd - 0.02, false);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(217, 119, 6, 0.82)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
                ctx.stroke();
                ctx.restore();

                const longLabelAngle = startAngle + GOLDEN_ANGLE_RADIANS + (Math.PI * 2 - GOLDEN_ANGLE_RADIANS) * 0.56;
                const shortLabelAngle = startAngle + shortAngle * 0.5;
                drawCanvasChip(ctx, 'a', centerX + Math.cos(longLabelAngle) * radius * 1.12, centerY + Math.sin(longLabelAngle) * radius * 1.12, {
                    dpr: dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 255, 255, 0.92)'
                });
                drawCanvasChip(ctx, 'b', centerX + Math.cos(shortLabelAngle) * radius * 1.13, centerY + Math.sin(shortLabelAngle) * radius * 1.13, {
                    dpr: dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 255, 255, 0.92)'
                });
            }

            function drawSunflowerSpokes(ctx, centerX, centerY, radius, visual, dpr) {
                const startAngle = -Math.PI / 2;
                const currentAngle = startAngle + GOLDEN_ANGLE_RADIANS * visual.angleSweep;
                if (visual.referenceLineAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = visual.referenceLineAlpha;
                    ctx.strokeStyle = 'rgba(71, 85, 105, 0.8)';
                    ctx.lineWidth = 2 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(centerX + Math.cos(startAngle) * radius, centerY + Math.sin(startAngle) * radius);
                    ctx.stroke();
                    ctx.restore();
                }

                if (visual.currentSpokeAlpha > 0.01) {
                    ctx.save();
                    ctx.globalAlpha = visual.currentSpokeAlpha;
                    ctx.strokeStyle = 'rgba(217, 119, 6, 0.86)';
                    ctx.lineWidth = 2.3 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(centerX + Math.cos(currentAngle) * radius, centerY + Math.sin(currentAngle) * radius);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(217, 119, 6, 0.9)';
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, 4.2 * dpr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                if (visual.angleSweep > 0.05) {
                    const wedgeRadius = radius * 0.28;
                    ctx.save();
                    ctx.globalAlpha = Math.max(visual.currentSpokeAlpha, visual.splitAlpha) * 0.42;
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.arc(centerX, centerY, wedgeRadius, startAngle, currentAngle);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            }

            function drawSunflowerSeeds(ctx, seeds, visual, outerRadius, dpr) {
                if (visual.seedAlpha <= 0.01 || !seeds.length) {
                    return;
                }
                ctx.save();
                ctx.globalAlpha = visual.seedAlpha;
                seeds.forEach(function(seed) {
                    const radiusMix = seed.radius / Math.max(1, outerRadius * 0.86);
                    const size = (4.2 - radiusMix * 1.7) * dpr;
                    const red = Math.round(97 + radiusMix * 54);
                    const green = Math.round(58 + radiusMix * 36);
                    const blue = Math.round(16 + radiusMix * 18);
                    ctx.beginPath();
                    ctx.arc(seed.x, seed.y, size, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgb(' + red + ', ' + green + ', ' + blue + ')';
                    ctx.fill();
                });
                ctx.restore();
            }

            function drawSunflowerParastichies(ctx, seeds, visual, dpr) {
                if (visual.parastichyAlpha <= 0.01 || seeds.length < 30) {
                    return;
                }
                const familyColors = [
                    'rgba(37, 99, 235, ' + (0.15 * visual.parastichyAlpha).toFixed(3) + ')',
                    'rgba(185, 28, 28, ' + (0.13 * visual.parastichyAlpha).toFixed(3) + ')'
                ];
                SUNFLOWER_PARASTICHY_COUNTS.forEach(function(stride, strideIndex) {
                    ctx.save();
                    ctx.strokeStyle = familyColors[strideIndex];
                    ctx.lineWidth = (strideIndex === 0 ? 1.4 : 1.2) * dpr;
                    for (let offset = 0; offset < stride; offset += Math.max(1, Math.floor(stride / 12))) {
                        ctx.beginPath();
                        let started = false;
                        for (let index = offset; index < seeds.length; index += stride) {
                            const seed = seeds[index];
                            if (!started) {
                                ctx.moveTo(seed.x, seed.y);
                                started = true;
                            } else {
                                ctx.lineTo(seed.x, seed.y);
                            }
                        }
                        if (started) {
                            ctx.stroke();
                        }
                    }
                    ctx.restore();
                });
            }

            function drawSunflowerLabels(ctx, centerX, centerY, outerRadius, visual, dpr) {
                if (visual.labelAlpha <= 0.01) {
                    return;
                }
                ctx.save();
                ctx.globalAlpha = visual.labelAlpha;
                if (visual.splitAlpha > 0.08) {
                    drawCanvasChip(ctx, 'a : b = φ : 1', 18 * dpr, 18 * dpr, {
                        dpr: dpr
                    });
                }
                if (visual.currentSpokeAlpha > 0.08) {
                    drawCanvasChip(ctx, 'b ≈ 137.5°', 18 * dpr, 52 * dpr, {
                        dpr: dpr
                    });
                }
                if (visual.seedCount > 0) {
                    drawCanvasChip(ctx, 'θₙ = n · 137.5°', 18 * dpr, 86 * dpr, {
                        dpr: dpr
                    });
                    drawCanvasChip(ctx, 'rₙ ∝ √n', 18 * dpr, 120 * dpr, {
                        dpr: dpr
                    });
                }
                if (visual.parastichyAlpha > 0.08) {
                    drawCanvasChip(ctx, '34', centerX - outerRadius * 0.86, centerY + outerRadius * 0.78, {
                        dpr: dpr,
                        align: 'center',
                        verticalAlign: 'middle',
                        background: 'rgba(239, 246, 255, 0.94)',
                        borderColor: 'rgba(37, 99, 235, 0.34)',
                        textColor: '#1d4ed8'
                    });
                    drawCanvasChip(ctx, '55', centerX + outerRadius * 0.84, centerY + outerRadius * 0.62, {
                        dpr: dpr,
                        align: 'center',
                        verticalAlign: 'middle',
                        background: 'rgba(254, 242, 242, 0.94)',
                        borderColor: 'rgba(185, 28, 28, 0.28)',
                        textColor: '#b91c1c'
                    });
                }
                ctx.restore();
            }

            function renderSunflowerFrame() {
                if (!sunflowerCanvas || !sunflowerState.ctx) {
                    return;
                }
                const frame = getCurrentSunflowerFrame();
                const ctx = sunflowerState.ctx;
                const size = resizeCanvasToDisplaySize(sunflowerCanvas);
                const centerX = size.width * 0.5;
                const centerY = size.height * 0.5;
                const outerRadius = Math.min(size.width, size.height) * 0.37;
                const seedCount = Math.max(0, Math.round(frame.visual.seedCount));
                const seeds = getSunflowerSeeds(seedCount, centerX, centerY, outerRadius * 0.86);

                ctx.clearRect(0, 0, size.width, size.height);
                const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius * 1.28);
                glow.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
                glow.addColorStop(0.6, 'rgba(255, 234, 166, 0.08)');
                glow.addColorStop(1, 'rgba(255, 234, 166, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, size.width, size.height);

                drawSunflowerOverlay(ctx, centerX, centerY, outerRadius, frame.visual, size.dpr);
                drawSunflowerSplitCircle(ctx, centerX, centerY, outerRadius, frame.visual, size.dpr);
                drawSunflowerSpokes(ctx, centerX, centerY, outerRadius, frame.visual, size.dpr);
                drawSunflowerParastichies(ctx, seeds, frame.visual, size.dpr);
                drawSunflowerSeeds(ctx, seeds, frame.visual, outerRadius, size.dpr);
                drawSunflowerLabels(ctx, centerX, centerY, outerRadius, frame.visual, size.dpr);

                updateStoryStepCopy(sunflowerStepTitle, sunflowerStepCopy, sunflowerStepMetrics, SUNFLOWER_STEP_DESCRIPTORS, frame.stepIndex);
                updateSunflowerControls();
            }

            function animateSunflowerDemo(timestamp) {
                if (!sunflowerState.running) {
                    sunflowerState.animationFrameId = null;
                    sunflowerState.lastTimestamp = null;
                    return;
                }
                sunflowerState.animationFrameId = requestAnimationFrame(animateSunflowerDemo);
                if (sunflowerState.lastTimestamp == null) {
                    sunflowerState.lastTimestamp = timestamp;
                }
                const delta = timestamp - sunflowerState.lastTimestamp;
                sunflowerState.lastTimestamp = timestamp;
                sunflowerState.ambientElapsedMs += delta;

                if (sunflowerState.transition) {
                    sunflowerState.transition.elapsedMs += delta;
                    if (sunflowerState.transition.elapsedMs >= sunflowerState.transition.durationMs) {
                        sunflowerState.currentStep = sunflowerState.transition.toStep;
                        sunflowerState.transition = null;
                    }
                }
                if (sunflowerState.playing) {
                    beginSunflowerAutoTransition();
                }
                renderSunflowerFrame();
            }

            function stopSunflowerDemo() {
                sunflowerState.running = false;
                sunflowerState.lastTimestamp = null;
                if (sunflowerState.animationFrameId != null) {
                    cancelAnimationFrame(sunflowerState.animationFrameId);
                    sunflowerState.animationFrameId = null;
                }
            }

            function startSunflowerDemo() {
                if (!sunflowerState.initialized) {
                    setupSunflowerDemo();
                }
                if (!sunflowerState.ctx || sunflowerState.running) {
                    return;
                }
                sunflowerState.running = true;
                sunflowerState.lastTimestamp = null;
                renderSunflowerFrame();
                sunflowerState.animationFrameId = requestAnimationFrame(animateSunflowerDemo);
            }

            function setupSunflowerDemo() {
                if (!sunflowerCanvas || sunflowerState.initialized) {
                    return;
                }
                if (!sunflowerState.ctx) {
                    [sunflowerPrevButton, sunflowerPlayButton, sunflowerNextButton, sunflowerResetButton].forEach(function(button) {
                        if (button) {
                            button.disabled = true;
                        }
                    });
                    if (sunflowerPlayButton) {
                        sunflowerPlayButton.textContent = 'Unavailable';
                    }
                    return;
                }
                bindSunflowerControls();
                sunflowerState.initialized = true;
                renderSunflowerFrame();
            }
            const treeState = {
                initialized: false,
                running: false,
                renderer: null,
                scene: null,
                camera: null,
                controls: null,
                group: null,
                rimLight: null,
                warmLight: null,
                branchMaterial: null,
                leafMaterial: null,
                leafGeometry: null,
                generation: 0,
                seed: randomSeed(),
                segmentCount: 0,
                leafCount: 0,
                animationFrameId: null
            };

            function getTreeParams() {
                return {
                    trunkHeight: clamp(safeNumber(treeTrunkHeightInput.value, 5.6), 3.5, 8.5),
                    branchAngle: clamp(safeNumber(treeBranchAngleInput.value, 45), 12, 55),
                    angleRandom: clamp(safeNumber(treeAngleRandomInput.value, 10), 0, 28),
                    lengthShrink: clamp(safeNumber(treeLengthShrinkInput.value, 0.6), 0.4, 0.8),
                    branchCount: clamp(Math.round(safeNumber(treeBranchCountInput.value, 2)), 2, 4),
                    leafSize: clamp(safeNumber(treeLeafSizeInput.value, 0.38), 0.18, 0.9)
                };
            }

            function createBranchBasis(direction) {
                const reference = Math.abs(direction.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                const tangent = new THREE.Vector3().crossVectors(reference, direction).normalize();
                const bitangent = new THREE.Vector3().crossVectors(direction, tangent).normalize();
                return { tangent: tangent, bitangent: bitangent };
            }

            function rotateBranchDirection(direction, angle, azimuth) {
                const basis = createBranchBasis(direction);
                return new THREE.Vector3()
                    .copy(direction)
                    .multiplyScalar(Math.cos(angle))
                    .addScaledVector(basis.tangent, Math.sin(angle) * Math.cos(azimuth))
                    .addScaledVector(basis.bitangent, Math.sin(angle) * Math.sin(azimuth))
                    .normalize();
            }

            function buildTreeData(params, generation, seed) {
                const rng = mulberry32(seed);
                const segments = [];
                const leaves = [];
                const up = new THREE.Vector3(0, 1, 0);

                const trunkDirection = new THREE.Vector3((rng() - 0.5) * 0.08, 1, (rng() - 0.5) * 0.08).normalize();
                const trunkLength = params.trunkHeight * (0.94 + rng() * 0.12);
                const trunkStart = new THREE.Vector3(0, 0, 0);
                const trunkEnd = trunkStart.clone().add(trunkDirection.clone().multiplyScalar(trunkLength));
                segments.push({
                    start: trunkStart.clone(),
                    end: trunkEnd.clone(),
                    radiusBottom: 0.42,
                    radiusTop: 0.3
                });

                function grow(start, direction, length, radius, depth) {
                    if (depth >= generation) {
                        leaves.push({
                            position: start.clone(),
                            direction: direction.clone(),
                            size: params.leafSize * (0.92 + rng() * 0.36)
                        });
                        return;
                    }

                    const childCount = params.branchCount;
                    const nextRadius = Math.max(0.03, radius * 0.72);

                    for (let index = 0; index < childCount; index += 1) {
                        const isLeader = index === 0;
                        const angleDeg = isLeader
                            ? params.branchAngle * 0.45 + (rng() - 0.5) * params.angleRandom * 0.4
                            : params.branchAngle + (rng() - 0.5) * params.angleRandom;
                        const azimuth = childCount === 2
                            ? (isLeader ? (rng() - 0.5) * 0.8 : Math.PI + (rng() - 0.5) * 0.65)
                            : index * ((Math.PI * 2) / childCount) + rng() * 0.55;
                        const childDirection = rotateBranchDirection(direction, THREE.MathUtils.degToRad(angleDeg), azimuth);
                        childDirection.lerp(up, isLeader ? 0.2 : 0.11).normalize();

                        const childLength = length * params.lengthShrink * (isLeader ? 1.03 : 0.9 + rng() * 0.16);
                        const childEnd = start.clone().add(childDirection.clone().multiplyScalar(childLength));
                        segments.push({
                            start: start.clone(),
                            end: childEnd.clone(),
                            radiusBottom: radius,
                            radiusTop: nextRadius * (isLeader ? 0.92 : 0.84)
                        });
                        grow(childEnd, childDirection, childLength, nextRadius * (isLeader ? 0.96 : 0.9), depth + 1);
                    }
                }

                grow(trunkEnd, trunkDirection, trunkLength * 0.76, 0.3, 0);
                return { segments: segments, leaves: leaves };
            }

            function clearTreeGroup() {
                if (!treeState.group) {
                    return;
                }
                treeState.group.traverse(function(object) {
                    if (object.isMesh && object.geometry && object.geometry !== treeState.leafGeometry) {
                        object.geometry.dispose();
                    }
                });
                while (treeState.group.children.length) {
                    treeState.group.remove(treeState.group.children[0]);
                }
            }

            function addBranchMesh(segment) {
                const direction = new THREE.Vector3().subVectors(segment.end, segment.start);
                const length = direction.length();
                const geometry = new THREE.CylinderGeometry(segment.radiusTop, segment.radiusBottom, length, 10, 1);
                const mesh = new THREE.Mesh(geometry, treeState.branchMaterial);
                mesh.position.copy(segment.start).lerp(segment.end, 0.5);
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                treeState.group.add(mesh);
            }

            function addLeafCluster(leaf, rng) {
                const basis = createBranchBasis(leaf.direction.clone().normalize());
                const count = 3 + Math.floor(rng() * 2);
                for (let index = 0; index < count; index += 1) {
                    const leafMesh = new THREE.Mesh(treeState.leafGeometry, treeState.leafMaterial);
                    const size = leaf.size * (0.72 + rng() * 0.36);
                    const offset = new THREE.Vector3()
                        .addScaledVector(basis.tangent, (rng() - 0.5) * size * 1.7)
                        .addScaledVector(basis.bitangent, (rng() - 0.5) * size * 1.7)
                        .addScaledVector(leaf.direction, (rng() - 0.2) * size * 0.8);
                    leafMesh.position.copy(leaf.position).add(offset);
                    leafMesh.scale.set(size * (0.9 + rng() * 0.2), size * (0.45 + rng() * 0.15), size * (0.8 + rng() * 0.25));
                    leafMesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                    leafMesh.castShadow = true;
                    leafMesh.receiveShadow = true;
                    treeState.group.add(leafMesh);
                }
            }

            function resetTreeCamera() {
                if (!treeState.camera || !treeState.controls) {
                    return;
                }
                treeState.camera.position.set(9.5, 7.4, 11);
                treeState.controls.target.set(0, Math.max(3.2, getTreeParams().trunkHeight * 0.68), 0);
                treeState.controls.update();
            }

            function updateTreeSummary() {
                if (!treeSummary) {
                    return;
                }
                treeSummary.innerHTML = 'Generation ' + treeState.generation + ' · ' + treeState.segmentCount + ' branches · ' + treeState.leafCount + ' leafy tips · seed ' + treeState.seed + '.';
                treeGrowButton.disabled = treeState.generation >= MAX_TREE_GENERATION;
                treeGrowButton.textContent = treeState.generation >= MAX_TREE_GENERATION ? 'Max Generation Reached' : 'Grow One Generation';
                if (treeState.controls && treeOrbitButton) {
                    treeOrbitButton.textContent = treeState.controls.autoRotate ? 'Pause Orbit' : 'Resume Orbit';
                }
            }

            function rebuildTree() {
                if (!treeState.group) {
                    return;
                }
                clearTreeGroup();
                const params = getTreeParams();
                const data = buildTreeData(params, treeState.generation, treeState.seed);
                const rng = mulberry32(treeState.seed + 1337);
                data.segments.forEach(addBranchMesh);
                data.leaves.forEach(function(leaf) {
                    addLeafCluster(leaf, rng);
                });
                treeState.segmentCount = data.segments.length;
                treeState.leafCount = data.leaves.length;
                if (treeState.controls) {
                    treeState.controls.target.y = Math.max(2.8, params.trunkHeight * (0.7 + treeState.generation * 0.1));
                }
                updateTreeSummary();
            }

            function resizeTreeScene() {
                if (!treeState.renderer || !treeStage) {
                    return;
                }
                const width = Math.max(1, treeStage.clientWidth);
                const height = Math.max(1, treeStage.clientHeight);
                treeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                treeState.renderer.setSize(width, height, false);
                treeState.camera.aspect = width / height;
                treeState.camera.updateProjectionMatrix();
            }
            function renderTreeFrame() {
                if (!treeState.renderer || !treeState.scene || !treeState.camera) {
                    return;
                }
                if (treeState.controls) {
                    treeState.controls.update();
                }
                treeState.renderer.render(treeState.scene, treeState.camera);
            }

            function animateTree(timestamp) {
                if (!treeState.running) {
                    treeState.animationFrameId = null;
                    return;
                }
                treeState.animationFrameId = requestAnimationFrame(animateTree);
                if (!treeState.renderer || !treeState.scene || !treeState.camera) {
                    return;
                }
                if (treeState.controls && treeState.controls.autoRotate) {
                    const t = timestamp * 0.00045;
                    if (treeState.rimLight) {
                        treeState.rimLight.position.set(Math.cos(t) * 8.5, 7 + Math.sin(t * 0.9) * 1.2, Math.sin(t) * 8.5);
                    }
                    if (treeState.warmLight) {
                        treeState.warmLight.position.set(Math.sin(t * 0.7) * 5, 4.5, Math.cos(t * 0.7) * 5);
                    }
                }
                renderTreeFrame();
            }

            function stopTreeDemo() {
                treeState.running = false;
                if (treeState.animationFrameId != null) {
                    cancelAnimationFrame(treeState.animationFrameId);
                    treeState.animationFrameId = null;
                }
            }

            function startTreeDemo() {
                if (!treeState.initialized) {
                    setupTreeScene();
                }
                if (!treeState.renderer || treeState.running) {
                    return;
                }
                treeState.running = true;
                resizeTreeScene();
                renderTreeFrame();
                treeState.animationFrameId = requestAnimationFrame(animateTree);
            }

            function disposeTreeScene() {
                stopTreeDemo();
                if (!treeState.initialized) {
                    return;
                }
                if (treeState.controls && typeof treeState.controls.dispose === 'function') {
                    treeState.controls.dispose();
                }
                disposeThreeGraph(treeState.scene);
                if (treeState.renderer) {
                    if (typeof treeState.renderer.dispose === 'function') {
                        treeState.renderer.dispose();
                    }
                    if (typeof treeState.renderer.forceContextLoss === 'function') {
                        treeState.renderer.forceContextLoss();
                    }
                }
                if (treeStage) {
                    treeStage.replaceChildren();
                }
                treeState.initialized = false;
                treeState.renderer = null;
                treeState.scene = null;
                treeState.camera = null;
                treeState.controls = null;
                treeState.group = null;
                treeState.rimLight = null;
                treeState.warmLight = null;
                treeState.branchMaterial = null;
                treeState.leafMaterial = null;
                treeState.leafGeometry = null;
            }

            function setupTreeScene() {
                if (!treeStage || treeState.initialized) {
                    return;
                }
                try {
                    const renderer = new THREE.WebGLRenderer({ antialias: true });
                    renderer.shadowMap.enabled = true;
                    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                    treeStage.replaceChildren(renderer.domElement);

                    const scene = new THREE.Scene();
                    scene.background = new THREE.Color(0xeaf3ff);
                    scene.fog = new THREE.Fog(0xeaf3ff, 16, 42);

                    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
                    const controls = new OrbitControls(camera, renderer.domElement);
                    controls.enableDamping = true;
                    controls.autoRotate = false;
                    controls.autoRotateSpeed = 0.55;
                    controls.minDistance = 4;
                    controls.maxDistance = 26;

                    const hemisphere = new THREE.HemisphereLight(0xeaf3ff, 0x5a6646, 1.35);
                    scene.add(hemisphere);

                    const sunLight = new THREE.DirectionalLight(0xfff1d7, 1.65);
                    sunLight.position.set(10, 14, 8);
                    sunLight.castShadow = true;
                    sunLight.shadow.mapSize.set(2048, 2048);
                    sunLight.shadow.camera.left = -14;
                    sunLight.shadow.camera.right = 14;
                    sunLight.shadow.camera.top = 14;
                    sunLight.shadow.camera.bottom = -14;
                    sunLight.shadow.camera.near = 0.5;
                    sunLight.shadow.camera.far = 40;
                    scene.add(sunLight);

                    const rimLight = new THREE.PointLight(0x86bdfd, 1.05, 34);
                    rimLight.position.set(6.8, 7.4, 5.4);
                    scene.add(rimLight);

                    const warmLight = new THREE.PointLight(0xfdbb86, 0.55, 22);
                    warmLight.position.set(-3.6, 4.5, 4.8);
                    scene.add(warmLight);

                    const ground = new THREE.Mesh(
                        new THREE.CircleGeometry(15, 72),
                        new THREE.MeshStandardMaterial({ color: 0xdde7d2, roughness: 0.97, metalness: 0.02 })
                    );
                    ground.rotation.x = -Math.PI / 2;
                    ground.position.y = -0.02;
                    ground.receiveShadow = true;
                    scene.add(ground);

                    const trunkShadow = new THREE.Mesh(
                        new THREE.CircleGeometry(0.9, 32),
                        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 })
                    );
                    trunkShadow.rotation.x = -Math.PI / 2;
                    trunkShadow.position.y = 0.01;
                    scene.add(trunkShadow);

                    const group = new THREE.Group();
                    scene.add(group);

                    treeState.renderer = renderer;
                    treeState.scene = scene;
                    treeState.camera = camera;
                    treeState.controls = controls;
                    treeState.group = group;
                    treeState.rimLight = rimLight;
                    treeState.warmLight = warmLight;
                    treeState.branchMaterial = new THREE.MeshStandardMaterial({ color: 0x7a5432, roughness: 0.9, metalness: 0.04 });
                    treeState.leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2d8d46, roughness: 0.76, metalness: 0.03, flatShading: true });
                    treeState.leafGeometry = new THREE.IcosahedronGeometry(1, 0);
                    treeState.initialized = true;
                    treeState.running = false;

                    resetTreeCamera();
                    resizeTreeScene();
                    rebuildTree();
                    renderTreeFrame();
                } catch (error) {
                    treeStage.innerHTML = '<div style="padding:24px;color:#5f6b84;line-height:1.6;">The 3D tree grower could not start in this browser.</div>';
                    treeGrowButton.disabled = true;
                    treeResetButton.disabled = true;
                    treeRandomizeButton.disabled = true;
                    treeOrbitButton.disabled = true;
                }
            }

            if (treeGrowButton) {
                treeGrowButton.addEventListener('click', function() {
                    treeState.generation = Math.min(MAX_TREE_GENERATION, treeState.generation + 1);
                    rebuildTree();
                });
            }

            if (treeResetButton) {
                treeResetButton.addEventListener('click', function() {
                    treeState.generation = 0;
                    rebuildTree();
                    resetTreeCamera();
                });
            }

            if (treeRandomizeButton) {
                treeRandomizeButton.addEventListener('click', function() {
                    treeState.seed = randomSeed();
                    treeState.generation = 0;
                    rebuildTree();
                    resetTreeCamera();
                });
            }

            if (treeOrbitButton) {
                treeOrbitButton.addEventListener('click', function() {
                    if (!treeState.controls) {
                        return;
                    }
                    treeState.controls.autoRotate = !treeState.controls.autoRotate;
                    updateTreeSummary();
                });
            }

            [
                treeTrunkHeightInput,
                treeBranchAngleInput,
                treeAngleRandomInput,
                treeLengthShrinkInput,
                treeBranchCountInput,
                treeLeafSizeInput
            ].forEach(function(input) {
                if (!input) {
                    return;
                }
                input.addEventListener('change', function() {
                    rebuildTree();
                });
            });
            function syncExampleDemoLifecycle() {
                if (isExampleTabActive('snowflake')) {
                    startKochSnowflakeDemo();
                } else {
                    stopKochSnowflakeDemo();
                }

                if (isExampleTabActive('fern')) {
                    startBarnsleyFernDemo();
                } else {
                    disposeBarnsleyFernDemo();
                }

                if (isExampleTabActive('nautilus')) {
                    startNautilusDemo();
                } else {
                    disposeNautilusDemo();
                }

                if (isExampleTabActive('sunflower')) {
                    startSunflowerDemo();
                } else {
                    stopSunflowerDemo();
                }

                if (isExampleTabActive('tree')) {
                    startTreeDemo();
                } else {
                    disposeTreeScene();
                }
            }

            function syncComplexPlaneLifecycle() {
                if (isComplexSectionActive()) {
                    setupComplexPlaneScene();
                    drawComplexPlaneSequence(getActiveComplexResult());
                } else {
                    restorePinnedComplexPlaneResult();
                }
            }

            function syncPlotLifecycle() {
                if (!plotState.supported) {
                    return;
                }
                if (isPlotSectionActive()) {
                    updateDensifyButtonLabel();
                    requestPlotDraw();
                } else {
                    cancelPlotAutoDensify();
                    cancelPlotDensify();
                    clearPlotHoverTracker();
                }
            }

            function syncCardioidLifecycle() {
                if (isCardioidSectionActive()) {
                    ensureCardioidAnimationInitialized();
                    drawCardioidScene();
                    startCardioidAnimation();
                } else {
                    stopCardioidAnimation();
                    cardioidState.lastTimestamp = null;
                }
            }

            function syncSectionLifecycles() {
                syncExampleDemoLifecycle();
                syncComplexPlaneLifecycle();
                syncPlotLifecycle();
                syncCardioidLifecycle();
            }

            function redrawAllCanvases() {
                drawRealSequence(lastRealResult);
                if (isComplexStorySectionActive()) {
                    requestComplexStoryDraw();
                }
                if (isComplexSectionActive()) {
                    const activeComplexResult = getActiveComplexResult();
                    drawComplexPlaneSequence(activeComplexResult);
                    drawComplexGrowthChart(activeComplexResult);
                }
                if (isCardioidSectionActive()) {
                    drawCardioidScene();
                }
                if (isExampleTabActive('snowflake') && kochSnowflakeState.initialized) {
                    renderKochSnowflakeFrame();
                }
                if (isExampleTabActive('fern') && barnsleyFernState.initialized) {
                    resizeBarnsleyFernScene();
                    renderBarnsleyFernFrame();
                }
                if (isExampleTabActive('nautilus') && nautilusState.initialized) {
                    resizeNautilusScene();
                    renderNautilusFrame();
                }
                if (isExampleTabActive('sunflower') && sunflowerState.initialized) {
                    renderSunflowerFrame();
                }
                updateDensifyButtonLabel();
                if (isPlotSectionActive()) {
                    requestPlotDraw();
                }
                if (isExampleTabActive('tree') && treeState.initialized) {
                    resizeTreeScene();
                    renderTreeFrame();
                }
            }

            Array.prototype.forEach.call(document.querySelectorAll('.presentation-section'), function(section) {
                const sectionBody = section.querySelector('.section-body');
                section.addEventListener('toggle', function() {
                    if (!section.open) {
                        syncSectionLifecycles();
                        return;
                    }
                    requestAnimationFrame(function() {
                        syncSectionLifecycles();
                        redrawAllCanvases();
                    });
                });
                if (sectionBody) {
                    sectionBody.addEventListener('click', function(event) {
                        if (!section.open || event.target !== sectionBody) {
                            return;
                        }
                        const bodyRect = sectionBody.getBoundingClientRect();
                        const paddingBottom = parseFloat(window.getComputedStyle(sectionBody).paddingBottom) || 0;
                        const closeZoneHeight = Math.max(paddingBottom, 24);
                        if (event.clientY >= bodyRect.bottom - closeZoneHeight) {
                            section.open = false;
                        }
                    });
                }
            });

            window.addEventListener('resize', function() {
                syncSectionLifecycles();
                redrawAllCanvases();
            });

            if (gl) {
                setupWebGL();
                initializePlotInteractions();
                updatePlotHoverTrackerButton();
                updatePlotFullscreenButton();
                resetPlot();
            } else if (plotFrame) {
                plotFrame.innerHTML = '<div style="padding:24px;color:#5f6b84;line-height:1.6;">WebGL is not available in this browser, so the Mandelbrot plotter cannot run here.</div>';
                plotDensifyButton.disabled = true;
                plotResetButton.disabled = true;
                plotResetViewButton.disabled = true;
                if (plotMeshToggle) {
                    plotMeshToggle.disabled = true;
                }
                if (plotAutoDensifyToggle) {
                    plotAutoDensifyToggle.disabled = true;
                }
                if (plotColorSchemeSelect) {
                    plotColorSchemeSelect.disabled = true;
                }
                if (plotHoverTrackToggle) {
                    plotHoverTrackToggle.disabled = true;
                }
            }

            setupFractalMedia();
            initializeComplexStory();
            setupExampleTabs();
            renderRealTool(-1);
            renderComplexTool(-1, 0);
            updateCardioidButton();
            syncSectionLifecycles();
            requestAnimationFrame(redrawAllCanvases);
        })();