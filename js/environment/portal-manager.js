/* =========================================================
   PORTAL & STAGE FLOW
   PortalManager  : objek portal di scene (editor + Play Mode)
   PandoraStageFlow: perpindahan stage, dipakai Play Demo Studio dan game hasil generate
   ========================================================= */

const PORTAL_DEFAULT_RADIUS = 1.6;
const PORTAL_COLOR_OPEN = { gate: 0x8b6cff, veil: 0x6ee7ff };
const PORTAL_COLOR_LOCKED = { gate: 0x55555f, veil: 0xa8352a };

class PortalManagerClass {
    constructor() {
        this.portals = [];
        this.group = new THREE.Group();
        this.group.name = 'PortalGroup';
        this.selectedId = null;
        this.isPlacing = false;
        this.armed = true;
        this._nextId = 1;
        scene.add(this.group);
    }

    _buildVisual(portal) {
        const root = new THREE.Group();

        const ringMat = new THREE.MeshBasicMaterial({ color: 0x8b6cff });
        const gate = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 12, 48), ringMat);
        gate.position.y = 1.4;
        root.add(gate);

        const veil = new THREE.Mesh(
            new THREE.CircleGeometry(1.2, 40),
            new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
        );
        veil.position.y = 1.4;
        root.add(veil);

        const floor = new THREE.Mesh(
            new THREE.RingGeometry(0.94, 1.0, 48),
            new THREE.MeshBasicMaterial({ color: 0x8b6cff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.04;
        root.add(floor);

        root.userData.isPortal = true;
        root.userData.portalId = portal.id;
        root.traverse(child => { child.userData.portalId = portal.id; });
        portal.root = root;
        portal.gate = gate;
        portal.veil = veil;
        portal.floor = floor;
        this.group.add(root);
        this._applyTransform(portal);
    }

    _applyTransform(portal) {
        const y = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(portal.x, portal.z) : 0;
        portal.root.position.set(portal.x, y, portal.z);
        portal.root.rotation.y = THREE.MathUtils.degToRad(portal.rotY || 0);
        portal.floor.scale.set(portal.radius, portal.radius, 1);
    }

    create(data) {
        const portal = Object.assign({
            id: 'portal-' + Date.now() + '-' + (this._nextId++),
            name: 'Portal ' + (this.portals.length + 1),
            x: 0,
            z: 0,
            rotY: 0,
            radius: PORTAL_DEFAULT_RADIUS,
            targetStageId: '',
            spawnMode: 'default', // 'default' = spawn stage tujuan, 'custom' = koordinat di bawah
            spawnX: 0,
            spawnZ: 0,
            spawnRotY: 0
        }, data || {});
        this._buildVisual(portal);
        this.portals.push(portal);
        return portal;
    }

    update(portal, fields) {
        Object.assign(portal, fields);
        this._applyTransform(portal);
    }

    remove(id) {
        const idx = this.portals.findIndex(p => p.id === id);
        if (idx === -1) return;
        this.group.remove(this.portals[idx].root);
        this.portals.splice(idx, 1);
        if (this.selectedId === id) this.selectedId = null;
    }

    clear() {
        this.portals.slice().forEach(p => this.remove(p.id));
    }

    find(id) {
        return this.portals.find(p => p.id === id) || null;
    }

    pickFromRay(raycaster) {
        const hits = raycaster.intersectObjects(this.group.children, true);
        return hits.length > 0 ? this.find(hits[0].object.userData.portalId) : null;
    }

    togglePlacement(force) {
        this.isPlacing = (typeof force === 'boolean') ? force : !this.isPlacing;
        window.isPortalPlacementActive = this.isPlacing;
        const btn = document.getElementById('btn-portal-place');
        if (btn) btn.classList.toggle('active', this.isPlacing);
    }

    serialize() {
        return this.portals.map(p => ({
            id: p.id,
            name: p.name,
            x: Math.round(p.x * 100) / 100,
            z: Math.round(p.z * 100) / 100,
            rotY: p.rotY,
            radius: p.radius,
            targetStageId: p.targetStageId,
            spawnMode: p.spawnMode,
            spawnX: p.spawnX,
            spawnZ: p.spawnZ,
            spawnRotY: p.spawnRotY
        }));
    }

    deserialize(list) {
        this.clear();
        if (Array.isArray(list)) list.forEach(data => this.create(data));
    }

    // Portal baru terbuka setelah semua boss di stage ini mati
    aliveBossCount() {
        if (typeof spawnedFoxesList === 'undefined') return 0;
        return spawnedFoxesList.filter(fox => fox.isBoss && !(fox.ai && fox.ai.isDead)).length;
    }

    showLockedHint(count) {
        if (!this.lockedHint) {
            this.lockedHint = document.createElement('div');
            this.lockedHint.id = 'portal-locked-hint';
            document.body.appendChild(this.lockedHint);
        }
        this.lockedHint.textContent = count > 0 ? `Portal terkunci. Kalahkan semua boss di stage ini (sisa ${count}).` : '';
        this.lockedHint.classList.toggle('visible', count > 0);
    }

    tick(delta, elapsed) {
        const aliveBosses = isPlayMode ? this.aliveBossCount() : 0;
        const colors = aliveBosses > 0 ? PORTAL_COLOR_LOCKED : PORTAL_COLOR_OPEN;
        for (let i = 0; i < this.portals.length; i++) {
            const p = this.portals[i];
            p.veil.material.opacity = 0.26 + Math.sin(elapsed * 2.4) * 0.08;
            p.veil.material.color.setHex(colors.veil);
            p.gate.material.color.setHex(colors.gate);
            p.floor.material.color.setHex(p.id === this.selectedId && !isPlayMode ? 0xffffff : colors.gate);
        }
        if (!isPlayMode || !wolfCharacter || !wolfCharacter.root) {
            this.showLockedHint(0);
            return;
        }

        // Pemain baru bisa memicu portal setelah keluar dari semua radius,
        // supaya tiba di dekat portal tujuan tidak langsung terlempar balik.
        const pos = wolfCharacter.root.position;
        let inside = null;
        for (let i = 0; i < this.portals.length; i++) {
            const p = this.portals[i];
            if (Math.hypot(pos.x - p.x, pos.z - p.z) <= p.radius) {
                inside = p;
                break;
            }
        }
        this.showLockedHint(inside && inside.targetStageId ? aliveBosses : 0);
        if (!inside) {
            this.armed = true;
        } else if (this.armed && inside.targetStageId && aliveBosses === 0) {
            this.armed = false;
            PandoraStageFlow.travelThroughPortal(inside);
        }
    }
}

const PortalManager = new PortalManagerClass();
window.PortalManager = PortalManager;

// Longgar untuk jaringan lambat: membuka game sebelum semua model siap membuatnya membeku saat bermain
const STAGE_READY_TIMEOUT_MS = 90000;

const PandoraStageFlow = {
    isTransitioning: false,
    studioSnapshot: null,
    _fadeEl: null,

    _fade(toBlack) {
        if (!this._fadeEl) {
            const el = document.createElement('div');
            el.id = 'stage-fade-overlay';
            el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .35s linear;z-index:900000;display:flex;align-items:center;justify-content:center;color:#ddd;font-size:15px;letter-spacing:.04em;';
            document.body.appendChild(el);
            this._fadeEl = el;
        }
        this._fadeEl.style.opacity = toBlack ? '1' : '0';
        return new Promise(resolve => setTimeout(resolve, 380));
    },

    async fetchStage(stageId) {
        if (window.PANDORA_RUNTIME) {
            const res = await fetch('data/maps/' + encodeURIComponent(stageId) + '.json');
            return res.ok ? res.json() : null;
        }
        return (typeof MapStorageAPI !== 'undefined') ? MapStorageAPI.fetchMapDetail(stageId) : null;
    },

    // Terapkan stage lalu masuk Play Mode. spawn opsional menimpa spawn default stage.
    async enterStage(stageId, spawn, onBuilding) {
        const stage = await this.fetchStage(stageId);
        if (!stage) {
            console.warn('[StageFlow] Stage tidak ditemukan:', stageId);
            return false;
        }
        stage._skipHistory = true;
        if (onBuilding) await onBuilding(stage);

        this.isTransitioning = true;
        if (typeof isPlayMode !== 'undefined' && isPlayMode) stopPlayMode();
        applyMapDataToScene(stage);
        window._pendingStageSpawn = spawn || null;
        if (stage.character) window._pendingStageCharacter = stage.character;
        window.currentStageId = stage.id;
        startPlayMode();
        if (typeof CinematicPlayer !== 'undefined') {
            CinematicPlayer.clearProps();
            CinematicPlayer.restoreStage(stage.id);
        }
        PortalManager.armed = false;
        this.isTransitioning = false;
        return true;
    },

    // Dipanggil di balik layar hitam: semua model stage selesai dimuat, lalu shader, tekstur, dan geometri
    // dikirim ke GPU sekarang. Tanpa ini permainan tersendat saat musuh atau area baru pertama kali terlihat.
    async prepareStage(onProgress) {
        const deadline = performance.now() + STAGE_READY_TIMEOUT_MS;
        // Bunshin, pose, dan kabut disiapkan sekarang supaya L1 tidak tersendat saat bertarung
        if (window.PandoraUltimate && wolfCharacter) await PandoraUltimate.prepare();
        const total = () => spawnedFoxesList.length + 1;
        const loaded = () => spawnedFoxesList.filter(f => f.model && f.model.mixer).length + (wolfCharacter && wolfCharacter.mixer ? 1 : 0);
        while (loaded() < total() && performance.now() < deadline) {
            if (onProgress) onProgress(loaded() / total());
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const modelsLoading = () => (window.PandoraAttachmentSystem ? PandoraAttachmentSystem.pendingModelLoads : 0)
            + (window.PandoraImportedObjects ? PandoraImportedObjects.pending : 0);
        while (modelsLoading() > 0 && performance.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (onProgress) {
            onProgress(1);
            // Beri kesempatan layar menggambar sebelum kompilasi shader yang berat
            await new Promise(resolve => setTimeout(resolve, 30));
        }
        // Collision objek impor dibangun sekarang, bukan saat pertama kali disentuh pemain
        if (window.PandoraGLBCollision && window.importedObjectsList) {
            importedObjectsList.forEach(item => item.hasCollision && PandoraGLBCollision.prebuild(item));
        }
        // Siluet karakter yang tertutup rintangan baru tampil saat bermain; shadernya perlu ikut dikompilasi
        if (typeof ensureFoxEagleVisionSystem === 'function') ensureFoxEagleVisionSystem(wolfCharacter);
        if (window.itemBoxManagerInstance) itemBoxManagerInstance.ensureScanTwins(wolfCharacter);
        const culled = [];
        scene.traverse((object) => {
            if (object.frustumCulled) {
                object.frustumCulled = false;
                culled.push(object);
            }
        });
        renderer.compile(scene, camera);
        if (typeof BossKillCam !== 'undefined') BossKillCam.prewarm();
        renderer.shadowMap.needsUpdate = true;
        renderer.render(scene, camera);
        culled.forEach((object) => { object.frustumCulled = true; });
    },

    // Respawn di stage yang sama: stage tidak dibangun ulang, hanya pemain dan musuh yang dipulihkan
    respawnInPlace() {
        this.isTransitioning = true;
        window.PandoraTimeScale = 1;
        const final = (typeof CinematicPlayer !== 'undefined' && window.currentStageId && CinematicPlayer.memory[window.currentStageId])
            ? CinematicPlayer.memory[window.currentStageId].final
            : null;
        if (final && final.player) {
            window._pendingStageSpawn = { x: final.player.x, z: final.player.z, rotY: final.player.heading };
        }
        stopPlayMode();
        startPlayMode();
        PortalManager.armed = false;
        this.isTransitioning = false;
    },

    // Tampil di dalam lapisan hitam, jadi ikut memudar bersamanya
    showTravelLoader() {
        const box = document.createElement('div');
        box.className = 'stage-travel';
        box.innerHTML = '<div class="stage-travel-bar"><i></i><b></b></div><div class="stage-travel-meta"><span></span><span></span></div>';
        this._fadeEl.appendChild(box);
        const fill = box.querySelector('i');
        const [label, percent] = box.querySelectorAll('span');
        const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        let shown = 0;
        return {
            update(value, text) {
                shown = Math.max(shown, value);
                fill.style.width = (shown * 100).toFixed(1) + '%';
                percent.textContent = Math.round(shown * 100) + '%';
                if (text) label.textContent = text;
            },
            paint,
            remove() {
                box.remove();
            }
        };
    },

    async travelThroughPortal(portal) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        this.rememberStudioStage();

        await this._fade(true);
        const spawn = portal.spawnMode === 'custom'
            ? { x: portal.spawnX, z: portal.spawnZ, rotY: THREE.MathUtils.degToRad(portal.spawnRotY || 0) }
            : null;
        window.PandoraGamePaused = true;
        const loader = this.showTravelLoader();
        loader.update(0.05, 'Membaca stage');
        await loader.paint();
        // Galat saat pindah tidak boleh meninggalkan pemain di layar hitam yang terkunci
        try {
            const entered = await this.enterStage(portal.targetStageId, spawn, async (stage) => {
                loader.update(0.25, 'Membangun ' + (stage.name || 'stage'));
                await loader.paint();
            });
            if (entered) {
                loader.update(0.45, 'Memuat karakter dan objek');
                await loader.paint();
                await this.prepareStage(progress => loader.update(0.45 + progress * 0.45));
                loader.update(1, 'Siap');
                await loader.paint();
            }
        } catch (err) {
            console.error('[StageFlow] Gagal pindah stage:', err);
        } finally {
            window.PandoraGamePaused = false;
            this.isTransitioning = false;
            await this._fade(false);
            loader.remove();
        }
    },

    // Di Studio, stage asal dikembalikan saat Play Demo dihentikan
    rememberStudioStage() {
        if (!window.PANDORA_RUNTIME && !this.studioSnapshot && typeof serializeMapData === 'function') {
            this.studioSnapshot = serializeMapData(currentActiveMapName || 'Stage', currentActiveMapId);
        }
    },

    onPlayStopped() {
        if (this.isTransitioning) return;
        if (typeof CinematicPlayer !== 'undefined') CinematicPlayer.reset();
        if (!this.studioSnapshot) return;
        const snapshot = this.studioSnapshot;
        this.studioSnapshot = null;
        snapshot._skipHistory = true;
        applyMapDataToScene(snapshot);
    }
};
window.PandoraStageFlow = PandoraStageFlow;

// ---------------------------------------------------------
// PANEL INSPECTOR PORTAL
// ---------------------------------------------------------
const PortalPanel = {
    stages: [],

    init() {
        this.listEl = document.getElementById('portal-list');
        this.formEl = document.getElementById('portal-form');
        if (!this.listEl) return;

        document.getElementById('btn-portal-place').addEventListener('click', () => {
            if (typeof cancelAllSelections === 'function' && !PortalManager.isPlacing) cancelAllSelections();
            PortalManager.togglePlacement();
        });
        document.getElementById('btn-portal-delete').addEventListener('click', () => {
            if (!PortalManager.selectedId) return;
            PortalManager.remove(PortalManager.selectedId);
            this.render();
        });

        const bind = (id, field, parse) => {
            const el = document.getElementById(id);
            const handler = () => {
                const portal = PortalManager.find(PortalManager.selectedId);
                if (!portal) return;
                PortalManager.update(portal, { [field]: parse(el.value) });
                if (field === 'name' || field === 'targetStageId') this.renderList();
                if (field === 'spawnMode') this.renderForm();
            };
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
        };
        const num = v => parseFloat(v) || 0;
        const text = v => v;
        bind('portal-name', 'name', text);
        bind('portal-target', 'targetStageId', text);
        bind('portal-spawn-mode', 'spawnMode', text);
        bind('portal-x', 'x', num);
        bind('portal-z', 'z', num);
        bind('portal-rot', 'rotY', num);
        bind('portal-radius', 'radius', v => Math.max(0.5, num(v)));
        bind('portal-spawn-x', 'spawnX', num);
        bind('portal-spawn-z', 'spawnZ', num);
        bind('portal-spawn-rot', 'spawnRotY', num);
        this.render();
    },

    setStages(stages) {
        this.stages = stages;
        this.renderForm();
        this.renderList();
    },

    select(id) {
        PortalManager.selectedId = id;
        this.render();
        const acc = document.getElementById('accordion-portal');
        if (acc) acc.classList.remove('collapsed');
    },

    stageName(id) {
        const stage = this.stages.find(s => s.id === id);
        return stage ? stage.name : '';
    },

    render() {
        this.renderList();
        this.renderForm();
    },

    renderList() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        if (PortalManager.portals.length === 0) {
            this.listEl.innerHTML = '<div class="stage-empty">Belum ada portal di stage ini.</div>';
        }
        PortalManager.portals.forEach(p => {
            const row = document.createElement('div');
            row.className = 'stage-row' + (p.id === PortalManager.selectedId ? ' active' : '');
            const name = document.createElement('span');
            name.className = 'stage-row-name';
            name.textContent = p.name;
            const target = document.createElement('span');
            target.className = 'stage-row-meta';
            target.textContent = p.targetStageId ? ('ke ' + (this.stageName(p.targetStageId) || p.targetStageId)) : 'tanpa tujuan';
            row.append(name, target);
            row.addEventListener('click', () => this.select(p.id));
            this.listEl.appendChild(row);
        });
    },

    renderForm() {
        if (!this.formEl) return;
        const portal = PortalManager.find(PortalManager.selectedId);
        this.formEl.style.display = portal ? '' : 'none';
        document.getElementById('btn-portal-delete').disabled = !portal;
        if (!portal) return;

        const target = document.getElementById('portal-target');
        target.innerHTML = '';
        target.appendChild(new Option('-- Pilih Stage --', ''));
        this.stages.filter(s => s.id !== window.currentActiveMapIdForPanel).forEach(s => target.appendChild(new Option(s.name, s.id)));
        if (portal.targetStageId && !this.stages.some(s => s.id === portal.targetStageId)) {
            target.appendChild(new Option('(Stage hilang) ' + portal.targetStageId, portal.targetStageId));
        }

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (document.activeElement !== el) el.value = value;
        };
        set('portal-name', portal.name);
        set('portal-target', portal.targetStageId);
        set('portal-spawn-mode', portal.spawnMode);
        set('portal-x', portal.x);
        set('portal-z', portal.z);
        set('portal-rot', portal.rotY);
        set('portal-radius', portal.radius);
        set('portal-spawn-x', portal.spawnX);
        set('portal-spawn-z', portal.spawnZ);
        set('portal-spawn-rot', portal.spawnRotY);
        document.getElementById('portal-spawn-custom').style.display = portal.spawnMode === 'custom' ? '' : 'none';
    }
};
window.PortalPanel = PortalPanel;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PortalPanel.init());
} else {
    PortalPanel.init();
}
