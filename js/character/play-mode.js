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

    // Simpan posisi kamera editor
    savedEditorCamera.position.copy(camera.position);
    savedEditorCamera.target.copy(controls.target);

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
    controls.minDistance = 2.0;
    controls.maxDistance = 25.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    userPreferredDist = 4.8;
    currentCamDist = 4.8;
    isCameraOccluded = false;

    controls.target.set(spawnX, spawnY + 0.85, spawnZ);
    camera.position.set(spawnX - 3.4, spawnY + 2.2, spawnZ + 3.4);
    controls.update();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    isPlayMode = true;
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
    if (statsHud) statsHud.style.display = 'flex';

    if (typeof updateFoxStatsDisplay === 'function') {
        updateFoxStatsDisplay(currentFoxSpeciesKey);
    }

    const activeBanner = document.getElementById('active-mode-banner');
    if (activeBanner) activeBanner.style.display = 'none';

    if (typeof foxSoundFX !== 'undefined' && foxSoundFX.init) {
        foxSoundFX.init();
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

    // Kembalikan batasan OrbitControls editor
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableDamping = true; // Kembalikan damping untuk editor
    controls.minDistance = 0.1;
    controls.maxDistance = Infinity;
    controls.maxPolarAngle = Math.PI;

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

    controls.enabled = true;
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

// Shortcut Keyboard: 1=Red, 2=Arctic, 3=Corsac, 4=Swift, 5=Darwin, ESC=Exit
window.addEventListener('keydown', (e) => {
    if (!isPlayMode) return;
    if (e.key === '1') switchFoxSpecies('red');
    else if (e.key === '2') switchFoxSpecies('arctic');
    else if (e.key === '3') switchFoxSpecies('corsac');
    else if (e.key === '4') switchFoxSpecies('swift');
    else if (e.key === '5') switchFoxSpecies('darwin');
    else if (e.key === 'Escape') stopPlayMode();
});
