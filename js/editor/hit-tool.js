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

    let heroInstance = null;
    let enemyInstance = null;

    // Visual Groups
    let boneDotsGroup = null;
    let boneDotMeshes = []; // { boneKey, mesh }
    let hitboxVisualGroup = null;
    let hitboxMeshesMap = new Map(); // id -> { solidMesh, wireMesh }
    let hurtboxVisualGroup = null;
    let hurtboxCylinderMesh = null;
    let hurtboxBoneSpheres = [];
    let impactRingMesh = null;
    let impactRingAlpha = 0.0;

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    const clock = new THREE.Clock();

    function showToast(msg, bg = '#10b981') {
        const el = document.getElementById('ht-toast');
        if (!el) return;
        el.innerText = msg;
        el.style.background = bg;
        el.style.color = bg === '#ef4444' ? '#fff' : '#052e16';
        el.classList.add('show');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('show'), 2400);
    }

    function getAttackerInstance() {
        return activeCharKey === 'hero' ? heroInstance : enemyInstance;
    }

    function getDummyInstance() {
        return activeCharKey === 'hero' ? enemyInstance : heroInstance;
    }

    function getDummyCharKey() {
        return activeCharKey === 'hero' ? 'enemy-foxtree' : 'hero';
    }

    // ===================================================================
    // 1. INISIALISASI SCENE 3D & VIEWPORT
    // ===================================================================
    function initScene() {
        container = document.getElementById('ht-viewport-container');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1b1b22);

        camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.05, 100);
        camera.position.set(2.35, 1.55, 2.25);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        });

        transformControl.addEventListener('change', () => {
            if (!isDraggingGizmo || !selectedHitboxId) return;
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
    // 2. MEMUAT KARAKTER HERO & ENEMY FOXTREE
    // ===================================================================
    async function loadCharacters() {
        const statusText = document.getElementById('ht-contact-text');
        if (statusText) statusText.innerText = 'Memuat Model 3D Hero & Enemy FoxTree...';

        heroInstance = window.createWolfCharacterModel('red');
        enemyInstance = window.createEnemyFoxTreeModel();

        scene.add(heroInstance.root);
        scene.add(enemyInstance.root);

        // Tunggu seluruh AssetManager selesai memuat FBX
        const promises = [];
        if (window.HeroAssetManager) promises.push(window.HeroAssetManager.load());
        if (window.EnemyFoxTreeAssetManager) promises.push(window.EnemyFoxTreeAssetManager.load());
        if (window.GeneralTakingAssetManager) promises.push(window.GeneralTakingAssetManager.load());
        if (window.GeneralBlockAssetManager) promises.push(window.GeneralBlockAssetManager.load());
        if (window.GeneralDeadAssetManager) promises.push(window.GeneralDeadAssetManager.load());
        if (HS && typeof HS.loadFromServer === 'function') promises.push(HS.loadFromServer());

        try {
            await Promise.allSettled(promises);
        } catch (e) {}

        // Pastikan setupInstance terpanggil jika sudah loaded
        if (window.HeroAssetManager && window.HeroAssetManager.isLoaded && !heroInstance.modelMesh) {
            window.HeroAssetManager.setupInstance(heroInstance);
        }
        if (window.EnemyFoxTreeAssetManager && window.EnemyFoxTreeAssetManager.isLoaded && !enemyInstance.modelMesh) {
            window.EnemyFoxTreeAssetManager.setupInstance(enemyInstance);
        }
        if (window.GeneralTakingAssetManager && window.GeneralTakingAssetManager.isLoaded) {
            window.GeneralTakingAssetManager.setupInstance(heroInstance);
            window.GeneralTakingAssetManager.setupInstance(enemyInstance);
        }

        // Bangun cache bone untuk kedua karakter
        HS.ensureBoneCache(heroInstance);
        HS.ensureBoneCache(enemyInstance);

        const cfg = getCurrentAnimConfig();
        selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;

        applyCharacterPositionsAndRoles();
        playSelectedAnimationOnAttacker(true);
        playIdleOnDummy();
        renderAllUI();
    }

    function applyCharacterPositionsAndRoles() {
        if (!heroInstance || !enemyInstance) return;

        const attacker = getAttackerInstance();
        const dummy = getDummyInstance();

        // Penyerang selalu berdiri di (0, 0, 0) menghadap +Z (ke arah Dummy)
        attacker.root.visible = true;
        attacker.root.position.set(0, 0, 0);
        attacker.root.rotation.set(0, 0, 0);

        // Dummy berdiri di depan penyerang sesuai jarak & sudut
        dummy.root.visible = dummyEnabled;
        const rad = THREE.MathUtils.degToRad(dummyAngleDeg);
        const dx = Math.sin(rad) * dummyDistance;
        const dz = Math.cos(rad) * dummyDistance;
        dummy.root.position.set(dx, 0, dz);
        // Dummy menghadap ke penyerang (0,0,0)
        dummy.root.rotation.set(0, Math.atan2(-dx, -dz), 0);
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
            targetAction.timeScale = 1.0;
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
            showToast(`🎯 Area Hitbox aktif di: ${cleanLabel}`);
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
            showToast(`🎯 Hitbox dipindahkan ke: ${cleanLabel} (${boneKey})`);
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
        showToast(`✅ Hitbox baru ditambahkan di: ${cleanLabel}`);
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
            showToast(`🗑️ Hitbox dihapus`, '#ef4444');
        }
    }

    function onViewportPointerDown(e) {
        if (e.button !== 0 || isDraggingGizmo) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNDC, camera);

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
            charBadge.innerText = activeCharKey === 'hero' ? 'HERO RED FOX' : 'ENEMY FOXTREE';
        }

        const anims = HS.CHARACTER_ANIMATIONS[activeCharKey] || [];
        if (countLbl) countLbl.innerText = `${anims.length} Animasi`;

        listEl.innerHTML = '';
        anims.forEach(item => {
            const animCfg = HS.getAnimationConfig(activeCharKey, item.key);
            const hbCount = (animCfg && Array.isArray(animCfg.hitboxes))
                ? animCfg.hitboxes.filter(h => h.enabled !== false).length
                : 0;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ht-anim-pill' + (item.key === activeAnimKey ? ' active' : '');
            btn.innerHTML = `
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.label.split('(')[0].trim()}</span>
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
                btn.innerText = b.label.split('(')[0].trim();
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

        // Character Switcher
        ['btn-char-hero', 'btn-char-enemy'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                document.getElementById('btn-char-hero').classList.remove('active');
                document.getElementById('btn-char-enemy').classList.remove('active');
                btn.classList.add('active');

                activeCharKey = btn.dataset.char;
                activeAnimKey = 'punch1';
                const cfg = getCurrentAnimConfig();
                selectedHitboxId = (cfg && cfg.hitboxes && cfg.hitboxes.length > 0) ? cfg.hitboxes[0].id : null;

                applyCharacterPositionsAndRoles();
                playSelectedAnimationOnAttacker(true);
                playIdleOnDummy();
                renderAllUI();
            });
        });

        // Header Checkboxes
        const chkBones = document.getElementById('chk-show-bones');
        if (chkBones) {
            chkBones.addEventListener('change', () => {
                if (boneDotsGroup) boneDotsGroup.visible = chkBones.checked;
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
                    ? '👁️ Visual Hitbox diaktifkan untuk Play Mode'
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
                showToast(`🔄 Hitbox ${activeAnimKey} di-reset ke default`);
            });
        }

        const btnSave = document.getElementById('btn-save-hitboxes');
        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                btnSave.disabled = true;
                btnSave.innerHTML = '<span>⏳ Menyimpan...</span>';
                const res = await HS.saveConfig();
                btnSave.disabled = false;
                btnSave.innerHTML = '<span>💾 Simpan ke Game</span>';
                if (res && res.success) {
                    showToast('✅ Tersimpan ke config/hitboxes.json & siap di Play Mode!');
                } else {
                    showToast('✅ Tersimpan ke Browser Storage!');
                }
            });
        }

        // Bottom Timeline Transport Controls
        const btnPlay = document.getElementById('btn-tl-play');
        const updatePlayBtnUI = () => {
            if (!btnPlay) return;
            btnPlay.classList.toggle('active', isPlaying);
            btnPlay.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
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

        // 1. Update Animasi Penyerang sesuai Timeline Scrubber
        if (attacker && attacker.mixer && attacker.actions && attacker.actions[activeAnimKey]) {
            const act = attacker.actions[activeAnimKey];
            const clip = act.getClip ? act.getClip() : null;
            if (clip && clip.duration > 0.01) {
                currentClipDuration = clip.duration;
            }

            if (isPlaying) {
                currentClipTime += dt * playbackSpeed;
                if (currentClipTime >= currentClipDuration) {
                    if (isLooping) {
                        currentClipTime = currentClipTime % currentClipDuration;
                        dummyHitTriggeredInCycle = false;
                    } else {
                        currentClipTime = currentClipDuration;
                        isPlaying = false;
                        const btnPlay = document.getElementById('btn-tl-play');
                        if (btnPlay) {
                            btnPlay.classList.remove('active');
                            btnPlay.innerHTML = '▶ Play';
                        }
                    }
                }
            }

            act.time = currentClipTime;
            attacker.mixer.update(0);
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
            dummy.mixer.update(dt);
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

        if (banner && icon && text) {
            if (evalRes.hit && evalRes.bestHit) {
                banner.classList.add('status-hit');
                icon.innerText = '💥';
                const hbName = evalRes.bestHit.hitbox.name || evalRes.bestHit.hitbox.bone;
                text.innerText = `HIT KENA! (${hbName} ➔ ${evalRes.bestHit.hitPart} Lawan | -${evalRes.damage} HP)`;

                if (!dummyHitTriggeredInCycle) {
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
                    icon.innerText = '⏳';
                    text.innerText = `Fase Ancang-ancang / Pemulihan (Di luar jam aktif % gerakan)`;
                } else {
                    icon.innerText = '🟢';
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

