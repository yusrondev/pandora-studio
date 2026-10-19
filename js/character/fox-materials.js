/* Low-Poly Fox Palette, Material, and Geometry Mesh Builders */
let currentSpeciesConfig = (typeof FOX_SPECIES !== 'undefined' && FOX_SPECIES.red) ? FOX_SPECIES.red : {
    colors: {
        ORANGE: new THREE.Color(0xfb6d1b),
        ORANGE_TOP: new THREE.Color(0xee5c11),
        EYE_BROW: new THREE.Color(0xcc4709),
        WHITE: new THREE.Color(0xfffcf7),
        WHITE_SHADE: new THREE.Color(0xf2ece4),
        DARK: new THREE.Color(0x272428),
        DARK_PAW: new THREE.Color(0x1d1a1e),
        EAR_IN: new THREE.Color(0xa3989c),
        EAR_IN_DEEP: new THREE.Color(0x84797d)
    },
    legGradient: function (t) {
        t = THREE.MathUtils.clamp(t, 0.0, 1.0);
        if (t < 0.25) return new THREE.Color(0xfb6d1b).lerp(new THREE.Color(0xdc5c16), t / 0.25);
        if (t < 0.50) return new THREE.Color(0xdc5c16).lerp(new THREE.Color(0xa23e0e), (t - 0.25) / 0.25);
        if (t < 0.75) return new THREE.Color(0xa23e0e).lerp(new THREE.Color(0x562316), (t - 0.50) / 0.25);
        return new THREE.Color(0x562316).lerp(new THREE.Color(0x1d1a1e), (t - 0.75) / 0.25);
    }
};

let C = currentSpeciesConfig.colors;

function setFoxActiveSpeciesColors(speciesKey) {
    if (typeof FOX_SPECIES !== 'undefined' && FOX_SPECIES[speciesKey]) {
        currentSpeciesConfig = FOX_SPECIES[speciesKey];
        C = currentSpeciesConfig.colors;
        currentFoxSpeciesKey = speciesKey;
    }
}

const foxMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide
});

function buildMeshFromTriangles(tris) {
    const positions = [];
    const colors = [];
    for (const t of tris) {
        positions.push(...t.a, ...t.b, ...t.c);
        if (t.cols) {
            colors.push(
                t.cols[0].r, t.cols[0].g, t.cols[0].b,
                t.cols[1].r, t.cols[1].g, t.cols[1].b,
                t.cols[2].r, t.cols[2].g, t.cols[2].b
            );
        } else {
            colors.push(
                t.col.r, t.col.g, t.col.b,
                t.col.r, t.col.g, t.col.b,
                t.col.r, t.col.g, t.col.b
            );
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, foxMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = false; // Hindari garis-garis shadow acne/moire pada model low-poly
    return mesh;
}

// Fungsi gradasi warna alami kaki rubah sesuai spesies aktif
function getFoxLegGradientColor(t) {
    if (currentSpeciesConfig && typeof currentSpeciesConfig.legGradient === 'function') {
        return currentSpeciesConfig.legGradient(t);
    }
    t = THREE.MathUtils.clamp(t, 0.0, 1.0);
    return C.ORANGE.clone().lerp(C.DARK, t);
}

function createHorizontalLoft(rings, colorFn, capFrontCol = null, capBackCol = null) {
    const tris = [];
    const verts = rings.map(r => {
        const yTS = r.yTop * 0.82 + r.yMid * 0.18;
        const yBS = r.yBot * 0.80 + r.yMid * 0.20;
        return [
            [r.x, r.yTop, 0],
            [r.x, yTS, r.zTop],
            [r.x, r.yMid, r.zMid],
            [r.x, yBS, r.zBot],
            [r.x, r.yBot, 0],
            [r.x, yBS, -r.zBot],
            [r.x, r.yMid, -r.zMid],
            [r.x, yTS, -r.zTop]
        ];
    });

    for (let i = 0; i < verts.length - 1; i++) {
        const A = verts[i], B = verts[i + 1];
        for (let j = 0; j < 8; j++) {
            const n = (j + 1) % 8;
            const col = colorFn(i, j);
            tris.push({ a: A[j], b: B[j], c: B[n], col });
            tris.push({ a: A[j], b: B[n], c: A[n], col });
        }
    }

    if (capFrontCol) {
        const A = verts[0];
        const c = [rings[0].x, rings[0].yMid, 0];
        for (let j = 0; j < 8; j++) {
            const n = (j + 1) % 8;
            tris.push({ a: c, b: A[n], c: A[j], col: capFrontCol(j) });
        }
    }
    if (capBackCol) {
        const B = verts[verts.length - 1];
        const last = rings[rings.length - 1];
        const c = [last.x, last.yMid, 0];
        for (let j = 0; j < 8; j++) {
            const n = (j + 1) % 8;
            tris.push({ a: c, b: B[j], c: B[n], col: capBackCol(j) });
        }
    }
    return buildMeshFromTriangles(tris);
}

function createVerticalLimb(rings, colorFn, capBottom = true) {
    const tris = [];
    const verts = rings.map(r => {
        const xF = r.x - r.rx * (r.frontExt || 1.0);
        const xB = r.x + r.rx * (r.backExt || 1.0);
        const xMF = r.x - r.rx * 0.72 * (r.frontExt || 1.0);
        const xMB = r.x + r.rx * 0.72 * (r.backExt || 1.0);
        const zS = r.rz;
        const zMS = r.rz * 0.72;
        return [
            [xF, r.y, 0],
            [xMF, r.y, zMS],
            [r.x, r.y, zS],
            [xMB, r.y, zMS],
            [xB, r.y, 0],
            [xMB, r.y, -zMS],
            [r.x, r.y, -zS],
            [xMF, r.y, -zMS]
        ];
    });

    for (let i = 0; i < verts.length - 1; i++) {
        const A = verts[i], B = verts[i + 1];
        for (let j = 0; j < 8; j++) {
            const n = (j + 1) % 8;
            const c = colorFn(i, j, rings[i], rings[i + 1]);
            if (Array.isArray(c) && c.length >= 2) {
                const colA = c[0];
                const colB = c[1];
                tris.push({ a: A[j], b: A[n], c: B[n], cols: [colA, colA, colB] });
                tris.push({ a: A[j], b: B[n], c: B[j], cols: [colA, colB, colB] });
            } else {
                const col = Array.isArray(c) ? c[0] : c;
                tris.push({ a: A[j], b: A[n], c: B[n], col });
                tris.push({ a: A[j], b: B[n], c: B[j], col });
            }
        }
    }

    if (capBottom) {
        const B = verts[verts.length - 1];
        const last = rings[rings.length - 1];
        const c = [last.x, last.y, 0];
        for (let j = 0; j < 8; j++) {
            const n = (j + 1) % 8;
            tris.push({ a: c, b: B[n], c: B[j], col: C.DARK_PAW });
        }
    }
    return buildMeshFromTriangles(tris);
}