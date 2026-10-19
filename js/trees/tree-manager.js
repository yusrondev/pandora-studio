/* Tree spawner & layer list */
// ==========================================
// 8. TREE SPAWNER & LAYER SYSTEM
// ==========================================
const treesList = [];
let selectedTreeIndex = -1;

const treeLayerList = document.getElementById('tree-layer-list');
const layerCount = document.getElementById('layer-count');
const selectTreeMode = document.getElementById('select-tree-mode');
const btnDeleteTree = document.getElementById('btn-delete-tree');
const layerEmptyMsg = document.getElementById('layer-empty-msg');

function refreshLayerUI() {
    treeLayerList.innerHTML = '';
    layerCount.innerText = treesList.length;

    if (treesList.length === 0) {
        if (layerEmptyMsg) layerEmptyMsg.style.display = 'block';
    } else {
        if (layerEmptyMsg) layerEmptyMsg.style.display = 'none';
    }

    treesList.forEach((tree, idx) => {
        const li = document.createElement('li');
        li.className = `layer-item ${idx === selectedTreeIndex ? 'active' : ''}`;
        li.innerHTML = `
            <span class="svg-icon layer-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22v-7"></path><path d="M17 14c1.7 0 3-1.3 3-3a3 3 0 0 0-1.5-2.6A4 4 0 0 0 14 3.5a4 4 0 0 0-4 0 4 4 0 0 0-4.5 4.9A3 3 0 0 0 4 11c0 1.7 1.3 3 3 3h10z"></path></svg>
            </span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${idx + 1}. ${tree.userData.type}</span>
            <span style="font-size:9px; opacity:0.6; font-family:'JetBrains Mono',monospace;">#${idx + 1}</span>
            <button type="button" class="btn-layer-delete" title="Hapus Pohon #${idx + 1}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;

        li.addEventListener('click', () => {
            selectedTreeIndex = idx;
            refreshLayerUI();
            updateEditorUI();
            if (typeof SelectionOutlineManager !== 'undefined') {
                SelectionOutlineManager.selectObject(treesList[idx], true);
            }
        });

        const delBtn = li.querySelector('.btn-layer-delete');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTreeByIndex(idx);
            });
        }

        treeLayerList.appendChild(li);
    });

    if (typeof updateActiveModeHUD === 'function') {
        updateActiveModeHUD();
    }
}

function deleteTreeByIndex(idx) {
    if (idx < 0 || idx >= treesList.length) return;
    saveState();
    const treeToRemove = treesList[idx];
    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.clear();
    }
    scene.remove(treeToRemove);
    treesList.splice(idx, 1);
    if (selectedTreeIndex === idx) {
        selectedTreeIndex = treesList.length - 1;
    } else if (selectedTreeIndex > idx) {
        selectedTreeIndex--;
    }
    refreshLayerUI();
    updateEditorUI();
    if (typeof PandoraToast !== 'undefined') {
        PandoraToast.show('Pohon berhasil dihapus!', 'info');
    }
}
window.deleteTreeByIndex = deleteTreeByIndex;

function spawnTreeAtLocation(typeCode, posX, posZ) {
    saveState();

    // Setup seed baru untuk pohon
    const seed = Math.floor(originalRandom() * 1000000);
    setSeed(seed);

    let tree;
    const branchCountEl = document.getElementById('slider-branch-count');
    const curvatureEl = document.getElementById('slider-tree-curvature');
    const initialBranchCount = branchCountEl ? parseInt(branchCountEl.value) || 3 : 3;
    const initialCurvature = curvatureEl ? parseFloat(curvatureEl.value) || 0.5 : 0.5;

    if (typeCode === 'oak') tree = createGenshinOakTree(oakGreenMat, 1200, initialBranchCount, initialCurvature);
    else if (typeCode === 'birch_yellow') tree = createGenshinBirchTree(birchYellowMat, 1000, initialBranchCount, initialCurvature);
    else if (typeCode === 'birch_teal') tree = createGenshinBirchTree(birchTealMat, 1000, initialBranchCount, initialCurvature);
    else if (typeCode === 'birch_red') tree = createGenshinBirchTree(autumnRedMat, 900, initialBranchCount, initialCurvature);
    else if (typeCode === 'pine') tree = createGenshinPineTree(pineEmeraldMat, 2200, initialCurvature);

    if (!tree) {
        resetSeed();
        return;
    }

    const y = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(posX, posZ) : 0;
    tree.position.set(posX, y, posZ);
    tree.rotation.y = Math.random() * Math.PI * 2;
    tree.userData.seed = seed; // Simpan seed ke userData
    tree.userData.typeCode = typeCode;

    resetSeed();

    const heightEl = document.getElementById('slider-tree-height');
    const thicknessEl = document.getElementById('slider-tree-thickness');
    const initialTrunkHeight = heightEl ? parseFloat(heightEl.value) || 1.0 : 1.0;
    const initialThickness = thicknessEl ? parseFloat(thicknessEl.value) || 1.0 : 1.0;

    if (tree.userData.trunkGroup) {
        tree.userData.trunkGroup.scale.set(initialThickness, initialTrunkHeight, initialThickness);
        if (tree.userData.leafMesh && tree.userData.baseTrunkHeight) {
            const baseOffset = tree.userData.leafMesh.userData.baseYOffset || 0;
            tree.userData.leafMesh.position.y = baseOffset + tree.userData.baseTrunkHeight * (initialTrunkHeight - 1.0);
        }
    }

    scene.add(tree);
    treesList.push(tree);

    selectedTreeIndex = treesList.length - 1;
    refreshLayerUI();
    updateEditorUI();
}

btnDeleteTree.addEventListener('click', () => {
    if (selectedTreeIndex >= 0 && treesList[selectedTreeIndex]) {
        saveState();
        scene.remove(treesList[selectedTreeIndex]);
        treesList.splice(selectedTreeIndex, 1);
        selectedTreeIndex = treesList.length - 1;

        refreshLayerUI();
        updateEditorUI();
    }
});

// Menghapus pohon di koordinat pointer mouse (untuk klik kanan)
function deleteTreeAtLocation(posX, posZ, maxRadius = 3.5) {
    if (!treesList || treesList.length === 0) return false;

    let closestIdx = -1;
    let closestDistSq = maxRadius * maxRadius;

    for (let i = 0; i < treesList.length; i++) {
        const tree = treesList[i];
        if (!tree) continue;
        const dx = tree.position.x - posX;
        const dz = tree.position.z - posZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestIdx = i;
        }
    }

    if (closestIdx >= 0) {
        saveState();
        const treeToRemove = treesList[closestIdx];
        scene.remove(treeToRemove);
        treesList.splice(closestIdx, 1);
        if (selectedTreeIndex === closestIdx) {
            selectedTreeIndex = treesList.length - 1;
        } else if (selectedTreeIndex > closestIdx) {
            selectedTreeIndex--;
        }

        refreshLayerUI();
        updateEditorUI();
        return true;
    }

    return false;
}
