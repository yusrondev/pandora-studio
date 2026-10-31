/* =========================================================
   PENGATURAN FPS & GRAFIS (Studio dan game hasil generate)
   Dimuat sebelum scene.js karena renderer membaca nilainya saat dibuat.
   ========================================================= */
const GRAPHICS_PRESETS = {
    low:    { label: 'Rendah', maxDpr: 0.85, shadowSize: 1024, shadowEvery: 4, cloudFraction: 0.35, grassFraction: 0.4,  waterDepthEvery: 6, antialias: false, gpu: 'default' },
    medium: { label: 'Sedang', maxDpr: 1.0,  shadowSize: 1024, shadowEvery: 3, cloudFraction: 0.65, grassFraction: 0.7,  waterDepthEvery: 4, antialias: false, gpu: 'default' },
    high:   { label: 'Tinggi', maxDpr: 1.5,  shadowSize: 2048, shadowEvery: 2, cloudFraction: 1.0,  grassFraction: 1,  waterDepthEvery: 3, antialias: true,  gpu: 'high-performance' },
    ultra:  { label: 'Ultra',  maxDpr: 2.0,  shadowSize: 4096, shadowEvery: 1, cloudFraction: 1.0,  grassFraction: 1,  waterDepthEvery: 1, antialias: true,  gpu: 'high-performance' }
};
const FPS_LIMIT_OPTIONS = [30, 60, 90, 120, 144, 0]; // 0 = tanpa batas
const EDITOR_FPS_OPTIONS = [30, 60];

const PandoraSettings = {
    storageKey: window.PANDORA_RUNTIME ? 'pandora.settings.game' : 'pandora.settings.studio',
    values: { graphics: 'high', fpsLimit: 60, editorFps: 60, dynamicResolution: false, showFps: false, autoQuality: true },
    listeners: [],

    load() {
        this.values.graphics = this.devicePreset();
        try {
            const stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (stored) Object.assign(this.values, stored);
        } catch (err) { /* memakai nilai bawaan */ }
        if (!GRAPHICS_PRESETS[this.values.graphics]) this.values.graphics = 'high';
    },

    // Bawaan pertama kali: ponsel tidak sanggup preset tinggi, dan Safari iOS menutup tab yang boros memori
    devicePreset() {
        const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !touchMac) return 'high';
        const weak = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        return weak ? 'low' : 'medium';
    },

    preset() {
        return GRAPHICS_PRESETS[this.values.graphics];
    },

    set(key, value) {
        this.values[key] = value;
        if (key === 'graphics') this.values.autoQuality = false;
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.values));
        } catch (err) { /* tetap berlaku untuk sesi ini */ }
        this.listeners.forEach(fn => fn(key, value));
    },

    onChange(fn) {
        this.listeners.push(fn);
    }
};
PandoraSettings.load();
window.PandoraSettings = PandoraSettings;

// Terapkan preset yang bisa berubah tanpa memuat ulang halaman
function applyGraphicsPreset() {
    if (typeof renderer === 'undefined') return;
    const preset = PandoraSettings.preset();
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxDpr);
    renderer.setPixelRatio(dpr);
    if (typeof updateViewportSize === 'function') updateViewportSize();

    if (typeof sunLight !== 'undefined' && sunLight.shadow.mapSize.x !== preset.shadowSize) {
        sunLight.shadow.mapSize.set(preset.shadowSize, preset.shadowSize);
        if (sunLight.shadow.map) {
            sunLight.shadow.map.dispose();
            sunLight.shadow.map = null;
        }
    }
    renderer.shadowMap.needsUpdate = true;

    if (typeof rebuildGrassTransforms === 'function') rebuildGrassTransforms();

    if (typeof cloudInstancedMesh !== 'undefined' && typeof globalPuffIndex !== 'undefined') {
        cloudInstancedMesh.count = Math.round(globalPuffIndex * preset.cloudFraction);
    }
}

PandoraSettings.onChange((key) => {
    if (key === 'graphics') applyGraphicsPreset();
});

// ---------------------------------------------------------
// PANEL PENGATURAN
// ---------------------------------------------------------
const SettingsPanel = {
    root: null,
    isOpen: false,
    actions: [],     // tombol tambahan di kaki panel, diisi game runtime
    onClose: null,

    segment(title, options, current, onPick) {
        const row = document.createElement('div');
        row.className = 'pset-row';
        const label = document.createElement('div');
        label.className = 'pset-label';
        label.textContent = title;
        const group = document.createElement('div');
        group.className = 'pset-seg';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.label;
            btn.classList.toggle('active', opt.value === current);
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                onPick(opt.value);
            });
            group.appendChild(btn);
        });
        row.append(label, group);
        return row;
    },

    toggle(title, current, onPick) {
        const row = document.createElement('label');
        row.className = 'pset-row pset-toggle';
        const label = document.createElement('div');
        label.className = 'pset-label';
        label.textContent = title;
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'pset-check' + (current ? ' on' : '');
        box.addEventListener('click', (e) => {
            e.preventDefault();
            const next = !box.classList.contains('on');
            box.classList.toggle('on', next);
            onPick(next);
        });
        row.append(label, box);
        return row;
    },

    section(title) {
        const el = document.createElement('div');
        el.className = 'pset-section';
        el.textContent = title;
        return el;
    },

    build() {
        const values = PandoraSettings.values;
        const body = document.createElement('div');
        body.className = 'pset-body';

        const startPreset = PandoraSettings.preset();
        const hint = document.createElement('div');
        hint.className = 'pset-hint';

        body.appendChild(this.section('Grafis'));
        body.appendChild(this.segment('Kualitas',
            Object.keys(GRAPHICS_PRESETS).map(k => ({ label: GRAPHICS_PRESETS[k].label, value: k })),
            values.graphics,
            (value) => {
                PandoraSettings.set('graphics', value);
                const next = GRAPHICS_PRESETS[value];
                const needsReload = next.antialias !== startPreset.antialias || next.gpu !== startPreset.gpu;
                hint.textContent = needsReload ? 'Anti-aliasing dan pilihan GPU berubah setelah dimuat ulang.' : '';
            }));
        body.appendChild(this.toggle('Resolusi dinamis', values.dynamicResolution, v => PandoraSettings.set('dynamicResolution', v)));

        body.appendChild(this.section('Performa'));
        body.appendChild(this.segment('Batas FPS',
            FPS_LIMIT_OPTIONS.map(v => ({ label: v === 0 ? 'Bebas' : String(v), value: v })),
            values.fpsLimit,
            v => PandoraSettings.set('fpsLimit', v)));
        if (!window.PANDORA_RUNTIME) {
            body.appendChild(this.segment('FPS editor',
                EDITOR_FPS_OPTIONS.map(v => ({ label: String(v), value: v })),
                values.editorFps,
                v => PandoraSettings.set('editorFps', v)));
        }
        body.appendChild(this.toggle('Tampilkan FPS', values.showFps, v => PandoraSettings.set('showFps', v)));

        const monitor = document.createElement('div');
        monitor.className = 'pset-hint';
        body.append(monitor, hint);
        this.measureDisplay(monitor);
        return body;
    },

    // FPS tidak bisa melewati refresh rate layar kecuali dijalankan lewat Play.bat
    measureDisplay(el) {
        const samples = [];
        let last = performance.now();
        const step = (now) => {
            samples.push(now - last);
            last = now;
            if (samples.length < 40) {
                requestAnimationFrame(step);
                return;
            }
            samples.sort((a, b) => a - b);
            const hz = Math.round(1000 / Math.max(1, samples[Math.floor(samples.length * 0.3)]));
            el.textContent = 'Layar saat ini sekitar ' + hz + ' Hz. FPS tidak melebihi angka ini di browser biasa.';
        };
        requestAnimationFrame(step);
    },

    open() {
        if (this.isOpen) return;
        this.isOpen = true;

        const overlay = document.createElement('div');
        overlay.id = 'pset-overlay';
        const panel = document.createElement('div');
        panel.className = 'pset-panel';

        const head = document.createElement('div');
        head.className = 'pset-head';
        const title = document.createElement('span');
        title.textContent = 'Pengaturan';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pset-close';
        close.textContent = '×';
        close.addEventListener('click', () => this.close());
        head.append(title, close);

        const foot = document.createElement('div');
        foot.className = 'pset-foot';
        this.actions.forEach(action => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pset-action' + (action.primary ? ' primary' : '');
            btn.textContent = action.label;
            btn.addEventListener('click', action.run);
            foot.appendChild(btn);
        });
        if (this.actions.length === 0) {
            const done = document.createElement('button');
            done.type = 'button';
            done.className = 'pset-action primary';
            done.textContent = 'Selesai';
            done.addEventListener('click', () => this.close());
            foot.appendChild(done);
        }

        panel.append(head, this.build(), foot);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.root = overlay;
    },

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.root) this.root.remove();
        this.root = null;
        if (this.onClose) this.onClose();
    }
};
window.SettingsPanel = SettingsPanel;

// Selama panel terbuka, klik dan tombol tidak boleh sampai ke kontrol permainan
['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'contextmenu'].forEach(type => {
    window.addEventListener(type, (e) => {
        if (!SettingsPanel.isOpen) return;
        if (type === 'keydown' && e.key === 'Escape') SettingsPanel.close();
        if (type !== 'contextmenu') e.stopImmediatePropagation();
    }, true);
});

// ---------------------------------------------------------
// PENGHITUNG FPS
// ---------------------------------------------------------
const FpsCounter = {
    el: null,
    frames: 0,
    since: 0,
    tick(now) {
        if (!PandoraSettings.values.showFps) {
            if (this.el) this.el.style.display = 'none';
            return;
        }
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.id = 'pset-fps';
            document.body.appendChild(this.el);
        }
        this.el.style.display = 'block';
        this.frames++;
        if (now - this.since >= 500) {
            this.el.textContent = Math.round(this.frames * 1000 / (now - this.since)) + ' FPS';
            this.frames = 0;
            this.since = now;
        }
    }
};
window.FpsCounter = FpsCounter;
