/* Tree spawner & layer list */
// ==========================================
// 8. TREE SPAWNER & LAYER SYSTEM
// ==========================================
const treesList = [];
window.treesList = treesList;
let selectedTreeIndex = -1;
let selectedRockIndex = -1;
window.selectedTreeIndex = selectedTreeIndex;
window.selectedRockIndex = selectedRockIndex;

const layerGroupStates = {
    trees: true,
    rocks: true,
    grass: true
};

const treeLayerList = document.getElementById('tree-layer-list');
const layerCount = document.getElementById('layer-count');
const selectTreeMode = document.getElementById('select-tree-mode');
const btnDeleteTree = document.getElementById('btn-delete-tree');
const layerEmptyMsg = document.getElementById('layer-empty-msg');

function refreshLayerUI() {
    if (!treeLayerList) return;
    treeLayerList.innerHTML = '';

    const currentRocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList)) ? rocksList : [];
    const flowerCount = (typeof flowersList !== 'undefined' && Array.isArray(flowersList)) ? flowersList.length : 0;
    const butterflyCount = (typeof butterfliesList !== 'undefined' && Array.isArray(butterfliesList)) ? butterfliesList.length : 0;
    const totalCount = treesList.length + currentRocks.length + flowerCount + butterflyCount;
    if (layerCount) layerCount.innerText = totalCount;

    if (layerEmptyMsg) layerEmptyMsg.style.display = 'none';

    // Helper SVG Icons
    const chevronSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    const trashSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    // ==========================================
    // 1. GROUP POHON [POHON]
    // ==========================================
    const treeGroup = document.createElement('li');
    treeGroup.className = `layer-group ${layerGroupStates.trees ? '' : 'collapsed'}`;
    const allTreesVisible = treesList.length === 0 || treesList.some(t => t.visible);

    treeGroup.innerHTML = `
        <div class="layer-group-header" data-group="trees">
            <span class="layer-group-chevron">${chevronSvg}</span>
            <div class="layer-group-title">
                <span class="svg-icon" style="color:#50fa7b;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22v-7"></path><path d="M17 14c1.7 0 3-1.3 3-3a3 3 0 0 0-1.5-2.6A4 4 0 0 0 14 3.5a4 4 0 0 0-4 0 4 4 0 0 0-4.5 4.9A3 3 0 0 0 4 11c0 1.7 1.3 3 3 3h10z"></path></svg>
                </span>
                <span>Pohon</span>
                <span class="layer-group-badge">${treesList.length}</span>
            </div>
            <div class="layer-group-actions">
                <button type="button" class="btn-group-action ${allTreesVisible ? '' : 'muted'}" title="Toggle Visibilitas Semua Pohon" data-action="toggle-vis-trees">
                    ${allTreesVisible ? eyeSvg : eyeOffSvg}
                </button>
            </div>
        </div>
        <ul class="layer-group-children" id="group-children-trees"></ul>
    `;

    // Group toggle
    treeGroup.querySelector('.layer-group-header').addEventListener('click', (e) => {
        if (e.target.closest('.layer-group-actions')) return;
        layerGroupStates.trees = !layerGroupStates.trees;
        treeGroup.classList.toggle('collapsed', !layerGroupStates.trees);
    });

    // Visibility toggle
    const btnVisTrees = treeGroup.querySelector('[data-action="toggle-vis-trees"]');
    if (btnVisTrees) {
        btnVisTrees.addEventListener('click', (e) => {
            e.stopPropagation();
            const newVis = !allTreesVisible;
            treesList.forEach(t => t.visible = newVis);
            refreshLayerUI();
        });
    }

    // Populate tree items
    const treeChildrenUl = treeGroup.querySelector('#group-children-trees');
    if (treesList.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'padding:4px 8px; font-size:10px; color:var(--text-muted); font-style:italic;';
        emptyLi.innerText = '(Belum ada pohon ditanam)';
        treeChildrenUl.appendChild(emptyLi);
    } else {
        treesList.forEach((tree, idx) => {
            const li = document.createElement('li');
            const isTreeActive = idx === window.selectedTreeIndex && window.selectedRockIndex === -1;
            li.className = `layer-item ${isTreeActive ? 'active' : ''}`;
            const tPos = tree.position;
            li.innerHTML = `
                <span class="svg-icon layer-icon" style="color:${tree.visible ? 'inherit' : '#ef4444'};">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22v-7"></path><path d="M17 14c1.7 0 3-1.3 3-3a3 3 0 0 0-1.5-2.6A4 4 0 0 0 14 3.5a4 4 0 0 0-4 0 4 4 0 0 0-4.5 4.9A3 3 0 0 0 4 11c0 1.7 1.3 3 3 3h10z"></path></svg>
                </span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${idx + 1}. ${tree.userData.type || 'Pohon'}
                </span>
                <span style="font-size:9px; opacity:0.6; font-family:'JetBrains Mono',monospace;">
                    [${tPos.x.toFixed(0)},${tPos.z.toFixed(0)}]
                </span>
                <button type="button" class="btn-layer-delete" title="Hapus Pohon #${idx + 1}">
                    ${trashSvg}
                </button>
            `;

            li.addEventListener('click', (e) => {
                if (e.target && e.target.closest && e.target.closest('.btn-layer-delete')) return;
                window.selectedTreeIndex = idx;
                window.selectedRockIndex = -1;
                selectedTreeIndex = idx;
                selectedRockIndex = -1;
                refreshLayerUI();
                if (typeof updateEditorUI === 'function') updateEditorUI();
                if (typeof SelectionOutlineManager !== 'undefined') {
                    SelectionOutlineManager.selectObject(treesList[idx], true);
                }
            });

            const delBtn = li.querySelector('.btn-layer-delete');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deleteTreeByIndex(idx);
                });
            }

            treeChildrenUl.appendChild(li);
        });
    }
    treeLayerList.appendChild(treeGroup);

    // ==========================================
    // 2. GROUP BEBATUAN [BEBATUAN]
    // ==========================================
    const rockGroup = document.createElement('li');
    rockGroup.className = `layer-group ${layerGroupStates.rocks ? '' : 'collapsed'}`;
    const allRocksVisible = typeof rocksGroup === 'undefined' || rocksGroup.visible !== false;

    rockGroup.innerHTML = `
        <div class="layer-group-header" data-group="rocks">
            <span class="layer-group-chevron">${chevronSvg}</span>
            <div class="layer-group-title">
                <span class="svg-icon" style="color:#8be9fd;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                </span>
                <span>Bebatuan</span>
                <span class="layer-group-badge">${currentRocks.length}</span>
            </div>
            <div class="layer-group-actions">
                <button type="button" class="btn-group-action ${allRocksVisible ? '' : 'muted'}" title="Toggle Visibilitas Semua Bebatuan" data-action="toggle-vis-rocks">
                    ${allRocksVisible ? eyeSvg : eyeOffSvg}
                </button>
            </div>
        </div>
        <ul class="layer-group-children" id="group-children-rocks"></ul>
    `;

    rockGroup.querySelector('.layer-group-header').addEventListener('click', (e) => {
        if (e.target.closest('.layer-group-actions')) return;
        layerGroupStates.rocks = !layerGroupStates.rocks;
        rockGroup.classList.toggle('collapsed', !layerGroupStates.rocks);
    });

    const btnVisRocks = rockGroup.querySelector('[data-action="toggle-vis-rocks"]');
    if (btnVisRocks) {
        btnVisRocks.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof rocksGroup !== 'undefined') {
                rocksGroup.visible = !rocksGroup.visible;
                refreshLayerUI();
            }
        });
    }

    const rockChildrenUl = rockGroup.querySelector('#group-children-rocks');
    if (currentRocks.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'padding:4px 8px; font-size:10px; color:var(--text-muted); font-style:italic;';
        emptyLi.innerText = '(Belum ada bebatuan di scene)';
        rockChildrenUl.appendChild(emptyLi);
    } else {
        currentRocks.forEach((rock, idx) => {
            const li = document.createElement('li');
            const isRockActive = idx === window.selectedRockIndex && window.selectedTreeIndex === -1;
            li.className = `layer-item ${isRockActive ? 'active' : ''}`;
            const rData = rock.userData || {};
            const rName = rData.rockType === 'spawn_boulder' ? 'Bongkahan Boulder' : 'Batu Slate';
            const rPos = rock.position;

            li.innerHTML = `
                <span class="svg-icon layer-icon" style="color:#a8b3cf;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="6 2 18 2 22 8 12 22 2 8 6 2"></polygon></svg>
                </span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${idx + 1}. ${rName}
                </span>
                <span style="font-size:9px; opacity:0.6; font-family:'JetBrains Mono',monospace;">
                    [${rPos.x.toFixed(0)},${rPos.z.toFixed(0)}]
                </span>
                <button type="button" class="btn-layer-delete" title="Hapus Batu #${idx + 1}">
                    ${trashSvg}
                </button>
            `;

            li.addEventListener('click', (e) => {
                if (e.target && e.target.closest && e.target.closest('.btn-layer-delete')) return;
                window.selectedRockIndex = idx;
                window.selectedTreeIndex = -1;
                selectedRockIndex = idx;
                selectedTreeIndex = -1;
                refreshLayerUI();
                if (typeof updateEditorUI === 'function') updateEditorUI();
                if (typeof SelectionOutlineManager !== 'undefined') {
                    SelectionOutlineManager.selectObject(currentRocks[idx], true);
                }
            });

            const delBtn = li.querySelector('.btn-layer-delete');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (typeof deleteRockByIndex === 'function') {
                        deleteRockByIndex(idx);
                    }
                });
            }

            rockChildrenUl.appendChild(li);
        });
    }
    treeLayerList.appendChild(rockGroup);

    // ==========================================
    // SELESAI POPULASI LAYER
    // ==========================================
    if (typeof updateActiveModeHUD === 'function') {
        updateActiveModeHUD();
    }
}

function deleteTreeByIndex(idx) {
    if (idx < 0 || idx >= treesList.length) return;
    if (typeof saveState === 'function') saveState();
    const treeToRemove = treesList[idx];
    if (typeof SelectionOutlineManager !== 'undefined') {
        if (typeof SelectionOutlineManager.clearSelection === 'function') {
            SelectionOutlineManager.clearSelection();
        } else if (typeof SelectionOutlineManager.clear === 'function') {
            SelectionOutlineManager.clear();
        }
    }
    if (treeToRemove && treeToRemove.parent) {
        treeToRemove.parent.remove(treeToRemove);
    } else if (treeToRemove && typeof scene !== 'undefined') {
        scene.remove(treeToRemove);
    }
    treesList.splice(idx, 1);

    if (window.selectedTreeIndex === idx) {
        window.selectedTreeIndex = -1;
    } else if (window.selectedTreeIndex > idx) {
        window.selectedTreeIndex--;
    }
    selectedTreeIndex = window.selectedTreeIndex;

    refreshLayerUI();
    if (typeof updateEditorUI === 'function') {
        updateEditorUI();
    }
    if (typeof PandoraToast !== 'undefined' && typeof PandoraToast.show === 'function') {
        PandoraToast.show(`🗑️ Pohon #${idx + 1} berhasil dihapus`, 'info');
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

if (btnDeleteTree) {
    btnDeleteTree.addEventListener('click', () => {
        if (window.selectedTreeIndex >= 0 && treesList[window.selectedTreeIndex]) {
            deleteTreeByIndex(window.selectedTreeIndex);
        } else if (window.selectedRockIndex >= 0 && typeof deleteRockByIndex === 'function') {
            deleteRockByIndex(window.selectedRockIndex);
        }
    });
}

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
        deleteTreeByIndex(closestIdx);
        return true;
    }

    return false;
}

// Global shortcut Delete / Backspace for selected scene object
window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.selectedTreeIndex >= 0 && window.selectedTreeIndex < treesList.length) {
            e.preventDefault();
            deleteTreeByIndex(window.selectedTreeIndex);
        } else if (window.selectedRockIndex >= 0 && typeof deleteRockByIndex === 'function' && typeof rocksList !== 'undefined' && window.selectedRockIndex < rocksList.length) {
            e.preventDefault();
            deleteRockByIndex(window.selectedRockIndex);
        }
    }
});

// Auto-populate layer groups on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(refreshLayerUI, 150);
    });
} else {
    setTimeout(refreshLayerUI, 150);
}
