/* ===================================================================
   FOX CHARACTER STATS & STAMINA SYSTEM CONFIGURATION
   ===================================================================
   File ini dirancang khusus untuk mempermudah pengaturan dan balance
   karakter rubah (speed, ketangkasan belok, lompatan, dan stamina).

   Untuk mengubah atau menambah stats, cukup sesuaikan nilai pada
   objek FOX_STATS_CONFIG di bawah ini.
   =================================================================== */

const FOX_STATS_CONFIG = {
    // 1. RED FOX - All-Rounder (Seimbang & Adaptif)
    red: {
        id: 'red',
        name: 'Red Fox',
        species: 'Vulpes vulpes',
        badge: '🦊',
        tagline: 'Seimbang & Adaptif',

        // --- SPEED & MOBILITY ---
        walkSpeed: 1.65,            // Kecepatan jalan santai dan tenang (m/s)
        runSpeed: 6.5,              // Kecepatan lari sprint teratur (m/s)
        reverseSpeed: 1.2,          // Kecepatan mundur tenang (m/s)

        // --- TURNING AGILITY (KETANGKASAN WAKTU BELOK) ---
        turnRate: 2.6,              // Kecepatan belok maksimum (rad/s)
        turnAccel: 8.5,             // Responsivitas / kelincahan rotasi (lerp speed)

        // --- JUMP (LOMPATAN) ---
        jumpPower: 5.2,             // Kekuatan awal loncatan vertikal (proporsional)

        // --- STAMINA SYSTEM ---
        maxStamina: 100,            // Total kapasitas stamina
        staminaDrain: 7.5,          // Pengurangan stamina hemat & tahan lama saat lari (sprint)
        staminaRecoveryWalk: 3.5,   // Penambahan stamina per detik saat jalan pelan
        staminaRecoveryIdle: 8.5,   // Penambahan stamina per detik saat diam (idle)
        exhaustionThreshold: 20,    // Stamina minimum untuk bisa lari kembali setelah lelah
    },

    // 2. ARCTIC FOX - High Endurance (Daya Tahan Ekstrem & Stamina Besar)
    arctic: {
        id: 'arctic',
        name: 'Arctic Fox',
        species: 'Vulpes lagopus',
        badge: '❄️',
        tagline: 'Daya Tahan Tinggi & Stamina Terbesar',

        // --- SPEED & MOBILITY ---
        walkSpeed: 1.55,
        runSpeed: 6.2,
        reverseSpeed: 1.2,

        // --- TURNING AGILITY ---
        turnRate: 2.3,
        turnAccel: 7.5,

        // --- JUMP ---
        jumpPower: 5.0,

        // --- STAMINA SYSTEM ---
        maxStamina: 145,            // Stamina paling melimpah (tahan lari jauh di salju)
        staminaDrain: 5.5,          // Konsumsi stamina sangat hemat (~26 detik sprint penuh)
        staminaRecoveryWalk: 4.2,   // Pemulihan santai saat jalan
        staminaRecoveryIdle: 9.5,   // Pemulihan bertahap saat diam
        exhaustionThreshold: 25,
    },

    // 3. CORSAC FOX - Acrobatic & High Jumper (Lompatan Tertinggi & Lincah)
    corsac: {
        id: 'corsac',
        name: 'Corsac Fox',
        species: 'Vulpes corsac',
        badge: '🌾',
        tagline: 'Lompatan Ekstrem & Manuver Lincah',

        // --- SPEED & MOBILITY ---
        walkSpeed: 1.70,
        runSpeed: 6.8,
        reverseSpeed: 1.3,

        // --- TURNING AGILITY ---
        turnRate: 3.2,              // Sangat tangkas berbelok di savana/gurun
        turnAccel: 10.5,            // Transisi arah sangat tajam

        // --- JUMP ---
        jumpPower: 5.6,

        // --- STAMINA SYSTEM ---
        maxStamina: 90,             // Kapasitas sedang
        staminaDrain: 8.5,          // Pengurangan hemat saat lari
        staminaRecoveryWalk: 3.8,
        staminaRecoveryIdle: 8.5,
        exhaustionThreshold: 20,
    },

    // 4. SWIFT FOX - Lightning Speed (Paling Cepat & Belok Kilat)
    swift: {
        id: 'swift',
        name: 'Swift Fox',
        species: 'Vulpes velox',
        badge: '⚡',
        tagline: 'Kecepatan Kilat & Belok Tajam',

        // --- SPEED & MOBILITY ---
        walkSpeed: 1.85,            // Jalan relatif gesit
        runSpeed: 7.4,              // Sprint super cepat
        reverseSpeed: 1.4,

        // --- TURNING AGILITY ---
        turnRate: 3.6,              // Belok paling tajam & responsif
        turnAccel: 12.0,            // Akselerasi belok instan

        // --- JUMP ---
        jumpPower: 5.4,

        // --- STAMINA SYSTEM ---
        maxStamina: 80,             // Stamina lari kilat
        staminaDrain: 10.5,         // Konsumsi terkontrol untuk kecepatan tinggi
        staminaRecoveryWalk: 4.0,
        staminaRecoveryIdle: 9.0,
        exhaustionThreshold: 18,
    },

    // 5. DARWIN FOX - Heavyweight & Steadfast (Kokoh, Stabil & Kuat)
    darwin: {
        id: 'darwin',
        name: 'Darwin Fox',
        species: 'Lycalopex fulvipes',
        badge: '🌲',
        tagline: 'Langkah Kokoh, Berat & Lompat Bertenaga',

        // --- SPEED & MOBILITY ---
        walkSpeed: 1.50,
        runSpeed: 6.0,
        reverseSpeed: 1.1,

        // --- TURNING AGILITY ---
        turnRate: 2.4,
        turnAccel: 8.0,

        // --- JUMP ---
        jumpPower: 10.5,            // Lompatan kokoh bertenaga menembus ranting hutan

        // --- STAMINA SYSTEM ---
        maxStamina: 120,            // Kapasitas stamina besar dan stabil
        staminaDrain: 6.5,          // Pengurangan sangat seimbang & awet
        staminaRecoveryWalk: 3.5,
        staminaRecoveryIdle: 8.0,
        exhaustionThreshold: 20,
    },

    // 6. ENEMY FOXTREE - Melee Combat Enemy (Langkah Rasional & Teratur)
    foxtree: {
        id: 'foxtree',
        name: 'FoxTree Enemy',
        species: 'Enemy FoxTree',
        badge: '⚔️',
        tagline: 'Langkah Tegap Rasional & Melee Punch Combat',

        // --- SPEED & MOBILITY (SINKRON DENGAN LANGKAH KAKI PLAYER RED FOX) ---
        walkSpeed: 1.65,            // Kecepatan jalan santai dan rasional (m/s)
        runSpeed: 4.8,              // Kecepatan lari sprint teratur mengejar pemain (m/s)
        reverseSpeed: 1.2,

        // --- TURNING AGILITY ---
        turnRate: 2.8,
        turnAccel: 8.5,

        // --- JUMP ---
        jumpPower: 5.2,

        // --- STAMINA SYSTEM ---
        maxStamina: 100,
        staminaDrain: 7.5,
        staminaRecoveryWalk: 7.0,
        staminaRecoveryIdle: 16.0,
        exhaustionThreshold: 20
    }
};

// --- RUNTIME STAMINA STATE ---
const FoxStaminaState = {
    current: 100,
    max: 100,
    isExhausted: false,
    activeSpeciesKey: 'red',

    /**
     * Inisialisasi ulang stamina saat switch spesies atau mulai play mode
     */
    reset(speciesKey) {
        const key = speciesKey || currentFoxSpeciesKey || 'red';
        const cfg = FOX_STATS_CONFIG[key] || FOX_STATS_CONFIG.red;
        this.activeSpeciesKey = key;
        this.max = cfg.maxStamina;
        this.current = cfg.maxStamina;
        this.isExhausted = false;
        this.updateHUD();
    },

    /**
     * Cek apakah stamina mencukupi untuk melakukan aksi (harus > 15% kapasitas maksimal)
     */
    canPerformAction() {
        return (this.current / this.max) > 0.15;
    },

    /**
     * Hitung perubahan stamina setiap frame
     * @param {number} dt Delta time dalam detik
     * @param {boolean} isSprintRequested Apakah tombol Shift sedang ditekan
     * @param {boolean} isMovingForward Apakah karakter sedang bergerak maju
     * @returns {boolean} Apakah karakter benar-benar boleh lari (tidak lelah dan > 15%)
     */
    update(dt, isSprintRequested, isMovingForward) {
        const cfg = FOX_STATS_CONFIG[this.activeSpeciesKey] || FOX_STATS_CONFIG.red;
        this.max = cfg.maxStamina;

        // Jika karakter sedang bertahan (Shield / Block):
        // Stamina TIDAK BERKURANG jika tidak menerima hit ("tidak berkurang jika tidak menerima hit"),
        // dan stamina tidak bertambah agar posisi bertahan stabil.
        const isPlayerBlocking = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isBlocking);
        if (isPlayerBlocking) {
            this.updateHUD();
            return false;
        }

        let canSprint = false;

        // Cek jika sedang lelah
        if (this.isExhausted) {
            // Pulihkan sampai melewati threshold baru bisa sprint lagi
            if (this.current >= cfg.exhaustionThreshold) {
                this.isExhausted = false;
            }
        }

        // Syarat sprint: stamina harus lebih dari 15% kapasitas maksimal
        const hasEnoughSprintStamina = (this.current / this.max) > 0.15;

        if (isSprintRequested && isMovingForward && !this.isExhausted && hasEnoughSprintStamina && this.current > 0) {
            // SEDANG LARI (SPRINT / HUNTING) -> STAMINA BERKURANG
            canSprint = true;
            this.current = Math.max(0, this.current - cfg.staminaDrain * dt);

            // Jika stamina turun menyentuh atau di bawah 15%, hentikan sprint seketika
            if ((this.current / this.max) <= 0.15) {
                canSprint = false;
            }

            if (this.current <= 0) {
                this.current = 0;
                this.isExhausted = true;
                canSprint = false;
                // Mainkan suara napas lelah jika soundFX tersedia
                if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playLand) {
                    foxSoundFX.playLand();
                }
            }
        } else if (isMovingForward) {
            // JALAN PELAN (KEYS.W TANPA SPRINT) -> STAMINA BERTAMBAH PERLAHAN
            this.current = Math.min(this.max, this.current + cfg.staminaRecoveryWalk * dt);
        } else {
            // DIAM (IDLE) ATAU BELOK DI TEMPAT -> STAMINA BERTAMBAH LEBIH CEPAT
            // Istirahat dalam posisi tiarap/mengendap (prone) memulihkan stamina ekstra cepat (+60%)
            const proneMultiplier = (typeof foxProneBlend !== 'undefined' && foxProneBlend > 0.35) ? 1.6 : 1.0;
            this.current = Math.min(this.max, this.current + cfg.staminaRecoveryIdle * proneMultiplier * dt);
        }

        this.updateHUD();
        return canSprint;
    },

    /**
     * Kurangi stamina saat aksi tempur seperti punch, kick, dll
     * @param {number} amount Jumlah stamina yang dikonsumsi
     */
    consume(amount = 10) {
        if (amount <= 0) return;
        this.current = Math.max(0, this.current - amount);
        if (this.current <= 0) {
            this.current = 0;
            this.isExhausted = true;
        }
        this.updateHUD();
    },

    /**
     * Update visual indikator stamina di HUD
     */
    updateHUD() {
        const barFill = document.getElementById('fox-stamina-bar-fill');
        const valText = document.getElementById('fox-stamina-val-text');
        const stateBadge = document.getElementById('fox-stamina-state-badge');
        const container = document.getElementById('fox-stamina-container');

        if (!barFill) return;

        const pct = Math.max(0, Math.min(100, (this.current / this.max) * 100));
        barFill.style.width = pct.toFixed(1) + '%';

        const isCritical = (this.current / this.max) <= 0.15;
        barFill.classList.toggle('critical', isCritical);

        if (valText) {
            valText.innerText = Math.round(this.current) + ' / ' + this.max;
        }

        if (this.isExhausted || isCritical) {
            barFill.classList.add('exhausted');
            if (stateBadge) {
                stateBadge.innerText = isCritical ? 'KRITIS (<=15%)' : 'LELAH (PULIHKAN)';
                stateBadge.className = 'fox-stamina-state exhausted';
            }
        } else {
            barFill.classList.remove('exhausted');
            if (stateBadge) {
                if (pct < 30) {
                    stateBadge.innerText = 'HAMPIR HABIS';
                    stateBadge.className = 'fox-stamina-state warning';
                } else if (pct >= 99) {
                    stateBadge.innerText = 'PENUH';
                    stateBadge.className = 'fox-stamina-state full';
                } else {
                    stateBadge.innerText = 'TERSEDIA';
                    stateBadge.className = 'fox-stamina-state normal';
                }
            }
        }
    }
};

/**
 * Mendapatkan konfigurasi stats untuk spesies saat ini
 */
function getCurrentFoxStats() {
    const key = (typeof currentFoxSpeciesKey !== 'undefined' && currentFoxSpeciesKey) ? currentFoxSpeciesKey : 'red';
    return FOX_STATS_CONFIG[key] || FOX_STATS_CONFIG.red;
}

/**
 * Memperbarui tampilan info card stats & stamina di HUD Demo Mode
 */
function updateFoxStatsDisplay(speciesKey) {
    const key = speciesKey || (typeof currentFoxSpeciesKey !== 'undefined' ? currentFoxSpeciesKey : 'red');
    const cfg = FOX_STATS_CONFIG[key] || FOX_STATS_CONFIG.red;

    const elBadge = document.getElementById('fox-stats-hud-badge');
    const elName = document.getElementById('fox-stats-hud-name');
    const elTagline = document.getElementById('fox-stats-hud-tagline');

    const elSpeed = document.getElementById('stat-val-speed');
    const elAgility = document.getElementById('stat-val-agility');
    const elJump = document.getElementById('stat-val-jump');
    const elStamina = document.getElementById('stat-val-stamina');

    if (elBadge) elBadge.innerText = cfg.badge;
    if (elName) elName.innerText = cfg.name;
    if (elTagline) elTagline.innerText = cfg.tagline;

    if (elSpeed) elSpeed.innerText = cfg.runSpeed.toFixed(1) + ' m/s';
    if (elAgility) elAgility.innerText = cfg.turnRate.toFixed(1) + ' rad/s';
    if (elJump) elJump.innerText = cfg.jumpPower.toFixed(1);
    if (elStamina) elStamina.innerText = cfg.maxStamina;

    // Reset stamina state to match new species capacity
    FoxStaminaState.reset(key);
}

