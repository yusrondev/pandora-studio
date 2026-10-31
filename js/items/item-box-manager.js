/* ===================================================================
   PICKUP HEAL & STAMINA
   Bola kecil bercahaya dengan aura dan butir yang mengorbit: hijau memulihkan HP, oranye memulihkan stamina.
   Sekali diambil hilang dari permainan; boss menjatuhkan sekumpulan saat tereliminasi.
   Saat diambil, tubuh karakter disapu garis cahaya dari kaki ke kepala.
   Tanpa PointLight: jumlah lampu yang berubah memaksa semua shader dikompilasi ulang.
   =================================================================== */
const PICKUP_TYPES = {
    heal: { label: 'Heal', color: 0x18e860, hot: 0xd8ffe6, fraction: 0.35, chime: [523.25, 659.25, 783.99, 1046.5] },
    stamina: { label: 'Stamina', color: 0xff8a12, hot: 0xfff0c9, fraction: 0.6, chime: [659.25, 880, 1174.66, 1318.51] }
};
// Orb energi ultimate: langsung menambah satu orb, tidak terisi bertahap
PICKUP_TYPES.mana = { label: 'Mana', color: 0x2f8cff, hot: 0xd6ecff, fraction: 0, chime: [587.33, 880, 1174.66, 1760] };
const PICKUP_RESTORE_SECONDS = 0.7;
const PICKUP_MIN_SPACING = 1.0;
const PICKUP_AURA_SPRITES = 5;
const PICKUP_ORB_PARTICLES = 45;
const PICKUP_MOTES = 60;
const PICKUP_HOVER = 0.62; // Cukup tinggi agar aura tidak terpotong tanah
const BOSS_DROP_DELAY_MS = 1500; // Setelah kamera eliminasi selesai mendekat
const BOSS_DROP = { heal: 5, stamina: 2, healFraction: 0.08, staminaFraction: 0.12, radiusMin: 1.4, radiusMax: 3.2 };
const SCAN_SWEEP_SECONDS = 0.75;
const SCAN_FADE_SECONDS = 0.35;
const BURST_PARTICLES = 26;

// Dianimasikan di GPU. Warna premultiplied: rgb menambah cahaya, alpha menutup latar, sehingga tetap
// bersinar di area gelap tanpa memutih di tanah terang.
const PICKUP_VERTEX = `
    attribute vec4 aSeed; // sudut, jarak, kecepatan, fase
    attribute float aKind; // 0 aura, 1 isi bola, 2 butir yang mengorbit
    uniform float uTime;
    uniform float uPixelScale;
    uniform float uHover;
    varying float vAlpha;
    varying float vHeat;
    void main() {
        float boxPhase = fract(modelMatrix[3][0] * 0.37 + modelMatrix[3][2] * 0.71) * 6.28;
        float t = uTime + boxPhase;
        float bob = uHover + sin(t * 1.7) * 0.035;
        float angle = aSeed.x + t * aSeed.z * (aKind > 1.5 ? 2.6 : 1.2);
        float height = fract(aSeed.w * 3.71) * 2.0 - 1.0;
        float ring = sqrt(max(0.0, 1.0 - height * height));
        float radius, size, alpha, heat;
        if (aKind < 0.5) {
            radius = 0.02;
            size = (0.62 + aSeed.y * 0.5) * (1.0 + 0.1 * sin(t * 2.2 + aSeed.x));
            alpha = 0.2;
            heat = 0.0;
        } else if (aKind < 1.5) {
            radius = 0.085 * aSeed.y;
            size = 0.1 + 0.05 * sin(t * 4.0 + aSeed.w * 6.28);
            alpha = 0.9;
            heat = 1.0 - aSeed.y * 0.45;
        } else {
            radius = 0.16 + aSeed.y * 0.2 + 0.025 * sin(t * 3.0 + aSeed.w * 6.28);
            size = 0.028 + 0.022 * fract(aSeed.w * 7.31);
            alpha = 0.55 + 0.45 * sin(t * (2.0 + aSeed.z * 6.0) + aSeed.x);
            heat = 0.75;
        }
        vec3 p = vec3(cos(angle) * ring * radius, bob + height * radius, sin(angle) * ring * radius);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * uPixelScale / max(0.1, -mvPosition.z);
        vAlpha = alpha;
        vHeat = heat;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const PICKUP_FRAGMENT = `
    uniform vec3 uColor;
    uniform vec3 uHot;
    varying float vAlpha;
    varying float vHeat;
    void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float soft = pow(1.0 - d, 2.0) * vAlpha;
        vec3 color = mix(uColor, uHot, vHeat);
        gl_FragColor = vec4(color * soft * mix(0.8, 1.5, vHeat), soft * mix(0.85, 0.72, vHeat));
    }
`;

const SCAN_FRAGMENT = `
    uniform vec3 uColor;
    uniform float uScanY;
    uniform float uAlpha;
    varying float vWorldY;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        float offset = vWorldY - uScanY;
        float band = exp(-offset * offset * 90.0);
        float trail = offset < 0.0 ? 0.32 * exp(offset * 1.4) : 0.0;
        float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        float glow = band * 1.6 + trail * (0.5 + rim * 1.5);
        gl_FragColor = vec4(uColor * (1.0 + band), clamp(glow, 0.0, 1.0) * uAlpha);
    }
`;

class ItemBoxManager {
    constructor() {
        this.boxes = [];
        this.pickupRadius = 1.1;
        this.stageKey = '';
        this.collectedKeys = new Set(); // Build game: yang sudah diambil tidak muncul lagi sampai game dimulai ulang
        this.activeType = 'heal';
        this.containerGroup = new THREE.Group();
        this.containerGroup.name = 'PickupsContainer';
        this.isInitialized = false;
        this.audioCtx = null;
        this.visuals = {};
        this.restores = [];
        this.scanTwins = [];
        this.scanRoot = null;
        this.scanTime = -1;
        this.scanBase = 0;
        this.scanTop = 2;
        this.burst = null;
    }

    init() {
        if (this.isInitialized) return;
        if (typeof scene === 'undefined') return;
        this.isInitialized = true;
        scene.add(this.containerGroup);

        const glow = this.makeTexture((ctx, size) => {
            const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, size, size);
        });
        const ring = this.makeTexture((ctx, size) => {
            const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            g.addColorStop(0.55, 'rgba(255,255,255,0)');
            g.addColorStop(0.82, 'rgba(255,255,255,0.9)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, size, size);
        });
        this.groundGeo = new THREE.PlaneGeometry(1.7, 1.7);
        this.groundGeo.rotateX(-Math.PI / 2);

        const total = PICKUP_AURA_SPRITES + PICKUP_ORB_PARTICLES + PICKUP_MOTES;
        const seeds = new Float32Array(total * 4);
        const kinds = new Float32Array(total);
        for (let i = 0; i < total; i++) {
            seeds[i * 4] = Math.random() * Math.PI * 2;
            seeds[i * 4 + 1] = Math.random();
            seeds[i * 4 + 2] = 0.14 + Math.random() * 0.26;
            seeds[i * 4 + 3] = Math.random();
            kinds[i] = i < PICKUP_AURA_SPRITES ? 0 : (i < PICKUP_AURA_SPRITES + PICKUP_ORB_PARTICLES ? 1 : 2);
        }
        this.particleGeo = new THREE.BufferGeometry();
        // Posisi dihitung di shader; atribut ini hanya menentukan jumlah titik
        this.particleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
        this.particleGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
        this.particleGeo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
        this.particleTime = { value: 0 };
        this.particleScale = { value: 400 };
        Object.keys(PICKUP_TYPES).forEach((type) => {
            this.visuals[type] = new THREE.ShaderMaterial({
                vertexShader: PICKUP_VERTEX,
                fragmentShader: PICKUP_FRAGMENT,
                uniforms: {
                    uTime: this.particleTime,
                    uPixelScale: this.particleScale,
                    uHover: { value: PICKUP_HOVER },
                    uColor: { value: new THREE.Color(PICKUP_TYPES[type].color) },
                    uHot: { value: new THREE.Color(PICKUP_TYPES[type].hot) }
                },
                transparent: true,
                depthWrite: false,
                toneMapped: false,
                blending: THREE.CustomBlending,
                blendSrc: THREE.OneFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
            });
        });

        // Contoh tersembunyi: shadernya ikut dikompilasi saat loading walau stage belum punya pickup,
        // supaya pickup dari boss tidak membuat game tersendat
        const sample = this.buildVisual('heal');
        sample.group.visible = false;
        this.containerGroup.add(sample.group);

        this.buildBurst(glow, ring);
        this.boxes = [];
        this.bindUI();
    }

    makeTexture(paint) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        paint(canvas.getContext('2d'), 128);
        return new THREE.CanvasTexture(canvas);
    }

    // Partikel dan cincin dipakai ulang, jadi mengambil pickup tidak membuat objek baru di tengah permainan
    buildBurst(glow, ring) {
        const group = new THREE.Group();
        group.name = 'PickupBurst';
        group.visible = false;
        const positions = new Float32Array(BURST_PARTICLES * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const pointsMaterial = new THREE.PointsMaterial({
            map: glow, size: 0.2, transparent: true, depthWrite: false,
            toneMapped: false, fog: false, sizeAttenuation: true
        });
        const points = new THREE.Points(geometry, pointsMaterial);
        points.frustumCulled = false;
        const ringMaterial = new THREE.MeshBasicMaterial({
            map: ring, transparent: true, depthWrite: false, toneMapped: false, fog: false
        });
        const ringMesh = new THREE.Mesh(this.groundGeo, ringMaterial);
        group.add(points, ringMesh);
        scene.add(group);
        const seeds = [];
        for (let i = 0; i < BURST_PARTICLES; i++) {
            seeds.push({ angle: Math.random() * Math.PI * 2, radius: 0.25 + Math.random() * 0.4, speed: 0.9 + Math.random() * 1.5, delay: Math.random() * 0.3 });
        }
        this.burst = { group, points, positions, seeds, pointsMaterial, ringMaterial, ringMesh };
    }

    updateCountUI() {
        const count = (type) => this.boxes.filter(b => b.type === type).length;
        const heal = document.getElementById('val-pickup-heal-count');
        const stamina = document.getElementById('val-pickup-stamina-count');
        if (heal) heal.innerText = count('heal');
        if (stamina) stamina.innerText = count('stamina');
        const mana = document.getElementById('val-pickup-mana-count');
        if (mana) mana.innerText = count('mana');
    }

    setActiveType(type) {
        this.activeType = type;
        document.querySelectorAll('[data-pickup-type]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.pickupType === type);
        });
    }

    toggleSpawnerMode(force) {
        window.isItemBoxSpawnerActive = typeof force === 'boolean' ? force : !window.isItemBoxSpawnerActive;
        const btnToggle = document.getElementById('btn-toggle-itembox-spawner');
        const txtToggle = document.getElementById('txt-itembox-spawner-toggle');
        if (btnToggle) btnToggle.classList.toggle('active', window.isItemBoxSpawnerActive);
        if (txtToggle) txtToggle.innerText = window.isItemBoxSpawnerActive ? 'Mode Spawner Aktif (Klik Tanah)' : 'Aktifkan Mode Spawner (Klik Tanah)';
    }

    deleteItemBox(box) {
        const idx = this.boxes.indexOf(box);
        if (idx === -1) return;
        this.containerGroup.remove(box.group);
        this.boxes.splice(idx, 1);
        this.updateCountUI();
    }

    deleteItemBoxAtLocation(x, z, radius = 3.0) {
        const box = this.boxes.find(b => Math.hypot(b.baseX - x, b.baseZ - z) <= radius);
        if (box) this.deleteItemBox(box);
        return !!box;
    }

    bindUI() {
        const onClick = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };
        document.querySelectorAll('[data-pickup-type]').forEach((btn) => {
            btn.onclick = () => this.setActiveType(btn.dataset.pickupType);
        });
        onClick('btn-toggle-itembox-spawner', () => this.toggleSpawnerMode());
        onClick('btn-spawn-item-box-center', () => {
            const target = (typeof controls !== 'undefined' && controls.target) ? controls.target : { x: 0, z: 0 };
            this.createItemBox(target.x, target.z, null, this.activeType);
            this.updateCountUI();
        });
        onClick('btn-spawn-item-box-fox', () => {
            const pos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) ? wolfCharacter.root.position : { x: 0, z: 0 };
            this.createItemBox(pos.x, pos.z, null, this.activeType);
            this.updateCountUI();
        });
        onClick('btn-reset-item-boxes', () => this.respawnAll());
        onClick('btn-clear-item-boxes', () => {
            this.clearAll();
            this.updateCountUI();
        });
        this.setActiveType(this.activeType);
        this.updateCountUI();
    }

    createItemBox(x, z, id = null, type = this.activeType) {
        if (!this.isInitialized) this.init();
        if (!PICKUP_TYPES[type]) type = 'heal'; // Map lama belum menyimpan jenis
        if (this.boxes.some(b => Math.hypot(b.baseX - x, b.baseZ - z) < PICKUP_MIN_SPACING)) return null;

        const key = this.stageKey + ':' + type + ':' + x.toFixed(2) + ',' + z.toFixed(2);
        if (window.PANDORA_RUNTIME && this.collectedKeys.has(key)) return null;

        const box = {
            ...this.buildVisual(type),
            key, type,
            fraction: PICKUP_TYPES[type].fraction,
            isDrop: false,
            baseX: x, baseZ: z,
            isActive: true
        };
        box.id = id || box.group.name;
        const groundY = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(x, z) : 0;
        box.group.position.set(x, groundY, z);
        this.containerGroup.add(box.group);
        this.boxes.push(box);
        return box;
    }

    buildVisual(type) {
        const group = new THREE.Group();
        group.name = `Pickup_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const particles = new THREE.Points(this.particleGeo, this.visuals[type]);
        particles.frustumCulled = false;
        group.add(particles);
        return { group, particles };
    }

    // Boss menjatuhkan sekumpulan pickup kecil di sekitar tubuhnya, seperti God of War
    dropBossReward(position) {
        const place = (type, fraction) => {
            const half = (typeof groundSize !== 'undefined' ? groundSize : 80) / 2 - 1.5;
            let box = null;
            // Posisi acak bisa terlalu dekat dengan pickup lain, jadi dicoba beberapa kali
            for (let attempt = 0; attempt < 12 && !box; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = BOSS_DROP.radiusMin + Math.random() * (BOSS_DROP.radiusMax - BOSS_DROP.radiusMin);
                const x = THREE.MathUtils.clamp(position.x + Math.cos(angle) * radius, -half, half);
                const z = THREE.MathUtils.clamp(position.z + Math.sin(angle) * radius, -half, half);
                box = this.createItemBox(x, z, null, type);
            }
            if (!box) return;
            box.isDrop = true;
            box.fraction = fraction;
            box.group.scale.setScalar(0.01);
            if (typeof gsap !== 'undefined') {
                gsap.to(box.group.scale, { x: 1, y: 1, z: 1, duration: 0.45, delay: Math.random() * 0.35, ease: 'back.out(2)' });
            } else {
                box.group.scale.setScalar(1);
            }
        };
        for (let i = 0; i < BOSS_DROP.heal; i++) place('heal', BOSS_DROP.healFraction);
        for (let i = 0; i < BOSS_DROP.stamina; i++) place('stamina', BOSS_DROP.staminaFraction);
    }

    clearAll() {
        this.boxes.forEach(box => this.containerGroup.remove(box.group));
        this.boxes = [];
    }

    // Pickup dari boss tidak ikut tersimpan dan hilang saat permainan diulang (boss hidup lagi saat pemain gugur)
    clearDrops() {
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            if (this.boxes[i].isDrop) {
                this.containerGroup.remove(this.boxes[i].group);
                this.boxes.splice(i, 1);
            }
        }
    }

    stopEffects() {
        this.restores = [];
        this.scanTime = -1;
        this.setScanVisible(false);
        if (this.burst) this.burst.group.visible = false;
    }

    respawnAll() {
        this.clearDrops();
        this.boxes.forEach((box) => {
            box.isActive = true;
            box.group.visible = true;
            box.group.scale.setScalar(1);
        });
        this.stopEffects();
        this.updateCountUI();
    }

    // Tiap Play Mode dimulai atau berhenti. Di Studio semua pickup kembali agar stage bisa diuji lagi;
    // di build yang sudah diambil tetap hilang, termasuk saat pemain gugur dan hidup kembali.
    resetForPlay() {
        if (!window.PANDORA_RUNTIME) {
            this.respawnAll();
            return;
        }
        this.clearDrops();
        this.stopEffects();
    }

    playCollectSound(type) {
        try {
            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            const t = this.audioCtx.currentTime;
            PICKUP_TYPES[type].chime.forEach((freq, idx) => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                const start = t + idx * 0.07;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(start);
                osc.stop(start + 0.33);
            });
        } catch (_) { }
    }

    // ---------- Sapuan cahaya pada tubuh ----------
    getScanMaterials() {
        if (this.scanMaterials) return this.scanMaterials;
        this.scanUniforms = {
            uColor: { value: new THREE.Color(0xffffff) },
            uScanY: { value: 0 },
            uAlpha: { value: 0 }
        };
        const common = {
            uniforms: this.scanUniforms,
            fragmentShader: SCAN_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        };
        const vertex = (skinned) => `
            ${skinned ? '#include <skinning_pars_vertex>' : ''}
            varying float vWorldY;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
                vec3 transformed = vec3(position);
                vec3 objectNormal = vec3(normal);
                ${skinned ? '#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>' : ''}
                vec3 expanded = transformed + objectNormal * 0.006;
                vec4 mvPosition = modelViewMatrix * vec4(expanded, 1.0);
                vWorldY = (modelMatrix * vec4(expanded, 1.0)).y;
                vNormal = normalize(normalMatrix * objectNormal);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        this.scanMaterials = {
            skinned: new THREE.ShaderMaterial({ ...common, vertexShader: vertex(true), skinning: true }),
            rigid: new THREE.ShaderMaterial({ ...common, vertexShader: vertex(false) })
        };
        return this.scanMaterials;
    }

    // Lapisan kedua di atas tubuh karakter, mengikuti tulang yang sama. Dipanggil di balik layar pemuatan
    // agar shadernya sudah dikompilasi sebelum pickup pertama diambil.
    ensureScanTwins(character) {
        if (!character || !character.root) return;
        const meshes = [];
        character.root.traverse((child) => {
            if (child.isMesh && !child.userData.isEagleVisionTwin) meshes.push(child);
        });
        if (this.scanRoot === character.root && this.scanTwins.length === meshes.length) return;

        this.scanTwins.forEach(twin => twin.parent && twin.parent.remove(twin));
        const materials = this.getScanMaterials();
        this.scanTwins = meshes.map((mesh) => {
            let twin;
            if (mesh.isSkinnedMesh && mesh.skeleton) {
                twin = new THREE.SkinnedMesh(mesh.geometry, materials.skinned);
                twin.bind(mesh.skeleton, mesh.bindMatrix);
                twin.bindMode = mesh.bindMode;
                twin.bindMatrixInverse.copy(mesh.bindMatrixInverse);
            } else {
                twin = new THREE.Mesh(mesh.geometry, materials.rigid);
            }
            // Sistem siluet melewati penanda ini, jadi lapisan ini tidak ikut digandakan
            twin.userData.isEagleVisionTwin = true;
            twin.renderOrder = 999998;
            twin.castShadow = false;
            twin.receiveShadow = false;
            twin.frustumCulled = false;
            twin.position.copy(mesh.position);
            twin.rotation.copy(mesh.rotation);
            twin.scale.copy(mesh.scale);
            twin.visible = false;
            mesh.parent.add(twin);
            return twin;
        });
        this.scanRoot = character.root;
    }

    setScanVisible(visible) {
        this.scanTwins.forEach((twin) => { twin.visible = visible; });
    }

    startEffects(type) {
        const character = wolfCharacter;
        this.ensureScanTwins(character);
        const color = PICKUP_TYPES[type].color;
        this.scanUniforms.uColor.value.set(color);
        this.scanBase = character.root.position.y;
        this.scanTop = this.scanBase + 1.85 * (character.root.scale.y / 1.85);
        character.root.traverse((child) => {
            if (child.isBone && /head$/i.test(child.name)) {
                const head = child.getWorldPosition(new THREE.Vector3());
                this.scanTop = head.y + 0.3 * (character.root.scale.y / 1.85);
            }
        });
        // Beberapa pickup berdekatan tidak memulai ulang sapuan yang sedang berjalan
        if (this.scanTime < 0 || this.scanType !== type) {
            this.scanTime = 0;
            this.scanType = type;
        }
        this.setScanVisible(true);

        this.burst.pointsMaterial.color.set(color);
        this.burst.ringMaterial.color.set(color);
        this.burst.group.visible = true;
        this.burst.time = 0;

        const wrapper = document.querySelector(type === 'heal' ? '.hp-wrapper' : (type === 'mana' ? '#player-mana-orbs' : '#stamina-gauge'));
        if (wrapper) {
            wrapper.classList.remove('bar-restored');
            void wrapper.offsetWidth;
            wrapper.classList.add('bar-restored');
        }
    }

    updateEffects(dt) {
        if (this.scanTime >= 0) {
            this.scanTime += dt;
            const sweep = Math.min(1, this.scanTime / SCAN_SWEEP_SECONDS);
            const eased = 1 - Math.pow(1 - sweep, 2);
            this.scanUniforms.uScanY.value = this.scanBase - 0.1 + (this.scanTop - this.scanBase + 0.3) * eased;
            const fade = Math.max(0, this.scanTime - SCAN_SWEEP_SECONDS) / SCAN_FADE_SECONDS;
            this.scanUniforms.uAlpha.value = Math.max(0, 1 - fade);
            if (fade >= 1) {
                this.scanTime = -1;
                this.setScanVisible(false);
            }
        }

        const burst = this.burst;
        if (burst && burst.group.visible) {
            burst.time += dt;
            const root = wolfCharacter && wolfCharacter.root;
            if (root) burst.group.position.copy(root.position);
            burst.seeds.forEach((seed, i) => {
                const age = Math.max(0, burst.time - seed.delay);
                burst.positions[i * 3] = Math.cos(seed.angle + age * 2.2) * seed.radius;
                burst.positions[i * 3 + 1] = age * seed.speed;
                burst.positions[i * 3 + 2] = Math.sin(seed.angle + age * 2.2) * seed.radius;
            });
            burst.points.geometry.attributes.position.needsUpdate = true;
            burst.pointsMaterial.opacity = Math.max(0, 1 - burst.time / 1.1);
            burst.ringMesh.scale.setScalar(0.6 + burst.time * 3.2);
            burst.ringMaterial.opacity = Math.max(0, 1 - burst.time / 0.6);
            if (burst.time >= 1.1) burst.group.visible = false;
        }

        // HP dan stamina naik bertahap supaya bar terlihat terisi
        for (let i = this.restores.length - 1; i >= 0; i--) {
            const restore = this.restores[i];
            const step = Math.min(restore.left, restore.total * dt / PICKUP_RESTORE_SECONDS);
            restore.left -= step;
            if (restore.type === 'heal') {
                if (!PlayerHealthState.isDead) PlayerHealthState.heal(step);
            } else {
                FoxStaminaState.current = Math.min(FoxStaminaState.max, FoxStaminaState.current + step);
                FoxStaminaState.updateHUD();
            }
            if (restore.left <= 0) this.restores.splice(i, 1);
        }
    }

    needsRestore(type) {
        if (type === 'mana') return window.PandoraUltimate && PandoraUltimate.orbs < ULTIMATE_MAX_ORBS;
        const state = type === 'heal' ? PlayerHealthState : FoxStaminaState;
        return state.current < state.max;
    }

    collectBox(box) {
        box.isActive = false;
        box.group.visible = false;
        if (window.PANDORA_RUNTIME && !box.isDrop) this.collectedKeys.add(box.key);
        if (box.type === 'mana') {
            PandoraUltimate.addOrbs(1);
        } else {
            const state = box.type === 'heal' ? PlayerHealthState : FoxStaminaState;
            const amount = state.max * box.fraction;
            this.restores.push({ type: box.type, total: amount, left: amount });
        }
        this.playCollectSound(box.type);
        this.startEffects(box.type);
    }

    update(dt, elapsedTime) {
        if (!this.isInitialized) return;
        dt = Math.min(dt, 0.05);
        this.updateEffects(dt);
        this.particleTime.value = elapsedTime;
        const bufferHeight = renderer.domElement.height;
        this.particleScale.value = bufferHeight * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);

        const playing = typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root
            && typeof PlayerHealthState !== 'undefined' && !PlayerHealthState.isDead;
        const playerPos = playing ? wolfCharacter.root.position : null;

        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];
            if (!box.isActive) continue;

            // Pickup hanya terpakai jika stat memang belum penuh, jadi tidak terbuang saat lewat
            if (playerPos && Math.hypot(playerPos.x - box.baseX, playerPos.z - box.baseZ) < this.pickupRadius && this.needsRestore(box.type)) {
                this.collectBox(box);
            }
        }
    }
}

window.itemBoxManagerInstance = new ItemBoxManager();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.itemBoxManagerInstance.init();
    });
} else {
    setTimeout(() => {
        if (typeof scene !== 'undefined') {
            window.itemBoxManagerInstance.init();
        }
    }, 100);
}
