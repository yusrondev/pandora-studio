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

// ========================================================
// SISTEM VISUAL EAGLE VISION OUTLINE & SILUET (ASSASSIN'S CREED)
// ========================================================
let eagleVisionMaterial = null;
let eagleVisionMeshList = [];
let currentEagleVisionAlpha = 0.0;
let lastEagleVisionRoot = null;
const _occlusionRaycaster = new THREE.Raycaster();
const _occlusionRayDir = new THREE.Vector3();

function getOrCreateEagleVisionMaterial() {
    if (!eagleVisionMaterial) {
        eagleVisionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xff2238) },    // Assassin's Creed crimson-red base
                uRimColor: { value: new THREE.Color(0xffaa33) }, // Intense orange-amber edge glow
                uTime: { value: 0.0 },
                uAlpha: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    // Ekspansi normal mikro untuk outline siluet luar yang presisi & tajam
                    vec3 expanded = position + normal * 0.012;
                    vec4 mvPosition = modelViewMatrix * vec4(expanded, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform vec3 uRimColor;
                uniform float uTime;
                uniform float uAlpha;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    if (uAlpha <= 0.001) discard;
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);
                    
                    // Fresnel rim highlight (Eagle Vision edge radiance khas Assassin's Creed)
                    float NdotV = max(0.0, dot(normal, viewDir));
                    float rim = 1.0 - NdotV;
                    float rimFactor = pow(rim, 2.0);

                    // Scanline / Holographic subtle pulse
                    float pulse = 0.88 + 0.12 * sin(uTime * 4.5);
                    
                    vec3 col = mix(uColor, uRimColor, rimFactor * 0.90) * pulse;
                    // Siluet dalam transparan elegan, tepi luar berpendar terang
                    float alpha = (0.42 + 0.58 * rimFactor) * uAlpha;
                    
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            depthTest: false,  // Tembus rintangan 3D (X-Ray Eagle Vision)
            depthWrite: false, // Tidak merusak z-buffer scene
            side: THREE.DoubleSide
        });
    }
    return eagleVisionMaterial;
}

function ensureFoxEagleVisionSystem(wolfChar) {
    if (!wolfChar || !wolfChar.root) return;
    const root = wolfChar.root;

    const mat = getOrCreateEagleVisionMaterial();

    // Jika model rubah berganti (spesies baru atau respawn)
    if (lastEagleVisionRoot !== root || !root.userData.hasEagleVisionTwins) {
        eagleVisionMeshList = [];
        const meshesToTwin = [];

        root.traverse((child) => {
            if (child.isMesh && !child.userData.isEagleVisionTwin) {
                meshesToTwin.push(child);
            }
        });

        for (let i = 0; i < meshesToTwin.length; i++) {
            const origMesh = meshesToTwin[i];
            const twin = new THREE.Mesh(origMesh.geometry, mat);
            twin.name = 'eagleVisionTwin_' + i;
            twin.userData.isEagleVisionTwin = true;
            twin.renderOrder = 999999;
            twin.position.copy(origMesh.position);
            twin.rotation.copy(origMesh.rotation);
            twin.scale.copy(origMesh.scale);
            twin.visible = false;
            origMesh.parent.add(twin);
            eagleVisionMeshList.push(twin);
        }

        root.userData.hasEagleVisionTwins = true;
        lastEagleVisionRoot = root;
    }
}

function updateFoxEagleVisionVisibility(isOccluded, dt, elapsed) {
    if (!eagleVisionMaterial) return;

    const targetAlpha = isOccluded ? 1.0 : 0.0;
    const fadeRate = isOccluded ? 10.0 : 8.0;
    currentEagleVisionAlpha += (targetAlpha - currentEagleVisionAlpha) * Math.min(1.0, fadeRate * dt);

    eagleVisionMaterial.uniforms.uAlpha.value = currentEagleVisionAlpha;
    eagleVisionMaterial.uniforms.uTime.value = elapsed;

    const shouldShow = (currentEagleVisionAlpha > 0.01);
    for (let i = 0; i < eagleVisionMeshList.length; i++) {
        const twin = eagleVisionMeshList[i];
        if (twin && twin.visible !== shouldShow) {
            twin.visible = shouldShow;
        }
    }
}

// Deteksi saat user menahan / menggeser kamera secara manual (Multi-Touch & Mouse)
let isUserHoldingCamera = false;
let userHoldingCameraTimer = 0;
let activeCameraTouches = new Map();
let lastPinchDistance = null;

// Multi-Touch listener pada Canvas (Kamera bebas digerakkan bersamaan dengan Analog Joystick)
window.addEventListener('touchstart', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const inJoystick = el && el.closest && el.closest('#mobile-joystick-zone');
        const inActionBtn = el && el.closest && el.closest('.mobile-action-buttons');
        const inToolbar = el && el.closest && el.closest('#top-toolbar');
        const inSpecies = el && el.closest && el.closest('#fox-species-bar');

        if (!inJoystick && !inActionBtn && !inToolbar && !inSpecies) {
            activeCameraTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            isUserHoldingCamera = true;
            userHoldingCameraTimer = 0.35;
        }
    }

    if (activeCameraTouches.size >= 2) {
        const touches = Array.from(activeCameraTouches.values());
        lastPinchDistance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
    } else {
        lastPinchDistance = null;
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    let cameraTouchMoved = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (activeCameraTouches.has(touch.identifier)) {
            activeCameraTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            cameraTouchMoved = true;
        }
    }

    if (cameraTouchMoved) {
        isUserHoldingCamera = true;
        userHoldingCameraTimer = 0.35;
    }

    // Cubit layar (Pinch-to-zoom) pada smartphone
    if (activeCameraTouches.size >= 2) {
        const touches = Array.from(activeCameraTouches.values());
        const currentPinch = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        if (lastPinchDistance !== null && lastPinchDistance > 5 && currentPinch > 5) {
            const pinchRatio = currentPinch / lastPinchDistance;
            const zoomDelta = (1.0 - pinchRatio) * userPreferredDist * 1.5;
            userPreferredDist = THREE.MathUtils.clamp(userPreferredDist + zoomDelta, 3.0, 18.0);
        }
        lastPinchDistance = currentPinch;
    }
}, { passive: true });

function removeCameraTouches(e) {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        activeCameraTouches.delete(e.changedTouches[i].identifier);
    }
    if (activeCameraTouches.size < 2) {
        lastPinchDistance = null;
    }
    if (activeCameraTouches.size === 0) {
        userHoldingCameraTimer = 0.35;
    }
}

window.addEventListener('touchend', removeCameraTouches, { passive: true });
window.addEventListener('touchcancel', removeCameraTouches, { passive: true });

// Mouse fallback untuk desktop
window.addEventListener('pointerdown', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    if (e.pointerType === 'mouse' && e.target && e.target.tagName === 'CANVAS') {
        isUserHoldingCamera = true;
        userHoldingCameraTimer = 0.35;
    }
}, { capture: true });

window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') {
        userHoldingCameraTimer = 0.35;
    }
});

window.addEventListener('pointermove', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    if (e.pointerType === 'mouse') {
        if (e.buttons > 0) {
            isUserHoldingCamera = true;
            userHoldingCameraTimer = 0.35;
        }
    }
});

// Listener langsung ke OrbitControls
if (typeof controls !== 'undefined' && controls && controls.addEventListener) {
    controls.addEventListener('start', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            isUserHoldingCamera = true;
            userHoldingCameraTimer = 0.35;
        }
    });
    controls.addEventListener('end', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            userHoldingCameraTimer = 0.35;
        }
    });
}

window.addEventListener('wheel', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    userPreferredDist = THREE.MathUtils.clamp(userPreferredDist + e.deltaY * 0.005, 3.0, 18.0);
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

    const analogFwd = (typeof mobileJoystickForward !== 'undefined') ? mobileJoystickForward : 0;
    const analogTurn = (typeof mobileJoystickTurn !== 'undefined') ? mobileJoystickTurn : 0;

    // Update Sistem Stamina:
    // Berkurang saat dipaksa lari (Shift + W / Joystick), bertambah saat jalan pelan atau diam
    const isMovingForward = keys.w || (analogFwd > 0.15);
    const isSprintingAllowed = (typeof FoxStaminaState !== 'undefined')
        ? FoxStaminaState.update(dt, keys.shift, isMovingForward)
        : keys.shift;

    const isHunting = isSprintingAllowed;
    huntBlend = THREE.MathUtils.lerp(huntBlend, isHunting ? 1.0 : 0.0, 7.0 * dt);

    const walkSpeed = stats.walkSpeed;
    const huntRunSpeed = stats.runSpeed;
    let targetSpeed = 0;
    if (Math.abs(analogFwd) > 0.05) {
        targetSpeed = (analogFwd > 0)
            ? (analogFwd * (isHunting ? huntRunSpeed : walkSpeed))
            : (analogFwd * stats.reverseSpeed);
    } else if (keys.w) {
        targetSpeed = isHunting ? huntRunSpeed : walkSpeed;
    } else if (keys.s) {
        targetSpeed = -stats.reverseSpeed;
    }

    let targetTurn = 0;
    if (Math.abs(analogTurn) > 0.05) {
        targetTurn = -analogTurn * stats.turnRate;
    } else {
        if (keys.a) targetTurn = stats.turnRate;
        if (keys.d) targetTurn = -stats.turnRate;
    }

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

    // 1B. COLLISION ANATOMI PRESISI TERHADAP BEBATUAN (DENGAN KEMAMPUAN MENAIKI BEBATUAN)
    const activeRocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList) && rocksList.length > 0)
        ? rocksList
        : ((typeof rocksGroup !== 'undefined' && rocksGroup.children) ? rocksGroup.children : (window.rocksList || []));
    let rockGroundSupportY = -999;

    if (activeRocks.length > 0) {
        // Cek apakah rubah bisa menaiki / berdiri / berjalan di atas permukaan batu
        for (let r = 0; r < activeRocks.length; r++) {
            const rock = activeRocks[r];
            if (!rock || !rock.visible) continue;

            let rData = rock.userData;
            if (!rData || !rData.radiusMax) {
                rock.updateMatrixWorld(true);
                const bb = new THREE.Box3().setFromObject(rock);
                const rx = Math.max(0.15, (bb.max.x - bb.min.x) * 0.5 * 1.04);
                const rz = Math.max(0.15, (bb.max.z - bb.min.z) * 0.5 * 1.04);
                if (!rock.userData) rock.userData = {};
                rData = rock.userData;
                rData.isRock = true;
                rData.centerX = (bb.min.x + bb.max.x) * 0.5;
                rData.centerZ = (bb.min.z + bb.max.z) * 0.5;
                rData.radiusX = rx;
                rData.radiusZ = rz;
                rData.radiusMax = Math.max(rx, rz) * 1.25;
                rData.topY = bb.max.y;
                rData.bottomY = bb.min.y;
            }

            const cX = rData.centerX !== undefined ? rData.centerX : rock.position.x;
            const cZ = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
            const rdx = foxRoot.position.x - cX;
            const rdz = foxRoot.position.z - cZ;
            const maxR = (rData.radiusMax || 1.8) + 0.6;
            if (rdx * rdx + rdz * rdz > maxR * maxR) continue;

            const rx = Math.max(0.15, rData.radiusX || (rock.scale.x * 1.04));
            const rz = Math.max(0.15, rData.radiusZ || (rock.scale.z * 1.04));
            const normSq = (rdx / rx) * (rdx / rx) + (rdz / rz) * (rdz / rz);

            if (normSq <= 1.15) {
                const rTopY = rData.topY !== undefined ? rData.topY : (rock.position.y + (rData.heightScale || rock.scale.y) * 0.90);
                const rBottomY = rData.bottomY !== undefined ? rData.bottomY : (rock.position.y - (rData.heightScale || rock.scale.y) * 0.95);
                const dome = Math.sqrt(Math.max(0, 1.0 - Math.min(1.0, normSq)));
                const surfaceY = rBottomY + (rTopY - rBottomY) * (0.22 + 0.78 * dome);

                // Step-up height: Rubah bisa menaiki bebatuan yang wajar / landai setinggi s/d 0.75m
                const maxStepUp = (huntBlend > 0.4) ? 0.90 : 0.75;
                const heightDiff = surfaceY - foxRoot.position.y;

                if (heightDiff <= maxStepUp && surfaceY >= rBottomY - 0.2) {
                    if (surfaceY > rockGroundSupportY) {
                        rockGroundSupportY = surfaceY;
                    }
                }
            }
        }

        // Horizontal Solid Collision:
        // HANYA mendorong rubah menjauh jika permukaan batu di titik kontak itu TERLALU TINGGI / MENUKIK TAJAM (cliff tebing tegak)
        // Jika batu landai / slate / ketinggiannya masih wajar terjangkau kaki rubah (heightDiff <= maxStepUp), rubah dibiarkan menaikinya!
        const allCollisionNodes = [
            ...foxCollisionNodes,
            { offset: 0.0, radius: 0.36 * foxScale } // Simpul pusat rubah untuk proteksi absolut
        ];

        for (let iter = 0; iter < 3; iter++) {
            for (let r = 0; r < activeRocks.length; r++) {
                const rock = activeRocks[r];
                if (!rock || !rock.visible) continue;

                const rData = rock.userData || {};
                const cX = rData.centerX !== undefined ? rData.centerX : rock.position.x;
                const cZ = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
                const rx = Math.max(0.15, rData.radiusX || (rock.scale.x * 1.04));
                const rz = Math.max(0.15, rData.radiusZ || (rock.scale.z * 1.04));
                const maxR = (rData.radiusMax || Math.max(rx, rz) * 1.25) + 1.0;
                const rockTopY = rData.topY !== undefined ? rData.topY : (rock.position.y + (rData.heightScale || rock.scale.y) * 0.95);
                const rockBottomY = rData.bottomY !== undefined ? rData.bottomY : (rock.position.y - (rData.heightScale || rock.scale.y) * 0.95);

                for (let n = 0; n < allCollisionNodes.length; n++) {
                    const node = allCollisionNodes[n];
                    const nodeX = foxRoot.position.x + fwdX * node.offset;
                    const nodeZ = foxRoot.position.z + fwdZ * node.offset;

                    const dx = nodeX - cX;
                    const dz = nodeZ - cZ;
                    if (dx * dx + dz * dz > maxR * maxR) continue;

                    const angle = Math.atan2(dz, dx);
                    const cosA = Math.cos(angle);
                    const sinA = Math.sin(angle);
                    const denom = Math.hypot(rz * cosA, rx * sinA);
                    const rockPerimeter = (denom > 0.0001) ? ((rx * rz) / denom) : Math.max(rx, rz);
                    const worldDist = Math.hypot(dx, dz);
                    const minAllowedDist = rockPerimeter + node.radius;

                    if (worldDist < minAllowedDist) {
                        // Periksa apakah di titik kontak ini batunya bisa dinaiki (landai / terjangkau kaki rubah)
                        const contactNormSq = (dx / rx) * (dx / rx) + (dz / rz) * (dz / rz);
                        const dome = Math.sqrt(Math.max(0, 1.0 - Math.min(1.0, contactNormSq)));
                        const contactSurfaceY = rockBottomY + (rockTopY - rockBottomY) * (0.22 + 0.78 * dome);

                        const maxStepUp = (huntBlend > 0.4) ? 0.90 : 0.75;
                        const canStepOntoRock = (contactSurfaceY - foxRoot.position.y) <= maxStepUp;
                        const isAlreadyAboveSurface = (foxRoot.position.y >= contactSurfaceY - 0.25);

                        // HANYA dorong menjauh jika batu menukik tajam ke atas (cliff wall)
                        // dan rubah tidak cukup tinggi untuk melangkahinya.
                        // Jika bisa dinaiki, rubah dibiarkan melangkah naik!
                        if (!canStepOntoRock && !isAlreadyAboveSurface) {
                            const pushDist = minAllowedDist - worldDist;
                            if (worldDist > 0.0001) {
                                foxRoot.position.x += (dx / worldDist) * pushDist;
                                foxRoot.position.z += (dz / worldDist) * pushDist;
                            } else {
                                foxRoot.position.x += minAllowedDist;
                            }
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
    const effectiveGroundH = Math.max(groundH, rockGroundSupportY);
    if (foxRoot.position.y <= effectiveGroundH) {
        if (!wasGrounded && velocityY < -3) {
            landingSquash = 0.18;
            if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playLand) foxSoundFX.playLand();
        }
        foxRoot.position.y = effectiveGroundH;
        velocityY = 0;
        isGrounded = true;
    } else {
        velocityY += gravity * dt;
    }
    updateWolfLocomotionAnimation(dt, elapsed, currentSpeed, currentTurnRate, huntBlend, isGrounded, velocityY);

    // ========================================================
    // 3. FREE ORBIT SPRING-ARM CAMERA DENGAN SMOOTH ANTI-OBSTACLE OCCLUSION
    // ========================================================
    // Titik fokus kamera mengikuti kepala/leher rubah agar pandangan selalu menghadap ke depan
    const headOffsetForward = 0.48 * foxScale;
    const currentTargetPos = new THREE.Vector3(
        foxRoot.position.x + forward.x * headOffsetForward,
        foxRoot.position.y + 0.90,
        foxRoot.position.z + forward.z * headOffsetForward
    );

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

    // Update status penahanan manual kamera (Multi-touch / Mouse drag)
    if (activeCameraTouches.size > 0) {
        isUserHoldingCamera = true;
        userHoldingCameraTimer = 0.35;
    } else if (userHoldingCameraTimer > 0) {
        userHoldingCameraTimer -= dt;
        isUserHoldingCamera = true;
    } else {
        isUserHoldingCamera = false;
    }

    // Jika user menggerakkan karakter via joystick/keyboard, batalkan jeda penahanan kamera
    if (Math.abs(currentSpeed) > 0.1 || Math.abs(currentTurnRate) > 0.1 || keys.w || keys.s || keys.a || keys.d) {
        userHoldingCameraTimer = 0;
    }

    let hDist = Math.hypot(camRay.x, camRay.z);
    let curYaw = (hDist > 0.02) ? Math.atan2(camRay.x, camRay.z) : (foxRoot.rotation.y + Math.PI);
    let curPitch = Math.atan2(camRay.y, Math.max(0.05, hDist));

    // PENTING: Batasi sudut pitch maksimal ke 30 derajat dari horizontal
    // (Kamera TIDAK BISA menukik ke atas kepala / up-to-down top-down under ANY circumstance)
    const MAX_ALLOWED_PITCH = THREE.MathUtils.degToRad(30.0);
    const MIN_ALLOWED_PITCH = THREE.MathUtils.degToRad(6.0);
    curPitch = THREE.MathUtils.clamp(curPitch, MIN_ALLOWED_PITCH, MAX_ALLOWED_PITCH);

    const isCharacterMoving = (Math.abs(currentSpeed) > 0.15 || Math.abs(currentTurnRate) > 0.15 || keys.w || keys.s || keys.a || keys.d || Math.abs(analogFwd) > 0.15 || Math.abs(analogTurn) > 0.15);

    if (isUserHoldingCamera) {
        // SAAT USER MENGGESER KAMERA:
        // HANYA jika fox sedang bergerak / berjalan, hadap fox diselaraskan dengan kamera.
        // Jika fox sedang DIAM (idle), fox TIDAK IKUT BERPUTAR (user bebas memutar kamera 360 derajat mengelilingi fox).
        if (isCharacterMoving) {
            const desiredFoxRotY = Math.atan2(-Math.cos(curYaw), Math.sin(curYaw));
            let rotDiff = (desiredFoxRotY - foxRoot.rotation.y) % (Math.PI * 2);
            if (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            if (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            foxRoot.rotation.y += rotDiff * Math.min(1.0, 14.0 * dt);
        }
    } else {
        // SAAT TIDAK DIGERAKKAN SECARA MANUAL:
        // Kamera secara otomatis mengikuti di belakang kepala rubah HANYA jika rubah sedang bergerak
        if (isCharacterMoving) {
            const targetYaw = Math.atan2(Math.cos(foxRoot.rotation.y), -Math.sin(foxRoot.rotation.y));
            let diff = (targetYaw - curYaw) % (Math.PI * 2);
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;

            const chaseSpeed = (huntBlend > 0.4) ? 5.5 : 4.2;
            const smoothT = 1.0 - Math.exp(-chaseSpeed * dt);
            curYaw += diff * smoothT;

            const targetPitch = THREE.MathUtils.degToRad((huntBlend > 0.4) ? 22.0 : 18.0);
            curPitch = THREE.MathUtils.clamp(THREE.MathUtils.lerp(curPitch, targetPitch, 1.0 - Math.exp(-2.5 * dt)), MIN_ALLOWED_PITCH, MAX_ALLOWED_PITCH);
        }
    }

    const cosP = Math.cos(curPitch);
    const sinP = Math.sin(curPitch);
    const rayDir = new THREE.Vector3(Math.sin(curYaw) * cosP, sinP, Math.cos(curYaw) * cosP).normalize();
    const rayStart = controls.target;

    // ========================================================
    // 3A. PERHITUNGAN JARAK KAMERA (ZOOM-IN OTOMATIS DINONAKTIFKAN)
    // Sesuai permintaan user: Kamera TIDAK LAGI maju / zoom-in secara otomatis saat tertutup objek 3D.
    // Kamera tetap berada pada jarak stabil yang dipilih oleh user.
    // ========================================================
    const userTargetDist = THREE.MathUtils.clamp(userPreferredDist, 2.4, 18.0);
    const zoomLerpRate = 5.0;
    currentCamDist += (userTargetDist - currentCamDist) * Math.min(1.0, zoomLerpRate * dt);

    camera.position.copy(controls.target).addScaledVector(rayDir, currentCamDist);

    // Mencegah kamera menembus lantai tanah (ground floor clamp)
    if (typeof getTerrainHeightFast === 'function') {
        const groundFloor = getTerrainHeightFast(camera.position.x, camera.position.z) + 0.45;
        if (camera.position.y < groundFloor) {
            camera.position.y = groundFloor;
        }
    }

    camera.lookAt(controls.target);

    // ========================================================
    // 3B. SISTEM VISUAL EAGLE VISION OUTLINE & SILUET (ASSASSIN'S CREED)
    // Syarat Kemunculan: HANYA muncul jika Fox 100% tertutup (occluded) oleh objek 3D lain.
    // Pengecekan status tertutup didasarkan pada raycast dari kamera aktif (Main Camera).
    // ========================================================
    ensureFoxEagleVisionSystem(wolfCharacter);

    const leftVec = new THREE.Vector3(-forward.z, 0, forward.x);
    // 9 titik sampel anatomis tubuh rubah (ketinggian terkalibrasi aman di atas permukaan tanah/batu)
    const foxOcclusionPoints = [
        new THREE.Vector3(foxRoot.position.x + forward.x * (0.85 * foxScale), foxRoot.position.y + 0.75, foxRoot.position.z + forward.z * (0.85 * foxScale)), // Ujung moncong & hidung
        new THREE.Vector3(foxRoot.position.x + forward.x * (0.55 * foxScale), foxRoot.position.y + 0.98, foxRoot.position.z + forward.z * (0.55 * foxScale)), // Batok kepala & telinga atas
        new THREE.Vector3(foxRoot.position.x + forward.x * (0.35 * foxScale), foxRoot.position.y + 0.78, foxRoot.position.z + forward.z * (0.35 * foxScale)), // Dada & leher depan
        new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 0.80, foxRoot.position.z),                                                                    // Pusat torso badan
        new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 1.05, foxRoot.position.z),                                                                    // Punggung atas
        new THREE.Vector3(foxRoot.position.x + leftVec.x * (0.22 * foxScale), foxRoot.position.y + 0.70, foxRoot.position.z + leftVec.z * (0.22 * foxScale)),    // Sisi rusuk kiri
        new THREE.Vector3(foxRoot.position.x - leftVec.x * (0.22 * foxScale), foxRoot.position.y + 0.70, foxRoot.position.z - leftVec.z * (0.22 * foxScale)),    // Sisi rusuk kanan
        new THREE.Vector3(foxRoot.position.x - forward.x * (0.45 * foxScale), foxRoot.position.y + 0.75, foxRoot.position.z - forward.z * (0.45 * foxScale)),   // Panggul & pangkal ekor
        new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 0.35, foxRoot.position.z)                                                                     // Kaki atas / perut bawah
    ];

    const camPos = camera.position;
    let occludedPointsCount = 0;

    for (let p = 0; p < foxOcclusionPoints.length; p++) {
        const pt = foxOcclusionPoints[p];
        const dx = pt.x - camPos.x;
        const dy = pt.y - camPos.y;
        const dz = pt.z - camPos.z;
        const rayDist = Math.hypot(dx, dy, dz);
        if (rayDist < 0.3) continue;

        _occlusionRayDir.set(dx / rayDist, dy / rayDist, dz / rayDist);
        _occlusionRaycaster.set(camPos, _occlusionRayDir);
        _occlusionRaycaster.near = 0.4;
        _occlusionRaycaster.far = Math.max(0.4, rayDist - 0.30); // Berhenti 30cm sebelum tubuh rubah

        let isPointBlocked = false;

        // 1. Uji Raycast Geometri Presisi Bebatuan (Polygon Mesh Real - Mencegah False Positive di samping batu)
        if (activeRocks.length > 0) {
            const rockHits = _occlusionRaycaster.intersectObjects(activeRocks, false);
            if (rockHits.length > 0) {
                isPointBlocked = true;
            }
        }

        // 2. Uji Raycast Pepohonan (Batang & Ranting Daun)
        if (!isPointBlocked && Array.isArray(treesList) && treesList.length > 0) {
            const treeHits = _occlusionRaycaster.intersectObjects(treesList, true);
            if (treeHits.length > 0) {
                isPointBlocked = true;
            }
        }

        // 3. Uji Bukit / Terrain
        if (!isPointBlocked && typeof getTerrainHeightFast === 'function') {
            const stepSize = 0.45;
            const maxSteps = Math.floor((rayDist - 0.30) / stepSize);
            for (let sIdx = 1; sIdx <= maxSteps; sIdx++) {
                const s = sIdx * stepSize;
                const sx = camPos.x + _occlusionRayDir.x * s;
                const sz = camPos.z + _occlusionRayDir.z * s;
                const terrainH = getTerrainHeightFast(sx, sz);
                const rayH = camPos.y + _occlusionRayDir.y * s;
                if (rayH < terrainH + 0.15) {
                    isPointBlocked = true;
                    break;
                }
            }
        }

        if (isPointBlocked) {
            occludedPointsCount++;
        }
    }

    // SYARAT MUTLAK: Hanya muncul jika Fox 100% tertutup oleh objek 3D lain
    const isFox100PercentOccluded = (occludedPointsCount === foxOcclusionPoints.length);
    isCameraOccluded = isFox100PercentOccluded;
    updateFoxEagleVisionVisibility(isFox100PercentOccluded, dt, elapsed);
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
