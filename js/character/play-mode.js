
let lastKickTriggerTime = 0;
function triggerWolfKick() {
    // Satu klik fisik bisa memicu pointerdown + mousedown + contextmenu sekaligus:
    // hanya event pertama dalam 40ms yang dihitung agar jumlah klik untuk combo akurat.
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - lastKickTriggerTime < 40) return;
    lastKickTriggerTime = now;

    const char = (typeof wolfCharacter !== 'undefined' && wolfCharacter) ? wolfCharacter : window.wolfCharacter;
    if (char && typeof char.triggerKick === 'function') {
        char.triggerKick();
    }
}
window.triggerWolfKick = triggerWolfKick;

let lastPunchTriggerTime = 0;
function triggerWolfPunch() {
    // Debounce 40ms agar pointerdown + mousedown fisik dihitung tepat 1x klik per input
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - lastPunchTriggerTime < 40) return;
    lastPunchTriggerTime = now;

    const char = (typeof wolfCharacter !== 'undefined' && wolfCharacter) ? wolfCharacter : window.wolfCharacter;
    if (char && typeof char.triggerPunch === 'function') {
        char.triggerPunch();
    }
}
window.triggerWolfPunch = triggerWolfPunch;

function startWolfBlock() {
    const char = (typeof wolfCharacter !== 'undefined' && wolfCharacter) ? wolfCharacter : window.wolfCharacter;
    if (char && typeof char.startBlock === 'function') {
        char.startBlock();
    }
}
window.startWolfBlock = startWolfBlock;

function stopWolfBlock() {
    const char = (typeof wolfCharacter !== 'undefined' && wolfCharacter) ? wolfCharacter : window.wolfCharacter;
    if (char && typeof char.stopBlock === 'function') {
        char.stopBlock();
    }
}
window.stopWolfBlock = stopWolfBlock;

function triggerWolfBlock() {
    const char = (typeof wolfCharacter !== 'undefined' && wolfCharacter) ? wolfCharacter : window.wolfCharacter;
    if (char && typeof char.triggerBlock === 'function') {
        char.triggerBlock();
    }
}
window.triggerWolfBlock = triggerWolfBlock;

// Menangkap klik kanan (Kick) & klik kiri (Punch)
let lastRightButtonDownTime = -10000;

// Tracking klik kiri: membedakan Click biasa (Punch) vs Hold / Drag untuk Menggerakkan Kamera
let leftButtonDownTime = 0;
let leftButtonDownX = 0;
let leftButtonDownY = 0;
let isLeftButtonHeld = false;
let leftButtonIsDrag = false;
const LEFT_CLICK_MAX_HOLD_MS = 250; // Lebih dari 250ms dianggap hold kamera
const LEFT_CLICK_MAX_MOVE_PX = 6;   // Lebih dari 6px perpindahan dianggap drag kamera

function handleLeftPointerDown(e) {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
    if (e.pointerType === 'touch') {
        // Pada perangkat touch / mobile, kontrol serangan menggunakan tombol on-screen Punch & Kick
        isLeftButtonHeld = false;
        return;
    }
    // Hindari trigger saat user mengklik tombol UI / HUD (seperti tombol exit, mobile button, dll)
    if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('.play-hud') || e.target.closest('#play-hud') || e.target.closest('.mobile-joystick') || e.target.closest('#mobile-play-controls'))) {
        isLeftButtonHeld = false;
        return;
    }
    isLeftButtonHeld = true;
    leftButtonIsDrag = false;
    leftButtonDownTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    leftButtonDownX = e.clientX || 0;
    leftButtonDownY = e.clientY || 0;
}

function handleLeftPointerMove(e) {
    if (!isLeftButtonHeld) return;
    const dx = (e.clientX || 0) - leftButtonDownX;
    const dy = (e.clientY || 0) - leftButtonDownY;
    if (Math.hypot(dx, dy) > LEFT_CLICK_MAX_MOVE_PX) {
        leftButtonIsDrag = true;
    }
}

function handleLeftPointerUp(e) {
    if (typeof isPlayMode === 'undefined' || !isPlayMode) {
        isLeftButtonHeld = false;
        return;
    }
    if (e.button !== 0) return;
    if (!isLeftButtonHeld) return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const duration = now - leftButtonDownTime;
    const wasDrag = leftButtonIsDrag;

    // Reset state
    isLeftButtonHeld = false;
    leftButtonIsDrag = false;

    // Jika bukan drag kamera dan durasi hold singkat (klik / tap murni), eksekusi punch
    if (!wasDrag && duration <= LEFT_CLICK_MAX_HOLD_MS) {
        triggerWolfPunch();
    }
    // Jika wasDrag atau duration > LEFT_CLICK_MAX_HOLD_MS, itu adalah hold/drag kamera -> JANGAN punch!
}

window.addEventListener('pointerdown', (e) => {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        if (e.button === 2) {
            e.preventDefault();
            lastRightButtonDownTime = performance.now();
            triggerWolfKick();
        } else if (e.button === 0) {
            handleLeftPointerDown(e);
        }
    }
}, { capture: true });

window.addEventListener('pointermove', (e) => {
    handleLeftPointerMove(e);
}, { capture: true });

window.addEventListener('pointerup', (e) => {
    handleLeftPointerUp(e);
}, { capture: true });

window.addEventListener('pointercancel', () => {
    isLeftButtonHeld = false;
    leftButtonIsDrag = false;
});

window.addEventListener('blur', () => {
    isLeftButtonHeld = false;
    leftButtonIsDrag = false;
});

// Fallback mousedown / mouseup jika pointer events tidak memicu di beberapa environment browser
window.addEventListener('mousedown', (e) => {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        if (e.button === 2) {
            e.preventDefault();
            lastRightButtonDownTime = performance.now();
            triggerWolfKick();
        } else if (e.button === 0 && !isLeftButtonHeld) {
            handleLeftPointerDown(e);
        }
    }
}, { capture: true });

window.addEventListener('mousemove', (e) => {
    handleLeftPointerMove(e);
}, { capture: true });

window.addEventListener('mouseup', (e) => {
    if (isLeftButtonHeld) {
        handleLeftPointerUp(e);
    }
}, { capture: true });

// Di Windows contextmenu muncul saat tombol DILEPAS -> hanya dipakai sebagai cadangan
// jika pointerdown/mousedown tidak tertangkap, agar 1 klik tidak terhitung 2 kali.
window.addEventListener('contextmenu', (e) => {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        e.preventDefault();
        if (performance.now() - lastRightButtonDownTime > 1500) {
            triggerWolfKick();
        }
    }
}, { capture: true });

/* Play mode actions & start/stop */

function triggerWolfJump() {
    keys.space = true;
    setTimeout(() => { keys.space = false; }, 120);
}

function toggleWolfSprint() {
    keys.shift = !keys.shift;
    const btnSprint = document.getElementById('btn-play-sprint');
    if (btnSprint) {
        if (keys.shift) btnSprint.classList.add('active');
        else btnSprint.classList.remove('active');
    }
}

function startPlayMode() {
    if (typeof cancelAllSelections === 'function') cancelAllSelections();

    // Pastikan menu overflow tertutup
    const overflowDropdown = document.getElementById('toolbar-overflow-menu');
    if (overflowDropdown) overflowDropdown.classList.remove('open');
    const overflowBtn = document.getElementById('btn-toolbar-overflow');
    if (overflowBtn) overflowBtn.classList.remove('active');

    // Simpan posisi & konfigurasi OrbitControls kamera editor
    savedEditorCamera.position.copy(camera.position);
    savedEditorCamera.target.copy(controls.target);
    savedEditorCamera.minPolarAngle = (typeof controls.minPolarAngle === 'number') ? controls.minPolarAngle : 0;
    savedEditorCamera.maxPolarAngle = (typeof controls.maxPolarAngle === 'number') ? controls.maxPolarAngle : (Math.PI / 2 - 0.04);
    savedEditorCamera.minDistance = (typeof controls.minDistance === 'number') ? controls.minDistance : 1.0;
    savedEditorCamera.maxDistance = (typeof controls.maxDistance === 'number') ? controls.maxDistance : 160.0;
    savedEditorCamera.enablePan = (typeof controls.enablePan === 'boolean') ? controls.enablePan : true;
    savedEditorCamera.enableDamping = (typeof controls.enableDamping === 'boolean') ? controls.enableDamping : true;
    savedEditorCamera.mouseButtons = controls.mouseButtons ? { ...controls.mouseButtons } : null;

    // Simpan status sidebar dan collapse agar tampilan full-screen imersif
    const sidebarLeft = document.getElementById('sidebar-left');
    const sidebarRight = document.getElementById('sidebar-right');
    if (sidebarLeft) {
        wasLeftSidebarCollapsed = sidebarLeft.classList.contains('collapsed');
        sidebarLeft.classList.add('collapsed');
    }
    if (sidebarRight) {
        wasRightSidebarCollapsed = sidebarRight.classList.contains('collapsed');
        sidebarRight.classList.add('collapsed');
    }
    if (typeof updateSidebarCSSVariables === 'function') {
        updateSidebarCSSVariables();
    }

    // Sembunyikan panel footer timeline cinematic & upward dropdown jika sedang terbuka
    const bottomPanel = document.getElementById('cinematic-bottom-panel');
    if (bottomPanel) {
        wasCinematicBottomOpen = bottomPanel.classList.contains('visible');
        bottomPanel.classList.remove('visible');
    }
    const cinematicOverflow = document.getElementById('cinematic-overflow-dropdown');
    if (cinematicOverflow) cinematicOverflow.classList.remove('open');

    // HILANGKAN SEMUA GARIS DAN PENANDA DARI CINEMATIC CAMERA & ACTOR SAAT PLAY MODE
    if (typeof CinematicManager !== 'undefined') {
        if (CinematicManager.pathGroup) CinematicManager.pathGroup.visible = false;
        if (CinematicManager.previewMarker) CinematicManager.previewMarker.visible = false;
        if (CinematicManager.foxes) {
            CinematicManager.foxes.forEach(f => {
                if (f && f.pathGroup) f.pathGroup.visible = false;
            });
        }
        if (CinematicManager.foxPreviewMarker) CinematicManager.foxPreviewMarker.visible = false;
    }
    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.clearSelection();
        if (SelectionOutlineManager.group) SelectionOutlineManager.group.visible = false;
    }
    if (typeof brushReticleGroup !== 'undefined' && brushReticleGroup) {
        brushReticleGroup.visible = false;
    }

    // Inisialisasi model rubah jika belum ada
    if (!wolfCharacter) {
        wolfCharacter = createWolfCharacterModel();
        scene.add(wolfCharacter.root);
    }

    // Spawn rubah di titik area spawn Player (atau target kamera sebagai fallback)
    let spawnX = controls.target.x || 0;
    let spawnZ = controls.target.z || 0;
    let spawnRotY = 0;

    if (typeof PlayerSpawnManager !== 'undefined' && PlayerSpawnManager.hasSpawnPoint) {
        const sp = PlayerSpawnManager.getSpawnPosition();
        spawnX = sp.x;
        spawnZ = sp.z;
        spawnRotY = sp.rotY || 0;
        PlayerSpawnManager.updateVisibility(true);
    }

    const spawnY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(spawnX, spawnZ) : 0;

    wolfCharacter.root.position.set(spawnX, spawnY, spawnZ);
    wolfCharacter.root.rotation.y = spawnRotY;
    wolfCharacter.root.visible = true;
    wolfCharacter.root.traverse(child => {
        child.visible = true;
        if (child.isMesh) child.frustumCulled = false;
    });
    wolfCharacter.root.updateMatrix();
    wolfCharacter.root.updateMatrixWorld(true);

    // Reset physics state
    currentSpeed = 0;
    currentTurnRate = 0;
    huntBlend = 0;
    velocityY = 0;
    isGrounded = true;
    gaitPhase = 0;
    landingSquash = 0;
    if (window.plasmaWeaponInstance && typeof window.plasmaWeaponInstance.clearMissiles === 'function') {
        window.plasmaWeaponInstance.clearMissiles();
    }
    isLeftButtonHeld = false;
    leftButtonIsDrag = false;
    lastPunchTriggerTime = 0;
    lastKickTriggerTime = 0;
    window.wolfCharacter = wolfCharacter;
    if (typeof foxIdleTimer !== 'undefined') foxIdleTimer = 0;
    if (wolfCharacter) {
        wolfCharacter.isFlyingPunch = false;
        wolfCharacter.isFlyingKick = false;
        wolfCharacter.isPunching = false;
        wolfCharacter.isKicking = false;
        wolfCharacter.isTakingHit = false;
        wolfCharacter.isDead = false;
        if (typeof wolfCharacter.resetAnimation === 'function') {
            wolfCharacter.resetAnimation();
        }
    }
    if (typeof foxProneBlend !== 'undefined') foxProneBlend = 0;
    if (typeof foxSitBlend !== 'undefined') foxSitBlend = 0;
    if (typeof foxState !== 'undefined') foxState = 'IDLE';
    if (typeof manualProne !== 'undefined') manualProne = false;
    if (typeof keys !== 'undefined') {
        keys.w = false;
        keys.a = false;
        keys.s = false;
        keys.d = false;
        keys.shift = false;
        keys.space = false;
    }

    // Atur OrbitControls: Matikan touch handling OrbitControls di Play Mode agar tidak bentrok dengan analog & kamera mobile
    controls.enabled = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = false;
    if (controls.touches) {
        controls.touches.ONE = null;
        controls.touches.TWO = null;
    }
    controls.minDistance = 2.4;
    controls.maxDistance = 25.0;
    controls.minPolarAngle = Math.PI * 0.28; // ~50.4 deg dari vertikal (Kamera TIDAK BISA menukik top-down 90 deg)
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: null
    };

    userPreferredDist = 4.8;
    currentCamDist = 4.8;
    isCameraOccluded = false;

    controls.target.set(spawnX, spawnY + 1.15, spawnZ);
    // Posisikan kamera langsung berada tepat di belakang player saat Play Mode dimulai
    const charYaw = (wolfCharacter && wolfCharacter.root) ? wolfCharacter.root.rotation.y : spawnRotY;
    const behindYaw = Math.atan2(-Math.sin(charYaw), -Math.cos(charYaw));
    const camPitch = THREE.MathUtils.degToRad(18.0);
    const camDist = 4.8;
    const cosP = Math.cos(camPitch);
    const sinP = Math.sin(camPitch);
    const rayDir = new THREE.Vector3(Math.sin(behindYaw) * cosP, sinP, Math.cos(behindYaw) * cosP).normalize();

    camera.position.copy(controls.target).addScaledVector(rayDir, camDist);
    camera.lookAt(controls.target);

    window.camOrbitYaw = behindYaw;
    window.camOrbitPitch = camPitch;
    window._forceCameraBehindPlayer = true;
    controls.update();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    isPlayMode = true;
    if (typeof window.glbImporterInstance !== 'undefined' && window.glbImporterInstance.transformControl) {
        window.glbImporterInstance.transformControl.detach();
    }
    document.body.classList.add('play-mode-active');
    if (typeof updateViewportSize === 'function') {
        updateViewportSize();
        requestAnimationFrame(updateViewportSize);
        setTimeout(updateViewportSize, 60);
        setTimeout(updateViewportSize, 200);
    }
    const btnPlay = document.getElementById('btn-play-mode');
    if (btnPlay) {
        btnPlay.classList.add('playing');
        const txt = document.getElementById('txt-play-mode');
        if (txt) txt.innerText = 'Stop Demo';
    }

    // Sembunyikan species switcher bar di Mode Demo per permintaan user
    const speciesBar = document.getElementById('fox-species-bar');
    if (speciesBar) speciesBar.style.display = 'none';

    const statsHud = document.getElementById('fox-stats-hud');
    if (statsHud) statsHud.style.display = 'none';

    if (typeof CombatHUD !== 'undefined' && CombatHUD.onPlayModeStart) {
        CombatHUD.onPlayModeStart();
    }

    // Pastikan di awal Play Mode: Full HP, Full Stamina & semua Stats maksimal
    if (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.reset) {
        PlayerHealthState.reset(100);
    }
    if (typeof FoxStaminaState !== 'undefined' && FoxStaminaState.reset) {
        FoxStaminaState.reset();
    }
    if (wolfCharacter) {
        wolfCharacter.isDead = false;
        wolfCharacter.isTakingHit = false;
        wolfCharacter.isBlocking = false;
        wolfCharacter.isBlockHeld = false;
        wolfCharacter.blockDrainPool = 0;
    }

    const activeBanner = document.getElementById('active-mode-banner');
    if (activeBanner) activeBanner.style.display = 'none';

    if (typeof foxSoundFX !== 'undefined' && foxSoundFX.init) {
        foxSoundFX.init();
    }

    if (typeof showMobileControls === 'function') {
        showMobileControls();
    }

    if (window.isItemBoxSpawnerActive && window.itemBoxManagerInstance) {
        window.itemBoxManagerInstance.toggleSpawnerMode(false);
    }

    if (window.itemBoxManagerInstance) {
        window.itemBoxManagerInstance.init();
    }

    if (window.plasmaWeaponInstance && typeof window.plasmaWeaponInstance.prewarm === 'function') {
        window.plasmaWeaponInstance.prewarm(renderer, scene, camera);
    }

    if (typeof FoxAIManager !== 'undefined' && FoxAIManager) {
        if (typeof FoxAIManager.syncSpawnedFoxes === 'function') FoxAIManager.syncSpawnedFoxes();
        if (typeof FoxAIManager.resetAll === 'function') FoxAIManager.resetAll();
    }

    if (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) {
        spawnedFoxesList.forEach(fox => {
            if (fox) {
                fox.visible = true;
                if (fox.root) fox.root.visible = true;
                if (typeof fox.maxHealth === 'number') fox.health = fox.maxHealth;
            }
        });
    }
}

function stopPlayMode() {
    isPlayMode = false;
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    keys.shift = false;
    keys.space = false;

    if (typeof hideMobileControls === 'function') {
        hideMobileControls();
    }

    isLeftButtonHeld = false;
    leftButtonIsDrag = false;
    if (wolfCharacter) {
        wolfCharacter.isFlyingPunch = false;
        wolfCharacter.isFlyingKick = false;
        wolfCharacter.isPunching = false;
        wolfCharacter.isKicking = false;
        wolfCharacter.isTakingHit = false;
        if (typeof wolfCharacter.resetAnimation === 'function') {
            wolfCharacter.resetAnimation();
        }
        wolfCharacter.root.visible = false;
    }

    if (typeof ItemSystem !== 'undefined') {
        ItemSystem.reset();
    }

    if (typeof PlayerSpawnManager !== 'undefined') {
        PlayerSpawnManager.updateVisibility(false);
    }

    if (typeof FoxAIManager !== 'undefined') {
        if (typeof FoxAIManager.resetAll === 'function') FoxAIManager.resetAll();
        if (FoxAIManager.crosshairContainer) FoxAIManager.crosshairContainer.style.display = 'none';
        if (FoxAIManager.targetBox) FoxAIManager.targetBox.style.display = 'none';
        if (FoxAIManager.playerWarningBanner) FoxAIManager.playerWarningBanner.classList.remove('visible');
    }

    const speciesBar = document.getElementById('fox-species-bar');
    if (speciesBar) speciesBar.style.display = 'none';

    const statsHud = document.getElementById('fox-stats-hud');
    if (statsHud) statsHud.style.display = 'none';

    if (typeof CombatHUD !== 'undefined' && CombatHUD.onPlayModeStop) {
        CombatHUD.onPlayModeStop();
    }

    const btnPlay = document.getElementById('btn-play-mode');
    if (btnPlay) {
        btnPlay.classList.remove('playing');
        const txt = document.getElementById('txt-play-mode');
        if (txt) txt.innerText = 'Play Demo';
    }

    // Kembalikan batasan OrbitControls editor studio agar kamera bisa up-down bebas seperti semula
    controls.enableZoom = true;
    controls.enablePan = (typeof savedEditorCamera.enablePan === 'boolean') ? savedEditorCamera.enablePan : true;
    controls.enableDamping = (typeof savedEditorCamera.enableDamping === 'boolean') ? savedEditorCamera.enableDamping : true;
    controls.minPolarAngle = (typeof savedEditorCamera.minPolarAngle === 'number') ? savedEditorCamera.minPolarAngle : 0;
    controls.maxPolarAngle = (typeof savedEditorCamera.maxPolarAngle === 'number') ? savedEditorCamera.maxPolarAngle : (Math.PI / 2 - 0.04);
    controls.minDistance = (typeof savedEditorCamera.minDistance === 'number') ? savedEditorCamera.minDistance : 1.0;
    controls.maxDistance = (typeof savedEditorCamera.maxDistance === 'number') ? savedEditorCamera.maxDistance : 160.0;
    if (savedEditorCamera.mouseButtons) {
        controls.mouseButtons = { ...savedEditorCamera.mouseButtons };
    } else {
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
    }

    camera.position.copy(savedEditorCamera.position);
    controls.target.copy(savedEditorCamera.target);
    controls.update();

    const sidebarLeft = document.getElementById('sidebar-left');
    const sidebarRight = document.getElementById('sidebar-right');
    if (sidebarLeft && !wasLeftSidebarCollapsed) sidebarLeft.classList.remove('collapsed');
    if (sidebarRight && !wasRightSidebarCollapsed) sidebarRight.classList.remove('collapsed');
    if (typeof updateSidebarCSSVariables === 'function') {
        updateSidebarCSSVariables();
    }

    // Kembalikan panel timeline jika sebelumnya terbuka
    if (wasCinematicBottomOpen) {
        const bottomPanel = document.getElementById('cinematic-bottom-panel');
        if (bottomPanel) bottomPanel.classList.add('visible');
    }

    // Kembalikan tampilan penanda cinematic camera & actor ke kondisi editor
    if (typeof CinematicManager !== 'undefined') {
        if (CinematicManager.pathGroup && !CinematicManager.isPlaying) CinematicManager.pathGroup.visible = true;
        if (CinematicManager.previewMarker && !CinematicManager.isPlaying) CinematicManager.previewMarker.visible = true;
        if (CinematicManager.foxes && CinematicManager.isFoxEnabled && !CinematicManager.isPlaying) {
            CinematicManager.foxes.forEach(f => {
                if (f && f.pathGroup) f.pathGroup.visible = true;
            });
        }
    }

    controls.enabled = true;
    if (controls.touches) {
        controls.touches.ONE = THREE.TOUCH.ROTATE;
        controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    }
    if (window.plasmaWeaponInstance && typeof window.plasmaWeaponInstance.clearMissiles === 'function') {
        window.plasmaWeaponInstance.clearMissiles();
    }
    document.body.classList.remove('play-mode-active');
    if (typeof window.glbImporterInstance !== 'undefined' && window.glbImporterInstance.selectedIndex >= 0) {
        window.glbImporterInstance.selectObject(window.glbImporterInstance.selectedIndex);
    }
    if (typeof updateViewportSize === 'function') updateViewportSize();
    if (typeof updateActiveModeHUD === 'function') {
        updateActiveModeHUD();
    }
}

// Fungsi Reusable Switch Karakter Spesies Rubah
function switchFoxSpecies(speciesKey) {
    if (typeof FOX_SPECIES === 'undefined' || !FOX_SPECIES[speciesKey]) return;

    let posX = 0, posY = 0, posZ = 0, rotY = 0;
    if (wolfCharacter && wolfCharacter.root) {
        posX = wolfCharacter.root.position.x;
        posY = wolfCharacter.root.position.y;
        posZ = wolfCharacter.root.position.z;
        rotY = wolfCharacter.root.rotation.y;
        scene.remove(wolfCharacter.root);
    } else {
        posX = controls.target.x || 0;
        posZ = controls.target.z || 0;
        posY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(posX, posZ) : 0;
    }

    currentFoxSpeciesKey = speciesKey;
    wolfCharacter = createWolfCharacterModel(speciesKey);
    wolfCharacter.root.position.set(posX, posY, posZ);
    wolfCharacter.root.rotation.y = rotY;
    wolfCharacter.root.visible = isPlayMode || (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled);
    scene.add(wolfCharacter.root);

    if (typeof ItemSystem !== 'undefined') {
        ItemSystem.onFoxSpeciesChanged(wolfCharacter);
    }

    // Update tombol UI aktif
    document.querySelectorAll('.btn-species-pill').forEach(btn => {
        if (btn.dataset.species === speciesKey) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update stats info dan reset stamina untuk spesies baru
    if (typeof updateFoxStatsDisplay === 'function') {
        updateFoxStatsDisplay(speciesKey);
    }
}

function togglePlayMode() {
    if (isPlayMode) {
        stopPlayMode();
    } else {
        startPlayMode();
    }
}

const btnPlayMode = document.getElementById('btn-play-mode');
if (btnPlayMode) {
    btnPlayMode.addEventListener('click', togglePlayMode);
}

const btnExitDemo = document.getElementById('btn-exit-demo-mode');
if (btnExitDemo) {
    btnExitDemo.addEventListener('click', stopPlayMode);
}

const btnToggleBattle = document.getElementById('btn-toggle-battle-mode');
if (btnToggleBattle) {
    btnToggleBattle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof FoxAIManager !== 'undefined') {
            FoxAIManager.isBattleModeActive = !FoxAIManager.isBattleModeActive;
            btnToggleBattle.classList.toggle('active', FoxAIManager.isBattleModeActive);
            btnToggleBattle.style.background = FoxAIManager.isBattleModeActive ? 'rgba(239, 68, 68, 0.4)' : '';
            btnToggleBattle.style.borderColor = FoxAIManager.isBattleModeActive ? '#ef4444' : '';
            if (typeof PandoraToast !== 'undefined') {
                PandoraToast.show(FoxAIManager.isBattleModeActive ? '⚔️ AI Plasma Battle Mode: AKTIF!' : '🕊️ AI Plasma Battle Mode: NONAKTIF', 'info');
            }
        }
    });
}

// Event Delegation untuk Tombol Switch Spesies Rubah
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-species-pill');
    if (btn && btn.dataset && btn.dataset.species) {
        switchFoxSpecies(btn.dataset.species);
    }
});

// Shortcut Keyboard: 1=Red, 2=Arctic, 3=Corsac, 4=Golden/Swift, 5=Silver, 6=Darwin, ESC=Exit
window.addEventListener('keydown', (e) => {
    if (!isPlayMode) return;
    if (e.key === '1') switchFoxSpecies('red');
    else if (e.key === '2') switchFoxSpecies('arctic');
    else if (e.key === '3') switchFoxSpecies('corsac');
    else if (e.key === '4') switchFoxSpecies('swift');
    else if (e.key === '5') switchFoxSpecies('silver');
    else if (e.key === '6') switchFoxSpecies('darwin');
    else if (e.key === 'Escape') stopPlayMode();
});
