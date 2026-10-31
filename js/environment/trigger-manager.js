/* =========================================================
   TRIGGER AREA
   Area lingkaran di stage: saat pemain masuk, cinematic atau title daerah diputar.
   Penanda hanya terlihat di editor.
   ========================================================= */
class TriggerManagerClass {
    constructor() {
        this.triggers = [];
        this.group = new THREE.Group();
        this.group.name = 'CinematicTriggerGroup';
        this.selectedId = null;
        this.isPlacing = false;
        this._nextId = 1;
        scene.add(this.group);
    }

    _build(trigger) {
        const root = new THREE.Group();
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.965, 1.0, 64),
            new THREE.MeshBasicMaterial({ color: 0xf0b13a, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.06;
        const fill = new THREE.Mesh(
            new THREE.CircleGeometry(1.0, 48),
            new THREE.MeshBasicMaterial({ color: 0xf0b13a, side: THREE.DoubleSide, transparent: true, opacity: 0.1, depthWrite: false })
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.05;
        root.add(ring, fill);
        root.traverse(child => { child.userData.triggerId = trigger.id; });
        trigger.root = root;
        trigger.ring = ring;
        this.group.add(root);
        this._apply(trigger);
    }

    _apply(trigger) {
        const y = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(trigger.x, trigger.z) : 0;
        trigger.root.position.set(trigger.x, y, trigger.z);
        trigger.root.scale.set(trigger.radius, 1, trigger.radius);
    }

    create(data) {
        const trigger = Object.assign({
            id: 'trigger-' + Date.now() + '-' + (this._nextId++),
            name: 'Trigger ' + (this.triggers.length + 1),
            x: 0,
            z: 0,
            radius: 5,
            mode: 'cinematic',    // 'cinematic' | 'title'
            sceneFrom: 0,
            sceneTo: -1,          // -1 = sampai scene terakhir
            titleText: '',
            titleSub: '',
            titleStyle: 'ember'
        }, data || {});
        this._build(trigger);
        this.triggers.push(trigger);
        return trigger;
    }

    update(trigger, fields) {
        Object.assign(trigger, fields);
        this._apply(trigger);
    }

    remove(id) {
        const idx = this.triggers.findIndex(t => t.id === id);
        if (idx === -1) return;
        this.group.remove(this.triggers[idx].root);
        this.triggers.splice(idx, 1);
        if (this.selectedId === id) this.selectedId = null;
    }

    clear() {
        this.triggers.slice().forEach(t => this.remove(t.id));
    }

    find(id) {
        return this.triggers.find(t => t.id === id) || null;
    }

    pickFromRay(raycaster) {
        const hits = raycaster.intersectObjects(this.group.children, true);
        return hits.length > 0 ? this.find(hits[0].object.userData.triggerId) : null;
    }

    togglePlacement(force) {
        this.isPlacing = (typeof force === 'boolean') ? force : !this.isPlacing;
        window.isTriggerPlacementActive = this.isPlacing;
        const btn = document.getElementById('btn-trigger-place');
        if (btn) btn.classList.toggle('active', this.isPlacing);
    }

    serialize() {
        return this.triggers.map(t => ({
            id: t.id,
            name: t.name,
            x: Math.round(t.x * 100) / 100,
            z: Math.round(t.z * 100) / 100,
            radius: t.radius,
            mode: t.mode,
            sceneFrom: t.sceneFrom,
            sceneTo: t.sceneTo,
            titleText: t.titleText,
            titleSub: t.titleSub,
            titleStyle: t.titleStyle
        }));
    }

    deserialize(list) {
        this.clear();
        if (Array.isArray(list)) list.forEach(data => this.create(data));
    }

    fire(trigger, memory) {
        memory.played.add(trigger.id);
        if (trigger.mode === 'title') {
            CinematicFX.playTitle({ text: trigger.titleText || trigger.name, subtitle: trigger.titleSub, style: trigger.titleStyle, duration: 6 });
            return;
        }
        if (window.PandoraStageFlow && PandoraStageFlow.rememberStudioStage) PandoraStageFlow.rememberStudioStage();
        CinematicPlayer.play({
            from: trigger.sceneFrom,
            to: trigger.sceneTo < 0 ? null : trigger.sceneTo,
            stageId: window.currentStageId || 'studio'
        });
    }

    tick() {
        const inGame = (typeof isPlayMode !== 'undefined' && isPlayMode);
        this.group.visible = !inGame;
        if (inGame) {
            if (CinematicPlayer.active || !wolfCharacter || !wolfCharacter.root) return;
            if (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) return;
            if (window.PandoraStageFlow && PandoraStageFlow.isTransitioning) return;
            const memory = CinematicPlayer.stageMemory(window.currentStageId || 'studio');
            const pos = wolfCharacter.root.position;
            for (let i = 0; i < this.triggers.length; i++) {
                const t = this.triggers[i];
                if (!memory.played.has(t.id) && Math.hypot(pos.x - t.x, pos.z - t.z) <= t.radius) {
                    this.fire(t, memory);
                    break;
                }
            }
            return;
        }
        for (let i = 0; i < this.triggers.length; i++) {
            this.triggers[i].ring.material.color.setHex(this.triggers[i].id === this.selectedId ? 0xffffff : 0xf0b13a);
        }
    }
}

const TriggerManager = new TriggerManagerClass();
window.TriggerManager = TriggerManager;

const TriggerPanel = {
    init() {
        this.listEl = document.getElementById('trigger-list');
        this.formEl = document.getElementById('trigger-form');
        if (!this.listEl) return;

        document.getElementById('btn-trigger-place').addEventListener('click', () => {
            if (typeof cancelAllSelections === 'function' && !TriggerManager.isPlacing) cancelAllSelections();
            TriggerManager.togglePlacement();
        });
        document.getElementById('btn-trigger-delete').addEventListener('click', () => {
            if (!TriggerManager.selectedId) return;
            TriggerManager.remove(TriggerManager.selectedId);
            this.render();
        });

        const bind = (id, field, parse, refresh) => {
            const el = document.getElementById(id);
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const trigger = TriggerManager.find(TriggerManager.selectedId);
                if (!trigger) return;
                TriggerManager.update(trigger, { [field]: parse(el.value) });
                if (refresh) this.render();
            });
        };
        const num = v => parseFloat(v) || 0;
        const text = v => v;
        bind('trigger-name', 'name', text, true);
        bind('trigger-mode', 'mode', text, true);
        bind('trigger-scene-from', 'sceneFrom', v => parseInt(v, 10) || 0);
        bind('trigger-scene-to', 'sceneTo', v => parseInt(v, 10));
        bind('trigger-title-text', 'titleText', text);
        bind('trigger-title-sub', 'titleSub', text);
        bind('trigger-title-style', 'titleStyle', text);
        bind('trigger-x', 'x', num);
        bind('trigger-z', 'z', num);
        bind('trigger-radius', 'radius', v => Math.max(0.5, num(v)));
        this.render();
    },

    select(id) {
        TriggerManager.selectedId = id;
        this.render();
        const acc = document.getElementById('accordion-trigger');
        if (acc) acc.classList.remove('collapsed');
    },

    render() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        if (TriggerManager.triggers.length === 0) {
            this.listEl.innerHTML = '<div class="stage-empty">Belum ada trigger di stage ini.</div>';
        }
        TriggerManager.triggers.forEach(t => {
            const row = document.createElement('div');
            row.className = 'stage-row' + (t.id === TriggerManager.selectedId ? ' active' : '');
            const name = document.createElement('span');
            name.className = 'stage-row-name';
            name.textContent = t.name;
            const meta = document.createElement('span');
            meta.className = 'stage-row-meta';
            meta.textContent = t.mode === 'title' ? 'title' : 'cinematic';
            row.append(name, meta);
            row.addEventListener('click', () => this.select(t.id));
            this.listEl.appendChild(row);
        });

        const trigger = TriggerManager.find(TriggerManager.selectedId);
        this.formEl.style.display = trigger ? '' : 'none';
        document.getElementById('btn-trigger-delete').disabled = !trigger;
        if (!trigger) return;

        const scenes = (typeof CinematicManager !== 'undefined' && CinematicManager.scenes) ? CinematicManager.scenes : [];
        const fill = (id, withLast) => {
            const el = document.getElementById(id);
            el.innerHTML = '';
            if (withLast) el.appendChild(new Option('Scene terakhir', '-1'));
            scenes.forEach((s, i) => el.appendChild(new Option(s.name || ('Scene ' + (i + 1)), String(i))));
        };
        fill('trigger-scene-from', false);
        fill('trigger-scene-to', true);

        const set = (id, value) => {
            const el = document.getElementById(id);
            if (document.activeElement !== el) el.value = value;
        };
        set('trigger-name', trigger.name);
        set('trigger-mode', trigger.mode);
        set('trigger-scene-from', String(trigger.sceneFrom));
        set('trigger-scene-to', String(trigger.sceneTo));
        set('trigger-title-text', trigger.titleText);
        set('trigger-title-sub', trigger.titleSub);
        set('trigger-title-style', trigger.titleStyle);
        set('trigger-x', trigger.x);
        set('trigger-z', trigger.z);
        set('trigger-radius', trigger.radius);
        document.getElementById('trigger-cinematic-fields').style.display = trigger.mode === 'cinematic' ? '' : 'none';
        document.getElementById('trigger-title-fields').style.display = trigger.mode === 'title' ? '' : 'none';
    }
};
window.TriggerPanel = TriggerPanel;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TriggerPanel.init());
} else {
    TriggerPanel.init();
}
