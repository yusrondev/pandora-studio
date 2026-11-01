/* =========================================================
   BACKFLIP SAAT MENGHADAPI BOS
   Di dalam radius bos, tombol S / analog ke bawah melompat mundur menjauhi bos,
   bukan berbalik dan berlari. Selama menahan arah mundur, backflip diulang.
   ========================================================= */
const BACKFLIP_FILE = 'hero/red-mature/backflip.fbx';
// Kecepatan dan jarak diatur per karakter di Hitbox Studio (animasi Backflip)
const BACKFLIP_DEFAULT_DISTANCE = 3.4;
const BACKFLIP_INPUT = 0.55;
const BACKFLIP_POSE_ANGLE = 0.3;     // Radian dari pose awal: penanda salto sudah mulai
const BACKFLIP_LEAD_IN = 0.08;       // Detik klip sebelum dan sesudah salto, agar masuknya tidak patah
const BACKFLIP_TURN_RATE = 25;

const PandoraBackflip = {
    clip: null,
    loading: null,
    seconds: 1,
    travel: BACKFLIP_DEFAULT_DISTANCE,
    active: false,
    time: 0,
    holding: false,      // Arah mundur masih ditahan sejak backflip terakhir
    direction: new THREE.Vector3(),

    load() {
        if (!this.loading) {
            this.loading = PandoraAssetCache.loadFBX(BACKFLIP_FILE).then((object) => {
                const source = object.animations[0] || null;
                if (source) this.clip = this.trimToFlip(source);
            }).catch((err) => {
                console.warn('[Backflip] Animasi gagal dimuat:', err);
            });
        }
        return this.loading;
    },

    // Klip aslinya punya jeda panjang; yang dipakai hanya bagian saat pinggul benar-benar berputar
    trimToFlip(clip) {
        const track = clip.tracks.find(t => /hips\.quaternion/i.test(t.name));
        if (!track) return clip;
        const first = new THREE.Quaternion().fromArray(track.values, 0);
        const current = new THREE.Quaternion();
        let start = -1;
        let end = -1;
        for (let i = 0; i < track.times.length; i++) {
            current.fromArray(track.values, i * 4);
            if (first.angleTo(current) > BACKFLIP_POSE_ANGLE) {
                if (start < 0) start = track.times[i];
                end = track.times[i];
            }
        }
        if (start < 0) return clip;
        const fps = 60;
        return THREE.AnimationUtils.subclip(
            clip, 'backflip',
            Math.floor(Math.max(0, start - BACKFLIP_LEAD_IN) * fps),
            Math.ceil(Math.min(clip.duration, end + BACKFLIP_LEAD_IN) * fps),
            fps
        );
    },

    config(character) {
        const charKey = character.speciesKey || character.charKey || 'hero';
        return window.PandoraHitboxSystem ? PandoraHitboxSystem.getAnimationConfig(charKey, 'backflip') : null;
    },

    speed(character) {
        const config = this.config(character);
        return config && config.speed > 0 ? config.speed : 1;
    },

    distance(character) {
        const config = this.config(character);
        return config && config.distance >= 0 ? config.distance : BACKFLIP_DEFAULT_DISTANCE;
    },

    // Satu aksi per karakter, dipakai permainan dan pratinjau Hitbox Studio
    getAction(character) {
        if (!character.actions.backflip) {
            const target = character.modelMesh || character.meshContainer || character.root;
            character.actions.backflip = character.mixer.clipAction(sanitizeAnimationClipForModel(this.clip, target));
        }
        return character.actions.backflip;
    },

    isBackInput(inputX, inputY) {
        return inputY <= -BACKFLIP_INPUT && Math.abs(inputX) <= Math.abs(inputY);
    },

    canStart(character, boss, grounded) {
        if (this.active || !this.clip || !boss || !boss.root || !grounded) return false;
        // Backflip sebelumnya yang masih memudar boleh langsung diulang, supaya tidak ada celah untuk berbalik
        const otherPose = character.castAction && character.castAction !== character.actions.backflip;
        if (!character.mixer || otherPose || window.PandoraUltimateCasting) return false;
        return !(character.isKicking || character.isPunching || character.isTakingHit || character.isBlocking || character.isJumping);
    },

    faceBoss(character, dt) {
        const root = character.root;
        const facing = Math.atan2(-this.direction.x, -this.direction.z);
        let turn = (facing - root.rotation.y) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        root.rotation.y += turn * Math.min(1, BACKFLIP_TURN_RATE * dt);
    },

    start(character, boss) {
        const action = this.getAction(character);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        const speed = this.speed(character);
        action.timeScale = speed;
        action.play();
        this.seconds = this.clip.duration / speed;
        this.travel = this.distance(character);
        character.castAction = action;
        character.castTarget = 1;
        character.isBackflipping = true;
        this.active = true;
        this.time = 0;
        this.direction.subVectors(character.root.position, boss.root.position).setY(0);
        if (this.direction.lengthSq() < 0.001) this.direction.set(-Math.sin(character.root.rotation.y), 0, -Math.cos(character.root.rotation.y));
        this.direction.normalize();
    },

    stop(character) {
        this.holding = false;
        if (!this.active) return;
        this.active = false;
        if (character) {
            character.isBackflipping = false;
            character.castTarget = 0;
        }
    },

    // Dipanggil tiap frame dari fisika pemain; menghasilkan pergeseran frame ini
    update(dt, character, boss, inputX, inputY, grounded) {
        if (!this.clip) {
            this.load();
            return null;
        }
        const backHeld = this.isBackInput(inputX, inputY);
        if (!backHeld) this.holding = false;
        if (backHeld && this.canStart(character, boss, grounded)) this.start(character, boss);
        if (!this.active) {
            // Setelah keluar dari radius bos, tahan posisi sampai arah mundur dilepas; tidak langsung berbalik lari
            if (!this.holding) return null;
            this.faceBoss(character, dt);
            return 0;
        }
        this.holding = true;

        const before = THREE.MathUtils.smootherstep(this.time, 0, this.seconds);
        this.time += dt;
        const after = THREE.MathUtils.smootherstep(this.time, 0, this.seconds);

        // Tetap menghadap ke bos selama melompat mundur
        this.faceBoss(character, dt);

        if (this.time >= this.seconds) {
            this.stop(character);
            this.holding = backHeld;
        }
        return (after - before) * this.travel;
    }
};
window.PandoraBackflip = PandoraBackflip;
