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

function getGeneralTakingBasePath() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('fox-model.js')) {
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/general/taking/');
            }
        }
    }
    return 'hero/general/taking/';
}

function getGeneralHeroBasePath() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('fox-model.js')) {
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/general/');
            }
        }
    }
    return 'hero/general/';
}

// Global Asset Manager for Taking Damage Reactions (hero/general/taking/hit1.fbx, hit2.fbx)
window.GeneralTakingAssetManager = {
    isLoaded: false,
    isLoading: false,
    loadPromise: null,
    clips: {
        hit1: null,
        hit2: null
    },
    instancesPending: [],

    load() {
        if (this.loadPromise) return this.loadPromise;
        this.isLoading = true;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                if (typeof THREE.FBXLoader === 'undefined') {
                    throw new Error('THREE.FBXLoader is not available.');
                }
                const loader = new THREE.FBXLoader();
                const loadFBX = (url) => (window.PandoraAssetCache ? window.PandoraAssetCache.loadFBX(url, loader) : new Promise((res, rej) => loader.load(url, res, undefined, rej)));
                const basePath = getGeneralTakingBasePath();

                console.log('[GeneralTakingAssetManager] Loading taking hit FBX assets from', basePath);

                // 1. Load hit1.fbx
                try {
                    const h1Obj = await loadFBX(basePath + 'hit1.fbx');
                    if (h1Obj.animations && h1Obj.animations.length > 0) {
                        const h1Clip = h1Obj.animations[0].clone();
                        h1Clip.name = 'hit1';
                        this.clips.hit1 = h1Clip;
                    }
                } catch (e1) {
                    console.warn('[GeneralTakingAssetManager] Could not load hit1.fbx:', e1);
                }

                // 2. Load hit2.fbx
                try {
                    const h2Obj = await loadFBX(basePath + 'hit2.fbx');
                    if (h2Obj.animations && h2Obj.animations.length > 0) {
                        const h2Clip = h2Obj.animations[0].clone();
                        h2Clip.name = 'hit2';
                        this.clips.hit2 = h2Clip;
                    }
                } catch (e2) {
                    console.warn('[GeneralTakingAssetManager] Could not load hit2.fbx:', e2);
                }

                this.isLoaded = true;
                this.isLoading = false;
                console.log('[GeneralTakingAssetManager] Hit assets loaded successfully!', Object.keys(this.clips));

                // Bind to any pending instances
                this.instancesPending.forEach(inst => this.setupInstance(inst));
                this.instancesPending = [];

                resolve(this);
            } catch (err) {
                console.error('[GeneralTakingAssetManager] Failed to load taking FBX assets:', err);
                this.isLoading = false;
                reject(err);
            }
        });

        return this.loadPromise;
    },

    setupInstance(instance) {
        if (!instance || !instance.mixer) return;
        ['hit1', 'hit2'].forEach(hitKey => {
            const clip = this.clips[hitKey];
            if (clip && (!instance.actions || !instance.actions[hitKey])) {
                const act = instance.mixer.clipAction(clip);
                act.setLoop(THREE.LoopOnce, 1);
                act.clampWhenFinished = true;
                act.setEffectiveWeight(0.0);
                instance.actions[hitKey] = act;
                if (instance.currentWeights && instance.currentWeights[hitKey] === undefined) {
                    instance.currentWeights[hitKey] = 0.0;
                }
                if (instance.targetWeights && instance.targetWeights[hitKey] === undefined) {
                    instance.targetWeights[hitKey] = 0.0;
                }
            }
        });
    }
};

function getGeneralDeadBasePath() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('fox-model.js')) {
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/general/dead/');
            }
        }
    }
    return 'hero/general/dead/';
}

// Global Asset Manager for Death Animations (hero/general/dead/dead1.fbx, dead2.fbx)
window.GeneralDeadAssetManager = {
    isLoaded: false,
    isLoading: false,
    loadPromise: null,
    clips: {
        dead1: null,
        dead2: null
    },
    instancesPending: [],

    load() {
        if (this.loadPromise) return this.loadPromise;
        this.isLoading = true;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                if (typeof THREE.FBXLoader === 'undefined') {
                    throw new Error('THREE.FBXLoader is not available.');
                }
                const loader = new THREE.FBXLoader();
                const loadFBX = (url) => (window.PandoraAssetCache ? window.PandoraAssetCache.loadFBX(url, loader) : new Promise((res, rej) => loader.load(url, res, undefined, rej)));
                const basePath = getGeneralDeadBasePath();

                console.log('[GeneralDeadAssetManager] Loading dead FBX assets from', basePath);

                // 1. Load dead1.fbx
                try {
                    const d1Obj = await loadFBX(basePath + 'dead1.fbx');
                    if (d1Obj.animations && d1Obj.animations.length > 0) {
                        const d1Clip = d1Obj.animations[0].clone();
                        d1Clip.name = 'dead1';
                        this.clips.dead1 = d1Clip;
                    }
                } catch (e1) {
                    console.warn('[GeneralDeadAssetManager] Could not load dead1.fbx:', e1);
                }

                // 2. Load dead2.fbx
                try {
                    const d2Obj = await loadFBX(basePath + 'dead2.fbx');
                    if (d2Obj.animations && d2Obj.animations.length > 0) {
                        const d2Clip = d2Obj.animations[0].clone();
                        d2Clip.name = 'dead2';
                        this.clips.dead2 = d2Clip;
                    }
                } catch (e2) {
                    console.warn('[GeneralDeadAssetManager] Could not load dead2.fbx:', e2);
                }

                this.isLoaded = true;
                this.isLoading = false;
                console.log('[GeneralDeadAssetManager] Dead assets loaded successfully!', Object.keys(this.clips));

                this.instancesPending.forEach(inst => this.setupInstance(inst));
                this.instancesPending = [];

                resolve(this);
            } catch (err) {
                console.error('[GeneralDeadAssetManager] Failed to load dead FBX assets:', err);
                this.isLoading = false;
                reject(err);
            }
        });

        return this.loadPromise;
    },

    setupInstance(instance) {
        if (!instance || !instance.mixer) return;
        ['dead1', 'dead2'].forEach(deadKey => {
            const clip = this.clips[deadKey];
            if (clip && (!instance.actions || !instance.actions[deadKey])) {
                const act = instance.mixer.clipAction(clip);
                act.setLoop(THREE.LoopOnce, 1);
                act.clampWhenFinished = true;
                act.setEffectiveWeight(0.0);
                instance.actions[deadKey] = act;
                if (instance.currentWeights && instance.currentWeights[deadKey] === undefined) {
                    instance.currentWeights[deadKey] = 0.0;
                }
                if (instance.targetWeights && instance.targetWeights[deadKey] === undefined) {
                    instance.targetWeights[deadKey] = 0.0;
                }
            }
        });
    }
};

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

    load(onProgress = null) {
        if (this.loadPromise) return this.loadPromise;
        this.isLoading = true;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                if (typeof THREE.FBXLoader === 'undefined') {
                    throw new Error('THREE.FBXLoader is not available. Please include FBXLoader.js and fflate.min.js.');
                }

                const loader = new THREE.FBXLoader();
                const loadFBX = (url) => (window.PandoraAssetCache ? window.PandoraAssetCache.loadFBX(url, loader) : new Promise((res, rej) => loader.load(url, res, undefined, rej)));

                const basePath = HERO_CHARACTER_CONFIG.getPath();
                const generalPath = getGeneralHeroBasePath();
                const files = HERO_CHARACTER_CONFIG.files;

                const reportProgress = (status, pct) => {
                    if (typeof onProgress === 'function') onProgress(status, pct);
                    const fill = document.getElementById('asset-loader-fill');
                    const st = document.getElementById('asset-loader-status');
                    const pc = document.getElementById('asset-loader-pct');
                    if (fill) fill.style.width = pct + '%';
                    if (st) st.innerText = status;
                    if (pc) pc.innerText = Math.round(pct) + '%';
                };

                reportProgress('Memuat Model Karakter Red Fox (idle.fbx)...', 15);
                console.log('[HeroAssetManager] Loading hero FBX assets from', basePath);

                // 1. Load Idle (Base Model + Rig + Primary Idle Animation)
                const idleObj = await loadFBX(basePath + files.idle);
                
                // Configure meshes, shadows, and 100% matte materials (folds/details clearly visible)
                idleObj.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.frustumCulled = false;
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

                reportProgress('Memuat Variasi Animasi Idle...', 30);

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

                reportProgress('Memuat Animasi Berjalan (walk.fbx)...', 45);

                // 3. Load Walk Animation Clip (Coba hero/red/walk.fbx, jika tidak ada fallback ke hero/general/walk.fbx)
                try {
                    let walkObj = null;
                    try {
                        walkObj = await loadFBX(basePath + files.walk);
                    } catch (eWalk) {
                        walkObj = await loadFBX(generalPath + 'walk.fbx');
                    }
                    if (walkObj && walkObj.animations && walkObj.animations.length > 0) {
                        const walkClip = walkObj.animations[0].clone();
                        walkClip.name = 'walk';
                        this.clips.walk = walkClip;
                    }
                } catch (wErr) {
                    console.warn('[HeroAssetManager] Could not load walk.fbx:', wErr);
                }

                reportProgress('Memuat Animasi Berlari (run.fbx)...', 60);

                // 4. Load Run Animation Clip (Coba hero/red/run.fbx, jika tidak ada fallback ke hero/general/run.fbx)
                try {
                    let runObj = null;
                    try {
                        runObj = await loadFBX(basePath + files.run);
                    } catch (eRun) {
                        runObj = await loadFBX(generalPath + 'run.fbx');
                    }
                    if (runObj && runObj.animations && runObj.animations.length > 0) {
                        const runClip = runObj.animations[0].clone();
                        runClip.name = 'run';
                        this.clips.run = runClip;
                    }
                } catch (rErr) {
                    console.warn('[HeroAssetManager] Could not load run.fbx:', rErr);
                }

                reportProgress('Memuat Animasi Lompatan Atletis...', 75);

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

                        // Pastikan lompat normal 100% murni di tempat tanpa drift horizontal pada Hips
                        const hipsTrack = jnClip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                        if (hipsTrack) {
                            for (let i = 0; i < hipsTrack.values.length; i += 3) {
                                hipsTrack.values[i] = 0;     // X = 0 (kiri-kanan)
                                hipsTrack.values[i + 2] = 0; // Z = 0 (maju-mundur)
                            }
                        }

                        this.clips.jumpNormal = jnClip;
                    }
                } catch (jnErr) {
                    console.warn('[HeroAssetManager] Could not load jump-normal.fbx:', jnErr);
                }

                reportProgress('Memuat Combo Tendangan Melee...', 88);

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
                                        hipsTrack.values[i * 3 + 2] = origZ;
                                    }
                                    this.kick3RootMotion = { times, z, totalZ: z[z.length - 1] };
                                }
                            }

                            this.clips[kKey] = kickClip;
                        }
                    } catch (kErr) {
                        console.warn(`[HeroAssetManager] Could not load ${files[kKey]}:`, kErr);
                    }
                }

                reportProgress('Memuat Combo Pukulan Melee...', 96);

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

                reportProgress('Asset Hero Red Fox Siap!', 100);


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
                child.frustumCulled = false;
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
        instance.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
        instance.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
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

        // Attach taking damage hit animations
        if (window.GeneralTakingAssetManager) {
            if (window.GeneralTakingAssetManager.isLoaded) {
                window.GeneralTakingAssetManager.setupInstance(instance);
            } else {
                window.GeneralTakingAssetManager.instancesPending.push(instance);
                window.GeneralTakingAssetManager.load();
            }
        }

        // Attach death animations (dead1.fbx, dead2.fbx)
        if (window.GeneralDeadAssetManager) {
            if (window.GeneralDeadAssetManager.isLoaded) {
                window.GeneralDeadAssetManager.setupInstance(instance);
            } else {
                window.GeneralDeadAssetManager.instancesPending.push(instance);
                window.GeneralDeadAssetManager.load();
            }
        }

        instance.isLoaded = true;
        if (typeof instance.onLoaded === 'function') {
            instance.onLoaded(instance);
        }
    }
};

// Start preloading hero FBX assets immediately in the background
if (typeof window !== 'undefined') {
    const preloadAll = () => {
        if (window.HeroAssetManager) window.HeroAssetManager.load();
        if (window.GeneralTakingAssetManager) window.GeneralTakingAssetManager.load();
        if (window.GeneralDeadAssetManager) window.GeneralDeadAssetManager.load();
        if (window.EnemyFoxTreeAssetManager) window.EnemyFoxTreeAssetManager.load();
    };
    window.addEventListener('DOMContentLoaded', preloadAll);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        preloadAll();
    }
}

/**
 * Auto-Lock Attack System:
 * Saat pemain menekan tombol serang (Punch / Kick), karakter mengunci hadapan
 * ke karakter terdekat. Jika ada banyak karakter, pilih yang paling dekat dan
 * HP bar-nya paling kecil. Target dipertahankan selama combo agar tidak glitch/flicker.
 */
function autoLockToNearestEnemy(playerRoot, maxRange = 3.5) {
    if (!playerRoot) return;
    const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) ? spawnedFoxesList : [];
    if (list.length === 0) return;

    const pPos = playerRoot.position;

    // Vektor hadap depan pemain saat ini (+Z lokal)
    const forwardX = Math.sin(playerRoot.rotation.y);
    const forwardZ = Math.cos(playerRoot.rotation.y);

    // TARGET STICKINESS: Jika pemain sebelumnya sudah mengunci target dan target itu masih hidup
    // serta dalam jangkauan melee dekat (< 2.8m), pertahankan target tersebut agar combo pukulan
    // tidak glitch / flicker melompat ke target lain di tengah jalan
    const curTarget = playerRoot._lockedAttackTarget;
    if (curTarget && curTarget.root && curTarget.root.visible) {
        const isDead = (curTarget.ai && curTarget.ai.isDead) || (curTarget.model && curTarget.model.isDead) || ((curTarget.health || 0) <= 0);
        if (!isDead) {
            const dist = playerRoot.position.distanceTo(curTarget.root.position);
            if (dist <= 2.8) {
                const dx = curTarget.root.position.x - pPos.x;
                const dz = curTarget.root.position.z - pPos.z;
                playerRoot.rotation.y = Math.atan2(dx, dz);
                return;
            }
        }
    }

    let bestTarget = null;
    let bestScore = Infinity;

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || !item.root || !item.root.visible) continue;
        const isDead = (item.ai && item.ai.isDead) || (item.model && item.model.isDead) || ((item.health || 0) <= 0);
        if (isDead) continue;

        const ePos = item.root.position;
        const dx = ePos.x - pPos.x;
        const dz = ePos.z - pPos.z;
        const distSq = dx * dx + dz * dz;

        // Dalam radius serang (> 0.04m dan < maxRange)
        if (distSq > maxRange * maxRange || distSq < 0.04) continue;

        const dist = Math.sqrt(distSq);
        const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;
        // Prioritaskan musuh di depan / sekeliling hadapan pemain
        if (dot < -0.35) continue;

        const curHp = (item.ai && typeof item.ai.health === 'number') ? item.ai.health : (item.health || 100);
        const maxHp = (item.ai && typeof item.ai.maxHealth === 'number') ? item.ai.maxHealth : (item.maxHealth || 100);
        const hpRatio = THREE.MathUtils.clamp(curHp / Math.max(1, maxHp), 0, 1);

        // FORMULA SKOR: Jarak terdekat + HP bar paling kecil
        // Nilai score terendah adalah target terbaik untuk diserang dan dihabisi
        const score = (dist * 1.0) + (hpRatio * 1.6) - (dot * 0.4);

        if (score < bestScore) {
            bestScore = score;
            bestTarget = item;
        }
    }

    if (bestTarget && bestTarget.root) {
        playerRoot._lockedAttackTarget = bestTarget;
        playerRoot._combatLockTarget = bestTarget;
        window.currentCombatLockTarget = bestTarget;
        const dx = bestTarget.root.position.x - pPos.x;
        const dz = bestTarget.root.position.z - pPos.z;
        playerRoot.rotation.y = Math.atan2(dx, dz); // Kunci hadapan karakter ke target
    }
}
window.autoLockToNearestEnemy = autoLockToNearestEnemy;

/**
 * Creates and returns the Hero 3D Character model instance.
 * Aliased as createWolfCharacterModel for seamless backwards-compatibility.
 */
function createWolfCharacterModel(speciesKey = 'red') {
    if (speciesKey === 'foxtree' || speciesKey === 'enemy-foxtree') {
        return createEnemyFoxTreeModel();
    }
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
        currentWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        targetWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        isLoaded: false,
        wasInAir: false,
        isJumping: false,
        isStationaryJump: false,
        jumpTimer: 0.0,
        jumpDuration: 0.72,
        idleTimer: 0.0,
        activeIdleKey: null,
        idleCycleTimer: 0.0,

        // Taking damage / Hit reaction state (hero/general/taking/hit*.fbx)
        isTakingHit: false,
        activeHitKey: null,
        hitTimer: 0.0,
        hitDuration: 0.55,
        strikeProcessed: false,

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
        queuedNextAction: null, // Antrean transisi silang ('punch' atau 'kick') saat spam bergantian
        wasMoving: false,

        // Jump state
        activeJumpKey: 'jump',
        jumpImpulsePending: false,
        jumpTakeoffTime: 0.0,
        jumpImpulseVel: 0.0,

        // Death state (hero/general/dead/dead1.fbx, dead2.fbx)
        isDead: false,
        activeDeadKey: null,

        triggerDeath(forcedDeadKey = null) {
            if (this.isDead) return;
            this.isDead = true;
            this.isTakingHit = false;
            this.isPunching = false;
            this.isKicking = false;
            this.isJumping = false;
            this.jumpImpulsePending = false;

            const deadChoices = ['dead1', 'dead2'];
            const chosenKey = forcedDeadKey || deadChoices[Math.floor(Math.random() * deadChoices.length)];
            this.activeDeadKey = chosenKey;

            ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    this.actions[k].fadeOut(0.2);
                }
            });

            const action = this.actions ? this.actions[chosenKey] : null;
            if (action) {
                action.reset();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.fadeIn(0.15);
                action.play();
                if (this.targetWeights) this.targetWeights[chosenKey] = 1.0;
                if (this.currentWeights) this.currentWeights[chosenKey] = 1.0;
            }
        },

        /**
         * Reaksi menerima pukulan / tendangan (Damage Reaction):
         * Memilih secara acak antara hit1.fbx dan hit2.fbx dari hero/general/taking/
         * Menghentikan aksi serangan yang sedang berlangsung (hit stun) dan memberi micro-knockback.
         */
        takeHit(attackerPos) {
            if (this.isDead) return;
            const hitChoices = ['hit1', 'hit2'];
            const hitKey = hitChoices[Math.floor(Math.random() * hitChoices.length)];

            if (this.isPunching) this.cancelPunch();
            if (this.isKicking) this.cancelKick();
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isTakingHit = true;
            this.activeHitKey = hitKey;
            this.hitTimer = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            const action = this.actions[hitKey];
            if (action) {
                const clip = action.getClip();
                const rate = 1.35;
                action.timeScale = rate;
                this.hitDuration = (clip && clip.duration) ? Math.min(0.65, clip.duration / rate) : 0.55;

                action.reset();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.play();
                this.currentWeights[hitKey] = Math.max(this.currentWeights[hitKey] || 0, 0.75);
                action.setEffectiveWeight(this.currentWeights[hitKey]);
            } else {
                this.hitDuration = 0.5;
            }

            ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            hitChoices.forEach(k => {
                this.targetWeights[k] = (k === hitKey) ? 1.0 : 0.0;
            });

            // Micro knockback menjauh dari penyerang
            if (attackerPos && this.root) {
                const kbDir = new THREE.Vector3().subVectors(this.root.position, attackerPos).setY(0);
                if (kbDir.lengthSq() > 0.001) {
                    kbDir.normalize();
                    this.root.position.addScaledVector(kbDir, 0.22);
                }
            }
        },

        takeDamage(amount, attackerPos) {
            if (this.isDead) return;
            this.takeHit(attackerPos);
        },

        /**
         * Combo tendangan berbasis jumlah klik:
         * - 1x klik  -> kick1
         * - 2x klik  -> kick1 -> kick2
         * - 3x klik  -> kick1 -> kick2 -> kick3
         * - Spam     -> kick1 -> kick2 -> kick3 (berulang), setiap tendangan SELALU selesai dulu
         *   sebelum tendangan berikutnya dimulai. Klik berlebih tidak memotong animasi.
         */
        triggerKick() {
            if (this.isDead || this.isTakingHit) return;

            // Cek Stamina: Jika stamina sisa <= 10%, dilarang kick
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.canPerformAction === 'function') {
                if (!FoxStaminaState.canPerformAction()) return;
            }

            autoLockToNearestEnemy(this.root);

            // JIKA SEDANG MEMUKUL (PUNCH):
            // Pastikan animasi pukulan yang sedang berjalan selesai tuntas dulu (entah punch1, 2, atau 3),
            // baru kemudian transisi mengeksekusi tendangan.
            if (this.isPunching) {
                this.queuedPunches = 0;
                this.hasQueuedPunch = false;
                this.queuedNextAction = 'kick';
                return;
            }

            if (this.isKicking) {
                this.queuedNextAction = null; // User tetap konsisten memilih kick
                // Simpan klik ke antrean (maks 2 tendangan lanjutan agar tidak menumpuk tanpa akhir)
                this.queuedKicks = Math.min(2, this.queuedKicks + 1);
                this.hasQueuedKick = this.queuedKicks > 0;
                return;
            }

            // Klik baru dari keadaan diam / selesai menendang: selalu mulai dari kick1
            this.queuedNextAction = null;
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
            this.strikeProcessed = false;
            this.activeKickKey = kickKey;
            this.kickComboIndex = comboKeys.indexOf(kickKey);
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // Tendangan mengonsumsi stamina
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.consume === 'function') {
                FoxStaminaState.consume(12);
            }

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
            this.queuedNextAction = null;
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
            if (this.isDead || this.isTakingHit) return;

            // Cek Stamina: Jika stamina sisa <= 10%, dilarang punch
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.canPerformAction === 'function') {
                if (!FoxStaminaState.canPerformAction()) return;
            }

            autoLockToNearestEnemy(this.root);

            // JIKA SEDANG MENENDANG (KICK):
            // Pastikan animasi tendangan yang sedang berjalan selesai tuntas dulu (entah kick1, 2, atau 3),
            // baru kemudian transisi mengeksekusi pukulan.
            if (this.isKicking) {
                this.queuedKicks = 0;
                this.hasQueuedKick = false;
                this.queuedNextAction = 'punch';
                return;
            }

            if (this.isPunching) {
                this.queuedNextAction = null; // User tetap konsisten memilih punch
                // Simpan klik ke antrean (maks 2 pukulan lanjutan agar tidak menumpuk tanpa akhir)
                this.queuedPunches = Math.min(2, this.queuedPunches + 1);
                this.hasQueuedPunch = this.queuedPunches > 0;
                return;
            }

            // Klik baru dari keadaan diam / selesai memukul: selalu mulai dari punch1
            this.queuedNextAction = null;
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
            this.strikeProcessed = false;
            this.activePunchKey = punchKey;
            this.punchComboIndex = comboKeys.indexOf(punchKey);
            this.punchTimer = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // Pukulan mengonsumsi stamina
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.consume === 'function') {
                FoxStaminaState.consume(8);
            }

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
            this.queuedNextAction = null;
            this.punchTimer = 0.0;
            this.punchComboIndex = 0;
            this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            ['punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
        },

        /**
         * Lompat:
         * - Tidak sprint (atau diam) -> jump-normal.fbx (lompat di tempat, input gerak terkunci sampai selesai, durasi lebih cepat & responsif)
         * - Sprint -> Jump-withrun.fbx (impuls langsung dengan momentum gerak atletis)
         * Mengembalikan true jika impuls fisik harus langsung diterapkan saat itu juga.
         */
        triggerJump(isSprinting = false, isStationary = false) {
            // Jump SELALU meng-cancel semua animasi yang sedang berjalan, baik punch maupun kick
            if (this.isPunching) {
                this.cancelPunch();
            }
            if (this.isKicking) {
                this.cancelKick();
            }
            this.queuedNextAction = null;
            this.queuedPunches = 0;
            this.queuedKicks = 0;
            this.hasQueuedPunch = false;
            this.hasQueuedKick = false;

            const useNormal = !isSprinting && !!this.actions.jumpNormal;
            const key = useNormal ? 'jumpNormal' : 'jump';
            const action = this.actions[key];
            if (!action) return true;

            // 1. Matikan dan hentikan seluruh variasi idle lanjutan (idle2, idle3) seketika
            if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
            if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // 2. Nol-kan target bobot animasi lain seketika agar tidak terintervensi pose sebelumnya
            ['idle', 'idle2', 'idle3', 'walk', 'run', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            this.targetWeights.jump = (key === 'jump') ? 1.0 : 0.0;
            this.targetWeights.jumpRun = (key === 'jump') ? 1.0 : 0.0;
            this.targetWeights.jumpNormal = (key === 'jumpNormal') ? 1.0 : 0.0;

            this.isJumping = true;
            this.isStationaryJump = isStationary || useNormal;
            this.activeJumpKey = key;
            this.jumpTimer = 0.0;

            // Durasi dipercepat agar responsif dan lincah (2.0x untuk lompat di tempat)
            const rate = useNormal ? 2.0 : 1.30;
            action.timeScale = rate;
            const clip = action.getClip();
            this.jumpDuration = (clip && clip.duration) ? (clip.duration / rate) : 0.62;

            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            this.jumpImpulsePending = false;
            // LANGSUNG eksekusi impuls fisik melompat tanpa delay, responsif seketika
            return true;
        },

        /**
         * Dipanggil seketika saat karakter menyentuh tanah (landing).
         * Mengembalikan kontrol dan me-reset status jump agar pemain bisa langsung jump lagi tanpa jeda tersedat.
         */
        onLanded() {
            this.isJumping = false;
            this.isStationaryJump = false;
            this.jumpImpulsePending = false;
            this.jumpTimer = 0.0;
            this.targetWeights.jump = 0.0;
            this.targetWeights.jumpRun = 0.0;
            this.targetWeights.jumpNormal = 0.0;

            // Reset total cooldown timer idle sama seperti kick dan punch:
            // Variasi idle2 dan idle3 DIKUNCI MATI (stop & weight 0.0),
            // idleTimer di-reset ke 0.0 (cooldown penuh 4.5 detik sebelum variasi idle bisa muncul)
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;
            if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
            if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
            if (this.actions.idle) { this.actions.idle.reset().play(); }
            this.targetWeights.idle = 1.0;
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
        /**
         * Kalibrasi waktu mendarat pukulan / tendangan (Impact Frame):
         * Memastikan animasi hit pada target HANYA terpicu tepat saat kepalan tangan
         * atau kaki mencapai ekstensi penuh (mendarat di tubuh target), BUKAN di awal ancang-ancang.
         */
        _checkMeleeStrike() {
            if (this.strikeProcessed) return;

            const attackKey = this.isPunching ? this.activePunchKey : (this.isKicking ? this.activeKickKey : null);
            if (!attackKey) return;

            const STRIKE_CONFIGS = {
                // Pukulan: tangan lurus/mendarat di tengah siklus animasi
                punch1: { minTime: 0.35, maxTime: 0.50, reach: 1.20, minDot: 0.50 },
                punch2: { minTime: 0.28, maxTime: 0.42, reach: 1.20, minDot: 0.45 },
                punch3: { minTime: 0.45, maxTime: 0.62, reach: 1.25, minDot: 0.40 },
                // Tendangan: kaki terangkat dan melurus mendarat di sasaran
                kick1:  { minTime: 0.38, maxTime: 0.52, reach: 1.28, minDot: 0.50 },
                kick2:  { minTime: 0.42, maxTime: 0.58, reach: 1.30, minDot: 0.35 },
                kick3:  { minTime: 0.40, maxTime: 0.56, reach: 1.32, minDot: 0.35 }
            };

            const cfg = STRIKE_CONFIGS[attackKey] || { minTime: 0.35, maxTime: 0.50, reach: 1.22, minDot: 0.45 };
            const currentAttackTime = this.isPunching ? this.punchTimer : this.kickTimer;

            // Sebelum kepalan tangan atau kaki mendarat di sasaran, JANGAN memicu animasi hit!
            if (currentAttackTime < cfg.minTime || currentAttackTime > cfg.maxTime) return;

            const pPos = this.root.position;
            const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
            const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) ? spawnedFoxesList : [];
            let hitAny = false;

            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (!item || !item.root || !item.root.visible) continue;
                const ePos = item.root.position;
                const dist = pPos.distanceTo(ePos);
                if (dist <= cfg.reach) {
                    const toEnemy = new THREE.Vector3().subVectors(ePos, pPos).setY(0);
                    if (toEnemy.lengthSq() > 0.001) {
                        toEnemy.normalize();
                        if (fwd.dot(toEnemy) >= cfg.minDot) {
                            hitAny = true;
                            const strikeDamage = (attackKey && attackKey.startsWith('kick')) ? 30 : 25;
                            if (item.ai && typeof item.ai.takeDamage === 'function') {
                                item.ai.takeDamage(strikeDamage, pPos);
                            } else if (item.model && typeof item.model.takeDamage === 'function') {
                                item.model.takeDamage(strikeDamage, pPos);
                            } else if (item.model && typeof item.model.takeHit === 'function') {
                                item.model.takeHit(pPos);
                            }
                            if (typeof FoxAIManager !== 'undefined' && FoxAIManager.getAgent) {
                                const ag = FoxAIManager.getAgent(item);
                                if (ag) {
                                    ag.state = 'HIT_STUN';
                                    ag.hitStunTimer = (item.model && item.model.hitDuration) ? item.model.hitDuration : 0.55;
                                }
                            }
                        }
                    }
                }
            }
            if (hitAny) {
                this.strikeProcessed = true;
            }
        },

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

            // 0. PRIORITAS UTAMA: KEMATIAN KARAKTER (DEAD ANIMATION)
            if (this.isDead) {
                if (this.activeDeadKey && this.actions && this.actions[this.activeDeadKey]) {
                    this.actions[this.activeDeadKey].setEffectiveWeight(1.0);
                }
                if (this.actions) {
                    Object.keys(this.actions).forEach(k => {
                        if (k !== this.activeDeadKey && this.actions[k]) {
                            this.actions[k].setEffectiveWeight(0.0);
                        }
                    });
                }
                this.mixer.update(dt);
                return;
            }

            // REAKSI TERKENA HIT / DAMAGE (TAKING HIT)
            if (this.isTakingHit) {
                this.hitTimer += dt;
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'run', 'idle', 'idle2', 'idle3', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3'].forEach(key => {
                    this.targetWeights[key] = 0.0;
                });
                ['hit1', 'hit2'].forEach(key => {
                    this.targetWeights[key] = (key === this.activeHitKey) ? 1.0 : 0.0;
                });

                if (this.hitTimer >= this.hitDuration) {
                    this.isTakingHit = false;
                    this.activeHitKey = null;
                    this.hitTimer = 0.0;
                    ['hit1', 'hit2'].forEach(key => {
                        this.targetWeights[key] = 0.0;
                        if (this.actions[key]) this.actions[key].setEffectiveWeight(0.0);
                    });
                    this.targetWeights.idle = 1.0;
                    if (this.actions.idle) this.actions.idle.reset().play();
                }
            } else if (this.isPunching) {
                this.punchTimer += dt;
                this._checkMeleeStrike();
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
                    // Cek jika user spam kick saat memukul: pastikan punch selesai tuntas lalu eksekusi kick
                    if (this.queuedNextAction === 'kick') {
                        this.isPunching = false;
                        this.activePunchKey = null;
                        this.queuedPunches = 0;
                        this.hasQueuedPunch = false;
                        this.punchTimer = 0.0;
                        this.punchComboIndex = 0;
                        this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                        this.queuedNextAction = null;
                        this.kickComboIndex = 0;
                        this.queuedKicks = 0;
                        this._startKick('kick1');
                        return;
                    }

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
                this._checkMeleeStrike();
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

                    // Cek jika user spam punch saat menendang: pastikan kick selesai tuntas lalu eksekusi punch
                    if (this.queuedNextAction === 'punch') {
                        this.isKicking = false;
                        this.activeKickKey = null;
                        this.queuedKicks = 0;
                        this.hasQueuedKick = false;
                        this.kickTimer = 0.0;
                        this.kick3PrevTime = 0.0;
                        this.kickComboIndex = 0;
                        this.lastKickEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                        this.queuedNextAction = null;
                        this.punchComboIndex = 0;
                        this.queuedPunches = 0;
                        this._startPunch('punch1');
                        return;
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

                // Animasi lompat selesai -> panggil onLanded untuk reset cooldown idle & status jump
                if (this.jumpTimer >= this.jumpDuration) {
                    this.onLanded();
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
                        if (speed < 0) {
                            // Saat mundur cepat (Shift + S), gunakan animasi langkah mundur cepat (walk terbalik dengan cadence tinggi)
                            this.targetWeights.walk = 1.0;
                            this.targetWeights.run = 0.0;
                        } else {
                            // Running stride: smooth ramp from walk to full run
                            const runBlend = Math.min(1.0, (absSpeed - 1.8) / 2.2);
                            this.targetWeights.walk = Math.max(0.0, 1.0 - runBlend);
                            this.targetWeights.run = runBlend;
                        }
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
            const blendSpeed = this.isTakingHit ? 35.0 : ((this.isKicking || this.isPunching) ? 28.0 : (isMoving ? 18.0 : (isGrounded ? 12.0 : 16.0)));
            for (const key of ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2']) {
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
                const walkPace = (absSpeed <= 0.05) ? 0.85 : Math.max(0.55, Math.min(1.85, (absSpeed / 1.65) * 0.95));
                this.actions.walk.timeScale = (speed < 0) ? -walkPace : walkPace;
            }
            if (this.actions.run) {
                const runPace = Math.max(0.70, Math.min(1.6, absSpeed / 5.2));
                this.actions.run.timeScale = runPace;
            }
            if (this.actions.jump) this.actions.jump.timeScale = 1.25;      // Jump-withrun.fbx
            if (this.actions.jumpNormal) this.actions.jumpNormal.timeScale = 1.75; // jump-normal.fbx

            // Step the Three.js AnimationMixer
            this.mixer.update(dt);
        },

        resetAnimation() {
            this.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
            this.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0 };
            this.wasInAir = false;
            this.isJumping = false;
            this.isStationaryJump = false;
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

            this.isDead = false;
            this.activeDeadKey = null;
            if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1.0); }
            if (this.actions.idle2) { this.actions.idle2.stop(); this.actions.idle2.setEffectiveWeight(0.0); }
            if (this.actions.idle3) { this.actions.idle3.stop(); this.actions.idle3.setEffectiveWeight(0.0); }
            if (this.actions.walk) this.actions.walk.setEffectiveWeight(0.0);
            if (this.actions.run) this.actions.run.setEffectiveWeight(0.0);
            if (this.actions.jump) this.actions.jump.setEffectiveWeight(0.0);
            if (this.actions.jumpRun) this.actions.jumpRun.setEffectiveWeight(0.0);
            if (this.actions.jumpNormal) this.actions.jumpNormal.setEffectiveWeight(0.0);
            ['kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2', 'dead1', 'dead2'].forEach(k => {
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

/* ===================================================================
   ENEMY FOXTREE 3D CHARACTER MODEL & ANIMATION MANAGER (hero/enemy-foxtree/*)
   Features:
   - Mixamo-rigged FBX Skinned Mesh (hero/enemy-foxtree/Idle.fbx)
   - Three.js SkeletonUtils cloning for multi-instance enemy spawning
   - AnimationMixer integration for:
     * idle: Stand / Idle breathing (hero/enemy-foxtree/Idle.fbx)
     * walk: Walking locomotion stride (hero/red/walk.fbx fallback)
     * punch1: Primary melee punch strike (hero/enemy-foxtree/combat/punch/punch1.fbx)
     * punch2: Secondary melee punch strike (hero/enemy-foxtree/combat/punch/punch2.fbx)
     * punch3: Heavy finishing punch strike (hero/enemy-foxtree/combat/punch/punch3.fbx)
   - Proportional scale (~1.85m) matching player & Pandora world
   =================================================================== */

function getEnemyFoxTreeBasePath() {
    if (typeof document !== 'undefined') {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('fox-model.js')) {
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/enemy-foxtree/');
            }
        }
    }
    return 'hero/enemy-foxtree/';
}

const ENEMY_FOXTREE_CONFIG = {
    getPath() {
        return getEnemyFoxTreeBasePath();
    },
    files: {
        idle: 'Idle.fbx',
        punch1: 'combat/punch/punch1.fbx',
        punch2: 'combat/punch/punch2.fbx',
        punch3: 'combat/punch/punch3.fbx'
    },
    baseScale: 1.85,
    yOffset: 0.0,
    facingDirection: new THREE.Vector3(0, 0, 1)
};

window.EnemyFoxTreeAssetManager = {
    isLoaded: false,
    isLoading: false,
    loadPromise: null,
    baseModel: null,
    clips: {
        idle: null,
        walk: null,
        run: null,
        punch1: null,
        punch2: null,
        punch3: null
    },
    instancesPending: [],

    load() {
        if (this.loadPromise) return this.loadPromise;
        this.isLoading = true;

        this.loadPromise = new Promise(async (resolve, reject) => {
            try {
                if (typeof THREE.FBXLoader === 'undefined') {
                    throw new Error('THREE.FBXLoader is not available. Please include FBXLoader.js and fflate.min.js.');
                }

                const loader = new THREE.FBXLoader();
                const loadFBX = (url) => (window.PandoraAssetCache ? window.PandoraAssetCache.loadFBX(url, loader) : new Promise((res, rej) => loader.load(url, res, undefined, rej)));

                const basePath = ENEMY_FOXTREE_CONFIG.getPath();
                const files = ENEMY_FOXTREE_CONFIG.files;

                console.log('[EnemyFoxTreeAssetManager] Loading Enemy FoxTree FBX assets from', basePath);

                // 1. Load Idle (Base Model + Rig + Primary Idle Animation)
                const idleObj = await loadFBX(basePath + files.idle);
                idleObj.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.frustumCulled = false;
                        if (child.material) {
                            const makeMatte = (m) => {
                                const newMat = new THREE.MeshLambertMaterial({
                                    map: m.map || null,
                                    color: m.color ? m.color : new THREE.Color(0xffffff),
                                    emissive: new THREE.Color(0x222222),
                                    skinning: true
                                });
                                if (newMat.map) newMat.map.encoding = THREE.LinearEncoding;
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

                // 2. Walk Animation (Ambil dari hero/general/walk.fbx atau HeroAssetManager.clips.walk)
                try {
                    const heroWalk = window.HeroAssetManager && window.HeroAssetManager.clips && window.HeroAssetManager.clips.walk;
                    if (heroWalk) {
                        this.clips.walk = heroWalk.clone();
                        this.clips.walk.name = 'walk';
                    } else {
                        const walkObj = await loadFBX(getGeneralHeroBasePath() + 'walk.fbx');
                        if (walkObj && walkObj.animations && walkObj.animations.length > 0) {
                            const walkClip = walkObj.animations[0].clone();
                            walkClip.name = 'walk';
                            this.clips.walk = walkClip;
                        }
                    }
                } catch (wErr) {
                    console.warn('[EnemyFoxTreeAssetManager] Walk clip load note:', wErr);
                }

                // 2b. Run Animation (Ambil dari hero/general/run.fbx atau HeroAssetManager.clips.run)
                try {
                    const heroRun = window.HeroAssetManager && window.HeroAssetManager.clips && window.HeroAssetManager.clips.run;
                    if (heroRun) {
                        this.clips.run = heroRun.clone();
                        this.clips.run.name = 'run';
                    } else {
                        const runObj = await loadFBX(getGeneralHeroBasePath() + 'run.fbx');
                        if (runObj && runObj.animations && runObj.animations.length > 0) {
                            const runClip = runObj.animations[0].clone();
                            runClip.name = 'run';
                            this.clips.run = runClip;
                        }
                    }
                } catch (rErr) {
                    console.warn('[EnemyFoxTreeAssetManager] Run clip load note:', rErr);
                }

                // 3. Load Punch 1 (combat/punch/punch1.fbx)
                try {
                    const p1Obj = await loadFBX(basePath + files.punch1);
                    if (p1Obj.animations && p1Obj.animations.length > 0) {
                        const p1Clip = p1Obj.animations[0].clone();
                        p1Clip.name = 'punch1';
                        this.clips.punch1 = p1Clip;
                    }
                } catch (p1Err) {
                    console.warn('[EnemyFoxTreeAssetManager] Could not load punch1.fbx:', p1Err);
                }

                // 4. Load Punch 2 (combat/punch/punch2.fbx)
                try {
                    const p2Obj = await loadFBX(basePath + files.punch2);
                    if (p2Obj.animations && p2Obj.animations.length > 0) {
                        const p2Clip = p2Obj.animations[0].clone();
                        p2Clip.name = 'punch2';
                        this.clips.punch2 = p2Clip;
                    }
                } catch (p2Err) {
                    console.warn('[EnemyFoxTreeAssetManager] Could not load punch2.fbx:', p2Err);
                }

                // 5. Load Punch 3 (combat/punch/punch3.fbx)
                try {
                    const p3Obj = await loadFBX(basePath + files.punch3);
                    if (p3Obj.animations && p3Obj.animations.length > 0) {
                        const p3Clip = p3Obj.animations[0].clone();
                        p3Clip.name = 'punch3';
                        this.clips.punch3 = p3Clip;
                    }
                } catch (p3Err) {
                    console.warn('[EnemyFoxTreeAssetManager] Could not load punch3.fbx:', p3Err);
                }

                this.isLoaded = true;
                this.isLoading = false;
                console.log('[EnemyFoxTreeAssetManager] Enemy FoxTree assets successfully loaded!');

                // Resolve all pending instances waiting for asset load
                this.instancesPending.forEach(inst => this.setupInstance(inst));
                this.instancesPending = [];

                resolve(this);
            } catch (err) {
                console.error('[EnemyFoxTreeAssetManager] Failed to load enemy FBX assets:', err);
                this.isLoading = false;
                reject(err);
            }
        });

        return this.loadPromise;
    },

    setupInstance(instance) {
        if (!this.baseModel) return;

        let modelClone;
        if (typeof THREE.SkeletonUtils !== 'undefined') {
            modelClone = THREE.SkeletonUtils.clone(this.baseModel);
        } else {
            console.warn('[EnemyFoxTreeAssetManager] THREE.SkeletonUtils missing, falling back to direct clone');
            modelClone = this.baseModel.clone(true);
        }

        modelClone.position.set(0, ENEMY_FOXTREE_CONFIG.yOffset, 0);

        modelClone.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.frustumCulled = false;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.roughness = 1.0;
                        m.metalness = 0.0;
                        if (m.emissive) m.emissive.set(0x222222);
                    });
                }
            }
        });

        instance.meshContainer.add(modelClone);
        instance.modelMesh = modelClone;

        // Initialize AnimationMixer
        const mixer = new THREE.AnimationMixer(modelClone);
        instance.mixer = mixer;
        instance.actions = {};
        instance.currentWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
        instance.targetWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };

        // Fallback sync walk & run clips jika HeroAssetManager sudah selesai
        if (!this.clips.walk && window.HeroAssetManager && window.HeroAssetManager.clips && window.HeroAssetManager.clips.walk) {
            this.clips.walk = window.HeroAssetManager.clips.walk.clone();
            this.clips.walk.name = 'walk';
        }
        if (!this.clips.run && window.HeroAssetManager && window.HeroAssetManager.clips && window.HeroAssetManager.clips.run) {
            this.clips.run = window.HeroAssetManager.clips.run.clone();
            this.clips.run.name = 'run';
        }

        if (this.clips.idle) {
            const idleAction = mixer.clipAction(this.clips.idle);
            idleAction.setEffectiveWeight(1.0);
            idleAction.play();
            instance.actions.idle = idleAction;
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

        ['punch1', 'punch2', 'punch3'].forEach(k => {
            if (this.clips[k]) {
                const punchAction = mixer.clipAction(this.clips[k]);
                punchAction.setLoop(THREE.LoopOnce, 1);
                punchAction.clampWhenFinished = true;
                punchAction.setEffectiveWeight(0.0);
                punchAction.play();
                instance.actions[k] = punchAction;
            }
        });

        // Attach taking damage hit animations
        if (window.GeneralTakingAssetManager) {
            if (window.GeneralTakingAssetManager.isLoaded) {
                window.GeneralTakingAssetManager.setupInstance(instance);
            } else {
                window.GeneralTakingAssetManager.instancesPending.push(instance);
                window.GeneralTakingAssetManager.load();
            }
        }

        // Attach death animations (dead1.fbx, dead2.fbx)
        if (window.GeneralDeadAssetManager) {
            if (window.GeneralDeadAssetManager.isLoaded) {
                window.GeneralDeadAssetManager.setupInstance(instance);
            } else {
                window.GeneralDeadAssetManager.instancesPending.push(instance);
                window.GeneralDeadAssetManager.load();
            }
        }

        // Segera evaluasi pose animasi idle awal agar tulang kaki menapak lantai secara presisi di y=0
        if (mixer) {
            mixer.update(0.016);
        }
    }
};

/**
 * Factory function: creates a new Enemy FoxTree instance
 */
function createEnemyFoxTreeModel() {
    const enemyRoot = new THREE.Group();
    enemyRoot.name = 'EnemyFoxTreeRoot_' + Math.random().toString(36).substr(2, 7);

    const baseScale = ENEMY_FOXTREE_CONFIG.baseScale;
    enemyRoot.scale.set(baseScale, baseScale, baseScale);
    enemyRoot.userData.speciesKey = 'foxtree';
    enemyRoot.userData.isEnemyCharacter = true;
    enemyRoot.userData.isFoxTree = true;

    const meshContainer = new THREE.Group();
    meshContainer.name = 'EnemyFoxTreeMeshContainer';
    enemyRoot.add(meshContainer);

    // Dummy compatibility groups
    const dummyBody = new THREE.Group();
    enemyRoot.add(dummyBody);
    const dummyJoint = () => ({ rotation: { set: () => {}, x: 0, y: 0, z: 0 }, position: { set: () => {}, x: 0, y: 0, z: 0 } });
    const dummyLeg = () => ({ hip: dummyJoint(), knee: dummyJoint(), paw: dummyJoint() });

    const enemyInstance = {
        root: enemyRoot,
        meshContainer: meshContainer,
        bodyTiltGroup: dummyBody,
        neckJoint: dummyJoint(),
        headJoint: dummyJoint(),
        earLJoint: dummyJoint(),
        earRJoint: dummyJoint(),
        tailBaseJoint: dummyJoint(),
        tailMidJoint: dummyJoint(),
        tailTipJoint: dummyJoint(),
        legFL: dummyLeg(),
        legFR: dummyLeg(),
        legBL: dummyLeg(),
        legBR: dummyLeg(),
        BASE_HIP_Y: 0.0,
        modelMesh: null,
        mixer: null,
        actions: {},
        currentWeights: { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        targetWeights: { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        baseScale: baseScale,
        isEnemy: true,

        // Death state (hero/general/dead/dead1.fbx, dead2.fbx)
        isDead: false,
        activeDeadKey: null,

        triggerDeath(forcedDeadKey = null) {
            if (this.isDead) return;
            this.isDead = true;
            this.isTakingHit = false;
            this.isPunching = false;

            const deadChoices = ['dead1', 'dead2'];
            const chosenKey = forcedDeadKey || deadChoices[Math.floor(Math.random() * deadChoices.length)];
            this.activeDeadKey = chosenKey;

            ['idle', 'walk', 'run', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    this.actions[k].fadeOut(0.2);
                }
            });

            const action = this.actions ? this.actions[chosenKey] : null;
            if (action) {
                action.reset();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.fadeIn(0.15);
                action.play();
                if (this.targetWeights) this.targetWeights[chosenKey] = 1.0;
                if (this.currentWeights) this.currentWeights[chosenKey] = 1.0;
            }
        },

        triggerRevive() {
            this.isDead = false;
            this.isTakingHit = false;
            this.isPunching = false;
            this.activeDeadKey = null;

            ['dead1', 'dead2', 'hit1', 'hit2', 'punch1', 'punch2', 'punch3'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
                if (this.currentWeights) this.currentWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    this.actions[k].stop();
                    this.actions[k].setEffectiveWeight(0.0);
                }
            });

            if (this.actions) {
                if (this.actions.walk) {
                    this.actions.walk.reset().play();
                    this.actions.walk.setEffectiveWeight(0.0);
                }
                if (this.actions.run) {
                    this.actions.run.reset().play();
                    this.actions.run.setEffectiveWeight(0.0);
                }
                if (this.actions.idle) {
                    this.actions.idle.reset().play();
                    this.actions.idle.setEffectiveWeight(1.0);
                }
            }
            if (this.targetWeights) {
                this.targetWeights.idle = 1.0;
                this.targetWeights.walk = 0.0;
                this.targetWeights.run = 0.0;
            }
            if (this.currentWeights) {
                this.currentWeights.idle = 1.0;
                this.currentWeights.walk = 0.0;
                this.currentWeights.run = 0.0;
            }
        },

        // Taking damage / Hit reaction state (hero/general/taking/hit*.fbx)
        isTakingHit: false,
        activeHitKey: null,
        hitTimer: 0.0,
        hitDuration: 0.55,
        strikeProcessed: false,

        // Punch Combat State
        isPunching: false,
        activePunchKey: null,
        punchComboIndex: 0,
        punchTimer: 0.0,
        punchDuration: 0.85,
        lastPunchEndTime: 0,

        /**
         * Reaksi menerima pukulan / tendangan (Damage Reaction):
         * Memilih secara acak antara hit1.fbx dan hit2.fbx dari hero/general/taking/
         * Menghentikan aksi pukulan yang sedang berlangsung (hit stun) dan memberi micro-knockback.
         */
        takeHit(attackerPos) {
            if (this.isDead) return;
            const hitChoices = ['hit1', 'hit2'];
            const hitKey = hitChoices[Math.floor(Math.random() * hitChoices.length)];

            if (this.isPunching) this.cancelPunch();

            this.isTakingHit = true;
            this.activeHitKey = hitKey;
            this.hitTimer = 0.0;

            const action = this.actions[hitKey];
            if (action) {
                const clip = action.getClip();
                const rate = 1.35;
                action.timeScale = rate;
                this.hitDuration = (clip && clip.duration) ? Math.min(0.65, clip.duration / rate) : 0.55;

                action.reset();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.play();
                this.currentWeights[hitKey] = Math.max(this.currentWeights[hitKey] || 0, 0.75);
                action.setEffectiveWeight(this.currentWeights[hitKey]);
            } else {
                this.hitDuration = 0.5;
            }

            ['idle', 'walk', 'run', 'punch1', 'punch2', 'punch3'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            hitChoices.forEach(k => {
                this.targetWeights[k] = (k === hitKey) ? 1.0 : 0.0;
            });

            // Micro knockback mundur dari penyerang
            if (attackerPos && this.root) {
                const kbDir = new THREE.Vector3().subVectors(this.root.position, attackerPos).setY(0);
                if (kbDir.lengthSq() > 0.001) {
                    kbDir.normalize();
                    this.root.position.addScaledVector(kbDir, 0.22);
                }
            }
        },

        takeDamage(amount, attackerPos) {
            if (this.isDead) return;
            this.takeHit(attackerPos);
        },

        triggerPunch() {
            if (this.isDead || this.isTakingHit || this.isPunching) return;
            const comboKeys = ['punch1', 'punch2', 'punch3'];
            const nextKey = comboKeys[this.punchComboIndex % comboKeys.length];
            this.punchComboIndex++;
            this._startPunch(nextKey);
        },

        _startPunch(punchKey) {
            this.isPunching = true;
            this.strikeProcessed = false;
            this.activePunchKey = punchKey;
            this.punchTimer = 0.0;

            const action = this.actions[punchKey];
            if (action) {
                action.reset();
                action.timeScale = punchKey === 'punch1' ? 1.8 : (punchKey === 'punch2' ? 1.5 : 1.25);
                this.punchDuration = Math.max(0.45, (action.getClip().duration / action.timeScale) * 0.9);
                action.setEffectiveWeight(1.0);
                action.play();
            } else {
                this.punchDuration = 0.8;
            }

            this.targetWeights.punch1 = (punchKey === 'punch1') ? 1.0 : 0.0;
            this.targetWeights.punch2 = (punchKey === 'punch2') ? 1.0 : 0.0;
            this.targetWeights.punch3 = (punchKey === 'punch3') ? 1.0 : 0.0;
            this.targetWeights.idle = 0.0;
            this.targetWeights.walk = 0.0;
            this.targetWeights.hit1 = 0.0;
            this.targetWeights.hit2 = 0.0;
        },

        cancelPunch() {
            if (!this.isPunching) return;
            this.isPunching = false;
            this.activePunchKey = null;
            this.punchTimer = 0.0;
            this.targetWeights.punch1 = 0.0;
            this.targetWeights.punch2 = 0.0;
            this.targetWeights.punch3 = 0.0;
            ['punch1', 'punch2', 'punch3'].forEach(k => {
                if (this.actions[k]) this.actions[k].setEffectiveWeight(0.0);
            });
        },

        updateAnimation(dt, currentSpeed = 0) {
            if (!this.mixer) return;

            // 0. PRIORITAS UTAMA: KEMATIAN ENEMY (DEAD ANIMATION)
            if (this.isDead) {
                if (this.activeDeadKey && this.actions && this.actions[this.activeDeadKey]) {
                    this.actions[this.activeDeadKey].setEffectiveWeight(1.0);
                }
                if (this.actions) {
                    Object.keys(this.actions).forEach(k => {
                        if (k !== this.activeDeadKey && this.actions[k]) {
                            this.actions[k].setEffectiveWeight(0.0);
                        }
                    });
                }
                this.mixer.update(dt);
                return;
            }

            // REAKSI TERKENA HIT / DAMAGE
            if (this.isTakingHit) {
                this.hitTimer += dt;
                ['idle', 'walk', 'run', 'punch1', 'punch2', 'punch3'].forEach(k => {
                    this.targetWeights[k] = 0.0;
                });
                ['hit1', 'hit2'].forEach(k => {
                    this.targetWeights[k] = (k === this.activeHitKey) ? 1.0 : 0.0;
                });

                if (this.hitTimer >= this.hitDuration) {
                    this.isTakingHit = false;
                    this.activeHitKey = null;
                    this.hitTimer = 0.0;
                    ['hit1', 'hit2'].forEach(k => {
                        this.targetWeights[k] = 0.0;
                        if (this.actions[k]) this.actions[k].setEffectiveWeight(0.0);
                    });
                    this.targetWeights.idle = 1.0;
                    if (this.actions.idle) this.actions.idle.reset().play();
                }
            } else if (this.isPunching) {
                this.punchTimer += dt;

                // Melee strike impact window: cek apakah pukulan enemy mengenai player tepat saat kepalan mendarat
                if (!this.strikeProcessed) {
                    const pKey = this.activePunchKey || 'punch1';
                    const ENEMY_PUNCH_CONFIGS = {
                        punch1: { minTime: 0.28, maxTime: 0.42, reach: 1.15, minDot: 0.45 },
                        punch2: { minTime: 0.30, maxTime: 0.45, reach: 1.15, minDot: 0.45 },
                        punch3: { minTime: 0.46, maxTime: 0.62, reach: 1.20, minDot: 0.40 }
                    };
                    const cfg = ENEMY_PUNCH_CONFIGS[pKey] || { minTime: 0.30, maxTime: 0.45, reach: 1.15, minDot: 0.45 };

                    if (this.punchTimer >= cfg.minTime && this.punchTimer <= cfg.maxTime) {
                        const isPlayerDead = Boolean(
                            (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) ||
                            (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isDead)
                        );
                        if (isPlayerDead) {
                            if (this.isPunching && typeof this.cancelPunch === 'function') {
                                this.cancelPunch();
                            }
                            return;
                        }

                        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                            const pPos = wolfCharacter.root.position;
                            const distToPlayer = this.root.position.distanceTo(pPos);
                            if (distToPlayer <= cfg.reach) {
                                const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                                const toP = new THREE.Vector3().subVectors(pPos, this.root.position).setY(0);
                                if (toP.lengthSq() > 0.001) {
                                    toP.normalize();
                                    if (fwd.dot(toP) >= cfg.minDot) {
                                        this.strikeProcessed = true;
                                        if (typeof PlayerHealthState !== 'undefined') {
                                            const cfgDmg = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined')
                                                ? (this.isBoss ? window.ENEMY_COMBAT_CONFIG.boss.damagePerHit : window.ENEMY_COMBAT_CONFIG.nonBoss.damagePerHit)
                                                : 15;
                                            const finalDmg = (typeof this.damagePerHit === 'number') ? this.damagePerHit : cfgDmg;
                                            PlayerHealthState.takeDamage(finalDmg, this.root.position);
                                        }
                                        if (typeof wolfCharacter.takeHit === 'function') {
                                            wolfCharacter.takeHit(this.root.position);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (this.punchTimer >= this.punchDuration) {
                    this.isPunching = false;
                    this.activePunchKey = null;
                    this.targetWeights.punch1 = 0.0;
                    this.targetWeights.punch2 = 0.0;
                    this.targetWeights.punch3 = 0.0;
                    this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                }
            }

            if (!this.isTakingHit && !this.isPunching) {
                const moveSpeed = Math.abs(currentSpeed);
                if (moveSpeed > 2.8) {
                    // BERJALAN CEPAT / SPRINT MENGEJAR PEMAIN: GUNAKAN RUN.FBX!
                    if (this.actions.run) {
                        if (!this.actions.run.isRunning()) this.actions.run.play();
                        this.targetWeights.run = 1.0;
                        this.targetWeights.walk = 0.0;
                        this.targetWeights.idle = 0.0;
                        this.actions.run.timeScale = THREE.MathUtils.clamp(moveSpeed / 4.8, 0.85, 1.35);
                    } else if (this.actions.walk) {
                        if (!this.actions.walk.isRunning()) this.actions.walk.play();
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                        this.targetWeights.idle = 0.0;
                        this.actions.walk.timeScale = THREE.MathUtils.clamp(moveSpeed / 1.65, 0.85, 1.35);
                    } else {
                        this.targetWeights.idle = 1.0;
                        if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
                    }
                } else if (moveSpeed > 0.25) {
                    // BERJALAN SANTAI: GUNAKAN WALK
                    if (this.actions.walk) {
                        if (!this.actions.walk.isRunning()) this.actions.walk.play();
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                        this.targetWeights.idle = 0.0;
                        this.actions.walk.timeScale = THREE.MathUtils.clamp(moveSpeed / 1.65, 0.85, 1.35);
                    } else {
                        this.targetWeights.idle = 1.0;
                        if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
                    }
                } else {
                    this.targetWeights.walk = 0.0;
                    this.targetWeights.run = 0.0;
                    this.targetWeights.idle = 1.0;
                    if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
                }
                this.targetWeights.punch1 = 0.0;
                this.targetWeights.punch2 = 0.0;
                this.targetWeights.punch3 = 0.0;
                this.targetWeights.hit1 = 0.0;
                this.targetWeights.hit2 = 0.0;
            }

            // Safety guard: jika total bobot locomotion 0, pertahankan idle agar tidak pernah kolaps ke bind-pose (T-pose)
            const totalLocoWeight = (this.targetWeights.walk || 0) + (this.targetWeights.run || 0) + (this.targetWeights.punch1 || 0) + (this.targetWeights.punch2 || 0) + (this.targetWeights.punch3 || 0) + (this.targetWeights.hit1 || 0) + (this.targetWeights.hit2 || 0);
            if (totalLocoWeight <= 0.001) {
                this.targetWeights.idle = 1.0;
                if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
            }

            const blendSpeed = this.isTakingHit ? 35.0 : 10.0;
            const keys = ['idle', 'walk', 'run', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2'];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const targetW = this.targetWeights[k] || 0.0;
                this.currentWeights[k] = THREE.MathUtils.lerp(this.currentWeights[k] || 0.0, targetW, Math.min(1.0, blendSpeed * dt));
                if (this.actions[k]) {
                    this.actions[k].setEffectiveWeight(this.currentWeights[k]);
                }
            }

            this.mixer.update(dt);
        },

        resetAnimation() {
            this.isDead = false;
            this.activeDeadKey = null;
            this.isTakingHit = false;
            this.activeHitKey = null;
            this.hitTimer = 0.0;
            this.isPunching = false;
            this.activePunchKey = null;
            this.punchTimer = 0.0;
            this.punchComboIndex = 0;
            this.currentWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
            this.targetWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
            if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1.0); }
            if (this.actions.walk) { this.actions.walk.reset().play(); this.actions.walk.setEffectiveWeight(0.0); }
            if (this.actions.run) { this.actions.run.reset().play(); this.actions.run.setEffectiveWeight(0.0); }
            ['punch1', 'punch2', 'punch3', 'hit1', 'hit2', 'dead1', 'dead2'].forEach(k => {
                if (this.actions[k]) { this.actions[k].stop(); this.actions[k].setEffectiveWeight(0.0); }
            });
        }
    };

    if (window.EnemyFoxTreeAssetManager.isLoaded) {
        window.EnemyFoxTreeAssetManager.setupInstance(enemyInstance);
    } else {
        window.EnemyFoxTreeAssetManager.instancesPending.push(enemyInstance);
        window.EnemyFoxTreeAssetManager.load();
    }

    return enemyInstance;
}

window.createEnemyFoxTreeModel = createEnemyFoxTreeModel;

// ===================================================================
// STARTUP ASSET PRELOADER (MEMUAT SEMUA ASSET HERO RED FOX & ENEMY)
// Mencegah blank/delay saat masuk ke Demo Mode Play
// ===================================================================
window.preloadAllGameAssets = function(onComplete) {
    const loaderOverlay = document.getElementById('pandora-asset-loader');
    const fillEl = document.getElementById('asset-loader-fill');
    const statusEl = document.getElementById('asset-loader-status');
    const pctEl = document.getElementById('asset-loader-pct');

    const updateUI = (text, pct) => {
        if (fillEl) fillEl.style.width = pct + '%';
        if (pctEl) pctEl.innerText = Math.round(pct) + '%';
        if (statusEl) statusEl.innerText = text;
    };

    updateUI('Memuat Mesh & Rig Karakter Red Fox...', 15);

    Promise.all([
        window.HeroAssetManager.load((status, p) => {
            updateUI(status, p);
        }),
        window.EnemyFoxTreeAssetManager.load(),
        window.GeneralTakingAssetManager.load(),
        window.GeneralDeadAssetManager.load()
    ]).then(() => {
        updateUI('Menyiapkan Instance Karakter Red Fox...', 95);
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter) {
            if (typeof createWolfCharacterModel === 'function') {
                window.wolfCharacter = createWolfCharacterModel('red');
                if (typeof wolfCharacter !== 'undefined') {
                    wolfCharacter = window.wolfCharacter;
                }
                if (typeof scene !== 'undefined' && scene && window.wolfCharacter && window.wolfCharacter.root) {
                    scene.add(window.wolfCharacter.root);
                    window.wolfCharacter.root.visible = false; // Siap seketika untuk demo mode
                }
            }
        }
        const isCached = Boolean(window.PandoraAssetCache && window.PandoraAssetCache.stats.cacheHits > 0);
        updateUI(isCached ? 'Semua Asset Siap Digunakan! ⚡ (Loaded from Cache)' : 'Semua Asset Siap Digunakan!', 100);
        setTimeout(() => {
            if (loaderOverlay) {
                loaderOverlay.classList.add('fade-out');
                setTimeout(() => {
                    loaderOverlay.style.display = 'none';
                }, 600);
            }
            if (typeof onComplete === 'function') onComplete();
        }, 350);
    }).catch(err => {
        console.error('[Preloader] Error preloading assets:', err);
        updateUI('Memuat selesai dengan beberapa catatan.', 100);
        setTimeout(() => {
            if (loaderOverlay) {
                loaderOverlay.classList.add('fade-out');
                setTimeout(() => {
                    loaderOverlay.style.display = 'none';
                }, 600);
            }
        }, 500);
    });
};

// Jalankan otomatis saat halaman selesai dimuat
if (typeof window !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => window.preloadAllGameAssets(), 150);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => window.preloadAllGameAssets(), 150);
        });
    }
}