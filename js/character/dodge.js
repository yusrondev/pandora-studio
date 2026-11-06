/* =========================================================
   DODGE (tombol O di layar sentuh / Q di keyboard)
   hero/general/dodge.fbx: guling ke depan, mulai dan berakhir di kuda-kuda bertarung.
   Pinggul maju lurus di sumbu +Z klip (root motion), tanpa geser ke samping.

   - Arah mengikuti analog / WASD relatif kamera; tanpa input = guling ke arah hadap karakter.
   - Karakter langsung berputar menghadap arah guling; kamera tidak ikut berputar.
   - Langkah maju pinggul dipindah ke root dunia, jadi posisi akhir animasi = posisi akhir pemain
     (tidak ada snapback saat klip selesai).
   - Tidak bisa diinterupsi: serangan, block, lompat, L1, dan reaksi terkena pukulan menunggu sampai selesai.
     Selama berguling pemain kebal damage (i-frame).
   ========================================================= */
const DODGE_FILE = 'hero/general/dodge.fbx';
const DODGE_INPUT_DEADZONE = 0.2;   // Di bawah ini analog dianggap netral -> guling ke depan
const DODGE_TURN_TIME = 0.06;       // Detik untuk berputar ke arah guling
const DODGE_BLEND_OUT = 0.16;       // Detik terakhir klip berbaur kembali ke idle/locomotion
const DODGE_COOLDOWN = 0.12;        // Jeda singkat setelah selesai supaya tidak tersambung tanpa sengaja
const DODGE_DEFAULT_SPEED = 1.15;   // Klip asli 1.63 dtk terasa lambat untuk menghindar
const DODGE_STAMINA_COST = 10;      // Lebih murah dari pukulan (12) supaya bisa sering menghindar; tetap tidak gratis

const PandoraDodge = {
    clip: null,          // Klip dengan X/Z pinggul dikunci ke frame pertama
    motion: null,        // { times, z, total } langkah maju pinggul dalam satuan klip
    loading: null,
    active: false,
    time: 0,             // Waktu klip yang sudah dijalankan (detik klip, bukan detik dunia)
    traveled: 0,         // Jarak klip (satuan klip) yang sudah dipindah ke root dunia
    speed: DODGE_DEFAULT_SPEED,
    cooldown: 0,
    direction: new THREE.Vector3(0, 0, 1),
    facing: 0,
    pending: false,      // Tombol ditekan; dieksekusi di frame fisika berikutnya

    load() {
        if (!this.loading) {
            this.loading = PandoraAssetCache.loadFBX(DODGE_FILE).then((object) => {
                const source = object && object.animations && object.animations[0];
                if (source) this.prepareClip(source);
            }).catch((err) => {
                console.warn('[Dodge] Animasi gagal dimuat:', err);
            });
        }
        return this.loading;
    },

    // Root motion: Z pinggul dipisah dari klip, X/Z dikunci ke frame pertama. Y tetap (badan merunduk saat guling).
    prepareClip(source) {
        const clip = source.clone();
        clip.name = 'dodge';
        const hips = clip.tracks.find(t => /hips\.position$/i.test(t.name));
        let motion = null;
        if (hips && hips.times.length > 1) {
            const v = hips.values;
            const originX = v[0];
            const originZ = v[2];
            const z = new Float32Array(hips.times.length);
            for (let i = 0; i < hips.times.length; i++) {
                z[i] = v[i * 3 + 2] - originZ;
                v[i * 3] = originX;
                v[i * 3 + 2] = originZ;
            }
            motion = { times: Float32Array.from(hips.times), z, total: z[z.length - 1] };
        }
        this.clip = clip;
        this.motion = motion;
    },

    sampleZ(t) {
        const m = this.motion;
        if (!m) return 0;
        const { times, z } = m;
        if (t <= times[0]) return 0;
        if (t >= times[times.length - 1]) return m.total;
        let i = 0;
        while (i < times.length - 2 && times[i + 1] < t) i++;
        const a = (t - times[i]) / (times[i + 1] - times[i]);
        return z[i] + a * (z[i + 1] - z[i]);
    },

    config(character) {
        const charKey = character.speciesKey || character.charKey || 'hero';
        return window.PandoraHitboxSystem && PandoraHitboxSystem.getAnimationConfig
            ? PandoraHitboxSystem.getAnimationConfig(charKey, 'dodge')
            : null;
    },

    getAction(character) {
        if (!character.actions.dodge) {
            const target = character.modelMesh || character.meshContainer || character.root;
            character.actions.dodge = character.mixer.clipAction(sanitizeAnimationClipForModel(this.clip, target));
        }
        return character.actions.dodge;
    },

    isBusy(character) {
        return this.active || !!(character && character.isDodging);
    },

    // Dipanggil tombol O / Q. Hanya mencatat permintaan; arah dibaca di frame fisika supaya sama persis
    // dengan analog yang sedang ditekan.
    request() {
        if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
        if (!this.clip) {
            this.load();
            return;
        }
        if (this.active) return; // Harus menunggu guling selesai
        this.pending = true;
    },

    canStart(character, grounded) {
        if (!character || !character.root || !character.mixer || !this.clip) return false;
        if (this.active || this.cooldown > 0 || !grounded) return false;
        // Animasi kena hit tidak menghalangi: dodge memotongnya (lihat cancelHitReaction)
        if (character.isDead || character.isJumping) return false;
        if (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) return false;
        if (window.PandoraUltimateCasting || window.PandoraGamePaused) return false;
        if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return false;
        if (window.PandoraBackflip && PandoraBackflip.active) return false;
        // Sama seperti serangan: stamina harus di atas 15% (Rage Mode bebas stamina)
        if (typeof FoxStaminaState !== 'undefined' && !FoxStaminaState.canPerformAction()) return false;
        // Pose lain yang sedang menimpa (jutsu, rage) tidak boleh dipotong
        return !(character.castAction && character.castAction !== character.actions.dodge && character.castTarget);
    },

    // moveDir: arah analog relatif kamera di bidang XZ (sudah dinormalisasi) atau null bila netral
    start(character, moveDir) {
        // Dodge membatalkan serangan darat dan block yang sedang berjalan
        if (character.isPunching && typeof character.cancelPunch === 'function') character.cancelPunch();
        if (character.isKicking && typeof character.cancelKick === 'function') character.cancelKick();
        if (character.isBlocking && typeof character.stopBlock === 'function') character.stopBlock();
        if (character.isTakingHit) this.cancelHitReaction(character);

        if (moveDir) {
            this.direction.copy(moveDir);
        } else {
            // Tanpa analog: guling ke depan, searah hadap karakter
            const yaw = character.root.rotation.y;
            this.direction.set(Math.sin(yaw), 0, Math.cos(yaw));
        }
        this.direction.setY(0).normalize();
        this.facing = Math.atan2(this.direction.x, this.direction.z);

        const config = this.config(character);
        this.speed = config && config.speed > 0 ? config.speed : DODGE_DEFAULT_SPEED;

        const action = this.getAction(character);
        action.reset();
        if (typeof action.stopFading === 'function') action.stopFading();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = this.speed;
        action.enabled = true;
        action.play();

        // Masuk sangat cepat: pose guling langsung terbaca, tidak "melayang" dari idle
        character.castAction = action;
        character.castTarget = 1;
        character.castWeight = Math.max(character.castWeight || 0, 0.6);
        character.isDodging = true;
        character.idleTimer = 0;
        character.activeIdleKey = null;
        character.idleCycleTimer = 0;

        this.active = true;
        this.time = 0;
        this.traveled = 0;
        this.pending = false;
        if (typeof FoxStaminaState !== 'undefined') FoxStaminaState.consume(DODGE_STAMINA_COST);

        if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playFootstep) foxSoundFX.playFootstep();
    },

    // Pose kena hit dilepas seketika supaya guling langsung terbaca, bukan berbaur dengan sentakan
    cancelHitReaction(character) {
        character.isTakingHit = false;
        character.activeHitKey = null;
        character.hitTimer = 0;
        ['hit1', 'hit2'].forEach((key) => {
            if (character.targetWeights) character.targetWeights[key] = 0;
            if (character.currentWeights) character.currentWeights[key] = 0;
            const action = character.actions && character.actions[key];
            if (action) action.setEffectiveWeight(0);
        });
    },

    finish(character) {
        this.active = false;
        this.cooldown = DODGE_COOLDOWN;
        if (character) {
            character.isDodging = false;
            if (character.castAction === character.actions.dodge) character.castTarget = 0;
        }
    },

    // Reset total (Play Mode mulai/berhenti, bangkit, pindah stage)
    stop(character) {
        this.pending = false;
        this.cooldown = 0;
        if (!this.active && !(character && character.isDodging)) return;
        this.active = false;
        if (character) {
            character.isDodging = false;
            if (character.castAction && character.castAction === character.actions.dodge) {
                character.castTarget = 0;
                character.castWeight = 0;
                character.castAction.stop();
                character.castAction = null;
            }
        }
    },

    turn(character, dt) {
        const root = character.root;
        let diff = (this.facing - root.rotation.y) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        root.rotation.y += diff * Math.min(1, dt / DODGE_TURN_TIME);
    },

    // Dipanggil tiap frame dari fisika pemain. Mengembalikan jarak dunia frame ini (searah this.direction),
    // atau null bila tidak sedang dodge.
    update(dt, character, moveDir, grounded) {
        if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
        if (!this.clip) {
            if (this.pending) this.load();
            return null;
        }
        if (this.pending && !this.active) {
            if (this.canStart(character, grounded)) this.start(character, moveDir);
            else if (this.cooldown <= 0) this.pending = false; // Tidak bisa sekarang: tidak disimpan untuk nanti
        }
        if (!this.active) return null;
        if (!character || !character.root || character.isDead) {
            this.stop(character);
            return null;
        }

        this.turn(character, dt);

        const duration = this.clip.duration;
        this.time = Math.min(duration, this.time + dt * this.speed);
        const reached = this.sampleZ(this.time);
        const step = (reached - this.traveled) * (character.baseScale || 1.85);
        this.traveled = reached;

        // Bagian akhir berbaur ke idle sambil root motion tetap dituntaskan sampai frame terakhir
        if (character.castAction === character.actions.dodge && this.time >= duration - DODGE_BLEND_OUT * this.speed) {
            character.castTarget = 0;
        }
        if (this.time >= duration) this.finish(character);
        return step;
    }
};
window.PandoraDodge = PandoraDodge;
