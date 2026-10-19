/* Falling leaves particle system */
// ==========================================
// SISTEM PARTIKEL DAUN RONTOK
// ==========================================
const maxFallingLeaves = 1200;
const fallingLeafGeo = new THREE.PlaneGeometry(0.35, 0.35);
const fallingLeafMat = new THREE.MeshBasicMaterial({
    map: singleLeafTexture,
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide
});

const fallingLeavesMesh = new THREE.InstancedMesh(fallingLeafGeo, fallingLeafMat, maxFallingLeaves);
const fallingLeafColors = new Float32Array(maxFallingLeaves * 3);
fallingLeafGeo.setAttribute('color', new THREE.InstancedBufferAttribute(fallingLeafColors, 3));
fallingLeafMat.vertexColors = true;

scene.add(fallingLeavesMesh);

const leafData = [];
const dummyLeaf = new THREE.Object3D();

for (let i = 0; i < maxFallingLeaves; i++) {
    leafData.push({
        active: false,
        x: 0, y: -500, z: 0,
        vx: 0, vy: 0, vz: 0,
        rotX: 0, rotY: 0, rotZ: 0,
        rotSpeedX: 0, rotSpeedY: 0,
        scale: 1,
        color: new THREE.Color()
    });

    dummyLeaf.position.set(0, -500, 0);
    dummyLeaf.scale.set(0, 0, 0);
    dummyLeaf.updateMatrix();
    fallingLeavesMesh.setMatrixAt(i, dummyLeaf.matrix);
}

let leafFallRate = 1.0;
let windSpeedRate = 1.0;

function spawnFallingLeafFromTree(tree) {
    let inactiveIdx = -1;
    for (let i = 0; i < maxFallingLeaves; i++) {
        if (!leafData[i].active) {
            inactiveIdx = i;
            break;
        }
    }
    if (inactiveIdx === -1) return;

    const leaf = leafData[inactiveIdx];
    leaf.active = true;

    const clusters = tree.userData.clusters || [{ center: new THREE.Vector3(0, 3.5, 0), radius: 1.5 }];
    const cluster = clusters[Math.floor(Math.random() * clusters.length)];

    const trunkScaleY = tree.userData.trunkGroup ? tree.userData.trunkGroup.scale.y : 1.0;
    const heightOffset = (tree.userData.baseTrunkHeight || 3.5) * (trunkScaleY - 1.0);

    const spawnPos = new THREE.Vector3()
        .copy(cluster.center)
        .add(new THREE.Vector3(
            (Math.random() - 0.5) * cluster.radius * 1.5,
            (Math.random() - 0.5) * cluster.radius,
            (Math.random() - 0.5) * cluster.radius * 1.5
        ));

    spawnPos.y += heightOffset;
    spawnPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation.y);
    spawnPos.add(tree.position);

    leaf.x = spawnPos.x;
    leaf.y = spawnPos.y;
    leaf.z = spawnPos.z;

    leaf.vy = -0.02 - Math.random() * 0.025;
    leaf.vx = (Math.random() - 0.5) * 0.015;
    leaf.vz = (Math.random() - 0.5) * 0.015;

    leaf.rotX = Math.random() * Math.PI * 2;
    leaf.rotY = Math.random() * Math.PI * 2;
    leaf.rotZ = Math.random() * Math.PI * 2;
    leaf.rotSpeedX = (Math.random() - 0.5) * 0.08;
    leaf.rotSpeedY = (Math.random() - 0.5) * 0.08;

    leaf.scale = 0.7 + Math.random() * 0.6;

    const treeMat = tree.userData.foliageMat;
    if (treeMat && treeMat.uniforms && treeMat.uniforms.uBaseColor) {
        leaf.color.copy(treeMat.uniforms.uBaseColor.value);
    } else {
        leaf.color.setHex(0x52b314);
    }

    const colorAttr = fallingLeavesMesh.geometry.attributes.color;
    colorAttr.setXYZ(inactiveIdx, leaf.color.r, leaf.color.g, leaf.color.b);
    colorAttr.needsUpdate = true;
}

function updateFallingLeaves(delta) {
    let updated = false;

    for (let i = 0; i < maxFallingLeaves; i++) {
        const leaf = leafData[i];
        if (leaf.active) {
            const groundY = getTerrainHeightFast(leaf.x, leaf.z);

            leaf.y += leaf.vy;
            leaf.x += leaf.vx + Math.sin(leaf.y * 3.0) * 0.015 * windSpeedRate;
            leaf.z += leaf.vz + Math.cos(leaf.y * 2.5) * 0.015 * windSpeedRate;

            leaf.rotX += leaf.rotSpeedX;
            leaf.rotY += leaf.rotSpeedY;

            if (leaf.y <= groundY + 0.05) {
                leaf.active = false;
                dummyLeaf.position.set(0, -500, 0);
                dummyLeaf.scale.set(0, 0, 0);
            } else {
                dummyLeaf.position.set(leaf.x, leaf.y, leaf.z);
                dummyLeaf.rotation.set(leaf.rotX, leaf.rotY, leaf.rotZ);
                dummyLeaf.scale.set(leaf.scale, leaf.scale, leaf.scale);
            }

            dummyLeaf.updateMatrix();
            fallingLeavesMesh.setMatrixAt(i, dummyLeaf.matrix);
            updated = true;
        }
    }

    if (updated) {
        fallingLeavesMesh.instanceMatrix.needsUpdate = true;
    }
}
