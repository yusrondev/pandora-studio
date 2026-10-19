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

function createGenshinPineTree(foliageMat, initialLeafCount = 2200, curvature = 0.5) {
    const pineGroup = new THREE.Group();
    const trunkGroup = new THREE.Group();

    const p1X = (Math.random() - 0.5) * 0.8 * curvature;
    const p1Z = (Math.random() - 0.5) * 0.8 * curvature;

    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(p1X, 2.6, p1Z),
        new THREE.Vector3(0, 5.2, 0)
    ]);

    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.14, 8, false);
    const trunkMesh = new THREE.Mesh(tubeGeo, oakBarkMaterial);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkGroup.add(trunkMesh);
    pineGroup.add(trunkGroup);

    const numTiers = 14;
    const leafGeo = new THREE.PlaneGeometry(0.55, 1.15);
    leafGeo.translate(0, 0.57, 0);

    const instancedLeaves = new THREE.InstancedMesh(leafGeo, foliageMat, 4000);
    instancedLeaves.castShadow = true;
    instancedLeaves.receiveShadow = true;
    instancedLeaves.customDepthMaterial = pineDepthMaterial;

    function populatePineLeavesDynamic(count) {
        const dummy = new THREE.Object3D();
        let idx = 0;
        const currentPerTier = Math.floor(count / numTiers);
        const countFactor = (count - 300) / (3200 - 300);
        const widthExpansion = 1.0 + countFactor * 0.55;

        for (let t = 0; t < numTiers; t++) {
            const heightPercent = t / (numTiers - 1);
            const tierY = 1.0 + heightPercent * 4.1;

            let tierRadius = ((1.0 - Math.pow(heightPercent, 0.85)) * 1.25 + 0.08) * widthExpansion;
            if (t === numTiers - 1) tierRadius = 0.02;

            for (let i = 0; i < currentPerTier; i++) {
                const angle = (i / currentPerTier) * Math.PI * 2 + (t * 0.4) + (Math.random() - 0.5) * 0.25;
                const dist = tierRadius * Math.pow(Math.random(), 0.35);

                dummy.position.set(Math.cos(angle) * dist, tierY + (Math.random() - 0.5) * 0.2, Math.sin(angle) * dist);
                const pitch = 0.25 + (1.0 - heightPercent) * 0.3;
                dummy.rotation.set(
                    Math.sin(angle) * pitch + (Math.random() - 0.5) * 0.15,
                    angle + Math.PI / 2 + (Math.random() - 0.5) * 0.4,
                    -Math.cos(angle) * pitch + (Math.random() - 0.5) * 0.15
                );

                const scaleX = (0.55 + Math.random() * 0.35) * (1.0 + countFactor * 0.15);
                const scaleY = (0.65 + Math.random() * 0.45) * (1.0 + countFactor * 0.15);
                dummy.scale.set(scaleX, scaleY, scaleX);
                dummy.updateMatrix();

                instancedLeaves.setMatrixAt(idx++, dummy.matrix);
            }
        }
        instancedLeaves.instanceMatrix.needsUpdate = true;
    }

    populatePineLeavesDynamic(initialLeafCount);
    instancedLeaves.count = initialLeafCount;
    instancedLeaves.userData.baseYOffset = 0;

    pineGroup.add(instancedLeaves);
    pineGroup.userData = {
        type: 'Pine Tree',
        typeCode: 'pine',
        isPine: true,
        curvature: curvature,
        populatePineLeaves: populatePineLeavesDynamic,
        leafMesh: instancedLeaves,
        trunkGroup: trunkGroup,
        baseTrunkHeight: 4.1,
        foliageMat: foliageMat
    };

    return pineGroup;
}
