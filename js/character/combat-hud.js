/* ===================================================================
   PANDORA COMBAT HUD - BOSS BAR, PLAYER VITALS & OVERHEAD ENEMY HP
   - Boss Bar: Bar panjang tengah atas dengan motif oriental mitologis
     (HANYA muncul saat player berada di dalam radius / area boss).
   - Player HUD: Pojok kiri bawah dengan avatar medallion, HP hijau,
     dan Stamina kuning (tanpa bar biru).
   - Non-Boss Enemies: Floating Health Bar melayang di atas kepala musuh.
   =================================================================== */

const PlayerHealthState = {
    current: 100,
    max: 100,
    lastDamageTime: 0,
    isDead: false,

    reset(maxHp = 100) {
        this.max = maxHp;
        this.current = maxHp;
        this.isDead = false;
        this.updateHUD();
    },

    takeDamage(amount = 15, attackerPos = null) {
        if (this.isDead || (typeof isPlayMode !== 'undefined' && !isPlayMode)) return;

        // Pastikan saat shield ini aktif karakter TIDAK BISA DISERANG (kebal terhadap damage HP)
        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isBlocking) {
            if (typeof wolfCharacter.onBlockHit === 'function') {
                wolfCharacter.onBlockHit(attackerPos, amount);
            }
            return; // HP tidak berkurang sama sekali
        }

        this.current = Math.max(0, this.current - amount);
        this.lastDamageTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        this.updateHUD();

        // Hit-stop, kamera bergetar, tubuh berkedip, percikan, arah serangan, dan kilatan layar
        if (window.PandoraHitFeedback) PandoraHitFeedback.trigger(amount, attackerPos);

        if (this.current <= 0) {
            this.isDead = true;
            if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
                PandoraToast.show('☠️ Karakter telah gugur!', 'error');
            }
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter && typeof wolfCharacter.triggerDeath === 'function') {
                wolfCharacter.triggerDeath();
            }
            // Karakter stop di animasi dead (frame terakhir) dan tidak bangun lagi
            // Hentikan semua musuh dari mengejar, namun biarkan animasi serangan terakhir musuh selesai dulu sebelum kembali ke IDLE
            if (typeof FoxAIManager !== 'undefined' && FoxAIManager && Array.isArray(FoxAIManager.agents)) {
                FoxAIManager.agents.forEach(agent => {
                    if (agent) {
                        agent.targetSpeed = 0;
                        agent.currentSpeed = 0;
                        if (agent.model && agent.model.isPunching) {
                            agent.model.strikeProcessed = true;
                            agent.isPunching = true;
                            agent.state = 'COMBAT_PUNCH';
                        } else {
                            agent.isPunching = false;
                            agent.state = 'IDLE';
                        }
                    }
                });
            }
            if (typeof FoxAIManager !== 'undefined' && FoxAIManager && FoxAIManager.playerWarningBanner) {
                FoxAIManager.playerWarningBanner.classList.remove('visible');
            }
        }
    },

    heal(amount = 20) {
        this.current = Math.min(this.max, this.current + amount);
        this.updateHUD();
    },

    updateHUD() {
        const fill = document.getElementById('player-hp-bar-fill');
        const ghost = document.getElementById('player-hp-bar-ghost');
        if (!fill) return;

        const pct = Math.max(0, Math.min(100, (this.current / this.max) * 100));
        fill.style.width = pct.toFixed(1) + '%';
        const percent = document.getElementById('player-hp-percent');
        // Masih hidup tidak pernah terbaca 0%
        if (percent) percent.textContent = (this.current > 0 ? Math.max(1, Math.round(pct)) : 0) + '%';
        if (fill.parentElement.parentElement) fill.parentElement.parentElement.classList.toggle('low', pct <= 30);
        if (ghost) {
            setTimeout(() => {
                if (ghost) ghost.style.width = pct.toFixed(1) + '%';
            }, 260);
        }
    }
};
window.PlayerHealthState = PlayerHealthState;

// ---------- Busur stamina ----------
// Isi emas yang tegas, dengan ekor komet merah yang memudar di atas ujungnya pada bagian yang baru terpakai.
// Posisinya tetap di layar, tidak dihitung dari posisi karakter tiap frame, jadi tidak bergetar saat FPS turun.
const STAMINA_ARC_SPAN = 52;      // Derajat dari sumbu datar ke tiap ujung busur
const STAMINA_ARC_RADIUS = 40;    // Dalam viewBox 100
const STAMINA_COMET_DEGREES = 42; // Panjang ekor komet
const STAMINA_SMOOTHING = 12;
const STAMINA_ANCHOR_HEIGHT = 0.68; // Dikali skala karakter: kira-kira setinggi dada
const STAMINA_SIDE_GAP = 0.1;       // Terhadap tinggi layar, jarak dari tubuh karakter
const STAMINA_FOLLOW_RATE = 16;
const StaminaGauge = {
    el: null,
    fill: null,
    comet: null,
    tip: null,
    gradient: null,
    length: 0,
    anchor: new THREE.Vector3(),
    screenX: null,
    screenY: null,
    shown: 1,
    rendered: -1,
    lastTime: 0,

    polar(deg) {
        const rad = deg * Math.PI / 180;
        return [50 + Math.cos(rad) * STAMINA_ARC_RADIUS, 50 - Math.sin(rad) * STAMINA_ARC_RADIUS];
    },

    build() {
        this.el = document.createElement('div');
        this.el.id = 'stamina-gauge';
        const [x1, y1] = this.polar(-STAMINA_ARC_SPAN);
        const [x2, y2] = this.polar(STAMINA_ARC_SPAN);
        const d = `M ${x1} ${y1} A ${STAMINA_ARC_RADIUS} ${STAMINA_ARC_RADIUS} 0 0 0 ${x2} ${y2}`;
        this.length = STAMINA_ARC_RADIUS * STAMINA_ARC_SPAN * 2 * Math.PI / 180;
        this.el.innerHTML = `<svg viewBox="0 0 100 100">
            <defs>
                <linearGradient id="stamina-comet" gradientUnits="userSpaceOnUse">
                    <stop class="stamina-comet-stop" offset="0" stop-opacity="0.95"></stop>
                    <stop class="stamina-comet-stop" offset="1" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            <path class="stamina-track" d="${d}"></path>
            <path class="stamina-comet" d="${d}" stroke="url(#stamina-comet)"></path>
            <path class="stamina-fill" d="${d}"></path>
            <line class="stamina-tip"></line>
        </svg>`;
        this.fill = this.el.querySelector('.stamina-fill');
        this.comet = this.el.querySelector('.stamina-comet');
        this.tip = this.el.querySelector('.stamina-tip');
        this.gradient = this.el.querySelector('#stamina-comet');
        document.body.appendChild(this.el);
    },

    render(ratio) {
        const filled = this.length * ratio;
        const span = STAMINA_ARC_SPAN * 2;
        const tipDeg = -STAMINA_ARC_SPAN + span * ratio;
        const cometDeg = Math.min(STAMINA_ARC_SPAN, tipDeg + STAMINA_COMET_DEGREES);
        const cometLength = this.length * (cometDeg - tipDeg) / span;
        this.fill.style.strokeDasharray = `${filled.toFixed(2)} 300`;
        this.comet.style.strokeDasharray = `0 ${filled.toFixed(2)} ${cometLength.toFixed(2)} 300`;

        const [tipX, tipY] = this.polar(tipDeg);
        const [endX, endY] = this.polar(tipDeg + STAMINA_COMET_DEGREES);
        this.gradient.setAttribute('x1', tipX);
        this.gradient.setAttribute('y1', tipY);
        this.gradient.setAttribute('x2', endX);
        this.gradient.setAttribute('y2', endY);

        // Takik kecil melintang di ujung isi
        const rad = tipDeg * Math.PI / 180;
        const dx = Math.cos(rad) * 3.6;
        const dy = -Math.sin(rad) * 3.6;
        this.tip.setAttribute('x1', tipX - dx);
        this.tip.setAttribute('y1', tipY - dy);
        this.tip.setAttribute('x2', tipX + dx);
        this.tip.setAttribute('y2', tipY + dy);
    },

    // Nilai tampilan mengejar stamina dengan halus; stamina sendiri berubah per langkah aksi
    // Menempel di sisi kanan karakter pada layar. Sedikit dihaluskan supaya tidak ikut bergetar mengikuti animasi.
    follow(dt) {
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) return;
        const root = wolfCharacter.root;
        this.anchor.set(root.position.x, root.position.y + STAMINA_ANCHOR_HEIGHT * root.scale.y, root.position.z);
        camera.updateMatrixWorld();
        this.anchor.project(camera);
        if (this.anchor.z > 1) return;
        const size = this.el.offsetWidth;
        const targetX = (this.anchor.x * 0.5 + 0.5) * window.innerWidth + STAMINA_SIDE_GAP * window.innerHeight - size * 0.5;
        const targetY = (0.5 - this.anchor.y * 0.5) * window.innerHeight - size * 0.5;
        const blend = this.screenX === null ? 1 : 1 - Math.exp(-STAMINA_FOLLOW_RATE * dt);
        this.screenX = this.screenX === null ? targetX : this.screenX + (targetX - this.screenX) * blend;
        this.screenY = this.screenY === null ? targetY : this.screenY + (targetY - this.screenY) * blend;
        const maxX = window.innerWidth - size;
        const maxY = window.innerHeight - size;
        this.el.style.transform = `translate3d(${Math.max(0, Math.min(maxX, this.screenX)).toFixed(1)}px, ${Math.max(0, Math.min(maxY, this.screenY)).toFixed(1)}px, 0)`;
    },

    update() {
        if (!this.el) this.build();
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.follow(dt);

        const playing = typeof isPlayMode !== 'undefined' && isPlayMode && !PlayerHealthState.isDead;
        const inSkill = !!window.PandoraUltimateCasting;
        this.el.classList.toggle('visible', !!(playing && !inSkill));

        const ratio = Math.max(0, Math.min(1, FoxStaminaState.current / FoxStaminaState.max));
        this.shown += (ratio - this.shown) * (1 - Math.exp(-STAMINA_SMOOTHING * dt));
        if (Math.abs(this.shown - this.rendered) > 0.0004) {
            this.rendered = this.shown;
            this.render(this.shown);
        }
        this.el.classList.toggle('critical', ratio <= 0.15);
    }
};

// Penghitung hit dan peringkat gaya bertarung di sisi kanan layar
const STYLE_RANKS = [
    { letter: 'D', score: 8 },
    { letter: 'C', score: 24 },
    { letter: 'B', score: 44 },
    { letter: 'A', score: 68 },
    { letter: 'S', score: 98 },
    { letter: 'SS', score: 134 },
    { letter: 'SSS', score: 176 }
];
const STYLE_MAX_SCORE = 220;
const STYLE_HIT_SCORE = 5;
const STYLE_COMBO_SECONDS = 3;       // Hit lebih lambat dari ini memulai hitungan baru
const STYLE_DECAY_DELAY = 1.2;
const STYLE_DECAY_RATE = 7;
const STYLE_HURT_FACTOR = 0.45;      // Terkena serangan memangkas sebagian besar peringkat

const StyleMeter = {
    el: null,
    score: 0,
    hits: 0,
    sinceHit: Infinity,
    rankIndex: -1,
    lastTime: 0,
    lastHealth: null,

    build() {
        this.el = document.createElement('div');
        this.el.id = 'style-meter';
        this.el.innerHTML = '<div class="style-rank"></div><div class="style-bar"><i></i></div><div class="style-hits"><b>0</b><span>HIT</span></div>';
        this.rankEl = this.el.querySelector('.style-rank');
        this.barEl = this.el.querySelector('.style-bar i');
        this.hitsWrap = this.el.querySelector('.style-hits');
        this.hitsEl = this.el.querySelector('.style-hits b');
        document.body.appendChild(this.el);
    },

    replay(element, className) {
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
    },

    // Pindah stage memulai hitungan baru
    reset() {
        this.score = 0;
        this.hits = 0;
        this.sinceHit = Infinity;
        this.rankIndex = -1;
        this.lastHealth = null;
    },

    // Hanya serangan pemain sendiri yang dihitung, bukan bunshin
    registerHit(damage) {
        if (!this.el) this.build();
        if (this.sinceHit > STYLE_COMBO_SECONDS) this.hits = 0;
        this.hits++;
        this.sinceHit = 0;
        const comboBonus = 1 + Math.min(1, this.hits * 0.04);
        this.score = Math.min(STYLE_MAX_SCORE, this.score + (STYLE_HIT_SCORE + (damage || 0) * 0.1) * comboBonus);
        this.hitsEl.textContent = this.hits;
        this.replay(this.hitsWrap, 'pop');
        this.renderRank();
    },

    currentRank() {
        let index = -1;
        for (let i = 0; i < STYLE_RANKS.length; i++) {
            if (this.score >= STYLE_RANKS[i].score) index = i;
        }
        return index;
    },

    renderRank() {
        const index = this.currentRank();
        if (index === this.rankIndex) return;
        const rising = index > this.rankIndex;
        this.rankIndex = index;
        if (index < 0) return;
        this.rankEl.textContent = STYLE_RANKS[index].letter;
        this.el.dataset.rank = STYLE_RANKS[index].letter;
        if (rising) this.replay(this.rankEl, 'rise');
    },

    update() {
        if (!this.el) this.build();
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastTime) / 1000);
        this.lastTime = now;
        this.sinceHit += dt;

        const playing = typeof isPlayMode !== 'undefined' && isPlayMode;
        if (!playing || PlayerHealthState.isDead) {
            this.score = 0;
            this.hits = 0;
        }
        if (this.lastHealth !== null && PlayerHealthState.current < this.lastHealth) this.score *= STYLE_HURT_FACTOR;
        this.lastHealth = PlayerHealthState.current;
        if (this.sinceHit > STYLE_DECAY_DELAY) this.score = Math.max(0, this.score - STYLE_DECAY_RATE * dt);
        if (this.sinceHit > STYLE_COMBO_SECONDS) this.hits = 0;
        this.renderRank();

        const hasRank = this.rankIndex >= 0;
        this.el.classList.toggle('visible', playing && (hasRank || this.hits > 0));
        this.el.classList.toggle('has-rank', hasRank);
        this.hitsWrap.style.opacity = this.hits > 0 ? 1 : 0;
        if (hasRank) {
            const low = STYLE_RANKS[this.rankIndex].score;
            const next = this.rankIndex + 1 < STYLE_RANKS.length ? STYLE_RANKS[this.rankIndex + 1].score : STYLE_MAX_SCORE;
            this.barEl.style.transform = `scaleX(${Math.min(1, (this.score - low) / (next - low)).toFixed(3)})`;
        }
    }
};
window.StyleMeter = StyleMeter;

const CombatHUD = {
    bossContainer: null,
    bossNameLabel: null,
    bossFill: null,
    bossGhost: null,
    playerHUD: null,
    floatingContainer: null,

    activeBoss: null,
    activeBoss: null,
    overheadBarPool: new Map(),
    floatingDamageItems: [],

    init() {
        this.bossContainer = document.getElementById('boss-health-bar-container');
        this.bossNameLabel = document.getElementById('boss-name-text');
        this.bossFill = document.getElementById('boss-bar-fill');
        this.bossGhost = document.getElementById('boss-bar-ghost');
        this.playerHUD = document.getElementById('player-combat-hud');
        this.floatingContainer = document.getElementById('floating-hp-container');
        if (typeof document !== 'undefined' && !document.getElementById('combat-floating-dmg-style')) {
            const st = document.createElement('style');
            st.id = 'combat-floating-dmg-style';
            st.textContent = `
                .floating-damage-text {
                    position: absolute;
                    top: 0;
                    left: 0;
                    pointer-events: none;
                    user-select: none;
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    font-weight: 900;
                    font-size: 20px;
                    letter-spacing: -0.5px;
                    color: #fde047;
                    text-shadow:
                        0 2px 0 #7c2d12,
                        -1.5px -1.5px 0 #451a03,
                        1.5px -1.5px 0 #451a03,
                        -1.5px 1.5px 0 #451a03,
                        1.5px 1.5px 0 #451a03,
                        0 4px 12px rgba(239, 68, 68, 0.75);
                    z-index: 45;
                    will-change: transform, opacity;
                    white-space: nowrap;
                }
                .floating-damage-text.critical {
                    font-size: 25px;
                    color: #ffedd5;
                    text-shadow:
                        0 2px 0 #991b1b,
                        -2px -2px 0 #450a0a,
                        2px -2px 0 #450a0a,
                        -2px 2px 0 #450a0a,
                        2px 2px 0 #450a0a,
                        0 0 16px rgba(249, 115, 22, 0.95);
                }
            `;
            document.head.appendChild(st);
        }
    },

    onPlayModeStart() {
        if (!this.playerHUD) this.init();
        if (this.playerHUD) this.playerHUD.style.display = 'flex';
        PlayerHealthState.reset(100);
    },

    onPlayModeStop() {
        if (!this.playerHUD) this.init();
        if (this.playerHUD) this.playerHUD.style.display = 'none';
        if (this.bossContainer) {
            this.bossContainer.style.display = 'none';
            this.bossContainer.classList.remove('visible');
        }
        if (this.floatingContainer) {
            this.floatingContainer.innerHTML = '';
        }
        this.overheadBarPool.clear();
        this.floatingDamageItems = [];
        this.activeBoss = null;
        this.activeBoss = null;
    },

    update(dt, elapsed) {
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);
        if (!inPlay) {
            if (this.bossContainer && this.bossContainer.classList.contains('visible')) {
                this.bossContainer.classList.remove('visible');
                this.bossContainer.style.display = 'none';
            }
            if (this.playerHUD && this.playerHUD.style.display !== 'none') {
                this.playerHUD.style.display = 'none';
            }
            return;
        }

        if (!this.bossContainer) this.init();

        const playerPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
            ? wolfCharacter.root.position
            : null;

        // 1. KAPSUL STAMINA
        if (typeof FoxStaminaState !== 'undefined') StaminaGauge.update();
        StyleMeter.update();

        // 2. DETEKSI BOSS & UPDATE BAR BOSS TENGAH ATAS
        // Boss aktif ditentukan fox-physics agar bar dan kamera selalu sepakat soal radius
        const nearbyBoss = window.activeBossEncounter || null;

        const foxList = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList))
            ? spawnedFoxesList
            : [];

        if (nearbyBoss && this.bossContainer) {
            this.activeBoss = nearbyBoss;
            this.bossContainer.style.display = 'flex';
            // Trigger animation frame untuk transisi fade in yang mulus
            requestAnimationFrame(() => {
                if (this.bossContainer) this.bossContainer.classList.add('visible');
            });

            if (this.bossNameLabel) {
                this.bossNameLabel.innerText = nearbyBoss.name || 'Lingxuzi';
            }

            const curHp = (nearbyBoss.ai && typeof nearbyBoss.ai.health === 'number')
                ? nearbyBoss.ai.health
                : (nearbyBoss.health !== undefined ? nearbyBoss.health : 100);
            const maxHp = (nearbyBoss.ai && typeof nearbyBoss.ai.maxHealth === 'number')
                ? nearbyBoss.ai.maxHealth
                : (nearbyBoss.maxHealth || 100);

            const hpPct = Math.max(0, Math.min(100, (curHp / maxHp) * 100));
            if (this.bossFill) {
                this.bossFill.style.width = hpPct.toFixed(1) + '%';
            }
            if (this.bossGhost) {
                setTimeout(() => {
                    if (this.bossGhost) this.bossGhost.style.width = hpPct.toFixed(1) + '%';
                }, 280);
            }
        } else if (this.bossContainer) {
            if (this.bossContainer.classList.contains('visible')) {
                this.bossContainer.classList.remove('visible');
                setTimeout(() => {
                    if (!this.activeBoss && this.bossContainer) {
                        this.bossContainer.style.display = 'none';
                    }
                }, 450);
            }
            this.activeBoss = null;
        }

        // 3. OVERHEAD FLOATING HP BARS UNTUK NON-BOSS ENEMIES
        this.updateNonBossOverheadBars(foxList, playerPos);
        this.updateFloatingDamageItems(dt);
    },

    spawnFloatingDamage(worldPos, amount = 25, isCritical = false) {
        if (typeof isPlayMode !== 'undefined' && !isPlayMode) return;
        if (!this.floatingContainer) this.init();
        if (!this.floatingContainer || !worldPos) return;

        const dmgVal = Math.max(1, Math.round(Number(amount) || 0));
        const el = document.createElement('div');
        el.className = 'floating-damage-text' + (isCritical ? ' critical' : '');
        el.innerText = '-' + dmgVal;
        this.floatingContainer.appendChild(el);

        const jitterX = (Math.random() - 0.5) * 0.24;
        const jitterZ = (Math.random() - 0.5) * 0.24;
        const startPos = new THREE.Vector3(
            (worldPos.x || 0) + jitterX,
            (worldPos.y || 0) + 0.08,
            (worldPos.z || 0) + jitterZ
        );

        this.floatingDamageItems.push({
            el,
            worldPos: startPos,
            vx: jitterX * 1.4,
            vy: isCritical ? 1.55 : 1.25,
            vz: jitterZ * 1.4,
            age: 0.0,
            maxLife: isCritical ? 0.98 : 0.85
        });
    },

    updateFloatingDamageItems(dt) {
        if (!this.floatingDamageItems || this.floatingDamageItems.length === 0) return;
        if (typeof camera === 'undefined' || !camera) return;

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const projVec = new THREE.Vector3();

        for (let i = this.floatingDamageItems.length - 1; i >= 0; i--) {
            const item = this.floatingDamageItems[i];
            item.age += dt;

            if (item.age >= item.maxLife) {
                if (item.el && item.el.parentNode) {
                    item.el.parentNode.removeChild(item.el);
                }
                this.floatingDamageItems.splice(i, 1);
                continue;
            }

            item.worldPos.x += item.vx * dt;
            item.worldPos.y += item.vy * dt;
            item.worldPos.z += item.vz * dt;
            item.vy = Math.max(0.35, item.vy - 1.15 * dt);

            projVec.copy(item.worldPos).project(camera);
            if (projVec.z >= 1.0) {
                item.el.style.display = 'none';
                continue;
            }

            item.el.style.display = 'block';
            const pxX = (projVec.x * 0.5 + 0.5) * screenW;
            const pxY = (-(projVec.y * 0.5) + 0.5) * screenH;

            const t = item.age / item.maxLife;
            let scale = 1.0;
            if (t < 0.14) {
                scale = 0.55 + (t / 0.14) * 0.72;
            } else if (t < 0.28) {
                scale = 1.27 - ((t - 0.14) / 0.14) * 0.27;
            }
            const opacity = t > 0.65 ? Math.max(0, 1.0 - (t - 0.65) / 0.35) : 1.0;

            item.el.style.opacity = opacity.toFixed(2);
            item.el.style.transform = `translate3d(${pxX.toFixed(1)}px, ${pxY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
        }
    },

    updateNonBossOverheadBars(foxList, playerPos) {
        if (!this.floatingContainer || typeof camera === 'undefined' || !camera) return;

        const activeIds = new Set();
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        for (let i = 0; i < foxList.length; i++) {
            const fox = foxList[i];
            if (!fox || !fox.root || !fox.root.visible) continue;
            if (fox.isBoss) continue; // Boss ditampilkan di bar tengah atas

            const curHp = (fox.ai && typeof fox.ai.health === 'number') ? fox.ai.health : (fox.health || 0);
            const maxHp = (fox.ai && typeof fox.ai.maxHealth === 'number') ? fox.ai.maxHealth : (fox.maxHealth || 100);

            if (curHp <= 0 || (fox.ai && fox.ai.isDead)) continue; // Tidak tampil jika musuh mati

            const enemyId = fox.id || ('fox_' + i);
            activeIds.add(enemyId);

            // Ambil posisi tepat di atas kepala musuh (mengikuti tulang Head + margin proporsional, atau fallback 1.24m)
            const scaleM = fox.scaleMultiplier || 1.0;
            const headPos = fox.root.position.clone();
            const headBone = (window.PandoraHitboxSystem && fox.model)
                ? window.PandoraHitboxSystem.resolveBone(fox.model, 'Head')
                : null;
            if (headBone) {
                headBone.updateWorldMatrix(true, false);
                headBone.getWorldPosition(headPos);
                headPos.y = Math.max(fox.root.position.y + 0.95 * scaleM, headPos.y + 0.36 * scaleM);
            } else {
                headPos.y += 1.32 * scaleM;
            }

            // Jarak ke kamera
            const distCam = camera.position.distanceTo(headPos);
            if (distCam > 36.0 || distCam < 0.5) {
                const el = this.overheadBarPool.get(enemyId);
                if (el) el.style.display = 'none';
                continue;
            }

            // Proyeksi ke layar kamera
            headPos.project(camera);

            // Cek apakah di depan kamera
            if (headPos.z >= 1.0) {
                const el = this.overheadBarPool.get(enemyId);
                if (el) el.style.display = 'none';
                continue;
            }

            const pxX = (headPos.x * 0.5 + 0.5) * screenW;
            const pxY = (-(headPos.y * 0.5) + 0.5) * screenH;

            let barEl = this.overheadBarPool.get(enemyId);
            if (!barEl) {
                barEl = document.createElement('div');
                barEl.className = 'enemy-overhead-bar';
                barEl.innerHTML = `
                    <div class="enemy-overhead-name">${fox.name || 'FoxTree'}</div>
                    <div class="enemy-overhead-track">
                        <div class="enemy-overhead-fill" style="width: 100%;"></div>
                    </div>
                `;
                this.floatingContainer.appendChild(barEl);
                this.overheadBarPool.set(enemyId, barEl);
            }

            barEl.style.display = 'flex';
            // Gunakan koordinat piksel bulat (integer) tanpa translate3d sub-pixel agar teks nama 100% tajam (HD) dan tidak blur
            barEl.style.left = `${Math.round(pxX)}px`;
            barEl.style.top = `${Math.round(pxY)}px`;
            barEl.style.transform = 'translate(-50%, -100%)';

            const nameEl = barEl.querySelector('.enemy-overhead-name');
            if (nameEl && nameEl.innerText !== (fox.name || 'FoxTree')) {
                nameEl.innerText = fox.name || 'FoxTree';
            }

            const fillEl = barEl.querySelector('.enemy-overhead-fill');
            if (fillEl) {
                const pct = Math.max(0, Math.min(100, (curHp / maxHp) * 100));
                fillEl.style.width = pct.toFixed(1) + '%';
            }

            // Visual feedback lock-on reticle untuk musuh yang sedang terkunci
            const isTargetLocked = !!(
                typeof window.currentCombatLockTarget !== 'undefined' &&
                window.currentCombatLockTarget &&
                (window.currentCombatLockTarget.root === fox.root || window.currentCombatLockTarget === fox)
            );
            barEl.classList.toggle('target-locked', isTargetLocked);
        }

        // Hapus elemen yang sudah tidak ada
        for (const [id, el] of this.overheadBarPool.entries()) {
            if (!activeIds.has(id)) {
                if (el.parentNode) el.parentNode.removeChild(el);
                this.overheadBarPool.delete(id);
            }
        }
    }
};

window.CombatHUD = CombatHUD;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CombatHUD.init());
} else {
    setTimeout(() => CombatHUD.init(), 100);
}
