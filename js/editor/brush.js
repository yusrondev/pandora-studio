/* Raycasting & brush actions */
// ==========================================
// 10. RAYCASTING & BRUSH ACTIONS
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isMouseDown = false;
let isRightMouseDown = false;

const greenColor = new THREE.Color(0x52b314);
const yellowColor = new THREE.Color(0xd9ab23);
const whiteColor = new THREE.Color(0xf4f9fc);

// Mencegah menu konteks klik-kanan browser muncul saat mengklik canvas 3D
window.addEventListener('contextmenu', (e) => {
    if (e.target && e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});

// Kontrol navigasi kamera: memastikan mouse wheel (scroll zoom in/out) selalu aktif di semua mode spawn/brush
function updateToolControlsState() {
    if (typeof controls === 'undefined') return;
    if (typeof isPlayMode !== 'undefined' && isPlayMode) return;

    const isAnyToolActive = (
        (typeof selectTerrainMode !== 'undefined' && selectTerrainMode.value !== 'none') ||
        (typeof selectRoadBrush !== 'undefined' && selectRoadBrush.value !== 'none') ||
        (typeof selectGrassBrush !== 'undefined' && selectGrassBrush.value !== 'none') ||
        (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') ||
        (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') ||
        (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') ||
        (typeof selectTreeMode !== 'undefined' && selectTreeMode.value !== 'none')
    );

    controls.enabled = true;
    controls.enableZoom = true;

    if (isAnyToolActive) {
        controls.enableRotate = false;
        controls.enablePan = false;
    } else {
        controls.enableRotate = true;
        controls.enablePan = true;
    }
}

// Menghapus rumput di radius tertentu (digunakan oleh kuas remove & klik kanan mode rumput)
function removeGrassInRadius(hitPoint, radius) {
    if (typeof maxGrassCapacity === 'undefined' || !grassActiveStates) return false;
    let updated = false;
    const currentCount = (typeof instancedGrassMesh !== 'undefined' && instancedGrassMesh) ? instancedGrassMesh.count : maxGrassCapacity;
    for (let i = 0; i < currentCount; i++) {
        if (grassActiveStates[i] === 1) {
            const gx = grassCoordsX[i];
            const gz = grassCoordsZ[i];
            const gy = getTerrainHeightFast(gx, gz);

            const dist3D = Math.hypot(gx - hitPoint.x, gy - hitPoint.y, gz - hitPoint.z);
            if (dist3D <= radius) {
                grassActiveStates[i] = 0;
                updated = true;
            }
        }
    }

    if (updated) {
        if (instancedGrassMesh && instancedGrassMesh.geometry && instancedGrassMesh.geometry.attributes.instanceColor) {
            instancedGrassMesh.geometry.attributes.instanceColor.needsUpdate = true;
        }
        rebuildGrassTransforms();
    }
    return updated;
}

function handleBrushAction(event) {
    if (typeof updateMouseCoords === 'function') updateMouseCoords(event, mouse);
    else {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);

    if (intersects.length > 0) {
        const hitPoint = intersects[0].point;

        const sculptMode = selectTerrainMode.value;
        if (sculptMode !== 'none') {
            sculptTerrain(hitPoint, sculptMode, parseFloat(sliderSculptRadius.value));
            return;
        }

        const roadBrush = selectRoadBrush.value;
        if (roadBrush !== 'none') {
            const roadRad = parseFloat(sliderRoadRadius.value);
            paintRoadOnTerrain(hitPoint, roadBrush, roadRad);
            if (roadBrush !== 'remove' && typeof removeGrassInRadius === 'function') {
                removeGrassInRadius(hitPoint, roadRad * 0.85);
            }
            return;
        }

        const grassBrush = selectGrassBrush.value;
        if (grassBrush !== 'none') {
            const radius = parseFloat(sliderGrassRadius.value);
            const userDensitySetting = parseInt(sliderGrassDensity.value);
            const colorAttr = instancedGrassMesh.geometry.attributes.instanceColor;
            let updated = false;

            let activeColor = greenColor;
            if (grassBrush === 'spawn_yellow') {
                activeColor = yellowColor;
            } else if (grassBrush === 'spawn_white') {
                activeColor = whiteColor;
            }

            if (grassBrush === 'remove') {
                removeGrassInRadius(hitPoint, radius);
            } else {
                const currentCount = instancedGrassMesh ? instancedGrassMesh.count : maxGrassCapacity;
                for (let i = 0; i < currentCount; i++) {
                    if (grassActiveStates[i] === 1) {
                        const gx = grassCoordsX[i];
                        const gz = grassCoordsZ[i];
                        const gy = getTerrainHeightFast(gx, gz);

                        const dist3D = Math.hypot(gx - hitPoint.x, gy - hitPoint.y, gz - hitPoint.z);
                        if (dist3D <= radius) {
                            colorAttr.setXYZ(i, activeColor.r, activeColor.g, activeColor.b);
                            grassScalesArray[i] = (0.65 + Math.pow(Math.random(), 1.5) * 0.45) * userGrassHeightSetting;
                            updated = true;
                        }
                    }
                }

                const normalAtHit = getTerrainNormalAt(hitPoint.x, hitPoint.z);
                const slopeAtHit = 1.0 - normalAtHit.dot(worldUp);
                const slopeDensityMultiplier = 1.0 + slopeAtHit * 2.2;

                const desiredDensityCount = Math.floor(radius * radius * userDensitySetting * 0.08 * slopeDensityMultiplier);
                let spawnedInBrush = 0;
                let searchIdx = currentCount;

                for (let attempts = 0; attempts < maxGrassCapacity && spawnedInBrush < desiredDensityCount; attempts++) {
                    while (searchIdx < maxGrassCapacity && grassActiveStates[searchIdx] === 1) {
                        searchIdx++;
                    }
                    if (searchIdx >= maxGrassCapacity) break;
                    const i = searchIdx;
                    searchIdx++;

                    const r = Math.sqrt(Math.random()) * radius;
                    const theta = Math.random() * Math.PI * 2;

                    const newX = hitPoint.x + r * Math.cos(theta);
                    const newZ = hitPoint.z + r * Math.sin(theta);
                    const newY = getTerrainHeightFast(newX, newZ);

                    const dist3D = Math.hypot(newX - hitPoint.x, newY - hitPoint.y, newZ - hitPoint.z);

                    if (dist3D <= radius * 1.15 && Math.abs(newX) < groundSize / 2 && Math.abs(newZ) < groundSize / 2) {
                        grassActiveStates[i] = 1;
                        grassCoordsX[i] = newX;
                        grassCoordsZ[i] = newZ;
                        grassScalesArray[i] = (0.65 + Math.pow(Math.random(), 1.5) * 0.45) * userGrassHeightSetting;
                        colorAttr.setXYZ(i, activeColor.r, activeColor.g, activeColor.b);

                        spawnedInBrush++;
                        updated = true;
                    }
                }
            }

            if (updated) {
                colorAttr.needsUpdate = true;
                rebuildGrassTransforms();
            }
        }

        const rockBrush = (typeof selectRockBrush !== 'undefined') ? selectRockBrush.value : 'none';
        if (rockBrush !== 'none') {
            const radius = (typeof sliderRockRadius !== 'undefined') ? parseFloat(sliderRockRadius.value) : 4.0;
            if (rockBrush === 'remove') {
                removeRocksInRadius(hitPoint, radius);
            } else {
                placeRocksAt(hitPoint, rockBrush);
            }
            return;
        }

        const flowerBrush = (typeof selectFlowerBrush !== 'undefined') ? selectFlowerBrush.value : 'none';
        if (flowerBrush !== 'none') {
            const radius = (typeof sliderFlowerRadius !== 'undefined') ? parseFloat(sliderFlowerRadius.value) : 3.5;
            if (flowerBrush === 'remove') {
                removeFlowersInRadius(hitPoint, radius);
            } else {
                placeFlowersAt(hitPoint, flowerBrush);
            }
            return;
        }

        const butterflyBrush = (typeof selectButterflyBrush !== 'undefined') ? selectButterflyBrush.value : 'none';
        if (butterflyBrush !== 'none') {
            const radius = (typeof sliderButterflyRadius !== 'undefined') ? parseFloat(sliderButterflyRadius.value) : 4.0;
            if (butterflyBrush === 'remove') {
                removeButterfliesInRadius(hitPoint, radius);
            } else {
                placeButterfliesAt(hitPoint, butterflyBrush);
            }
            return;
        }
    }
}

let lastPointerActionTime = 0;
let selectionPointerDownInfo = null;
let isHoldingForCamera = false;

function handleCanvasPointerDown(e) {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) return;
    if (e.target.tagName !== 'CANVAS') return;
    if (e.target.closest('#top-toolbar') || e.target.closest('#sidebar-left') || e.target.closest('#sidebar-right') || e.target.closest('.dock-trigger') || e.target.closest('.mode-banner') || e.target.closest('.play-hud') || e.target.closest('.fox-species-bar') || e.target.closest('#cinematic-bottom-panel')) return;
    if (typeof CinematicManager !== 'undefined' && (CinematicManager.isDraggingWaypoint || CinematicManager.isDragModeActive)) return;

    // Cegah double-trigger dari pointerdown + mousedown berturut-turut
    const now = Date.now();
    if (now - lastPointerActionTime < 50) return;
    lastPointerActionTime = now;

    if (typeof updateMouseCoords === 'function') updateMouseCoords(e, mouse);
    else {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, camera);

    // ==========================================
    // RIGHT CLICK (e.button === 2) -> HAPUS POHON / RUMPUT DI POINTER
    // ==========================================
    if (e.button === 2) {
        e.preventDefault();

        // 1. Mode Tree Spawner: Klik kanan = hapus pohon yang ada di pointer
        if (selectTreeMode.value !== 'none') {
            let deleted = false;
            if (typeof treesList !== 'undefined' && treesList.length > 0) {
                const treeHits = raycaster.intersectObjects(treesList, true);
                if (treeHits.length > 0) {
                    let rootTree = treeHits[0].object;
                    while (rootTree && rootTree.parent && rootTree.parent !== scene) {
                        rootTree = rootTree.parent;
                    }
                    const treeIdx = treesList.indexOf(rootTree);
                    if (treeIdx !== -1) {
                        saveState();
                        scene.remove(rootTree);
                        treesList.splice(treeIdx, 1);
                        if (selectedTreeIndex === treeIdx) {
                            selectedTreeIndex = treesList.length - 1;
                        } else if (selectedTreeIndex > treeIdx) {
                            selectedTreeIndex--;
                        }
                        refreshLayerUI();
                        updateEditorUI();
                        deleted = true;
                    }
                }
            }

            if (!deleted) {
                const groundHits = raycaster.intersectObject(ground);
                if (groundHits.length > 0) {
                    const pt = groundHits[0].point;
                    deleteTreeAtLocation(pt.x, pt.z, 4.0);
                }
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        // 2. Mode Grass Brush: Klik kanan = hapus rumput dalam radius kursor
        if (selectGrassBrush.value !== 'none') {
            const groundHits = raycaster.intersectObject(ground);
            if (groundHits.length > 0) {
                saveState();
                isRightMouseDown = true;
                const radius = parseFloat(sliderGrassRadius.value) || 4.0;
                removeGrassInRadius(groundHits[0].point, radius);
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        // 3. Mode Road Brush: Klik kanan = hapus jalan setapak kembali ke rumput
        if (selectRoadBrush.value !== 'none') {
            const groundHits = raycaster.intersectObject(ground);
            if (groundHits.length > 0) {
                saveState();
                isRightMouseDown = true;
                const radius = parseFloat(sliderRoadRadius.value) || 4.0;
                paintRoadOnTerrain(groundHits[0].point, 'remove', radius);
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        // 4. Mode Rock Brush: Klik kanan = hapus bebatuan dalam radius kursor
        if (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') {
            const groundHits = raycaster.intersectObject(ground);
            if (groundHits.length > 0) {
                saveState();
                isRightMouseDown = true;
                const radius = (typeof sliderRockRadius !== 'undefined') ? (parseFloat(sliderRockRadius.value) || 4.0) : 4.0;
                removeRocksInRadius(groundHits[0].point, radius);
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        // 5. Mode Flower Brush: Klik kanan = hapus bunga dalam radius kursor
        if (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') {
            const groundHits = raycaster.intersectObject(ground);
            if (groundHits.length > 0) {
                saveState();
                isRightMouseDown = true;
                const radius = (typeof sliderFlowerRadius !== 'undefined') ? (parseFloat(sliderFlowerRadius.value) || 3.5) : 3.5;
                removeFlowersInRadius(groundHits[0].point, radius);
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        // 6. Mode Butterfly Brush: Klik kanan = hapus kupu-kupu dalam radius kursor
        if (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') {
            const groundHits = raycaster.intersectObject(ground);
            if (groundHits.length > 0) {
                saveState();
                isRightMouseDown = true;
                const radius = (typeof sliderButterflyRadius !== 'undefined') ? (parseFloat(sliderButterflyRadius.value) || 4.0) : 4.0;
                removeButterfliesInRadius(groundHits[0].point, radius);
            }
            if (e.stopPropagation) e.stopPropagation();
            return;
        }

        return;
    }

    // ==========================================
    // LEFT CLICK (e.button === 0) -> SPAWN / PAINT
    // ==========================================
    if (e.button === 0) {
        const intersects = raycaster.intersectObject(ground);
        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;

            const treeMode = selectTreeMode.value;
            if (treeMode !== 'none') {
                spawnTreeAtLocation(treeMode, hitPoint.x, hitPoint.z);
                if (e.stopPropagation) e.stopPropagation();
                return;
            }

            if (selectTerrainMode.value !== 'none' || selectRoadBrush.value !== 'none' || selectGrassBrush.value !== 'none' || (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') || (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') || (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none')) {
                saveState();
                isMouseDown = true;
                if (typeof controls !== 'undefined') controls.enabled = false;
                handleBrushAction(e);
                if (e.stopPropagation) e.stopPropagation();
                return;
            }
        }

        // 3. Selection Tracker: Jika tidak ada mode brush aktif, catat titik pointerdown untuk bedakan Click vs Hold
        const isBrushActive = (selectTreeMode && selectTreeMode.value !== 'none') ||
            (selectTerrainMode && selectTerrainMode.value !== 'none') ||
            (selectRoadBrush && selectRoadBrush.value !== 'none') ||
            (selectGrassBrush && selectGrassBrush.value !== 'none') ||
            (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') ||
            (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') ||
            (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') ||
            (typeof CinematicManager !== 'undefined' && (CinematicManager.isDrawingMode || CinematicManager.isDrawingFoxMode));

        if (!isBrushActive) {
            selectionPointerDownInfo = {
                x: e.clientX,
                y: e.clientY,
                time: performance.now(),
                target: e.target
            };
            isHoldingForCamera = false;
            // PENTING: JANGAN panggil e.stopPropagation() agar OrbitControls bebas menggerakkan kamera editor jika user melakukan on-hold / drag!
            return;
        }
    }
}

window.addEventListener('pointerdown', handleCanvasPointerDown);
window.addEventListener('mousedown', handleCanvasPointerDown);

// ==========================================
// 10B. 3D DYNAMIC BRUSH & SPAWNER RETICLE OUTLINE
// ==========================================
const brushReticleGroup = new THREE.Group();
brushReticleGroup.visible = false;
scene.add(brushReticleGroup);

// 1. Cincin Luar Glowing Utama (Outer Ring Outline)
const reticleOuterGeo = new THREE.RingGeometry(0.96, 1.0, 64);
reticleOuterGeo.rotateX(-Math.PI / 2);
const reticleOuterMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
});
const reticleOuterMesh = new THREE.Mesh(reticleOuterGeo, reticleOuterMat);
reticleOuterMesh.renderOrder = 999;
brushReticleGroup.add(reticleOuterMesh);

// 2. Area Dalam Semi-Transparan (Fill Indicator)
const reticleFillGeo = new THREE.RingGeometry(0.02, 0.96, 64);
reticleFillGeo.rotateX(-Math.PI / 2);
const reticleFillMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.14,
    depthWrite: false
});
const reticleFillMesh = new THREE.Mesh(reticleFillGeo, reticleFillMat);
reticleFillMesh.renderOrder = 998;
brushReticleGroup.add(reticleFillMesh);

// 3. Titik Tengah Akurat (Center Precision Dot)
const reticleCenterGeo = new THREE.CircleGeometry(0.12, 16);
reticleCenterGeo.rotateX(-Math.PI / 2);
const reticleCenterMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
});
const reticleCenterMesh = new THREE.Mesh(reticleCenterGeo, reticleCenterMat);
reticleCenterMesh.renderOrder = 1000;
brushReticleGroup.add(reticleCenterMesh);

// 4. Tree Spawner Planting Reticle & Silhouette
const treeReticleGroup = new THREE.Group();
treeReticleGroup.visible = false;
brushReticleGroup.add(treeReticleGroup);

// Lingkaran footprint batang pohon
const treeTrunkFootprintGeo = new THREE.RingGeometry(0.24, 0.32, 24);
treeTrunkFootprintGeo.rotateX(-Math.PI / 2);
const treeTrunkFootprintMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
});
const treeTrunkFootprintMesh = new THREE.Mesh(treeTrunkFootprintGeo, treeTrunkFootprintMat);
treeTrunkFootprintMesh.renderOrder = 1001;
treeReticleGroup.add(treeTrunkFootprintMesh);

// Preview siluet kanopi pohon (wireframe)
const treeCrownPreviewGeo = new THREE.ConeGeometry(1.1, 2.2, 7);
treeCrownPreviewGeo.translate(0, 1.4, 0);
const treeCrownPreviewMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    wireframe: true,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
});
const treeCrownPreviewMesh = new THREE.Mesh(treeCrownPreviewGeo, treeCrownPreviewMat);
treeCrownPreviewMesh.renderOrder = 1002;
treeReticleGroup.add(treeCrownPreviewMesh);

function updateBrushReticle(hitPoint, normal) {
    if ((typeof isPlayMode !== 'undefined' && isPlayMode) || (typeof CinematicManager !== 'undefined' && CinematicManager.isPlaying)) {
        brushReticleGroup.visible = false;
        return;
    }

    const sculptMode = selectTerrainMode.value;
    const roadBrush = selectRoadBrush.value;
    const grassBrush = selectGrassBrush.value;
    const rockBrush = (typeof selectRockBrush !== 'undefined') ? selectRockBrush.value : 'none';
    const flowerBrush = (typeof selectFlowerBrush !== 'undefined') ? selectFlowerBrush.value : 'none';
    const butterflyBrush = (typeof selectButterflyBrush !== 'undefined') ? selectButterflyBrush.value : 'none';
    const treeMode = selectTreeMode.value;

    const isActive = (sculptMode !== 'none' || roadBrush !== 'none' || grassBrush !== 'none' || rockBrush !== 'none' || flowerBrush !== 'none' || butterflyBrush !== 'none' || treeMode !== 'none');
    if (!isActive || !hitPoint) {
        brushReticleGroup.visible = false;
        return;
    }

    brushReticleGroup.visible = true;
    brushReticleGroup.position.set(hitPoint.x, hitPoint.y + 0.05, hitPoint.z);

    // Selaraskan kemiringan ring mengikuti lereng permukaan tanah
    if (normal) {
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        brushReticleGroup.quaternion.copy(alignQuat);
    } else {
        brushReticleGroup.quaternion.identity();
    }

    let radius = 1.0;
    let colorHex = 0x38bdf8;
    treeReticleGroup.visible = false;

    if (sculptMode !== 'none') {
        radius = parseFloat(sliderSculptRadius.value) || 5.0;
        if (sculptMode === 'raise') colorHex = 0x38bdf8;       // Biru muda cerah (Naikkan tanah)
        else if (sculptMode === 'lower') colorHex = 0xf97316;  // Oranye merah (Turunkan lembah)
        else colorHex = 0xeab308;                              // Kuning emas (Ratakan tanah)
    } else if (roadBrush !== 'none') {
        radius = parseFloat(sliderRoadRadius.value) || 4.0;
        if (roadBrush === 'road_clay') colorHex = 0xb46b3f;      // Terakota tanah liat PBR
        else if (roadBrush === 'road_green') colorHex = 0x84cc16; // Hijau berlumut
        else if (roadBrush === 'remove') colorHex = 0xef4444;     // Merah hapus jalan
        else colorHex = 0xf59e0b;                                 // Amber jalan tanah coklat
    } else if (grassBrush !== 'none') {
        radius = parseFloat(sliderGrassRadius.value) || 4.0;
        if (grassBrush === 'remove') colorHex = 0xef4444;       // Merah hapus rumput
        else if (grassBrush === 'spawn_yellow') colorHex = 0xfacc15; // Kuning emas padang rumput
        else colorHex = 0x10b981;                               // Hijau zamrud rumput segar
    } else if (rockBrush !== 'none') {
        radius = (typeof sliderRockRadius !== 'undefined') ? (parseFloat(sliderRockRadius.value) || 4.0) : 4.0;
        if (rockBrush === 'remove') colorHex = 0xef4444;       // Merah hapus batu
        else if (rockBrush === 'spawn_boulder') colorHex = 0x475569; // Slate gelap boulder
        else colorHex = 0x94a3b8;                              // Abu-abu terang batu anime
    } else if (flowerBrush !== 'none') {
        radius = (typeof sliderFlowerRadius !== 'undefined') ? (parseFloat(sliderFlowerRadius.value) || 3.5) : 3.5;
        if (flowerBrush === 'remove') colorHex = 0xef4444;
        else if (flowerBrush === 'spawn_flower_violet') colorHex = 0xc084fc;
        else if (flowerBrush === 'spawn_flower_solar') colorHex = 0xf59e0b;
        else colorHex = 0x38bdf8;
    } else if (butterflyBrush !== 'none') {
        radius = (typeof sliderButterflyRadius !== 'undefined') ? (parseFloat(sliderButterflyRadius.value) || 4.0) : 4.0;
        if (butterflyBrush === 'remove') colorHex = 0xef4444;
        else if (butterflyBrush === 'spawn_butterfly_cyan') colorHex = 0x06b6d4;
        else colorHex = 0xa855f7;
    } else if (treeMode !== 'none') {
        radius = 1.8; // Radius tajuk pohon rata-rata
        treeReticleGroup.visible = true;
        const tLower = treeMode.toLowerCase();
        if (tLower.includes('yellow')) colorHex = 0xfacc15;      // Kuning emas birch
        else if (tLower.includes('teal')) colorHex = 0x14b8a6;    // Teal toska birch
        else if (tLower.includes('red') || tLower.includes('autumn')) colorHex = 0xf97316; // Oranye kemerahan autumn
        else if (tLower.includes('pine')) colorHex = 0x059669;   // Hijau cemara pine
        else colorHex = 0x22c55e;                                 // Hijau oak klasik
        treeCrownPreviewMat.color.setHex(colorHex);
    }

    reticleOuterMesh.scale.set(radius, 1, radius);
    reticleFillMesh.scale.set(radius, 1, radius);
    reticleOuterMat.color.setHex(colorHex);
    reticleFillMat.color.setHex(colorHex);
}

function handleCanvasPointerMove(e) {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        if (brushReticleGroup.visible) brushReticleGroup.visible = false;
        return;
    }

    if (selectionPointerDownInfo) {
        const dist = Math.hypot(e.clientX - selectionPointerDownInfo.x, e.clientY - selectionPointerDownInfo.y);
        if (dist > 5 || (performance.now() - selectionPointerDownInfo.time) > 280) {
            isHoldingForCamera = true; // Terdeteksi On-Hold / Drag untuk gerakkan kamera editor
        }
    }

    if (typeof CinematicManager !== 'undefined' && CinematicManager.isPlaying) {
        if (brushReticleGroup.visible) brushReticleGroup.visible = false;
        return;
    }

    // Raycast kursor mouse untuk outline reticle instan di canvas
    if (typeof updateMouseCoords === 'function') updateMouseCoords(e, mouse);
    else {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(ground);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const normal = hit.face ? hit.face.normal : getTerrainNormalAt(hit.point.x, hit.point.z);
        updateBrushReticle(hit.point, normal);
    } else {
        if (brushReticleGroup.visible) brushReticleGroup.visible = false;
    }

    // Left mouse drag (Sculpt, Road paint, Grass paint, Rock paint, Flower paint, Butterfly paint)
    if (isMouseDown && (selectTerrainMode.value !== 'none' || selectRoadBrush.value !== 'none' || selectGrassBrush.value !== 'none' || (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') || (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') || (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none'))) {
        if (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') {
            if (selectRockBrush.value === 'remove' || Math.random() > 0.65) {
                handleBrushAction(e);
            }
        } else if (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') {
            if (selectFlowerBrush.value === 'remove' || Math.random() > 0.65) {
                handleBrushAction(e);
            }
        } else if (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') {
            if (selectButterflyBrush.value === 'remove' || Math.random() > 0.78) {
                handleBrushAction(e);
            }
        } else {
            handleBrushAction(e);
        }
    }

    // Right mouse drag (Grass erase, Road erase, Rock erase, Flower erase, Butterfly erase)
    if (isRightMouseDown && intersects.length > 0) {
        const hitPoint = intersects[0].point;
        if (selectGrassBrush.value !== 'none') {
            const radius = parseFloat(sliderGrassRadius.value) || 4.0;
            removeGrassInRadius(hitPoint, radius);
        } else if (selectRoadBrush.value !== 'none') {
            const radius = parseFloat(sliderRoadRadius.value) || 4.0;
            paintRoadOnTerrain(hitPoint, 'remove', radius);
        } else if (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') {
            const radius = (typeof sliderRockRadius !== 'undefined') ? (parseFloat(sliderRockRadius.value) || 4.0) : 4.0;
            removeRocksInRadius(hitPoint, radius);
        } else if (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') {
            const radius = (typeof sliderFlowerRadius !== 'undefined') ? (parseFloat(sliderFlowerRadius.value) || 3.5) : 3.5;
            removeFlowersInRadius(hitPoint, radius);
        } else if (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') {
            const radius = (typeof sliderButterflyRadius !== 'undefined') ? (parseFloat(sliderButterflyRadius.value) || 4.0) : 4.0;
            removeButterfliesInRadius(hitPoint, radius);
        }
    }
}

window.addEventListener('pointermove', handleCanvasPointerMove);
window.addEventListener('mousemove', handleCanvasPointerMove);

window.addEventListener('mouseleave', () => {
    brushReticleGroup.visible = false;
    isMouseDown = false;
    isRightMouseDown = false;
});

// Update ukuran reticle saat slider radius digeser
if (typeof sliderSculptRadius !== 'undefined') {
    sliderSculptRadius.addEventListener('input', () => {
        if (selectTerrainMode.value !== 'none') {
            const r = parseFloat(sliderSculptRadius.value) || 5.0;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

if (typeof sliderRoadRadius !== 'undefined') {
    sliderRoadRadius.addEventListener('input', () => {
        if (selectRoadBrush.value !== 'none') {
            const r = parseFloat(sliderRoadRadius.value) || 4.0;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

if (typeof sliderGrassRadius !== 'undefined') {
    sliderGrassRadius.addEventListener('input', () => {
        if (selectGrassBrush.value !== 'none') {
            const r = parseFloat(sliderGrassRadius.value) || 4.0;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

if (typeof sliderRockRadius !== 'undefined') {
    sliderRockRadius.addEventListener('input', () => {
        if (typeof selectRockBrush !== 'undefined' && selectRockBrush.value !== 'none') {
            const r = parseFloat(sliderRockRadius.value) || 4.0;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

if (typeof sliderFlowerRadius !== 'undefined') {
    sliderFlowerRadius.addEventListener('input', () => {
        if (typeof selectFlowerBrush !== 'undefined' && selectFlowerBrush.value !== 'none') {
            const r = parseFloat(sliderFlowerRadius.value) || 3.5;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

if (typeof sliderButterflyRadius !== 'undefined') {
    sliderButterflyRadius.addEventListener('input', () => {
        if (typeof selectButterflyBrush !== 'undefined' && selectButterflyBrush.value !== 'none') {
            const r = parseFloat(sliderButterflyRadius.value) || 4.0;
            reticleOuterMesh.scale.set(r, 1, r);
            reticleFillMesh.scale.set(r, 1, r);
        }
    });
}

function handleCanvasPointerUp(e) {
    if (typeof isPlayMode !== 'undefined' && isPlayMode) return;
    if (isMouseDown && selectTerrainMode.value !== 'none') {
        groundGeo.computeVertexNormals();
        updateTreesAndGrassPositions();
    }
    isMouseDown = false;
    isRightMouseDown = false;
    updateToolControlsState();

    // Seleksi & Fokus Objek HANYA dieksekusi jika Klik Cepat (Tap), BUKAN saat On-Hold / Drag Kamera
    if (selectionPointerDownInfo) {
        const info = selectionPointerDownInfo;
        selectionPointerDownInfo = null; // Segera konsumsi agar tidak double-trigger oleh mouseup
        const endX = (e && typeof e.clientX === 'number') ? e.clientX : info.x;
        const endY = (e && typeof e.clientY === 'number') ? e.clientY : info.y;
        const dist = Math.hypot(endX - info.x, endY - info.y);
        const duration = performance.now() - info.time;
        const wasHoldOrDrag = isHoldingForCamera || dist > 6 || duration > 320;
        isHoldingForCamera = false;

        if (!wasHoldOrDrag && !(typeof CinematicManager !== 'undefined' && CinematicManager.isPlaying)) {
            if (typeof updateMouseCoords === 'function') updateMouseCoords({ clientX: endX, clientY: endY }, mouse);
            else {
                mouse.x = (endX / window.innerWidth) * 2 - 1;
                mouse.y = -(endY / window.innerHeight) * 2 + 1;
            }
            raycaster.setFromCamera(mouse, camera);

            // 1. Cek Titik Waypoint Kamera Cinematic terlebih dahulu
            let handled = false;
            if (typeof CinematicManager !== 'undefined' && !CinematicManager.isDrawingMode && !CinematicManager.isDrawingFoxMode && CinematicManager.pathGroup && CinematicManager.pathGroup.visible) {
                const camHits = raycaster.intersectObjects(CinematicManager.pathGroup.children, true);
                if (camHits.length > 0) {
                    let obj = camHits[0].object;
                    while (obj && obj !== CinematicManager.pathGroup) {
                        if (obj.userData && obj.userData.isWaypointMarker) {
                            CinematicManager.selectWaypoint(obj.userData.index);
                            handled = true;
                            break;
                        }
                        obj = obj.parent;
                    }
                }
            }

            // 2. Cek Seleksi Pohon & Smooth Focus Kamera
            if (!handled && typeof treesList !== 'undefined' && treesList.length > 0) {
                const treeHits = raycaster.intersectObjects(treesList, true);
                if (treeHits.length > 0) {
                    let rootTree = treeHits[0].object;
                    while (rootTree && rootTree.parent && rootTree.parent !== scene) {
                        rootTree = rootTree.parent;
                    }
                    const treeIdx = treesList.indexOf(rootTree);
                    if (treeIdx !== -1) {
                        selectedTreeIndex = treeIdx;
                        refreshLayerUI();
                        updateEditorUI();
                        if (typeof SelectionOutlineManager !== 'undefined') {
                            SelectionOutlineManager.selectObject(rootTree, true); // Smooth focus ke objek pohon terpilih!
                        }
                        handled = true;
                    }
                } else {
                    // Klik di luar objek (tanah kosong): bersihkan seleksi outline jika ada
                    if (typeof SelectionOutlineManager !== 'undefined') {
                        SelectionOutlineManager.clearSelection();
                    }
                }
            }
        }
    }
}

window.addEventListener('pointerup', handleCanvasPointerUp);
window.addEventListener('mouseup', handleCanvasPointerUp);

selectTerrainMode.addEventListener('change', () => {
    if (selectTerrainMode.value !== 'none') {
        selectRoadBrush.value = 'none';
        selectGrassBrush.value = 'none';
        selectTreeMode.value = 'none';
    } else {
        brushReticleGroup.visible = false;
    }
    updateToolControlsState();
    if (typeof updateActiveModeHUD === 'function') updateActiveModeHUD();
});

selectRoadBrush.addEventListener('change', () => {
    if (selectRoadBrush.value !== 'none') {
        selectTerrainMode.value = 'none';
        selectGrassBrush.value = 'none';
        selectTreeMode.value = 'none';
    } else {
        brushReticleGroup.visible = false;
    }
    updateToolControlsState();
    if (typeof updateActiveModeHUD === 'function') updateActiveModeHUD();
});

selectGrassBrush.addEventListener('change', () => {
    if (selectGrassBrush.value !== 'none') {
        selectTerrainMode.value = 'none';
        selectRoadBrush.value = 'none';
        selectTreeMode.value = 'none';
    } else {
        brushReticleGroup.visible = false;
    }
    updateToolControlsState();
    if (typeof updateActiveModeHUD === 'function') updateActiveModeHUD();
});

selectTreeMode.addEventListener('change', () => {
    if (selectTreeMode.value !== 'none') {
        selectTerrainMode.value = 'none';
        selectRoadBrush.value = 'none';
        selectGrassBrush.value = 'none';
    } else {
        brushReticleGroup.visible = false;
    }
    updateToolControlsState();
    if (typeof updateActiveModeHUD === 'function') updateActiveModeHUD();
});

saveState();
