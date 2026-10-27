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
            // Hentikan semua musuh dari menyerang / mengejar
            if (typeof FoxAIManager !== 'undefined' && FoxAIManager && Array.isArray(FoxAIManager.agents)) {
                FoxAIManager.agents.forEach(agent => {
                    if (agent) {
                        agent.targetSpeed = 0;
                        agent.currentSpeed = 0;
                        agent.isPunching = false;
                        if (agent.model && typeof agent.model.cancelPunch === 'function') {
                            agent.model.cancelPunch();
                        }
                        agent.state = 'IDLE';
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
    overheadBarPool: new Map(),

    init() {
        this.bossContainer = document.getElementById('boss-health-bar-container');
        this.bossNameLabel = document.getElementById('boss-name-text');
        this.bossFill = document.getElementById('boss-bar-fill');
        this.bossGhost = document.getElementById('boss-bar-ghost');
        this.playerHUD = document.getElementById('player-combat-hud');
        this.floatingContainer = document.getElementById('floating-hp-container');
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
            barEl.style.left = pxX + 'px';
            barEl.style.top = pxY + 'px';

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
