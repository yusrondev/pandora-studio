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

        // Flash vignette merah
        const dmgVignette = document.getElementById('player-damage-vignette');
        if (dmgVignette) {
            dmgVignette.classList.add('active');
            setTimeout(() => {
                if (dmgVignette) dmgVignette.classList.remove('active');
            }, 300);
        }

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
const StaminaGauge = {
    el: null,
    fill: null,
    comet: null,
    tip: null,
    gradient: null,
    length: 0,
    lastPct: -1,

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

    update() {
        if (!this.el) this.build();
        const playing = typeof isPlayMode !== 'undefined' && isPlayMode && !PlayerHealthState.isDead;
        const ratio = Math.max(0, Math.min(1, FoxStaminaState.current / FoxStaminaState.max));
        const sprinting = typeof keys !== 'undefined' && keys.shift;
        this.el.classList.toggle('visible', !!(playing && (ratio < 0.995 || sprinting)));

        const pct = Math.round(ratio * 200) / 2;
        if (pct === this.lastPct) return;
        this.lastPct = pct;
        this.render(pct / 100);
        this.el.classList.toggle('critical', ratio <= 0.15);
    }
};

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
