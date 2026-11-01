/* =========================================================
   BARRIER TOMBOL Q: setengah kubah angin putih kebiruan yang berpusar,
   menempel di tanah dan dililit pita angin seperti pusaran Neji.
   Setiap kali diaktifkan menguras stamina, mendorong musuh sekitar,
   dan meninggalkan kawah serta alur pada salju atau tanah tebal.
   ========================================================= */
const BARRIER_STAMINA_COST = 15;
const BARRIER_COOLDOWN = 0.7;
const BARRIER_RADIUS = 1.8;
const BARRIER_HEIGHT = 2.35;
const BARRIER_GUST_INTERVAL = 0.06;
const BLAST_RADIUS = 6.5;
const BLAST_DAMAGE = 6;
const BLAST_RING_TIME = 0.5;
const BARRIER_RELEASE_TIME = 0.8;
const BARRIER_RELEASE_GUSTS = 34;

// Sudut awal, tinggi awal, perubahan tinggi, lebar, panjang lilitan, kecepatan putar
const BARRIER_RIBBONS = [
    [0.0, 0.86, -0.42, 0.11, 4.6, 6.4],
    [2.1, 0.62, -0.38, 0.16, 4.9, 5.6],
    [4.2, 0.34, -0.26, 0.17, 5.2, 6.9],
    [1.0, 0.42, 0.34, 0.06, 3.0, 8.2],
    [3.4, 0.14, 0.3, 0.06, 2.8, 7.6],
    [5.2, 0.05, 0.0, 0.1, 6.0, 7.2],
    [2.6, 0.03, 0.01, 0.07, 5.2, 8.8]
];

const PandoraBarrier = {
    group: null,
    dome: null,
    ribbons: null,
    sparks: null,
    ring: null,
    wasBlocking: false,
    strength: 0,
    pop: 0,
    time: 0,
    lastBlast: -99,
    ringAge: 99,
    gustTimer: 0,
    grow: 1,
    releaseAge: 1,
    releaseFrom: 1,
    swirlTime: 0,

    create() {
        this.group = new THREE.Group();
        const noiseUniform = groundCoverUniforms.uCoverNoise;

        const domeGeometry = new THREE.SphereBufferGeometry(1, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2);
        this.dome = new THREE.Mesh(domeGeometry, new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uNoise: noiseUniform },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
            vertexShader: `
                varying vec2 vUv;
                varying float vHeight;
                varying vec3 vViewNormal;
                varying vec3 vViewDir;
                void main() {
                    vUv = uv;
                    vHeight = position.y;
                    vec4 view = modelViewMatrix * vec4(position, 1.0);
                    vViewNormal = normalize(normalMatrix * normal);
                    vViewDir = normalize(-view.xyz);
                    gl_Position = projectionMatrix * view;
                }`,
            fragmentShader: `
                uniform float uTime;
                uniform float uAlpha;
                uniform sampler2D uNoise;
                varying vec2 vUv;
                varying float vHeight;
                varying vec3 vViewNormal;
                varying vec3 vViewDir;
                void main() {
                    // Awan angin: lapisan noise diseret memutar dan makin miring ke atas
                    float y = vHeight;
                    float cloudA = texture2D(uNoise, vec2(vUv.x * 2.0 - uTime * 0.62 + y * 0.45, y * 0.5 + uTime * 0.05)).r;
                    float cloudB = texture2D(uNoise, vec2(vUv.x * 3.0 - uTime * 1.05 - y * 0.6, y * 0.8 - uTime * 0.09)).r;
                    float cloud = cloudA * 0.6 + cloudB * 0.5;
                    float streak = texture2D(uNoise, vec2(vUv.x * 2.0 - uTime * 1.5 + y * 0.8, y * 2.6)).r;
                    streak = smoothstep(0.58, 0.78, streak);
                    float rim = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(vViewDir))), 2.2);
                    vec3 color = mix(vec3(0.42, 0.66, 0.95), vec3(0.94, 0.98, 1.0), clamp(smoothstep(0.42, 0.72, cloud) + streak * 0.5 + rim * 0.5, 0.0, 1.0));
                    float alpha = 0.1 + smoothstep(0.45, 0.85, cloud) * 0.26 + streak * 0.14 + rim * 0.42;
                    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.88) * uAlpha);
                }`
        }));
        this.dome.renderOrder = 900;
        this.dome.frustumCulled = false;
        this.group.add(this.dome);
        this.group.add(this.createRibbons());
        this.group.add(this.createSparks());

        const ringGeometry = new THREE.PlaneBufferGeometry(2, 2);
        ringGeometry.rotateX(-Math.PI / 2);
        this.ring = new THREE.Mesh(ringGeometry, new THREE.ShaderMaterial({
            uniforms: { uAge: { value: 1 }, uNoise: noiseUniform },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
            vertexShader: `
                varying vec2 vPos;
                void main() {
                    vPos = position.xz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform float uAge;
                uniform sampler2D uNoise;
                varying vec2 vPos;
                void main() {
                    float d = length(vPos);
                    float front = 1.0 - pow(1.0 - uAge, 3.0);
                    float band = smoothstep(front - 0.3, front, d) * (1.0 - smoothstep(front, front + 0.025, d));
                    vec2 polar = vec2(atan(vPos.y, vPos.x) / 6.2832 * 3.0, d * 0.5 - uAge);
                    float rough = texture2D(uNoise, polar).r;
                    float alpha = band * smoothstep(0.3, 0.6, rough) * (1.0 - uAge) * 0.85;
                    gl_FragColor = vec4(mix(vec3(0.6, 0.78, 1.0), vec3(0.95, 0.98, 1.0), band), alpha);
                }`
        }));
        this.ring.renderOrder = 899;
        this.ring.frustumCulled = false;
        this.ring.visible = false;
        scene.add(this.ring);
        this.group.visible = false;
        scene.add(this.group);
    },

    // Pita angin yang melilit kubah; tepinya sobek dan melancip di kedua ujung
    createRibbons() {
        const segments = 48;
        const positions = [], uvs = [], shape = [], motion = [], index = [];
        BARRIER_RIBBONS.forEach((ribbon) => {
            const start = positions.length / 3;
            for (let i = 0; i <= segments; i++) {
                for (let side = 0; side <= 1; side++) {
                    positions.push(0, 0, 0);
                    uvs.push(i / segments, side);
                    shape.push(ribbon[0], ribbon[1], ribbon[2], ribbon[3]);
                    motion.push(ribbon[4], ribbon[5]);
                }
            }
            for (let i = 0; i < segments; i++) {
                const a = start + i * 2;
                index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
        geometry.setAttribute('aMotion', new THREE.Float32BufferAttribute(motion, 2));
        geometry.setIndex(index);
        this.ribbons = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uRelease: { value: 0 }, uNoise: groundCoverUniforms.uCoverNoise },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
            toneMapped: false,
            vertexShader: `
                attribute vec4 aShape;
                attribute vec2 aMotion;
                uniform float uTime;
                uniform float uRelease;
                varying vec2 vUv;
                varying float vSeed;
                void main() {
                    vUv = uv;
                    vSeed = aShape.x;
                    float taper = pow(sin(3.14159 * uv.x), 0.7);
                    float h = aShape.y + aShape.z * uv.x + sin(uv.x * 7.0 + uTime * 2.2 + aShape.x) * 0.012;
                    h = clamp(h + (uv.y - 0.5) * aShape.w * taper, 0.005, 0.985);
                    float angle = aShape.x + aMotion.x * uv.x + uTime * aMotion.y + (uv.x - 0.5) * uRelease * 1.8;
                    float radius = sqrt(1.0 - h * h) * 1.035 * (1.0 + uRelease * (0.25 + uv.x * 0.8));
                    // Saat dilepas, tiap pita terlontar ke arahnya sendiri sambil berkelok
                    vec3 fling = vec3(cos(aShape.x * 5.3 + aMotion.y), 0.04 + 0.22 * fract(aShape.x * 1.7), sin(aShape.x * 3.7 + aMotion.x));
                    vec3 place = vec3(cos(angle) * radius, h, sin(angle) * radius) + fling * uRelease * (1.1 + aMotion.x * 0.25);
                    place.y += sin(uv.x * 9.0 + aShape.x * 4.0 + uTime * 0.7) * uRelease * 0.22;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(place, 1.0);
                }`,
            fragmentShader: `
                uniform float uTime;
                uniform float uAlpha;
                uniform float uRelease;
                uniform sampler2D uNoise;
                varying vec2 vUv;
                varying float vSeed;
                void main() {
                    float torn = texture2D(uNoise, vec2(vUv.x * 1.6 - uTime * 0.7 + vSeed, vUv.y * 0.4 + vSeed * 0.3)).r;
                    float fine = texture2D(uNoise, vec2(vUv.x * 5.0 - uTime * 1.1, vUv.y * 0.9 + vSeed)).g;
                    float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
                    float body = smoothstep(0.08, 0.42, edge - (torn - 0.42) * 1.7 - uRelease * 0.75);
                    float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.55, 1.0, vUv.x));
                    float alpha = body * ends * (0.62 + fine * 0.38) * uAlpha;
                    if (alpha < 0.01) discard;
                    gl_FragColor = vec4(mix(vec3(0.72, 0.85, 1.0), vec3(1.0), smoothstep(0.3, 0.8, edge) * (0.5 + fine * 0.5)), alpha);
                }`
        }));
        this.ribbons.frustumCulled = false;
        this.ribbons.renderOrder = 902;
        return this.ribbons;
    },

    // Garis angin halus yang terseret di kulit kubah
    createSparks() {
        const count = Math.max(350, Math.round(1500 * PandoraSettings.preset().grassFraction));
        const base = new THREE.PlaneBufferGeometry(2, 2);
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.index = base.index;
        geometry.setAttribute('position', base.attributes.position);
        const seeds = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            seeds[i * 4] = Math.random() * Math.PI * 2;
            seeds[i * 4 + 1] = Math.random();
            seeds[i * 4 + 2] = Math.random();
            seeds[i * 4 + 3] = Math.random();
        }
        geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
        geometry.instanceCount = count;
        this.sparks = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uBurst: { value: 0 }, uRelease: { value: 0 } },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
            toneMapped: false,
            vertexShader: `
                attribute vec4 aSeed;
                uniform float uTime;
                uniform float uAlpha;
                uniform float uBurst;
                uniform float uRelease;
                varying vec2 vCorner;
                varying float vAlpha;
                vec3 windAt(float time, float release, out float life) {
                    float spin = 4.5 + aSeed.z * 4.5;
                    life = fract(aSeed.y + time * (0.1 + aSeed.w * 0.22));
                    float h = life;
                    float radius = sqrt(max(0.02, 1.0 - h * h)) * (0.93 + aSeed.w * 0.16);
                    radius *= 1.0 + uBurst * (0.3 + aSeed.z * 0.8);
                    float angle = aSeed.x + time * spin;
                    vec3 place = vec3(cos(angle) * radius, h, sin(angle) * radius);
                    // Tiap butir punya arah dan jarak sendiri, jalurnya melengkung seperti hembusan
                    vec3 gust = normalize(vec3(cos(aSeed.x * 7.3 + aSeed.z * 9.0), (aSeed.y - 0.4) * 0.45, sin(aSeed.x * 3.1 + aSeed.w * 11.0)));
                    place += gust * release * (0.7 + aSeed.w * 3.2);
                    place += vec3(sin(release * 5.0 + aSeed.y * 20.0), sin(release * 4.0 + aSeed.x * 3.0) * 0.6, cos(release * 6.0 + aSeed.z * 17.0)) * release * 0.35;
                    return place;
                }
                void main() {
                    float life, tailLife;
                    vec4 head = modelViewMatrix * vec4(windAt(uTime, uRelease, life), 1.0);
                    vec4 tail = modelViewMatrix * vec4(windAt(uTime - 0.045 - aSeed.w * 0.06, max(0.0, uRelease - 0.05 - aSeed.w * 0.06), tailLife), 1.0);
                    vec2 along = head.xy - tail.xy;
                    vec2 side = vec2(-along.y, along.x) / max(0.0001, length(along));
                    vec4 view = mix(tail, head, position.y * 0.5 + 0.5);
                    view.xy += side * position.x * (0.005 + aSeed.z * aSeed.w * 0.012) * (1.0 + uRelease * 1.6);
                    vCorner = position.xy;
                    vAlpha = uAlpha * (0.3 + aSeed.w * 0.5) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.85, 1.0, life)) * step(tailLife, life) * (1.0 + uRelease * 0.6) * (1.0 - smoothstep(0.15 + aSeed.w * 0.35, 0.55 + aSeed.z * 0.45, uRelease));
                    gl_Position = projectionMatrix * view;
                }`,
            fragmentShader: `
                varying vec2 vCorner;
                varying float vAlpha;
                void main() {
                    float core = exp(-vCorner.x * vCorner.x * 4.0) * smoothstep(-1.0, 0.5, vCorner.y) * (1.0 - smoothstep(0.7, 1.0, vCorner.y));
                    if (core * vAlpha < 0.01) discard;
                    gl_FragColor = vec4(0.92, 0.97, 1.0, core * vAlpha);
                }`
        }));
        this.sparks.frustumCulled = false;
        this.sparks.renderOrder = 901;
        return this.sparks;
    },

    blast(root) {
        this.lastBlast = performance.now() / 1000;
        this.ringAge = 0;
        if (typeof FoxStaminaState !== 'undefined') FoxStaminaState.consume(BARRIER_STAMINA_COST);

        const x = root.position.x, z = root.position.z;
        const agents = FoxAIManager && FoxAIManager.agents ? FoxAIManager.agents : [];
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (!agent || !agent.root || !agent.root.visible || agent.isDead) continue;
            const dx = agent.root.position.x - x, dz = agent.root.position.z - z;
            const distance = Math.hypot(dx, dz);
            if (distance >= BLAST_RADIUS) continue;
            // Makin dekat makin terlempar; musuh di pinggir tetap terdorong jelas
            const power = 1 - distance / BLAST_RADIUS;
            const dirX = distance > 0.01 ? dx / distance : 0, dirZ = distance > 0.01 ? dz / distance : 1;
            agent.takeDamage(BLAST_DAMAGE * (0.4 + power * 0.6), root.position);
            if (agent.isDead) continue;
            const impulse = 11 + power * 15;
            agent.applyKnockback(new THREE.Vector3(dirX * impulse, 0, dirZ * impulse), 1.2 + power * 3.2);
        }
        PandoraGroundCover.blastMark(x, root.position.y, z);
    },

    // Selama aktif, angin di dasar kubah terus mengangkat salju, tanah, atau debu
    kickGround(root, realDelta) {
        this.gustTimer += realDelta;
        if (this.gustTimer < BARRIER_GUST_INTERVAL) return;
        this.gustTimer = 0;
        const angle = Math.random() * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = root.position.x + cos * BARRIER_RADIUS, z = root.position.z + sin * BARRIER_RADIUS;
        const depth = getCoverDepth(x, z);
        PandoraGroundCover.emit(x, root.position.y + depth + 0.05, z, -sin * 2.6 + cos * 0.8, cos * 2.6 + sin * 0.8, 7, depth > 0.02 && isCoverSnow(x, z), depth <= 0.02);
    },

    // Hembusan sesaat dilepas: salju, tanah, atau debu tersapu ke arah acak
    scatterGround(root) {
        for (let i = 0; i < BARRIER_RELEASE_GUSTS; i++) {
            const angle = Math.random() * Math.PI * 2;
            const reach = BARRIER_RADIUS * (0.4 + Math.random() * 0.8);
            const x = root.position.x + Math.cos(angle) * reach, z = root.position.z + Math.sin(angle) * reach;
            const depth = getCoverDepth(x, z);
            const speed = 1.5 + Math.random() * 3.5;
            const turn = angle + (Math.random() - 0.5) * 1.6;
            PandoraGroundCover.emit(x, root.position.y + depth + 0.05, z, Math.cos(turn) * speed, Math.sin(turn) * speed, 3 + Math.random() * 5, depth > 0.02 && isCoverSnow(x, z), depth <= 0.02);
        }
    },

    // Dipanggil langsung saat Q diterima, supaya tidak terlewat ketika FPS sangat rendah
    activate(character) {
        if (!this.group) this.create();
        this.pop = 1;
        this.releaseAge = 1;
        this.wasBlocking = true;
        const now = performance.now() / 1000;
        if (now - this.lastBlast >= BARRIER_COOLDOWN) this.blast(character.root);
    },

    update(realDelta) {
        const inPlay = typeof isPlayMode !== 'undefined' && isPlayMode;
        const character = typeof wolfCharacter !== 'undefined' ? wolfCharacter : null;
        if (!this.group) {
            if (!inPlay || !character) return;
            this.create();
        }
        this.time += realDelta;
        const blocking = inPlay && !!character && !!character.root && !!character.isBlocking;
        // Baru dilepas: kubah pecah melebar keluar dari ukurannya saat ini
        if (!blocking && this.wasBlocking) {
            this.releaseAge = 0;
            this.releaseFrom = this.grow;
            if (character && character.root) this.scatterGround(character.root);
        }
        this.wasBlocking = blocking;

        this.releaseAge = blocking ? 1 : Math.min(1, this.releaseAge + realDelta / BARRIER_RELEASE_TIME);
        const spread = blocking ? 0 : 1 - Math.pow(1 - this.releaseAge, 2.2);
        // Pusaran melambat saat lepas; waktu sendiri agar posisinya tidak melompat
        this.swirlTime += realDelta * (1 - spread * 0.8);
        if (blocking) this.strength += (1 - this.strength) * Math.min(1, realDelta * 16);
        else this.strength = Math.min(this.strength, 1 - Math.pow(this.releaseAge, 4));
        this.pop = Math.max(0, this.pop - realDelta * 3.2);
        const visible = inPlay && !!character && !!character.root && this.strength > 0.01;
        this.group.visible = visible;
        if (visible) {
            const position = character.root.position;
            const grow = blocking ? 0.55 + this.strength * 0.45 + this.pop * this.pop * 0.22 : this.releaseFrom;
            this.grow = grow;
            this.group.position.set(position.x, position.y - 0.04, position.z);
            this.group.scale.set(BARRIER_RADIUS * grow, BARRIER_HEIGHT * grow, BARRIER_RADIUS * grow);
            const parts = [this.dome, this.ribbons, this.sparks];
            parts.forEach((part) => {
                part.material.uniforms.uTime.value = this.swirlTime;
                part.material.uniforms.uAlpha.value = Math.min(1, this.strength * 1.1);
            });
            // Bentuk kubah lenyap paling dulu; sisanya hanya pita dan goresan yang tersebar
            if (!blocking) this.dome.material.uniforms.uAlpha.value *= Math.max(0, 1 - this.releaseAge * 7);
            this.ribbons.material.uniforms.uRelease.value = spread;
            this.sparks.material.uniforms.uRelease.value = spread;
            this.sparks.material.uniforms.uBurst.value = this.pop * this.pop;
            if (blocking) this.kickGround(character.root, realDelta);
        }

        this.ringAge += realDelta / BLAST_RING_TIME;
        this.ring.visible = inPlay && this.ringAge < 1;
        if (this.ring.visible && character && character.root) {
            const x = this.ring.position.x = character.root.position.x;
            const z = this.ring.position.z = character.root.position.z;
            this.ring.position.y = character.root.position.y + getCoverDepth(x, z) + 0.12;
            this.ring.scale.set(BLAST_RADIUS, 1, BLAST_RADIUS);
            this.ring.material.uniforms.uAge.value = this.ringAge;
        }
    }
};
window.PandoraBarrier = PandoraBarrier;
