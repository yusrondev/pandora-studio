/* =========================================================
   GAME RUNTIME (hanya dimuat oleh build hasil Generate Game)
   Membaca data/project.json, memuat aset bertahap per stage,
   menampilkan layar judul, lalu menjalankan stage awal.
   ========================================================= */
(function () {
    const DOWNLOAD_CONCURRENCY = 6;
    const DEATH_QUOTE_FADE_MS = 320;
    const DEATH_QUOTE_MIN_MS = 3000;    // Waktu baca kata-kata saat layar gelap
    const LEAF_COUNT = 16;
    const BACKGROUND_DOWNLOAD_PAUSE_MS = 400;

    const DEATH_QUOTES = [
        'Pedang yang patah pernah mengenal api. Tempa dirimu sekali lagi.',
        'Tanah tidak menghina yang jatuh. Ia hanya menunggu kau berdiri.',
        'Luka adalah guru yang tidak pernah meminta bayaran dua kali.',
        'Petarung sejati dihitung dari berapa kali ia bangkit, bukan dari berapa kali ia menang.',
        'Angin tidak bertanya pada daun yang gugur. Ia hanya membawanya lebih jauh.',
        'Musuh terbesar tidak berdiri di depanmu. Ia berbisik agar kau berhenti.',
        'Setiap kekalahan mengajarkan satu langkah yang belum kau kuasai.',
        'Yang kuat bukan yang tidak pernah takut, tetapi yang tetap melangkah.',
        'Hari ini tubuhmu rebah. Tekadmu tidak diminta ikut rebah.',
        'Sungai tidak melawan batu. Ia terus datang sampai batu itu berubah.',
        'Kehormatan seorang petarung lahir saat tak ada lagi yang menyaksikan.',
        'Diam sejenak di dalam gelap. Dari sanalah langkah berikutnya bermula.',
        'Gunung tak pernah didaki oleh mereka yang pulang di tanjakan pertama.',
        'Tarik napas. Genggam lagi. Perang belum menyebut namamu untuk terakhir kali.'
    ];
    const RESPAWN_DELAY_MS = 4200; // Memberi waktu kamera kematian selesai sebelum layar gelap

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
        addFallingLeaves(screen);
        document.body.appendChild(screen);
    }

    // Esc atau tombol jeda di layar sentuh: jeda dengan panel pengaturan
    function bindPauseMenu() {
        const openPause = () => {
            if (SettingsPanel.isOpen || !isPlayMode) return;
            if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return;
            window.PandoraGamePaused = true;
            SettingsPanel.actions = [
                { label: 'Keluar ke Judul', run: () => location.reload() },
                { label: 'Lanjutkan', primary: true, run: () => SettingsPanel.close() }
            ];
            SettingsPanel.onClose = () => { window.PandoraGamePaused = false; };
            SettingsPanel.open();
        };
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                openPause();
            }
        });
        const pauseBtn = document.createElement('button');
        pauseBtn.type = 'button';
        pauseBtn.id = 'btn-game-pause';
        pauseBtn.innerHTML = '<i></i><i></i>';
        pauseBtn.classList.toggle('touch', typeof isTouchDevice === 'function' && isTouchDevice());
        pauseBtn.addEventListener('click', openPause);
        document.body.appendChild(pauseBtn);
    }

    // Dedaunan terhembus dari pojok kanan atas. Hanya animasi CSS (transform), jadi tetap
    // bergerak mulus walau thread utama sedang sibuk mengurai model FBX.
    function addFallingLeaves(host) {
        const layer = document.createElement('div');
        layer.className = 'leaf-layer';
        for (let i = 0; i < LEAF_COUNT; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'leaf-path';
            leaf.style.setProperty('--leaf-dur', (5.5 + Math.random() * 5).toFixed(2) + 's');
            leaf.style.setProperty('--leaf-delay', (-Math.random() * 10).toFixed(2) + 's');
            leaf.style.setProperty('--leaf-x', (-70 - Math.random() * 60).toFixed(1) + 'vw');
            leaf.style.setProperty('--leaf-y', (70 + Math.random() * 55).toFixed(1) + 'vh');
            leaf.style.top = (-8 + Math.random() * 16).toFixed(1) + 'vh';
            leaf.style.right = (-10 + Math.random() * 34).toFixed(1) + 'vw';
            const body = document.createElement('i');
            body.style.setProperty('--leaf-spin', (2.2 + Math.random() * 3).toFixed(2) + 's');
            body.style.setProperty('--leaf-size', (13 + Math.random() * 15).toFixed(1) + 'px');
            body.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
            leaf.appendChild(body);
            layer.appendChild(leaf);
        }
        host.insertBefore(layer, host.firstChild);
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

    // ---------- Layar gelap: kata-kata ----------
    function createQuoteText() {
        const text = document.createElement('div');
        text.className = 'quote-text';
        text.textContent = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
        return text;
    }

    function showDeathQuote() {
        const el = document.createElement('div');
        el.id = 'death-quote';
        const text = createQuoteText();
        const rule = document.createElement('div');
        rule.className = 'death-quote-rule';
        el.append(text, rule);
        document.body.appendChild(el);
        return el;
    }

    // Layar pemuatan setelah "Mulai": bar, status, dan persen. Kilau pada bar adalah animasi CSS, jadi tetap bergerak saat
    // thread utama sibuk mengurai model dan angka persennya sedang tertahan.
    function showLoadingView(cover) {
        const el = document.createElement('div');
        el.className = 'game-loading';
        const bar = document.createElement('div');
        bar.className = 'game-loading-bar';
        const fill = document.createElement('i');
        bar.append(fill, document.createElement('b'));
        const meta = document.createElement('div');
        meta.className = 'game-loading-meta';
        const status = document.createElement('span');
        const percent = document.createElement('span');
        meta.append(status, percent);
        el.append(bar, meta);
        cover.append(el);

        let value = 0;
        let cap = 0;
        const render = () => {
            fill.style.width = value.toFixed(1) + '%';
            percent.textContent = Math.floor(value) + '%';
        };
        // Tahap tanpa angka pasti tetap merayap pelan, tetapi tidak pernah melewati batas tahapnya
        const creep = setInterval(() => {
            if (value < cap) value += (cap - value) * 0.03;
            render();
        }, 100);
        render();
        return {
            phase(label, nextCap) { status.textContent = label; cap = nextCap; },
            reach(target) { value = Math.max(value, target); render(); },
            finish() {
                clearInterval(creep);
                status.textContent = 'Siap';
                value = 100;
                render();
            }
        };
    }

    function watchPlayerDeath(flow) {
        let respawnTimer = null;
        setInterval(() => {
            const dead = typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead;
            if (dead && !respawnTimer && !flow.isTransitioning) {
                respawnTimer = setTimeout(async () => {
                    // Timer baru dilepas setelah pemain hidup kembali. Status mati masih true selama
                    // fade, jadi melepasnya lebih awal membuat respawn kedua terpicu saat pemain sudah hidup.
                    await flow._fade(true);
                    const quote = showDeathQuote();
                    await new Promise(resolve => setTimeout(resolve, DEATH_QUOTE_MIN_MS));
                    try {
                        flow.respawnInPlace();
                    } finally {
                        // Quote hilang lebih dulu supaya tidak pernah menimpa permainan yang sudah berjalan
                        quote.classList.add('hide');
                        await new Promise(resolve => setTimeout(resolve, DEATH_QUOTE_FADE_MS));
                        quote.remove();
                        await flow._fade(false);
                        respawnTimer = null;
                    }
                }, RESPAWN_DELAY_MS);
            }
        }, 500);
    }

    function revealGame(cover) {
        cover.classList.add('hide');
        setTimeout(() => cover.remove(), 700);
    }

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
            loadingView = showLoadingView(cover);
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
            revealGame(cover);
            watchPlayerDeath(PandoraStageFlow);
            bindPauseMenu();
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
