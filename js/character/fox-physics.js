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

// Idle State & Prone / Mengendap Transition (dari sample-prone.html)
let foxIdleTimer = 0;
let foxProneBlend = 0.0; // 0.0 = Berdiri/Jalan/Lari, 1.0 = Mengendap Penuh (Full Prone / Stalking)
let manualProne = false;
const FOX_IDLE_PRONE_THRESHOLD = 4.5; // Detik diam sebelum otomatis masuk ke mode mengendap (prone)
window.foxIdleTimer = foxIdleTimer;
window.foxProneBlend = foxProneBlend;

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
        // Step-up height realistis berdasarkan ukuran kaki rubah:
        // Batu landai / slate kecil s/d 0.35m (saat sprint/hunt s/d 0.45m).
        // Batu yang lebih tinggi dari ini (boulder besar) TIDAK BISA dipanjat langsung.
        const maxStepUp = (huntBlend > 0.4) ? 0.45 : 0.35;

        // Simpul anatomis proteksi tubuh rubah 3D (ramping proporsional agar bisa melewati celah batuan)
        const rockCollisionNodes = [
            { offset: 1.40 * foxScale, height: 0.45 * foxScale, radius: 0.16 * foxScale }, // Ujung moncong & hidung paling depan
            { offset: 1.05 * foxScale, height: 0.60 * foxScale, radius: 0.20 * foxScale }, // Kepala, dahi & telinga
            { offset: 0.70 * foxScale, height: 0.55 * foxScale, radius: 0.22 * foxScale }, // Leher depan & tenggorokan
            { offset: 0.35 * foxScale, height: 0.45 * foxScale, radius: 0.24 * foxScale }, // Dada & bahu depan
            { offset: 0.00 * foxScale, height: 0.45 * foxScale, radius: 0.24 * foxScale }, // Torso tengah
            { offset: -0.35 * foxScale, height: 0.45 * foxScale, radius: 0.22 * foxScale }, // Panggul & paha belakang
            { offset: -0.70 * foxScale, height: 0.40 * foxScale, radius: 0.16 * foxScale }  // Pangkal ekor belakang
        ];

        for (let r = 0; r < activeRocks.length; r++) {
            const rock = activeRocks[r];
            if (!rock || !rock.visible) continue;

            const rData = rock.userData || {};
            const cX = rData.centerX !== undefined ? rData.centerX : rock.position.x;
            const cZ = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
            const maxR = (rData.radiusMax || Math.max(rock.scale.x, rock.scale.z) * 1.5) + 1.8;

            const curFoxX = foxRoot.position.x;
            const curFoxZ = foxRoot.position.z;
            const rdx = curFoxX - cX;
            const rdz = curFoxZ - cZ;
            // Broadphase cepat
            if (rdx * rdx + rdz * rdz > maxR * maxR) continue;

            rock.updateMatrixWorld(true);
            _rockInvMatrix.copy(rock.matrixWorld).invert();

            const rockTopY = (rData.topY !== undefined) ? rData.topY : (rock.position.y + rock.scale.y * 1.12);
            const isFoxAlreadyOnTop = (foxRoot.position.y >= rockTopY - 0.35);

            // 1. VERTICAL SURFACE SUPPORT: Apakah rubah sedang berdiri / berjalan di atas batu ini?
            _pWorld.set(foxRoot.position.x, foxRoot.position.y, foxRoot.position.z);
            _pLocal.copy(_pWorld).applyMatrix4(_rockInvMatrix);

            const rLocalCenterSq = _pLocal.x * _pLocal.x + _pLocal.z * _pLocal.z;
            if (rLocalCenterSq < 1.05) {
                const localTopY = Math.sqrt(Math.max(0, 1.12 - rLocalCenterSq));
                _resolvedLocal.set(_pLocal.x, localTopY, _pLocal.z);
                _resolvedWorld.copy(_resolvedLocal).applyMatrix4(rock.matrixWorld);

                const surfaceHeight = _resolvedWorld.y;
                const heightDiff = surfaceHeight - foxRoot.position.y;

                // Kemiringan permukaan di titik ini (dalam koordinat lokal unit)
                const isWalkableSlope = localTopY >= 0.45; // Slope <= ~63 deg
                const isAtOrAboveSurface = (foxRoot.position.y >= surfaceHeight - 0.25 && foxRoot.position.y <= surfaceHeight + 0.65);
                const canClimbUp = (heightDiff > 0 && heightDiff <= maxStepUp && isWalkableSlope);

                if (canClimbUp || isAtOrAboveSurface) {
                    if (surfaceHeight > rockGroundSupportY) {
                        rockGroundSupportY = surfaceHeight;
                    }
                }
            }

            // 2. HORIZONTAL SOLID COLLISION: Mencegah semua simpul rubah menembus batu
            // HANYA aktif jika rubah TIDAK sedang berada di atas batu ini
            if (!isFoxAlreadyOnTop) {
                const heightAboveFox = rockTopY - foxRoot.position.y;
                // Jika batu terlalu tinggi untuk dipanjat langsung (boulder besar / tebing terjal):
                if (heightAboveFox > maxStepUp) {
                    for (let iter = 0; iter < 2; iter++) {
                        for (let n = 0; n < rockCollisionNodes.length; n++) {
                            const node = rockCollisionNodes[n];
                            const nodeX = foxRoot.position.x + fwdX * node.offset;
                            const nodeZ = foxRoot.position.z + fwdZ * node.offset;
                            const nodeY = foxRoot.position.y + node.height;

                            _pWorld.set(nodeX, nodeY, nodeZ);
                            _pLocal.copy(_pWorld).applyMatrix4(_rockInvMatrix);

                            // Jarak horizontal simpul dari sumbu Y lokal batu
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

                            // Radius mesh batu di ruang lokal pada elevasi _pLocal.y
                            // Rata-rata radius permukaan luar batu dodecahedron adalah ~0.90
                            let rockMeshRadiusLocal = 0.90;
                            if (_pLocal.y > 0.25) {
                                const topRatio = THREE.MathUtils.clamp((_pLocal.y - 0.25) / 0.85, 0, 1);
                                rockMeshRadiusLocal = 0.90 * Math.sqrt(Math.max(0, 1.0 - topRatio * topRatio));
                            } else if (_pLocal.y < -0.80) {
                                const botRatio = THREE.MathUtils.clamp((-0.80 - _pLocal.y) / 0.50, 0, 1);
                                rockMeshRadiusLocal = 0.90 * (1.0 - botRatio * 0.15);
                            }

                            // Konversi margin node ke skala lokal batu pada arah benturan (sesuai ukuran tubuh rubah)
                            const scaleInDir = Math.hypot(rock.scale.x * dirLocalX, rock.scale.z * dirLocalZ);
                            const localNodeMargin = node.radius / Math.max(0.1, scaleInDir);
                            const minAllowedLocalR = rockMeshRadiusLocal + localNodeMargin;

                            // Benturan terjadi jika simpul masuk ke dalam batas batu dan berada di rentang tinggi batu
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

                                    // HANYA hentikan kecepatan jika menabrak FRONTAL (tegak lurus ke tebing batu):
                                    // Jika menyerong / menyusuri celah, kecepatan tetap berjalan sehingga bisa slide mulus melewati celah
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
        if (Array.isArray(treesList) && treesList.length > 0) {
            for (let i = 0; i < treesList.length; i++) {
                const tree = treesList[i];
                if (!tree || !tree.visible) continue;
                const tx = tree.position.x;
                const tz = tree.position.z;

                const toTreeX = tx - camPos.x;
                const toTreeZ = tz - camPos.z;
                const proj = toTreeX * normDirX + toTreeZ * normDirZ;
                // Hanya periksa pohon yang batangnya berada di antara kamera dan rubah
                if (proj < 0.4 || proj > distCamToFoxXZ - 0.4) continue;
                const perpSq = (toTreeX * toTreeX + toTreeZ * toTreeZ) - (proj * proj);
                if (perpSq > 9.0) continue; // Max 3m ke samping

                // Batang pohon kandidat (mesh silinder ringan)
                if (tree.userData && tree.userData.trunkGroup) {
                    candidateTreeTrunks.push(tree.userData.trunkGroup);
                } else {
                    candidateTreeTrunks.push(tree);
                }
            }
        }

        let isAllOccluded = true;

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

            // 1. Uji Bebatuan kandidat (hanya batuan di koridor pandang)
            if (candidateRocks.length > 0) {
                const rockHits = _occlusionRaycaster.intersectObjects(candidateRocks, false);
                if (rockHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 2. Uji Batang Pohon kandidat (silinder batang ringan)
            if (!isPointBlocked && candidateTreeTrunks.length > 0) {
                const trunkHits = _occlusionRaycaster.intersectObjects(candidateTreeTrunks, true);
                if (trunkHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 3. Uji Bukit / Terrain di ANTARA Kamera dan Rubah
            // Catatan: Berhenti 1.2m sebelum rubah agar tidak salah mendeteksi bukit / lereng tempat rubah berdiri
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
                    // Terhalang hanya jika sinar benar-benar menembus ke dalam tanah
                    if (rayH < terrainH - 0.05) {
                        isPointBlocked = true;
                        break;
                    }
                }
            }

            // SHORT-CIRCUIT:
            // Syarat Eagle Vision adalah Fox 100% tertutup.
            // Begitu ada SATU titik tubuh rubah yang terlihat jelas oleh kamera,
            // Fox dipastikan TIDAK tertutup. Hentikan raycast seketika!
            if (!isPointBlocked) {
                isAllOccluded = false;
                break;
            }
        }

        _cachedFoxOccluded = isAllOccluded;
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
    const earFoldZ = THREE.MathUtils.lerp(huntEarFold, -0.55, foxProneBlend);
    earLJoint.rotation.set(
        THREE.MathUtils.lerp(earTwitchL.x + huntRatio * 0.15, 0, foxProneBlend),
        THREE.MathUtils.lerp(earTwitchL.y + turnRate * 0.08, 0, foxProneBlend),
        earFoldZ + earTwitchL.z * (1.0 - foxProneBlend)
    );
    earRJoint.rotation.set(
        THREE.MathUtils.lerp(earTwitchR.x - huntRatio * 0.15, 0, foxProneBlend),
        THREE.MathUtils.lerp(earTwitchR.y + turnRate * 0.08, 0, foxProneBlend),
        earFoldZ + earTwitchR.z * (1.0 - foxProneBlend)
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
        foxIdleTimer = 0;
        manualProne = false;
        foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, 0, Math.min(1.0, 12 * dt));

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
        // --- LOGIKA IDLE & TRANSISI PRONE / MENGENDAP (Sesuai sample-prone.html) ---
        foxIdleTimer += dt;
        const shouldProne = manualProne || (foxIdleTimer >= FOX_IDLE_PRONE_THRESHOLD);
        if (shouldProne) {
            foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, 1.0, Math.min(1.0, 3.8 * dt));
        } else {
            foxProneBlend = THREE.MathUtils.lerp(foxProneBlend, 0.0, Math.min(1.0, 6.0 * dt));
        }
        window.foxIdleTimer = foxIdleTimer;
        window.foxProneBlend = foxProneBlend;

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

        // Stand vs Prone: Posisi & Kemiringan Tubuh
        const standBreath = Math.sin(elapsed * 2.3) * 0.014;
        const standBodyY = BASE_HIP_Y - huntHipDrop + standBreath - landingSquash;
        const standBodyPitch = 0.06 * huntRatio + landingSquash * 0.18;

        const proneBreath = Math.sin(elapsed * 3.0) * 0.008; // Napas tegang predator saat mengendap
        const proneBodyY = 0.52 + proneBreath;
        const proneBodyPitch = 0.14; // Condong ke depan siap menerkam

        const targetBodyY = THREE.MathUtils.lerp(standBodyY, proneBodyY, foxProneBlend);
        const targetBodyPitch = THREE.MathUtils.lerp(standBodyPitch, proneBodyPitch, foxProneBlend);

        bodyTiltGroup.position.y = THREE.MathUtils.lerp(bodyTiltGroup.position.y, targetBodyY, 8 * dt);
        bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(bodyTiltGroup.rotation.z, targetBodyPitch, 8 * dt);

        // Leher & Kepala (Stand look-around vs Prone ground-stalking)
        const proneNeckYaw = Math.sin(elapsed * 1.5) * 0.05;
        const proneHeadYaw = proneNeckYaw * 0.8;
        const proneNeckPitch = -0.18;
        const proneHeadPitch = 0.08;
        const proneHeadRoll = 0.00;

        const targetNeckY = THREE.MathUtils.lerp(targetNeckYaw + idleLookCurrentYaw * 0.42, proneNeckYaw, foxProneBlend);
        const targetHeadY = THREE.MathUtils.lerp(targetHeadYaw + idleLookCurrentYaw * 0.65, proneHeadYaw, foxProneBlend);
        neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckY, 8 * dt);
        headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadY, 9 * dt);

        const targetNeckZ = THREE.MathUtils.lerp(huntNeckPitch + idleLookCurrentPitch * 0.4 + Math.sin(elapsed * 2.3 - 0.5) * 0.02, proneNeckPitch, foxProneBlend);
        const targetHeadZ = THREE.MathUtils.lerp(huntHeadPitch + idleLookCurrentPitch * 0.65 - Math.sin(elapsed * 2.3 - 0.5) * 0.015, proneHeadPitch, foxProneBlend);
        neckJoint.rotation.z = THREE.MathUtils.lerp(neckJoint.rotation.z, targetNeckZ, 7 * dt);
        headJoint.rotation.z = THREE.MathUtils.lerp(headJoint.rotation.z, targetHeadZ, 8 * dt);

        const targetHeadX = THREE.MathUtils.lerp(idleLookCurrentRoll, proneHeadRoll, foxProneBlend);
        headJoint.rotation.x = THREE.MathUtils.lerp(headJoint.rotation.x, targetHeadX, 8 * dt);

        // B. PAW FIDGETING (Hanya saat berdiri, dimatikan saat mengendap/prone)
        if (foxProneBlend > 0.08) {
            idlePawActiveLeg = null;
        } else if (!idlePawActiveLeg) {
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

        if (idlePawActiveLeg && foxProneBlend < 0.08) {
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

        bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(bodyTiltGroup.rotation.x, THREE.MathUtils.lerp(safeBankRoll + weightShiftRoll, 0, foxProneBlend), 6 * dt);

        // Kaki Menekuk Merayap / Splay Hip X (Khas Hewan Mengendap di Tanah dari sample-prone.html)
        legFL.hip.rotation.x = THREE.MathUtils.lerp(legFL.hip.rotation.x, 0.10 * foxProneBlend, 7 * dt);
        legFR.hip.rotation.x = THREE.MathUtils.lerp(legFR.hip.rotation.x, -0.10 * foxProneBlend, 7 * dt);
        legBL.hip.rotation.x = THREE.MathUtils.lerp(legBL.hip.rotation.x, 0.22 * foxProneBlend, 7 * dt);
        legBR.hip.rotation.x = THREE.MathUtils.lerp(legBR.hip.rotation.x, -0.22 * foxProneBlend, 7 * dt);

        // Artikulasi Kaki Depan Kiri (FL)
        const baseHipFL = 0.26 * huntRatio, baseKneeFL = -0.48 * huntRatio, basePawFL = 0.22 * huntRatio;
        const targetHipFL = THREE.MathUtils.lerp(baseHipFL - pawLiftFL * 0.16, 0.95, foxProneBlend);
        const targetKneeFL = THREE.MathUtils.lerp(baseKneeFL - pawLiftFL * 0.72, -2.58, foxProneBlend);
        const targetPawFL = THREE.MathUtils.lerp(basePawFL + pawLiftFL * 0.55, 0.56, foxProneBlend);
        legFL.hip.rotation.z = THREE.MathUtils.lerp(legFL.hip.rotation.z, targetHipFL, 7 * dt);
        legFL.knee.rotation.z = THREE.MathUtils.lerp(legFL.knee.rotation.z, targetKneeFL, 7 * dt);
        legFL.paw.rotation.z = THREE.MathUtils.lerp(legFL.paw.rotation.z, targetPawFL, 7 * dt);

        // Artikulasi Kaki Depan Kanan (FR)
        const baseHipFR = 0.26 * huntRatio, baseKneeFR = -0.48 * huntRatio, basePawFR = 0.22 * huntRatio;
        const targetHipFR = THREE.MathUtils.lerp(baseHipFR - pawLiftFR * 0.16, 0.98, foxProneBlend);
        const targetKneeFR = THREE.MathUtils.lerp(baseKneeFR - pawLiftFR * 0.72, -2.62, foxProneBlend);
        const targetPawFR = THREE.MathUtils.lerp(basePawFR + pawLiftFR * 0.55, 0.54, foxProneBlend);
        legFR.hip.rotation.z = THREE.MathUtils.lerp(legFR.hip.rotation.z, targetHipFR, 7 * dt);
        legFR.knee.rotation.z = THREE.MathUtils.lerp(legFR.knee.rotation.z, targetKneeFR, 7 * dt);
        legFR.paw.rotation.z = THREE.MathUtils.lerp(legFR.paw.rotation.z, targetPawFR, 7 * dt);

        // Artikulasi Kaki Belakang Kiri (BL) - Menekuk tajam siap melompat
        const baseHipBL = -0.28 * huntRatio, baseKneeBL = 0.52 * huntRatio, basePawBL = -0.24 * huntRatio;
        const targetHipBL = THREE.MathUtils.lerp(baseHipBL + pawLiftBL * 0.28, 0.65, foxProneBlend);
        const targetKneeBL = THREE.MathUtils.lerp(baseKneeBL + pawLiftBL * 0.38, -1.95, foxProneBlend);
        const targetPawBL = THREE.MathUtils.lerp(basePawBL - pawLiftBL * 0.35, 0.30, foxProneBlend);
        legBL.hip.rotation.z = THREE.MathUtils.lerp(legBL.hip.rotation.z, targetHipBL, 7 * dt);
        legBL.knee.rotation.z = THREE.MathUtils.lerp(legBL.knee.rotation.z, targetKneeBL, 7 * dt);
        legBL.paw.rotation.z = THREE.MathUtils.lerp(legBL.paw.rotation.z, targetPawBL, 7 * dt);

        // Artikulasi Kaki Belakang Kanan (BR) - Menekuk tajam siap melompat
        const baseHipBR = -0.28 * huntRatio, baseKneeBR = 0.52 * huntRatio, basePawBR = -0.24 * huntRatio;
        const targetHipBR = THREE.MathUtils.lerp(baseHipBR + pawLiftBR * 0.28, 0.65, foxProneBlend);
        const targetKneeBR = THREE.MathUtils.lerp(baseKneeBR + pawLiftBR * 0.38, -1.99, foxProneBlend);
        const targetPawBR = THREE.MathUtils.lerp(basePawBR - pawLiftBR * 0.35, 0.30, foxProneBlend);
        legBR.hip.rotation.z = THREE.MathUtils.lerp(legBR.hip.rotation.z, targetHipBR, 7 * dt);
        legBR.knee.rotation.z = THREE.MathUtils.lerp(legBR.knee.rotation.z, targetKneeBR, 7 * dt);
        legBR.paw.rotation.z = THREE.MathUtils.lerp(legBR.paw.rotation.z, targetPawBR, 7 * dt);

        // Ekor (Mendatar di lantai dengan kibasan ujung waspada saat prone)
        const proneTailTwitch = Math.sin(elapsed * 4.0) * 0.12;
        const idleTailLift = 0.34 * huntRatio;
        const standTailBaseZ = idleTailLift + Math.sin(elapsed * 1.8) * 0.03;
        const standTailMidZ = idleTailLift * 0.6 + Math.sin(elapsed * 1.8 - 0.6) * 0.04;
        const standTailTipZ = 0.08 * huntRatio;

        const targetTailBaseZ = THREE.MathUtils.lerp(standTailBaseZ, 0.05, foxProneBlend);
        const targetTailMidZ = THREE.MathUtils.lerp(standTailMidZ, -0.05, foxProneBlend);
        const targetTailTipZ = THREE.MathUtils.lerp(standTailTipZ, 0.02, foxProneBlend);

        tailBaseJoint.rotation.z = THREE.MathUtils.lerp(tailBaseJoint.rotation.z, targetTailBaseZ, 6 * dt);
        tailMidJoint.rotation.z = THREE.MathUtils.lerp(tailMidJoint.rotation.z, targetTailMidZ, 6 * dt);
        tailTipJoint.rotation.z = THREE.MathUtils.lerp(tailTipJoint.rotation.z, targetTailTipZ, 6 * dt);

        const baseWave = Math.sin(elapsed * 1.6) * 0.055;
        const standTailBaseY = baseWave + tailFlickAmp * 0.45;
        const standTailMidY = Math.sin(elapsed * 1.6 - 0.7) * 0.085 + tailFlickAmp * 0.85;
        const standTailTipY = Math.sin(elapsed * 1.6 - 1.4) * 0.11 + tailFlickAmp * 1.2;

        const targetTailBaseY = THREE.MathUtils.lerp(standTailBaseY, proneTailTwitch * 0.4, foxProneBlend);
        const targetTailMidY = THREE.MathUtils.lerp(standTailMidY, proneTailTwitch * 0.7, foxProneBlend);
        const targetTailTipY = THREE.MathUtils.lerp(standTailTipY, proneTailTwitch * 1.0, foxProneBlend);

        tailBaseJoint.rotation.y = THREE.MathUtils.lerp(tailBaseJoint.rotation.y, targetTailBaseY, 7 * dt);
        tailMidJoint.rotation.y = THREE.MathUtils.lerp(tailMidJoint.rotation.y, targetTailMidY, 7 * dt);
        tailTipJoint.rotation.y = THREE.MathUtils.lerp(tailTipJoint.rotation.y, targetTailTipY, 7 * dt);
    }
}
window.updateWolfLocomotionAnimation = updateWolfLocomotionAnimation;
window.updateLegArticulation = updateLegArticulation;
