/* =========================================================
   PROJECT & STAGE PANEL (Studio)
   Daftar stage, stage awal, urutan, stage baru, dan Generate Game.
   Setiap stage adalah satu file di maps/; urutannya ada di config/project.json
   ========================================================= */
const ProjectPanel = {
    project: { name: 'Pandora Game', startStageId: '', stageOrder: [], allowedDomains: '' },
    stages: [],

    async init() {
        this.listEl = document.getElementById('stage-list');
        if (!this.listEl) return;

        this.nameEl = document.getElementById('project-game-name');
        this.nameEl.addEventListener('change', () => {
            this.project.name = this.nameEl.value.trim() || 'Pandora Game';
            this.saveProject();
        });
        this.domainsEl = document.getElementById('project-allowed-domains');
        this.domainsEl.addEventListener('change', () => {
            this.project.allowedDomains = this.domainsEl.value.trim();
            this.saveProject();
        });
        document.getElementById('btn-stage-new').addEventListener('click', () => this.promptNewStage());
        document.getElementById('btn-generate-game').addEventListener('click', () => this.promptGenerate());
        document.getElementById('btn-generate-apk').addEventListener('click', () => this.promptGenerate('apk'));
        document.getElementById('btn-open-generate').addEventListener('click', () => {
            document.getElementById('accordion-project').classList.remove('collapsed');
            this.promptGenerate();
        });

        await this.loadProject();
        await this.refresh();

        // Daftar stage ikut berubah saat map disimpan/dihapus/diganti dari toolbar
        const select = document.getElementById('select-saved-maps');
        if (select) new MutationObserver(() => this.refresh()).observe(select, { childList: true });
        if (select) select.addEventListener('change', () => this.renderList());
    },

    async loadProject() {
        try {
            const res = await fetch('api/project.php', { cache: 'no-cache' });
            const json = await res.json();
            if (json.success && json.project) Object.assign(this.project, json.project);
        } catch (err) {
            console.warn('[Project] api/project.php tidak terjangkau:', err);
        }
        this.nameEl.value = this.project.name;
        this.domainsEl.value = this.project.allowedDomains || '';
    },

    async saveProject() {
        try {
            await fetch('api/project.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.project)
            });
        } catch (err) {
            console.warn('[Project] Gagal menyimpan project:', err);
        }
    },

    async refresh() {
        const maps = await MapStorageAPI.fetchMapsList();
        const order = this.project.stageOrder || [];
        const rank = id => {
            const i = order.indexOf(id);
            return i === -1 ? order.length : i;
        };
        this.stages = maps.slice().sort((a, b) => rank(a.id) - rank(b.id));

        const ids = this.stages.map(s => s.id);
        const changed = ids.join() !== order.join();
        this.project.stageOrder = ids;
        if (!ids.includes(this.project.startStageId)) {
            this.project.startStageId = ids[0] || '';
        }
        if (changed) this.saveProject();

        this.renderList();
        if (window.PortalPanel) PortalPanel.setStages(this.stages);
    },

    renderList() {
        this.listEl.innerHTML = '';
        const activeId = (typeof currentActiveMapId !== 'undefined') ? currentActiveMapId : null;
        window.currentActiveMapIdForPanel = activeId;

        this.stages.forEach((stage, idx) => {
            const row = document.createElement('div');
            row.className = 'stage-row' + (stage.id === activeId ? ' active' : '');

            const start = document.createElement('input');
            start.type = 'radio';
            start.name = 'stage-start';
            start.className = 'stage-start-radio';
            start.title = 'Jadikan stage awal game';
            start.checked = stage.id === this.project.startStageId;
            start.addEventListener('click', (e) => e.stopPropagation());
            start.addEventListener('change', () => {
                this.project.startStageId = stage.id;
                this.saveProject();
            });

            const name = document.createElement('span');
            name.className = 'stage-row-name';
            name.textContent = (idx + 1) + '. ' + stage.name;

            const meta = document.createElement('span');
            meta.className = 'stage-row-meta';
            meta.textContent = stage.character || '';

            const up = this.moveButton('▲', 'Naikkan urutan', idx, -1);
            const down = this.moveButton('▼', 'Turunkan urutan', idx, 1);

            row.append(start, name, meta, up, down);
            row.addEventListener('click', () => this.openStage(stage.id));
            this.listEl.appendChild(row);
        });
        if (this.stages.length === 0) {
            this.listEl.innerHTML = '<div class="stage-empty">Belum ada stage. Buat stage baru atau simpan map ini.</div>';
        }
    },

    moveButton(label, title, idx, dir) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stage-move';
        btn.textContent = label;
        btn.title = title;
        btn.disabled = idx + dir < 0 || idx + dir >= this.stages.length;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const moved = this.stages.splice(idx, 1)[0];
            this.stages.splice(idx + dir, 0, moved);
            this.project.stageOrder = this.stages.map(s => s.id);
            this.saveProject();
            this.renderList();
        });
        return btn;
    },

    openStage(stageId) {
        if (stageId === currentActiveMapId) return;
        PandoraModal.showConfirm({
            title: 'Buka Stage',
            message: 'Perubahan stage aktif yang belum disimpan akan hilang. Lanjut membuka stage ini?',
            confirmText: 'Buka Stage',
            onConfirm: async () => {
                const select = document.getElementById('select-saved-maps');
                select.value = stageId;
                await MapManagerUI.handleLoadMap(stageId);
                MapManagerUI.updateActionButtons(true);
                this.renderList();
                PortalPanel.render();
            }
        });
    },

    blankStage(name) {
        return {
            name,
            environment: { canvasSize: 80, planeColor: '#cbb6b8', showGrid: true, skyPreset: 'day', sunAzimuth: 300, sunElevation: 45, windSpeed: 1.0, leafFall: 1.0 },
            terrain: { heights: null, colors: null },
            trees: [], rocks: [], flowers: [], ferns: [], bushes: [], butterflies: [], foxes: [], itemBoxes: [],
            portals: [],
            playerSpawn: { x: 0, z: 0, rotY: 0 },
            importedObjects: [],
            water: { level: -0.4, waveAmp: 0, waveChop: 0, mask: null, outerOcean: true },
            fog: null,
            activeGrass: [],
            cinematic: null,
            character: document.getElementById('select-player-hero-folder').value || 'red',
            meta: { treeCount: 0, version: '1.0' }
        };
    },

    promptNewStage() {
        PandoraModal.showPrompt({
            title: 'Stage Baru',
            message: 'Stage baru dimulai dari scene kosong. Perubahan stage aktif yang belum disimpan akan hilang.',
            defaultValue: 'Stage ' + (this.stages.length + 1),
            placeholder: 'Nama stage...',
            confirmText: 'Buat Stage',
            onConfirm: async (name) => {
                const result = await MapStorageAPI.saveMap(this.blankStage(name));
                if (!result.success) return;
                await MapManagerUI.refreshList(result.map.id);
                await MapManagerUI.handleLoadMap(result.map.id);
                await this.refresh();
                PortalPanel.render();
            }
        });
    },

    promptGenerate(target = 'web') {
        const isApk = target === 'apk';
        const title = isApk ? 'Generate APK' : 'Generate Game';
        const stageCount = this.stages.length;
        if (stageCount === 0) {
            PandoraModal.showConfirm({ title, message: 'Simpan minimal satu stage terlebih dahulu.', confirmText: 'OK' });
            return;
        }
        const message = isApk
            ? `Membuat game dari ${stageCount} stage tersimpan lalu membungkusnya menjadi APK Android di folder <code>pandora-builds/</code>. Butuh toolchain dari <code>tools/android/Setup-Android.bat</code>; build pertama bisa beberapa menit. Perubahan yang belum disimpan tidak ikut.`
            : `Membuat game mandiri dari ${stageCount} stage tersimpan ke folder <code>pandora-builds/</code> di luar project Studio. Perubahan yang belum disimpan tidak ikut.`;
        PandoraModal.showPrompt({
            title,
            message,
            defaultValue: this.project.name,
            placeholder: 'Nama game...',
            confirmText: 'Generate',
            onConfirm: (name) => this.generate(name, target)
        });
    },

    async generate(gameName, target = 'web') {
        this.project.name = gameName;
        this.nameEl.value = gameName;
        await this.saveProject();

        const statusEl = document.getElementById('generate-status');
        const buttons = ['btn-generate-game', 'btn-generate-apk'].map(id => document.getElementById(id));
        buttons.forEach(b => { b.disabled = true; });
        statusEl.className = 'generate-status';
        statusEl.textContent = '';
        const isApk = target === 'apk';
        const dialog = this.showProgressDialog((isApk ? 'Generate APK: ' : 'Generate Game: ') + gameName,
            isApk ? [{ until: 0.4, name: 'Build web' }, { until: 1, name: 'Membuat APK (Gradle)' }] : null);
        // Menutup tab memutus proses build, jadi pengguna diingatkan
        const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', guard);
        try {
            const json = await this.requestExport(gameName, dialog, target);
            if (!json || !json.success) throw new Error((json && json.error) || 'Generate gagal');

            const android = json.android;
            const lines = android
                ? [`APK selesai: ${android.sizeMB} MB (${android.applicationId}, versi ${android.versionName})`, android.apk,
                    'Salin APK ke HP lalu pasang (izinkan "sumber tidak dikenal").',
                    `Cadangkan folder keystore: ${android.keystore}. Tanpa itu, update APK tidak bisa dipasang di atas versi lama.`]
                : [`Selesai: ${json.fileCount} file, ${json.sizeMB} MB`, json.path, 'Jalankan Play.bat di folder tersebut.'];
            const vram = json.textureVramMB;
            if (vram && vram[0] > 0) lines.splice(1, 0, `Memori GPU tekstur model: ±${vram[0]} MB → ±${vram[1]} MB (KTX2)`);
            (json.warnings || []).forEach(w => lines.push('Peringatan: ' + w));
            statusEl.classList.add('ok');
            lines.forEach(line => {
                const div = document.createElement('div');
                div.textContent = line;
                statusEl.appendChild(div);
            });
            dialog.finish(lines);
        } catch (err) {
            statusEl.classList.add('error');
            statusEl.textContent = 'Generate gagal: ' + err.message;
            dialog.fail(err.message);
        } finally {
            window.removeEventListener('beforeunload', guard);
            buttons.forEach(b => { b.disabled = false; });
        }
    },

    // Exporter mengirim satu baris JSON per tahap; baris terakhir berisi hasil
    async requestExport(gameName, dialog, target = 'web') {
        const res = await fetch('api/export-game.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: gameName, target })
        });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let pending = '';
        let result = null;
        const handleLine = (line) => {
            if (!line.trim()) return;
            const data = JSON.parse(line);
            if (data.progress !== undefined) dialog.update(data.progress, data.label);
            else result = data;
        };
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            const lines = pending.split('\n');
            pending = lines.pop();
            lines.forEach(handleLine);
        }
        handleLine(pending);
        return result;
    },

    // stages: [{ until, name }] opsional, untuk menampilkan "Tahap 1/2 · Build web"
    showProgressDialog(title, stages = null) {
        const overlay = document.createElement('div');
        overlay.className = 'generate-overlay';
        overlay.innerHTML = `
            <div class="generate-dialog" role="dialog" aria-modal="true">
                <div class="generate-dialog-title"></div>
                <div class="generate-dialog-body">
                    <div class="generate-bar"><i></i><b></b><span>0%</span></div>
                    <div class="generate-meta"><span class="generate-step"></span><span class="generate-time">0:00</span></div>
                    <div class="generate-label">Memulai</div>
                    <div class="generate-hint" hidden>Masih berjalan. Tahap ini memang lama, jangan tutup halaman ini.</div>
                    <div class="generate-result" hidden></div>
                </div>
                <div class="generate-dialog-actions" hidden><button type="button" class="btn-compact">Tutup</button></div>
            </div>`;
        overlay.querySelector('.generate-dialog-title').textContent = title;
        document.body.appendChild(overlay);

        const bar = overlay.querySelector('.generate-bar');
        const fill = bar.querySelector('i');
        const percent = bar.querySelector('span');
        const label = overlay.querySelector('.generate-label');
        const result = overlay.querySelector('.generate-result');
        const actions = overlay.querySelector('.generate-dialog-actions');
        const stepEl = overlay.querySelector('.generate-step');
        const timeEl = overlay.querySelector('.generate-time');
        const hint = overlay.querySelector('.generate-hint');

        // Jam berjalan dan petunjuk "masih berjalan" menandakan proses hidup walau angka progres lama tidak berubah
        const startedAt = Date.now();
        let lastUpdate = startedAt;
        const formatTime = (ms) => {
            const total = Math.floor(ms / 1000);
            return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
        };
        const tick = () => {
            const now = Date.now();
            timeEl.textContent = formatTime(now - startedAt);
            hint.hidden = now - lastUpdate < 15000;
        };
        const timer = setInterval(tick, 1000);

        const showStep = (value) => {
            if (!stages) return;
            const idx = Math.max(0, stages.findIndex(s => value < s.until));
            const i = value >= 1 ? stages.length - 1 : idx;
            stepEl.textContent = `Tahap ${i + 1}/${stages.length} · ${stages[i].name}`;
        };
        showStep(0);

        const update = (value, text) => {
            fill.style.width = (value * 100).toFixed(1) + '%';
            percent.textContent = Math.round(value * 100) + '%';
            if (text) label.textContent = text;
            showStep(value);
            lastUpdate = Date.now();
            hint.hidden = true;
        };
        const end = (lines) => {
            clearInterval(timer);
            tick();
            hint.hidden = true;
            timeEl.textContent = 'Waktu ' + timeEl.textContent;
            bar.classList.add('done');
            result.hidden = false;
            result.innerHTML = '';
            lines.forEach((line) => {
                const div = document.createElement('div');
                div.textContent = line;
                if (line.startsWith('Peringatan:')) div.className = 'warn';
                result.appendChild(div);
            });
            actions.hidden = false;
            const close = actions.querySelector('button');
            close.addEventListener('click', () => overlay.remove());
            close.focus();
        };
        return {
            update,
            close() {
                clearInterval(timer);
                overlay.remove();
            },
            finish(lines) {
                update(1, 'Selesai');
                end(lines);
            },
            fail(message) {
                bar.classList.add('failed');
                label.textContent = 'Generate gagal';
                end([message]);
            }
        };
    }
};
window.ProjectPanel = ProjectPanel;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ProjectPanel.init());
} else {
    ProjectPanel.init();
}
