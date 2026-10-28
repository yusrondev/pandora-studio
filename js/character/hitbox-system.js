/* ===================================================================
   PANDORA 3D — BONE-BASED HITBOX & HURTBOX COLLISION SYSTEM
   Menghubungkan hitbox serangan langsung ke tulang 3D (THREE.Bone:
   Tangan, Kaki, Lengan, Betis, Kepala, Dada, dll) sehingga deteksi hit
   saat Play Mode 100% berdasarkan tabrakan area 3D nyata antara
   Hitbox Gerakan dan Hurtbox Tubuh Lawan (bukan sekadar timer waktu).
   =================================================================== */

(function () {
    const STORAGE_KEY = 'pandora_hitbox_config_v2';
    const DEBUG_STORAGE_KEY = 'pandora_hitbox_debug_playmode';

    // Katalog standar tulang (Bone) Mixamo yang bisa dipasangi Hitbox
    const BONE_CATALOG = [
        // Tangan & Lengan Kanan
        { key: 'RightHand', label: '✊ Tangan Kanan (RightHand)', category: 'Tangan & Lengan', aliases: ['mixamorigRightHand', ' mixamorig:RightHand', 'RightHand', 'hand_r', 'R_Hand'] },
        { key: 'RightHandIndex1', label: '👊 Kepalan / Jari Kanan (RightHandIndex1)', category: 'Tangan & Lengan', aliases: ['mixamorigRightHandIndex1', 'mixamorigRightHandMiddle1', 'RightHandIndex1', 'RightHandMiddle1'] },
        { key: 'RightForeArm', label: '💪 Lengan Bawah Kanan (RightForeArm)', category: 'Tangan & Lengan', aliases: ['mixamorigRightForeArm', 'RightForeArm', 'forearm_r'] },
        { key: 'RightArm', label: '🦾 Bahu / Lengan Atas Kanan (RightArm)', category: 'Tangan & Lengan', aliases: ['mixamorigRightArm', 'RightArm', 'upperarm_r'] },

        // Tangan & Lengan Kiri
        { key: 'LeftHand', label: '✊ Tangan Kiri (LeftHand)', category: 'Tangan & Lengan', aliases: ['mixamorigLeftHand', 'mixamorig:LeftHand', 'LeftHand', 'hand_l', 'L_Hand'] },
        { key: 'LeftHandIndex1', label: '👊 Kepalan / Jari Kiri (LeftHandIndex1)', category: 'Tangan & Lengan', aliases: ['mixamorigLeftHandIndex1', 'mixamorigLeftHandMiddle1', 'LeftHandIndex1', 'LeftHandMiddle1'] },
        { key: 'LeftForeArm', label: '💪 Lengan Bawah Kiri (LeftForeArm)', category: 'Tangan & Lengan', aliases: ['mixamorigLeftForeArm', 'LeftForeArm', 'forearm_l'] },
        { key: 'LeftArm', label: '🦾 Bahu / Lengan Atas Kiri (LeftArm)', category: 'Tangan & Lengan', aliases: ['mixamorigLeftArm', 'LeftArm', 'upperarm_l'] },

        // Kaki & Tungkai Kanan
        { key: 'RightFoot', label: '🦶 Kaki / Engkel Kanan (RightFoot)', category: 'Kaki & Tungkai', aliases: ['mixamorigRightFoot', 'RightFoot', 'foot_r', 'R_Foot'] },
        { key: 'RightToeBase', label: '👟 Ujung Telapak Kaki Kanan (RightToeBase)', category: 'Kaki & Tungkai', aliases: ['mixamorigRightToeBase', 'RightToeBase', 'toe_r'] },
        { key: 'RightLeg', label: '🦵 Betis / Tulang Kering Kanan (RightLeg)', category: 'Kaki & Tungkai', aliases: ['mixamorigRightLeg', 'RightLeg', 'calf_r'] },
        { key: 'RightUpLeg', label: '🦵 Lutut / Paha Kanan (RightUpLeg)', category: 'Kaki & Tungkai', aliases: ['mixamorigRightUpLeg', 'RightUpLeg', 'thigh_r'] },

        // Kaki & Tungkai Kiri
        { key: 'LeftFoot', label: '🦶 Kaki / Engkel Kiri (LeftFoot)', category: 'Kaki & Tungkai', aliases: ['mixamorigLeftFoot', 'LeftFoot', 'foot_l', 'L_Foot'] },
        { key: 'LeftToeBase', label: '👟 Ujung Telapak Kaki Kiri (LeftToeBase)', category: 'Kaki & Tungkai', aliases: ['mixamorigLeftToeBase', 'LeftToeBase', 'toe_l'] },
        { key: 'LeftLeg', label: '🦵 Betis / Tulang Kering Kiri (LeftLeg)', category: 'Kaki & Tungkai', aliases: ['mixamorigLeftLeg', 'LeftLeg', 'calf_l'] },
        { key: 'LeftUpLeg', label: '🦵 Lutut / Paha Kiri (LeftUpLeg)', category: 'Kaki & Tungkai', aliases: ['mixamorigLeftUpLeg', 'LeftUpLeg', 'thigh_l'] },

        // Kepala & Badan
        { key: 'Head', label: '🦊 Kepala (Head)', category: 'Kepala & Badan', aliases: ['mixamorigHead', 'Head', 'head'] },
        { key: 'Spine2', label: '🛡️ Dada / Torso Atas (Spine2)', category: 'Kepala & Badan', aliases: ['mixamorigSpine2', 'Spine2', 'chest'] },
        { key: 'Spine1', label: '🥋 Perut / Badan Tengah (Spine1)', category: 'Kepala & Badan', aliases: ['mixamorigSpine1', 'Spine1', 'spine'] },
        { key: 'Hips', label: '⚡ Pinggul / Pusat Badan (Hips)', category: 'Kepala & Badan', aliases: ['mixamorigHips', 'Hips', 'pelvis'] }
    ];

    // Daftar animasi per karakter untuk UI & Runtime
    const CHARACTER_ANIMATIONS = {
        hero: [
            { key: 'punch1', label: 'Punch 1 (Pukulan 1)', type: 'combat', defaultDamage: 25 },
            { key: 'punch2', label: 'Punch 2 (Pukulan 2)', type: 'combat', defaultDamage: 25 },
            { key: 'punch3', label: 'Punch 3 (Pukulan 3 / Finisher)', type: 'combat', defaultDamage: 30 },
            { key: 'flyingPunch', label: 'Flying Punch (Sprint + Punch)', type: 'combat', defaultDamage: 40 },
            { key: 'kick1', label: 'Kick 1 (Tendangan 1)', type: 'combat', defaultDamage: 30 },
            { key: 'kick2', label: 'Kick 2 (Tendangan 2)', type: 'combat', defaultDamage: 30 },
            { key: 'kick3', label: 'Kick 3 (Tendangan 3 / Maju)', type: 'combat', defaultDamage: 35 },
            { key: 'flyingKick', label: 'Flying Kick (Sprint + Kick)', type: 'combat', defaultDamage: 45 },
            { key: 'idle', label: 'Idle (Berdiri Santai)', type: 'preview', defaultDamage: 0 },
            { key: 'walk', label: 'Walk (Berjalan)', type: 'preview', defaultDamage: 0 },
            { key: 'run', label: 'Run (Berlari)', type: 'preview', defaultDamage: 0 },
            { key: 'block', label: 'Block / Shield (Bertahan)', type: 'preview', defaultDamage: 0 },
            { key: 'hit1', label: 'Taking Hit 1 (Terkena Pukul 1)', type: 'preview', defaultDamage: 0 },
            { key: 'hit2', label: 'Taking Hit 2 (Terkena Pukul 2)', type: 'preview', defaultDamage: 0 }
        ],
        'enemy-foxtree': [
            { key: 'punch1', label: 'Enemy Punch 1 (Pukulan 1)', type: 'combat', defaultDamage: 15 },
            { key: 'punch2', label: 'Enemy Punch 2 (Pukulan 2)', type: 'combat', defaultDamage: 15 },
            { key: 'punch3', label: 'Enemy Punch 3 (Pukulan Berat)', type: 'combat', defaultDamage: 22 },
            { key: 'idle', label: 'Enemy Idle (Berdiri)', type: 'preview', defaultDamage: 0 },
            { key: 'walk', label: 'Enemy Walk (Berjalan)', type: 'preview', defaultDamage: 0 },
            { key: 'run', label: 'Enemy Run (Mengejar)', type: 'preview', defaultDamage: 0 },
            { key: 'hit1', label: 'Enemy Hit 1 (Terkena Pukul 1)', type: 'preview', defaultDamage: 0 },
            { key: 'hit2', label: 'Enemy Hit 2 (Terkena Pukul 2)', type: 'preview', defaultDamage: 0 }
        ]
    };

    // Generator konfigurasi default yang presisi (1 Hitbox utama per gerakan, bebas dipindah/ditambah di Hit Tool)
    function createDefaultConfig() {
        return {
            version: 2,
            updatedAt: new Date().toISOString(),
            characters: {
                hero: {
                    hurtbox: {
                        radius: 0.42,
                        height: 1.72,
                        offsetY: 0.02,
                        offsetZ: 0.04,
                        useBoneCapsules: true
                    },
                    animations: {
                        punch1: {
                            damage: 25,
                            knockback: 0.22,
                            activeStartPct: 0.12,
                            activeEndPct: 0.85,
                            hitboxes: [
                                {
                                    id: 'hb_hero_punch1_main',
                                    name: 'Kepalan Tangan Kiri',
                                    bone: 'LeftHand',
                                    shape: 'sphere',
                                    radius: 0.26,
                                    offsetX: 0.0,
                                    offsetY: 0.05,
                                    offsetZ: 0.04,
                                    enabled: true
                                }
                            ]
                        },
                        punch2: {
                            damage: 25,
                            knockback: 0.22,
                            activeStartPct: 0.10,
                            activeEndPct: 0.85,
                            hitboxes: [
                                {
                                    id: 'hb_hero_punch2_main',
                                    name: 'Kepalan Tangan Kanan',
                                    bone: 'RightHand',
                                    shape: 'sphere',
                                    radius: 0.26,
                                    offsetX: 0.0,
                                    offsetY: 0.05,
                                    offsetZ: 0.04,
                                    enabled: true
                                }
                            ]
                        },
                        punch3: {
                            damage: 30,
                            knockback: 0.28,
                            activeStartPct: 0.14,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_hero_punch3_main',
                                    name: 'Kepalan Kanan Finisher',
                                    bone: 'RightHand',
                                    shape: 'sphere',
                                    radius: 0.30,
                                    offsetX: 0.0,
                                    offsetY: 0.06,
                                    offsetZ: 0.05,
                                    enabled: true
                                }
                            ]
                        },
                        flyingPunch: {
                            damage: 40,
                            knockback: 0.36,
                            activeStartPct: 0.10,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_hero_flypunch_main',
                                    name: 'Kepalan Terbang Kanan',
                                    bone: 'RightHand',
                                    shape: 'sphere',
                                    radius: 0.34,
                                    offsetX: 0.0,
                                    offsetY: 0.06,
                                    offsetZ: 0.06,
                                    enabled: true
                                }
                            ]
                        },
                        kick1: {
                            damage: 30,
                            knockback: 0.25,
                            activeStartPct: 0.12,
                            activeEndPct: 0.86,
                            hitboxes: [
                                {
                                    id: 'hb_hero_kick1_main',
                                    name: 'Tendangan Kaki Kanan',
                                    bone: 'RightFoot',
                                    shape: 'sphere',
                                    radius: 0.30,
                                    offsetX: 0.0,
                                    offsetY: 0.04,
                                    offsetZ: 0.06,
                                    enabled: true
                                }
                            ]
                        },
                        kick2: {
                            damage: 30,
                            knockback: 0.28,
                            activeStartPct: 0.12,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_hero_kick2_main',
                                    name: 'Tendangan Kaki Kanan',
                                    bone: 'RightFoot',
                                    shape: 'sphere',
                                    radius: 0.32,
                                    offsetX: 0.0,
                                    offsetY: 0.04,
                                    offsetZ: 0.06,
                                    enabled: true
                                }
                            ]
                        },
                        kick3: {
                            damage: 35,
                            knockback: 0.32,
                            activeStartPct: 0.12,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_hero_kick3_main',
                                    name: 'Tendangan Maju Kaki Kanan',
                                    bone: 'RightFoot',
                                    shape: 'sphere',
                                    radius: 0.32,
                                    offsetX: 0.0,
                                    offsetY: 0.04,
                                    offsetZ: 0.08,
                                    enabled: true
                                }
                            ]
                        },
                        flyingKick: {
                            damage: 45,
                            knockback: 0.42,
                            activeStartPct: 0.10,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_hero_flykick_main',
                                    name: 'Tendangan Terbang Kaki Kanan',
                                    bone: 'RightFoot',
                                    shape: 'sphere',
                                    radius: 0.36,
                                    offsetX: 0.0,
                                    offsetY: 0.04,
                                    offsetZ: 0.08,
                                    enabled: true
                                }
                            ]
                        }
                    }
                },
                'enemy-foxtree': {
                    hurtbox: {
                        radius: 0.44,
                        height: 1.76,
                        offsetY: 0.02,
                        offsetZ: 0.04,
                        useBoneCapsules: true
                    },
                    animations: {
                        punch1: {
                            damage: 15,
                            knockback: 0.22,
                            activeStartPct: 0.12,
                            activeEndPct: 0.85,
                            hitboxes: [
                                {
                                    id: 'hb_enemy_punch1_main',
                                    name: 'Tangan Kanan Musuh',
                                    bone: 'RightHand',
                                    shape: 'sphere',
                                    radius: 0.26,
                                    offsetX: 0.0,
                                    offsetY: 0.05,
                                    offsetZ: 0.05,
                                    enabled: true
                                }
                            ]
                        },
                        punch2: {
                            damage: 15,
                            knockback: 0.22,
                            activeStartPct: 0.12,
                            activeEndPct: 0.85,
                            hitboxes: [
                                {
                                    id: 'hb_enemy_punch2_main',
                                    name: 'Tangan Kiri Musuh',
                                    bone: 'LeftHand',
                                    shape: 'sphere',
                                    radius: 0.26,
                                    offsetX: 0.0,
                                    offsetY: 0.05,
                                    offsetZ: 0.05,
                                    enabled: true
                                }
                            ]
                        },
                        punch3: {
                            damage: 22,
                            knockback: 0.28,
                            activeStartPct: 0.15,
                            activeEndPct: 0.88,
                            hitboxes: [
                                {
                                    id: 'hb_enemy_punch3_main',
                                    name: 'Pukulan Berat Musuh',
                                    bone: 'RightHand',
                                    shape: 'sphere',
                                    radius: 0.30,
                                    offsetX: 0.0,
                                    offsetY: 0.06,
                                    offsetZ: 0.06,
                                    enabled: true
                                }
                            ]
                        }
                    }
                }
            }
        };
    }

    // Normalisasi nama bone Mixamo (menghapus prefix 'mixamorig:', 'mixamorig', 'Armature|', dll)
    function normalizeBoneName(rawName) {
        if (!rawName) return '';
        let s = String(rawName).trim();
        s = s.replace(/^.*\|/, '');
        s = s.replace(/^mixamorig\d*:/i, '');
        s = s.replace(/^mixamorig\d*/i, '');
        s = s.replace(/^Character\d*_/i, '');
        return s.trim();
    }

    // Reusable Three.js math objects untuk zero-GC saat Play Mode
    const _boneWorldPos = new THREE.Vector3();
    const _boneWorldQuat = new THREE.Quaternion();
    const _localOffsetVec = new THREE.Vector3();
    const _hbWorldCenter = new THREE.Vector3();
    const _targetRootPos = new THREE.Vector3();
    const _targetForward = new THREE.Vector3();
    const _cylinderCenter = new THREE.Vector3();
    const _targetBonePos = new THREE.Vector3();

    const PandoraHitboxSystem = {
        BONE_CATALOG: BONE_CATALOG,
        CHARACTER_ANIMATIONS: CHARACTER_ANIMATIONS,
        config: createDefaultConfig(),
        isLoadedFromServer: false,
        showDebugInPlayMode: false,
        _debugVisualGroup: null,
        _debugSpherePool: [],
        _debugCylinderPool: [],

        init() {
            // 1. Load instan dari localStorage jika tersedia
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.characters) {
                        this.mergeConfig(parsed);
                    }
                }
                const dbg = localStorage.getItem(DEBUG_STORAGE_KEY);
                this.showDebugInPlayMode = (dbg === 'true' || dbg === '1');
            } catch (e) {
                console.warn('[PandoraHitboxSystem] LocalStorage load note:', e);
            }

            // 2. Sinkronisasi lintas tab secara live (ketika user klik Simpan di hit-tool.html, tab index.html langsung ter-update!)
            if (typeof window !== 'undefined') {
                window.addEventListener('storage', (ev) => {
                    if (ev.key === STORAGE_KEY && ev.newValue) {
                        try {
                            const updated = JSON.parse(ev.newValue);
                            if (updated && updated.characters) {
                                this.mergeConfig(updated);
                                console.log('[PandoraHitboxSystem] Live-synced hitbox config from Hit Tool tab!');
                            }
                        } catch (err) {}
                    } else if (ev.key === DEBUG_STORAGE_KEY) {
                        this.showDebugInPlayMode = (ev.newValue === 'true' || ev.newValue === '1');
                    }
                });
            }

            // 3. Load async dari server (api/hitboxes.php)
            this.loadFromServer();
        },

        mergeConfig(incoming) {
            if (!incoming || !incoming.characters) return;
            const def = createDefaultConfig();
            ['hero', 'enemy-foxtree'].forEach(charKey => {
                if (!this.config.characters[charKey]) {
                    this.config.characters[charKey] = def.characters[charKey];
                }
                const incChar = incoming.characters[charKey];
                if (!incChar) return;

                if (incChar.hurtbox) {
                    this.config.characters[charKey].hurtbox = Object.assign(
                        {},
                        def.characters[charKey].hurtbox,
                        incChar.hurtbox
                    );
                }
                if (incChar.animations && typeof incChar.animations === 'object') {
                    Object.keys(incChar.animations).forEach(animKey => {
                        const incAnim = incChar.animations[animKey];
                        if (incAnim && Array.isArray(incAnim.hitboxes)) {
                            this.config.characters[charKey].animations[animKey] = {
                                damage: typeof incAnim.damage === 'number' ? incAnim.damage : 25,
                                knockback: typeof incAnim.knockback === 'number' ? incAnim.knockback : 0.22,
                                activeStartPct: typeof incAnim.activeStartPct === 'number' ? incAnim.activeStartPct : 0.10,
                                activeEndPct: typeof incAnim.activeEndPct === 'number' ? incAnim.activeEndPct : 0.88,
                                hitboxes: incAnim.hitboxes.map((hb, idx) => ({
                                    id: hb.id || `hb_${charKey}_${animKey}_${idx}`,
                                    name: hb.name || hb.bone || 'Hitbox',
                                    bone: hb.bone || 'RightHand',
                                    shape: hb.shape || 'sphere',
                                    radius: typeof hb.radius === 'number' ? hb.radius : 0.28,
                                    offsetX: typeof hb.offsetX === 'number' ? hb.offsetX : 0.0,
                                    offsetY: typeof hb.offsetY === 'number' ? hb.offsetY : 0.0,
                                    offsetZ: typeof hb.offsetZ === 'number' ? hb.offsetZ : 0.0,
                                    enabled: hb.enabled !== false
                                }))
                            };
                        }
                    });
                }
            });
            if (incoming.updatedAt) {
                this.config.updatedAt = incoming.updatedAt;
            }
        },

        async loadFromServer() {
            try {
                const res = await fetch('api/hitboxes.php?t=' + Date.now(), { cache: 'no-store' });
                if (!res.ok) return null;
                const data = await res.json();
                if (data && data.success && data.config && data.config.characters) {
                    this.mergeConfig(data.config);
                    this.isLoadedFromServer = true;
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
                    } catch (e) {}
                    return this.config;
                }
            } catch (err) {
                // Offline atau static server: gunakan localStorage / default
            }
            return this.config;
        },

        async saveConfig(customConfig = null) {
            if (customConfig) {
                this.mergeConfig(customConfig);
            }
            this.config.updatedAt = new Date().toISOString();

            // Simpan ke localStorage agar tab lain langsung tersinkronisasi
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
            } catch (e) {
                console.warn('[PandoraHitboxSystem] Could not write localStorage:', e);
            }

            // Simpan ke file server config/hitboxes.json melalui api/hitboxes.php
            try {
                const res = await fetch('api/hitboxes.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config: this.config })
                });
                const data = await res.json();
                return data;
            } catch (err) {
                console.warn('[PandoraHitboxSystem] Saved to localStorage (API note):', err);
                return { success: true, localOnly: true, message: 'Disimpan ke LocalStorage Browser' };
            }
        },

        resetToDefault(charKey = null, animKey = null) {
            const def = createDefaultConfig();
            if (charKey && animKey) {
                if (def.characters[charKey] && def.characters[charKey].animations[animKey]) {
                    this.config.characters[charKey].animations[animKey] = JSON.parse(
                        JSON.stringify(def.characters[charKey].animations[animKey])
                    );
                } else if (this.config.characters[charKey]) {
                    this.config.characters[charKey].animations[animKey] = {
                        damage: 25,
                        knockback: 0.22,
                        activeStartPct: 0.10,
                        activeEndPct: 0.88,
                        hitboxes: []
                    };
                }
            } else if (charKey && def.characters[charKey]) {
                this.config.characters[charKey] = JSON.parse(JSON.stringify(def.characters[charKey]));
            } else {
                this.config = def;
            }
            return this.config;
        },

        setDebugPlayMode(enabled) {
            this.showDebugInPlayMode = !!enabled;
            try {
                localStorage.setItem(DEBUG_STORAGE_KEY, this.showDebugInPlayMode ? 'true' : 'false');
            } catch (e) {}
            if (!this.showDebugInPlayMode && this._debugVisualGroup) {
                this._debugVisualGroup.visible = false;
            }
        },

        getAnimationConfig(charKey, animKey) {
            const cKey = charKey || 'hero';
            const charCfg = this.config.characters[cKey] || this.config.characters.hero;
            if (!charCfg) return null;
            if (!charCfg.animations[animKey]) {
                charCfg.animations[animKey] = {
                    damage: 25,
                    knockback: 0.22,
                    activeStartPct: 0.10,
                    activeEndPct: 0.88,
                    hitboxes: []
                };
            }
            return charCfg.animations[animKey];
        },

        getHurtboxConfig(charKey) {
            const cKey = charKey || 'hero';
            const charCfg = this.config.characters[cKey] || this.config.characters.hero;
            return (charCfg && charCfg.hurtbox) ? charCfg.hurtbox : {
                radius: 0.42,
                height: 1.72,
                offsetY: 0.02,
                offsetZ: 0.04,
                useBoneCapsules: true
            };
        },

        /**
         * Membangun & menyimpan cache daftar THREE.Bone pada instance karakter
         */
        ensureBoneCache(instance) {
            if (!instance) return null;
            const searchRoot = instance.modelMesh || instance.root;
            if (!searchRoot) return null;

            if (instance._boneMap && Object.keys(instance._boneMap).length > 0 && instance._boneMapRoot === searchRoot) {
                return instance._boneMap;
            }

            const boneMap = {};
            const allBones = [];

            searchRoot.traverse((child) => {
                if (child.isBone || (child.type === 'Bone') || (child.name && child.name.toLowerCase().includes('mixamorig'))) {
                    const norm = normalizeBoneName(child.name);
                    if (norm && !boneMap[norm]) {
                        boneMap[norm] = child;
                    }
                    boneMap[child.name] = child;
                    allBones.push({ key: norm || child.name, rawName: child.name, bone: child });
                }
            });

            // Cocokkan juga dengan alias di BONE_CATALOG
            for (let i = 0; i < BONE_CATALOG.length; i++) {
                const entry = BONE_CATALOG[i];
                if (boneMap[entry.key]) continue;
                for (let a = 0; a < entry.aliases.length; a++) {
                    const alias = entry.aliases[a];
                    if (boneMap[alias]) {
                        boneMap[entry.key] = boneMap[alias];
                        break;
                    }
                }
                if (!boneMap[entry.key]) {
                    const lowerKey = entry.key.toLowerCase();
                    const found = allBones.find(b => b.key.toLowerCase() === lowerKey || b.rawName.toLowerCase().endsWith(lowerKey));
                    if (found) boneMap[entry.key] = found.bone;
                }
            }

            instance._boneMap = boneMap;
            instance._allBonesList = allBones;
            instance._boneMapRoot = searchRoot;
            return boneMap;
        },

        resolveBone(instance, boneKey) {
            if (!instance || !boneKey) return null;
            const map = this.ensureBoneCache(instance);
            if (!map) return null;
            if (map[boneKey]) return map[boneKey];
            const norm = normalizeBoneName(boneKey);
            if (map[norm]) return map[norm];
            const lower = norm.toLowerCase();
            for (const k in map) {
                if (k.toLowerCase() === lower) return map[k];
            }
            return null;
        },

        /**
         * Menghitung posisi & orientasi dunia (World Space dalam satuan meter Three.js)
         * dari sebuah Hitbox yang menempel pada tulang (Bone).
         */
        getHitboxWorldTransform(instance, hb, outCenter = null, outQuat = null) {
            const center = outCenter || _hbWorldCenter;
            const bone = this.resolveBone(instance, hb.bone);
            if (bone) {
                bone.updateWorldMatrix(true, false);
                bone.getWorldPosition(_boneWorldPos);
                bone.getWorldQuaternion(_boneWorldQuat);

                _localOffsetVec.set(
                    Number(hb.offsetX) || 0,
                    Number(hb.offsetY) || 0,
                    Number(hb.offsetZ) || 0
                ).applyQuaternion(_boneWorldQuat);

                center.copy(_boneWorldPos).add(_localOffsetVec);
                if (outQuat) outQuat.copy(_boneWorldQuat);
                return {
                    valid: true,
                    bone: bone,
                    center: center,
                    radius: Math.max(0.04, Number(hb.radius) || 0.25)
                };
            }

            // Fallback ke root jika bone belum termuat
            if (instance && instance.root) {
                instance.root.getWorldPosition(_boneWorldPos);
                center.copy(_boneWorldPos);
                center.y += 1.0 + (Number(hb.offsetY) || 0);
                return {
                    valid: true,
                    bone: null,
                    center: center,
                    radius: Math.max(0.04, Number(hb.radius) || 0.25)
                };
            }

            return { valid: false, bone: null, center: center, radius: 0.25 };
        },

        /**
         * Mengecek apakah bola Hitbox (center, radius) bersinggungan secara 3D
         * dengan volume Hurtbox dari Target (Silinder Badan + Kapsul Tulang Utama).
         * Mengembalikan detail jarak & bagian yang mengenai jika terjadi tabrakan.
         */
        checkSphereAgainstTargetHurtbox(hbCenter, hbRadius, targetInstance, targetCharKey = 'enemy-foxtree') {
            if (!targetInstance || !targetInstance.root) {
                return { hit: false, distance: 999, penetration: 0 };
            }

            const hurtbox = this.getHurtboxConfig(targetCharKey);
            const tRoot = targetInstance.root;
            tRoot.getWorldPosition(_targetRootPos);

            const rotY = tRoot.rotation ? tRoot.rotation.y : 0;
            _targetForward.set(Math.sin(rotY), 0, Math.cos(rotY));

            const cylRadius = Math.max(0.15, Number(hurtbox.radius) || 0.42);
            const cylHeight = Math.max(0.50, Number(hurtbox.height) || 1.72);
            const cylBottomY = _targetRootPos.y + (Number(hurtbox.offsetY) || 0);
            const cylTopY = cylBottomY + cylHeight;

            _cylinderCenter.set(
                _targetRootPos.x + _targetForward.x * (Number(hurtbox.offsetZ) || 0),
                cylBottomY,
                _targetRootPos.z + _targetForward.z * (Number(hurtbox.offsetZ) || 0)
            );

            // 1. Cek terhadap Silinder Hurtbox Utama
            const clampedY = THREE.MathUtils.clamp(hbCenter.y, cylBottomY, cylTopY);
            const dx = hbCenter.x - _cylinderCenter.x;
            const dy = hbCenter.y - clampedY;
            const dz = hbCenter.z - _cylinderCenter.z;
            const distToCylinderAxis = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const combinedCylRadius = hbRadius + cylRadius;

            let minSurfaceDist = distToCylinderAxis - combinedCylRadius;
            let hitPart = 'Badan (Torso)';

            // 2. Cek juga terhadap tulang utama target (Head, Spine2, Spine1, Hips)
            // agar jika target sedang menunduk/condong ke depan saat animasi, bagian kepala/dada tetap akurat terkena hit!
            if (hurtbox.useBoneCapsules !== false) {
                const targetModel = targetInstance.model || targetInstance;
                const coreBones = [
                    { key: 'Head', label: 'Kepala', r: cylRadius * 0.62 },
                    { key: 'Spine2', label: 'Dada', r: cylRadius * 0.88 },
                    { key: 'Spine1', label: 'Perut', r: cylRadius * 0.85 },
                    { key: 'Hips', label: 'Pinggul', r: cylRadius * 0.85 }
                ];
                for (let i = 0; i < coreBones.length; i++) {
                    const cb = coreBones[i];
                    const bNode = this.resolveBone(targetModel, cb.key);
                    if (bNode) {
                        bNode.updateWorldMatrix(true, false);
                        bNode.getWorldPosition(_targetBonePos);
                        const d = hbCenter.distanceTo(_targetBonePos) - (hbRadius + cb.r);
                        if (d < minSurfaceDist) {
                            minSurfaceDist = d;
                            hitPart = cb.label;
                        }
                    }
                }
            }

            return {
                hit: minSurfaceDist <= 0,
                distance: Math.max(0, minSurfaceDist),
                penetration: minSurfaceDist < 0 ? -minSurfaceDist : 0,
                hitPart: hitPart
            };
        },

        /**
         * Mengevaluasi semua Hitbox aktif pada karakter penyerang terhadap satu target
         * (Digunakan baik di Play Mode maupun secara real-time di Hit Tool).
         */
        evaluateAttackAgainstTarget(attackerInstance, attackerCharKey, animKey, animProgressPct, targetInstance, targetCharKey) {
            const animCfg = this.getAnimationConfig(attackerCharKey, animKey);
            if (!animCfg || !Array.isArray(animCfg.hitboxes) || animCfg.hitboxes.length === 0) {
                return { hit: false, activeWindow: false, minDistance: 999, hitboxes: [] };
            }

            const startPct = typeof animCfg.activeStartPct === 'number' ? animCfg.activeStartPct : 0.0;
            const endPct = typeof animCfg.activeEndPct === 'number' ? animCfg.activeEndPct : 1.0;
            const inActiveWindow = (animProgressPct >= startPct && animProgressPct <= endPct);

            // Pastikan matriks tulang penyerang sudah diperbarui pada frame ini
            if (attackerInstance && attackerInstance.root) {
                attackerInstance.root.updateMatrixWorld(true);
            }
            if (targetInstance && targetInstance.root) {
                targetInstance.root.updateMatrixWorld(true);
            }

            let bestHit = null;
            let minDistance = 999;
            const hitboxStates = [];

            for (let i = 0; i < animCfg.hitboxes.length; i++) {
                const hb = animCfg.hitboxes[i];
                if (hb.enabled === false) continue;

                const center = new THREE.Vector3();
                const tf = this.getHitboxWorldTransform(attackerInstance, hb, center);
                if (!tf.valid) continue;

                const check = this.checkSphereAgainstTargetHurtbox(center, tf.radius, targetInstance, targetCharKey);
                if (check.distance < minDistance) {
                    minDistance = check.distance;
                }

                const isHittingNow = inActiveWindow && check.hit;
                const stateItem = {
                    hitbox: hb,
                    worldCenter: center,
                    worldRadius: tf.radius,
                    inActiveWindow: inActiveWindow,
                    isTouchingGeometry: check.hit,
                    isTriggeredHit: isHittingNow,
                    distance: check.distance,
                    penetration: check.penetration,
                    hitPart: check.hitPart
                };
                hitboxStates.push(stateItem);

                if (isHittingNow && !bestHit) {
                    bestHit = stateItem;
                }
            }

            return {
                hit: !!bestHit,
                bestHit: bestHit,
                inActiveWindow: inActiveWindow,
                minDistance: minDistance,
                damage: animCfg.damage || 25,
                knockback: animCfg.knockback || 0.22,
                hitboxes: hitboxStates
            };
        },

        /**
         * Dipanggil oleh Hero (_checkMeleeStrike di fox-model.js) saat Play Mode.
         * Mengembalikan true jika serangan mengenai musuh berdasarkan tabrakan 3D Hitbox Tulang.
         */
        checkHeroMeleeStrike(heroInstance) {
            if (!heroInstance || heroInstance.strikeProcessed) return false;
            const attackKey = heroInstance.isPunching
                ? heroInstance.activePunchKey
                : (heroInstance.isKicking ? heroInstance.activeKickKey : null);
            if (!attackKey) return false;

            const animCfg = this.getAnimationConfig('hero', attackKey);
            if (!animCfg || !Array.isArray(animCfg.hitboxes) || animCfg.hitboxes.length === 0) {
                return false;
            }

            // Hitung persentase progres klip animasi yang sedang berjalan (0.0 -> 1.0)
            let progressPct = 0.5;
            const action = heroInstance.actions ? heroInstance.actions[attackKey] : null;
            if (action && action.getClip && action.getClip() && action.getClip().duration > 0.001) {
                progressPct = THREE.MathUtils.clamp(action.time / action.getClip().duration, 0, 1);
            } else {
                const timer = heroInstance.isPunching ? heroInstance.punchTimer : heroInstance.kickTimer;
                const dur = (heroInstance.isPunching ? heroInstance.punchDuration : heroInstance.kickDuration) || 0.85;
                progressPct = THREE.MathUtils.clamp(timer / dur, 0, 1);
            }

            const startPct = typeof animCfg.activeStartPct === 'number' ? animCfg.activeStartPct : 0.08;
            const endPct = typeof animCfg.activeEndPct === 'number' ? animCfg.activeEndPct : 0.90;
            if (progressPct < startPct || progressPct > endPct) {
                return false;
            }

            const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) ? spawnedFoxesList : [];
            if (list.length === 0) return false;

            heroInstance.root.updateMatrixWorld(true);
            const pPos = heroInstance.root.position;
            let hitAny = false;

            for (let i = 0; i < list.length; i++) {
                const enemyItem = list[i];
                if (!enemyItem || !enemyItem.root || !enemyItem.root.visible) continue;
                const isDead = (enemyItem.ai && enemyItem.ai.isDead) || (enemyItem.model && enemyItem.model.isDead) || ((enemyItem.health || 0) <= 0);
                if (isDead) continue;

                // Broadphase jarak 3.2m
                if (pPos.distanceToSquared(enemyItem.root.position) > 10.24) continue;

                const evalRes = this.evaluateAttackAgainstTarget(
                    heroInstance,
                    'hero',
                    attackKey,
                    progressPct,
                    enemyItem,
                    'enemy-foxtree'
                );

                if (evalRes.hit) {
                    hitAny = true;
                    const strikeDamage = typeof animCfg.damage === 'number'
                        ? animCfg.damage
                        : ((attackKey === 'flyingKick') ? 45 : (attackKey === 'flyingPunch' ? 40 : (attackKey.startsWith('kick') ? 30 : 25)));

                    const isCrit = (attackKey === 'flyingKick' || attackKey === 'flyingPunch' || attackKey === 'kick3' || attackKey === 'punch3');
                    const hitWorldPos = (evalRes.bestHit && evalRes.bestHit.worldCenter)
                        ? evalRes.bestHit.worldCenter.clone()
                        : new THREE.Vector3(enemyItem.root.position.x, enemyItem.root.position.y + 1.25, enemyItem.root.position.z);

                    if (enemyItem.ai && typeof enemyItem.ai.takeDamage === 'function') {
                        enemyItem.ai.takeDamage(strikeDamage, pPos, hitWorldPos, isCrit);
                    } else {
                        if (typeof enemyItem.health === 'number') {
                            enemyItem.health = Math.max(0, enemyItem.health - strikeDamage);
                        }
                        if (typeof CombatHUD !== 'undefined' && CombatHUD && typeof CombatHUD.spawnFloatingDamage === 'function') {
                            CombatHUD.spawnFloatingDamage(hitWorldPos, strikeDamage, isCrit);
                        }
                        if (enemyItem.model && typeof enemyItem.model.takeDamage === 'function') {
                            enemyItem.model.takeDamage(strikeDamage, pPos);
                        } else if (enemyItem.model && typeof enemyItem.model.takeHit === 'function') {
                            enemyItem.model.takeHit(pPos);
                        }
                    }

                    if (typeof FoxAIManager !== 'undefined' && FoxAIManager && FoxAIManager.getAgent) {
                        const ag = FoxAIManager.getAgent(enemyItem);
                        if (ag) {
                            ag.state = 'HIT_STUN';
                            ag.hitStunTimer = (enemyItem.model && enemyItem.model.hitDuration) ? enemyItem.model.hitDuration : 0.55;
                        }
                    }
                }
            }

            if (hitAny) {
                heroInstance.strikeProcessed = true;
            }
            return hitAny;
        },

        /**
         * Dipanggil oleh Enemy FoxTree saat memukul Player di Play Mode.
         * Mengembalikan true jika hitbox tangan Enemy benar-benar menyentuh Hurtbox Player.
         */
        checkEnemyMeleeStrike(enemyInstance) {
            if (!enemyInstance || enemyInstance.strikeProcessed) return false;
            const attackKey = enemyInstance.activePunchKey || 'punch1';

            const isPlayerDead = Boolean(
                (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) ||
                (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isDead)
            );
            if (isPlayerDead) {
                // Jangan batalkan animasi serangan terakhir musuh; cukup tandai strikeProcessed agar tidak memberi damage lagi
                enemyInstance.strikeProcessed = true;
                return false;
            }

            if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) {
                return false;
            }

            const animCfg = this.getAnimationConfig('enemy-foxtree', attackKey);
            if (!animCfg || !Array.isArray(animCfg.hitboxes) || animCfg.hitboxes.length === 0) {
                return false;
            }

            let progressPct = 0.5;
            const action = enemyInstance.actions ? enemyInstance.actions[attackKey] : null;
            if (action && action.getClip && action.getClip() && action.getClip().duration > 0.001) {
                progressPct = THREE.MathUtils.clamp(action.time / action.getClip().duration, 0, 1);
            } else {
                const dur = enemyInstance.punchDuration || 0.80;
                progressPct = THREE.MathUtils.clamp(enemyInstance.punchTimer / dur, 0, 1);
            }

            const startPct = typeof animCfg.activeStartPct === 'number' ? animCfg.activeStartPct : 0.10;
            const endPct = typeof animCfg.activeEndPct === 'number' ? animCfg.activeEndPct : 0.88;
            if (progressPct < startPct || progressPct > endPct) {
                return false;
            }

            // Broadphase
            if (enemyInstance.root.position.distanceToSquared(wolfCharacter.root.position) > 9.0) {
                return false;
            }

            const evalRes = this.evaluateAttackAgainstTarget(
                enemyInstance,
                'enemy-foxtree',
                attackKey,
                progressPct,
                wolfCharacter,
                'hero'
            );

            if (evalRes.hit) {
                enemyInstance.strikeProcessed = true;
                if (typeof PlayerHealthState !== 'undefined') {
                    const cfgDmg = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined')
                        ? (enemyInstance.isBoss ? window.ENEMY_COMBAT_CONFIG.boss.damagePerHit : window.ENEMY_COMBAT_CONFIG.nonBoss.damagePerHit)
                        : (animCfg.damage || 15);
                    const finalDmg = (typeof enemyInstance.damagePerHit === 'number') ? enemyInstance.damagePerHit : cfgDmg;
                    PlayerHealthState.takeDamage(finalDmg, enemyInstance.root.position);
                }
                if (typeof wolfCharacter !== 'undefined' && wolfCharacter && !wolfCharacter.isBlocking) {
                    if (typeof wolfCharacter.takeHit === 'function') {
                        wolfCharacter.takeHit(enemyInstance.root.position);
                    }
                }
                return true;
            }

            return false;
        },

        /**
         * Visualisasi Debug Hitbox (Merah) & Hurtbox (Hijau) opsional di Play Mode (index.html)
         */
        updatePlayModeDebugVisuals(sceneRef) {
            if (!this.showDebugInPlayMode || typeof isPlayMode === 'undefined' || !isPlayMode || !sceneRef) {
                if (this._debugVisualGroup) this._debugVisualGroup.visible = false;
                return;
            }

            if (!this._debugVisualGroup) {
                this._debugVisualGroup = new THREE.Group();
                this._debugVisualGroup.name = 'PandoraPlayModeHitboxDebug';
                sceneRef.add(this._debugVisualGroup);
            }
            this._debugVisualGroup.visible = true;

            let sphereIdx = 0;
            let cylIdx = 0;

            const getDebugSphere = (radius, colorHex) => {
                let mesh = this._debugSpherePool[sphereIdx++];
                if (!mesh) {
                    const geo = new THREE.SphereGeometry(1, 14, 12);
                    const mat = new THREE.MeshBasicMaterial({
                        color: colorHex,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.75,
                        depthTest: false
                    });
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.renderOrder = 9999;
                    this._debugVisualGroup.add(mesh);
                    this._debugSpherePool.push(mesh);
                }
                mesh.visible = true;
                mesh.scale.set(radius, radius, radius);
                mesh.material.color.setHex(colorHex);
                return mesh;
            };

            const getDebugCylinder = (radius, height, colorHex) => {
                let mesh = this._debugCylinderPool[cylIdx++];
                if (!mesh) {
                    const geo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
                    const mat = new THREE.MeshBasicMaterial({
                        color: colorHex,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.45,
                        depthTest: false
                    });
                    mesh = new THREE.Mesh(geo, mat);
                    mesh.renderOrder = 9998;
                    this._debugVisualGroup.add(mesh);
                    this._debugCylinderPool.push(mesh);
                }
                mesh.visible = true;
                mesh.scale.set(radius, height, radius);
                mesh.material.color.setHex(colorHex);
                return mesh;
            };

            // 1. Tampilkan Hitbox & Hurtbox Hero
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                const hBox = this.getHurtboxConfig('hero');
                const cyl = getDebugCylinder(hBox.radius, hBox.height, 0x22c55e);
                cyl.position.copy(wolfCharacter.root.position);
                cyl.position.y += (hBox.offsetY || 0) + hBox.height * 0.5;

                const atkKey = wolfCharacter.isPunching ? wolfCharacter.activePunchKey : (wolfCharacter.isKicking ? wolfCharacter.activeKickKey : null);
                if (atkKey) {
                    const animCfg = this.getAnimationConfig('hero', atkKey);
                    if (animCfg && Array.isArray(animCfg.hitboxes)) {
                        wolfCharacter.root.updateMatrixWorld(true);
                        animCfg.hitboxes.forEach(hb => {
                            if (hb.enabled === false) return;
                            const c = new THREE.Vector3();
                            const tf = this.getHitboxWorldTransform(wolfCharacter, hb, c);
                            if (tf.valid) {
                                const sp = getDebugSphere(tf.radius, 0xef4444);
                                sp.position.copy(c);
                            }
                        });
                    }
                }
            }

            // 2. Tampilkan Hurtbox & Hitbox Enemy
            const list = (typeof spawnedFoxesList !== 'undefined' && Array.isArray(spawnedFoxesList)) ? spawnedFoxesList : [];
            const eHurt = this.getHurtboxConfig('enemy-foxtree');
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (!item || !item.root || !item.root.visible) continue;
                const isDead = (item.ai && item.ai.isDead) || (item.model && item.model.isDead);
                if (isDead) continue;

                const cyl = getDebugCylinder(eHurt.radius, eHurt.height, 0x10b981);
                cyl.position.copy(item.root.position);
                cyl.position.y += (eHurt.offsetY || 0) + eHurt.height * 0.5;

                if (item.model && item.model.isPunching) {
                    const pKey = item.model.activePunchKey || 'punch1';
                    const animCfg = this.getAnimationConfig('enemy-foxtree', pKey);
                    if (animCfg && Array.isArray(animCfg.hitboxes)) {
                        item.root.updateMatrixWorld(true);
                        animCfg.hitboxes.forEach(hb => {
                            if (hb.enabled === false) return;
                            const c = new THREE.Vector3();
                            const tf = this.getHitboxWorldTransform(item.model, hb, c);
                            if (tf.valid) {
                                const sp = getDebugSphere(tf.radius, 0xf97316);
                                sp.position.copy(c);
                            }
                        });
                    }
                }
            }

            for (let i = sphereIdx; i < this._debugSpherePool.length; i++) {
                this._debugSpherePool[i].visible = false;
            }
            for (let i = cylIdx; i < this._debugCylinderPool.length; i++) {
                this._debugCylinderPool[i].visible = false;
            }
        }
    };

    PandoraHitboxSystem.init();
    window.PandoraHitboxSystem = PandoraHitboxSystem;
})();

