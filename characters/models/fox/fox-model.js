/* Orange Wolf 3D Model */
// =====================================================================
// 5. MODELLING KARAKTER SERIGALA ORANGE (GHIBLI & GENSHIN AESTHETIC)
// =====================================================================
// Hirarki Skeletal Procedural:
// wolfRoot
//   -> mainBody
//        -> chestMane (bulu leher putih mekar khas Moro & Genshin)
//        -> neck & head
//             -> snout, nose, eyes, fluffy ears, jaw
//             -> genshinSpiritCollar (amulet emas dengan pita melambai)
//        -> 4 articulated legs (thigh -> shin -> paw)
//        -> 5-segment fluffy tail (ayunan fisika sekunder)

const wolfRoot = new THREE.Group();
wolfRoot.position.set(0, 0, 0);
scene.add(wolfRoot);

// Kontainer Badan Utama
const bodyGroup = new THREE.Group();
wolfRoot.add(bodyGroup);

// 1. Torso Atletis Ramping Khas Rubah (Taper halus dari dada ke panggul)
const torsoGeo = new THREE.CylinderGeometry(0.50, 0.42, 1.38, 24);
torsoGeo.rotateX(Math.PI / 2);
const torsoMesh = new THREE.Mesh(torsoGeo, furOrangeMat);
torsoMesh.castShadow = true;
torsoMesh.receiveShadow = true;
torsoMesh.position.set(0, 1.25, 0);
bodyGroup.add(torsoMesh);

// Tutup panggul/pantat belakang yang pas dan ramping (tidak menggembung besar atau turun ke bawah)
const rumpCapGeo = new THREE.SphereGeometry(0.41, 16, 12);
rumpCapGeo.scale(0.98, 0.95, 0.45);
const rumpCapMesh = new THREE.Mesh(rumpCapGeo, furOrangeMat);
rumpCapMesh.position.set(0, 1.25, -0.62);
rumpCapMesh.castShadow = true;
rumpCapMesh.receiveShadow = true;
bodyGroup.add(rumpCapMesh);

// Perut Bawah Putih Ramping (Underbelly)
const bellyGeo = new THREE.CylinderGeometry(0.46, 0.38, 1.32, 16);
bellyGeo.rotateX(Math.PI / 2);
const bellyMesh = new THREE.Mesh(bellyGeo, furWhiteMat);
bellyMesh.position.set(0, 1.16, 0);
bellyMesh.scale.set(0.92, 0.9, 0.98);
bodyGroup.add(bellyMesh);

// 2. Dada Megah & Surai Bulu Fluff Ghibli (Moro Chest Mane)
const chestGroup = new THREE.Group();
chestGroup.position.set(0, 1.35, 0.6);
bodyGroup.add(chestGroup);

const chestBaseGeo = new THREE.SphereGeometry(0.58, 14, 12);
chestBaseGeo.scale(1.0, 1.15, 0.9);
const chestBaseMesh = new THREE.Mesh(chestBaseGeo, furWhiteMat);
chestBaseMesh.castShadow = true;
chestGroup.add(chestBaseMesh);

// Rumbai-rumbai bulu dada putih berlayer (Stylized Fur Tufts)
for (let i = 0; i < 7; i++) {
    const tuftGeo = new THREE.ConeGeometry(0.18, 0.45, 5);
    tuftGeo.rotateX(Math.PI / 3);
    const tuftMesh = new THREE.Mesh(tuftGeo, furWhiteMat);
    const angle = (i / 6 - 0.5) * 1.5;
    tuftMesh.position.set(Math.sin(angle) * 0.4, -0.25 + Math.cos(angle) * 0.1, 0.28);
    tuftMesh.rotation.y = angle * 0.7;
    tuftMesh.castShadow = true;
    chestGroup.add(tuftMesh);
}

// 3. Leher & Kepala
const neckGroup = new THREE.Group();
neckGroup.position.set(0, 1.5, 0.85);
bodyGroup.add(neckGroup);

const neckGeo = new THREE.CylinderGeometry(0.36, 0.46, 0.65, 10);
neckGeo.rotateX(Math.PI / 4);
const neckMesh = new THREE.Mesh(neckGeo, furOrangeMat);
neckMesh.position.set(0, 0.15, 0.1);
neckMesh.castShadow = true;
neckGroup.add(neckMesh);

const headGroup = new THREE.Group();
headGroup.position.set(0, 0.42, 0.32);
neckGroup.add(headGroup);

// Kalung Genshin Spirit Amulet & Pita Melambai (Genshin Spirit Collar)
const collarGroup = new THREE.Group();
collarGroup.position.set(0, 0.05, 0.18);
collarGroup.rotation.x = Math.PI / 4;
neckGroup.add(collarGroup);

const collarMat = new THREE.MeshToonMaterial({
    color: 0xd9383a, // Merah Shinto / Genshin Vermilion
    gradientMap: celGradientTex,
    roughness: 0.5
});
const collarBandGeo = new THREE.TorusGeometry(0.42, 0.038, 8, 24);
const collarBandMesh = new THREE.Mesh(collarBandGeo, collarMat);
collarBandMesh.castShadow = true;
collarGroup.add(collarBandMesh);

// Amulet / Lonceng Emas Roh (Golden Spirit Amulet)
const amuletBellGeo = new THREE.SphereGeometry(0.1, 10, 8);
amuletBellGeo.scale(1.0, 1.1, 0.85);
const amuletBellMesh = new THREE.Mesh(amuletBellGeo, goldRuneMat);
amuletBellMesh.position.set(0, -0.4, 0.05);
amuletBellMesh.castShadow = true;
collarGroup.add(amuletBellMesh);

// Ring Emas Aksen Lonceng
const bellRingGeo = new THREE.TorusGeometry(0.085, 0.018, 6, 16);
const bellRingMesh = new THREE.Mesh(bellRingGeo, goldRuneMat);
bellRingMesh.position.set(0, -0.4, 0.05);
collarGroup.add(bellRingMesh);

// Batok Kepala Serigala Anime (Stylized Wolf Cranium)
const headGeo = new THREE.SphereGeometry(0.48, 14, 12);
headGeo.scale(1.05, 0.95, 1.15);
const headMesh = new THREE.Mesh(headGeo, furOrangeMat);
headMesh.castShadow = true;
headGroup.add(headMesh);

// Pipih Samping Fluffy (Cheek Fur Tufts khas anime)
for (let side of [-1, 1]) {
    const cheekTuftGeo = new THREE.ConeGeometry(0.16, 0.42, 5);
    cheekTuftGeo.rotateZ(side * Math.PI / 2.8);
    cheekTuftGeo.rotateY(0.2);
    const cheekTuft = new THREE.Mesh(cheekTuftGeo, furWhiteMat);
    cheekTuft.position.set(side * 0.45, -0.08, 0.05);
    headGroup.add(cheekTuft);

    const cheekTuft2 = cheekTuft.clone();
    cheekTuft2.position.set(side * 0.48, 0.08, -0.05);
    cheekTuft2.scale.set(0.8, 0.8, 0.8);
    headGroup.add(cheekTuft2);
}

// Moncong Serigala (Snout & Muzzle)
const snoutGeo = new THREE.ConeGeometry(0.28, 0.58, 8);
snoutGeo.rotateX(Math.PI / 2);
snoutGeo.scale(1.1, 0.85, 1.0);
const snoutMesh = new THREE.Mesh(snoutGeo, furOrangeMat);
snoutMesh.position.set(0, -0.08, 0.48);
snoutMesh.castShadow = true;
headGroup.add(snoutMesh);

// Bagian Bawah Moncong Putih
const muzzleWhiteGeo = new THREE.SphereGeometry(0.22, 10, 8);
muzzleWhiteGeo.scale(1.1, 0.7, 1.3);
const muzzleWhiteMesh = new THREE.Mesh(muzzleWhiteGeo, furWhiteMat);
muzzleWhiteMesh.position.set(0, -0.16, 0.42);
headGroup.add(muzzleWhiteMesh);

// Hidung Segitiga Hitam Berkilau
const noseGeo = new THREE.SphereGeometry(0.085, 8, 8);
noseGeo.scale(1.2, 0.85, 1.0);
const noseMesh = new THREE.Mesh(noseGeo, darkAccentsMat);
noseMesh.position.set(0, -0.02, 0.78);
headGroup.add(noseMesh);

// Rahang Bawah (Pivoting Jaw saat Mengaum / Howl)
const jawGroup = new THREE.Group();
jawGroup.position.set(0, -0.18, 0.28);
headGroup.add(jawGroup);

const jawGeo = new THREE.ConeGeometry(0.18, 0.42, 6);
jawGeo.rotateX(Math.PI / 2);
jawGeo.scale(1.0, 0.6, 1.0);
const jawMesh = new THREE.Mesh(jawGeo, furWhiteMat);
jawMesh.position.set(0, 0, 0.18);
jawGroup.add(jawMesh);

// Lidah Merah Muda
const tongueGeo = new THREE.BoxGeometry(0.12, 0.04, 0.22);
const tongueMat = new THREE.MeshToonMaterial({ color: 0xf43f5e });
const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
tongueMesh.position.set(0, 0.04, 0.16);
tongueMesh.visible = false;
jawGroup.add(tongueMesh);

// =====================================================================
// KACAMATA ASTRO BOT VISION PRO AMOLED (PERSEGI PANJANG MELENGKUNG)
// =====================================================================
// Diposisikan kokoh di depan wajah & samping pipi (bebas clipping/tenggelam)
const visorGroup = new THREE.Group();
visorGroup.position.set(0, 0.14, -0.02);
visorGroup.rotation.x = -0.05;
headGroup.add(visorGroup);

const vArcStart = -0.82;
const vArcLen = 1.64;
const vRadius = 0.605; // Radius kaca depan
const vHeight = 0.30;  // Tinggi kacamata persegi panjang

// 1. Bantalan Busa Kedap Cahaya (Light-Seal Face Cushion) - Menghubungkan ke wajah
const foamGeo = new THREE.CylinderGeometry(0.565, 0.565, vHeight * 0.94, 32, 1, true, vArcStart, vArcLen);
const foamMesh = new THREE.Mesh(foamGeo, visorFoamMat);
visorGroup.add(foamMesh);

// 2. Layar Lengkung Persegi Panjang AMOLED Display
const screenGeo = new THREE.CylinderGeometry(0.592, 0.592, vHeight * 0.92, 32, 1, true, vArcStart + 0.02, vArcLen - 0.04);
const screenMesh = new THREE.Mesh(screenGeo, visorScreenMat);
visorGroup.add(screenMesh);

// 3. Kaca Depan Mengkilap Apple Vision Pro (3D Curved AMOLED Glass Lens)
const glassGeo = new THREE.CylinderGeometry(vRadius, vRadius, vHeight, 32, 1, true, vArcStart, vArcLen);
const glassMesh = new THREE.Mesh(glassGeo, visorGlassMat);
visorGroup.add(glassMesh);

const ledRingsList = [];

// 7. Pendaran Cahaya Layar AMOLED ke Depan (Visor Front Glow)
const visorLight = new THREE.PointLight(0x00f0ff, 0.95, 2.6);
visorLight.position.set(0, 0, vRadius + 0.15);
visorGroup.add(visorLight);

// Telinga Serigala Gagah Berbulu (Ears with twitch articulation)
const leftEarGroup = new THREE.Group();
leftEarGroup.position.set(-0.32, 0.4, -0.05);
headGroup.add(leftEarGroup);

const rightEarGroup = new THREE.Group();
rightEarGroup.position.set(0.32, 0.4, -0.05);
headGroup.add(rightEarGroup);

function buildEar(earGrp, side) {
    // Cangkang Luar Oranye
    const earGeo = new THREE.ConeGeometry(0.22, 0.62, 4);
    earGeo.scale(0.8, 1.0, 0.4);
    const earOuter = new THREE.Mesh(earGeo, furOrangeMat);
    earOuter.position.set(0, 0.28, 0);
    earOuter.rotation.y = side * 0.3;
    earOuter.castShadow = true;
    earGrp.add(earOuter);

    // Lapisan Dalam Telinga Krem-Pink Lembut
    const earInnerGeo = new THREE.ConeGeometry(0.16, 0.48, 4);
    earInnerGeo.scale(0.65, 0.9, 0.3);
    const earInner = new THREE.Mesh(earInnerGeo, earInnerMat);
    earInner.position.set(0, 0.24, 0.04);
    earInner.rotation.y = side * 0.3;
    earGrp.add(earInner);

    // Bulu Halus di Dasar Telinga
    const earFluffGeo = new THREE.ConeGeometry(0.1, 0.22, 4);
    const earFluff = new THREE.Mesh(earFluffGeo, furWhiteMat);
    earFluff.position.set(side * -0.06, 0.08, 0.08);
    earFluff.rotation.z = side * -0.4;
    earGrp.add(earFluff);
}
buildEar(leftEarGroup, -1);
buildEar(rightEarGroup, 1);
leftEarGroup.rotation.z = 0.25;
rightEarGroup.rotation.z = -0.25;

// 4. KAKI 4 ARTIKULASI (Proporsional Ramping, Ukuran Oranye dan Putih Selaras)
function createLimb(isBackLeg, side) {
    const hipPivot = new THREE.Group();
    const upperLen = 0.58;
    const upperRadiusTop = isBackLeg ? 0.155 : 0.145;
    const kneeRadius = isBackLeg ? 0.130 : 0.125;
    // Paha oranye: meramping halus ke bawah menuju sendi lutut
    const upperGeo = new THREE.CylinderGeometry(upperRadiusTop, kneeRadius, upperLen, 12);
    const upperMesh = new THREE.Mesh(upperGeo, furOrangeMat);
    upperMesh.position.set(0, -upperLen / 2, 0);
    upperMesh.castShadow = true;
    upperMesh.receiveShadow = true;
    hipPivot.add(upperMesh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -upperLen, 0);
    hipPivot.add(kneePivot);

    const lowerLen = 0.56;
    const pawRadius = isBackLeg ? 0.108 : 0.105;
    // Kaus kaki putih: ukuran atasnya sama persis dengan lutut oranye (0.130 / 0.125)
    const lowerGeo = new THREE.CylinderGeometry(kneeRadius, pawRadius, lowerLen, 12);
    const lowerMesh = new THREE.Mesh(lowerGeo, furWhiteMat);
    lowerMesh.position.set(0, -lowerLen / 2, 0);
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    kneePivot.add(lowerMesh);

    const pawPivot = new THREE.Group();
    pawPivot.position.set(0, -lowerLen, 0);
    kneePivot.add(pawPivot);

    const pawGeo = new THREE.SphereGeometry(0.14, 10, 8);
    pawGeo.scale(1.0, 0.55, 1.35);
    const pawMesh = new THREE.Mesh(pawGeo, furWhiteMat);
    pawMesh.position.set(0, 0, 0.08);
    pawMesh.castShadow = true;
    pawMesh.receiveShadow = true;
    pawPivot.add(pawMesh);

    const clawGeo = new THREE.BoxGeometry(0.038, 0.026, 0.08);
    for (let c = -1; c <= 1; c++) {
        const claw = new THREE.Mesh(clawGeo, darkAccentsMat);
        claw.position.set(c * 0.055, -0.035, 0.20);
        claw.castShadow = true;
        claw.receiveShadow = true;
        pawPivot.add(claw);
    }

    return {
        hip: hipPivot,
        knee: kneePivot,
        paw: pawPivot,
        isBackLeg: isBackLeg,
        side: side
    };
}

// Posisi 4 Kaki (Sejajar tanah)
const frontLeftLeg = createLimb(false, -1);
frontLeftLeg.hip.position.set(-0.36, 1.22, 0.48);
bodyGroup.add(frontLeftLeg.hip);

const frontRightLeg = createLimb(false, 1);
frontRightLeg.hip.position.set(0.36, 1.22, 0.48);
bodyGroup.add(frontRightLeg.hip);

const backLeftLeg = createLimb(true, -1);
backLeftLeg.hip.position.set(-0.36, 1.22, -0.50);
bodyGroup.add(backLeftLeg.hip);

const backRightLeg = createLimb(true, 1);
backRightLeg.hip.position.set(0.36, 1.22, -0.50);
bodyGroup.add(backRightLeg.hip);

// 6. EKOR MEKAR 6 SEGMEN DENGAN UJUNG RUNCING KHAS RUBAH
const tailSegments = [];
const tailBase = new THREE.Group();
tailBase.position.set(0, 1.25, -0.72);
tailBase.rotation.x = -Math.PI / 4;
bodyGroup.add(tailBase);

let parentTail = tailBase;
const tailSegmentCount = 6;
// Profil ketebalan ekor rubah: mekar lebat di tengah dan meruncing tajam ke ujung
const tailRadii = [0.22, 0.32, 0.38, 0.32, 0.23, 0.14];

for (let i = 0; i < tailSegmentCount; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0.22, -0.07);
    parentTail.add(seg);
    tailSegments.push(seg);

    const isWhiteTip = (i >= 3);
    const mat = isWhiteTip ? furWhiteMat : furOrangeMat;

    if (i === tailSegmentCount - 1) {
        // Segmen paling ujung: Bentuk KERUCUT RUNCING (Pointed Cone) khas rubah
        const coneHeight = 0.46;
        const coneRadius = 0.16;
        const tipGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 14);
        tipGeo.translate(0, coneHeight / 2, 0);
        const tipMesh = new THREE.Mesh(tipGeo, furWhiteMat);
        tipMesh.castShadow = true;
        tipMesh.receiveShadow = true;
        seg.add(tipMesh);
    } else {
        const radius = tailRadii[i];
        const segGeo = new THREE.SphereGeometry(radius, 12, 10);
        segGeo.scale(1.0, 1.35, 1.0);
        const segMesh = new THREE.Mesh(segGeo, mat);
        segMesh.position.set(0, 0.12, 0);
        segMesh.castShadow = true;
        segMesh.receiveShadow = true;
        seg.add(segMesh);
    }

    parentTail = seg;
}

// 7. EFEK SHOCKWAVE GELOMBANG AUMAN (HOWL SONIC RINGS)
const howlWaveGroup = new THREE.Group();
howlWaveGroup.position.set(0, 2.2, 1.2);
wolfRoot.add(howlWaveGroup);

const howlRings = [];
for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.RingGeometry(0.2, 0.35, 32);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    howlWaveGroup.add(ring);
    howlRings.push(ring);
}

// Bayangan aktif pada semua mesh karakter (menghasilkan dan menerima bayangan)
wolfRoot.traverse(child => {
    if (child.isMesh) {
        child.castShadow = true;
        if (child.material !== visorGlassMat) {
            child.receiveShadow = true;
        }
    }
});

