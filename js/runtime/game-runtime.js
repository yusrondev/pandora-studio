/* =========================================================
   GAME RUNTIME (hanya dimuat oleh build hasil Generate Game)
   Membaca data/project.json, memuat aset bertahap per stage,
   menampilkan layar judul, lalu menjalankan stage awal.
   ========================================================= */
(function () {
    const DOWNLOAD_CONCURRENCY = 6;
    const BACKGROUND_DOWNLOAD_PAUSE_MS = 400;
    // Gugur/bangkit, menu jeda, dan layar pemuatan ada di js/core/game-session.js (dipakai juga Play Demo Studio)
    const Session = window.PandoraGameSession;

    // Karakter ditentukan tiap stage, jadi tombol ganti karakter 1-9 dimatikan
    window.addEventListener('keydown', (e) => {
        if (/^[1-9]$/.test(e.key)) e.stopImmediatePropagation();
    }, true);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    function menuButton(label, run) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.addEventListener('click', run);
        return btn;
    }

    function showTitleScreen(gameName, onStart) {
        const screen = document.createElement('div');
        screen.id = 'game-title-screen';
        const title = document.createElement('h1');
        title.textContent = gameName;
        const menu = document.createElement('div');
        menu.className = 'game-menu';
        menu.append(
            menuButton('Mulai', () => {
                if (typeof enterMobileGameView === 'function') enterMobileGameView();
                screen.remove();
                onStart();
            }),
            menuButton('Pengaturan', () => {
                SettingsPanel.actions = [];
                SettingsPanel.onClose = null;
                SettingsPanel.open();
            })
        );
        screen.append(title, menu);
        Session.addFallingLeaves(screen);
        document.body.appendChild(screen);
    }

    // ---------- Pemuatan bertahap ----------
    const StageLoader = {
        project: null,

        characterFiles(id) {
            const meta = PandoraHeroRegistry.characters.find(c => c.id === id);
            if (!meta) return [];
            return (meta.files || []).map(f => (meta.basePath || ('hero/' + id + '/')) + f);
        },

        generalFiles() {
            const general = PandoraHeroRegistry.general || {};
            return (general.files || []).map(f => (general.basePath || 'hero/general/') + f);
        },

        // Hanya unduh ke cache, tanpa mengurai: tidak mengganggu frame
        async download(urls, onProgress, concurrency = DOWNLOAD_CONCURRENCY, pauseMs = 0) {
            const queue = Array.from(new Set(urls));
            const total = queue.length;
            let done = 0;
            const worker = async () => {
                while (queue.length > 0) {
                    const url = queue.shift();
                    try { await PandoraAssetCache.getAssetBuffer(url); } catch (err) { /* file opsional */ }
                    done++;
                    if (onProgress) onProgress(done / total);
                    if (pauseMs > 0) await new Promise(resolve => setTimeout(resolve, pauseMs));
                }
            };
            await Promise.all(Array.from({ length: concurrency }, worker));
        },

        loadCharacter(id) {
            const manager = PandoraHeroRegistry.getAssetManager(id);
            return (manager && manager.load) ? manager.load().catch(() => {}) : Promise.resolve();
        },

        // Tahap 1, sudah berjalan sejak halaman terbuka: hanya karakter pemain
        async essentials(stage, onProgress) {
            await PandoraHeroRegistry.sync();
            const files = this.characterFiles(stage.player).concat(this.generalFiles());
            if (this.project.animationDonor) files.push(...this.characterFiles(this.project.animationDonor));
            await this.download(files, p => onProgress(p * 0.75));
            await this.loadCharacter(stage.player);
            onProgress(1);
        },

        // Tahap 2, di balik menu judul: mengurai FBX menghentikan frame, jadi semua milik stage ini
        // harus selesai sebelum permainan terlihat
        async stageAssets(stage) {
            for (const id of stage.others) await this.loadCharacter(id);
            for (const manager of [window.GeneralTakingAssetManager, window.GeneralDeadAssetManager, window.GeneralBlockAssetManager]) {
                if (manager && manager.load) await manager.load();
            }
        },

        // Tahap 3, saat permainan berjalan: file stage lain hanya diunduh ke cache, tidak diurai
        async laterStages(stage) {
            const later = [];
            this.project.stages.forEach(s => {
                if (s.id === stage.id) return;
                [s.player].concat(s.others).forEach(id => later.push(...this.characterFiles(id)));
            });
            // Menyimpan file besar ke cache berjalan di thread utama, jadi jangan menumpuk saat bermain
            await this.download(later, null, 1, BACKGROUND_DOWNLOAD_PAUSE_MS);
        }
    };

    async function boot() {
        const res = await fetch('data/project.json');
        const project = await res.json();
        document.title = project.name;
        StageLoader.project = project;

        const splash = document.getElementById('game-splash');
        if (splash) splash.addEventListener('animationend', () => splash.remove());
        const cover = document.getElementById('game-cover');
        const startStage = project.stages.find(s => s.id === project.startStageId) || project.stages[0];

        // Menu judul langsung tampil dan seluruh stage disiapkan di belakangnya, jadi "Mulai" hanya
        // menunggu sisa yang belum selesai; pemain yang berlama-lama di menu langsung masuk.
        let loadingView = null;
        const loadState = { label: 'Memuat karakter', cap: 38, value: 0 };
        const setPhase = (label, cap) => {
            loadState.label = label;
            loadState.cap = cap;
            if (loadingView) loadingView.phase(label, cap);
        };
        const reach = (value) => {
            loadState.value = Math.max(loadState.value, value);
            if (loadingView) loadingView.reach(value);
        };

        window.PandoraGamePaused = true;
        window.PandoraRenderHold = true;
        const essentialsReady = StageLoader.essentials(startStage, progress => reach(progress * 40));
        const stageAssetsReady = essentialsReady.then(() => {
            reach(40);
            setPhase('Memuat petarung', 58);
            return StageLoader.stageAssets(startStage);
        });
        const stagePrepared = stageAssetsReady.then(async () => {
            reach(60);
            setPhase('Membangun dunia', 80);
            const ok = await PandoraStageFlow.enterStage(project.startStageId);
            if (!ok) return false;
            reach(80);
            setPhase('Membangkitkan petarung', 98);
            await PandoraStageFlow.prepareStage(progress => reach(80 + progress * 18));
            return true;
        });

        showTitleScreen(project.name, async () => {
            loadingView = Session.showLoadingView(cover);
            loadingView.reach(loadState.value);
            loadingView.phase(loadState.label, loadState.cap);
            const ok = await stagePrepared;
            window.PandoraGamePaused = false;
            window.PandoraRenderHold = false;
            if (!ok) {
                document.body.insertAdjacentHTML('beforeend', '<div id="game-title-screen"><h1>Stage awal tidak ditemukan</h1></div>');
                return;
            }
            loadingView.finish();
            await new Promise(resolve => setTimeout(resolve, 200));
            Session.revealCover(cover);
            Session.beginRuntime();
        });
        stageAssetsReady.then(() => StageLoader.laterStages(startStage));
    }

    // Safari iOS mengabaikan user-scalable: cubit dan ketuk dua kali harus dicegah sendiri
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
        document.addEventListener(name, event => event.preventDefault(), { passive: false });
    });
    // Audio di ponsel baru boleh berbunyi setelah sentuhan pertama
    const unlockAudio = () => {
        if (typeof foxSoundFX !== 'undefined' && foxSoundFX.init) {
            foxSoundFX.init();
            if (foxSoundFX.ctx && foxSoundFX.ctx.state === 'suspended') foxSoundFX.ctx.resume();
        }
    };
    document.addEventListener('touchend', unlockAudio, { once: true });
    // Ponsel bisa mencabut konteks WebGL saat memori penuh atau tab ditinggal: muat ulang saat pulih
    renderer.domElement.addEventListener('webglcontextlost', event => event.preventDefault());
    renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot);
})();
