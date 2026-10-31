/* Menerapkan data stage ke scene. Dipakai Studio dan game hasil generate. */
// Build game: tanah di bawah rumput diberi warna rumput yang lebih gelap, supaya warna dasarnya tidak
// tampak sebagai bercak terang di sela helai, terutama di preset rendah yang menggambar lebih sedikit rumput.
const GRASS_GROUND_SHADE = 0.7;

function tintGroundUnderGrass() {
    const colors = instancedGrassMesh.geometry.attributes.instanceColor.array;
    const ground = groundGeo.attributes.color;
    const stride = groundSegments + 1;
    const sums = new Float32Array(ground.count * 3);
    const counts = new Uint16Array(ground.count);
    for (let i = 0; i < maxGrassCapacity; i++) {
        if (grassActiveStates[i] !== 1) continue;
        const col = Math.round((grassCoordsX[i] / groundSize + 0.5) * groundSegments);
        const row = Math.round((grassCoordsZ[i] / groundSize + 0.5) * groundSegments);
        if (col < 0 || col > groundSegments || row < 0 || row > groundSegments) continue;
        const vertex = row * stride + col;
        sums[vertex * 3] += colors[i * 3];
        sums[vertex * 3 + 1] += colors[i * 3 + 1];
        sums[vertex * 3 + 2] += colors[i * 3 + 2];
        counts[vertex]++;
    }
    for (let v = 0; v < ground.count; v++) {
        if (counts[v] === 0) continue;
        for (let c = 0; c < 3; c++) ground.array[v * 3 + c] = sums[v * 3 + c] / counts[v] * GRASS_GROUND_SHADE;
    }
    ground.needsUpdate = true;
}

function applyMapDataToScene(mapData) {
    if (!mapData) return;

    // Simpan snapshot untuk undo sebelum menerapkan map
    if (typeof saveState === 'function' && !mapData._skipHistory) {
        saveState();
    }

    // 1. Terapkan Environment Settings
    if (mapData.environment) {
        const env = mapData.environment;

        // Canvas Size
        if (typeof env.canvasSize !== 'undefined' && typeof setCanvasSize === 'function') {
            setCanvasSize(parseFloat(env.canvasSize));
        }

        // Plane color
        if (env.planeColor) {
            if (typeof setTerrainPlaneColor === 'function') {
                setTerrainPlaneColor(env.planeColor);
            }
            const picker = document.getElementById('picker-plane-color');
            const label = document.getElementById('label-plane-color');
            if (picker) picker.value = env.planeColor;
            if (label) label.innerText = env.planeColor;
        }

        // Studio Grid
        if (typeof env.showGrid !== 'undefined' && typeof studioGrid !== 'undefined') {
            studioGrid.visible = !!env.showGrid;
            const toggleGrid = document.getElementById('toggle-studio-grid');
            if (toggleGrid) toggleGrid.checked = !!env.showGrid;
        }

        // Sky Preset
        if (env.skyPreset && typeof applySkyPreset === 'function') {
            const selectSky = document.getElementById('select-sky-preset');
            if (selectSky) selectSky.value = env.skyPreset;
            applySkyPreset(env.skyPreset);
        }

        // Sun Azimuth & Elevation
        const sliderAzim = document.getElementById('slider-azimuth');
        const sliderElev = document.getElementById('slider-elevation');
        if (typeof env.sunAzimuth !== 'undefined' && sliderAzim) {
            sliderAzim.value = env.sunAzimuth;
        }
        if (typeof env.sunElevation !== 'undefined' && sliderElev) {
            sliderElev.value = env.sunElevation;
        }
        if (typeof updateSunPosition === 'function') {
            updateSunPosition();
        }

        // Wind Speed & Leaf Fall
        const sliderWind = document.getElementById('slider-wind-speed');
        const sliderLeaf = document.getElementById('slider-leaf-fall');
        if (typeof env.windSpeed !== 'undefined' && sliderWind) {
            sliderWind.value = env.windSpeed;
            sliderWind.dispatchEvent(new Event('input'));
        }
        if (typeof env.leafFall !== 'undefined' && sliderLeaf) {
            sliderLeaf.value = env.leafFall;
            sliderLeaf.dispatchEvent(new Event('input'));
        }
    }

    // 2. Terapkan Terrain Heights & Colors
    if (mapData.terrain) {
        const posAttr = groundGeo.attributes.position;
        if (mapData.terrain.heights && mapData.terrain.heights.length === posAttr.count) {
            for (let i = 0; i < posAttr.count; i++) {
                posAttr.setY(i, mapData.terrain.heights[i]);
            }
            posAttr.needsUpdate = true;
            groundGeo.computeVertexNormals();
        } else {
            // Reset ke flat jika map tidak memiliki sculpt heights
            for (let i = 0; i < posAttr.count; i++) {
                posAttr.setY(i, 0);
            }
            posAttr.needsUpdate = true;
            groundGeo.computeVertexNormals();
        }
        if (typeof syncWaterGeometryWithTerrain === 'function') syncWaterGeometryWithTerrain();

        // Terrain Vertex Colors (Jalan & Paint)
        const colAttr = groundGeo.attributes.color;
        if (mapData.terrain.colors && mapData.terrain.colors.length === colAttr.count * 3) {
            colAttr.array.set(mapData.terrain.colors);
            colAttr.needsUpdate = true;
        }
    }

    // 3. Terapkan Active Grass
    if (typeof maxGrassCapacity !== 'undefined' && typeof grassActiveStates !== 'undefined') {
        grassActiveStates.fill(0);
        const colorAttr = instancedGrassMesh ? instancedGrassMesh.geometry.attributes.instanceColor : null;

        if (Array.isArray(mapData.activeGrass)) {
            mapData.activeGrass.forEach((g, idx) => {
                const i = idx;
                if (i >= 0 && i < maxGrassCapacity) {
                    grassActiveStates[i] = 1;
                    grassCoordsX[i] = g.x;
                    grassCoordsZ[i] = g.z;
                    grassScalesArray[i] = g.s || 1.0;
                    grassRotYArray[i] = g.r || 0;
                    if (g.c && colorAttr) {
                        colorAttr.array[i * 3] = g.c[0];
                        colorAttr.array[i * 3 + 1] = g.c[1];
                        colorAttr.array[i * 3 + 2] = g.c[2];
                    }
                }
            });
            if (colorAttr) colorAttr.needsUpdate = true;
        }
        if (typeof rebuildGrassTransforms === 'function') {
            rebuildGrassTransforms();
        }
        if (window.PANDORA_RUNTIME) tintGroundUnderGrass();
    }

    // 4. Terapkan Trees
    // Bersihkan pohon yang ada di scene
    treesList.forEach(t => scene.remove(t));
    treesList.length = 0;

    if (Array.isArray(mapData.trees)) {
        mapData.trees.forEach(tData => {
            if (typeof setSeed === 'function') {
                setSeed(tData.seed);
            }

            let tree;
            const bCount = tData.branchCount || 3;
            const curv = tData.curvature !== undefined ? tData.curvature : 0.5;
            const lCount = tData.leafCount || 1200;

            if (tData.type === 'oak') tree = createGenshinOakTree(oakGreenMat, lCount, bCount, curv);
            else if (tData.type === 'birch_yellow') tree = createGenshinBirchTree(birchYellowMat, lCount, bCount, curv);
            else if (tData.type === 'birch_teal') tree = createGenshinBirchTree(birchTealMat, lCount, bCount, curv);
            else if (tData.type === 'birch_red') tree = createGenshinBirchTree(autumnRedMat, lCount, bCount, curv);
            else if (tData.type === 'pine') tree = createGenshinPineTree(pineEmeraldMat, lCount, curv);

            if (!tree) return;

            const yPos = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(tData.posX, tData.posZ) : 0;
            tree.position.set(tData.posX, yPos, tData.posZ);
            tree.rotation.y = tData.rotY || 0;
            tree.userData.seed = tData.seed;

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

            if (typeof resetSeed === 'function') {
                resetSeed();
            }

            scene.add(tree);
            treesList.push(tree);
        });
    }

    // 5. Terapkan Bebatuan (Rocks)
    if (typeof clearAllRocks === 'function') {
        clearAllRocks();
    }
    if (Array.isArray(mapData.rocks) && typeof recreateRock === 'function') {
        mapData.rocks.forEach(rData => recreateRock(rData));
    }

    // 6. Terapkan Bunga (Flowers)
    if (typeof clearAllFlowers === 'function') {
        clearAllFlowers();
    }
    if (Array.isArray(mapData.flowers) && typeof recreateFlower === 'function') {
        mapData.flowers.forEach(fData => recreateFlower(fData));
    }

    // 6b. Terapkan Pakis (Ferns)
    if (typeof clearAllFerns === 'function') {
        clearAllFerns();
    }
    if (Array.isArray(mapData.ferns) && typeof recreateFern === 'function') {
        mapData.ferns.forEach(fData => recreateFern(fData));
    }

    // 6c. Terapkan Semak Belukar (Bushes)
    if (typeof clearAllBushes === 'function') {
        clearAllBushes();
    }
    if (Array.isArray(mapData.bushes) && typeof recreateBush === 'function') {
        mapData.bushes.forEach(bData => recreateBush(bData));
    }

    // 7. Terapkan Kupu-kupu (Butterflies)
    if (typeof clearAllButterflies === 'function') {
        clearAllButterflies();
    }
    if (Array.isArray(mapData.butterflies) && typeof recreateButterfly === 'function') {
        mapData.butterflies.forEach(bData => recreateButterfly(bData));
    }

    // 7b. Terapkan Rubah Terspawn (Foxes)
    if (typeof spawnedFoxesList !== 'undefined') {
        while (spawnedFoxesList.length > 0) {
            deleteFoxByIndex(0);
        }
    }
    if (Array.isArray(mapData.foxes) && typeof spawnFoxAtLocation === 'function') {
        mapData.foxes.forEach(fData => {
            spawnFoxAtLocation(fData.species || 'foxtree', fData.pose || 'idle', fData.posX, fData.posZ, fData.rotY, fData.scale || 1.0);
            const fox = spawnedFoxesList[spawnedFoxesList.length - 1];
            if (fox && fData.maxHealth !== undefined) {
                Object.assign(fox, {
                    isBoss: !!fData.isBoss,
                    name: fData.name,
                    maxHealth: fData.maxHealth,
                    health: fData.maxHealth,
                    damagePerHit: fData.damagePerHit,
                    aiMode: fData.aiMode,
                    detectionRadius: fData.detectionRadius,
                    deathMode: fData.deathMode || 'fade',
                    deathLine: fData.deathLine || '',
                    deathFrom: fData.deathFrom || 0,
                    deathTo: fData.deathTo === undefined ? -1 : fData.deathTo
                });
                if (fox.model) fox.model.damagePerHit = fData.damagePerHit;
                if (fox.ai) {
                    Object.assign(fox.ai, {
                        isBoss: fox.isBoss,
                        maxHealth: fox.maxHealth,
                        health: fox.maxHealth,
                        aiMode: fox.aiMode,
                        detectionRadius: fox.detectionRadius
                    });
                }
            }
        });
    }

    // 7c. Terapkan Item Boxes
    if (typeof itemBoxManagerInstance !== 'undefined' && Array.isArray(mapData.itemBoxes)) {
        itemBoxManagerInstance.clearAll();
        itemBoxManagerInstance.stageKey = mapData.id || '';
        mapData.itemBoxes.forEach(b => {
            itemBoxManagerInstance.createItemBox(b.x, b.z, null, b.type || 'heal');
        });
        itemBoxManagerInstance.updateCountUI();
    }

    window.currentStageCinematic = mapData.cinematic || null;
    if (typeof TriggerManager !== 'undefined') {
        TriggerManager.deserialize(mapData.triggers);
        if (window.TriggerPanel) TriggerPanel.render();
    }
    if (typeof PortalManager !== 'undefined') {
        PortalManager.deserialize(mapData.portals);
        if (window.PortalPanel) PortalPanel.render();
    }

    // Karakter yang ditetapkan untuk stage ini
    if (mapData.character) {
        const selHero = document.getElementById('select-player-hero-folder');
        if (selHero && selHero.value !== mapData.character && [...selHero.options].some(o => o.value === mapData.character)) {
            selHero.value = mapData.character;
            if (!window.PandoraStageFlow || !PandoraStageFlow.isTransitioning) {
                selHero.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    // 7d. Terapkan Titik Awal Spawn Player
    if (mapData.playerSpawn && typeof PlayerSpawnManager !== 'undefined') {
        PlayerSpawnManager.deserialize(mapData.playerSpawn);
    }

    // 7d. Objek 3D impor: file modelnya dimuat di latar, prepareStage menunggu sampai selesai
    if (window.PandoraImportedObjects) {
        PandoraImportedObjects.apply(mapData.importedObjects);
    }

    // 8. Terapkan Air (Water Mask & Level)
    if (mapData.water) {
        if (typeof setWaterLevel === 'function' && typeof mapData.water.level === 'number') {
            setWaterLevel(mapData.water.level);
            const sliderWaterLevel = document.getElementById('slider-water-level');
            const valWaterLevel = document.getElementById('val-water-level');
            if (sliderWaterLevel) sliderWaterLevel.value = mapData.water.level;
            if (valWaterLevel) valWaterLevel.innerText = mapData.water.level.toFixed(2);
        }
        if (typeof setWaterParam === 'function') {
            if (typeof mapData.water.waveAmp === 'number') {
                setWaterParam('uAmp', mapData.water.waveAmp);
                const s = document.getElementById('slider-wave-amp');
                const v = document.getElementById('val-wave-amp');
                if (s) s.value = mapData.water.waveAmp;
                if (v) v.innerText = mapData.water.waveAmp.toFixed(2);
            }
            if (typeof mapData.water.waveSpeed === 'number') {
                setWaterParam('uSpeed', mapData.water.waveSpeed);
                const s = document.getElementById('slider-wave-speed');
                const v = document.getElementById('val-wave-speed');
                if (s) s.value = mapData.water.waveSpeed;
                if (v) v.innerText = mapData.water.waveSpeed.toFixed(2);
            }
            if (typeof mapData.water.waveChop === 'number') {
                setWaterParam('uChop', mapData.water.waveChop);
                const s = document.getElementById('slider-wave-chop');
                const v = document.getElementById('val-wave-chop');
                if (s) s.value = mapData.water.waveChop;
                if (v) v.innerText = mapData.water.waveChop.toFixed(2);
            }
        }
        if (typeof mapData.water.outerOcean === 'boolean' && typeof setOuterOceanEnabled === 'function') {
            setOuterOceanEnabled(mapData.water.outerOcean);
            const c = document.getElementById('check-outer-ocean');
            if (c) c.checked = mapData.water.outerOcean;
        }
        if (mapData.water.mask && typeof waterCanvas !== 'undefined' && typeof waterCtx !== 'undefined') {
            const img = new Image();
            img.onload = () => {
                waterCtx.globalCompositeOperation = 'source-over';
                waterCtx.clearRect(0, 0, waterCanvas.width, waterCanvas.height);
                waterCtx.drawImage(img, 0, 0);
                if (typeof waterMaskTexture !== 'undefined') waterMaskTexture.needsUpdate = true;
                if (typeof setHasWaterDrawn === 'function') setHasWaterDrawn(true);
            };
            img.src = mapData.water.mask;
        } else if (typeof clearAllWater === 'function') {
            clearAllWater();
        }
    } else if (typeof clearAllWater === 'function') {
        clearAllWater();
    }

    // 9. Terapkan Kabut (Fog Mask & Parameters)
    if (mapData.fog && typeof importFogData === 'function') {
        importFogData(mapData.fog);
    } else if (typeof clearAllFog === 'function') {
        clearAllFog();
    }

    // 10. Terapkan Cinematic Sequences & Subtitles
    if (mapData.cinematic && typeof CinematicManager !== 'undefined' && Array.isArray(mapData.cinematic.scenes)) {
        CinematicManager.scenes = JSON.parse(JSON.stringify(mapData.cinematic.scenes));
        const sIdx = (mapData.cinematic.activeSceneIndex !== undefined && mapData.cinematic.activeSceneIndex >= 0 && mapData.cinematic.activeSceneIndex < CinematicManager.scenes.length)
            ? mapData.cinematic.activeSceneIndex
            : 0;
        CinematicManager.loadScene(sIdx);
    }

    selectedTreeIndex = treesList.length > 0 ? treesList.length - 1 : -1;
    if (typeof refreshLayerUI === 'function') refreshLayerUI();
    if (typeof updateEditorUI === 'function') updateEditorUI();
}
