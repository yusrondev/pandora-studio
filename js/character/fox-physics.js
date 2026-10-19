/* Low-Poly Fox Physics, Locomotion, 3D Collision, and Spring-Arm Camera Occlusion */

const keys = { w: false, a: false, s: false, d: false, shift: false, space: false };

window.addEventListener('keydown', (e) => {
    if (!isPlayMode) return;
    const k = e.key ? e.key.toLowerCase() : '';
    const code = e.code || '';
    if (k === 'w' || k === 'arrowup' || code === 'KeyW') keys.w = true;
    if (k === 's' || k === 'arrowdown' || code === 'KeyS') keys.s = true;
    if (k === 'a' || k === 'arrowleft' || code === 'KeyA') keys.a = true;
    if (k === 'd' || k === 'arrowright' || code === 'KeyD') keys.d = true;
    if (k === 'shift' || code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = true;
    if (k === ' ' || code === 'Space') {
        e.preventDefault();
        keys.space = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (!isPlayMode) return;
    const k = e.key ? e.key.toLowerCase() : '';
    const code = e.code || '';
    if (k === 'w' || k === 'arrowup' || code === 'KeyW') keys.w = false;
    if (k === 's' || k === 'arrowdown' || code === 'KeyS') keys.s = false;
    if (k === 'a' || k === 'arrowleft' || code === 'KeyA') keys.a = false;
    if (k === 'd' || k === 'arrowright' || code === 'KeyD') keys.d = false;
    if (k === 'shift' || code === 'ShiftLeft' || code === 'ShiftRight') keys.shift = false;
    if (k === ' ' || code === 'Space') keys.space = false;
});

// User preferred camera distance (bisa di zoom in/out bebas oleh user)
let userPreferredDist = 4.8;
let currentCamDist = 4.8;
let isCameraOccluded = false;

// Deteksi saat user menahan / menggeser kamera secara manual
let isUserHoldingCamera = false;

window.addEventListener('pointerdown', (e) => {
    if (!isPlayMode) return;
    if (e.target && e.target.tagName === 'CANVAS') {
        isUserHoldingCamera = true;
    }
}, { capture: true });

window.addEventListener('pointerup', () => {
    isUserHoldingCamera = false;
});

window.addEventListener('pointermove', (e) => {
    if (!isPlayMode) return;
    // Jika tidak ada tombol mouse yang ditekan, pastikan status tahan nonaktif
    if (e.buttons === 0 && isUserHoldingCamera) {
        isUserHoldingCamera = false;
    }
});

window.addEventListener('pointercancel', () => {
    isUserHoldingCamera = false;
});

// Listener langsung ke OrbitControls
if (typeof controls !== 'undefined' && controls && controls.addEventListener) {
    controls.addEventListener('start', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            isUserHoldingCamera = true;
        }
    });
    controls.addEventListener('end', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            isUserHoldingCamera = false;
        }
    });
}

window.addEventListener('wheel', (e) => {
    if (!isPlayMode) return;
    userPreferredDist = THREE.MathUtils.clamp(userPreferredDist + e.deltaY * 0.005, 1.8, 18.0);
}, { passive: true });

let currentSpeed = 0;
let currentTurnRate = 0;
let huntBlend = 0;
let velocityY = 0;
let isGrounded = true;
let gaitPhase = 0;
let landingSquash = 0;

let nextEarTwitchTime = 1.2;
let earTwitchL = { x: 0, y: 0, z: 0 };
let earTwitchR = { x: 0, y: 0, z: 0 };
let nextTailFlickTime = 2.2;
let tailFlickAmp = 0;
let footstepCycle = 0;

// Perilaku Hidup Idle Rubah Alami: Melihat sekeliling waspada & menekuk 1 kaki acak
let idleLookTimer = 0;
let idleLookTargetYaw = 0;
let idleLookTargetPitch = 0;
let idleLookTargetRoll = 0;
let idleLookCurrentYaw = 0;
let idleLookCurrentPitch = 0;
let idleLookCurrentRoll = 0;

let idlePawTimer = 2.2;
let idlePawActiveLeg = null; // 'FL', 'FR', 'BL', 'BR'
let idlePawDuration = 2.0;
let idlePawElapsed = 0;

const gravity = -26;
const jumpPower = 9.6;

function updateLegArticulation(leg, phase, intensity, isFront, crouchAmount, isPivotOnly = false) {
    const baseHip = isFront ? 0.26 * crouchAmount : -0.28 * crouchAmount;
    const baseKnee = isFront ? -0.48 * crouchAmount : 0.52 * crouchAmount;
    const basePaw = isFront ? 0.22 * crouchAmount : -0.24 * crouchAmount;

    const strideAmp = isPivotOnly ? 0.25 * intensity : (0.44 + 0.24 * crouchAmount) * intensity;
    const hipSwing = Math.sin(phase) * strideAmp;

    const lift = Math.max(0, -Math.cos(phase));
    const liftMultiplier = isPivotOnly ? 0.45 : (1.0 + 0.25 * crouchAmount);

    const kneeSwing = isFront
        ? -lift * 0.62 * liftMultiplier * intensity
        : lift * 0.58 * liftMultiplier * intensity;

    const pawSwing = isFront
        ? lift * 0.38 * liftMultiplier * intensity - hipSwing * 0.25
        : -lift * 0.35 * liftMultiplier * intensity - hipSwing * 0.25;

    leg.hip.rotation.z = THREE.MathUtils.lerp(leg.hip.rotation.z, baseHip + hipSwing, 0.28);
    leg.knee.rotation.z = THREE.MathUtils.lerp(leg.knee.rotation.z, baseKnee + kneeSwing, 0.28);
    leg.paw.rotation.z = THREE.MathUtils.lerp(leg.paw.rotation.z, basePaw + pawSwing, 0.28);
}

function updateWolfPhysics(dt, elapsed) {
    if (!wolfCharacter) return;
    dt = Math.min(dt, 0.05);

    const {
        root: foxRoot,
        bodyTiltGroup,
        neckJoint,
        headJoint,
        earLJoint,
        earRJoint,
        tailBaseJoint,
        tailMidJoint,
        tailTipJoint,
        legFL,
        legFR,
        legBL,
        legBR,
        BASE_HIP_Y
    } = wolfCharacter;

    const foxScale = foxRoot.scale.x || 0.58;

    // Ambil konfigurasi stats spesifik spesies yang sedang aktif
    const stats = (typeof getCurrentFoxStats === 'function') ? getCurrentFoxStats() : {
        walkSpeed: 4.6,
        runSpeed: 9.6,
        reverseSpeed: 3.0,
        turnRate: 2.6,
        turnAccel: 8.5,
        jumpPower: 9.6
    };

    // Update Sistem Stamina:
    // Berkurang saat dipaksa lari (Shift + W), bertambah saat jalan pelan (W) atau diam
    const isMovingForward = keys.w;
    const isSprintingAllowed = (typeof FoxStaminaState !== 'undefined')
        ? FoxStaminaState.update(dt, keys.shift, isMovingForward)
        : keys.shift;

    const isHunting = isSprintingAllowed;
    huntBlend = THREE.MathUtils.lerp(huntBlend, isHunting ? 1.0 : 0.0, 7.0 * dt);

    const walkSpeed = stats.walkSpeed;
    const huntRunSpeed = stats.runSpeed;
    let targetSpeed = 0;
    if (keys.w) targetSpeed = isHunting ? huntRunSpeed : walkSpeed;
    else if (keys.s) targetSpeed = -stats.reverseSpeed;

    let targetTurn = 0;
    if (keys.a) targetTurn = stats.turnRate;
    if (keys.d) targetTurn = -stats.turnRate;

    currentSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, 8.0 * dt);
    currentTurnRate = THREE.MathUtils.lerp(currentTurnRate, targetTurn, stats.turnAccel * dt);

    const speedNorm = Math.min(1, Math.abs(currentSpeed) / walkSpeed);
    const turnNorm = Math.abs(currentTurnRate) / (stats.turnRate || 2.5);
    const moveActivity = Math.max(speedNorm, turnNorm * 0.95);

    // Update HUD indicator jika ada
    const hudSpeed = document.getElementById('play-stat-speed');
    const hudState = document.getElementById('play-stat-state');
    if (hudSpeed) hudSpeed.innerText = (Math.abs(currentSpeed) * 2.2).toFixed(1) + ' m/s';

    if (hudState) {
        if (!isGrounded) {
            hudState.innerText = "MELOMPAT (AIR)";
            hudState.style.color = "#8be9fd";
        } else if (typeof FoxStaminaState !== 'undefined' && FoxStaminaState.isExhausted) {
            hudState.innerText = "LELAH (KEHABISAN STAMINA)";
            hudState.style.color = "#ff5555";
        } else if (huntBlend > 0.4 && moveActivity > 0.05) {
            hudState.innerText = "HUNT MODE (SPRINT)";
            hudState.style.color = "#ff6e6e";
        } else if (huntBlend > 0.4) {
            hudState.innerText = "HUNT MODE (SIAGA)";
            hudState.style.color = "#ffb86c";
        } else if (Math.abs(currentSpeed) < 0.5 && Math.abs(currentTurnRate) > 0.05) {
            hudState.innerText = "BELOK DI TEMPAT";
            hudState.style.color = "#bd93f9";
        } else if (moveActivity > 0.05) {
            hudState.innerText = "BERJALAN (PULIH)";
            hudState.style.color = "#50fa7b";
        } else {
            hudState.innerText = "IDLE (PULIH CEPAT)";
            hudState.style.color = "#ffd27d";
        }
    }

    foxRoot.rotation.y += currentTurnRate * dt;

    // Hitung vektor arah maju (model fox menghadap -X secara lokal)
    const forward = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), foxRoot.rotation.y);

    if (Math.abs(currentSpeed) > 0.01) {
        const moveStep = forward.clone().multiplyScalar(currentSpeed * dt);
        foxRoot.position.add(moveStep);
        camera.position.add(moveStep);

        // Footstep sound
        footstepCycle += dt * (isHunting ? 14 : 9);
        if (footstepCycle > Math.PI) {
            footstepCycle = 0;
            if (isGrounded && typeof foxSoundFX !== 'undefined' && foxSoundFX.playFootstep) {
                foxSoundFX.playFootstep();
            }
        }
    }

    // ========================================================
    // 1. COLLISION ANATOMI LENGKAP RUBAH TERHADAP POHON & OBJEK 3D
    // ========================================================
    // Titik benturan melingkar sepanjang tubuh rubah (hidung, kepala, leher, badan, panggul)
    const fwdX = forward.x;
    const fwdZ = forward.z;

    const foxCollisionNodes = [
        { offset: 0.92 * foxScale, radius: 0.20 * foxScale }, // Ujung hidung & moncong (proporsional baru)
        { offset: 0.68 * foxScale, radius: 0.28 * foxScale }, // Batok kepala & telinga
        { offset: 0.35 * foxScale, radius: 0.32 * foxScale }, // Leher depan & dada
        { offset: 0.00 * foxScale, radius: 0.32 * foxScale }, // Torso / tengah badan
        { offset: -0.35 * foxScale, radius: 0.30 * foxScale }, // Perut belakang
        { offset: -0.68 * foxScale, radius: 0.28 * foxScale }  // Panggul belakang & paha
    ];

    if (Array.isArray(treesList) && treesList.length > 0) {
        for (let iter = 0; iter < 2; iter++) {
            for (let i = 0; i < treesList.length; i++) {
                const tree = treesList[i];
                if (!tree || !tree.visible) continue;

                let baseRadius = 0.32;
                const tType = (tree.userData && tree.userData.type) ? tree.userData.type.toLowerCase() : '';
                if (tType.includes('birch')) baseRadius = 0.22;
                else if (tType.includes('pine')) baseRadius = 0.20;

                const trunkScale = (tree.userData && tree.userData.trunkGroup) ? tree.userData.trunkGroup.scale.x : 1.0;
                const trunkRadius = baseRadius * trunkScale;

                for (let n = 0; n < foxCollisionNodes.length; n++) {
                    const node = foxCollisionNodes[n];
                    const nodeX = foxRoot.position.x + fwdX * node.offset;
                    const nodeZ = foxRoot.position.z + fwdZ * node.offset;

                    const dx = nodeX - tree.position.x;
                    const dz = nodeZ - tree.position.z;
                    const distSq = dx * dx + dz * dz;
                    const minAllowedDist = trunkRadius + node.radius;

                    if (distSq < minAllowedDist * minAllowedDist) {
                        const dist = Math.sqrt(distSq);
                        if (dist > 0.0001) {
                            const pushDist = minAllowedDist - dist;
                            foxRoot.position.x += (dx / dist) * pushDist;
                            foxRoot.position.z += (dz / dist) * pushDist;
                        } else {
                            foxRoot.position.x += minAllowedDist;
                        }
                    }
                }
            }
        }
    }

    // Batas tepi pulau/map (mencegah rubah jatuh ke ruang hampa)
    const mapHalf = (typeof groundSize !== 'undefined' ? groundSize : 80) / 2;
    foxRoot.position.x = THREE.MathUtils.clamp(foxRoot.position.x, -mapHalf + 1.2, mapHalf - 1.2);
    foxRoot.position.z = THREE.MathUtils.clamp(foxRoot.position.z, -mapHalf + 1.2, mapHalf - 1.2);

    // ========================================================
    // 2. TERRAIN HEIGHT & LOMPATAN
    // ========================================================
    if (keys.space && isGrounded) {
        const currentJumpPower = (stats && stats.jumpPower) ? stats.jumpPower : jumpPower;
        velocityY = currentJumpPower + huntBlend * 1.2;
        isGrounded = false;
        if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playJump) foxSoundFX.playJump();
    }

    const wasGrounded = isGrounded;
    foxRoot.position.y += velocityY * dt;

    const groundH = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(foxRoot.position.x, foxRoot.position.z) : 0;
    if (foxRoot.position.y <= groundH) {
        if (!wasGrounded && velocityY < -3) {
            landingSquash = 0.18;
            if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playLand) foxSoundFX.playLand();
        }
        foxRoot.position.y = groundH;
        velocityY = 0;
        isGrounded = true;
    } else {
        velocityY += gravity * dt;
    }
    updateWolfLocomotionAnimation(dt, elapsed, currentSpeed, currentTurnRate, huntBlend, isGrounded, velocityY);

    // ========================================================
    // 3. FREE ORBIT SPRING-ARM CAMERA DENGAN SMOOTH ANTI-OBSTACLE OCCLUSION
    // ========================================================
    // Titik fokus kamera mengikuti pusat tubuh karakter rubah (ketinggian proporsional sesuai skala)
    const targetCenterY = 0.85;
    const currentTargetPos = new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + targetCenterY, foxRoot.position.z);

    // Modern AAA spring-arm focus target lag:
    // Fokus kamera mengikuti rubah secara halus dengan sedikit lagging inersia natural,
    // sehingga saat rubah melesat atau berbelok, terdapat sensasi tertinggal yang dinamis.
    const posLagSpeed = 8.5;
    const posAlpha = 1.0 - Math.exp(-posLagSpeed * dt);
    controls.target.x = THREE.MathUtils.lerp(controls.target.x, currentTargetPos.x, posAlpha);
    controls.target.z = THREE.MathUtils.lerp(controls.target.z, currentTargetPos.z, posAlpha);
    controls.target.y = THREE.MathUtils.lerp(controls.target.y, currentTargetPos.y, 1.0 - Math.exp(-12.0 * dt));

    controls.update();

    // Vektor garis pandang dari fokus rubah ke kamera
    const camRay = camera.position.clone().sub(controls.target);
    let measuredDist = camRay.length();
    if (measuredDist < 0.001) {
        camRay.set(-3.2, 1.8, 3.8);
        measuredDist = camRay.length();
    }

    // Auto-align kamera selalu berada di belakang fox pada saat berjalan,
    // Mengayun dengan efek tertinggal (camera trailing lag) khas game modern,
    // KECUALI jika user sedang menahan tombol mouse (isUserHoldingCamera)
    const isWalking = (keys.w || keys.s || keys.a || keys.d || Math.abs(currentSpeed) > 0.15);
    const canAutoFollowBehind = isWalking && !isUserHoldingCamera;

    if (canAutoFollowBehind) {
        const hDist = Math.hypot(camRay.x, camRay.z);
        if (hDist > 0.05) {
            const curYaw = Math.atan2(camRay.x, camRay.z);
            // Arah hadap rubah: model lokal menghadap -X, sehingga arah belakang adalah +X secara lokal
            const targetYaw = Math.atan2(Math.cos(foxRoot.rotation.y), -Math.sin(foxRoot.rotation.y));

            let diff = (targetYaw - curYaw) % (Math.PI * 2);
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;

            // Transisi kurva eksponensial halus dengan trailing lag (efek tertinggal khas game AAA modern)
            // Kamera membiarkan karakter berbelok lebih dulu sebelum mengayun anggun mengejar ke belakang
            const baseChase = (huntBlend > 0.4) ? 2.2 : 1.75;
            const angleRatio = Math.abs(diff) / Math.PI; // 0..1
            const chaseSpeed = baseChase + Math.pow(angleRatio, 1.3) * 1.4;
            const smoothT = 1.0 - Math.exp(-chaseSpeed * dt);
            const newYaw = curYaw + diff * smoothT;

            camRay.x = Math.sin(newYaw) * hDist;
            camRay.z = Math.cos(newYaw) * hDist;
        }
    }

    const rayDir = camRay.clone().normalize();
    const rayStart = controls.target;

    const userTargetDist = THREE.MathUtils.clamp(userPreferredDist, 1.8, 18.0);
    let obstacleHitDist = userTargetDist;

    // A. Deteksi Obstacle: Batang dan Ranting Daun Pohon (Line-of-Sight)
    if (Array.isArray(treesList) && treesList.length > 0) {
        for (let i = 0; i < treesList.length; i++) {
            const tree = treesList[i];
            if (!tree || !tree.visible) continue;

            const dx = tree.position.x - rayStart.x;
            const dz = tree.position.z - rayStart.z;
            if (dx * dx + dz * dz > (obstacleHitDist + 6.0) * (obstacleHitDist + 6.0)) continue;

            const treeScale = (tree.userData && tree.userData.trunkGroup) ? tree.userData.trunkGroup.scale.x : 1.0;
            const trunkScaleY = (tree.userData && tree.userData.trunkGroup) ? tree.userData.trunkGroup.scale.y : 1.0;
            const heightOffset = (tree.userData && tree.userData.baseTrunkHeight || 3.5) * (trunkScaleY - 1.0);
            const treeRotY = tree.rotation.y || 0;
            const cosY = Math.cos(treeRotY);
            const sinY = Math.sin(treeRotY);

            // Periksa kanopi daun (foliage clusters)
            let clusters = tree.userData.clusters;
            if (!clusters || !clusters.length) {
                if (tree.userData && tree.userData.isPine) {
                    clusters = [
                        { center: new THREE.Vector3(0, 2.0, 0), radius: 1.6 },
                        { center: new THREE.Vector3(0, 3.4, 0), radius: 1.3 },
                        { center: new THREE.Vector3(0, 4.6, 0), radius: 0.9 }
                    ];
                } else {
                    clusters = [{ center: new THREE.Vector3(0, 3.2, 0), radius: 2.0 }];
                }
            }

            for (let c = 0; c < clusters.length; c++) {
                const cl = clusters[c];
                const lx = cl.center.x * treeScale;
                const ly = cl.center.y + heightOffset;
                const lz = cl.center.z * treeScale;

                const cWorldX = tree.position.x + (lx * cosY + lz * sinY);
                const cWorldY = tree.position.y + ly;
                const cWorldZ = tree.position.z + (-lx * sinY + lz * cosY);
                const clRadius = (cl.radius * treeScale) + 0.35; // Buffer 35cm

                const vx = cWorldX - rayStart.x;
                const vy = cWorldY - rayStart.y;
                const vz = cWorldZ - rayStart.z;
                const t = vx * rayDir.x + vy * rayDir.y + vz * rayDir.z;

                if (t > 0 && (t - clRadius) < obstacleHitDist) {
                    const vLenSq = vx * vx + vy * vy + vz * vz;
                    const perpSq = vLenSq - t * t;
                    if (perpSq < clRadius * clRadius) {
                        const dIn = Math.sqrt(Math.max(0, clRadius * clRadius - perpSq));
                        const hitDist = t - dIn;
                        if (hitDist > 0 && hitDist < obstacleHitDist) {
                            obstacleHitDist = hitDist;
                        }
                    }
                }
            }

            // Periksa batang pohon (trunk capsule)
            const trunkRadius = 0.45 * treeScale + 0.20;
            const trunkTopY = tree.position.y + ((tree.userData && tree.userData.baseTrunkHeight) ? tree.userData.baseTrunkHeight * trunkScaleY : 4.0);
            const rx = tree.position.x - rayStart.x;
            const rz = tree.position.z - rayStart.z;
            const len2D = Math.hypot(rayDir.x, rayDir.z);

            if (len2D > 0.001) {
                const ndx = rayDir.x / len2D;
                const ndz = rayDir.z / len2D;
                const t2D = rx * ndx + rz * ndz;

                if (t2D > 0) {
                    const perpSq2D = (rx * rx + rz * rz) - t2D * t2D;
                    if (perpSq2D < trunkRadius * trunkRadius) {
                        const dIn2D = Math.sqrt(Math.max(0, trunkRadius * trunkRadius - perpSq2D));
                        const tHit2D = t2D - dIn2D;
                        const sHit = tHit2D / len2D;
                        const yAtHit = rayStart.y + rayDir.y * sHit;

                        if (yAtHit >= tree.position.y - 0.2 && yAtHit <= trunkTopY + 0.3) {
                            if (sHit > 0 && sHit < obstacleHitDist) {
                                obstacleHitDist = sHit;
                            }
                        }
                    }
                }
            }
        }
    }

    // B. Deteksi Tebing / Bukit Menghalangi Garis Pandang Kamera
    if (typeof getTerrainHeightFast === 'function') {
        const hillStep = 0.35;
        const maxHillSteps = Math.floor(obstacleHitDist / hillStep);
        for (let sIdx = 2; sIdx <= maxHillSteps; sIdx++) {
            const s = sIdx * hillStep;
            const sx = rayStart.x + rayDir.x * s;
            const sz = rayStart.z + rayDir.z * s;
            const terrainH = getTerrainHeightFast(sx, sz);
            const rayH = rayStart.y + rayDir.y * s;
            if (rayH < terrainH + 0.45) {
                obstacleHitDist = Math.max(1.5, s - 0.30);
                break;
            }
        }
    }

    // C. Perhitungan Target Zoom Spring-Arm Sangat Halus & Pelan
    let targetDist = userTargetDist;
    if (obstacleHitDist < userTargetDist - 0.15) {
        targetDist = Math.min(targetDist, Math.max(1.4, obstacleHitDist - 0.25));
        isCameraOccluded = true;
    } else {
        isCameraOccluded = false;
    }

    // Mendekat dengan sangat smooth dan pelan saat tertutup objek (zoomLerpRate: 3.5),
    // dan mundur kembali dengan sangat lembut & sinematik (zoomLerpRate: 2.8)
    const zoomLerpRate = (targetDist < currentCamDist) ? 3.5 : 2.8;
    currentCamDist += (targetDist - currentCamDist) * Math.min(1.0, zoomLerpRate * dt);

    camera.position.copy(controls.target).addScaledVector(rayDir, currentCamDist);

    // Mencegah kamera tenggelam ke bawah tanah
    if (typeof getTerrainHeightFast === 'function') {
        const groundFloor = getTerrainHeightFast(camera.position.x, camera.position.z) + 0.50;
        if (camera.position.y < groundFloor) {
            camera.position.y = groundFloor;
        }
    }

    camera.lookAt(controls.target);
}

// ========================================================
// 4. SISTEM KINEMATIKA & ARTIKULASI LOCOMOTION RUBAH (REUSABLE)
// Digunakan bersama oleh mode Play Gameplay dan Cinematic Camera Editor
// ========================================================
function updateWolfLocomotionAnimation(dt, elapsed, speed, turnRate, huntRatio = 0, grounded = true, vertVel = 0) {
    if (!wolfCharacter) return;

    const {
        root: foxRoot,
        bodyTiltGroup,
        neckJoint,
        headJoint,
        earLJoint,
        earRJoint,
        tailBaseJoint,
        tailMidJoint,
        tailTipJoint,
        legFL,
        legFR,
        legBL,
        legBR,
        BASE_HIP_Y
    } = wolfCharacter;

    const safeBankRoll = -turnRate * 0.018 * Math.min(1, Math.abs(speed) / 4.0);
    bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, safeBankRoll, 8 * dt);

    const targetNeckYaw = turnRate * 0.14;
    const targetHeadYaw = turnRate * 0.18;
    neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, 8 * dt);
    headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, 8 * dt);

    // Kedutan telinga alami
    if (elapsed > nextEarTwitchTime) {
        nextEarTwitchTime = elapsed + 1.2 + Math.random() * 2.8;
        const whichEar = Math.random();
        if (whichEar < 0.4) {
            earTwitchL = { x: (Math.random() - 0.5) * 0.25, y: 0.35 + Math.random() * 0.25, z: -0.18 };
        } else if (whichEar < 0.8) {
            earTwitchR = { x: (Math.random() - 0.5) * 0.25, y: -0.35 - Math.random() * 0.25, z: -0.18 };
        } else {
            earTwitchL = { x: 0.12, y: 0.22, z: 0.12 };
            earTwitchR = { x: -0.12, y: -0.22, z: 0.12 };
        }
    }
    earTwitchL.x = THREE.MathUtils.lerp(earTwitchL.x, 0, 7 * dt);
    earTwitchL.y = THREE.MathUtils.lerp(earTwitchL.y, 0, 7 * dt);
    earTwitchL.z = THREE.MathUtils.lerp(earTwitchL.z, 0, 7 * dt);
    earTwitchR.x = THREE.MathUtils.lerp(earTwitchR.x, 0, 7 * dt);
    earTwitchR.y = THREE.MathUtils.lerp(earTwitchR.y, 0, 7 * dt);
    earTwitchR.z = THREE.MathUtils.lerp(earTwitchR.z, 0, 7 * dt);

    const huntEarFold = -0.50 * huntRatio;
    earLJoint.rotation.set(
        earTwitchL.x + huntRatio * 0.15,
        earTwitchL.y + turnRate * 0.08,
        huntEarFold + earTwitchL.z
    );
    earRJoint.rotation.set(
        earTwitchR.x - huntRatio * 0.15,
        earTwitchR.y + turnRate * 0.08,
        huntEarFold + earTwitchR.z
    );

    if (elapsed > nextTailFlickTime) {
        nextTailFlickTime = elapsed + 2.0 + Math.random() * 3.5;
        tailFlickAmp = (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.22);
    }
    tailFlickAmp = THREE.MathUtils.lerp(tailFlickAmp, 0, 5.5 * dt);

    const huntHipDrop = 0.22 * huntRatio;
    const huntNeckPitch = 0.48 * huntRatio;
    const huntHeadPitch = -0.42 * huntRatio;

    if (!grounded) {
        const airPitch = THREE.MathUtils.clamp(-vertVel * 0.04, -0.35, 0.35);
        bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, airPitch, 10 * dt);
        bodyTiltGroup.position.y = THREE.MathUtils.lerp(bodyTiltGroup.position.y, BASE_HIP_Y, 10 * dt);

        neckJoint.rotation.z = THREE.MathUtils.lerp(neckJoint.rotation.z, huntNeckPitch * 0.5 - airPitch * 0.4, 8 * dt);
        headJoint.rotation.z = THREE.MathUtils.lerp(headJoint.rotation.z, huntHeadPitch * 0.5 - airPitch * 0.3, 8 * dt);

        if (vertVel > 0) {
            legFL.hip.rotation.z = THREE.MathUtils.lerp(legFL.hip.rotation.z, -0.55, 10 * dt);
            legFL.knee.rotation.z = THREE.MathUtils.lerp(legFL.knee.rotation.z, -0.75, 10 * dt);
            legFR.hip.rotation.z = THREE.MathUtils.lerp(legFR.hip.rotation.z, -0.45, 10 * dt);
            legFR.knee.rotation.z = THREE.MathUtils.lerp(legFR.knee.rotation.z, -0.65, 10 * dt);

            legBL.hip.rotation.z = THREE.MathUtils.lerp(legBL.hip.rotation.z, 0.65, 10 * dt);
            legBL.knee.rotation.z = THREE.MathUtils.lerp(legBL.knee.rotation.z, -0.25, 10 * dt);
            legBR.hip.rotation.z = THREE.MathUtils.lerp(legBR.hip.rotation.z, 0.55, 10 * dt);
            legBR.knee.rotation.z = THREE.MathUtils.lerp(legBR.knee.rotation.z, -0.20, 10 * dt);
        } else {
            legFL.hip.rotation.z = THREE.MathUtils.lerp(legFL.hip.rotation.z, -0.45, 10 * dt);
            legFL.knee.rotation.z = THREE.MathUtils.lerp(legFL.knee.rotation.z, -0.08, 10 * dt);
            legFR.hip.rotation.z = THREE.MathUtils.lerp(legFR.hip.rotation.z, -0.35, 10 * dt);
            legFR.knee.rotation.z = THREE.MathUtils.lerp(legFR.knee.rotation.z, -0.08, 10 * dt);

            legBL.hip.rotation.z = THREE.MathUtils.lerp(legBL.hip.rotation.z, -0.18, 10 * dt);
            legBL.knee.rotation.z = THREE.MathUtils.lerp(legBL.knee.rotation.z, 0.48, 10 * dt);
            legBR.hip.rotation.z = THREE.MathUtils.lerp(legBR.hip.rotation.z, -0.12, 10 * dt);
            legBR.knee.rotation.z = THREE.MathUtils.lerp(legBR.knee.rotation.z, 0.42, 10 * dt);
        }

        tailBaseJoint.rotation.z = THREE.MathUtils.lerp(tailBaseJoint.rotation.z, 0.38 - airPitch * 0.5, 8 * dt);
        tailMidJoint.rotation.z = THREE.MathUtils.lerp(tailMidJoint.rotation.z, 0.22, 8 * dt);
        tailTipJoint.rotation.z = THREE.MathUtils.lerp(tailTipJoint.rotation.z, 0.15, 8 * dt);

    } else if (Math.abs(speed) > 0.05 || Math.abs(turnRate) > 0.05) {
        const isPivotOnly = Math.abs(speed) < 0.5 && Math.abs(turnRate) > 0.05;

        const dirSign = isPivotOnly
            ? (turnRate >= 0 ? 1 : -1)
            : (speed >= -0.1 ? 1 : -1);

        const freq = isPivotOnly ? 4.5 : 9.2 + Math.abs(speed) * 0.95;
        gaitPhase += dt * freq * dirSign;

        const moveActivity = Math.min(1.0, Math.max(Math.abs(speed) / 4.6, Math.abs(turnRate) / 2.5));

        const bob = isPivotOnly ? Math.abs(Math.sin(gaitPhase)) * 0.015 : Math.abs(Math.sin(gaitPhase)) * (0.055 + 0.045 * huntRatio) * moveActivity;
        const huntForwardLean = 0.07 * huntRatio;
        const stridePitch = isPivotOnly ? huntForwardLean : huntForwardLean + Math.cos(gaitPhase * (1 + huntRatio)) * 0.04 * moveActivity;

        bodyTiltGroup.position.y = THREE.MathUtils.lerp(
            bodyTiltGroup.position.y,
            BASE_HIP_Y - huntHipDrop + bob - landingSquash,
            14 * dt
        );
        bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, stridePitch, 12 * dt);

        const headBob = isPivotOnly ? 0 : Math.sin(gaitPhase * 2 - 0.5) * 0.04 * moveActivity;
        neckJoint.rotation.z = THREE.MathUtils.lerp(neckJoint.rotation.z, huntNeckPitch + headBob, 10 * dt);
        headJoint.rotation.z = THREE.MathUtils.lerp(headJoint.rotation.z, huntHeadPitch - headBob * 0.85, 10 * dt);

        const phaseFL = gaitPhase;
        const phaseFR = gaitPhase + THREE.MathUtils.lerp(Math.PI, 0.55, huntRatio);
        const phaseBR = gaitPhase + THREE.MathUtils.lerp(0.35, Math.PI, huntRatio);
        const phaseBL = gaitPhase + THREE.MathUtils.lerp(Math.PI + 0.35, Math.PI + 0.55, huntRatio);

        updateLegArticulation(legFL, phaseFL, moveActivity, true, huntRatio, isPivotOnly);
        updateLegArticulation(legFR, phaseFR, moveActivity, true, huntRatio, isPivotOnly);
        updateLegArticulation(legBR, phaseBR, moveActivity, false, huntRatio, isPivotOnly);
        updateLegArticulation(legBL, phaseBL, moveActivity, false, huntRatio, isPivotOnly);

        const tailBaseLift = 0.14 + 0.36 * huntRatio;
        const tailMidLift = 0.10 + 0.22 * huntRatio;
        tailBaseJoint.rotation.z = THREE.MathUtils.lerp(tailBaseJoint.rotation.z, tailBaseLift + Math.sin(gaitPhase) * 0.06, 8 * dt);
        tailMidJoint.rotation.z = THREE.MathUtils.lerp(tailMidJoint.rotation.z, tailMidLift + Math.sin(gaitPhase - 0.7) * 0.08, 8 * dt);
        tailTipJoint.rotation.z = THREE.MathUtils.lerp(tailTipJoint.rotation.z, 0.10 + Math.sin(gaitPhase - 1.4) * 0.08, 8 * dt);

        const tailSteer = -turnRate * 0.16;
        tailBaseJoint.rotation.y = THREE.MathUtils.lerp(tailBaseJoint.rotation.y, tailSteer + Math.cos(gaitPhase) * 0.10 * moveActivity + tailFlickAmp * 0.4, 10 * dt);
        tailMidJoint.rotation.y = THREE.MathUtils.lerp(tailMidJoint.rotation.y, tailSteer * 0.9 + Math.cos(gaitPhase - 0.7) * 0.14 * moveActivity + tailFlickAmp * 0.7, 10 * dt);
        tailTipJoint.rotation.y = THREE.MathUtils.lerp(tailTipJoint.rotation.y, tailSteer * 0.7 + Math.cos(gaitPhase - 1.4) * 0.16 * moveActivity + tailFlickAmp, 10 * dt);

    } else {
        // --- PERILAKU HIDUP ALAMI RUBAH (IDLE LOOK-AROUND & PAW FIDGETING) ---
        // A. KEPALA MENOLEH WASPADA KE KIRI / KANAN & MENGAMATI ALAM
        idleLookTimer -= dt;
        if (idleLookTimer <= 0) {
            idleLookTimer = 2.0 + Math.random() * 2.8;
            const rLook = Math.random();
            if (rLook < 0.35) {
                idleLookTargetYaw = 0.40 + Math.random() * 0.30;
                idleLookTargetPitch = (Math.random() - 0.45) * 0.16;
                idleLookTargetRoll = 0.08 + Math.random() * 0.08;
            } else if (rLook < 0.70) {
                idleLookTargetYaw = -0.40 - Math.random() * 0.30;
                idleLookTargetPitch = (Math.random() - 0.45) * 0.16;
                idleLookTargetRoll = -0.08 - Math.random() * 0.08;
            } else if (rLook < 0.88) {
                idleLookTargetYaw = 0;
                idleLookTargetPitch = 0;
                idleLookTargetRoll = 0;
            } else {
                idleLookTargetYaw = (Math.random() - 0.5) * 0.14;
                idleLookTargetPitch = -0.22;
                idleLookTargetRoll = 0;
            }
        }

        const lookSpeed = (Math.abs(idleLookTargetYaw) > 0.05) ? 6.5 : 4.5;
        idleLookCurrentYaw = THREE.MathUtils.lerp(idleLookCurrentYaw, idleLookTargetYaw * (1 - huntRatio), lookSpeed * dt);
        idleLookCurrentPitch = THREE.MathUtils.lerp(idleLookCurrentPitch, idleLookTargetPitch * (1 - huntRatio), lookSpeed * dt);
        idleLookCurrentRoll = THREE.MathUtils.lerp(idleLookCurrentRoll, idleLookTargetRoll * (1 - huntRatio), lookSpeed * dt);

        const breath = Math.sin(elapsed * 2.3) * 0.014;
        bodyTiltGroup.position.y = THREE.MathUtils.lerp(
            bodyTiltGroup.position.y,
            BASE_HIP_Y - huntHipDrop + breath - landingSquash,
            8 * dt
        );
        bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(
            bodyTiltGroup.rotation.z,
            0.06 * huntRatio + landingSquash * 0.18,
            8 * dt
        );

        neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw + idleLookCurrentYaw * 0.42, 8 * dt);
        headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw + idleLookCurrentYaw * 0.65, 9 * dt);

        neckJoint.rotation.z = THREE.MathUtils.lerp(neckJoint.rotation.z, huntNeckPitch + idleLookCurrentPitch * 0.4 + Math.sin(elapsed * 2.3 - 0.5) * 0.02, 7 * dt);
        headJoint.rotation.z = THREE.MathUtils.lerp(headJoint.rotation.z, huntHeadPitch + idleLookCurrentPitch * 0.65 - Math.sin(elapsed * 2.3 - 0.5) * 0.015, 8 * dt);
        headJoint.rotation.x = THREE.MathUtils.lerp(headJoint.rotation.x, idleLookCurrentRoll, 8 * dt);

        // B. PAW FIDGETING
        if (!idlePawActiveLeg) {
            idlePawTimer -= dt;
            if (idlePawTimer <= 0) {
                const rLeg = Math.random();
                if (rLeg < 0.45) idlePawActiveLeg = 'FL';
                else if (rLeg < 0.82) idlePawActiveLeg = 'FR';
                else if (rLeg < 0.92) idlePawActiveLeg = 'BL';
                else idlePawActiveLeg = 'BR';

                idlePawDuration = 1.8 + Math.random() * 1.0;
                idlePawElapsed = 0;
            }
        }

        let pawLiftFL = 0, pawLiftFR = 0, pawLiftBL = 0, pawLiftBR = 0;
        let weightShiftRoll = 0;

        if (idlePawActiveLeg) {
            idlePawElapsed += dt;
            const progress = idlePawElapsed / idlePawDuration;
            if (progress >= 1.0) {
                idlePawActiveLeg = null;
                idlePawTimer = 3.2 + Math.random() * 4.5;
            } else {
                const liftAmt = Math.pow(Math.sin(progress * Math.PI), 0.75);
                if (idlePawActiveLeg === 'FL') {
                    pawLiftFL = liftAmt;
                    weightShiftRoll = -0.022 * liftAmt;
                } else if (idlePawActiveLeg === 'FR') {
                    pawLiftFR = liftAmt;
                    weightShiftRoll = 0.022 * liftAmt;
                } else if (idlePawActiveLeg === 'BL') {
                    pawLiftBL = liftAmt;
                    weightShiftRoll = -0.018 * liftAmt;
                } else if (idlePawActiveLeg === 'BR') {
                    pawLiftBR = liftAmt;
                    weightShiftRoll = 0.018 * liftAmt;
                }
            }
        }

        bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, safeBankRoll + weightShiftRoll, 6 * dt);

        const baseHipFL = 0.26 * huntRatio, baseKneeFL = -0.48 * huntRatio, basePawFL = 0.22 * huntRatio;
        legFL.hip.rotation.z = THREE.MathUtils.lerp(legFL.hip.rotation.z, baseHipFL - pawLiftFL * 0.16, 7 * dt);
        legFL.knee.rotation.z = THREE.MathUtils.lerp(legFL.knee.rotation.z, baseKneeFL - pawLiftFL * 0.72, 7 * dt);
        legFL.paw.rotation.z = THREE.MathUtils.lerp(legFL.paw.rotation.z, basePawFL + pawLiftFL * 0.55, 7 * dt);

        const baseHipFR = 0.26 * huntRatio, baseKneeFR = -0.48 * huntRatio, basePawFR = 0.22 * huntRatio;
        legFR.hip.rotation.z = THREE.MathUtils.lerp(legFR.hip.rotation.z, baseHipFR - pawLiftFR * 0.16, 7 * dt);
        legFR.knee.rotation.z = THREE.MathUtils.lerp(legFR.knee.rotation.z, baseKneeFR - pawLiftFR * 0.72, 7 * dt);
        legFR.paw.rotation.z = THREE.MathUtils.lerp(legFR.paw.rotation.z, basePawFR + pawLiftFR * 0.55, 7 * dt);

        const baseHipBL = -0.28 * huntRatio, baseKneeBL = 0.52 * huntRatio, basePawBL = -0.24 * huntRatio;
        legBL.hip.rotation.z = THREE.MathUtils.lerp(legBL.hip.rotation.z, baseHipBL + pawLiftBL * 0.28, 7 * dt);
        legBL.knee.rotation.z = THREE.MathUtils.lerp(legBL.knee.rotation.z, baseKneeBL + pawLiftBL * 0.38, 7 * dt);
        legBL.paw.rotation.z = THREE.MathUtils.lerp(legBL.paw.rotation.z, basePawBL - pawLiftBL * 0.35, 7 * dt);

        const baseHipBR = -0.28 * huntRatio, baseKneeBR = 0.52 * huntRatio, basePawBR = -0.24 * huntRatio;
        legBR.hip.rotation.z = THREE.MathUtils.lerp(legBR.hip.rotation.z, baseHipBR + pawLiftBR * 0.28, 7 * dt);
        legBR.knee.rotation.z = THREE.MathUtils.lerp(legBR.knee.rotation.z, baseKneeBR + pawLiftBR * 0.38, 7 * dt);
        legBR.paw.rotation.z = THREE.MathUtils.lerp(legBR.paw.rotation.z, basePawBR - pawLiftBR * 0.35, 7 * dt);

        const idleTailLift = 0.34 * huntRatio;
        tailBaseJoint.rotation.z = THREE.MathUtils.lerp(tailBaseJoint.rotation.z, idleTailLift + Math.sin(elapsed * 1.8) * 0.03, 6 * dt);
        tailMidJoint.rotation.z = THREE.MathUtils.lerp(tailMidJoint.rotation.z, idleTailLift * 0.6 + Math.sin(elapsed * 1.8 - 0.6) * 0.04, 6 * dt);
        tailTipJoint.rotation.z = THREE.MathUtils.lerp(tailTipJoint.rotation.z, 0.08 * huntRatio, 6 * dt);

        const baseWave = Math.sin(elapsed * 1.6) * 0.055;
        tailBaseJoint.rotation.y = THREE.MathUtils.lerp(tailBaseJoint.rotation.y, baseWave + tailFlickAmp * 0.45, 7 * dt);
        tailMidJoint.rotation.y = THREE.MathUtils.lerp(tailMidJoint.rotation.y, Math.sin(elapsed * 1.6 - 0.7) * 0.085 + tailFlickAmp * 0.85, 7 * dt);
        tailTipJoint.rotation.y = THREE.MathUtils.lerp(tailTipJoint.rotation.y, Math.sin(elapsed * 1.6 - 1.4) * 0.11 + tailFlickAmp * 1.2, 7 * dt);
    }
}
window.updateWolfLocomotionAnimation = updateWolfLocomotionAnimation;
window.updateLegArticulation = updateLegArticulation;
