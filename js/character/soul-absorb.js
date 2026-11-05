/* =========================================================
   ROH BOSS TERSERAP KE KENDI
   Saat boss tumbang, roh berpendar naik dari tubuhnya, melayang melengkung
   menuju kendi di punggung pemain, lalu berputar masuk dan kendi menyala sesaat.
   Hero tanpa kendi menerima roh di punggungnya.
   ========================================================= */
const SOUL_DELAY = 0.9;          // Detik setelah boss tumbang, saat kamera eliminasi menyorotnya
const SOUL_RISE_TIME = 1.1;      // Roh keluar dari tubuh dan berkumpul di atasnya
const SOUL_TRAVEL_TIME = 1.4;    // Roh melayang ke kendi
const SOUL_ABSORB_TIME = 0.45;   // Roh berputar masuk ke mulut kendi
const SOUL_GLOW_TIME = 1.1;      // Kendi menyala lalu memudar
const SOUL_GATHER_HEIGHT = 2.3;
const SOUL_ARC_HEIGHT = 2.2;
const SOUL_PARTICLES = 420;
const SOUL_GLOW_COLOR = new THREE.Color(0x6ff2ff);

const PandoraSoulAbsorb = {
    active: false,
    time: 0,
    boss: null,
    points: null,
    data: null,
    head: new THREE.Vector3(),
    gather: new THREE.Vector3(),
    mouth: new THREE.Vector3(),
    glow: 0,
    glowMaterials: [],
    emitTimer: 0,

    start(agent) {
        if (!agent || !agent.root) return;
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) return;
        if (!this.points) this.create();
        this.boss = agent.root;
        this.bossScale = agent.root.scale.y || 1.85;
        this.time = -SOUL_DELAY;
        this.active = true;
        this.absorbed = false;
        this.gather.copy(agent.root.position);
        this.gather.y += SOUL_GATHER_HEIGHT * (this.bossScale / 1.85);
        this.head.copy(this.gather);
        this.data.life.fill(1);
        this.points.visible = true;
    },

    create() {
        const n = SOUL_PARTICLES;
        this.data = {
            pos: new Float32Array(n * 3),
            vel: new Float32Array(n * 3),
            life: new Float32Array(n).fill(1),   // 0 baru lahir, 1 padam
            rate: new Float32Array(n),
            size: new Float32Array(n),
            kind: new Float32Array(n),           // 0 tubuh roh, 1 jejak
            next: 0
        };
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.data.pos, 3));
        const shape = new Float32Array(n * 3);
        geometry.setAttribute('aShape', new THREE.BufferAttribute(shape, 3)); // umur, ukuran, jenis
        this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
            uniforms: { uScale: { value: renderer.domElement.height * 0.5 }, uTime: { value: 0 } },
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            vertexShader: `
                attribute vec3 aShape;
                uniform float uScale;
                varying float vLife;
                varying float vKind;
                void main() {
                    vLife = aShape.x;
                    vKind = aShape.z;
                    vec4 view = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * view;
                    gl_PointSize = aShape.x >= 1.0 ? 0.0 : aShape.y * (1.0 - aShape.x * 0.5) * uScale / -view.z;
                }`,
            fragmentShader: `
                varying float vLife;
                varying float vKind;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    if (d > 1.0 || vLife >= 1.0) discard;
                    float core = exp(-d * d * 3.0);
                    // Warna pekat supaya tetap terlihat di siang hari yang terang:
                    // inti biru-putih, tepi cyan, jejak memudar ke ungu
                    vec3 color = mix(vec3(0.75, 0.97, 1.0), vec3(0.1, 0.72, 0.95), smoothstep(0.0, 0.7, d));
                    color = mix(color, vec3(0.42, 0.3, 0.95), vKind * smoothstep(0.3, 1.0, vLife));
                    float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
                    gl_FragColor = vec4(color, core * fade * 0.85);
                }`
        }));
        this.points.frustumCulled = false;
        this.points.renderOrder = 955;
        this.points.visible = false;
        scene.add(this.points);
    },

    // Kendi: attachment yang ditandai "Kendi Roh" di 3D Attachment. Tanpa tanda, pakai attachment di
    // tulang punggung (kendi digendong di punggung), bukan sembarang attachment seperti helm atau senjata.
    findJarSocket(root) {
        const sockets = [];
        root.traverse((child) => {
            if (child.userData && child.userData.isAttachmentSocket && child.visible && child.userData.visualObject) sockets.push(child);
        });
        return sockets.find(s => s.userData.isSoulJar)
            || sockets.find(s => /spine|back|chest/i.test(s.userData.bone || (s.parent && s.parent.name) || ''))
            || null;
    },

    // Titik masuk roh: puncak kendi bila ada, selain itu punggung atas pemain
    findMouth(target) {
        const root = wolfCharacter.root;
        const socket = this.findJarSocket(root);
        if (socket) {
            const box = new THREE.Box3().setFromObject(socket.userData.visualObject);
            if (!box.isEmpty()) {
                target.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
                this.socket = socket;
                return target;
            }
        }
        this.socket = null;
        target.copy(root.position);
        target.y += 1.3 * (root.scale.y / 1.85);
        // Sedikit di belakang punggung
        target.x -= Math.sin(root.rotation.y) * 0.25;
        target.z -= Math.cos(root.rotation.y) * 0.25;
        return target;
    },

    spawn(x, y, z, vx, vy, vz, life, size, kind) {
        const d = this.data;
        const i = d.next;
        d.next = (i + 1) % SOUL_PARTICLES;
        d.pos[i * 3] = x; d.pos[i * 3 + 1] = y; d.pos[i * 3 + 2] = z;
        d.vel[i * 3] = vx; d.vel[i * 3 + 1] = vy; d.vel[i * 3 + 2] = vz;
        d.life[i] = 0;
        d.rate[i] = 1 / life;
        d.size[i] = size;
        d.kind[i] = kind;
    },

    // Kendi menyala biru pucat lalu memudar ke warna aslinya
    startGlow() {
        this.glow = 1;
        this.glowMaterials = [];
        const source = this.socket || wolfCharacter.root;
        source.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
                if (material.emissive && !this.glowMaterials.some(item => item.material === material)) {
                    this.glowMaterials.push({ material, original: material.emissive.clone() });
                }
            });
        });
    },

    updateGlow(realDelta) {
        if (this.glow <= 0) return;
        this.glow = Math.max(0, this.glow - realDelta / SOUL_GLOW_TIME);
        const k = this.glow * this.glow;
        this.glowMaterials.forEach(item => item.material.emissive.copy(item.original).lerp(SOUL_GLOW_COLOR, k * 0.85));
        if (this.glow === 0) this.glowMaterials = [];
    },

    update(realDelta) {
        this.updateGlow(realDelta);
        if (!this.points || !this.points.visible) return;
        const d = this.data;
        // Cinematic kematian boss menjeda perjalanan roh, lalu dilanjutkan
        const paused = (window.CinematicPlayer && CinematicPlayer.active) || window.PandoraGamePaused;
        if (this.active && !paused) {
            this.time += realDelta;
            this.emit(realDelta);
        }

        let alive = 0;
        for (let i = 0; i < SOUL_PARTICLES; i++) {
            if (d.life[i] >= 1) continue;
            d.life[i] = Math.min(1, d.life[i] + realDelta * d.rate[i]);
            const p = i * 3;
            if (d.kind[i] === 0 && this.active) {
                // Tubuh roh ditarik menuju kepala, sehingga roh tetap utuh saat bergerak
                const pull = this.phase === 'rise' ? 2.2 : 7.0;
                d.vel[p] += (this.head.x - d.pos[p]) * pull * realDelta;
                d.vel[p + 1] += (this.head.y - d.pos[p + 1]) * pull * realDelta;
                d.vel[p + 2] += (this.head.z - d.pos[p + 2]) * pull * realDelta;
                const drag = Math.exp(-3.5 * realDelta);
                d.vel[p] *= drag; d.vel[p + 1] *= drag; d.vel[p + 2] *= drag;
            }
            d.pos[p] += d.vel[p] * realDelta;
            d.pos[p + 1] += d.vel[p + 1] * realDelta;
            d.pos[p + 2] += d.vel[p + 2] * realDelta;
            if (d.life[i] < 1) alive++;
        }

        const shape = this.points.geometry.attributes.aShape.array;
        for (let i = 0; i < SOUL_PARTICLES; i++) {
            shape[i * 3] = d.life[i];
            shape[i * 3 + 1] = d.size[i];
            shape[i * 3 + 2] = d.kind[i];
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.aShape.needsUpdate = true;
        if (!this.active && alive === 0) this.points.visible = false;
    },

    emit(realDelta) {
        if (this.time < 0) return;
        const t = this.time;
        // Pendar besar di kepala roh agar bentuknya terbaca dari jauh
        if (t < SOUL_RISE_TIME + SOUL_TRAVEL_TIME) {
            this.spawn(this.head.x, this.head.y, this.head.z, 0, 0, 0, 0.22, 0.75 * Math.min(1, t / 0.5 + 0.2), 0);
        }
        this.emitTimer += realDelta;
        const step = 1 / 140;
        const rand = (s) => (Math.random() - 0.5) * s;

        if (t < SOUL_RISE_TIME) {
            // Roh keluar dari seluruh tubuh boss dan naik berkumpul
            this.phase = 'rise';
            const u = t / SOUL_RISE_TIME;
            this.head.copy(this.gather);
            this.head.y += Math.sin(t * 3.0) * 0.06;
            const body = this.boss ? this.boss.position : this.gather;
            const scale = this.bossScale / 1.85;
            while (this.emitTimer > step) {
                this.emitTimer -= step;
                this.spawn(body.x + rand(1.0 * scale), body.y + Math.random() * 1.6 * scale, body.z + rand(1.0 * scale),
                    rand(0.4), 0.9 + Math.random() * 0.8, rand(0.4), 1.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.2 * (1 + u), 0);
            }
            return;
        }

        const travelT = t - SOUL_RISE_TIME;
        if (travelT < SOUL_TRAVEL_TIME) {
            // Roh melayang melengkung ke kendi; mulut kendi diikuti tiap frame karena pemain bisa bergerak
            this.phase = 'travel';
            this.findMouth(this.mouth);
            const u = THREE.MathUtils.smootherstep(travelT, 0, SOUL_TRAVEL_TIME);
            const control = this.gather.clone().lerp(this.mouth, 0.5);
            control.y = Math.max(this.gather.y, this.mouth.y) + SOUL_ARC_HEIGHT;
            const a = this.gather.clone().lerp(control, u);
            const b = control.clone().lerp(this.mouth, u);
            const before = this.head.clone();
            this.head.copy(a.lerp(b, u));
            const motion = this.head.clone().sub(before);
            while (this.emitTimer > step) {
                this.emitTimer -= step;
                // Jejak tertinggal di belakang roh
                this.spawn(this.head.x + rand(0.12), this.head.y + rand(0.12), this.head.z + rand(0.12),
                    -motion.x * 8 + rand(0.3), -motion.y * 8 + rand(0.3) + 0.2, -motion.z * 8 + rand(0.3), 0.7 + Math.random() * 0.4, 0.14 + Math.random() * 0.14, 1);
                this.spawn(this.head.x + rand(0.08), this.head.y + rand(0.08), this.head.z + rand(0.08),
                    rand(0.6), rand(0.6), rand(0.6), 0.5, 0.32 + Math.random() * 0.18, 0);
            }
            return;
        }

        const absorbT = travelT - SOUL_TRAVEL_TIME;
        this.phase = 'absorb';
        this.findMouth(this.mouth);
        this.head.copy(this.mouth);
        if (!this.absorbed) {
            this.absorbed = true;
            this.startGlow();
            // Semburan kecil saat roh masuk
            for (let i = 0; i < 26; i++) {
                const angle = Math.random() * Math.PI * 2;
                this.spawn(this.mouth.x, this.mouth.y, this.mouth.z, Math.cos(angle) * 1.6, 0.6 + Math.random(), Math.sin(angle) * 1.6, 0.4 + Math.random() * 0.2, 0.06 + Math.random() * 0.05, 1);
            }
        }
        if (absorbT >= SOUL_ABSORB_TIME) this.active = false;
    },

    reset() {
        this.active = false;
        if (this.points) this.points.visible = false;
        if (this.data) this.data.life.fill(1);
        this.glow = 0;
        this.glowMaterials.forEach(item => item.material.emissive.copy(item.original));
        this.glowMaterials = [];
    }
};
window.PandoraSoulAbsorb = PandoraSoulAbsorb;
