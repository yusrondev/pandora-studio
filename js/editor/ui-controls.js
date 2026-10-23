/* Sidebar UI bindings & editor UI state */
// ==========================================
// 9. UI BINDING CONTROLS
// ==========================================
const sliderSculptRadius = document.getElementById('slider-sculpt-radius');
const sliderRoadRadius = document.getElementById('slider-road-radius');
const sliderGrassRadius = document.getElementById('slider-grass-radius');
const sliderGrassDensity = document.getElementById('slider-grass-density');
const sliderGrassHeight = document.getElementById('slider-grass-height');

const sliderWindSpeed = document.getElementById('slider-wind-speed');
const sliderLeafFall = document.getElementById('slider-leaf-fall');

const sliderTreeHeight = document.getElementById('slider-tree-height');
const sliderTreeThickness = document.getElementById('slider-tree-thickness');
const sliderTreeCurvature = document.getElementById('slider-tree-curvature');
const sliderBranchCount = document.getElementById('slider-branch-count');
const sliderLeafCount = document.getElementById('slider-leaf-count');
const sliderPosX = document.getElementById('slider-pos-x');
const sliderPosZ = document.getElementById('slider-pos-z');

const valSculptRadius = document.getElementById('val-sculpt-radius');
const valRoadRadius = document.getElementById('val-road-radius');
const valGrassRadius = document.getElementById('val-grass-radius');
const valGrassDensity = document.getElementById('val-grass-density');
const valGrassHeight = document.getElementById('val-grass-height');

const valTreeHeight = document.getElementById('val-tree-height');
const valTreeThickness = document.getElementById('val-tree-thickness');
const valTreeCurvature = document.getElementById('val-tree-curvature');
const valBranchCount = document.getElementById('val-branch-count');
const valLeafCount = document.getElementById('val-leaf-count');
const valPosX = document.getElementById('val-pos-x');
const valPosZ = document.getElementById('val-pos-z');

const btnHandMode = document.getElementById('btn-hand-mode');
const selectTerrainMode = document.getElementById('select-terrain-mode');
const selectRoadBrush = document.getElementById('select-road-brush');
const selectGrassBrush = document.getElementById('select-grass-brush');
const selectRockBrush = document.getElementById('select-rock-brush');
const sliderRockRadius = document.getElementById('slider-rock-radius');
const sliderRockDensity = document.getElementById('slider-rock-density');
const sliderRockMinSize = document.getElementById('slider-rock-min-size');
const sliderRockMaxSize = document.getElementById('slider-rock-max-size');
const sliderRockHeightScale = document.getElementById('slider-rock-height-scale');
const selectRockTheme = document.getElementById('select-rock-theme');
const btnClearAllRocks = document.getElementById('btn-clear-all-rocks');

const valRockRadius = document.getElementById('val-rock-radius');
const valRockDensity = document.getElementById('val-rock-density');
const valRockMinSize = document.getElementById('val-rock-min-size');
const valRockMaxSize = document.getElementById('val-rock-max-size');
const valRockHeightScale = document.getElementById('val-rock-height-scale');

// Flower Brush Controls
const selectFlowerBrush = document.getElementById('select-flower-brush');
const sliderFlowerRadius = document.getElementById('slider-flower-radius');
const sliderFlowerDensity = document.getElementById('slider-flower-density');
const valFlowerRadius = document.getElementById('val-flower-radius');
const valFlowerDensity = document.getElementById('val-flower-density');
const btnClearAllFlowers = document.getElementById('btn-clear-all-flowers');

// Fern (Pakis) Brush Controls
const selectFernBrush = document.getElementById('select-fern-brush');
const sliderFernRadius = document.getElementById('slider-fern-radius');
const sliderFernDensity = document.getElementById('slider-fern-density');
const sliderFernMinSize = document.getElementById('slider-fern-min-size');
const sliderFernMaxSize = document.getElementById('slider-fern-max-size');
const valFernRadius = document.getElementById('val-fern-radius');
const valFernDensity = document.getElementById('val-fern-density');
const valFernMinSize = document.getElementById('val-fern-min-size');
const valFernMaxSize = document.getElementById('val-fern-max-size');
const btnClearAllFerns = document.getElementById('btn-clear-all-ferns');

// Butterfly Brush Controls
const selectButterflyBrush = document.getElementById('select-butterfly-brush');
const sliderButterflyRadius = document.getElementById('slider-butterfly-radius');
const sliderButterflyDensity = document.getElementById('slider-butterfly-density');
const valButterflyRadius = document.getElementById('val-butterfly-radius');
const valButterflyDensity = document.getElementById('val-butterfly-density');
const btnClearAllButterflies = document.getElementById('btn-clear-all-butterflies');

// Water Brush Controls
const selectWaterBrush = document.getElementById('select-water-brush');
const sliderWaterRadius = document.getElementById('slider-water-radius');
const valWaterRadius = document.getElementById('val-water-radius');
const sliderWaterLevel = document.getElementById('slider-water-level');
const valWaterLevel = document.getElementById('val-water-level');
const btnClearAllWater = document.getElementById('btn-clear-all-water');

// Fog Brush Controls (100% dari kabut.html)
const selectFogBrush = document.getElementById('select-fog-brush');
const sliderFogRadius = document.getElementById('slider-fog-radius');
const valFogRadius = document.getElementById('val-fog-radius');
const sliderFogSize = document.getElementById('slider-fog-size');
const valFogSize = document.getElementById('val-fog-size');
const sliderFogOpacity = document.getElementById('slider-fog-opacity');
const valFogOpacity = document.getElementById('val-fog-opacity');
const sliderFogHeight = document.getElementById('slider-fog-height');
const valFogHeight = document.getElementById('val-fog-height');
const sliderFogSpeed = document.getElementById('slider-fog-speed');
const valFogSpeed = document.getElementById('val-fog-speed');
const sliderFogWind = document.getElementById('slider-fog-wind');
const valFogWind = document.getElementById('val-fog-wind');
const sliderFogTurb = document.getElementById('slider-fog-turb');
const valFogTurb = document.getElementById('val-fog-turb');
const sliderFogCount = document.getElementById('slider-fog-count');
const valFogCount = document.getElementById('val-fog-count');
const pickerFogColor = document.getElementById('picker-fog-color');
const pickerFogLightColor = document.getElementById('picker-fog-light-color');
const btnFogReseed = document.getElementById('btn-fog-reseed');
const btnClearAllFog = document.getElementById('btn-clear-all-fog');

if (sliderFogRadius && valFogRadius) {
    sliderFogRadius.addEventListener('input', () => {
        valFogRadius.innerText = parseFloat(sliderFogRadius.value).toFixed(1);
    });
}
if (sliderFogSize && valFogSize) {
    sliderFogSize.addEventListener('input', () => {
        const v = parseFloat(sliderFogSize.value);
        valFogSize.innerText = v.toFixed(1);
        if (typeof fogParams !== 'undefined') { fogParams.size = v; applyFogUniforms(); }
    });
}
if (sliderFogOpacity && valFogOpacity) {
    sliderFogOpacity.addEventListener('input', () => {
        const v = parseFloat(sliderFogOpacity.value);
        valFogOpacity.innerText = v.toFixed(3);
        if (typeof fogParams !== 'undefined') { fogParams.opacity = v; applyFogUniforms(); }
    });
}
if (sliderFogHeight && valFogHeight) {
    sliderFogHeight.addEventListener('input', () => {
        const v = parseFloat(sliderFogHeight.value);
        valFogHeight.innerText = v.toFixed(1);
        if (typeof fogParams !== 'undefined') { fogParams.height = v; applyFogUniforms(); }
    });
}
if (sliderFogSpeed && valFogSpeed) {
    sliderFogSpeed.addEventListener('input', () => {
        const v = parseFloat(sliderFogSpeed.value);
        valFogSpeed.innerText = v.toFixed(2);
        if (typeof fogParams !== 'undefined') { fogParams.speed = v; applyFogUniforms(); }
    });
}
if (sliderFogWind && valFogWind) {
    sliderFogWind.addEventListener('input', () => {
        const v = parseInt(sliderFogWind.value);
        valFogWind.innerText = v + '°';
        if (typeof fogParams !== 'undefined') { fogParams.wind = v; applyFogUniforms(); }
    });
}
if (sliderFogTurb && valFogTurb) {
    sliderFogTurb.addEventListener('input', () => {
        const v = parseFloat(sliderFogTurb.value);
        valFogTurb.innerText = v.toFixed(1);
        if (typeof fogParams !== 'undefined') { fogParams.turb = v; applyFogUniforms(); }
    });
}
if (sliderFogCount && valFogCount) {
    sliderFogCount.addEventListener('input', () => {
        const v = parseInt(sliderFogCount.value);
        valFogCount.innerText = v;
        if (typeof fogParams !== 'undefined') { fogParams.count = v; applyFogUniforms(); }
    });
}
if (pickerFogColor) {
    pickerFogColor.addEventListener('input', (e) => {
        if (typeof setFogHex === 'function') setFogHex(e.target.value);
    });
}
if (pickerFogLightColor) {
    pickerFogLightColor.addEventListener('input', (e) => {
        if (typeof setFogLightHex === 'function') setFogLightHex(e.target.value);
    });
}
if (btnFogReseed) {
    btnFogReseed.addEventListener('click', () => {
        if (typeof reseedFog === 'function') reseedFog();
    });
}
if (btnClearAllFog) {
    btnClearAllFog.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllFog === 'function') clearAllFog();
    });
}

document.querySelectorAll('.btn-fog-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        const presetName = btn.getAttribute('data-preset');
        if (typeof applyFogPreset === 'function') {
            applyFogPreset(presetName);
        }
    });
});

let isPanMode = false;

btnHandMode.addEventListener('click', () => {
    isPanMode = !isPanMode;
    if (isPanMode) {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        btnHandMode.classList.add('active');
    } else {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        btnHandMode.classList.remove('active');
    }
    if (typeof updateActiveModeHUD === 'function') {
        updateActiveModeHUD();
    }
});

sliderSculptRadius.addEventListener('input', () => valSculptRadius.innerText = parseFloat(sliderSculptRadius.value).toFixed(1));
sliderRoadRadius.addEventListener('input', () => valRoadRadius.innerText = parseFloat(sliderRoadRadius.value).toFixed(1));
sliderGrassRadius.addEventListener('input', () => valGrassRadius.innerText = parseFloat(sliderGrassRadius.value).toFixed(1));
sliderGrassDensity.addEventListener('input', () => valGrassDensity.innerText = sliderGrassDensity.value);

sliderGrassHeight.addEventListener('input', () => {
    userGrassHeightSetting = parseFloat(sliderGrassHeight.value);
    valGrassHeight.innerText = userGrassHeightSetting.toFixed(1);
});

// Rock brush slider listeners
if (sliderRockRadius && valRockRadius) {
    sliderRockRadius.addEventListener('input', () => {
        valRockRadius.innerText = parseFloat(sliderRockRadius.value).toFixed(1);
        if (typeof rockParams !== 'undefined') rockParams.brushRadius = parseFloat(sliderRockRadius.value);
    });
}
if (sliderRockDensity && valRockDensity) {
    sliderRockDensity.addEventListener('input', () => {
        valRockDensity.innerText = sliderRockDensity.value;
        if (typeof rockParams !== 'undefined') rockParams.rockDensity = parseInt(sliderRockDensity.value);
    });
}
if (sliderRockMinSize && valRockMinSize) {
    sliderRockMinSize.addEventListener('input', () => {
        valRockMinSize.innerText = parseFloat(sliderRockMinSize.value).toFixed(1);
        if (typeof rockParams !== 'undefined') rockParams.minSize = parseFloat(sliderRockMinSize.value);
    });
}
if (sliderRockMaxSize && valRockMaxSize) {
    sliderRockMaxSize.addEventListener('input', () => {
        valRockMaxSize.innerText = parseFloat(sliderRockMaxSize.value).toFixed(1);
        if (typeof rockParams !== 'undefined') rockParams.maxSize = parseFloat(sliderRockMaxSize.value);
    });
}
if (sliderRockHeightScale && valRockHeightScale) {
    sliderRockHeightScale.addEventListener('input', () => {
        valRockHeightScale.innerText = parseFloat(sliderRockHeightScale.value).toFixed(1);
        if (typeof rockParams !== 'undefined') rockParams.heightScale = parseFloat(sliderRockHeightScale.value);
    });
}
if (selectRockTheme) {
    selectRockTheme.addEventListener('change', () => {
        if (typeof setRockTheme === 'function') {
            setRockTheme(selectRockTheme.value);
        }
    });
}
if (btnClearAllRocks) {
    btnClearAllRocks.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllRocks === 'function') {
            clearAllRocks();
        }
    });
}

// Flower brush slider listeners
if (sliderFlowerRadius && valFlowerRadius) {
    sliderFlowerRadius.addEventListener('input', () => {
        valFlowerRadius.innerText = parseFloat(sliderFlowerRadius.value).toFixed(1);
        if (typeof flowerParams !== 'undefined') flowerParams.brushRadius = parseFloat(sliderFlowerRadius.value);
    });
}
if (sliderFlowerDensity && valFlowerDensity) {
    sliderFlowerDensity.addEventListener('input', () => {
        valFlowerDensity.innerText = sliderFlowerDensity.value;
        if (typeof flowerParams !== 'undefined') flowerParams.flowerDensity = parseInt(sliderFlowerDensity.value);
    });
}
if (btnClearAllFlowers) {
    btnClearAllFlowers.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllFlowers === 'function') {
            clearAllFlowers();
        }
    });
}

// Fern brush slider listeners
if (sliderFernRadius && valFernRadius) {
    sliderFernRadius.addEventListener('input', () => {
        valFernRadius.innerText = parseFloat(sliderFernRadius.value).toFixed(1);
        if (typeof fernParams !== 'undefined') fernParams.brushRadius = parseFloat(sliderFernRadius.value);
    });
}
if (sliderFernDensity && valFernDensity) {
    sliderFernDensity.addEventListener('input', () => {
        valFernDensity.innerText = sliderFernDensity.value;
        if (typeof fernParams !== 'undefined') fernParams.fernDensity = parseInt(sliderFernDensity.value);
    });
}
if (sliderFernMinSize && valFernMinSize) {
    sliderFernMinSize.addEventListener('input', () => {
        valFernMinSize.innerText = parseFloat(sliderFernMinSize.value).toFixed(1);
        if (typeof fernParams !== 'undefined') fernParams.minSize = parseFloat(sliderFernMinSize.value);
    });
}
if (sliderFernMaxSize && valFernMaxSize) {
    sliderFernMaxSize.addEventListener('input', () => {
        valFernMaxSize.innerText = parseFloat(sliderFernMaxSize.value).toFixed(1);
        if (typeof fernParams !== 'undefined') fernParams.maxSize = parseFloat(sliderFernMaxSize.value);
    });
}
if (btnClearAllFerns) {
    btnClearAllFerns.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllFerns === 'function') {
            clearAllFerns();
        }
    });
}

// Butterfly brush slider listeners
if (sliderButterflyRadius && valButterflyRadius) {
    sliderButterflyRadius.addEventListener('input', () => {
        valButterflyRadius.innerText = parseFloat(sliderButterflyRadius.value).toFixed(1);
        if (typeof butterflyParams !== 'undefined') butterflyParams.brushRadius = parseFloat(sliderButterflyRadius.value);
    });
}
if (sliderButterflyDensity && valButterflyDensity) {
    sliderButterflyDensity.addEventListener('input', () => {
        valButterflyDensity.innerText = sliderButterflyDensity.value;
        if (typeof butterflyParams !== 'undefined') butterflyParams.butterflyDensity = parseInt(sliderButterflyDensity.value);
    });
}
if (btnClearAllButterflies) {
    btnClearAllButterflies.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllButterflies === 'function') {
            clearAllButterflies();
        }
    });
}

// Water Brush listeners
if (sliderWaterRadius && valWaterRadius) {
    sliderWaterRadius.addEventListener('input', () => {
        valWaterRadius.innerText = parseFloat(sliderWaterRadius.value).toFixed(1);
    });
}
if (sliderWaterLevel && valWaterLevel) {
    sliderWaterLevel.addEventListener('input', () => {
        const yVal = parseFloat(sliderWaterLevel.value);
        valWaterLevel.innerText = yVal.toFixed(2);
        if (typeof setWaterLevel === 'function') {
            setWaterLevel(yVal);
        }
    });
}
if (btnClearAllWater) {
    btnClearAllWater.addEventListener('click', () => {
        if (typeof saveState === 'function') saveState();
        if (typeof clearAllWater === 'function') {
            clearAllWater();
        }
    });
}

const checkOuterOcean = document.getElementById('check-outer-ocean');
if (checkOuterOcean) {
    checkOuterOcean.addEventListener('change', () => {
        if (typeof setOuterOceanEnabled === 'function') {
            setOuterOceanEnabled(checkOuterOcean.checked);
        }
    });
}

// ── OCEAN WAVE PARAMETER SLIDERS (identik ocean.html: Amp, Speed, Chop, Sun) ──────
const sliderWaveAmp   = document.getElementById('slider-wave-amp');
const valWaveAmp      = document.getElementById('val-wave-amp');
const sliderWaveSpeed = document.getElementById('slider-wave-speed');
const valWaveSpeed    = document.getElementById('val-wave-speed');
const sliderWaveChop  = document.getElementById('slider-wave-chop');
const valWaveChop     = document.getElementById('val-wave-chop');
const sliderWaveSun   = document.getElementById('slider-wave-sun');
const valWaveSun      = document.getElementById('val-wave-sun');

if (sliderWaveAmp && valWaveAmp) {
    sliderWaveAmp.addEventListener('input', () => {
        const v = parseFloat(sliderWaveAmp.value);
        valWaveAmp.innerText = v.toFixed(2);
        if (typeof setWaterParam === 'function') setWaterParam('uAmp', v);
    });
}
if (sliderWaveSpeed && valWaveSpeed) {
    sliderWaveSpeed.addEventListener('input', () => {
        const v = parseFloat(sliderWaveSpeed.value);
        valWaveSpeed.innerText = v.toFixed(2);
        if (typeof setWaterParam === 'function') setWaterParam('uSpeed', v);
    });
}
if (sliderWaveChop && valWaveChop) {
    sliderWaveChop.addEventListener('input', () => {
        const v = parseFloat(sliderWaveChop.value);
        valWaveChop.innerText = v.toFixed(2);
        if (typeof setWaterParam === 'function') setWaterParam('uChop', v);
    });
}
if (sliderWaveSun && valWaveSun) {
    sliderWaveSun.addEventListener('input', () => {
        const v = parseFloat(sliderWaveSun.value);
        valWaveSun.innerText = v + '°';
        if (typeof setWaterParam === 'function') setWaterParam('sun', v);
    });
}

sliderWindSpeed.addEventListener('input', () => {
    windSpeedRate = parseFloat(sliderWindSpeed.value);
    grassSystem.material.uniforms.uWindSpeed.value = windSpeedRate;
    foliageMaterialsList.forEach(mat => {
        mat.uniforms.uWindSpeed.value = windSpeedRate;
    });
    if (typeof flowerSystem !== 'undefined' && flowerSystem && flowerSystem.material && flowerSystem.material.uniforms && flowerSystem.material.uniforms.uWindSpeed) {
        flowerSystem.material.uniforms.uWindSpeed.value = windSpeedRate;
    }
});

sliderLeafFall.addEventListener('input', () => {
    leafFallRate = parseFloat(sliderLeafFall.value);
});

function updateEditorUI() {
    const selTreeIdx = (typeof window.selectedTreeIndex !== 'undefined') ? window.selectedTreeIndex : (typeof selectedTreeIndex !== 'undefined' ? selectedTreeIndex : -1);
    const selRockIdx = (typeof window.selectedRockIndex !== 'undefined') ? window.selectedRockIndex : (typeof selectedRockIndex !== 'undefined' ? selectedRockIndex : -1);
    const targetTree = (typeof treesList !== 'undefined' && selTreeIdx >= 0) ? treesList[selTreeIdx] : null;
    const currentRocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList)) ? rocksList : [];
    const targetRock = (selRockIdx >= 0) ? currentRocks[selRockIdx] : null;

    if (!targetTree && !targetRock) {
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.clearSelection();
        }
        if (btnDeleteTree) {
            btnDeleteTree.style.opacity = '0.4';
            btnDeleteTree.style.pointerEvents = 'none';
            const labelSpan = btnDeleteTree.querySelector('span:last-child');
            if (labelSpan) labelSpan.textContent = 'Hapus Objek';
        }
        return;
    }

    if (targetRock && !targetTree) {
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.selectObject(targetRock, false);
        }
        if (btnDeleteTree) {
            btnDeleteTree.style.opacity = '1';
            btnDeleteTree.style.pointerEvents = 'auto';
            const labelSpan = btnDeleteTree.querySelector('span:last-child');
            if (labelSpan) labelSpan.textContent = `Hapus Batu #${selRockIdx + 1}`;
        }
        return;
    }

    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.selectObject(targetTree, false);
    }

    if (btnDeleteTree) {
        btnDeleteTree.style.opacity = '1';
        btnDeleteTree.style.pointerEvents = 'auto';
        const labelSpan = btnDeleteTree.querySelector('span:last-child');
        if (labelSpan) labelSpan.textContent = `Hapus Pohon #${selTreeIdx + 1}`;
    }

    const trunkValY = targetTree.userData.trunkGroup ? targetTree.userData.trunkGroup.scale.y : 1.0;
    sliderTreeHeight.value = trunkValY;
    valTreeHeight.innerText = trunkValY.toFixed(2);

    const trunkValThickness = targetTree.userData.trunkGroup ? targetTree.userData.trunkGroup.scale.x : 1.0;
    sliderTreeThickness.value = trunkValThickness;
    valTreeThickness.innerText = trunkValThickness.toFixed(2);

    const curvVal = targetTree.userData.curvature !== undefined ? targetTree.userData.curvature : 0.5;
    sliderTreeCurvature.value = curvVal;
    valTreeCurvature.innerText = curvVal.toFixed(2);

    const bCount = targetTree.userData.branchCount || 3;
    sliderBranchCount.value = bCount;
    valBranchCount.innerText = bCount;

    const leafMesh = targetTree.userData.leafMesh;
    sliderLeafCount.value = leafMesh.count;
    valLeafCount.innerText = leafMesh.count;

    sliderPosX.value = targetTree.position.x;
    valPosX.innerText = targetTree.position.x.toFixed(1);

    sliderPosZ.value = targetTree.position.z;
    valPosZ.innerText = targetTree.position.z.toFixed(1);
}

sliderTreeHeight.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const val = parseFloat(sliderTreeHeight.value);

    valTreeHeight.innerText = val.toFixed(2);
    if (targetTree && targetTree.userData.trunkGroup) {
        targetTree.userData.trunkGroup.scale.y = val;

        if (targetTree.userData.leafMesh && targetTree.userData.baseTrunkHeight) {
            const baseOffset = targetTree.userData.leafMesh.userData.baseYOffset || 0;
            targetTree.userData.leafMesh.position.y = baseOffset + targetTree.userData.baseTrunkHeight * (val - 1.0);
        }
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.updateBounds();
        }
    }
});

sliderTreeThickness.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const val = parseFloat(sliderTreeThickness.value);

    valTreeThickness.innerText = val.toFixed(2);
    if (targetTree && targetTree.userData.trunkGroup) {
        targetTree.userData.trunkGroup.scale.x = val;
        targetTree.userData.trunkGroup.scale.z = val;
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.updateBounds();
        }
    }
});

sliderTreeCurvature.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const newCurvature = parseFloat(sliderTreeCurvature.value);

    valTreeCurvature.innerText = newCurvature.toFixed(2);

    if (targetTree) {
        const posX = targetTree.position.x;
        const posZ = targetTree.position.z;
        const rotY = targetTree.rotation.y;
        const leafCount = targetTree.userData.leafMesh.count;
        const branchCount = targetTree.userData.branchCount || 3;
        let typeCode = targetTree.userData.typeCode;
        if (!typeCode) {
            if (targetTree.userData.isPine) typeCode = 'pine';
            else if (targetTree.userData.foliageMat === birchTealMat) typeCode = 'birch_teal';
            else if (targetTree.userData.foliageMat === autumnRedMat) typeCode = 'birch_red';
            else if (targetTree.userData.foliageMat === birchYellowMat) typeCode = 'birch_yellow';
            else typeCode = 'oak';
        }
        const foliageMat = targetTree.userData.foliageMat || (
            typeCode === 'birch_teal' ? birchTealMat :
            typeCode === 'birch_red' ? autumnRedMat :
            typeCode === 'birch_yellow' ? birchYellowMat :
            typeCode === 'pine' ? pineEmeraldMat : oakGreenMat
        );
        const trunkScaleY = targetTree.userData.trunkGroup.scale.y;
        const trunkThickness = targetTree.userData.trunkGroup.scale.x;
        const seed = targetTree.userData.seed;

        scene.remove(targetTree);

        setSeed(seed); // Gunakan seed untuk membangun dengan orientasi yang sama

        let updatedTree;
        if (typeCode === 'oak') updatedTree = createGenshinOakTree(foliageMat, leafCount, branchCount, newCurvature);
        else if (typeCode.startsWith('birch')) updatedTree = createGenshinBirchTree(foliageMat, leafCount, branchCount, newCurvature, typeCode);
        else if (typeCode === 'pine') updatedTree = createGenshinPineTree(foliageMat, leafCount, newCurvature);

        updatedTree.position.set(posX, getTerrainHeightFast(posX, posZ), posZ);
        updatedTree.rotation.y = rotY;
        updatedTree.userData.seed = seed;
        updatedTree.userData.typeCode = typeCode;
        updatedTree.userData.foliageMat = foliageMat;

        resetSeed(); // Lepaskan seed setelah pembuatan selesai

        if (updatedTree.userData.trunkGroup) {
            updatedTree.userData.trunkGroup.scale.set(trunkThickness, trunkScaleY, trunkThickness);
            if (updatedTree.userData.leafMesh && updatedTree.userData.baseTrunkHeight) {
                const baseOffset = updatedTree.userData.leafMesh.userData.baseYOffset || 0;
                updatedTree.userData.leafMesh.position.y = baseOffset + updatedTree.userData.baseTrunkHeight * (trunkScaleY - 1.0);
            }
        }

        scene.add(updatedTree);
        treesList[selectedTreeIndex] = updatedTree;
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.selectObject(updatedTree, false);
        }
    }
});

sliderBranchCount.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const newBranchCount = parseInt(sliderBranchCount.value);

    valBranchCount.innerText = newBranchCount;

    if (targetTree && !targetTree.userData.isPine) {
        const posX = targetTree.position.x;
        const posZ = targetTree.position.z;
        const rotY = targetTree.rotation.y;
        const leafCount = targetTree.userData.leafMesh.count;
        const curvature = targetTree.userData.curvature || 0.5;
        let typeCode = targetTree.userData.typeCode;
        if (!typeCode) {
            if (targetTree.userData.foliageMat === birchTealMat) typeCode = 'birch_teal';
            else if (targetTree.userData.foliageMat === autumnRedMat) typeCode = 'birch_red';
            else if (targetTree.userData.foliageMat === birchYellowMat) typeCode = 'birch_yellow';
            else typeCode = 'oak';
        }
        const foliageMat = targetTree.userData.foliageMat || (
            typeCode === 'birch_teal' ? birchTealMat :
            typeCode === 'birch_red' ? autumnRedMat :
            typeCode === 'birch_yellow' ? birchYellowMat : oakGreenMat
        );
        const trunkScaleY = targetTree.userData.trunkGroup.scale.y;
        const trunkThickness = targetTree.userData.trunkGroup.scale.x;
        const seed = targetTree.userData.seed;

        scene.remove(targetTree);

        setSeed(seed); // Pakai seed

        let updatedTree;
        if (typeCode === 'oak') updatedTree = createGenshinOakTree(foliageMat, leafCount, newBranchCount, curvature);
        else if (typeCode.startsWith('birch')) updatedTree = createGenshinBirchTree(foliageMat, leafCount, newBranchCount, curvature, typeCode);

        updatedTree.position.set(posX, getTerrainHeightFast(posX, posZ), posZ);
        updatedTree.rotation.y = rotY;
        updatedTree.userData.seed = seed;
        updatedTree.userData.typeCode = typeCode;
        updatedTree.userData.foliageMat = foliageMat;

        resetSeed();

        if (updatedTree.userData.trunkGroup) {
            updatedTree.userData.trunkGroup.scale.set(trunkThickness, trunkScaleY, trunkThickness);
            if (updatedTree.userData.leafMesh && updatedTree.userData.baseTrunkHeight) {
                const baseOffset = updatedTree.userData.leafMesh.userData.baseYOffset || 0;
                updatedTree.userData.leafMesh.position.y = baseOffset + updatedTree.userData.baseTrunkHeight * (trunkScaleY - 1.0);
            }
        }

        scene.add(updatedTree);
        treesList[selectedTreeIndex] = updatedTree;
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.selectObject(updatedTree, false);
        }
    }
});

sliderLeafCount.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const newCount = parseInt(sliderLeafCount.value);

    valLeafCount.innerText = newCount;

    if (targetTree) {
        const leafMesh = targetTree.userData.leafMesh;

        setSeed(targetTree.userData.seed); // Sinkronisasi seed di dedaunan

        if (targetTree.userData.isPine) {
            targetTree.userData.populatePineLeaves(newCount);
        } else {
            populateLeavesInClustersDynamic(leafMesh, targetTree.userData.clusters, newCount);
        }
        leafMesh.count = newCount;

        resetSeed();
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.updateBounds();
        }
    }
});

sliderPosX.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const val = parseFloat(sliderPosX.value);

    valPosX.innerText = val.toFixed(1);
    if (targetTree) {
        targetTree.position.x = val;
        targetTree.position.y = getTerrainHeightFast(val, targetTree.position.z);
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.updateBounds();
        }
    }
});

sliderPosZ.addEventListener('input', () => {
    const targetTree = treesList[selectedTreeIndex];
    const val = parseFloat(sliderPosZ.value);

    valPosZ.innerText = val.toFixed(1);
    if (targetTree) {
        targetTree.position.z = val;
        targetTree.position.y = getTerrainHeightFast(targetTree.position.x, val);
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.updateBounds();
        }
    }
});

[sliderTreeHeight, sliderTreeThickness, sliderTreeCurvature, sliderBranchCount, sliderLeafCount, sliderPosX, sliderPosZ].forEach(el => {
    el.addEventListener('change', () => saveState());
});

// Canvas / Plain Surface Controls
const pickerPlaneColor = document.getElementById('picker-plane-color');
const valPlaneColor = document.getElementById('label-plane-color');
const toggleStudioGrid = document.getElementById('toggle-studio-grid');

if (pickerPlaneColor) {
    pickerPlaneColor.addEventListener('input', (e) => {
        const hex = e.target.value;
        if (valPlaneColor) valPlaneColor.innerText = hex;
        if (typeof setTerrainPlaneColor === 'function') setTerrainPlaneColor(hex);
    });
}

document.querySelectorAll('.btn-color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        const hex = btn.getAttribute('data-color');
        if (pickerPlaneColor) pickerPlaneColor.value = hex;
        if (valPlaneColor) valPlaneColor.innerText = hex;
        if (typeof setTerrainPlaneColor === 'function') setTerrainPlaneColor(hex);
    });
});

if (toggleStudioGrid) {
    toggleStudioGrid.addEventListener('change', (e) => {
        if (typeof studioGrid !== 'undefined') {
            studioGrid.visible = e.target.checked;
        }
    });
}
