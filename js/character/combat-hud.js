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
        if (ghost) {
            setTimeout(() => {
                if (ghost) ghost.style.width = pct.toFixed(1) + '%';
            }, 260);
        }
    }
};
window.PlayerHealthState = PlayerHealthState;

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

        // 1. UPDATE PLAYER STAMINA BAR (KUNING / MERAH KRITIS <= 15%)
        if (typeof FoxStaminaState !== 'undefined') {
            const staminaFill = document.getElementById('player-stamina-bar-fill');
            if (staminaFill) {
                const sPct = Math.max(0, Math.min(100, (FoxStaminaState.current / FoxStaminaState.max) * 100));
                staminaFill.style.width = sPct.toFixed(1) + '%';
                const isCritical = (FoxStaminaState.current / FoxStaminaState.max) <= 0.15;
                staminaFill.classList.toggle('critical', isCritical);
            }
        }

        // 2. DETEKSI BOSS & UPDATE BAR BOSS TENGAH ATAS
        let nearbyBoss = null;
        let minBossDist = Infinity;

        const foxList = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList))
            ? spawnedFoxesList
            : [];

        for (let i = 0; i < foxList.length; i++) {
            const fox = foxList[i];
            if (!fox || !fox.root || !fox.root.visible) continue;
            if (!fox.isBoss) continue;

            const curHp = (fox.ai && typeof fox.ai.health === 'number') ? fox.ai.health : (fox.health || 0);
            if (curHp <= 0) continue; // Boss sudah kalah

            if (playerPos) {
                const dist = playerPos.distanceTo(fox.root.position);
                const radius = (fox.detectionRadius !== undefined) ? fox.detectionRadius : 18.0;

                // Cek apakah player berada di dalam radius area boss
                if (dist <= radius && dist < minBossDist) {
                    minBossDist = dist;
                    nearbyBoss = fox;
                }
            }
        }

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

            // Ambil posisi kepala (world Y + ~2.1m)
            const headPos = fox.root.position.clone();
            headPos.y += 2.05 * (fox.scaleMultiplier || 1.0);

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
            // GPU-accelerated transform: translate3d untuk pergerakan 100% mulus tanpa getar
            barEl.style.transform = `translate3d(${pxX.toFixed(1)}px, ${pxY.toFixed(1)}px, 0) translate(-50%, -100%)`;

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
