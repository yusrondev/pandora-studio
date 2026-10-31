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

/**
 * Membersihkan track animasi (AnimationClip) agar HANYA menyertakan tulang/sendi yang nyata ada pada model 3D target.
 * Mencegah bug fatal Three.js: bila track animasi berisi tulang yang tidak ada pada rig karakter
 * (misalnya mixamorigLeftHandThumb* pada karakter 3 jari buatan Tripo AI seperti FoxTree, Noxis, Tharon, dll),
 * Three.js PropertyBinding secara default akan mengaitkan track tersebut ke ROOT MODEL, sehingga rotasi jempol
 * langsung memutar badan karakter ~50°-90° dan membuatnya 'doyong' (miring/roboh ke lantai).
 */
const JUMP_RUN_RATE = 1.25;
const JUMP_NORMAL_RATE = 1.75;
const JUMP_BLEND_OUT = 0.08; // Detik terakhir klip dipakai untuk berbaur ke animasi berikutnya
const jumpPhaseCache = new WeakMap();

// Kapan kaki lepas dan menyentuh tanah di dalam klip (detik), dibaca dari titik terendah Hips sebelum
// dan sesudah puncak lompatan, sehingga fisika mengikuti animasi tiap karakter.
function getJumpClipPhases(clip) {
    if (jumpPhaseCache.has(clip)) return jumpPhaseCache.get(clip);
    let phases = { liftoff: clip.duration * 0.27, landing: clip.duration * 0.82 };
    const hips = clip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
    if (hips && hips.times.length > 4) {
        const heightAt = (i) => hips.values[i * 3 + 1];
        let peak = 0;
        for (let i = 1; i < hips.times.length; i++) {
            if (heightAt(i) > heightAt(peak)) peak = i;
        }
        let liftoff = 0;
        for (let i = 1; i < peak; i++) {
            if (heightAt(i) < heightAt(liftoff)) liftoff = i;
        }
        let landing = peak;
        for (let i = peak + 1; i < hips.times.length; i++) {
            if (heightAt(i) < heightAt(landing)) landing = i;
        }
        if (peak > 0 && landing > peak) {
            phases = { liftoff: hips.times[liftoff], landing: hips.times[landing] };
        }
    }
    jumpPhaseCache.set(clip, phases);
    return phases;
}

function sanitizeAnimationClipForModel(clip, rootModel) {
    if (!clip || !rootModel) return clip;
    const existingNodeNames = new Set();
    rootModel.traverse(c => {
        if (c.name) existingNodeNames.add(c.name);
    });
    const cloned = clip.clone();
    if (typeof THREE !== 'undefined' && THREE.PropertyBinding && typeof THREE.PropertyBinding.parseTrackName === 'function') {
        cloned.tracks = cloned.tracks.filter(t => {
            const parsed = THREE.PropertyBinding.parseTrackName(t.name);
            if (!parsed.nodeName) return false;
            return existingNodeNames.has(parsed.nodeName);
        });
    }
    return cloned;
}
window.sanitizeAnimationClipForModel = sanitizeAnimationClipForModel;

/**
 * Mengambil multiplier kecepatan animasi serangan karakter dari konfigurasi Hitbox System
 * @param {Object} instance - Objek karakter (hero, enemy, dynamic hero)
 * @param {string} animKey - Key animasi (misal punch1, punch2, kick1, flyingKick, dll)
 * @returns {number} Pengali kecepatan (default 1.0)
 */
function getCharacterAttackSpeedMultiplier(instance, animKey) {
    if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.getAnimationConfig === 'function') {
        const charKey = (instance && (instance.speciesKey || instance.charKey || (instance.userData && (instance.userData.speciesKey || instance.userData.charKey)))) || 'hero';
        const cfg = window.PandoraHitboxSystem.getAnimationConfig(charKey, animKey);
        if (cfg && typeof cfg.speed === 'number' && cfg.speed > 0) {
            return cfg.speed;
        }
    }
    return 1.0;
}
window.getCharacterAttackSpeedMultiplier = getCharacterAttackSpeedMultiplier;

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
        const targetModel = instance.modelMesh || instance.meshContainer || instance.root;
        ['hit1', 'hit2'].forEach(hitKey => {
            const clip = this.clips[hitKey];
            if (clip && (!instance.actions || !instance.actions[hitKey])) {
                const sanitized = sanitizeAnimationClipForModel(clip, targetModel);
                const act = instance.mixer.clipAction(sanitized);
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
        const targetModel = instance.modelMesh || instance.meshContainer || instance.root;
        ['dead1', 'dead2'].forEach(deadKey => {
            const clip = this.clips[deadKey];
            if (clip && (!instance.actions || !instance.actions[deadKey])) {
                const sanitized = sanitizeAnimationClipForModel(clip, targetModel);
                const act = instance.mixer.clipAction(sanitized);
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

// Global Asset Manager for Block / Shield Animations (hero/general/block.fbx)
window.GeneralBlockAssetManager = {
    isLoaded: false,
    isLoading: false,
    loadPromise: null,
    clip: null,
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
                const basePath = getHeroBasePath();
                const generalPath = getGeneralHeroBasePath();

                console.log('[GeneralBlockAssetManager] Loading block FBX asset...');
                let blockObj = null;
                try {
                    blockObj = await loadFBX(generalPath + 'block.fbx');
                } catch (e1) {
                    blockObj = await loadFBX(basePath + 'block.fbx');
                }

                if (blockObj && blockObj.animations && blockObj.animations.length > 0) {
                    const blockClip = blockObj.animations[0].clone();
                    blockClip.name = 'block';
                    this.clip = blockClip;
                }

                this.isLoaded = true;
                this.isLoading = false;
                console.log('[GeneralBlockAssetManager] Block asset loaded successfully!');

                this.instancesPending.forEach(inst => this.setupInstance(inst));
                this.instancesPending = [];

                resolve(this);
            } catch (err) {
                console.error('[GeneralBlockAssetManager] Failed to load block FBX asset:', err);
                this.isLoading = false;
                reject(err);
            }
        });

        return this.loadPromise;
    },

    setupInstance(instance) {
        if (!instance || !instance.mixer) return;
        const targetModel = instance.modelMesh || instance.meshContainer || instance.root;
        if (this.clip && (!instance.actions || !instance.actions.block)) {
            const sanitized = sanitizeAnimationClipForModel(this.clip, targetModel);
            const act = instance.mixer.clipAction(sanitized);
            act.setLoop(THREE.LoopRepeat);
            act.clampWhenFinished = true;
            act.setEffectiveWeight(0.0);
            act.play();
            instance.actions.block = act;
            if (instance.currentWeights && instance.currentWeights.block === undefined) {
                instance.currentWeights.block = 0.0;
            }
            if (instance.targetWeights && instance.targetWeights.block === undefined) {
                instance.targetWeights.block = 0.0;
            }
        }
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
        backward: 'backward.fbx',
        run: 'run.fbx',
        run: 'run.fbx',
        jump: 'Jump-withrun.fbx',
        jumpRun: 'Jump-withrun.fbx',
        jumpNormal: 'jump-normal.fbx',
        kick1: 'combat/kick/kick1.fbx',
        kick2: 'combat/kick/kick2.fbx',
        kick3: 'combat/kick/kick3.fbx',
        flyingKick: 'combat/kick/flying-kick.fbx',
        punch1: 'combat/punch/punch1.fbx',
        punch2: 'combat/punch/punch2.fbx',
        punch3: 'combat/punch/punch3.fbx',
        flyingPunch: 'combat/punch/flying-punch.fbx',
        block: 'block.fbx'
    },
    baseScale: 1.85, // Ukuran proporsional pahlawan (~1.81m), gagah dan seimbang dengan dunia Pandora
    yOffset: 0.05,   // Elevasi kaki (5cm) agar menapak kokoh di atas tanah/grid saat idle & berjalan tanpa tenggelam
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
        backward: null,
        run: null,
        run: null,
        jump: null,
        jumpRun: null,
        jumpNormal: null,
        kick1: null,
        kick2: null,
        kick3: null,
        flyingKick: null,
        punch1: null,
        punch2: null,
        punch3: null,
        flyingPunch: null,
        block: null
    },
    instancesPending: [],
    kick3RootMotion: null,
    flyingKickRootMotion: null,
    flyingPunchRootMotion: null,

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

    sampleFlyingKickZ(t) {
        if (!this.flyingKickRootMotion) return 0;
        const { times, z, totalZ } = this.flyingKickRootMotion;
        if (t <= times[0]) return 0;
        if (t >= times[times.length - 1]) return totalZ;
        let i = 0;
        while (i < times.length - 1 && times[i + 1] < t) i++;
        const alpha = (t - times[i]) / (times[i + 1] - times[i]);
        return z[i] + alpha * (z[i + 1] - z[i]);
    },

    sampleFlyingPunchZ(t) {
        if (!this.flyingPunchRootMotion) return 0;
        const { times, z, totalZ } = this.flyingPunchRootMotion;
        if (t <= times[0]) return 0;
        if (t >= times[times.length - 1]) return totalZ;
        let i = 0;
        while (i < times.length - 1 && times[i + 1] < t) i++;
        const alpha = (t - times[i]) / (times[i + 1] - times[i]);
        return z[i] + alpha * (z[i + 1] - z[i]);
    },

    load(onProgress = null) {
        // Build game hanya membawa karakter yang dipakai stage-nya
        if (window.PANDORA_GAME_CHARACTERS && !window.PANDORA_GAME_CHARACTERS.includes('red')) return Promise.resolve();
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
                                    emissive: new THREE.Color(0x000000), // Tone Mixamo murni: hitam pekat tanpa pudar
                                    skinning: true
                                });
                                if (newMat.map) {
                                    newMat.map.encoding = THREE.sRGBEncoding;
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

                // 3. Load Walk Animation Clip (Prioritaskan hero/general/walk.fbx agar bebas error 404 di console)
                try {
                    let walkObj = null;
                    try {
                        walkObj = await loadFBX(generalPath + 'walk.fbx');
                    } catch (eWalk) {
                        walkObj = await loadFBX(basePath + files.walk);
                    }
                    if (walkObj && walkObj.animations && walkObj.animations.length > 0) {
                        const walkClip = walkObj.animations[0].clone();
                        walkClip.name = 'walk';
                        this.clips.walk = walkClip;
                    }
                } catch (wErr) {
                    console.warn('[HeroAssetManager] Could not load walk.fbx:', wErr);
                }

                // 3b. Load Backward Animation Clip (hero/general/backward.fbx)
                try {
                    const backObj = await loadFBX(generalPath + (files.backward || 'backward.fbx'));
                    if (backObj && backObj.animations && backObj.animations.length > 0) {
                        const backClip = backObj.animations[0].clone();
                        backClip.name = 'backward';

                        // Ratakan posisi horizontal Hips (X dan Z) ke koordinat referensi idle.fbx agar tidak tertarik / bergeser
                        let refX = 0, refZ = 0;
                        if (this.clips.idle) {
                            const idleHips = this.clips.idle.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                            if (idleHips && idleHips.values.length >= 3) {
                                refX = idleHips.values[0];
                                refZ = idleHips.values[2];
                            }
                        }
                        const backHips = backClip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                        if (backHips && backHips.values.length >= 3) {
                            for (let i = 0; i < backHips.values.length; i += 3) {
                                backHips.values[i] = refX;
                                backHips.values[i + 2] = refZ;
                            }
                        }
                        this.clips.backward = backClip;
                    }
                } catch (bErr) {
                    console.warn('[HeroAssetManager] Could not load backward.fbx:', bErr);
                }

                reportProgress('Memuat Animasi Berlari (run.fbx)...', 60);

                // 4. Load Run Animation Clip (Prioritaskan hero/general/run.fbx agar bebas error 404 di console)
                try {
                    let runObj = null;
                    try {
                        runObj = await loadFBX(generalPath + 'run.fbx');
                    } catch (eRun) {
                        runObj = await loadFBX(basePath + files.run);
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

                // 6. Load Combat Kick Combo Animation Clips (kick1, kick2, kick3, flyingKick)
                for (const kKey of ['kick1', 'kick2', 'kick3', 'flyingKick']) {
                    try {
                        let kickObj = null;
                        if (kKey === 'flyingKick') {
                            try {
                                kickObj = await loadFBX(generalPath + files[kKey]);
                            } catch (eFly) {
                                kickObj = await loadFBX(basePath + files[kKey]);
                            }
                        } else {
                            kickObj = await loadFBX(basePath + files[kKey]);
                        }

                        if (kickObj && kickObj.animations && kickObj.animations.length > 0) {
                            const kickClip = kickObj.animations[0].clone();
                            kickClip.name = kKey;

                            if (kKey === 'flyingKick') {
                                // 1. Bersihkan keyframe Mixamo korup yang durasinya melebihi rotasi tulang (> 2.90s)
                                let maxRotTime = 0;
                                kickClip.tracks.forEach(track => {
                                    if (track.name.toLowerCase().includes('quaternion') || track.name.toLowerCase().includes('rotation')) {
                                        const lastT = track.times[track.times.length - 1];
                                        if (lastT > maxRotTime) maxRotTime = lastT;
                                    }
                                });
                                if (maxRotTime > 0) {
                                    kickClip.duration = maxRotTime;
                                    kickClip.tracks.forEach(track => {
                                        let count = 0;
                                        while (count < track.times.length && track.times[count] <= maxRotTime + 0.001) count++;
                                        if (count < track.times.length) {
                                            const valSize = track.name.toLowerCase().includes('quaternion') ? 4 : 3;
                                            track.times = track.times.slice(0, count);
                                            track.values = track.values.slice(0, count * valSize);
                                        }
                                    });
                                }

                                // 2. Ekstraksi Root Motion (Mixamo Hips forward translation) & Kunci Sumbu X/Z
                                // Memindahkan translasi maju Z dari tulang Hips langsung ke koordinat dunia karakter (this.root.position)
                                // dan mengunci sumbu X & Z sesuai pose dasar idle agar saat mendarat karakter TIDAK PERNAH bergeser ke kanan/mundur!
                                const hipsTrack = kickClip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                                if (hipsTrack && hipsTrack.values && hipsTrack.values.length >= 6) {
                                    const targetMaxT = maxRotTime > 0 ? maxRotTime : kickClip.duration;
                                    const lastIdx = hipsTrack.times.length - 1;
                                    if (hipsTrack.times[lastIdx] < targetMaxT - 0.01) {
                                        const newTimes = new Float32Array(hipsTrack.times.length + 1);
                                        newTimes.set(hipsTrack.times);
                                        newTimes[newTimes.length - 1] = targetMaxT;
                                        const newValues = new Float32Array(hipsTrack.values.length + 3);
                                        newValues.set(hipsTrack.values);
                                        newValues[newValues.length - 3] = hipsTrack.values[lastIdx * 3];
                                        newValues[newValues.length - 2] = hipsTrack.values[lastIdx * 3 + 1];
                                        newValues[newValues.length - 1] = hipsTrack.values[lastIdx * 3 + 2];
                                        hipsTrack.times = newTimes;
                                        hipsTrack.values = newValues;
                                    }

                                    const idleHips = this.clips.idle
                                        ? this.clips.idle.tracks.find(t => t.name.toLowerCase().includes('hips.position'))
                                        : null;
                                    const origX = hipsTrack.values[0];
                                    const origZ = hipsTrack.values[2];
                                    const refX = (idleHips && idleHips.values && idleHips.values.length >= 3) ? idleHips.values[0] : origX;
                                    const refZ = (idleHips && idleHips.values && idleHips.values.length >= 3) ? idleHips.values[2] : origZ;

                                    const times = Float32Array.from(hipsTrack.times);
                                    const z = new Float32Array(hipsTrack.times.length);
                                    for (let i = 0; i < hipsTrack.times.length; i++) {
                                        const curZ = Math.max(0, hipsTrack.values[i * 3 + 2] - origZ);
                                        z[i] = i > 0 ? Math.max(z[i - 1], curZ) : curZ;
                                        hipsTrack.values[i * 3] = refX;     // FLATTEN X agar karakter tidak bergeser ke samping saat mendarat ke idle
                                        hipsTrack.values[i * 3 + 2] = refZ; // FLATTEN Z agar animasi menjadi in-place murni dan maju lewat root.position
                                    }
                                    this.flyingKickRootMotion = { times, z, totalZ: z[z.length - 1] };
                                }
                            }

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

                // 7. Load Combat Punch Combo Animation Clips (punch1, punch2, punch3, flyingPunch)
                for (const pKey of ['punch1', 'punch2', 'punch3', 'flyingPunch']) {
                    try {
                        let punchObj = null;
                        if (pKey === 'flyingPunch') {
                            try {
                                punchObj = await loadFBX(generalPath + files[pKey]);
                            } catch (eFlyP) {
                                punchObj = await loadFBX(basePath + files[pKey]);
                            }
                        } else {
                            punchObj = await loadFBX(basePath + files[pKey]);
                        }

                        if (punchObj && punchObj.animations && punchObj.animations.length > 0) {
                            const punchClip = punchObj.animations[0].clone();
                            punchClip.name = pKey;

                            if (pKey === 'flyingPunch') {
                                // 1. Bersihkan keyframe Mixamo korup yang durasinya melebihi rotasi tulang (> 2.667s)
                                let maxRotTime = 0;
                                punchClip.tracks.forEach(track => {
                                    if (track.name.toLowerCase().includes('quaternion') || track.name.toLowerCase().includes('rotation')) {
                                        const lastT = track.times[track.times.length - 1];
                                        if (lastT > maxRotTime) maxRotTime = lastT;
                                    }
                                });
                                if (maxRotTime <= 0) maxRotTime = 2.666667;
                                punchClip.duration = maxRotTime;

                                punchClip.tracks.forEach(track => {
                                    let count = 0;
                                    while (count < track.times.length && track.times[count] <= maxRotTime + 0.001) count++;
                                    if (count < track.times.length) {
                                        const valSize = track.name.toLowerCase().includes('quaternion') ? 4 : 3;
                                        track.times = track.times.slice(0, count);
                                        track.values = track.values.slice(0, count * valSize);
                                    }
                                });

                                // 2. Ekstraksi Root Motion (Mixamo Hips forward translation)
                                // Memindahkan translasi maju Z dari tulang Hips langsung ke koordinat dunia karakter (this.root.position),
                                // sehingga setelah jump punch mendarat, posisi karakter TIDAK PERNAH mundur / snapback lagi!
                                const hipsTrack = punchClip.tracks.find(t => t.name.toLowerCase().includes('hips.position'));
                                if (hipsTrack && hipsTrack.values && hipsTrack.values.length >= 6) {
                                    const lastIdx = hipsTrack.times.length - 1;
                                    if (hipsTrack.times[lastIdx] < maxRotTime - 0.01) {
                                        const newTimes = new Float32Array(hipsTrack.times.length + 1);
                                        newTimes.set(hipsTrack.times);
                                        newTimes[newTimes.length - 1] = maxRotTime;
                                        const newValues = new Float32Array(hipsTrack.values.length + 3);
                                        newValues.set(hipsTrack.values);
                                        newValues[newValues.length - 3] = hipsTrack.values[lastIdx * 3];
                                        newValues[newValues.length - 2] = hipsTrack.values[lastIdx * 3 + 1];
                                        newValues[newValues.length - 1] = hipsTrack.values[lastIdx * 3 + 2];
                                        hipsTrack.times = newTimes;
                                        hipsTrack.values = newValues;
                                    }

                                    const idleHips = this.clips.idle
                                        ? this.clips.idle.tracks.find(t => t.name.toLowerCase().includes('hips.position'))
                                        : null;
                                    const origX = hipsTrack.values[0];
                                    const origZ = hipsTrack.values[2];
                                    const refX = (idleHips && idleHips.values && idleHips.values.length >= 3) ? idleHips.values[0] : origX;
                                    const refZ = (idleHips && idleHips.values && idleHips.values.length >= 3) ? idleHips.values[2] : origZ;

                                    const times = Float32Array.from(hipsTrack.times);
                                    const z = new Float32Array(hipsTrack.times.length);
                                    for (let i = 0; i < hipsTrack.times.length; i++) {
                                        const curZ = Math.max(0, hipsTrack.values[i * 3 + 2] - origZ);
                                        z[i] = i > 0 ? Math.max(z[i - 1], curZ) : curZ;
                                        hipsTrack.values[i * 3] = refX;     // FLATTEN X ke referensi idle
                                        hipsTrack.values[i * 3 + 2] = refZ; // FLATTEN Z ke referensi idle
                                    }
                                    this.flyingPunchRootMotion = { times, z, totalZ: z[z.length - 1] };
                                }
                            }

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
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.roughness = 1.0;
                        m.metalness = 0.0;
                        if (m.shininess !== undefined) m.shininess = 0;
                        if (m.specular) m.specular.set(0x000000);
                        if (m.emissive) m.emissive.set(0x000000);
                        if (m.map) m.map.encoding = THREE.sRGBEncoding;
                        m.transparent = false;
                        m.opacity = 1.0;
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
        instance.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0 };
        instance.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0 };
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

        if (this.clips.backward) {
            const backwardAction = mixer.clipAction(this.clips.backward);
            backwardAction.setEffectiveWeight(0.0);
            backwardAction.play();
            instance.actions.backward = backwardAction;
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
        for (const kKey of ['kick1', 'kick2', 'kick3', 'flyingKick']) {
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
        for (const pKey of ['punch1', 'punch2', 'punch3', 'flyingPunch']) {
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

        // Attach block animations (hero/general/block.fbx)
        if (window.GeneralBlockAssetManager) {
            if (window.GeneralBlockAssetManager.isLoaded) {
                window.GeneralBlockAssetManager.setupInstance(instance);
            } else {
                window.GeneralBlockAssetManager.instancesPending.push(instance);
                window.GeneralBlockAssetManager.load();
            }
        }

        instance.isLoaded = true;

        // Auto-Pasang Objek 3D Attachment (Pedang, Perisai, Sayap, dll) ke Tulang Karakter
        if (typeof window !== 'undefined' && window.PandoraAttachmentSystem && typeof window.PandoraAttachmentSystem.applyAttachmentsToCharacter === 'function') {
            window.PandoraAttachmentSystem.applyAttachmentsToCharacter(instance, instance.speciesKey || instance.charKey || 'red');
        }

        if (typeof instance.onLoaded === 'function') {
            instance.onLoaded(instance);
        }
    }
};

// Start preloading hero FBX assets immediately in the background
if (typeof window !== 'undefined') {
    const preloadAll = () => {
        if (window.PANDORA_RUNTIME) return; // Build memuat bertahap per stage (game-runtime.js)
        if (window.HeroAssetManager) window.HeroAssetManager.load();
        if (window.GeneralTakingAssetManager) window.GeneralTakingAssetManager.load();
        if (window.GeneralDeadAssetManager) window.GeneralDeadAssetManager.load();
        if (window.GeneralBlockAssetManager) window.GeneralBlockAssetManager.load();
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
function autoLockToNearestEnemy(playerRoot, maxRange = 6.5) {
    if (!playerRoot) return null;
    const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList))
        ? spawnedFoxesList
        : ((typeof window !== 'undefined' && Array.isArray(window.spawnedFoxesList)) ? window.spawnedFoxesList : []);
    if (list.length === 0) return null;

    const pPos = playerRoot.position;

    // Vektor hadap depan pemain saat ini (+Z lokal)
    const forwardX = Math.sin(playerRoot.rotation.y);
    const forwardZ = Math.cos(playerRoot.rotation.y);

    // Cari musuh terdekat yang masih hidup di seluruh arah (360 derajat penuh tanpa blindspot)
    let bestTarget = null;
    let bestScore = Infinity;

    const curTarget = playerRoot._lockedAttackTarget;

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || !item.root || !item.root.visible) continue;
        const isDead = (item.ai && item.ai.isDead) || (item.model && item.model.isDead) || ((item.health !== undefined && item.health <= 0));
        if (isDead) continue;

        const ePos = item.root.position;
        const dx = ePos.x - pPos.x;
        const dz = ePos.z - pPos.z;
        const distSq = dx * dx + dz * dz;

        // Dalam radius serang (< maxRange)
        if (distSq > maxRange * maxRange || distSq < 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ;

        const curHp = (item.ai && typeof item.ai.health === 'number') ? item.ai.health : (item.health || 100);
        const maxHp = (item.ai && typeof item.ai.maxHealth === 'number') ? item.ai.maxHealth : (item.maxHealth || 100);
        const hpRatio = THREE.MathUtils.clamp(curHp / Math.max(1, maxHp), 0, 1);

        // Bonus stickiness bila target ini adalah target yang sedang diserang dan masih dekat (< 3.8m)
        const stickinessBonus = (item === curTarget && dist <= 3.8) ? -1.25 : 0.0;
        // Prioritas tinggi untuk Boss saat berada di arena pertempuran
        const bossBonus = item.isBoss ? -2.5 : 0.0;

        // FORMULA SKOR: Jarak terdekat + HP bar terkecil + sedikit preferensi arah depan (360 derajat aktif!)
        const score = (dist * 1.0) + (hpRatio * 1.1) - (dot * 0.25) + stickinessBonus + bossBonus;

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
        if (dx * dx + dz * dz > 0.0001) {
            playerRoot.rotation.y = Math.atan2(dx, dz); // Kunci hadapan karakter langsung ke musuh
        }
        return bestTarget;
    }
    return null;
}
window.autoLockToNearestEnemy = autoLockToNearestEnemy;

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

    const normalizedHeroCharKey = (!speciesKey || speciesKey === 'red' || speciesKey === 'hero')
        ? 'hero'
        : ((speciesKey === 'foxtree' || speciesKey === 'enemy-foxtree') ? 'enemy-foxtree' : speciesKey);

    const characterInstance = {
        root: foxRoot,
        meshContainer: meshContainer,
        modelMesh: null,
        speciesKey: speciesKey,
        charKey: normalizedHeroCharKey,
        baseScale: baseScale,
        mixer: null,
        actions: {},
        currentWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0, block: 0.0 },
        targetWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0, block: 0.0 },
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

        // Shield / Block state (hero/general/block.fbx)
        isBlocking: false,
        isBlockHeld: false,
        blockStartTime: 0,
        blockMinEndTime: 0,
        blockDrainPool: 0,

        startBlock() {
            if (this.isDead || this.isTakingHit || this.isFlyingPunch || this.isFlyingKick) return;

            // Cek Stamina: Jika stamina habis atau exhausted, tidak bisa block
            if (typeof FoxStaminaState !== 'undefined') {
                if (FoxStaminaState.isExhausted || (FoxStaminaState.current / FoxStaminaState.max) <= 0.10) {
                    if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
                        PandoraToast.show('⚡ Stamina habis untuk bertahan!', 'warning');
                    }
                    return;
                }
            }

            // Membatalkan serangan aktif jika sedang ancang-ancang
            if (this.isPunching && typeof this.cancelPunch === 'function') this.cancelPunch();
            if (this.isKicking && typeof this.cancelKick === 'function') this.cancelKick();
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isBlocking = true;
            this.isBlockHeld = true;
            this.blockStartTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            this.blockMinEndTime = this.blockStartTime + 450; // Minimal durasi jika tombol hanya diklik/tap cepat

            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // Aktifkan animasi block
            if (this.actions && this.actions.block) {
                this.actions.block.reset();
                this.actions.block.setLoop(THREE.LoopRepeat);
                this.actions.block.timeScale = 1.0;
                this.actions.block.play();
                this.currentWeights.block = Math.max(this.currentWeights.block || 0, 0.45);
            }

            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
            });
            if (this.targetWeights) this.targetWeights.block = 1.0;
        },

        stopBlock(force = false) {
            if (!this.isBlocking) return;
            this.isBlockHeld = false;

            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (!force && (now < this.blockMinEndTime)) {
                // Biarkan menyelesaikan durasi animasi tap minimal
                return;
            }

            this.isBlocking = false;
            this.blockDrainPool = 0;
            if (this.targetWeights) this.targetWeights.block = 0.0;
            if (this.targetWeights) this.targetWeights.idle = 1.0;
            if (this.actions && this.actions.idle) this.actions.idle.reset().play();
        },

        triggerBlock() {
            if (this.isBlocking) {
                this.stopBlock(true);
            } else {
                this.startBlock();
            }
        },

        onBlockHit(attackerPos, damageAmount = 15) {
            if (!this.isBlocking || this.isDead) return;

            // 1. Stamina HANYA berkurang tepat saat terpukul (konsumsi hemat & instan, tidak berkurang terus-menerus saat hold)
            const drainAmt = Math.max(5, Math.min(8, Math.round((Number(damageAmount) || 12) * 0.35)));
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.consume === 'function') {
                FoxStaminaState.consume(drainAmt);
                if (FoxStaminaState.current <= 0) {
                    this.onGuardBreak();
                    return;
                }
            }

            // 2. Micro pushback defensif
            if (attackerPos && this.root) {
                const kbDir = new THREE.Vector3().subVectors(this.root.position, attackerPos).setY(0);
                if (kbDir.lengthSq() > 0.001) {
                    kbDir.normalize();
                    this.root.position.addScaledVector(kbDir, 0.09);
                }
            }

            // 3. Suara benturan (jika tersedia)
            if (typeof foxSoundFX !== 'undefined' && foxSoundFX.playFootstep) {
                foxSoundFX.playFootstep();
            }
        },

        onGuardBreak() {
            this.stopBlock(true);
            if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
                PandoraToast.show('🛡️ SHIELD PECAH! (Stamina Habis)', 'error');
            }
            this.takeHit(null);
        },

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
        flyingKickPrevTime: 0.0,

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
            this.activeHitKey = null;
            this.hitTimer = 0.0;
            this.isPunching = false;
            this.isFlyingPunch = false;
            this.flyingPunchPrevTime = 0.0;
            this.activePunchKey = null;
            this.queuedPunches = 0;
            this.hasQueuedPunch = false;
            this.isKicking = false;
            this.isFlyingKick = false;
            this.flyingKickPrevTime = 0.0;
            this.activeKickKey = null;
            this.queuedKicks = 0;
            this.hasQueuedKick = false;
            this.queuedNextAction = null;
            this.strikeProcessed = false;
            this.isJumping = false;
            this.isStationaryJump = false;
            this.jumpImpulsePending = false;
            this.stopBlock(true);

            const deadChoices = ['dead1', 'dead2'];
            const chosenKey = forcedDeadKey || deadChoices[Math.floor(Math.random() * deadChoices.length)];
            this.activeDeadKey = chosenKey;

            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2', 'block'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
                if (this.currentWeights) this.currentWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    if (typeof this.actions[k].stopFading === 'function') this.actions[k].stopFading();
                    this.actions[k].setEffectiveWeight(0.0);
                }
            });

            const action = this.actions ? this.actions[chosenKey] : null;
            if (action) {
                action.reset();
                if (typeof action.stopFading === 'function') action.stopFading();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.enabled = true;
                action.setEffectiveWeight(1.0);
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
            if (this.isBlocking) {
                this.onBlockHit(attackerPos);
                return;
            }
            // Super-Armor Animasi: Saat mengeksekusi flyingPunch (Run + Punch) atau flyingKick,
            // jangan menginterupsi / membatalkan animasi walaupun Fox tetap menerima damage HP dari AI enemy
            if (this.isFlyingPunch || this.isFlyingKick) {
                return;
            }
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

            ['idle', 'idle2', 'idle3', 'walk', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'punch1', 'punch2', 'punch3', 'block'].forEach(k => {
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
                    this.root.position.addScaledVector(kbDir, 0.10);
                }
            }
        },

        takeDamage(amount, attackerPos) {
            if (this.isDead) return;
            if (this.isBlocking) {
                this.onBlockHit(attackerPos, amount);
                return;
            }
            this.takeHit(attackerPos);
        },

        /**
         * Mendeteksi apakah pemain sedang aktif berlari (sprint) dengan kombinasi tombol/analog + arah
         */
        isSprintingState() {
            const isShift = (typeof keys !== 'undefined' && keys.shift) || (typeof isMobileSprintActive !== 'undefined' && isMobileSprintActive);
            const inputMag = (typeof window.currentFoxInputMag === 'number') ? window.currentFoxInputMag : 0;
            const hasMoveKey = (typeof keys !== 'undefined') && !!(keys.w || keys.s || keys.a || keys.d);
            const joyMag = (typeof mobileJoystickForward !== 'undefined' && typeof mobileJoystickTurn !== 'undefined')
                ? Math.hypot(mobileJoystickTurn, mobileJoystickForward) : 0;
            const spd = (typeof window.currentFoxSpeed === 'number') ? Math.abs(window.currentFoxSpeed) : ((typeof currentSpeed === 'number') ? Math.abs(currentSpeed) : 0);
            const isMoving = (hasMoveKey || joyMag > 0.18 || inputMag > 0.18 || spd > 1.8);
            const hasStamina = (typeof FoxStaminaState !== 'undefined')
                ? (!FoxStaminaState.isExhausted && (FoxStaminaState.current / FoxStaminaState.max) > 0.10)
                : true;
            const isHunt = (typeof huntBlend === 'number' && huntBlend > 0.25) || (spd > 2.3);

            return ((isShift && isMoving) || (isHunt && isMoving)) && hasStamina;
        },

        /**
         * Combo tendangan:
         * - Saat sprint + kick: Eksekusi tendangan terbang (flying-kick.fbx) 1x penuh tanpa bisa di-spam!
         * - Saat jalan biasa / diam: Combo kick biasa (kick1 -> kick2 -> kick3)
         */
        triggerKick() {
            if (this.isDead || this.isTakingHit) return;

            // KUNCI ANTI-SPAM FLYING KICK / FLYING PUNCH:
            // Selama animasi flyingKick atau flyingPunch sedang berjalan, abaikan semua input spam klik!
            // Animasi wajib selesai tuntas 1x penuh dan stamina hanya terpakai 1x di awal.
            if (this.isFlyingKick || this.isFlyingPunch) return;

            // Cek Stamina: Jika stamina sisa <= 10%, dilarang kick
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.canPerformAction === 'function') {
                if (!FoxStaminaState.canPerformAction()) return;
            }

            const sprintingNow = !this.isKicking && !this.isPunching && this.isSprintingState();
            autoLockToNearestEnemy(this.root, sprintingNow ? 9.5 : 6.5);

            // JIKA SEDANG SPRINT (LARI CEPAT + ARAH):
            // Eksekusi animasi khusus: general/combat/kick/flying-kick.fbx
            if (sprintingNow) {
                this._startFlyingKick();
                return;
            }

            // JIKA SEDANG MEMUKUL (PUNCH DARAT):
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

        _startFlyingKick() {
            if (this.isFlyingKick || this.isFlyingPunch) return;
            const action = this.actions.flyingKick;
            if (!action) {
                this._startKick('kick1');
                return;
            }

            autoLockToNearestEnemy(this.root, 9.5);

            this.isJumping = false;
            this.jumpImpulsePending = false;
            if (this.isPunching) this.cancelPunch();

            this.isKicking = true;
            this.isFlyingKick = true;
            this.isFlyingPunch = false;
            this.queuedKicks = 0;
            this.hasQueuedKick = false;
            this.queuedPunches = 0;
            this.hasQueuedPunch = false;
            this.queuedNextAction = null;
            this.strikeProcessed = false;
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resetAttackStrikeTracker === 'function') {
                window.PandoraHitboxSystem.resetAttackStrikeTracker(this);
            }
            this.activeKickKey = 'flyingKick';
            this.kickTimer = 0.0;
            this.flyingKickPrevTime = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // Flying kick mengonsumsi stamina HANYA 1x (18 stamina)
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.consume === 'function') {
                FoxStaminaState.consume(18);
            }

            const clip = action.getClip();
            const speedMult = getCharacterAttackSpeedMultiplier(this, 'flyingKick');
            const rate = 1.45 * speedMult;
            action.timeScale = rate;
            this.kickDuration = (clip && clip.duration) ? (clip.duration / rate) : (0.92 / speedMult);

            action.reset();
            if (typeof action.stopFading === 'function') action.stopFading();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingPunch', 'punch1', 'punch2', 'punch3', 'block'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            this.targetWeights.flyingKick = 1.0;
            this.currentWeights.flyingKick = Math.max(this.currentWeights.flyingKick || 0, 0.40);
            action.setEffectiveWeight(this.currentWeights.flyingKick);
        },

        _startKick(kickKey, crossFadeFromAction = null) {
            const comboKeys = ['kick1', 'kick2', 'kick3'];
            const action = this.actions[kickKey];
            if (!action) {
                console.warn('[Combat] Action not found for kickKey:', kickKey);
                this.isKicking = false;
                return;
            }

            // Auto-lock ke musuh terdekat pada setiap tahapan tendangan
            autoLockToNearestEnemy(this.root, 6.5);

            // Tendangan membatalkan lompatan yang belum lepas landas
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isKicking = true;
            this.isFlyingKick = false;
            this.strikeProcessed = false;
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resetAttackStrikeTracker === 'function') {
                window.PandoraHitboxSystem.resetAttackStrikeTracker(this);
            }
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
            const speedMult = getCharacterAttackSpeedMultiplier(this, kickKey);
            const rate = 1.70 * speedMult; // Kecepatan tendangan tajam dan responsif sesuai setting kecepatan karakter
            action.timeScale = rate;
            this.kickDuration = (clip && clip.duration) ? (clip.duration / rate) : (0.88 / speedMult);

            action.reset();
            if (typeof action.stopFading === 'function') action.stopFading();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            // Semua pose lain memudar keluar (bukan di-nol-kan paksa) agar transisi tetap halus
            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'flyingKick', 'flyingPunch', 'punch1', 'punch2', 'punch3'].forEach(k => {
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
            if (this.isFlyingKick && this.actions.flyingKick && window.HeroAssetManager) {
                const HM = window.HeroAssetManager;
                if (HM.flyingKickRootMotion && this.root) {
                    const prevTime = this.flyingKickPrevTime || 0.0;
                    const toTime = this.actions.flyingKick.time;
                    if (toTime > prevTime) {
                        const deltaZ = Math.max(0, HM.sampleFlyingKickZ(toTime) - HM.sampleFlyingKickZ(prevTime));
                        if (deltaZ > 0.00001) {
                            const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                            const dispWorld = deltaZ * (this.baseScale || 1.85);
                            this.root.position.addScaledVector(fwd, dispWorld);
                            if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, dispWorld);
                            if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, dispWorld);
                        }
                    }
                }
            }
            this.isKicking = false;
            this.isFlyingKick = false;
            this.flyingKickPrevTime = 0.0;
            this.activeKickKey = null;
            this.queuedKicks = 0;
            this.hasQueuedKick = false;
            this.queuedNextAction = null;
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.kickComboIndex = 0;
            this.lastKickEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            ['kick1', 'kick2', 'kick3', 'flyingKick'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
        },

        /**
         * Combo pukulan:
         * - Saat sprint + punch: Eksekusi pukulan terbang (flying-punch.fbx) 1x penuh tanpa bisa di-spam!
         * - Saat jalan biasa / diam: Combo punch biasa (punch1 -> punch2 -> punch3)
         */
        triggerPunch() {
            if (this.isDead || this.isTakingHit) return;

            // KUNCI ANTI-SPAM FLYING PUNCH / FLYING KICK:
            // Selama animasi flyingPunch atau flyingKick sedang berjalan, abaikan semua input spam klik!
            // Animasi wajib selesai tuntas 1x penuh dan stamina hanya terpakai 1x di awal.
            if (this.isFlyingPunch || this.isFlyingKick) return;

            // Cek Stamina: Jika stamina sisa <= 10%, dilarang punch
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.canPerformAction === 'function') {
                if (!FoxStaminaState.canPerformAction()) return;
            }

            const sprintingNow = !this.isPunching && !this.isKicking && this.isSprintingState();
            autoLockToNearestEnemy(this.root, sprintingNow ? 9.5 : 6.5);

            // JIKA SEDANG SPRINT (LARI CEPAT + ARAH):
            // Eksekusi animasi khusus: general/combat/punch/flying-punch.fbx
            if (sprintingNow) {
                this._startFlyingPunch();
                return;
            }

            // JIKA SEDANG MENENDANG (KICK DARAT):
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

        _startFlyingPunch() {
            if (this.isFlyingPunch || this.isFlyingKick) return;
            const action = this.actions.flyingPunch;
            if (!action) {
                this._startPunch('punch1');
                return;
            }

            autoLockToNearestEnemy(this.root, 9.5);

            this.isJumping = false;
            this.jumpImpulsePending = false;
            if (this.isKicking) this.cancelKick();

            this.isPunching = true;
            this.isFlyingPunch = true;
            this.isFlyingKick = false;
            this.queuedPunches = 0;
            this.hasQueuedPunch = false;
            this.queuedKicks = 0;
            this.hasQueuedKick = false;
            this.queuedNextAction = null;
            this.strikeProcessed = false;
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resetAttackStrikeTracker === 'function') {
                window.PandoraHitboxSystem.resetAttackStrikeTracker(this);
            }
            this.activePunchKey = 'flyingPunch';
            this.punchTimer = 0.0;
            this.flyingPunchPrevTime = 0.0;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            // Flying punch mengonsumsi stamina HANYA 1x (15 stamina)
            if (typeof FoxStaminaState !== 'undefined' && typeof FoxStaminaState.consume === 'function') {
                FoxStaminaState.consume(15);
            }

            const clip = action.getClip();
            const speedMult = getCharacterAttackSpeedMultiplier(this, 'flyingPunch');
            const rate = 1.40 * speedMult;
            action.timeScale = rate;
            this.punchDuration = (clip && clip.duration) ? (clip.duration / rate) : (1.90 / speedMult);

            action.reset();
            if (typeof action.stopFading === 'function') action.stopFading();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'block'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
            this.targetWeights.flyingPunch = 1.0;
            this.currentWeights.flyingPunch = Math.max(this.currentWeights.flyingPunch || 0, 0.40);
            action.setEffectiveWeight(this.currentWeights.flyingPunch);
        },

        _startPunch(punchKey, crossFadeFromAction = null) {
            const comboKeys = ['punch1', 'punch2', 'punch3'];
            const action = this.actions[punchKey];
            if (!action) {
                console.warn('[Combat] Action not found for punchKey:', punchKey);
                this.isPunching = false;
                return;
            }

            // Auto-lock ke musuh terdekat pada setiap tahapan pukulan
            autoLockToNearestEnemy(this.root, 6.5);

            // Pukulan membatalkan lompatan yang belum lepas landas
            this.isJumping = false;
            this.jumpImpulsePending = false;

            this.isPunching = true;
            this.isFlyingPunch = false;
            this.strikeProcessed = false;
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resetAttackStrikeTracker === 'function') {
                window.PandoraHitboxSystem.resetAttackStrikeTracker(this);
            }
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
            const baseRate = rates[punchKey] || 1.6;
            const speedMult = getCharacterAttackSpeedMultiplier(this, punchKey);
            const rate = baseRate * speedMult;
            action.timeScale = rate;
            this.punchDuration = (clip && clip.duration) ? (clip.duration / rate) : (0.88 / speedMult);

            action.reset();
            if (typeof action.stopFading === 'function') action.stopFading();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            // Semua pose lain memudar keluar
            ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'flyingPunch'].forEach(k => {
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
            // Jika membatalkan flying punch, pastikan root motion dunia diperbarui hingga titik terakhir
            // sehingga karakter tidak pernah melompat mundur!
            if (this.isFlyingPunch && this.actions.flyingPunch && window.HeroAssetManager) {
                const HM = window.HeroAssetManager;
                if (HM.flyingPunchRootMotion && this.root) {
                    const prevTime = this.flyingPunchPrevTime || 0.0;
                    const toTime = this.actions.flyingPunch.time;
                    if (toTime > prevTime) {
                        const deltaZ = Math.max(0, HM.sampleFlyingPunchZ(toTime) - HM.sampleFlyingPunchZ(prevTime));
                        if (deltaZ > 0.00001) {
                            const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                            const dispWorld = deltaZ * (this.baseScale || 1.85);
                            this.root.position.addScaledVector(fwd, dispWorld);
                            if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, dispWorld);
                            if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, dispWorld);
                        }
                    }
                }
            }
            this.isPunching = false;
            this.isFlyingPunch = false;
            this.flyingPunchPrevTime = 0.0;
            this.activePunchKey = null;
            this.queuedPunches = 0;
            this.hasQueuedPunch = false;
            this.queuedNextAction = null;
            this.punchTimer = 0.0;
            this.punchComboIndex = 0;
            this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            ['punch1', 'punch2', 'punch3', 'flyingPunch'].forEach(k => {
                this.targetWeights[k] = 0.0;
            });
        },

        /**
         * Lompat:
         * - Tidak sprint (atau diam) -> jump-normal.fbx (lompat di tempat, input gerak terkunci sampai selesai, durasi lebih cepat & responsif)
         * - Sprint -> Jump-withrun.fbx: karakter terangkat saat kaki lepas tanah di dalam klip (jumpImpulsePending),
         *   dan klip selalu diputar sampai selesai.
         * Mengembalikan false jika lompatan tidak bisa dimulai.
         */
        triggerJump(isSprinting = false, isStationary = false) {
            if (this.isFlyingPunch || this.isFlyingKick) return false;
            // Jump meng-cancel animasi pukulan/tendangan darat biasa
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
            this.isStationaryJump = isStationary;
            this.activeJumpKey = key;
            this.jumpTimer = 0.0;

            const rate = useNormal ? JUMP_NORMAL_RATE : JUMP_RUN_RATE;
            action.timeScale = rate;
            const clip = action.getClip();
            this.jumpDuration = Math.max(0.1, clip.duration / rate - JUMP_BLEND_OUT);

            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.enabled = true;
            action.play();

            this.jumpImpulsePending = !useNormal;
            if (!useNormal) {
                const phases = getJumpClipPhases(clip);
                this.jumpLiftoffAt = phases.liftoff / rate;
                this.jumpFlightTime = (phases.landing - phases.liftoff) / rate;
            }
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
            const attackKey = this.isPunching ? this.activePunchKey : (this.isKicking ? this.activeKickKey : null);
            if (!attackKey) return;

            // Utamakan deteksi 3D Bone Hitbox nyata dari PandoraHitboxSystem (mendukung multi-hit / 2x pukulan dalam 1 animasi!)
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem) {
                const cKey = this.charKey || this.speciesKey || 'hero';
                const animCfg = window.PandoraHitboxSystem.getAnimationConfig(cKey, attackKey);
                if (animCfg && Array.isArray(animCfg.hitboxes) && animCfg.hitboxes.some(h => h.enabled !== false)) {
                    window.PandoraHitboxSystem.checkHeroMeleeStrike(this);
                    return;
                }
            }

            if (this.strikeProcessed) return;

            const STRIKE_CONFIGS = {
                // Pukulan: jangkauan natural humanoid (~1.70m) dengan sudut hadap toleran agar tidak miss saat berhadapan
                punch1: { minTime: 0.30, maxTime: 0.52, reach: 1.70, minDot: 0.20 },
                punch2: { minTime: 0.25, maxTime: 0.45, reach: 1.70, minDot: 0.20 },
                punch3: { minTime: 0.38, maxTime: 0.65, reach: 1.80, minDot: 0.18 },
                flyingPunch: { minTime: 0.20, maxTime: 0.65, reach: 2.15, minDot: 0.15 },
                // Tendangan: jangkauan langkah & kaki melurus (~1.85m - 2.2m)
                kick1:  { minTime: 0.32, maxTime: 0.55, reach: 1.85, minDot: 0.20 },
                kick2:  { minTime: 0.35, maxTime: 0.60, reach: 1.85, minDot: 0.18 },
                kick3:  { minTime: 0.35, maxTime: 0.60, reach: 1.95, minDot: 0.18 },
                flyingKick: { minTime: 0.20, maxTime: 0.68, reach: 2.25, minDot: 0.15 }
            };

            const cfg = STRIKE_CONFIGS[attackKey] || { minTime: 0.30, maxTime: 0.52, reach: 1.70, minDot: 0.20 };
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
                            const strikeDamage = (attackKey === 'flyingKick') ? 45 : (attackKey === 'flyingPunch' ? 40 : (attackKey && attackKey.startsWith('kick') ? 30 : 25));
                            const isCrit = (attackKey === 'flyingKick' || attackKey === 'flyingPunch' || attackKey === 'kick3' || attackKey === 'punch3');
                            const hitWorldPos = new THREE.Vector3(ePos.x, ePos.y + 0.95, ePos.z);
                            if (item.ai && typeof item.ai.takeDamage === 'function') {
                                item.ai.takeDamage(strikeDamage, pPos, hitWorldPos, isCrit);
                            } else {
                                if (typeof CombatHUD !== 'undefined' && typeof CombatHUD.spawnFloatingDamage === 'function') {
                                    CombatHUD.spawnFloatingDamage(hitWorldPos, strikeDamage, isCrit);
                                }
                                if (item.model && typeof item.model.takeDamage === 'function') {
                                    item.model.takeDamage(strikeDamage, pPos);
                                } else if (item.model && typeof item.model.takeHit === 'function') {
                                    item.model.takeHit(pPos);
                                }
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

            // Safety guard: pastikan flag anti-spam flying tidak pernah tersangkut jika aksi utamanya sudah mati
            if (!this.isPunching && this.isFlyingPunch) {
                this.isFlyingPunch = false;
                this.flyingPunchPrevTime = 0.0;
            }
            if (!this.isKicking && this.isFlyingKick) {
                this.isFlyingKick = false;
                this.flyingKickPrevTime = 0.0;
            }

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

            // POSISI BERTAHAN / SHIELD / BLOCK
            if (this.isBlocking) {
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;

                // Cek jika durasi tap minimal sudah selesai dan user tidak menahan tombol
                const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                if (!this.isBlockHeld && this.blockMinEndTime && (now >= this.blockMinEndTime)) {
                    this.stopBlock(false);
                } else {
                    ['jump', 'jumpRun', 'jumpNormal', 'walk', 'backward', 'run', 'idle', 'idle2', 'idle3', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2'].forEach(key => {
                        this.targetWeights[key] = 0.0;
                    });
                    this.targetWeights.block = 1.0;
                }
            } else if (this.isTakingHit) {
                this.hitTimer += dt;
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'backward', 'run', 'idle', 'idle2', 'idle3', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch'].forEach(key => {
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
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'backward', 'run', 'idle', 'idle2', 'idle3', 'kick1', 'kick2', 'kick3', 'flyingKick'].forEach(key => {
                    this.targetWeights[key] = 0.0;
                });

                if (this.isFlyingPunch) {
                    this.targetWeights.flyingPunch = 1.0;
                    ['punch1', 'punch2', 'punch3'].forEach(k => { this.targetWeights[k] = 0.0; });

                    // Continuous Auto-Lock Homing ke musuh terdekat selama fase terbang melompat
                    let distToLockedEnemy = Infinity;
                    if (this.root && this.punchTimer <= 0.62) {
                        const lockTgt = autoLockToNearestEnemy(this.root, 9.5);
                        if (lockTgt && lockTgt.root) {
                            distToLockedEnemy = this.root.position.distanceTo(lockTgt.root.position);
                        }
                    }

                    const HM = window.HeroAssetManager;
                    const applyFlyingPunchRootMotion = (toTime) => {
                        if (!HM || !HM.flyingPunchRootMotion || !this.root) return;
                        const prevTime = this.flyingPunchPrevTime || 0.0;
                        if (toTime <= prevTime) return;
                        const deltaZ = Math.max(0, HM.sampleFlyingPunchZ(toTime) - HM.sampleFlyingPunchZ(prevTime));
                        this.flyingPunchPrevTime = toTime;
                        if (deltaZ <= 0.00001 || distToLockedEnemy <= 0.90) return;
                        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                        const dispWorld = Math.min(deltaZ * (this.baseScale || 1.85), Math.max(0, distToLockedEnemy - 0.88));
                        this.root.position.addScaledVector(fwd, dispWorld);
                        if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, dispWorld);
                        if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, dispWorld);
                    };

                    if (this.actions.flyingPunch) {
                        applyFlyingPunchRootMotion(this.actions.flyingPunch.time);
                    }

                    // Forward leap momentum saat terbang melancarkan pukulan (berhenti tepat di depan musuh jika sudah rapat)
                    if (this.root && this.punchTimer >= 0.08 && this.punchTimer <= Math.min(this.punchDuration * 0.75, 0.55) && distToLockedEnemy > 0.92) {
                        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                        const leapSpeed = 5.2;
                        const disp = Math.min(leapSpeed * dt, Math.max(0, distToLockedEnemy - 0.90));
                        this.root.position.addScaledVector(fwd, disp);
                        if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, disp);
                        if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, disp);
                    }

                    if (this.punchTimer >= this.punchDuration) {
                        if (this.actions.flyingPunch) {
                            applyFlyingPunchRootMotion(this.actions.flyingPunch.getClip().duration);
                        }
                        this.isPunching = false;
                        this.isFlyingPunch = false;
                        this.activePunchKey = null;
                        this.queuedPunches = 0;
                        this.hasQueuedPunch = false;
                        this.punchTimer = 0.0;
                        this.flyingPunchPrevTime = 0.0;
                        this.lastPunchEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                        this.targetWeights.flyingPunch = 0.0;
                        this.targetWeights.idle = 1.0;
                        if (this.actions.idle) this.actions.idle.reset().play();
                    }
                } else {
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
                }
            } else if (this.isKicking) {
                this.kickTimer += dt;
                this._checkMeleeStrike();
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.idleCycleTimer = 0.0;
                ['jump', 'jumpRun', 'jumpNormal', 'walk', 'backward', 'run', 'idle', 'idle2', 'idle3', 'punch1', 'punch2', 'punch3', 'flyingPunch'].forEach(key => {
                    this.targetWeights[key] = 0.0;
                });

                if (this.isFlyingKick) {
                    this.targetWeights.flyingKick = 1.0;
                    ['kick1', 'kick2', 'kick3'].forEach(k => { this.targetWeights[k] = 0.0; });

                    // Continuous Auto-Lock Homing ke musuh terdekat selama fase terbang menendang
                    let distToLockedEnemy = Infinity;
                    if (this.root && this.kickTimer <= 0.65) {
                        const lockTgt = autoLockToNearestEnemy(this.root, 9.5);
                        if (lockTgt && lockTgt.root) {
                            distToLockedEnemy = this.root.position.distanceTo(lockTgt.root.position);
                        }
                    }

                    const HM = window.HeroAssetManager;
                    const applyFlyingKickRootMotion = (toTime) => {
                        if (!HM || !HM.flyingKickRootMotion || !this.root) return;
                        const prevTime = this.flyingKickPrevTime || 0.0;
                        if (toTime <= prevTime) return;
                        const deltaZ = Math.max(0, HM.sampleFlyingKickZ(toTime) - HM.sampleFlyingKickZ(prevTime));
                        this.flyingKickPrevTime = toTime;
                        if (deltaZ <= 0.00001 || distToLockedEnemy <= 0.90) return;
                        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                        const dispWorld = Math.min(deltaZ * (this.baseScale || 1.85), Math.max(0, distToLockedEnemy - 0.88));
                        this.root.position.addScaledVector(fwd, dispWorld);
                        if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, dispWorld);
                        if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, dispWorld);
                    };

                    if (this.actions.flyingKick) {
                        applyFlyingKickRootMotion(this.actions.flyingKick.time);
                    }

                    // Forward leap momentum saat terbang melancarkan tendangan
                    if (this.root && this.kickTimer >= 0.08 && this.kickTimer <= Math.min(this.kickDuration * 0.75, 0.60) && distToLockedEnemy > 0.92) {
                        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                        const leapSpeed = 2.6;
                        const disp = Math.min(leapSpeed * dt, Math.max(0, distToLockedEnemy - 0.90));
                        this.root.position.addScaledVector(fwd, disp);
                        if (typeof camera !== 'undefined' && camera) camera.position.addScaledVector(fwd, disp);
                        if (typeof controls !== 'undefined' && controls && controls.target) controls.target.addScaledVector(fwd, disp);
                    }

                    if (this.kickTimer >= this.kickDuration) {
                        if (this.actions.flyingKick) {
                            applyFlyingKickRootMotion(this.actions.flyingKick.getClip().duration);
                        }
                        this.isKicking = false;
                        this.isFlyingKick = false;
                        this.activeKickKey = null;
                        this.queuedKicks = 0;
                        this.hasQueuedKick = false;
                        this.kickTimer = 0.0;
                        this.kick3PrevTime = 0.0;
                        this.flyingKickPrevTime = 0.0;
                        this.wasMoving = false;
                        this.idleTimer = 0.0;
                        this.activeIdleKey = null;
                        this.idleCycleTimer = 0.0;
                        if (this.actions.idle2) { this.actions.idle2.stop(); this.currentWeights.idle2 = 0.0; }
                        if (this.actions.idle3) { this.actions.idle3.stop(); this.currentWeights.idle3 = 0.0; }
                        this.lastKickEndTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                        this.targetWeights.flyingKick = 0.0;
                        this.targetWeights.idle = 1.0;
                        if (this.actions.idle) this.actions.idle.reset().play();
                    }
                } else {
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
                }
            } else if (this.isJumping) {
                this.jumpTimer += dt;
                const jKey = this.activeJumpKey || 'jump';
                this.targetWeights.jump = (jKey === 'jump') ? 1.0 : 0.0;
                this.targetWeights.jumpRun = (jKey === 'jump') ? 1.0 : 0.0;
                this.targetWeights.jumpNormal = (jKey === 'jumpNormal') ? 1.0 : 0.0;
                this.targetWeights.walk = 0.0;
                this.targetWeights.backward = 0.0;
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
                this.targetWeights.backward = 0.0;
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
                    this.targetWeights.flyingKick = 0.0;
                    this.targetWeights.punch1 = 0.0;
                    this.targetWeights.punch2 = 0.0;
                    this.targetWeights.punch3 = 0.0;
                    this.targetWeights.flyingPunch = 0.0;

                    if (speed < -0.05) {
                        // Gerak mundur (S / analog bawah < 3 detik): jalankan animasi hero/general/backward.fbx
                        if (this.actions.backward) {
                            this.targetWeights.backward = 1.0;
                            this.targetWeights.walk = 0.0;
                        } else {
                            this.targetWeights.backward = 0.0;
                            this.targetWeights.walk = 1.0;
                        }
                        this.targetWeights.run = 0.0;
                    } else if (isSprinting && absSpeed > 1.8) {
                        // Running stride: smooth ramp from walk to full run
                        const runBlend = Math.min(1.0, (absSpeed - 1.8) / 2.2);
                        this.targetWeights.backward = 0.0;
                        this.targetWeights.walk = Math.max(0.0, 1.0 - runBlend);
                        this.targetWeights.run = runBlend;
                    } else if (absSpeed <= 0.05 && (absTurn > 0.05 || (k && (k.a || k.d)))) {
                        // Belok / rotasi di tempat: langkah kaki santai (natural stepping)
                        this.targetWeights.backward = 0.0;
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                    } else {
                        // Natural, calm walking stride
                        this.targetWeights.backward = 0.0;
                        this.targetWeights.walk = 1.0;
                        this.targetWeights.run = 0.0;
                    }
                } else {
                    // Stationary on ground: Karakter diam di tanah tanpa gerakan maupun input
                    this.targetWeights.walk = 0.0;
                    this.targetWeights.backward = 0.0;
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
            // Safety guard: jika total targetWeights locomotion 0 atau actions.idle tidak ada, pertahankan animasi yang tersedia agar tidak pernah kolaps ke T-pose (bind-pose)
            let totalLocoWeight = 0;
            for (const key in this.targetWeights) {
                totalLocoWeight += (this.targetWeights[key] || 0);
            }
            if (totalLocoWeight <= 0.001) {
                if (this.actions.idle) {
                    this.targetWeights.idle = 1.0;
                } else {
                    const anyActKey = Object.keys(this.actions)[0];
                    if (anyActKey && this.targetWeights[anyActKey] !== undefined) {
                        this.targetWeights[anyActKey] = 1.0;
                    }
                }
            }

            const blendSpeed = this.isTakingHit ? 35.0 : (this.isBlocking ? 28.0 : ((this.isKicking || this.isPunching) ? 28.0 : (isMoving ? 18.0 : (isGrounded ? 12.0 : 16.0))));
            for (const key of ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2', 'block']) {
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
                this.actions.walk.timeScale = (speed < 0 && !this.actions.backward) ? -walkPace : walkPace;
            }
            if (this.actions.backward) {
                // Sinkronisasi langkah kaki backward.fbx dengan kecepatan mundur agar pas dan tidak selip
                const backPace = (absSpeed <= 0.05) ? 1.0 : Math.max(0.95, Math.min(1.75, (absSpeed / 2.45) * 1.18));
                this.actions.backward.timeScale = backPace;
            }
            if (this.actions.run) {
                const runPace = Math.max(0.70, Math.min(1.6, absSpeed / 5.2));
                this.actions.run.timeScale = runPace;
            }

            // Step the Three.js AnimationMixer
            this.mixer.update(dt);
            if (this.modelMesh) this.modelMesh.rotation.set(0, 0, 0);

            // Evaluasi ulang tabrakan 3D Bone Hitbox tepat setelah pose tulang diperbarui oleh mixer
            if (this.isPunching || this.isKicking) {
                this._checkMeleeStrike();
            }
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof scene !== 'undefined') {
                window.PandoraHitboxSystem.updatePlayModeDebugVisuals(scene);
            }
        },

        resetAnimation() {
            this.currentWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0, block: 0.0 };
            this.targetWeights = { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, backward: 0.0, run: 0.0, jump: 0.0, jumpRun: 0.0, jumpNormal: 0.0, kick1: 0.0, kick2: 0.0, kick3: 0.0, flyingKick: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, flyingPunch: 0.0, hit1: 0.0, hit2: 0.0, block: 0.0 };
            this.isBlocking = false;
            this.isBlockHeld = false;
            this.blockDrainPool = 0;
            this.wasInAir = false;
            this.isJumping = false;
            this.isStationaryJump = false;

            this.isKicking = false;
            this.isFlyingKick = false;
            this.flyingKickPrevTime = 0.0;
            this.activeKickKey = null;
            this.hasQueuedKick = false;
            this.queuedKicks = 0;
            this.kickTimer = 0.0;
            this.kick3PrevTime = 0.0;
            this.lastKickEndTime = 0;
            this.kickComboIndex = 0;

            this.isPunching = false;
            this.isFlyingPunch = false;
            this.flyingPunchPrevTime = 0.0;
            this.activePunchKey = null;
            this.hasQueuedPunch = false;
            this.queuedPunches = 0;
            this.punchTimer = 0.0;
            this.lastPunchEndTime = 0;
            this.punchComboIndex = 0;

            this.queuedNextAction = null;
            this.strikeProcessed = false;
            this.isTakingHit = false;
            this.activeHitKey = null;
            this.hitTimer = 0.0;

            this.jumpImpulsePending = false;
            this.activeJumpKey = 'jump';
            this.wasMoving = false;
            this.idleTimer = 0.0;
            this.activeIdleKey = null;
            this.idleCycleTimer = 0.0;

            this.isDead = false;
            this.activeDeadKey = null;
            if (this.root) {
                this.root._lockedAttackTarget = null;
                this.root._combatLockTarget = null;
            }

            if (this.actions) {
                Object.keys(this.actions).forEach(k => {
                    const act = this.actions[k];
                    if (act && typeof act.stopFading === 'function') {
                        act.stopFading();
                    }
                    if (act) {
                        act.enabled = true;
                    }
                });
                if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1.0); }
                if (this.actions.idle2) { this.actions.idle2.stop(); this.actions.idle2.setEffectiveWeight(0.0); }
                if (this.actions.idle3) { this.actions.idle3.stop(); this.actions.idle3.setEffectiveWeight(0.0); }
                ['walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal'].forEach(k => {
                    if (this.actions[k]) {
                        this.actions[k].enabled = true;
                        this.actions[k].setEffectiveWeight(0.0);
                    }
                });
                ['kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2', 'dead1', 'dead2', 'block'].forEach(k => {
                    if (this.actions[k]) {
                        this.actions[k].stop();
                        this.actions[k].enabled = true;
                        this.actions[k].setEffectiveWeight(0.0);
                    }
                });
            }
        }
    };

    // Pilih AssetManager dinamis sesuai folder hero/<speciesKey>/ dari PandoraHeroRegistry
    const targetAssetMgr = (window.PandoraHeroRegistry && typeof window.PandoraHeroRegistry.getAssetManager === 'function')
        ? window.PandoraHeroRegistry.getAssetManager(speciesKey || 'red')
        : window.HeroAssetManager;

    if (targetAssetMgr && targetAssetMgr.isLoaded) {
        targetAssetMgr.setupInstance(characterInstance);
    } else if (targetAssetMgr) {
        targetAssetMgr.instancesPending.push(characterInstance);
        targetAssetMgr.load();
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
                return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, 'hero/foxtree/');
            }
        }
    }
    return 'hero/foxtree/';
}

const ENEMY_FOXTREE_CONFIG = {
    getPath() {
        return getEnemyFoxTreeBasePath();
    },
    files: {
        idle: 'idle.fbx',
        punch1: 'combat/punch/punch1.fbx',
        punch2: 'combat/punch/punch2.fbx'
    },
    baseScale: 1.85,
    yOffset: 0.05,
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
        backward: null,
        run: null,
        run: null,
        punch1: null,
        punch2: null,
        punch3: null
    },
    instancesPending: [],

    load() {
        // Build game hanya membawa karakter yang dipakai stage-nya
        if (window.PANDORA_GAME_CHARACTERS && !window.PANDORA_GAME_CHARACTERS.includes('foxtree')) return Promise.resolve();
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
                                    emissive: new THREE.Color(0x000000),
                                    skinning: true
                                });
                                if (newMat.map) newMat.map.encoding = THREE.sRGBEncoding;
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

                // 5. Load Punch 3 (opsional: hero/foxtree hanya punya punch1 dan punch2)
                if (files.punch3) try {
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
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.roughness = 1.0;
                        m.metalness = 0.0;
                        if (m.emissive) m.emissive.set(0x000000);
                        if (m.map) m.map.encoding = THREE.sRGBEncoding;
                        m.transparent = false;
                        m.opacity = 1.0;
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
            const idleAction = mixer.clipAction(sanitizeAnimationClipForModel(this.clips.idle, modelClone));
            idleAction.setEffectiveWeight(1.0);
            idleAction.play();
            instance.actions.idle = idleAction;
        }

        if (this.clips.walk) {
            const walkAction = mixer.clipAction(sanitizeAnimationClipForModel(this.clips.walk, modelClone));
            walkAction.setEffectiveWeight(0.0);
            walkAction.play();
            instance.actions.walk = walkAction;
        }

        if (this.clips.run) {
            const runAction = mixer.clipAction(sanitizeAnimationClipForModel(this.clips.run, modelClone));
            runAction.setEffectiveWeight(0.0);
            runAction.play();
            instance.actions.run = runAction;
        }

        ['punch1', 'punch2', 'punch3'].forEach(k => {
            if (this.clips[k]) {
                const punchAction = mixer.clipAction(sanitizeAnimationClipForModel(this.clips[k], modelClone));
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
function createEnemyFoxTreeModel(speciesKey = 'enemy-foxtree') {
    const cleanSpecies = (speciesKey && speciesKey !== 'none') ? String(speciesKey).trim() : 'enemy-foxtree';
    const normCharKey = (cleanSpecies === 'foxtree' || cleanSpecies === 'enemy-foxtree')
        ? 'enemy-foxtree'
        : (cleanSpecies === 'red' || cleanSpecies === 'hero' ? 'hero' : cleanSpecies);

    const enemyRoot = new THREE.Group();
    enemyRoot.name = 'EnemyCharacterRoot_' + cleanSpecies + '_' + Math.random().toString(36).substr(2, 7);

    const baseScale = ENEMY_FOXTREE_CONFIG.baseScale;
    enemyRoot.scale.set(baseScale, baseScale, baseScale);
    enemyRoot.userData.speciesKey = cleanSpecies;
    enemyRoot.userData.charKey = normCharKey;
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
        speciesKey: cleanSpecies,
        charKey: normCharKey,
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
        currentWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        targetWeights: { idle: 1.0, idle2: 0.0, idle3: 0.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 },
        idleTimer: 0.0,
        activeIdleKey: null,
        idleCycleTimer: 0.0,
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
                if (this.currentWeights) this.currentWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    if (typeof this.actions[k].stopFading === 'function') this.actions[k].stopFading();
                    this.actions[k].setEffectiveWeight(0.0);
                }
            });

            const action = this.actions ? this.actions[chosenKey] : null;
            if (action) {
                action.reset();
                if (typeof action.stopFading === 'function') action.stopFading();
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.enabled = true;
                action.setEffectiveWeight(1.0);
                action.play();
                if (this.targetWeights) this.targetWeights[chosenKey] = 1.0;
                if (this.currentWeights) this.currentWeights[chosenKey] = 1.0;
            }
        },

        triggerRevive() {
            this.isDead = false;
            this.isTakingHit = false;
            this.isPunching = false;
            this.strikeProcessed = false;
            this.activeDeadKey = null;

            if (this.actions) {
                Object.keys(this.actions).forEach(k => {
                    if (this.actions[k]) {
                        if (typeof this.actions[k].stopFading === 'function') this.actions[k].stopFading();
                        this.actions[k].enabled = true;
                    }
                });
            }

            ['dead1', 'dead2', 'hit1', 'hit2', 'punch1', 'punch2', 'punch3'].forEach(k => {
                if (this.targetWeights) this.targetWeights[k] = 0.0;
                if (this.currentWeights) this.currentWeights[k] = 0.0;
                if (this.actions && this.actions[k]) {
                    this.actions[k].stop();
                    this.actions[k].enabled = true;
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
            if (typeof window !== 'undefined' && window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.resetAttackStrikeTracker === 'function') {
                window.PandoraHitboxSystem.resetAttackStrikeTracker(this);
            }
            this.activePunchKey = punchKey;
            this.punchTimer = 0.0;

            const action = this.actions[punchKey];
            if (action) {
                action.reset();
                if (typeof action.stopFading === 'function') action.stopFading();
                const baseRate = punchKey === 'punch1' ? 1.8 : (punchKey === 'punch2' ? 1.5 : 1.25);
                const speedMult = getCharacterAttackSpeedMultiplier(this, punchKey);
                const rate = baseRate * speedMult;
                action.timeScale = rate;
                this.punchDuration = Math.max(0.25, (action.getClip().duration / rate));
                action.enabled = true;
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
            this.targetWeights.run = 0.0;
            this.targetWeights.hit1 = 0.0;
            this.targetWeights.hit2 = 0.0;

            // Segera alihkan bobot animasi agar gerakan pukulan langsung memotong animasi jalan/lari
            this.currentWeights[punchKey] = 0.85;
            this.currentWeights.walk = 0.0;
            this.currentWeights.run = 0.0;
            this.currentWeights.idle = 0.0;
            if (this.actions.walk) this.actions.walk.setEffectiveWeight(0.0);
            if (this.actions.run) this.actions.run.setEffectiveWeight(0.0);
            if (this.actions.idle) this.actions.idle.setEffectiveWeight(0.0);
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

                // Melee strike impact window: HANYA periksa setelah animasi pukulan benar-benar mengayun
                let usedBoneHitbox = false;
                const pKey = this.activePunchKey || 'punch1';
                const cKey = this.charKey || 'enemy-foxtree';
                const speedMult = getCharacterAttackSpeedMultiplier(this, pKey);
                const minSwingTime = 0.20 / speedMult;

                if (this.punchTimer >= minSwingTime && typeof window !== 'undefined' && window.PandoraHitboxSystem) {
                    const animCfg = window.PandoraHitboxSystem.getAnimationConfig(cKey, pKey);
                    if (animCfg && Array.isArray(animCfg.hitboxes) && animCfg.hitboxes.some(h => h.enabled !== false)) {
                        usedBoneHitbox = true;
                        window.PandoraHitboxSystem.checkEnemyMeleeStrike(this);
                    }
                }
                if (!usedBoneHitbox && !this.strikeProcessed && this.punchTimer >= (0.26 / speedMult)) {
                    const pKey = this.activePunchKey || 'punch1';
                    // Konfigurasi pukulan presisi fisik Enemy (jangkauan reach diskalakan dinamis mengikuti ukuran tubuh enemy)
                    const ENEMY_PUNCH_CONFIGS = {
                        punch1: { minTime: 0.22, maxTime: 0.52, reach: 1.85, minDot: 0.15 },
                        punch2: { minTime: 0.22, maxTime: 0.52, reach: 1.85, minDot: 0.15 },
                        punch3: { minTime: 0.30, maxTime: 0.65, reach: 2.10, minDot: 0.12 }
                    };
                    const baseCfg = ENEMY_PUNCH_CONFIGS[pKey] || { minTime: 0.22, maxTime: 0.52, reach: 1.85, minDot: 0.15 };
                    const enemyScaleFactor = (this.root && this.root.scale && this.root.scale.x > 0) ? (this.root.scale.x / 1.85) : 1.0;
                    const effectiveReach = baseCfg.reach * Math.max(1.0, enemyScaleFactor);

                    if (this.punchTimer >= baseCfg.minTime && this.punchTimer <= baseCfg.maxTime) {
                        const isPlayerDead = Boolean(
                            (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) ||
                            (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isDead)
                        );
                        if (isPlayerDead) {
                            // Jangan potong animasi serangan terakhir musuh! Biarkan animasi pukulannya selesai sampai akhir sebelum kembali ke idle
                            this.strikeProcessed = true;
                        } else if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                            const pPos = wolfCharacter.root.position;
                            // Jarak horizontal murni (mengabaikan fluktuasi elevasi tanah kecil)
                            const distToPlayer = Math.hypot(this.root.position.x - pPos.x, this.root.position.z - pPos.z);
                            if (distToPlayer <= effectiveReach) {
                                const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
                                const toP = new THREE.Vector3().subVectors(pPos, this.root.position).setY(0);
                                if (toP.lengthSq() > 0.001) {
                                    toP.normalize();
                                    if (fwd.dot(toP) >= baseCfg.minDot) {
                                        this.strikeProcessed = true;
                                        if (typeof PlayerHealthState !== 'undefined') {
                                            const cfgDmg = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined')
                                                ? (this.isBoss ? window.ENEMY_COMBAT_CONFIG.boss.damagePerHit : window.ENEMY_COMBAT_CONFIG.nonBoss.damagePerHit)
                                                : 15;
                                            const finalDmg = (typeof this.damagePerHit === 'number') ? this.damagePerHit : cfgDmg;
                                            PlayerHealthState.takeDamage(finalDmg, this.root.position);
                                        }
                                        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && !wolfCharacter.isBlocking) {
                                            if (typeof wolfCharacter.takeHit === 'function') {
                                                wolfCharacter.takeHit(this.root.position);
                                            }
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
                        const wScale = THREE.MathUtils.clamp(moveSpeed / 1.65, 0.85, 1.35);
                        this.actions.walk.timeScale = (currentSpeed < 0) ? -wScale : wScale;
                    } else {
                        this.targetWeights.idle = 1.0;
                        if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
                    }
                } else {
                    this.targetWeights.walk = 0.0;
                    this.targetWeights.run = 0.0;
                    this.idleTimer = (this.idleTimer || 0.0) + dt;
                    if (this.idleTimer >= 4.0 && (this.actions.idle2 || this.actions.idle3)) {
                        if (!this.activeIdleKey) {
                            const choices = ['idle'];
                            if (this.actions.idle2) choices.push('idle2');
                            if (this.actions.idle3) choices.push('idle3');
                            this.activeIdleKey = choices[Math.floor(Math.random() * choices.length)];
                            this.idleCycleTimer = 0.0;
                            if (this.actions[this.activeIdleKey]) {
                                this.actions[this.activeIdleKey].reset().play();
                            }
                        } else {
                            this.idleCycleTimer = (this.idleCycleTimer || 0.0) + dt;
                            const act = this.actions[this.activeIdleKey];
                            const clipDur = (act && act.getClip && act.getClip()) ? act.getClip().duration : 3.5;
                            if (this.idleCycleTimer >= clipDur - 0.15) {
                                this.activeIdleKey = null;
                                this.idleTimer = 1.5;
                            }
                        }
                        const curIdle = this.activeIdleKey || 'idle';
                        this.targetWeights.idle = (curIdle === 'idle') ? 1.0 : 0.0;
                        this.targetWeights.idle2 = (curIdle === 'idle2') ? 1.0 : 0.0;
                        this.targetWeights.idle3 = (curIdle === 'idle3') ? 1.0 : 0.0;
                    } else {
                        this.activeIdleKey = null;
                        this.targetWeights.idle = 1.0;
                        this.targetWeights.idle2 = 0.0;
                        this.targetWeights.idle3 = 0.0;
                        if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
                    }
                }
                if (moveSpeed > 0.25) {
                    this.idleTimer = 0.0;
                    this.activeIdleKey = null;
                    this.targetWeights.idle2 = 0.0;
                    this.targetWeights.idle3 = 0.0;
                }
                this.targetWeights.punch1 = 0.0;
                this.targetWeights.punch2 = 0.0;
                this.targetWeights.punch3 = 0.0;
                this.targetWeights.hit1 = 0.0;
                this.targetWeights.hit2 = 0.0;
            } else {
                this.idleTimer = 0.0;
                this.activeIdleKey = null;
                this.targetWeights.idle2 = 0.0;
                this.targetWeights.idle3 = 0.0;
            }

            // Safety guard: jika total bobot locomotion 0, pertahankan idle agar tidak pernah kolaps ke bind-pose (T-pose)
            const totalLocoWeight = (this.targetWeights.idle2 || 0) + (this.targetWeights.idle3 || 0) + (this.targetWeights.walk || 0) + (this.targetWeights.run || 0) + (this.targetWeights.punch1 || 0) + (this.targetWeights.punch2 || 0) + (this.targetWeights.punch3 || 0) + (this.targetWeights.hit1 || 0) + (this.targetWeights.hit2 || 0);
            if (totalLocoWeight <= 0.001) {
                this.targetWeights.idle = 1.0;
                if (this.actions.idle && !this.actions.idle.isRunning()) this.actions.idle.play();
            }

            const blendSpeed = this.isTakingHit ? 35.0 : 10.0;
            const keys = ['idle', 'idle2', 'idle3', 'walk', 'run', 'punch1', 'punch2', 'punch3', 'hit1', 'hit2'];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const targetW = this.targetWeights[k] || 0.0;
                this.currentWeights[k] = THREE.MathUtils.lerp(this.currentWeights[k] || 0.0, targetW, Math.min(1.0, blendSpeed * dt));
                if (this.actions[k]) {
                    this.actions[k].setEffectiveWeight(this.currentWeights[k]);
                }
            }

            this.mixer.update(dt);
            if (this.modelMesh) this.modelMesh.rotation.set(0, 0, 0);

            // Evaluasi ulang 3D Bone Hitbox tepat setelah pose tulang enemy diperbarui oleh mixer (min 0.22 detik)
            if (this.isPunching && this.punchTimer >= 0.22 && !this.strikeProcessed && typeof window !== 'undefined' && window.PandoraHitboxSystem) {
                window.PandoraHitboxSystem.checkEnemyMeleeStrike(this);
            }
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
            this.strikeProcessed = false;
            this.currentWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
            this.targetWeights = { idle: 1.0, walk: 0.0, run: 0.0, punch1: 0.0, punch2: 0.0, punch3: 0.0, hit1: 0.0, hit2: 0.0 };
            if (this.actions) {
                Object.keys(this.actions).forEach(k => {
                    if (this.actions[k]) {
                        if (typeof this.actions[k].stopFading === 'function') this.actions[k].stopFading();
                        this.actions[k].enabled = true;
                    }
                });
            }
            if (this.actions.idle) { this.actions.idle.reset().play(); this.actions.idle.setEffectiveWeight(1.0); }
            if (this.actions.walk) { this.actions.walk.reset().play(); this.actions.walk.setEffectiveWeight(0.0); }
            if (this.actions.run) { this.actions.run.reset().play(); this.actions.run.setEffectiveWeight(0.0); }
            ['punch1', 'punch2', 'punch3', 'hit1', 'hit2', 'dead1', 'dead2'].forEach(k => {
                if (this.actions[k]) { this.actions[k].stop(); this.actions[k].enabled = true; this.actions[k].setEffectiveWeight(0.0); }
            });
        }
    };

    const targetAssetMgr = (window.PandoraHeroRegistry && typeof window.PandoraHeroRegistry.getAssetManager === 'function')
        ? window.PandoraHeroRegistry.getAssetManager(cleanSpecies)
        : window.EnemyFoxTreeAssetManager;

    if (targetAssetMgr && targetAssetMgr.isLoaded) {
        targetAssetMgr.setupInstance(enemyInstance);
    } else if (targetAssetMgr) {
        targetAssetMgr.instancesPending.push(enemyInstance);
        targetAssetMgr.load();
    }

    return enemyInstance;
}

window.createEnemyFoxTreeModel = createEnemyFoxTreeModel;
window.createEnemyCharacterModel = createEnemyFoxTreeModel;

/* ===================================================================
   PANDORA DYNAMIC HERO & CHARACTER FOLDER REGISTRY (hero/<folder>/*)
   Otomatis menyinkronkan setiap folder baru di dalam hero/ (melalui api/heroes.php
   atau config/heroes.json) dan membangun AssetManager dinamis untuk setiap karakter
   tanpa perlu menambah kode manual.
   =================================================================== */
(function () {
    function getRootPrefix() {
        if (typeof document !== 'undefined') {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].src;
                if (src && src.includes('fox-model.js')) {
                    return src.replace(/js\/character\/fox-model\.js(\?.*)?$/, '');
                }
            }
        }
        return '';
    }

    function createDynamicHeroFolderAssetManager(meta) {
        const mgr = {
            id: meta.id,
            meta: meta,
            isLoaded: false,
            isLoading: false,
            loadPromise: null,
            baseModel: null,
            clips: {
                idle: null,
                idle2: null,
                idle3: null,
                walk: null,
                backward: null,
                run: null,
                jump: null,
                jumpRun: null,
                jumpNormal: null,
                kick1: null,
                kick2: null,
                kick3: null,
                flyingKick: null,
                punch1: null,
                punch2: null,
                punch3: null,
                flyingPunch: null,
                block: null
            },
            instancesPending: [],
            kick3RootMotion: null,
            flyingKickRootMotion: null,
            flyingPunchRootMotion: null,

            sampleKick3Z(t) {
                const rm = this.kick3RootMotion || (window.HeroAssetManager && window.HeroAssetManager.kick3RootMotion);
                if (!rm) return 0;
                const { times, z, totalZ } = rm;
                if (t <= times[0]) return 0;
                if (t >= times[times.length - 1]) return totalZ;
                let i = 0;
                while (i < times.length - 1 && times[i + 1] < t) i++;
                const alpha = (t - times[i]) / (times[i + 1] - times[i]);
                return z[i] + alpha * (z[i + 1] - z[i]);
            },

            sampleFlyingKickZ(t) {
                const rm = this.flyingKickRootMotion || (window.HeroAssetManager && window.HeroAssetManager.flyingKickRootMotion);
                if (!rm) return 0;
                const { times, z, totalZ } = rm;
                if (t <= times[0]) return 0;
                if (t >= times[times.length - 1]) return totalZ;
                let i = 0;
                while (i < times.length - 1 && times[i + 1] < t) i++;
                const alpha = (t - times[i]) / (times[i + 1] - times[i]);
                return z[i] + alpha * (z[i + 1] - z[i]);
            },

            sampleFlyingPunchZ(t) {
                const rm = this.flyingPunchRootMotion || (window.HeroAssetManager && window.HeroAssetManager.flyingPunchRootMotion);
                if (!rm) return 0;
                const { times, z, totalZ } = rm;
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
                            throw new Error('THREE.FBXLoader is not available.');
                        }

                        // Pastikan manifest dari api/heroes.php sudah sinkron agar daftar file .fbx akurat (0 error 404)
                        if (window.PandoraHeroRegistry && !window.PandoraHeroRegistry.isSynced) {
                            try {
                                await window.PandoraHeroRegistry.sync();
                            } catch (eSync) {}
                        }

                        const updatedMeta = (window.PandoraHeroRegistry && window.PandoraHeroRegistry.getCharacterMeta(this.id)) || this.meta;
                        this.meta = updatedMeta;

                        const loader = new THREE.FBXLoader();
                        const loadFBX = (url) => (window.PandoraAssetCache ? window.PandoraAssetCache.loadFBX(url, loader) : new Promise((res, rej) => loader.load(url, res, undefined, rej)));

                        const prefix = getRootPrefix();
                        const basePath = prefix + (this.meta.basePath || ('hero/' + this.id + '/'));
                        const slots = this.meta.slots || {};
                        const extraClips = this.meta.extraClips || {};

                        const idleFile = slots.idle || 'idle.fbx';
                        console.log('[PandoraHeroRegistry] Loading character "' + this.id + '" from ' + basePath + idleFile);

                        // 1. Muat model utama + animasi idle dasar
                        const idleObj = await loadFBX(basePath + idleFile);
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
                                            emissive: new THREE.Color(0x000000), // Tone Mixamo murni
                                            skinning: true
                                        });
                                        if (newMat.map) newMat.map.encoding = THREE.sRGBEncoding;
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

                        // 2. Muat seluruh file .fbx spesifik yang ada di dalam folder karakter ini (sesuai hasil scan api/heroes.php)
                        const slotKeys = Object.keys(slots).filter(k => k !== 'idle');
                        for (const sKey of slotKeys) {
                            const relFile = slots[sKey];
                            if (!relFile) continue;
                            try {
                                const clipObj = await loadFBX(basePath + relFile);
                                if (clipObj && clipObj.animations && clipObj.animations.length > 0) {
                                    const clip = clipObj.animations[0].clone();
                                    clip.name = sKey;
                                    this.clips[sKey] = clip;
                                    if (sKey === 'jump') {
                                        this.clips.jumpRun = clip;
                                    }
                                }
                            } catch (sErr) {
                                console.warn('[PandoraHeroRegistry] Could not load ' + basePath + relFile + ':', sErr);
                            }
                        }

                        // 2b. Muat file .fbx ekstra/kustom jika ada
                        if (extraClips && typeof extraClips === 'object') {
                            for (const extKey of Object.keys(extraClips)) {
                                const relFile = extraClips[extKey];
                                if (!relFile) continue;
                                try {
                                    const extObj = await loadFBX(basePath + relFile);
                                    if (extObj && extObj.animations && extObj.animations.length > 0) {
                                        const extClip = extObj.animations[0].clone();
                                        extClip.name = extKey;
                                        this.clips[extKey] = extClip;
                                    }
                                } catch (extErr) {}
                            }
                        }

                        // Fallback cerdas jika animasi idle belum ditemukan di file idle utama:
                        // Coba pinjam animasi dari idle2, idle3, atau animasi lokomosi yang berhasil dimuat di folder ini
                        if (!this.clips.idle) {
                            const localCandidates = ['idle2', 'idle3', 'walk', 'run'];
                            for (const cKey of localCandidates) {
                                if (this.clips[cKey]) {
                                    const borrowed = this.clips[cKey].clone();
                                    borrowed.name = 'idle';
                                    this.clips.idle = borrowed;
                                    console.log('[PandoraHeroRegistry] Karakter "' + this.id + '" meminjam animasi ' + cKey + ' sebagai idle.');
                                    break;
                                }
                            }
                        }

                        // 3. Pastikan HeroAssetManager & General AssetManagers siap untuk menyediakan fallback animasi kombat/lokomosi/idle
                        if (window.HeroAssetManager && !window.HeroAssetManager.isLoaded) {
                            try {
                                await window.HeroAssetManager.load();
                            } catch (hErr) {}
                        }

                        const heroClips = (window.HeroAssetManager && window.HeroAssetManager.clips) ? window.HeroAssetManager.clips : {};
                        const fallbackSlots = ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'block'];
                        fallbackSlots.forEach(fKey => {
                            if (!this.clips[fKey] && heroClips[fKey]) {
                                const cloned = heroClips[fKey].clone();
                                cloned.name = fKey;
                                this.clips[fKey] = cloned;
                            }
                        });

                        this.isLoaded = true;
                        this.isLoading = false;
                        console.log('[PandoraHeroRegistry] Character "' + this.id + '" loaded! Available clips:', Object.keys(this.clips).filter(k => !!this.clips[k]));

                        this.instancesPending.forEach(inst => this.setupInstance(inst));
                        this.instancesPending = [];

                        resolve(this);
                    } catch (err) {
                        console.error('[PandoraHeroRegistry] Failed to load character "' + this.id + '":', err);
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
                    modelClone = this.baseModel.clone(true);
                }

                // Ground Alignment presisi:
                // Seluruh rig humanoid Mixamo standar (Red, Red Mature, Tharon, dll) telah terkalibrasi
                // menapak tanah secara natural pada y = 0. Gunakan meta.yOffset jika ditentukan oleh user.
                const yOff = (this.meta && typeof this.meta.yOffset === 'number' && this.meta.yOffset !== 0) ? this.meta.yOffset : 0.05;
                modelClone.position.set(0, yOff, 0);

                modelClone.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        child.frustumCulled = false;
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material = child.material.map(m => m.clone());
                            } else {
                                child.material = child.material.clone();
                            }
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                m.roughness = 1.0;
                                m.metalness = 0.0;
                                if (m.shininess !== undefined) m.shininess = 0;
                                if (m.specular) m.specular.set(0x000000);
                                if (m.emissive) m.emissive.set(0x000000);
                                if (m.map) m.map.encoding = THREE.sRGBEncoding;
                                m.transparent = false;
                                m.opacity = 1.0;
                            });
                        }
                    }
                });

                instance.meshContainer.add(modelClone);
                instance.modelMesh = modelClone;

                const mixer = new THREE.AnimationMixer(modelClone);
                instance.mixer = mixer;
                instance.actions = {};

                // Pasang klip lokomosi & idle (LoopRepeat)
                ['idle', 'idle2', 'idle3', 'walk', 'backward', 'run', 'block'].forEach(k => {
                    if (this.clips[k]) {
                        const sanitized = sanitizeAnimationClipForModel(this.clips[k], modelClone);
                        const act = mixer.clipAction(sanitized);
                        act.setEffectiveWeight(k === 'idle' ? 1.0 : 0.0);
                        act.play();
                        instance.actions[k] = act;
                    }
                });

                // Pasang klip aksi kombat & lompat (LoopOnce)
                ['jump', 'jumpRun', 'jumpNormal', 'kick1', 'kick2', 'kick3', 'flyingKick', 'punch1', 'punch2', 'punch3', 'flyingPunch', 'hit1', 'hit2', 'dead1', 'dead2'].forEach(k => {
                    if (this.clips[k]) {
                        const sanitized = sanitizeAnimationClipForModel(this.clips[k], modelClone);
                        const act = mixer.clipAction(sanitized);
                        act.setLoop(THREE.LoopOnce, 1);
                        act.clampWhenFinished = true;
                        act.setEffectiveWeight(0.0);
                        act.play();
                        instance.actions[k] = act;
                    }
                });

                // Pasang klip ekstra kustom jika ada
                Object.keys(this.clips).forEach(k => {
                    if (this.clips[k] && !instance.actions[k]) {
                        const sanitized = sanitizeAnimationClipForModel(this.clips[k], modelClone);
                        const act = mixer.clipAction(sanitized);
                        act.setLoop(THREE.LoopOnce, 1);
                        act.clampWhenFinished = true;
                        act.setEffectiveWeight(0.0);
                        act.play();
                        instance.actions[k] = act;
                    }
                });

                if (instance.actions.kick1) instance.actions.kick = instance.actions.kick1;
                if (instance.actions.punch1) instance.actions.punch = instance.actions.punch1;

                // Jaminan mutlak: action idle selalu ada & aktif agar karakter tidak pernah kolaps ke T-pose bind-pose
                if (!instance.actions.idle) {
                    const fallbackKey = instance.actions.idle2 ? 'idle2' : (instance.actions.idle3 ? 'idle3' : (instance.actions.walk ? 'walk' : Object.keys(instance.actions)[0]));
                    if (fallbackKey && instance.actions[fallbackKey]) {
                        instance.actions.idle = instance.actions[fallbackKey];
                    }
                }
                if (instance.actions.idle) {
                    instance.actions.idle.play();
                    instance.actions.idle.setEffectiveWeight(1.0);
                }

                // Attach General Taking / Dead / Block jika belum ada dari folder karakter sendiri
                if (window.GeneralTakingAssetManager) {
                    if (window.GeneralTakingAssetManager.isLoaded) {
                        window.GeneralTakingAssetManager.setupInstance(instance);
                    } else {
                        window.GeneralTakingAssetManager.instancesPending.push(instance);
                        window.GeneralTakingAssetManager.load();
                    }
                }
                if (window.GeneralDeadAssetManager) {
                    if (window.GeneralDeadAssetManager.isLoaded) {
                        window.GeneralDeadAssetManager.setupInstance(instance);
                    } else {
                        window.GeneralDeadAssetManager.instancesPending.push(instance);
                        window.GeneralDeadAssetManager.load();
                    }
                }
                if (window.GeneralBlockAssetManager) {
                    if (window.GeneralBlockAssetManager.isLoaded) {
                        window.GeneralBlockAssetManager.setupInstance(instance);
                    } else {
                        window.GeneralBlockAssetManager.instancesPending.push(instance);
                        window.GeneralBlockAssetManager.load();
                    }
                }

                if (mixer) {
                    mixer.update(0.016);
                }

                instance.isLoaded = true;

                // Auto-Pasang Objek 3D Attachment (Pedang, Perisai, Sayap, dll) ke Tulang Karakter
                if (typeof window !== 'undefined' && window.PandoraAttachmentSystem && typeof window.PandoraAttachmentSystem.applyAttachmentsToCharacter === 'function') {
                    window.PandoraAttachmentSystem.applyAttachmentsToCharacter(instance, instance.speciesKey || instance.charKey || this.id);
                }

                if (typeof instance.onLoaded === 'function') {
                    instance.onLoaded(instance);
                }
            }
        };

        return mgr;
    }

    const DEFAULT_CHARACTERS = [
        {
            id: 'red',
            folder: 'red',
            spawnerKey: 'red',
            hitToolKey: 'hero',
            name: 'Red Fox',
            badge: '🦊',
            basePath: 'hero/red/',
            baseScale: 1.85,
            yOffset: 0.05,
            files: ['idle.fbx', 'idle2.fbx', 'idle3.fbx', 'jump-normal.fbx', 'Jump-withrun.fbx', 'combat/kick/kick1.fbx', 'combat/kick/kick2.fbx', 'combat/kick/kick3.fbx', 'combat/punch/punch1.fbx', 'combat/punch/punch2.fbx', 'combat/punch/punch3.fbx'],
            slots: {
                idle: 'idle.fbx',
                idle2: 'idle2.fbx',
                idle3: 'idle3.fbx',
                jump: 'Jump-withrun.fbx',
                jumpNormal: 'jump-normal.fbx',
                kick1: 'combat/kick/kick1.fbx',
                kick2: 'combat/kick/kick2.fbx',
                kick3: 'combat/kick/kick3.fbx',
                punch1: 'combat/punch/punch1.fbx',
                punch2: 'combat/punch/punch2.fbx',
                punch3: 'combat/punch/punch3.fbx'
            },
            extraClips: {}
        },
        {
            id: 'enemy-foxtree',
            folder: 'enemy-foxtree',
            spawnerKey: 'foxtree',
            hitToolKey: 'enemy-foxtree',
            name: 'FoxTree',
            badge: '👹',
            basePath: 'hero/enemy-foxtree/',
            baseScale: 1.85,
            yOffset: 0.05,
            files: ['Idle.fbx', 'combat/punch/punch1.fbx', 'combat/punch/punch2.fbx', 'combat/punch/punch3.fbx'],
            slots: {
                idle: 'Idle.fbx',
                punch1: 'combat/punch/punch1.fbx',
                punch2: 'combat/punch/punch2.fbx',
                punch3: 'combat/punch/punch3.fbx'
            },
            extraClips: {}
        },
        {
            id: 'tharon',
            folder: 'tharon',
            spawnerKey: 'tharon',
            hitToolKey: 'tharon',
            name: 'Tharon',
            badge: '⚔️',
            basePath: 'hero/tharon/',
            baseScale: 1.85,
            yOffset: 0.05,
            files: ['idle.fbx', 'idle2.fbx'],
            slots: {
                idle: 'idle.fbx',
                idle2: 'idle2.fbx'
            },
            extraClips: {}
        }
    ];

    const PandoraHeroRegistry = {
        characters: DEFAULT_CHARACTERS.slice(),
        general: { basePath: 'hero/general/', files: [], slots: {} },
        assetManagers: {},
        isSynced: false,
        syncPromise: null,
        listeners: [],

        onSync(callback) {
            if (typeof callback !== 'function') return;
            this.listeners.push(callback);
            if (this.isSynced) {
                try { callback(this.characters); } catch (e) {}
            }
        },

        _notifyListeners() {
            this.listeners.forEach(cb => {
                try { cb(this.characters); } catch (e) {}
            });
        },

        getCharacterMeta(key) {
            if (!key) return this.characters[0];
            const lower = String(key).trim().toLowerCase();
            const found = this.characters.find(c =>
                c.id.toLowerCase() === lower ||
                c.folder.toLowerCase() === lower ||
                (c.spawnerKey && c.spawnerKey.toLowerCase() === lower) ||
                (c.hitToolKey && c.hitToolKey.toLowerCase() === lower)
            );
            if (found) return found;

            // Jika folder baru dipanggil secara dinamis sebelum sync selesai, buat metadata otomatis
            const dynamicMeta = {
                id: key,
                folder: key,
                spawnerKey: key,
                hitToolKey: key,
                name: key.charAt(0).toUpperCase() + key.slice(1),
                badge: '⚔️',
                basePath: 'hero/' + key + '/',
                baseScale: 1.85,
                yOffset: 0.05,
                files: ['idle.fbx'],
                slots: { idle: 'idle.fbx' },
                extraClips: {}
            };
            this.characters.push(dynamicMeta);
            return dynamicMeta;
        },

        getAssetManager(key) {
            const meta = this.getCharacterMeta(key);
            const idLower = meta.id.toLowerCase();
            if (idLower === 'red') {
                return window.HeroAssetManager;
            }
            if (!this.assetManagers[meta.id]) {
                this.assetManagers[meta.id] = createDynamicHeroFolderAssetManager(meta);
            } else {
                this.assetManagers[meta.id].meta = meta;
            }
            return this.assetManagers[meta.id];
        },

        async purgeAllCache() {
            console.log('[PandoraHeroRegistry] Memulai pembersihan total cache karakter & asset FBX...');
            this.isSynced = false;
            this.syncPromise = null;

            // 1. Reset seluruh asset manager karakter dinamis
            Object.keys(this.assetManagers).forEach(k => {
                const mgr = this.assetManagers[k];
                if (mgr) {
                    mgr.isLoaded = false;
                    mgr.isLoading = false;
                    mgr.loadPromise = null;
                    mgr.baseModel = null;
                    mgr.clips = {};
                    mgr.instancesPending = [];
                }
            });

            // 2. Reset asset manager bawaan utama
            const builtInManagers = [
                window.HeroAssetManager,
                window.EnemyFoxTreeAssetManager,
                window.GeneralTakingAssetManager,
                window.GeneralDeadAssetManager,
                window.GeneralBlockAssetManager
            ];
            builtInManagers.forEach(mgr => {
                if (mgr) {
                    mgr.isLoaded = false;
                    mgr.isLoading = false;
                    mgr.loadPromise = null;
                    mgr.baseModel = null;
                    mgr.clips = {};
                    mgr.instancesPending = [];
                }
            });

            // 3. Bersihkan cache browser (Cache API & IndexedDB) jika tersedia
            if (window.PandoraAssetCache && typeof window.PandoraAssetCache.clear === 'function') {
                try {
                    await window.PandoraAssetCache.clear();
                } catch (eCache) {
                    console.warn('[PandoraHeroRegistry] Catatan clear asset cache:', eCache);
                }
            }

            console.log('[PandoraHeroRegistry] Seluruh cache karakter & asset FBX berhasil dikosongkan.');
        },

        async sync(forceReload = false) {
            if (this.syncPromise && !forceReload) return this.syncPromise;

            this.syncPromise = (async () => {
                const prefix = getRootPrefix();
                let data = null;

                // 1. Panggil api/heroes.php (live directory scanner)
                try {
                    const res = await fetch(prefix + 'api/heroes.php?t=' + Date.now(), { cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        if (json && json.success && Array.isArray(json.characters)) {
                            data = json;
                        }
                    }
                } catch (errApi) {}

                // 2. Fallback ke config/heroes.json jika berjalan di static server tanpa PHP
                if (!data) {
                    try {
                        const resFallback = await fetch(prefix + 'config/heroes.json?t=' + Date.now(), { cache: 'no-store' });
                        if (resFallback.ok) {
                            const jsonFallback = await resFallback.json();
                            if (jsonFallback && Array.isArray(jsonFallback.characters)) {
                                data = jsonFallback;
                            }
                        }
                    } catch (errCfg) {}
                }

                if (data && Array.isArray(data.characters) && data.characters.length > 0) {
                    this.characters = data.characters;
                    if (data.general) this.general = data.general;

                    // Pastikan setiap karakter terdaftar di PandoraHitboxSystem & memiliki AssetManager
                    this.characters.forEach(c => {
                        if (c.id.toLowerCase() !== 'red') {
                            if (!this.assetManagers[c.id]) {
                                this.assetManagers[c.id] = createDynamicHeroFolderAssetManager(c);
                            } else {
                                this.assetManagers[c.id].meta = c;
                            }
                        }
                        if (window.PandoraHitboxSystem && typeof window.PandoraHitboxSystem.ensureCharacterConfig === 'function') {
                            window.PandoraHitboxSystem.ensureCharacterConfig(c.hitToolKey || c.id);
                            window.PandoraHitboxSystem.getCharacterAnimations(c.hitToolKey || c.id);
                        }
                    });
                }

                this.isSynced = true;
                this._notifyListeners();
                return this.characters;
            })();

            return this.syncPromise;
        }
    };

    window.PandoraHeroRegistry = PandoraHeroRegistry;
    // Segera jalankan sinkronisasi otomatis dengan folder hero/
    PandoraHeroRegistry.sync();
})();

// ===================================================================
// STARTUP ASSET PRELOADER (MEMUAT SEMUA ASSET HERO RED FOX & ENEMY)
// Mencegah blank/delay saat masuk ke Demo Mode Play
// ===================================================================
window.preloadAllGameAssets = function(onComplete) {
    if (window.PANDORA_RUNTIME) return; // Build memuat bertahap per stage (game-runtime.js)

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
        if (!window.PANDORA_RUNTIME && (typeof wolfCharacter === 'undefined' || !wolfCharacter)) {
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
        // Prefetch seluruh karakter lain yang terdaftar di background agar instan saat beralih di Demo Mode
        if (window.PandoraHeroRegistry && Array.isArray(window.PandoraHeroRegistry.characters)) {
            window.PandoraHeroRegistry.characters.forEach(c => {
                if (c.id !== 'red') {
                    const mgr = window.PandoraHeroRegistry.getAssetManager(c.id);
                    if (mgr && typeof mgr.load === 'function' && !mgr.isLoaded && !mgr.isLoading) {
                        mgr.load().catch(() => {});
                    }
                }
            });
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