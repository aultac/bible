            const sunflowerState = {
                initialized: false,
                running: false,
                controlsBound: false,
                ctx: sunflowerCanvas ? sunflowerCanvas.getContext('2d') : null,
                animationFrameId: null,
                lastTimestamp: null,
                ambientElapsedMs: 0,
                playing: false,
                outerStep: 0,
                introReveal: 0,
                introTransition: null,
                seedsPlaced: 0,
                seedTransition: null,
                redSpiralReveal: 0,
                blueSpiralReveal: 0,
                redSpiralVisible: true,
                blueSpiralVisible: true,
                spiralTransition: null,
                realImage: null,
                realImageLoaded: false,
                introDurationMs: 900,
                placementManualDurationMs: 320,
                placementAutoDurationMs: 68,
                spiralFamilyDurationMs: 1900
            };

            function loadSunflowerRealImage() {
                if (!SUNFLOWER_REAL_IMAGE_ASSET || sunflowerState.realImage) {
                    return;
                }
                const image = new Image();
                image.decoding = 'async';
                image.addEventListener('load', function() {
                    sunflowerState.realImageLoaded = true;
                    renderSunflowerFrame();
                });
                image.addEventListener('error', function() {
                    sunflowerState.realImageLoaded = false;
                });
                image.src = SUNFLOWER_REAL_IMAGE_ASSET;
                sunflowerState.realImage = image;
            }

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
                if (sunflowerStage) {
                    sunflowerStage.addEventListener('click', function() {
                        handleSunflowerStageClick();
                    });
                }
                if (sunflowerToggleRedButton) {
                    sunflowerToggleRedButton.addEventListener('click', function(event) {
                        event.stopPropagation();
                        toggleSunflowerSpiralVisibility('red');
                    });
                }
                if (sunflowerToggleBlueButton) {
                    sunflowerToggleBlueButton.addEventListener('click', function(event) {
                        event.stopPropagation();
                        toggleSunflowerSpiralVisibility('blue');
                    });
                }
                sunflowerState.controlsBound = true;
            }

            function resetSunflowerSpiralVisibility() {
                sunflowerState.redSpiralVisible = true;
                sunflowerState.blueSpiralVisible = true;
            }

            function isSunflowerSpiralVisibilityEnabled() {
                return sunflowerState.outerStep === 2 && isSunflowerParastichyComplete();
            }

            function isSunflowerSpiralFamilyVisible(family) {
                return family === 'red'
                    ? sunflowerState.redSpiralVisible
                    : sunflowerState.blueSpiralVisible;
            }

            function toggleSunflowerSpiralVisibility(family) {
                if (!isSunflowerSpiralVisibilityEnabled()) {
                    return;
                }
                if (family === 'red') {
                    sunflowerState.redSpiralVisible = !sunflowerState.redSpiralVisible;
                } else if (family === 'blue') {
                    sunflowerState.blueSpiralVisible = !sunflowerState.blueSpiralVisible;
                } else {
                    return;
                }
                updateSunflowerControls();
                renderSunflowerFrame();
            }
            function getSunflowerIntroRenderProgress() {
                if (!sunflowerState.introTransition) {
                    return sunflowerState.introReveal;
                }
                const progress = easeInOutCubic(clamp(
                    sunflowerState.introTransition.elapsedMs / sunflowerState.introTransition.durationMs,
                    0,
                    1
                ));
                return lerp(
                    sunflowerState.introTransition.fromProgress,
                    sunflowerState.introTransition.toProgress,
                    progress
                );
            }

            function getSunflowerSpiralReveal(family) {
                const baseReveal = family === 'red'
                    ? sunflowerState.redSpiralReveal
                    : sunflowerState.blueSpiralReveal;
                if (!sunflowerState.spiralTransition || sunflowerState.spiralTransition.family !== family) {
                    return baseReveal;
                }
                const progress = easeInOutCubic(clamp(
                    sunflowerState.spiralTransition.elapsedMs / sunflowerState.spiralTransition.durationMs,
                    0,
                    1
                ));
                return lerp(
                    sunflowerState.spiralTransition.fromProgress,
                    sunflowerState.spiralTransition.toProgress,
                    progress
                );
            }

            function handleSunflowerStageClick() {
                if (sunflowerState.outerStep === 0) {
                    if (startSunflowerIntroTransition()) {
                        sunflowerState.lastTimestamp = null;
                        renderSunflowerFrame();
                    }
                    return;
                }
                if (sunflowerState.outerStep === 1) {
                    if (sunflowerState.playing || sunflowerState.seedTransition || isSunflowerPlacementComplete()) {
                        return;
                    }
                    if (startSunflowerSeedTransition(sunflowerState.placementManualDurationMs)) {
                        sunflowerState.lastTimestamp = null;
                        renderSunflowerFrame();
                    }
                    return;
                }
                if (sunflowerState.outerStep === 2) {
                    if (sunflowerState.playing || sunflowerState.spiralTransition) {
                        return;
                    }
                    const pendingFamily = getPendingSunflowerSpiralFamily();
                    if (startSunflowerSpiralAnimation(pendingFamily)) {
                        sunflowerState.lastTimestamp = null;
                        renderSunflowerFrame();
                    }
                }
            }
            function isSunflowerIntroComplete() {
                return sunflowerState.introReveal >= 0.999;
            }

            function isSunflowerPlacementComplete() {
                return sunflowerState.seedsPlaced >= SUNFLOWER_MAX_SEEDS;
            }

            function isSunflowerParastichyComplete() {
                return sunflowerState.redSpiralReveal >= 0.999 && sunflowerState.blueSpiralReveal >= 0.999;
            }

            function getPendingSunflowerSpiralFamily() {
                if (sunflowerState.redSpiralReveal < 0.999) {
                    return 'red';
                }
                if (sunflowerState.blueSpiralReveal < 0.999) {
                    return 'blue';
                }
                return null;
            }

            function createSunflowerIntroTransition(durationMs) {
                return {
                    fromProgress: sunflowerState.introReveal,
                    toProgress: 1,
                    elapsedMs: 0,
                    durationMs: Math.max(1, durationMs)
                };
            }

            function startSunflowerIntroTransition() {
                if (sunflowerState.outerStep !== 0 || sunflowerState.introTransition || isSunflowerIntroComplete()) {
                    return false;
                }
                sunflowerState.introTransition = createSunflowerIntroTransition(
                    sunflowerState.introDurationMs * Math.max(0.18, 1 - sunflowerState.introReveal)
                );
                return true;
            }

            function finishSunflowerIntroTransition() {
                if (!sunflowerState.introTransition) {
                    return;
                }
                sunflowerState.introReveal = sunflowerState.introTransition.toProgress;
                sunflowerState.introTransition = null;
            }

            function createSunflowerSeedTransition(durationMs) {
                return {
                    fromCount: sunflowerState.seedsPlaced,
                    toCount: Math.min(SUNFLOWER_MAX_SEEDS, sunflowerState.seedsPlaced + 1),
                    elapsedMs: 0,
                    durationMs: Math.max(1, durationMs)
                };
            }

            function startSunflowerSeedTransition(durationMs) {
                if (sunflowerState.outerStep !== 1 || sunflowerState.seedTransition || isSunflowerPlacementComplete()) {
                    return false;
                }
                sunflowerState.seedTransition = createSunflowerSeedTransition(durationMs);
                return true;
            }

            function finishSunflowerSeedTransition() {
                if (!sunflowerState.seedTransition) {
                    return;
                }
                sunflowerState.seedsPlaced = sunflowerState.seedTransition.toCount;
                sunflowerState.seedTransition = null;
                if (sunflowerState.playing && isSunflowerPlacementComplete()) {
                    sunflowerState.playing = false;
                }
            }

            function snapSunflowerPlacementComplete() {
                sunflowerState.seedTransition = null;
                sunflowerState.seedsPlaced = SUNFLOWER_MAX_SEEDS;
            }

            function createSunflowerSpiralTransition(family, fromProgress, durationMs) {
                return {
                    family: family,
                    fromProgress: clamp(fromProgress, 0, 1),
                    toProgress: 1,
                    elapsedMs: 0,
                    durationMs: Math.max(1, durationMs)
                };
            }

            function startSunflowerSpiralAnimation(family) {
                if (sunflowerState.outerStep !== 2 || sunflowerState.spiralTransition || !family) {
                    return false;
                }
                const fromProgress = family === 'red'
                    ? sunflowerState.redSpiralReveal
                    : sunflowerState.blueSpiralReveal;
                if (fromProgress >= 0.999) {
                    return false;
                }
                sunflowerState.spiralTransition = createSunflowerSpiralTransition(
                    family,
                    fromProgress,
                    sunflowerState.spiralFamilyDurationMs * Math.max(0.14, 1 - fromProgress)
                );
                return true;
            }

            function captureSunflowerSpiralProgress() {
                if (!sunflowerState.spiralTransition) {
                    return;
                }
                const progress = easeInOutCubic(clamp(
                    sunflowerState.spiralTransition.elapsedMs / sunflowerState.spiralTransition.durationMs,
                    0,
                    1
                ));
                const reveal = lerp(
                    sunflowerState.spiralTransition.fromProgress,
                    sunflowerState.spiralTransition.toProgress,
                    progress
                );
                if (sunflowerState.spiralTransition.family === 'red') {
                    sunflowerState.redSpiralReveal = reveal;
                } else {
                    sunflowerState.blueSpiralReveal = reveal;
                }
                sunflowerState.spiralTransition = null;
            }

            function finishSunflowerSpiralTransition() {
                if (!sunflowerState.spiralTransition) {
                    return;
                }
                if (sunflowerState.spiralTransition.family === 'red') {
                    sunflowerState.redSpiralReveal = sunflowerState.spiralTransition.toProgress;
                } else {
                    sunflowerState.blueSpiralReveal = sunflowerState.spiralTransition.toProgress;
                }
                sunflowerState.spiralTransition = null;
                if (sunflowerState.playing && !getPendingSunflowerSpiralFamily()) {
                    sunflowerState.playing = false;
                }
            }

            function snapSunflowerParastichyComplete() {
                sunflowerState.spiralTransition = null;
                sunflowerState.redSpiralReveal = 1;
                sunflowerState.blueSpiralReveal = 1;
            }

            function setSunflowerStep(step) {
                sunflowerState.playing = false;
                sunflowerState.introTransition = null;
                sunflowerState.seedTransition = null;
                sunflowerState.spiralTransition = null;
                sunflowerState.outerStep = clamp(Math.round(step), 0, SUNFLOWER_STEP_TOTAL - 1);
                if (sunflowerState.outerStep >= 2 && sunflowerState.seedsPlaced < SUNFLOWER_MAX_SEEDS) {
                    sunflowerState.seedsPlaced = SUNFLOWER_MAX_SEEDS;
                }
                if (sunflowerState.outerStep !== 2) {
                    resetSunflowerSpiralVisibility();
                }
                if (sunflowerState.outerStep === 3) {
                    sunflowerState.redSpiralReveal = 1;
                    sunflowerState.blueSpiralReveal = 1;
                }
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function nudgeSunflowerStep(direction) {
                if (sunflowerState.introTransition || sunflowerState.seedTransition || sunflowerState.spiralTransition) {
                    return;
                }
                const startStep = sunflowerState.outerStep;
                const targetStep = clamp(startStep + direction, 0, SUNFLOWER_STEP_TOTAL - 1);
                if (targetStep === startStep) {
                    return;
                }
                if (direction > 0) {
                    if (startStep === 1) {
                        snapSunflowerPlacementComplete();
                    }
                    if (startStep === 2) {
                        snapSunflowerParastichyComplete();
                    }
                }
                setSunflowerStep(targetStep);
            }

            function toggleSunflowerPlayback() {
                if (sunflowerState.outerStep === 1) {
                    if (sunflowerState.playing) {
                        sunflowerState.playing = false;
                        finishSunflowerSeedTransition();
                    } else {
                        if (isSunflowerPlacementComplete()) {
                            sunflowerState.seedsPlaced = 0;
                            sunflowerState.seedTransition = null;
                        }
                        sunflowerState.playing = true;
                        if (!startSunflowerSeedTransition(sunflowerState.placementAutoDurationMs) && isSunflowerPlacementComplete()) {
                            sunflowerState.playing = false;
                        }
                    }
                } else if (sunflowerState.outerStep === 2) {
                    if (sunflowerState.playing) {
                        sunflowerState.playing = false;
                        captureSunflowerSpiralProgress();
                    } else {
                        if (isSunflowerParastichyComplete()) {
                            sunflowerState.redSpiralReveal = 0;
                            sunflowerState.blueSpiralReveal = 0;
                            resetSunflowerSpiralVisibility();
                            sunflowerState.spiralTransition = null;
                        }
                        const pendingFamily = getPendingSunflowerSpiralFamily();
                        if (!pendingFamily) {
                            return;
                        }
                        sunflowerState.playing = true;
                        if (!startSunflowerSpiralAnimation(pendingFamily) && isSunflowerParastichyComplete()) {
                            sunflowerState.playing = false;
                        }
                    }
                } else {
                    return;
                }
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function resetSunflowerDemo() {
                sunflowerState.playing = false;
                sunflowerState.outerStep = 0;
                sunflowerState.introReveal = 0;
                sunflowerState.introTransition = null;
                sunflowerState.seedsPlaced = 0;
                sunflowerState.seedTransition = null;
                sunflowerState.redSpiralReveal = 0;
                sunflowerState.blueSpiralReveal = 0;
                resetSunflowerSpiralVisibility();
                sunflowerState.spiralTransition = null;
                sunflowerState.lastTimestamp = null;
                updateSunflowerControls();
                renderSunflowerFrame();
            }

            function updateSunflowerControls() {
                const isBusy = !!(sunflowerState.introTransition || sunflowerState.seedTransition || sunflowerState.spiralTransition);
                if (sunflowerStageCount) {
                    sunflowerStageCount.textContent = (sunflowerState.outerStep + 1) + '/' + SUNFLOWER_STEP_TOTAL;
                }
                if (sunflowerPlayButton) {
                    let label = sunflowerState.playing ? 'Pause' : 'Play';
                    if (!sunflowerState.playing && sunflowerState.outerStep === 1 && isSunflowerPlacementComplete()) {
                        label = 'Replay';
                    }
                    if (!sunflowerState.playing && sunflowerState.outerStep === 2 && isSunflowerParastichyComplete()) {
                        label = 'Replay';
                    }
                    sunflowerPlayButton.textContent = label;
                    sunflowerPlayButton.disabled = sunflowerState.outerStep === 0 || sunflowerState.outerStep === 3 || (!sunflowerState.playing && isBusy);
                }
                if (sunflowerPrevButton) {
                    sunflowerPrevButton.disabled = isBusy || sunflowerState.outerStep <= 0;
                }
                if (sunflowerNextButton) {
                    sunflowerNextButton.disabled = isBusy || sunflowerState.outerStep >= SUNFLOWER_STEP_TOTAL - 1;
                }
                if (sunflowerViewportActions) {
                    sunflowerViewportActions.hidden = !isSunflowerSpiralVisibilityEnabled();
                }
                if (sunflowerToggleRedButton) {
                    sunflowerToggleRedButton.textContent = 'Red spirals: ' + (sunflowerState.redSpiralVisible ? 'On' : 'Off');
                    sunflowerToggleRedButton.setAttribute('aria-pressed', sunflowerState.redSpiralVisible ? 'true' : 'false');
                }
                if (sunflowerToggleBlueButton) {
                    sunflowerToggleBlueButton.textContent = 'Blue spirals: ' + (sunflowerState.blueSpiralVisible ? 'On' : 'Off');
                    sunflowerToggleBlueButton.setAttribute('aria-pressed', sunflowerState.blueSpiralVisible ? 'true' : 'false');
                }
                if (sunflowerStage) {
                    const canRevealIntro = sunflowerState.outerStep === 0 && !sunflowerState.introTransition && !isSunflowerIntroComplete();
                    const canPlaceSeed = sunflowerState.outerStep === 1 && !sunflowerState.playing && !sunflowerState.seedTransition && !isSunflowerPlacementComplete();
                    const canTraceSpirals = sunflowerState.outerStep === 2 && !sunflowerState.playing && !sunflowerState.spiralTransition && !!getPendingSunflowerSpiralFamily();
                    sunflowerStage.style.cursor = canRevealIntro || canPlaceSeed || canTraceSpirals
                        ? 'pointer'
                        : 'default';
                }
            }

            function getSunflowerPlacementAngleForSeed(seedIndex, angleOffsetRadians) {
                const angleOffset = angleOffsetRadians || 0;
                return -Math.PI / 2 + angleOffset + (seedIndex + 1) * GOLDEN_ANGLE_RADIANS;
            }

            function getSunflowerLineAngleForCount(count, angleOffsetRadians) {
                const angleOffset = angleOffsetRadians || 0;
                return -Math.PI / 2 + angleOffset + count * GOLDEN_ANGLE_RADIANS;
            }

            function getSunflowerPlacementRadiusForSeed(seedIndex, maxRadius) {
                if (SUNFLOWER_MAX_SEEDS <= 1) {
                    return 0;
                }
                const clampedIndex = clamp(Math.round(seedIndex), 0, SUNFLOWER_MAX_SEEDS - 1);
                const radialScale = maxRadius / Math.sqrt(Math.max(1, SUNFLOWER_MAX_SEEDS - 1));
                return radialScale * Math.sqrt(Math.max(0, SUNFLOWER_MAX_SEEDS - 1 - clampedIndex));
            }

            function getSunflowerLineRadiusForCount(count, maxRadius) {
                if (count <= 0) {
                    return getSunflowerPlacementRadiusForSeed(0, maxRadius);
                }
                return getSunflowerPlacementRadiusForSeed(Math.min(SUNFLOWER_MAX_SEEDS - 1, count - 1), maxRadius);
            }

            function getSunflowerSeedPoint(seedIndex, centerX, centerY, maxRadius, angleOffsetRadians) {
                const radius = getSunflowerPlacementRadiusForSeed(seedIndex, maxRadius);
                const angle = getSunflowerPlacementAngleForSeed(seedIndex, angleOffsetRadians);
                return {
                    index: seedIndex,
                    radius: radius,
                    angle: angle,
                    x: centerX + Math.cos(angle) * radius,
                    y: centerY + Math.sin(angle) * radius
                };
            }

            function getSunflowerSeeds(count, centerX, centerY, maxRadius, angleOffsetRadians) {
                const seeds = [];
                const total = clamp(Math.round(count), 0, SUNFLOWER_MAX_SEEDS);
                for (let index = 0; index < total; index += 1) {
                    seeds.push(getSunflowerSeedPoint(index, centerX, centerY, maxRadius, angleOffsetRadians));
                }
                return seeds;
            }

            function getSunflowerPlacementFrame(centerX, centerY, maxRadius) {
                const placedSeeds = getSunflowerSeeds(sunflowerState.seedsPlaced, centerX, centerY, maxRadius);
                const lineAngle = getSunflowerLineAngleForCount(sunflowerState.seedsPlaced);
                const lineRadius = getSunflowerLineRadiusForCount(sunflowerState.seedsPlaced, maxRadius);
                const frame = {
                    seeds: placedSeeds,
                    lineAngle: lineAngle,
                    lineRadius: lineRadius,
                    sweepStartAngle: lineAngle,
                    transitionProgress: 0,
                    emission: null
                };
                if (!sunflowerState.seedTransition) {
                    return frame;
                }
                const progress = easeInOutCubic(clamp(
                    sunflowerState.seedTransition.elapsedMs / sunflowerState.seedTransition.durationMs,
                    0,
                    1
                ));
                const targetIndex = sunflowerState.seedTransition.toCount - 1;
                const startAngle = getSunflowerLineAngleForCount(sunflowerState.seedTransition.fromCount);
                const endAngle = getSunflowerPlacementAngleForSeed(targetIndex);
                const startRadius = getSunflowerLineRadiusForCount(sunflowerState.seedTransition.fromCount, maxRadius);
                const endRadius = getSunflowerPlacementRadiusForSeed(targetIndex, maxRadius);
                frame.lineAngle = lerp(startAngle, endAngle, progress);
                frame.lineRadius = lerp(startRadius, endRadius, progress);
                frame.sweepStartAngle = startAngle;
                frame.transitionProgress = progress;
                const emissionProgress = clamp((progress - 0.48) / 0.52, 0, 1);
                if (emissionProgress > 0) {
                    frame.emission = {
                        x: centerX + Math.cos(frame.lineAngle) * frame.lineRadius * emissionProgress,
                        y: centerY + Math.sin(frame.lineAngle) * frame.lineRadius * emissionProgress,
                        alpha: 0.45 + emissionProgress * 0.55
                    };
                }
                return frame;
            }


            function drawSunflowerBackdrop(ctx, size, centerX, centerY, outerRadius) {
                ctx.clearRect(0, 0, size.width, size.height);
                ctx.fillStyle = '#fffdf7';
                ctx.fillRect(0, 0, size.width, size.height);

                const pulse = 0.16 + 0.04 * (0.5 + 0.5 * Math.sin(sunflowerState.ambientElapsedMs * 0.0011));
                const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, outerRadius * 1.45);
                glow.addColorStop(0, 'rgba(254, 249, 195, ' + (pulse + 0.24).toFixed(3) + ')');
                glow.addColorStop(0.55, 'rgba(250, 204, 21, ' + pulse.toFixed(3) + ')');
                glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, size.width, size.height);
            }

            function drawSunflowerOuterGuide(ctx, centerX, centerY, radius, dpr, alpha) {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.82)';
                ctx.lineWidth = 1.9 * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            function drawSunflowerCenterDot(ctx, centerX, centerY, dpr) {
                ctx.save();
                ctx.fillStyle = 'rgba(51, 65, 85, 0.92)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 3.6 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 1.35 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            function drawSunflowerReferenceLine(ctx, centerX, centerY, angle, length, dpr, options) {
                options = options || {};
                ctx.save();
                ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
                ctx.strokeStyle = options.color || 'rgba(71, 85, 105, 0.82)';
                ctx.lineWidth = (options.lineWidth || 2) * dpr;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
                ctx.stroke();
                ctx.restore();
            }

            function drawSunflowerGoldenAngleSector(ctx, centerX, centerY, startAngle, endAngle, radius, dpr, options) {
                options = options || {};
                ctx.save();
                ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
                ctx.fillStyle = options.fillStyle || 'rgba(251, 191, 36, 0.28)';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = options.strokeStyle || 'rgba(217, 119, 6, 0.92)';
                ctx.lineWidth = (options.lineWidth || 2.1) * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
                ctx.stroke();
                ctx.restore();
            }

            function drawSunflowerIntroStage(ctx, centerX, centerY, outerRadius, dpr) {
                const progress = getSunflowerIntroRenderProgress();
                const circleRadius = outerRadius * 0.84;
                const startAngle = -Math.PI / 2;
                const endAngle = startAngle + GOLDEN_ANGLE_RADIANS * progress;

                drawSunflowerOuterGuide(ctx, centerX, centerY, circleRadius, dpr, 0.58);
                drawSunflowerReferenceLine(ctx, centerX, centerY, startAngle, circleRadius, dpr, {
                    alpha: 0.9,
                    color: 'rgba(71, 85, 105, 0.86)',
                    lineWidth: 2.05
                });
                if (progress <= 0.001) {
                    return;
                }

                drawSunflowerReferenceLine(ctx, centerX, centerY, endAngle, circleRadius, dpr, {
                    alpha: 0.28 + progress * 0.72,
                    color: 'rgba(217, 119, 6, 0.96)',
                    lineWidth: 2.3
                });

                ctx.save();
                ctx.globalAlpha = progress;
                ctx.lineCap = 'round';
                ctx.lineWidth = 8 * dpr;
                ctx.strokeStyle = 'rgba(217, 119, 6, 0.94)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, circleRadius, startAngle, endAngle, false);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(37, 99, 235, 0.76)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, circleRadius, endAngle, startAngle + Math.PI * 2 - 0.018, false);
                ctx.stroke();
                ctx.restore();

                drawSunflowerGoldenAngleSector(ctx, centerX, centerY, startAngle, endAngle, circleRadius * 0.31, dpr, {
                    alpha: progress,
                    fillStyle: 'rgba(251, 191, 36, 0.28)',
                    strokeStyle: 'rgba(217, 119, 6, 0.96)',
                    lineWidth: 2.1
                });
                drawSunflowerCenterDot(ctx, centerX, centerY, dpr);

                const labelAlpha = clamp((progress - 0.12) / 0.88, 0, 1);
                const shortMidAngle = (startAngle + endAngle) * 0.5;
                const longMidAngle = endAngle + (Math.PI * 2 - (endAngle - startAngle)) * 0.56;
                ctx.save();
                ctx.globalAlpha = labelAlpha;
                const goldenAngleLabelY = centerY + Math.sin(shortMidAngle) * circleRadius * 0.34;
                drawCanvasChip(ctx, 'a', centerX + Math.cos(longMidAngle) * circleRadius * 1.12, centerY + Math.sin(longMidAngle) * circleRadius * 1.12, {
                    dpr: dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 255, 255, 0.96)'
                });
                drawCanvasChip(ctx, 'b', centerX + Math.cos(shortMidAngle) * circleRadius * 1.15, centerY + Math.sin(shortMidAngle) * circleRadius * 1.15, {
                    dpr: dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 255, 255, 0.98)',
                    borderColor: 'rgba(217, 119, 6, 0.26)',
                    textColor: '#9a3412',
                    fontSize: 12
                });
                drawCanvasChip(ctx, 'a / b = golden ratio (φ)', centerX + circleRadius * 0.12, centerY - circleRadius * 0.72, {
                    dpr: dpr,
                    align: 'left',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 247, 237, 0.98)',
                    borderColor: 'rgba(217, 119, 6, 0.28)',
                    textColor: '#9a3412',
                    fontSize: 14
                });
                drawCanvasChip(ctx, 'Golden Angle = ' + GOLDEN_ANGLE_DEGREES.toFixed(5) + '...', 18 * dpr, 52 * dpr, {
                    dpr: dpr,
                    fontSize: 13
                });
                drawCanvasChip(ctx, 'golden angle', centerX + Math.cos(shortMidAngle) * circleRadius * 0.3, goldenAngleLabelY + 12 * dpr, {
                    dpr: dpr,
                    align: 'center',
                    verticalAlign: 'middle',
                    background: 'rgba(255, 247, 237, 0.98)',
                    borderColor: 'rgba(217, 119, 6, 0.32)',
                    textColor: '#9a3412',
                    fontSize: 12
                });
                ctx.restore();
            }

            function getSunflowerSeedStyle() {
                return {
                    majorRadius: 7.1,
                    minorRadius: 4.15,
                    fill: 'rgba(122, 74, 18, 0.98)',
                    stroke: 'rgba(92, 56, 14, 0.88)',
                    highlight: 'rgba(255, 248, 237, 0.26)'
                };
            }

            function traceSunflowerSeedPath(ctx, majorRadius, minorRadius) {
                ctx.beginPath();
                ctx.moveTo(0, -majorRadius);
                ctx.quadraticCurveTo(minorRadius * 0.92, -majorRadius * 0.18, minorRadius, 0);
                ctx.quadraticCurveTo(minorRadius * 0.92, majorRadius * 0.18, 0, majorRadius);
                ctx.quadraticCurveTo(-minorRadius * 0.92, majorRadius * 0.18, -minorRadius, 0);
                ctx.quadraticCurveTo(-minorRadius * 0.92, -majorRadius * 0.18, 0, -majorRadius);
                ctx.closePath();
            }

            function drawSunflowerSeedGlyphAt(ctx, x, y, angle, dpr, alpha) {
                if (alpha <= 0.001) {
                    return;
                }
                const style = getSunflowerSeedStyle();
                const majorRadius = style.majorRadius * dpr;
                const minorRadius = style.minorRadius * dpr;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(x, y);
                ctx.rotate(angle);
                traceSunflowerSeedPath(ctx, majorRadius, minorRadius);
                ctx.fillStyle = style.fill;
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = 0.95 * dpr;
                ctx.fill();
                ctx.stroke();
                traceSunflowerSeedPath(ctx, majorRadius * 0.6, minorRadius * 0.36);
                ctx.fillStyle = style.highlight;
                ctx.fill();
                ctx.restore();
            }

            function drawSunflowerSeedDots(ctx, seeds, dpr, alpha) {
                if (!seeds.length || alpha <= 0.001) {
                    return;
                }
                seeds.forEach(function(seed) {
                    drawSunflowerSeedGlyphAt(ctx, seed.x, seed.y, seed.angle + Math.PI / 2, dpr, alpha);
                });
            }

            function drawSunflowerPlacementStage(ctx, centerX, centerY, outerRadius, dpr) {
                const seedFieldRadius = outerRadius * 0.81;
                const startAngle = -Math.PI / 2;
                const placement = getSunflowerPlacementFrame(centerX, centerY, seedFieldRadius);

                drawSunflowerOuterGuide(ctx, centerX, centerY, seedFieldRadius, dpr, 0.4);
                drawSunflowerReferenceLine(ctx, centerX, centerY, startAngle, seedFieldRadius, dpr, {
                    alpha: 0.38,
                    color: 'rgba(71, 85, 105, 0.82)',
                    lineWidth: 1.8
                });
                if (placement.transitionProgress > 0.001) {
                    drawSunflowerGoldenAngleSector(ctx, centerX, centerY, placement.sweepStartAngle, placement.lineAngle, seedFieldRadius * 0.25, dpr, {
                        alpha: 0.96,
                        fillStyle: 'rgba(251, 191, 36, 0.3)',
                        strokeStyle: 'rgba(217, 119, 6, 0.94)',
                        lineWidth: 2.05
                    });
                }
                drawSunflowerSeedDots(ctx, placement.seeds, dpr, 0.98);
                drawSunflowerReferenceLine(ctx, centerX, centerY, placement.lineAngle, placement.lineRadius, dpr, {
                    alpha: 0.98,
                    color: 'rgba(217, 119, 6, 0.96)',
                    lineWidth: 2.45
                });
                if (placement.emission) {
                    drawSunflowerSeedGlyphAt(
                        ctx,
                        placement.emission.x,
                        placement.emission.y,
                        placement.lineAngle + Math.PI / 2,
                        dpr,
                        placement.emission.alpha
                    );
                }
                const lastPlacedSeed = placement.seeds[placement.seeds.length - 1];
                if (lastPlacedSeed) {
                    ctx.save();
                    ctx.translate(lastPlacedSeed.x, lastPlacedSeed.y);
                    ctx.rotate(lastPlacedSeed.angle + Math.PI / 2);
                    traceSunflowerSeedPath(ctx, 8.2 * dpr, 4.85 * dpr);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.lineWidth = 1.2 * dpr;
                    ctx.stroke();
                    ctx.restore();
                }
                drawSunflowerCenterDot(ctx, centerX, centerY, dpr);

                drawCanvasChip(ctx, 'Golden Angle = ' + GOLDEN_ANGLE_DEGREES.toFixed(5) + '...', 18 * dpr, 52 * dpr, {
                    dpr: dpr,
                    fontSize: 13
                });
                drawCanvasChip(
                    ctx,
                    isSunflowerPlacementComplete()
                        ? 'seed head complete'
                        : sunflowerState.playing
                            ? 'planting seeds automatically'
                            : 'click in the circle to place the next seed',
                    18 * dpr,
                    86 * dpr,
                    {
                        dpr: dpr
                    }
                );
                drawCanvasChip(ctx, placement.seeds.length + ' / ' + SUNFLOWER_MAX_SEEDS + ' seeds placed', 18 * dpr, 120 * dpr, {
                    dpr: dpr
                });
                if (placement.transitionProgress > 0.001 || !placement.seeds.length) {
                    drawCanvasChip(ctx, 'golden angle', centerX + Math.cos(startAngle + GOLDEN_ANGLE_RADIANS * 0.5) * seedFieldRadius * 0.39, centerY + Math.sin(startAngle + GOLDEN_ANGLE_RADIANS * 0.5) * seedFieldRadius * 0.39, {
                        dpr: dpr,
                        align: 'center',
                        verticalAlign: 'middle',
                        background: 'rgba(255, 247, 237, 0.96)',
                        borderColor: 'rgba(217, 119, 6, 0.32)',
                        textColor: '#9a3412'
                    });
                }
            }

            function getSunflowerParastichyFamilyConfig(family) {
                if (family === 'red') {
                    return {
                        stride: SUNFLOWER_RED_REPRESENTATIVE_STRIDE,
                        strokeStyle: 'rgba(220, 38, 38, 0.88)',
                        lineWidth: 6.6,
                        endpointPhase: 0,
                        chip: {
                            background: 'rgba(254, 242, 242, 0.98)',
                            borderColor: 'rgba(220, 38, 38, 0.22)',
                            textColor: '#b91c1c'
                        }
                    };
                }
                return {
                    stride: SUNFLOWER_PARASTICHY_COUNTS[0],
                    strokeStyle: 'rgba(37, 99, 235, 0.86)',
                    lineWidth: 7.4,
                    endpointPhase: 1,
                    chip: {
                        background: 'rgba(239, 246, 255, 0.98)',
                        borderColor: 'rgba(37, 99, 235, 0.24)',
                        textColor: '#1d4ed8'
                    }
                };
            }


            function buildSunflowerStridePaths(seeds, stride) {
                if (!seeds.length || stride <= 0) {
                    return [];
                }
                const centerSeed = seeds[seeds.length - 1];
                const paths = [];
                for (let offset = 1; offset <= stride; offset += 1) {
                    const startIndex = centerSeed.index - offset;
                    if (startIndex < 0) {
                        continue;
                    }
                    const path = [centerSeed];
                    for (let index = startIndex; index >= 0; index -= stride) {
                        path.push(seeds[index]);
                    }
                    if (path.length > 1) {
                        paths.push(path);
                    }
                }
                return paths;
            }

            function buildSunflowerParastichyPaths(seeds, stride, family) {
                return buildSunflowerStridePaths(seeds, stride);
            }

            function getSunflowerPathEndpointAngle(path) {
                const endpoint = path[path.length - 1];
                const fullTurn = Math.PI * 2;
                return ((endpoint.angle % fullTurn) + fullTurn) % fullTurn;
            }

            function filterSunflowerParastichyPaths(paths, config) {
                if (config.endpointPhase == null) {
                    return paths;
                }
                return paths
                    .slice()
                    .sort(function(pathA, pathB) {
                        return getSunflowerPathEndpointAngle(pathA) - getSunflowerPathEndpointAngle(pathB);
                    })
                    .filter(function(path, index) {
                        return index % 2 === config.endpointPhase;
                    });
            }

            function sampleSunflowerParastichyPath(points, samplesPerSegment) {
                if (points.length <= 2) {
                    return points.map(function(point) {
                        return { x: point.x, y: point.y };
                    });
                }
                const samples = [{ x: points[0].x, y: points[0].y }];
                const steps = Math.max(3, samplesPerSegment || 8);
                for (let index = 0; index < points.length - 1; index += 1) {
                    const p0 = points[Math.max(0, index - 1)];
                    const p1 = points[index];
                    const p2 = points[index + 1];
                    const p3 = points[Math.min(points.length - 1, index + 2)];
                    for (let step = 1; step <= steps; step += 1) {
                        const t = step / steps;
                        const t2 = t * t;
                        const t3 = t2 * t;
                        samples.push({
                            x: 0.5 * (
                                (2 * p1.x) +
                                (-p0.x + p2.x) * t +
                                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
                            ),
                            y: 0.5 * (
                                (2 * p1.y) +
                                (-p0.y + p2.y) * t +
                                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
                            )
                        });
                    }
                }
                return samples;
            }

            function drawRevealedSunflowerPath(ctx, points, reveal) {
                if (!points.length || reveal <= 0.001) {
                    return;
                }
                const clampedReveal = clamp(reveal, 0, 1);
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                if (clampedReveal >= 0.999) {
                    for (let index = 1; index < points.length; index += 1) {
                        ctx.lineTo(points[index].x, points[index].y);
                    }
                    ctx.stroke();
                    return;
                }

                let totalLength = 0;
                const segmentLengths = [];
                for (let index = 1; index < points.length; index += 1) {
                    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
                    segmentLengths.push(length);
                    totalLength += length;
                }
                if (totalLength <= 0.0001) {
                    return;
                }

                let remaining = totalLength * clampedReveal;
                for (let index = 1; index < points.length; index += 1) {
                    const startPoint = points[index - 1];
                    const endPoint = points[index];
                    const segmentLength = segmentLengths[index - 1];
                    if (remaining >= segmentLength) {
                        ctx.lineTo(endPoint.x, endPoint.y);
                        remaining -= segmentLength;
                        continue;
                    }
                    if (remaining > 0 && segmentLength > 0.0001) {
                        const localProgress = remaining / segmentLength;
                        ctx.lineTo(
                            lerp(startPoint.x, endPoint.x, localProgress),
                            lerp(startPoint.y, endPoint.y, localProgress)
                        );
                    }
                    break;
                }
                ctx.stroke();
            }

            function drawSunflowerParastichyFamily(ctx, seeds, family, reveal, dpr, options) {
                if (!seeds.length || reveal <= 0.001) {
                    return;
                }
                options = options || {};
                const config = getSunflowerParastichyFamilyConfig(family);
                const paths = filterSunflowerParastichyPaths(
                    buildSunflowerParastichyPaths(seeds, config.stride, family),
                    config
                );
                ctx.save();
                ctx.globalAlpha = options.alphaScale == null ? 1 : options.alphaScale;
                ctx.strokeStyle = config.strokeStyle;
                ctx.lineWidth = config.lineWidth * (options.lineWidthScale == null ? 1 : options.lineWidthScale) * dpr;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                paths.forEach(function(path) {
                    drawRevealedSunflowerPath(ctx, sampleSunflowerParastichyPath(path, 8), reveal);
                });
                ctx.restore();
            }

            function drawSunflowerParastichyStage(ctx, centerX, centerY, outerRadius, dpr) {
                const seedFieldRadius = outerRadius * 0.81;
                const seeds = getSunflowerSeeds(SUNFLOWER_MAX_SEEDS, centerX, centerY, seedFieldRadius);
                const redReveal = getSunflowerSpiralReveal('red');
                const blueReveal = getSunflowerSpiralReveal('blue');
                const redConfig = getSunflowerParastichyFamilyConfig('red');

                drawSunflowerOuterGuide(ctx, centerX, centerY, seedFieldRadius, dpr, 0.22);
                drawSunflowerSeedDots(ctx, seeds, dpr, 0.98);
                if (sunflowerState.redSpiralVisible) {
                    drawSunflowerParastichyFamily(ctx, seeds, 'red', redReveal, dpr, {
                        alphaScale: 0.98,
                        lineWidthScale: 1
                    });
                }
                if (sunflowerState.blueSpiralVisible) {
                    drawSunflowerParastichyFamily(ctx, seeds, 'blue', blueReveal, dpr, {
                        alphaScale: 0.96,
                        lineWidthScale: 1
                    });
                }
                drawSunflowerCenterDot(ctx, centerX, centerY, dpr);

                drawCanvasChip(ctx, 'red spirals', 18 * dpr, 18 * dpr, {
                    dpr: dpr,
                    background: redConfig.chip.background,
                    borderColor: redConfig.chip.borderColor,
                    textColor: redConfig.chip.textColor
                });
            }

            function drawSunflowerPhotoDisk(ctx, centerX, centerY, radius, dpr) {
                ctx.save();
                ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
                ctx.shadowBlur = 20 * dpr;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.clip();
                if (sunflowerState.realImageLoaded && sunflowerState.realImage && sunflowerState.realImage.naturalWidth) {
                    const image = sunflowerState.realImage;
                    const diameter = radius * 2;
                    const scale = Math.max(diameter / image.naturalWidth, diameter / image.naturalHeight);
                    const drawWidth = image.naturalWidth * scale;
                    const drawHeight = image.naturalHeight * scale;
                    ctx.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
                } else {
                    const fallback = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                    fallback.addColorStop(0, 'rgba(196, 219, 104, 0.94)');
                    fallback.addColorStop(0.62, 'rgba(173, 142, 36, 0.9)');
                    fallback.addColorStop(1, 'rgba(119, 92, 22, 0.92)');
                    ctx.fillStyle = fallback;
                    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
                }
                ctx.restore();

                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
                ctx.lineWidth = 4 * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
                ctx.lineWidth = 1.2 * dpr;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            function drawSunflowerPhotoStage(ctx, centerX, centerY, outerRadius, dpr) {
                const photoRadius = outerRadius * 1.02;
                drawSunflowerPhotoDisk(ctx, centerX, centerY, photoRadius, dpr);
                if (!sunflowerState.realImageLoaded) {
                    drawCanvasChip(ctx, 'loading sunflower photo...', centerX, centerY + photoRadius + 18 * dpr, {
                        dpr: dpr,
                        align: 'center',
                        verticalAlign: 'middle'
                    });
                }
            }

            function renderSunflowerFrame() {
                if (!sunflowerCanvas || !sunflowerState.ctx) {
                    return;
                }
                const ctx = sunflowerState.ctx;
                const size = resizeCanvasToDisplaySize(sunflowerCanvas);
                const centerX = size.width * 0.5;
                const centerY = size.height * 0.5;
                const outerRadius = Math.min(size.width, size.height) * 0.36;

                drawSunflowerBackdrop(ctx, size, centerX, centerY, outerRadius);
                if (sunflowerState.outerStep === 0) {
                    drawSunflowerIntroStage(ctx, centerX, centerY, outerRadius, size.dpr);
                } else if (sunflowerState.outerStep === 1) {
                    drawSunflowerPlacementStage(ctx, centerX, centerY, outerRadius, size.dpr);
                } else if (sunflowerState.outerStep === 2) {
                    drawSunflowerParastichyStage(ctx, centerX, centerY, outerRadius, size.dpr);
                } else {
                    drawSunflowerPhotoStage(ctx, centerX, centerY, outerRadius, size.dpr);
                }

                updateStoryStepCopy(
                    sunflowerStepTitle,
                    sunflowerStepCopy,
                    sunflowerStepMetrics,
                    SUNFLOWER_STEP_DESCRIPTORS,
                    sunflowerState.outerStep
                );
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

                if (sunflowerState.introTransition) {
                    sunflowerState.introTransition.elapsedMs += delta;
                    if (sunflowerState.introTransition.elapsedMs >= sunflowerState.introTransition.durationMs) {
                        finishSunflowerIntroTransition();
                    }
                }

                if (sunflowerState.seedTransition) {
                    sunflowerState.seedTransition.elapsedMs += delta;
                    if (sunflowerState.seedTransition.elapsedMs >= sunflowerState.seedTransition.durationMs) {
                        finishSunflowerSeedTransition();
                    }
                } else if (sunflowerState.playing && sunflowerState.outerStep === 1 && !isSunflowerPlacementComplete()) {
                    startSunflowerSeedTransition(sunflowerState.placementAutoDurationMs);
                }

                if (sunflowerState.spiralTransition) {
                    sunflowerState.spiralTransition.elapsedMs += delta;
                    if (sunflowerState.spiralTransition.elapsedMs >= sunflowerState.spiralTransition.durationMs) {
                        finishSunflowerSpiralTransition();
                    }
                } else if (sunflowerState.playing && sunflowerState.outerStep === 2) {
                    const pendingFamily = getPendingSunflowerSpiralFamily();
                    if (pendingFamily) {
                        startSunflowerSpiralAnimation(pendingFamily);
                    } else {
                        sunflowerState.playing = false;
                    }
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
                loadSunflowerRealImage();
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