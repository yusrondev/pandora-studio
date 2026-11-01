/* =========================================================
   BENTUK TANAH: dataran bersisi tegak (persegi atau digambar bebas)
   Grid tanah terlalu kasar untuk tepi yang tajam, jadi bentuk ini mesh tersendiri.
   Tingginya digabung ke getTerrainHeightFast, sehingga rumput, pohon, dan karakter
   berdiri di atasnya tanpa perubahan apa pun.
   ========================================================= */
const PLATEAU_MIN_SIZE = 0.8;
const PLATEAU_POINT_SPACING = 0.7;
const PLATEAU_MAX_POINTS = 90;
const PLATEAU_BEVEL = 0.14;
const PLATEAU_SINK = 1.2;           // Dasar masuk ke tanah, agar tidak terlihat celah di tanah miring
const PLATEAU_STEP_HEIGHT = 0.55;   // Lebih tinggi dari ini, karakter tertahan dinding
const COVER_PATCH_SIZE = 40;
const COVER_TRAIL_SIZE = 512;
const COVER_TRAIL_EXTENT = 64;
const PLATEAU_BODY_RADIUS = 0.5;     // Lebar badan karakter saat menabrak dinding
const PLATEAU_WALL_STEP = 0.55;      // Kerapatan titik dinding agar permukaannya bisa bergelombang

// Dipakai dataran dan permukaan dekat pemain; netral sampai jendela alur dibuat
const coverTrailUniform = { value: (() => {
    const neutral = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.LuminanceFormat);
    neutral.needsUpdate = true;
    return neutral;
})() };

const plateauMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
plateauMaterial.customProgramCacheKey = () => 'pandoraPlateauRock_v3';
plateauMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uRockNoise = groundCoverUniforms.uCoverNoise;
    shader.uniforms.uMossMap = { value: rockMossTexture };
    shader.uniforms.uCoverTrail = coverTrailUniform;
    Object.assign(shader.uniforms, groundCoverUniforms);
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPlateauWorld;\nvarying vec3 vPlateauNormal;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
            vPlateauWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vPlateauNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
            uniform sampler2D uRockNoise;
            uniform sampler2D uMossMap;
            uniform sampler2D uCoverTrail;
            ${GROUND_COVER_GLSL}
            varying vec3 vPlateauWorld;
            varying vec3 vPlateauNormal;
            vec3 rockDetail;`)
        .replace('#include <map_fragment>', `
            // Batu dari noise yang sama dengan tanah: bidang atas memakai XZ, dinding memakai sisi terlebarnya
            vec3 axis = abs(vPlateauNormal);
            bool isTop = axis.y > 0.6;
            bool useX = axis.x > axis.z;
            vec2 rockUv = isTop ? vPlateauWorld.xz : (useX ? vPlateauWorld.zy : vPlateauWorld.xy);
            mat2 r1 = mat2(0.809, 0.588, -0.588, 0.809);
            mat2 r2 = mat2(0.309, -0.951, 0.951, 0.309);
            mat2 r3 = mat2(-0.530, 0.848, -0.848, -0.530);
            vec4 n1 = texture2D(uRockNoise, r1 * rockUv * 0.061);
            vec4 n2 = texture2D(uRockNoise, r2 * rockUv * 0.19);
            vec4 n3 = texture2D(uRockNoise, r3 * rockUv * 0.71);
            vec2 slope = ((n1.ba - 0.5) * r1) * 0.7 + ((n2.ba - 0.5) * r2) * 1.1 + ((n3.ba - 0.5) * r3) * 0.8;
            float tone = n1.r * 0.45 + n2.r * 0.35 + n3.r * 0.2;
            vec3 rock = mix(vec3(0.085, 0.075, 0.063), vec3(0.19, 0.17, 0.145), smoothstep(0.2, 0.8, tone));
            float ledge = 0.0;
            if (!isTop) {
                // Lapisan batuan mendatar yang tidak lurus sempurna
                float layer = (vPlateauWorld.y * 1.1 + n1.r * 1.1 + n2.r * 0.35) * 6.2832;
                ledge = cos(layer);
                rock *= 0.96 + sin(layer) * 0.06 + sin(layer * 2.7) * 0.03;
                rock *= mix(0.86, 1.0, smoothstep(-0.5, 0.2, sin(layer)));
            } else {
                rock = mix(rock, vec3(0.16, 0.135, 0.105), 0.5);
            }
            rockDetail = isTop ? vec3(slope.x, 0.0, slope.y) : (useX ? vec3(0.0, slope.y + ledge * 0.28, slope.x) : vec3(slope.x, slope.y + ledge * 0.28, 0.0));
            diffuseColor.rgb = rock;
            // Kuas lumut yang sama dengan batu
            float mossPaint = texture2D(uMossMap, (vPlateauWorld.xz + ${ROCK_MOSS_EXTENT.toFixed(1)} * 0.5) / ${ROCK_MOSS_EXTENT.toFixed(1)}).r;
            float moss = smoothstep(0.32, 0.6, mossPaint + (n3.r - 0.5) * 0.7) * smoothstep(-0.35, 0.25, vPlateauNormal.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.03, 0.06, 0.015), vec3(0.12, 0.17, 0.035), n3.r * 1.6), moss);
            // Salju dan tanah yang dilukis di bidang atas; alur menampakkan batu di bawahnya
            if (isTop) {
                vec2 trailUv = vPlateauWorld.xz / ${COVER_TRAIL_EXTENT.toFixed(1)};
                float carve = clamp((0.5 - texture2D(uCoverTrail, trailUv).r) * 2.0, 0.0, 1.0);
                float trailStep = 0.1 / ${COVER_TRAIL_EXTENT.toFixed(1)};
                vec3 trailNormal = normalize(vec3(
                    texture2D(uCoverTrail, trailUv + vec2(trailStep, 0.0)).r - texture2D(uCoverTrail, trailUv - vec2(trailStep, 0.0)).r,
                    0.5,
                    texture2D(uCoverTrail, trailUv + vec2(0.0, trailStep)).r - texture2D(uCoverTrail, trailUv - vec2(0.0, trailStep)).r));
                vec4 painted = groundCover(vPlateauWorld.xz, trailNormal);
                diffuseColor.rgb = mix(diffuseColor.rgb, painted.rgb, painted.a * (1.0 - carve * 0.85));
            }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            normal = normalize((viewMatrix * vec4(normalize(normalize(vPlateauNormal) - rockDetail * 0.6), 0.0)).xyz) * faceDirection;`);
};

const PandoraPlateaus = {
    group: new THREE.Group(),
    items: [],
    meshes: [],
    drawing: null,
    preview: null,

    // ---------- Data ----------
    pointInside(points, x, z) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
    },

    itemAt(x, z) {
        let found = null;
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (x < item.minX || x > item.maxX || z < item.minZ || z > item.maxZ) continue;
            if ((!found || item.top > found.top) && this.pointInside(item.points, x, z)) found = item;
        }
        return found;
    },

    heightOverlay(x, z, ground) {
        const item = PandoraPlateaus.itemAt(x, z);
        return item ? Math.max(ground, item.top) : ground;
    },

    // Titik tepi diperapat dan digeser sedikit agar dinding tidak rata seperti kotak
    build(item) {
        const shape = new THREE.Shape();
        const outline = [];
        item.points.forEach((p, i) => {
            const q = item.points[(i + 1) % item.points.length];
            const parts = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / PLATEAU_WALL_STEP));
            for (let k = 0; k < parts; k++) outline.push([p[0] + (q[0] - p[0]) * k / parts, p[1] + (q[1] - p[1]) * k / parts]);
        });
        outline.forEach((p, i) => (i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1])));
        shape.closePath();
        const depth = Math.max(0.2, item.top - item.base - PLATEAU_BEVEL);
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            steps: Math.max(1, Math.round(depth / PLATEAU_WALL_STEP)),
            bevelEnabled: true,
            bevelSize: PLATEAU_BEVEL,
            bevelThickness: PLATEAU_BEVEL,
            bevelOffset: -PLATEAU_BEVEL,
            bevelSegments: 2
        });
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, item.base, 0);
        this.roughenWalls(geometry);
        const mesh = new THREE.Mesh(geometry, plateauMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.plateau = item;
        this.group.add(mesh);
        this.meshes.push(mesh);
    },

    roughenWalls(geometry) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
            position.setX(i, x + (Math.sin(z * 1.3 + y * 0.9) + Math.sin(z * 3.1 - y * 2.3 + x) * 0.45) * 0.08);
            position.setZ(i, z + (Math.sin(x * 1.5 - y * 0.8) + Math.sin(x * 2.9 + y * 2.1 + z) * 0.45) * 0.08);
        }
        geometry.computeVertexNormals();
        // Dinding dihaluskan antar segitiga; bidang atas tetap tegas
        const normal = geometry.attributes.normal;
        const shared = new Map();
        const keyOf = i => `${position.getX(i).toFixed(2)},${position.getY(i).toFixed(2)},${position.getZ(i).toFixed(2)}`;
        for (let i = 0; i < position.count; i++) {
            if (Math.abs(normal.getY(i)) > 0.8) continue;
            const key = keyOf(i);
            const sum = shared.get(key) || [0, 0, 0];
            sum[0] += normal.getX(i);
            sum[1] += normal.getY(i);
            sum[2] += normal.getZ(i);
            shared.set(key, sum);
        }
        for (let i = 0; i < position.count; i++) {
            if (Math.abs(normal.getY(i)) > 0.8) continue;
            const sum = shared.get(keyOf(i));
            const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
            normal.setXYZ(i, sum[0] / length, sum[1] / length, sum[2] / length);
        }
    },

    add(points, top, base) {
        const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
        const item = { points, top, base, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
        this.items.push(item);
        this.build(item);
        terrainHeightOverlay = this.heightOverlay;
        return item;
    },

    clear() {
        this.meshes.forEach((mesh) => {
            this.group.remove(mesh);
            mesh.geometry.dispose();
        });
        this.meshes = [];
        this.items = [];
        terrainHeightOverlay = null;
    },

    serialize() {
        return this.items.map(item => ({ points: item.points, top: item.top, base: item.base }));
    },

    load(list) {
        this.clear();
        if (Array.isArray(list)) list.forEach(item => this.add(item.points, item.top, item.base));
    },

    // Rumput, pohon, batu, dan bunga di area ini mengikuti ketinggian baru
    refreshContents() {
        updateTreesAndGrassPositions();
    },

    // ---------- Menggambar ----------
    createFromOutline(points) {
        if (points.length < 3) return null;
        const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
        if (Math.max(...xs) - Math.min(...xs) < PLATEAU_MIN_SIZE || Math.max(...zs) - Math.min(...zs) < PLATEAU_MIN_SIZE) return null;
        let high = -Infinity, low = Infinity;
        points.forEach((p) => {
            const h = getTerrainHeightFast(p[0], p[1]);
            high = Math.max(high, h);
            low = Math.min(low, h);
        });
        const slider = document.getElementById('slider-shape-height');
        const height = slider ? parseFloat(slider.value) : 3;
        const item = this.add(points.map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]), +(high + height).toFixed(2), +(low - PLATEAU_SINK).toFixed(2));
        this.clearGrass(item);
        this.refreshContents();
        return item;
    },

    // Rumput di dalam dan di tepi dataran dibuang, supaya tidak menjuntai dari pinggirnya
    clearGrass(item) {
        const center = new THREE.Vector3();
        for (let x = item.minX - 1; x <= item.maxX + 1; x += 0.5) {
            for (let z = item.minZ - 1; z <= item.maxZ + 1; z += 0.5) {
                const near = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(o => this.pointInside(item.points, x + o[0], z + o[1]));
                if (!near) continue;
                center.set(x, getTerrainHeightFast(x, z), z);
                removeGrassInRadius(center, 0.9);
            }
        }
    },

    outlineOf(state) {
        if (state.mode === 'shape_free') return state.points;
        const [ax, az] = state.start;
        const [bx, bz] = state.end;
        return [[ax, az], [bx, az], [bx, bz], [ax, bz]];
    },

    showPreview(points) {
        if (!this.preview) {
            this.preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe08a, depthTest: false }));
            this.preview.renderOrder = 999;
            this.preview.frustumCulled = false;
            scene.add(this.preview);
        }
        const positions = [];
        points.concat([points[0]]).forEach((p) => {
            positions.push(p[0], getTerrainHeightFast(p[0], p[1]) + 0.08, p[1]);
        });
        this.preview.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.preview.visible = true;
    },

    // Dipanggil saat kuas ditekan dan digeser
    drag(mode, point) {
        const at = [point.x, point.z];
        if (mode === 'shape_remove') {
            this.removeAt(point);
            return;
        }
        if (!this.drawing) this.drawing = { mode, start: at, end: at, points: [at] };
        this.drawing.end = at;
        const last = this.drawing.points[this.drawing.points.length - 1];
        if (this.drawing.points.length < PLATEAU_MAX_POINTS && Math.hypot(last[0] - at[0], last[1] - at[1]) >= PLATEAU_POINT_SPACING) {
            this.drawing.points.push(at);
        }
        const outline = this.outlineOf(this.drawing);
        if (outline.length >= 2) this.showPreview(outline);
    },

    finish() {
        if (!this.drawing) return;
        const outline = this.outlineOf(this.drawing);
        this.drawing = null;
        if (this.preview) this.preview.visible = false;
        if (!this.createFromOutline(outline) && typeof PandoraToast !== 'undefined') {
            PandoraToast.show('Bentuk terlalu kecil. Seret lebih lebar.', 'danger');
        }
    },

    removeAt(point) {
        const item = this.itemAt(point.x, point.z);
        if (!item) return;
        const index = this.items.indexOf(item);
        const mesh = this.meshes[index];
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.splice(index, 1);
        this.items.splice(index, 1);
        if (this.items.length === 0) terrainHeightOverlay = null;
        this.refreshContents();
    },

    // Karakter didorong keluar dari dinding sejauh lebar badannya; bergeser sendiri menyusur dinding.
    // Lebih dari setinggi langkah di atas kaki berarti dinding, bukan pijakan.
    pushOut(root, cameraObject) {
        for (let pass = 0; pass < 2; pass++) {
            for (let n = 0; n < this.items.length; n++) {
                const item = this.items[n];
                const x = root.position.x, z = root.position.z;
                if (item.top <= root.position.y + PLATEAU_STEP_HEIGHT) continue;
                if (x < item.minX - PLATEAU_BODY_RADIUS || x > item.maxX + PLATEAU_BODY_RADIUS || z < item.minZ - PLATEAU_BODY_RADIUS || z > item.maxZ + PLATEAU_BODY_RADIUS) continue;
                let closestX = x, closestZ = z, best = Infinity;
                const points = item.points;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const ax = points[j][0], az = points[j][1];
                    const ex = points[i][0] - ax, ez = points[i][1] - az;
                    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
                    const px = ax + ex * t, pz = az + ez * t;
                    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
                    if (d < best) { best = d; closestX = px; closestZ = pz; }
                }
                const distance = Math.sqrt(best);
                const inside = this.pointInside(points, x, z);
                if (!inside && distance >= PLATEAU_BODY_RADIUS) continue;
                const sign = inside ? -1 : 1;
                const dirX = distance > 1e-4 ? (x - closestX) / distance * sign : 1;
                const dirZ = distance > 1e-4 ? (z - closestZ) / distance * sign : 0;
                const targetX = closestX + dirX * PLATEAU_BODY_RADIUS, targetZ = closestZ + dirZ * PLATEAU_BODY_RADIUS;
                if (cameraObject) {
                    cameraObject.position.x += targetX - x;
                    cameraObject.position.z += targetZ - z;
                }
                root.position.x = targetX;
                root.position.z = targetZ;
            }
        }
    }
};
PandoraPlateaus.group.name = 'plateaus';
scene.add(PandoraPlateaus.group);
window.PandoraPlateaus = PandoraPlateaus;
window.addEventListener('pointerup', () => PandoraPlateaus.finish());

// =========================================================
// PERMUKAAN SALJU DAN TANAH YANG TERBELAH
// Grid tanah terlalu kasar untuk alur langkah, jadi di sekitar pemain ada grid rapat yang
// benar-benar naik setebal lapisan. Karakter tetap menapak di tanah asli, sehingga kakinya
// terbenam dan alur yang dilewati turun sampai dasar.
// =========================================================
const COVER_STAMP_SPACING = 0.1;
const COVER_PRINT_SPACING = 0.55;
const COVER_DEEP_DEPTH = 0.13;      // Lebih dalam dari ini, langkah menjadi alur menerus
const COVER_PARTICLE_LIFE = 1.15;

const PandoraGroundCover = {
    mesh: null,
    enabled: null,
    player: { lastX: null, lastZ: null, printTravel: 0, side: 1 },
    uploadTick: 0,
    particlesDirty: false,
    version: -1,
    trailData: null,
    trailTexture: null,
    heightTexture: null,
    uniforms: null,
    frameDirty: false,
    centerCol: null,
    centerRow: null,
    time: 0,
    particles: null,
    particleNext: 0,
    particleCount: 0,

    supported() {
        const caps = renderer.capabilities;
        return caps.maxVertexTextures >= 3 && (caps.isWebGL2 || !!renderer.extensions.get('OES_texture_float'));
    },

    create() {
        this.trailData = new Uint8Array(COVER_TRAIL_SIZE * COVER_TRAIL_SIZE).fill(128);
        this.trailTexture = new THREE.DataTexture(this.trailData, COVER_TRAIL_SIZE, COVER_TRAIL_SIZE, THREE.LuminanceFormat);
        this.trailTexture.wrapS = this.trailTexture.wrapT = THREE.RepeatWrapping;
        this.trailTexture.minFilter = this.trailTexture.magFilter = THREE.LinearFilter;
        this.trailTexture.needsUpdate = true;
        coverTrailUniform.value = this.trailTexture;

        const fraction = PandoraSettings.preset().grassFraction;
        const segments = fraction >= 0.8 ? 160 : (fraction >= 0.5 ? 128 : 96);
        const geometry = new THREE.PlaneBufferGeometry(COVER_PATCH_SIZE, COVER_PATCH_SIZE, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        this.uniforms = Object.assign({
            uCoverTrail: coverTrailUniform,
            uCoverHeight: { value: null },
            uCoverGroundSize: { value: groundSize },
            uCoverGroundSegments: { value: groundSegments },
            uCoverCenter: { value: new THREE.Vector2() }
        }, groundCoverUniforms);

        const heightChunk = `
            uniform sampler2D uCoverMap;
            uniform sampler2D uCoverTrail;
            float coverHeight(vec2 xz) {
                vec4 cover = texture2D(uCoverMap, (xz + ${COVER_MAP_EXTENT.toFixed(1)} * 0.5) / ${COVER_MAP_EXTENT.toFixed(1)});
                float depth = max(cover.r * ${COVER_DIRT_DEPTH.toFixed(2)}, cover.a * ${COVER_SNOW_DEPTH.toFixed(2)});
                float trail = texture2D(uCoverTrail, xz / ${COVER_TRAIL_EXTENT.toFixed(1)}).r;
                float carve = clamp((0.5 - trail) * 2.0, 0.0, 1.0);
                float rim = clamp((trail - 0.5) * 2.0, 0.0, 1.0);
                return depth * (1.0 - carve) + rim * min(depth, 0.35) * 0.5;
            }`;
        const material = new THREE.MeshToonMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        material.customProgramCacheKey = () => 'pandoraGroundCover_v2';
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
                    uniform sampler2D uCoverHeight;
                    uniform float uCoverGroundSize;
                    uniform float uCoverGroundSegments;
                    uniform vec2 uCoverCenter;
                    varying vec3 vCoverWorld;
                    ${heightChunk}
                    float coverTerrain(vec2 xz) {
                        vec2 g = clamp((xz + uCoverGroundSize * 0.5) / uCoverGroundSize, 0.0, 1.0) * uCoverGroundSegments;
                        vec2 cell = floor(g);
                        vec2 t = g - cell;
                        float size = uCoverGroundSegments + 1.0;
                        float a = texture2D(uCoverHeight, (cell + vec2(0.5, 0.5)) / size).r;
                        float b = texture2D(uCoverHeight, (cell + vec2(1.5, 0.5)) / size).r;
                        float c = texture2D(uCoverHeight, (cell + vec2(0.5, 1.5)) / size).r;
                        float d = texture2D(uCoverHeight, (cell + vec2(1.5, 1.5)) / size).r;
                        return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
                    }`)
                .replace('#include <beginnormal_vertex>', `
                    vec2 coverXZ = (modelMatrix * vec4(position, 1.0)).xz;
                    float coverGround = coverTerrain(coverXZ);
                    vec3 objectNormal = normalize(vec3(coverTerrain(coverXZ - vec2(0.8, 0.0)) - coverTerrain(coverXZ + vec2(0.8, 0.0)), 1.6, coverTerrain(coverXZ - vec2(0.0, 0.8)) - coverTerrain(coverXZ + vec2(0.0, 0.8))));`)
                .replace('#include <begin_vertex>', `
                    float coverFade = 1.0 - smoothstep(${(COVER_PATCH_SIZE * 0.38).toFixed(1)}, ${(COVER_PATCH_SIZE * 0.49).toFixed(1)}, distance(coverXZ, uCoverCenter));
                    vec3 transformed = vec3(position.x, coverGround + coverHeight(coverXZ) * coverFade, position.z);
                    vCoverWorld = vec3(coverXZ.x, transformed.y, coverXZ.y);`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    varying vec3 vCoverWorld;
                    ${heightChunk}
                    uniform sampler2D uCoverNoise;
                    uniform vec3 uCoverSun;
                    ${GROUND_COVER_GLSL.replace('uniform sampler2D uCoverMap;', '').replace('uniform sampler2D uCoverNoise;', '').replace('uniform vec3 uCoverSun;', '')}`)
                .replace('#include <color_fragment>', `
                    vec2 coverPos = vCoverWorld.xz;
                    float coverE = 0.1;
                    float coverH = coverHeight(coverPos);
                    vec3 coverN = normalize(vec3(coverHeight(coverPos - vec2(coverE, 0.0)) - coverHeight(coverPos + vec2(coverE, 0.0)), 1.3 * coverE, coverHeight(coverPos - vec2(0.0, coverE)) - coverHeight(coverPos + vec2(0.0, coverE))));
                    vec4 coverColor = groundCover(coverPos, coverN);
                    if (coverColor.a < 0.5) discard;
                    float coverCarve = clamp((0.5 - texture2D(uCoverTrail, coverPos / ${COVER_TRAIL_EXTENT.toFixed(1)}).r) * 2.0, 0.0, 1.0);
                    diffuseColor.rgb = coverColor.rgb * (1.0 - coverCarve * 0.3);`);
        };
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);
    },

    // Ketinggian tanah untuk shader; dibuat ulang saat mulai main atau ganti map
    rebuildHeights() {
        const stride = groundSegments + 1;
        const data = new Float32Array(stride * stride * 4);
        const position = groundGeo.attributes.position;
        for (let i = 0; i < stride * stride; i++) data[i * 4] = position.getY(i);
        if (this.heightTexture) this.heightTexture.dispose();
        this.heightTexture = new THREE.DataTexture(data, stride, stride, THREE.RGBAFormat, THREE.FloatType);
        this.heightTexture.minFilter = this.heightTexture.magFilter = THREE.NearestFilter;
        this.heightTexture.needsUpdate = true;
        this.uniforms.uCoverHeight.value = this.heightTexture;
        this.uniforms.uCoverGroundSize.value = groundSize;
        this.uniforms.uCoverGroundSegments.value = groundSegments;
    },

    resetTrail() {
        this.trailData.fill(128);
        this.frameDirty = true;
        this.centerCol = null;
        this.player.lastX = null;
        FoxAIManager.agents.forEach((agent) => { agent.coverTrack = null; });
    },

    // Jendela alur melingkar: baris yang baru masuk jendela dikosongkan
    scrollWindow(x, z) {
        const scale = COVER_TRAIL_SIZE / COVER_TRAIL_EXTENT;
        const col = Math.floor(x * scale), row = Math.floor(z * scale);
        if (this.centerCol === null) {
            this.centerCol = col;
            this.centerRow = row;
            return;
        }
        const size = COVER_TRAIL_SIZE, half = size / 2;
        const wrap = v => ((v % size) + size) % size;
        const dc = col - this.centerCol, dr = row - this.centerRow;
        if (Math.abs(dc) >= size || Math.abs(dr) >= size) {
            this.trailData.fill(128);
        } else {
            for (let i = 1; i <= Math.abs(dc); i++) {
                const c = wrap(this.centerCol + Math.sign(dc) * (half - 1 + i));
                for (let k = 0; k < size; k++) this.trailData[k * size + c] = 128;
            }
            for (let i = 1; i <= Math.abs(dr); i++) {
                const r = wrap(this.centerRow + Math.sign(dr) * (half - 1 + i));
                this.trailData.fill(128, r * size, (r + 1) * size);
            }
        }
        this.centerCol = col;
        this.centerRow = row;
    },

    stampTrail(x, z, radius) {
        const scale = COVER_TRAIL_SIZE / COVER_TRAIL_EXTENT;
        const size = COVER_TRAIL_SIZE;
        const cx = x * scale, cz = z * scale;
        const r = radius * scale * (0.9 + Math.random() * 0.2);
        const outer = r * 1.55;
        const data = this.trailData;
        for (let row = Math.floor(cz - outer); row <= Math.ceil(cz + outer); row++) {
            for (let col = Math.floor(cx - outer); col <= Math.ceil(cx + outer); col++) {
                const d = Math.hypot(col - cx, row - cz);
                if (d >= outer) continue;
                const index = (((row % size) + size) % size) * size + (((col % size) + size) % size);
                if (d < r) {
                    const k = d / r;
                    data[index] = Math.min(data[index], 128 - 128 * (1 - k * k * k * k));
                } else if (data[index] >= 128) {
                    const k = (d - r) / (outer - r);
                    // Tepi alur menggumpal, tidak rata
                    const clump = 0.55 + 0.45 * Math.sin(col * 0.9) * Math.sin(row * 1.1);
                    data[index] = Math.max(data[index], 128 + 127 * (1 - k) * clump);
                }
            }
        }
        this.frameDirty = true;
    },

    createParticles() {
        const count = Math.max(400, Math.round(3000 * PandoraSettings.preset().grassFraction));
        const geometry = new THREE.BufferGeometry();
        const usage = (name, size) => {
            const attribute = new THREE.BufferAttribute(new Float32Array(count * size), size);
            attribute.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute(name, attribute);
        };
        usage('position', 3);
        usage('aVelocity', 3);
        usage('aStart', 2);   // waktu lahir, ukuran
        usage('aColor', 3);
        geometry.attributes.aStart.array.fill(-999);
        const material = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uLife: { value: COVER_PARTICLE_LIFE }, uScale: { value: renderer.domElement.height * 0.5 } },
            transparent: true,
            depthWrite: false,
            vertexShader: `
                attribute vec3 aVelocity;
                attribute vec2 aStart;
                attribute vec3 aColor;
                uniform float uTime;
                uniform float uLife;
                uniform float uScale;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float t = uTime - aStart.x;
                    float k = t / uLife;
                    vColor = aColor;
                    vAlpha = (k >= 0.0 && k < 1.0) ? (1.0 - k) * (1.0 - k) : 0.0;
                    vec3 p = position + aVelocity * t * (1.0 - t * 0.25);
                    p.y -= 3.2 * t * t;
                    vec4 view = viewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * view;
                    gl_PointSize = vAlpha > 0.0 ? aStart.y * (1.0 + k * 1.5) * uScale / -view.z : 0.0;
                }`,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    if (vAlpha <= 0.0 || d > 1.0) discard;
                    gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d) * 0.85);
                }`
        });
        this.particles = new THREE.Points(geometry, material);
        this.particles.frustumCulled = false;
        this.particleCount = count;
        scene.add(this.particles);
    },

    // Kawah dan alur menyebar dari ledakan barrier; juga semburan partikel melingkar
    blastMark(x, y, z) {
        if (this.trailData && hasDirtPainted()) {
            this.stampTrail(x, z, 1.05);
            const spokes = 22;
            for (let i = 0; i < spokes; i++) {
                const angle = i / spokes * Math.PI * 2 + Math.random() * 0.25;
                const length = 1.5 + Math.random() * Math.random() * 2.6;
                for (let d = 1; d < length; d += 0.14) {
                    this.stampTrail(x + Math.cos(angle) * d, z + Math.sin(angle) * d, 0.075 * (1 - d / (length + 0.4)) + 0.025);
                }
            }
        }
        const ground = getTerrainHeightFast(x, z);
        const count = 26;
        for (let i = 0; i < count; i++) {
            const angle = i / count * Math.PI * 2;
            const px = x + Math.cos(angle) * 1.1, pz = z + Math.sin(angle) * 1.1;
            const depth = getCoverDepth(px, pz);
            if (depth > 0.02) {
                this.emit(px, ground + depth, pz, Math.cos(angle) * 3.2, Math.sin(angle) * 3.2, 14, isCoverSnow(px, pz));
            } else {
                this.emit(px, ground + 0.05, pz, Math.cos(angle) * 3.2, Math.sin(angle) * 3.2, 7, false, true);
            }
        }
    },

    emit(x, y, z, dirX, dirZ, amount, snow, dust) {
        if (!this.particles) this.createParticles();
        const attrs = this.particles.geometry.attributes;
        const total = this.particleCount;
        const emitted = Math.round(amount * Math.min(1, total / 1500));
        for (let n = 0; n < emitted; n++) {
            const i = this.particleNext;
            this.particleNext = (i + 1) % total;
            const angle = Math.random() * Math.PI * 2;
            const spread = Math.random() * 0.9;
            attrs.position.setXYZ(i, x + Math.cos(angle) * 0.22 * Math.random(), y + Math.random() * 0.12, z + Math.sin(angle) * 0.22 * Math.random());
            attrs.aVelocity.setXYZ(i, dirX * (0.6 + Math.random()) + Math.cos(angle) * spread, 0.5 + Math.random() * 1.5, dirZ * (0.6 + Math.random()) + Math.sin(angle) * spread);
            attrs.aStart.setXY(i, this.time - Math.random() * 0.05, snow ? 0.035 + Math.random() * 0.07 : 0.025 + Math.random() * 0.045);
            const tone = 0.85 + Math.random() * 0.15;
            if (dust) attrs.aColor.setXYZ(i, 0.78 * tone, 0.84 * tone, 0.92 * tone);
            else if (snow) attrs.aColor.setXYZ(i, 0.9 * tone, 0.93 * tone, tone);
            else attrs.aColor.setXYZ(i, 0.22 * tone, 0.13 * tone, 0.07 * tone);
        }
        this.particlesDirty = true;
    },

    syncSun() {
        if (!this.sun) scene.traverse((object) => { if (!this.sun && object.isDirectionalLight) this.sun = object; });
        if (!this.sun) return;
        const sun = groundCoverUniforms.uCoverSun.value;
        sun.copy(this.sun.position).sub(this.sun.target.position).normalize();
    },

    update(realDelta) {
        const root = typeof wolfCharacter !== 'undefined' && wolfCharacter ? wolfCharacter.root : null;
        const inPlay = typeof isPlayMode !== 'undefined' && isPlayMode && !!root;
        this.syncSun();
        if (this.particles) this.particles.visible = inPlay;
        if (inPlay) {
            this.time += realDelta;
            if (this.particles) this.particles.material.uniforms.uTime.value = this.time;
        }
        if (!inPlay || !hasDirtPainted()) {
            if (this.mesh) this.mesh.visible = false;
            this.enabled = false;
            this.flushParticles();
            return;
        }
        if (!this.supported()) return;
        if (!this.mesh) this.create();
        if (this.enabled !== true || this.version !== coverVersion) {
            this.rebuildHeights();
            this.resetTrail();
            this.version = coverVersion;
            this.enabled = true;
        }
        this.mesh.visible = true;

        const x = root.position.x, z = root.position.z;
        const cell = COVER_PATCH_SIZE / this.mesh.geometry.parameters.widthSegments;
        this.mesh.position.set(Math.round(x / cell) * cell, 0, Math.round(z / cell) * cell);
        this.uniforms.uCoverCenter.value.set(x, z);
        this.scrollWindow(x, z);

        this.track(root, this.player, 1);
        // Musuh yang dekat ikut membelah lapisan; di luar jendela alur akan tertukar posisi
        const agents = FoxAIManager.agents;
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            if (!agent || !agent.root || !agent.root.visible) continue;
            if (!agent.coverTrack) agent.coverTrack = { lastX: null, lastZ: null, printTravel: 0, side: 1 };
            const near = Math.hypot(agent.root.position.x - x, agent.root.position.z - z) < COVER_TRAIL_EXTENT * 0.45;
            if (near) this.track(agent.root, agent.coverTrack, 0.6);
            else agent.coverTrack.lastX = null;
        }

        // Unggahan peta alur dijarangkan di preset rendah
        this.uploadTick++;
        if (this.frameDirty && (PandoraSettings.preset().grassFraction >= 0.8 || this.uploadTick % 2 === 0)) {
            this.trailTexture.needsUpdate = true;
            this.frameDirty = false;
        }
        this.flushParticles();
    },

    flushParticles() {
        if (!this.particlesDirty || !this.particles) return;
        const attrs = this.particles.geometry.attributes;
        Object.keys(attrs).forEach((name) => { attrs[name].needsUpdate = true; });
        this.particlesDirty = false;
    },

    track(root, tracker, particleScale) {
        const x = root.position.x, z = root.position.z;
        if (tracker.lastX === null) {
            tracker.lastX = x;
            tracker.lastZ = z;
            return;
        }
        const travel = Math.hypot(x - tracker.lastX, z - tracker.lastZ);
        if (travel < COVER_STAMP_SPACING) return;
        const dirX = (x - tracker.lastX) / travel, dirZ = (z - tracker.lastZ) / travel;
        // Melompat jauh atau teleport tidak membuat alur panjang
        const ground = getTerrainHeightFast(x, z);
        const depth = root.position.y <= ground + 0.3 && travel < 3 ? getCoverDepth(x, z) : 0;
        if (depth > 0.02) this.step(tracker, x, z, dirX, dirZ, travel, depth, ground, particleScale);
        tracker.lastX = x;
        tracker.lastZ = z;
    },

    step(tracker, x, z, dirX, dirZ, travel, depth, ground, particleScale) {
        const snow = isCoverSnow(x, z);
        if (depth >= COVER_DEEP_DEPTH) {
            // Lapisan dalam: alur menerus selebar kaki, makin dalam makin lebar
            const steps = Math.max(1, Math.round(travel / COVER_STAMP_SPACING));
            const radius = 0.24 + depth * 0.22;
            for (let i = 1; i <= steps; i++) {
                const k = i / steps;
                this.stampTrail(tracker.lastX + (x - tracker.lastX) * k, tracker.lastZ + (z - tracker.lastZ) * k, radius);
            }
            this.emit(x, ground + depth * 0.8, z, dirX, dirZ, (5 + depth * 22) * particleScale, snow);
            return;
        }
        // Lapisan tipis: tapak kiri dan kanan
        tracker.printTravel += travel;
        if (tracker.printTravel < COVER_PRINT_SPACING) return;
        tracker.printTravel = 0;
        tracker.side = -tracker.side;
        const px = x - dirZ * 0.14 * tracker.side, pz = z + dirX * 0.14 * tracker.side;
        this.stampTrail(px, pz, 0.13);
        this.stampTrail(px + dirX * 0.13, pz + dirZ * 0.13, 0.13);
        this.emit(px, ground + depth, pz, dirX, dirZ, (4 + depth * 25) * particleScale, snow);
    }
};
window.PandoraGroundCover = PandoraGroundCover;

// Angka di samping slider
[['slider-shape-height', 'val-shape-height', 1], ['slider-dirt-thickness', 'val-dirt-thickness', 100]].forEach(([sliderId, labelId, scale]) => {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider || !label) return;
    slider.addEventListener('input', () => {
        label.innerText = scale === 100 ? Math.round(slider.value * 100) + '%' : parseFloat(slider.value).toFixed(1);
    });
});
