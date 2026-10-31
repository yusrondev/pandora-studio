/* ===================================================================
   PANDORA 3D — DEDICATED HIT TOOL & COMBAT COLLIDER STUDIO (hit-tool.js)
   Fitur Utama:
   - Memilih Karakter (Hero Red Fox / Enemy FoxTree) & Animasi Gerakan
   - Memasang Hitbox langsung pada Tulang / Bagian Tubuh (Kaki, Tangan, Lengan, Betis, Kepala, Dada)
   - Klik langsung Sendi Tulang (Bone Dot) di 3D Viewport atau dari Panel Kiri
   - Geser Offset Hitbox dengan 3D Transform Gizmo atau Slider
   - Simulasi Tabrakan Real-Time 3D terhadap Target Dummy Lawan (Hurtbox Hijau)
   - Menyimpan konfigurasi ke config/hitboxes.json & LocalStorage untuk Play Mode
   =================================================================== */

(function () {
    const HS = window.PandoraHitboxSystem;
    if (!HS) {
        console.error('[HitTool] PandoraHitboxSystem belum dimuat!');
        return;
    }

    // State Studio Hit Tool
    let activeCharKey = 'hero';          // 'hero' | 'enemy-foxtree'
    let activeAnimKey = 'punch1';        // 'punch1', 'kick1', dll
    let selectedHitboxId = null;

    // Mode Studio: 'hitbox' (Combat Collider) vs 'attachment' (Character 3D Socket Manager & T-Pose)
    let currentStudioMode = 'hitbox';
    let selectedAttachmentId = null;
    let gizmoMode = 'translate';         // 'translate' | 'rotate' | 'scale'
    let isPreviewAnimInAttachment = false;
    let isBoneDotsVisible = true;
    const attachmentVisualMap = new Map(); // attachment.id -> THREE.Group (Mesh Wrapper)

    // Transport & Timeline State
    let isPlaying = true;
    let isLooping = true;
    let playbackSpeed = 1.0;
    let currentClipTime = 0.0;
    let currentClipDuration = 1.0;
    let dummyHitTriggeredInCycle = false;

    // Target Dummy State
    let dummyEnabled = true;
    let dummyDistance = 1.05;
    let dummyAngleDeg = 0;
    let dummyAutoReact = true;
    let dummyReactionTimer = 0.0;

    // 3D Scene & Objects
    let container, scene, camera, renderer, orbitControls, transformControl;
    let gizmoAnchor = null;
    let isDraggingGizmo = false;

    const charInstances = {}; // key ('hero', 'enemy-foxtree', 'tharon', dll) -> character model instance
    let heroInstance = null;
    let enemyInstance = null;

    // Visual Groups
    let boneDotsGroup = null;
    let boneDotMeshes = []; // { boneKey, mesh }
    let hitboxVisualGroup = null;
    let hitboxMeshesMap = new Map(); // id -> { solidMesh, wireMesh }
    let hurtboxVisualGroup = null;
    const attackRangeRings = [];
    let hurtboxCylinderMesh = null;
    let hurtboxBoneSpheres = [];
    let impactRingMesh = null;
    let impactRingAlpha = 0.0;

    // Marker Sorotan Lokasi Tulang saat di-hover di Dropdown / Chip
    let boneHighlightMarker = null;
    let boneHighlightRingMesh = null;
    let boneHighlightOuterMesh = null;
    let activeHighlightedBoneNode = null;
    let boneHighlightTimeout = null;

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const clock = new THREE.Clock();

    function showToast(msg, bg = '#10b981') {
        const el = document.getElementById('ht-toast');
        if (!el) return;
        el.innerText = msg;
        el.classList.toggle('error', bg === '#ef4444');
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    function getAttackerInstance() {
        return charInstances[activeCharKey] || heroInstance || enemyInstance;
    }

    function getDummyCharKey() {
        if (activeCharKey === 'hero') {
            return charInstances['enemy-foxtree'] ? 'enemy-foxtree' : (Object.keys(charInstances).find(k => k !== 'hero') || 'enemy-foxtree');
        }
        return 'hero';
    }

    function getDummyInstance() {
        const dKey = getDummyCharKey();
        return charInstances[dKey] || enemyInstance || heroInstance;
    }

    // ===================================================================
    // 1. INISIALISASI SCENE 3D & VIEWPORT
    // ===================================================================
    function initScene() {
        container = document.getElementById('ht-viewport-container');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x393939);

        camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.05, 100);
        camera.position.set(2.35, 1.55, 2.25);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.target.set(0, 0.95, 0.45);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.08;
        orbitControls.maxPolarAngle = Math.PI * 0.495;
        orbitControls.minDistance = 0.6;
        orbitControls.maxDistance = 12.0;
        orbitControls.update();

        // Pencahayaan Studio 3 Titik
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x262630, 0.85);
        hemiLight.position.set(0, 10, 0);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xfff8f0, 1.15);
        dirLight.position.set(4, 8, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 25;
        const d = 4;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        scene.add(dirLight);

        const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.45);
        rimLight.position.set(-4, 4, -4);
        scene.add(rimLight);

        // Lantai Studio & Grid Pengukur Jarak
        const floorGeo = new THREE.PlaneGeometry(30, 30);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.92, metalness: 0.05 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);

        const gridHelper = new THREE.GridHelper(12, 24, 0x4b5563, 0x272730);
        gridHelper.position.y = 0.002;
        scene.add(gridHelper);

        // Lingkaran Pengukur Jarak Serang (0.5m, 1.0m, 1.5m, 2.0m dari titik penyerang)
        [0.5, 1.0, 1.5, 2.0].forEach((r, idx) => {
            const ringGeo = new THREE.RingGeometry(r - 0.012, r + 0.012, 64);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: idx === 1 ? 0xef4444 : 0x3f3f4e,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: idx === 1 ? 0.45 : 0.25
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = 0.004;
            scene.add(ring);
            attackRangeRings.push(ring);
        });

        // Visual Groups untuk Hitbox, Hurtbox, dan Bone Dots
        boneDotsGroup = new THREE.Group();
        boneDotsGroup.name = 'BoneDotsGroup';
        scene.add(boneDotsGroup);

        hitboxVisualGroup = new THREE.Group();
        hitboxVisualGroup.name = 'HitboxVisualGroup';
        scene.add(hitboxVisualGroup);

        hurtboxVisualGroup = new THREE.Group();
        hurtboxVisualGroup.name = 'HurtboxVisualGroup';
        scene.add(hurtboxVisualGroup);

        // Buat Mesh Hurtbox Silinder Target
        const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
        const cylMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            wireframe: true,
            transparent: true,
            opacity: 0.55,
            depthTest: false
        });
        hurtboxCylinderMesh = new THREE.Mesh(cylGeo, cylMat);
        hurtboxCylinderMesh.renderOrder = 990;
        hurtboxVisualGroup.add(hurtboxCylinderMesh);

        // Buat 4 bola kapsul tulang Hurtbox (Head, Spine2, Spine1, Hips)
        for (let i = 0; i < 4; i++) {
            const sGeo = new THREE.SphereGeometry(1, 12, 10);
            const sMat = new THREE.MeshBasicMaterial({
                color: 0x34d399,
                wireframe: true,
                transparent: true,
                opacity: 0.35,
                depthTest: false
            });
            const sMesh = new THREE.Mesh(sGeo, sMat);
            sMesh.renderOrder = 991;
            hurtboxVisualGroup.add(sMesh);
            hurtboxBoneSpheres.push(sMesh);
        }

        // Buat Cincin Efek Impact (Muncul di titik kontak saat Hitbox menyentuh Hurtbox)
        const impGeo = new THREE.RingGeometry(0.08, 0.22, 32);
        const impMat = new THREE.MeshBasicMaterial({
            color: 0xfacc15,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.0,
            depthTest: false
        });
        impactRingMesh = new THREE.Mesh(impGeo, impMat);
        impactRingMesh.renderOrder = 9999;
        scene.add(impactRingMesh);

        // Buat Bone Dots (20 titik sendi utama)
        HS.BONE_CATALOG.forEach((bEntry) => {
            const dotGeo = new THREE.SphereGeometry(0.032, 10, 10);
            const dotMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.85,
                depthTest: false
            });
            const dotMesh = new THREE.Mesh(dotGeo, dotMat);
            dotMesh.renderOrder = 9995;
            dotMesh.userData.boneKey = bEntry.key;
            dotMesh.userData.boneLabel = bEntry.label;
            boneDotsGroup.add(dotMesh);
            boneDotMeshes.push({ boneKey: bEntry.key, mesh: dotMesh });
        });

        // Marker Sorotan Tulang (Muncul di 3D saat user memilih atau meng-hover pilihan tulang)
        boneHighlightMarker = new THREE.Group();
        boneHighlightMarker.name = 'BoneHighlightMarker';
        boneHighlightMarker.visible = false;

        const bhmCoreGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const bhmCoreMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        const bhmCore = new THREE.Mesh(bhmCoreGeo, bhmCoreMat);
        bhmCore.renderOrder = 99998;
        boneHighlightMarker.add(bhmCore);

        const bhmRingGeo = new THREE.RingGeometry(0.07, 0.10, 32);
        const bhmRingMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.90,
            depthTest: false
        });
        boneHighlightRingMesh = new THREE.Mesh(bhmRingGeo, bhmRingMat);
        boneHighlightRingMesh.renderOrder = 99999;
        boneHighlightMarker.add(boneHighlightRingMesh);

        const bhmOuterGeo = new THREE.RingGeometry(0.12, 0.14, 32);
        const bhmOuterMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.50,
            depthTest: false
        });
        boneHighlightOuterMesh = new THREE.Mesh(bhmOuterGeo, bhmOuterMat);
        boneHighlightOuterMesh.renderOrder = 99999;
        boneHighlightMarker.add(boneHighlightOuterMesh);

        scene.add(boneHighlightMarker);

        // 3D TransformControls Gizmo untuk menggeser Offset Hitbox secara langsung
        gizmoAnchor = new THREE.Object3D();
        scene.add(gizmoAnchor);

        transformControl = new THREE.TransformControls(camera, renderer.domElement);
        transformControl.setSize(0.75);
        transformControl.setMode('translate');
        transformControl.attach(gizmoAnchor);
        scene.add(transformControl);

        transformControl.addEventListener('dragging-changed', (event) => {
            orbitControls.enabled = !event.value;
            isDraggingGizmo = event.value;
            if (event.value) {
                hideBoneLocationIndicator();
            }
            if (!event.value && currentStudioMode === 'attachment') {
                // Pastikan input-input terisi nilai posisi/rotasi/skala terbaru setelah drag gizmo selesai
                syncAttachmentInspectorFromSelected(true);
            }
        });

        transformControl.addEventListener('change', () => {
            if (!isDraggingGizmo) return;

            // KASUS 1: MODE ATTACHMENT (Menggeser, Memutar, atau Scaling Objek 3D)
            if (currentStudioMode === 'attachment') {
                if (!selectedAttachmentId) return;
                const wrapper = attachmentVisualMap.get(selectedAttachmentId);
                const attList = (window.PandoraAttachmentSystem && window.PandoraAttachmentSystem.getCharacterAttachments)
                    ? window.PandoraAttachmentSystem.getCharacterAttachments(activeCharKey)
                    : null;
                const att = attList ? attList.find(a => a.id === selectedAttachmentId) : null;
                if (!wrapper || !att) return;

                // Sinkronkan data objek dari transform visual Three.js
                att.position = [
                    Number(wrapper.position.x.toFixed(3)),
                    Number(wrapper.position.y.toFixed(3)),
                    Number(wrapper.position.z.toFixed(3))
                ];
                att.rotation = [
                    Number(THREE.MathUtils.radToDeg(wrapper.rotation.x).toFixed(1)),
                    Number(THREE.MathUtils.radToDeg(wrapper.rotation.y).toFixed(1)),
                    Number(THREE.MathUtils.radToDeg(wrapper.rotation.z).toFixed(1))
                ];
                att.scale = [
                    Number(wrapper.scale.x.toFixed(3)),
                    Number(wrapper.scale.y.toFixed(3)),
                    Number(wrapper.scale.z.toFixed(3))
                ];

                // PENTING: Update input inspector secara real-time agar input box tidak usang (mencegah reset ke 0,0,0)
                syncAttachmentInspectorFromSelected(true);
                return;
            }

            // KASUS 2: MODE HITBOX (Menggeser Offset Hitbox Bola Serangan)
            if (!selectedHitboxId) return;
            const hb = getSelectedHitboxObj();
            const attacker = getAttackerInstance();
            if (!hb || !attacker) return;

            const bone = HS.resolveBone(attacker, hb.bone);
            if (bone) {
                bone.updateWorldMatrix(true, false);
                const bonePos = new THREE.Vector3();
                const boneQuat = new THREE.Quaternion();
                bone.getWorldPosition(bonePos);
                bone.getWorldQuaternion(boneQuat);

                const invQuat = boneQuat.clone().invert();
                const localDelta = gizmoAnchor.position.clone().sub(bonePos).applyQuaternion(invQuat);

                hb.offsetX = Number(THREE.MathUtils.clamp(localDelta.x, -0.60, 0.60).toFixed(3));
                hb.offsetY = Number(THREE.MathUtils.clamp(localDelta.y, -0.60, 0.60).toFixed(3));
                hb.offsetZ = Number(THREE.MathUtils.clamp(localDelta.z, -0.60, 0.60).toFixed(3));
                syncInspectorFromSelectedHitbox();
            }
        });

        // Klik pada 3D Viewport untuk memilih Hitbox atau Titik Sendi Tulang (Bone Dot)
        renderer.domElement.addEventListener('pointerdown', onViewportPointerDown);
        window.addEventListener('resize', onWindowResize);
    }

    function onWindowResize() {
        if (!container || !renderer || !camera) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // ===================================================================
    // 2. MEMUAT SELURUH KARAKTER DARI FOLDER hero/* SECARA DINAMIS
    // ===================================================================
    async function ensureCharacterInstanceLoaded(charMeta) {
        const cKey = charMeta.hitToolKey || (charMeta.id === 'red' ? 'hero' : charMeta.id);
        if (charInstances[cKey]) return charInstances[cKey];

        HS.ensureCharacterConfig(cKey);
        let inst = null;
        if (cKey === 'hero' || charMeta.id === 'red') {
            inst = window.createWolfCharacterModel('red');
        } else {
            inst = window.createEnemyFoxTreeModel(charMeta.id);
        }
        inst.root.visible = false;
        scene.add(inst.root);
        charInstances[cKey] = inst;

        if (cKey === 'hero') heroInstance = inst;
        if (cKey === 'enemy-foxtree') enemyInstance = inst;

        const mgr = window.PandoraHeroRegistry ? window.PandoraHeroRegistry.getAssetManager(charMeta.id) : null;
        if (mgr) {
            await mgr.load();
            if (mgr.isLoaded && !inst.modelMesh) mgr.setupInstance(inst);
        }
        if (window.GeneralTakingAssetManager && window.GeneralTakingAssetManager.isLoaded) {
            window.GeneralTakingAssetManager.setupInstance(inst);
        }
        if (window.GeneralBlockAssetManager && window.GeneralBlockAssetManager.isLoaded) {
            window.GeneralBlockAssetManager.setupInstance(inst);
        }
        if (window.GeneralDeadAssetManager && window.GeneralDeadAssetManager.isLoaded) {
            window.GeneralDeadAssetManager.setupInstance(inst);
        }
        HS.ensureBoneCache(inst);
        return inst;
    }

    function renderCharacterSwitcherUI() {
        const containerEl = document.getElementById('ht-char-switch-container');
        if (!containerEl) return;

        const chars = (window.PandoraHeroRegistry && Array.isArray(window.PandoraHeroRegistry.characters) && window.PandoraHeroRegistry.characters.length > 0)
            ? window.PandoraHeroRegistry.characters
            : [
                { id: 'red', hitToolKey: 'hero', name: 'Red Fox', icon: '' },
                { id: 'enemy-foxtree', hitToolKey: 'enemy-foxtree', name: 'FoxTree', icon: '' },
                { id: 'tharon', hitToolKey: 'tharon', name: 'Tharon', icon: '' }
            ];

        containerEl.innerHTML = '';
        chars.forEach(c => {
            const cKey = c.hitToolKey || (c.id === 'red' ? 'hero' : c.id);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ht-char-btn' + (cKey === activeCharKey ? ' active' : '');
            btn.dataset.char = cKey;
            btn.textContent = c.name || c.id;
            btn.title = 'Atur Hitbox & Animasi untuk folder ' + (c.folder || ('hero/' + c.id));
            btn.addEventListener('click', async () => {
                activeCharKey = cKey;
                await ensureCharacterInstanceLoaded(c);
                renderCharacterSwitcherUI();
                const anims = HS.getCharacterAnimations(activeCharKey);
                if (!anims.some(a => a.key === activeAnimKey)) {
                    activeAnimKey = anims.length > 0 ? anims[0].key : 'punch1';
                }
                const cfg = getCurrentAnimConfig();
                selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;

                applyCharacterPositionsAndRoles();

                if (currentStudioMode === 'attachment') {
                    applyTPoseToActiveCharacter();
                    selectedAttachmentId = null;
                    populateAttachmentTestAnimations();
                    renderAttachmentUI();
                    renderAttachmentLibraryUI();
                } else {
                    playSelectedAnimationOnAttacker(true);
                    playIdleOnDummy();
                    renderAllUI();
                }
            });
            containerEl.appendChild(btn);
        });
    }

    async function loadCharacters() {
        const statusText = document.getElementById('ht-contact-text');
        if (statusText) statusText.innerText = 'Memuat Model 3D dari folder hero/*...';

        // 1. Sync daftar karakter dari api/heroes.php
        if (window.PandoraHeroRegistry) {
            try {
                await window.PandoraHeroRegistry.sync(false);
            } catch (e) {}
        }

        // 2. Muat General Asset Managers & konfigurasi Hitbox
        const basePromises = [];
        if (window.HeroAssetManager) basePromises.push(window.HeroAssetManager.load());
        if (window.EnemyFoxTreeAssetManager) basePromises.push(window.EnemyFoxTreeAssetManager.load());
        if (window.GeneralTakingAssetManager) basePromises.push(window.GeneralTakingAssetManager.load());
        if (window.GeneralBlockAssetManager) basePromises.push(window.GeneralBlockAssetManager.load());
        if (window.GeneralDeadAssetManager) basePromises.push(window.GeneralDeadAssetManager.load());
        if (HS && typeof HS.loadFromServer === 'function') basePromises.push(HS.loadFromServer());

        try {
            await Promise.allSettled(basePromises);
        } catch (e) {}

        // 3. Buat & muat seluruh karakter yang ditemukan di hero/*
        const chars = (window.PandoraHeroRegistry && window.PandoraHeroRegistry.characters.length > 0)
            ? window.PandoraHeroRegistry.characters
            : [
                { id: 'red', hitToolKey: 'hero', name: 'Red Fox', icon: '' },
                { id: 'enemy-foxtree', hitToolKey: 'enemy-foxtree', name: 'FoxTree', icon: '' },
                { id: 'tharon', hitToolKey: 'tharon', name: 'Tharon', icon: '' }
            ];

        for (const c of chars) {
            await ensureCharacterInstanceLoaded(c);
        }

        renderCharacterSwitcherUI();

        const cfg = getCurrentAnimConfig();
        selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;

        applyCharacterPositionsAndRoles();
        playSelectedAnimationOnAttacker(true);
        playIdleOnDummy();
        renderAllUI();

        // Masuk lewat hit-tool.html#attachment: mode sudah aktif sebelum karakter selesai dimuat
        if (currentStudioMode === 'attachment') setStudioMode('attachment');
    }

    function applyCharacterPositionsAndRoles() {
        const attacker = getAttackerInstance();
        const dummy = getDummyInstance();
        if (!attacker || !dummy) return;

        // Sembunyikan seluruh karakter terlebih dahulu
        Object.keys(charInstances).forEach(k => {
            if (charInstances[k] && charInstances[k].root) {
                charInstances[k].root.visible = false;
            }
        });

        // Penyerang selalu berdiri di (0, 0, 0) menghadap +Z (ke arah Dummy)
        attacker.root.visible = true;
        attacker.root.position.set(0, 0, 0);
        attacker.root.rotation.set(0, 0, 0);

        // Dummy berdiri di depan penyerang sesuai jarak & sudut
        if (dummy !== attacker) {
            dummy.root.visible = dummyEnabled;
            const rad = THREE.MathUtils.degToRad(dummyAngleDeg);
            const dx = Math.sin(rad) * dummyDistance;
            const dz = Math.cos(rad) * dummyDistance;
            dummy.root.position.set(dx, 0, dz);
            // Dummy menghadap ke penyerang (0,0,0)
            dummy.root.rotation.set(0, Math.atan2(-dx, -dz), 0);
        }
    }

    // ===================================================================
    // 3. MANAJEMEN ANIMASI PADA KARAKTER PENYERANG & DUMMY
    // ===================================================================
    function playSelectedAnimationOnAttacker(resetTime = true) {
        const attacker = getAttackerInstance();
        if (!attacker || !attacker.actions) return;

        const targetAction = attacker.actions[activeAnimKey];

        // 1. Nol-kan semua action terlebih dahulu (hati-hati terhadap alias seperti punch === punch1, kick === kick1)
        Object.keys(attacker.actions).forEach(k => {
            const act = attacker.actions[k];
            if (!act || act === targetAction) return;
            act.setEffectiveWeight(0.0);
        });

        // 2. Aktifkan action yang dipilih dengan bobot penuh 1.0 agar pose berdiri utuh (tidak pernah kolaps ke T-pose/tenggelam)
        if (targetAction) {
            targetAction.enabled = true;
            targetAction.setEffectiveWeight(1.0);
            targetAction.setLoop(THREE.LoopRepeat, Infinity);
            targetAction.clampWhenFinished = false;
            const animCfg = getCurrentAnimConfig();
            const animSpeed = (animCfg && typeof animCfg.speed === 'number' && animCfg.speed > 0) ? animCfg.speed : 1.0;
            targetAction.timeScale = animSpeed;
            if (resetTime) {
                targetAction.reset();
            }
            targetAction.play();
            const clip = targetAction.getClip ? targetAction.getClip() : null;
            currentClipDuration = (clip && clip.duration > 0.01) ? clip.duration : 1.0;
            if (resetTime) currentClipTime = 0.0;

            if (attacker.mixer) {
                attacker.mixer.update(0.001);
                attacker.root.updateMatrixWorld(true);
            }
        }

        dummyHitTriggeredInCycle = false;
        if (HS && typeof HS.resetAttackStrikeTracker === 'function') {
            HS.resetAttackStrikeTracker(attacker);
        }
    }

    function playIdleOnDummy() {
        const dummy = getDummyInstance();
        if (!dummy || !dummy.actions) return;
        Object.keys(dummy.actions).forEach(k => {
            const act = dummy.actions[k];
            if (!act) return;
            if (k === 'idle') {
                act.enabled = true;
                act.setEffectiveWeight(1.0);
                act.setLoop(THREE.LoopRepeat, Infinity);
                act.timeScale = 1.0;
                act.play();
            } else {
                act.setEffectiveWeight(0.0);
            }
        });
        dummyReactionTimer = 0.0;
    }

    function triggerDummyHitReaction() {
        if (!dummyAutoReact || !dummyEnabled) return;
        const dummy = getDummyInstance();
        if (!dummy || !dummy.actions) return;

        const hitKey = (dummy.actions.hit1 && dummy.actions.hit2)
            ? (Math.random() > 0.5 ? 'hit1' : 'hit2')
            : (dummy.actions.hit1 ? 'hit1' : null);

        if (!hitKey || !dummy.actions[hitKey]) return;

        Object.keys(dummy.actions).forEach(k => {
            if (dummy.actions[k]) {
                dummy.actions[k].setEffectiveWeight(k === hitKey ? 1.0 : 0.0);
            }
        });

        const act = dummy.actions[hitKey];
        act.reset();
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
        act.timeScale = 1.35;
        act.setEffectiveWeight(1.0);
        act.play();

        const clip = act.getClip ? act.getClip() : null;
        dummyReactionTimer = clip ? (clip.duration / 1.35) : 0.48;
    }

    // ===================================================================
    // 4. MANAJEMEN DATA HITBOX & UI SINKRONISASI
    // ===================================================================
    function getCurrentAnimConfig() {
        return HS.getAnimationConfig(activeCharKey, activeAnimKey);
    }

    function getSelectedHitboxObj() {
        const cfg = getCurrentAnimConfig();
        if (!cfg || !Array.isArray(cfg.hitboxes)) return null;
        if (!selectedHitboxId && cfg.hitboxes.length > 0) {
            selectedHitboxId = cfg.hitboxes[0].id;
        }
        return cfg.hitboxes.find(h => h.id === selectedHitboxId) || null;
    }

    function addOrSelectHitboxForBone(boneKey, forceCreateNew = false) {
        const cfg = getCurrentAnimConfig();
        if (!cfg) return;
        if (!Array.isArray(cfg.hitboxes)) cfg.hitboxes = [];

        const boneEntry = HS.BONE_CATALOG.find(b => b.key === boneKey);
        const cleanLabel = boneEntry ? boneEntry.label.replace(/^[^\s]+\s/, '').split('(')[0].trim() : boneKey;
        const isFoot = boneKey.toLowerCase().includes('foot') || boneKey.toLowerCase().includes('toe') || boneKey.toLowerCase().includes('leg');

        // 1. Jika sudah ada hitbox di tulang ini, langsung pilih hitbox tersebut
        const existingOnBone = cfg.hitboxes.find(h => h.bone === boneKey);
        if (existingOnBone && !forceCreateNew) {
            selectedHitboxId = existingOnBone.id;
            existingOnBone.enabled = true;
            renderAllUI();
            showToast(`Area Hitbox aktif di: ${cleanLabel}`);
            return;
        }

        // 2. Jika user klik bagian tubuh (atau titik biru di 3D) dan tidak menekan '+ Tambah',
        // pindahkan Hitbox yang sedang terpilih ke bagian tubuh (bone) yang diklik!
        const currentSelected = getSelectedHitboxObj();
        if (currentSelected && !forceCreateNew) {
            currentSelected.bone = boneKey;
            currentSelected.name = `Hitbox ${cleanLabel}`;
            currentSelected.enabled = true;
            renderAllUI();
            showToast(`Hitbox dipindahkan ke: ${cleanLabel} (${boneKey})`);
            return;
        }

        // 3. Buat Hitbox baru jika belum ada atau jika menekan tombol '+ Tambah'
        const newHb = {
            id: `hb_${activeCharKey}_${activeAnimKey}_${boneKey}_${Date.now().toString(36)}`,
            name: `Hitbox ${cleanLabel}`,
            bone: boneKey,
            shape: 'sphere',
            radius: isFoot ? 0.30 : 0.26,
            offsetX: 0.0,
            offsetY: isFoot ? 0.04 : 0.05,
            offsetZ: 0.04,
            enabled: true
        };

        cfg.hitboxes.push(newHb);
        selectedHitboxId = newHb.id;
        renderAllUI();
        showToast(`Hitbox baru ditambahkan di: ${cleanLabel}`);
    }

    function deleteSelectedHitbox() {
        const cfg = getCurrentAnimConfig();
        if (!cfg || !Array.isArray(cfg.hitboxes) || !selectedHitboxId) return;
        const idx = cfg.hitboxes.findIndex(h => h.id === selectedHitboxId);
        if (idx !== -1) {
            const removed = cfg.hitboxes.splice(idx, 1)[0];
            // Hapus mesh visualnya
            if (hitboxMeshesMap.has(removed.id)) {
                const m = hitboxMeshesMap.get(removed.id);
                hitboxVisualGroup.remove(m.solidMesh);
                hitboxVisualGroup.remove(m.wireMesh);
                hitboxMeshesMap.delete(removed.id);
            }
            selectedHitboxId = cfg.hitboxes.length > 0 ? cfg.hitboxes[0].id : null;
            renderAllUI();
            showToast(`Hitbox dihapus`, '#ef4444');
        }
    }

    function onViewportPointerDown(e) {
        // Hilangkan indikator titik tulang saat user berinteraksi dengan canvas / viewport
        hideBoneLocationIndicator();

        if (e.button !== 0 || isDraggingGizmo) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNDC, camera);

        // KASUS KHUSUS: MODE 3D ATTACHMENT MANAGER (Pilih Objek 3D di Layar atau Klik Titik Sendi)
        if (currentStudioMode === 'attachment') {
            const visualWrappers = Array.from(attachmentVisualMap.values());
            if (visualWrappers.length > 0) {
                const hits = raycaster.intersectObjects(visualWrappers, true);
                if (hits.length > 0) {
                    let cur = hits[0].object;
                    while (cur && cur.parent && !cur.userData.attachmentId) {
                        cur = cur.parent;
                    }
                    if (cur && cur.userData.attachmentId) {
                        selectAttachment(cur.userData.attachmentId);
                        return;
                    }
                }
            }

            // Cek jika user mengklik titik sendi tulang (Bone Dots) langsung di tubuh karakter 3D
            if (boneDotsGroup && boneDotsGroup.visible) {
                const dotObjects = boneDotMeshes.map(d => d.mesh);
                const dotHits = raycaster.intersectObjects(dotObjects, false);
                if (dotHits.length > 0) {
                    const bKey = dotHits[0].object.userData.boneKey;
                    if (bKey) {
                        const selectBone = document.getElementById('select-att-bone');
                        if (selectBone) {
                            selectBone.value = bKey;
                            selectBone.dispatchEvent(new Event('change'));
                        }
                        hideBoneLocationIndicator();
                        return;
                    }
                }
            }
            return;
        }

        // 1. Cek klik pada bola Hitbox yang sudah ada
        const hbMeshes = [];
        hitboxMeshesMap.forEach((val, id) => {
            if (val.solidMesh.visible) {
                val.solidMesh.userData.hitboxId = id;
                hbMeshes.push(val.solidMesh);
            }
        });
        const hbHits = raycaster.intersectObjects(hbMeshes, false);
        if (hbHits.length > 0) {
            const hitId = hbHits[0].object.userData.hitboxId;
            if (hitId) {
                selectedHitboxId = hitId;
                renderAllUI();
                return;
            }
        }

        // 2. Cek klik pada Titik Sendi Tulang (Bone Dots) untuk pasang/pilih hitbox langsung di 3D!
        if (boneDotsGroup.visible) {
            const dotObjects = boneDotMeshes.map(d => d.mesh);
            const dotHits = raycaster.intersectObjects(dotObjects, false);
            if (dotHits.length > 0) {
                const bKey = dotHits[0].object.userData.boneKey;
                if (bKey) {
                    addOrSelectHitboxForBone(bKey);
                }
            }
        }
    }

    // ===================================================================
    // 5. RENDER PANEL UI & INSPECTOR
    // ===================================================================
    function renderAnimationListUI() {
        const listEl = document.getElementById('ht-anim-list');
        const countLbl = document.getElementById('lbl-anim-count');
        const charBadge = document.getElementById('badge-active-char');
        if (!listEl) return;

        if (charBadge) {
            const meta = window.PandoraHeroRegistry ? window.PandoraHeroRegistry.getCharacterMeta(activeCharKey) : null;
            charBadge.innerText = meta ? meta.name : activeCharKey;
        }

        const anims = HS.getCharacterAnimations(activeCharKey) || [];
        if (countLbl) countLbl.innerText = `${anims.length} Animasi`;

        listEl.innerHTML = '';
        anims.forEach(item => {
            const animCfg = HS.getAnimationConfig(activeCharKey, item.key);
            const hbCount = (animCfg && Array.isArray(animCfg.hitboxes))
                ? animCfg.hitboxes.filter(h => h.enabled !== false).length
                : 0;
            const animSpeed = (animCfg && typeof animCfg.speed === 'number' && animCfg.speed > 0) ? animCfg.speed : 1.0;
            const speedBadge = (animSpeed !== 1.0)
                ? `<span style="font-size:9.5px; font-weight:700; color:#fbbf24; background:rgba(245,158,11,0.2); padding:1px 4px; border-radius:3px; margin-left:auto; margin-right:4px;">${animSpeed.toFixed(animSpeed % 1 === 0 ? 1 : 2)}x</span>`
                : '';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ht-anim-pill' + (item.key === activeAnimKey ? ' active' : '');
            btn.innerHTML = `
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.label.split('(')[0].trim()}</span>
                ${speedBadge}
                <span class="hb-count-badge" style="${hbCount === 0 ? 'opacity:0.4; color:#9ca3af;' : ''}">${hbCount} HB</span>
            `;
            btn.title = item.label;
            btn.addEventListener('click', () => {
                activeAnimKey = item.key;
                const cfg = getCurrentAnimConfig();
                selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;
                playSelectedAnimationOnAttacker(true);
                renderAllUI();
            });
            listEl.appendChild(btn);
        });
    }

    function renderBonePickerUI() {
        const containerEl = document.getElementById('ht-bone-picker-container');
        if (!containerEl) return;

        const cfg = getCurrentAnimConfig();
        const activeBonesSet = new Set(
            (cfg && Array.isArray(cfg.hitboxes)) ? cfg.hitboxes.filter(h => h.enabled !== false).map(h => h.bone) : []
        );

        const categories = ['Tangan & Lengan', 'Kaki & Tungkai', 'Kepala & Badan'];
        containerEl.innerHTML = '';

        categories.forEach(cat => {
            const title = document.createElement('div');
            title.className = 'ht-bone-category-title';
            title.innerText = cat;
            containerEl.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'ht-bone-chips';

            HS.BONE_CATALOG.filter(b => b.category === cat).forEach(b => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const hasHb = activeBonesSet.has(b.key);
                btn.className = 'ht-bone-chip' + (hasHb ? ' has-hitbox' : '');
                btn.innerText = window.blStripEmoji(b.label.split('(')[0]);
                btn.title = `${b.label} — Klik untuk pasang/pilih Hitbox di bagian ini`;
                btn.addEventListener('click', () => addOrSelectHitboxForBone(b.key));
                grid.appendChild(btn);
            });

            containerEl.appendChild(grid);
        });
    }

    function renderActiveHitboxListUI() {
        const listEl = document.getElementById('ht-active-hitbox-list');
        if (!listEl) return;

        const cfg = getCurrentAnimConfig();
        const hitboxes = (cfg && Array.isArray(cfg.hitboxes)) ? cfg.hitboxes : [];

        listEl.innerHTML = '';
        if (hitboxes.length === 0) {
            listEl.innerHTML = `<div style="padding:10px; text-align:center; color:#9ca3af; font-size:11px; border:1px dashed #383844; border-radius:5px;">
                Belum ada hitbox pada animasi <b>${activeAnimKey}</b>.<br>Klik salah satu bagian tubuh di atas (misal Tangan Kanan / Kaki Kanan) untuk menambahkan!
            </div>`;
            return;
        }

        hitboxes.forEach((hb) => {
            const row = document.createElement('div');
            row.className = 'ht-hitbox-item' + (hb.id === selectedHitboxId ? ' selected' : '');
            row.dataset.hbId = hb.id;

            row.innerHTML = `
                <div class="ht-hitbox-meta">
                    <span class="ht-hitbox-title">${hb.name || hb.bone}</span>
                    <span class="ht-hitbox-sub">Bone: ${hb.bone} • R: ${Number(hb.radius).toFixed(2)}m</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" ${hb.enabled !== false ? 'checked' : ''} title="Aktif/Nonaktif" style="accent-color:#ef4444; cursor:pointer;">
                </div>
            `;

            const chk = row.querySelector('input[type="checkbox"]');
            chk.addEventListener('click', (ev) => {
                ev.stopPropagation();
                hb.enabled = chk.checked;
                renderAllUI();
            });

            row.addEventListener('click', () => {
                selectedHitboxId = hb.id;
                renderAllUI();
            });

            listEl.appendChild(row);
        });
    }

    function syncInspectorFromSelectedHitbox() {
        const hb = getSelectedHitboxObj();
        const inspectorSec = document.getElementById('section-hitbox-inspector');
        const badgeBone = document.getElementById('badge-selected-bone');

        const animCfg = getCurrentAnimConfig();
        if (animCfg) {
            // Sync Kecepatan Animasi (Speed)
            const curSpeed = (typeof animCfg.speed === 'number' && animCfg.speed > 0) ? animCfg.speed : 1.0;
            const speedSlider = document.getElementById('slider-anim-speed');
            const speedNum = document.getElementById('num-anim-speed');
            const speedVal = document.getElementById('val-anim-speed');
            if (speedSlider) speedSlider.value = curSpeed.toFixed(2);
            if (speedNum && document.activeElement !== speedNum) speedNum.value = curSpeed.toFixed(2);
            if (speedVal) speedVal.innerText = `${curSpeed.toFixed(2)}x`;

            // Highlight tombol preset speed
            const quickSpeedBtns = document.querySelectorAll('.btn-quick-speed');
            quickSpeedBtns.forEach(b => {
                const bVal = parseFloat(b.dataset.speed);
                b.classList.toggle('active', Math.abs(bVal - curSpeed) < 0.03);
            });

            const dmgInput = document.getElementById('input-anim-damage');
            const kbInput = document.getElementById('input-anim-knockback');
            const startSlider = document.getElementById('slider-active-start');
            const endSlider = document.getElementById('slider-active-end');
            const startVal = document.getElementById('val-active-start');
            const endVal = document.getElementById('val-active-end');
            const winBar = document.getElementById('ht-active-window-bar');

            const sPct = Math.round((typeof animCfg.activeStartPct === 'number' ? animCfg.activeStartPct : 0.10) * 100);
            const ePct = Math.round((typeof animCfg.activeEndPct === 'number' ? animCfg.activeEndPct : 0.88) * 100);

            if (dmgInput) dmgInput.value = animCfg.damage || 25;
            if (kbInput) kbInput.value = animCfg.knockback || 0.22;
            if (startSlider) startSlider.value = sPct;
            if (endSlider) endSlider.value = ePct;
            if (startVal) startVal.innerText = `${sPct}%`;
            if (endVal) endVal.innerText = `${ePct}%`;
            if (winBar) {
                winBar.style.left = `${sPct}%`;
                winBar.style.width = `${Math.max(1, ePct - sPct)}%`;
            }
        }

        // Sync Hurtbox Target
        const hurtCfg = HS.getHurtboxConfig(getDummyCharKey());
        if (hurtCfg) {
            const rSlider = document.getElementById('slider-hurt-radius');
            const hSlider = document.getElementById('slider-hurt-height');
            const rVal = document.getElementById('val-hurt-radius');
            const hVal = document.getElementById('val-hurt-height');
            const chkBones = document.getElementById('chk-hurt-bones');

            if (rSlider) rSlider.value = hurtCfg.radius;
            if (hSlider) hSlider.value = hurtCfg.height;
            if (rVal) rVal.innerText = `${Number(hurtCfg.radius).toFixed(2)} m`;
            if (hVal) hVal.innerText = `${Number(hurtCfg.height).toFixed(2)} m`;
            if (chkBones) chkBones.checked = hurtCfg.useBoneCapsules !== false;
        }

        if (!hb) {
            if (inspectorSec) inspectorSec.style.opacity = '0.45';
            if (badgeBone) badgeBone.innerText = 'TIDAK ADA';
            return;
        }

        if (inspectorSec) inspectorSec.style.opacity = '1.0';
        if (badgeBone) badgeBone.innerText = hb.bone;

        const chkEnabled = document.getElementById('chk-hb-enabled');
        const inputName = document.getElementById('input-hb-name');
        const selectBone = document.getElementById('select-hb-bone');
        const sliderRadius = document.getElementById('slider-hb-radius');
        const valRadius = document.getElementById('val-hb-radius');
        const sliderOffX = document.getElementById('slider-hb-off-x');
        const valOffX = document.getElementById('val-hb-off-x');
        const sliderOffY = document.getElementById('slider-hb-off-y');
        const valOffY = document.getElementById('val-hb-off-y');
        const sliderOffZ = document.getElementById('slider-hb-off-z');
        const valOffZ = document.getElementById('val-hb-off-z');

        if (chkEnabled) chkEnabled.checked = hb.enabled !== false;
        if (inputName && document.activeElement !== inputName) inputName.value = hb.name || '';
        if (selectBone) selectBone.value = hb.bone;
        if (sliderRadius) sliderRadius.value = hb.radius;
        if (valRadius) valRadius.innerText = `${Number(hb.radius).toFixed(2)} m`;

        if (sliderOffX) sliderOffX.value = hb.offsetX || 0;
        if (valOffX) valOffX.innerText = `${Number(hb.offsetX || 0).toFixed(2)} m`;
        if (sliderOffY) sliderOffY.value = hb.offsetY || 0;
        if (valOffY) valOffY.innerText = `${Number(hb.offsetY || 0).toFixed(2)} m`;
        if (sliderOffZ) sliderOffZ.value = hb.offsetZ || 0;
        if (valOffZ) valOffZ.innerText = `${Number(hb.offsetZ || 0).toFixed(2)} m`;
    }

    function renderAllUI() {
        renderAnimationListUI();
        renderBonePickerUI();
        renderActiveHitboxListUI();
        syncInspectorFromSelectedHitbox();
    }

    // ===================================================================
    // 5B. SISTEM 3D ATTACHMENT & T-POSE SOCKET MANAGER
    // ===================================================================
    function setStudioMode(mode) {
        currentStudioMode = mode;
        const btnHitbox = document.getElementById('tab-mode-hitbox');
        const btnAttachment = document.getElementById('tab-mode-attachment');
        const panelLeftHitbox = document.getElementById('panel-left-hitbox');
        const panelLeftAttachment = document.getElementById('panel-left-attachment');
        const panelRightHitbox = document.getElementById('panel-right-hitbox');
        const panelRightAttachment = document.getElementById('panel-right-attachment');
        const dockCombat = document.getElementById('dock-combat-timeline');
        const dockAttachment = document.getElementById('dock-attachment-banner');
        const titleLeft = document.getElementById('lbl-left-panel-title');
        const titleRight = document.getElementById('lbl-right-panel-title');

        if (mode === 'attachment') {
            if (btnHitbox) btnHitbox.classList.remove('active');
            if (btnAttachment) btnAttachment.classList.add('active');
            if (panelLeftHitbox) panelLeftHitbox.style.display = 'none';
            if (panelLeftAttachment) panelLeftAttachment.style.display = 'block';
            if (panelRightHitbox) panelRightHitbox.style.display = 'none';
            if (panelRightAttachment) panelRightAttachment.style.display = 'block';
            if (dockCombat) dockCombat.style.display = 'none';
            if (dockAttachment) dockAttachment.style.display = 'flex';
            if (titleLeft) titleLeft.innerText = 'Objek 3D & Attachment';
            if (titleRight) titleRight.innerText = 'Inspector';

            hideCombatVisualsForAttachment();
            const legend = document.querySelector('.ht-viewport-legend');
            if (legend) legend.style.display = 'none';
            setBoneDotsVisible(isBoneDotsVisible);

            // Sembunyikan cincin kuning impact dan banner hit combat atas
            if (impactRingMesh) {
                impactRingMesh.visible = false;
                impactRingMesh.material.opacity = 0;
            }
            impactRingAlpha = 0;
            dummyHitTriggeredInCycle = false;

            const topHud = document.querySelector('.ht-viewport-hud-top');
            if (topHud) topHud.style.display = 'none';

            // Kunci karakter ke pose T-Pose murni
            applyTPoseToActiveCharacter();
            setGizmoMode(gizmoMode || 'translate');
            populateAttachmentTestAnimations();
            renderAttachmentUI();
            renderAttachmentLibraryUI();
            showToast('Mode 3D Attachment Aktif: Pasang & Atur Objek dengan Sumbu XYZ', '#0284c7');
        } else {
            if (btnHitbox) btnHitbox.classList.add('active');
            if (btnAttachment) btnAttachment.classList.remove('active');
            if (panelLeftHitbox) panelLeftHitbox.style.display = 'block';
            if (panelLeftAttachment) panelLeftAttachment.style.display = 'none';
            if (panelRightHitbox) panelRightHitbox.style.display = 'block';
            if (panelRightAttachment) panelRightAttachment.style.display = 'none';
            if (dockCombat) dockCombat.style.display = 'block';
            if (dockAttachment) dockAttachment.style.display = 'none';
            if (titleLeft) titleLeft.innerText = 'Animasi & Area Tubuh';
            if (titleRight) titleRight.innerText = 'Inspector';

            const topHud = document.querySelector('.ht-viewport-hud-top');
            if (topHud) topHud.style.display = 'flex';

            const chkDummy = document.getElementById('chk-enable-dummy');
            const dummy = getDummyInstance();
            if (dummy && dummy.root) dummy.root.visible = (!chkDummy || chkDummy.checked);
            if (hurtboxVisualGroup) hurtboxVisualGroup.visible = dummyEnabled;
            if (hurtboxCylinderMesh) hurtboxCylinderMesh.visible = true;
            attackRangeRings.forEach(ring => { ring.visible = true; });
            const legend = document.querySelector('.ht-viewport-legend');
            if (legend) legend.style.display = '';
            setBoneDotsVisible(isBoneDotsVisible);

            // Lepaskan gizmo dari attachment jika masih menempel
            if (transformControl && transformControl.object && transformControl.object !== gizmoAnchor) {
                transformControl.detach();
                transformControl.attach(gizmoAnchor);
            }

            // Kembalikan animasi combat normal & posisikan kembali ke tanah (y = 0)
            restoreCombatAnimation();

            // Pasang kembali attachment gameplay normal di karakter jika ada
            const attacker = getAttackerInstance();
            if (attacker && window.PandoraAttachmentSystem && typeof window.PandoraAttachmentSystem.applyAttachmentsToCharacter === 'function') {
                window.PandoraAttachmentSystem.applyAttachmentsToCharacter(attacker, activeCharKey);
            }

            renderAllUI();
        }
    }

    function applyTPoseToActiveCharacter() {
        const attacker = getAttackerInstance();
        if (!attacker) return;
        if (attacker.mixer) {
            attacker.mixer.stopAllAction();
        }
        const model = attacker.modelMesh || attacker.meshContainer || attacker.root;
        if (model) {
            model.traverse(child => {
                if (child.isSkinnedMesh && child.skeleton) {
                    child.skeleton.pose();
                }
            });
        }
        if (attacker.root) {
            // Anti-tenggelam saat T-Pose:
            // Pada bind-pose Mixamo, hips berada di origin (0,0,0) dan kaki di y = -0.490m.
            // Dengan skala Red Fox (1.85), kaki berada di y = -0.906m di bawah grid.
            // Naikkan root ke y = 0.906 agar telapak kaki pas menapak di lantai grid (y = 0).
            attacker.root.position.set(0, 0.906, 0);
            attacker.root.updateMatrixWorld(true);
        }
        isPreviewAnimInAttachment = false;
        const selAnim = document.getElementById('sel-attachment-test-anim');
        if (selAnim) selAnim.value = '';
    }

    function restoreCombatAnimation() {
        const attacker = getAttackerInstance();
        if (attacker && attacker.root) {
            // Kembalikan ke posisi normal di atas tanah saat animasi berjalan
            attacker.root.position.set(0, 0, 0);
            attacker.root.updateMatrixWorld(true);
        }
        playSelectedAnimationOnAttacker(true);
        if (dummyEnabled) playIdleOnDummy();
    }

    function setGizmoMode(mode) {
        gizmoMode = mode;
        if (transformControl) {
            transformControl.setMode(mode);
            transformControl.setSpace('local');
        }
        const bTrans = document.getElementById('btn-gizmo-translate');
        const bRot = document.getElementById('btn-gizmo-rotate');
        const bScale = document.getElementById('btn-gizmo-scale');
        if (bTrans) bTrans.classList.toggle('active', mode === 'translate');
        if (bRot) bRot.classList.toggle('active', mode === 'rotate');
        if (bScale) bScale.classList.toggle('active', mode === 'scale');
    }

    function showBoneLocationIndicator(boneKey) {
        if (!boneKey || !boneHighlightMarker) return;
        const attacker = getAttackerInstance();
        if (!attacker) return;
        const AS = window.PandoraAttachmentSystem;
        const bone = AS ? AS.resolveBone(attacker, boneKey) : null;
        if (!bone) return;

        activeHighlightedBoneNode = bone;
        bone.updateWorldMatrix(true, false);
        bone.getWorldPosition(boneHighlightMarker.position);
        boneHighlightMarker.visible = true;

        const lblHint = document.getElementById('lbl-bone-hint');
        if (lblHint) {
            lblHint.innerText = `Lokasi: ${boneKey}`;
            lblHint.style.color = '#38bdf8';
        }

        if (boneHighlightTimeout) clearTimeout(boneHighlightTimeout);
        boneHighlightTimeout = setTimeout(() => {
            if (lblHint) {
                lblHint.innerText = 'Arahkan kursor untuk lihat titik';
                lblHint.style.color = '#9ca3af';
            }
        }, 4500);
    }

    function hideBoneLocationIndicator() {
        if (boneHighlightMarker) {
            boneHighlightMarker.visible = false;
        }
        activeHighlightedBoneNode = null;
        if (boneHighlightTimeout) {
            clearTimeout(boneHighlightTimeout);
            boneHighlightTimeout = null;
        }
        const lblHint = document.getElementById('lbl-bone-hint');
        if (lblHint) {
            lblHint.innerText = 'Arahkan kursor untuk lihat titik';
            lblHint.style.color = '#9ca3af';
        }
    }

    function setBoneDotsVisible(visible) {
        isBoneDotsVisible = !!visible;
        if (boneDotsGroup) {
            boneDotsGroup.visible = isBoneDotsVisible;
        }
        const chkBones = document.getElementById('chk-show-bones');
        if (chkBones) chkBones.checked = isBoneDotsVisible;

        const lblBtn = document.getElementById('lbl-toggle-att-bones');
        if (lblBtn) {
            lblBtn.innerText = isBoneDotsVisible ? 'Sembunyikan Bone' : 'Tampilkan Bone';
        }
        const btn = document.getElementById('btn-toggle-att-bones');
        if (btn) {
            btn.classList.toggle('active', !isBoneDotsVisible);
            btn.classList.toggle('active', !isBoneDotsVisible);
            btn.style.borderColor = isBoneDotsVisible ? '#3f3f46' : '#38bdf8';
        }
    }

    // Mode attachment fokus pada karakter aktif: dummy, hitbox & hurtbox selalu disembunyikan.
    // Dipanggil tiap frame karena ganti/muat karakter dapat memunculkannya kembali.
    function hideCombatVisualsForAttachment() {
        const dummy = getDummyInstance();
        if (dummy && dummy.root && dummy !== getAttackerInstance()) dummy.root.visible = false;
        hitboxMeshesMap.forEach(v => { v.solidMesh.visible = false; v.wireMesh.visible = false; });
        if (hurtboxVisualGroup) hurtboxVisualGroup.visible = false;
        if (impactRingMesh) impactRingMesh.visible = false;
        attackRangeRings.forEach(ring => { ring.visible = false; });
    }

    function populateAttachmentTestAnimations() {
        const sel = document.getElementById('sel-attachment-test-anim');
        if (!sel) return;

        const anims = HS.getCharacterAnimations(activeCharKey) || [];
        sel.innerHTML = '<option value="">-- Pilih Animasi untuk Tes Gerak --</option>';

        anims.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.key;
            opt.innerText = a.label || a.key;
            sel.appendChild(opt);
        });
    }

    function playAttachmentTestAnimation(animKey) {
        if (!animKey) {
            applyTPoseToActiveCharacter();
            return;
        }
        const attacker = getAttackerInstance();
        if (!attacker) return;

        // Reset posisi root ke tanah (y = 0) saat animasi jalan
        if (attacker.root) {
            attacker.root.position.set(0, 0, 0);
            attacker.root.updateMatrixWorld(true);
        }
        isPreviewAnimInAttachment = true;

        if (attacker.mixer && attacker.actions) {
            // Hentikan action lain
            Object.keys(attacker.actions).forEach(k => {
                const act = attacker.actions[k];
                if (act && k !== animKey) act.setEffectiveWeight(0.0);
            });

            const targetAction = attacker.actions[animKey];
            if (targetAction) {
                targetAction.enabled = true;
                targetAction.setEffectiveWeight(1.0);
                targetAction.setLoop(THREE.LoopRepeat, Infinity);
                targetAction.reset();
                targetAction.play();
                showToast(`Menguji animasi: ${animKey}`, '#38bdf8');
            } else {
                // Fallback jika clip spesifik tidak ada (misal run/walk)
                const fallback = attacker.actions['walk'] || attacker.actions['run'] || attacker.actions['punch1'] || attacker.actions['idle'];
                if (fallback) {
                    fallback.enabled = true;
                    fallback.setEffectiveWeight(1.0);
                    fallback.setLoop(THREE.LoopRepeat, Infinity);
                    fallback.reset();
                    fallback.play();
                    showToast(`Menguji animasi: ${fallback.getClip ? fallback.getClip().name : animKey}`, '#38bdf8');
                }
            }
        }
    }

    // ===== PREVIEW LIBRARY =====
    // Satu renderer offscreen, satu model per giliran. Hasil JPEG disimpan di localStorage
    // (dikunci ukuran berkas), jadi model berat hanya perlu dimuat sekali.
    const libThumbMemory = new Map();
    let libThumbQueue = Promise.resolve();
    let libThumbPending = 0;
    let libThumbRenderer = null;

    function renderLibraryThumb(model) {
        if (!libThumbRenderer) {
            libThumbRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
            libThumbRenderer.setSize(112, 112);
            libThumbRenderer.outputEncoding = THREE.sRGBEncoding;
        }
        const thumbScene = new THREE.Scene();
        thumbScene.background = new THREE.Color(0x2b2b2b);
        thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(2, 3, 2.5);
        thumbScene.add(key);
        thumbScene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.001);
        const cam = new THREE.PerspectiveCamera(30, 1, radius * 0.05, radius * 20);
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(15));
        cam.position.copy(center).add(new THREE.Vector3(0.6, 0.45, 0.8).normalize().multiplyScalar(distance));
        cam.lookAt(center);

        libThumbRenderer.render(thumbScene, cam);
        return libThumbRenderer.domElement.toDataURL('image/jpeg', 0.82);
    }

    function getLibraryThumb(file) {
        const url = file.fileUrl;
        if (libThumbMemory.has(url)) return libThumbMemory.get(url);

        const storeKey = 'pandora.libThumb.' + url;
        const version = String(file.size || '');
        try {
            const stored = JSON.parse(localStorage.getItem(storeKey) || 'null');
            if (stored && stored.version === version && stored.data) {
                const ready = Promise.resolve(stored.data);
                libThumbMemory.set(url, ready);
                return ready;
            }
        } catch (err) { /* cache opsional */ }

        libThumbPending++;
        const job = libThumbQueue.then(async () => {
            const model = await window.PandoraAttachmentSystem.load3DModelFromUrl(url, file.fileType);
            const data = renderLibraryThumb(model);
            try {
                localStorage.setItem(storeKey, JSON.stringify({ version, data }));
            } catch (err) { /* cache opsional */ }
            return data;
        }).finally(() => {
            libThumbPending--;
            // Lepas context WebGL kedua setelah antrean habis (browser membatasi jumlahnya)
            if (libThumbPending === 0 && libThumbRenderer) {
                libThumbRenderer.dispose();
                libThumbRenderer.forceContextLoss();
                libThumbRenderer = null;
            }
        });
        libThumbQueue = job.catch(() => {});
        libThumbMemory.set(url, job);
        return job;
    }

    async function renderAttachmentLibraryUI() {
        const libContainer = document.getElementById('ht-attachment-library-list');
        if (!libContainer) return;

        libContainer.innerHTML = '<div style="font-size:10px; color:#9ca3af; padding:8px 0;">Memindai berkas di server...</div>';

        if (!window.PandoraAttachmentSystem || typeof window.PandoraAttachmentSystem.fetchUploadedFiles !== 'function') {
            libContainer.innerHTML = '<div style="font-size:10px; color:#ef4444; padding:6px 0;">Sistem attachment belum siap.</div>';
            return;
        }

        try {
            const files = await window.PandoraAttachmentSystem.fetchUploadedFiles();
            if (!files || files.length === 0) {
                libContainer.innerHTML = '<div style="font-size:10.5px; color:#71717a; padding:10px 4px; text-align:center; font-style:italic; background:#18181f; border-radius:4px; border:1px dashed #2e2e38;">Belum ada model 3D terunggah.<br>Upload file .glb/.gltf di atas.</div>';
                return;
            }

            libContainer.innerHTML = '';
            files.forEach(file => {
                const card = document.createElement('div');
                card.className = 'ht-att-card ht-lib-card';

                const thumb = document.createElement('div');
                thumb.className = 'ht-lib-thumb loading';
                thumb.innerHTML = window.blIcon('cube');
                getLibraryThumb(file).then((data) => {
                    thumb.classList.remove('loading');
                    thumb.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = data;
                    img.alt = '';
                    img.draggable = false;
                    thumb.appendChild(img);
                }).catch(() => {
                    thumb.classList.remove('loading');
                    thumb.classList.add('failed');
                });
                card.appendChild(thumb);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'ht-lib-info';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'ht-att-card-title';
                nameDiv.innerText = '' + (file.name || file.fileName || 'Model 3D');
                nameDiv.title = file.fileName || file.name;

                const metaDiv = document.createElement('div');
                metaDiv.className = 'ht-att-card-sub';
                const sizeStr = file.sizeFormatted ? file.sizeFormatted : (file.size ? (Math.round(file.size / 1024) + ' KB') : '');
                metaDiv.innerText = `${file.fileType ? file.fileType.toUpperCase() : '3D'} ${sizeStr ? '• ' + sizeStr : ''}`;

                infoDiv.appendChild(nameDiv);
                infoDiv.appendChild(metaDiv);

                const btnGroup = document.createElement('div');
                btnGroup.className = 'ht-att-card-actions';

                // Tombol Pasang Reusable
                const btnAttach = document.createElement('button');
                btnAttach.type = 'button';
                btnAttach.className = 'ht-btn ht-btn-primary';
                btnAttach.innerText = 'Pasang';
                btnAttach.title = 'Pasang model 3D ini ke karakter yang sedang aktif';
                btnAttach.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addNewAttachmentFromUrl(file.fileUrl);
                });

                // Tombol Hapus Permanen dari Disk
                const btnDelFile = document.createElement('button');
                btnDelFile.type = 'button';
                btnDelFile.className = 'ht-mini-icon-btn danger';
                btnDelFile.innerHTML = window.blIcon('trash');
                btnDelFile.title = 'Hapus berkas ini permanen dari folder assets/attachments/ project';
                btnDelFile.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmMsg = `Hapus permanen berkas 3D ini dari project?\n\nFile: ${file.fileName || file.name}\n\nPerhatian: Berkas akan dihapus dari server dan tidak dapat dikembalikan.`;
                    if (!confirm(confirmMsg)) return;

                    btnDelFile.disabled = true;
                    btnDelFile.innerText = '...';
                    const delRes = await window.PandoraAttachmentSystem.deleteUploadedFile(file.fileUrl);
                    if (delRes && delRes.success) {
                        showToast(`Berkas fisik ${file.fileName || file.name} berhasil dihapus dari project`, '#10b981');
                        renderAttachmentLibraryUI();
                        renderAttachmentUI();
                    } else {
                        btnDelFile.disabled = false;
                        btnDelFile.innerHTML = window.blIcon('trash');
                        showToast(`Gagal menghapus berkas: ${delRes ? delRes.message : 'Error server'}`, '#ef4444');
                    }
                });

                btnGroup.appendChild(btnAttach);
                btnGroup.appendChild(btnDelFile);

                card.appendChild(infoDiv);
                card.appendChild(btnGroup);

                libContainer.appendChild(card);
            });
        } catch (err) {
            console.warn('[Attachment Library] Error fetching files:', err);
            libContainer.innerHTML = '<div style="font-size:10px; color:#ef4444; padding:6px 0;">Gagal memuat library berkas.</div>';
        }
    }

    function getActiveCharacterAttachments() {
        if (!window.PandoraAttachmentSystem || typeof window.PandoraAttachmentSystem.getCharacterAttachments !== 'function') {
            return [];
        }
        return window.PandoraAttachmentSystem.getCharacterAttachments(activeCharKey);
    }

    function renderAttachmentUI() {
        const listEl = document.getElementById('ht-attachment-list');
        const countLbl = document.getElementById('lbl-att-count');
        const selectBone = document.getElementById('select-att-bone');
        const charBadge = document.getElementById('badge-active-char');

        // Sinkronkan badge nama & icon karakter di panel kiri atas
        if (charBadge) {
            const meta = window.PandoraHeroRegistry ? window.PandoraHeroRegistry.getCharacterMeta(activeCharKey) : null;
            charBadge.innerText = meta ? meta.name : activeCharKey;
        }

        // Isi pilihan socket bone jika belum atau jika opsi telah diperbarui
        if (selectBone && window.PandoraAttachmentSystem) {
            const desiredCount = window.PandoraAttachmentSystem.socketBones.length;
            if (selectBone.options.length !== desiredCount) {
                selectBone.innerHTML = '';
                window.PandoraAttachmentSystem.socketBones.forEach(sb => {
                    const opt = document.createElement('option');
                    opt.value = sb.key;
                    opt.innerText = sb.label;
                    opt.addEventListener('mouseenter', () => showBoneLocationIndicator(sb.key));
                    opt.addEventListener('mouseover', () => showBoneLocationIndicator(sb.key));
                    opt.addEventListener('mouseleave', () => hideBoneLocationIndicator());
                    selectBone.appendChild(opt);
                });
                selectBone.addEventListener('mouseleave', () => hideBoneLocationIndicator());
                selectBone.addEventListener('blur', () => hideBoneLocationIndicator());
            }
        }

        const attachments = getActiveCharacterAttachments();
        if (countLbl) countLbl.innerText = `${attachments.length} Model 3D`;

        // Pastikan selectedAttachmentId valid untuk karakter aktif ini
        if (!attachments.some(a => a.id === selectedAttachmentId)) {
            selectedAttachmentId = attachments.length > 0 ? attachments[0].id : null;
        }

        // Render Quick Bone Chips di bawah dropdown agar user bisa hover atau klik langsung
        const chipsContainer = document.getElementById('ht-att-bone-chips');
        if (chipsContainer && window.PandoraAttachmentSystem) {
            chipsContainer.innerHTML = '';
            chipsContainer.addEventListener('mouseleave', () => hideBoneLocationIndicator());
            const currentAtt = attachments.find(a => a.id === selectedAttachmentId);
            const activeBoneKey = currentAtt ? (currentAtt.bone || 'RightArm') : '';

            window.PandoraAttachmentSystem.socketBones.forEach(sb => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'ht-btn';
                const isActive = sb.key === activeBoneKey;
                chip.style.cssText = `
                    font-size: 10px;
                    padding: 2px 6px;
                    height: 22px;
                    border-radius: 3px;
                    white-space: nowrap;
                    background: ${isActive ? '#0284c7' : '#27272a'};
                    color: ${isActive ? '#ffffff' : '#d4d4d8'};
                    border: 1px solid ${isActive ? '#38bdf8' : '#3f3f46'};
                    cursor: pointer;
                    transition: all 0.15s;
                `;
                let shortLabel = sb.key;
                if (sb.key === 'RightArm') shortLabel = 'Lengan Kn (Bahu)';
                else if (sb.key === 'RightForeArm') shortLabel = 'Lengan Bwh Kn';
                else if (sb.key === 'RightShoulder') shortLabel = 'Bahu Kn';
                else if (sb.key === 'RightHand') shortLabel = 'Tangan Kn';
                else if (sb.key === 'LeftArm') shortLabel = 'Lengan Kr (Bahu)';
                else if (sb.key === 'LeftForeArm') shortLabel = 'Lengan Bwh Kr';
                else if (sb.key === 'LeftShoulder') shortLabel = 'Bahu Kr';
                else if (sb.key === 'LeftHand') shortLabel = 'Tangan Kr';
                else if (sb.key === 'Head') shortLabel = 'Kepala';
                else if (sb.key === 'Spine2') shortLabel = 'Punggung';
                else if (sb.key === 'Spine1') shortLabel = 'Dada';
                else if (sb.key === 'Hips') shortLabel = 'Pinggang';
                else if (sb.key === 'RightUpLeg') shortLabel = 'Paha Kn';
                else if (sb.key === 'LeftUpLeg') shortLabel = 'Paha Kr';
                else if (sb.key === 'RightLeg') shortLabel = 'Betis Kn';
                else if (sb.key === 'LeftLeg') shortLabel = 'Betis Kr';
                else if (sb.key === 'RightFoot') shortLabel = 'Kaki Kn';
                else if (sb.key === 'LeftFoot') shortLabel = 'Kaki Kr';

                chip.innerText = shortLabel;
                chip.title = `${sb.label} (Klik untuk pasang ke tulang ini, Arahkan kursor untuk lihat titik di 3D)`;

                // Hover: langsung sorot titik lokasi di tubuh 3D hanya saat kursor berada di atasnya
                chip.addEventListener('mouseenter', () => {
                    chip.style.borderColor = '#38bdf8';
                    chip.style.background = '#0369a1';
                    showBoneLocationIndicator(sb.key);
                });
                chip.addEventListener('mouseleave', () => {
                    if (sb.key !== activeBoneKey) {
                        chip.style.borderColor = '#3f3f46';
                        chip.style.background = '#27272a';
                    }
                    hideBoneLocationIndicator();
                });
                chip.addEventListener('click', () => {
                    hideBoneLocationIndicator();
                    if (selectBone) {
                        selectBone.value = sb.key;
                        selectBone.dispatchEvent(new Event('change'));
                    }
                });

                chipsContainer.appendChild(chip);
            });
        }

        // Render Cards di Panel Kiri
        if (listEl) {
            listEl.innerHTML = '';
            if (attachments.length === 0) {
                listEl.innerHTML = `
                    <div style="font-size:11px; color:#71717a; text-align:center; padding:20px 8px; border:1px dashed #3f3f46; border-radius:6px; line-height:1.5;">
                        Belum ada model 3D terpasang.<br>Klik tombol <strong>Upload File 3D</strong> di atas untuk memasukkan file <code>.glb</code> atau <code>.fbx</code>!
                    </div>
                `;
            } else {
                attachments.forEach(att => {
                    const card = document.createElement('div');
                    card.className = 'ht-att-card' + (att.id === selectedAttachmentId ? ' active' : '');

                    const ext = (att.fileType || (att.fileUrl ? att.fileUrl.split('.').pop() : '3d')).toUpperCase();
                    const badgeColor = ext === 'FBX' ? '#f59e0b' : '#38bdf8';

                    card.innerHTML = `
                        <div class="ht-att-card-left">
                            <span style="font-size:10px; font-weight:800; background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}66; padding:2px 5px; border-radius:3px;">${ext}</span>
                            <div style="min-width:0;">
                                <div class="ht-att-card-title">${att.name || att.fileName || 'Model 3D'}</div>
                                <div class="ht-att-card-sub">Socket: <strong>${att.bone || 'RightHand'}</strong></div>
                            </div>
                        </div>
                        <div class="ht-att-card-actions">
                            <button type="button" class="ht-mini-icon-btn btn-vis" title="${att.visible !== false ? 'Sembunyikan' : 'Tampilkan'}">${window.blIcon(att.visible !== false ? 'eye' : 'eyeOff')}</button>
                            <button type="button" class="ht-mini-icon-btn danger btn-del" title="Hapus Model 3D Ini">${window.blIcon('trash')}</button>
                        </div>
                    `;

                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.btn-vis') || e.target.closest('.btn-del')) return;
                        selectAttachment(att.id);
                    });

                    const btnVis = card.querySelector('.btn-vis');
                    if (btnVis) {
                        btnVis.addEventListener('click', (e) => {
                            e.stopPropagation();
                            att.visible = (att.visible === false) ? true : false;
                            refreshAttachmentMeshesInStudio();
                            renderAttachmentUI();
                        });
                    }

                    const btnDel = card.querySelector('.btn-del');
                    if (btnDel) {
                        btnDel.addEventListener('click', (e) => {
                            e.stopPropagation();
                            deleteAttachment(att.id);
                        });
                    }

                    listEl.appendChild(card);
                });
            }
        }

        refreshAttachmentMeshesInStudio();
        syncAttachmentInspectorFromSelected(true);
    }

    function selectAttachment(attId) {
        selectedAttachmentId = attId;
        renderAttachmentUI();
    }

    /**
     * Memproses file 3D (.glb, .gltf, .fbx) yang di-upload atau di-drop
     */
    async function addNewAttachmentFromFile(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['glb', 'gltf', 'fbx'].includes(ext)) {
            showToast('Hanya file .glb, .gltf, atau .fbx yang didukung!', '#ef4444');
            return;
        }

        const statusEl = document.getElementById('att-upload-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#0284c722';
            statusEl.style.color = '#38bdf8';
            statusEl.innerText = `Memuat file ${file.name}...`;
        }

        // 1. Baca ArrayBuffer untuk preview langsung di layar tanpa jeda
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const newId = 'att_' + Date.now().toString(36);
            const cleanName = file.name.replace(/\.[^/.]+$/, '');

            const newAtt = {
                id: newId,
                name: cleanName,
                fileName: file.name,
                fileType: ext,
                fileUrl: '',
                bone: 'RightHand',
                position: [0.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0],
                scale: [1.0, 1.0, 1.0],
                visible: true,
                arrayBuffer: arrayBuffer
            };

            const attList = getActiveCharacterAttachments();
            attList.push(newAtt);
            selectedAttachmentId = newId;
            renderAttachmentUI();

            // 2. Unggah file ke server assets/attachments/ di background
            try {
                if (window.PandoraAttachmentSystem && typeof window.PandoraAttachmentSystem.upload3DFile === 'function') {
                    if (statusEl) statusEl.innerText = `Menyimpan file ${file.name} ke server...`;
                    const upRes = await window.PandoraAttachmentSystem.upload3DFile(file);
                    if (upRes && upRes.fileUrl) {
                        newAtt.fileUrl = upRes.fileUrl;
                        newAtt.fileName = upRes.savedName || file.name;
                        if (statusEl) {
                            statusEl.style.background = '#10b98122';
                            statusEl.style.color = '#34d399';
                            statusEl.innerText = `Tersimpan: ${newAtt.fileUrl}`;
                            setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
                        }
                        syncAttachmentInspectorFromSelected(false);
                        renderAttachmentLibraryUI();
                    }
                }
            } catch (errUpload) {
                console.warn('[Attachment] Upload server gagal, model tetap tersimpan di memori sesi:', errUpload);
                if (statusEl) {
                    statusEl.style.background = '#f59e0b22';
                    statusEl.style.color = '#fbbf24';
                    statusEl.innerText = `ℹModel aktif di editor (Local buffer)`;
                    setTimeout(() => { statusEl.style.display = 'none'; }, 4000);
                }
            }

            showToast(`Model 3D berhasil dipasang: ${cleanName}`, '#10b981');
        };

        reader.readAsArrayBuffer(file);
    }

    /**
     * Memuat model 3D dari Path / URL
     */
    function addNewAttachmentFromUrl(rawUrl) {
        if (!rawUrl || !rawUrl.trim()) {
            showToast('Masukkan path atau URL file 3D terlebih dahulu!', '#ef4444');
            return;
        }
        const url = rawUrl.trim();
        const fileName = url.split('/').pop().split('?')[0];
        const ext = fileName.split('.').pop().toLowerCase();
        const cleanName = fileName.replace(/\.[^/.]+$/, '') || 'Custom Model';

        const newId = 'att_' + Date.now().toString(36);
        const newAtt = {
            id: newId,
            name: cleanName,
            fileName: fileName,
            fileType: ext,
            fileUrl: url,
            bone: 'RightHand',
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
            scale: [1.0, 1.0, 1.0],
            visible: true
        };

        const attList = getActiveCharacterAttachments();
        attList.push(newAtt);
        selectedAttachmentId = newId;
        renderAttachmentUI();
        showToast(`Model 3D dimuat dari: ${fileName}`, '#38bdf8');
    }

    function deleteAttachment(attId) {
        const attList = getActiveCharacterAttachments();
        const idx = attList.findIndex(a => a.id === attId);
        if (idx !== -1) {
            const removed = attList.splice(idx, 1)[0];
            if (attachmentVisualMap.has(attId)) {
                const w = attachmentVisualMap.get(attId);
                if (w && w.parent) w.parent.remove(w);
                attachmentVisualMap.delete(attId);
            }
            if (selectedAttachmentId === attId) {
                selectedAttachmentId = attList.length > 0 ? attList[0].id : null;
            }
            renderAttachmentUI();
            showToast(`Dihapus: ${removed.name || 'Model 3D'}`, '#ef4444');
        }
    }

    function refreshAttachmentMeshesInStudio() {
        const attacker = getAttackerInstance();
        if (!attacker) return;
        const AS = window.PandoraAttachmentSystem;
        if (!AS) return;

        // 1. Bersihkan SEMUA objek attachment lama di model/root attacker (anti-duplikasi)
        if (attacker.root) {
            const oldAttachments = [];
            attacker.root.traverse(child => {
                if (child.name && (
                    child.name.startsWith('SocketWrapper_') ||
                    child.name.startsWith('Custom3D_') ||
                    child.name.startsWith('AttachmentSocket_') ||
                    child.name === 'AttachmentLoadingPlaceholder' ||
                    child.userData.isAttachmentSocket ||
                    child.userData.attachmentId
                )) {
                    oldAttachments.push(child);
                }
            });
            oldAttachments.forEach(c => {
                if (c && c.parent) {
                    c.parent.remove(c);
                }
            });
        }
        if (attacker._attachedSockets && Array.isArray(attacker._attachedSockets)) {
            attacker._attachedSockets.forEach(s => {
                if (s && s.parent) s.parent.remove(s);
            });
            attacker._attachedSockets = [];
        }

        // 2. Bersihkan wrapper yang tersimpan di attachmentVisualMap
        attachmentVisualMap.forEach((wrapper) => {
            if (wrapper && wrapper.parent) {
                wrapper.parent.remove(wrapper);
            }
        });
        attachmentVisualMap.clear();

        const attachments = getActiveCharacterAttachments();
        let targetSelectedWrapper = null;

        attachments.forEach(att => {
            const bone = AS.resolveBone(attacker, att.bone || 'RightArm');
            const wrapper = AS.createAttachmentMesh(att);
            wrapper.userData.attachmentId = att.id;

            if (bone) {
                bone.add(wrapper);
            } else if (attacker.root) {
                attacker.root.add(wrapper);
            }

            attachmentVisualMap.set(att.id, wrapper);

            if (att.id === selectedAttachmentId) {
                targetSelectedWrapper = wrapper;
            }
        });

        // Hubungkan TransformControls ke attachment yang sedang aktif dipilih
        if (transformControl) {
            if (currentStudioMode === 'attachment' && targetSelectedWrapper && targetSelectedWrapper.visible) {
                transformControl.attach(targetSelectedWrapper);
                transformControl.visible = true;
                transformControl.enabled = true;
                transformControl.setSpace('local');
            } else if (currentStudioMode === 'attachment') {
                transformControl.detach();
                transformControl.visible = false;
                transformControl.enabled = false;
            }
        }
    }

    function syncAttachmentInspectorFromSelected(updateInputs = true) {
        const secInspector = document.getElementById('section-att-inspector');
        const badgeBone = document.getElementById('badge-selected-bone');
        const attList = getActiveCharacterAttachments();
        const att = attList.find(a => a.id === selectedAttachmentId);

        if (!att) {
            if (secInspector) secInspector.style.opacity = '0.45';
            if (badgeBone) badgeBone.innerText = '-';
            return;
        }

        if (secInspector) secInspector.style.opacity = '1.0';
        if (badgeBone) badgeBone.innerText = att.bone;

        const inputName = document.getElementById('input-att-name');
        const selectBone = document.getElementById('select-att-bone');
        const lblSource = document.getElementById('lbl-att-source-info');
        const chkVis = document.getElementById('chk-att-visible');

        if (inputName && document.activeElement !== inputName) inputName.value = att.name || att.fileName || '';
        if (selectBone) selectBone.value = att.bone || 'RightArm';
        if (lblSource) {
            const ext = (att.fileType || (att.fileUrl ? att.fileUrl.split('.').pop() : '3D')).toUpperCase();
            const src = att.fileUrl || att.fileName || 'Memori Lokal (Buffer)';
            lblSource.innerHTML = `<strong>[${ext}]</strong> ${src}`;
        }
        if (chkVis) chkVis.checked = att.visible !== false;

        if (updateInputs) {
            const pos = att.position || [0, 0, 0];
            const rot = att.rotation || [0, 0, 0];
            const scl = att.scale || [1, 1, 1];

            const nx = document.getElementById('num-att-pos-x');
            const ny = document.getElementById('num-att-pos-y');
            const nz = document.getElementById('num-att-pos-z');
            if (nx && document.activeElement !== nx) nx.value = Number(pos[0] || 0).toFixed(2);
            if (ny && document.activeElement !== ny) ny.value = Number(pos[1] || 0).toFixed(2);
            if (nz && document.activeElement !== nz) nz.value = Number(pos[2] || 0).toFixed(2);

            const rx = document.getElementById('num-att-rot-x');
            const ry = document.getElementById('num-att-rot-y');
            const rz = document.getElementById('num-att-rot-z');
            if (rx && document.activeElement !== rx) rx.value = Math.round(Number(rot[0] || 0));
            if (ry && document.activeElement !== ry) ry.value = Math.round(Number(rot[1] || 0));
            if (rz && document.activeElement !== rz) rz.value = Math.round(Number(rot[2] || 0));

            const sx = document.getElementById('num-att-scale-x');
            const sy = document.getElementById('num-att-scale-y');
            const sz = document.getElementById('num-att-scale-z');
            const sall = document.getElementById('num-att-scale-all');
            if (sx && document.activeElement !== sx) sx.value = Number(scl[0] || 1).toFixed(2);
            if (sy && document.activeElement !== sy) sy.value = Number(scl[1] || 1).toFixed(2);
            if (sz && document.activeElement !== sz) sz.value = Number(scl[2] || 1).toFixed(2);
            if (sall && document.activeElement !== sall) {
                const avg = ((Number(scl[0] || 1) + Number(scl[1] || 1) + Number(scl[2] || 1)) / 3);
                sall.value = avg.toFixed(2);
            }
        }
    }

    function applyAttachmentTransformsFromInspector() {
        const attList = getActiveCharacterAttachments();
        const att = attList.find(a => a.id === selectedAttachmentId);
        const wrapper = attachmentVisualMap.get(selectedAttachmentId);
        if (!att || !wrapper) return;

        const elPosX = document.getElementById('num-att-pos-x');
        const elPosY = document.getElementById('num-att-pos-y');
        const elPosZ = document.getElementById('num-att-pos-z');
        const nx = elPosX ? (parseFloat(elPosX.value) || 0) : (att.position ? att.position[0] : 0);
        const ny = elPosY ? (parseFloat(elPosY.value) || 0) : (att.position ? att.position[1] : 0);
        const nz = elPosZ ? (parseFloat(elPosZ.value) || 0) : (att.position ? att.position[2] : 0);
        att.position = [nx, ny, nz];
        wrapper.position.set(nx, ny, nz);

        const elRotX = document.getElementById('num-att-rot-x');
        const elRotY = document.getElementById('num-att-rot-y');
        const elRotZ = document.getElementById('num-att-rot-z');
        const rx = elRotX ? (parseFloat(elRotX.value) || 0) : (att.rotation ? att.rotation[0] : 0);
        const ry = elRotY ? (parseFloat(elRotY.value) || 0) : (att.rotation ? att.rotation[1] : 0);
        const rz = elRotZ ? (parseFloat(elRotZ.value) || 0) : (att.rotation ? att.rotation[2] : 0);
        att.rotation = [rx, ry, rz];
        wrapper.rotation.set(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz)
        );

        const elScaleX = document.getElementById('num-att-scale-x');
        const elScaleY = document.getElementById('num-att-scale-y');
        const elScaleZ = document.getElementById('num-att-scale-z');
        const sx = Math.max(0.01, elScaleX ? (parseFloat(elScaleX.value) || 1) : (att.scale ? att.scale[0] : 1));
        const sy = Math.max(0.01, elScaleY ? (parseFloat(elScaleY.value) || 1) : (att.scale ? att.scale[1] : 1));
        const sz = Math.max(0.01, elScaleZ ? (parseFloat(elScaleZ.value) || 1) : (att.scale ? att.scale[2] : 1));
        att.scale = [sx, sy, sz];
        wrapper.scale.set(sx, sy, sz);

        const sall = document.getElementById('num-att-scale-all');
        if (sall && document.activeElement !== sall) {
            sall.value = ((sx + sy + sz) / 3).toFixed(2);
        }

        wrapper.updateMatrixWorld(true);
    }

    // ===================================================================
    // 6. BINDING EVENT HANDLERS UI
    // ===================================================================
    function bindUIEvents() {
        // Populate Bone Dropdown
        const selectBone = document.getElementById('select-hb-bone');
        if (selectBone) {
            selectBone.innerHTML = '';
            HS.BONE_CATALOG.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.key;
                opt.innerText = b.label;
                selectBone.appendChild(opt);
            });
            selectBone.addEventListener('change', () => {
                const hb = getSelectedHitboxObj();
                if (hb) {
                    hb.bone = selectBone.value;
                    renderAllUI();
                }
            });
        }

        // Character Switcher & Auto-Sync Button
        renderCharacterSwitcherUI();
        const btnSyncHeroes = document.getElementById('btn-ht-sync-heroes');
        if (btnSyncHeroes) {
            btnSyncHeroes.addEventListener('click', async () => {
                btnSyncHeroes.disabled = true;
                btnSyncHeroes.innerHTML = '<span>Mereset Cache & Re-syncing...</span>';
                
                try {
                    // 1. Bersihkan Gizmo 3D jika sedang attach
                    if (transformControl) {
                        try { transformControl.detach(); } catch (_) {}
                    }

                    // 2. Bersihkan seluruh Cache Objek 3D Attachment (RAM & Model Cache) dan reload config
                    if (window.PandoraAttachmentSystem) {
                        window.PandoraAttachmentSystem.clearCache();
                        try {
                            await window.PandoraAttachmentSystem.loadConfig(true);
                        } catch (eAtt) {
                            console.warn('[HitTool] Error reload attachment config:', eAtt);
                        }
                    }

                    // 3. Bersihkan seluruh Cache Karakter & FBX (Browser Cache API, IndexedDB, dan Memory AssetManagers)
                    if (window.PandoraHeroRegistry) {
                        try {
                            await window.PandoraHeroRegistry.purgeAllCache();
                            await window.PandoraHeroRegistry.sync(true);
                        } catch (eH) {
                            console.warn('[HitTool] Error reload hero registry:', eH);
                        }
                    }

                    // 4. Reload Hitbox & Hurtbox Configuration dari server
                    if (HS && typeof HS.loadFromServer === 'function') {
                        try {
                            await HS.loadFromServer();
                        } catch (eHb) {
                            console.warn('[HitTool] Error reload hitboxes:', eHb);
                        }
                    }

                    // 5. Hancurkan seluruh model 3D karakter lama di studio scene
                    Object.keys(charInstances).forEach(k => {
                        const inst = charInstances[k];
                        if (inst && inst.root && scene) {
                            scene.remove(inst.root);
                        }
                        delete charInstances[k];
                    });
                    heroInstance = null;
                    enemyInstance = null;

                    // 6. Muat ulang karakter aktif saat ini secara fresh dari file FBX yang baru
                    const currentMeta = (window.PandoraHeroRegistry && window.PandoraHeroRegistry.getCharacterMeta(activeCharKey)) || { id: activeCharKey };
                    await ensureCharacterInstanceLoaded(currentMeta);

                    // Muat juga dummy karakter lawan jika di mode combat
                    const dummyKey = (activeCharKey === 'enemy-foxtree') ? 'hero' : 'enemy-foxtree';
                    const dummyMeta = (window.PandoraHeroRegistry && window.PandoraHeroRegistry.getCharacterMeta(dummyKey)) || { id: dummyKey };
                    await ensureCharacterInstanceLoaded(dummyMeta);

                    applyCharacterPositionsAndRoles();

                    // 7. Refresh tampilan sesuai mode yang sedang aktif
                    if (currentStudioMode === 'attachment') {
                        applyTPoseToActiveCharacter();
                        refreshAttachmentMeshesInStudio();
                        renderAttachmentUI();
                    } else {
                        restoreCombatAnimation();
                        const attacker = getAttackerInstance();
                        if (attacker && window.PandoraAttachmentSystem) {
                            window.PandoraAttachmentSystem.applyAttachmentsToCharacter(attacker, activeCharKey);
                        }
                        renderAllUI();
                    }

                    renderCharacterSwitcherUI();
                    showToast('Re-Sync Berhasil! Seluruh Karakter, Objek 3D & Cache Telah Di-refresh.', '#10b981');
                } catch (errSync) {
                    console.error('[HitTool] Gagal re-sync studio:', errSync);
                    showToast('Gagal re-sync: ' + (errSync.message || 'Periksa console log'), '#ef4444');
                } finally {
                    btnSyncHeroes.disabled = false;
                    btnSyncHeroes.innerHTML = '<span>Re-Sync</span>';
                }
            });
        }

        // Header Checkboxes
        const chkBones = document.getElementById('chk-show-bones');
        if (chkBones) {
            chkBones.addEventListener('change', () => {
                setBoneDotsVisible(chkBones.checked);
            });
        }

        const chkGizmo = document.getElementById('chk-show-gizmo');
        if (chkGizmo) {
            chkGizmo.addEventListener('change', () => {
                if (transformControl) transformControl.visible = chkGizmo.checked;
                if (transformControl) transformControl.enabled = chkGizmo.checked;
            });
        }

        const chkDebugPlay = document.getElementById('chk-debug-playmode');
        if (chkDebugPlay) {
            chkDebugPlay.checked = !!HS.showDebugInPlayMode;
            chkDebugPlay.addEventListener('change', () => {
                HS.setDebugPlayMode(chkDebugPlay.checked);
                showToast(chkDebugPlay.checked
                    ? 'Visual Hitbox diaktifkan untuk Play Mode'
                    : 'Visual Hitbox disembunyikan saat Play Mode');
            });
        }

        // Dummy Controls
        const chkDummy = document.getElementById('chk-enable-dummy');
        if (chkDummy) {
            chkDummy.addEventListener('change', () => {
                dummyEnabled = chkDummy.checked;
                applyCharacterPositionsAndRoles();
                if (hurtboxVisualGroup) hurtboxVisualGroup.visible = dummyEnabled;
            });
        }

        const sliderDummyDist = document.getElementById('slider-dummy-dist');
        const valDummyDist = document.getElementById('val-dummy-dist');
        if (sliderDummyDist) {
            sliderDummyDist.addEventListener('input', () => {
                dummyDistance = parseFloat(sliderDummyDist.value);
                if (valDummyDist) valDummyDist.innerText = `${dummyDistance.toFixed(2)}m`;
                applyCharacterPositionsAndRoles();
            });
        }

        const sliderDummyAngle = document.getElementById('slider-dummy-angle');
        const valDummyAngle = document.getElementById('val-dummy-angle');
        if (sliderDummyAngle) {
            sliderDummyAngle.addEventListener('input', () => {
                dummyAngleDeg = parseFloat(sliderDummyAngle.value);
                if (valDummyAngle) valDummyAngle.innerText = `${dummyAngleDeg}°`;
                applyCharacterPositionsAndRoles();
            });
        }

        const chkDummyReact = document.getElementById('chk-dummy-react');
        if (chkDummyReact) {
            chkDummyReact.addEventListener('change', () => {
                dummyAutoReact = chkDummyReact.checked;
            });
        }

        // Selected Hitbox Inspector Controls
        const chkHbEnabled = document.getElementById('chk-hb-enabled');
        if (chkHbEnabled) {
            chkHbEnabled.addEventListener('change', () => {
                const hb = getSelectedHitboxObj();
                if (hb) {
                    hb.enabled = chkHbEnabled.checked;
                    renderAllUI();
                }
            });
        }

        const inputHbName = document.getElementById('input-hb-name');
        if (inputHbName) {
            inputHbName.addEventListener('input', () => {
                const hb = getSelectedHitboxObj();
                if (hb) {
                    hb.name = inputHbName.value;
                    renderActiveHitboxListUI();
                }
            });
        }

        const bindHbSlider = (sliderId, valId, propKey) => {
            const sl = document.getElementById(sliderId);
            const vl = document.getElementById(valId);
            if (!sl) return;
            sl.addEventListener('input', () => {
                const hb = getSelectedHitboxObj();
                if (!hb) return;
                hb[propKey] = parseFloat(sl.value);
                if (vl) vl.innerText = `${hb[propKey].toFixed(2)} m`;
                if (propKey === 'radius') renderActiveHitboxListUI();
            });
        };

        bindHbSlider('slider-hb-radius', 'val-hb-radius', 'radius');
        bindHbSlider('slider-hb-off-x', 'val-hb-off-x', 'offsetX');
        bindHbSlider('slider-hb-off-y', 'val-hb-off-y', 'offsetY');
        bindHbSlider('slider-hb-off-z', 'val-hb-off-z', 'offsetZ');

        const btnZeroOffset = document.getElementById('btn-zero-offset');
        if (btnZeroOffset) {
            btnZeroOffset.addEventListener('click', () => {
                const hb = getSelectedHitboxObj();
                if (!hb) return;
                hb.offsetX = 0.0;
                hb.offsetY = 0.0;
                hb.offsetZ = 0.0;
                syncInspectorFromSelectedHitbox();
            });
        }

        const btnDeleteHb = document.getElementById('btn-delete-hitbox');
        if (btnDeleteHb) {
            btnDeleteHb.addEventListener('click', deleteSelectedHitbox);
        }

        const btnAddCustomHb = document.getElementById('btn-add-custom-hitbox');
        if (btnAddCustomHb) {
            btnAddCustomHb.addEventListener('click', () => {
                const defaultBone = activeAnimKey.toLowerCase().includes('kick') ? 'RightFoot' : 'RightHand';
                addOrSelectHitboxForBone(defaultBone, true);
            });
        }

        // Animation Speed (Kecepatan Tiap Gerakan Karakter)
        const sliderAnimSpeed = document.getElementById('slider-anim-speed');
        const numAnimSpeed = document.getElementById('num-anim-speed');
        const valAnimSpeed = document.getElementById('val-anim-speed');

        const setAnimationSpeed = (val, fromInput = false) => {
            let s = parseFloat(val);
            if (isNaN(s) || s <= 0.05) s = 1.0;
            s = Number(THREE.MathUtils.clamp(s, 0.10, 5.0).toFixed(2));

            const cfg = getCurrentAnimConfig();
            if (cfg) {
                cfg.speed = s;
            }

            if (sliderAnimSpeed && !fromInput) sliderAnimSpeed.value = s.toFixed(2);
            if (numAnimSpeed && (!fromInput || document.activeElement !== numAnimSpeed)) numAnimSpeed.value = s.toFixed(2);
            if (valAnimSpeed) valAnimSpeed.innerText = `${s.toFixed(2)}x`;

            // Update live playback speed pada action attacker
            const attacker = getAttackerInstance();
            if (attacker && attacker.actions && attacker.actions[activeAnimKey]) {
                attacker.actions[activeAnimKey].timeScale = s;
            }

            // Highlight tombol preset speed
            const quickSpeedBtns = document.querySelectorAll('.btn-quick-speed');
            quickSpeedBtns.forEach(b => {
                const bVal = parseFloat(b.dataset.speed);
                b.classList.toggle('active', Math.abs(bVal - s) < 0.03);
            });

            // Refresh pill list animasi agar badge kecepatan update
            renderAnimationListUI();
        };

        if (sliderAnimSpeed) {
            sliderAnimSpeed.addEventListener('input', () => {
                setAnimationSpeed(sliderAnimSpeed.value, false);
            });
        }
        if (numAnimSpeed) {
            numAnimSpeed.addEventListener('input', () => {
                setAnimationSpeed(numAnimSpeed.value, true);
            });
            numAnimSpeed.addEventListener('change', () => {
                setAnimationSpeed(numAnimSpeed.value, false);
            });
        }

        const quickSpeedBtns = document.querySelectorAll('.btn-quick-speed');
        quickSpeedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const spd = parseFloat(btn.dataset.speed);
                if (!isNaN(spd)) {
                    setAnimationSpeed(spd, false);
                    showToast(`Kecepatan ${activeAnimKey}: ${spd.toFixed(1)}x`);
                }
            });
        });

        // Animation Damage & Active Phase Window
        const inputDmg = document.getElementById('input-anim-damage');
        if (inputDmg) {
            inputDmg.addEventListener('input', () => {
                const cfg = getCurrentAnimConfig();
                if (cfg) cfg.damage = Math.max(1, parseInt(inputDmg.value, 10) || 25);
            });
        }

        const inputKb = document.getElementById('input-anim-knockback');
        if (inputKb) {
            inputKb.addEventListener('input', () => {
                const cfg = getCurrentAnimConfig();
                if (cfg) cfg.knockback = Math.max(0, parseFloat(inputKb.value) || 0.22);
            });
        }

        const sliderStart = document.getElementById('slider-active-start');
        const sliderEnd = document.getElementById('slider-active-end');
        if (sliderStart && sliderEnd) {
            const onWindowChange = () => {
                const cfg = getCurrentAnimConfig();
                if (!cfg) return;
                let s = parseInt(sliderStart.value, 10) / 100;
                let e = parseInt(sliderEnd.value, 10) / 100;
                if (s >= e - 0.02) s = Math.max(0, e - 0.05);
                cfg.activeStartPct = Number(s.toFixed(2));
                cfg.activeEndPct = Number(e.toFixed(2));
                syncInspectorFromSelectedHitbox();
            };
            sliderStart.addEventListener('input', onWindowChange);
            sliderEnd.addEventListener('input', onWindowChange);
        }

        const btnSetStartNow = document.getElementById('btn-set-start-now');
        if (btnSetStartNow) {
            btnSetStartNow.addEventListener('click', () => {
                const cfg = getCurrentAnimConfig();
                if (!cfg) return;
                const pct = THREE.MathUtils.clamp(currentClipTime / Math.max(0.01, currentClipDuration), 0, 0.95);
                cfg.activeStartPct = Number(pct.toFixed(2));
                if (cfg.activeEndPct <= cfg.activeStartPct) cfg.activeEndPct = Math.min(1.0, cfg.activeStartPct + 0.15);
                syncInspectorFromSelectedHitbox();
            });
        }

        const btnSetEndNow = document.getElementById('btn-set-end-now');
        if (btnSetEndNow) {
            btnSetEndNow.addEventListener('click', () => {
                const cfg = getCurrentAnimConfig();
                if (!cfg) return;
                const pct = THREE.MathUtils.clamp(currentClipTime / Math.max(0.01, currentClipDuration), 0.05, 1.0);
                cfg.activeEndPct = Number(pct.toFixed(2));
                if (cfg.activeStartPct >= cfg.activeEndPct) cfg.activeStartPct = Math.max(0.0, cfg.activeEndPct - 0.15);
                syncInspectorFromSelectedHitbox();
            });
        }

        const btnSetFullWindow = document.getElementById('btn-set-full-window');
        if (btnSetFullWindow) {
            btnSetFullWindow.addEventListener('click', () => {
                const cfg = getCurrentAnimConfig();
                if (!cfg) return;
                cfg.activeStartPct = 0.0;
                cfg.activeEndPct = 1.0;
                syncInspectorFromSelectedHitbox();
            });
        }

        // Hurtbox Sliders
        const sliderHurtR = document.getElementById('slider-hurt-radius');
        const sliderHurtH = document.getElementById('slider-hurt-height');
        const chkHurtBones = document.getElementById('chk-hurt-bones');
        if (sliderHurtR) {
            sliderHurtR.addEventListener('input', () => {
                const hurtCfg = HS.getHurtboxConfig(getDummyCharKey());
                hurtCfg.radius = parseFloat(sliderHurtR.value);
                syncInspectorFromSelectedHitbox();
            });
        }
        if (sliderHurtH) {
            sliderHurtH.addEventListener('input', () => {
                const hurtCfg = HS.getHurtboxConfig(getDummyCharKey());
                hurtCfg.height = parseFloat(sliderHurtH.value);
                syncInspectorFromSelectedHitbox();
            });
        }
        if (chkHurtBones) {
            chkHurtBones.addEventListener('change', () => {
                const hurtCfg = HS.getHurtboxConfig(getDummyCharKey());
                hurtCfg.useBoneCapsules = chkHurtBones.checked;
            });
        }

        // Top Right Actions: Reset Camera, Reset Anim, Save
        const btnResetCam = document.getElementById('btn-reset-camera-ht');
        if (btnResetCam) {
            btnResetCam.addEventListener('click', () => {
                camera.position.set(2.35, 1.55, 2.25);
                orbitControls.target.set(0, 0.95, 0.45);
                orbitControls.update();
            });
        }

        const btnResetAnim = document.getElementById('btn-reset-anim-ht');
        if (btnResetAnim) {
            btnResetAnim.addEventListener('click', () => {
                HS.resetToDefault(activeCharKey, activeAnimKey);
                const cfg = getCurrentAnimConfig();
                selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;
                renderAllUI();
                showToast(`Hitbox ${activeAnimKey} di-reset ke default`);
            });
        }

        const btnSave = document.getElementById('btn-save-hitboxes');
        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                btnSave.disabled = true;
                btnSave.innerHTML = '<span>Menyimpan...</span>';

                if (currentStudioMode === 'attachment') {
                    const AS = window.PandoraAttachmentSystem;
                    let ok = false;
                    if (AS && typeof AS.persistConfig === 'function') {
                        ok = await AS.persistConfig();
                    }
                    btnSave.disabled = false;
                    btnSave.innerHTML = '<span>Simpan</span>';
                    if (ok) {
                        showToast('Objek 3D Attachment tersimpan ke config/attachments.json & siap di Game!');
                    } else {
                        showToast('Objek 3D Attachment tersimpan ke Browser Storage!');
                    }
                    return;
                }

                const res = await HS.saveConfig();
                btnSave.disabled = false;
                btnSave.innerHTML = '<span>Simpan</span>';
                if (res && res.success) {
                    showToast('Tersimpan ke config/hitboxes.json & siap di Play Mode!');
                } else {
                    showToast('Tersimpan ke Browser Storage!');
                }
            });
        }

        // ===================================================================
        // BINDING EVENT HANDLERS: CHARACTER 3D ATTACHMENT MANAGER
        // ===================================================================
        const tabHitbox = document.getElementById('tab-mode-hitbox');
        const tabAttachment = document.getElementById('tab-mode-attachment');
        if (tabHitbox) tabHitbox.addEventListener('click', () => setStudioMode('hitbox'));
        if (tabAttachment) tabAttachment.addEventListener('click', () => setStudioMode('attachment'));

        // Upload File 3D Picker & Dropzone
        const filePicker = document.getElementById('input-att-file-picker');
        const btnUploadTrigger = document.getElementById('btn-trigger-upload-att');
        const dropzone = document.getElementById('dropzone-att-file');

        if (btnUploadTrigger && filePicker) {
            btnUploadTrigger.addEventListener('click', () => {
                filePicker.click();
            });
        }

        if (filePicker) {
            filePicker.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    addNewAttachmentFromFile(e.target.files[0]);
                    filePicker.value = '';
                }
            });
        }

        if (dropzone) {
            dropzone.addEventListener('click', () => {
                if (filePicker) filePicker.click();
            });
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = '#38bdf8';
                dropzone.style.background = 'rgba(56, 189, 248, 0.08)';
            });
            dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = '#3f3f46';
                dropzone.style.background = 'rgba(255, 255, 255, 0.02)';
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = '#3f3f46';
                dropzone.style.background = 'rgba(255, 255, 255, 0.02)';
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    addNewAttachmentFromFile(e.dataTransfer.files[0]);
                }
            });
        }

        // Muat dari URL / Path
        const btnLoadUrl = document.getElementById('btn-load-att-url');
        const inputAttUrl = document.getElementById('input-att-url');
        if (btnLoadUrl && inputAttUrl) {
            btnLoadUrl.addEventListener('click', () => {
                addNewAttachmentFromUrl(inputAttUrl.value);
                inputAttUrl.value = '';
            });
            inputAttUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    addNewAttachmentFromUrl(inputAttUrl.value);
                    inputAttUrl.value = '';
                }
            });
        }

        // Gizmo Mode Switcher (Translate W, Rotate E, Scale R)
        const bTrans = document.getElementById('btn-gizmo-translate');
        const bRot = document.getElementById('btn-gizmo-rotate');
        const bScale = document.getElementById('btn-gizmo-scale');
        if (bTrans) bTrans.addEventListener('click', () => setGizmoMode('translate'));
        if (bRot) bRot.addEventListener('click', () => setGizmoMode('rotate'));
        if (bScale) bScale.addEventListener('click', () => setGizmoMode('scale'));

        // Input Inspector Attachment
        const inputAttName = document.getElementById('input-att-name');
        if (inputAttName) {
            inputAttName.addEventListener('input', () => {
                const attList = getActiveCharacterAttachments();
                const att = attList.find(a => a.id === selectedAttachmentId);
                if (att) {
                    att.name = inputAttName.value;
                    renderAttachmentUI();
                }
            });
        }

        const selectAttBone = document.getElementById('select-att-bone');
        if (selectAttBone) {
            selectAttBone.addEventListener('change', () => {
                const attList = getActiveCharacterAttachments();
                const att = attList.find(a => a.id === selectedAttachmentId);
                if (att) {
                    att.bone = selectAttBone.value;
                    // Reset posisi & rotasi lokal agar objek langsung mengunci di sendi tulang baru
                    att.position = [0, 0, 0];
                    att.rotation = [0, 0, 0];
                    refreshAttachmentMeshesInStudio();
                    renderAttachmentUI();
                    syncAttachmentInspectorFromSelected(true);
                    hideBoneLocationIndicator(); // Sudah terpilih -> hilangkan indikator
                    showToast(`Socket dipindah ke: ${att.bone}`);
                }
            });
            selectAttBone.addEventListener('mouseleave', () => hideBoneLocationIndicator());
            selectAttBone.addEventListener('blur', () => hideBoneLocationIndicator());
        }

        const chkAttVis = document.getElementById('chk-att-visible');
        if (chkAttVis) {
            chkAttVis.addEventListener('change', () => {
                const attList = getActiveCharacterAttachments();
                const att = attList.find(a => a.id === selectedAttachmentId);
                if (att) {
                    att.visible = chkAttVis.checked;
                    refreshAttachmentMeshesInStudio();
                    renderAttachmentUI();
                }
            });
        }

        // Input Number Transform XYZ (Posisi, Rotasi, Skala)
        ['pos-x', 'pos-y', 'pos-z', 'rot-x', 'rot-y', 'rot-z', 'scale-x', 'scale-y', 'scale-z'].forEach(propKey => {
            const el = document.getElementById('num-att-' + propKey);
            if (el) {
                el.addEventListener('input', () => {
                    applyAttachmentTransformsFromInspector();
                });
            }
        });

        // Input Skala Keseluruhan (Merubah Semua Sumbu X, Y, Z Sekaligus)
        const elScaleAll = document.getElementById('num-att-scale-all');
        if (elScaleAll) {
            elScaleAll.addEventListener('input', () => {
                const val = Math.max(0.01, parseFloat(elScaleAll.value) || 1);
                const sx = document.getElementById('num-att-scale-x');
                const sy = document.getElementById('num-att-scale-y');
                const sz = document.getElementById('num-att-scale-z');
                if (sx) sx.value = val.toFixed(2);
                if (sy) sy.value = val.toFixed(2);
                if (sz) sz.value = val.toFixed(2);
                applyAttachmentTransformsFromInspector();
            });
        }

        // Tombol Reset Utility Attachment
        const btnResetPos = document.getElementById('btn-att-reset-pos');
        if (btnResetPos) {
            btnResetPos.addEventListener('click', () => {
                const nx = document.getElementById('num-att-pos-x');
                const ny = document.getElementById('num-att-pos-y');
                const nz = document.getElementById('num-att-pos-z');
                if (nx) nx.value = '0.00';
                if (ny) ny.value = '0.00';
                if (nz) nz.value = '0.00';
                applyAttachmentTransformsFromInspector();
            });
        }

        const btnResetRot = document.getElementById('btn-att-reset-rot');
        if (btnResetRot) {
            btnResetRot.addEventListener('click', () => {
                const rx = document.getElementById('num-att-rot-x');
                const ry = document.getElementById('num-att-rot-y');
                const rz = document.getElementById('num-att-rot-z');
                if (rx) rx.value = '0';
                if (ry) ry.value = '0';
                if (rz) rz.value = '0';
                applyAttachmentTransformsFromInspector();
            });
        }

        const btnResetScale = document.getElementById('btn-att-reset-scale');
        if (btnResetScale) {
            btnResetScale.addEventListener('click', () => {
                const sx = document.getElementById('num-att-scale-x');
                const sy = document.getElementById('num-att-scale-y');
                const sz = document.getElementById('num-att-scale-z');
                const sall = document.getElementById('num-att-scale-all');
                if (sx) sx.value = '1.00';
                if (sy) sy.value = '1.00';
                if (sz) sz.value = '1.00';
                if (sall) sall.value = '1.00';
                applyAttachmentTransformsFromInspector();
            });
        }

        const btnDelAtt = document.getElementById('btn-delete-attachment');
        if (btnDelAtt) {
            btnDelAtt.addEventListener('click', () => {
                if (selectedAttachmentId) {
                    deleteAttachment(selectedAttachmentId);
                }
            });
        }

        // Tombol Refresh Library Berkas 3D Server
        const btnRefreshLib = document.getElementById('btn-refresh-att-library');
        if (btnRefreshLib) {
            btnRefreshLib.addEventListener('click', () => {
                renderAttachmentLibraryUI();
            });
        }

        // Toggle Hide/Show Titik Sendi Tulang (Bone Dots) di Layar
        const btnToggleAttBones = document.getElementById('btn-toggle-att-bones');
        if (btnToggleAttBones) {
            btnToggleAttBones.addEventListener('click', () => {
                setBoneDotsVisible(!isBoneDotsVisible);
            });
        }

        // Dropdown Variasi Sample Animasi untuk Uji Gerak Objek 3D
        const selAttTestAnim = document.getElementById('sel-attachment-test-anim');
        if (selAttTestAnim) {
            selAttTestAnim.addEventListener('change', (e) => {
                playAttachmentTestAnimation(e.target.value);
            });
        }

        // Tombol Kembali ke T-Pose (Bind-Pose)
        const btnAttResetTPose = document.getElementById('btn-att-reset-tpose');
        if (btnAttResetTPose) {
            btnAttResetTPose.addEventListener('click', () => {
                applyTPoseToActiveCharacter();
                showToast('Kembali ke T-Pose (Bind-Pose)', '#0284c7');
            });
        }

        // Preview Gerak Animasi saat di Mode Attachment (Fallback lama)
        const btnTestPose = document.getElementById('btn-toggle-tpose-preview');
        if (btnTestPose) {
            btnTestPose.addEventListener('click', () => {
                isPreviewAnimInAttachment = !isPreviewAnimInAttachment;
                btnTestPose.classList.toggle('active', isPreviewAnimInAttachment);
                if (isPreviewAnimInAttachment) {
                    btnTestPose.innerHTML = '<span>T-Pose</span>';
                    restoreCombatAnimation();
                } else {
                    btnTestPose.innerHTML = '<span>Test Gerak Animasi</span>';
                    applyTPoseToActiveCharacter();
                }
            });
        }

        // Shortcut Hotkeys W, E, R untuk Gizmo di Layar
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }
            if (currentStudioMode === 'attachment') {
                if (e.key === 'w' || e.key === 'W') {
                    setGizmoMode('translate');
                } else if (e.key === 'e' || e.key === 'E') {
                    setGizmoMode('rotate');
                } else if (e.key === 'r' || e.key === 'R') {
                    setGizmoMode('scale');
                }
            }
        });

        // Bottom Timeline Transport Controls
        const btnPlay = document.getElementById('btn-tl-play');
        const updatePlayBtnUI = () => {
            if (!btnPlay) return;
            btnPlay.classList.toggle('active', isPlaying);
            btnPlay.innerHTML = window.blIcon(isPlaying ? 'pause' : 'play');
        };

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                isPlaying = !isPlaying;
                updatePlayBtnUI();
            });
        }

        const btnLoop = document.getElementById('btn-tl-loop');
        if (btnLoop) {
            btnLoop.addEventListener('click', () => {
                isLooping = !isLooping;
                btnLoop.classList.toggle('active', isLooping);
            });
        }

        const selectSpeed = document.getElementById('select-tl-speed');
        if (selectSpeed) {
            selectSpeed.addEventListener('change', () => {
                playbackSpeed = parseFloat(selectSpeed.value) || 1.0;
            });
        }

        const stepFrame = (dir) => {
            isPlaying = false;
            updatePlayBtnUI();
            const frameDt = 1 / 30;
            currentClipTime = THREE.MathUtils.clamp(currentClipTime + dir * frameDt, 0, currentClipDuration);
            dummyHitTriggeredInCycle = false;
        };

        const btnPrevF = document.getElementById('btn-tl-prev-frame');
        const btnNextF = document.getElementById('btn-tl-next-frame');
        if (btnPrevF) btnPrevF.addEventListener('click', () => stepFrame(-1));
        if (btnNextF) btnNextF.addEventListener('click', () => stepFrame(1));

        const sliderScrub = document.getElementById('slider-timeline-scrub');
        if (sliderScrub) {
            sliderScrub.addEventListener('input', () => {
                isPlaying = false;
                updatePlayBtnUI();
                const ratio = parseFloat(sliderScrub.value) / 1000;
                currentClipTime = ratio * currentClipDuration;
                dummyHitTriggeredInCycle = false;
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
            if (e.code === 'Space') {
                e.preventDefault();
                isPlaying = !isPlaying;
                updatePlayBtnUI();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                stepFrame(-1);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                stepFrame(1);
            }
        });
    }

    // ===================================================================
    // 7. MAIN 60FPS RENDER & COLLISION EVALUATION LOOP
    // ===================================================================
    function animate() {
        requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.1);
        orbitControls.update();

        const attacker = getAttackerInstance();
        const dummy = getDummyInstance();

        // Di mode attachment (T-Pose 3D Gizmo manager):
        // Jangan jalankan timeline combat mixer ataupun evaluasi hitbox studio
        if (currentStudioMode === 'attachment') {
            if (isPreviewAnimInAttachment && attacker && attacker.mixer) {
                attacker.mixer.update(dt);
                if (attacker.modelMesh) attacker.modelMesh.rotation.set(0, 0, 0);
                attacker.root.updateMatrixWorld(true);
            }

            hideCombatVisualsForAttachment();

            // Update posisi Bone Dots pada karakter (mengikuti T-Pose maupun preview gerak)
            if (boneDotsGroup) {
                boneDotsGroup.visible = isBoneDotsVisible;
                if (isBoneDotsVisible && attacker) {
                    for (let i = 0; i < boneDotMeshes.length; i++) {
                        const item = boneDotMeshes[i];
                        const bNode = HS.resolveBone(attacker, item.boneKey);
                        if (bNode) {
                            bNode.updateWorldMatrix(true, false);
                            bNode.getWorldPosition(item.mesh.position);
                            item.mesh.visible = true;
                        } else {
                            item.mesh.visible = false;
                        }
                    }
                }
            }

            // Update animasi pulsa marker sorotan tulang jika aktif
            if (boneHighlightMarker && boneHighlightMarker.visible) {
                const time = clock.getElapsedTime();
                const pulse1 = 1.0 + Math.sin(time * 9) * 0.25;
                if (boneHighlightRingMesh) {
                    boneHighlightRingMesh.scale.set(pulse1, pulse1, pulse1);
                    boneHighlightRingMesh.lookAt(camera.position);
                }
                const pulse2 = 1.0 + Math.cos(time * 7) * 0.20;
                if (boneHighlightOuterMesh) {
                    boneHighlightOuterMesh.scale.set(pulse2, pulse2, pulse2);
                    boneHighlightOuterMesh.lookAt(camera.position);
                }
                if (activeHighlightedBoneNode) {
                    activeHighlightedBoneNode.updateWorldMatrix(true, false);
                    activeHighlightedBoneNode.getWorldPosition(boneHighlightMarker.position);
                }
            }

            renderer.render(scene, camera);
            return;
        }

        // 1. Update Animasi Penyerang sesuai Timeline Scrubber
        if (attacker && attacker.mixer && attacker.actions && attacker.actions[activeAnimKey]) {
            const act = attacker.actions[activeAnimKey];
            const clip = act.getClip ? act.getClip() : null;
            if (clip && clip.duration > 0.01) {
                currentClipDuration = clip.duration;
            }

            if (isPlaying) {
                const animCfg = getCurrentAnimConfig();
                const animSpeed = (animCfg && typeof animCfg.speed === 'number' && animCfg.speed > 0) ? animCfg.speed : 1.0;
                currentClipTime += dt * playbackSpeed * animSpeed;
                if (currentClipTime >= currentClipDuration) {
                    if (isLooping) {
                        currentClipTime = currentClipTime % currentClipDuration;
                        dummyHitTriggeredInCycle = false;
                        if (HS && typeof HS.resetAttackStrikeTracker === 'function') {
                            HS.resetAttackStrikeTracker(attacker);
                        }
                    } else {
                        currentClipTime = currentClipDuration;
                        isPlaying = false;
                        const btnPlay = document.getElementById('btn-tl-play');
                        if (btnPlay) {
                            btnPlay.classList.remove('active');
                            btnPlay.innerHTML = window.blIcon('play');
                        }
                    }
                }
            }

            act.time = currentClipTime;
            attacker.mixer.update(0); if (attacker && attacker.modelMesh) attacker.modelMesh.rotation.set(0, 0, 0);
            attacker.root.updateMatrixWorld(true);
        }

        // 2. Update Animasi Target Dummy
        if (dummy && dummy.mixer && dummyEnabled) {
            if (dummyReactionTimer > 0) {
                dummyReactionTimer -= dt;
                if (dummyReactionTimer <= 0) {
                    playIdleOnDummy();
                }
            }
            dummy.mixer.update(dt); if (dummy && dummy.modelMesh) dummy.modelMesh.rotation.set(0, 0, 0);
            dummy.root.updateMatrixWorld(true);
        }

        // 3. Update Posisi Bone Dots pada Penyerang
        if (attacker && boneDotsGroup && boneDotsGroup.visible) {
            for (let i = 0; i < boneDotMeshes.length; i++) {
                const item = boneDotMeshes[i];
                const bNode = HS.resolveBone(attacker, item.boneKey);
                if (bNode) {
                    bNode.updateWorldMatrix(true, false);
                    bNode.getWorldPosition(item.mesh.position);
                    item.mesh.visible = true;
                } else {
                    item.mesh.visible = false;
                }
            }
        }

        // 4. Update Visual Hurtbox pada Target Dummy
        if (dummy && dummyEnabled && hurtboxVisualGroup) {
            hurtboxVisualGroup.visible = true;
            const hurtCfg = HS.getHurtboxConfig(getDummyCharKey());
            if (hurtboxCylinderMesh) {
                hurtboxCylinderMesh.scale.set(hurtCfg.radius, hurtCfg.height, hurtCfg.radius);
                hurtboxCylinderMesh.position.copy(dummy.root.position);
                hurtboxCylinderMesh.position.y += (hurtCfg.offsetY || 0) + hurtCfg.height * 0.5;
            }

            const coreBones = [
                { key: 'Head', r: hurtCfg.radius * 0.62 },
                { key: 'Spine2', r: hurtCfg.radius * 0.88 },
                { key: 'Spine1', r: hurtCfg.radius * 0.85 },
                { key: 'Hips', r: hurtCfg.radius * 0.85 }
            ];
            for (let i = 0; i < hurtboxBoneSpheres.length; i++) {
                const sMesh = hurtboxBoneSpheres[i];
                if (hurtCfg.useBoneCapsules !== false && coreBones[i]) {
                    const bNode = HS.resolveBone(dummy, coreBones[i].key);
                    if (bNode) {
                        bNode.updateWorldMatrix(true, false);
                        bNode.getWorldPosition(sMesh.position);
                        const r = coreBones[i].r;
                        sMesh.scale.set(r, r, r);
                        sMesh.visible = true;
                    } else {
                        sMesh.visible = false;
                    }
                } else {
                    sMesh.visible = false;
                }
            }
        } else if (hurtboxVisualGroup) {
            hurtboxVisualGroup.visible = false;
        }

        // 5. Evaluasi Real-Time Hitbox Penyerang vs Hurtbox Dummy
        const progressPct = currentClipDuration > 0.001
            ? THREE.MathUtils.clamp(currentClipTime / currentClipDuration, 0, 1)
            : 0;

        updateTimelineReadout(progressPct);

        if (attacker) {
            const evalRes = HS.evaluateAttackAgainstTarget(
                attacker,
                activeCharKey,
                activeAnimKey,
                progressPct,
                dummyEnabled ? dummy : null,
                getDummyCharKey()
            );

            updateHitboxVisualsAndBanner(evalRes);
        }

        // Fade out cincin efek impact
        if (impactRingAlpha > 0 && impactRingMesh) {
            impactRingAlpha = Math.max(0, impactRingAlpha - dt * 2.8);
            impactRingMesh.material.opacity = impactRingAlpha;
            const s = 1.0 + (1.0 - impactRingAlpha) * 1.8;
            impactRingMesh.scale.set(s, s, s);
            impactRingMesh.lookAt(camera.position);
        }

        // Update animasi pulsa marker sorotan tulang
        if (boneHighlightMarker && boneHighlightMarker.visible) {
            const time = clock.getElapsedTime();
            const pulse1 = 1.0 + Math.sin(time * 9) * 0.25;
            if (boneHighlightRingMesh) {
                boneHighlightRingMesh.scale.set(pulse1, pulse1, pulse1);
                boneHighlightRingMesh.lookAt(camera.position);
            }
            const pulse2 = 1.0 + Math.cos(time * 7) * 0.20;
            if (boneHighlightOuterMesh) {
                boneHighlightOuterMesh.scale.set(pulse2, pulse2, pulse2);
                boneHighlightOuterMesh.lookAt(camera.position);
            }
            if (activeHighlightedBoneNode) {
                activeHighlightedBoneNode.updateWorldMatrix(true, false);
                activeHighlightedBoneNode.getWorldPosition(boneHighlightMarker.position);
            }
        }

        renderer.render(scene, camera);
    }

    function updateTimelineReadout(progressPct) {
        const sliderScrub = document.getElementById('slider-timeline-scrub');
        if (sliderScrub && isPlaying) {
            sliderScrub.value = Math.round(progressPct * 1000);
        }

        const timecodeEl = document.getElementById('ht-timecode-display');
        if (timecodeEl) {
            const totalFrames = Math.max(1, Math.round(currentClipDuration * 30));
            const curFrame = Math.round(currentClipTime * 30);
            const pctInt = Math.round(progressPct * 100);
            timecodeEl.innerText = `${currentClipTime.toFixed(2)}s / ${currentClipDuration.toFixed(2)}s (${pctInt}%) | Frame ${curFrame} / ${totalFrames}`;
        }
    }

    function updateHitboxVisualsAndBanner(evalRes) {
        const cfg = getCurrentAnimConfig();
        const activeIds = new Set();

        // Buat / update bola visual untuk setiap Hitbox di animasi aktif
        if (cfg && Array.isArray(cfg.hitboxes)) {
            const attacker = getAttackerInstance();
            cfg.hitboxes.forEach((hb) => {
                if (hb.enabled === false) return;
                activeIds.add(hb.id);

                let visual = hitboxMeshesMap.get(hb.id);
                if (!visual) {
                    const sGeo = new THREE.SphereGeometry(1, 20, 16);
                    const sMat = new THREE.MeshBasicMaterial({
                        color: 0xef4444,
                        transparent: true,
                        opacity: 0.32,
                        depthWrite: false
                    });
                    const wGeo = new THREE.SphereGeometry(1, 14, 12);
                    const wMat = new THREE.MeshBasicMaterial({
                        color: 0xff6b6b,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.85,
                        depthTest: false
                    });
                    const solidMesh = new THREE.Mesh(sGeo, sMat);
                    const wireMesh = new THREE.Mesh(wGeo, wMat);
                    solidMesh.renderOrder = 995;
                    wireMesh.renderOrder = 996;
                    hitboxVisualGroup.add(solidMesh);
                    hitboxVisualGroup.add(wireMesh);
                    visual = { solidMesh, wireMesh };
                    hitboxMeshesMap.set(hb.id, visual);
                }

                const center = new THREE.Vector3();
                const tf = HS.getHitboxWorldTransform(attacker, hb, center);
                visual.solidMesh.visible = tf.valid;
                visual.wireMesh.visible = tf.valid;
                visual.solidMesh.position.copy(center);
                visual.wireMesh.position.copy(center);
                visual.solidMesh.scale.set(tf.radius, tf.radius, tf.radius);
                visual.wireMesh.scale.set(tf.radius, tf.radius, tf.radius);

                // Cek status tabrakan untuk hitbox ini
                const st = evalRes.hitboxes.find(x => x.hitbox.id === hb.id);
                const isSelected = (hb.id === selectedHitboxId);

                if (st && st.isTriggeredHit) {
                    // KENA TARGET! Warna Kuning Emas Terang
                    visual.solidMesh.material.color.setHex(0xfacc15);
                    visual.solidMesh.material.opacity = 0.58;
                    visual.wireMesh.material.color.setHex(0xfef08a);
                } else if (!evalRes.inActiveWindow) {
                    // Di luar rentang aktif % animasi (abu-abu redup)
                    visual.solidMesh.material.color.setHex(0x6b7280);
                    visual.solidMesh.material.opacity = 0.16;
                    visual.wireMesh.material.color.setHex(0x9ca3af);
                } else {
                    // Area Hitbox Serangan Aktif -> Selalu MERAH konsisten!
                    visual.solidMesh.material.color.setHex(0xef4444);
                    visual.solidMesh.material.opacity = isSelected ? 0.38 : 0.22;
                    visual.wireMesh.material.color.setHex(isSelected ? 0xff4444 : 0xf87171);
                }

                // Sinkronkan posisi 3D Gizmo ke Hitbox yang sedang dipilih
                if (isSelected && !isDraggingGizmo && gizmoAnchor) {
                    gizmoAnchor.position.copy(center);
                }
            });
        }

        // Sembunyikan mesh hitbox dari animasi lain
        hitboxMeshesMap.forEach((visual, id) => {
            if (!activeIds.has(id)) {
                visual.solidMesh.visible = false;
                visual.wireMesh.visible = false;
            }
        });

        // Tampilkan / sembunyikan TransformControls gizmo
        const chkGizmo = document.getElementById('chk-show-gizmo');
        const shouldShowGizmo = Boolean(selectedHitboxId && activeIds.has(selectedHitboxId) && (!chkGizmo || chkGizmo.checked));
        if (transformControl) {
            transformControl.visible = shouldShowGizmo;
            transformControl.enabled = shouldShowGizmo;
        }

        // Update Banner Kontak & Jarak di Viewport
        const banner = document.getElementById('ht-contact-banner');
        const icon = document.getElementById('ht-contact-icon');
        const text = document.getElementById('ht-contact-text');
        const distReadout = document.getElementById('ht-distance-readout');

        if (distReadout) {
            if (evalRes.minDistance < 900) {
                const dColor = evalRes.hit ? '#facc15' : '#38bdf8';
                distReadout.innerHTML = `Jarak Hitbox ke Musuh: <strong style="color:${dColor};">${evalRes.minDistance.toFixed(2)}m</strong>`;
            } else {
                distReadout.innerHTML = `Jarak Hitbox ke Musuh: <strong style="color:#9ca3af;">-</strong>`;
            }
        }

        const attacker = getAttackerInstance();
        const multiHit = (HS && typeof HS.evaluateMultiHitStrike === 'function' && attacker)
            ? HS.evaluateMultiHitStrike(attacker, 'studio_dummy', evalRes, currentClipTime)
            : { triggeredNewHit: evalRes.hit && !dummyHitTriggeredInCycle, hitCount: evalRes.hit ? 1 : 0 };

        if (banner && icon && text) {
            if (evalRes.hit && evalRes.bestHit) {
                banner.classList.add('status-hit');
                icon.dataset.state = 'hit';
                const hbName = evalRes.bestHit.hitbox.name || evalRes.bestHit.hitbox.bone;
                const hitCountNum = Math.max(1, multiHit.hitCount || 1);
                const totalDmg = (evalRes.damage || 25) * hitCountNum;
                text.innerText = hitCountNum > 1
                    ? `HIT #${hitCountNum} KENA! (${hitCountNum}x Combo Hit | ${hbName} → ${evalRes.bestHit.hitPart} | Total -${totalDmg} HP)`
                    : `HIT KENA! (${hbName} → ${evalRes.bestHit.hitPart} Lawan | -${evalRes.damage} HP)`;

                if (multiHit.triggeredNewHit) {
                    dummyHitTriggeredInCycle = true;
                    triggerDummyHitReaction();
                    if (impactRingMesh) {
                        impactRingMesh.position.copy(evalRes.bestHit.worldCenter);
                        impactRingAlpha = 1.0;
                    }
                }
            } else {
                banner.classList.remove('status-hit');
                if (!evalRes.inActiveWindow) {
                    icon.dataset.state = 'idle';
                    text.innerText = `Fase Ancang-ancang / Pemulihan (Di luar jam aktif % gerakan)`;
                } else {
                    icon.dataset.state = 'ready';
                    text.innerText = `Area Hitbox Aktif — Belum Menyentuh Badan Lawan`;
                }
            }
        }
    }

    // ===================================================================
    // BOOTSTRAP STUDIO
    // ===================================================================
    window.addEventListener('DOMContentLoaded', () => {
        initScene();
        bindUIEvents();
        loadCharacters();
        animate();
    });
})();

