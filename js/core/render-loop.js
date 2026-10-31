/* Main render loop */
// ==========================================
// 12. RENDER LOOP
// ==========================================
const clock = new THREE.Clock();

// Material yang dipakai bersama InstancedMesh berwarna dan tanpa warna membuat Three membaca instanceColor
// yang null, dan galat itu menghentikan render tiap frame. Mesh tersebut diberi warna putih (tampilan sama).
const renderBufferDirectOriginal = renderer.renderBufferDirect;
renderer.renderBufferDirect = function (cam, activeScene, geometry, material, object, group) {
    try {
        return renderBufferDirectOriginal.call(this, cam, activeScene, geometry, material, object, group);
    } catch (err) {
        if (!object.isInstancedMesh || object.instanceColor !== null) throw err;
        const names = [];
        for (let node = object; node; node = node.parent) names.push(node.name || node.type);
        console.warn('[Render] InstancedMesh tanpa instanceColor:', names.join(' < '), material.type, err.message);
        object.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(object.instanceMatrix.count * 3).fill(1), 3);
    }
};

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

// Saat bermain, bayangan karakter diperbarui tiap frame agar tidak tersendat. Pohon dan batu yang mahal
// digambar jarang ke peta terpisah, lalu disalin sebagai dasar peta bayangan tiap frame.
const SHADOW_STATIC_REFRESH_FACTOR = 3; // Dikali shadowEvery preset; daun yang bergoyang tetap hidup
const ShadowCache = {
    target: null,
    framesSinceBake: Infinity,
    lightX: NaN,
    lightZ: NaN,

    framebuffer(renderTarget) {
        return renderer.properties.get(renderTarget).__webglFramebuffer;
    },

    blit(from, to, width, height) {
        const gl = renderer.getContext();
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    },

    staticCasters() {
        const casters = [];
        const collect = (object) => {
            if (object.isMesh && object.castShadow) casters.push(object);
        };
        treesList.forEach(tree => tree.traverse(collect));
        rocksGroup.traverse(collect);
        return casters;
    },

    setCasting(casters, value) {
        for (let i = 0; i < casters.length; i++) casters[i].castShadow = value;
    },

    bake(renderShadows, statics, activeScene, map) {
        const staticSet = new Set(statics);
        const others = [];
        activeScene.traverse((object) => {
            if (object.isMesh && object.castShadow && !staticSet.has(object)) others.push(object);
        });
        this.setCasting(others, false);
        renderShadows();
        this.setCasting(others, true);

        if (!this.target || this.target.width !== map.width || this.target.height !== map.height) {
            if (this.target) this.target.dispose();
            this.target = new THREE.WebGLRenderTarget(map.width, map.height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat
            });
        }
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(this.target);
        const gl = renderer.getContext();
        const targetBuffer = this.framebuffer(this.target);
        this.blit(this.framebuffer(map), targetBuffer, map.width, map.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetBuffer);
        renderer.setRenderTarget(previous);
    },

    install() {
        const shadowMap = renderer.shadowMap;
        const renderOriginal = shadowMap.render;
        const cache = this;
        shadowMap.render = function (lights, activeScene, activeCamera) {
            const map = sunLight.shadow.map;
            const usable = this.needsUpdate && isPlayMode && map && lights.length === 1 && renderer.capabilities.isWebGL2;
            if (!usable) {
                renderOriginal.call(this, lights, activeScene, activeCamera);
                return;
            }
            const renderShadows = () => {
                this.needsUpdate = true;
                renderOriginal.call(this, lights, activeScene, activeCamera);
            };
            const statics = cache.staticCasters();
            const lightMoved = sunLight.position.x !== cache.lightX || sunLight.position.z !== cache.lightZ;
            const refreshEvery = PandoraSettings.preset().shadowEvery * SHADOW_STATIC_REFRESH_FACTOR;
            if (lightMoved || !cache.target || cache.framesSinceBake >= refreshEvery || cache.target.width !== map.width) {
                cache.bake(renderShadows, statics, activeScene, map);
                cache.lightX = sunLight.position.x;
                cache.lightZ = sunLight.position.z;
                cache.framesSinceBake = 0;
            }
            cache.framesSinceBake++;

            // Pengganti clear() di dalam pass bayangan: isi peta dengan dasar statis, termasuk kedalamannya
            const clearOriginal = renderer.clear;
            renderer.clear = function () {
                const gl = renderer.getContext();
                const buffer = cache.framebuffer(map);
                cache.blit(cache.framebuffer(cache.target), buffer, map.width, map.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
            };
            cache.setCasting(statics, false);
            try {
                renderShadows();
            } finally {
                cache.setCasting(statics, true);
                renderer.clear = clearOriginal;
            }
        };
    }
};
ShadowCache.install();

function updateShadowSchedule(isGameplay) {
    const every = isPlayMode ? 1 : (isGameplay ? PandoraSettings.preset().shadowEvery : SHADOW_UPDATE_EVERY_EDITOR);
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
        // Saat stage disiapkan di balik menu judul, menggambar hanya memboroskan baterai
        if (!window.PandoraRenderHold) renderer.render(scene, camera);
        return;
    }
    updateShadowSchedule(isGameplay);

    // Panggil getDelta() terlebih dahulu sebelum getElapsedTime agar delta bernilai valid (>0)
    const realDelta = Math.min(clock.getDelta(), 0.1);
    const delta = realDelta * (window.PandoraTimeScale || 1);
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

    if (window.PandoraImportedObjects) {
        PandoraImportedObjects.update(delta);
    }
    if (typeof PandoraUltimate !== 'undefined') {
        PandoraUltimate.update(delta, realDelta);
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

    // Api Rage Mode mengikuti tulang tangan yang sudah final untuk frame ini
    if (typeof PandoraUltimate !== 'undefined') {
        PandoraUltimate.updateFlames(realDelta);
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

    if (typeof BossKillCam !== 'undefined') BossKillCam.beforeRender(realDelta);

    // Render scene depth pass untuk perpotongan fisika air 100% presisi mengikuti bentuk 3D mesh (batu, pohon, rumput)
    if (typeof renderWaterDepthPass === 'function') {
        renderWaterDepthPass(renderer, scene, camera);
    }

    if (typeof BossKillCam !== 'undefined' && BossKillCam.active) {
        BossKillCam.render();
        BossKillCam.afterRender();
    } else {
        renderer.render(scene, camera);
    }
}
// Frame pertama setelah semua skrip selesai: di build, seluruh engine adalah satu berkas
requestAnimationFrame(animate);

// Synchronous & Reactive Viewport Resizing (Dedicated Viewport)
function updateViewportSize() {
    const container = document.getElementById('viewport-container');
    if (!renderer || !camera) return;
    const width = container ? container.clientWidth : window.innerWidth;
    const height = container ? container.clientHeight : window.innerHeight;
    if (width <= 0 || height <= 0) return;

    const currentSize = renderer.getSize(new THREE.Vector2());
    if (currentSize.x === width && currentSize.y === height) return;

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
