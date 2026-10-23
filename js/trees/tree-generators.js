/* Procedural oak/birch/pine generators */
// ==========================================
// 6. GENERATOR POHON DINAMIS
// ==========================================
function populateLeavesInClustersDynamic(instancedLeaves, baseClusters, count) {
    const dummy = new THREE.Object3D();
    const countFactor = (count - 300) / (3200 - 300);
    const radiusExpansion = 1.0 + countFactor * 0.65;

    for (let i = 0; i < count; i++) {
        const randVal = Math.random();
        let cumulative = 0;
        let selectedCluster = baseClusters[0];

        for (const c of baseClusters) {
            cumulative += c.weight;
            if (randVal <= cumulative) {
                selectedCluster = c;
                break;
            }
        }

        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);

        const currentRadius = selectedCluster.radius * radiusExpansion;
        const r = Math.cbrt(Math.random()) * currentRadius;

        const x = selectedCluster.center.x + r * Math.sin(phi) * Math.cos(theta);
        const y = selectedCluster.center.y + r * Math.sin(phi) * Math.sin(theta);
        const z = selectedCluster.center.z + r * Math.cos(phi);

        dummy.position.set(x, y, z);
        dummy.rotation.set((Math.random() - 0.5) * 1.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 1.5);

        const scale = (0.85 + Math.random() * 0.45) * (1.0 + countFactor * 0.2);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();

        instancedLeaves.setMatrixAt(i, dummy.matrix);
    }
    instancedLeaves.instanceMatrix.needsUpdate = true;
}

function createGenshinOakTree(foliageMat, initialLeafCount = 1200, branchCount = 3, curvature = 0.5) {
    const treeGroup = new THREE.Group();
    const trunkGroup = new THREE.Group();

    const p1X = (Math.random() - 0.5) * 1.2 * curvature;
    const p1Z = (Math.random() - 0.5) * 1.2 * curvature;
    const p2X = (Math.random() - 0.5) * 1.6 * curvature;
    const p2Z = (Math.random() - 0.5) * 1.6 * curvature;
    const topY = 3.6 + Math.random() * 0.6;

    const branchPaths = [
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(p1X, 1.2, p1Z), new THREE.Vector3(p2X, 2.5, p2Z), new THREE.Vector3(0, topY, 0)]
    ];

    const clusters = [
        { center: new THREE.Vector3(0, topY, 0), radius: 1.8, weight: 0.4 }
    ];

    for (let i = 1; i < branchCount; i++) {
        const angle = (i / branchCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 0.8 + Math.random() * 0.8 * (curvature + 0.2);
        const bx = Math.cos(angle) * dist;
        const bz = Math.sin(angle) * dist;
        const by = 2.6 + Math.random() * 1.0;

        const midX = bx * 0.5 + (Math.random() - 0.5) * curvature;
        const midZ = bz * 0.5 + (Math.random() - 0.5) * curvature;

        branchPaths.push([
            new THREE.Vector3(p1X * 0.5, 1.5, p1Z * 0.5),
            new THREE.Vector3(midX, 2.2, midZ),
            new THREE.Vector3(bx, by, bz)
        ]);

        clusters.push({ center: new THREE.Vector3(bx, by, bz), radius: 1.4, weight: 0.6 / (branchCount - 1) });
    }

    branchPaths.forEach((points, index) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const radius = index === 0 ? 0.28 : 0.14;
        const tubeGeo = new THREE.TubeGeometry(curve, 24, radius, 10, false);
        const mesh = new THREE.Mesh(tubeGeo, oakBarkMaterial);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        trunkGroup.add(mesh);
    });

    treeGroup.add(trunkGroup);

    const leafGeo = new THREE.PlaneGeometry(1.35, 1.35);
    const instancedLeaves = new THREE.InstancedMesh(leafGeo, foliageMat, 4000);
    instancedLeaves.castShadow = true;
    instancedLeaves.receiveShadow = true;
    instancedLeaves.customDepthMaterial = leafDepthMaterial;

    populateLeavesInClustersDynamic(instancedLeaves, clusters, initialLeafCount);
    instancedLeaves.count = initialLeafCount;
    instancedLeaves.userData.baseYOffset = 0;

    treeGroup.add(instancedLeaves);
    treeGroup.userData = {
        type: 'Oak Tree',
        typeCode: 'oak',
        clusters: clusters,
        branchCount: branchCount,
        curvature: curvature,
        leafMesh: instancedLeaves,
        trunkGroup: trunkGroup,
        baseTrunkHeight: topY,
        foliageMat: foliageMat
    };

    return treeGroup;
}

function createGenshinBirchTree(foliageMat, initialLeafCount = 1000, branchCount = 3, curvature = 0.5, customTypeCode = null) {
    const treeGroup = new THREE.Group();
    const trunkGroup = new THREE.Group();

    const rx1 = (Math.random() - 0.5) * 1.2 * curvature;
    const rz1 = (Math.random() - 0.5) * 1.2 * curvature;
    const rx2 = (Math.random() - 0.5) * 1.5 * curvature;
    const rz2 = (Math.random() - 0.5) * 1.5 * curvature;
    const topY = 3.3 + Math.random() * 0.5;

    const branchPaths = [
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(rx1, 1.1, rz1), new THREE.Vector3(rx2, 2.3, rz2), new THREE.Vector3(0, topY, 0)]
    ];

    const clusters = [
        { center: new THREE.Vector3(0, topY + 0.7, 0), radius: 0.9, weight: 0.20 },
        { center: new THREE.Vector3(0, topY - 0.3, 0), radius: 1.3, weight: 0.30 }
    ];

    for (let i = 1; i < branchCount; i++) {
        const angle = (i / branchCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = 0.5 + Math.random() * 0.6 * (curvature + 0.2);
        const bx = Math.cos(angle) * dist;
        const bz = Math.sin(angle) * dist;
        const by = 2.5 + Math.random() * 1.1;

        const midX = bx * 0.5 + (Math.random() - 0.5) * curvature;
        const midZ = bz * 0.5 + (Math.random() - 0.5) * curvature;

        branchPaths.push([
            new THREE.Vector3(rx1 * 0.5, 1.2, rz1 * 0.5),
            new THREE.Vector3(midX, 2.0, midZ),
            new THREE.Vector3(bx, by, bz)
        ]);

        clusters.push({ center: new THREE.Vector3(bx, by, bz), radius: 1.1, weight: 0.5 / (branchCount - 1) });
    }

    branchPaths.forEach((points, index) => {
        const curve = new THREE.CatmullRomCurve3(points);
        const radius = index === 0 ? 0.17 : 0.085;
        const tubeGeo = new THREE.TubeGeometry(curve, 24, radius, 10, false);
        const mesh = new THREE.Mesh(tubeGeo, birchBarkMaterial);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        trunkGroup.add(mesh);
    });

    treeGroup.add(trunkGroup);

    const leafGeo = new THREE.PlaneGeometry(1.25, 1.25);
    const instancedLeaves = new THREE.InstancedMesh(leafGeo, foliageMat, 4000);
    instancedLeaves.castShadow = true;
    instancedLeaves.receiveShadow = true;
    instancedLeaves.customDepthMaterial = leafDepthMaterial;

    populateLeavesInClustersDynamic(instancedLeaves, clusters, initialLeafCount);
    instancedLeaves.count = initialLeafCount;
    instancedLeaves.userData.baseYOffset = 0;

    let resolvedTypeCode = customTypeCode;
    if (!resolvedTypeCode) {
        if (typeof birchTealMat !== 'undefined' && foliageMat === birchTealMat) resolvedTypeCode = 'birch_teal';
        else if (typeof autumnRedMat !== 'undefined' && foliageMat === autumnRedMat) resolvedTypeCode = 'birch_red';
        else resolvedTypeCode = 'birch_yellow';
    }

    const typeLabel = resolvedTypeCode === 'birch_teal' ? 'Birch Teal' : (resolvedTypeCode === 'birch_red' ? 'Birch Autumn' : 'Birch Yellow');

    treeGroup.add(instancedLeaves);
    treeGroup.userData = {
        type: typeLabel,
        typeCode: resolvedTypeCode,
        clusters: clusters,
        branchCount: branchCount,
        curvature: curvature,
        leafMesh: instancedLeaves,
        trunkGroup: trunkGroup,
        baseTrunkHeight: topY,
        foliageMat: foliageMat
    };

    return treeGroup;
}

// ==========================================
// 6.2 NEW POHON CEMARA (PINE) - FROM new-pine.html
// ==========================================
let _cachedPineBarkTex = null;
let _cachedPineBarkMat = null;
let _cachedPineLeafMap = null;
let _cachedPineAlphaMap = null;
let _cachedPineLeafMat = null;
let _cachedPineDepthMat = null;

function getPineNewBarkTexture() {
    if (_cachedPineBarkTex) return _cachedPineBarkTex;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#8b5a38';
    g.fillRect(0, 0, 128, 256);

    for (let i = 0; i < 80; i++) {
        const x = Math.random() * 128;
        const l = 30 + Math.random() * 90;
        const y = Math.random() * 256;
        g.strokeStyle = Math.random() < 0.5
            ? 'rgba(70,40,24,' + (0.2 + Math.random() * 0.3) + ')'
            : 'rgba(206,140,84,' + (0.25 + Math.random() * 0.3) + ')';
        g.lineWidth = 1 + Math.random() * 2.5;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(
            x + (Math.random() - 0.5) * 10,
            y + l * 0.3,
            x + (Math.random() - 0.5) * 10,
            y + l * 0.7,
            x + (Math.random() - 0.5) * 8,
            y + l
        );
        g.stroke();
    }

    _cachedPineBarkTex = new THREE.CanvasTexture(c);
    _cachedPineBarkTex.wrapS = THREE.RepeatWrapping;
    _cachedPineBarkTex.wrapT = THREE.RepeatWrapping;
    _cachedPineBarkTex.anisotropy = 4;
    return _cachedPineBarkTex;
}

function getPineNewBarkMaterial() {
    if (!_cachedPineBarkMat) {
        _cachedPineBarkMat = new THREE.MeshLambertMaterial({
            map: getPineNewBarkTexture(),
            color: 0xffffff,
            side: THREE.DoubleSide
        });
    }
    return _cachedPineBarkMat;
}

function initPineNewTextures() {
    if (_cachedPineLeafMap && _cachedPineAlphaMap) return;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ca = document.createElement('canvas');
    ca.width = ca.height = 256;
    const g = c.getContext('2d');
    const ga = ca.getContext('2d');

    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    ga.fillStyle = '#000000';
    ga.fillRect(0, 0, 256, 256);

    function needle(x, y, ang, len, w) {
        [g, ga].forEach(function (cx) {
            cx.save();
            cx.translate(x, y);
            cx.rotate(ang);
            cx.fillStyle = '#ffffff';
            cx.beginPath();
            cx.moveTo(0, 0);
            cx.quadraticCurveTo(w, -len * 0.5, 0, -len);
            cx.quadraticCurveTo(-w, -len * 0.5, 0, 0);
            cx.fill();
            cx.restore();
        });
    }

    needle(128, 252, 0, 236, 5);
    for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 36; i++) {
            const t = i / 35;
            const y = 248 - t * 210;
            needle(
                128,
                y,
                s * (1.05 - 0.5 * t) + (Math.random() - 0.5) * 0.12,
                (58 + Math.random() * 22) * (1 - t * 0.6) + 10,
                9 + Math.random() * 4
            );
        }
    }

    _cachedPineLeafMap = new THREE.CanvasTexture(c);
    _cachedPineLeafMap.anisotropy = 4;
    _cachedPineAlphaMap = new THREE.CanvasTexture(ca);
    _cachedPineAlphaMap.anisotropy = 4;
}

function getPineNewLeafMaterial() {
    initPineNewTextures();
    if (!_cachedPineLeafMat) {
        _cachedPineLeafMat = new THREE.MeshBasicMaterial({
            map: _cachedPineLeafMap,
            alphaMap: _cachedPineAlphaMap,
            alphaTest: 0.8,
            transparent: true,
            side: THREE.DoubleSide
        });
    }
    return _cachedPineLeafMat;
}

function getPineNewDepthMaterial() {
    initPineNewTextures();
    if (!_cachedPineDepthMat) {
        _cachedPineDepthMat = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: _cachedPineLeafMap,
            alphaMap: _cachedPineAlphaMap,
            alphaTest: 0.8
        });
    }
    return _cachedPineDepthMat;
}

function createGenshinPineTree(foliageMat, initialLeafCount = 3100, curvature = 0.5) {
    const pineGroup = new THREE.Group();
    const trunkGroup = new THREE.Group();

    function rr(a, b) {
        return a + (b - a) * Math.random();
    }

    /* ---------- tube builder tunggal (semua geometri kayu menjadi 1 mesh utuh) ---------- */
    const P = [], N = [], U = [], I = [];

    function addTube(curve, rf, seg, rad, vlen) {
        const firstVertIdx = P.length / 3;

        // Smooth continuous parallel transport frames along curve
        // to prevent 90° frame jumps and holes in the mesh
        let frames;
        if (typeof curve.computeFrenetFrames === 'function') {
            frames = curve.computeFrenetFrames(seg, false);
        } else {
            const tangents = [];
            const normals = [];
            const binormals = [];
            for (let i = 0; i <= seg; i++) {
                tangents.push(curve.getTangent(i / seg).normalize());
            }
            const t0 = tangents[0];
            let minAxis = new THREE.Vector3(1, 0, 0);
            const ax = Math.abs(t0.x), ay = Math.abs(t0.y), az = Math.abs(t0.z);
            if (ay <= ax && ay <= az) minAxis = new THREE.Vector3(0, 1, 0);
            else if (az <= ax && az <= ay) minAxis = new THREE.Vector3(0, 0, 1);
            const n0 = new THREE.Vector3().crossVectors(t0, minAxis).normalize();
            normals.push(n0);
            binormals.push(new THREE.Vector3().crossVectors(t0, n0).normalize());
            for (let i = 1; i <= seg; i++) {
                const vPrev = tangents[i - 1];
                const vCurr = tangents[i];
                const axis = new THREE.Vector3().crossVectors(vPrev, vCurr);
                let nCurr;
                if (axis.lengthSq() > 1e-7) {
                    axis.normalize();
                    const dot = Math.min(1, Math.max(-1, vPrev.dot(vCurr)));
                    const angle = Math.acos(dot);
                    nCurr = normals[i - 1].clone().applyAxisAngle(axis, angle);
                } else {
                    nCurr = normals[i - 1].clone();
                }
                normals.push(nCurr);
                binormals.push(new THREE.Vector3().crossVectors(vCurr, nCurr).normalize());
            }
            frames = { tangents, normals, binormals };
        }

        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            const c = curve.getPoint(t);
            const nn = frames.normals[i];
            const bb = frames.binormals[i];
            const r = rf(t);

            for (let j = 0; j <= rad; j++) {
                const a = (j / rad) * Math.PI * 2;
                const d = nn.clone().multiplyScalar(Math.cos(a)).add(bb.clone().multiplyScalar(Math.sin(a)));
                P.push(c.x + d.x * r, c.y + d.y * r, c.z + d.z * r);
                N.push(d.x, d.y, d.z);
                U.push((j / rad) * 2, t * vlen);
            }
        }

        for (let i2 = 0; i2 < seg; i2++) {
            for (let j2 = 0; j2 < rad; j2++) {
                const a0 = firstVertIdx + i2 * (rad + 1) + j2;
                const b0 = a0 + (rad + 1);
                I.push(a0, b0, a0 + 1);
                I.push(b0, b0 + 1, a0 + 1);
            }
        }
    }

    const cFactor = (typeof curvature === 'number') ? curvature * 2.0 : 1.0;
    const p1x = 0.07 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);
    const p1z = 0.04 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);
    const p2x = -0.05 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);
    const p2z = -0.04 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);
    const p3x = 0.08 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);
    const p3z = 0.05 * cFactor + (Math.random() - 0.5) * 0.1 * (curvature || 0.5);

    const trunk = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.3, 0),
        new THREE.Vector3(p1x, 1.6, p1z),
        new THREE.Vector3(p2x, 3.6, p2z),
        new THREE.Vector3(p3x, 5.9, p3z),
        new THREE.Vector3(0, 8.9, 0)
    ]);

    addTube(trunk, function (t) {
        return 0.25 * Math.pow(1 - t, 1.05) + 0.035 * Math.pow(1 - t, 0.5) + 0.2 * Math.exp(-t * 20);
    }, 40, 14, 6);

    function trunkAt(y) {
        return trunk.getPoint(Math.min(1, Math.max(0, (y + 0.3) / 9.2)));
    }

    /* ---------- foliage & ranting ---------- */
    const cards = [];
    const cDark = new THREE.Color(0x1a5654);
    const cMid = new THREE.Color(0x2a7d6e);
    const cLight = new THREE.Color(0x70b88a);

    if (foliageMat && foliageMat.uniforms && foliageMat.uniforms.uBaseColor) {
        cMid.copy(foliageMat.uniforms.uBaseColor.value);
        if (foliageMat.uniforms.uShadowColor) cDark.copy(foliageMat.uniforms.uShadowColor.value);
        if (foliageMat.uniforms.uHighlightColor) cLight.copy(foliageMat.uniforms.uHighlightColor.value);
    }

    const Y0 = 2.3, Y1 = 8.3;
    const sunDirVec = (typeof sunLight !== 'undefined' && sunLight.position)
        ? sunLight.position.clone().normalize()
        : new THREE.Vector3(-6, 10, 7).normalize();
    const sunH = new THREE.Vector3(sunDirVec.x, 0, sunDirVec.z).normalize();

    function tint(pos, dir, f) {
        const R = 3.3 * Math.pow(1 - f, 0.82) + 0.6;
        const out = Math.min(1, Math.hypot(pos.x, pos.z) / R);
        const h = new THREE.Vector3(pos.x, 0, pos.z).normalize();
        let t = 0.1 + 0.28 * out + 0.16 * Math.max(0, dir.y) + 0.2 * (h.dot(sunH) * 0.5 + 0.5) + 0.06 * f + rr(-0.07, 0.07);
        t = Math.min(1, Math.max(0, t));
        return t < 0.5 ? cDark.clone().lerp(cMid, t * 2) : cMid.clone().lerp(cLight, (t - 0.5) * 2);
    }

    function card(pos, dir, size, f) {
        cards.push({
            p: pos.clone(),
            d: dir.clone().normalize(),
            s: size,
            c: tint(pos, dir, f)
        });
    }

    function makeBranch(y, a, L, f, dense) {
        const p0 = trunkAt(y);
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const p1 = p0.clone().add(dir.clone().multiplyScalar(L * 0.5)).add(new THREE.Vector3(0, 0.25 + 0.1 * (1 - f), 0));
        const p2 = p0.clone().add(dir.clone().multiplyScalar(L)).add(new THREE.Vector3(0, 0.12 - 0.3 * (1 - f), 0));
        const bc = new THREE.QuadraticBezierCurve3(p0, p1, p2);

        // Cabang utama
        addTube(bc, function (t) {
            return (0.055 * (1 - t) + 0.012) * (1 - t * 0.3);
        }, 10, 8, Math.max(1, L * 0.8));

        const step = dense ? 0.08 : 0.22;
        for (let s = dense ? 0.15 : 0.25; s <= 0.95; s += step) {
            const bp = bc.getPoint(s);
            const tg = bc.getTangent(s).normalize();
            const lat = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0)).normalize();

            for (let k = -1; k <= 1; k += 2) {
                const td = tg.clone().multiplyScalar(0.55)
                    .add(lat.clone().multiplyScalar(k * 0.85))
                    .add(new THREE.Vector3(0, rr(0.1, 0.45), 0)).normalize();
                const tl = rr(0.55, 0.95) * (1 - s * 0.55) * Math.min(1, 0.45 + L * 0.28);
                const tp1 = bp.clone().add(td.clone().multiplyScalar(tl * 0.5)).add(new THREE.Vector3(0, 0.04, 0));
                const tp2 = bp.clone().add(td.clone().multiplyScalar(tl)).add(new THREE.Vector3(0, -0.05, 0));
                const tc = new THREE.QuadraticBezierCurve3(bp, tp1, tp2);

                // Anak ranting tersambung utuh dalam 1 mesh geometri kayu
                addTube(tc, function (t) {
                    return (0.02 * (1 - t) + 0.005) * (1 - t * 0.5);
                }, 6, 6, 0.5);

                if (dense) {
                    for (let m = 0; m < 3; m++) {
                        const cp = tc.getPoint(Math.min(1, 0.45 + m * 0.22));
                        card(
                            cp,
                            td.clone().add(new THREE.Vector3(rr(-0.6, 0.6), rr(-0.1, 0.5), rr(-0.6, 0.6))),
                            rr(0.85, 1.35) * (0.7 + 0.4 * Math.min(1, L / 2)),
                            f
                        );
                    }
                }
            }
        }

        if (dense) {
            const tipN = 5;
            for (let q = 0; q < tipN; q++) {
                card(
                    p2.clone().add(new THREE.Vector3(rr(-0.12, 0.12), rr(0, 0.15), rr(-0.12, 0.12))),
                    dir.clone().add(new THREE.Vector3(rr(-0.7, 0.7), rr(0, 0.6), rr(-0.7, 0.7))),
                    rr(0.8, 1.2),
                    f
                );
            }
        }
    }

    const BR = 36;
    for (let i = 0; i < BR; i++) {
        const f = i / (BR - 1);
        makeBranch(
            Y0 + f * (Y1 - Y0) + rr(-0.08, 0.08),
            i * 2.399 + rr(-0.3, 0.3),
            3.4 * Math.pow(1 - f, 0.82) + 0.5,
            f,
            true
        );
    }
    for (let i = 0; i < 6; i++) {
        makeBranch(
            0.9 + i * 0.2 + rr(-0.05, 0.05),
            i * 2.399 + 1,
            rr(0.7, 1.3),
            0,
            false
        );
    }

    for (let n = 0; n < 500; n++) {
        const ff = Math.random();
        const yy = Y0 + 0.3 + ff * (Y1 - Y0 - 0.3);
        const Rm = (3.3 * Math.pow(1 - ff, 0.82) + 0.6) * 0.55;
        const ang = Math.random() * Math.PI * 2;
        const rd = Math.sqrt(Math.random()) * Rm;
        const tp = trunkAt(yy);
        card(
            new THREE.Vector3(tp.x + Math.cos(ang) * rd, yy + rr(-0.3, 0.3), tp.z + Math.sin(ang) * rd),
            new THREE.Vector3(Math.cos(ang), rr(0, 0.6), Math.sin(ang)),
            rr(0.9, 1.3),
            ff * 0.6
        );
    }

    // Menggabungkan seluruh geometri kayu (batang + semua cabang + semua ranting) dalam 1 Mesh utuh
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    bg.setIndex(I);

    const trunkMesh = new THREE.Mesh(bg, getPineNewBarkMaterial());
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkGroup.add(trunkMesh);
    pineGroup.add(trunkGroup);

    // Dedaunan jarum pinus (Needle Cards)
    const lg = new THREE.PlaneGeometry(1, 1);
    lg.translate(0, 0.5, 0);

    const totalGeneratedCards = cards.length;
    const maxCapacity = Math.max(totalGeneratedCards, 4500);
    const inst = new THREE.InstancedMesh(lg, getPineNewLeafMaterial(), maxCapacity);
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.customDepthMaterial = getPineNewDepthMaterial();

    const M = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qr = new THREE.Quaternion();
    const up0 = new THREE.Vector3(0, 1, 0);

    for (let c = 0; c < cards.length; c++) {
        const cd = cards[c];
        const yv = cd.d;
        const xv = new THREE.Vector3().crossVectors(yv, up0);
        if (xv.lengthSq() < 1e-4) xv.set(1, 0, 0);
        xv.normalize();
        const zv = new THREE.Vector3().crossVectors(xv, yv);

        M.makeBasis(xv, yv, zv);
        q.setFromRotationMatrix(M);
        qr.setFromAxisAngle(yv, rr(-0.7, 0.7));
        qr.multiply(q);
        M.compose(cd.p, qr, new THREE.Vector3(cd.s, cd.s, 1));

        inst.setMatrixAt(c, M);
        inst.setColorAt(c, cd.c);
    }

    const targetLeafCount = (initialLeafCount && initialLeafCount > 0)
        ? Math.min(totalGeneratedCards, initialLeafCount)
        : totalGeneratedCards;
    inst.count = targetLeafCount;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.userData.baseYOffset = 0;

    function populatePineLeavesDynamic(count) {
        const activeCount = Math.min(totalGeneratedCards, Math.max(1, count));
        inst.count = activeCount;
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    pineGroup.add(inst);

    pineGroup.userData = {
        type: 'Pine Tree',
        typeCode: 'pine',
        isPine: true,
        branchCount: 36,
        curvature: curvature,
        populatePineLeaves: populatePineLeavesDynamic,
        leafMesh: inst,
        trunkGroup: trunkGroup,
        baseTrunkHeight: 8.9,
        foliageMat: foliageMat
    };

    return pineGroup;
}

