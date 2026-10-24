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

    // Spawn rubah di titik target kamera atau tengah map
    const spawnX = controls.target.x || 0;
    const spawnZ = controls.target.z || 0;
    const spawnY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(spawnX, spawnZ) : 0;

    wolfCharacter.root.position.set(spawnX, spawnY, spawnZ);
    wolfCharacter.root.visible = true;

    // Reset physics state
    currentSpeed = 0;
    currentTurnRate = 0;
    huntBlend = 0;
    velocityY = 0;
    isGrounded = true;
    gaitPhase = 0;
    landingSquash = 0;
    if (typeof foxIdleTimer !== 'undefined') foxIdleTimer = 0;
    if (typeof foxProneBlend !== 'undefined') foxProneBlend = 0;
    if (typeof foxSitBlend !== 'undefined') foxSitBlend = 0;
    if (typeof foxState !== 'undefined') foxState = 'IDLE';
    if (typeof manualProne !== 'undefined') manualProne = false;
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    keys.shift = false;
    keys.space = false;

    // Atur OrbitControls agar persis seperti new-character.html
    controls.enabled = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = false; // Matikan damping bawaan OrbitControls agar rotasi kamera chase halus tanpa jitter
    controls.minDistance = 2.4;
    controls.maxDistance = 25.0;
    controls.minPolarAngle = Math.PI * 0.28; // ~50.4 deg dari vertikal (Kamera TIDAK BISA menukik top-down 90 deg)
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    userPreferredDist = 4.8;
    currentCamDist = 4.8;
    isCameraOccluded = false;

    controls.target.set(spawnX, spawnY + 0.85, spawnZ);
    camera.position.set(spawnX - 3.2, spawnY + 2.7, spawnZ + 3.2);
    controls.update();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    isPlayMode = true;
    document.body.classList.add('play-mode-active');
    if (typeof updateViewportSize === 'function') updateViewportSize();
    const btnPlay = document.getElementById('btn-play-mode');
    if (btnPlay) {
        btnPlay.classList.add('playing');
        const txt = document.getElementById('txt-play-mode');
        if (txt) txt.innerText = 'Stop Demo';
    }

    // Tampilkan floating species switcher bar & stats stamina HUD
    const speciesBar = document.getElementById('fox-species-bar');
    if (speciesBar) speciesBar.style.display = 'flex';

    const statsHud = document.getElementById('fox-stats-hud');
    if (statsHud) statsHud.style.display = 'none';

    const activeBanner = document.getElementById('active-mode-banner');
    if (activeBanner) activeBanner.style.display = 'none';

    if (typeof foxSoundFX !== 'undefined' && foxSoundFX.init) {
        foxSoundFX.init();
    }

    if (typeof showMobileControls === 'function') {
        showMobileControls();
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

    if (wolfCharacter) {
        wolfCharacter.root.visible = false;
    }

    const speciesBar = document.getElementById('fox-species-bar');
    if (speciesBar) speciesBar.style.display = 'none';

    const statsHud = document.getElementById('fox-stats-hud');
    if (statsHud) statsHud.style.display = 'none';

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
    document.body.classList.remove('play-mode-active');
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
