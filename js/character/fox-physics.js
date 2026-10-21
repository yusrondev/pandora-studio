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
    if (k === 'c' || code === 'KeyC') {
        manualProne = !manualProne;
        if (!manualProne) foxIdleTimer = 0;
    }
    if (keys.w || keys.s || keys.a || keys.d || keys.space) {
        manualProne = false;
        foxIdleTimer = 0;
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
let _occlusionTimer = 0;
let _cachedFoxOccluded = false;

// Raycaster & vector khusus untuk collision mesh fisik bebatuan
const _rockRaycaster = new THREE.Raycaster();
const _rockRayDir = new THREE.Vector3();
const _rockRayOrigin = new THREE.Vector3();
const _pWorld = new THREE.Vector3();
const _pLocal = new THREE.Vector3();
const _resolvedLocal = new THREE.Vector3();
const _resolvedWorld = new THREE.Vector3();
const _rockInvMatrix = new THREE.Matrix4();

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
let isUserMouseDown = false;
let isInteractingWithCamera = false;
let cameraReleaseTimer = 0.0;
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
            isInteractingWithCamera = true;
            cameraReleaseTimer = 0.0;
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
        isInteractingWithCamera = true;
        cameraReleaseTimer = 0.0;
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
        isInteractingWithCamera = false;
        cameraReleaseTimer = 0.6;
    }
}

window.addEventListener('touchend', removeCameraTouches, { passive: true });
window.addEventListener('touchcancel', removeCameraTouches, { passive: true });

// Mouse fallback untuk desktop
window.addEventListener('pointerdown', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    if (e.pointerType === 'mouse' && e.target && e.target.tagName === 'CANVAS') {
        isUserMouseDown = true;
        isInteractingWithCamera = true;
        cameraReleaseTimer = 0.0;
    }
}, { capture: true });

window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') {
        if (isUserMouseDown) {
            isUserMouseDown = false;
            isInteractingWithCamera = false;
            cameraReleaseTimer = 0.6;
        }
    }
});

window.addEventListener('pointermove', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    if (e.pointerType === 'mouse') {
        if (e.buttons > 0) {
            isUserMouseDown = true;
            isInteractingWithCamera = true;
            cameraReleaseTimer = 0.0;
        } else if (isUserMouseDown) {
            isUserMouseDown = false;
            isInteractingWithCamera = false;
            cameraReleaseTimer = 0.6;
        }
    }
});

// Listener langsung ke OrbitControls
if (typeof controls !== 'undefined' && controls && controls.addEventListener) {
    controls.addEventListener('start', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            isInteractingWithCamera = true;
            cameraReleaseTimer = 0.0;
        }
    });
    controls.addEventListener('end', () => {
        if (typeof isPlayMode !== 'undefined' && isPlayMode) {
            isInteractingWithCamera = false;
            cameraReleaseTimer = 0.6;
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
let foxInWaterState = false;
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

// Idle State & Progressive Transitions: IDLE (Stand) -> SIT -> PRONE
let foxIdleTimer = 0;
let foxState = 'IDLE'; // 'IDLE' | 'SIT' | 'PRONE'
let foxProneBlend = 0.0; // 0.0 = Berdiri/Jalan/Lari, 1.0 = Mengendap Penuh (Full Prone / Stalking)
let foxSitBlend = 0.0;   // 0.0 = Berdiri, 1.0 = Duduk Santai (SIT)
let manualProne = false;
const FOX_IDLE_SIT_THRESHOLD = 3.5;   // Detik diam melihat sekeliling sebelum duduk (SIT)
const FOX_IDLE_PRONE_THRESHOLD = 8.0; // Detik diam lanjutan sebelum tiarap mengendap (PRONE)
window.foxIdleTimer = foxIdleTimer;
window.foxState = foxState;
window.foxProneBlend = foxProneBlend;
window.foxSitBlend = foxSitBlend;

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

    currentTurnRate = THREE.MathUtils.lerp(currentTurnRate, targetTurn, stats.turnAccel * dt);
    foxRoot.rotation.y += currentTurnRate * dt;

    // Hitung vektor arah maju (model fox menghadap -X secara lokal)
    const forward = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), foxRoot.rotation.y);

    currentSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, 8.0 * dt);
    window.currentFoxSpeed = currentSpeed;

    const speedNorm = Math.min(1, Math.abs(currentSpeed) / walkSpeed);
    const turnNorm = Math.abs(currentTurnRate) / (stats.turnRate || 2.5);
    const moveActivity = Math.max(speedNorm, turnNorm * 0.95);

    // Update HUD indicator jika ada
    const hudSpeed = document.getElementById('play-stat-speed');
    const hudState = document.getElementById('play-stat-state');
    if (hudSpeed) hudSpeed.innerText = (Math.abs(currentSpeed) * 2.2).toFixed(1) + ' m/s';

    if (hudState) {
        if (foxInWaterState) {
            hudState.innerText = "BERENANG (WATER RIPPLE & SPLASH)";
            hudState.style.color = "#06b6d4";
        } else if (!isGrounded) {
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
        } else if (typeof foxProneBlend !== 'undefined' && foxProneBlend > 0.35) {
            hudState.innerText = "MENGENDAP (PRONE)";
            hudState.style.color = "#c084fc";
        } else {
            hudState.innerText = "IDLE (PULIH CEPAT)";
            hudState.style.color = "#ffd27d";
        }
    }

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
    // Simpul anatomis proteksi dari ujung hidung/moncong sampai pangkal ekor
    const fwdX = forward.x;
    const fwdZ = forward.z;

    const foxCollisionNodes = [
        { offset: 1.40 * foxScale, radius: 0.16 * foxScale }, // Moncong & hidung depan
        { offset: 1.05 * foxScale, radius: 0.20 * foxScale }, // Batok kepala & dahi
        { offset: 0.70 * foxScale, radius: 0.22 * foxScale }, // Leher depan & dada atas
        { offset: 0.35 * foxScale, radius: 0.24 * foxScale }, // Bahu & dada depan
        { offset: 0.00 * foxScale, radius: 0.24 * foxScale }, // Torso / tengah badan
        { offset: -0.35 * foxScale, radius: 0.22 * foxScale }, // Panggul & paha belakang
        { offset: -0.70 * foxScale, radius: 0.16 * foxScale }  // Pangkal ekor & belakang
    ];

    if (Array.isArray(treesList) && treesList.length > 0) {
        const foxPosX = foxRoot.position.x;
        const foxPosZ = foxRoot.position.z;
        for (let iter = 0; iter < 2; iter++) {
            for (let i = 0; i < treesList.length; i++) {
                const tree = treesList[i];
                if (!tree || !tree.visible) continue;

                // Broadphase: lewati pohon yang berjarak > 4m dari tubuh rubah
                const treeDx = foxPosX - tree.position.x;
                const treeDz = foxPosZ - tree.position.z;
                if (treeDx * treeDx + treeDz * treeDz > 16.0) continue;

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
                            camera.position.x += (dx / dist) * pushDist;
                            camera.position.z += (dz / dist) * pushDist;
                        } else {
                            foxRoot.position.x += minAllowedDist;
                            camera.position.x += minAllowedDist;
                        }
                    }
                }
            }
        }
    }

    // ========================================================
    // 1B. COLLISION PRESISI BEBATUAN (ORIENTED LOCAL SPACE - ANTI TEMBUS)
    // Menggunakan transformasi matriks dunia lokal (_rockInvMatrix)
    // 100% memperhitungkan posisi, rotasi penuh X/Y/Z, dan skala asli setiap batu
    // ========================================================
    const activeRocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList) && rocksList.length > 0)
        ? rocksList
        : ((typeof rocksGroup !== 'undefined' && rocksGroup.children) ? rocksGroup.children : (window.rocksList || []));
    let rockGroundSupportY = -999;

    if (activeRocks.length > 0) {
        // Step-up height realistis berdasarkan fisik dan anatomi rubah:
        // Rubah adalah satwa lincah berkaki panjang yang mampu melompati & menaiki bebatuan 
        // hingga 0.70m saat berjalan santai, dan 0.95m saat berlari / berburu (sprint/hunt).
        const maxStepUp = (huntBlend > 0.4) ? 0.95 : 0.70;

        const curFoxX = foxRoot.position.x;
        const curFoxY = foxRoot.position.y;
        const curFoxZ = foxRoot.position.z;

        // Sampling arah langkah kaki rubah (maju / mundur)
        const moveDirSign = (currentSpeed < -0.1) ? -1 : 1;
        const stepProbeDist = 0.42 * foxScale;
        const probeStepX = curFoxX + fwdX * stepProbeDist * moveDirSign;
        const probeStepZ = curFoxZ + fwdZ * stepProbeDist * moveDirSign;

        // Simpul anatomis proteksi tubuh rubah 3D untuk tebing batu tinggi / boulder raksasa
        const rockCollisionNodes = [
            { offset: 1.25 * foxScale, height: 0.45 * foxScale, radius: 0.16 * foxScale }, // Moncong & hidung depan
            { offset: 0.90 * foxScale, height: 0.55 * foxScale, radius: 0.20 * foxScale }, // Kepala & dahi
            { offset: 0.55 * foxScale, height: 0.50 * foxScale, radius: 0.22 * foxScale }, // Leher depan
            { offset: 0.25 * foxScale, height: 0.45 * foxScale, radius: 0.24 * foxScale }, // Dada depan
            { offset: 0.00 * foxScale, height: 0.45 * foxScale, radius: 0.24 * foxScale }, // Torso tengah
            { offset: -0.35 * foxScale, height: 0.45 * foxScale, radius: 0.22 * foxScale }, // Panggul belakang
            { offset: -0.65 * foxScale, height: 0.40 * foxScale, radius: 0.16 * foxScale }  // Pangkal ekor
        ];

        for (let r = 0; r < activeRocks.length; r++) {
            const rock = activeRocks[r];
            if (!rock || !rock.visible) continue;

            const rData = rock.userData || {};
            const cX = rData.centerX !== undefined ? rData.centerX : rock.position.x;
            const cZ = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
            const maxR = (rData.radiusMax || Math.max(rock.scale.x, rock.scale.z) * 1.5) + 2.0;

            const rdx = curFoxX - cX;
            const rdz = curFoxZ - cZ;
            if (rdx * rdx + rdz * rdz > maxR * maxR) continue;

            rock.updateMatrixWorld(true);
            _rockInvMatrix.copy(rock.matrixWorld).invert();

            // Helper untuk mengecek ketinggian permukaan atas batu di sembarang koordinat dunia (worldX, worldZ)
            function getRockTopSurfaceAt(wX, wZ) {
                _pWorld.set(wX, 0, wZ);
                _pLocal.copy(_pWorld).applyMatrix4(_rockInvMatrix);
                const rSq = _pLocal.x * _pLocal.x + _pLocal.z * _pLocal.z;
                if (rSq >= 1.15) return -999;
                const localY = Math.sqrt(Math.max(0, 1.15 - rSq));
                _resolvedLocal.set(_pLocal.x, localY, _pLocal.z);
                _resolvedWorld.copy(_resolvedLocal).applyMatrix4(rock.matrixWorld);
                return _resolvedWorld.y;
            }

            // 1. VERTICAL SURFACE SUPPORT & STEP-UP DETECTION
            const surfaceHCenter = getRockTopSurfaceAt(curFoxX, curFoxZ);
            const surfaceHStep = getRockTopSurfaceAt(probeStepX, probeStepZ);

            let isStandingOnRock = false;
            let canStepUpThisRock = false;

            // Apakah rubah sedang menapak di atas batu?
            if (surfaceHCenter > -900) {
                const diffCenter = surfaceHCenter - curFoxY;
                if (diffCenter <= maxStepUp && diffCenter >= -1.2) {
                    if (surfaceHCenter > rockGroundSupportY) {
                        rockGroundSupportY = surfaceHCenter;
                    }
                    isStandingOnRock = true;
                }
            }

            // Apakah kaki depan rubah sedang melangkah ke atas batu?
            if (surfaceHStep > -900) {
                const diffStep = surfaceHStep - curFoxY;
                if (diffStep > 0 && diffStep <= maxStepUp) {
                    canStepUpThisRock = true;
                    if (surfaceHStep > rockGroundSupportY) {
                        rockGroundSupportY = surfaceHStep;
                    }
                    // Bantu transisi halus step-up saat bergerak aktif
                    if (Math.abs(currentSpeed) > 0.05) {
                        foxRoot.position.y = THREE.MathUtils.lerp(foxRoot.position.y, surfaceHStep, Math.min(1.0, 14.0 * dt));
                    }
                }
            }

            // 2. HORIZONTAL SOLID COLLISION (Hanya aktif untuk tebing batu tinggi / boulder raksasa)
            // Jika batu ini bisa dinaiki atau rubah sedang di atasnya, JANGAN blokir / dorong mundur rubah!
            if (!isStandingOnRock && !canStepUpThisRock) {
                const rockTopY = (rData.topY !== undefined) ? rData.topY : (rock.position.y + rock.scale.y * 1.12);
                const heightAboveFox = rockTopY - curFoxY;

                // Hanya bentrok jika puncak batu ini memang melebihi kemampuan step-up rubah (boulder besar / tebing)
                if (heightAboveFox > maxStepUp) {
                    for (let iter = 0; iter < 2; iter++) {
                        for (let n = 0; n < rockCollisionNodes.length; n++) {
                            const node = rockCollisionNodes[n];
                            const nodeX = foxRoot.position.x + fwdX * node.offset;
                            const nodeZ = foxRoot.position.z + fwdZ * node.offset;
                            const nodeY = foxRoot.position.y + node.height;

                            _pWorld.set(nodeX, nodeY, nodeZ);
                            _pLocal.copy(_pWorld).applyMatrix4(_rockInvMatrix);

                            const rLocal = Math.hypot(_pLocal.x, _pLocal.z);
                            let dirLocalX = 1, dirLocalZ = 0;
                            if (rLocal > 0.0001) {
                                dirLocalX = _pLocal.x / rLocal;
                                dirLocalZ = _pLocal.z / rLocal;
                            } else {
                                const oppWorld = forward.clone().negate();
                                const oppLocal = oppWorld.transformDirection(_rockInvMatrix);
                                const oppLen = Math.hypot(oppLocal.x, oppLocal.z) || 1;
                                dirLocalX = oppLocal.x / oppLen;
                                dirLocalZ = oppLocal.z / oppLen;
                            }

                            let rockMeshRadiusLocal = 0.90;
                            if (_pLocal.y > 0.25) {
                                const topRatio = THREE.MathUtils.clamp((_pLocal.y - 0.25) / 0.85, 0, 1);
                                rockMeshRadiusLocal = 0.90 * Math.sqrt(Math.max(0, 1.0 - topRatio * topRatio));
                            } else if (_pLocal.y < -0.80) {
                                const botRatio = THREE.MathUtils.clamp((-0.80 - _pLocal.y) / 0.50, 0, 1);
                                rockMeshRadiusLocal = 0.90 * (1.0 - botRatio * 0.15);
                            }

                            const scaleInDir = Math.hypot(rock.scale.x * dirLocalX, rock.scale.z * dirLocalZ);
                            const localNodeMargin = node.radius / Math.max(0.1, scaleInDir);
                            const minAllowedLocalR = rockMeshRadiusLocal + localNodeMargin;

                            if (rLocal < minAllowedLocalR && _pLocal.y >= -1.45 && _pLocal.y <= 1.15) {
                                _resolvedLocal.set(dirLocalX * minAllowedLocalR, _pLocal.y, dirLocalZ * minAllowedLocalR);
                                _resolvedWorld.copy(_resolvedLocal).applyMatrix4(rock.matrixWorld);

                                const pushVecX = _resolvedWorld.x - _pWorld.x;
                                const pushVecZ = _resolvedWorld.z - _pWorld.z;

                                foxRoot.position.x += pushVecX;
                                foxRoot.position.z += pushVecZ;
                                camera.position.x += pushVecX;
                                camera.position.z += pushVecZ;

                                const pushDist = Math.hypot(pushVecX, pushVecZ);
                                if (pushDist > 0.0001) {
                                    const normOutX = pushVecX / pushDist;
                                    const normOutZ = pushVecZ / pushDist;
                                    const inwardSpeed = forward.x * normOutX + forward.z * normOutZ;

                                    if (inwardSpeed < -0.70) {
                                        currentSpeed = 0;
                                    }
                                }
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
    // 2. TERRAIN HEIGHT, WATER INTERACTION (100% ocean.html) & LOMPATAN
    // ========================================================
    const groundH = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(foxRoot.position.x, foxRoot.position.z) : 0;
    const effectiveGroundH = Math.max(groundH, rockGroundSupportY);

    // Cek keberadaan air dan gelombang laut di posisi rubah
    const inWaterArea = (typeof isWaterAtWorld === 'function') ? isWaterAtWorld(foxRoot.position.x, foxRoot.position.z) : false;
    const baseWaterLevel = (typeof getWaterCurrentLevel === 'function') ? getWaterCurrentLevel() : 0.0;
    const waveInfo = (typeof getWaterWaveHeightAndNormal === 'function')
        ? getWaterWaveHeightAndNormal(foxRoot.position.x, foxRoot.position.z, elapsed)
        : { y: 0, normal: new THREE.Vector3(0, 1, 0) };
    const waterSurfaceY = baseWaterLevel + waveInfo.y;
    // Kedalaman air diukur dari permukaan air ke dasar landscape
    const waterDepth = inWaterArea ? Math.max(0, waterSurfaceY - effectiveGroundH) : 0;
    const isWaterDeeperThanGround = inWaterArea && (waterDepth > 0.05);

    // Ketinggian tenggelam setengah badan rubah (separuh badan terendam, seluruh kaki di bawah air):
    // Tinggi hip adalah 1.62 * 0.58 = 0.94m. Garis setengah torso berada di ~0.82m dari telapak kaki.
    const halfBodySubmergeOffset = 0.82 * (foxScale / 0.58);
    const halfBodyFloatTargetY = waterSurfaceY - halfBodySubmergeOffset + Math.sin(elapsed * 2.4) * 0.025;

    if (isWaterDeeperThanGround && foxRoot.position.y <= waterSurfaceY + 0.35) {
        // --- 100% OCEAN.HTML WATER EFFECT & DYNAMIC BUOYANCY PHYSICS ---
        const wasInWater = foxInWaterState;
        if (!wasInWater) {
            foxInWaterState = true;
            // Efek percikan air hantaman saat mencebur / mendarat di air dari ketinggian
            const plungeSpeed = Math.abs(velocityY);
            const splashPower = Math.min(2.5, Math.max(0.9, plungeSpeed * 0.28));
            if (typeof spawnSplash === 'function') {
                spawnSplash(foxRoot.position, Math.floor(40 + plungeSpeed * 6), splashPower);
            }
            if (typeof triggerWaterImpactRipple === 'function') {
                triggerWaterImpactRipple(foxRoot.position.x, foxRoot.position.z, splashPower * 1.3);
            }
            if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playSplash) {
                foxSoundFX.playSplash();
            }
        }

        if (waterDepth < halfBodySubmergeOffset) {
            // === 1. AIR DANGKAL / GALIAN BELUM DALAM (SHALLOW / PARTIAL WADING) ===
            // Rubah menapak di dasar tanah, kaki terendam sebanding dengan kedalaman galian
            if (foxRoot.position.y <= effectiveGroundH) {
                foxRoot.position.y = effectiveGroundH;
                velocityY = 0;
                isGrounded = true;
            } else {
                velocityY += gravity * dt;
                foxRoot.position.y += velocityY * dt;
                if (foxRoot.position.y <= effectiveGroundH) {
                    foxRoot.position.y = effectiveGroundH;
                    velocityY = 0;
                    isGrounded = true;
                }
            }

            // Lompatan dari air dangkal (Space key)
            if (keys.space && isGrounded) {
                const currentJumpPower = (stats && stats.jumpPower) ? stats.jumpPower : jumpPower;
                velocityY = currentJumpPower + 0.5;
                isGrounded = false;
                if (typeof spawnSplash === 'function') spawnSplash(foxRoot.position, 28, 1.15);
                if (typeof triggerWaterImpactRipple === 'function') triggerWaterImpactRipple(foxRoot.position.x, foxRoot.position.z, 1.0);
                if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playSplash) foxSoundFX.playSplash();
            }
        } else {
            // === 2. AIR DALAM / LANDSCAPE TERGALI DALAM (DEEP WATER / HALF-BODY FLOATING) ===
            // Tubuh rubah tenggelam setengah: seluruh kaki 100% berada di bawah air, punggung/kepala mengapung

            // Hambatan fluida hidrodinamika air (water viscosity damping)
            const waterViscosity = Math.min(1.0, 5.0 * dt);
            velocityY -= velocityY * waterViscosity;

            // Redam sedikit laju gerak horizontal saat berenang di air dalam
            currentSpeed = THREE.MathUtils.lerp(currentSpeed, currentSpeed * 0.86, Math.min(1.0, 3.5 * dt));

            // Gaya Apung Archimedes (Buoyancy Force)
            // Keseimbangan apung berada di posisi tenggelam setengah badan (halfBodyFloatTargetY)
            const depthSubmerged = halfBodyFloatTargetY - foxRoot.position.y;
            if (depthSubmerged > 0) {
                // Terbenam lebih dalam: gaya apung mendorong naik ke permukaan
                const buoyancyForce = depthSubmerged * 26.0;
                velocityY += (gravity * 0.25 + buoyancyForce) * dt;
            } else {
                // Di atas target apung: gravitasi menarik turun kembali ke garis air
                velocityY += gravity * 0.85 * dt;
            }

            foxRoot.position.y += velocityY * dt;

            // Proteksi dasar galian: jika landscape digali tapi rubah menyentuh dasar tanah
            if (foxRoot.position.y <= effectiveGroundH) {
                foxRoot.position.y = effectiveGroundH;
                if (velocityY < 0) velocityY = 0;
            }
            // Di air dalam, rubah berenang/mengapung setengah badan (kaki melayang dalam air)
            // FUNGSI JUMP DINONAKTIFKAN saat scrup/air dalam dan setengah badan tenggelam
            isGrounded = false;
        }

        // Tilting dinamis mengikuti lereng gelombang (Wave Tilting 100% ocean.html)
        if (bodyTiltGroup) {
            const waveTiltZ = -waveInfo.normal.x * 0.35;
            const waveTiltX = waveInfo.normal.z * 0.35;
            bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, waveTiltZ, 0.16);
            bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, waveTiltX, 0.16);
        }

        // Percikan air dinamis saat berenang maju (Bow Spray)
        if (Math.abs(currentSpeed) > 0.8 && typeof spawnSplash === 'function' && Math.random() < 0.28) {
            const bowPos = foxRoot.position.clone().addScaledVector(forward, 0.45);
            bowPos.y = waterSurfaceY;
            spawnSplash(bowPos, 3, Math.abs(currentSpeed) * 0.08, forward);
        }
    } else {
        // --- NORMAL TERRAIN & JUMP PHYSICS ---
        if (foxInWaterState && foxRoot.position.y > waterSurfaceY + 0.35) {
            foxInWaterState = false;
        }

        if (keys.space && isGrounded) {
            const currentJumpPower = (stats && stats.jumpPower) ? stats.jumpPower : jumpPower;
            velocityY = currentJumpPower + huntBlend * 1.2;
            isGrounded = false;
            if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playJump) foxSoundFX.playJump();
        }

        const wasGrounded = isGrounded;
        foxRoot.position.y += velocityY * dt;

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
    }
    const locomotionGrounded = isGrounded || (foxInWaterState && Math.abs(currentSpeed) > 0.1);
    updateWolfLocomotionAnimation(dt, elapsed, currentSpeed, currentTurnRate, huntBlend, locomotionGrounded, velocityY);

    // ========================================================
    // 3. FREE ORBIT SPRING-ARM CAMERA DENGAN SMOOTH ANTI-OBSTACLE OCCLUSION
    // ========================================================
    // Titik fokus kamera mengikuti kepala/leher rubah agar pandangan selalu menghadap ke depan
    const headOffsetForward = 0.48 * foxScale;
    const proneCameraOffsetY = THREE.MathUtils.lerp(0.90, 0.45, foxProneBlend);
    const currentTargetPos = new THREE.Vector3(
        foxRoot.position.x + forward.x * headOffsetForward,
        foxRoot.position.y + proneCameraOffsetY,
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
    if (isInteractingWithCamera || isUserMouseDown || activeCameraTouches.size > 0) {
        isUserHoldingCamera = true;
    } else if (cameraReleaseTimer > 0) {
        cameraReleaseTimer -= dt;
        isUserHoldingCamera = true;
    } else {
        isUserHoldingCamera = false;
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
        // SAAT USER MENGGESER KAMERA (BAIK SEDANG DIAM MAUPUN BERJALAN):
        // Kamera bebas dirotasi oleh user sesuai arah drag mouse/touch,
        // sudut kamera dipertahankan dan rubah tidak dipaksa memutar arah.
    } else {
        // SAAT TIDAK DIGERAKKAN SECARA MANUAL (ATAU BEGITU KAMERA DILEPAS):
        // Sistem kamera (existing) berlaku kembali: kamera secara otomatis mengikuti di belakang rubah
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
    // 3A. PERHITUNGAN JARAK KAMERA & AUTO-ZOOM DI UJUNG MAP
    // Saat karakter fox berada dekat di ujung map, kamera otomatis zoom mendekat ke fox.
    // Begitu fox menjauh dari tepi map kembali normal lagi.
    // ========================================================
    const maxFoxExtent = mapHalf - 1.2;
    const distToEdgeX = Math.max(0, maxFoxExtent - Math.abs(foxRoot.position.x));
    const distToEdgeZ = Math.max(0, maxFoxExtent - Math.abs(foxRoot.position.z));
    const distToEdge = Math.min(distToEdgeX, distToEdgeZ);

    const edgeZoneRadius = 13.0; // Jarak mulai mendeteksi tepi map (13 meter)
    const edgeFactor = THREE.MathUtils.clamp(1.0 - (distToEdge / edgeZoneRadius), 0.0, 1.0);
    // Smoothstep easing agar transisi zoom terasa organik & sinematik
    const smoothEdge = edgeFactor * edgeFactor * (3.0 - 2.0 * edgeFactor);

    const userTargetDist = THREE.MathUtils.clamp(userPreferredDist, 2.4, 18.0);
    // Jarak zoom mendekat saat di ujung map
    const edgeZoomDist = Math.max(2.1, Math.min(userTargetDist * 0.45, 2.5));
    const effectiveTargetDist = THREE.MathUtils.lerp(userTargetDist, edgeZoomDist, smoothEdge);

    const zoomLerpRate = 4.5;
    currentCamDist += (effectiveTargetDist - currentCamDist) * Math.min(1.0, zoomLerpRate * dt);

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
    // Dioptimalkan: Spatial pre-filtering koridor pandang, short-circuiting instan, dan throttling 25Hz
    // ========================================================
    ensureFoxEagleVisionSystem(wolfCharacter);

    _occlusionTimer -= dt;
    if (_occlusionTimer <= 0) {
        _occlusionTimer = 0.04; // Evaluasi 25Hz (alpha siluet tetap berinterpolasi sangat mulus via lerp)

        const leftVec = new THREE.Vector3(-forward.z, 0, forward.x);
        // 9 titik sampel anatomis tubuh rubah (dari moncong depan s/d pangkal ekor)
        const foxOcclusionPoints = [
            new THREE.Vector3(foxRoot.position.x + forward.x * (1.55 * foxScale), foxRoot.position.y + 0.45 * foxScale, foxRoot.position.z + forward.z * (1.55 * foxScale)),
            new THREE.Vector3(foxRoot.position.x + forward.x * (1.20 * foxScale), foxRoot.position.y + 0.65 * foxScale, foxRoot.position.z + forward.z * (1.20 * foxScale)),
            new THREE.Vector3(foxRoot.position.x + forward.x * (0.85 * foxScale), foxRoot.position.y + 0.60 * foxScale, foxRoot.position.z + forward.z * (0.85 * foxScale)),
            new THREE.Vector3(foxRoot.position.x + forward.x * (0.45 * foxScale), foxRoot.position.y + 0.50 * foxScale, foxRoot.position.z + forward.z * (0.45 * foxScale)),
            new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 0.50 * foxScale, foxRoot.position.z),
            new THREE.Vector3(foxRoot.position.x + leftVec.x * (0.22 * foxScale), foxRoot.position.y + 0.50 * foxScale, foxRoot.position.z + leftVec.z * (0.22 * foxScale)),
            new THREE.Vector3(foxRoot.position.x - leftVec.x * (0.22 * foxScale), foxRoot.position.y + 0.50 * foxScale, foxRoot.position.z - leftVec.z * (0.22 * foxScale)),
            new THREE.Vector3(foxRoot.position.x - forward.x * (0.45 * foxScale), foxRoot.position.y + 0.50 * foxScale, foxRoot.position.z - forward.z * (0.45 * foxScale)),
            new THREE.Vector3(foxRoot.position.x - forward.x * (0.85 * foxScale), foxRoot.position.y + 0.45 * foxScale, foxRoot.position.z - forward.z * (0.85 * foxScale))
        ];

        const camPos = camera.position;
        const foxPos = foxRoot.position;

        // Vektor arah dari kamera ke rubah di bidang horizontal XZ
        const toFoxX = foxPos.x - camPos.x;
        const toFoxZ = foxPos.z - camPos.z;
        const distCamToFoxXZ = Math.hypot(toFoxX, toFoxZ);
        const invDistCamToFoxXZ = distCamToFoxXZ > 0.001 ? (1.0 / distCamToFoxXZ) : 0;
        const normDirX = toFoxX * invDistCamToFoxXZ;
        const normDirZ = toFoxZ * invDistCamToFoxXZ;

        const candidateRocks = [];
        if (activeRocks.length > 0) {
            for (let i = 0; i < activeRocks.length; i++) {
                const rock = activeRocks[i];
                if (!rock || !rock.visible) continue;
                const rx = (rock.userData && rock.userData.centerX !== undefined) ? rock.userData.centerX : rock.position.x;
                const rz = (rock.userData && rock.userData.centerZ !== undefined) ? rock.userData.centerZ : rock.position.z;

                const toObjX = rx - camPos.x;
                const toObjZ = rz - camPos.z;
                const proj = toObjX * normDirX + toObjZ * normDirZ;
                // Hanya periksa batuan yang berada di antara kamera dan rubah (bukan di belakang rubah)
                if (proj < 0.4 || proj > distCamToFoxXZ - 0.4) continue;
                const perpSq = (toObjX * toObjX + toObjZ * toObjZ) - (proj * proj);
                if (perpSq > 16.0) continue; // Max 4m dari garis pandang

                candidateRocks.push(rock);
            }
        }

        const candidateTreeTrunks = [];
        const candidateTreeClusters = [];

        if (Array.isArray(treesList) && treesList.length > 0) {
            for (let i = 0; i < treesList.length; i++) {
                const tree = treesList[i];
                if (!tree || !tree.visible) continue;
                const tx = tree.position.x;
                const tz = tree.position.z;

                const toTreeX = tx - camPos.x;
                const toTreeZ = tz - camPos.z;
                const proj = toTreeX * normDirX + toTreeZ * normDirZ;

                // Dedaunan pohon (tajuk) melebar hingga 3.5m, sehingga pohon di dekat/belakang rubah pun bisa menaungi rubah
                if (proj < -1.5 || proj > distCamToFoxXZ + 4.5) continue;
                const perpSq = (toTreeX * toTreeX + toTreeZ * toTreeZ) - (proj * proj);
                if (perpSq > 28.0) continue; // Max ~5.3m ke samping garis pandang kamera

                // A. Batang Pohon (silinder batang fisik)
                if (proj > 0.4 && proj < distCamToFoxXZ - 0.4 && perpSq < 9.0) {
                    if (tree.userData && tree.userData.trunkGroup) {
                        candidateTreeTrunks.push(tree.userData.trunkGroup);
                    } else {
                        candidateTreeTrunks.push(tree);
                    }
                }

                // B. Tajuk Dedaunan Pohon (Foliage Clusters)
                const leafOffsetY = (tree.userData && tree.userData.leafMesh) ? tree.userData.leafMesh.position.y : 0;
                const ang = tree.rotation.y || 0;
                const cosA = Math.cos(ang);
                const sinA = Math.sin(ang);

                if (tree.userData && Array.isArray(tree.userData.clusters) && tree.userData.clusters.length > 0) {
                    const cls = tree.userData.clusters;
                    for (let c = 0; c < cls.length; c++) {
                        const cl = cls[c];
                        const cx = cl.center.x;
                        const cy = cl.center.y;
                        const cz = cl.center.z;
                        candidateTreeClusters.push({
                            x: tx + (cx * cosA - cz * sinA),
                            y: tree.position.y + leafOffsetY + cy,
                            z: tz + (cx * sinA + cz * cosA),
                            r: cl.radius * 1.30 // Volume kanopi rimbun dedaunan anime
                        });
                    }
                } else if (tree.userData && (tree.userData.isPine || tree.userData.typeCode === 'pine')) {
                    // Dedaunan pohon cemara (Pine) bertingkat
                    const pineTiers = [
                        { y: 1.8, r: 1.95 },
                        { y: 2.8, r: 1.65 },
                        { y: 3.8, r: 1.35 },
                        { y: 4.8, r: 0.95 }
                    ];
                    for (let t = 0; t < pineTiers.length; t++) {
                        candidateTreeClusters.push({
                            x: tx,
                            y: tree.position.y + leafOffsetY + pineTiers[t].y,
                            z: tz,
                            r: pineTiers[t].r * 1.25
                        });
                    }
                } else {
                    // Default kanopi kubah dedaunan untuk jenis pohon lainnya
                    candidateTreeClusters.push({
                        x: tx,
                        y: tree.position.y + leafOffsetY + 3.2,
                        z: tz,
                        r: 2.6
                    });
                }
            }
        }

        let blockedPointsCount = 0;

        for (let p = 0; p < foxOcclusionPoints.length; p++) {
            const pt = foxOcclusionPoints[p];
            const dx = pt.x - camPos.x;
            const dy = pt.y - camPos.y;
            const dz = pt.z - camPos.z;
            const rayDist = Math.hypot(dx, dy, dz);
            if (rayDist < 0.3) continue;

            const invDist = 1.0 / rayDist;
            const dirX = dx * invDist;
            const dirY = dy * invDist;
            const dirZ = dz * invDist;

            _occlusionRayDir.set(dirX, dirY, dirZ);
            _occlusionRaycaster.set(camPos, _occlusionRayDir);
            _occlusionRaycaster.near = 0.4;
            const maxRayDist = Math.max(0.4, rayDist - 0.30);
            _occlusionRaycaster.far = maxRayDist;

            let isPointBlocked = false;

            // 1. Uji Dedaunan Pohon Kandidat (Ray-Sphere Intersection O(1) Instan & Super Cepat)
            if (candidateTreeClusters.length > 0) {
                for (let cIdx = 0; cIdx < candidateTreeClusters.length; cIdx++) {
                    const cl = candidateTreeClusters[cIdx];
                    const ocX = camPos.x - cl.x;
                    const ocY = camPos.y - cl.y;
                    const ocZ = camPos.z - cl.z;
                    const b = ocX * dirX + ocY * dirY + ocZ * dirZ;
                    const c = (ocX * ocX + ocY * ocY + ocZ * ocZ) - (cl.r * cl.r);
                    if (c > 0.0 && b > 0.0) continue; // Bola kanopi di belakang kamera
                    const discr = b * b - c;
                    if (discr >= 0.0) {
                        const sqrtD = Math.sqrt(discr);
                        const t0 = -b - sqrtD;
                        const t1 = -b + sqrtD;
                        const hitT = t0 > 0.4 ? t0 : t1;
                        if (hitT > 0.4 && hitT < maxRayDist) {
                            isPointBlocked = true;
                            break;
                        }
                    }
                }
            }

            // 2. Uji Bebatuan kandidat (hanya batuan di koridor pandang)
            if (!isPointBlocked && candidateRocks.length > 0) {
                const rockHits = _occlusionRaycaster.intersectObjects(candidateRocks, false);
                if (rockHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 3. Uji Batang Pohon kandidat (silinder batang)
            if (!isPointBlocked && candidateTreeTrunks.length > 0) {
                const trunkHits = _occlusionRaycaster.intersectObjects(candidateTreeTrunks, true);
                if (trunkHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 4. Uji Bukit / Terrain di ANTARA Kamera dan Rubah
            // Catatan: Berhenti 1.2m sebelum rubah agar tidak salah mendeteksi lereng tempat rubah berpijak
            if (!isPointBlocked && typeof getTerrainHeightFast === 'function') {
                const stepSize = 0.5;
                const minStepDist = 0.8;
                const maxTerrainDist = Math.max(minStepDist, rayDist - 1.2);
                const numSteps = Math.floor((maxTerrainDist - minStepDist) / stepSize);

                for (let sIdx = 0; sIdx <= numSteps; sIdx++) {
                    const s = minStepDist + sIdx * stepSize;
                    const sx = camPos.x + dirX * s;
                    const sz = camPos.z + dirZ * s;
                    const terrainH = getTerrainHeightFast(sx, sz);
                    const rayH = camPos.y + dirY * s;
                    // Terhalang hanya jika sinar menembus ke dalam tanah
                    if (rayH < terrainH - 0.05) {
                        isPointBlocked = true;
                        break;
                    }
                }
            }

            if (isPointBlocked) {
                blockedPointsCount++;
            }
        }

        // Rubah dianggap terhalang (Eagle Vision aktif) jika setidaknya 3 dari 9 titik sampel tubuh terhalang
        // (misal kepala, dada, atau punggung tertutup dedaunan pohon / batu)
        _cachedFoxOccluded = (blockedPointsCount >= 3);
    }

    isCameraOccluded = _cachedFoxOccluded;
    updateFoxEagleVisionVisibility(_cachedFoxOccluded, dt, elapsed);
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
    const targetNeckYaw = turnRate * 0.14;
    const targetHeadYaw = turnRate * 0.18;

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

    if (elapsed > nextTailFlickTime) {
        nextTailFlickTime = elapsed + 2.0 + Math.random() * 3.5;
        tailFlickAmp = (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.22);
    }
    tailFlickAmp = THREE.MathUtils.lerp(tailFlickAmp, 0, 5.5 * dt);

    const huntHipDrop = 0.22 * huntRatio;
    const huntNeckPitch = 0.48 * huntRatio;
    const huntHeadPitch = -0.42 * huntRatio;

    if (!grounded) {
        foxIdleTimer = 0;
        manualProne = false;
        foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, 0, Math.min(1.0, 12 * dt));
        foxSitBlend = THREE.MathUtils.lerp(foxSitBlend, 0, Math.min(1.0, 12 * dt));
        foxState = 'AIR';
        window.foxIdleTimer = 0;
        window.foxState = foxState;
        window.foxProneBlend = foxProneBlend;
        window.foxSitBlend = foxSitBlend;

        bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, safeBankRoll, 8 * dt);
        neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, 8 * dt);
        headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, 8 * dt);

        earLJoint.rotation.set(earTwitchL.x, earTwitchL.y, earTwitchL.z);
        earRJoint.rotation.set(earTwitchR.x, earTwitchR.y, earTwitchR.z);

        legFL.hip.rotation.x = THREE.MathUtils.lerp(legFL.hip.rotation.x, 0, 10 * dt);
        legFR.hip.rotation.x = THREE.MathUtils.lerp(legFR.hip.rotation.x, 0, 10 * dt);
        legBL.hip.rotation.x = THREE.MathUtils.lerp(legBL.hip.rotation.x, 0, 10 * dt);
        legBR.hip.rotation.x = THREE.MathUtils.lerp(legBR.hip.rotation.x, 0, 10 * dt);

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
        foxIdleTimer = 0;
        manualProne = false;
        foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, 0, Math.min(1.0, 10 * dt));
        foxSitBlend = THREE.MathUtils.lerp(foxSitBlend, 0, Math.min(1.0, 10 * dt));
        foxState = (Math.abs(speed) > 5.0) ? 'RUN' : 'WALK';
        window.foxIdleTimer = 0;
        window.foxState = foxState;
        window.foxProneBlend = foxProneBlend;
        window.foxSitBlend = foxSitBlend;

        bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, safeBankRoll, 8 * dt);
        neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, 8 * dt);
        headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, 8 * dt);

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

        legFL.hip.rotation.x = THREE.MathUtils.lerp(legFL.hip.rotation.x, 0, 10 * dt);
        legFR.hip.rotation.x = THREE.MathUtils.lerp(legFR.hip.rotation.x, 0, 10 * dt);
        legBL.hip.rotation.x = THREE.MathUtils.lerp(legBL.hip.rotation.x, 0, 10 * dt);
        legBR.hip.rotation.x = THREE.MathUtils.lerp(legBR.hip.rotation.x, 0, 10 * dt);

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
        // --- LOGIKA IDLE PROGRESIF: IDLE (STAND) -> SIT -> PRONE ---
        if (foxInWaterState) {
            foxIdleTimer = 0;
            foxState = 'IDLE';
            manualProne = false;
        } else {
            foxIdleTimer += dt;
            if (manualProne || foxIdleTimer >= FOX_IDLE_PRONE_THRESHOLD) {
                foxState = 'PRONE';
            } else if (foxIdleTimer >= FOX_IDLE_SIT_THRESHOLD) {
                foxState = 'SIT';
            } else {
                foxState = 'IDLE';
            }
        }

        foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, (foxState === 'PRONE') ? 1.0 : 0.0, Math.min(1.0, 4.0 * dt));
        foxSitBlend = THREE.MathUtils.lerp(foxSitBlend, (foxState === 'SIT') ? 1.0 : 0.0, Math.min(1.0, 4.0 * dt));
        window.foxIdleTimer = foxIdleTimer;
        window.foxState = foxState;
        window.foxProneBlend = foxProneBlend;
        window.foxSitBlend = foxSitBlend;

        // A. KEPALA MENOLEH WASPADA KE KIRI / KANAN & MENGAMATI ALAM (IDLE & SIT)
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

        let targetBodyY = BASE_HIP_Y;
        let targetBodyPitch = 0;
        let targetBodyRoll = 0;

        let targetNeckPitch = 0;
        let targetNeckYaw = 0;
        let targetHeadPitch = 0;
        let targetHeadYaw = 0;
        let targetHeadRoll = 0;

        let flHipZ = 0, flKneeZ = 0, flPawZ = 0, flHipX = 0;
        let frHipZ = 0, frKneeZ = 0, frPawZ = 0, frHipX = 0;
        let blHipZ = 0, blKneeZ = 0, blPawZ = 0, blHipX = 0;
        let brHipZ = 0, brKneeZ = 0, brPawZ = 0, brHipX = 0;

        let targetTailBaseZ = 0.05, targetTailBaseY = 0;
        let targetTailMidZ = 0.08, targetTailMidY = 0;
        let targetTailTipZ = 0.05, targetTailTipY = 0;

        let earLZ = 0, earRZ = 0;

        // -------------------------------------------------------------
        // POSE 1: PRONE / MENGENDAP (STALKING PREDATOR)
        // -------------------------------------------------------------
        if (foxState === 'PRONE') {
            // Tubuh turun mendekati tanah, torso agak menunduk ke depan
            targetBodyY = 0.52 + Math.sin(elapsed * 3.0) * 0.008; // Napas tegang predator
            targetBodyPitch = 0.14;  // Condong ke depan
            targetBodyRoll = 0.00;

            // Leher & Kepala menempel rendah ke tanah, mata mengunci target
            targetNeckPitch = -0.18;
            targetNeckYaw = Math.sin(elapsed * 1.5) * 0.05;
            targetHeadPitch = 0.08;
            targetHeadYaw = targetNeckYaw * 0.8;
            targetHeadRoll = 0.00;

            // Kaki depan dilipat merayap rendah ke depan
            flHipZ = 0.95;
            flKneeZ = -2.58;
            flPawZ = 0.56;
            flHipX = 0.10;

            frHipZ = 0.98;
            frKneeZ = -2.62;
            frPawZ = 0.54;
            frHipX = -0.10;

            // Kaki belakang menekuk tajam siap melompat menerkam (ready to pounce)
            blHipZ = -0.95;
            blHipX = 0.22;
            blKneeZ = 2.65;
            blPawZ = 0.30;

            brHipZ = -0.95;
            brHipX = -0.22;
            brKneeZ = 2.65;
            brPawZ = 0.30;

            // Ekor lurus lurus mendatar di lantai, sesekali mengibaskan ujungnya secara waspada
            const tailTwitch = Math.sin(elapsed * 4.0) * 0.12;
            targetTailBaseZ = 0.05;
            targetTailBaseY = tailTwitch * 0.4;
            targetTailMidZ = -0.05;
            targetTailMidY = tailTwitch * 0.7;
            targetTailTipZ = 0.02;
            targetTailTipY = tailTwitch * 1.0;

            // Telinga terlipat datar ke belakang (fokus & kamuflase mengendap)
            earLZ = -0.55;
            earRZ = -0.55;

            idlePawActiveLeg = null;

        // -------------------------------------------------------------
        // POSE 2: SIT (DUDUK ALAMI - PERSIS FOTO REAL)
        // -------------------------------------------------------------
        } else if (foxState === 'SIT') {
            const breath = Math.sin(elapsed * 2.3) * 0.014;
            targetBodyY = 1.08 + breath * 0.25;
            targetBodyPitch = -0.82; // Panggul jatuh ke lantai, dada tegak
            targetBodyRoll = 0.00;

            // Leher & Kepala tegak, menoleh santai ke sekeliling
            targetNeckPitch = 0.60 + idleLookCurrentPitch * 0.3;
            targetNeckYaw = idleLookCurrentYaw * 0.35;
            targetHeadPitch = 0.22 + idleLookCurrentPitch * 0.45;
            targetHeadYaw = idleLookCurrentYaw * 0.55;
            targetHeadRoll = idleLookCurrentRoll * 0.6;

            // Kaki depan tegak menopang tepat di Y = 0
            flHipZ = 1.35;
            flKneeZ = -0.92;
            flPawZ = -0.42;
            flHipX = 0.00;

            frHipZ = 1.35;
            frKneeZ = -0.92;
            frPawZ = -0.42;
            frHipX = 0.00;

            // Kaki belakang terlipat rapi menempel tanah
            blHipZ = -1.50;
            blHipX = 0.22;
            blKneeZ = 1.85;
            blPawZ = -0.35;

            brHipZ = -1.50;
            brHipX = -0.22;
            brKneeZ = 1.85;
            brPawZ = -0.35;

            // Ekor melengkung rapat tanpa rongga bolong
            targetTailBaseZ = 1.55; 
            targetTailBaseY = 0.38 + tailFlickAmp * 0.2;
            targetTailMidZ  = 0.25; 
            targetTailMidY  = 0.45 + tailFlickAmp * 0.3;
            targetTailTipZ  = 0.15;
            targetTailTipY  = 0.45 + tailFlickAmp * 0.4;

            earLZ = -0.15 + earTwitchL.z * 0.5;
            earRZ = -0.15 + earTwitchR.z * 0.5;

            idlePawActiveLeg = null;

        // -------------------------------------------------------------
        // POSE 3: IDLE / STAND - Berdiri tegap, menoleh waspada, telinga berkedut, ekor & paw fidget
        // -------------------------------------------------------------
        } else {
            const standBreath = Math.sin(elapsed * 2.3) * 0.014;
            targetBodyY = BASE_HIP_Y - huntHipDrop + standBreath - landingSquash;
            targetBodyPitch = 0.06 * huntRatio + landingSquash * 0.18;

            // B. Paw fidgeting santai (hanya saat berdiri)
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

            targetBodyRoll = safeBankRoll + weightShiftRoll;

            // Leher & Kepala menoleh waspada mengamati alam sekitar
            targetNeckPitch = huntNeckPitch + idleLookCurrentPitch * 0.4 + Math.sin(elapsed * 2.3 - 0.5) * 0.02;
            targetNeckYaw = targetNeckYaw + idleLookCurrentYaw * 0.42;
            targetHeadPitch = huntHeadPitch + idleLookCurrentPitch * 0.65 - Math.sin(elapsed * 2.3 - 0.5) * 0.015;
            targetHeadYaw = targetHeadYaw + idleLookCurrentYaw * 0.65;
            targetHeadRoll = idleLookCurrentRoll;

            // Kaki depan berdiri
            flHipZ = 0.26 * huntRatio - pawLiftFL * 0.16;
            flKneeZ = -0.48 * huntRatio - pawLiftFL * 0.72;
            flPawZ = 0.22 * huntRatio + pawLiftFL * 0.55;
            flHipX = 0.00;

            frHipZ = 0.26 * huntRatio - pawLiftFR * 0.16;
            frKneeZ = -0.48 * huntRatio - pawLiftFR * 0.72;
            frPawZ = 0.22 * huntRatio + pawLiftFR * 0.55;
            frHipX = 0.00;

            // Kaki belakang berdiri
            blHipZ = -0.28 * huntRatio + pawLiftBL * 0.28;
            blKneeZ = 0.52 * huntRatio + pawLiftBL * 0.38;
            blPawZ = -0.24 * huntRatio - pawLiftBL * 0.35;
            blHipX = 0.00;

            brHipZ = -0.28 * huntRatio + pawLiftBR * 0.28;
            brKneeZ = 0.52 * huntRatio + pawLiftBR * 0.38;
            brPawZ = -0.24 * huntRatio - pawLiftBR * 0.35;
            brHipX = 0.00;

            // Ekor mengayun anggun
            const idleTailLift = 0.34 * huntRatio;
            targetTailBaseZ = idleTailLift + Math.sin(elapsed * 1.8) * 0.03;
            targetTailMidZ = idleTailLift * 0.6 + Math.sin(elapsed * 1.8 - 0.6) * 0.04;
            targetTailTipZ = 0.08 * huntRatio;

            const baseWave = Math.sin(elapsed * 1.6) * 0.055;
            targetTailBaseY = baseWave + tailFlickAmp * 0.45;
            targetTailMidY = Math.sin(elapsed * 1.6 - 0.7) * 0.085 + tailFlickAmp * 0.85;
            targetTailTipY = Math.sin(elapsed * 1.6 - 1.4) * 0.11 + tailFlickAmp * 1.2;

            earLZ = earTwitchL.z;
            earRZ = earTwitchR.z;
        }

        // Interpolasi Halus & Natural (Lerp) untuk Semua Sendi
        const lerpRate = Math.min(1.0, 7.5 * dt);

        bodyTiltGroup.position.y = THREE.MathUtils.lerp(bodyTiltGroup.position.y, targetBodyY, lerpRate);
        bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, targetBodyPitch, lerpRate);
        bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, targetBodyRoll, lerpRate);

        neckJoint.rotation.z = THREE.MathUtils.lerp(neckJoint.rotation.z, targetNeckPitch, lerpRate);
        neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, lerpRate);

        headJoint.rotation.z = THREE.MathUtils.lerp(headJoint.rotation.z, targetHeadPitch, lerpRate);
        headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, lerpRate);
        headJoint.rotation.x = THREE.MathUtils.lerp(headJoint.rotation.x, targetHeadRoll, lerpRate);

        earLJoint.rotation.z = THREE.MathUtils.lerp(earLJoint.rotation.z, earLZ, lerpRate);
        earRJoint.rotation.z = THREE.MathUtils.lerp(earRJoint.rotation.z, earRZ, lerpRate);
        if (foxState === 'PRONE') {
            earLJoint.rotation.x = THREE.MathUtils.lerp(earLJoint.rotation.x, 0, lerpRate);
            earLJoint.rotation.y = THREE.MathUtils.lerp(earLJoint.rotation.y, 0, lerpRate);
            earRJoint.rotation.x = THREE.MathUtils.lerp(earRJoint.rotation.x, 0, lerpRate);
            earRJoint.rotation.y = THREE.MathUtils.lerp(earRJoint.rotation.y, 0, lerpRate);
        } else {
            earLJoint.rotation.x = THREE.MathUtils.lerp(earLJoint.rotation.x, earTwitchL.x, lerpRate);
            earLJoint.rotation.y = THREE.MathUtils.lerp(earLJoint.rotation.y, earTwitchL.y, lerpRate);
            earRJoint.rotation.x = THREE.MathUtils.lerp(earRJoint.rotation.x, earTwitchR.x, lerpRate);
            earRJoint.rotation.y = THREE.MathUtils.lerp(earRJoint.rotation.y, earTwitchR.y, lerpRate);
        }

        legFL.hip.rotation.z = THREE.MathUtils.lerp(legFL.hip.rotation.z, flHipZ, lerpRate);
        legFL.hip.rotation.x = THREE.MathUtils.lerp(legFL.hip.rotation.x, flHipX, lerpRate);
        legFL.knee.rotation.z = THREE.MathUtils.lerp(legFL.knee.rotation.z, flKneeZ, lerpRate);
        legFL.paw.rotation.z = THREE.MathUtils.lerp(legFL.paw.rotation.z, flPawZ, lerpRate);

        legFR.hip.rotation.z = THREE.MathUtils.lerp(legFR.hip.rotation.z, frHipZ, lerpRate);
        legFR.hip.rotation.x = THREE.MathUtils.lerp(legFR.hip.rotation.x, frHipX, lerpRate);
        legFR.knee.rotation.z = THREE.MathUtils.lerp(legFR.knee.rotation.z, frKneeZ, lerpRate);
        legFR.paw.rotation.z = THREE.MathUtils.lerp(legFR.paw.rotation.z, frPawZ, lerpRate);

        legBL.hip.rotation.z = THREE.MathUtils.lerp(legBL.hip.rotation.z, blHipZ, lerpRate);
        legBL.hip.rotation.x = THREE.MathUtils.lerp(legBL.hip.rotation.x, blHipX, lerpRate);
        legBL.knee.rotation.z = THREE.MathUtils.lerp(legBL.knee.rotation.z, blKneeZ, lerpRate);
        legBL.paw.rotation.z = THREE.MathUtils.lerp(legBL.paw.rotation.z, blPawZ, lerpRate);

        legBR.hip.rotation.z = THREE.MathUtils.lerp(legBR.hip.rotation.z, brHipZ, lerpRate);
        legBR.hip.rotation.x = THREE.MathUtils.lerp(legBR.hip.rotation.x, brHipX, lerpRate);
        legBR.knee.rotation.z = THREE.MathUtils.lerp(legBR.knee.rotation.z, brKneeZ, lerpRate);
        legBR.paw.rotation.z = THREE.MathUtils.lerp(legBR.paw.rotation.z, brPawZ, lerpRate);

        tailBaseJoint.rotation.z = THREE.MathUtils.lerp(tailBaseJoint.rotation.z, targetTailBaseZ, lerpRate);
        tailBaseJoint.rotation.y = THREE.MathUtils.lerp(tailBaseJoint.rotation.y, targetTailBaseY, lerpRate);
        tailMidJoint.rotation.z = THREE.MathUtils.lerp(tailMidJoint.rotation.z, targetTailMidZ, lerpRate);
        tailMidJoint.rotation.y = THREE.MathUtils.lerp(tailMidJoint.rotation.y, targetTailMidY, lerpRate);
        tailTipJoint.rotation.z = THREE.MathUtils.lerp(tailTipJoint.rotation.z, targetTailTipZ, lerpRate);
        tailTipJoint.rotation.y = THREE.MathUtils.lerp(tailTipJoint.rotation.y, targetTailTipY, lerpRate);
    }
}
window.updateWolfLocomotionAnimation = updateWolfLocomotionAnimation;
window.updateLegArticulation = updateLegArticulation;
