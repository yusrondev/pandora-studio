/* Undo / Redo system */
// ==========================================
// 3. ROBUST UNDO & REDO SYSTEM
// ==========================================
const undoStack = [];
const redoStack = [];

function captureStateSnapshot() {
    return {
        terrainHeights: groundGeo.attributes.position.array.slice(),
        terrainColors: groundGeo.attributes.color.array.slice(),
        grassData: grassActiveStates.slice(),
        grassColors: instancedGrassMesh.geometry.attributes.instanceColor.array.slice(),
        grassCoordsX: grassCoordsX.slice(),
        grassCoordsZ: grassCoordsZ.slice(),
        grassScales: grassScalesArray.slice(),
        trees: treesList.map(t => {
            let tType = t.userData.typeCode;
            if (!tType) {
                if (t.userData.isPine || (t.userData.type && t.userData.type.toLowerCase().includes('pine'))) {
                    tType = 'pine';
                } else if (t.userData.foliageMat === birchTealMat) {
                    tType = 'birch_teal';
                } else if (t.userData.foliageMat === autumnRedMat) {
                    tType = 'birch_red';
                } else if (t.userData.foliageMat === birchYellowMat) {
                    tType = 'birch_yellow';
                } else if (t.userData.foliageMat === oakGreenMat) {
                    tType = 'oak';
                } else if (t.userData.type === 'Oak Tree') {
                    tType = 'oak';
                } else if (t.userData.type === 'Pine Tree') {
                    tType = 'pine';
                } else if (t.userData.type === 'Birch Tree') {
                    tType = 'birch_yellow';
                } else {
                    tType = 'oak';
                }
            }
            return {
                type: tType,
                posX: t.position.x,
                posZ: t.position.z,
                rotY: t.rotation.y,
                trunkScaleY: t.userData.trunkGroup ? t.userData.trunkGroup.scale.y : 1.0,
                trunkThickness: t.userData.trunkGroup ? (
                    t.userData.isPine && t.userData.trunkGroup.scale.y > 0.001
                        ? (t.userData.trunkGroup.scale.x / t.userData.trunkGroup.scale.y)
                        : t.userData.trunkGroup.scale.x
                ) : 1.0,
                branchCount: t.userData.branchCount || 3,
                curvature: t.userData.curvature !== undefined ? t.userData.curvature : 0.5,
                leafCount: t.userData.leafMesh ? t.userData.leafMesh.count : 1200,
                seed: t.userData.seed // Menyimpan seed pohon untuk menjaga konsistensi bentuk
            };
        }),
        rocks: (typeof rocksList !== 'undefined') ? rocksList.map(r => ({
            posX: r.position.x,
            posY: r.position.y,
            posZ: r.position.z,
            rotX: r.rotation.x,
            rotY: r.rotation.y,
            rotZ: r.rotation.z,
            scaleX: r.scale.x,
            scaleY: r.scale.y,
            scaleZ: r.scale.z
        })) : [],
        flowers: (typeof flowersList !== 'undefined') ? flowersList.map(f => ({
            posX: f.posX !== undefined ? f.posX : (f.position ? f.position.x : 0),
            posY: f.posY !== undefined ? f.posY : (f.position ? f.position.y : 0),
            posZ: f.posZ !== undefined ? f.posZ : (f.position ? f.position.z : 0),
            rotY: f.rotY !== undefined ? f.rotY : (f.rotation ? f.rotation.y : 0),
            flowerType: f.flowerType || (f.userData ? f.userData.flowerType : 'spawn_flower_stem'),
            scaleBase: f.scaleBase !== undefined ? f.scaleBase : (f.userData ? f.userData.scaleBase : 1.0),
            seed: f.seed !== undefined ? f.seed : (f.userData ? f.userData.seed : 0)
        })) : [],
        ferns: (typeof fernsList !== 'undefined') ? fernsList.map(f => ({
            posX: f.position.x,
            posY: f.position.y,
            posZ: f.position.z,
            rotX: f.rotation.x,
            rotY: f.rotation.y,
            rotZ: f.rotation.z,
            scaleX: f.scale.x,
            scaleY: f.scale.y,
            scaleZ: f.scale.z,
            scaleBase: f.userData ? f.userData.scaleBase : 1.0,
            fernType: f.userData ? f.userData.fernType : 'spawn_fern_clump',
            variantIndex: f.userData ? f.userData.variantIndex : 0
        })) : [],
        bushes: (typeof exportBushesData === 'function') ? exportBushesData() : [],
        butterflies: (typeof butterfliesList !== 'undefined') ? butterfliesList.map(b => ({
            centerX: b.centerX,
            centerZ: b.centerZ,
            hoverHeight: b.hoverHeight,
            radiusX: b.radiusX,
            radiusZ: b.radiusZ,
            flightSpeed: b.flightSpeed,
            phase: b.phase,
            flapSpeed: b.flapSpeed,
            type: b.type,
            theme: b.theme
        })) : [],
        cinematic: (typeof CinematicManager !== 'undefined') ? {
            activeSceneIndex: CinematicManager.activeSceneIndex,
            waypoints: JSON.parse(JSON.stringify(CinematicManager.waypoints || [])),
            selectedWaypointIndex: CinematicManager.selectedWaypointIndex,
            scenes: (CinematicManager.scenes && CinematicManager.scenes.length > 0)
                ? (typeof CinematicManager.saveCurrentSceneState === 'function' && CinematicManager.saveCurrentSceneState(), JSON.parse(JSON.stringify(CinematicManager.scenes)))
                : null
        } : null
    };
}

function saveState() {
    undoStack.push(captureStateSnapshot());
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0;
}

function applyState(state) {
    if (!state) return;

    if (state.terrainHeights && groundGeo && groundGeo.attributes.position) {
        const posAttr = groundGeo.attributes.position;
        posAttr.array.set(state.terrainHeights);
        posAttr.needsUpdate = true;
        groundGeo.computeVertexNormals();
        if (typeof syncWaterGeometryWithTerrain === 'function') syncWaterGeometryWithTerrain();
    }

    if (state.terrainColors && groundGeo && groundGeo.attributes.color) {
        const colAttr = groundGeo.attributes.color;
        colAttr.array.set(state.terrainColors);
        colAttr.needsUpdate = true;
    }

    if (state.grassData && typeof grassActiveStates !== 'undefined') {
        if (state.grassData instanceof Uint8Array) {
            grassActiveStates.set(state.grassData);
        } else {
            grassActiveStates.set(new Uint8Array(state.grassData));
        }
    }
    if (state.grassCoordsX && typeof grassCoordsX !== 'undefined') {
        if (state.grassCoordsX instanceof Float32Array) {
            grassCoordsX.set(state.grassCoordsX);
        } else {
            grassCoordsX.set(new Float32Array(state.grassCoordsX));
        }
    }
    if (state.grassCoordsZ && typeof grassCoordsZ !== 'undefined') {
        if (state.grassCoordsZ instanceof Float32Array) {
            grassCoordsZ.set(state.grassCoordsZ);
        } else {
            grassCoordsZ.set(new Float32Array(state.grassCoordsZ));
        }
    }
    if (state.grassScales && typeof grassScalesArray !== 'undefined') {
        if (state.grassScales instanceof Float32Array) {
            grassScalesArray.set(state.grassScales);
        } else {
            grassScalesArray.set(new Float32Array(state.grassScales));
        }
    }

    if (state.grassColors && typeof instancedGrassMesh !== 'undefined' && instancedGrassMesh && instancedGrassMesh.geometry) {
        const colorAttr = instancedGrassMesh.geometry.attributes.instanceColor;
        colorAttr.array.set(state.grassColors);
        colorAttr.needsUpdate = true;
    }

    if (typeof rebuildGrassTransforms === 'function') {
        rebuildGrassTransforms();
    }

    if (state.trees && Array.isArray(state.trees)) {
        treesList.forEach(t => scene.remove(t));
        treesList.length = 0;

        state.trees.forEach(tData => {
            setSeed(tData.seed); // Memuat ulang generator acak pada titik waktu ini!

            let tree;
            const bCount = tData.branchCount || 3;
            const curv = tData.curvature !== undefined ? tData.curvature : 0.5;
            const lCount = tData.leafCount || 1000;

            let tType = tData.type || 'oak';
            if (tType === 'Oak Tree') tType = 'oak';
            else if (tType === 'Pine Tree') tType = 'pine';
            else if (tType === 'Birch Tree') tType = 'birch_yellow';

            let foliageMat = oakGreenMat;
            if (tType === 'oak') {
                tree = createGenshinOakTree(oakGreenMat, lCount, bCount, curv);
                foliageMat = oakGreenMat;
            } else if (tType === 'birch_yellow') {
                tree = createGenshinBirchTree(birchYellowMat, lCount, bCount, curv, 'birch_yellow');
                foliageMat = birchYellowMat;
            } else if (tType === 'birch_teal') {
                tree = createGenshinBirchTree(birchTealMat, lCount, bCount, curv, 'birch_teal');
                foliageMat = birchTealMat;
            } else if (tType === 'birch_red') {
                tree = createGenshinBirchTree(autumnRedMat, lCount, bCount, curv, 'birch_red');
                foliageMat = autumnRedMat;
            } else if (tType === 'pine') {
                tree = createGenshinPineTree(pineEmeraldMat, lCount, curv);
                foliageMat = pineEmeraldMat;
            } else {
                tree = createGenshinOakTree(oakGreenMat, lCount, bCount, curv);
                foliageMat = oakGreenMat;
                tType = 'oak';
            }

            if (!tree) {
                resetSeed();
                return;
            }

            tree.position.set(tData.posX, getTerrainHeightFast(tData.posX, tData.posZ), tData.posZ);
            tree.rotation.y = tData.rotY || 0;
            tree.userData.seed = tData.seed; // Kembalikan tag seed
            tree.userData.typeCode = tType;
            tree.userData.foliageMat = foliageMat;

            if (tree.userData.trunkGroup) {
                const thick = tData.trunkThickness || 1.0;
                const hScale = tData.trunkScaleY || 1.0;
                if (tree.userData.isPine) {
                    const scaleXZ = hScale * thick;
                    tree.userData.trunkGroup.scale.set(scaleXZ, hScale, scaleXZ);
                    if (tree.userData.leafMesh) {
                        tree.userData.leafMesh.scale.set(scaleXZ, hScale, scaleXZ);
                    }
                } else {
                    tree.userData.trunkGroup.scale.set(thick, hScale, thick);
                    if (tree.userData.leafMesh && tree.userData.baseTrunkHeight) {
                        const baseOffset = tree.userData.leafMesh.userData.baseYOffset || 0;
                        tree.userData.leafMesh.position.y = baseOffset + tree.userData.baseTrunkHeight * (hScale - 1.0);
                    }
                }
            }

            resetSeed(); // Lepaskan status pseudo-random

            scene.add(tree);
            treesList.push(tree);
        });

        if (selectedTreeIndex >= treesList.length) {
            selectedTreeIndex = treesList.length - 1;
        }

        refreshLayerUI();
        updateEditorUI();
    }

    // 3b. Restore Bebatuan (Rocks)
    if (state.rocks && typeof rocksList !== 'undefined' && typeof recreateRock === 'function') {
        clearAllRocks();
        state.rocks.forEach(rData => recreateRock(rData));
    }

    // 3c. Restore Bunga (Flowers)
    if (state.flowers && typeof flowersList !== 'undefined' && typeof recreateFlower === 'function') {
        clearAllFlowers();
        state.flowers.forEach(fData => recreateFlower(fData));
    }

    // 3d. Restore Pakis (Ferns)
    if (state.ferns && typeof fernsList !== 'undefined' && typeof recreateFern === 'function') {
        clearAllFerns();
        state.ferns.forEach(fData => recreateFern(fData));
    }

    // 3d2. Restore Semak Belukar (Bushes)
    if (state.bushes && typeof bushesList !== 'undefined' && typeof recreateBush === 'function') {
        clearAllBushes();
        state.bushes.forEach(bData => recreateBush(bData));
    }

    // 3e. Restore Kupu-kupu (Butterflies)
    if (state.butterflies && typeof butterfliesList !== 'undefined' && typeof recreateButterfly === 'function') {
        clearAllButterflies();
        state.butterflies.forEach(bData => recreateButterfly(bData));
    }

    // 4. Restore Cinematic Camera Waypoints / Multi-Scene State
    if (state.cinematic && typeof CinematicManager !== 'undefined' && !CinematicManager.isPlaying) {
        if (CinematicManager.isDraggingWaypoint) {
            CinematicManager.isDraggingWaypoint = false;
            CinematicManager.draggedWaypointIndex = -1;
            if (typeof controls !== 'undefined') controls.enabled = true;
            document.body.style.cursor = '';
        }

        if (state.cinematic.scenes && Array.isArray(state.cinematic.scenes) && state.cinematic.scenes.length > 0) {
            CinematicManager.scenes = JSON.parse(JSON.stringify(state.cinematic.scenes));
            const sIdx = (state.cinematic.activeSceneIndex !== undefined && state.cinematic.activeSceneIndex >= 0 && state.cinematic.activeSceneIndex < state.cinematic.scenes.length)
                ? state.cinematic.activeSceneIndex
                : 0;
            CinematicManager.loadScene(sIdx);
            CinematicManager.selectedWaypointIndex = state.cinematic.selectedWaypointIndex !== undefined
                ? state.cinematic.selectedWaypointIndex
                : (CinematicManager.waypoints.length - 1);
            CinematicManager.updateWaypointAngleUI();
        } else if (state.cinematic.waypoints) {
            CinematicManager.waypoints = JSON.parse(JSON.stringify(state.cinematic.waypoints));
            CinematicManager.selectedWaypointIndex = state.cinematic.selectedWaypointIndex !== undefined
                ? state.cinematic.selectedWaypointIndex
                : 0;
            CinematicManager.rebuildSpline();
            CinematicManager.renderWaypointUI();
            CinematicManager.updateWaypointAngleUI();
        }
    }
}

function performUndo() {
    if (undoStack.length > 0) {
        redoStack.push(captureStateSnapshot());
        const prevState = undoStack.pop();
        applyState(prevState);
        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show('↩ Undo berhasil (Ctrl+Z)', 'info');
        }
    }
}

function performRedo() {
    if (redoStack.length > 0) {
        undoStack.push(captureStateSnapshot());
        const nextState = redoStack.pop();
        applyState(nextState);
        if (typeof PandoraToast !== 'undefined') {
            PandoraToast.show('↪ Redo berhasil (Ctrl+Y)', 'info');
        }
    }
}
