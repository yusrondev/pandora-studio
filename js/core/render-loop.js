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

    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.updateAnimation(elapsedTime, delta);
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

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
