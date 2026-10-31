/* Dynamic grass system */
// ==========================================
// 7. DYNAMIC GRASS SYSTEM
// ==========================================
function createGenshinGrassTuftTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    // 9 bilah helai rumput dinamis & rimbun khas Genshin Impact
    const blades = [
        { x: 256, w: 22, h: 495, curve: 0 },
        { x: 210, w: 20, h: 465, curve: -28 },
        { x: 302, w: 20, h: 475, curve: 28 },
        { x: 165, w: 18, h: 420, curve: -52 },
        { x: 347, w: 18, h: 430, curve: 52 },
        { x: 122, w: 16, h: 360, curve: -80 },
        { x: 390, w: 16, h: 370, curve: 80 },
        { x: 78,  w: 14, h: 285, curve: -110 },
        { x: 434, w: 14, h: 295, curve: 110 }
    ];

    ctx.fillStyle = '#ffffff';
    blades.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(b.x - b.w / 2, 512);
        ctx.quadraticCurveTo(b.x + b.curve * 0.5, 512 - b.h * 0.5, b.x + b.curve, 512 - b.h);
        ctx.quadraticCurveTo(b.x + b.curve * 0.5 + b.w * 0.3, 512 - b.h * 0.5, b.x + b.w / 2, 512);
        ctx.closePath();
        ctx.fill();
    });

    return new THREE.CanvasTexture(canvas);
}

function createDenseGrassTuftGeometry() {
    const tuftGeo = new THREE.BufferGeometry();
    // Lebar kartu 1.45m & tinggi 1.15m: jauh lebih mekar dan rimbun sehingga tidak ada celah botak
    const cardGeo = new THREE.PlaneGeometry(1.45, 1.15);
    cardGeo.translate(0, 0.575, 0);

    // Formasi Tri-Star Asterisk (0°, 60°, 120°): standar game AAA (Genshin / Zelda)
    // Menghasilkan volume 360° penuh dari sudut pandang manapun tanpa ada sisi gepeng
    // Memangkas 50% beban vertex & overdraw GPU dibanding konfigurasi 6-plane
    const geometries = [];
    const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
    for (let i = 0; i < angles.length; i++) {
        const g = cardGeo.clone();
        g.rotateY(angles[i]);
        geometries.push(g);
    }

    let totalVertices = 0;
    let totalIndices = 0;

    geometries.forEach(g => {
        totalVertices += g.attributes.position.count;
        totalIndices += g.index.count;
    });

    const posArray = new Float32Array(totalVertices * 3);
    const uvArray = new Float32Array(totalVertices * 2);
    const planeIdArray = new Float32Array(totalVertices);
    const indexArray = new Uint32Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    geometries.forEach((g, pIdx) => {
        const pos = g.attributes.position.array;
        const uv = g.attributes.uv.array;
        const idx = g.index.array;
        const vCount = g.attributes.position.count;

        posArray.set(pos, vOffset * 3);
        uvArray.set(uv, vOffset * 2);

        for (let k = 0; k < vCount; k++) {
            planeIdArray[vOffset + k] = pIdx;
        }

        for (let j = 0; j < idx.length; j++) {
            indexArray[iOffset + j] = idx[j] + vOffset;
        }

        vOffset += vCount;
        iOffset += idx.length;
    });

    tuftGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    tuftGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    tuftGeo.setAttribute('aPlaneId', new THREE.BufferAttribute(planeIdArray, 1));
    tuftGeo.setIndex(new THREE.BufferAttribute(indexArray, 1));

    return tuftGeo;
}

const grassTuftTexture = createGenshinGrassTuftTexture();
const maxGrassCapacity = 100000;
let instancedGrassMesh;
let grassActiveStates = new Uint8Array(maxGrassCapacity);
let grassCoordsX = new Float32Array(maxGrassCapacity);
let grassCoordsZ = new Float32Array(maxGrassCapacity);
let grassScalesArray = new Float32Array(maxGrassCapacity);
let grassRotYArray = new Float32Array(maxGrassCapacity);

let userGrassHeightSetting = 1.0;
let lastSearchIndex = 0;

function createGrassGridSystem(count, areaSize) {
    const tuftGeo = createDenseGrassTuftGeometry();
    const tuftMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(genshinGrassShader.uniforms),
        vertexShader: genshinGrassShader.vertexShader,
        fragmentShader: genshinGrassShader.fragmentShader,
        side: THREE.DoubleSide,
        lights: true,
        fog: true
    });

    instancedGrassMesh = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
    instancedGrassMesh.receiveShadow = true;
    instancedGrassMesh.count = 0; // Mulai dari 0 instance aktif (GPU draw call 0 saat kosong)

    const dummy = new THREE.Object3D();
    const colorsArray = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        grassCoordsX[i] = (Math.random() - 0.5) * areaSize;
        grassCoordsZ[i] = (Math.random() - 0.5) * areaSize;
        grassScalesArray[i] = 0.65 + Math.pow(Math.random(), 1.5) * 0.45;
        grassRotYArray[i] = Math.random() * Math.PI;

        dummy.position.set(grassCoordsX[i], -500, grassCoordsZ[i]);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instancedGrassMesh.setMatrixAt(i, dummy.matrix);
    }

    tuftGeo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colorsArray, 3));
    return { mesh: instancedGrassMesh, material: tuftMat };
}

const MAX_TRAMPLE_SEGMENTS = 48;
const trampleSegABArray = [];
const trampleSegDataArray = [];
for (let i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
    trampleSegABArray.push(new THREE.Vector4(0, 0, 0, 0));
    trampleSegDataArray.push(new THREE.Vector4(0, 0, 0, 0));
}

const genshinGrassShader = {
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        THREE.UniformsLib.fog,
        {
            uTexture: { value: grassTuftTexture },
            uTime: { value: 0 },
            uWindSpeed: { value: 1.0 },
            uTrampleSegAB: { value: trampleSegABArray },
            uTrampleSegData: { value: trampleSegDataArray },
            uTrampleCount: { value: 0 },
            uTrampleCenter: { value: new THREE.Vector2(0, 0) },
            uTrampleRadiusSq: { value: 0.0 }
        }
    ]),
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>
        #include <fog_pars_vertex>

        #define MAX_TRAMPLE_SEGMENTS 48
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec4 uTrampleSegAB[MAX_TRAMPLE_SEGMENTS];   // xy = A(x, z), zw = B(x, z)
        uniform vec4 uTrampleSegData[MAX_TRAMPLE_SEGMENTS]; // x = strength, y = radius
        uniform int uTrampleCount;
        uniform vec2 uTrampleCenter;
        uniform float uTrampleRadiusSq;

        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vInstanceColor;
        varying float vTrample;
        varying float vPlaneId;
        varying vec2 vInstPos;

        attribute vec3 instanceColor;
        attribute float aPlaneId;

        void main() {
            vUv = uv;
            vInstanceColor = instanceColor;
            vPlaneId = aPlaneId;
            vInstPos = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            vec3 pos = position;

            // Dapatkan posisi dasar rumpun rumput di koordinat dunia (world space)
            vec2 instXZ = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);

            // Hitung deformasi injakan kaki rubah & kapsul jejak langkah (Trample & Capsule Trail)
            float totalBend = 0.0;
            vec2 bendDir = vec2(0.0);

            // OPTIMASI RADIKAL O(1) BOUNDING CIRCLE:
            // Hanya rumput yang berada di sekitar jejak aktif rubah yang mengevaluasi loop trample.
            // 98% rumput di seluruh peta melewati loop ini sepenuhnya tanpa beban GPU!
            vec2 trailDelta = instXZ - uTrampleCenter;
            if (uTrampleCount > 0 && dot(trailDelta, trailDelta) <= uTrampleRadiusSq) {
                for (int i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
                    if (i >= uTrampleCount) break;
                    float rawStrength = uTrampleSegData[i].x;
                    if (rawStrength > 0.005) {
                        vec2 a = uTrampleSegAB[i].xy;
                        vec2 b = uTrampleSegAB[i].zw;
                        float rad = uTrampleSegData[i].y;

                        vec2 pa = instXZ - a;
                        vec2 ba = b - a;
                        float baLenSq = dot(ba, ba);
                        float h = (baLenSq > 0.0001) ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
                        vec2 diff = pa - ba * h;
                        float distSq = dot(diff, diff);
                        float radSq = rad * rad;

                        if (distSq < radSq) {
                            float dist = sqrt(distSq);
                            float t = 1.0 - (dist / rad);
                            // Hermite smoothstep untuk transisi tepian jejak dan pemulihan kenyal (elastic springback)
                            float smoothStrength = rawStrength * rawStrength * (3.0 - 2.0 * rawStrength);
                            float weight = (t * t * (3.0 - 2.0 * t)) * smoothStrength;
                            totalBend = max(totalBend, weight);
                            vec2 dir = (dist > 0.005) ? (diff / dist) : vec2(0.0, 1.0);
                            bendDir += dir * weight;
                        }
                    }
                }
            }

            float bendFactor = clamp(totalBend, 0.0, 1.0);
            vTrample = bendFactor;

            // Efek Angin (Meredam goyangan angin pada rumput yang sedang terinjak / roboh)
            if (uWindSpeed > 0.0) {
                float wave = sin(uTime * 3.2 * uWindSpeed + instanceMatrix[3][0] * 1.5 + instanceMatrix[3][2] * 1.5) * 0.22 * uWindSpeed;
                wave *= (1.0 - bendFactor * 0.75);
                pos.x += wave * pow(uv.y, 1.4);
            }

            // Efek Roboh Merunduk Alami (Bending):
            // Rumput HANYA merunduk (tidak gepeng tembus tanah, dan tidak disingkirkan ke samping yang membuat celah botak).
            // Pangkal rumput (uv.y = 0) tetap di tanah, ujungnya merunduk santai (~58% tinggi) sehingga tanah selalu tertutup hijau.
            if (bendFactor > 0.001) {
                float squash = mix(1.0, 0.58, bendFactor * pow(uv.y, 0.85));
                pos.y *= squash;

                // Lengkungkan ujung helai rumput merunduk lembut ke arah injakan (tanpa merusak formasi rumpun)
                vec2 leanOffset = (length(bendDir) > 0.001) ? normalize(bendDir) * 0.12 * bendFactor * pow(uv.y, 1.2) : vec2(0.0);
                pos.x += leanOffset.x;
                pos.z += leanOffset.y;
            }

            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
            vWorldPosition = worldPosition.xyz;

            vec3 objectNormal = vec3(0.0, 1.0, 0.0);
            vec3 transformedNormal = normalMatrix * objectNormal;

            vec4 mvPosition = viewMatrix * worldPosition;
            gl_Position = projectionMatrix * mvPosition;

            #include <shadowmap_vertex>
            #include <fog_vertex>
        }
    `,
    fragmentShader: `
        #include <common>
        #include <packing>
        #include <shadowmap_pars_fragment>
        #include <fog_pars_fragment>

        uniform sampler2D uTexture;
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vInstanceColor;
        varying float vTrample;
        varying float vPlaneId;
        varying vec2 vInstPos;

        void main() {
            vec4 texColor = texture2D(uTexture, vUv);
            if (texColor.a < 0.35) discard;

            vec3 baseColor = vInstanceColor;

            // Cek apakah jenis rumput ini adalah mode MIX (ditandai dengan nilai channel b ~ 0.42)
            bool isMix = abs(vInstanceColor.b - 0.42) < 0.04;
            if (isMix) {
                // Pseudo-random seed murni per instance rumpun (bebas dari pembagian grid / tanpa petak-petak)
                float instHash = fract(sin(dot(vInstPos, vec2(12.9898, 78.233))) * 43758.5453);

                // Distribusi harmonik warna yang merata & alami di setiap helai rumput dalam rumpun
                // 56.55 rad / 2pi ~ 9 helai pada vUv.x; fasa melompat ~280° antar helai sehingga tiap helai berbeda
                float bladeAngle = vUv.x * 56.55 + vPlaneId * 2.0944 + instHash * 6.2831;
                float w1 = sin(bladeAngle);
                float w2 = sin(bladeAngle * 2.0 + 1.25);

                // t berosilasi seimbang di sekitar 0.50: setiap rumpun memiliki proporsi seimbang
                // antara helai tua, matang, dan terang (rata merata di seluruh hamparan padang rumput)
                float t = clamp(0.50 + w1 * 0.35 + w2 * 0.15, 0.0, 1.0);

                bool isYellowMix = (vInstanceColor.r >= 0.50);
                if (!isYellowMix) {
                    // RUMPUT HIJAU MIX:
                    // Kombinasi alami merata: Hijau Tua Pekat, Hijau Matang Segar, Hijau Agak Terang Bersinar
                    vec3 darkGreen   = vec3(0.14, 0.46, 0.11); // Hijau tua lebat alami
                    vec3 midGreen    = vec3(0.28, 0.70, 0.14); // Hijau matang segar padang rumput
                    vec3 brightGreen = vec3(0.52, 0.85, 0.18); // Hijau muda cerah bersinar

                    if (t < 0.50) {
                        baseColor = mix(darkGreen, midGreen, t / 0.50);
                    } else {
                        baseColor = mix(midGreen, brightGreen, (t - 0.50) / 0.50);
                    }
                } else {
                    // RUMPUT KUNING MIX:
                    // Kombinasi alami merata: Kuning Tua Keemasan, Kuning Matang, Kuning Terang Lemon
                    vec3 darkYellow   = vec3(0.68, 0.44, 0.08); // Kuning tua / oker keemasan
                    vec3 midYellow    = vec3(0.88, 0.68, 0.12); // Kuning matang emas ladang
                    vec3 brightYellow = vec3(0.98, 0.88, 0.28); // Kuning muda cerah bersinar

                    if (t < 0.50) {
                        baseColor = mix(darkYellow, midYellow, t / 0.50);
                    } else {
                        baseColor = mix(midYellow, brightYellow, (t - 0.50) / 0.50);
                    }
                }
            }

            vec3 grassColor = mix(baseColor * 0.70, baseColor * 1.15, pow(vUv.y, 0.85));

            // Efek bekas injakan: rumput yang terinjak tampak lebih gelap, pekat & berbayang (crushed tone)
            // Rumput tetap tampak lebat di tanah, namun bernuansa hijau tua pekat sebagai tanda bekas pijakan
            vec3 trampledShade = grassColor * vec3(0.50, 0.58, 0.44);
            grassColor = mix(grassColor, trampledShade, vTrample * 0.85);

            float shadowVal = 1.0;
            #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                shadowVal = getShadow(
                    directionalShadowMap[0],
                    directionalLightShadows[0].shadowMapSize,
                    directionalLightShadows[0].shadowBias,
                    directionalLightShadows[0].shadowRadius,
                    vDirectionalShadowCoord[0]
                );
            #endif

            float softShadow = smoothstep(0.0, 0.9, shadowVal);
            vec3 finalLighting = mix(grassColor * 0.35, grassColor * 1.05, softShadow);

            gl_FragColor = vec4(finalLighting, 1.0);
            #include <fog_fragment>
        }
    `
};

const grassSystem = createGrassGridSystem(maxGrassCapacity, 72);
scene.add(grassSystem.mesh);

const worldUp = new THREE.Vector3(0, 1, 0);
const blendedNormal = new THREE.Vector3();
const quat = new THREE.Quaternion();

function compactGrass() {
    let writeIdx = 0;
    const colorAttr = (instancedGrassMesh && instancedGrassMesh.geometry) ? instancedGrassMesh.geometry.attributes.instanceColor : null;

    for (let readIdx = 0; readIdx < maxGrassCapacity; readIdx++) {
        if (grassActiveStates[readIdx] === 1) {
            if (writeIdx !== readIdx) {
                grassActiveStates[writeIdx] = 1;
                grassActiveStates[readIdx] = 0;
                grassCoordsX[writeIdx] = grassCoordsX[readIdx];
                grassCoordsZ[writeIdx] = grassCoordsZ[readIdx];
                grassScalesArray[writeIdx] = grassScalesArray[readIdx];
                grassRotYArray[writeIdx] = grassRotYArray[readIdx];
                if (colorAttr) {
                    colorAttr.setXYZ(
                        writeIdx,
                        colorAttr.getX(readIdx),
                        colorAttr.getY(readIdx),
                        colorAttr.getZ(readIdx)
                    );
                }
            }
            writeIdx++;
        }
    }
    if (colorAttr) colorAttr.needsUpdate = true;
    return writeIdx;
}

function rebuildGrassTransforms() {
    // 1. Padatkan seluruh rumput aktif ke indeks awal secara teratur (0 ... activeCount - 1)
    const activeCount = compactGrass();
    const dummy = new THREE.Object3D();
    const grassFraction = PandoraSettings.preset().grassFraction;

    // 2. Hanya hitung transformasi & matriks untuk instance yang BENAR-BENAR aktif
    for (let i = 0; i < activeCount; i++) {
        const gx = grassCoordsX[i];
        const gz = grassCoordsZ[i];

        const terrainY = getTerrainHeightFast(gx, gz);
        const terrainNormal = getTerrainNormalAt(gx, gz);

        blendedNormal.copy(terrainNormal).lerp(worldUp, 0.2).normalize();
        quat.setFromUnitVectors(worldUp, blendedNormal);

        dummy.position.set(gx, terrainY, gz);
        dummy.rotation.setFromQuaternion(quat);
        dummy.rotateY(grassRotYArray[i]);

        const slopeFactor = 1.0 - terrainNormal.dot(worldUp);
        const slopeScaleBoost = 1.0 + slopeFactor * 0.75;

        // Di build, helai yang lebih sedikit dibuat lebih lebar agar tanah tetap tertutup
        const coverage = window.PANDORA_RUNTIME ? 1 / Math.sqrt(grassFraction) : 1;
        const scaleXZ = 0.95 * slopeScaleBoost * coverage;
        const scaleY = grassScalesArray[i] * slopeScaleBoost;
        // Preset grafis rendah menyembunyikan sebagian helai secara merata (urutan indeks tidak berpola)
        const keep = window.PANDORA_RUNTIME || ((i * 0.6180339887) % 1) < grassFraction;
        dummy.scale.set(keep ? scaleXZ : 0, keep ? scaleY : 0, keep ? scaleXZ : 0);
        dummy.updateMatrix();
        instancedGrassMesh.setMatrixAt(i, dummy.matrix);
    }

    // 3. Batasi draw call WebGL HANYA sejumlah instance aktif (tidak menyiksa GPU memproses 100k slot kosong)
    // Di build urutan rumput sudah diacak, jadi cukup menggambar bagian awal; helai skala 0 tetap memakan GPU
    instancedGrassMesh.count = window.PANDORA_RUNTIME ? Math.round(activeCount * grassFraction) : activeCount;
    instancedGrassMesh.instanceMatrix.needsUpdate = true;
}

function updateTreesAndGrassPositions() {
    rebuildGrassTransforms();
    treesList.forEach(t => {
        t.position.y = getTerrainHeightFast(t.position.x, t.position.z);
    });
    if (typeof rocksList !== 'undefined') {
        rocksList.forEach(r => {
            const gy = getTerrainHeightFast(r.position.x, r.position.z);
            const h = (r.userData && r.userData.heightScale) ? r.userData.heightScale : r.scale.y;
            r.position.y = gy + (h * 0.42);
        });
    }
    if (typeof rebuildFlowerTransforms === 'function') {
        rebuildFlowerTransforms();
    }
}

// ==========================================
// SCORCHED / BURNED GRASS EFFECT (PERMANENT)
// ==========================================
function burnGrassInRadius(centerPos, radius) {
    if (!instancedGrassMesh || !instancedGrassMesh.geometry) return;
    const colorAttr = instancedGrassMesh.geometry.attributes.instanceColor;
    if (!colorAttr) return;

    let updated = false;
    const currentCount = instancedGrassMesh.count || 0;
    const radSq = radius * radius;

    for (let i = 0; i < currentCount; i++) {
        if (grassActiveStates[i] === 1) {
            const gx = grassCoordsX[i];
            const gz = grassCoordsZ[i];
            const gy = getTerrainHeightFast(gx, gz);

            const dx = gx - centerPos.x;
            const dy = gy - centerPos.y;
            const dz = gz - centerPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq <= radSq) {
                const dist = Math.sqrt(distSq);
                const falloff = dist / radius; // 0 di pusat ledakan, 1 di pinggir
                
                // Ambil warna rumput saat ini
                const curR = colorAttr.getX(i);
                const curG = colorAttr.getY(i);
                const curB = colorAttr.getZ(i);

                // Warna arang hitam pekat di pusat kawah ledakan
                const burnR = 0.030;
                const burnG = 0.026;
                const burnB = 0.022;

                // Bobot gosong pekat di tengah, memudar halus ke warna rumput asli di pinggir (compact & organic)
                const burnWeight = Math.pow(Math.max(0, 1.0 - falloff), 1.6);
                const newR = THREE.MathUtils.lerp(curR, burnR, burnWeight);
                const newG = THREE.MathUtils.lerp(curG, burnG, burnWeight);
                const newB = THREE.MathUtils.lerp(curB, burnB, burnWeight);

                colorAttr.setXYZ(i, newR, newG, newB);

                // Rumput yang terbakar hangus sedikit menyusut
                grassScalesArray[i] *= THREE.MathUtils.lerp(1.0, 0.78, burnWeight);
                updated = true;
            }
        }
    }

    if (updated) {
        colorAttr.needsUpdate = true;
        rebuildGrassTransforms();
    }
}
window.burnGrassInRadius = burnGrassInRadius;

// ==========================================
// REALISTIC GRASS TRAMPLING & CAPSULE TRAIL SIMULATION
// ==========================================
const trampleSegments = [];
for (let i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
    trampleSegments.push({
        ax: 0, az: 0,
        bx: 0, bz: 0,
        strength: 0,
        radius: 0.54
    });
}

// Setiap karakter yang berjalan punya jejak sendiri; slot kapsul dipakai bersama
function createTrampleWalker() {
    return { active: -1, prevX: 99999, prevZ: 99999, lastFwdX: 0, lastFwdZ: 0, stationary: 0 };
}
const playerTrampleWalker = createTrampleWalker();
const enemyTrampleWalkers = new Map();
const TRAMPLE_FIRST_TRAIL_SLOT = 2;
const ENEMY_TRAMPLE_RANGE = 45;

// Durasi robohnya rumput (7.5 detik hingga pulih tegak kembali normal)
// Waktu pemulihan konsisten di setiap kecepatan (kecepatan lari fox tidak mempengaruhi durasi)
const TRAMPLE_RECOVERY_TIME = 7.5;
const MAX_SEG_LENGTH = 1.8; // Panjang maksimal satu kapsul sebelum membuat segmen baru (meter)

function isTrailSlotInUse(slot) {
    if (playerTrampleWalker.active === slot) return true;
    for (const walker of enemyTrampleWalkers.values()) {
        if (walker.active === slot) return true;
    }
    return false;
}

function stepTrampleWalker(walker, x, z, fwdX, fwdZ, dt) {
    const isMoving = Math.hypot(x - walker.prevX, z - walker.prevZ) > 0.008;
    walker.prevX = x;
    walker.prevZ = z;

    if (!isMoving) {
        walker.stationary += dt;
        // Saat berhenti, tutup segmen jejak aktif agar mulai proses pemulihan (decay)
        if (walker.stationary > 0.22) walker.active = -1;
        return;
    }
    walker.stationary = 0;

    if (walker.active < TRAMPLE_FIRST_TRAIL_SLOT) {
        // Cari slot dengan kekuatan terendah (yang sudah pulih 0 atau paling tua)
        let bestSlot = -1;
        let lowestStrength = 999;
        for (let i = TRAMPLE_FIRST_TRAIL_SLOT; i < MAX_TRAMPLE_SEGMENTS; i++) {
            if (trampleSegments[i].strength < lowestStrength && !isTrailSlotInUse(i)) {
                lowestStrength = trampleSegments[i].strength;
                bestSlot = i;
                if (lowestStrength <= 0.005) break;
            }
        }
        if (bestSlot < 0) return;
        walker.active = bestSlot;
        const cur = trampleSegments[bestSlot];
        cur.ax = x;
        cur.az = z;
        cur.bx = x;
        cur.bz = z;
        cur.strength = 1.0;
        cur.radius = 0.54;
        walker.lastFwdX = fwdX;
        walker.lastFwdZ = fwdZ;
        return;
    }

    const cur = trampleSegments[walker.active];
    cur.bx = x;
    cur.bz = z;
    cur.strength = 1.0;

    // Kapsul cukup panjang atau berbelok tajam: segel dan buat kapsul baru di frame berikutnya
    const segLen = Math.hypot(cur.bx - cur.ax, cur.bz - cur.az);
    const turnDot = fwdX * walker.lastFwdX + fwdZ * walker.lastFwdZ;
    if (segLen >= MAX_SEG_LENGTH || (segLen > 0.45 && turnDot < 0.88)) {
        walker.active = -1;
    }
}

function updateEnemyTrample(dt) {
    const agents = (typeof FoxAIManager !== 'undefined' && FoxAIManager.agents) ? FoxAIManager.agents : [];
    const center = wolfCharacter.root.position;
    const seen = new Set();
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        if (!agent || agent.isDead || !agent.root || !agent.root.visible) continue;
        const pos = agent.root.position;
        if (Math.hypot(pos.x - center.x, pos.z - center.z) > ENEMY_TRAMPLE_RANGE) continue;
        seen.add(agent);
        if (!enemyTrampleWalkers.has(agent)) enemyTrampleWalkers.set(agent, createTrampleWalker());
        const walker = enemyTrampleWalkers.get(agent);
        if (agent.isGrounded === false) {
            walker.active = -1;
            continue;
        }
        const rotY = agent.root.rotation.y || 0;
        stepTrampleWalker(walker, pos.x, pos.z, Math.sin(rotY), Math.cos(rotY), dt);
    }
    for (const agent of Array.from(enemyTrampleWalkers.keys())) {
        if (!seen.has(agent)) enemyTrampleWalkers.delete(agent);
    }
}

function updateGrassTrample(dt) {
    if (!grassSystem || !grassSystem.material || !grassSystem.material.uniforms) return;
    const shaderUniforms = grassSystem.material.uniforms;
    if (!shaderUniforms.uTrampleSegAB || !shaderUniforms.uTrampleSegData) return;

    // 1. Reduksi bertahap (decay) semua segmen jejak yang sudah dilewati (berdasarkan waktu murni)
    for (let i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
        const seg = trampleSegments[i];
        if (seg.strength > 0 && !isTrailSlotInUse(i)) {
            seg.strength = Math.max(0, seg.strength - dt / TRAMPLE_RECOVERY_TIME);
        }
    }

    // 2. Jika dalam Mode Play Demo & Karakter Aktif:
    if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
        const foxPos = wolfCharacter.root.position;
        const grounded = typeof isGrounded !== 'undefined' ? isGrounded : true;

        if (grounded) {
            const rotY = wolfCharacter.root.rotation.y || 0;
            const fwdX = -Math.cos(rotY);
            const fwdZ = Math.sin(rotY);

            // Kontak kaki depan dan belakang
            trampleSegments[0].ax = foxPos.x + fwdX * 0.32;
            trampleSegments[0].az = foxPos.z + fwdZ * 0.32;
            trampleSegments[0].bx = trampleSegments[0].ax;
            trampleSegments[0].bz = trampleSegments[0].az;
            trampleSegments[0].strength = 1.0;
            trampleSegments[0].radius = 0.52;

            trampleSegments[1].ax = foxPos.x - fwdX * 0.26;
            trampleSegments[1].az = foxPos.z - fwdZ * 0.26;
            trampleSegments[1].bx = trampleSegments[1].ax;
            trampleSegments[1].bz = trampleSegments[1].az;
            trampleSegments[1].strength = 1.0;
            trampleSegments[1].radius = 0.48;

            stepTrampleWalker(playerTrampleWalker, foxPos.x, foxPos.z, fwdX, fwdZ, dt);
        } else {
            // Jika melompat di udara, kaki tidak menginjak rumput
            playerTrampleWalker.active = -1;
            trampleSegments[0].strength = Math.max(0, trampleSegments[0].strength - dt * 2.5);
            trampleSegments[1].strength = Math.max(0, trampleSegments[1].strength - dt * 2.5);
        }
        updateEnemyTrample(dt);
    }

    // 3. Masukkan data ke array uniform shader Three.js
    const abArr = shaderUniforms.uTrampleSegAB.value;
    const dataArr = shaderUniforms.uTrampleSegData.value;
    let activeCount = 0;

    let minX = 999999, maxX = -999999, minZ = 999999, maxZ = -999999;
    let maxSegRadius = 0.55;

    for (let i = 0; i < MAX_TRAMPLE_SEGMENTS; i++) {
        const seg = trampleSegments[i];
        if (seg.strength > 0.005) {
            if (abArr[activeCount]) {
                abArr[activeCount].set(seg.ax, seg.az, seg.bx, seg.bz);
            }
            if (dataArr[activeCount]) {
                dataArr[activeCount].set(seg.strength, seg.radius, 0, 0);
            }

            minX = Math.min(minX, seg.ax, seg.bx);
            maxX = Math.max(maxX, seg.ax, seg.bx);
            minZ = Math.min(minZ, seg.az, seg.bz);
            maxZ = Math.max(maxZ, seg.az, seg.bz);
            if (seg.radius > maxSegRadius) maxSegRadius = seg.radius;

            activeCount++;
        }
    }

    for (let i = activeCount; i < MAX_TRAMPLE_SEGMENTS; i++) {
        if (abArr[i]) abArr[i].set(0, 0, 0, 0);
        if (dataArr[i]) dataArr[i].set(0, 0, 0, 0);
    }

    shaderUniforms.uTrampleCount.value = activeCount;

    // Perbarui koordinat Bounding Circle jejak rubah untuk O(1) early-rejection di GPU Vertex Shader
    if (activeCount > 0 && shaderUniforms.uTrampleCenter && shaderUniforms.uTrampleRadiusSq) {
        const cX = (minX + maxX) * 0.5;
        const cZ = (minZ + maxZ) * 0.5;
        const spanX = (maxX - minX) * 0.5 + maxSegRadius + 0.35;
        const spanZ = (maxZ - minZ) * 0.5 + maxSegRadius + 0.35;
        const boundRadius = Math.hypot(spanX, spanZ);
        shaderUniforms.uTrampleCenter.value.set(cX, cZ);
        shaderUniforms.uTrampleRadiusSq.value = boundRadius * boundRadius;
    } else if (shaderUniforms.uTrampleRadiusSq) {
        shaderUniforms.uTrampleRadiusSq.value = 0.0;
    }
}
