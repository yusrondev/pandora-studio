/* Low-Poly Fox Physics, Locomotion, 3D Collision, and Spring-Arm Camera Occlusion */

const keys = { w: false, a: false, s: false, d: false, shift: false, space: false, q: false };
window.keys = keys;

// ========================================================
// FIX ROTASI KAMERA SAAT SPRINT (SHIFT + DRAG MOUSE)
// OrbitControls bawaan Three.js mengubah LEFT CLICK menjadi PAN jika event.shiftKey == true.
// Saat enablePan = false di Play Mode, OrbitControls membatalkan rotasi mouse.
// ========================================================
try {
    const _origShiftGetter = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'shiftKey')?.get;
    if (_origShiftGetter) {
        Object.defineProperty(MouseEvent.prototype, 'shiftKey', {
            get() {
                // Di Play Mode, pointer / mouse event selalu mengabaikan shiftKey agar kamera bebas berputar saat sprint
                if (typeof isPlayMode !== 'undefined' && isPlayMode) {
                    return false;
                }
                return _origShiftGetter.call(this);
            },
            configurable: true
        });
    }
} catch (err) {
    console.warn('ShiftKey proxy fallback:', err);
}

function preventOrbitControlsShiftPan(e) {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        try {
            Object.defineProperty(e, 'shiftKey', {
                get: () => false,
                configurable: true
            });
        } catch (err) {}
    }
}
window.addEventListener('pointerdown', preventOrbitControlsShiftPan, { capture: true });
window.addEventListener('pointermove', preventOrbitControlsShiftPan, { capture: true });
window.addEventListener('mousedown', preventOrbitControlsShiftPan, { capture: true });
window.addEventListener('mousemove', preventOrbitControlsShiftPan, { capture: true });

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
    if (k === 'q' || code === 'KeyQ') {
        keys.q = true;
        if (typeof startWolfBlock === 'function') {
            startWolfBlock();
        }
    }
    if (k === 'c' || code === 'KeyC') {
        manualProne = !manualProne;
        if (!manualProne) foxIdleTimer = 0;
    }
    if (keys.w || keys.s || keys.a || keys.d || keys.space) {
        manualProne = false;
        foxIdleTimer = 0;
        if (typeof wolfCharacter !== 'undefined' && wolfCharacter) {
            if (wolfCharacter.isTakingHit) return; // Hit stun: tidak bisa membatalkan animasi hit dengan tombol gerak
            // Input terakhir = prioritas: hanya tombol gerak yang BARU ditekan (bukan auto-repeat / tombol
            // yang sudah ditahan sebelum klik kanan) yang membatalkan tendangan.
            const isMoveKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) ||
                ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code);
            if (isMoveKey && !e.repeat) {
                if (wolfCharacter.isKicking && (!wolfCharacter.isFlyingKick || wolfCharacter.kickTimer > 0.85) && typeof wolfCharacter.cancelKick === 'function') wolfCharacter.cancelKick();
                if (wolfCharacter.isPunching && (!wolfCharacter.isFlyingPunch || wolfCharacter.punchTimer > 0.85) && typeof wolfCharacter.cancelPunch === 'function') wolfCharacter.cancelPunch();
            }
            wolfCharacter.idleTimer = 0.0;
            wolfCharacter.activeIdleKey = null;
            wolfCharacter.idleCycleTimer = 0.0;
        }
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
    if (k === 'q' || code === 'KeyQ') {
        keys.q = false;
        if (typeof stopWolfBlock === 'function') {
            stopWolfBlock();
        }
    }

    // FIX BUG: Saat pemain melepas tombol gerak, reset idleTimer seketika ke 0.0
    // sehingga variasi idle lanjutan TIDAK AKAN PERNAH langsung muncul
    const anyMoveActive = keys.w || keys.s || keys.a || keys.d || keys.space;
    if (!anyMoveActive && typeof wolfCharacter !== 'undefined' && wolfCharacter) {
        wolfCharacter.idleTimer = 0.0;
        wolfCharacter.activeIdleKey = null;
        wolfCharacter.idleCycleTimer = 0.0;
    }
});

// User preferred camera distance (bisa di zoom in/out bebas oleh user)
let userPreferredDist = 5.4;
let currentCamDist = 5.4;
let isCameraOccluded = false;

// ========================================================
// SISTEM VISUAL EAGLE VISION OUTLINE & SILUET (ASSASSIN'S CREED)
// ========================================================
let eagleVisionMaterialSkinned = null;
let eagleVisionMaterialStatic = null;
const eagleVisionUniforms = {
    uColor: { value: new THREE.Color(0xff2238) },    // Assassin's Creed crimson-red base
    uRimColor: { value: new THREE.Color(0xffaa33) }, // Intense orange-amber edge glow
    uTime: { value: 0.0 },
    uAlpha: { value: 0.0 }
};
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

function getOrCreateEagleVisionMaterial(isSkinned = false) {
    if (isSkinned) {
        if (!eagleVisionMaterialSkinned) {
            eagleVisionMaterialSkinned = new THREE.ShaderMaterial({
                uniforms: eagleVisionUniforms,
                vertexShader: `
                    #ifdef USE_SKINNING
                        #include <skinning_pars_vertex>
                    #endif
                    varying vec3 vNormal;
                    varying vec3 vViewPosition;
                    void main() {
                        vec3 transformed = vec3( position );
                        vec3 objectNormal = vec3( normal );
                        #ifdef USE_SKINNING
                            #include <skinbase_vertex>
                            #include <skinnormal_vertex>
                            #include <skinning_vertex>
                        #endif
                        // Ekspansi normal mikro untuk outline siluet luar yang presisi & tajam
                        vec3 expanded = transformed + objectNormal * 0.012;
                        vec4 mvPosition = modelViewMatrix * vec4(expanded, 1.0);
                        vNormal = normalize(normalMatrix * objectNormal);
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
                side: THREE.FrontSide,
                skinning: true
            });
        }
        return eagleVisionMaterialSkinned;
    } else {
        if (!eagleVisionMaterialStatic) {
            eagleVisionMaterialStatic = new THREE.ShaderMaterial({
                uniforms: eagleVisionUniforms,
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
                        
                        float NdotV = max(0.0, dot(normal, viewDir));
                        float rim = 1.0 - NdotV;
                        float rimFactor = pow(rim, 2.0);

                        float pulse = 0.88 + 0.12 * sin(uTime * 4.5);
                        
                        vec3 col = mix(uColor, uRimColor, rimFactor * 0.90) * pulse;
                        float alpha = (0.42 + 0.58 * rimFactor) * uAlpha;
                        
                        gl_FragColor = vec4(col, alpha);
                    }
                `,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.FrontSide,
                skinning: false
            });
        }
        return eagleVisionMaterialStatic;
    }
}

function ensureFoxEagleVisionSystem(wolfChar) {
    if (!wolfChar || !wolfChar.root) return;
    const root = wolfChar.root;

    const meshesToTwin = [];
    root.traverse((child) => {
        if (child.isMesh && !child.userData.isEagleVisionTwin) {
            meshesToTwin.push(child);
        }
    });

    // Jika mesh model karakter belum siap / masih di-load oleh asset manager, tunggu
    if (meshesToTwin.length === 0) return;

    // Jika sudah memiliki twin yang valid dan jumlahnya sesuai
    if (lastEagleVisionRoot === root && root.userData.hasEagleVisionTwins && eagleVisionMeshList.length === meshesToTwin.length) {
        return;
    }

    // Bersihkan twin lama jika ada
    for (let i = 0; i < eagleVisionMeshList.length; i++) {
        const oldTwin = eagleVisionMeshList[i];
        if (oldTwin && oldTwin.parent) {
            oldTwin.parent.remove(oldTwin);
        }
    }
    eagleVisionMeshList = [];

    const matSkinned = getOrCreateEagleVisionMaterial(true);
    const matStatic = getOrCreateEagleVisionMaterial(false);

    for (let i = 0; i < meshesToTwin.length; i++) {
        const origMesh = meshesToTwin[i];
        let twin;
        if (origMesh.isSkinnedMesh && origMesh.skeleton) {
            twin = new THREE.SkinnedMesh(origMesh.geometry, matSkinned);
            twin.bind(origMesh.skeleton, origMesh.bindMatrix);
            if (origMesh.bindMode) twin.bindMode = origMesh.bindMode;
            if (origMesh.bindMatrixInverse) twin.bindMatrixInverse.copy(origMesh.bindMatrixInverse);
        } else {
            twin = new THREE.Mesh(origMesh.geometry, matStatic);
        }
        twin.name = 'eagleVisionTwin_' + i;
        twin.userData.isEagleVisionTwin = true;
        twin.renderOrder = 999999;
        twin.castShadow = false;
        twin.receiveShadow = false;
        twin.frustumCulled = false;
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

function updateFoxEagleVisionVisibility(isOccluded, dt, elapsed) {
    const targetAlpha = isOccluded ? 1.0 : 0.0;
    const fadeRate = isOccluded ? 10.0 : 8.0;
    currentEagleVisionAlpha += (targetAlpha - currentEagleVisionAlpha) * Math.min(1.0, fadeRate * dt);

    eagleVisionUniforms.uAlpha.value = currentEagleVisionAlpha;
    eagleVisionUniforms.uTime.value = elapsed;

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

// Persistent camera orbit angles (memastikan kamera tidak pernah terpental/jitter oleh ground clamp atau OrbitControls)
let camOrbitYaw = null;
let camOrbitPitch = THREE.MathUtils.degToRad(18.0);
let _lastFollowSign = 1;

// Delta akumulasi rotasi kamera dari sentuhan layar mobile (Multitouch look)
let pendingCameraYawDelta = 0.0;
let pendingCameraPitchDelta = 0.0;

// Multi-Touch listener pada Canvas (Kamera bebas digerakkan bersamaan dengan Analog Joystick)
window.addEventListener('touchstart', (e) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // 1. Abaikan touch joystick (baik via touchId maupun area kiri layar untuk analog)
        if (typeof window.activeJoystickTouchId !== 'undefined' && window.activeJoystickTouchId !== null && touch.identifier === window.activeJoystickTouchId) {
            continue;
        }

        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const inJoystick = el && el.closest && el.closest('#mobile-joystick-zone');
        // Dedikasi area kiri bawah layar (45% lebar layar) untuk kontrol joystick gerak, BUKAN kamera
        const inLeftMovementZone = (touch.clientX < window.innerWidth * 0.45 && touch.clientY > window.innerHeight * 0.30);
        const inActionBtn = el && el.closest && (el.closest('.mobile-action-btn') || el.closest('#btn-mobile-exit-demo'));
        const inToolbar = el && el.closest && el.closest('#top-toolbar');
        const inSpecies = el && el.closest && el.closest('#fox-species-bar');

        if (!inJoystick && !inLeftMovementZone && !inActionBtn && !inToolbar && !inSpecies) {
            activeCameraTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            isInteractingWithCamera = true;
            cameraReleaseTimer = 2.0;
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

    // Geser kamera dengan jari kamera (bahkan saat jempol lain sedang menekan joystick atau action button)
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Pastikan bukan touch joystick
        if (typeof window.activeJoystickTouchId !== 'undefined' && window.activeJoystickTouchId !== null && touch.identifier === window.activeJoystickTouchId) {
            activeCameraTouches.delete(touch.identifier);
            continue;
        }

        if (activeCameraTouches.has(touch.identifier)) {
            const prev = activeCameraTouches.get(touch.identifier);
            let dx = touch.clientX - prev.x;
            let dy = touch.clientY - prev.y;

            // Clamp lonjakan delta per-frame untuk mencegah kamera terpental akibat teleport touch
            dx = THREE.MathUtils.clamp(dx, -60, 60);
            dy = THREE.MathUtils.clamp(dy, -60, 60);

            // Sensitivitas usapan jempol kamera mobile (natural, halus, dan presisi)
            // Arah vertikal (Pitch) di-reverse (inverted Y-axis) sesuai preferensi kontrol
            const SENSITIVITY_YAW = 0.0050;
            const SENSITIVITY_PITCH = 0.0040;
            pendingCameraYawDelta -= dx * SENSITIVITY_YAW;
            pendingCameraPitchDelta += dy * SENSITIVITY_PITCH;

            activeCameraTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            cameraTouchMoved = true;
        }
    }

    if (activeCameraTouches.size >= 2) {
        const touches = Array.from(activeCameraTouches.values());
        const currentPinch = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        if (lastPinchDistance !== null && lastPinchDistance > 10 && currentPinch > 10) {
            const pinchRatio = currentPinch / lastPinchDistance;
            // Batasi perubahan zoom per-frame agar kamera tidak terpental
            const zoomDelta = THREE.MathUtils.clamp((1.0 - pinchRatio) * userPreferredDist * 1.2, -0.6, 0.6);
            userPreferredDist = THREE.MathUtils.clamp(userPreferredDist + zoomDelta, 3.0, 18.0);
        }
        lastPinchDistance = currentPinch;
    }

    if (cameraTouchMoved) {
        isInteractingWithCamera = true;
        cameraReleaseTimer = 2.0;
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
        cameraReleaseTimer = 1.8;
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
let isFoxSwimmingDeep = false;
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

function updateLegArticulation(leg, phase, intensity, isFront, crouchAmount, isPivotOnly = false) {}
function updateDogPaddleLegFront(leg, phase, intensity, isSprint, dt) {}
function updateDogPaddleLegBack(leg, phase, intensity, isSprint, dt) {}

// Realistic Knockback Physics State
let playerKnockbackVel = new THREE.Vector3();
window.playerKnockbackVel = playerKnockbackVel;

function applyPlayerKnockback(impulseVec, verticalPop = 0) {
    if (!wolfCharacter || !wolfCharacter.root) return;
    playerKnockbackVel.add(impulseVec);
    velocityY = Math.max(velocityY, 0) + verticalPop;
    isGrounded = false;
    landingSquash = 0.12;

    // Screen hit damage flash (red vignette)
    const dmgVignette = document.getElementById('player-damage-vignette');
    if (dmgVignette) {
        dmgVignette.classList.add('active');
        setTimeout(() => {
            if (dmgVignette) dmgVignette.classList.remove('active');
        }, 320);
    }

    if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playJump) {
        foxSoundFX.playJump();
    }
}
window.applyPlayerKnockback = applyPlayerKnockback;

/**
 * Mencari dan mengunci musuh terdekat untuk sistem Camera Auto-Lock & Camera-Relative Movement.
 * Memprioritaskan musuh terdekat dengan sisa HP paling rendah, dengan target-stickiness
 * agar kamera tidak glitch atau berpindah-pindah target saat sedang bertarung.
 */
function getCombatLockTarget(playerRoot, acquireRange = 9.5, releaseRange = 12.0) {
    if (!playerRoot) return null;
    const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) ? spawnedFoxesList : [];
    if (list.length === 0) {
        playerRoot._combatLockTarget = null;
        window.currentCombatLockTarget = null;
        return null;
    }

    const pPos = playerRoot.position;

    // TARGET STICKINESS: Jika musuh sebelumnya masih hidup dan dalam jarak toleransi (releaseRange),
    // pertahankan target agar kamera dan kontrol analog stabil tanpa jitter
    const prev = playerRoot._combatLockTarget || playerRoot._lockedAttackTarget;
    if (prev && prev.root && prev.root.visible) {
        const isDead = (prev.ai && prev.ai.isDead) || (prev.model && prev.model.isDead) || ((prev.health || 0) <= 0);
        if (!isDead) {
            const curDist = pPos.distanceTo(prev.root.position);
            if (curDist <= releaseRange) {
                playerRoot._combatLockTarget = prev;
                window.currentCombatLockTarget = prev;
                return prev;
            }
        }
    }

    let bestTarget = null;
    let bestScore = Infinity;

    const forwardX = Math.sin(playerRoot.rotation.y);
    const forwardZ = Math.cos(playerRoot.rotation.y);

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || !item.root || !item.root.visible) continue;
        const isDead = (item.ai && item.ai.isDead) || (item.model && item.model.isDead) || ((item.health || 0) <= 0);
        if (isDead) continue;

        const ePos = item.root.position;
        const dx = ePos.x - pPos.x;
        const dz = ePos.z - pPos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > acquireRange * acquireRange || distSq < 0.04) continue;

        const dist = Math.sqrt(distSq);
        const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;

        const curHp = (item.ai && typeof item.ai.health === 'number') ? item.ai.health : (item.health || 100);
        const maxHp = (item.ai && typeof item.ai.maxHealth === 'number') ? item.ai.maxHealth : (item.maxHealth || 100);
        const hpRatio = THREE.MathUtils.clamp(curHp / Math.max(1, maxHp), 0, 1);

        // FORMULA SKOR: Jarak terdekat + HP bar terkecil - bias arah hadapan
        const score = (dist * 1.0) + (hpRatio * 1.5) - (dot * 0.4);

        if (score < bestScore) {
            bestScore = score;
            bestTarget = item;
        }
    }

    playerRoot._combatLockTarget = bestTarget;
    window.currentCombatLockTarget = bestTarget;
    return bestTarget;
}
window.getCombatLockTarget = getCombatLockTarget;

function updateWolfPhysics(dt, elapsed) {
    if (!wolfCharacter) return;
    dt = Math.min(dt, 0.05);

    // Kematian Pemain: Tetap di animasi dead (frame terakhir), hentikan pergerakan
    const isPlayerDead = !!((typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) || (wolfCharacter && wolfCharacter.isDead));
    if (isPlayerDead) {
        currentSpeed = 0;
        currentTurnRate = 0;
        velocityY = 0;
        if (wolfCharacter.root) {
            const groundH = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(wolfCharacter.root.position.x, wolfCharacter.root.position.z) : 0;
            wolfCharacter.root.position.y = groundH;
        }
        if (typeof wolfCharacter.updateAnimation === 'function') {
            wolfCharacter.updateAnimation(dt, 0);
        }
        return;
    }

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

    const foxScale = foxRoot.scale.x || 1.85;

    // Ambil konfigurasi stats spesifik spesies yang sedang aktif
    const stats = (typeof getCurrentFoxStats === 'function') ? getCurrentFoxStats() : {
        walkSpeed: 1.65,
        runSpeed: 6.5,
        reverseSpeed: 1.2,
        turnRate: 2.6,
        turnAccel: 8.5,
        jumpPower: 5.2
    };

    const analogFwd = (typeof mobileJoystickForward !== 'undefined') ? mobileJoystickForward : 0;
    const analogTurn = (typeof mobileJoystickTurn !== 'undefined') ? mobileJoystickTurn : 0;

    // Normalisasi input kontrol dari Virtual Joystick Mobile atau Keyboard WASD
    let inputX = 0;
    let inputY = 0;
    const hasJoy = (typeof mobileJoystickForward !== 'undefined' && typeof mobileJoystickTurn !== 'undefined');
    const joyMag = hasJoy ? Math.hypot(mobileJoystickTurn, mobileJoystickForward) : 0;

    if (hasJoy && joyMag > 0.05) {
        inputX = mobileJoystickTurn;
        inputY = mobileJoystickForward;
    } else {
        if (keys.w) inputY += 1.0;
        if (keys.s) inputY -= 1.0;
        if (keys.a) inputX -= 1.0;
        if (keys.d) inputX += 1.0;
    }

    const inputMag = Math.hypot(inputX, inputY);
    if (inputMag > 1.0) {
        inputX /= inputMag;
        inputY /= inputMag;
    }
    window.currentFoxInputMag = inputMag;

    // Update Sistem Stamina:
    // Berkurang saat sprint aktif (input gerak + Shift / joystick cepat), bertambah saat santai/diam
    const isMovingActively = inputMag > 0.15;
    const isSprintingAllowed = (typeof FoxStaminaState !== 'undefined')
        ? FoxStaminaState.update(dt, keys.shift, isMovingActively)
        : keys.shift;

    const isHunting = isSprintingAllowed;
    huntBlend = THREE.MathUtils.lerp(huntBlend, isHunting ? 1.0 : 0.0, 7.0 * dt);

    const walkSpeed = stats.walkSpeed;
    const huntRunSpeed = stats.runSpeed;
    const reverseSpeed = stats.reverseSpeed || 1.35;
    const fastReverseSpeed = stats.fastReverseSpeed || (reverseSpeed * 2.3);

    // Deteksi interupsi aksi oleh pergerakan pemain
    const hasMoveInput = inputMag > 0.05;
    if (wolfCharacter) {
        // Joystick / Input baru: HANYA batalkan jika serangan sudah melewati fase benturan mendarat
        // Mencegah animasi terpotong seketika di awal yang membuat stamina terkuras tanpa animasi terlaksana!
        if (wolfCharacter.isKicking && hasMoveInput && !wolfCharacter._joyWasActive && (wolfCharacter.isFlyingKick ? wolfCharacter.kickTimer > 0.85 : wolfCharacter.kickTimer > 0.35)) {
            if (typeof wolfCharacter.cancelKick === 'function') wolfCharacter.cancelKick();
        }
        if (wolfCharacter.isPunching && hasMoveInput && !wolfCharacter._joyWasActive && (wolfCharacter.isFlyingPunch ? wolfCharacter.punchTimer > 0.85 : wolfCharacter.punchTimer > 0.30)) {
            if (typeof wolfCharacter.cancelPunch === 'function') wolfCharacter.cancelPunch();
        }
        wolfCharacter._joyWasActive = !!hasMoveInput;

        if (!wolfCharacter.isKicking && !wolfCharacter.isPunching && (hasMoveInput || Math.abs(currentSpeed) > 0.02 || Math.abs(currentTurnRate) > 0.02)) {
            wolfCharacter.idleTimer = 0.0;
            wolfCharacter.activeIdleKey = null;
            wolfCharacter.idleCycleTimer = 0.0;
        }
    }

    // Kunci kontrol saat sedang melompat di tempat (stationary jump) atau saat combat/terkena hit/shield
    const isStationaryJumping = !!(wolfCharacter && wolfCharacter.isJumping && wolfCharacter.isStationaryJump);
    const isPlayerInCombat = !!(wolfCharacter && (wolfCharacter.isKicking || wolfCharacter.isPunching || wolfCharacter.isTakingHit || wolfCharacter.isBlocking));
    const isMovementLocked = isPlayerInCombat || isStationaryJumping;

    // Vektor arah pandangan kamera pada bidang horizontal (XZ ground plane)
    let camFwd;
    if (camOrbitYaw !== null && typeof camOrbitYaw === 'number') {
        camFwd = new THREE.Vector3(-Math.sin(camOrbitYaw), 0, -Math.cos(camOrbitYaw));
    } else {
        camFwd = new THREE.Vector3().subVectors(controls.target, camera.position);
        camFwd.y = 0;
        if (camFwd.lengthSq() > 0.0001) {
            camFwd.normalize();
        } else {
            camFwd.set(0, 0, 1);
        }
    }
    // Vektor sisi kanan kamera (camFwd x UP): [-camFwd.z, 0, camFwd.x]
    const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);

    // Arah pergerakan dunia yang dihitung relatif terhadap sudut pandang (POV) kamera
    const moveWorldDir = new THREE.Vector3()
        .addScaledVector(camFwd, inputY)
        .addScaledVector(camRight, inputX);
    const moveDirLen = moveWorldDir.length();
    if (moveDirLen > 0.0001) {
        moveWorldDir.normalize();
    }

    // Auto-Lock target musuh terdekat untuk orientasi pertarungan & kamera
    const combatTarget = getCombatLockTarget(foxRoot, 9.5, 12.0);

    let targetSpeed = 0;
    let isMovingBackward = false;
    let targetFacingYaw = foxRoot.rotation.y;
    let moveDisplacement = new THREE.Vector3();

    if (isMovementLocked) {
        targetSpeed = 0;
        currentSpeed = 0;
        currentTurnRate = 0;
    } else {
        // Kontrol analog bebas berbasis POV kamera (Camera-Relative):
        // Karakter bebas bergerak dan menghadap ke segala arah mengikuti kemudi joystick di layar,
        // posisinya tidak terpaku / tidak terpatri titik hadapnya ke musuh.
        if (inputMag > 0.05) {
            isMovingBackward = false;
            targetSpeed = inputMag * (isHunting ? huntRunSpeed : walkSpeed);
            targetFacingYaw = Math.atan2(moveWorldDir.x, moveWorldDir.z);

            let yawDiff = (targetFacingYaw - foxRoot.rotation.y) % (Math.PI * 2);
            if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
            if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
            foxRoot.rotation.y += yawDiff * Math.min(1.0, stats.turnAccel * dt);
            currentTurnRate = THREE.MathUtils.lerp(currentTurnRate, yawDiff * 6.0, stats.turnAccel * dt);

            moveDisplacement.copy(moveWorldDir);
        } else {
            targetSpeed = 0;
            currentTurnRate = THREE.MathUtils.lerp(currentTurnRate, 0, stats.turnAccel * dt);
        }
    }

    // Hitung vektor arah maju (Hero model menghadap +Z secara lokal)
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), foxRoot.rotation.y);

    if (isMovementLocked) {
        currentSpeed = 0;
    } else {
        currentSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, 8.0 * dt);
    }
    window.currentFoxSpeed = currentSpeed;

    const speedNorm = Math.min(1, Math.abs(currentSpeed) / walkSpeed);
    const turnNorm = Math.abs(currentTurnRate) / (stats.turnRate || 2.5);
    const moveActivity = Math.max(speedNorm, turnNorm * 0.95);

    // Update HUD indicator jika ada
    const hudSpeed = document.getElementById('play-stat-speed');
    const hudState = document.getElementById('play-stat-state');
    if (hudSpeed) hudSpeed.innerText = (Math.abs(currentSpeed) * 2.2).toFixed(1) + ' m/s';

    if (hudState) {
        if (wolfCharacter && wolfCharacter.isBlocking) {
            hudState.innerText = "BERTAHAN (SHIELD / BLOCK)";
            hudState.style.color = "#38bdf8";
        } else if (wolfCharacter && wolfCharacter.isPunching) {
            hudState.innerText = "PUKULAN (PUNCH)";
            hudState.style.color = "#f59e0b";
        } else if (wolfCharacter && wolfCharacter.isKicking) {
            hudState.innerText = "TENDANGAN (KICK)";
            hudState.style.color = "#f43f5e";
        } else if (wolfCharacter && wolfCharacter.isJumping && wolfCharacter.isStationaryJump) {
            hudState.innerText = "LOMPAT DI TEMPAT";
            hudState.style.color = "#8be9fd";
        } else if (foxInWaterState) {
            hudState.innerText = isFoxSwimmingDeep ? "BERENANG (DOG PADDLE)" : "MENYEBRANG AIR (WADING)";
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

    if (Math.abs(currentSpeed) > 0.01 && !isMovementLocked) {
        const moveStep = moveDisplacement.clone().multiplyScalar(Math.abs(currentSpeed) * dt);
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

    // Realistic Knockback horizontal displacement & friction
    if (playerKnockbackVel.lengthSq() > 0.001 && !isPlayerInCombat) {
        foxRoot.position.x += playerKnockbackVel.x * dt;
        foxRoot.position.z += playerKnockbackVel.z * dt;
        camera.position.x += playerKnockbackVel.x * dt;
        camera.position.z += playerKnockbackVel.z * dt;
        playerKnockbackVel.multiplyScalar(Math.exp(-5.5 * dt));
    }

    // ========================================================
    // 1. COLLISION ANATOMI LENGKAP RUBAH TERHADAP POHON & OBJEK 3D
    // ========================================================
    // Simpul anatomis proteksi dari ujung hidung/moncong sampai pangkal ekor
    const fwdX = forward.x;
    const fwdZ = forward.z;
    let groundH = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(foxRoot.position.x, foxRoot.position.z) : 0;

    // Simpul anatomis kapsul silindris bipedal humanoid hero (100% mengikuti postur tegak)
    const heroRadius = 0.38 * (foxScale / 1.85);
    const foxCollisionNodes = [
        { offset: 0.00, radius: heroRadius } // Silinder terpusat di badan/pinggang hero
    ];

    if (typeof treesList !== 'undefined' && Array.isArray(treesList) && treesList.length > 0) {
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
                else if (tType.includes('pine')) baseRadius = 0.45;

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
    // 1C. COLLISION ASSET 3D IMPORT (GLB / GLTF)
    // Menahan laju rubah jika Auto Collision = ON (solid AABB / cylinder anti-tembus)
    // ========================================================
    if (Array.isArray(window.importedObjectsList) && window.importedObjectsList.length > 0) {
        const foxPosX = foxRoot.position.x;
        const foxPosZ = foxRoot.position.z;
        const foxPosY = foxRoot.position.y;

        for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < window.importedObjectsList.length; i++) {
                const item = window.importedObjectsList[i];
                if (!item || item.hasCollision === false || !item.root || !item.root.visible) continue;

                const rootPos = item.root.position;

                // Hitung atau perbarui world bounding box objek 3D untuk akurasi dimensi tinggi & lebar
                if (!item._box3) item._box3 = new THREE.Box3();
                item._box3.setFromObject(item.root);
                const box = item._box3;

                if (!box.isEmpty()) {
                    const objTop = box.max.y;
                    const objBottom = box.min.y;

                    // Lewati jika rubah secara vertikal jauh di bawah atau di atas objek
                    if (foxPosY + 1.7 < objBottom || foxPosY > objTop + 0.35) continue;

                    // Jika rubah mendarat di atas permukaan atap objek tinggi dari atas
                    if (foxPosY >= objTop - 0.25 && velocityY <= 0) {
                        continue;
                    }

                    // Solid collision terhadap bounding box 3D
                    for (let n = 0; n < foxCollisionNodes.length; n++) {
                        const node = foxCollisionNodes[n];
                        const nodeX = foxRoot.position.x + fwdX * node.offset;
                        const nodeZ = foxRoot.position.z + fwdZ * node.offset;
                        const nodeR = node.radius;

                        const clampX = THREE.MathUtils.clamp(nodeX, box.min.x, box.max.x);
                        const clampZ = THREE.MathUtils.clamp(nodeZ, box.min.z, box.max.z);

                        const diffX = nodeX - clampX;
                        const diffZ = nodeZ - clampZ;
                        const distSq = diffX * diffX + diffZ * diffZ;

                        if (distSq < nodeR * nodeR) {
                            const dist = Math.sqrt(distSq);
                            let pushX = 0, pushZ = 0;

                            if (dist > 0.0001) {
                                const pushAmt = nodeR - dist;
                                pushX = (diffX / dist) * pushAmt;
                                pushZ = (diffZ / dist) * pushAmt;
                            } else {
                                // Karakter berada di dalam volume: dorong keluar ke sisi terdekat
                                const dMinX = nodeX - box.min.x;
                                const dMaxX = box.max.x - nodeX;
                                const dMinZ = nodeZ - box.min.z;
                                const dMaxZ = box.max.z - nodeZ;
                                const minD = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);

                                if (minD === dMinX) pushX = -(dMinX + nodeR);
                                else if (minD === dMaxX) pushX = (dMaxX + nodeR);
                                else if (minD === dMinZ) pushZ = -(dMinZ + nodeR);
                                else pushZ = (dMaxZ + nodeR);
                            }

                            foxRoot.position.x += pushX;
                            foxRoot.position.z += pushZ;
                            camera.position.x += pushX;
                            camera.position.z += pushZ;

                            if (currentSpeed > 0.1) {
                                currentSpeed *= 0.4;
                            }
                        }
                    }
                } else {
                    // Fallback silinder jika bounding box kosong
                    const colRadius = item.collisionRadius || 1.2;
                    const colHeight = item.collisionHeight || 2.5;

                    const dxObj = foxPosX - rootPos.x;
                    const dzObj = foxPosZ - rootPos.z;
                    const maxCheckDist = colRadius + 4.0;
                    if (dxObj * dxObj + dzObj * dzObj > maxCheckDist * maxCheckDist) continue;
                    if (foxPosY < rootPos.y - 0.5 || foxPosY > rootPos.y + colHeight + 0.5) continue;

                    for (let n = 0; n < foxCollisionNodes.length; n++) {
                        const node = foxCollisionNodes[n];
                        const nodeX = foxRoot.position.x + fwdX * node.offset;
                        const nodeZ = foxRoot.position.z + fwdZ * node.offset;

                        const dx = nodeX - rootPos.x;
                        const dz = nodeZ - rootPos.z;
                        const distSq = dx * dx + dz * dz;
                        const minAllowedDist = colRadius + node.radius;

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
    }

    // ========================================================
    // 1D. COLLISION PRESISI PLAYER VS AI ENEMY (ANTI-TEMBUS)
    // Karakter pemain dan AI enemy saling menolak secara presisi (solid)
    // ========================================================
    if (Array.isArray(window.spawnedFoxesList) && window.spawnedFoxesList.length > 0) {
        const minPlayerEnemyDist = 0.85; // Jarak radius silinder tabrakan tubuh (memungkinkan pukulan rapat mengenai lawan)
        const pPos = foxRoot.position;
        for (let i = 0; i < window.spawnedFoxesList.length; i++) {
            const enemy = window.spawnedFoxesList[i];
            if (!enemy || !enemy.root || !enemy.root.visible) continue;
            const ePos = enemy.root.position;
            const dx = pPos.x - ePos.x;
            const dz = pPos.z - ePos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minPlayerEnemyDist * minPlayerEnemyDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const push = minPlayerEnemyDist - dist;
                pPos.x += (dx / dist) * (push * 0.55);
                pPos.z += (dz / dist) * (push * 0.55);
                ePos.x -= (dx / dist) * (push * 0.45);
                ePos.z -= (dz / dist) * (push * 0.45);
                if (typeof camera !== 'undefined' && camera && camera.position) {
                    camera.position.x += (dx / dist) * (push * 0.55);
                    camera.position.z += (dz / dist) * (push * 0.55);
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
        // Simpul anatomis kapsul silindris vertikal 100% mengikuti bentuk tubuh humanoid hero:
        // Dari pergelangan kaki, pinggul, dada/bahu, hingga kepala rubah
        const heroScaleFactor = foxScale / 1.85;
        const rockCollisionNodes = [
            { offset: 0.00, height: 0.35 * heroScaleFactor, radius: 0.32 * heroScaleFactor }, // Kaki & pergelangan
            { offset: 0.00, height: 0.85 * heroScaleFactor, radius: 0.36 * heroScaleFactor }, // Pinggul & sabuk kimono
            { offset: 0.00, height: 1.35 * heroScaleFactor, radius: 0.38 * heroScaleFactor }, // Dada & bahu
            { offset: 0.04 * heroScaleFactor, height: 1.70 * heroScaleFactor, radius: 0.28 * heroScaleFactor }  // Kepala & moncong rubah
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

            // Puncak batu dan ketinggian relatif
            const rockTopY = (rData.topY !== undefined) ? rData.topY : (rock.position.y + rock.scale.y * 1.12);
            const heightAboveFox = rockTopY - curFoxY;
            const rockTotalHeight = rockTopY - groundH;

            // Bebatuan TINGGI (tidak boleh dilewati / didaki dari tanah)
            const isTallRock = (heightAboveFox > maxStepUp) || (rockTotalHeight > maxStepUp);

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
            let isStandingOnRock = false;
            let canStepUpThisRock = false;

            if (isTallRock) {
                // Untuk batu tinggi, rubah HANYA bisa berdiri jika posisinya sudah berada di atas puncaknya
                if (curFoxY >= rockTopY - 0.40) {
                    const surfaceHCenter = getRockTopSurfaceAt(curFoxX, curFoxZ);
                    if (surfaceHCenter > -900 && Math.abs(surfaceHCenter - curFoxY) <= 0.45) {
                        isStandingOnRock = true;
                        if (surfaceHCenter > rockGroundSupportY) {
                            rockGroundSupportY = surfaceHCenter;
                        }
                    }
                }
                // canStepUpThisRock selalu FALSE untuk bebatuan tinggi
            } else {
                // Untuk batu rendah / ceper (ketinggian <= maxStepUp)
                const surfaceHCenter = getRockTopSurfaceAt(curFoxX, curFoxZ);
                const surfaceHStep = getRockTopSurfaceAt(probeStepX, probeStepZ);

                if (surfaceHCenter > -900) {
                    const diffCenter = surfaceHCenter - curFoxY;
                    if (diffCenter <= maxStepUp && diffCenter >= -1.2) {
                        if (surfaceHCenter > rockGroundSupportY) {
                            rockGroundSupportY = surfaceHCenter;
                        }
                        isStandingOnRock = true;
                    }
                }

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
            }

            // 2. HORIZONTAL SOLID COLLISION
            // Jika rubah TIDAK sedang berdiri di atas puncak batu, atau jika ini adalah batu tinggi:
            // WAJIB aktifkan tabrakan solid horizontal agar rubah TIDAK BISA MENEMBUS / MELEWATI!
            if (!isStandingOnRock) {
                if (isTallRock || (!canStepUpThisRock && heightAboveFox > maxStepUp)) {
                    for (let iter = 0; iter < 3; iter++) {
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

                            if (rLocal < minAllowedLocalR && _pLocal.y >= -1.50 && _pLocal.y <= 1.25) {
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

                                    if (inwardSpeed < -0.25) {
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
    groundH = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(foxRoot.position.x, foxRoot.position.z) : 0;
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
    const halfBodySubmergeOffset = 0.52 * foxScale;
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
            isFoxSwimmingDeep = false;
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
            isFoxSwimmingDeep = true;

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

            // Proteksi dasar galian: jika menyentuh atau berada di bawah dasar tanah
            if (foxRoot.position.y <= effectiveGroundH + 0.02) {
                foxRoot.position.y = effectiveGroundH;
                if (velocityY < 0) velocityY = 0;
                isGrounded = true; // Karakter berpijak kokoh di dasar tanah / sungai!
                isFoxSwimmingDeep = false;
            } else {
                isGrounded = false;
            }
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
        isFoxSwimmingDeep = false;
        if (foxInWaterState && foxRoot.position.y > waterSurfaceY + 0.35) {
            foxInWaterState = false;
        }

        // Jump diperbolehkan meskipun sedang memukul atau menendang (jump akan meng-cancel aksi tersebut)
        if (keys.space && isGrounded && !(wolfCharacter && wolfCharacter.isJumping)) {
            const hasWalkRunInput = Boolean(keys.w || keys.s || (typeof mobileJoystickForward !== 'undefined' && Math.abs(mobileJoystickForward) > 0.18));
            const isSprinting = (huntBlend > 0.4 && Math.abs(currentSpeed) > 1.8);
            // Lompat tanpa berjalan / berlari -> lompat murni di tempat (stationary)
            const isStationary = !hasWalkRunInput && !isSprinting && (Math.abs(currentSpeed) < 0.4);

            let applyNow = true;
            if (wolfCharacter && typeof wolfCharacter.triggerJump === 'function') {
                applyNow = wolfCharacter.triggerJump(isSprinting, isStationary) !== false;
            }
            if (applyNow) {
                // Hilangkan lompatan paksa native Y code, biarkan dieksekusi oleh animasi jump-normal.fbx saja
                if (isSprinting) {
                    velocityY = 6.8;
                    isGrounded = false;
                } else {
                    velocityY = 0;
                    isGrounded = true; // Tetap grounded, gerakan visual lompat dieksekusi penuh oleh animasi jump-normal.fbx
                }
                keys.space = false; // Reset keys.space agar jump berikutnya merespons input segar
                if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playJump) foxSoundFX.playJump();
            }
        }

        const wasGrounded = isGrounded;
        foxRoot.position.y += velocityY * dt;

        if (foxRoot.position.y <= effectiveGroundH) {
            foxRoot.position.y = effectiveGroundH;
            velocityY = 0;
            isGrounded = true;

            if (!wasGrounded) {
                if (velocityY < -3) landingSquash = 0.10;
                if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playLand) foxSoundFX.playLand();
                // Saat menyentuh tanah, seketika reset status jump & cooldown idle
                // agar pemain bisa langsung jump lagi tanpa jeda tersedat!
                if (wolfCharacter && typeof wolfCharacter.onLanded === 'function') {
                    wolfCharacter.onLanded();
                }
            }
        } else {
            velocityY += gravity * dt;
        }
        // Jaminan absolut: kaki hero humanoid tidak pernah tembus ke bawah lantai/grid!
        if (foxRoot.position.y < effectiveGroundH) {
            foxRoot.position.y = effectiveGroundH;
            velocityY = Math.max(0, velocityY);
            isGrounded = true;
        }
        landingSquash = THREE.MathUtils.lerp(landingSquash, 0, Math.min(1.0, 9.0 * dt));
    }
    const locomotionGrounded = isGrounded || (foxInWaterState && Math.abs(currentSpeed) > 0.1);
    updateWolfLocomotionAnimation(dt, elapsed, currentSpeed, currentTurnRate, huntBlend, locomotionGrounded, velocityY, isFoxSwimmingDeep);

    // ========================================================
    // 3. FREE ORBIT SPRING-ARM CAMERA DENGAN SMOOTH ANTI-OBSTACLE OCCLUSION & COMBAT AUTO-LOCK
    // ========================================================
    // Titik fokus kamera mengikuti dada/kepala Hero character atau midpoint antara Hero dan Enemy yang di-lock
    const playerTargetPos = new THREE.Vector3(
        foxRoot.position.x + forward.x * (0.15 * foxScale),
        foxRoot.position.y + 0.95 * foxScale,
        foxRoot.position.z + forward.z * (0.15 * foxScale)
    );

    // Frame musuh jika combat lock aktif
    const activeCombatTarget = (typeof window.currentCombatLockTarget !== 'undefined' && window.currentCombatLockTarget && window.currentCombatLockTarget.root)
        ? window.currentCombatLockTarget
        : null;

    let currentTargetPos = playerTargetPos;
    if (activeCombatTarget && activeCombatTarget.root && activeCombatTarget.root.visible) {
        const enemyHeadY = activeCombatTarget.root.position.y + 0.95;
        const enemyTargetPos = new THREE.Vector3(
            activeCombatTarget.root.position.x,
            enemyHeadY,
            activeCombatTarget.root.position.z
        );
        // Lerp 25% ke arah musuh agar framing kedua karakter pas di layar dan tidak terlalu condong ke tengah
        currentTargetPos = playerTargetPos.clone().lerp(enemyTargetPos, 0.25);
    }

    // Modern AAA spring-arm focus target lag:
    // Fokus kamera mengikuti rubah secara halus dengan sedikit lagging inersia natural
    const posLagSpeed = (activeCombatTarget && activeCombatTarget.root && activeCombatTarget.root.visible) ? 10.5 : 8.5;
    const posAlpha = 1.0 - Math.exp(-posLagSpeed * dt);
    controls.target.x = THREE.MathUtils.lerp(controls.target.x, currentTargetPos.x, posAlpha);
    controls.target.z = THREE.MathUtils.lerp(controls.target.z, currentTargetPos.z, posAlpha);
    controls.target.y = THREE.MathUtils.lerp(controls.target.y, currentTargetPos.y, 1.0 - Math.exp(-12.0 * dt));

    // Update status penahanan manual kamera (Multi-touch / Mouse drag)
    const isTouchingCamera = (activeCameraTouches.size > 0 || isUserMouseDown);
    const isCameraSwipeActive = (Math.abs(pendingCameraYawDelta) > 0.00001 || Math.abs(pendingCameraPitchDelta) > 0.00001);

    const isCharacterMoving = (Math.abs(currentSpeed) > 0.10 || Math.abs(currentTurnRate) > 0.10 || (window.currentFoxInputMag || 0) > 0.08 || keys.w || keys.s || keys.a || keys.d || Math.abs(analogFwd) > 0.10 || Math.abs(analogTurn) > 0.10);

    if (isTouchingCamera || isCameraSwipeActive) {
        cameraReleaseTimer = 0.5;
        isUserHoldingCamera = true;
    } else if (isCharacterMoving) {
        // Player melepas gesture kamera dan menyetir analog: segera ikuti hadapan rubah tanpa jeda
        cameraReleaseTimer = 0.0;
        isUserHoldingCamera = false;
    } else if (cameraReleaseTimer > 0) {
        cameraReleaseTimer -= dt;
        isUserHoldingCamera = true;
    } else {
        isUserHoldingCamera = false;
    }

    // Reset kamera langsung ke belakang player saat masuk Play Mode
    if (window._forceCameraBehindPlayer) {
        window._forceCameraBehindPlayer = false;
        camOrbitYaw = Math.atan2(-Math.sin(foxRoot.rotation.y), -Math.cos(foxRoot.rotation.y));
        camOrbitPitch = THREE.MathUtils.degToRad(18.0);
        currentCamDist = 4.8;
        userPreferredDist = 4.8;
        cameraReleaseTimer = 0.0;
        isUserHoldingCamera = false;
    }

    // Inisialisasi camOrbitYaw & camOrbitPitch jika belum ada
    if (camOrbitYaw === null || typeof camOrbitYaw === 'undefined') {
        if (typeof window.camOrbitYaw !== 'undefined' && window.camOrbitYaw !== null) {
            camOrbitYaw = window.camOrbitYaw;
        } else {
            const camRay = camera.position.clone().sub(controls.target);
            const hDist = Math.hypot(camRay.x, camRay.z);
            camOrbitYaw = (hDist > 0.02) ? Math.atan2(camRay.x, camRay.z) : Math.atan2(-Math.sin(foxRoot.rotation.y), -Math.cos(foxRoot.rotation.y));
        }
    }
    if (typeof window.camOrbitPitch !== 'undefined' && window.camOrbitPitch !== null && camOrbitPitch === null) {
        camOrbitPitch = window.camOrbitPitch;
    }

    // Hanya panggil controls.update() saat mouse desktop sedang aktif di-drag
    if (isUserMouseDown && typeof controls !== 'undefined' && controls.update) {
        controls.update();
        const camRay = camera.position.clone().sub(controls.target);
        const hDist = Math.hypot(camRay.x, camRay.z);
        if (hDist > 0.02) camOrbitYaw = Math.atan2(camRay.x, camRay.z);
        camOrbitPitch = Math.atan2(camRay.y, Math.max(0.05, hDist));
    }

    // PENTING: Batasi sudut pitch maksimal ke 30 derajat dari horizontal
    // (Kamera TIDAK BISA menukik ke atas kepala / up-to-down top-down under ANY circumstance)
    const MAX_ALLOWED_PITCH = THREE.MathUtils.degToRad(30.0);
    const MIN_ALLOWED_PITCH = THREE.MathUtils.degToRad(6.0);

    // Terapkan delta usapan kamera touch mobile (Multitouch kamera saat berjalan/berlari)
    if (pendingCameraYawDelta !== 0.0 || pendingCameraPitchDelta !== 0.0) {
        camOrbitYaw += pendingCameraYawDelta;
        camOrbitPitch += pendingCameraPitchDelta;
        pendingCameraYawDelta = 0.0;
        pendingCameraPitchDelta = 0.0;
    }

    camOrbitPitch = THREE.MathUtils.clamp(camOrbitPitch, MIN_ALLOWED_PITCH, MAX_ALLOWED_PITCH);

    if (isUserHoldingCamera) {
        // 1. SAAT USER MEMEGANG / MENGGESER KAMERA:
        // Kamera bebas dirotasi oleh user sesuai usapan jari/mouse, sudut dipertahankan
    } else if (isCharacterMoving) {
        // 2. SAAT MELEPAS GESTURE KAMERA DAN MENYETIR ANALOG:
        // Kamera secara otomatis dan responsif mengikuti hadapan (belakang) rubah
        const targetYaw = Math.atan2(-Math.sin(foxRoot.rotation.y), -Math.cos(foxRoot.rotation.y));
        let diff = (targetYaw - camOrbitYaw) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;

        // Cegah osilasi tanda bolak-balik saat rotasi ~180 derajat
        if (Math.abs(diff) > Math.PI - 0.06) {
            diff = (_lastFollowSign || 1) * (Math.PI - 0.06);
        } else {
            _lastFollowSign = Math.sign(diff) || 1;
        }

        const chaseSpeed = (huntBlend > 0.4) ? 5.2 : 3.8;
        const smoothT = 1.0 - Math.exp(-chaseSpeed * dt);
        const maxChaseStep = 4.2 * dt;
        camOrbitYaw += THREE.MathUtils.clamp(diff * smoothT, -maxChaseStep, maxChaseStep);

        const targetPitch = THREE.MathUtils.degToRad((huntBlend > 0.4) ? 22.0 : 18.0);
        camOrbitPitch = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(camOrbitPitch, targetPitch, 1.0 - Math.exp(-2.5 * dt)),
            MIN_ALLOWED_PITCH,
            MAX_ALLOWED_PITCH
        );
    } else if (activeCombatTarget && activeCombatTarget.root && activeCombatTarget.root.visible) {
        // 3. SAAT KARAKTER DIAM DI AREA MUSUH:
        // Kamera otomatis mengarah dari belakang Hero menuju Musuh untuk framing pertarungan
        const toEnemyX = activeCombatTarget.root.position.x - foxRoot.position.x;
        const toEnemyZ = activeCombatTarget.root.position.z - foxRoot.position.z;
        const targetYaw = Math.atan2(-toEnemyX, -toEnemyZ);

        let diff = (targetYaw - camOrbitYaw) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;

        const lockChaseSpeed = 5.0;
        const smoothT = 1.0 - Math.exp(-lockChaseSpeed * dt);
        const maxLockStep = 3.5 * dt;
        camOrbitYaw += THREE.MathUtils.clamp(diff * smoothT, -maxLockStep, maxLockStep);

        const targetPitch = THREE.MathUtils.degToRad(18.0);
        camOrbitPitch = THREE.MathUtils.clamp(
            THREE.MathUtils.lerp(camOrbitPitch, targetPitch, 1.0 - Math.exp(-3.0 * dt)),
            MIN_ALLOWED_PITCH,
            MAX_ALLOWED_PITCH
        );
    }

    window.camOrbitYaw = camOrbitYaw;
    window.camOrbitPitch = camOrbitPitch;

    const cosP = Math.cos(camOrbitPitch);
    const sinP = Math.sin(camOrbitPitch);
    const rayDir = new THREE.Vector3(Math.sin(camOrbitYaw) * cosP, sinP, Math.cos(camOrbitYaw) * cosP).normalize();
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
    let effectiveTargetDist = THREE.MathUtils.lerp(userTargetDist, edgeZoomDist, smoothEdge);

    // KETIKA COMBAT LOCK-ON AKTIF:
    // Mundurkan kamera agar ruang pertarungan lega (framing hero & enemy tampak utuh dan luas)
    if (activeCombatTarget && activeCombatTarget.root && activeCombatTarget.root.visible) {
        const distToEnemy = foxRoot.position.distanceTo(activeCombatTarget.root.position);
        // Base distance minimal 6.5m, bertambah dinamis seiring jarak musuh (hingga 8.8m)
        const combatFramingDist = THREE.MathUtils.clamp(distToEnemy * 0.65 + 5.8, 6.5, 8.8);
        effectiveTargetDist = Math.max(effectiveTargetDist, combatFramingDist);
    }

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
        _occlusionTimer = 0.09; // Evaluasi ~11Hz (alpha siluet tetap berinterpolasi sangat mulus via lerp)

        const leftVec = new THREE.Vector3(-forward.z, 0, forward.x);
        const heroScaleFactor = foxScale / 1.85;
        // 9 titik sampel anatomis tubuh pahlawan (humanoid upright dari kepala s/d telapak kaki)
        const foxOcclusionPoints = [
            new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 1.55 * heroScaleFactor, foxRoot.position.z), // Kepala / Helm
            new THREE.Vector3(foxRoot.position.x + leftVec.x * (0.25 * heroScaleFactor), foxRoot.position.y + 1.25 * heroScaleFactor, foxRoot.position.z + leftVec.z * (0.25 * heroScaleFactor)), // Pundak Kiri
            new THREE.Vector3(foxRoot.position.x - leftVec.x * (0.25 * heroScaleFactor), foxRoot.position.y + 1.25 * heroScaleFactor, foxRoot.position.z - leftVec.z * (0.25 * heroScaleFactor)), // Pundak Kanan
            new THREE.Vector3(foxRoot.position.x + forward.x * (0.08 * heroScaleFactor), foxRoot.position.y + 1.10 * heroScaleFactor, foxRoot.position.z + forward.z * (0.08 * heroScaleFactor)), // Dada Depan
            new THREE.Vector3(foxRoot.position.x, foxRoot.position.y + 0.85 * heroScaleFactor, foxRoot.position.z), // Pinggul / Inti Tubuh
            new THREE.Vector3(foxRoot.position.x + leftVec.x * (0.18 * heroScaleFactor), foxRoot.position.y + 0.50 * heroScaleFactor, foxRoot.position.z + leftVec.z * (0.18 * heroScaleFactor)), // Lutut Kiri
            new THREE.Vector3(foxRoot.position.x - leftVec.x * (0.18 * heroScaleFactor), foxRoot.position.y + 0.50 * heroScaleFactor, foxRoot.position.z - leftVec.z * (0.18 * heroScaleFactor)), // Lutut Kanan
            new THREE.Vector3(foxRoot.position.x + leftVec.x * (0.15 * heroScaleFactor), foxRoot.position.y + 0.18 * heroScaleFactor, foxRoot.position.z + leftVec.z * (0.15 * heroScaleFactor)), // Kaki Kiri
            new THREE.Vector3(foxRoot.position.x - leftVec.x * (0.15 * heroScaleFactor), foxRoot.position.y + 0.18 * heroScaleFactor, foxRoot.position.z - leftVec.z * (0.15 * heroScaleFactor))  // Kaki Kanan
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
                // Hanya periksa batuan yang berada di antara kamera dan rubah (bukan di samping / belakang rubah)
                if (proj < 0.5 || proj > distCamToFoxXZ - 0.7) continue;
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

                if (proj < -1.0 || proj > distCamToFoxXZ + 3.0) continue;
                const perpSq = (toTreeX * toTreeX + toTreeZ * toTreeZ) - (proj * proj);
                if (perpSq > 24.0) continue; // Max ~4.8m ke samping garis pandang kamera

                // A. Batang Pohon (silinder batang fisik)
                if (proj > 0.5 && proj < distCamToFoxXZ - 0.7 && perpSq < 8.0) {
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
                            r: cl.radius * 1.05
                        });
                    }
                } else if (tree.userData && (tree.userData.isPine || tree.userData.typeCode === 'pine')) {
                    // Dedaunan pohon cemara (Pine) bertingkat
                    const pineTiers = [
                        { y: 2.3, r: 3.5 },
                        { y: 3.8, r: 2.9 },
                        { y: 5.3, r: 2.3 },
                        { y: 6.8, r: 1.6 },
                        { y: 8.3, r: 1.0 }
                    ];
                    for (let t = 0; t < pineTiers.length; t++) {
                        candidateTreeClusters.push({
                            x: tx,
                            y: tree.position.y + leafOffsetY + pineTiers[t].y,
                            z: tz,
                            r: pineTiers[t].r
                        });
                    }
                } else {
                    candidateTreeClusters.push({
                        x: tx,
                        y: tree.position.y + leafOffsetY + 3.0,
                        z: tz,
                        r: 1.9
                    });
                }
            }
        }

        let blockedPointsCount = 0;
        let centerTorsoBlocked = false;
        let headBlocked = false;

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
            const maxRayDist = Math.max(0.4, rayDist - 0.45);
            _occlusionRaycaster.far = maxRayDist;

            let isPointBlocked = false;

            // 1. Uji Dedaunan Pohon Kandidat (Ray-Sphere Intersection)
            if (candidateTreeClusters.length > 0) {
                for (let cIdx = 0; cIdx < candidateTreeClusters.length; cIdx++) {
                    const cl = candidateTreeClusters[cIdx];
                    const ocX = camPos.x - cl.x;
                    const ocY = camPos.y - cl.y;
                    const ocZ = camPos.z - cl.z;
                    const b = ocX * dirX + ocY * dirY + ocZ * dirZ;
                    const c = (ocX * ocX + ocY * ocY + ocZ * ocZ) - (cl.r * cl.r);
                    if (c > 0.0 && b > 0.0) continue;
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

            // 2. Uji Bebatuan kandidat (hanya batuan di antara kamera dan rubah)
            if (!isPointBlocked && candidateRocks.length > 0) {
                const rockHits = _occlusionRaycaster.intersectObjects(candidateRocks, false);
                if (rockHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 3. Uji Batang Pohon kandidat
            if (!isPointBlocked && candidateTreeTrunks.length > 0) {
                const trunkHits = _occlusionRaycaster.intersectObjects(candidateTreeTrunks, true);
                if (trunkHits.length > 0) {
                    isPointBlocked = true;
                }
            }

            // 4. Uji Bukit / Terrain di ANTARA Kamera dan Rubah
            // Toleransi 0.25m agar lereng sculpt tempat rubah berdiri tidak salah terdeteksi
            if (!isPointBlocked && typeof getTerrainHeightFast === 'function') {
                const stepSize = 0.5;
                const minStepDist = 0.8;
                const maxTerrainDist = Math.max(minStepDist, rayDist - 1.5);
                const numSteps = Math.floor((maxTerrainDist - minStepDist) / stepSize);

                for (let sIdx = 0; sIdx <= numSteps; sIdx++) {
                    const s = minStepDist + sIdx * stepSize;
                    const sx = camPos.x + dirX * s;
                    const sz = camPos.z + dirZ * s;
                    const terrainH = getTerrainHeightFast(sx, sz);
                    const rayH = camPos.y + dirY * s;
                    if (rayH < terrainH - 0.25) {
                        isPointBlocked = true;
                        break;
                    }
                }
            }

            if (isPointBlocked) {
                blockedPointsCount++;
                if (p === 4) centerTorsoBlocked = true;
                if (p === 1 || p === 2) headBlocked = true;
            }
        }

        // Rubah HANYA dianggap terhalang (Eagle Vision aktif) jika rubah benar-benar tertutup rintangan
        // (minimal 7 dari 9 titik tubuh terhalang DAN bagian tengah/kepala terhalang, atau >= 8 titik terhalang)
        _cachedFoxOccluded = (blockedPointsCount >= 7 && (centerTorsoBlocked || headBlocked)) || (blockedPointsCount >= 8);
    }

    isCameraOccluded = _cachedFoxOccluded;
    updateFoxEagleVisionVisibility(_cachedFoxOccluded, dt, elapsed);
}

// ========================================================
// 4. SISTEM KINEMATIKA & ARTIKULASI LOCOMOTION RUBAH (REUSABLE)
// Digunakan bersama oleh mode Play Gameplay dan Cinematic Camera Editor
// ========================================================
function updateWolfLocomotionAnimation(dt, elapsed, speed, turnRate, huntRatio = 0, grounded = true, vertVel = 0, isSwimming = false) {
    if (!wolfCharacter) return;

    // Lean / bank character slightly into turns for dynamic feel
    if (wolfCharacter.meshContainer) {
        const targetRoll = -turnRate * 0.025 * Math.min(1.0, Math.abs(speed) / 4.0);
        wolfCharacter.meshContainer.rotation.z = THREE.MathUtils.lerp(
            wolfCharacter.meshContainer.rotation.z,
            targetRoll,
            Math.min(1.0, 10.0 * dt)
        );
    }

    // Update Hero 3D Character animation states (Idle, Walk, Run)
    if (typeof wolfCharacter.updateAnimation === 'function') {
        const isSprinting = (huntRatio > 0.4);
        wolfCharacter.updateAnimation(dt, speed, isSprinting, grounded, turnRate);
    }
}
window.updateWolfLocomotionAnimation = updateWolfLocomotionAnimation;
window.updateLegArticulation = updateLegArticulation;
