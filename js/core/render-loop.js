/* Main render loop */
// ==========================================
// 12. RENDER LOOP
// ==========================================
const clock = new THREE.Clock();

const SHADOW_UPDATE_EVERY_EDITOR = 6;
const SHADOW_FOLLOW_SNAP = 4;
const VSYNC_SAMPLE_COUNT = 30;
const vsyncSamples = [];
let vsyncMs = 1000 / 60;
let lastVsyncTime = 0;
let vsyncsSinceRender = 0;
const lastValidCameraPosition = new THREE.Vector3(0, 16, 32);
let frameCounter = 0;

// Resolusi dinamis (opsional): turun saat FPS jauh di bawah target, naik lagi saat longgar
const ADAPTIVE_MIN_DPR = 0.7;
const ADAPTIVE_WINDOW_MS = 2000;
const ADAPTIVE_MAX_TARGET_FPS = 60;
let adaptiveSince = 0;
let adaptiveFrames = 0;

function updateAdaptiveResolution(now, frameLimit) {
    if (!adaptiveSince) adaptiveSince = now;
    adaptiveFrames++;
    if (now - adaptiveSince < ADAPTIVE_WINDOW_MS) return;
    const fps = adaptiveFrames * 1000 / (now - adaptiveSince);
    adaptiveSince = now;
    adaptiveFrames = 0;
    const target = frameLimit > 0 ? Math.min(frameLimit, ADAPTIVE_MAX_TARGET_FPS) : ADAPTIVE_MAX_TARGET_FPS;
    const maxDpr = Math.min(window.devicePixelRatio || 1, PandoraSettings.preset().maxDpr);
    const current = renderer.getPixelRatio();
    let next = current;
    if (fps < target * 0.75) next = Math.max(ADAPTIVE_MIN_DPR, current - 0.1);
    else if (fps > target * 0.95) next = Math.min(maxDpr, current + 0.05);
    if (Math.abs(next - current) > 0.001) {
        renderer.setPixelRatio(next);
        updateViewportSize();
    }
}

function updateShadowSchedule(isGameplay) {
    const every = isGameplay ? PandoraSettings.preset().shadowEvery : SHADOW_UPDATE_EVERY_EDITOR;
    if (frameCounter % every !== 0) return;
    renderer.shadowMap.needsUpdate = true;

    // Saat bermain, area bayangan mengikuti pemain dengan langkah kasar agar tidak berkedip
    if (typeof sunBasePosition !== 'undefined') {
        let offsetX = 0;
        let offsetZ = 0;
        if (isGameplay && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            offsetX = Math.round(wolfCharacter.root.position.x / SHADOW_FOLLOW_SNAP) * SHADOW_FOLLOW_SNAP;
            offsetZ = Math.round(wolfCharacter.root.position.z / SHADOW_FOLLOW_SNAP) * SHADOW_FOLLOW_SNAP;
        }
        sunLight.position.set(sunBasePosition.x + offsetX, sunBasePosition.y, sunBasePosition.z + offsetZ);
        sunLight.target.position.set(sunBaseTarget.x + offsetX, sunBaseTarget.y, sunBaseTarget.z + offsetZ);
        sunLight.target.updateMatrixWorld();
    }
}

// Jeda rAF yang umum terjadi (median), supaya frame berat tidak dianggap sebagai refresh rate
function sampleVsync(now) {
    if (lastVsyncTime) vsyncSamples.push(now - lastVsyncTime);
    lastVsyncTime = now;
    if (vsyncSamples.length < VSYNC_SAMPLE_COUNT) return;
    vsyncSamples.sort((a, b) => a - b);
    vsyncMs = vsyncSamples[VSYNC_SAMPLE_COUNT >> 1];
    vsyncSamples.length = 0;
}

function animate() {
    requestAnimationFrame(animate);

    const frameNow = performance.now();
    const isCinematicRunning = (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) ||
        (typeof CinematicManager !== 'undefined' && CinematicManager.isPlaying);
    const isGameplay = isPlayMode || isCinematicRunning;
    const settings = PandoraSettings.values;
    const frameLimit = isGameplay
        ? settings.fpsLimit
        : (settings.fpsLimit > 0 ? Math.min(settings.fpsLimit, settings.editorFps) : settings.editorFps);
    sampleVsync(frameNow);
    if (frameLimit > 0) {
        // Gambar tiap N refresh layar agar jeda antar frame selalu sama. Membatasi dengan jam membuat
        // jeda bergantian panjang-pendek (terlihat patah-patah) bila refresh rate bukan kelipatan batas,
        // misalnya batas 60 di monitor 144Hz menjadi 72 FPS yang merata.
        const vsyncsPerFrame = Math.max(1, Math.floor(1000 / frameLimit / vsyncMs + 0.1));
        vsyncsSinceRender++;
        if (vsyncsSinceRender < vsyncsPerFrame) return;
    }
    vsyncsSinceRender = 0;
    frameCounter++;
    FpsCounter.tick(frameNow);
    if (isGameplay && settings.dynamicResolution) updateAdaptiveResolution(frameNow, settings.fpsLimit);

    if (window.PandoraGamePaused) {
        clock.getDelta();
        renderer.render(scene, camera);
        return;
    }
    updateShadowSchedule(isGameplay);

    // Panggil getDelta() terlebih dahulu sebelum getElapsedTime agar delta bernilai valid (>0)
    const delta = Math.min(clock.getDelta(), 0.1) * (window.PandoraTimeScale || 1);
    const elapsedTime = clock.getElapsedTime();

    // Galat di satu sistem tidak boleh menghentikan render: canvas yang tidak digambar tampil hitam
    try {

    grassSystem.material.uniforms.uTime.value = elapsedTime;
    if (typeof updateGrassTrample === 'function') {
        updateGrassTrample(delta);
    }

    foliageMaterialsList.forEach(mat => {
        mat.uniforms.uTime.value = elapsedTime;
    });

    // --- AWAN BERGERAK MANDIRI & LEBIH CEPAT ---
    volumetricCloudMat.uniforms.uTime.value = elapsedTime;
    cloudInstancedMesh.rotation.y = 1400;

    // --- ANIMASI LANGIT MALAM (AURORA BOREALIS & BINTANG) ---
    if (typeof updateNightSky === 'function') {
        updateNightSky(elapsedTime, delta);
    }

    if (treesList.length > 0 && leafFallRate > 0) {
        const spawnChance = 4.8 * delta * leafFallRate;
        if (Math.random() < spawnChance) {
            const randomTree = treesList[Math.floor(Math.random() * treesList.length)];
            spawnFallingLeafFromTree(randomTree);
        }
    }

    updateFallingLeaves(delta);

    // --- ANIMASI BUNGA & KAWANAN KUPU-KUPU ---
    if (typeof updateFlowers === 'function') {
        updateFlowers(delta, elapsedTime);
    }
    if (typeof updateFerns === 'function') {
        updateFerns(delta, elapsedTime);
    }
    if (typeof updateBushes === 'function') {
        updateBushes(delta, elapsedTime);
    }
    if (typeof updateButterflies === 'function') {
        updateButterflies(delta, elapsedTime);
    }
    if (typeof updateWater === 'function') {
        updateWater(delta, elapsedTime);
    }
    if (typeof updateFog === 'function') {
        updateFog(delta, elapsedTime);
    }

    if (typeof updateAllSpawnedFoxesAnimation === 'function') {
        updateAllSpawnedFoxesAnimation(delta, elapsedTime);
    }

    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.updateAnimation(elapsedTime, delta);
    }

    // --- ITEM BOX SPANWER & PLASMA WEAPON SYSTEM ---
    if (typeof itemBoxManagerInstance !== 'undefined' && itemBoxManagerInstance) {
        itemBoxManagerInstance.update(delta, elapsedTime);
    }
    if (typeof ItemSystem !== 'undefined' && ItemSystem) {
        ItemSystem.update(delta, elapsedTime);
    }
    if (typeof FoxAIManager !== 'undefined' && FoxAIManager) {
        if (isPlayMode) {
            if (typeof CinematicPlayer === 'undefined' || !CinematicPlayer.active) FoxAIManager.update(delta, elapsedTime);
        } else if (typeof FoxAIManager.updateInEditor === 'function') {
            FoxAIManager.updateInEditor(delta, elapsedTime);
        }
    }
    if (typeof glbImporterInstance !== 'undefined' && glbImporterInstance) {
        glbImporterInstance.update(delta, elapsedTime);
    }
    if (typeof PlayerSpawnManager !== 'undefined' && !isPlayMode) {
        PlayerSpawnManager.update(delta, elapsedTime);
    }

    if (typeof PortalManager !== 'undefined') {
        PortalManager.tick(delta, elapsedTime);
    }
    if (typeof TriggerManager !== 'undefined') {
        TriggerManager.tick();
    }
    if (typeof CinematicPlayer !== 'undefined') {
        CinematicPlayer.tick(delta);
    }

    if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) {
        CinematicPlayer.update(delta);
    } else if (isPlayMode && wolfCharacter) {
        updateWolfPhysics(delta, elapsedTime);
    } else if (typeof CinematicManager !== 'undefined' && CinematicManager.isPlaying) {
        CinematicManager.update(delta, elapsedTime);
    } else {
        controls.update();
        if (camera.position.y < 0.6) {
            camera.position.y = 0.6;
            controls.update();
        }
        if (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible) {
            CinematicManager.updateIdleFox(delta, elapsedTime);
        }
    }

    // UPDATE COMBAT HUD (Floating HP & Boss Bar) tepat setelah posisi kamera dan karakter sudah final
    // Meniadakan jeda 1-frame latency yang membuat HP bar dan nametag bergetar saat kamera digerakkan
    if (typeof CombatHUD !== 'undefined' && CombatHUD.update) {
        CombatHUD.update(delta, elapsedTime);
    }

    } catch (frameError) {
        if (!window._pandoraFrameErrorLogged) {
            window._pandoraFrameErrorLogged = true;
            console.error('[Render Loop] Galat saat update frame:', frameError);
        }
    }

    // Posisi kamera tidak valid juga membuat layar kosong: kembali ke posisi valid terakhir
    if (Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) {
        lastValidCameraPosition.copy(camera.position);
    } else {
        camera.position.copy(lastValidCameraPosition);
    }

    // Render scene depth pass untuk perpotongan fisika air 100% presisi mengikuti bentuk 3D mesh (batu, pohon, rumput)
    if (typeof renderWaterDepthPass === 'function') {
        renderWaterDepthPass(renderer, scene, camera);
    }

    renderer.render(scene, camera);
}
animate();

// Synchronous & Reactive Viewport Resizing (Dedicated Viewport)
function updateViewportSize() {
    const container = document.getElementById('viewport-container');
    if (!renderer || !camera) return;
    const width = container ? container.clientWidth : window.innerWidth;
    const height = container ? container.clientHeight : window.innerHeight;
    if (width <= 0 || height <= 0) return;

    if (camera.aspect !== width / height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    renderer.setSize(width, height);
}
window.updateViewportSize = updateViewportSize;

window.addEventListener('resize', () => {
    updateViewportSize();
    setTimeout(updateViewportSize, 50);
});

// Listener khusus fullscreen change (Android Chrome / Safari iOS)
const onFullscreenChange = () => {
    updateViewportSize();
    requestAnimationFrame(updateViewportSize);
    setTimeout(updateViewportSize, 60);
    setTimeout(updateViewportSize, 200);
    setTimeout(updateViewportSize, 500);
};
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

if (typeof ResizeObserver !== 'undefined') {
    const container = document.getElementById('viewport-container');
    if (container) {
        new ResizeObserver(() => {
            updateViewportSize();
        }).observe(container);
    }
}
