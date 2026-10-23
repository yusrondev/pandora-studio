/* ========================================================
   REALISTIC BOTANICAL FLOWER (BUNGA) MANAGER
   Ported 100% from:
   1. bunga-bertangkai.html (Bunga Bertangkai Kuning dengan Mahkota Berlapis, Cakram, & Benang Sari)
   2. bunga-kuning.html (Tanaman Bunga Daun Kuning Berlobus Bertingkat)
   High-performance procedural 3D flowers with organic wind sway,
   brush placement & removal, terrain snapping, map-storage, and undo/redo.
   ======================================================== */

// Global state for Flowers
const flowersGroup = new THREE.Group();
flowersGroup.name = 'flowersGroup';
if (typeof scene !== 'undefined') {
    scene.add(flowersGroup);
}

const flowersList = [];
window.flowersList = flowersList;
window.flowersGroup = flowersGroup;

const maxFlowerCapacity = 5000;

// Parameter kuas bunga
const flowerParams = {
    brushRadius: 3.5,
    flowerDensity: 3,
    staticScale: 1.0
};

// ==========================================
// 1. PSEUDO-RANDOM NUMBER GENERATOR (PRNG)
// ==========================================
function flowerRng(seed) {
    let s = (seed || 123456789) % 2147483647;
    if (s <= 0) s += 2147483646;
    return {
        rnd: () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        },
        rr: (a, b) => {
            s = (s * 16807) % 2147483647;
            return a + (b - a) * ((s - 1) / 2147483646);
        }
    };
}

const smSmooth = (a, b, x) => {
    x = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return x * x * (3 - 2 * x);
};

// ==========================================
// 2. PROCEDURAL TEXTURES (DARI SOURCE HTML)
// ==========================================
let _cachedFlowerLeafTex = null;
function getFlowerLeafTexture() {
    if (_cachedFlowerLeafTex) return _cachedFlowerLeafTex;
    const W = 256, H = 512, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const grd = g.createLinearGradient(0, H, 0, 0);
    grd.addColorStop(0, '#c9c53c');
    grd.addColorStop(0.18, '#e8b92a');
    grd.addColorStop(0.55, '#f6b81a');
    grd.addColorStop(1, '#ffc93c');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    const eg = g.createLinearGradient(0, 0, W, 0);
    eg.addColorStop(0, 'rgba(235,130,20,.38)');
    eg.addColorStop(0.28, 'rgba(235,130,20,0)');
    eg.addColorStop(0.72, 'rgba(235,130,20,0)');
    eg.addColorStop(1, 'rgba(235,130,20,.38)');
    g.fillStyle = eg;
    g.fillRect(0, 0, W, H);

    const rng = flowerRng(987654);
    for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${rng.rnd() < 0.5 ? '255,235,140' : '200,110,10'},${rng.rnd() * 0.07})`;
        g.fillRect(rng.rnd() * W, rng.rnd() * H, rng.rr(1, 5), rng.rr(2, 10));
    }

    const vein = (x0, y0, x1, y1, w, col) => {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.quadraticCurveTo((x0 + x1) / 2 + (x1 - x0) * 0.1, (y0 + y1) / 2 - 6, x1, y1);
        g.stroke();
    };

    for (let k = 0; k < 8; k++) {
        const u = 0.2 + k * 0.095, y = (1 - u) * H;
        for (const s of [-1, 1]) {
            vein(W / 2, y, W / 2 + s * W * 0.46, y - H * 0.075, 2.2, 'rgba(160,80,0,.22)');
            vein(W / 2, y - 1, W / 2 + s * W * 0.46, y - H * 0.075 - 1, 1.2, 'rgba(255,236,150,.45)');
            for (let m = 1; m < 4; m++) {
                const f = m / 4;
                vein(W / 2 + s * W * 0.46 * f, y - H * 0.075 * f, W / 2 + s * W * 0.46 * f + s * 14, y - H * 0.075 * f - 20, 0.8, 'rgba(255,230,140,.25)');
            }
        }
    }
    vein(W / 2, H * 0.98, W / 2, H * 0.02, 4, 'rgba(150,80,0,.28)');
    vein(W / 2 - 1, H * 0.98, W / 2 - 1, H * 0.02, 2, 'rgba(255,238,160,.65)');

    _cachedFlowerLeafTex = new THREE.CanvasTexture(c);
    _cachedFlowerLeafTex.anisotropy = 4;
    return _cachedFlowerLeafTex;
}

let _cachedFlowerPetalTex = null;
function getFlowerPetalTexture() {
    if (_cachedFlowerPetalTex) return _cachedFlowerPetalTex;
    const W = 128, H = 256, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const gr = g.createLinearGradient(0, H, 0, 0);
    grdColor: gr.addColorStop(0, '#f08a10');
    gr.addColorStop(0.25, '#f9ae14');
    gr.addColorStop(0.7, '#ffc928');
    gr.addColorStop(1, '#ffe36a');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);

    for (let k = -7; k <= 7; k++) {
        g.strokeStyle = `rgba(${k % 2 ? '200,100,0' : '255,235,150'},${k % 2 ? 0.16 : 0.3})`;
        g.lineWidth = 1.3;
        g.beginPath();
        g.moveTo(W / 2 + k * 1.5, H * 0.98);
        g.quadraticCurveTo(W / 2 + k * 6, H * 0.5, W / 2 + k * 8.5, H * 0.03);
        g.stroke();
    }

    const rng = flowerRng(456789);
    for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(255,${(200 + rng.rnd() * 50) | 0},120,${rng.rnd() * 0.08})`;
        g.fillRect(rng.rnd() * W, rng.rnd() * H, 1, rng.rr(4, 14));
    }

    _cachedFlowerPetalTex = new THREE.CanvasTexture(c);
    _cachedFlowerPetalTex.anisotropy = 4;
    return _cachedFlowerPetalTex;
}

// ==========================================
// 3. PROCEDURAL GEOMETRIES
// ==========================================
let _cachedLobedLeafGeo = null;
function getSharedLobedLeafGeometry() {
    if (_cachedLobedLeafGeo) return _cachedLobedLeafGeo;
    const U = 36, V = 14, pos = [], uv = [], idx = [];
    for (let i = 0; i <= U; i++) {
        const u = i / U;
        const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
        const lobe = 0.4 + 0.6 * Math.pow(Math.abs(Math.sin(u * Math.PI * 3.5 + 0.6)), 0.55);
        const w = 0.5 * env * lobe * (0.05 + 0.95 * smSmooth(0.05, 0.22, u));
        for (let j = 0; j <= V; j++) {
            const v = (j / V) * 2 - 1, x = v * w;
            let y = u, z = -0.5 * u * u + 0.7 * x * x / (0.15 + w);
            z += 0.025 * Math.sin(u * 38 + v * 4) * Math.abs(v) * smSmooth(0.2, 0.5, u);
            z += 0.02 * Math.sin(u * 9) * v;
            pos.push(x, y, z);
            uv.push(j / V, u);
        }
    }
    for (let i = 0; i < U; i++) {
        for (let j = 0; j < V; j++) {
            const a = i * (V + 1) + j, b = a + 1, c = a + V + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    _cachedLobedLeafGeo = new THREE.BufferGeometry();
    _cachedLobedLeafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    _cachedLobedLeafGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    _cachedLobedLeafGeo.setIndex(idx);
    _cachedLobedLeafGeo.computeVertexNormals();
    return _cachedLobedLeafGeo;
}

let _cachedPetalGeo = null;
function getSharedPetalGeometry() {
    if (_cachedPetalGeo) return _cachedPetalGeo;
    const U = 28, V = 12, pos = [], uv = [], idx = [];
    for (let i = 0; i <= U; i++) {
        const u = i / U;
        const w = 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.82)), 0.75) * (0.12 + 0.88 * smSmooth(0, 0.35, u));
        for (let j = 0; j <= V; j++) {
            const v = (j / V) * 2 - 1, x = v * w;
            let z = -0.5 * u * u * u + 0.9 * x * x / (0.18 + w) + 0.012 * Math.sin(u * 22 + v * 3) * Math.abs(v) * u;
            pos.push(x, u, z);
            uv.push(j / V, u);
        }
    }
    for (let i = 0; i < U; i++) {
        for (let j = 0; j < V; j++) {
            const a = i * (V + 1) + j, b = a + 1, c = a + V + 1, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
    }
    _cachedPetalGeo = new THREE.BufferGeometry();
    _cachedPetalGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    _cachedPetalGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    _cachedPetalGeo.setIndex(idx);
    _cachedPetalGeo.computeVertexNormals();
    return _cachedPetalGeo;
}

// ==========================================
// 4. SHARED MATERIALS
// ==========================================
let _flowerMaterials = null;
function getFlowerMaterials() {
    if (_flowerMaterials) return _flowerMaterials;
    const leafTex = getFlowerLeafTexture();
    const petalTex = getFlowerPetalTexture();

    _flowerMaterials = {
        leaf: new THREE.MeshStandardMaterial({
            map: leafTex,
            roughness: 0.5,
            side: THREE.DoubleSide,
            emissive: 0xb0a000,
            emissiveMap: leafTex,
            emissiveIntensity: 0.12
        }),
        leafYellowPlant: new THREE.MeshStandardMaterial({
            map: leafTex,
            roughness: 0.5,
            metalness: 0,
            side: THREE.DoubleSide,
            emissive: 0xffa000,
            emissiveMap: leafTex,
            emissiveIntensity: 0.16
        }),
        petal: new THREE.MeshStandardMaterial({
            map: petalTex,
            roughness: 0.42,
            side: THREE.DoubleSide,
            emissive: 0xff9a00,
            emissiveMap: petalTex,
            emissiveIntensity: 0.22
        }),
        stem: new THREE.MeshStandardMaterial({
            color: 0x8fa22a,
            roughness: 0.6
        }),
        stemYellowPlant: new THREE.MeshStandardMaterial({
            color: 0x93a22c,
            roughness: 0.65
        }),
        disc: new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85
        }),
        filament: new THREE.MeshStandardMaterial({
            color: 0xf2d170,
            roughness: 0.6
        }),
        anther: new THREE.MeshStandardMaterial({
            color: 0xe8870f,
            roughness: 0.55
        })
    };
    return _flowerMaterials;
}

// Helper orientasi basis transform matriks
function orientPart(inst, i, p, d, up, sx, sy, roll, rng) {
    let z = up.clone().sub(d.clone().multiplyScalar(up.dot(d)));
    if (z.length() < 0.05) z.set(rng.rr(-1, 1), 0.3, rng.rr(-1, 1));
    z.normalize();
    const x = new THREE.Vector3().crossVectors(d, z).normalize();
    z.applyAxisAngle(d, roll);
    x.applyAxisAngle(d, roll);
    const m = new THREE.Matrix4().makeBasis(x, d, z);
    m.multiply(new THREE.Matrix4().makeScale(sx, sy, Math.min(sx, sy)));
    m.setPosition(p);
    inst.setMatrixAt(i, m);
}

// ==========================================
// 5. PEMBUAT MODEL 1: BUNGA BERTANGKAI (FROM bunga-bertangkai.html)
// ==========================================
function createBungaBertangkaiMesh(seed, scale = 0.55) {
    const rng = flowerRng(seed);
    const mats = getFlowerMaterials();
    const plant = new THREE.Group();
    const Y = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Color();

    // 1. Tangkai melengkung alami
    const p1x = 0.05 + rng.rr(-0.02, 0.02);
    const p1z = 0.02 + rng.rr(-0.02, 0.02);
    const p2x = 0.10 + rng.rr(-0.03, 0.03);
    const p2z = 0.04 + rng.rr(-0.03, 0.03);
    const p3x = 0.08 + rng.rr(-0.04, 0.04);
    const p3z = 0.22 + rng.rr(-0.04, 0.04);

    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(p1x, 0.6, p1z),
        new THREE.Vector3(p2x, 1.2, p2z),
        new THREE.Vector3(p3x, 1.7, p3z)
    ]);

    const stemGeo = new THREE.TubeGeometry(curve, 24, 0.017, 8, false);
    const stemMesh = new THREE.Mesh(stemGeo, mats.stem);
    stemMesh.castShadow = true;
    stemMesh.receiveShadow = true;
    plant.add(stemMesh);

    // 2. Daun di tangkai (5 daun bertingkat)
    const NL = 5;
    const leavesInst = new THREE.InstancedMesh(getSharedLobedLeafGeometry(), mats.leaf, NL);
    leavesInst.castShadow = true;
    leavesInst.receiveShadow = true;

    for (let k = 0; k < NL; k++) {
        const t = 0.08 + k * 0.12;
        const p = curve.getPointAt(t);
        const T = curve.getTangentAt(t);
        const P = new THREE.Vector3().crossVectors(T, Y).normalize();
        const R = P.applyAxisAngle(T, k * 2.399 + 0.5);
        const a = 1.05 + rng.rr(-0.1, 0.1);
        const d = T.clone().multiplyScalar(Math.cos(a)).add(R.multiplyScalar(Math.sin(a))).normalize();
        const sc = THREE.MathUtils.lerp(0.72, 0.45, k / NL) * rng.rr(0.95, 1.05);
        orientPart(leavesInst, k, p, d, Y, sc * 1.2, sc, rng.rr(-0.3, 0.3), rng);
        tmp.setRGB(0.5 + rng.rnd() * 0.12, 1, 0.45);
        leavesInst.setColorAt(k, tmp);
    }
    leavesInst.instanceMatrix.needsUpdate = true;
    leavesInst.instanceColor.needsUpdate = true;
    plant.add(leavesInst);

    // 3. Kepala Bunga (Mahkota Bunga 36 Kelopak dalam 4 Lingkaran)
    const tp = curve.getPointAt(1);
    const axis = curve.getTangentAt(1).normalize();
    const P0 = new THREE.Vector3().crossVectors(axis, Y).normalize();
    const P1 = new THREE.Vector3().crossVectors(axis, P0).normalize();
    const rings = [
        [9, 1.38, 0.46, 0],
        [9, 1.08, 0.41, 0.5],
        [8, 0.78, 0.34, 0.25],
        [7, 0.46, 0.27, 0.7]
    ];

    const petalsInst = new THREE.InstancedMesh(getSharedPetalGeometry(), mats.petal, 36);
    petalsInst.castShadow = true;
    petalsInst.receiveShadow = true;
    let pi = 0;

    rings.forEach(([cnt, ang, len, off], r) => {
        for (let k = 0; k < cnt; k++) {
            const th = (k + off) / cnt * Math.PI * 2 + rng.rr(-0.06, 0.06);
            const a = ang + rng.rr(-0.06, 0.06);
            const rad = P0.clone().multiplyScalar(Math.cos(th)).add(P1.clone().multiplyScalar(Math.sin(th)));
            const d = axis.clone().multiplyScalar(Math.cos(a)).add(rad.multiplyScalar(Math.sin(a))).normalize();
            const L = len * rng.rr(0.94, 1.06);
            orientPart(petalsInst, pi, tp.clone().add(axis.clone().multiplyScalar(0.01 * r)), d, axis, L * 1.3, L, rng.rr(-0.1, 0.1), rng);
            const sh = 1 - r * 0.04;
            tmp.setRGB(1, (0.93 - r * 0.03) + rng.rnd() * 0.05, sh - 0.08 + rng.rnd() * 0.1);
            petalsInst.setColorAt(pi, tmp);
            pi++;
        }
    });
    petalsInst.instanceMatrix.needsUpdate = true;
    petalsInst.instanceColor.needsUpdate = true;
    plant.add(petalsInst);

    // 4. Cakram Tengah Organik Bunga
    const dg = new THREE.IcosahedronGeometry(0.1, 3);
    const dp = dg.attributes.position;
    const col = [];
    for (let i = 0; i < dp.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(dp, i).normalize();
        const bump = 0.5 + 0.5 * Math.sin(v.x * 70) * Math.sin(v.z * 70 + v.y * 20);
        v.multiplyScalar(0.1 * (1 + 0.06 * bump));
        dp.setXYZ(i, v.x, v.y, v.z);
        const h = Math.max(0, v.y / 0.1);
        tmp.setRGB(0.42 + 0.35 * bump * (1 - h * 0.4), 0.2 + 0.18 * bump, 0.04);
        col.push(tmp.r, tmp.g, tmp.b);
    }
    dg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    dg.computeVertexNormals();

    const disc = new THREE.Mesh(dg, mats.disc);
    disc.scale.set(1, 0.55, 1);
    disc.position.copy(tp).add(axis.clone().multiplyScalar(0.03));
    disc.quaternion.setFromUnitVectors(Y, axis);
    disc.castShadow = true;
    disc.receiveShadow = true;
    plant.add(disc);

    // 5. Benang Sari (40 Filamen & Kepala Sari)
    const NS = 40;
    const filInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0028, 0.0035, 0.13, 6), mats.filament, NS);
    const anthInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), mats.anther, NS);
    const qM = new THREE.Quaternion(), oneM = new THREE.Vector3(1, 1, 1), mat4 = new THREE.Matrix4();

    for (let k = 0; k < NS; k++) {
        const th = k * 2.399;
        const rad = P0.clone().multiplyScalar(Math.cos(th)).add(P1.clone().multiplyScalar(Math.sin(th)));
        const b = rng.rr(0.3, 0.95);
        const d = axis.clone().multiplyScalar(Math.cos(b)).add(rad.multiplyScalar(Math.sin(b))).normalize();
        const base = tp.clone().add(axis.clone().multiplyScalar(0.055)).add(rad.clone().multiplyScalar(rng.rr(0.01, 0.06)));
        qM.setFromUnitVectors(Y, d);
        const len = rng.rr(0.8, 1.2);
        mat4.compose(base.clone().add(d.clone().multiplyScalar(0.065 * len)), qM, new THREE.Vector3(1, len, 1));
        filInst.setMatrixAt(k, mat4);
        mat4.compose(base.clone().add(d.clone().multiplyScalar(0.13 * len)), qM, oneM);
        anthInst.setMatrixAt(k, mat4);
    }
    filInst.instanceMatrix.needsUpdate = true;
    anthInst.instanceMatrix.needsUpdate = true;
    plant.add(filInst);
    plant.add(anthInst);

    plant.scale.set(scale, scale, scale);
    plant.userData = {
        seed: seed,
        scale: scale,
        baseScale: scale,
        windPhase: rng.rnd() * 6.28
    };

    return plant;
}

// ==========================================
// 6. PEMBUAT MODEL 2: BUNGA KUNING (FROM bunga-kuning.html)
// ==========================================
function createBungaKuningMesh(seed, scale = 0.55) {
    const rng = flowerRng(seed);
    const mats = getFlowerMaterials();
    const plant = new THREE.Group();
    const Y = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Color();

    const perStem = 13;
    const inst = new THREE.InstancedMesh(getSharedLobedLeafGeometry(), mats.leafYellowPlant, perStem + 1);
    inst.castShadow = true;
    inst.receiveShadow = true;
    let n = 0;

    function addLeafToPlant(p, d, scVal, roll) {
        let z = Y.clone().sub(d.clone().multiplyScalar(Y.dot(d)));
        if (z.length() < 0.2) z = new THREE.Vector3(rng.rr(-1, 1), 0.2, rng.rr(-1, 1));
        z.normalize();
        const x = new THREE.Vector3().crossVectors(d, z).normalize();
        z.applyAxisAngle(d, roll);
        x.applyAxisAngle(d, roll);
        const m = new THREE.Matrix4().makeBasis(x, d, z);
        m.multiply(new THREE.Matrix4().makeScale(scVal * rng.rr(1.05, 1.3), scVal, scVal));
        m.setPosition(p);
        inst.setMatrixAt(n, m);
        const r = rng.rnd();
        tmp.setRGB(1, 0.88 + r * 0.12, 0.7 + rng.rnd() * 0.25);
        inst.setColorAt(n, tmp);
        n++;
    }

    const th = rng.rr(-Math.PI, Math.PI);
    const h = 1.5;
    const lean = 0.2;
    const ox = Math.cos(th), oz = Math.sin(th);

    const pts = [
        new THREE.Vector3(rng.rr(-0.06, 0.06), 0, rng.rr(-0.06, 0.06)),
        new THREE.Vector3(ox * lean * 0.2, h * 0.35, oz * lean * 0.2),
        new THREE.Vector3(ox * lean * 0.6, h * 0.7, oz * lean * 0.6),
        new THREE.Vector3(ox * lean, h, oz * lean)
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.013, 8, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, mats.stemYellowPlant);
    tubeMesh.castShadow = true;
    tubeMesh.receiveShadow = true;
    plant.add(tubeMesh);

    for (let k = 0; k < perStem; k++) {
        const t = 0.1 + 0.9 * (k / perStem) + rng.rr(-0.02, 0.02);
        const p = curve.getPointAt(Math.min(t, 1));
        const T = curve.getTangentAt(Math.min(t, 1));
        const P = new THREE.Vector3().crossVectors(T, Y);
        if (P.length() < 0.1) P.set(1, 0, 0);
        P.normalize();
        const R = P.applyAxisAngle(T, k * 2.399 + rng.rr(-0.3, 0.3));
        const a = THREE.MathUtils.lerp(1.0, 0.5, t) + rng.rr(-0.12, 0.12);
        const d = T.clone().multiplyScalar(Math.cos(a)).add(R.multiplyScalar(Math.sin(a))).normalize();
        addLeafToPlant(p, d, THREE.MathUtils.lerp(0.9, 0.38, t) * rng.rr(0.92, 1.08), rng.rr(-0.5, 0.5));
    }
    const tp = curve.getPointAt(1);
    const tt = curve.getTangentAt(1);
    addLeafToPlant(tp, tt.clone().add(new THREE.Vector3(ox * 0.15, 0.05, oz * 0.15)).normalize(), 0.3 * rng.rr(0.9, 1.1), rng.rr(-0.4, 0.4));

    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor.needsUpdate = true;
    plant.add(inst);

    plant.scale.set(scale, scale, scale);
    plant.userData = {
        seed: seed,
        scale: scale,
        baseScale: scale,
        windPhase: rng.rnd() * 6.28
    };

    return plant;
}

// ==========================================
// 7. PENEMPATAN BUNGA DENGAN KUAS (PLACE FLOWERS)
// ==========================================
function placeFlowersAt(intersectPoint, flowerType = 'spawn_flower_stem') {
    if (!intersectPoint || flowerType === 'none' || flowerType === 'remove') return;

    const radius = flowerParams.brushRadius || 3.5;
    const density = flowerParams.flowerDensity || 3;
    const count = (radius <= 1.2) ? 1 : Math.max(1, Math.round(density * (radius / 3.0)));
    const groundBound = (typeof groundSize !== 'undefined' ? groundSize / 2 : 75) - 1.0;

    let addedAny = false;

    for (let i = 0; i < count; i++) {
        if (flowersList.length >= maxFlowerCapacity) break;

        const r = (count === 1) ? 0 : radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const posX = intersectPoint.x + (count === 1 ? 0 : r * Math.cos(theta));
        const posZ = intersectPoint.z + (count === 1 ? 0 : r * Math.sin(theta));

        if (Math.abs(posX) > groundBound || Math.abs(posZ) > groundBound) continue;

        // Cegah penumpukan terlalu rapat (< 0.45 unit)
        let tooClose = false;
        for (let j = 0; j < flowersList.length; j++) {
            const existing = flowersList[j];
            if (Math.hypot(existing.posX - posX, existing.posZ - posZ) < 0.45) {
                tooClose = true;
                break;
            }
        }
        if (tooClose && count > 1) continue;

        const posY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(posX, posZ)
            : intersectPoint.y;

        const rotY = Math.random() * Math.PI * 2;
        const scale = (0.50 + Math.random() * 0.16) * (flowerParams.staticScale || 1.0);
        const seed = Math.floor(Math.random() * 2147483647);

        let mesh;
        if (flowerType === 'spawn_flower_yellow') {
            mesh = createBungaKuningMesh(seed, scale);
        } else {
            mesh = createBungaBertangkaiMesh(seed, scale);
        }

        mesh.position.set(posX, posY, posZ);
        mesh.rotation.y = rotY;
        flowersGroup.add(mesh);

        const flowerItem = {
            posX: posX,
            posY: posY,
            posZ: posZ,
            rotY: rotY,
            scale: scale,
            seed: seed,
            flowerType: flowerType,
            mesh: mesh,
            baseQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0, 'YXZ')),
            trample: 0.0,
            trampleVel: 0.0,
            trampleDir: new THREE.Vector2(0, 1),
            swayPhase: (posX * 0.5 + posZ * 0.3) + Math.random() * 2.0,
            swaySpeed: 1.2 + Math.random() * 0.5,
            wasTrampled: false,
            isUnderPaws: false
        };

        flowersList.push(flowerItem);
        addedAny = true;
    }

    if (addedAny) {
        updateFlowerCountUI();
    }
}

// ==========================================
// 8. HAPUS BUNGA DALAM RADIUS TERTENTU (KLIK KANAN / KUAS REMOVE)
// ==========================================
function removeFlowersInRadius(hitPoint, radius) {
    if (!flowersList || flowersList.length === 0) return false;
    let removedAny = false;

    for (let i = flowersList.length - 1; i >= 0; i--) {
        const f = flowersList[i];
        const dist = Math.hypot(f.posX - hitPoint.x, f.posZ - hitPoint.z);
        if (dist <= radius) {
            if (f.mesh) {
                flowersGroup.remove(f.mesh);
            }
            flowersList.splice(i, 1);
            removedAny = true;
        }
    }

    if (removedAny) {
        updateFlowerCountUI();
    }
    return removedAny;
}

// ==========================================
// 9. BERSIHKAN SEMUA BUNGA (CLEAR ALL)
// ==========================================
function clearAllFlowers() {
    for (let i = 0; i < flowersList.length; i++) {
        if (flowersList[i].mesh) {
            flowersGroup.remove(flowersList[i].mesh);
        }
    }
    flowersList.length = 0;
    updateFlowerCountUI();
}

// ==========================================
// 10. REKREASI BUNGA DARI SAVE DATA (MAP-STORAGE / UNDO-REDO)
// ==========================================
function recreateFlower(data) {
    const rawType = data.flowerType || '';
    const fType = (rawType.includes('yellow') || rawType.includes('solar'))
        ? 'spawn_flower_yellow'
        : 'spawn_flower_stem';

    const seed = data.seed || Math.floor(Math.random() * 2147483647);
    const posX = data.posX !== undefined ? data.posX : 0;
    const posZ = data.posZ !== undefined ? data.posZ : 0;
    const posY = (data.posY !== undefined && data.posY !== 0)
        ? data.posY
        : (typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(posX, posZ) : 0);
    const rotY = (data.rotY !== undefined) ? data.rotY : Math.random() * Math.PI * 2;
    const scale = data.scale || data.scaleBase || (0.50 + Math.random() * 0.16);

    let mesh;
    if (fType === 'spawn_flower_yellow') {
        mesh = createBungaKuningMesh(seed, scale);
    } else {
        mesh = createBungaBertangkaiMesh(seed, scale);
    }

    mesh.position.set(posX, posY, posZ);
    mesh.rotation.y = rotY;
    flowersGroup.add(mesh);

    const flowerItem = {
        posX: posX,
        posY: posY,
        posZ: posZ,
        rotY: rotY,
        scale: scale,
        seed: seed,
        flowerType: fType,
        mesh: mesh,
        baseQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0, 'YXZ')),
        trample: 0.0,
        trampleVel: 0.0,
        trampleDir: new THREE.Vector2(0, 1),
        swayPhase: (posX * 0.5 + posZ * 0.3) + Math.random() * 2.0,
        swaySpeed: 1.2 + Math.random() * 0.5,
        wasTrampled: false,
        isUnderPaws: false
    };

    flowersList.push(flowerItem);
    updateFlowerCountUI();
}

// ==========================================
// 11. REBUILD TRANSFORMS (PENYESUAIAN KETINGGIAN TERRAIN SCULPT)
// ==========================================
function rebuildFlowerTransforms() {
    if (!flowersList || flowersList.length === 0) return;
    for (let i = 0; i < flowersList.length; i++) {
        const f = flowersList[i];
        if (f.mesh && typeof getTerrainHeightFast === 'function') {
            const ty = getTerrainHeightFast(f.posX, f.posZ);
            f.posY = ty;
            f.mesh.position.y = ty;
        }
    }
}

// ==========================================
// 12. UPDATE RENDER LOOP (FISIK ROBOH RUBAH & ANGIN ALAMI)
// ==========================================
const _flowerFoxSegA = new THREE.Vector2();
const _flowerFoxSegB = new THREE.Vector2();
const _flowerFoxSegDir = new THREE.Vector2();
const _flowerPushAway = new THREE.Vector2();
const _flowerPushDir = new THREE.Vector2();
const _flowerRotAxis = new THREE.Vector3();
const _flowerTrampleQuat = new THREE.Quaternion();
const _flowerSwayQuat = new THREE.Quaternion();
const _flowerEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function updateFlowers(delta, elapsedTime) {
    if (!flowersList || flowersList.length === 0) return;

    const dt = Math.min(delta || 0.016, 0.1);

    // 1. Deteksi Posisi, Arah, dan Tubuh Rubah (Fox)
    let foxPos = null;
    let foxFwd = null;
    let isFoxActive = false;

    if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root && wolfCharacter.root.visible) {
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

    let foxSegLenSq = 0.0;
    if (isFoxActive && foxPos && foxFwd) {
        // Kapsul tubuh rubah dari pinggul/belakang hingga dada/kepala
        _flowerFoxSegA.set(foxPos.x - foxFwd.x * 0.38, foxPos.z - foxFwd.y * 0.38);
        _flowerFoxSegB.set(foxPos.x + foxFwd.x * 0.48, foxPos.z + foxFwd.y * 0.48);
        _flowerFoxSegDir.copy(_flowerFoxSegB).sub(_flowerFoxSegA);
        foxSegLenSq = _flowerFoxSegDir.lengthSq();
    }

    // 2. Loop Simulasi Tiap Tangkai Bunga
    for (let i = 0; i < flowersList.length; i++) {
        const f = flowersList[i];
        if (!f.mesh) continue;

        // Inisialisasi properti jika belum ada
        if (!f.baseQuaternion) {
            f.baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.rotY || 0, 0, 'YXZ'));
            f.trample = 0.0;
            f.trampleVel = 0.0;
            f.trampleDir = new THREE.Vector2(0, 1);
            f.swayPhase = (f.posX * 0.5 + f.posZ * 0.3) + Math.random() * 2.0;
            f.swaySpeed = 1.2 + Math.random() * 0.5;
            f.wasTrampled = false;
        }

        let isUnderPaws = false;

        // Evaluasi kontak fisik dengan rubah
        if (isFoxActive && foxPos && foxFwd) {
            const dy = Math.abs(foxPos.y - f.posY);
            if (dy < 1.7) {
                // Cari titik terdekat pada kapsul tubuh rubah ke posisi batang bunga
                let t = 0.5;
                if (foxSegLenSq > 0.0001) {
                    const dotVal = (f.posX - _flowerFoxSegA.x) * _flowerFoxSegDir.x + (f.posZ - _flowerFoxSegA.y) * _flowerFoxSegDir.y;
                    t = THREE.MathUtils.clamp(dotVal / foxSegLenSq, 0.0, 1.0);
                }
                const nearX = _flowerFoxSegA.x + _flowerFoxSegDir.x * t;
                const nearZ = _flowerFoxSegA.y + _flowerFoxSegDir.y * t;
                const dx = f.posX - nearX;
                const dz = f.posZ - nearZ;
                const dist = Math.hypot(dx, dz);

                // Radius interaksi proporsional dengan skala tanaman (~0.9m - 1.25m)
                const plantScale = f.scale || 0.6;
                const contactRadius = 0.95 * (plantScale / 0.55);

                if (dist < contactRadius) {
                    isUnderPaws = true;
                    // Kuat roboh semakin dalam ditabrak (0.0 -> 1.0)
                    const targetStrength = Math.pow(1.0 - (dist / contactRadius), 0.65);

                    // Arah rebah/roboh: menjauh dari tubuh rubah + terbawa laju langkah rubah
                    if (dist > 0.02) {
                        _flowerPushAway.set(dx / dist, dz / dist);
                    } else {
                        _flowerPushAway.copy(foxFwd);
                    }
                    _flowerPushDir.copy(_flowerPushAway).lerp(foxFwd, 0.42).normalize();
                    f.trampleDir.copy(_flowerPushDir);

                    // Rebah cepat saat tersentuh rubah
                    f.trample = THREE.MathUtils.lerp(f.trample, targetStrength, Math.min(1.0, dt * 20.0));
                    f.trampleVel = (targetStrength - f.trample) * 12.0;
                }
            }
        }

        // Jika rubah sudah lewat / menjauh: Fisik Pegas Membal (Damped Spring Rebound)
        if (!isUnderPaws) {
            const springK = 42.0; // Kekakuan pegas batang
            const damping = 7.5;  // Redaman goyangan
            const springAcc = -springK * f.trample - damping * f.trampleVel;
            f.trampleVel += springAcc * dt;
            f.trample += f.trampleVel * dt;

            // Jika energi pegas sudah habis mendekati 0, set diam sempurna
            if (Math.abs(f.trample) < 0.002 && Math.abs(f.trampleVel) < 0.01) {
                f.trample = 0.0;
                f.trampleVel = 0.0;
            }
        }

        // Terapkan Deformasi Fisik Roboh dan Goyangan Angin
        if (Math.abs(f.trample) > 0.001 || isUnderPaws) {
            // Sudut rebah batang bunga hingga ~75 derajat
            const bendAngle = f.trample * 1.32;
            // Getaran gesekan halus saat rubah sedang bersentuhan langsung
            const rustle = isUnderPaws ? (Math.sin(elapsedTime * 36.0 + f.seed) * 0.04 * f.trample) : 0.0;

            // Sumbu rotasi (Cross product UP x PUSH): (pushDir.y, 0, -pushDir.x)
            _flowerRotAxis.set(f.trampleDir.y, 0, -f.trampleDir.x).normalize();
            _flowerTrampleQuat.setFromAxisAngle(_flowerRotAxis, bendAngle + rustle);

            // Kalikan orientasi roboh dengan baseQuaternion tanaman
            f.mesh.quaternion.copy(_flowerTrampleQuat).multiply(f.baseQuaternion);

            // Kompresi rebah ke tanah dan mekar lateral
            const trPos = Math.max(0, f.trample);
            const squash = Math.max(0.22, 1.0 - trPos * 0.65);
            const spread = 1.0 + trPos * 0.16;
            const sc = f.scale || 0.6;
            f.mesh.scale.set(sc * spread, sc * squash, sc * spread);

            f.wasTrampled = true;
        } else {
            // Reset skala jika baru saja pulih dari injakan
            if (f.wasTrampled) {
                const sc = f.scale || 0.6;
                f.mesh.scale.set(sc, sc, sc);
                f.wasTrampled = false;
            }

            // Goyangan angin alami
            const t = elapsedTime * f.swaySpeed + f.swayPhase;
            const swayX = Math.sin(t * 0.9) * 0.025;
            const swayZ = Math.cos(t * 0.7 + 1.0) * 0.02;
            _flowerEuler.set(swayZ, 0, swayX, 'YXZ');
            _flowerSwayQuat.setFromEuler(_flowerEuler);
            f.mesh.quaternion.copy(_flowerSwayQuat).multiply(f.baseQuaternion);
        }
    }
}

// ==========================================
// 13. UPDATE UI COUNTER
// ==========================================
function updateFlowerCountUI() {
    const countBadge = document.getElementById('val-flower-count');
    if (countBadge) {
        countBadge.textContent = `${flowersList.length} Bunga`;
    }
    if (typeof refreshLayerUI === 'function') {
        refreshLayerUI();
    }
}

// Export ke window global
window.flowersGroup = flowersGroup;
window.flowersList = flowersList;
window.placeFlowersAt = placeFlowersAt;
window.removeFlowersInRadius = removeFlowersInRadius;
window.clearAllFlowers = clearAllFlowers;
window.recreateFlower = recreateFlower;
window.rebuildFlowerTransforms = rebuildFlowerTransforms;
window.updateFlowers = updateFlowers;
window.updateFlowerCountUI = updateFlowerCountUI;
window.flowerParams = flowerParams;
window.createBungaBertangkaiMesh = createBungaBertangkaiMesh;
window.createBungaKuningMesh = createBungaKuningMesh;
