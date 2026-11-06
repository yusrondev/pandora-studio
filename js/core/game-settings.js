/* =========================================================
   PENGATURAN FPS & GRAFIS (Studio dan game hasil generate)
   Dimuat sebelum scene.js karena renderer membaca nilainya saat dibuat.
   ========================================================= */
// Ponsel: nama dan isi preset tetap, tetapi resolusi dan pembaruan bayangan Tinggi dibuat lebih ringan agar tidak cepat panas
const PANDORA_IS_PHONE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
// Ponsel di tingkat rendah: beban terbesar adalah piksel rumput, daun, dan awan.
// foliageShadow mematikan pembacaan bayangan per piksel; coverPower < 0.5 berarti helai tidak diperbesar penuh saat dikurangi.
const PHONE_LOW = { grassFar: 28, shadowTreeFar: 14, leafFraction: 0.32, shafts: 0.15, shadowSize: 512, cloudFraction: 0.08, cloudPuffScale: 1.5, grassFraction: 0.22, foliageShadow: false, coverPower: 0.32, fogFraction: 0.35 };
const PHONE_LOWEST = { grassFar: 22, shadowTreeFar: 10, leafFraction: 0.22, maxDpr: 0.7, cloudFraction: 0.05, cloudPuffScale: 1.7, grassFraction: 0.14, foliageShadow: false, coverPower: 0.28, shadowDynamicEvery: 3, fogFraction: 0.25 };
// postFx: true = versi PC penuh; 'lite' = versi ponsel (tanpa MSAA, berkas cahaya 1/4 resolusi, tanpa bloom)
const PHONE_POST_FX = PANDORA_IS_PHONE ? 'lite' : true;
const GRAPHICS_PRESETS = {
    low:    { label: 'Rendah', shadowDynamicEvery: 2, grassFar: 36, shadowTreeFar: 24, leafFraction: 0.55, shafts: 0.3, maxDpr: 0.85, shadowSize: 1024, shadowEvery: 4, cloudFraction: 0.25, grassFraction: 0.4,  waterDepthEvery: 12, antialias: false, gpu: 'default', ...(PANDORA_IS_PHONE ? PHONE_LOW : {}) },
    medium: { label: 'Sedang', grassFar: 54, shadowTreeFar: 38, postFx: PANDORA_IS_PHONE ? 'lite' : false, leafFraction: 0.8, shafts: 0.6, maxDpr: 1.0,  shadowSize: 1024, shadowEvery: 3, cloudFraction: 0.65, grassFraction: 0.7,  waterDepthEvery: 4, antialias: false, gpu: 'default' },
    high:   { label: 'Tinggi', grassFar: 90, shadowTreeFar: 60, postFx: PHONE_POST_FX, leafFraction: 1, shafts: 1, maxDpr: PANDORA_IS_PHONE ? 1.25 : 1.5, shadowSize: 2048, shadowEvery: PANDORA_IS_PHONE ? 3 : 2, cloudFraction: 1.0,  grassFraction: 1,  waterDepthEvery: 4, antialias: true,  gpu: 'high-performance' },
    ultra:  { label: 'Ultra', grassFar: 140, shadowTreeFar: 90,  postFx: PHONE_POST_FX, leafFraction: 1, shafts: 1, maxDpr: 2.0,  shadowSize: 4096, shadowEvery: 1, cloudFraction: 1.0,  grassFraction: 1,  waterDepthEvery: 2, antialias: true,  gpu: 'high-performance' },
    auto:   { label: 'Rekomendasi' } // Isinya salah satu tingkat AUTO_QUALITY_LEVELS, dipilih dari FPS perangkat
};

// Tingkat kualitas Rekomendasi, dari yang paling ringan
const AUTO_QUALITY_LEVELS = [
    { label: 'Sangat rendah', shadowDynamicEvery: 2, grassFar: 28, shadowTreeFar: 18, leafFraction: 0.4, shafts: 0, maxDpr: 0.75, shadowSize: 512, shadowEvery: 6, cloudFraction: 0.12, grassFraction: 0.25, waterDepthEvery: 24, antialias: false, gpu: 'default', ...(PANDORA_IS_PHONE ? PHONE_LOWEST : {}) },
    GRAPHICS_PRESETS.low,
    { label: 'Rendah+', grassFar: 44, shadowTreeFar: 30, leafFraction: 0.7, shafts: 0.45, maxDpr: 1.0, shadowSize: 1024, shadowEvery: 4, cloudFraction: 0.5, grassFraction: 0.55, waterDepthEvery: 5, antialias: false, gpu: 'default' },
    GRAPHICS_PRESETS.medium,
    { label: 'Sedang+', grassFar: 68, shadowTreeFar: 45, postFx: PANDORA_IS_PHONE ? 'lite' : false, leafFraction: 0.9, shafts: 0.8, maxDpr: 1.25, shadowSize: 2048, shadowEvery: 3, cloudFraction: 0.85, grassFraction: 0.85, waterDepthEvery: 3, antialias: true, gpu: 'high-performance' },
    GRAPHICS_PRESETS.high,
    GRAPHICS_PRESETS.ultra
];
const AUTO_START_PHONE = 1;
const AUTO_START_DESKTOP = 5;
// Rekomendasi tidak naik sendiri melewati Tinggi: Ultra hampir menggandakan beban render (panas)
// untuk perbedaan visual kecil, jadi hanya dipakai bila dipilih sendiri
const AUTO_MAX_LEVEL = 5;
const AUTO_TARGET_FPS = 60;
const AUTO_WINDOW_MS = 2000;
const AUTO_DROP_RATIO = 0.9;          // Di bawah 54 dari 60 FPS dianggap tidak sanggup
const AUTO_RAISE_RATIO = 0.98;
const AUTO_DROP_WINDOWS = 2;          // Dua jendela berturut-turut, agar satu sendatan tidak menurunkan kualitas
const AUTO_RAISE_AFTER_MS = 30000;
const AUTO_FAILED_RAISE_MS = 20000;   // Turun lagi secepat ini setelah naik berarti tingkat itu batas perangkat
const AUTO_CEILING_MS = 24 * 3600 * 1000;
const AUTO_WEAK_FPS = 30;              // Tingkat terendah pun tidak sanggup 60: stabil 30 FPS lebih nyaman dan tidak sepanas itu
const AUTO_FRAME_GAP_MS = 400;        // Jeda sepanjang ini berarti loading atau tab tersembunyi, bukan beban render
const FPS_LIMIT_OPTIONS = [30, 60, 90, 120, 144, 0]; // 0 = tanpa batas
const EDITOR_FPS_OPTIONS = [30, 60];

const PandoraSettings = {
    // Nama baru: Rekomendasi menjadi pilihan awal, termasuk bagi yang sudah pernah membuka game
    storageKey: window.PANDORA_RUNTIME ? 'pandora.settings.game.v3' : 'pandora.settings.studio.v3',
    values: { graphics: 'auto', fpsLimit: 60, editorFps: 60, dynamicResolution: false, showFps: false },
    listeners: [],

    load() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            localStorage.removeItem('pandora.settings.game');
            localStorage.removeItem('pandora.settings.studio');
            localStorage.removeItem('pandora.settings.game.v2');
            localStorage.removeItem('pandora.settings.studio.v2');
        } catch (err) { /* memakai nilai bawaan */ }
        if (stored) Object.assign(this.values, stored);
        if (!GRAPHICS_PRESETS[this.values.graphics]) this.values.graphics = 'auto';
        // Pembukaan pertama: nilai bawaan (Rekomendasi, 60 FPS) ditulis sebagai pilihan yang tersimpan
        if (!stored) this.persist();
    },

    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.values));
        } catch (err) { /* tetap berlaku untuk sesi ini */ }
    },

    preset() {
        return this.presetFor(this.values.graphics);
    },

    presetFor(key) {
        return key === 'auto' ? AUTO_QUALITY_LEVELS[PandoraAutoQuality.level] : GRAPHICS_PRESETS[key];
    },

    set(key, value) {
        this.values[key] = value;
        this.persist();
        this.listeners.forEach(fn => fn(key, value));
    },

    onChange(fn) {
        this.listeners.push(fn);
    }
};

// Rekomendasi: mencari kualitas tertinggi yang masih sanggup menahan 60 FPS di perangkat ini.
// Hasilnya disimpan, jadi pembukaan berikutnya langsung mulai dari tingkat yang tepat.
const PandoraAutoQuality = {
    storageKey: window.PANDORA_RUNTIME ? 'pandora.autoquality.game.v1' : 'pandora.autoquality.studio.v1',
    level: AUTO_START_DESKTOP,
    ceiling: AUTO_QUALITY_LEVELS.length - 1,
    ceilingAt: 0,
    capped: false,
    windowStart: 0,
    lastFrame: 0,
    frames: 0,
    slowWindows: 0,
    stableSince: 0,
    raisedAt: -Infinity,

    load() {
        this.level = PANDORA_IS_PHONE ? AUTO_START_PHONE : AUTO_START_DESKTOP;
        try {
            const stored = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (!stored) return;
            if (AUTO_QUALITY_LEVELS[stored.level]) this.level = Math.min(stored.level, AUTO_MAX_LEVEL);
            this.capped = !!stored.capped && Date.now() - (stored.ceilingAt || 0) < AUTO_CEILING_MS;
            // Batas lama dicoba ulang sesekali: perangkat yang tadinya panas bisa jadi kini sanggup
            if (AUTO_QUALITY_LEVELS[stored.ceiling] && Date.now() - stored.ceilingAt < AUTO_CEILING_MS) {
                this.ceiling = stored.ceiling;
                this.ceilingAt = stored.ceilingAt;
            }
        } catch (err) { /* memakai tingkat awal */ }
    },

    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({ level: this.level, ceiling: this.ceiling, ceilingAt: this.ceilingAt, capped: this.capped }));
        } catch (err) { /* tetap berlaku untuk sesi ini */ }
    },

    restart(now) {
        this.windowStart = now;
        this.frames = 0;
        this.slowWindows = 0;
        this.stableSince = now;
    },

    setLevel(level, now) {
        this.level = level;
        this.persist();
        applyGraphicsPreset();
        this.restart(now);
    },

    limit(frameLimit) {
        return this.capped ? Math.min(frameLimit > 0 ? frameLimit : AUTO_WEAK_FPS, AUTO_WEAK_FPS) : frameLimit;
    },

    // Dipanggil tiap frame yang digambar saat bermain
    update(now, frameLimit) {
        const gap = now - this.lastFrame;
        this.lastFrame = now;
        if (!this.windowStart || gap > AUTO_FRAME_GAP_MS) {
            this.restart(now);
            return;
        }
        this.frames++;
        if (now - this.windowStart < AUTO_WINDOW_MS) return;
        const fps = this.frames * 1000 / (now - this.windowStart);
        this.windowStart = now;
        this.frames = 0;
        const target = frameLimit > 0 ? Math.min(frameLimit, AUTO_TARGET_FPS) : AUTO_TARGET_FPS;

        if (fps < target * AUTO_DROP_RATIO) {
            this.stableSince = now;
            this.slowWindows++;
            if (this.slowWindows < AUTO_DROP_WINDOWS) return;
            if (this.level === 0) {
                if (!this.capped) {
                    this.capped = true;
                    this.ceiling = 0;
                    this.ceilingAt = Date.now();
                    this.persist();
                    this.restart(now);
                }
                return;
            }
            if (now - this.raisedAt < AUTO_FAILED_RAISE_MS) {
                this.ceiling = this.level - 1;
                this.ceilingAt = Date.now();
            }
            this.setLevel(this.level - 1, now);
            return;
        }
        this.slowWindows = 0;
        if (fps < target * AUTO_RAISE_RATIO) {
            this.stableSince = now;
        } else if (!this.capped && now - this.stableSince >= AUTO_RAISE_AFTER_MS && this.level < Math.min(this.ceiling, AUTO_MAX_LEVEL)) {
            this.raisedAt = now;
            this.setLevel(this.level + 1, now);
        }
    }
};
window.PandoraAutoQuality = PandoraAutoQuality;

PandoraAutoQuality.load();
PandoraSettings.load();
window.PandoraSettings = PandoraSettings;

let appliedGrassFraction = PandoraSettings.preset().grassFraction;

function foliageShadowValue() {
    return PandoraSettings.preset().foliageShadow === false ? 0 : 1;
}

// Helai yang dikurangi dibuat lebih lebar agar tetap rimbun, sebanding dengan coverPower preset
function foliageCoverage(fraction) {
    return Math.pow(fraction, -(PandoraSettings.preset().coverPower || 0.5));
}

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

    // Membangun ulang rumput mahal, jadi hanya saat jumlahnya memang berubah
    if (typeof rebuildGrassTransforms === 'function' && preset.grassFraction !== appliedGrassFraction) {
        appliedGrassFraction = preset.grassFraction;
        rebuildGrassTransforms();
    }

    if (window.PANDORA_RUNTIME && typeof applyTreeLeafFraction === 'function') applyTreeLeafFraction();

    if (typeof cloudInstancedMesh !== 'undefined' && typeof globalPuffIndex !== 'undefined') {
        cloudInstancedMesh.count = Math.round(globalPuffIndex * preset.cloudFraction);
        volumetricCloudMat.uniforms.uPuffScale.value = preset.cloudPuffScale || 1;
    }

    if (window.applyFogQuality) window.applyFogQuality();

    const shadowValue = foliageShadowValue();
    if (typeof foliageMaterialsList !== 'undefined') {
        foliageMaterialsList.forEach((material) => {
            if (material.uniforms.uFoliageShadow) material.uniforms.uFoliageShadow.value = shadowValue;
        });
    }
    if (typeof instancedGrassMesh !== 'undefined' && instancedGrassMesh) instancedGrassMesh.material.uniforms.uFoliageShadow.value = shadowValue;
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

        const autoInfo = document.createElement('div');
        autoInfo.className = 'pset-hint';
        const autoInfoText = () => 'Otomatis mengikuti kemampuan perangkat, saat ini: ' + AUTO_QUALITY_LEVELS[PandoraAutoQuality.level].label + (PandoraAutoQuality.capped ? ', 30 FPS.' : '.');
        if (values.graphics === 'auto') autoInfo.textContent = autoInfoText();

        body.appendChild(this.section('Grafis'));
        body.appendChild(this.segment('Kualitas',
            Object.keys(GRAPHICS_PRESETS).map(k => ({ label: GRAPHICS_PRESETS[k].label, value: k })),
            values.graphics,
            (value) => {
                PandoraSettings.set('graphics', value);
                const next = PandoraSettings.presetFor(value);
                const needsReload = next.antialias !== startPreset.antialias || next.gpu !== startPreset.gpu;
                hint.textContent = needsReload ? 'Anti-aliasing dan pilihan GPU berubah setelah dimuat ulang.' : '';
                autoInfo.textContent = value === 'auto' ? autoInfoText() : '';
            }));
        body.appendChild(autoInfo);
        body.appendChild(this.toggle('Resolusi dinamis', values.dynamicResolution, v => PandoraSettings.set('dynamicResolution', v)));

        body.appendChild(this.section('Performa'));
        body.appendChild(this.segment('Batas FPS',
            FPS_LIMIT_OPTIONS.map(v => ({ label: v === 0 ? 'Bebas' : String(v), value: v })),
            values.fpsLimit,
            v => PandoraSettings.set('fpsLimit', v)));
        // Build dan Play Demo tidak punya mode editor
        const gameRules = window.PANDORA_RUNTIME || (window.PandoraGameSession && PandoraGameSession.rulesActive());
        if (!gameRules) {
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
    jsMs: 0,
    renderMs: 0,

    // Waktu CPU per frame: bila jauh di bawah waktu frame, yang membatasi adalah GPU
    note(jsMs, renderMs) {
        this.jsMs = jsMs;
        this.renderMs = renderMs;
    },

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
            const auto = ' | ' + PandoraSettings.preset().label + (PandoraSettings.values.graphics === 'auto' ? ' (auto)' : '');
            const info = renderer.info.render;
            this.el.textContent = Math.round(this.frames * 1000 / (now - this.since)) + ' FPS' + auto
                + ' | ' + info.calls + ' dc | ' + Math.round(info.triangles / 1000) + 'k'
                + ' | JS ' + this.jsMs.toFixed(0) + ' GL ' + this.renderMs.toFixed(0) + ' ms';
            this.frames = 0;
            this.since = now;
        }
    }
};
window.FpsCounter = FpsCounter;
