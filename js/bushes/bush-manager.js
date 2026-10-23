/* ========================================================
   REALISTIC BOTANICAL BUSH (SEMAK BELUKAR) MANAGER
   Based on Semak-Belukar.html procedural instanced leaf blades,
   cel-shaded toon lighting, and LOCALIZED fox physics interaction
   where leaves bend, part, and rustle ONLY along the fox path.
   ======================================================== */

// Global state for Bushes
const bushesGroup = new THREE.Group();
bushesGroup.name = 'bushesGroup';
if (typeof scene !== 'undefined') {
    scene.add(bushesGroup);
}

const bushesList = [];
window.bushesList = bushesList;

// Parameter kuas semak belukar
const bushParams = {
    brushRadius: 3.5,
    bushDensity: 2,
    bushSize: 1.5
};

// PRNG Generator reproducible
function bushRng(seed) {
    let s = (seed || 123456789) | 0;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 1. BASE LEAF GEOMETRY (FROM Semak-Belukar.html leafGeo)
function createBaseLeafGeometry() {
    const N = 7;
    const pos = [];
    const idx = [];
    for (let i = 0; i < N; i++) {
        const h = i / (N - 1);
        const w = 0.26 * Math.sin(Math.PI * Math.pow(h, 0.7));
        const f = 0.05 * Math.sin(Math.PI * h);
        pos.push(-w, h, 0, 0, h, f, w, h, 0);
    }
    for (let i = 0; i < N - 1; i++) {
        const b = i * 3;
        idx.push(b, b + 1, b + 3, b + 1, b + 4, b + 3, b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
}

const sharedBaseLeafGeo = createBaseLeafGeometry();

// 2. UNIFORMS BERSAMA (SHARED UNIFORMS)
const FOX_TRAIL_COUNT = 6;
const foxTrailUniformArray = [];
for (let i = 0; i < FOX_TRAIL_COUNT; i++) {
    foxTrailUniformArray.push(new THREE.Vector4(0, -999, 0, -999));
}

const sharedBushUniforms = {
    uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(-0.6, 0.42, -0.55).normalize() },
    uFogCol: { value: new THREE.Vector3(0.85, 0.94, 0.84) },
    uFogDen: { value: 0.0 },
    uFoxPos: { value: new THREE.Vector3(0, -999, 0) },
    uFoxHead: { value: new THREE.Vector3(0, -999, 0) },
    uFoxDir: { value: new THREE.Vector3(0, 0, 1) },
    uFoxSpeed: { value: 0.0 },
    uFoxActive: { value: 0.0 },
    uFoxTrail: { value: foxTrailUniformArray }
};

// 3. GLSL SHADER CODE DENGAN INTERAKSI LOKAL RUBAH (LOCALIZED FOX INTERACTION)
const BUSH_COMMON_GLSL = `
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uFogCol;
uniform float uFogDen;

uniform vec3 uFoxPos;
uniform vec3 uFoxHead;
uniform vec3 uFoxDir;
uniform float uFoxSpeed;
uniform float uFoxActive;
#define FOX_TRAIL_COUNT 6
uniform vec4 uFoxTrail[FOX_TRAIL_COUNT];

vec2 windAt(vec3 p) {
    float t = uTime;
    float big = sin(p.x * 0.11 + p.z * 0.07 + t * 0.9);
    float gust = sin(p.x * 0.045 - t * 0.55) * sin(p.z * 0.06 + t * 0.4);
    float fl = sin(p.x * 1.7 + p.z * 1.3 + t * 3.1) * 0.25 + sin(p.x * 3.1 - p.z * 2.3 + t * 4.7) * 0.12;
    return vec2(0.55 * big + 0.9 * gust + fl, 0.4 * sin(p.x * 0.09 + t * 0.8 + 1.7) + fl * 0.5);
}
`;

const BUSH_LIGHTING_GLSL = `
vec3 toonLit(vec3 a, vec3 n, vec3 V, float ao, float trans) {
    float ndl = dot(n, uSun) * 0.5 + 0.5;
    float lit = smoothstep(0.34, 0.62, ndl);
    vec3 shade = a * vec3(0.38, 0.60, 0.80) + vec3(0.0, 0.03, 0.05);
    vec3 light = a * vec3(1.10, 1.06, 0.90);
    vec3 c = mix(shade, light, lit) * ao;
    float back = pow(clamp(dot(V, -uSun), 0.0, 1.0), 3.0);
    c += vec3(0.50, 0.60, 0.10) * back * trans * ao;
    float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    c += vec3(0.35, 0.45, 0.18) * rim * 0.16 * lit * trans;
    return c;
}

vec3 applyFog(vec3 c, vec3 wp) {
    if (uFogDen <= 0.00001) return c;
    vec3 d = wp - cameraPosition;
    float dist = length(d);
    float f = 1.0 - exp(-pow(dist * uFogDen, 2.0));
    float sa = pow(clamp(dot(normalize(d), uSun), 0.0, 1.0), 5.0);
    return mix(c, uFogCol + vec3(0.20, 0.14, 0.04) * sa, clamp(f, 0.0, 1.0));
}
`;

const BUSH_VERTEX_SHADER = BUSH_COMMON_GLSL + `
attribute vec3 iPos;
attribute vec4 iQ;
attribute vec3 iS;
attribute vec4 iC;

varying vec3 vN, vW;
varying float vH, vRel, vDep, vR, vBH, vX;

vec3 qr(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main() {
    float h = position.y;
    vec3 localLeaf = qr(iQ, vec3(position.x, h, position.z) * iS.x);
    localLeaf.y -= h * h * iS.x * 0.22;
    vec3 wp = iPos + localLeaf;

    // Koordinat pusat semak & parameter ellipsoid
    vec3 d = iPos - vec3(iC.x, iPos.y, iC.y);
    vec3 ax = vec3(iC.z, max(iC.w, 0.5), iC.z);
    float top = clamp((iPos.y - (iC.w > 0.0 ? 0.0 : 0.0)) / max(iC.w, 0.5), 0.0, 1.0);

    // Goyangan angin alami (Ambient botanical wind sway dari Semak-Belukar.html)
    vec2 w = windAt(iPos);
    wp.xz += w * (0.02 + 0.08 * top) * (0.3 + h * 0.7);
    wp.y += sin(uTime * 3.0 + iS.y * 40.0) * 0.018 * h;

    // ==============================================================
    // INTERAKSI FISIK LOKAL SAAT DILEWATI RUBAH (LOCALIZED FOX PHYSICS)
    // HANYA bagian semak yang dilewati tubuh rubah yang bersibak & bergoyang!
    // ==============================================================
    if (uFoxActive > 0.5) {
        // 1. KAPSUL TUBUH RUBAH (Dari pangkal panggul/ekor ke dada/kepala)
        vec3 pA = uFoxPos - vec3(uFoxDir.x, 0.0, uFoxDir.z) * 0.42;
        vec3 pB = uFoxHead;
        vec3 ab = pB - pA;
        float abLenSq = max(dot(ab, ab), 0.0001);
        float tSeg = clamp(dot(wp - pA, ab) / abLenSq, 0.0, 1.0);
        vec3 nearestPointOnFox = pA + ab * tSeg;

        vec3 offsetFromFox = wp - nearestPointOnFox;
        // Profil bentuk tubuh rubah (anisotropik: sedikit lebih toleran vertikal)
        vec3 scaledDist = vec3(offsetFromFox.x, offsetFromFox.y * 1.35, offsetFromFox.z);
        float distToFox = length(scaledDist);

        // Radius kontak fisik rubah menembus semak (~0.75 meter)
        float contactRadius = 0.75;
        if (distToFox < contactRadius) {
            float normDist = distToFox / contactRadius;
            // Kurva Hermite halus untuk dorongan kenyal dan alami
            float strength = (1.0 - normDist);
            strength = strength * strength * (3.0 - 2.0 * strength);

            // Arah dorongan menyibak menjauhi sumbu tubuh rubah
            vec3 pushDir = (distToFox > 0.01) ? normalize(offsetFromFox) : vec3(0.0, 1.0, 0.0);

            // A. Menyibak ke samping (Parting / brush-aside)
            wp.xz += pushDir.xz * (strength * 0.52);

            // B. Rebah / tertekan ke bawah saat terinjak atau tersenggol badan rubah
            wp.y -= strength * 0.35 * (1.0 - clamp(abs(pushDir.y), 0.0, 1.0) * 0.4);

            // C. Terseret searah gerakan langkah rubah (Forward drag)
            float speedMult = clamp(0.6 + uFoxSpeed * 0.3, 0.6, 1.4);
            wp.xz += uFoxDir.xz * (strength * 0.28 * speedMult);

            // D. Getaran desiran daun berisik saat tergesek bulu rubah (High-frequency foliage rustle)
            float rustleSpeed = 28.0 + uFoxSpeed * 10.0;
            float rustleVal = sin(uTime * rustleSpeed + iS.y * 55.0 + wp.x * 14.0);
            wp.y += rustleVal * (strength * 0.08);
            wp.xz += vec2(-pushDir.z, pushDir.x) * (rustleVal * strength * 0.06);
        }

        // 2. GELOMBANG PEMULIHAN PEGAS (TRAILING REBOUND SPRING)
        // Bagian semak yang baru saja dilewati bergetar elastis ~0.8 detik lalu tenang kembali
        for (int i = 0; i < FOX_TRAIL_COUNT; i++) {
            vec4 tr = uFoxTrail[i];
            float age = uTime - tr.w;
            if (age > 0.02 && age < 0.90) {
                vec3 trPos = tr.xyz;
                float dTrailXZ = length(wp.xz - trPos.xz);
                float dTrailY = abs(wp.y - trPos.y);
                if (dTrailXZ < 0.72 && dTrailY < 0.80) {
                    float trWeight = (1.0 - dTrailXZ / 0.72) * (1.0 - dTrailY / 0.80);
                    // Damped oscillation (getaran pegas memudar)
                    float spring = exp(-age * 4.6) * sin(age * 16.0) * trWeight * 0.22;
                    wp.y += spring;
                    wp.xz += uFoxDir.xz * (spring * 0.35);
                }
            }
        }
    }

    // Normal semi-spherical + daun lokal
    vec3 sn = normalize(d / (ax * ax));
    vec3 ln = qr(iQ, normalize(vec3(sign(position.x) * 0.45, 0.0, 1.0)));
    if (dot(ln, sn) < 0.0) ln = -ln;
    vN = normalize(mix(ln, sn, 0.5));

    vW = wp;
    vH = h;
    vRel = top;
    vDep = length(d / ax);
    vR = iS.y;
    vBH = iS.z;
    vX = position.x;

    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

function createBushFragmentShader(theme) {
    let colDark, colMid, colHi, colYel;

    if (theme === 'autumn') {
        colDark = 'vec3(0.32, 0.20, 0.06)';
        colMid = 'vec3(0.68, 0.45, 0.14)';
        colHi = 'vec3(0.92, 0.72, 0.22)';
        colYel = 'vec3(0.98, 0.88, 0.42)';
    } else if (theme === 'forest') {
        colDark = 'vec3(0.04, 0.22, 0.24)';
        colMid = 'vec3(0.12, 0.44, 0.22)';
        colHi = 'vec3(0.42, 0.70, 0.22)';
        colYel = 'vec3(0.70, 0.80, 0.30)';
    } else {
        // Lush green default (Semak-Belukar.html)
        colDark = 'vec3(0.06, 0.32, 0.30)';
        colMid = 'vec3(0.18, 0.55, 0.24)';
        colHi = 'vec3(0.56, 0.80, 0.24)';
        colYel = 'vec3(0.80, 0.86, 0.36)';
    }

    return BUSH_COMMON_GLSL + BUSH_LIGHTING_GLSL + `
    varying vec3 vN, vW;
    varying float vH, vRel, vDep, vR, vBH, vX;

    void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 n = normalize(vN);

        vec3 dark = ${colDark};
        vec3 mid  = ${colMid};
        vec3 hi   = ${colHi};
        vec3 yel  = ${colYel};

        vec3 a = mix(dark, mid, smoothstep(0.0, 0.5, vRel));
        a = mix(a, hi, smoothstep(0.35, 0.95, vRel) * 0.9);
        a = mix(a, yel, smoothstep(0.7, 1.0, vH) * 0.22 + vBH * 0.16);

        float v = vR - 0.5;
        a = mix(a, yel, max(v, 0.0) * 0.5);
        a = mix(a, vec3(0.08, 0.46, 0.42), max(-v, 0.0) * 0.5);

        // Tulang daun tengah (Leaf vein rib)
        float rib = smoothstep(0.035, 0.0, abs(vX));
        a += vec3(0.12, 0.14, 0.04) * rib;
        a += vec3(0.05, 0.07, 0.02) * smoothstep(0.92, 1.0, sin(vH * 18.0 - abs(vX) * 26.0));

        // Ambient occlusion kedalaman semak
        float ao = mix(0.32, 1.0, smoothstep(0.15, 0.95, vDep)) * mix(0.55, 1.0, smoothstep(0.0, 0.35, vRel));

        vec3 col = toonLit(a, n, V, ao, 0.9);
        col += vec3(1.0, 0.95, 0.7) * pow(max(dot(n, normalize(uSun + V)), 0.0), 30.0) * 0.14 * ao;

        gl_FragColor = vec4(applyFog(col, vW), 1.0);
    }
    `;
}

// 4. PRESET SHARED MATERIALS
const bushMaterials = {
    lush: new THREE.ShaderMaterial({
        uniforms: sharedBushUniforms,
        vertexShader: BUSH_VERTEX_SHADER,
        fragmentShader: createBushFragmentShader('lush'),
        side: THREE.DoubleSide
    }),
    forest: new THREE.ShaderMaterial({
        uniforms: sharedBushUniforms,
        vertexShader: BUSH_VERTEX_SHADER,
        fragmentShader: createBushFragmentShader('forest'),
        side: THREE.DoubleSide
    }),
    autumn: new THREE.ShaderMaterial({
        uniforms: sharedBushUniforms,
        vertexShader: BUSH_VERTEX_SHADER,
        fragmentShader: createBushFragmentShader('autumn'),
        side: THREE.DoubleSide
    })
};

// 5. PEMBUAT GEOMETRI INSTANCED SEMAK TUNGGAL
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tempQ1 = new THREE.Quaternion();
const tempQ2 = new THREE.Quaternion();
const tempDv = new THREE.Vector3();

function generateBushInstancedMesh(bx, by, bz, radius, hy, bushType, seed) {
    const R = bushRng(seed);
    const ry = radius * hy;
    const hue = R();
    const leafCount = Math.floor(70 + 260 * radius * hy);

    const lP = [];
    const lQ = [];
    const lS = [];
    const lC = [];

    for (let i = 0; i < leafCount; i++) {
        let ux = R() * 2 - 1;
        let uy = Math.abs(R() * 2 - 1);
        let uz = R() * 2 - 1;
        const m = Math.hypot(ux, uy, uz) || 1;
        ux /= m;
        uy /= m;
        uz /= m;

        // Distribusi kluster daun rimbun ke permukaan dome (f dari 0.35 ke 1.0)
        const f = 0.35 + 0.65 * Math.pow(R(), 0.4);
        const lx = bx + ux * radius * f;
        const ly = by + uy * ry * f;
        const lz = bz + uz * radius * f;
        lP.push(lx, ly, lz);

        // Arah orientasi menghadap keluar dome dengan sedikit variasi acak
        tempDv.set(
            ux + (R() - 0.5) * 0.7,
            uy + 0.35 + (R() - 0.5) * 0.5,
            uz + (R() - 0.5) * 0.7
        ).normalize();

        tempQ1.setFromUnitVectors(Y_AXIS, tempDv);
        tempQ2.setFromAxisAngle(tempDv, R() * 6.2832);
        tempQ1.premultiply(tempQ2);
        lQ.push(tempQ1.x, tempQ1.y, tempQ1.z, tempQ1.w);

        // Ukuran daun dan variasi warna
        const leafScale = (0.32 + 0.28 * R()) * (0.95 + 0.14 * radius);
        lS.push(leafScale, R(), hue);

        // Data pusat dan dimensi semak
        lC.push(bx, bz, radius, ry);
    }

    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.setIndex(sharedBaseLeafGeo.getIndex());
    instGeo.setAttribute('position', sharedBaseLeafGeo.getAttribute('position'));

    instGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(lP), 3));
    instGeo.setAttribute('iQ', new THREE.InstancedBufferAttribute(new Float32Array(lQ), 4));
    instGeo.setAttribute('iS', new THREE.InstancedBufferAttribute(new Float32Array(lS), 3));
    instGeo.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(lC), 4));
    instGeo.instanceCount = leafCount;

    let mat = bushMaterials.lush;
    if (bushType === 'spawn_bush_autumn') {
        mat = bushMaterials.autumn;
    } else if (bushType === 'spawn_bush_giant') {
        mat = bushMaterials.forest;
    }

    const mesh = new THREE.Mesh(instGeo, mat);
    mesh.frustumCulled = false;
    mesh.userData = {
        isBush: true,
        posX: bx,
        posY: by,
        posZ: bz,
        radius: radius,
        hy: hy,
        bushType: bushType,
        seed: seed
    };

    return mesh;
}

// 6. KUAS SPAWN & REMOVE SEMAK (BRUSH PLACEMENT)
function placeBushesAt(hitPoint, bushType) {
    if (!hitPoint || bushType === 'none' || bushType === 'remove') return;

    const brushRadius = bushParams.brushRadius;
    const density = bushParams.bushDensity;
    const baseSize = bushParams.bushSize;

    const count = (brushRadius <= 1.5) ? 1 : Math.max(1, Math.round(density * (brushRadius / 3.5)));

    for (let c = 0; c < count; c++) {
        let spawnX = hitPoint.x;
        let spawnZ = hitPoint.z;

        if (brushRadius > 1.2 && count > 1) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * brushRadius * 0.85;
            spawnX += Math.cos(angle) * dist;
            spawnZ += Math.sin(angle) * dist;
        }

        // Cek jarak minimum agar semak tidak tumpang tindih berlebihan
        let tooClose = false;
        for (let i = 0; i < bushesList.length; i++) {
            const existing = bushesList[i].userData;
            const dist = Math.hypot(existing.posX - spawnX, existing.posZ - spawnZ);
            if (dist < 1.1) {
                tooClose = true;
                break;
            }
        }
        if (tooClose && count > 1) continue;

        const spawnY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(spawnX, spawnZ)
            : hitPoint.y;

        // Tentukan radius dan rasio ketinggian sesuai varian kuas
        let rad = baseSize * (0.85 + Math.random() * 0.35);
        let hy = 0.72;

        if (bushType === 'spawn_bush_wide') {
            rad *= 1.25;
            hy = 0.52;
        } else if (bushType === 'spawn_bush_giant') {
            rad *= 1.45;
            hy = 0.82;
        } else if (bushType === 'spawn_bush_autumn') {
            hy = 0.70;
        }

        const seed = Math.floor(Math.random() * 10000000);
        const bushMesh = generateBushInstancedMesh(spawnX, spawnY, spawnZ, rad, hy, bushType, seed);

        bushesGroup.add(bushMesh);
        bushesList.push(bushMesh);
    }

    updateBushCountUI();
}

function recreateBush(data) {
    if (!data) return;
    const seed = data.seed || Math.floor(Math.random() * 10000000);
    const rad = data.radius || 1.5;
    const hy = data.hy || 0.72;
    const bType = data.bushType || 'spawn_bush_dome';

    const bushMesh = generateBushInstancedMesh(data.posX, data.posY, data.posZ, rad, hy, bType, seed);
    bushesGroup.add(bushMesh);
    bushesList.push(bushMesh);
    updateBushCountUI();
}

function removeBushesInRadius(hitPoint, radius) {
    if (!hitPoint || bushesList.length === 0) return false;

    let removed = false;
    for (let i = bushesList.length - 1; i >= 0; i--) {
        const bush = bushesList[i];
        const ud = bush.userData;
        const d = Math.hypot(ud.posX - hitPoint.x, ud.posZ - hitPoint.z);
        if (d <= radius + ud.radius * 0.6) {
            bushesGroup.remove(bush);
            if (bush.geometry) bush.geometry.dispose();
            bushesList.splice(i, 1);
            removed = true;
        }
    }

    if (removed) {
        updateBushCountUI();
    }
    return removed;
}

function clearAllBushes() {
    for (let i = 0; i < bushesList.length; i++) {
        const bush = bushesList[i];
        bushesGroup.remove(bush);
        if (bush.geometry) bush.geometry.dispose();
    }
    bushesList.length = 0;
    updateBushCountUI();
}

function updateBushCountUI() {
    const valBadge = document.getElementById('val-bush-count');
    if (valBadge) {
        valBadge.innerText = `${bushesList.length} Semak`;
    }
}

// 7. TRACKING RUBAH & UPDATE FRAME (RENDER LOOP TICK)
let lastFoxTrackPos = null;
let lastFoxTrackTime = 0;
let trailRecordIndex = 0;
let lastTrailRecordTime = 0;
let lastBushSoundTime = 0;

function updateBushes(delta, elapsedTime) {
    sharedBushUniforms.uTime.value = elapsedTime;

    // Sinkronisasi arah cahaya matahari dari sunLight
    if (typeof sunLight !== 'undefined' && sunLight.position) {
        sharedBushUniforms.uSun.value.copy(sunLight.position).normalize();
    }

    // Sinkronisasi warna kabut jika scene.fog ada dan aktif di scene
    if (typeof scene !== 'undefined' && scene.fog && scene.fog.color) {
        sharedBushUniforms.uFogCol.value.set(scene.fog.color.r, scene.fog.color.g, scene.fog.color.b);
        if (typeof scene.fog.density === 'number') {
            sharedBushUniforms.uFogDen.value = scene.fog.density;
        } else {
            sharedBushUniforms.uFogDen.value = 0.0;
        }
    } else {
        sharedBushUniforms.uFogDen.value = 0.0;
    }

    // Deteksi posisi, kepala, dan arah gerak rubah
    let foxPos = null;
    let foxFwd = null;
    let isFoxActive = false;

    if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible) {
        foxPos = wolfCharacter.root.position;
        const rotY = wolfCharacter.root.rotation.y || 0;
        // Rubah di Pandora menghadap -X secara lokal
        foxFwd = new THREE.Vector2(-Math.cos(rotY), Math.sin(rotY));
        isFoxActive = true;
    } else if (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible) {
        foxPos = wolfCharacter.root.position;
        const rotY = wolfCharacter.root.rotation.y || 0;
        foxFwd = new THREE.Vector2(-Math.cos(rotY), Math.sin(rotY));
        isFoxActive = true;
    }

    if (isFoxActive && foxPos && foxFwd) {
        sharedBushUniforms.uFoxActive.value = 1.0;

        // Posisi pusat tubuh rubah (torso) ~35cm di atas tanah
        const torsoY = foxPos.y + 0.35;
        sharedBushUniforms.uFoxPos.value.set(foxPos.x, torsoY, foxPos.z);

        // Posisi kepala / dada depan rubah (~45cm di depan torso)
        const headX = foxPos.x + foxFwd.x * 0.45;
        const headZ = foxPos.z + foxFwd.y * 0.45;
        sharedBushUniforms.uFoxHead.value.set(headX, torsoY + 0.05, headZ);

        // Arah hadap 3D
        sharedBushUniforms.uFoxDir.value.set(foxFwd.x, 0.0, foxFwd.y).normalize();

        // Kecepatan rubah
        let speed = 0;
        if (lastFoxTrackPos) {
            const dt = Math.max(0.001, elapsedTime - lastFoxTrackTime);
            const distTraveled = Math.hypot(foxPos.x - lastFoxTrackPos.x, foxPos.z - lastFoxTrackPos.z);
            speed = distTraveled / dt;
            lastFoxTrackPos.copy(foxPos);
            lastFoxTrackTime = elapsedTime;
        } else {
            lastFoxTrackPos = foxPos.clone();
            lastFoxTrackTime = elapsedTime;
        }

        if (typeof window.currentFoxSpeed === 'number' && Math.abs(window.currentFoxSpeed) > 0.05) {
            speed = Math.max(speed, Math.abs(window.currentFoxSpeed));
        }

        sharedBushUniforms.uFoxSpeed.value = THREE.MathUtils.lerp(
            sharedBushUniforms.uFoxSpeed.value,
            speed,
            Math.min(1.0, (delta || 0.016) * 10.0)
        );

        // Pencatatan jejak kapsul sentuhan rubah (Fox wake trail) setiap ~0.09 detik
        if (elapsedTime - lastTrailRecordTime > 0.09) {
            lastTrailRecordTime = elapsedTime;
            foxTrailUniformArray[trailRecordIndex].set(foxPos.x, torsoY, foxPos.z, elapsedTime);
            trailRecordIndex = (trailRecordIndex + 1) % FOX_TRAIL_COUNT;
        }

        // Efek audio desir semak saat rubah menerobos semak belukar
        if (speed > 0.4 && typeof foxSoundFX !== 'undefined' && typeof foxSoundFX.playBushRustle === 'function') {
            if (elapsedTime - lastBushSoundTime > 0.22) {
                let insideBush = false;
                for (let i = 0; i < bushesList.length; i++) {
                    const bud = bushesList[i].userData;
                    const distToCenter = Math.hypot(foxPos.x - bud.posX, foxPos.z - bud.posZ);
                    if (distToCenter < bud.radius + 0.35 && Math.abs(foxPos.y - bud.posY) < 1.4) {
                        insideBush = true;
                        break;
                    }
                }
                if (insideBush) {
                    lastBushSoundTime = elapsedTime;
                    foxSoundFX.playBushRustle(Math.min(1.0, speed / 3.0));
                }
            }
        }
    } else {
        sharedBushUniforms.uFoxActive.value = 0.0;
        sharedBushUniforms.uFoxPos.value.set(0, -999, 0);
        sharedBushUniforms.uFoxHead.value.set(0, -999, 0);
    }
}

// 8. SERIALISASI & DESERIALISASI MAP STORAGE
function exportBushesData() {
    return bushesList.map(b => ({
        posX: b.userData.posX,
        posY: b.userData.posY,
        posZ: b.userData.posZ,
        radius: b.userData.radius,
        hy: b.userData.hy,
        bushType: b.userData.bushType,
        seed: b.userData.seed
    }));
}

function importBushesData(dataArr) {
    if (!Array.isArray(dataArr)) return;
    dataArr.forEach(data => recreateBush(data));
}

// Global exports
window.bushesGroup = bushesGroup;
window.bushesList = bushesList;
window.bushParams = bushParams;
window.placeBushesAt = placeBushesAt;
window.recreateBush = recreateBush;
window.removeBushesInRadius = removeBushesInRadius;
window.clearAllBushes = clearAllBushes;
window.updateBushCountUI = updateBushCountUI;
window.updateBushes = updateBushes;
window.exportBushesData = exportBushesData;
window.importBushesData = importBushesData;
