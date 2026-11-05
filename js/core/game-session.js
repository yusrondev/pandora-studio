/* =========================================================
   GAME SESSION (dipakai build hasil Generate Game DAN Play Demo di Studio)
   Satu sumber aturan permainan: layar pemuatan yang menunggu semua model siap,
   gugur -> layar gelap + kata-kata -> bangkit, serta menu jeda (panel Pengaturan).
   Play Demo di Studio memakai alur ini supaya hasilnya sama persis dengan build.
   ========================================================= */
(function () {
    const DEATH_QUOTE_FADE_MS = 320;
    const DEATH_QUOTE_MIN_MS = 3000;    // Waktu baca kata-kata saat layar gelap
    const RESPAWN_DELAY_MS = 4200;      // Memberi waktu kamera kematian selesai sebelum layar gelap
    const DEATH_POLL_MS = 500;
    const LEAF_COUNT = 16;

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

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const PandoraGameSession = {
        // Studio: true selama Play Demo berjalan (termasuk saat pindah stage lewat portal)
        isDemo: false,
        isStarting: false,
        // Naik setiap sesi dimulai/berakhir, supaya timer sesi lama tidak menyentuh sesi baru
        token: 0,
        _deathTimer: null,
        _deathPoll: null,
        _respawning: false,
        _quoteEl: null,
        _pauseBound: false,

        // Aturan build berlaku: di game hasil generate, dan di Studio selama Play Demo
        rulesActive() {
            return !!window.PANDORA_RUNTIME || this.isDemo;
        },

        // ---------- Tampilan ----------
        // Dedaunan terhembus dari pojok kanan atas. Hanya animasi CSS (transform), jadi tetap
        // bergerak mulus walau thread utama sedang sibuk mengurai model FBX.
        addFallingLeaves(host) {
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
        },

        showDeathQuote() {
            const el = document.createElement('div');
            el.id = 'death-quote';
            const text = document.createElement('div');
            text.className = 'quote-text';
            text.textContent = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
            const rule = document.createElement('div');
            rule.className = 'death-quote-rule';
            el.append(text, rule);
            document.body.appendChild(el);
            return el;
        },

        // Layar pemuatan: bar, status, dan persen. Kilau pada bar adalah animasi CSS, jadi tetap bergerak saat
        // thread utama sibuk mengurai model dan angka persennya sedang tertahan.
        showLoadingView(cover) {
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
                },
                dispose() { clearInterval(creep); }
            };
        },

        revealCover(cover) {
            cover.classList.add('hide');
            setTimeout(() => cover.remove(), 700);
        },

        // ---------- Gugur & bangkit ----------
        startDeathWatch() {
            this.stopDeathWatch();
            const token = this.token;
            this._deathPoll = setInterval(() => {
                if (token !== this.token) return;
                const flow = window.PandoraStageFlow;
                const dead = typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead;
                if (!dead || this._deathTimer || !flow || flow.isTransitioning) return;
                if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
                this._deathTimer = setTimeout(() => this.respawnAfterDeath(token), RESPAWN_DELAY_MS);
            }, DEATH_POLL_MS);
        },

        stopDeathWatch() {
            clearInterval(this._deathPoll);
            clearTimeout(this._deathTimer);
            this._deathPoll = null;
            this._deathTimer = null;
        },

        async respawnAfterDeath(token) {
            const flow = window.PandoraStageFlow;
            // Timer baru dilepas setelah pemain hidup kembali. Status mati masih true selama
            // fade, jadi melepasnya lebih awal membuat respawn kedua terpicu saat pemain sudah hidup.
            this._respawning = true;
            await flow._fade(true);
            if (token !== this.token) return;
            const quote = this.showDeathQuote();
            this._quoteEl = quote;
            await wait(DEATH_QUOTE_MIN_MS);
            if (token !== this.token) return;
            try {
                flow.respawnInPlace();
            } finally {
                // Quote hilang lebih dulu supaya tidak pernah menimpa permainan yang sudah berjalan
                quote.classList.add('hide');
                await wait(DEATH_QUOTE_FADE_MS);
                quote.remove();
                if (this._quoteEl === quote) this._quoteEl = null;
                if (token === this.token) {
                    await flow._fade(false);
                    this._deathTimer = null;
                    this._respawning = false;
                }
            }
        },

        // ---------- Menu jeda ----------
        pauseActions() {
            const resume = { label: 'Lanjutkan', primary: true, run: () => SettingsPanel.close() };
            if (window.PANDORA_RUNTIME) {
                return [{ label: 'Keluar ke Judul', run: () => location.reload() }, resume];
            }
            return [{ label: 'Keluar dari Demo', run: () => this.exitDemo() }, resume];
        },

        openPause() {
            if (typeof SettingsPanel === 'undefined' || SettingsPanel.isOpen) return;
            if (typeof isPlayMode === 'undefined' || !isPlayMode || this.isStarting) return;
            if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return;
            window.PandoraGamePaused = true;
            SettingsPanel.actions = this.pauseActions();
            SettingsPanel.onClose = () => { window.PandoraGamePaused = false; };
            SettingsPanel.open();
        },

        // Esc ditangani play-mode.js (memanggil openPause); di sini hanya tombol jeda layar sentuh
        bindPauseButton() {
            if (this._pauseBound) return;
            this._pauseBound = true;
            const pauseBtn = document.createElement('button');
            pauseBtn.type = 'button';
            pauseBtn.id = 'btn-game-pause';
            pauseBtn.innerHTML = '<i></i><i></i>';
            pauseBtn.classList.toggle('touch', typeof isTouchDevice === 'function' && isTouchDevice());
            pauseBtn.addEventListener('click', () => this.openPause());
            document.body.appendChild(pauseBtn);
        },

        // Build: dipanggil sekali saat permainan terlihat
        beginRuntime() {
            this.token++;
            this.startDeathWatch();
            this.bindPauseButton();
        },

        // ---------- Play Demo Studio ----------
        demoCharacterId() {
            const selPlayerHero = document.getElementById('select-player-hero-folder');
            return window._pendingStageCharacter || (selPlayerHero && selPlayerHero.value)
                || window.currentFoxSpeciesKey || 'red';
        },

        async loadCharacterAssets(id) {
            const registry = window.PandoraHeroRegistry;
            if (registry && registry.sync) await registry.sync().catch(() => {});
            const manager = registry && registry.getAssetManager ? registry.getAssetManager(id) : null;
            const loads = [manager && manager.load ? manager.load() : null];
            [window.GeneralTakingAssetManager, window.GeneralDeadAssetManager, window.GeneralBlockAssetManager]
                .forEach(m => loads.push(m && m.load ? m.load() : null));
            await Promise.all(loads.map(p => Promise.resolve(p).catch(() => {})));
        },

        // Sama seperti tombol "Mulai" di build: layar gelap + bar pemuatan sampai seluruh model stage
        // termuat dan shader terkompilasi, baru permainan terlihat.
        async startDemo() {
            if (window.PANDORA_RUNTIME || this.isStarting || (typeof isPlayMode !== 'undefined' && isPlayMode)) return;
            this.isStarting = true;
            const token = ++this.token;

            const cover = document.createElement('div');
            cover.id = 'game-cover';
            cover.className = 'demo-cover';
            document.body.appendChild(cover);
            const loading = this.showLoadingView(cover);
            window.PandoraGamePaused = true;
            window.PandoraRenderHold = true;

            let ok = false;
            try {
                loading.phase('Memuat karakter', 38);
                await this.loadCharacterAssets(this.demoCharacterId());
                if (token !== this.token) return;
                loading.reach(40);

                loading.phase('Membangun dunia', 58);
                // Studio: stage awal = map yang sedang dibuka. Pickup & energi penuh di awal sesi,
                // setelah itu aturan build berlaku (yang sudah diambil tidak kembali saat bangkit).
                if (window.itemBoxManagerInstance && itemBoxManagerInstance.collectedKeys) itemBoxManagerInstance.collectedKeys.clear();
                startPlayMode();
                this.isDemo = true;
                loading.reach(60);

                loading.phase('Membangkitkan petarung', 98);
                await PandoraStageFlow.prepareStage(progress => loading.reach(60 + progress * 38));
                if (token !== this.token) return;
                ok = true;
            } catch (err) {
                console.error('[Demo] Gagal menyiapkan Play Demo:', err);
            } finally {
                window.PandoraGamePaused = false;
                window.PandoraRenderHold = false;
                this.isStarting = false;
            }

            if (!ok) {
                loading.dispose();
                cover.remove();
                if (token === this.token && typeof isPlayMode !== 'undefined' && isPlayMode) stopPlayMode();
                return;
            }
            loading.finish();
            await wait(200);
            this.revealCover(cover);
            if (token !== this.token) return;
            this.startDeathWatch();
            this.bindPauseButton();
        },

        exitDemo() {
            if (typeof SettingsPanel !== 'undefined' && SettingsPanel.isOpen) {
                SettingsPanel.onClose = null;
                SettingsPanel.close();
            }
            window.PandoraGamePaused = false;
            if (typeof isPlayMode !== 'undefined' && isPlayMode) stopPlayMode();
            else this.onDemoEnded();
        },

        // Dipanggil stopPlayMode (Studio) sebelum apa pun direset, kecuali saat pindah stage / bangkit
        onDemoEnded() {
            if (window.PANDORA_RUNTIME) return;
            this.isDemo = false;
            this.token++;
            this.stopDeathWatch();
            this._respawning = false;
            window.PandoraGamePaused = false;
            window.PandoraRenderHold = false;
            window.PandoraTimeScale = 1;
            if (this._quoteEl) { this._quoteEl.remove(); this._quoteEl = null; }
            const cover = document.querySelector('#game-cover.demo-cover');
            if (cover) cover.remove();
            const flow = window.PandoraStageFlow;
            if (flow && flow._fadeEl && flow._fadeEl.classList.contains('active')) flow._fade(false);
        }
    };

    window.PandoraGameSession = PandoraGameSession;
})();
