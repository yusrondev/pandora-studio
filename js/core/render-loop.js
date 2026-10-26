/* Main render loop */
// ==========================================
// 12. RENDER LOOP
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // Panggil getDelta() terlebih dahulu sebelum getElapsedTime agar delta bernilai valid (>0)
    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsedTime = clock.getElapsedTime();

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
        const spawnChance = 0.08 * leafFallRate;
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
        updateAllSpawnedFoxesAnimation(elapsedTime);
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
            FoxAIManager.update(delta, elapsedTime);
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

    if (isPlayMode && wolfCharacter) {
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

window.addEventListener('resize', updateViewportSize);

if (typeof ResizeObserver !== 'undefined') {
    const container = document.getElementById('viewport-container');
    if (container) {
        new ResizeObserver(() => {
            updateViewportSize();
        }).observe(container);
    }
}
