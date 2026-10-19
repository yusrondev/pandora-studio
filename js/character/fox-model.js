/* Low-Poly Fox 3D Model Builder (Reusable for all Fox Species) */

function createWolfCharacterModel(speciesKey = 'red') {
    if (typeof setFoxActiveSpeciesColors === 'function') {
        setFoxActiveSpeciesColors(speciesKey);
    }
    const spec = (typeof FOX_SPECIES !== 'undefined' && FOX_SPECIES[speciesKey]) ? FOX_SPECIES[speciesKey] : null;
    const baseScale = spec ? spec.scale : 0.58;

    const foxRoot = new THREE.Group();
    // Skala proporsional sesuai spesies rubah
    foxRoot.scale.set(baseScale, baseScale, baseScale);
    foxRoot.userData.speciesKey = speciesKey;

    const bodyTiltGroup = new THREE.Group();
    const BASE_HIP_Y = 1.62;
    bodyTiltGroup.position.set(0, BASE_HIP_Y, 0);
    foxRoot.add(bodyTiltGroup);

    // 5A. TORSO
    const torsoRings = [
        { x: -0.68, yTop: 0.74, yMid: 0.25, yBot: -0.22, zTop: 0.30, zMid: 0.38, zBot: 0.24 },
        { x: -0.42, yTop: 0.66, yMid: 0.15, yBot: -0.34, zTop: 0.33, zMid: 0.44, zBot: 0.27 },
        { x: -0.02, yTop: 0.66, yMid: 0.17, yBot: -0.30, zTop: 0.34, zMid: 0.46, zBot: 0.27 },
        { x: 0.38, yTop: 0.69, yMid: 0.22, yBot: -0.22, zTop: 0.32, zMid: 0.44, zBot: 0.23 },
        { x: 0.75, yTop: 0.65, yMid: 0.23, yBot: -0.16, zTop: 0.30, zMid: 0.41, zBot: 0.21 },
        { x: 1.08, yTop: 0.56, yMid: 0.19, yBot: -0.18, zTop: 0.28, zMid: 0.39, zBot: 0.19 },
        { x: 1.35, yTop: 0.36, yMid: 0.14, yBot: -0.06, zTop: 0.15, zMid: 0.21, zBot: 0.13 }
    ];

    const torsoMesh = createHorizontalLoft(
        torsoRings,
        (seg, face) => {
            const isBot = (face === 3 || face === 4);
            if (seg === 0 && isBot) return C.WHITE;
            if (seg <= 3 && isBot) return C.WHITE_SHADE;
            if (face === 0 || face === 7) return C.ORANGE_TOP;
            return C.ORANGE;
        },
        () => C.WHITE,
        () => C.ORANGE
    );
    bodyTiltGroup.add(torsoMesh);

    // 5B. LEHER PADAT (Lebar Z disesuaikan agar tidak lebar pipih seperti kobra)
    const neckJoint = new THREE.Group();
    neckJoint.position.set(-0.55, 0.42, 0);
    bodyTiltGroup.add(neckJoint);

    const neckRings = [
        { x: 0.02, yTop: 0.32, yMid: -0.12, yBot: -0.58, zTop: 0.28, zMid: 0.36, zBot: 0.24 },
        { x: -0.14, yTop: 0.56, yMid: 0.18, yBot: -0.22, zTop: 0.26, zMid: 0.34, zBot: 0.23 },
        { x: -0.28, yTop: 0.78, yMid: 0.46, yBot: 0.14, zTop: 0.25, zMid: 0.33, zBot: 0.22 }
    ];
    const neckMesh = createHorizontalLoft(neckRings, (seg, face) => {
        if (face === 4) return C.WHITE;                      // Hanya bagian bawah tenggorokan yang putih
        if (face === 3 && seg === 1) return C.WHITE_SHADE;   // Transisi bulu putih halus di dekat dagu
        if (face === 0 || face === 7) return C.ORANGE_TOP;  // Tengkuk leher atas selaras dengan punggung rubah
        return C.ORANGE;                                     // Sisi kiri & kanan leher oranye hangat seragam
    });
    neckJoint.add(neckMesh);

    const headJoint = new THREE.Group();
    headJoint.position.set(-0.26, 0.48, 0);
    neckJoint.add(headJoint);

    // 5C. KEPALA DENGAN HIDUNG SOLID TERTUTUP RAPAT (Tanpa Celah/Lubang)
    function createDetailedHeadSolidNose() {
        const tris = [];
        function quad(p1, p2, p3, p4, col) {
            tris.push({ a: p1, b: p2, c: p3, col });
            tris.push({ a: p1, b: p3, c: p4, col });
        }
        function tri(p1, p2, p3, col) {
            tris.push({ a: p1, b: p2, c: p3, col });
        }

        for (const s of [1, -1]) {
            function addFace(p1, p2, p3, p4, col) {
                const a = [p1[0], p1[1], p1[2] * s];
                const b = [p2[0], p2[1], p2[2] * s];
                const c = [p3[0], p3[1], p3[2] * s];
                if (!p4) {
                    if (s === 1) tri(a, b, c, col);
                    else tri(a, c, b, col);
                } else {
                    const d = [p4[0], p4[1], p4[2] * s];
                    if (s === 1) quad(a, b, c, d, col);
                    else quad(a, d, c, b, col);
                }
            }

            // Titik Hidung Hitam Solid (Proporsional & manis, tidak terlalu panjang mancung)
            const noseCenter = [-0.82, -0.10, 0.00];
            const nTipTop = [-0.82, -0.06, 0.00];
            const nTipSide = [-0.80, -0.10, 0.058];
            const nTipBot = [-0.78, -0.15, 0.00];

            const m1Top = [-0.74, -0.01, 0.00];
            const m1Upper = [-0.74, -0.05, 0.082];
            const m1Mid = [-0.72, -0.12, 0.115];
            const m1Bot = [-0.70, -0.18, 0.00];

            const m2Top = [-0.58, 0.09, 0.00];
            const m2Upper = [-0.58, 0.03, 0.15];
            const m2Mid = [-0.56, -0.08, 0.21];
            const m2Low = [-0.54, -0.18, 0.15];
            const m2Bot = [-0.53, -0.21, 0.00];

            const brTop = [-0.46, 0.17, 0.00];
            const brInner = [-0.46, 0.13, 0.15];
            const eyeAnt = [-0.49, 0.04, 0.24];
            const cheekAnt = [-0.42, -0.05, 0.33];
            const jawMid = [-0.40, -0.19, 0.22];
            const jawBot = [-0.38, -0.25, 0.00];

            const fhTop = [-0.26, 0.34, 0.00];
            const fhSide = [-0.26, 0.30, 0.23];
            const eyePost = [-0.28, 0.15, 0.33];
            const cheekTip = [-0.18, 0.02, 0.48];
            const cheekUp = [-0.04, 0.12, 0.41];
            const cheekLow = [-0.19, -0.15, 0.35];
            const throat = [-0.18, -0.28, 0.00];

            const skTop = [0.04, 0.33, 0.00];
            const skUpper = [0.04, 0.26, 0.29];
            const skMid = [0.06, 0.00, 0.42];
            const skLow = [0.06, -0.20, 0.26];
            const skBot = [0.06, -0.32, 0.00];

            // Ujung Hidung Solid (Terpusat ke noseCenter tanpa bolong)
            addFace(noseCenter, nTipTop, nTipSide, null, C.DARK);
            addFace(noseCenter, nTipSide, nTipBot, null, C.DARK);

            // Koneksi Hidung ke Moncong
            addFace(nTipTop, m1Top, m1Upper, nTipSide, C.DARK);
            addFace(nTipSide, m1Upper, m1Mid, nTipBot, C.DARK);
            addFace(nTipBot, m1Mid, m1Bot, null, C.DARK);

            addFace(m1Top, m2Top, m2Upper, m1Upper, C.ORANGE_TOP);
            addFace(m1Upper, m2Upper, eyeAnt, m2Mid, C.ORANGE);
            addFace(m1Upper, m2Mid, m1Mid, null, C.WHITE);
            addFace(m1Mid, m2Mid, m2Low, m1Bot, C.WHITE);
            addFace(m1Bot, m2Low, m2Bot, null, C.WHITE_SHADE);

            addFace(m2Top, brTop, brInner, m2Upper, C.ORANGE_TOP);
            addFace(m2Upper, brInner, eyeAnt, null, C.EYE_BROW);
            addFace(brTop, fhTop, fhSide, brInner, C.ORANGE_TOP);
            addFace(brInner, fhSide, eyePost, eyeAnt, C.EYE_BROW);

            addFace(eyeAnt, eyePost, cheekTip, cheekAnt, C.ORANGE);
            addFace(m2Upper, eyeAnt, cheekAnt, m2Mid, C.ORANGE);

            addFace(m2Mid, cheekAnt, jawMid, m2Low, C.WHITE);
            addFace(cheekAnt, cheekTip, cheekLow, jawMid, C.WHITE);
            addFace(cheekTip, cheekUp, cheekLow, null, C.WHITE);
            addFace(m2Low, jawMid, jawBot, m2Bot, C.WHITE_SHADE);
            addFace(jawMid, cheekLow, throat, jawBot, C.WHITE);

            addFace(fhTop, skTop, skUpper, fhSide, C.ORANGE_TOP);
            addFace(fhSide, skUpper, cheekUp, eyePost, C.ORANGE);
            addFace(eyePost, cheekUp, cheekTip, null, C.ORANGE);
            addFace(cheekUp, skUpper, skMid, cheekLow, C.ORANGE);
            addFace(cheekLow, skMid, skLow, throat, C.WHITE);
            addFace(throat, skLow, skBot, null, C.WHITE);

            // --- Penutup Solid Kepala Belakang & Dasar Telinga ---
            const baseNeckConnect = [0.15, -0.10, 0.00];
            addFace(skTop, baseNeckConnect, skUpper, null, C.ORANGE_TOP);
            addFace(skUpper, baseNeckConnect, skMid, null, C.ORANGE);
            addFace(skMid, baseNeckConnect, skLow, null, C.ORANGE); // Oranye alami di bawah telinga menyatu mulus
            addFace(skLow, baseNeckConnect, skBot, null, C.WHITE);
            addFace(skBot, baseNeckConnect, throat, null, C.WHITE);
        }
        return buildMeshFromTriangles(tris);
    }
    headJoint.add(createDetailedHeadSolidNose());

    // 5D. TELINGA
    function createArticulatedEar(isLeft) {
        const s = isLeft ? -1 : 1;
        const earPivot = new THREE.Group();
        const px = -0.08, py = 0.25, pz = 0.22 * s;
        earPivot.position.set(px, py, pz);

        const tris = [];
        function quad(p1, p2, p3, p4, col) {
            tris.push({ a: p1, b: p2, c: p3, col });
            tris.push({ a: p1, b: p3, c: p4, col });
        }
        function tri(p1, p2, p3, col) {
            tris.push({ a: p1, b: p2, c: p3, col });
        }
        function addEarFace(p1, p2, p3, p4, col) {
            const a = [p1[0] - px, p1[1] - py, p1[2] * s - pz];
            const b = [p2[0] - px, p2[1] - py, p2[2] * s - pz];
            const c = [p3[0] - px, p3[1] - py, p3[2] * s - pz];
            if (!p4) {
                if (s === 1) tri(a, b, c, col);
                else tri(a, c, b, col);
            } else {
                const d = [p4[0] - px, p4[1] - py, p4[2] * s - pz];
                if (s === 1) quad(a, b, c, d, col);
                else quad(a, d, c, b, col);
            }
        }

        const eInF = [-0.21, 0.30, 0.13];
        const eOutF = [-0.15, 0.17, 0.37];
        const eOutB = [0.05, 0.23, 0.33];
        const eInB = [0.00, 0.32, 0.11];

        const eCavBot = [-0.11, 0.25, 0.25];
        const eCavMid = [-0.09, 0.47, 0.27];

        const eMidInF = [-0.17, 0.55, 0.18];
        const eMidOutF = [-0.09, 0.49, 0.43];
        const eMidOutB = [0.07, 0.51, 0.37];
        const eMidInB = [0.02, 0.56, 0.17];

        const eTopInF = [-0.10, 0.74, 0.25];
        const eTopOutF = [-0.05, 0.71, 0.39];
        const eTopBack = [0.04, 0.72, 0.33];
        const eTip = [-0.02, 0.87, 0.32];

        addEarFace(eInF, eOutF, eCavBot, null, C.EAR_IN_DEEP);
        addEarFace(eInF, eCavBot, eCavMid, eMidInF, C.EAR_IN);
        addEarFace(eCavBot, eOutF, eMidOutF, eCavMid, C.EAR_IN_DEEP);
        addEarFace(eMidInF, eCavMid, eTopOutF, eTopInF, C.EAR_IN);
        addEarFace(eCavMid, eMidOutF, eTopOutF, null, C.EAR_IN);

        addEarFace(eInF, eMidInF, eMidInB, eInB, C.DARK);
        addEarFace(eMidInF, eTopInF, eTopBack, eMidInB, C.DARK);
        addEarFace(eOutF, eOutB, eMidOutB, eMidOutF, C.ORANGE);
        addEarFace(eMidOutF, eMidOutB, eTopBack, eTopOutF, C.DARK);

        addEarFace(eOutB, eInB, eMidInB, eMidOutB, C.ORANGE_TOP); // Oranye pekat di belakang telinga
        addEarFace(eTopInF, eTopOutF, eTip, null, C.DARK);
        addEarFace(eTopOutF, eTopBack, eTip, null, C.DARK);
        addEarFace(eTopBack, eTopInF, eTip, null, C.DARK);

        earPivot.add(buildMeshFromTriangles(tris));
        headJoint.add(earPivot);
        return earPivot;
    }

    const earRJoint = createArticulatedEar(false);
    const earLJoint = createArticulatedEar(true);

    // 5E. EKOR MULTI-SEGMEN
    const tailBaseJoint = new THREE.Group();
    tailBaseJoint.position.set(1.32, 0.15, 0);
    bodyTiltGroup.add(tailBaseJoint);

    const tailSeg1Mesh = createHorizontalLoft([
        { x: 0.00, yTop: 0.19, yMid: 0.00, yBot: -0.19, zTop: 0.15, zMid: 0.22, zBot: 0.14 },
        { x: 0.42, yTop: 0.07, yMid: -0.21, yBot: -0.48, zTop: 0.26, zMid: 0.38, zBot: 0.24 },
        { x: 0.86, yTop: -0.15, yMid: -0.48, yBot: -0.80, zTop: 0.32, zMid: 0.45, zBot: 0.30 }
    ], (s, f) => (f === 0 || f === 7) ? C.ORANGE_TOP : C.ORANGE, () => C.ORANGE, null);
    tailBaseJoint.add(tailSeg1Mesh);

    const tailMidJoint = new THREE.Group();
    tailMidJoint.position.set(0.84, -0.46, 0);
    tailBaseJoint.add(tailMidJoint);

    const tailSeg2Mesh = createHorizontalLoft([
        { x: 0.00, yTop: 0.32, yMid: 0.00, yBot: -0.32, zTop: 0.32, zMid: 0.45, zBot: 0.30 },
        { x: 0.50, yTop: 0.04, yMid: -0.28, yBot: -0.58, zTop: 0.26, zMid: 0.37, zBot: 0.24 },
        { x: 0.90, yTop: -0.13, yMid: -0.36, yBot: -0.58, zTop: 0.18, zMid: 0.26, zBot: 0.16 }
    ], (s, f) => (f === 0 || f === 7) ? C.ORANGE_TOP : C.ORANGE);
    tailMidJoint.add(tailSeg2Mesh);

    const tailTipJoint = new THREE.Group();
    tailTipJoint.position.set(0.88, -0.35, 0);
    tailMidJoint.add(tailTipJoint);

    const tailSeg3Mesh = createHorizontalLoft([
        { x: 0.00, yTop: 0.22, yMid: 0.00, yBot: -0.21, zTop: 0.18, zMid: 0.26, zBot: 0.16 },
        { x: 0.35, yTop: 0.13, yMid: -0.02, yBot: -0.15, zTop: 0.09, zMid: 0.13, zBot: 0.08 },
        { x: 0.64, yTop: 0.05, yMid: 0.02, yBot: 0.00, zTop: 0.015, zMid: 0.02, zBot: 0.015 }
    ], () => C.WHITE, null, () => C.WHITE);
    tailTipJoint.add(tailSeg3Mesh);

    // 5F. KEEMPAT KAKI DENGAN GRADASI HALUS (ANTI KAOS KAKI)
    function createArticulatedFrontLeg(isLeft) {
        const side = isLeft ? -1 : 1;
        const shoulderJoint = new THREE.Group();
        shoulderJoint.position.set(-0.42, -0.10, 0.28 * side);

        const upperRings = [
            { x: 0.00, y: 0.14, rx: 0.20, rz: 0.15 },
            { x: 0.01, y: -0.28, rx: 0.14, rz: 0.12 },
            { x: 0.02, y: -0.64, rx: 0.105, rz: 0.095 }
        ];
        const upperMesh = createVerticalLimb(upperRings, (segIdx) => {
            if (segIdx === 0) return [C.ORANGE, C.ORANGE];
            // Ujung paha bawah mulai melunak ke amber hangat
            return [C.ORANGE, getFoxLegGradientColor(0.18)];
        }, false);
        shoulderJoint.add(upperMesh);

        const kneeJoint = new THREE.Group();
        kneeJoint.position.set(0.02, -0.62, 0);
        shoulderJoint.add(kneeJoint);

        // Betis depan: 5 ring bergradasi halus dari amber -> russet -> cokelat gelap -> hitam
        const lowerRings = [
            { x: 0.00, y: 0.02, rx: 0.105, rz: 0.095 },
            { x: -0.005, y: -0.16, rx: 0.095, rz: 0.088 },
            { x: -0.010, y: -0.34, rx: 0.085, rz: 0.080 },
            { x: -0.015, y: -0.50, rx: 0.080, rz: 0.076 },
            { x: -0.020, y: -0.67, rx: 0.075, rz: 0.075 }
        ];
        const lowerMesh = createVerticalLimb(lowerRings, (segIdx) => {
            const t0 = 0.18 + (segIdx / (lowerRings.length - 1)) * 0.82;
            const t1 = 0.18 + ((segIdx + 1) / (lowerRings.length - 1)) * 0.82;
            return [getFoxLegGradientColor(t0), getFoxLegGradientColor(t1)];
        }, false);
        kneeJoint.add(lowerMesh);

        const pawJoint = new THREE.Group();
        pawJoint.position.set(-0.02, -0.65, 0);
        kneeJoint.add(pawJoint);

        const pawMesh = createVerticalLimb([
            { x: 0.00, y: 0.02, rx: 0.075, rz: 0.075 },
            { x: -0.06, y: -0.12, rx: 0.115, rz: 0.095, frontExt: 1.35 },
            { x: -0.08, y: -0.25, rx: 0.115, rz: 0.10, frontExt: 1.40 }
        ], () => C.DARK_PAW, true);
        pawJoint.add(pawMesh);

        bodyTiltGroup.add(shoulderJoint);
        return { hip: shoulderJoint, knee: kneeJoint, paw: pawJoint };
    }

    function createArticulatedBackLeg(isLeft) {
        const side = isLeft ? -1 : 1;
        const hipJoint = new THREE.Group();
        hipJoint.position.set(1.02, 0.00, 0.25 * side);

        const thighRings = [
            { x: 0.00, y: 0.16, rx: 0.24, rz: 0.16 },
            { x: 0.11, y: -0.29, rx: 0.18, rz: 0.13 },
            { x: 0.20, y: -0.70, rx: 0.115, rz: 0.10 }
        ];
        const thighMesh = createVerticalLimb(thighRings, (segIdx) => {
            if (segIdx === 0) return [C.ORANGE, C.ORANGE];
            return [C.ORANGE, getFoxLegGradientColor(0.18)];
        }, false);
        hipJoint.add(thighMesh);

        const hockJoint = new THREE.Group();
        hockJoint.position.set(0.20, -0.68, 0);
        hipJoint.add(hockJoint);

        // Betis belakang: 5 ring bergradasi halus dari amber -> russet -> cokelat gelap -> hitam
        const shinRings = [
            { x: 0.00, y: 0.02, rx: 0.115, rz: 0.10 },
            { x: -0.02, y: -0.18, rx: 0.102, rz: 0.09 },
            { x: -0.04, y: -0.37, rx: 0.090, rz: 0.08 },
            { x: -0.055, y: -0.54, rx: 0.085, rz: 0.077 },
            { x: -0.070, y: -0.70, rx: 0.080, rz: 0.075 }
        ];
        const shinMesh = createVerticalLimb(shinRings, (segIdx) => {
            const t0 = 0.18 + (segIdx / (shinRings.length - 1)) * 0.82;
            const t1 = 0.18 + ((segIdx + 1) / (shinRings.length - 1)) * 0.82;
            return [getFoxLegGradientColor(t0), getFoxLegGradientColor(t1)];
        }, false);
        hockJoint.add(shinMesh);

        const pawJoint = new THREE.Group();
        pawJoint.position.set(-0.07, -0.68, 0);
        hockJoint.add(pawJoint);

        const pawMesh = createVerticalLimb([
            { x: 0.00, y: 0.02, rx: 0.08, rz: 0.075 },
            { x: -0.06, y: -0.12, rx: 0.115, rz: 0.095, frontExt: 1.35 },
            { x: -0.08, y: -0.26, rx: 0.115, rz: 0.10, frontExt: 1.40 }
        ], () => C.DARK_PAW, true);
        pawJoint.add(pawMesh);

        bodyTiltGroup.add(hipJoint);
        return { hip: hipJoint, knee: hockJoint, paw: pawJoint };
    }

    const legFL = createArticulatedFrontLeg(true);
    const legFR = createArticulatedFrontLeg(false);
    const legBL = createArticulatedBackLeg(true);
    const legBR = createArticulatedBackLeg(false);

    return {
        root: foxRoot,
        speciesKey,
        baseScale,
        bodyTiltGroup,
        neckJoint,
        headJoint,
        earLJoint,
        earRJoint,
        tailBaseJoint,
        tailMidJoint,
        tailTipJoint,
        legFL,
        legFR,
        legBL,
        legBR,
        BASE_HIP_Y
    };
}