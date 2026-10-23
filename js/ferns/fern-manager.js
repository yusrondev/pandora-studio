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

function createFernMaterial(params, isGold = false) {
    const mat = new THREE.MeshStandardMaterial(Object.assign({
        roughness: 0.55,
        metalness: 0.02
    }, params));

    mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFernTime = fernTimeUniform;
        sh.vertexShader = 'uniform float uFernTime;\n' + sh.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldP = modelMatrix * vec4(position, 1.0);
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

// 1) Rumpun Pakis (Default Bush - 6 Fronds)
for (let v = 0; v < 3; v++) {
    FERN_MODELS.spawn_fern_clump.push(buildFernCompoundGeometry({
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
    }, 6, 23 + v * 37));
}

// 2) Helai Tunggal (Single graceful arching frond, directly from pakis.html)
for (let v = 0; v < 2; v++) {
    FERN_MODELS.spawn_fern_single.push(buildFernCompoundGeometry({
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
    }, 1, 91 + v * 53));
}

// 3) Pakis Hutan (Deep forest lush giant fern - 8 fronds)
for (let v = 0; v < 2; v++) {
    FERN_MODELS.spawn_fern_giant.push(buildFernCompoundGeometry({
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
    }, 8, 149 + v * 61));
}

// 4) Pakis Emas (Golden / Autumn Sunset Fern - 6 fronds)
for (let v = 0; v < 2; v++) {
    FERN_MODELS.spawn_fern_golden.push(buildFernCompoundGeometry({
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
    }, 6, 211 + v * 41));
}

// 5. PENEMPATAN PAKIS (PLACE FERNS)
function placeFernsAt(hitPoint, fernType = 'spawn_fern_clump') {
    const isSingle = (fernType === 'spawn_fern_single');
    const radius = isSingle ? 0 : fernParams.brushRadius;
    const count = isSingle ? 1 : ((radius < 1.5) ? 1 : fernParams.fernDensity);
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

        // Cegah penumpukan pakis di titik yang sama (< 0.85m untuk single, < 0.50m untuk clump)
        const minDistance = isSingle ? 0.85 : 0.50;
        let tooClose = false;
        for (let j = 0; j < fernsList.length; j++) {
            const ef = fernsList[j];
            if (Math.hypot(ef.position.x - posX, ef.position.z - posZ) < minDistance) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        const variations = FERN_MODELS[fernType] || FERN_MODELS.spawn_fern_clump;
        const variantIndex = Math.floor(Math.random() * variations.length);
        const geoPair = variations[variantIndex];

        const isGold = (fernType === 'spawn_fern_golden');
        const leafMat = isGold ? goldenFrondMat : greenFrondMat;
        const stemMat = isGold ? goldenStemMat : greenStemMat;

        const leafMesh = new THREE.Mesh(geoPair.leafGeo, leafMat);
        const stemMesh = new THREE.Mesh(geoPair.stemGeo, stemMat);
        leafMesh.castShadow = true;
        leafMesh.receiveShadow = true;
        stemMesh.castShadow = true;
        stemMesh.receiveShadow = true;

        const fernGroup = new THREE.Group();
        fernGroup.add(leafMesh);
        fernGroup.add(stemMesh);

        let scaleBase = fernParams.minSize + Math.random() * (fernParams.maxSize - fernParams.minSize);
        if (fernType === 'spawn_fern_giant') scaleBase *= 1.35;
        if (isSingle) scaleBase *= 0.95;

        fernGroup.scale.set(scaleBase, scaleBase, scaleBase);

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : 0;
        fernGroup.position.set(posX, groundY, posZ);

        const randomYaw = Math.random() * Math.PI * 2;
        if (typeof getTerrainNormalAt === 'function') {
            const norm = getTerrainNormalAt(posX, posZ);
            const blendNormal = new THREE.Vector3(0, 1, 0).lerp(norm, 0.45).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blendNormal);
            fernGroup.quaternion.copy(q);
            fernGroup.rotateY(randomYaw);
        } else {
            fernGroup.rotation.y = randomYaw;
        }

        fernGroup.userData = {
            isFern: true,
            fernType: fernType,
            scaleBase: scaleBase,
            variantIndex: variantIndex,
            baseScale: { x: scaleBase, y: scaleBase, z: scaleBase },
            baseQuaternion: fernGroup.quaternion.clone(),
            trample: 0.0,
            trampleDir: new THREE.Vector2(0, 1)
        };

        fernsGroup.add(fernGroup);
        fernsList.push(fernGroup);
        addedAny = true;
    }

    if (addedAny) {
        updateFernCountUI();
    }
}

// 6. HAPUS PAKIS DALAM RADIUS TERTENTU
function removeFernsInRadius(hitPoint, radius) {
    if (!fernsList || fernsList.length === 0) return false;
    let removedAny = false;

    for (let i = fernsList.length - 1; i >= 0; i--) {
        const fern = fernsList[i];
        const dist = Math.hypot(fern.position.x - hitPoint.x, fern.position.z - hitPoint.z);
        if (dist <= radius) {
            fernsGroup.remove(fern);
            fernsList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateFernCountUI();
    }
    return removedAny;
}

// 7. BERSIHKAN SEMUA PAKIS (CLEAR ALL)
function clearAllFerns() {
    if (!fernsList) return;
    for (let i = 0; i < fernsList.length; i++) {
        fernsGroup.remove(fernsList[i]);
    }
    fernsList.length = 0;
    updateFernCountUI();
}

// 8. RECREATE FERN (UNTUK UNDO/REDO & LOAD MAP)
function recreateFern(data) {
    const fernType = data.fernType || 'spawn_fern_clump';
    const variations = FERN_MODELS[fernType] || FERN_MODELS.spawn_fern_clump;
    const vIdx = (data.variantIndex !== undefined && data.variantIndex < variations.length) ? data.variantIndex : 0;
    const geoPair = variations[vIdx];

    const isGold = (fernType === 'spawn_fern_golden');
    const leafMat = isGold ? goldenFrondMat : greenFrondMat;
    const stemMat = isGold ? goldenStemMat : greenStemMat;

    const leafMesh = new THREE.Mesh(geoPair.leafGeo, leafMat);
    const stemMesh = new THREE.Mesh(geoPair.stemGeo, stemMat);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    stemMesh.castShadow = true;
    stemMesh.receiveShadow = true;

    const fernGroup = new THREE.Group();
    fernGroup.add(leafMesh);
    fernGroup.add(stemMesh);

    fernGroup.position.set(data.posX, data.posY, data.posZ);
    if (data.rotX !== undefined) {
        fernGroup.rotation.set(data.rotX, data.rotY, data.rotZ);
    }
    if (data.scaleX !== undefined) {
        fernGroup.scale.set(data.scaleX, data.scaleY, data.scaleZ);
    } else {
        const s = data.scaleBase || 1.0;
        fernGroup.scale.set(s, s, s);
    }

    fernGroup.userData = {
        isFern: true,
        fernType: fernType,
        scaleBase: data.scaleBase || fernGroup.scale.x,
        variantIndex: vIdx,
        baseScale: { x: fernGroup.scale.x, y: fernGroup.scale.y, z: fernGroup.scale.z },
        baseQuaternion: fernGroup.quaternion.clone(),
        trample: 0.0,
        trampleDir: new THREE.Vector2(0, 1)
    };

    fernsGroup.add(fernGroup);
    fernsList.push(fernGroup);
    updateFernCountUI();
}

// 9. UPDATE UI COUNTER
function updateFernCountUI() {
    const valBadge = document.getElementById('val-fern-count');
    if (valBadge) {
        valBadge.innerText = `${fernsList.length} Pakis`;
    }
}

// 10. ANIMASI SWAY ANGIN & INTERAKSI ROBOH SAAT DIINJAK RUBAH (TRAMPLE INTERACTION)
function updateFerns(delta, elapsedTime) {
    fernTimeUniform.value = elapsedTime;

    if (!fernsList || fernsList.length === 0) return;

    // Deteksi posisi dan arah rubah
    let foxPos = null;
    let foxFwd = null;
    let isFoxActive = false;

    if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
        foxPos = wolfCharacter.root.position;
        const rotY = wolfCharacter.root.rotation.y || 0;
        foxFwd = new THREE.Vector2(-Math.cos(rotY), Math.sin(rotY));
        isFoxActive = true;
    } else if (typeof CinematicManager !== 'undefined' && CinematicManager.isFoxEnabled && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible) {
        foxPos = wolfCharacter.root.position;
        const rotY = wolfCharacter.root.rotation.y || 0;
        foxFwd = new THREE.Vector2(-Math.cos(rotY), Math.sin(rotY));
        isFoxActive = true;
    }

    const dt = Math.min(delta, 0.1);

    for (let i = 0; i < fernsList.length; i++) {
        const fern = fernsList[i];
        const ud = fern.userData;
        if (!ud) continue;

        // Inisialisasi baseQuaternion / baseScale jika belum ada
        if (!ud.baseQuaternion) ud.baseQuaternion = fern.quaternion.clone();
        if (!ud.baseScale) ud.baseScale = { x: fern.scale.x, y: fern.scale.y, z: fern.scale.z };
        if (ud.trample === undefined) ud.trample = 0.0;
        if (!ud.trampleDir) ud.trampleDir = new THREE.Vector2(0, 1);

        let isUnderPaws = false;

        if (isFoxActive && foxPos) {
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
                        const pushAway = new THREE.Vector2(dx / dist, dz / dist);
                        if (foxFwd) {
                            ud.trampleDir.copy(pushAway).lerp(foxFwd, 0.35).normalize();
                        } else {
                            ud.trampleDir.copy(pushAway);
                        }
                    }

                    // Roboh cepat saat terinjak kaki rubah
                    ud.trample = THREE.MathUtils.lerp(ud.trample, targetStrength, Math.min(1.0, dt * 14.0));
                }
            }
        }

        // Jika rubah sudah berlalu / menjauh: pulih tegak kembali perlahan (recovery)
        if (!isUnderPaws) {
            if (ud.trample > 0.001) {
                // Kecepatan bangun kembali ~1.5 detik
                ud.trample = Math.max(0, ud.trample - dt * 0.68);
            } else {
                ud.trample = 0;
            }
        }

        // Terapkan deformasi fisik roboh pada transform fernGroup
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
            const bendAngle = tr * 1.15;
            const rotAxis = new THREE.Vector3(-ud.trampleDir.y, 0, ud.trampleDir.x);
            const trampleQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, bendAngle);
            fern.quaternion.copy(trampleQuat).multiply(ud.baseQuaternion);
        } else if (ud.trample === 0 && ud._wasTrampled) {
            // Reset sempurna saat sudah pulih tegak 100%
            fern.scale.set(ud.baseScale.x, ud.baseScale.y, ud.baseScale.z);
            fern.quaternion.copy(ud.baseQuaternion);
            ud._wasTrampled = false;
        }

        if (ud.trample > 0.0005) {
            ud._wasTrampled = true;
        }
    }
}

// Export globals
window.fernsGroup = fernsGroup;
window.fernParams = fernParams;
window.placeFernsAt = placeFernsAt;
window.removeFernsInRadius = removeFernsInRadius;
window.clearAllFerns = clearAllFerns;
window.recreateFern = recreateFern;
window.updateFernCountUI = updateFernCountUI;
window.updateFerns = updateFerns;
