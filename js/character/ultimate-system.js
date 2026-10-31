/* =========================================================
   ULTIMATE: energi 3 orb, menu L1, jurus Bunshin, Rage Mode, dan Ghosting
   L1 memperlambat waktu dan mendekatkan kamera, lalu pemain memilih jurus dari menu.
   Bunshin adalah salinan karakter pemain yang mengikuti dan menyerang musuh di sekitarnya.
   ========================================================= */
const ULTIMATE_MAX_ORBS = 3;
const ULTIMATE_REGEN_SECONDS = 45;  // Waktu mengisi satu orb, jauh lebih lambat dari stamina
const ULTIMATE_MENU_TIMESCALE = 0.06;
const BUNSHIN_COST = 2;
const BUNSHIN_PER_CAST = 2;
const BUNSHIN_MAX = 6;              // Melewati batas, yang tertua digantikan
const RAGE_COST = 1;
const RAGE_SECONDS = 7;
const RAGE_INTRO_TIMESCALE = 0.15;  // Sekeliling melambat selama animasi rage
const RAGE_ATTACK_SPEED = 2;
const FLAME_PER_HAND = 280;
const FLAME_MIN_SIZE = 0.09;
const FLAME_SIZE_RANGE = 0.13;
const FLAME_EMBER_CHANCE = 0.06;   // Sebagian kecil menjadi bara yang terbang lebih tinggi
const BUNSHIN_HP_FRACTION = 0.5;
const BUNSHIN_DAMAGE_SCALE = 0.8;
const BUNSHIN_LIFETIME = 45;        // Detik, supaya energi tetap punya arti
const BUNSHIN_SIDE_OFFSET = 2.2;
const BUNSHIN_ROW_OFFSET = 1.9;     // Pasangan berikutnya berbaris di belakang pasangan sebelumnya
const BUNSHIN_ENEMY_RADIUS = 9;
const BUNSHIN_ATTACK_COOLDOWN = 0.75;
const BUNSHIN_REVEAL_DELAY = 0.4;   // Tubuh muncul saat kabut sudah menutupi
const FOG_BURST_SECONDS = 2.2;
const FOG_BURST_PUFFS = 46;

const FOG_VERTEX = `
    attribute vec4 aSeed; // sudut, jarak, kecepatan naik, ukuran
    uniform float uAge;
    uniform float uPixelScale;
    varying float vAlpha;
    varying float vSpin;
    void main() {
        float t = clamp(uAge / ${FOG_BURST_SECONDS.toFixed(1)}, 0.0, 1.0);
        float grow = 1.0 - pow(1.0 - min(1.0, t * 2.2), 3.0);
        float radius = aSeed.y * (0.25 + grow * 1.55);
        float angle = aSeed.x + t * 0.9 * (aSeed.z - 0.5);
        vec3 p = vec3(cos(angle) * radius, 0.15 + aSeed.z * (0.7 + t * 2.1), sin(angle) * radius);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.w * (0.55 + t * 0.85) * uPixelScale / max(0.1, -mvPosition.z);
        vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.42, 1.0, t));
        vSpin = aSeed.x + t * 1.2;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FOG_FRAGMENT = `
    uniform sampler2D uMap;
    varying float vAlpha;
    varying float vSpin;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vSpin), k = cos(vSpin);
        vec2 uv = vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5;
        float soft = 1.0 - smoothstep(0.1, 0.5, length(c));
        float cloud = texture2D(uMap, uv).r;
        float alpha = soft * (0.35 + cloud * 0.75) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.62, 0.63, 0.66), vec3(0.96), cloud), alpha);
    }
`;

const GHOST_COST = 1;
const GHOST_SECONDS = 8;

const GHOST_FRAGMENT = `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float edge = pow(1.0 - facing, 2.6);
        float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.1 - uTime * 8.0);
        float sweep = pow(fract(gl_FragCoord.y * 0.008 - uTime * 0.6), 18.0);
        vec3 color = mix(vec3(0.25, 0.7, 1.0), vec3(0.85, 0.98, 1.0), edge);
        gl_FragColor = vec4(color, min(1.0, edge * 0.95 + 0.05 + scan * 0.05 + sweep * 0.18));
    }
`;

const GHOST_VERTEX = `
    #ifdef USE_SKINNING
        #include <skinning_pars_vertex>
    #endif
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vec3 transformed = vec3(position);
        vec3 objectNormal = vec3(normal);
        #ifdef USE_SKINNING
            #include <skinbase_vertex>
            #include <skinnormal_vertex>
            #include <skinning_vertex>
        #endif
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vNormal = normalize(normalMatrix * objectNormal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FLAME_VERTEX = `
    attribute vec3 aData; // umur 0-1, ukuran, acak (ukuran negatif = pendar)
    uniform float uPixelScale;
    varying float vLife;
    varying float vSeed;
    varying float vGlow;
    void main() {
        vLife = aData.x;
        vSeed = aData.z;
        vGlow = aData.y < 0.0 ? 1.0 : 0.0;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float grow = vGlow > 0.5 ? 1.0 : 1.0 - vLife * 0.65;
        gl_PointSize = aData.x >= 1.0 ? 0.0 : abs(aData.y) * grow * uPixelScale / max(0.1, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FLAME_FRAGMENT = `
    uniform sampler2D uMap;
    varying float vLife;
    varying float vSeed;
    varying float vGlow;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (vGlow > 0.5) {
            float glow = 1.0 - smoothstep(0.0, 0.5, length(c));
            glow *= glow;
            gl_FragColor = vec4(vec3(1.0, 0.45, 0.08) * glow * 0.55, glow * 0.18);
            return;
        }
        // Satu partikel hanya titik lembut. Bentuk lidah api muncul dari ratusan partikel yang bertumpuk.
        float soft = pow(max(0.0, 1.0 - length(c) * 2.0), 1.5);
        if (soft <= 0.003) discard;
        vec3 color = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.55, 0.08), smoothstep(0.0, 0.35, vLife));
        color = mix(color, vec3(0.75, 0.12, 0.02), smoothstep(0.35, 0.8, vLife));
        float alpha = soft * smoothstep(0.0, 0.06, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
        // Alfa rendah: tumpukan partikel makin terang seperti cahaya, tanpa memutihkan latar yang terang
        gl_FragColor = vec4(color * alpha * 0.9, alpha * 0.28);
    }
`;

const PandoraUltimate = {
    orbs: ULTIMATE_MAX_ORBS,
    regen: 0,
    menuOpen: false,
    selected: 0,
    jutsuClip: null,
    rageClip: null,
    ragePhase: null,    // null, 'intro' (animasi), atau 'active'
    rageTimer: 0,
    flames: null,
    ghostActive: false,
    ghostTimer: 0,
    ghostSwapped: [],
    ghostMaterials: null,
    ghostTime: { value: 0 },
    bunshins: [],
    bursts: [],
    pool: [],
    poolSpecies: null,
    prepared: null,
    pixelScale: { value: 400 },
    elements: null,

    options: [
        { id: 'bunshin', label: 'Bunshin', cost: BUNSHIN_COST, run() { PandoraUltimate.summonBunshin(); } },
        { id: 'rage', label: 'Rage Mode', cost: RAGE_COST, run() { PandoraUltimate.startRage(); }, blocked() { return PandoraUltimate.ragePhase ? 'Rage Mode sedang aktif' : ''; } },
        { id: 'ghost', label: 'Ghosting', cost: GHOST_COST, run() { PandoraUltimate.startGhost(); }, blocked() { return PandoraUltimate.ghostActive ? 'Ghosting sedang aktif' : ''; } }
    ],

    // ---------- Persiapan: dilakukan di balik layar pemuatan supaya L1 tidak tersendat ----------
    prepare() {
        const species = wolfCharacter && (wolfCharacter.speciesKey || wolfCharacter.charKey);
        if (this.prepared && this.poolSpecies === species) return this.prepared;
        this.poolSpecies = species;
        this.prepared = this.buildAssets(species);
        return this.prepared;
    },

    async buildAssets(species) {
        this.buildFog();
        if (!this.jutsuClip) {
            try {
                const loaded = await PandoraAssetCache.loadFBX(getGeneralHeroBasePath() + 'jutsu.fbx');
                this.jutsuClip = loaded.animations[0] || null;
            } catch (err) {
                console.warn('[Ultimate] Pose jutsu gagal dimuat:', err);
            }
        }
        if (!this.rageClip) {
            try {
                const loaded = await PandoraAssetCache.loadFBX(getGeneralHeroBasePath() + 'rage-mode.fbx');
                this.rageClip = loaded.animations[0] || null;
            } catch (err) {
                console.warn('[Ultimate] Animasi rage gagal dimuat:', err);
            }
        }
        this.buildFlames();
        this.prewarmGhost();
        this.pool.forEach(model => scene.remove(model.root));
        this.pool = [];
        for (let i = 0; i < BUNSHIN_MAX; i++) {
            const model = createWolfCharacterModel(species);
            model.isAlly = true;
            model.damageScale = BUNSHIN_DAMAGE_SCALE;
            model.root.visible = false;
            scene.add(model.root);
            this.pool.push(model);
        }
    },

    buildFog() {
        if (this.fogTexture) return;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        // Lapisan titik lembut menghasilkan bentuk gumpalan tanpa menghitung noise tiap frame
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 26;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.32)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        this.fogTexture = new THREE.CanvasTexture(canvas);
        const seeds = new Float32Array(FOG_BURST_PUFFS * 4);
        for (let i = 0; i < FOG_BURST_PUFFS; i++) {
            seeds[i * 4] = Math.random() * Math.PI * 2;
            seeds[i * 4 + 1] = Math.sqrt(Math.random());
            seeds[i * 4 + 2] = Math.random();
            seeds[i * 4 + 3] = 1.1 + Math.random() * 1.5;
        }
        this.fogGeometry = new THREE.BufferGeometry();
        this.fogGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FOG_BURST_PUFFS * 3), 3));
        this.fogGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
        // Satu kabut disiapkan sejak awal agar shadernya ikut dikompilasi saat loading
        this.createBurst().points.visible = false;
    },

    createBurst() {
        const material = new THREE.ShaderMaterial({
            vertexShader: FOG_VERTEX,
            fragmentShader: FOG_FRAGMENT,
            uniforms: { uAge: { value: 0 }, uPixelScale: this.pixelScale, uMap: { value: this.fogTexture } },
            transparent: true,
            depthWrite: false,
            toneMapped: false
        });
        const points = new THREE.Points(this.fogGeometry, material);
        points.frustumCulled = false;
        points.renderOrder = 5;
        scene.add(points);
        const burst = { points, material, age: 0 };
        this.bursts.push(burst);
        return burst;
    },

    // ---------- Api di kedua tangan ----------
    // Partikel hidup di koordinat dunia, jadi api tertinggal di belakang tangan saat berlari
    buildFlames() {
        if (this.flames) return;
        const count = (FLAME_PER_HAND + 1) * 2;
        const positions = new Float32Array(count * 3);
        const data = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const lifetimes = new Float32Array(count);
        for (let i = 0; i < count; i++) data[i * 3] = 1;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aData', new THREE.BufferAttribute(data, 3));
        const material = new THREE.ShaderMaterial({
            vertexShader: FLAME_VERTEX,
            fragmentShader: FLAME_FRAGMENT,
            uniforms: { uPixelScale: this.pixelScale, uMap: { value: this.fogTexture } },
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = 6;
        points.visible = false;
        scene.add(points);
        this.flames = {
            points, positions, data, velocities, lifetimes, count, emitting: false, time: 0,
            hands: [{ bone: null, current: new THREE.Vector3(), last: new THREE.Vector3() }, { bone: null, current: new THREE.Vector3(), last: new THREE.Vector3() }]
        };
    },

    startFlames() {
        const flames = this.flames;
        if (!flames) return;
        const resolver = window.PandoraHitboxSystem;
        ['RightHand', 'LeftHand'].forEach((name, i) => {
            const hand = flames.hands[i];
            hand.bone = resolver && resolver.resolveBone ? resolver.resolveBone(wolfCharacter, name) : null;
            if (hand.bone) {
                hand.bone.getWorldPosition(hand.current);
                hand.last.copy(hand.current);
            }
        });
        for (let i = 0; i < flames.count; i++) {
            const hand = flames.hands[i % 2];
            flames.positions.set([hand.current.x, hand.current.y, hand.current.z], i * 3);
            flames.lifetimes[i] = 0.25 + Math.random() * 0.35;
            flames.data[i * 3] = Math.random();
            flames.data[i * 3 + 1] = FLAME_MIN_SIZE + Math.random() * FLAME_SIZE_RANGE;
            flames.data[i * 3 + 2] = Math.random();
        }
        flames.emitting = true;
        flames.points.visible = true;
    },

    updateFlames(realDelta) {
        const flames = this.flames;
        if (!flames || !flames.points.visible) return;
        flames.time += realDelta;
        flames.hands.forEach((hand) => {
            if (!hand.bone) return;
            hand.last.copy(hand.current);
            hand.bone.getWorldPosition(hand.current);
        });
        const { positions, data, velocities, lifetimes, count } = flames;
        const glowStart = count - 2;
        let alive = false;
        for (let i = 0; i < count; i++) {
            const hand = flames.hands[i % 2];
            const p = i * 3;
            // Dua partikel terakhir adalah pendar lembut yang menempel di tangan
            if (i >= glowStart) {
                positions[p] = hand.current.x;
                positions[p + 1] = hand.current.y;
                positions[p + 2] = hand.current.z;
                data[p] = flames.emitting && hand.bone ? 0.5 : 1;
                data[p + 1] = -1.25 - Math.sin(flames.time * 17 + i) * 0.12;
                continue;
            }
            data[p] += realDelta / lifetimes[i];
            if (data[p] >= 1) {
                if (!flames.emitting || !hand.bone) {
                    data[p] = 1;
                    continue;
                }
                // Lahir di sepanjang lintasan tangan frame ini agar tidak terputus saat bergerak cepat
                const along = Math.random();
                const offsetX = (Math.random() + Math.random() - 1) * 0.09;
                const offsetY = (Math.random() + Math.random() - 1) * 0.07;
                const offsetZ = (Math.random() + Math.random() - 1) * 0.09;
                const ember = Math.random() < FLAME_EMBER_CHANCE;
                positions[p] = hand.last.x + (hand.current.x - hand.last.x) * along + offsetX;
                positions[p + 1] = hand.last.y + (hand.current.y - hand.last.y) * along + offsetY;
                positions[p + 2] = hand.last.z + (hand.current.z - hand.last.z) * along + offsetZ;
                // Bergerak menuju sumbu saat naik, sehingga api meruncing ke atas
                velocities[p] = -offsetX * 2.2 + (ember ? (Math.random() - 0.5) * 0.7 : 0);
                velocities[p + 1] = 0.5 + Math.random() * 0.6;
                velocities[p + 2] = -offsetZ * 2.2 + (ember ? (Math.random() - 0.5) * 0.7 : 0);
                lifetimes[i] = ember ? 0.7 + Math.random() * 0.5 : 0.25 + Math.random() * 0.35;
                data[p] = 0;
                data[p + 1] = ember ? 0.035 : FLAME_MIN_SIZE + Math.random() * FLAME_SIZE_RANGE;
                data[p + 2] = Math.random();
            }
            alive = true;
            const sway = Math.sin(flames.time * 11 + data[p + 2] * 40) * (0.15 + data[p] * 0.5);
            velocities[p + 1] += 2.4 * realDelta;
            positions[p] += (velocities[p] + sway) * realDelta;
            positions[p + 1] += velocities[p + 1] * realDelta;
            positions[p + 2] += (velocities[p + 2] - sway) * realDelta;
        }
        flames.points.geometry.attributes.position.needsUpdate = true;
        flames.points.geometry.attributes.aData.needsUpdate = true;
        if (!alive && !flames.emitting) flames.points.visible = false;
    },

    // ---------- Ghosting ----------
    getGhostMaterial(skinned) {
        if (!this.ghostMaterials) {
            const make = (skinning) => new THREE.ShaderMaterial({
                vertexShader: GHOST_VERTEX,
                fragmentShader: GHOST_FRAGMENT,
                uniforms: { uTime: this.ghostTime },
                transparent: true,
                skinning
            });
            this.ghostMaterials = { skinned: make(true), rigid: make(false) };
        }
        return skinned ? this.ghostMaterials.skinned : this.ghostMaterials.rigid;
    },

    // Mesh sementara agar shader ghost ikut dikompilasi saat loading
    prewarmGhost() {
        if (!wolfCharacter || !wolfCharacter.root || wolfCharacter.root.userData.ghostPrewarmed) return;
        const skinned = [];
        wolfCharacter.root.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) skinned.push(child);
        });
        if (skinned.length === 0) return;
        wolfCharacter.root.userData.ghostPrewarmed = true;
        const source = skinned[0];
        const twin = new THREE.SkinnedMesh(source.geometry, this.getGhostMaterial(true));
        twin.bind(source.skeleton, source.bindMatrix);
        twin.frustumCulled = false;
        source.parent.add(twin);
        renderer.compile(scene, camera);
        // Tidak boleh ditinggal di karakter: Play Demo memunculkan kembali semua anak karakter
        source.parent.remove(twin);
    },

    startGhost() {
        if (!wolfCharacter || !wolfCharacter.root || PlayerHealthState.isDead) return;
        this.ghostActive = true;
        this.ghostTimer = GHOST_SECONDS;
        this.spawnFog(wolfCharacter.root.position);
        wolfCharacter.root.traverse((child) => {
            if (!child.isMesh || child.userData.isEagleVisionTwin) return;
            this.ghostSwapped.push({ mesh: child, material: child.material, castShadow: child.castShadow });
            child.material = this.getGhostMaterial(!!child.isSkinnedMesh);
            child.castShadow = false;
        });
        document.body.classList.add('ghost-mode');
    },

    endGhost() {
        if (!this.ghostActive) return;
        this.ghostActive = false;
        this.ghostSwapped.forEach((item) => {
            item.mesh.material = item.material;
            item.mesh.castShadow = item.castShadow;
        });
        this.ghostSwapped = [];
        document.body.classList.remove('ghost-mode');
    },

    updateGhost(dt, realDelta) {
        if (!this.ghostActive) return;
        this.ghostTime.value += realDelta;
        this.ghostTimer -= dt;
        // Menyerang membongkar penyamaran
        if (this.ghostTimer <= 0 || PlayerHealthState.isDead || wolfCharacter.isPunching || wolfCharacter.isKicking) {
            this.endGhost();
        }
    },

    // ---------- Rage Mode ----------
    startRage() {
        if (!wolfCharacter || PlayerHealthState.isDead) return;
        this.ragePhase = 'intro';
        this.rageTimer = 0;
        wolfCharacter.rageActive = true;
        FoxStaminaState.unlimited = true;
        document.body.classList.add('rage-mode');
        this.startFlames();
        if (this.rageClip && wolfCharacter.mixer) {
            window.PandoraUltimateCasting = true;
            if (wolfCharacter.castAction) wolfCharacter.castAction.stop();
            const target = wolfCharacter.modelMesh || wolfCharacter.meshContainer || wolfCharacter.root;
            const clip = sanitizeAnimationClipForModel(this.rageClip, target);
            const action = wolfCharacter.mixer.clipAction(clip);
            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.timeScale = 1 / RAGE_INTRO_TIMESCALE;
            action.play();
            wolfCharacter.castAction = action;
            wolfCharacter.castTarget = 1;
            this.rageTimer = clip.duration;
            window.PandoraTimeScale = RAGE_INTRO_TIMESCALE;
        }
    },

    beginRagePower() {
        this.ragePhase = 'active';
        this.rageTimer = RAGE_SECONDS;
        window.PandoraUltimateCasting = this.menuOpen;
        wolfCharacter.castTarget = 0;
        wolfCharacter.attackSpeedBoost = RAGE_ATTACK_SPEED;
        window.PandoraTimeScale = 1;
    },

    endRage() {
        if (!this.ragePhase) return;
        if (this.ragePhase === 'intro') {
            window.PandoraUltimateCasting = false;
            window.PandoraTimeScale = 1;
            if (wolfCharacter) wolfCharacter.castTarget = 0;
        }
        this.ragePhase = null;
        if (wolfCharacter) {
            wolfCharacter.rageActive = false;
            wolfCharacter.attackSpeedBoost = 1;
        }
        FoxStaminaState.unlimited = false;
        document.body.classList.remove('rage-mode');
        if (this.flames) this.flames.emitting = false;
    },

    updateRage(dt, realDelta) {
        if (!this.ragePhase) return;
        if (PlayerHealthState.isDead) {
            this.endRage();
            return;
        }
        this.rageTimer -= this.ragePhase === 'intro' ? realDelta : dt;
        if (this.rageTimer > 0) return;
        if (this.ragePhase === 'intro') this.beginRagePower();
        else this.endRage();
    },

    spawnFog(position) {
        const burst = this.bursts.find(item => !item.points.visible) || this.createBurst();
        burst.age = 0;
        burst.material.uniforms.uAge.value = 0;
        burst.points.position.copy(position);
        burst.points.visible = true;
    },

    // ---------- Energi ----------
    addOrbs(amount) {
        this.orbs = Math.min(ULTIMATE_MAX_ORBS, this.orbs + amount);
        if (this.orbs >= ULTIMATE_MAX_ORBS) this.regen = 0;
        this.renderOrbs();
    },

    renderOrbs() {
        if (!this.elements) return;
        this.elements.orbs.forEach((orb, i) => {
            const fill = i < this.orbs ? 1 : (i === this.orbs ? this.regen : 0);
            orb.style.transform = `scale(${fill.toFixed(3)})`;
            orb.parentElement.classList.toggle('full', i < this.orbs);
        });
    },

    // ---------- Antarmuka ----------
    buildUI() {
        if (this.elements) return;
        const orbRow = document.createElement('div');
        orbRow.id = 'player-mana-orbs';
        const orbs = [];
        for (let i = 0; i < ULTIMATE_MAX_ORBS; i++) {
            const slot = document.createElement('span');
            const fill = document.createElement('i');
            slot.appendChild(fill);
            orbRow.appendChild(slot);
            orbs.push(fill);
        }
        const column = document.querySelector('#player-combat-hud .player-bars-column');
        if (column) column.insertBefore(orbRow, column.firstChild);

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'btn-ultimate';
        button.textContent = 'L1';
        const press = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleMenu();
        };
        button.addEventListener('touchstart', press, { passive: false });
        button.addEventListener('click', press);
        document.body.appendChild(button);

        const menu = document.createElement('div');
        menu.id = 'ultimate-menu';
        menu.innerHTML = '<div class="ultimate-list"></div><div class="ultimate-hint"></div>';
        menu.addEventListener('click', (event) => {
            if (event.target === menu) this.closeMenu(false);
        });
        document.body.appendChild(menu);

        const rageOverlay = document.createElement('div');
        rageOverlay.id = 'rage-overlay';
        document.body.appendChild(rageOverlay);

        const ghostOverlay = document.createElement('div');
        ghostOverlay.id = 'ghost-overlay';
        document.body.appendChild(ghostOverlay);

        this.elements = { orbs, button, menu, list: menu.querySelector('.ultimate-list'), hint: menu.querySelector('.ultimate-hint') };
        this.renderOrbs();
    },

    renderMenu() {
        const { list, hint } = this.elements;
        list.innerHTML = '';
        this.options.forEach((option, i) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'ultimate-option' + (i === this.selected ? ' selected' : '') + (this.unavailableReason(option) ? ' disabled' : '');
            const name = document.createElement('span');
            name.textContent = option.label;
            const cost = document.createElement('em');
            for (let c = 0; c < option.cost; c++) cost.appendChild(document.createElement('i'));
            row.append(name, cost);
            row.addEventListener('click', () => {
                this.selected = i;
                this.closeMenu(true);
                if (this.menuOpen) this.renderMenu();
            });
            list.appendChild(row);
        });
        // Energi kurang cukup terlihat dari pilihan yang redup, tanpa teks
        const option = this.options[this.selected];
        hint.textContent = this.orbs < option.cost ? '' : this.unavailableReason(option);
    },

    unavailableReason(option) {
        if (this.orbs < option.cost) return 'Energi tidak cukup';
        return option.blocked ? option.blocked() : '';
    },

    moveSelection(step) {
        this.selected = (this.selected + step + this.options.length) % this.options.length;
        this.renderMenu();
    },

    toggleMenu() {
        if (this.menuOpen) this.closeMenu(false);
        else this.openMenu();
    },

    async openMenu() {
        if (typeof isPlayMode === 'undefined' || !isPlayMode || !wolfCharacter || PlayerHealthState.isDead) return;
        if (window.PandoraGamePaused || (window.PandoraStageFlow && PandoraStageFlow.isTransitioning)) return;
        if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return;
        if (this.ragePhase === 'intro') return;
        this.menuOpen = true;
        window.PandoraUltimateCasting = true;
        window.PandoraTimeScale = ULTIMATE_MENU_TIMESCALE;
        this.buildUI();
        this.renderMenu();
        this.elements.menu.classList.add('open');
        BossKillCam.startHold(wolfCharacter);
        this.startPose();
        await this.prepare();
    },

    closeMenu(confirmed) {
        if (!this.menuOpen) return;
        const option = this.options[this.selected];
        if (confirmed && this.unavailableReason(option)) return;
        this.menuOpen = false;
        window.PandoraUltimateCasting = false;
        window.PandoraTimeScale = 1;
        if (this.elements) this.elements.menu.classList.remove('open');
        BossKillCam.release();
        this.endPose();
        if (confirmed) {
            this.orbs -= option.cost;
            this.renderOrbs();
            option.run();
        }
    },

    // Pose jutsu berjalan dengan kecepatan normal walau seluruh dunia sedang melambat
    startPose() {
        if (!this.jutsuClip || !wolfCharacter.mixer) return;
        const target = wolfCharacter.modelMesh || wolfCharacter.meshContainer || wolfCharacter.root;
        const action = wolfCharacter.mixer.clipAction(sanitizeAnimationClipForModel(this.jutsuClip, target));
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = 1 / ULTIMATE_MENU_TIMESCALE;
        action.play();
        wolfCharacter.castAction = action;
        wolfCharacter.castTarget = 1;
    },

    endPose() {
        if (wolfCharacter) wolfCharacter.castTarget = 0;
    },

    // ---------- Bunshin ----------
    async summonBunshin() {
        await this.prepare();
        if (PlayerHealthState.isDead || !isPlayMode) return;
        const root = wolfCharacter.root;
        for (let i = 0; i < BUNSHIN_PER_CAST; i++) {
            if (this.bunshins.length >= BUNSHIN_MAX) this.dismiss(this.bunshins[0]);
            const model = this.pool.find(item => !item.inUse);
            if (!model) return;
            model.inUse = true;
            const slot = this.freeSlot();
            const { x, z } = this.slotPosition(slot);
            model.root.position.set(x, getTerrainHeightFast(x, z), z);
            model.root.rotation.y = root.rotation.y;
            model.root.scale.copy(root.scale);
            this.spawnFog(model.root.position);
            this.bunshins.push({
                model, root: model.root, slot,
                hp: PlayerHealthState.max * BUNSHIN_HP_FRACTION,
                maxHp: PlayerHealthState.max * BUNSHIN_HP_FRACTION,
                reveal: BUNSHIN_REVEAL_DELAY,
                life: BUNSHIN_LIFETIME,
                speed: 0,
                cooldown: 0.3 + i * 0.25,
                alive: true
            });
        }
    },

    freeSlot() {
        let slot = 0;
        while (this.bunshins.some(ally => ally.slot === slot)) slot++;
        return slot;
    },

    // Slot genap dan ganjil berada di kedua sisi pemain, tiap pasangan satu baris lebih ke belakang
    slotPosition(slot) {
        const player = wolfCharacter.root;
        const yaw = player.rotation.y;
        const side = slot % 2 === 0 ? 1 : -1;
        const row = slot >> 1;
        return {
            x: player.position.x + Math.cos(yaw) * BUNSHIN_SIDE_OFFSET * side - Math.sin(yaw) * BUNSHIN_ROW_OFFSET * row,
            z: player.position.z - Math.sin(yaw) * BUNSHIN_SIDE_OFFSET * side - Math.cos(yaw) * BUNSHIN_ROW_OFFSET * row
        };
    },

    release(ally) {
        ally.alive = false;
        ally.root.visible = false;
        ally.model.inUse = false;
        ally.model.isPunching = false;
        ally.model.isKicking = false;
    },

    dismiss(ally) {
        this.spawnFog(ally.root.position);
        this.release(ally);
        const i = this.bunshins.indexOf(ally);
        if (i !== -1) this.bunshins.splice(i, 1);
    },

    // Musuh menyerang bunshin jika bunshin lebih dekat daripada pemain
    pickEnemyTarget(agent) {
        const position = agent.root.position;
        let best = null;
        let bestDist = !this.ghostActive && wolfCharacter && wolfCharacter.root ? position.distanceTo(wolfCharacter.root.position) : Infinity;
        for (let i = 0; i < this.bunshins.length; i++) {
            const ally = this.bunshins[i];
            if (!ally.alive || ally.reveal > 0) continue;
            const dist = position.distanceTo(ally.root.position);
            if (dist < bestDist) {
                best = ally;
                bestDist = dist;
            }
        }
        return best;
    },

    enemyStrike(enemy) {
        if (enemy.strikeProcessed || enemy.punchTimer < 0.26) return;
        const ally = enemy.allyTarget;
        if (!ally || !ally.alive) return;
        const scale = Math.max(1, enemy.root.scale.x / 1.85);
        if (enemy.root.position.distanceTo(ally.root.position) > 2.0 * scale) return;
        enemy.strikeProcessed = true;
        const config = window.ENEMY_COMBAT_CONFIG;
        const fallback = config ? (enemy.isBoss ? config.boss.damagePerHit : config.nonBoss.damagePerHit) : 15;
        const damage = typeof enemy.damagePerHit === 'number' ? enemy.damagePerHit : fallback;
        ally.hp -= damage;
        if (typeof CombatHUD !== 'undefined' && CombatHUD.spawnFloatingDamage) {
            CombatHUD.spawnFloatingDamage(new THREE.Vector3(ally.root.position.x, ally.root.position.y + 1.3, ally.root.position.z), damage, false);
        }
        if (ally.hp <= 0) this.dismiss(ally);
        else this.withoutPlayerStamina(() => ally.model.takeHit(enemy.root.position));
    },

    // Metode karakter memakai stamina pemain; bunshin tidak boleh menghabiskannya
    withoutPlayerStamina(fn) {
        FoxStaminaState.ignoreDrain = true;
        try {
            fn();
        } finally {
            FoxStaminaState.ignoreDrain = false;
        }
    },

    nearestEnemy(position) {
        let best = null;
        let bestDist = BUNSHIN_ENEMY_RADIUS;
        spawnedFoxesList.forEach((fox) => {
            if (!fox.root || !fox.root.visible || (fox.ai && fox.ai.isDead)) return;
            const dist = position.distanceTo(fox.root.position);
            if (dist < bestDist) {
                best = fox;
                bestDist = dist;
            }
        });
        return best ? { fox: best, dist: bestDist } : null;
    },

    updateBunshin(ally, dt) {
        if (ally.reveal > 0) {
            ally.reveal -= dt;
            if (ally.reveal <= 0) ally.root.visible = true;
            return;
        }
        ally.life -= dt;
        if (ally.life <= 0) {
            this.dismiss(ally);
            return;
        }
        ally.cooldown -= dt;

        const pos = ally.root.position;
        const player = wolfCharacter.root;
        const enemy = this.nearestEnemy(pos);
        const scale = enemy ? Math.max(1, enemy.fox.root.scale.x / 1.85) : 1;
        const attackRange = 1.45 * scale;
        let targetX, targetZ, stopDist;
        if (enemy) {
            targetX = enemy.fox.root.position.x;
            targetZ = enemy.fox.root.position.z;
            stopDist = attackRange * 0.8;
        } else {
            const slot = this.slotPosition(ally.slot);
            targetX = slot.x;
            targetZ = slot.z;
            stopDist = 0.35;
        }
        const dx = targetX - pos.x, dz = targetZ - pos.z;
        const dist = Math.hypot(dx, dz);

        // Terlalu jauh tertinggal, misalnya pemain berlari jauh: muncul kembali di sisi pemain
        if (!enemy && dist > 26) {
            pos.set(targetX, getTerrainHeightFast(targetX, targetZ), targetZ);
            this.spawnFog(pos);
            return;
        }

        const model = ally.model;
        const busy = model.isPunching || model.isKicking || model.isTakingHit;
        let wanted = 0;
        if (!busy && dist > stopDist) {
            const playerRunning = Math.abs(window.currentFoxSpeed || 0) > 3;
            wanted = (dist > 3.5 || playerRunning) ? 6.0 : 1.65;
        }
        ally.speed = THREE.MathUtils.lerp(ally.speed, wanted, Math.min(1, 7 * dt));
        if (dist > 0.05 && !model.isTakingHit) {
            const facing = enemy || dist > stopDist ? Math.atan2(dx, dz) : player.rotation.y;
            let turn = (facing - ally.root.rotation.y) % (Math.PI * 2);
            if (turn > Math.PI) turn -= Math.PI * 2;
            if (turn < -Math.PI) turn += Math.PI * 2;
            ally.root.rotation.y += turn * Math.min(1, 9 * dt);
        }
        if (ally.speed > 0.02 && dist > 0.01) {
            const step = Math.min(dist, ally.speed * dt);
            pos.x += dx / dist * step;
            pos.z += dz / dist * step;
        }
        pos.y = getTerrainHeightFast(pos.x, pos.z);

        this.withoutPlayerStamina(() => {
            if (enemy && dist <= attackRange && !busy && ally.cooldown <= 0) {
                ally.cooldown = BUNSHIN_ATTACK_COOLDOWN;
                if (model.triggerKick && Math.random() < 0.35) model.triggerKick();
                else if (model.triggerPunch) model.triggerPunch();
            }
            model.updateAnimation(dt, ally.speed, ally.speed > 3, true, 0);
        });
    },

    // ---------- Tiap frame ----------
    update(dt, realDelta) {
        this.pixelScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        for (let i = 0; i < this.bursts.length; i++) {
            const burst = this.bursts[i];
            if (!burst.points.visible) continue;
            burst.age += realDelta;
            burst.material.uniforms.uAge.value = burst.age;
            if (burst.age >= FOG_BURST_SECONDS) burst.points.visible = false;
        }
        if (typeof isPlayMode === 'undefined' || !isPlayMode || !wolfCharacter || !wolfCharacter.root) return;

        this.buildUI();
        if (this.menuOpen) {
            if (PlayerHealthState.isDead || !BossKillCam.active) this.closeMenu(false);
            else window.PandoraTimeScale = ULTIMATE_MENU_TIMESCALE;
        }
        this.updateRage(dt, realDelta);
        this.updateGhost(dt, realDelta);
        if (this.orbs < ULTIMATE_MAX_ORBS && !this.menuOpen) {
            this.regen += dt / ULTIMATE_REGEN_SECONDS;
            if (this.regen >= 1) {
                this.regen = 0;
                this.orbs++;
            }
            this.renderOrbs();
        }
        // Pemain tewas: bunshin ikut lenyap dalam kabut
        if (PlayerHealthState.isDead) {
            this.bunshins.slice().forEach(ally => this.dismiss(ally));
            return;
        }
        for (let i = this.bunshins.length - 1; i >= 0; i--) {
            this.updateBunshin(this.bunshins[i], dt);
        }
    },

    // Play Mode dimulai atau berhenti: bunshin hilang; energi hanya penuh lagi saat uji ulang di Studio
    resetForPlay() {
        if (this.menuOpen) this.closeMenu(false);
        this.endRage();
        this.endGhost();
        this.bunshins.forEach(ally => this.release(ally));
        this.bunshins = [];
        if (!window.PANDORA_RUNTIME) {
            this.orbs = ULTIMATE_MAX_ORBS;
            this.regen = 0;
            this.renderOrbs();
        }
    }
};
window.PandoraUltimate = PandoraUltimate;

window.addEventListener('keydown', (event) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode || event.repeat) return;
    if (event.code === 'KeyE') {
        PandoraUltimate.toggleMenu();
    } else if (PandoraUltimate.menuOpen && event.code === 'Enter') {
        PandoraUltimate.closeMenu(true);
        if (PandoraUltimate.menuOpen) PandoraUltimate.renderMenu();
    } else if (PandoraUltimate.menuOpen && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) {
        event.preventDefault();
        PandoraUltimate.moveSelection(event.code === 'ArrowUp' ? -1 : 1);
    } else if (PandoraUltimate.menuOpen && event.code === 'Escape') {
        event.stopImmediatePropagation();
        PandoraUltimate.closeMenu(false);
    }
}, true);
