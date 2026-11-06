/* ========================================================
   REALISTIC BOTANICAL FERN (PAKIS) BRUSH & SHADER MANAGER
   Based on pakis.html procedural pinnae leaflet modeling,
   curved CatmullRom rachis stems, procedural vein canvas textures,
   and dynamic wind sway onBeforeCompile shaders.
   ======================================================== */

// Global state for Ferns
const fernsGroup = new THREE.Group();
fernsGroup.name = 'fernsGroup';
if (typeof scene !== 'undefined') {
    scene.add(fernsGroup);
}

const fernsList = [];
window.fernsList = fernsList;

// Parameter brush pakis
const fernParams = {
    brushRadius: 3.5,
    fernDensity: 2,
    minSize: 0.7,
    maxSize: 1.3
};

// 1. PROCEDURAL LEAF VEIN TEXTURES (FROM pakis.html)
let sharedFernVeinTexture = null;
let sharedGoldenFernVeinTexture = null;

function createFernVeinCanvasTexture(isGold = false) {
    const fcv = document.createElement('canvas');
    fcv.width = 64;
    fcv.height = 128;
    const g = fcv.getContext('2d');

    if (isGold) {
        g.fillStyle = '#fff8db';
        g.fillRect(0, 0, 64, 128);
        g.strokeStyle = 'rgba(255, 245, 180, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(32, 0);
        g.lineTo(32, 128);
        g.stroke();

        g.strokeStyle = 'rgba(215, 160, 45, 0.55)';
        g.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
            const y = i * 9;
            [-1, 1].forEach(s => {
                g.beginPath();
                g.moveTo(32, y + 8);
                g.lineTo(32 + s * 30, y - 6);
                g.stroke();
            });
        }
    } else {
        g.fillStyle = '#e8f5e0';
        g.fillRect(0, 0, 64, 128);
        g.strokeStyle = 'rgba(255, 255, 230, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(32, 0);
        g.lineTo(32, 128);
        g.stroke();

        g.strokeStyle = 'rgba(120, 170, 100, 0.5)';
        g.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
            const y = i * 9;
            [-1, 1].forEach(s => {
                g.beginPath();
                g.moveTo(32, y + 8);
                g.lineTo(32 + s * 30, y - 6);
                g.stroke();
            });
        }
    }

    const tex = new THREE.CanvasTexture(fcv);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

sharedFernVeinTexture = createFernVeinCanvasTexture(false);
sharedGoldenFernVeinTexture = createFernVeinCanvasTexture(true);

// 2. MATERIALS & WIND SHADER (FROM pakis.html)
const fernTimeUniform = { value: 0 };
const fernSunViewUniform = { value: new THREE.Vector3(0, 1, 0) }; // Arah matahari di view space, diisi tiap frame

// Pencahayaan daun tipis: normal dibengkokkan ke atas agar matahari menerangi kedua sisi helai
// (tanpa ini cahaya langit mendominasi sehingga bayangan nyaris tidak terlihat), ditambah
// translusensi saat daun membelakangi matahari yang ikut tertutup bayangan.
function createFernMaterial(params, isGold = false) {
    const mat = new THREE.MeshStandardMaterial(Object.assign({
        roughness: 0.55,
        metalness: 0.02
    }, params));

    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFernTime = fernTimeUniform;
        sh.uniforms.uFernSunView = fernSunViewUniform;
        sh.vertexShader = sh.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
            #include <beginnormal_vertex>
            objectNormal = normalize(objectNormal * 0.45 + vec3(0.0, 1.0, 0.0));
            `
        );
        sh.fragmentShader = 'uniform vec3 uFernSunView;\n' + sh.fragmentShader.replace(
            '#include <normal_fragment_begin>',
            `
            #include <normal_fragment_begin>
            // Kedua sisi helai memakai normal yang sama (sudah condong ke atas), bukan dibalik untuk sisi belakang
            normal = normalize(vNormal);
            `
        );
        sh.vertexShader = 'uniform float uFernTime;\n' + sh.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
            vec4 worldP = modelMatrix * instanceMatrix * vec4(position, 1.0);
            #else
            vec4 worldP = modelMatrix * vec4(position, 1.0);
            #endif
            float k = length(position) * 0.034;
            transformed.x += sin(uFernTime * 1.5 + worldP.x * 0.35 + position.y * 1.6) * k;
            transformed.z += cos(uFernTime * 1.2 + worldP.z * 0.35 + position.x * 2.0) * k * 0.7;
            `
        );
        sh.fragmentShader = sh.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
            gl_FragColor.rgb += ${isGold ? 'vec3(0.95, 0.75, 0.25)' : 'vec3(0.55, 0.78, 0.3)'} * rim * 0.16;

            float sunLit = 1.0;
            #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                sunLit = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize,
                    directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
            #endif
            // Translusensi: cahaya tembus helai saat kamera menghadap matahari
            float backlit = pow(max(0.0, dot(normalize(-vViewPosition), uFernSunView)), 3.0);
            gl_FragColor.rgb += diffuseColor.rgb * vec3(1.0, 0.95, 0.7) * backlit * 0.9 * sunLit;
            // Daun di bawah bayangan tampak lebih teduh, mengikuti kontras rumput tanah (cahaya langit tetap ada)
            gl_FragColor.rgb *= mix(0.62, 1.0, sunLit);
            #include <dithering_fragment>
            `
        );
    };
    return mat;
}

const greenFrondMat = createFernMaterial({
    vertexColors: true,
    map: sharedFernVeinTexture,
    side: THREE.DoubleSide
}, false);

const greenStemMat = createFernMaterial({
    color: 0x427c38,
    roughness: 0.7
}, false);

const goldenFrondMat = createFernMaterial({
    vertexColors: true,
    map: sharedGoldenFernVeinTexture,
    side: THREE.DoubleSide
}, true);

const goldenStemMat = createFernMaterial({
    color: 0x8a6d2b,
    roughness: 0.7
}, true);

// 3. PROCEDURAL FROND GEOMETRY GENERATOR (FROM pakis.html)
function computeFrondData(o) {
    const n = 36;
    const dl = o.len / n;
    const P = [], Tn = [], Nn = [];
    let th = o.th0;
    const p = new THREE.Vector3();

    for (let i = 0; i <= n; i++) {
        const t = i / n;
        P.push(p.clone());
        const tg = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
        Tn.push(tg);
        Nn.push(new THREE.Vector3(0, -Math.sin(th), Math.cos(th)));
        th += (o.bend / n) * (0.5 + t);
        p.addScaledVector(tg, dl);
    }

    const pos = [], col = [], uv = [], idx = [];
    const c0 = new THREE.Color(o.c0);
    const c1 = new THREE.Color(o.c1);
    const hi = new THREE.Color(o.hi || 0xb6f08a);
    const tc = new THREE.Color();

    const pinna = (Pt, Tg, Nr, dir, len, t) => {
        const W = len * 0.16;
        const Sd = Tg.clone().addScaledVector(dir, -Tg.dot(dir)).normalize();
        const b = pos.length / 3;
        for (let r = 0; r <= 8; r++) {
            const u = r / 8;
            const C = Pt.clone().addScaledVector(dir, len * u).addScaledVector(Nr, -o.droop * u * u * len);
            const h = W * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * u) * 0.97), 0.8);
            [[1, 0.22], [0, 0], [-1, 0.22]].forEach(([s, f], j) => {
                const q = C.clone().addScaledVector(Sd, s * h).addScaledVector(Nr, h * f + Math.sin(u * 9 + t * 20) * h * 0.08);
                pos.push(q.x, q.y, q.z);
                tc.copy(c0).lerp(c1, 0.3 * t + 0.7 * Math.pow(u, 0.8));
                if (j === 1) tc.lerp(hi, 0.25);
                col.push(tc.r, tc.g, tc.b);
                uv.push((s + 1) / 2, u);
            });
            if (r < 8) {
                const a = b + r * 3;
                for (let j = 0; j < 2; j++) {
                    idx.push(a + j, a + 3 + j, a + 1 + j, a + 1 + j, a + 3 + j, a + 4 + j);
                }
            }
        }
    };

    const pairs = o.pairs || 28;
    for (let k = 0; k < pairs; k++) {
        const t = 0.1 + 0.88 * k / (pairs - 1);
        const f = t * n;
        const i = Math.min(n - 1, Math.floor(f));
        const w = f - i;
        const Pt = P[i].clone().lerp(P[i + 1], w);
        const Tg = Tn[i];
        const Nr = Nn[i];
        const len = o.pw * (1 - t * 0.82) * Math.min(1, 0.45 + t * 5);
        for (const s of [1, -1]) {
            const ph = 0.75 + o.rr(-0.06, 0.06);
            const dir = new THREE.Vector3(s * Math.cos(ph), 0, 0).addScaledVector(Tg, Math.sin(ph)).normalize();
            pinna(Pt, Tg, Nr, dir, len, t);
        }
    }
    pinna(P[n], Tn[n], Nn[n], Tn[n], o.pw * 0.3, 1);

    const stemPoints = P.filter((_, i) => i % 3 === 0);

    return { pos, col, uv, idx, stemPoints };
}

// 4. PRE-GENERATION OF HIGH-PERFORMANCE SHARED GEOMETRY VARIATIONS
// Merges fronds into a single leaf BufferGeometry & single stem BufferGeometry per clump
function buildFernCompoundGeometry(config, numFronds = 6, seed = 1) {
    let s_ = seed;
    const R = () => (s_ = (s_ * 16807) % 2147483647) / 2147483647;
    const rr = (a, b) => a + (b - a) * R();

    const mergedPositions = [];
    const mergedColors = [];
    const mergedUVs = [];
    const mergedIndices = [];

    const mergedStemPositions = [];
    const mergedStemNormals = [];
    const mergedStemUVs = [];
    const mergedStemIndices = [];

    let leafVertexOffset = 0;
    let stemVertexOffset = 0;

    for (let fIdx = 0; fIdx < numFronds; fIdx++) {
        const baseAngle = (numFronds === 1) ? 0 : ((fIdx / numFronds) * Math.PI * 2 + rr(-0.16, 0.16));
        const radiusOffset = (numFronds === 1) ? 0 : rr(0.04, 0.11);
        const frondLen = config.len * rr(0.88, 1.12);
        const bend = config.bend * rr(0.9, 1.1);
        const droop = config.droop * rr(0.88, 1.12);
        const th0 = config.th0 + rr(-0.04, 0.08);

        const frondData = computeFrondData({
            len: frondLen,
            bend: bend,
            th0: th0,
            pw: config.pw * rr(0.9, 1.1),
            pairs: config.pairs || 26,
            droop: droop,
            c0: config.c0,
            c1: config.c1,
            hi: config.hi,
            R: R,
            rr: rr
        });

        // Compute rotation & translation matrix
        const rotMat = new THREE.Matrix4().makeRotationY(baseAngle);
        const transMat = new THREE.Matrix4().makeTranslation(
            Math.sin(baseAngle) * radiusOffset,
            0,
            Math.cos(baseAngle) * radiusOffset
        );
        const frondTransform = new THREE.Matrix4().multiplyMatrices(transMat, rotMat);

        const v = new THREE.Vector3();
        for (let i = 0; i < frondData.pos.length; i += 3) {
            v.set(frondData.pos[i], frondData.pos[i + 1], frondData.pos[i + 2]);
            v.applyMatrix4(frondTransform);
            mergedPositions.push(v.x, v.y, v.z);
            mergedColors.push(frondData.col[i], frondData.col[i + 1], frondData.col[i + 2]);
        }
        for (let i = 0; i < frondData.uv.length; i++) {
            mergedUVs.push(frondData.uv[i]);
        }
        for (let i = 0; i < frondData.idx.length; i++) {
            mergedIndices.push(frondData.idx[i] + leafVertexOffset);
        }
        leafVertexOffset += frondData.pos.length / 3;

        // Stem tube geometry
        const transformedCurvePoints = frondData.stemPoints.map(pt => pt.clone().applyMatrix4(frondTransform));
        const curve = new THREE.CatmullRomCurve3(transformedCurvePoints);
        const tubeGeo = new THREE.TubeGeometry(curve, 16, config.stemRadius || 0.015, 5, false);

        const tubePos = tubeGeo.attributes.position;
        const tubeNorm = tubeGeo.attributes.normal;
        const tubeUv = tubeGeo.attributes.uv;
        const tubeIdx = tubeGeo.index;

        for (let i = 0; i < tubePos.count; i++) {
            mergedStemPositions.push(tubePos.getX(i), tubePos.getY(i), tubePos.getZ(i));
            mergedStemNormals.push(tubeNorm.getX(i), tubeNorm.getY(i), tubeNorm.getZ(i));
            mergedStemUVs.push(tubeUv.getX(i), tubeUv.getY(i));
        }
        if (tubeIdx) {
            for (let i = 0; i < tubeIdx.count; i++) {
                mergedStemIndices.push(tubeIdx.getX(i) + stemVertexOffset);
            }
        }
        stemVertexOffset += tubePos.count;
    }

    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    leafGeo.setAttribute('color', new THREE.Float32BufferAttribute(mergedColors, 3));
    leafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(mergedUVs, 2));
    leafGeo.setIndex(mergedIndices);
    leafGeo.computeVertexNormals();

    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute('position', new THREE.Float32BufferAttribute(mergedStemPositions, 3));
    stemGeo.setAttribute('normal', new THREE.Float32BufferAttribute(mergedStemNormals, 3));
    stemGeo.setAttribute('uv', new THREE.Float32BufferAttribute(mergedStemUVs, 2));
    stemGeo.setIndex(mergedStemIndices);

    return { leafGeo, stemGeo };
}

// Pre-create variations for each pakis type
const FERN_MODELS = {
    spawn_fern_clump: [],
    spawn_fern_single: [],
    spawn_fern_giant: [],
    spawn_fern_golden: []
};

// Atribut vertex dipadatkan tanpa mengubah tampilan: warna 8-bit, normal & UV 16-bit (ternormalisasi).
// Dari 44 menjadi ~24 byte per vertex, jadi memori & bandwidth GPU untuk ribuan rumpun jauh lebih kecil.
function compactFernGeometry(geo) {
    if (!geo || geo.userData.compacted) return geo;
    const pack = (name, ArrayType, scale, signed) => {
        const attr = geo.attributes[name];
        if (!attr || !(attr.array instanceof Float32Array)) return;
        const src = attr.array;
        for (let i = 0; i < src.length; i++) {
            if (signed ? (src[i] < -1.0001 || src[i] > 1.0001) : (src[i] < -0.0001 || src[i] > 1.0001)) return; // Di luar rentang: biarkan float
        }
        const out = new ArrayType(src.length);
        for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.max(signed ? -1 : 0, Math.min(1, src[i])) * scale);
        geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize, true));
    };
    pack('color', Uint8Array, 255, false);
    pack('normal', Int16Array, 32767, true);
    pack('uv', Uint16Array, 65535, false);
    geo.userData.compacted = true;
    return geo;
}
function compactFernModel(model) {
    [model, model.lodNear, model.lod, model.lod2].forEach(m => { if (m) { compactFernGeometry(m.leafGeo); compactFernGeometry(m.stemGeo); } });
    return model;
}

// Tiap varian punya versi LOD (detail rendah, tanpa batang) untuk chunk yang jauh dari kamera.
// LOD kedua untuk pakis sama dengan LOD pertama (sudah ringan).
function addFernModel(type, config, fronds, seed) {
    const model = buildFernCompoundGeometry(config, fronds, seed);
    model.lod = buildFernCompoundGeometry(Object.assign({}, config, { pairs: Math.max(6, Math.round((config.pairs || 26) / 3)) }), fronds, seed);
    model.lod2 = model.lod;
    model.lodNear = model;
    FERN_MODELS[type].push(compactFernModel(model));
}

// 1) Rumpun Pakis (Default Bush - 6 Fronds)
for (let v = 0; v < 3; v++) {
    addFernModel('spawn_fern_clump', {
        len: 2.1,
        bend: 0.88,
        th0: 0.12,
        pw: 0.58,
        pairs: 26,
        droop: 0.28,
        c0: 0x1f5f34,
        c1: 0x5fae4a,
        hi: 0xb6f08a,
        stemRadius: 0.015
    }, 6, 23 + v * 37);
}

// 2) Helai Tunggal (Single graceful arching frond, directly from pakis.html)
for (let v = 0; v < 2; v++) {
    addFernModel('spawn_fern_single', {
        len: 2.7,
        bend: 0.82,
        th0: 0.06,
        pw: 0.62,
        pairs: 32,
        droop: 0.25,
        c0: 0x1f5f34,
        c1: 0x5fae4a,
        hi: 0xb6f08a,
        stemRadius: 0.016
    }, 1, 91 + v * 53);
}

// 3) Pakis Hutan (Deep forest lush giant fern - 8 fronds)
for (let v = 0; v < 2; v++) {
    addFernModel('spawn_fern_giant', {
        len: 2.8,
        bend: 0.95,
        th0: 0.14,
        pw: 0.72,
        pairs: 30,
        droop: 0.32,
        c0: 0x124726,
        c1: 0x3d9435,
        hi: 0x9be070,
        stemRadius: 0.019
    }, 8, 149 + v * 61);
}

// 4) Pakis Emas (Golden / Autumn Sunset Fern - 6 fronds)
for (let v = 0; v < 2; v++) {
    addFernModel('spawn_fern_golden', {
        len: 2.2,
        bend: 0.86,
        th0: 0.12,
        pw: 0.58,
        pairs: 26,
        droop: 0.27,
        c0: 0x613f10,
        c1: 0xd99a2b,
        hi: 0xffe28a,
        stemRadius: 0.015
    }, 6, 211 + v * 41);
}

// 4b. RUMPUN RUMPUT TINGGI (REED) + TANGKAI BUNGA, dipakai dari kuas rumput.
// Helai pipih melengkung keluar (seperti montbretia / daylily) dan tangkai bunga melengkung
// dengan kuntum di ujung. Daun & kelopak memakai vertex color dalam satu geometri.
function buildReedClumpGeometry(config, seed = 1) {
    let s_ = seed;
    const R = () => (s_ = (s_ * 16807) % 2147483647) / 2147483647;
    const rr = (a, b) => a + (b - a) * R();

    const pos = [], col = [], uv = [], idx = [];
    const stemPos = [], stemNorm = [], stemUv = [], stemIdx = [];
    const tc = new THREE.Color();
    const c0 = new THREE.Color(config.c0);
    const c1 = new THREE.Color(config.c1);
    const hi = new THREE.Color(config.hi);
    const dry = new THREE.Color(config.dry || 0xb9a24a);
    const up = new THREE.Vector3(0, 1, 0);

    // Helai daun: strip 3 vertex per baris (tepi-tengah-tepi) dengan lipatan tengah
    const SEG = 7;
    for (let b = 0; b < config.blades; b++) {
        const phi = rr(0, Math.PI * 2);
        const dir = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
        const side = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
        const base = dir.clone().multiplyScalar(rr(0, config.spread));
        const len = config.bladeLen * rr(0.6, 1.15);
        const w = config.bladeWidth * rr(0.75, 1.2);
        let th = rr(0.05, 0.3);
        const bend = config.bladeBend * rr(0.5, 1.4);
        const roll = rr(-0.6, 0.6);
        const dryMix = R() < config.dryChance ? rr(0.35, 0.8) : 0;
        const p = base.clone();
        const first = pos.length / 3;
        for (let r = 0; r <= SEG; r++) {
            const t = r / SEG;
            const tg = new THREE.Vector3().addScaledVector(up, Math.cos(th)).addScaledVector(dir, Math.sin(th));
            const nr = new THREE.Vector3().addScaledVector(up, -Math.sin(th)).addScaledVector(dir, Math.cos(th));
            const sd = side.clone().multiplyScalar(Math.cos(roll)).addScaledVector(nr, Math.sin(roll));
            const half = w * Math.min(1, 0.55 + t * 4) * Math.pow(1 - t, 0.9) * 0.5;
            tc.copy(c0).lerp(c1, Math.pow(t, 0.7));
            if (t > 0.6) tc.lerp(hi, (t - 0.6) * 0.6);
            if (dryMix > 0) tc.lerp(dry, dryMix * t);
            [[-1, 0], [0, 1], [1, 0]].forEach(([s, crease]) => {
                const q = p.clone().addScaledVector(sd, s * half).addScaledVector(nr, -crease * half * 0.35);
                pos.push(q.x, q.y, q.z);
                const shade = crease ? 1.08 : 0.92;
                col.push(tc.r * shade, tc.g * shade, tc.b * shade);
                uv.push((s + 1) / 2, t);
            });
            if (r < SEG) {
                const a = first + r * 3;
                idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
            }
            th += bend / SEG * (0.4 + t * 1.6);
            p.addScaledVector(tg, len / SEG);
        }
    }

    // Tangkai bunga melengkung dengan kuntum berselang-seling di bagian atas
    const flowerA = new THREE.Color(config.flowerInner || 0xffffff);
    const flowerB = new THREE.Color(config.flowerOuter || 0xffffff);
    let stemOffset = 0;
    for (let f = 0; f < (config.spikes || 0); f++) {
        const phi = rr(0, Math.PI * 2);
        const dir = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
        const len = config.spikeLen * rr(0.8, 1.15);
        const pts = [];
        let th = rr(0.08, 0.25);
        const p = dir.clone().multiplyScalar(rr(0, config.spread * 0.6));
        for (let i = 0; i <= 8; i++) {
            pts.push(p.clone());
            th += config.spikeBend / 8 * (i / 8) * 2.2;
            p.addScaledVector(new THREE.Vector3().addScaledVector(up, Math.cos(th)).addScaledVector(dir, Math.sin(th)), len / 8);
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.TubeGeometry(curve, 12, 0.011, 4, false);
        const tp = tube.attributes.position, tn = tube.attributes.normal, tu = tube.attributes.uv;
        for (let i = 0; i < tp.count; i++) {
            stemPos.push(tp.getX(i), tp.getY(i), tp.getZ(i));
            stemNorm.push(tn.getX(i), tn.getY(i), tn.getZ(i));
            stemUv.push(tu.getX(i), tu.getY(i));
        }
        for (let i = 0; i < tube.index.count; i++) stemIdx.push(tube.index.getX(i) + stemOffset);
        stemOffset += tp.count;
        tube.dispose();

        const blooms = config.blooms || 7;
        for (let k = 0; k < blooms; k++) {
            const t = 0.5 + 0.5 * k / (blooms - 1);
            const at = curve.getPointAt(t);
            const tg = curve.getTangentAt(t);
            const out = new THREE.Vector3().crossVectors(tg, up);
            if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
            out.normalize().multiplyScalar(k % 2 ? 1 : -1);
            // Kuntum mengecil ke ujung tangkai (masih kuncup)
            const size = config.bloomSize * (1.05 - t * 0.6) * rr(0.85, 1.15);
            const facing = out.clone().multiplyScalar(0.7).addScaledVector(up, 0.5).normalize();
            const a1 = new THREE.Vector3().crossVectors(facing, tg).normalize();
            const a2 = new THREE.Vector3().crossVectors(facing, a1).normalize();
            const center = at.clone().addScaledVector(out, size * 0.35);
            const petals = t > 0.88 ? 3 : 5;
            for (let pIdx = 0; pIdx < petals; pIdx++) {
                const ang = pIdx / petals * Math.PI * 2 + rr(-0.2, 0.2);
                const pd = a1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(a2, Math.sin(ang));
                const pp = a1.clone().multiplyScalar(-Math.sin(ang)).addScaledVector(a2, Math.cos(ang));
                const lift = facing.clone().multiplyScalar(size * 0.25);
                const b0 = pos.length / 3;
                const verts = [
                    center,
                    center.clone().addScaledVector(pd, size * 0.55).addScaledVector(pp, size * 0.28).add(lift),
                    center.clone().addScaledVector(pd, size).add(lift),
                    center.clone().addScaledVector(pd, size * 0.55).addScaledVector(pp, -size * 0.28).add(lift)
                ];
                verts.forEach((v, vi) => {
                    pos.push(v.x, v.y, v.z);
                    tc.copy(flowerA).lerp(flowerB, vi === 0 ? 0 : (vi === 2 ? 1 : 0.6));
                    col.push(tc.r, tc.g, tc.b);
                    uv.push(0.5, 0.5);
                });
                idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
            }
        }
    }

    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    leafGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    leafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    leafGeo.setIndex(idx);
    leafGeo.computeVertexNormals();

    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute('position', new THREE.Float32BufferAttribute(stemPos, 3));
    stemGeo.setAttribute('normal', new THREE.Float32BufferAttribute(stemNorm, 3));
    stemGeo.setAttribute('uv', new THREE.Float32BufferAttribute(stemUv, 2));
    stemGeo.setIndex(stemIdx);

    return { leafGeo, stemGeo };
}

const REED_BASE = {
    blades: 46, spread: 0.22, bladeLen: 1.35, bladeWidth: 0.075, bladeBend: 0.75, dryChance: 0.12,
    c0: 0x123a14, c1: 0x3f7f24, hi: 0x8fbf4a, dry: 0xa88f3a,
    spikeLen: 1.55, spikeBend: 0.6, blooms: 8, bloomSize: 0.1
};
function addReedModel(type, config, seed) {
    const model = buildReedClumpGeometry(config, seed);
    // 7–14 m: 60% helai sedikit lebih lebar; bunga & tangkai tetap lengkap (jarak ini masih terlihat jelas)
    model.lodNear = buildReedClumpGeometry(Object.assign({}, config, {
        blades: Math.round(config.blades * 0.6),
        bladeWidth: config.bladeWidth * 1.15
    }), seed);
    model.lod = buildReedClumpGeometry(Object.assign({}, config, {
        blades: Math.round(config.blades * 0.35),
        bladeWidth: config.bladeWidth * 1.5,
        blooms: Math.ceil((config.blooms || 0) / 2),
        bloomSize: config.bloomSize * 1.3
    }), seed);
    // LOD jauh (> FERN_FAR_LOD_DISTANCE): rumpun hanya beberapa piksel, cukup siluet dan titik warna bunga.
    // Helai sedikit tapi lebar, kuntum sedikit tapi besar, jadi warna & kerapatan dari jauh tetap sama.
    model.lod2 = buildReedClumpGeometry(Object.assign({}, config, {
        blades: Math.max(5, Math.round(config.blades * 0.14)),
        bladeWidth: config.bladeWidth * 2.4,
        blooms: Math.ceil((config.blooms || 0) / 3),
        bloomSize: config.bloomSize * 1.6
    }), seed);
    FERN_MODELS[type].push(compactFernModel(model));
}
FERN_MODELS.spawn_reed_crocosmia = [];
FERN_MODELS.spawn_reed_golden = [];
FERN_MODELS.spawn_reed_tall = [];
for (let v = 0; v < 3; v++) {
    // Montbretia: tangkai bunga merah-jingga
    addReedModel('spawn_reed_crocosmia', Object.assign({}, REED_BASE, {
        spikes: 4 + v, flowerInner: 0x8f1204, flowerOuter: 0xff3a0a
    }), 307 + v * 43);
    // Daylily liar: kuntum kuning keemasan lebih rapat
    addReedModel('spawn_reed_golden', Object.assign({}, REED_BASE, {
        spikes: 6 + v, blooms: 9, bloomSize: 0.09, spikeLen: 1.3, flowerInner: 0xc77a0a, flowerOuter: 0xffd23a,
        c1: 0x4f8c2c, hi: 0xa6c85a
    }), 401 + v * 59);
    // Rumput tinggi tanpa bunga, lebih rapat dan sedikit kering
    addReedModel('spawn_reed_tall', Object.assign({}, REED_BASE, {
        blades: 60, bladeLen: 1.5, spikes: 0, dryChance: 0.22
    }), 523 + v * 31);
}

const reedLeafMat = createFernMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.62
}, false);

const reedStemMat = createFernMaterial({
    color: 0x4f7a2b,
    roughness: 0.7
}, false);

function isReedType(fernType) {
    return typeof fernType === 'string' && fernType.indexOf('spawn_reed') === 0;
}

function getFernMaterials(fernType) {
    if (isReedType(fernType)) return { leafMat: reedLeafMat, stemMat: reedStemMat };
    if (fernType === 'spawn_fern_golden') return { leafMat: goldenFrondMat, stemMat: goldenStemMat };
    return { leafMat: greenFrondMat, stemMat: greenStemMat };
}

// 5. BATCH RENDERING BERBASIS CHUNK (INSTANCED)
// Setiap pakis/rumpun di fernsList hanya Object3D ringan (transform + userData, tidak masuk scene).
// Yang digambar adalah InstancedMesh per chunk 16m x per varian geometri, sehingga ribuan rumpun cukup
// beberapa puluh draw call. Chunk di luar pandangan kamera / terlalu jauh tidak digambar, dan chunk
// yang jauh memakai geometri LOD tanpa bayangan.
// 8 m: LOD dipilih per area kecil. Dengan 16 m, rumpun hingga ~29 m dari kamera ikut digambar detail penuh.
const FERN_CHUNK_SIZE = 8;
const FERN_FULL_DISTANCE = 7;   // Detail penuh hanya sedekat ini
const FERN_LOD_DISTANCE = 14;   // Lebih jauh dari ini pakai geometri LOD
const FERN_FAR_LOD_DISTANCE = 30;   // Lebih jauh dari ini pakai LOD kedua + sebagian instance
const FERN_FAR_FRACTION = 0.65;     // Bagian rumpun yang tetap digambar di jarak jauh (diperlebar agar rapat)
const FERN_FAR_WIDEN = 1.2;
const FERN_SHADOW_LAYER = 1;        // Mesh bayangan ringan hanya dilihat kamera bayangan
// Kamera bayangan matahari ikut melihat layer itu; kamera utama (layer 0) tidak
if (typeof sunLight !== 'undefined' && sunLight && sunLight.shadow) sunLight.shadow.camera.layers.enable(FERN_SHADOW_LAYER);
const FERN_CULL_DISTANCE = 95;  // Lebih jauh dari ini tidak digambar sama sekali
const fernChunks = new Map();   // key "cx,cz" -> { ferns: [], group, center, radius, dirty }
const fernTrampled = new Set(); // Pakis yang sedang rebah / pulih, diproses walau rubah sudah jauh
const _fernFrustum = new THREE.Frustum();
const _fernProjScreen = new THREE.Matrix4();
const _fernSphere = new THREE.Sphere();

function fernChunkKey(x, z) {
    return Math.floor(x / FERN_CHUNK_SIZE) + ',' + Math.floor(z / FERN_CHUNK_SIZE);
}

function getFernChunk(key) {
    let chunk = fernChunks.get(key);
    if (!chunk) {
        const [cx, cz] = key.split(',').map(Number);
        chunk = {
            ferns: [],
            group: null,
            center: new THREE.Vector3((cx + 0.5) * FERN_CHUNK_SIZE, 0, (cz + 0.5) * FERN_CHUNK_SIZE),
            radius: FERN_CHUNK_SIZE * 0.75 + 3.0, // Setengah diagonal + tinggi/lebar rumpun
            full: [],
            near2: [],
            near: [],
            mid: [],
            far: [],
            dirty: true
        };
        fernChunks.set(key, chunk);
    }
    return chunk;
}

function addFernToChunk(fern) {
    const key = fernChunkKey(fern.position.x, fern.position.z);
    fern.userData.chunkKey = key;
    const chunk = getFernChunk(key);
    chunk.ferns.push(fern);
    chunk.dirty = true;
}

function removeFernFromChunk(fern) {
    const chunk = fernChunks.get(fern.userData.chunkKey);
    if (!chunk) return;
    const i = chunk.ferns.indexOf(fern);
    if (i >= 0) chunk.ferns.splice(i, 1);
    chunk.dirty = true;
    fernTrampled.delete(fern);
}

function disposeFernChunkMeshes(chunk) {
    if (!chunk.group) return;
    fernsGroup.remove(chunk.group);
    chunk.group.children.forEach(m => m.dispose && m.dispose()); // Hanya buffer instance; geometri & material dipakai bersama
    chunk.group = null;
    chunk.full = [];
    chunk.near2 = [];
    chunk.near = [];
    chunk.mid = [];
    chunk.far = [];
}

function fernOrderHash(fern) {
    const p = fern.position;
    const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453;
    return h - Math.floor(h);
}

const _fernWideMatrix = new THREE.Matrix4();
const _fernWideScale = new THREE.Vector3();
function fernWidenMatrix(fern) {
    _fernWideScale.set(fern.scale.x * FERN_FAR_WIDEN, fern.scale.y, fern.scale.z * FERN_FAR_WIDEN);
    return _fernWideMatrix.compose(fern.position, fern.quaternion, _fernWideScale);
}

function makeFernInstancedMesh(geo, mat, count, castShadow) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false; // Culling dilakukan per chunk (bounding geometri tidak mewakili instance)
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
}

function rebuildFernChunk(chunk) {
    disposeFernChunkMeshes(chunk);
    if (chunk.ferns.length === 0) return;

    const byModel = new Map();
    let minY = Infinity, maxY = -Infinity;
    chunk.ferns.forEach(fern => {
        const ud = fern.userData;
        const key = ud.fernType + '|' + ud.variantIndex;
        if (!byModel.has(key)) byModel.set(key, []);
        byModel.get(key).push(fern);
        minY = Math.min(minY, fern.position.y);
        maxY = Math.max(maxY, fern.position.y);
    });
    chunk.center.y = (minY + maxY) / 2 + 1.0;
    chunk.radius = FERN_CHUNK_SIZE * 0.75 + 3.0 + (maxY - minY) / 2;

    const group = new THREE.Group();
    group.name = 'fernChunk';
    byModel.forEach((ferns, key) => {
        const fernType = ferns[0].userData.fernType;
        const variations = FERN_MODELS[fernType] || FERN_MODELS.spawn_fern_clump;
        const model = variations[ferns[0].userData.variantIndex] || variations[0];
        const { leafMat, stemMat } = getFernMaterials(fernType);
        // Urutan acak tetap (dari posisi), supaya sebagian yang digambar di jarak jauh tersebar merata
        ferns.sort((a, b) => fernOrderHash(a) - fernOrderHash(b));
        const n = ferns.length;
        const lod = model.lod || model;
        const lod2 = model.lod2 || lod;
        // Dekat: detail penuh tanpa bayangan; bayangannya dari geometri LOD (mesh khusus kamera bayangan)
        const nearLeaf = makeFernInstancedMesh(model.leafGeo, leafMat, n, false);
        const near2Leaf = makeFernInstancedMesh((model.lodNear || model).leafGeo, leafMat, n, false);
        const nearStem = makeFernInstancedMesh(model.stemGeo, stemMat, n, false);
        const shadowLeaf = makeFernInstancedMesh(lod.leafGeo, leafMat, n, true);
        shadowLeaf.layers.set(FERN_SHADOW_LAYER);
        const midLeaf = makeFernInstancedMesh(lod.leafGeo, leafMat, n, false);
        const farLeaf = makeFernInstancedMesh(lod2.leafGeo, leafMat, n, false);
        farLeaf.count = Math.max(1, Math.ceil(n * FERN_FAR_FRACTION));
        ferns.forEach((fern, i) => {
            fern.updateMatrix();
            nearLeaf.setMatrixAt(i, fern.matrix);
            near2Leaf.setMatrixAt(i, fern.matrix);
            nearStem.setMatrixAt(i, fern.matrix);
            shadowLeaf.setMatrixAt(i, fern.matrix);
            midLeaf.setMatrixAt(i, fern.matrix);
            farLeaf.setMatrixAt(i, fernWidenMatrix(fern));
            fern.userData.instanceSlot = { meshes: [nearLeaf, near2Leaf, nearStem, shadowLeaf, midLeaf], far: farLeaf, index: i };
        });
        group.add(nearLeaf, near2Leaf, nearStem, shadowLeaf, midLeaf, farLeaf);
        chunk.full.push(nearLeaf);
        chunk.near2.push(near2Leaf);
        chunk.near.push(nearStem, shadowLeaf);
        chunk.mid.push(midLeaf);
        chunk.far.push(farLeaf);
    });
    chunk.group = group;
    fernsGroup.add(group);
}

// Salin transform terbaru satu pakis (mis. saat rebah terinjak) ke slot instance-nya
function syncFernInstance(fern) {
    const slot = fern.userData.instanceSlot;
    if (!slot) return;
    fern.updateMatrix();
    slot.meshes.forEach(mesh => {
        mesh.setMatrixAt(slot.index, fern.matrix);
        mesh.instanceMatrix.needsUpdate = true;
    });
    if (slot.far) {
        slot.far.setMatrixAt(slot.index, fernWidenMatrix(fern));
        slot.far.instanceMatrix.needsUpdate = true;
    }
}

// Bangun ulang chunk yang berubah (tanam/hapus/undo). Dipanggil tiap frame dan sebelum kompilasi stage.
function flushFernBatches() {
    fernChunks.forEach((chunk, key) => {
        if (!chunk.dirty) return;
        chunk.dirty = false;
        rebuildFernChunk(chunk);
        if (chunk.ferns.length === 0) fernChunks.delete(key);
    });
}

function updateFernChunkVisibility() {
    if (typeof camera === 'undefined' || !camera) return;
    camera.updateMatrixWorld();
    _fernProjScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fernFrustum.setFromProjectionMatrix(_fernProjScreen);
    const camPos = camera.position;
    fernChunks.forEach(chunk => {
        if (!chunk.group) return;
        const dist = Math.max(0, camPos.distanceTo(chunk.center) - chunk.radius);
        _fernSphere.set(chunk.center, chunk.radius);
        const visible = dist < FERN_CULL_DISTANCE && _fernFrustum.intersectsSphere(_fernSphere);
        chunk.group.visible = visible;
        if (!visible) return;
        // LOD dari jarak ke titik terdekat kotak chunk (bukan tepi bola pembatas yang jauh lebih longgar)
        const half = FERN_CHUNK_SIZE / 2;
        const ex = Math.max(0, Math.abs(camPos.x - chunk.center.x) - half);
        const ez = Math.max(0, Math.abs(camPos.z - chunk.center.z) - half);
        const lodDist = Math.hypot(ex, ez, Math.max(0, Math.abs(camPos.y - chunk.center.y) - 2));
        const near = lodDist < FERN_LOD_DISTANCE;
        const far = lodDist >= FERN_FAR_LOD_DISTANCE;
        const full = lodDist < FERN_FULL_DISTANCE || window.__fernForceFull === true;
        chunk.full.forEach(m => { m.visible = full; });
        chunk.near2.forEach(m => { m.visible = near && !full; });
        chunk.near.forEach(m => { m.visible = near || full; });
        chunk.mid.forEach(m => { m.visible = !near && !far && !full; });
        chunk.far.forEach(m => { m.visible = far && !full; });
    });
}

// 6. PENEMPATAN PAKIS (PLACE FERNS)
function createFernHolder(fernType, variantIndex, scaleBase) {
    const fern = new THREE.Object3D();
    fern.userData = {
        isFern: true,
        fernType: fernType,
        scaleBase: scaleBase,
        variantIndex: variantIndex,
        trample: 0.0,
        trampleDir: new THREE.Vector2(0, 1)
    };
    return fern;
}

function finalizeFern(fern) {
    const ud = fern.userData;
    ud.baseScale = { x: fern.scale.x, y: fern.scale.y, z: fern.scale.z };
    ud.baseQuaternion = fern.quaternion.clone();
    fernsList.push(fern);
    addFernToChunk(fern);
}

// opts.radius / opts.count menimpa parameter kuas pakis (dipakai kuas rumput untuk rumpun reed)
function placeFernsAt(hitPoint, fernType = 'spawn_fern_clump', opts = null) {
    const isSingle = (fernType === 'spawn_fern_single');
    const radius = isSingle ? 0 : ((opts && opts.radius !== undefined) ? opts.radius : fernParams.brushRadius);
    const count = isSingle ? 1 : ((opts && opts.count) ? opts.count : ((radius < 1.5) ? 1 : fernParams.fernDensity));
    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    let addedAny = false;

    for (let i = 0; i < count; i++) {
        const r = (count === 1) ? 0 : radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const posX = (count === 1) ? hitPoint.x : (hitPoint.x + r * Math.cos(theta));
        const posZ = (count === 1) ? hitPoint.z : (hitPoint.z + r * Math.sin(theta));

        if (Math.abs(posX) > groundBound || Math.abs(posZ) > groundBound) {
            continue;
        }

        // Cegah penumpukan pakis di titik yang sama; cukup periksa chunk sekitar titik tanam
        const minDistance = isSingle ? 0.85 : (isReedType(fernType) ? 0.3 : 0.50);
        let tooClose = false;
        const cx = Math.floor(posX / FERN_CHUNK_SIZE);
        const cz = Math.floor(posZ / FERN_CHUNK_SIZE);
        for (let dx = -1; dx <= 1 && !tooClose; dx++) {
            for (let dz = -1; dz <= 1 && !tooClose; dz++) {
                const chunk = fernChunks.get((cx + dx) + ',' + (cz + dz));
                if (!chunk) continue;
                for (let j = 0; j < chunk.ferns.length; j++) {
                    const ef = chunk.ferns[j];
                    if (Math.hypot(ef.position.x - posX, ef.position.z - posZ) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }
            }
        }
        if (tooClose) continue;

        const variations = FERN_MODELS[fernType] || FERN_MODELS.spawn_fern_clump;
        const variantIndex = Math.floor(Math.random() * variations.length);

        let scaleBase = isReedType(fernType)
            ? 0.85 + Math.random() * 0.3
            : fernParams.minSize + Math.random() * (fernParams.maxSize - fernParams.minSize);
        if (fernType === 'spawn_fern_giant') scaleBase *= 1.35;
        if (isSingle) scaleBase *= 0.95;

        const fern = createFernHolder(fernType, variantIndex, scaleBase);

        // opts.heightScale hanya meninggikan helai, lebar rumpun tetap
        const heightScale = (opts && opts.heightScale) ? opts.heightScale : 1.0;
        fern.scale.set(scaleBase, scaleBase * heightScale, scaleBase);

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;
        fern.position.set(posX, groundY, posZ);

        const randomYaw = Math.random() * Math.PI * 2;
        if (typeof getTerrainNormalAt === 'function') {
            const norm = getTerrainNormalAt(posX, posZ);
            const blendNormal = new THREE.Vector3(0, 1, 0).lerp(norm, 0.45).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blendNormal);
            fern.quaternion.copy(q);
            fern.rotateY(randomYaw);
        } else {
            fern.rotation.y = randomYaw;
        }

        finalizeFern(fern);
        addedAny = true;
    }

    if (addedAny) {
        updateFernCountUI();
    }
}

// 7. HAPUS PAKIS DALAM RADIUS TERTENTU
// onlyReeds: kuas rumput hanya menghapus rumpun reed, bukan pakis
function removeFernsInRadius(hitPoint, radius, onlyReeds = false) {
    if (!fernsList || fernsList.length === 0) return false;
    let removedAny = false;

    for (let i = fernsList.length - 1; i >= 0; i--) {
        const fern = fernsList[i];
        if (onlyReeds && !isReedType(fern.userData && fern.userData.fernType)) continue;
        const dist = Math.hypot(fern.position.x - hitPoint.x, fern.position.z - hitPoint.z);
        if (dist <= radius) {
            removeFernFromChunk(fern);
            fernsList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateFernCountUI();
    }
    return removedAny;
}

// 8. BERSIHKAN SEMUA PAKIS (CLEAR ALL)
function clearAllFerns() {
    if (!fernsList) return;
    fernChunks.forEach(chunk => disposeFernChunkMeshes(chunk));
    fernChunks.clear();
    fernTrampled.clear();
    fernsList.length = 0;
    updateFernCountUI();
}

// 9. RECREATE FERN (UNTUK UNDO/REDO & LOAD MAP)
function recreateFern(data) {
    const fernType = data.fernType || 'spawn_fern_clump';
    const variations = FERN_MODELS[fernType] || FERN_MODELS.spawn_fern_clump;
    const vIdx = (data.variantIndex !== undefined && data.variantIndex < variations.length) ? data.variantIndex : 0;

    const fern = createFernHolder(fernType, vIdx, data.scaleBase || 1.0);
    fern.position.set(data.posX, data.posY, data.posZ);
    if (data.rotX !== undefined) {
        fern.rotation.set(data.rotX, data.rotY, data.rotZ);
    }
    if (data.scaleX !== undefined) {
        fern.scale.set(data.scaleX, data.scaleY, data.scaleZ);
    } else {
        const s = data.scaleBase || 1.0;
        fern.scale.set(s, s, s);
    }
    fern.userData.scaleBase = data.scaleBase || fern.scale.x;

    finalizeFern(fern);
    updateFernCountUI();
}

// 10. UPDATE UI COUNTER
function updateFernCountUI() {
    const valBadge = document.getElementById('val-fern-count');
    if (valBadge) {
        valBadge.innerText = `${fernsList.length} Pakis`;
    }
}

// 11. ANIMASI SWAY ANGIN & INTERAKSI ROBOH SAAT DIINJAK RUBAH (TRAMPLE INTERACTION)
const _trampleAxis = new THREE.Vector3();
const _trampleQuat = new THREE.Quaternion();

function updateFerns(delta, elapsedTime) {
    fernTimeUniform.value = elapsedTime;
    if (typeof sunLight !== 'undefined' && typeof camera !== 'undefined' && camera) {
        fernSunViewUniform.value.copy(sunLight.position).sub(sunLight.target.position).normalize()
            .transformDirection(camera.matrixWorldInverse);
    }

    flushFernBatches();
    updateFernChunkVisibility();

    if (!fernsList || fernsList.length === 0) return;

    // Deteksi posisi dan arah rubah
    let foxPos = null;
    let foxFwd = null;

    const foxActive = (typeof isPlayMode !== 'undefined' && isPlayMode)
        || (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible);
    if (foxActive && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
        foxPos = wolfCharacter.root.position;
        const rotY = wolfCharacter.root.rotation.y || 0;
        foxFwd = new THREE.Vector2(-Math.cos(rotY), Math.sin(rotY));
    }

    const dt = Math.min(delta, 0.1);

    // Hanya pakis di chunk sekitar rubah yang perlu dicek, sisanya hanya yang masih dalam proses pulih
    const candidates = new Set(fernTrampled);
    if (foxPos) {
        const cx = Math.floor(foxPos.x / FERN_CHUNK_SIZE);
        const cz = Math.floor(foxPos.z / FERN_CHUNK_SIZE);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const chunk = fernChunks.get((cx + dx) + ',' + (cz + dz));
                if (!chunk) continue;
                chunk.ferns.forEach(f => {
                    if (Math.abs(f.position.x - foxPos.x) < 3 && Math.abs(f.position.z - foxPos.z) < 3) candidates.add(f);
                });
            }
        }
    }

    candidates.forEach(fern => {
        const ud = fern.userData;
        let isUnderPaws = false;

        if (foxPos) {
            const dy = Math.abs(foxPos.y - fern.position.y);
            // Hanya aktif jika rubah tidak sedang melompat terlalu tinggi di udara
            if (dy < 1.8) {
                const dx = fern.position.x - foxPos.x;
                const dz = fern.position.z - foxPos.z;
                const dist = Math.hypot(dx, dz);
                const trampleRadius = 1.35 * (ud.scaleBase || 1.0);

                if (dist < trampleRadius) {
                    isUnderPaws = true;
                    const targetStrength = Math.pow(1.0 - (dist / trampleRadius), 0.65);

                    // Arah dorongan roboh menjauhi tapak rubah & searah laju rubah
                    if (dist > 0.02) {
                        ud.trampleDir.set(dx / dist, dz / dist);
                        if (foxFwd) ud.trampleDir.lerp(foxFwd, 0.35).normalize();
                    }

                    // Roboh cepat saat terinjak kaki rubah
                    ud.trample = THREE.MathUtils.lerp(ud.trample, targetStrength, Math.min(1.0, dt * 14.0));
                }
            }
        }

        // Jika rubah sudah berlalu / menjauh: pulih tegak kembali perlahan (recovery ~1.5 detik)
        if (!isUnderPaws) {
            ud.trample = ud.trample > 0.001 ? Math.max(0, ud.trample - dt * 0.68) : 0;
        }

        if (ud.trample > 0.0005) {
            const tr = ud.trample;
            // 1. Kompresi ketinggian ke tanah (rebah) & mekar melebar ke samping
            const heightScale = Math.max(0.18, 1.0 - tr * 0.76);
            const spreadScale = 1.0 + tr * 0.28;
            fern.scale.set(
                ud.baseScale.x * spreadScale,
                ud.baseScale.y * heightScale,
                ud.baseScale.z * spreadScale
            );

            // 2. Rotasi miring roboh ke arah injakan (bend angle hingga ~65 derajat)
            _trampleAxis.set(-ud.trampleDir.y, 0, ud.trampleDir.x);
            _trampleQuat.setFromAxisAngle(_trampleAxis, tr * 1.15);
            fern.quaternion.copy(_trampleQuat).multiply(ud.baseQuaternion);
            fernTrampled.add(fern);
            syncFernInstance(fern);
        } else if (fernTrampled.has(fern)) {
            // Reset sempurna saat sudah pulih tegak 100%
            fern.scale.set(ud.baseScale.x, ud.baseScale.y, ud.baseScale.z);
            fern.quaternion.copy(ud.baseQuaternion);
            fernTrampled.delete(fern);
            syncFernInstance(fern);
        }
    });
}

// Export globals
window.fernsGroup = fernsGroup;
window.fernParams = fernParams;
window.placeFernsAt = placeFernsAt;
window.isReedType = isReedType;
window.removeFernsInRadius = removeFernsInRadius;
window.clearAllFerns = clearAllFerns;
window.recreateFern = recreateFern;
window.updateFernCountUI = updateFernCountUI;
window.updateFerns = updateFerns;
window.flushFernBatches = flushFernBatches;
