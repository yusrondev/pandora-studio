/* ===================================================================
   HERO 3D CHARACTER MODEL & ANIMATION MANAGER (hero/red/*)
   Features:
   - Mixamo-rigged FBX Skinned Mesh
   - 100% Matte Texture (MeshLambertMaterial with shadow support & ambient detail lift)
   - Three.js SkeletonUtils cloning for multi-instance support
   - AnimationMixer integration for 6 distinct cycles:
     * idle: Stand / Idle breathing (triggered after 4s idle)
     * idle2: Alternate expressive idle (randomly picked with idle after 4s idle)
     * walk: Synchronized footstep stride (calm, unhurried pace)
     * run: Athletic sprint stride
     * jump: Backflip acrobatic salto (Backflip.fbx)
     * jumpRun: Running jump in full stride (Jump-withrun.fbx)
   - Proportional scale (~1.81m height) matching Pandora Studio world
   - Ground alignment (feet aligned to y = 0)
   =================================================================== */

function getHeroBasePath() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('fox-model.js')) {
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/red/');
            }
        }
    }
    return 'hero/red/';
}

const HERO_CHARACTER_CONFIG = {
    getPath() {
        return getHeroBasePath();
    },
    files: {
        idle: 'idle.fbx',
        idle2: 'idle2.fbx',
        idle3: 'idle3.fbx',
        walk: 'walk.fbx',
        run: 'run.fbx',
        jump: 'Jump-withrun.fbx',
        jumpRun: 'Jump-withrun.fbx',
        jumpNormal: 'jump-normal.fbx',
        kick1: 'combat/kick/kick1.fbx',
        kick2: 'combat/kick/kick2.fbx',
        kick3: 'combat/kick/kick3.fbx',
        punch1: 'combat/punch/punch1.fbx',
        punch2: 'combat/punch/punch2.fbx',
        punch3: 'combat/punch/punch3.fbx'
    },
    baseScale: 1.85, // Ukuran proporsional pahlawan (~1.81m), gagah dan seimbang dengan dunia Pandora
    yOffset: 0.0,    // Kaki menapak tanah secara natural di y = 0
    facingDirection: new THREE.Vector3(0, 0, 1) // Karakter menghadap +Z
};

// Global Asset Cache for Hero Character
window.HeroAssetManager = {
    isLoaded: false,
    isLoading: false,
    loadPromise: null,
    baseModel: null,
    clips: {
        idle: null,
        idle2: null,
        idle3: null,
        walk: null,
        run: null,
        jump: null,
        jumpRun: null,
        jumpNormal: null,
        kick1: null,
        kick2: null,
        kick3: null,
        punch1: null,
        punch2: null,
        punch3: null
    },
    instancesPending: [],
    kick3RootMotion: null,

    sampleKick3Z(t) {
        if (!this.kick3RootMotion) return 0;
        const { times, z, totalZ } = this.kick3RootMotion;
        if (t <= times[0]) return 0;
        if (t >= times[times.length - 1]) return totalZ;
        let i = 0;
        while (i < times.length - 1 && times[i + 1] < t) i++;
        const alpha = (t - times[i]) / (times[i + 1] - times[i]);
        return z[i] + alpha * (z[i + 1] - z[i]);
    },

    load() {
        if (this.loadPromise) return this.loadPromise;
        this.isLoading = true;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                if (typeof THREE.FBXLoader === 'undefined') {
                    throw new Error('THREE.FBXLoader is not available. Please include FBXLoader.js and fflate.min.js.');
                }

                const loader = new THREE.FBXLoader();
                const loadFBX = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

                const basePath = HERO_CHARACTER_CONFIG.getPath();
                const files = HERO_CHARACTER_CONFIG.files;

                console.log('[HeroAssetManager] Loading hero FBX assets from', basePath);

                // 1. Load Idle (Base Model + Rig + Primary Idle Animation)
                const idleObj = await loadFBX(basePath + files.idle);
                
                // Configure meshes, shadows, and 100% matte materials (folds/details clearly visible)
                idleObj.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            const makeMatte = (m) => {
                                const newMat = new THREE.MeshLambertMaterial({
                                    map: m.map || null,
                                    color: m.color ? m.color : new THREE.Color(0xffffff),
                                    emissive: new THREE.Color(0x222222), // Soft ambient lift so black suit folds and belt are clearly visible
                                    skinning: true
                                });
                                if (newMat.map) {
                                    newMat.map.encoding = THREE.LinearEncoding;
                                }
                                return newMat;
                            };
                            if (Array.isArray(child.material)) {
                                child.material = child.material.map(makeMatte);
                            } else {
                                child.material = makeMatte(child.material);
                            }
                        }
                    }
                });

                this.baseModel = idleObj;
                if (idleObj.animations && idleObj.animations.length > 0) {
                    const idleClip = idleObj.animations[0].clone();
                    idleClip.name = 'idle';
                    this.clips.idle = idleClip;
                }

                // 2. Load Secondary Idle Animation Clip (idle2.fbx)
                try {
                    const idle2Obj = await loadFBX(basePath + files.idle2);
                    if (idle2Obj.animations && idle2Obj.animations.length > 0) {
                        const idle2Clip = idle2Obj.animations[0].clone();
                        idle2Clip.name = 'idle2';
                        this.clips.idle2 = idle2Clip;
                    }
                } catch (i2Err) {
                    console.warn('[HeroAssetManager] Could not load idle2.fbx:', i2Err);
                }

                // 3. Load Tertiary Idle Animation Clip (idle3.fbx)
                try {
                    const idle3Obj = await loadFBX(basePath + files.idle3);
                    if (idle3Obj.animations && idle3Obj.animations.length > 0) {
                        const idle3Clip = idle3Obj.animations[0].clone();
                        idle3Clip.name = 'idle3';
                        this.clips.idle3 = idle3Clip;
                    }
                } catch (i3Err) {
                    console.warn('[HeroAssetManager] Could not load idle3.fbx:', i3Err);
                }

                // 3. Load Walk Animation Clip
                const walkObj = await loadFBX(basePath + files.walk);
                if (walkObj.animations && walkObj.animations.length > 0) {
                    const walkClip = walkObj.animations[0].clone();
                    walkClip.name = 'walk';
                    this.clips.walk = walkClip;
                }

                // 4. Load Run Animation Clip
                const runObj = await loadFBX(basePath + files.run);
                if (runObj.animations && runObj.animations.length > 0) {
                    const runClip = runObj.animations[0].clone();
                    runClip.name = 'run';
                    this.clips.run = runClip;
                }

                // 5. Load Jump Animation Clip (Jump-withrun.fbx untuk semua aksi lompat)
                try {
                    const jumpObj = await loadFBX(basePath + files.jump);
                    if (jumpObj.animations && jumpObj.animations.length > 0) {
                        const jumpClip = jumpObj.animations[0].clone();
                        jumpClip.name = 'jump';
                        this.clips.jump = jumpClip;
                        this.clips.jumpRun = jumpClip;
                    }
                } catch (jErr) {
                    console.warn('[HeroAssetManager] Could not load Jump-withrun.fbx:', jErr);
                }
                // 5b. Load Jump Normal (lompat diam / jalan santai, tanpa sprint)
                try {
                    const jnObj = await loadFBX(basePath + files.jumpNormal);
                    if (jnObj.animations && jnObj.animations.length > 0) {
                        const jnClip = jnObj.animations[0].clone();
                        jnClip.name = 'jumpNormal';
                        this.clips.jumpNormal = jnClip;
                    }
                } catch (jnErr) {
                    console.warn('[HeroAssetManager] Could not load jump-normal.fbx:', jnErr);
                }
                // 6. Load Combat Kick Combo Animation Clips (kick1.fbx, kick2.fbx, kick3.fbx)
                for (const kKey of ['kick1', 'kick2', 'kick3']) {
                    try {
                        const kickObj = await loadFBX(basePath + files[kKey]);
                        if (kickObj.animations && kickObj.animations.length > 0) {
                            const kickClip = kickObj.animations[0].clone();
                            kickClip.name = kKey;

                            if (kKey === 'kick3') {
                                // Ekstraksi Root Motion (Mixamo Hips forward translation)
                                const hipsTrack = kickClip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                                if (hipsTrack && hipsTrack.values && hipsTrack.values.length >= 6) {
                                    const origZ = hipsTrack.values[2];
                                    const times = Float32Array.from(hipsTrack.times);
                                    const z = new Float32Array(hipsTrack.times.length);
                                    for (let i = 0; i < hipsTrack.times.length; i++) {
                                        z[i] = hipsTrack.values[i * 3 + 2] - origZ;
                                        // Flatten Z di track agar skeleton stabil di origin lokal
                                        hipsTrack.values[i * 3 + 2] = origZ;
                                    }
                                    this.kick3RootMotion = { times, z, totalZ: z[z.length - 1] };
                                    console.log('[HeroAssetManager] Extracted kick3 root motion! Total Z displacement:', z[z.length - 1].toFixed(3), 'm');
                                }
                            }

                            this.clips[kKey] = kickClip;
                        }
                    } catch (kErr) {
                        console.warn(`[HeroAssetManager] Could not load ${files[kKey]}:`, kErr);
                    }
                }
                // 7. Load Combat Punch Combo Animation Clips (punch1.fbx, punch2.fbx, punch3.fbx)
                for (const pKey of ['punch1', 'punch2', 'punch3']) {
                    try {
                        const punchObj = await loadFBX(basePath + files[pKey]);
                        if (punchObj.animations && punchObj.animations.length > 0) {
                            const punchClip = punchObj.animations[0].clone();
                            punchClip.name = pKey;
                            this.clips[pKey] = punchClip;
                        }
                    } catch (pErr) {
                        console.warn(`[HeroAssetManager] Could not load ${files[pKey]}:`, pErr);
                    }
                }


                this.isLoaded = true;
                this.isLoading = false;
                console.log('[HeroAssetManager] Hero 3D assets loaded successfully! Clips:', Object.keys(this.clips));

                // Resolve all pending instances waiting for asset load
                this.instancesPending.forEach(inst => this.setupInstance(inst));
                this.instancesPending = [];

                resolve(this);
            } catch (err) {
                console.error('[HeroAssetManager] Failed to load hero FBX assets:', err);
                this.isLoading = false;
                reject(err);
            }
        });

        return this.loadPromise;
    },

    setupInstance(instance) {
        if (!this.baseModel) return;

        // Clone baseModel with its skeleton hierarchy
        let modelClone;
        if (typeof THREE.SkeletonUtils !== 'undefined') {
            modelClone = THREE.SkeletonUtils.clone(this.baseModel);
        } else {
            console.warn('[HeroAssetManager] THREE.SkeletonUtils missing, falling back to direct clone');
            modelClone = this.baseModel.clone(true);
        }

        // Align model feet so they rest on y = 0
        modelClone.position.set(0, HERO_CHARACTER_CONFIG.yOffset, 0);

        modelClone.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.roughness = 1.0;
                        m.metalness = 0.0;
                        if (m.shininess !== undefined) m.shininess = 0;
                        if (m.specular) m.specular.set(0x000000);
                        if (m.emissive) m.emissive.set(0x222222);
                    });
                }
            }
        });

        instance.meshContainer.add(modelClone);
        instance.modelMesh = modelClone;

        // Initialize AnimationMixer on the cloned character
        const mixer = new THREE.AnimationMixer(modelClone);
        instance.mixer = mixer;

        // Bind animation actions
        instance.actions = {};
        instance.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
        instance.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
        instance.idleTimer = 0.0;
        instance.activeIdleKey = null;
        instance.idleCycleTimer = 0.0;

        if (this.clips.idle) {
            const idleAction = mixer.clipAction(this.clips.idle);
            idleAction.setEffectiveWeight(1.0);
            idleAction.play();
            instance.actions.idle = idleAction;
        }

        if (this.clips.idle2) {
            const idle2Action = mixer.clipAction(this.clips.idle2);
            idle2Action.setEffectiveWeight(0.0);
            idle2Action.play();
            instance.actions.idle2 = idle2Action;
        }

        if (this.clips.idle3) {
            const idle3Action = mixer.clipAction(this.clips.idle3);
            idle3Action.setEffectiveWeight(0.0);
            idle3Action.play();
            instance.actions.idle3 = idle3Action;
        }

        if (this.clips.walk) {
            const walkAction = mixer.clipAction(this.clips.walk);
            walkAction.setEffectiveWeight(0.0);
            walkAction.play();
            instance.actions.walk = walkAction;
        }

        if (this.clips.run) {
            const runAction = mixer.clipAction(this.clips.run);
            runAction.setEffectiveWeight(0.0);
            runAction.play();
            instance.actions.run = runAction;
        }

        if (this.clips.jump) {
            const jumpAction = mixer.clipAction(this.clips.jump);
            jumpAction.setEffectiveWeight(0.0);
            jumpAction.setLoop(THREE.LoopOnce);
            jumpAction.clampWhenFinished = true;
            jumpAction.play();
            instance.actions.jump = jumpAction;
            instance.actions.jumpRun = jumpAction; // Alias kompatibel
        }
        if (this.clips.jumpNormal) {
            const jnAction = mixer.clipAction(this.clips.jumpNormal);
            jnAction.setEffectiveWeight(0.0);
            jnAction.setLoop(THREE.LoopOnce);
            jnAction.clampWhenFinished = true;
            jnAction.play();
            instance.actions.jumpNormal = jnAction;
        }
        for (const kKey of ['kick1', 'kick2', 'kick3']) {
            if (this.clips[kKey]) {
                const action = mixer.clipAction(this.clips[kKey]);
                action.setEffectiveWeight(0.0);
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                action.play();
                instance.actions[kKey] = action;
            }
        }
        if (instance.actions.kick1) {
            instance.actions.kick = instance.actions.kick1; // Alias backward-compatibility
        }
        for (const pKey of ['punch1', 'punch2', 'punch3']) {
            if (this.clips[pKey]) {
                const action = mixer.clipAction(this.clips[pKey]);
                action.setEffectiveWeight(0.0);
                action.setLoop(THREE.LoopOnce);
                action.clampWhenFinished = true;
                action.play();
                instance.actions[pKey] = action;
            }
        }
        if (instance.actions.punch1) {
            instance.actions.punch = instance.actions.punch1;
        }


        instance.isLoaded = true;
        if (typeof instance.onLoaded === 'function') {
            instance.onLoaded(instance);
        }
    }
};

// Start preloading hero FBX assets immediately in the background
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.HeroAssetManager.load();
    });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.HeroAssetManager.load();
    }
}

/**
 * Creates and returns the Hero 3D Character model instance.
 * Aliased as createWolfCharacterModel for seamless backwards-compatibility.
 */
function createWolfCharacterModel(speciesKey = 'red') {
    const foxRoot = new THREE.Group();
    foxRoot.name = 'HeroCharacterRoot';

    const baseScale = HERO_CHARACTER_CONFIG.baseScale;
    foxRoot.scale.set(baseScale, baseScale, baseScale);
    foxRoot.userData.speciesKey = speciesKey;
    foxRoot.userData.isHeroCharacter = true;

    // Mesh container for vertical grounding and rotation
    const meshContainer = new THREE.Group();
    meshContainer.name = 'HeroMeshContainer';
    foxRoot.add(meshContainer);

    // Compatibility dummy groups so legacy references don't crash
    const dummyBody = new THREE.Group();
    foxRoot.add(dummyBody);
    const dummyJoint = () => {
        const g = new THREE.Group();
        dummyBody.add(g);
        return g;
    };

    const characterInstance = {
        root: foxRoot,
        meshContainer: meshContainer,
        modelMesh: null,
        speciesKey: speciesKey,
        baseScale: baseScale,
        mixer: null,
        actions: {},
        currentWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 },
        targetWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 },
        isLoaded: false,
        wasInAir: false,
        isJumping: false,
        jumpTimer: 0.0,
        jumpDuration: 0.95,
        idleTimer: 0.0,
        activeIdleKey: null,
        idleCycleTimer: 0.0,

        /**
         * Memicu eksekusi animasi Jump-withrun secara penuh dan lancar dari tolakan sampai mendarat tuntas.
         */
        
        isKicking: false,
        activeKickKey: null,
        kickComboIndex: 0,
        kickTimer: 0.0,
        kickDuration: 0.88,
        queuedKicks: 0,       // Jumlah tendangan lanjutan yang sudah diklik (maks 2 → kick2, kick3)
        hasQueuedKick: false, // Alias kompatibilitas
        lastKickEndTime: 0,
        kick3PrevTime: 0.0,

        isPunching: false,
        activePunchKey: null,
        punchComboIndex: 0,
        punchTimer: 0.0,
        punchDuration: 0.88,
        queuedPunches: 0,     // Jumlah pukulan lanjutan yang sudah diklik (maks 2 → punch2, punch3)
        hasQueuedPunch: false,
        lastPunchEndTime: 0,
        wasMoving: false,

        // Jump state
        activeJumpKey: 'jump',
        jumpImpulsePending: false,
        jumpTakeoffTime: 0.0,
        jumpImpulseVel: 0.0,

        /**
         * Combo tendangan berbasis jumlah klik:
         * - 1x klik  -> kick1
         * - 2x klik  -> kick1 -> kick2
         * - 3x klik  -> kick1 -> kick2 -> kick3
         * - Spam     -> kick1 -> kick2 -> kick3 (berulang), setiap tendangan SELALU selesai dulu
         *   sebelum tendangan berikutnya dimulai. Klik berlebih tidak memotong animasi.
         */
        triggerKick() {
            if (this.isPunching) {
                this.cancelPunch();
            }
            if (this.isKicking) {
                // Simpan klik ke antrean (maks 2 tendangan lanjutan agar tidak menumpuk tanpa akhir)
                this.queuedKicks = Math.min(2, this.queuedKicks + 1);
                this.hasQueuedKick = this.queuedKicks > 0;
                return;
            }
            // Klik baru dari keadaan diam / selesai menendang: selalu mulai dari kick1
            this.kickComboIndex = 0;
            this.queuedKicks = 0;
            this._startKick('kick1');
        },

        _startKick(kickKey, crossFadeFromAction = null) {
            const comboKeys = ['kick1', 'kick2', 'kick3'];
            const action = this.actions[kickKey];
            if (!action) {
                console.warn('[Combat] Action not found for kickKey:', kickKey);
                this.isKicking = false;
                return;
            }

            // Tendangan membatalkan lompatan yang belum lepas landas
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isKicking = true;
            this.activeKickKey = kickKey;
            this.kickComboIndex = comboKeys.indexOf(kickKey);
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            const clip = action.getClip();
            const rate = 1.70; // Kecepatan tendangan cepat, tajam, dan responsif
            action.timeScale = rate;
            this.kickDuration = (clip && clip.duration) ? (clip.duration / rate) : 0.88;

            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            // Semua pose lain memudar keluar (bukan di-nol-kan paksa) agar transisi tetap halus
            ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            comboKeys.forEach(k => {
                this.targetWeights[k] = (k === kickKey) ? 1.0 : 0.0;
            });

            if (crossFadeFromAction && crossFadeFromAction !== action) {
                // Chain combo: serah-terima pose dari tendangan sebelumnya ke tendangan berikutnya
                this.currentWeights[kickKey] = Math.max(this.currentWeights[kickKey] || 0, 0.35);
            } else {
                this.currentWeights[kickKey] = Math.max(this.currentWeights[kickKey] || 0, 0.25);
            }
            action.setEffectiveWeight(this.currentWeights[kickKey]);
        },

        /**
         * Membatalkan tendangan karena pemain menekan tombol gerak SETELAH klik kanan
         * (input terakhir = prioritas). Pose tendangan memudar halus ke Walk / Run.
         */
        cancelKick() {
            if (!this.isKicking) return;
            this.isKicking = false;
            this.activeKickKey = null;
            this.queuedKicks = 0;
            this.hasQueuedKick = false;
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.kickComboIndex = 0;
            this.lastKickEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            ['kick1', 'kick2', 'kick3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
        },

        /**
         * Combo pukulan berbasis jumlah klik (100% identik mekanisme dengan tendangan):
         * - 1x klik  -> punch1
         * - 2x klik  -> punch1 -> punch2
         * - 3x klik  -> punch1 -> punch2 -> punch3
         * - Spam     -> punch1 -> punch2 -> punch3 (berulang), setiap pukulan SELALU selesai dulu
         *   sebelum pukulan berikutnya dimulai. Klik berlebih tidak memotong animasi.
         */
        triggerPunch() {
            if (this.isKicking) {
                this.cancelKick();
            }
            if (this.isPunching) {
                // Simpan klik ke antrean (maks 2 pukulan lanjutan agar tidak menumpuk tanpa akhir)
                this.queuedPunches = Math.min(2, this.queuedPunches + 1);
                this.hasQueuedPunch = this.queuedPunches > 0;
                return;
            }
            // Klik baru dari keadaan diam / selesai memukul: selalu mulai dari punch1
            this.punchComboIndex = 0;
            this.queuedPunches = 0;
            this._startPunch('punch1');
        },

        _startPunch(punchKey, crossFadeFromAction = null) {
            const comboKeys = ['punch1', 'punch2', 'punch3'];
            const action = this.actions[punchKey];
            if (!action) {
                console.warn('[Combat] Action not found for punchKey:', punchKey);
                this.isPunching = false;
                return;
            }

            // Pukulan membatalkan lompatan yang belum lepas landas
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isPunching = true;
            this.activePunchKey = punchKey;
            this.punchComboIndex = comboKeys.indexOf(punchKey);
            this.punchTimer = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            const clip = action.getClip();
            const rates = { punch1: 2.0, punch2: 1.5, punch3: 1.25 };
            const rate = rates[punchKey] || 1.6;
            action.timeScale = rate;
            this.punchDuration = (clip && clip.duration) ? (clip.duration / rate) : 0.88;

            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            // Semua pose lain memudar keluar
            ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            comboKeys.forEach(k => {
                this.targetWeights[k] = (k === punchKey) ? 1.0 : 0.0;
            });

            if (crossFadeFromAction && crossFadeFromAction !== action) {
                this.currentWeights[punchKey] = Math.max(this.currentWeights[punchKey] || 0, 0.35);
            } else {
                this.currentWeights[punchKey] = Math.max(this.currentWeights[punchKey] || 0, 0.25);
            }
            action.setEffectiveWeight(this.currentWeights[punchKey]);
        },

        cancelPunch() {
            if (!this.isPunching) return;
            this.isPunching = false;
            this.activePunchKey = null;
            this.queuedPunches = 0;
            this.hasQueuedPunch = false;
            this.punchTimer = 0.0;
            this.punchComboIndex = 0;
            this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            ['punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
        },

        /**
         * Lompat:
         * - Tidak sprint -> jump-normal.fbx (ada ancang-ancang, impuls fisik dilepas tepat di frame tolakan)
         * - Sprint       -> Jump-withrun.fbx (impuls langsung)
         * Mengembalikan true jika impuls fisik harus langsung diterapkan saat itu juga.
         */
        triggerJump(isSprinting = false) {
            const useNormal = !isSprinting && !!this.actions.jumpNormal;
            const key = useNormal ? 'jumpNormal' : 'jump';
            const action = this.actions[key];
            if (!action) return true;

            this.isJumping = true;
            this.activeJumpKey = key;
            this.jumpTimer = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            const rate = useNormal ? 1.30 : 1.15;
            action.timeScale = rate;
            const clip = action.getClip();
            this.jumpDuration = (clip && clip.duration) ? (clip.duration / rate) : 0.95;

            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();

            if (useNormal) {
                // Frame tolakan kaki di jump-normal.fbx berada di ~0.62s (waktu klip)
                this.jumpImpulsePending = true;
                this.jumpTakeoffTime = 0.62 / rate;
                this.jumpImpulseVel = 5.5;
                return false;
            }
            this.jumpImpulsePending = false;
            return true;
        },
        // Alias backward compatibility jika ada script eksternal
        triggerBackflip() {
            this.triggerJump(false);
        },
        onLoaded: null,

        // Dummy references for backward compatibility
        bodyTiltGroup: dummyBody,
        neckJoint: dummyJoint(),
        headJoint: dummyJoint(),
        earLJoint: dummyJoint(),
        earRJoint: dummyJoint(),
        tailBaseJoint: dummyJoint(),
        tailMidJoint: dummyJoint(),
        tailTipJoint: dummyJoint(),
        legFL: dummyJoint(),
        legFR: dummyJoint(),
        legBL: dummyJoint(),
        legBR: dummyJoint(),
        BASE_HIP_Y: 0.0,

        /**
         * Smoothly updates animation playback and blends Idle, Idle2, Walk, Run, and Jump states.
         * Rules:
         * - Idle animations only execute after 4.0s of continuous zero movement.
         * - Randomly picks between idle.fbx and idle2.fbx when idle triggers and after each cycle.
         * - Jump without sprint triggers Backflip.fbx with controlled height.
         * - Jump with sprint triggers Jump-withrun.fbx with athletic height.
         * - Stride cadence is synchronized to displacement speed with calm walking pace.
         * @param {number} dt Delta time in seconds
         * @param {number} speed Signed locomotion speed
         * @param {boolean} isSprinting Whether sprint/run is active
         * @param {boolean} isGrounded Whether the character is on the ground
         */
        updateAnimation(dt, speed = 0, isSprinting = false, isGrounded = true, turnRate = 0) {
            if (!this.mixer || !this.isLoaded) return;
            dt = Math.min(dt, 0.1);

            const absSpeed = Math.abs(speed);
            const absTurn = Math.abs(turnRate);

            // Cek apakah ada input aktif dari tombol keyboard (WASD/Space) atau mobile virtual joystick
            const k = (typeof window !== 'undefined' && window.keys) || (typeof keys !== 'undefined' ? keys : null);
            const isKeyActive = k ? !!(k.w || k.s || k.a || k.d || k.space) : false;
            const isAnalogActive = (
                (typeof mobileJoystickForward !== 'undefined' && Math.abs(mobileJoystickForward) > 0.05) ||
                (typeof mobileJoystickTurn !== 'undefined' && Math.abs(mobileJoystickTurn) > 0.05)
            );

            // Pemain dianggap bergerak jika ada kecepatan fisik, ada putaran sudut, atau ada input aktif
            const isMoving = absSpeed > 0.01 || absTurn > 0.01 || isKeyActive || isAnalogActive;

            // Lompat normal yang masih di fase ancang-ancang tidak boleh terpotong deteksi "di udara"
            this.targetWeights.jumpNormal = 0.0;

            // 1. PRIORITAS TERTINGGI: ANIMASI PUNCH / KICK / JUMP BERJALAN SAMPAI SELESAI TUNTAS
            if (this.isPunching) {
                this.punchTimer += dt;
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'run', 'idle', 'idle2', 'idle3', 'kick1', 'kick2', 'kick3'].forEach(key => {
                    this.targetWeights[key] = 0.0;
                });

                const comboKeys = ['punch1', 'punch2', 'punch3'];
                const curIndex = comboKeys.indexOf(this.activePunchKey);

                // Serah-terima ke pukulan berikutnya HANYA ketika pukulan aktif hampir selesai,
                // sehingga setiap pukulan selalu tampil utuh (tidak terpotong oleh spam klik)
                const handoffTime = Math.max(0, this.punchDuration - 0.12);

                if (this.queuedPunches > 0 && this.punchTimer >= handoffTime) {
                    const prevAction = this.actions[this.activePunchKey];
                    const nextKey = comboKeys[(curIndex + 1) % comboKeys.length];
                    this.queuedPunches -= 1;
                    this.hasQueuedPunch = this.queuedPunches > 0;
                    this._startPunch(nextKey, prevAction);
                } else if (this.punchTimer >= this.punchDuration) {
                    // Rangkaian pukulan selesai tuntas -> klik berikutnya kembali mulai dari punch1
                    this.isPunching = false;
                    this.activePunchKey = null;
                    this.queuedPunches = 0;
                    this.hasQueuedPunch = false;
                    this.punchTimer = 0.0;
                    this.punchComboIndex = 0;
                    this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

                    // Kembali ke pose berdiri dasar (idle.fbx dari awal), timer idle variasi dari 0
                    this.wasMoving = false;
                    this.idleTimer = 0.0;
                    this.activeIdleKey = null;
                    this.idleCycleTimer = 0.0;
                    if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
                    if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
                    if (this.actions.idle) { this.actions.idle.reset().play(); }
                    comboKeys.forEach(key => { this.targetWeights[key] = 0.0; });
                    this.targetWeights.idle = 1.0;
                } else {
                    comboKeys.forEach(key => {
                        this.targetWeights[key] = (key === this.activePunchKey) ? 1.0 : 0.0;
                    });
                }
            } else if (this.isKicking) {
                this.kickTimer += dt;
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'run', 'idle', 'idle2', 'idle3', 'punch1', 'punch2', 'punch3'].forEach(key => {
                    this.targetWeights[key] = 0.0;
                });

                const comboKeys = ['kick1', 'kick2', 'kick3'];
                const curIndex = comboKeys.indexOf(this.activeKickKey);
                const HM = window.HeroAssetManager;

                // Geser root dunia mengikuti pijakan kaki kick3 (root motion)
                const applyKick3RootMotion = (toTime) => {
                    if (!HM || !HM.kick3RootMotion || !this.root) return;
                    const prevTime = this.kick3PrevTime || 0.0;
                    if (toTime <= prevTime) return;
                    const deltaZ = Math.max(0, HM.sampleKick3Z(toTime) - HM.sampleKick3Z(prevTime));
                    this.kick3PrevTime = toTime;
                    if (deltaZ <= 0.00001) return;
                    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                    const dispWorld = deltaZ * (this.baseScale || 1.85);
                    this.root.position.addScaledVector(fwd, dispWorld);
                    if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, dispWorld);
                    if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, dispWorld);
                };

                if (this.activeKickKey === 'kick3' && this.actions.kick3) {
                    applyKick3RootMotion(this.actions.kick3.time);
                }

                // Serah-terima ke tendangan berikutnya HANYA ketika tendangan aktif hampir selesai,
                // sehingga setiap tendangan selalu tampil utuh (tidak terpotong oleh spam klik)
                const handoffTime = Math.max(0, this.kickDuration - 0.12);

                if (this.queuedKicks > 0 && this.kickTimer >= handoffTime) {
                    if (this.activeKickKey === 'kick3' && HM && HM.kick3RootMotion) {
                        // Pastikan seluruh langkah maju kick3 tuntas sebelum ganti tendangan
                        applyKick3RootMotion(this.actions.kick3.getClip().duration);
                    }
                    const prevAction = this.actions[this.activeKickKey];
                    const nextKey = comboKeys[(curIndex + 1) % comboKeys.length];
                    this.queuedKicks -= 1;
                    this.hasQueuedKick = this.queuedKicks > 0;
                    this._startKick(nextKey, prevAction);
                } else if (this.kickTimer >= this.kickDuration) {
                    if (this.activeKickKey === 'kick3' && HM && HM.kick3RootMotion) {
                        applyKick3RootMotion(this.actions.kick3.getClip().duration);
                    }
                    // Rangkaian tendangan selesai tuntas -> klik berikutnya kembali mulai dari kick1
                    this.isKicking = false;
                    this.activeKickKey = null;
                    this.queuedKicks = 0;
                    this.hasQueuedKick = false;
                    this.kickTimer = 0.0;
                    this.kick3PrevTime = 0.0;
                    this.kickComboIndex = 0;
                    this.lastKickEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

                    // Kembali ke pose berdiri dasar (idle.fbx dari awal), timer idle variasi dari 0
                    this.wasMoving = false;
                    this.idleTimer = 0.0;
                    this.activeIdleKey = null;
                    this.idleCycleTimer = 0.0;
                    if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
                    if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
                    if (this.actions.idle) { this.actions.idle.reset().play(); }
                    comboKeys.forEach(key => { this.targetWeights[key] = 0.0; });
                    this.targetWeights.idle = 1.0;
                } else {
                    comboKeys.forEach(key => {
                        this.targetWeights[key] = (key === this.activeKickKey) ? 1.0 : 0.0;
                    });
                }
            } else if (this.isJumping) {
                this.jumpTimer += dt;
                const jKey = this.activeJumpKey || 'jump';
                this.targetWeights.jump = (jKey === 'jump') ? 1.0 : 0.0;
                this.targetWeights.jumpRun = (jKey === 'jump') ? 1.0 : 0.0;
                this.targetWeights.jumpNormal = (jKey === 'jumpNormal') ? 1.0 : 0.0;
                this.targetWeights.walk = 0.0;
                this.targetWeights.run = 0.0;
                this.targetWeights.idle = 0.0;
                this.targetWeights.idle2 = 0.0;
                this.targetWeights.idle3 = 0.0;
                this.targetWeights.kick1 = 0.0;
                this.targetWeights.kick2 = 0.0;
                this.targetWeights.kick3 = 0.0;
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;

                // Animasi lompat berjalan lancar sampai fase landing selesai 100%
                if (this.jumpTimer >= this.jumpDuration) {
                    this.isJumping = false;
                    this.jumpImpulsePending = false;
                    this.jumpTimer = 0.0;
                    this.targetWeights.jump = 0.0;
                    this.targetWeights.jumpRun = 0.0;
                    this.targetWeights.jumpNormal = 0.0;
                }
            } else if (!isGrounded) {
                // Karakter berada di udara (jatuh dari tebing / drop)
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                this.targetWeights.jump = 1.0;
                this.targetWeights.jumpRun = 1.0;
                this.targetWeights.walk = 0.0;
                this.targetWeights.run = 0.0;
                this.targetWeights.idle = 0.0;
                this.targetWeights.idle2 = 0.0;
                this.targetWeights.idle3 = 0.0;
                this.targetWeights.kick1 = 0.0;
                this.targetWeights.kick2 = 0.0;
                this.targetWeights.kick3 = 0.0;
            } else {
                // 2. GROUNDED (WALK / RUN / IDLE)
                this.wasInAir = false;
                this.targetWeights.jump = 0.0;
                this.targetWeights.jumpRun = 0.0;

                // DETEKSI PERALIHAN: Pemain baru saja melepaskan semua tombol / berhenti bergerak
                if (this.wasMoving && !isMoving) {
                    // RESET TOTAL IDLE TIMER & MATIKAN SELURUH VARIASI IDLE LANJUTAN (idle2, idle3)!
                    this.idleTimer = 0.0;
                    this.activeIdleKey = null;
                    this.idleCycleTimer = 0.0;
                    this.targetWeights.idle = 1.0;
                    this.targetWeights.idle2 = 0.0;
                    this.targetWeights.idle3 = 0.0;
                    this.currentWeights.idle2 = 0.0;
                    this.currentWeights.idle3 = 0.0;
                    if (this.actions.idle2) { this.actions.idle2.stop(); this.actions.idle2.setEffectiveWeight(0.0); }
                    if (this.actions.idle3) { this.actions.idle3.stop(); this.actions.idle3.setEffectiveWeight(0.0); }
                    if (this.actions.idle) { this.actions.idle.reset().play(); }
                }
                this.wasMoving = isMoving;

                if (isMoving) {
                    // Active locomotion: RESET TOTAL IDLE TIMER & KUNCI SEMUA IDLE KE 0 MUTLAK!
                    this.idleTimer = 0.0;
                    this.activeIdleKey = null;
                    this.idleCycleTimer = 0.0;
                    this.targetWeights.idle = 0.0;
                    this.targetWeights.idle2 = 0.0;
                    this.targetWeights.idle3 = 0.0;
                    this.targetWeights.kick1 = 0.0;
                    this.targetWeights.kick2 = 0.0;
                    this.targetWeights.kick3 = 0.0;
                    this.targetWeights.punch1 = 0.0;
                    this.targetWeights.punch2 = 0.0;
                    this.targetWeights.punch3 = 0.0;

                    if (isSprinting && absSpeed > 1.8) {
                        // Running stride: smooth ramp from walk to full run
                        const runBlend = Math.min(1.0, (absSpeed - 1.8) / 2.2);
                        this.targetWeights.walk = Math.max(0.0, 1.0 - runBlend);
                        this.targetWeights.run = runBlend;
                    } else if (absSpeed <= 0.05 && (absTurn > 0.05 || (k && (k.a || k.d)))) {
                        // Belok / rotasi di tempat: langkah kaki santai (natural stepping)
                        // Bobot walk wajib 1.0 agar total bobot aksi selalu 100% dan hips tidak kolaps ke bind-pose (tenggelam)
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                    } else {
                        // Natural, calm walking stride
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                    }
                } else {
                    // Stationary on ground: Karakter diam di tanah tanpa gerakan maupun input
                    this.targetWeights.walk = 0.0;
                    this.targetWeights.run = 0.0;

                    this.idleTimer += dt;
                    const idleThreshold = 4.5; // Ambang batas 4-5 detik sebelum variasi idle acak dieksekusi

                    if (this.idleTimer < idleThreshold) {
                        // Sebelum 4-5 detik diam:
                        // Karakter berdiri santai dan memainkan animasi bernapas alami (idle.fbx).
                        // Seluruh variasi idle lanjutan (idle2, idle3) DIKUNCI MATI (stop & weight 0.0)!
                        this.targetWeights.idle = 1.0;
                        this.targetWeights.idle2 = 0.0;
                        this.targetWeights.idle3 = 0.0;
                        this.targetWeights.kick1 = 0.0;
                        this.targetWeights.kick2 = 0.0;
                        this.targetWeights.kick3 = 0.0;
                        this.activeIdleKey = null;
                        this.idleCycleTimer = 0.0;

                        if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
                        if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
                        if (this.actions.idle) this.actions.idle.timeScale = 1.0;
                    } else {
                        // Tepat >= 5 detik diam: Mulai eksekusi variasi idle ekspresif secara acak (idle, idle2, idle3)!
                        const idlePool = ['idle', 'idle2', 'idle3'];

                        if (!this.activeIdleKey) {
                            // Pertama kali mencapai 5 detik diam: undi acak variasi idle
                            this.activeIdleKey = idlePool[Math.floor(Math.random() * idlePool.length)];
                            this.idleCycleTimer = 0.0;
                            if (this.actions[this.activeIdleKey]) {
                                this.actions[this.activeIdleKey].reset().play();
                            }
                        }

                        // Pantau durasi klip aktif sebelum mengundi acak variasi idle berikutnya
                        this.idleCycleTimer += dt;
                        const currentAction = this.actions[this.activeIdleKey];
                        const clipDuration = (currentAction && currentAction.getClip()) ? currentAction.getClip().duration : 3.0;

                        if (this.idleCycleTimer >= clipDuration) {
                            this.idleCycleTimer = 0.0;
                            const nextIdle = idlePool[Math.floor(Math.random() * idlePool.length)];
                            this.activeIdleKey = nextIdle;
                            if (this.actions[nextIdle]) {
                                this.actions[nextIdle].reset().play();
                            }
                        }

                        // Pasang target weight ke variasi idle yang sedang aktif
                        this.targetWeights.idle = (this.activeIdleKey === 'idle') ? 1.0 : 0.0;
                        this.targetWeights.idle2 = (this.activeIdleKey === 'idle2') ? 1.0 : 0.0;
                        this.targetWeights.idle3 = (this.activeIdleKey === 'idle3') ? 1.0 : 0.0;
                        this.targetWeights.kick1 = 0.0;
                this.targetWeights.kick2 = 0.0;
                this.targetWeights.kick3 = 0.0;

                        if (this.actions.idle) this.actions.idle.timeScale = 1.0;
                        if (this.actions.idle2) this.actions.idle2.timeScale = 1.0;
                        if (this.actions.idle3) this.actions.idle3.timeScale = 1.0;
                    }
                }
            }

            // Interpolate action weights smoothly
            const blendSpeed = (this.isKicking || this.isPunching) ? 28.0 : (isMoving ? 18.0 : (isGrounded ? 12.0 : 16.0));
            for (const key of ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3']) {
                if (this.actions[key]) {
                    this.currentWeights[key] = THREE.MathUtils.lerp(
                        this.currentWeights[key],
                        this.targetWeights[key],
                        Math.min(1.0, blendSpeed * dt)
                    );
                    this.actions[key].setEffectiveWeight(this.currentWeights[key]);
                }
            }

            // ========================================================
            // STRIDE CADENCE SYNCHRONIZATION (ANTI-SLIDING / ICE SKATING)
            // Stride duration & speed calibrated to physical displacement:
            // Walk base speed = 1.65 m/s (tenang, tidak tergesa-gesa)
            // Run base speed = 6.5 m/s (sprint atletis teratur)
            // ========================================================
            if (this.actions.walk) {
                const walkPace = (absSpeed <= 0.05) ? 0.85 : Math.max(0.55, Math.min(1.25, (absSpeed / 1.65) * 0.95));
                this.actions.walk.timeScale = (speed < 0) ? -walkPace : walkPace;
            }
            if (this.actions.run) {
                const runPace = Math.max(0.70, Math.min(1.6, absSpeed / 5.2));
                this.actions.run.timeScale = runPace;
            }
            if (this.actions.jump) this.actions.jump.timeScale = 1.15;      // Jump-withrun.fbx
            if (this.actions.jumpNormal) this.actions.jumpNormal.timeScale = 1.30; // jump-normal.fbx

            // Step the Three.js AnimationMixer
            this.mixer.update(dt);
        },

        resetAnimation() {
            this.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
            this.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
            this.wasInAir = false;
            this.isJumping = false;
            this.isKicking = false;
            this.activeKickKey = null;
            this.hasQueuedKick = false;
            this.queuedKicks = 0;
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.lastKickEndTime = 0;

            this.isPunching = false;
            this.activePunchKey = null;
            this.hasQueuedPunch = false;
            this.queuedPunches = 0;
            this.punchTimer = 0.0;
            this.lastPunchEndTime = 0;
            this.punchComboIndex = 0;

            this.jumpImpulsePending = false;
            this.activeJumpKey = 'jump';
            this.kickComboIndex = 0;
            this.wasMoving = false;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1.0); }
            if (this.actions.idle2) { this.actions.idle2.stop(); this.actions.idle2.setEffectiveWeight(0.0); }
            if (this.actions.idle3) { this.actions.idle3.stop(); this.actions.idle3.setEffectiveWeight(0.0); }
            if (this.actions.walk) this.actions.walk.setEffectiveWeight(0.0);
            if (this.actions.run) this.actions.run.setEffectiveWeight(0.0);
            if (this.actions.jump) this.actions.jump.setEffectiveWeight(0.0);
            if (this.actions.jumpRun) this.actions.jumpRun.setEffectiveWeight(0.0);
            if (this.actions.jumpNormal) this.actions.jumpNormal.setEffectiveWeight(0.0);
            ['kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3'].forEach(k => {
                if (this.actions[k]) { this.actions[k].stop(); this.actions[k].setEffectiveWeight(0.0); }
            });
        }
    };

    // If assets already loaded, setup character immediately
    if (window.HeroAssetManager.isLoaded) {
        window.HeroAssetManager.setupInstance(characterInstance);
    } else {
        // Queue to attach when loading finishes
        window.HeroAssetManager.instancesPending.push(characterInstance);
        window.HeroAssetManager.load();
    }

    return characterInstance;
}

// Alias for direct modern access
window.createHeroCharacterModel = createWolfCharacterModel;
window.createWolfCharacterModel = createWolfCharacterModel;