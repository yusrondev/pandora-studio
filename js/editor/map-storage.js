/* =========================================================
   PANDORA EDITOR - MAP STORAGE & CUSTOM MODAL SYSTEM
   Menyimpan, memuat, menamai, dan mengedit map ke folder maps/
   ========================================================= */

// Current loaded map tracking
let currentActiveMapId = null;
let currentActiveMapName = null;
let cachedMapsList = [];

// --- 1. CUSTOM PANDORA MODAL & ALERT SYSTEM ---
const PandoraModal = {
    overlay: null,

    init() {
        if (this.overlay) return;

        // Container modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'pandora-modal-overlay';
        overlay.className = 'pandora-modal-overlay';
        overlay.innerHTML = `
            <div class="pandora-modal-card" id="pandora-modal-card">
                <div class="pandora-modal-header">
                    <div class="pandora-modal-title" id="pandora-modal-title">
                        <svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                        <span id="pandora-modal-title-text">Pandora Editor</span>
                    </div>
                    <button class="pandora-modal-close" id="pandora-modal-btn-close" title="Tutup (Esc)">✕</button>
                </div>
                <div class="pandora-modal-body" id="pandora-modal-body"></div>
                <div class="pandora-modal-actions" id="pandora-modal-actions"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.close();
            }
        });

        // Close button click
        document.getElementById('pandora-modal-btn-close').addEventListener('click', () => {
            this.close();
        });

        // Click outside card to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });
    },

    close() {
        if (!this.overlay) return;
        this.overlay.classList.remove('active');
        if (this._onCancelCallback) {
            this._onCancelCallback();
            this._onCancelCallback = null;
        }
    },

    /**
     * Alert konfirmasi hapus / aksi penting
     */
    showConfirm({ title, message, subtext, confirmText = 'Lanjutkan', cancelText = 'Batal', isDanger = false, onConfirm, onCancel }) {
        this.init();
        const card = document.getElementById('pandora-modal-card');
        const titleText = document.getElementById('pandora-modal-title-text');
        const body = document.getElementById('pandora-modal-body');
        const actions = document.getElementById('pandora-modal-actions');

        card.className = `pandora-modal-card ${isDanger ? 'modal-danger' : ''}`;
        titleText.innerText = title || 'Konfirmasi Tindakan';

        body.innerHTML = `
            <p>${message || ''}</p>
            ${subtext ? `<div style="font-size:11px; opacity:0.75; margin-top:6px;">${subtext}</div>` : ''}
        `;

        actions.innerHTML = `
            <button class="btn-modal-cancel" id="btn-modal-cancel">${cancelText}</button>
            <button class="btn-modal-confirm ${isDanger ? 'btn-modal-danger' : ''}" id="btn-modal-confirm">
                ${isDanger ? `
                    <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                ` : `
                    <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                `}
                ${confirmText}
            </button>
        `;

        this._onCancelCallback = onCancel;

        document.getElementById('btn-modal-cancel').onclick = () => {
            this._onCancelCallback = null;
            this.close();
            if (onCancel) onCancel();
        };

        document.getElementById('btn-modal-confirm').onclick = () => {
            this._onCancelCallback = null;
            this.close();
            if (onConfirm) onConfirm();
        };

        this.overlay.classList.add('active');
        document.getElementById('btn-modal-confirm').focus();
    },

    /**
     * Modal input nama / edit
     */
    showPrompt({ title, message, defaultValue = '', placeholder = 'Nama Map...', metaText = '', confirmText = 'Simpan', cancelText = 'Batal', onConfirm, onCancel }) {
        this.init();
        const card = document.getElementById('pandora-modal-card');
        const titleText = document.getElementById('pandora-modal-title-text');
        const body = document.getElementById('pandora-modal-body');
        const actions = document.getElementById('pandora-modal-actions');

        card.className = 'pandora-modal-card';
        titleText.innerText = title || 'Simpan Map';

        body.innerHTML = `
            <p>${message || 'Masukkan nama untuk map ini:'}</p>
            <div class="pandora-modal-input-group">
                <label class="pandora-modal-input-label">
                    <span>Nama Map</span>
                    <span style="font-size:10px; opacity:0.6;">Disimpan ke folder maps/</span>
                </label>
                <input type="text" id="pandora-modal-input-val" class="pandora-modal-input" placeholder="${placeholder}" value="${defaultValue.replace(/"/g, '&quot;')}" maxlength="60" autofocus>
            </div>
            ${metaText ? `<div class="pandora-modal-meta-box">${metaText}</div>` : ''}
        `;

        actions.innerHTML = `
            <button class="btn-modal-cancel" id="btn-modal-cancel">${cancelText}</button>
            <button class="btn-modal-confirm" id="btn-modal-confirm">
                <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                </svg>
                ${confirmText}
            </button>
        `;

        const inputEl = document.getElementById('pandora-modal-input-val');
        this._onCancelCallback = onCancel;

        const handleConfirm = () => {
            const val = inputEl.value.trim();
            if (!val) {
                inputEl.focus();
                inputEl.style.borderColor = '#ef4444';
                return;
            }
            this._onCancelCallback = null;
            this.close();
            if (onConfirm) onConfirm(val);
        };

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        });

        document.getElementById('btn-modal-cancel').onclick = () => {
            this._onCancelCallback = null;
            this.close();
            if (onCancel) onCancel();
        };

        document.getElementById('btn-modal-confirm').onclick = handleConfirm;

        this.overlay.classList.add('active');
        setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 50);
    }
};

// --- 2. TOAST NOTIFICATION SYSTEM (Disabled per user request) ---
const PandoraToast = {
    container: null,

    init() {
        // Disabled: all notifications removed
    },

    show(message, type = 'info', duration = 3200) {
        // Disabled: all notifications removed
    }
};

// --- 3. SERIALIZATION & DESERIALIZATION OF 3D MAP ---
// Entri lama yang filenya belum diimpor ulang ikut disimpan, supaya posisinya tidak hilang
function serializeImportedObjects() {
    const objects = (window.importedObjectsList || []).map(o => ({
        name: o.name,
        file: o.file || null,
        posX: Math.round(o.root.position.x * 100) / 100,
        posY: Math.round(o.root.position.y * 100) / 100,
        posZ: Math.round(o.root.position.z * 100) / 100,
        rotX: Math.round(o.root.rotation.x * 10000) / 10000,
        rotY: o.rotY || 0,
        rotZ: Math.round(o.root.rotation.z * 10000) / 10000,
        scale: o.scale || 1.0,
        hasCollision: !!o.hasCollision
    }));
    return objects.concat(window.PandoraImportedObjects ? PandoraImportedObjects.missing : []);
}

function serializeMapData(name, existingId = null) {
    // 1. Terrain data
    const posAttr = groundGeo.attributes.position;
    const colAttr = groundGeo.attributes.color;

    const terrainHeights = [];
    const terrainColors = [];

    // Cek apakah terrain ada perubahan elevasi dari 0
    let hasCustomHeight = false;
    for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        if (Math.abs(y) > 0.001) hasCustomHeight = true;
        terrainHeights.push(Math.round(y * 1000) / 1000);
    }

    // Cek apakah warna terrain ada perubahan dari defaultBaseGrassColor
    for (let i = 0; i < colAttr.count; i++) {
        terrainColors.push(Math.round(colAttr.getX(i) * 1000) / 1000);
        terrainColors.push(Math.round(colAttr.getY(i) * 1000) / 1000);
        terrainColors.push(Math.round(colAttr.getZ(i) * 1000) / 1000);
    }

    // 2. Active Grass data (simpan hanya index yang aktif agar file ringan & cepat)
    const activeGrass = [];
    if (typeof maxGrassCapacity !== 'undefined' && typeof grassActiveStates !== 'undefined') {
        const colorArray = instancedGrassMesh ? instancedGrassMesh.geometry.attributes.instanceColor.array : null;
        for (let i = 0; i < maxGrassCapacity; i++) {
            if (grassActiveStates[i] === 1) {
                activeGrass.push({
                    i: i,
                    x: Math.round(grassCoordsX[i] * 100) / 100,
                    z: Math.round(grassCoordsZ[i] * 100) / 100,
                    s: Math.round(grassScalesArray[i] * 100) / 100,
                    r: Math.round(grassRotYArray[i] * 100) / 100,
                    c: colorArray ? [
                        Math.round(colorArray[i * 3] * 100) / 100,
                        Math.round(colorArray[i * 3 + 1] * 100) / 100,
                        Math.round(colorArray[i * 3 + 2] * 100) / 100
                    ] : null
                });
            }
        }
    }

    // 3. Trees data
    const trees = treesList.map(t => ({
        type: t.userData.typeCode,
        posX: Math.round(t.position.x * 100) / 100,
        posZ: Math.round(t.position.z * 100) / 100,
        rotY: Math.round(t.rotation.y * 100) / 100,
        trunkScaleY: t.userData.trunkGroup ? Math.round(t.userData.trunkGroup.scale.y * 100) / 100 : 1.0,
        trunkThickness: t.userData.trunkGroup ? (
            t.userData.isPine && t.userData.trunkGroup.scale.y > 0.001
                ? Math.round((t.userData.trunkGroup.scale.x / t.userData.trunkGroup.scale.y) * 100) / 100
                : Math.round(t.userData.trunkGroup.scale.x * 100) / 100
        ) : 1.0,
        branchCount: t.userData.branchCount || 3,
        curvature: t.userData.curvature !== undefined ? Math.round(t.userData.curvature * 100) / 100 : 0.5,
        leafCount: t.userData.leafMesh ? t.userData.leafMesh.count : 1200,
        seed: t.userData.seed
    }));

    // 4. Environment data
    const pickerPlaneColor = document.getElementById('picker-plane-color');
    const toggleGrid = document.getElementById('toggle-studio-grid');
    const selectSky = document.getElementById('select-sky-preset');
    const sliderAzim = document.getElementById('slider-azimuth');
    const sliderElev = document.getElementById('slider-elevation');
    const sliderWind = document.getElementById('slider-wind-speed');
    const sliderLeaf = document.getElementById('slider-leaf-fall');
    const sliderCanvasSize = document.getElementById('slider-canvas-size');
    const canvasSizeVal = sliderCanvasSize ? parseFloat(sliderCanvasSize.value) : ((typeof groundSize !== 'undefined') ? groundSize : 80);

    const env = {
        canvasSize: canvasSizeVal,
        planeColor: pickerPlaneColor ? pickerPlaneColor.value : '#cbb6b8',
        showGrid: toggleGrid ? toggleGrid.checked : true,
        skyPreset: selectSky ? selectSky.value : 'day',
        sunAzimuth: sliderAzim ? parseFloat(sliderAzim.value) : 300,
        sunElevation: sliderElev ? parseFloat(sliderElev.value) : 45,
        windSpeed: sliderWind ? parseFloat(sliderWind.value) : 1.0,
        leafFall: sliderLeaf ? parseFloat(sliderLeaf.value) : 1.0
    };

    return {
        id: existingId || null,
        name: name,
        environment: env,
        terrain: {
            heights: hasCustomHeight ? terrainHeights : null,
            colors: terrainColors
        },
        trees: trees,
        rocks: typeof rocksList !== 'undefined' ? rocksList.map(r => ({
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
        flowers: typeof flowersList !== 'undefined' ? flowersList.map(f => ({
            posX: f.posX !== undefined ? f.posX : (f.position ? f.position.x : 0),
            posY: f.posY !== undefined ? f.posY : (f.position ? f.position.y : 0),
            posZ: f.posZ !== undefined ? f.posZ : (f.position ? f.position.z : 0),
            rotY: f.rotY !== undefined ? f.rotY : (f.rotation ? f.rotation.y : 0),
            flowerType: f.flowerType || (f.userData ? f.userData.flowerType : 'spawn_flower_stem'),
            scaleBase: f.scaleBase !== undefined ? f.scaleBase : (f.userData ? f.userData.scaleBase : 1.0),
            seed: f.seed !== undefined ? f.seed : (f.userData ? f.userData.seed : 0)
        })) : [],
        ferns: typeof fernsList !== 'undefined' ? fernsList.map(f => ({
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
        bushes: typeof exportBushesData === 'function' ? exportBushesData() : [],
        butterflies: typeof butterfliesList !== 'undefined' ? butterfliesList.map(b => ({
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
        foxes: (typeof spawnedFoxesList !== 'undefined') ? spawnedFoxesList.map(f => ({
            species: f.species,
            pose: f.pose,
            posX: Math.round(f.root.position.x * 100) / 100,
            posZ: Math.round(f.root.position.z * 100) / 100,
            rotY: Math.round(f.root.rotation.y * 100) / 100,
            scale: f.scaleMultiplier || 1.0,
            isBoss: !!f.isBoss,
            name: f.name,
            maxHealth: f.maxHealth,
            damagePerHit: f.damagePerHit,
            aiMode: f.aiMode,
            detectionRadius: f.detectionRadius,
            deathMode: f.deathMode || 'fade',
            deathLine: f.deathLine || '',
            deathFrom: f.deathFrom || 0,
            deathTo: f.deathTo === undefined ? -1 : f.deathTo
        })) : [],
        itemBoxes: (typeof itemBoxManagerInstance !== 'undefined' && itemBoxManagerInstance.boxes) ? itemBoxManagerInstance.boxes.filter(b => !b.isDrop).map(b => ({
            x: Math.round(b.baseX * 100) / 100,
            z: Math.round(b.baseZ * 100) / 100,
            type: b.type
        })) : [],
        playerSpawn: (typeof PlayerSpawnManager !== 'undefined') ? PlayerSpawnManager.serialize() : null,
        importedObjects: serializeImportedObjects(),
        water: {
            level: typeof getWaterCurrentLevel === 'function' ? getWaterCurrentLevel() : 0.02,
            mask: (typeof hasWaterDrawn === 'function' && hasWaterDrawn() && typeof waterCanvas !== 'undefined') ? waterCanvas.toDataURL('image/png') : null,
            waveAmp: (typeof waterMat !== 'undefined' && waterMat && waterMat.uniforms && waterMat.uniforms.uAmp) ? waterMat.uniforms.uAmp.value : 0.70,
            waveSpeed: (typeof waterMat !== 'undefined' && waterMat && waterMat.uniforms && waterMat.uniforms.uSpeed) ? waterMat.uniforms.uSpeed.value : 1.00,
            waveChop: (typeof waterMat !== 'undefined' && waterMat && waterMat.uniforms && waterMat.uniforms.uChop) ? waterMat.uniforms.uChop.value : 0.80,
            outerOcean: (typeof isOuterOceanEnabled !== 'undefined') ? isOuterOceanEnabled : true
        },
        fog: typeof exportFogData === 'function' ? exportFogData() : null,
        activeGrass: activeGrass,
        portals: (typeof PortalManager !== 'undefined') ? PortalManager.serialize() : [],
        triggers: (typeof TriggerManager !== 'undefined') ? TriggerManager.serialize() : [],
        character: (document.getElementById('select-player-hero-folder') || {}).value || null,
        cinematic: (typeof CinematicManager !== 'undefined' && CinematicManager.scenes && CinematicManager.scenes.length > 0) ? {
            activeSceneIndex: CinematicManager.activeSceneIndex,
            scenes: (typeof CinematicManager.saveCurrentSceneState === 'function' && CinematicManager.saveCurrentSceneState(), JSON.parse(JSON.stringify(CinematicManager.scenes)))
        } : null,
        meta: {
            treeCount: trees.length,
            rockCount: typeof rocksList !== 'undefined' ? rocksList.length : 0,
            flowerCount: typeof flowersList !== 'undefined' ? flowersList.length : 0,
            fernCount: typeof fernsList !== 'undefined' ? fernsList.length : 0,
            bushCount: typeof bushesList !== 'undefined' ? bushesList.length : 0,
            butterflyCount: typeof butterfliesList !== 'undefined' ? butterfliesList.length : 0,
            foxCount: typeof spawnedFoxesList !== 'undefined' ? spawnedFoxesList.length : 0,
            grassCount: activeGrass.length,
            version: '1.0'
        }
    };
}

// --- 4. BACKEND API CLIENT WITH LOCALSTORAGE SYNC FALLBACK ---
const MapStorageAPI = {
    isFileProtocol() {
        return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    },

    async fetchMapsList() {
        if (!this.isFileProtocol()) {
            try {
                const resp = await fetch('api/maps.php', { cache: 'no-cache' });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.success && Array.isArray(json.maps)) {
                        cachedMapsList = json.maps;
                        return json.maps;
                    }
                }
            } catch (e) {
                console.warn('API maps.php tidak dapat dijangkau via HTTP, beralih ke local storage fallback.', e);
            }
        }

        // Fallback LocalStorage (atau saat dibuka via file:///)
        try {
            const raw = localStorage.getItem('pandora_maps_store');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    cachedMapsList = parsed;
                    return parsed;
                }
            }
        } catch (err) {
            console.error('Gagal membaca localStorage fallback:', err);
        }

        return [];
    },

    async fetchMapDetail(id) {
        if (!this.isFileProtocol()) {
            try {
                const resp = await fetch(`api/maps.php?id=${encodeURIComponent(id)}`, { cache: 'no-cache' });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.success && json.map) {
                        return json.map;
                    }
                }
            } catch (e) {
                console.warn('Fetch map detail via API gagal, mencari di local storage fallback:', e);
            }
        }

        // Fallback LocalStorage
        try {
            const raw = localStorage.getItem('pandora_maps_store');
            if (raw) {
                const list = JSON.parse(raw);
                const found = list.find(m => m.id === id);
                if (found) return found;
            }
        } catch (err) {}

        return null;
    },

    async saveMap(mapData) {
        let savedApi = false;
        let responseJson = null;

        if (!this.isFileProtocol()) {
            try {
                const resp = await fetch('api/maps.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapData)
                });
                if (resp.ok) {
                    responseJson = await resp.json();
                    if (responseJson && responseJson.success) {
                        savedApi = true;
                        mapData.id = responseJson.id;
                        mapData.filename = responseJson.filename;
                    }
                }
            } catch (e) {
                console.warn('Simpan via API gagal, menyimpan ke local storage fallback:', e);
            }
        }

        // Sync ke LocalStorage
        try {
            const raw = localStorage.getItem('pandora_maps_store') || '[]';
            let list = JSON.parse(raw);
            if (!mapData.id) {
                mapData.id = 'map-' + Date.now();
            }
            const existingIdx = list.findIndex(m => m.id === mapData.id);
            if (existingIdx >= 0) {
                list[existingIdx] = mapData;
            } else {
                list.unshift(mapData);
            }
            localStorage.setItem('pandora_maps_store', JSON.stringify(list));
        } catch (err) {
            console.error('Gagal menulis ke localStorage:', err);
        }

        return {
            success: true,
            savedToDisk: savedApi,
            map: mapData,
            message: responseJson ? responseJson.message : `Map '${mapData.name}' tersimpan di browser!`
        };
    },

    async deleteMap(id) {
        let deletedApi = false;
        if (!this.isFileProtocol()) {
            try {
                const resp = await fetch(`api/maps.php?id=${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });
                if (resp.ok) {
                    const res = await resp.json();
                    if (res && res.success) deletedApi = true;
                }
            } catch (e) {
                console.warn('Hapus via API gagal, menghapus dari local storage fallback:', e);
            }
        }

        // Sync hapus dari LocalStorage
        try {
            const raw = localStorage.getItem('pandora_maps_store');
            if (raw) {
                let list = JSON.parse(raw);
                list = list.filter(m => m.id !== id);
                localStorage.setItem('pandora_maps_store', JSON.stringify(list));
            }
        } catch (err) {}

        return { success: true, deletedFromDisk: deletedApi };
    }
};

// --- 5. UI CONTROLLER & EVENT BINDINGS ---
const MapManagerUI = {
    selectEl: null,
    btnSave: null,
    btnEdit: null,
    btnDelete: null,
    badgeCount: null,

    async init() {
        this.selectEl = document.getElementById('select-saved-maps');
        this.btnSave = document.getElementById('btn-save-map');
        this.btnEdit = document.getElementById('btn-edit-map');
        this.btnDelete = document.getElementById('btn-delete-map');
        this.badgeCount = document.getElementById('map-badge-count');

        if (!this.selectEl || !this.btnSave) return;

        this.bindEvents();
        await this.refreshList();
    },

    async refreshList(selectedIdToKeep = null) {
        const maps = await MapStorageAPI.fetchMapsList();
        cachedMapsList = maps;

        if (this.badgeCount) {
            this.badgeCount.innerText = maps.length;
        }

        // Kosongkan dan render opsi
        this.selectEl.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.innerText = maps.length === 0 ? '-- Belum Ada Map --' : '-- Pilih Map Tersimpan --';
        this.selectEl.appendChild(defaultOption);

        maps.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const treeTxt = m.treeCount !== undefined ? ` (${m.treeCount} pohon)` : '';
            opt.innerText = `${m.name}${treeTxt}`;
            if (selectedIdToKeep && m.id === selectedIdToKeep) {
                opt.selected = true;
            }
            this.selectEl.appendChild(opt);
        });

        if (selectedIdToKeep) {
            this.selectEl.value = selectedIdToKeep;
            this.updateActionButtons(true);
        } else if (currentActiveMapId) {
            this.selectEl.value = currentActiveMapId;
            this.updateActionButtons(true);
        } else {
            this.updateActionButtons(false);
        }
    },

    updateActionButtons(hasSelection) {
        if (this.btnEdit) this.btnEdit.disabled = !hasSelection;
        if (this.btnDelete) this.btnDelete.disabled = !hasSelection;
    },

    bindEvents() {
        // Change selection
        this.selectEl.addEventListener('change', async (e) => {
            const mapId = e.target.value;
            if (!mapId) {
                this.updateActionButtons(false);
                return;
            }
            this.updateActionButtons(true);
            await this.handleLoadMap(mapId);
        });

        // Click Save button
        this.btnSave.addEventListener('click', () => {
            this.handleSaveClick();
        });

        // Click Edit button
        if (this.btnEdit) {
            this.btnEdit.addEventListener('click', () => {
                if (!currentActiveMapId) return;
                this.handleEditClick();
            });
        }

        // Click Delete button
        if (this.btnDelete) {
            this.btnDelete.addEventListener('click', () => {
                if (!currentActiveMapId) return;
                this.handleDeleteClick();
            });
        }
    },

    async handleLoadMap(mapId) {
        const dialog = ProjectPanel.showProgressDialog('Membuka Stage');
        dialog.update(0.05, 'Membaca data stage');
        const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        let mapDetail = null;
        try {
            await nextPaint();
            mapDetail = await MapStorageAPI.fetchMapDetail(mapId);
            if (!mapDetail) {
                PandoraToast.show('Gagal memuat data map.', 'danger');
                return;
            }

            // Terapkan ke scene 3D
            dialog.update(0.2, 'Membangun scene');
            await nextPaint();
            applyMapDataToScene(mapDetail);
            await this.waitForStageContent(dialog);
        } finally {
            dialog.close();
        }
        if (!mapDetail) return;
        currentActiveMapId = mapDetail.id;
        currentActiveMapName = mapDetail.name;

        // Update tombol simpan teks status jika sedang mengedit
        const txtSave = document.getElementById('txt-save-map');
        if (txtSave) txtSave.innerText = 'Simpan';

        PandoraToast.show(`Map '${mapDetail.name}' berhasil dimuat ke editor!`, 'success');
    },

    // Objek impor dan model karakter dimuat di latar setelah data stage diterapkan
    async waitForStageContent(dialog) {
        const deadline = performance.now() + STAGE_READY_TIMEOUT_MS;
        const objects = window.PandoraImportedObjects;
        while (performance.now() < deadline) {
            const total = objects.pending > 0 ? objects.total : 0;
            if (total > 0) {
                const done = total - objects.pending;
                dialog.update(0.3 + 0.6 * done / total, `Memuat objek 3D (${done + 1}/${total}): ${objects.currentName}`);
            } else {
                const waiting = spawnedFoxesList.filter(fox => !(fox.model && fox.model.mixer)).length;
                if (waiting === 0) return;
                dialog.update(0.92, 'Menyiapkan karakter');
            }
            await new Promise(resolve => setTimeout(resolve, 80));
        }
    },

    handleSaveClick() {
        const defaultName = currentActiveMapName || `Map Cantik ${cachedMapsList.length + 1}`;
        const treeCount = treesList ? treesList.length : 0;
        const metaInfo = `<span>Pohon di Scene: <b>${treeCount}</b></span><span>Format: JSON</span>`;

        PandoraModal.showPrompt({
            title: currentActiveMapId ? 'Simpan / Perbarui Map' : 'Simpan Map Baru',
            message: currentActiveMapId
                ? `Perbarui file map saat ini atau ganti namanya:`
                : 'Beri nama map ini untuk disimpan ke dalam project folder <code>maps/</code>:',
            defaultValue: defaultName,
            placeholder: 'Contoh: Lembah Senja Monstadt',
            metaText: metaInfo,
            confirmText: currentActiveMapId ? 'Perbarui Map' : 'Simpan Map',
            onConfirm: async (mapName) => {
                const mapData = serializeMapData(mapName, currentActiveMapId);
                const result = await MapStorageAPI.saveMap(mapData);

                if (result.success) {
                    currentActiveMapId = result.map.id;
                    currentActiveMapName = result.map.name;
                    await this.refreshList(currentActiveMapId);
                    PandoraToast.show(result.message || `Map '${result.map.name}' berhasil disimpan!`, 'success');
                } else {
                    PandoraToast.show('Gagal menyimpan map.', 'danger');
                }
            }
        });
    },

    handleEditClick() {
        if (!currentActiveMapId) return;

        const currentName = currentActiveMapName || '';
        const treeCount = treesList ? treesList.length : 0;
        const metaInfo = `<span>ID: <code>${currentActiveMapId}</code></span><span>Pohon: <b>${treeCount}</b></span>`;

        PandoraModal.showPrompt({
            title: 'Edit & Perbarui Map',
            message: `Ubah nama map atau perbarui file <code>maps/${currentActiveMapId}.json</code> dengan hasil perubahan terbaru:`,
            defaultValue: currentName,
            placeholder: 'Nama Map...',
            metaText: metaInfo,
            confirmText: 'Perbarui Map',
            onConfirm: async (newName) => {
                const mapData = serializeMapData(newName, currentActiveMapId);
                const result = await MapStorageAPI.saveMap(mapData);

                if (result.success) {
                    currentActiveMapName = newName;
                    await this.refreshList(currentActiveMapId);
                    PandoraToast.show(`Map '${newName}' berhasil diperbarui!`, 'success');
                } else {
                    PandoraToast.show('Gagal memperbarui map.', 'danger');
                }
            }
        });
    },

    handleDeleteClick() {
        if (!currentActiveMapId) return;

        const mapName = currentActiveMapName || currentActiveMapId;

        PandoraModal.showConfirm({
            title: 'Hapus Map Tersimpan',
            message: `Apakah Anda yakin ingin menghapus map <span class="pandora-modal-highlight">"${mapName}"</span>?`,
            subtext: `File di folder <code>maps/${currentActiveMapId}.json</code> akan dihapus secara permanen dari project. Tindakan ini tidak dapat dibatalkan.`,
            confirmText: 'Ya, Hapus Map',
            cancelText: 'Batal',
            isDanger: true,
            onConfirm: async () => {
                const res = await MapStorageAPI.deleteMap(currentActiveMapId);
                if (res.success) {
                    PandoraToast.show(`Map '${mapName}' berhasil dihapus.`, 'info');
                    currentActiveMapId = null;
                    currentActiveMapName = null;
                    await this.refreshList();
                } else {
                    PandoraToast.show('Gagal menghapus file map.', 'danger');
                }
            }
        });
    }
};

// Inisialisasi otomatis setelah DOM selesai dimuat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MapManagerUI.init());
} else {
    MapManagerUI.init();
}
