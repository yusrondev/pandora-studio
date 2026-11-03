/* =========================================================
   UMPAN BALIK SAAT PEMAIN TERKENA PUKULAN
   Hit-stop singkat, kamera bergetar, tubuh berkedip merah, percikan benturan,
   penunjuk arah datangnya serangan, kilatan layar, dan bar HP yang bergetar.
   Kekuatan semuanya mengikuti besar damage.
   ========================================================= */
const HIT_REFERENCE_DAMAGE = 25;      // Damage yang dianggap pukulan "penuh"
const HIT_STOP_MS = 75;               // Lama hit-stop pada pukulan penuh
const HIT_STOP_SCALE = 0.04;
const HIT_SHAKE_TIME = 0.38;
const HIT_SHAKE_DISTANCE = 0.11;
const HIT_SHAKE_ROLL = 0.035;
const HIT_FLASH_TIME = 0.22;
const HIT_SPARKS_PER_HIT = 36;
const HIT_SPARK_POOL = 216;
const HIT_SPARK_LIFE = 0.45;

const PandoraHitFeedback = {
    shake: 0,
    shakeTime: 0,
    flash: 0,
    flashed: [],
    sparks: null,
    sparkNext: 0,
    time: 0,
    stopTimer: null,
    arrowEl: null,
    vignetteTimer: null,

    trigger(amount, attackerPos) {
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) return;
        const strength = THREE.MathUtils.clamp((Number(amount) || 10) / HIT_REFERENCE_DAMAGE, 0.4, 1.5);

        this.hitStop(strength);
        this.shake = Math.max(this.shake, strength);
        this.shakeTime = 0;
        this.flash = 1;
        this.collectFlashMaterials();

        const root = wolfCharacter.root;
        const chest = root.position.clone();
        chest.y += 1.0 * (root.scale.y / 1.85 || 1);
        const from = attackerPos ? new THREE.Vector3(attackerPos.x - root.position.x, 0, attackerPos.z - root.position.z) : null;
        if (from && from.lengthSq() > 0.0001) from.normalize();
        this.burst(chest, from, strength);
        this.showDirection(from);
        this.flashScreen(strength);
        this.shakeHud();
        if (navigator.vibrate) navigator.vibrate(Math.round(30 + 40 * Math.min(1, strength)));
    },

    // Waktu permainan hampir berhenti sesaat; hanya kalau tidak sedang slow motion lain (misalnya boss mati)
    hitStop(strength) {
        if (window.PandoraTimeScale && window.PandoraTimeScale !== 1 && window.PandoraTimeScale !== HIT_STOP_SCALE) return;
        window.PandoraTimeScale = HIT_STOP_SCALE;
        clearTimeout(this.stopTimer);
        this.stopTimer = setTimeout(() => {
            if (window.PandoraTimeScale === HIT_STOP_SCALE) window.PandoraTimeScale = 1;
        }, HIT_STOP_MS * Math.min(1.3, strength));
    },

    // Material tubuh pemain yang punya emissive, beserta warna aslinya
    collectFlashMaterials() {
        this.restoreFlash();
        const list = [];
        wolfCharacter.root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => {
                if (material.emissive && !list.some(item => item.material === material)) {
                    list.push({ material, original: material.emissive.clone() });
                }
            });
        });
        this.flashed = list;
    },

    restoreFlash() {
        this.flashed.forEach(item => item.material.emissive.copy(item.original));
        this.flashed = [];
    },

    showDirection(from) {
        if (!this.arrowEl) {
            this.arrowEl = document.createElement('div');
            this.arrowEl.id = 'hit-direction';
            document.body.appendChild(this.arrowEl);
        }
        if (!from) return;
        // Sudut arah serangan relatif terhadap arah pandang kamera; 0 = dari depan layar
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const angle = Math.atan2(from.dot(right), from.dot(forward));
        this.arrowEl.style.setProperty('--hit-angle', angle + 'rad');
        this.arrowEl.classList.remove('show');
        void this.arrowEl.offsetWidth;
        this.arrowEl.classList.add('show');
    },

    flashScreen(strength) {
        const vignette = document.getElementById('player-damage-vignette');
        if (!vignette) return;
        // Elemen ini ada di dalam HUD senjata plasma yang tersembunyi bila senjata tidak dipakai
        if (vignette.parentElement !== document.body) document.body.appendChild(vignette);
        vignette.style.setProperty('--hit-strength', Math.min(1, 0.6 + strength * 0.35).toFixed(2));
        vignette.classList.remove('hit-pulse');
        void vignette.offsetWidth;
        vignette.classList.add('hit-pulse');
    },

    shakeHud() {
        const hud = document.getElementById('player-combat-hud');
        if (!hud) return;
        hud.classList.remove('hit-shake');
        void hud.offsetWidth;
        hud.classList.add('hit-shake');
    },

    // ---------- Percikan benturan ----------
    createSparks() {
        const geometry = new THREE.BufferGeometry();
        const attribute = (name, size) => {
            const values = new THREE.BufferAttribute(new Float32Array(HIT_SPARK_POOL * size), size);
            values.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute(name, values);
        };
        attribute('position', 3);
        attribute('aVelocity', 3);
        attribute('aStart', 2);   // waktu lahir, ukuran
        geometry.attributes.aStart.array.fill(-999);
        this.sparks = new THREE.Points(geometry, new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uScale: { value: renderer.domElement.height * 0.5 } },
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            vertexShader: `
                attribute vec3 aVelocity;
                attribute vec2 aStart;
                uniform float uTime;
                uniform float uScale;
                varying float vLife;
                void main() {
                    float t = uTime - aStart.x;
                    vLife = t / ${HIT_SPARK_LIFE.toFixed(2)};
                    vec3 p = position + aVelocity * t * (1.0 - t * 0.9);
                    p.y -= 2.5 * t * t;
                    vec4 view = viewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * view;
                    gl_PointSize = (vLife >= 0.0 && vLife < 1.0) ? aStart.y * (1.0 - vLife * 0.6) * uScale / -view.z : 0.0;
                }`,
            fragmentShader: `
                varying float vLife;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    if (d > 1.0 || vLife < 0.0 || vLife >= 1.0) discard;
                    vec3 color = mix(vec3(1.0, 0.95, 0.8), vec3(0.95, 0.12, 0.05), smoothstep(0.0, 0.6, vLife));
                    gl_FragColor = vec4(color, (1.0 - d * d) * (1.0 - vLife));
                }`
        }));
        this.sparks.frustumCulled = false;
        this.sparks.renderOrder = 960;
        scene.add(this.sparks);
    },

    burst(origin, from, strength) {
        if (!this.sparks) this.createSparks();
        const attrs = this.sparks.geometry.attributes;
        // Percikan terlempar menjauhi penyerang; tanpa arah, menyebar ke segala sisi
        const away = from ? from.clone().negate() : null;
        const count = Math.round(HIT_SPARKS_PER_HIT * Math.min(1.2, strength));
        for (let n = 0; n < count; n++) {
            const i = this.sparkNext;
            this.sparkNext = (i + 1) % HIT_SPARK_POOL;
            const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize();
            if (away) dir.addScaledVector(away, 1.4).normalize();
            const speed = 2.2 + Math.random() * 3.5 * strength;
            attrs.position.setXYZ(i, origin.x + (Math.random() - 0.5) * 0.2, origin.y + (Math.random() - 0.5) * 0.3, origin.z + (Math.random() - 0.5) * 0.2);
            attrs.aVelocity.setXYZ(i, dir.x * speed, dir.y * speed, dir.z * speed);
            attrs.aStart.setXY(i, this.time, 0.05 + Math.random() * 0.06);
        }
        Object.keys(attrs).forEach((name) => { attrs[name].needsUpdate = true; });
    },

    // Dipanggil tiap frame dengan waktu nyata, supaya efek tetap berjalan selama hit-stop
    update(realDelta) {
        this.time += realDelta;
        if (this.sparks) this.sparks.material.uniforms.uTime.value = this.time;
        if (this.flash > 0) {
            this.flash = Math.max(0, this.flash - realDelta / HIT_FLASH_TIME);
            const k = this.flash * this.flash;
            this.flashed.forEach(item => item.material.emissive.setRGB(
                item.original.r + (0.95 - item.original.r) * k,
                item.original.g + (0.12 - item.original.g) * k,
                item.original.b + (0.08 - item.original.b) * k
            ));
            if (this.flash === 0) this.restoreFlash();
        }
        if (this.shake > 0) {
            this.shakeTime += realDelta;
            const remaining = 1 - this.shakeTime / HIT_SHAKE_TIME;
            if (remaining <= 0) this.shake = 0;
        }
    },

    // Getaran kamera ditambahkan setelah kamera gameplay selesai diarahkan
    applyCameraShake() {
        if (this.shake <= 0) return;
        const remaining = Math.max(0, 1 - this.shakeTime / HIT_SHAKE_TIME);
        const amount = this.shake * remaining * remaining;
        const t = this.time * 60;
        camera.position.x += Math.sin(t * 1.7) * HIT_SHAKE_DISTANCE * amount;
        camera.position.y += Math.sin(t * 2.3 + 1.1) * HIT_SHAKE_DISTANCE * 0.7 * amount;
        camera.position.z += Math.cos(t * 1.9) * HIT_SHAKE_DISTANCE * amount;
        camera.rotateZ(Math.sin(t * 1.3) * HIT_SHAKE_ROLL * amount);
    },

    reset() {
        this.shake = 0;
        this.flash = 0;
        this.restoreFlash();
        if (window.PandoraTimeScale === HIT_STOP_SCALE) window.PandoraTimeScale = 1;
    }
};
window.PandoraHitFeedback = PandoraHitFeedback;
