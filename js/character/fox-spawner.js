/* ===================================================================
   PANDORA EDITOR - FOX SPAWNER & MULTI-POSE SYSTEM
   Spawn multiple foxes across the terrain with customized species &
   interactive poses (IDLE, DUDUK / SIT, PRONE / MENGENDAP).
   =================================================================== */

const spawnedFoxesList = [];
window.spawnedFoxesList = spawnedFoxesList;

let selectedFoxIndex = -1;
window.selectedFoxIndex = selectedFoxIndex;

let currentSpawnerPose = 'idle'; // 'idle' | 'sit' | 'prone'
window.currentSpawnerPose = currentSpawnerPose;

// Reference global selector mode spawner rubah
let selectFoxMode = document.getElementById('select-fox-mode');
window.selectFoxMode = selectFoxMode;

// Helper: Tambahkan invisible raycast hitbox pada model rubah/enemy agar mudah diklik & diseleksi di viewport
function attachFoxSelectionHitbox(model) {
    if (!model || !model.root) return;
    if (model.hitbox) return; // sudah ada

    const isHumanoid = !!(model && (model.mixer || model.isEnemy));
    const hitboxGeo = isHumanoid
        ? new THREE.BoxGeometry(1.4, 2.2, 1.4)
        : new THREE.BoxGeometry(2.4, 2.0, 1.4);
    const hitboxMat = new THREE.MeshBasicMaterial({
        visible: false,
        wireframe: false
    });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.set(0, isHumanoid ? 1.1 : 0.95, 0); // Di tengah tubuh karakter
    hitbox.userData = {
        isSpawnedFoxHitbox: true,
        isSpawnedFoxChild: true,
        foxRoot: model.root
    };
    model.root.add(hitbox);
    model.hitbox = hitbox;
}
window.attachFoxSelectionHitbox = attachFoxSelectionHitbox;

// ==========================================
// 1. POSE ENGINE UNTUK RUBAH TERSPAWN
// ==========================================
function applyFoxPose(foxModel, poseName, animTime = 0) {
    if (!foxModel || !foxModel.bodyTiltGroup) return;

    const {
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
    } = foxModel;

    const baseHipY = typeof BASE_HIP_Y === 'number' ? BASE_HIP_Y : 1.66;

    if (poseName === 'sit') {
        // -------------------------------------------------------------
        // POSE DUDUK (SIT) - Panggul menempel lantai, dada tegak waspada
        // -------------------------------------------------------------
        const breath = Math.sin(animTime * 2.2) * 0.008;
        bodyTiltGroup.position.y = 1.08 + breath;
        bodyTiltGroup.position.x = 0;
        bodyTiltGroup.position.z = 0;
        bodyTiltGroup.rotation.z = -0.82; // Panggul condong ke belakang/lantai
        bodyTiltGroup.rotation.x = 0;
        bodyTiltGroup.rotation.y = 0;

        // Leher & Kepala tegak memandang sekitar
        neckJoint.rotation.z = 0.60;
        neckJoint.rotation.y = Math.sin(animTime * 1.1) * 0.04;
        headJoint.rotation.z = 0.22;
        headJoint.rotation.y = neckJoint.rotation.y * 0.8;
        headJoint.rotation.x = 0;

        // Kaki depan tegak menopang tubuh
        legFL.hip.rotation.z = 1.35;
        legFL.hip.rotation.x = 0;
        legFL.knee.rotation.z = -0.92;
        legFL.paw.rotation.z = -0.42;

        legFR.hip.rotation.z = 1.35;
        legFR.hip.rotation.x = 0;
        legFR.knee.rotation.z = -0.92;
        legFR.paw.rotation.z = -0.42;

        // Kaki belakang terlipat rapi menempel paha
        legBL.hip.rotation.z = -1.50;
        legBL.hip.rotation.x = 0.22;
        legBL.knee.rotation.z = 1.85;
        legBL.paw.rotation.z = -0.35;

        legBR.hip.rotation.z = -1.50;
        legBR.hip.rotation.x = -0.22;
        legBR.knee.rotation.z = 1.85;
        legBR.paw.rotation.z = -0.35;

        // Ekor melingkar anggun di sisi panggul
        const tailFlick = Math.sin(animTime * 1.4) * 0.035;
        tailBaseJoint.rotation.z = 1.55;
        tailBaseJoint.rotation.y = 0.38 + tailFlick * 0.3;
        tailMidJoint.rotation.z = 0.25;
        tailMidJoint.rotation.y = 0.45 + tailFlick * 0.6;
        tailTipJoint.rotation.z = 0.15;
        tailTipJoint.rotation.y = 0.45 + tailFlick * 0.9;

        // Telinga waspada
        earLJoint.rotation.z = -0.15;
        earRJoint.rotation.z = -0.15;
        earLJoint.rotation.x = 0;
        earRJoint.rotation.x = 0;

    } else if (poseName === 'prone') {
        // -------------------------------------------------------------
        // POSE PRONE / MENGENDAP - Tubuh menempel tanah, leher & kaki merayap rendah
        // -------------------------------------------------------------
        const breath = Math.sin(animTime * 2.8) * 0.005;
        bodyTiltGroup.position.y = 0.52 + breath;
        bodyTiltGroup.position.x = 0;
        bodyTiltGroup.position.z = 0;
        bodyTiltGroup.rotation.z = 0.14; // Condong sedikit ke depan
        bodyTiltGroup.rotation.x = 0;
        bodyTiltGroup.rotation.y = 0;

        // Leher & Kepala menempel rendah ke tanah mengunci target
        neckJoint.rotation.z = -0.18;
        neckJoint.rotation.y = Math.sin(animTime * 1.2) * 0.03;
        headJoint.rotation.z = 0.08;
        headJoint.rotation.y = neckJoint.rotation.y * 0.7;
        headJoint.rotation.x = 0;

        // Kaki depan dilipat merayap rendah ke depan
        legFL.hip.rotation.z = 0.95;
        legFL.hip.rotation.x = 0.10;
        legFL.knee.rotation.z = -2.58;
        legFL.paw.rotation.z = 0.56;

        legFR.hip.rotation.z = 0.98;
        legFR.hip.rotation.x = -0.10;
        legFR.knee.rotation.z = -2.62;
        legFR.paw.rotation.z = 0.54;

        // Kaki belakang menekuk tajam siap menerkam
        legBL.hip.rotation.z = -0.95;
        legBL.hip.rotation.x = 0.22;
        legBL.knee.rotation.z = 2.65;
        legBL.paw.rotation.z = 0.30;

        legBR.hip.rotation.z = -0.95;
        legBR.hip.rotation.x = -0.22;
        legBR.knee.rotation.z = 2.65;
        legBR.paw.rotation.z = 0.30;

        // Ekor lurus mendatar di lantai dengan kedutan ujung waspada
        const tailTwitch = Math.sin(animTime * 3.8) * 0.09;
        tailBaseJoint.rotation.z = 0.05;
        tailBaseJoint.rotation.y = tailTwitch * 0.3;
        tailMidJoint.rotation.z = -0.05;
        tailMidJoint.rotation.y = tailTwitch * 0.6;
        tailTipJoint.rotation.z = 0.02;
        tailTipJoint.rotation.y = tailTwitch * 1.0;

        // Telinga terlipat datar ke belakang (kamuflase mengendap)
        earLJoint.rotation.z = -0.55;
        earRJoint.rotation.z = -0.55;
        earLJoint.rotation.x = 0;
        earRJoint.rotation.x = 0;

    } else {
        // -------------------------------------------------------------
        // POSE IDLE (BERDIRI TEGAP & ALAMI)
        // -------------------------------------------------------------
        const breath = Math.sin(animTime * 2.0) * 0.010;
        bodyTiltGroup.position.y = baseHipY + Math.max(0, breath);
        bodyTiltGroup.position.x = 0;
        bodyTiltGroup.position.z = 0;
        bodyTiltGroup.rotation.z = 0;
        bodyTiltGroup.rotation.x = 0;
        bodyTiltGroup.rotation.y = 0;

        neckJoint.rotation.z = Math.sin(animTime * 2.0 - 0.4) * 0.012;
        neckJoint.rotation.y = Math.sin(animTime * 0.9) * 0.06;
        headJoint.rotation.z = -Math.sin(animTime * 2.0 - 0.4) * 0.01;
        headJoint.rotation.y = neckJoint.rotation.y * 0.7;
        headJoint.rotation.x = 0;

        // Kaki berdiri netral
        legFL.hip.rotation.z = 0;
        legFL.hip.rotation.x = 0;
        legFL.knee.rotation.z = 0;
        legFL.paw.rotation.z = 0;

        legFR.hip.rotation.z = 0;
        legFR.hip.rotation.x = 0;
        legFR.knee.rotation.z = 0;
        legFR.paw.rotation.z = 0;

        legBL.hip.rotation.z = 0;
        legBL.hip.rotation.x = 0;
        legBL.knee.rotation.z = 0;
        legBL.paw.rotation.z = 0;

        legBR.hip.rotation.z = 0;
        legBR.hip.rotation.x = 0;
        legBR.knee.rotation.z = 0;
        legBR.paw.rotation.z = 0;

        // Ekor mengayun santai
        const tailWave = Math.sin(animTime * 1.5) * 0.05;
        tailBaseJoint.rotation.z = 0.05;
        tailBaseJoint.rotation.y = tailWave;
        tailMidJoint.rotation.z = 0.08;
        tailMidJoint.rotation.y = Math.sin(animTime * 1.5 - 0.4) * 0.08;
        tailTipJoint.rotation.z = 0.05;
        tailTipJoint.rotation.y = Math.sin(animTime * 1.5 - 0.8) * 0.11;

        earLJoint.rotation.z = 0;
        earRJoint.rotation.z = 0;
        earLJoint.rotation.x = 0;
        earRJoint.rotation.x = 0;
    }
}
window.applyFoxPose = applyFoxPose;

// ==========================================
// 2. SPAWN & MANAGEMENT RUBAH / ENEMY
// ==========================================
function clearAllSpawnedFoxes(quiet = false) {
    if (typeof saveState === 'function') saveState();
    while (spawnedFoxesList.length > 0) {
        const fox = spawnedFoxesList.pop();
        if (fox && fox.root) {
            if (typeof SelectionOutlineManager !== 'undefined' && SelectionOutlineManager.targetObject === fox.root) {
                SelectionOutlineManager.clearSelection();
            }
            if (fox.root.parent) {
                fox.root.parent.remove(fox.root);
            } else if (typeof scene !== 'undefined' && scene) {
                scene.remove(fox.root);
            }
        }
    }
    selectedFoxIndex = -1;
    window.selectedFoxIndex = -1;
    if (typeof FoxAIManager !== 'undefined' && FoxAIManager.syncSpawnedFoxes) {
        FoxAIManager.syncSpawnedFoxes();
    }
    if (typeof refreshLayerUI === 'function') refreshLayerUI();
    updateFoxInspectorUI();
    if (!quiet && typeof PandoraToast !== 'undefined' && typeof PandoraToast.show === 'function') {
        PandoraToast.show('Semua Enemy berhasil di-reset!', 'info');
    }
}
window.clearAllSpawnedFoxes = clearAllSpawnedFoxes;

function spawnFoxAtLocation(species = 'foxtree', pose = 'idle', posX, posZ, rotY = null, customScale = 1.0) {
    if (typeof createWolfCharacterModel !== 'function') {
        console.error('createWolfCharacterModel is not available');
        return null;
    }
    if (typeof saveState === 'function') saveState();

    const effectiveSpecies = (species && species !== 'none') ? species : 'foxtree';
    const enemyFactory = (typeof window.createEnemyCharacterModel === 'function')
        ? window.createEnemyCharacterModel
        : createWolfCharacterModel;
    const model = enemyFactory(effectiveSpecies);
    if (!model || !model.root) return null;

    const y = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(posX, posZ) : 0;
    model.root.position.set(posX, y, posZ);

    const initialRot = (typeof rotY === 'number') ? rotY : Math.random() * Math.PI * 2;
    model.root.rotation.y = initialRot;

    const baseScale = model.baseScale || 1.85;
    const effectiveScale = baseScale * customScale;
    model.root.scale.set(effectiveScale, effectiveScale, effectiveScale);

    // Tandai root mesh untuk raycasting seleksi
    model.root.userData = {
        isSpawnedFox: true,
        speciesKey: effectiveSpecies,
        poseName: pose,
        customScale: customScale,
        baseScale: baseScale,
        isEnemy: !!model.isEnemy
    };

    // Pasang invisible hitbox agar rubah/enemy sangat mudah dan responsif diklik/diseleksi di 3D viewport
    attachFoxSelectionHitbox(model);

    // Tandai juga semua child mesh agar raycast bisa melacak parent root
    // Dan pastikan material di-clone secara independen agar modifikasi opacity/transparent saat eliminasi tidak memengaruhi enemy lain
    model.root.traverse(child => {
        if (child.isMesh) {
            child.userData.isSpawnedFoxChild = true;
            child.userData.foxRoot = model.root;
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => m.clone());
                } else {
                    child.material = child.material.clone();
                }
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => {
                    m.transparent = false;
                    m.opacity = 1.0;
                });
            }
        }
    });

    // Jika model adalah FBX skinned mesh dengan AnimationMixer, segera evaluasi mixer agar kaki menapak tanah dan tidak T-pose
    if (model.mixer) {
        model.mixer.update(0.016);
    } else {
        applyFoxPose(model, pose, 0);
    }

    scene.add(model.root);

    const defaultSpawnerAI = document.getElementById('select-spawner-fox-ai')
        ? document.getElementById('select-spawner-fox-ai').value
        : 'combat';

    const defaultSpawnerRadius = document.getElementById('slider-spawner-ai-radius')
        ? parseFloat(document.getElementById('slider-spawner-ai-radius').value)
        : 18.0;

    const isBossCheck = document.getElementById('chk-spawner-fox-boss')
        ? document.getElementById('chk-spawner-fox-boss').checked
        : false;

    const charMeta = (window.PandoraHeroRegistry && typeof window.PandoraHeroRegistry.getCharacterMeta === 'function')
        ? window.PandoraHeroRegistry.getCharacterMeta(effectiveSpecies)
        : null;
    const defaultSpeciesDisplayName = (charMeta && charMeta.name)
        ? charMeta.name
        : ((effectiveSpecies === 'foxtree' || effectiveSpecies === 'enemy-foxtree') ? 'FoxTree' : effectiveSpecies);

    const nameInput = document.getElementById('input-spawner-fox-name');
    const rawInputName = nameInput ? nameInput.value.trim() : '';
    const customName = (rawInputName && rawInputName !== 'FoxTree' && rawInputName !== 'FoxTree Enemy')
        ? rawInputName
        : (isBossCheck ? (defaultSpeciesDisplayName + ' Boss') : defaultSpeciesDisplayName);

    const hpInput = document.getElementById('input-spawner-fox-hp');
    const defaultBossHp = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined') ? window.ENEMY_COMBAT_CONFIG.boss.maxHealth : 500;
    const defaultNonBossHp = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined') ? window.ENEMY_COMBAT_CONFIG.nonBoss.maxHealth : 100;
    const customHp = (hpInput && parseFloat(hpInput.value))
        ? parseFloat(hpInput.value)
        : (isBossCheck ? defaultBossHp : defaultNonBossHp);

    const dmgInput = document.getElementById('input-spawner-fox-damage');
    const defaultBossDmg = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined') ? window.ENEMY_COMBAT_CONFIG.boss.damagePerHit : 25;
    const defaultNonBossDmg = (typeof window.ENEMY_COMBAT_CONFIG !== 'undefined') ? window.ENEMY_COMBAT_CONFIG.nonBoss.damagePerHit : 15;
    const customDmg = (dmgInput && parseFloat(dmgInput.value))
        ? parseFloat(dmgInput.value)
        : (isBossCheck ? defaultBossDmg : defaultNonBossDmg);

    const foxRecord = {
        id: 'enemy_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        model: model,
        root: model.root,
        species: effectiveSpecies,
        pose: pose,
        isBoss: isBossCheck,
        name: customName,
        maxHealth: customHp,
        health: customHp,
        damagePerHit: customDmg,
        aiMode: defaultSpawnerAI || 'combat',
        detectionRadius: defaultSpawnerRadius || 18.0,
        animOffset: Math.random() * 50,
        scaleMultiplier: customScale,
        visible: true
    };
    if (model) model.damagePerHit = customDmg;
    spawnedFoxesList.push(foxRecord);

    if (typeof FoxAIManager !== 'undefined' && FoxAIManager.syncSpawnedFoxes) {
        FoxAIManager.syncSpawnedFoxes();
    }

    selectedFoxIndex = spawnedFoxesList.length - 1;
    window.selectedFoxIndex = selectedFoxIndex;

    // Bersihkan seleksi pohon / batu agar inspektor fokus ke rubah
    window.selectedTreeIndex = -1;
    window.selectedRockIndex = -1;

    if (typeof refreshLayerUI === 'function') refreshLayerUI();
    updateFoxInspectorUI();

    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.selectObject(model.root, false);
    }

    const speciesLabel = defaultSpeciesDisplayName;
    if (typeof PandoraToast !== 'undefined' && typeof PandoraToast.show === 'function') {
        PandoraToast.show(`⚔️ ${speciesLabel} berhasil diletakkan`, 'success');
    }

    return foxRecord;
}
window.spawnFoxAtLocation = spawnFoxAtLocation;

function deleteFoxByIndex(idx) {
    if (idx < 0 || idx >= spawnedFoxesList.length) return;
    if (typeof saveState === 'function') saveState();

    const fox = spawnedFoxesList[idx];
    if (fox && fox.root) {
        if (typeof SelectionOutlineManager !== 'undefined' && SelectionOutlineManager.targetObject === fox.root) {
            SelectionOutlineManager.clearSelection();
        }
        if (fox.root.parent) {
            fox.root.parent.remove(fox.root);
        } else {
            scene.remove(fox.root);
        }
    }

    spawnedFoxesList.splice(idx, 1);

    if (selectedFoxIndex === idx) {
        selectedFoxIndex = -1;
    } else if (selectedFoxIndex > idx) {
        selectedFoxIndex--;
    }
    window.selectedFoxIndex = selectedFoxIndex;

    if (typeof refreshLayerUI === 'function') refreshLayerUI();
    updateFoxInspectorUI();

    if (typeof PandoraToast !== 'undefined' && typeof PandoraToast.show === 'function') {
        PandoraToast.show(`🗑️ Rubah #${idx + 1} berhasil dihapus`, 'info');
    }
}
window.deleteFoxByIndex = deleteFoxByIndex;

function deleteFoxAtLocation(posX, posZ, maxRadius = 3.5) {
    if (!spawnedFoxesList || spawnedFoxesList.length === 0) return false;

    let closestIdx = -1;
    let closestDistSq = maxRadius * maxRadius;

    for (let i = 0; i < spawnedFoxesList.length; i++) {
        const fox = spawnedFoxesList[i];
        if (!fox || !fox.root) continue;
        const dx = fox.root.position.x - posX;
        const dz = fox.root.position.z - posZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestIdx = i;
        }
    }

    if (closestIdx >= 0) {
        deleteFoxByIndex(closestIdx);
        return true;
    }
    return false;
}
window.deleteFoxAtLocation = deleteFoxAtLocation;

function selectFoxByIndex(idx, smoothFocus = false) {
    if (idx < 0 || idx >= spawnedFoxesList.length) {
        selectedFoxIndex = -1;
        window.selectedFoxIndex = -1;
        if (typeof SelectionOutlineManager !== 'undefined') {
            SelectionOutlineManager.clearSelection();
        }
        updateFoxInspectorUI();
        return;
    }

    selectedFoxIndex = idx;
    window.selectedFoxIndex = idx;
    window.selectedTreeIndex = -1;
    window.selectedRockIndex = -1;

    const fox = spawnedFoxesList[idx];
    if (fox && fox.root && typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.selectObject(fox.root, smoothFocus);
    }

    if (typeof refreshLayerUI === 'function') refreshLayerUI();
    updateFoxInspectorUI();

    // Buka accordion inspektor rubah jika tertutup dan scroll agar terlihat
    const foxInspectorAcc = document.getElementById('accordion-fox-inspector');
    if (foxInspectorAcc) {
        if (foxInspectorAcc.classList.contains('collapsed')) {
            foxInspectorAcc.classList.remove('collapsed');
        }
        foxInspectorAcc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
window.selectFoxByIndex = selectFoxByIndex;

function setFoxPoseByIndex(idx, newPose) {
    if (idx < 0 || idx >= spawnedFoxesList.length) return;
    const fox = spawnedFoxesList[idx];
    if (!fox) return;

    if (typeof saveState === 'function') saveState();
    fox.pose = newPose;
    fox.root.userData.poseName = newPose;
    applyFoxPose(fox.model, newPose, 0);

    if (typeof SelectionOutlineManager !== 'undefined' && SelectionOutlineManager.targetObject === fox.root) {
        SelectionOutlineManager.updateBounds();
    }

    updateFoxInspectorUI();
    if (typeof refreshLayerUI === 'function') refreshLayerUI();
}
window.setFoxPoseByIndex = setFoxPoseByIndex;

function setFoxSpeciesByIndex(idx, newSpecies) {
    if (idx < 0 || idx >= spawnedFoxesList.length) return;
    const fox = spawnedFoxesList[idx];
    if (!fox || fox.species === newSpecies) return;

    if (typeof saveState === 'function') saveState();

    const curPos = fox.root.position.clone();
    const curRot = fox.root.rotation.y;
    const curPose = fox.pose;
    const curScale = fox.scaleMultiplier || 1.0;

    // Hapus model lama
    scene.remove(fox.root);

    // Buat model baru dari folder hero/<newSpecies>/
    const enemyFactory = (typeof window.createEnemyCharacterModel === 'function')
        ? window.createEnemyCharacterModel
        : createWolfCharacterModel;
    const newModel = enemyFactory(newSpecies);
    newModel.root.position.copy(curPos);
    newModel.root.rotation.y = curRot;

    const baseScale = newModel.baseScale || 1.85;
    newModel.root.scale.set(baseScale * curScale, baseScale * curScale, baseScale * curScale);

    newModel.root.userData = {
        isSpawnedFox: true,
        speciesKey: newSpecies,
        poseName: curPose,
        customScale: curScale,
        baseScale: baseScale
    };

    // Pasang hitbox seleksi pada model spesies baru
    attachFoxSelectionHitbox(newModel);

    newModel.root.traverse(child => {
        if (child.isMesh) {
            child.userData.isSpawnedFoxChild = true;
            child.userData.foxRoot = newModel.root;
        }
    });

    applyFoxPose(newModel, curPose, 0);
    scene.add(newModel.root);

    fox.model = newModel;
    fox.root = newModel.root;
    fox.species = newSpecies;
    if (fox.ai) {
        fox.ai.model = newModel;
        fox.ai.root = newModel.root;
    }

    if (typeof SelectionOutlineManager !== 'undefined' && selectedFoxIndex === idx) {
        SelectionOutlineManager.selectObject(newModel.root, false);
    }

    updateFoxInspectorUI();
    if (typeof refreshLayerUI === 'function') refreshLayerUI();
}
window.setFoxSpeciesByIndex = setFoxSpeciesByIndex;

function setFoxAIModeByIndex(idx, newAIMode) {
    if (idx < 0 || idx >= spawnedFoxesList.length) return;
    const fox = spawnedFoxesList[idx];
    if (!fox) return;
    if (typeof saveState === 'function') saveState();
    fox.aiMode = newAIMode;
    if (fox.ai) fox.ai.aiMode = newAIMode;
    updateFoxInspectorUI();
}
window.setFoxAIModeByIndex = setFoxAIModeByIndex;

function setFoxAIRadiusByIndex(idx, newRadius) {
    if (idx < 0 || idx >= spawnedFoxesList.length) return;
    const fox = spawnedFoxesList[idx];
    if (!fox) return;
    if (typeof saveState === 'function') saveState();
    fox.detectionRadius = newRadius;
    if (fox.ai && typeof fox.ai.setDetectionRadius === 'function') {
        fox.ai.setDetectionRadius(newRadius);
    }
    updateFoxInspectorUI();
}
window.setFoxAIRadiusByIndex = setFoxAIRadiusByIndex;

// ==========================================
// 3. ANIMASI LOOP UNTUK SEMUA RUBAH DI SCENE
// ==========================================
function updateAllSpawnedFoxesAnimation(delta = 0.016, elapsedTime = 0) {
    if (!spawnedFoxesList || spawnedFoxesList.length === 0) return;

    if (typeof delta !== 'number' || isNaN(delta)) delta = 0.016;
    if (typeof elapsedTime !== 'number' || isNaN(elapsedTime)) elapsedTime = performance.now() * 0.001;
    if (delta > 1.0 && elapsedTime === 0) {
        elapsedTime = delta;
        delta = 0.016;
    }

    // Jika dalam Play Mode, pergerakan & animasi rubah dikendalikan secara dinamis & cerdas oleh FoxAIManager!
    if (typeof isPlayMode !== 'undefined' && isPlayMode) {
        return;
    }

    for (let i = 0; i < spawnedFoxesList.length; i++) {
        const fox = spawnedFoxesList[i];
        if (!fox || !fox.root || !fox.root.visible || !fox.model) continue;

        // Pastikan posisi Y selalu pas menapak di atas permukaan tanah (tidak tenggelam di preview editor)
        const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(fox.root.position.x, fox.root.position.z) : 0;
        fox.root.position.y = gy;

        // Update animasi di editor mode: jalankan idle animation pada FBX agar kaki menapak dan bernapas alami
        if (typeof fox.model.updateAnimation === 'function') {
            fox.model.updateAnimation(delta, 0);
        } else if (fox.model.mixer) {
            fox.model.mixer.update(delta); if (fox.model && fox.model.modelMesh) fox.model.modelMesh.rotation.set(0, 0, 0);
        } else {
            applyFoxPose(fox.model, fox.pose, elapsedTime + fox.animOffset);
        }
    }
}
window.updateAllSpawnedFoxesAnimation = updateAllSpawnedFoxesAnimation;

// ==========================================
// 4. UI INSPECTOR BINDING & SYNC
// ==========================================
function updateFoxInspectorUI() {
    const acc = document.getElementById('accordion-fox-inspector');
    const badge = document.getElementById('fox-inspector-badge');
    const chkBoss = document.getElementById('chk-fox-inspector-boss');
    const inputName = document.getElementById('input-fox-inspector-name');
    const inputHp = document.getElementById('input-fox-inspector-hp');
    const selectAI = document.getElementById('select-fox-inspector-ai');
    const sliderHeading = document.getElementById('slider-fox-heading');
    const valHeading = document.getElementById('val-fox-heading');
    const sliderScale = document.getElementById('slider-fox-scale');
    const valScale = document.getElementById('val-fox-scale');
    const sliderPosX = document.getElementById('slider-fox-pos-x');
    const valPosX = document.getElementById('val-fox-pos-x');
    const sliderPosZ = document.getElementById('slider-fox-pos-z');
    const valPosZ = document.getElementById('val-fox-pos-z');

    if (selectedFoxIndex < 0 || selectedFoxIndex >= spawnedFoxesList.length) {
        if (badge) badge.innerText = 'Tidak Ada Rubah Terpilih';
        return;
    }

    const fox = spawnedFoxesList[selectedFoxIndex];
    if (!fox) return;

    if (badge) {
        const role = fox.isBoss ? '👹 BOSS: ' : '⚔️ ';
        badge.innerText = `${role}${fox.name || 'FoxTree'} (#${selectedFoxIndex + 1})`;
    }

    if (chkBoss) chkBoss.checked = !!fox.isBoss;
    if (inputName) inputName.value = fox.name || (fox.isBoss ? 'Lingxuzi' : 'FoxTree Enemy');
    if (inputHp) inputHp.value = fox.maxHealth || (fox.isBoss ? 500 : 100);

    const inputDamage = document.getElementById('input-fox-inspector-damage');
    if (inputDamage) inputDamage.value = (typeof fox.damagePerHit === 'number') ? fox.damagePerHit : (fox.isBoss ? 25 : 15);

    const selectInspectorSpecies = document.getElementById('select-fox-inspector-species');
    if (selectInspectorSpecies) {
        selectInspectorSpecies.value = fox.species || 'foxtree';
    }
    if (selectAI) selectAI.value = fox.aiMode || 'combat';

    const sliderAIRadius = document.getElementById('slider-fox-ai-radius');
    const valAIRadius = document.getElementById('val-fox-ai-radius');
    if (sliderAIRadius && valAIRadius) {
        const rad = Math.round(fox.detectionRadius !== undefined ? fox.detectionRadius : 18);
        sliderAIRadius.value = rad;
        valAIRadius.innerText = `${rad} m`;
    }

    // Heading (derajat)
    if (sliderHeading && valHeading && fox.root) {
        let deg = Math.round(THREE.MathUtils.radToDeg(fox.root.rotation.y)) % 360;
        if (deg < 0) deg += 360;
        sliderHeading.value = deg;
        valHeading.innerText = `${deg}°`;
    }

    // Skala
    const numScale = document.getElementById('num-fox-scale');
    if (sliderScale || valScale || numScale) {
        const sc = (typeof fox.scaleMultiplier === 'number') ? fox.scaleMultiplier : 1.0;
        if (sliderScale) sliderScale.value = sc;
        if (numScale) numScale.value = sc.toFixed(2);
        if (valScale) valScale.innerText = `${sc.toFixed(2)}x`;
    }

    // Posisi X & Z
    if (sliderPosX && valPosX && fox.root) {
        sliderPosX.value = fox.root.position.x.toFixed(1);
        valPosX.innerText = fox.root.position.x.toFixed(1);
    }
    if (sliderPosZ && valPosZ && fox.root) {
        sliderPosZ.value = fox.root.position.z.toFixed(1);
        valPosZ.innerText = fox.root.position.z.toFixed(1);
    }
}
window.updateFoxInspectorUI = updateFoxInspectorUI;

// Setup Event Listeners saat DOM Siap
let isFoxSpawnerUIInited = false;
function initFoxSpawnerUI() {
    if (isFoxSpawnerUIInited) return;
    isFoxSpawnerUIInited = true;

    // Pastikan referensi selectFoxMode sinkron
    selectFoxMode = document.getElementById('select-fox-mode');
    window.selectFoxMode = selectFoxMode;

    // Spawner Boss Toggle Helper (auto update suggested name, HP, & Damage)
    const chkSpawnerBoss = document.getElementById('chk-spawner-fox-boss');
    const inputSpawnerName = document.getElementById('input-spawner-fox-name');
    const inputSpawnerHp = document.getElementById('input-spawner-fox-hp');
    const inputSpawnerDamage = document.getElementById('input-spawner-fox-damage');
    if (chkSpawnerBoss) {
        chkSpawnerBoss.addEventListener('change', () => {
            if (chkSpawnerBoss.checked) {
                if (inputSpawnerName && (inputSpawnerName.value === 'FoxTree' || !inputSpawnerName.value)) {
                    inputSpawnerName.value = 'Lingxuzi';
                }
                if (inputSpawnerHp && inputSpawnerHp.value === '100') {
                    inputSpawnerHp.value = '500';
                }
                if (inputSpawnerDamage && inputSpawnerDamage.value === '15') {
                    inputSpawnerDamage.value = '25';
                }
            } else {
                if (inputSpawnerName && inputSpawnerName.value === 'Lingxuzi') {
                    inputSpawnerName.value = 'FoxTree';
                }
                if (inputSpawnerHp && inputSpawnerHp.value === '500') {
                    inputSpawnerHp.value = '100';
                }
                if (inputSpawnerDamage && inputSpawnerDamage.value === '25') {
                    inputSpawnerDamage.value = '15';
                }
            }
        });
    }

    // Inspector Boss Checkbox
    const chkInspectorBoss = document.getElementById('chk-fox-inspector-boss');
    if (chkInspectorBoss) {
        chkInspectorBoss.addEventListener('change', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                fox.isBoss = chkInspectorBoss.checked;
                if (fox.ai) fox.ai.isBoss = chkInspectorBoss.checked;

                const inspectorName = document.getElementById('input-fox-inspector-name');
                const inspectorHp = document.getElementById('input-fox-inspector-hp');
                const inspectorDmg = document.getElementById('input-fox-inspector-damage');
                if (chkInspectorBoss.checked) {
                    if (inspectorName && (inspectorName.value === 'FoxTree' || !inspectorName.value)) {
                        inspectorName.value = 'Lingxuzi';
                        fox.name = 'Lingxuzi';
                        if (fox.ai) fox.ai.name = 'Lingxuzi';
                    }
                    if (inspectorHp && inspectorHp.value === '100') {
                        inspectorHp.value = '500';
                        fox.maxHealth = 500;
                        fox.health = 500;
                        if (fox.ai) { fox.ai.maxHealth = 500; fox.ai.health = 500; }
                    }
                    if (inspectorDmg && inspectorDmg.value === '15') {
                        inspectorDmg.value = '25';
                        fox.damagePerHit = 25;
                        if (fox.model) fox.model.damagePerHit = 25;
                        if (fox.ai) fox.ai.damagePerHit = 25;
                    }
                } else {
                    if (inspectorDmg && inspectorDmg.value === '25') {
                        inspectorDmg.value = '15';
                        fox.damagePerHit = 15;
                        if (fox.model) fox.model.damagePerHit = 15;
                        if (fox.ai) fox.ai.damagePerHit = 15;
                    }
                }
                updateFoxInspectorUI();
            }
        });
    }

    // Inspector Name Input
    const inputInspectorName = document.getElementById('input-fox-inspector-name');
    if (inputInspectorName) {
        inputInspectorName.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                const val = inputInspectorName.value.trim() || 'Enemy';
                fox.name = val;
                if (fox.ai) fox.ai.name = val;
                const badge = document.getElementById('fox-inspector-badge');
                if (badge) {
                    const role = fox.isBoss ? '👹 BOSS: ' : '⚔️ ';
                    badge.innerText = `${role}${val} (#${selectedFoxIndex + 1})`;
                }
            }
        });
    }

    // Inspector HP Input
    const inputInspectorHp = document.getElementById('input-fox-inspector-hp');
    if (inputInspectorHp) {
        inputInspectorHp.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                const val = Math.max(10, parseFloat(inputInspectorHp.value) || 100);
                fox.maxHealth = val;
                fox.health = val;
                if (fox.ai) {
                    fox.ai.maxHealth = val;
                    fox.ai.health = val;
                }
            }
        });
    }

    // Inspector Damage Input
    const inputInspectorDamage = document.getElementById('input-fox-inspector-damage');
    if (inputInspectorDamage) {
        inputInspectorDamage.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                const val = Math.max(1, parseFloat(inputInspectorDamage.value) || 15);
                fox.damagePerHit = val;
                if (fox.model) fox.model.damagePerHit = val;
                if (fox.ai) fox.ai.damagePerHit = val;
            }
        });
    }

    // Inspector AI Mode Selector
    const selectAI = document.getElementById('select-fox-inspector-ai');
    if (selectAI) {
        selectAI.addEventListener('change', () => {
            if (selectedFoxIndex >= 0) {
                setFoxAIModeByIndex(selectedFoxIndex, selectAI.value);
            }
        });
    }

    // Inspector AI Radius Slider
    const sliderAIRadius = document.getElementById('slider-fox-ai-radius');
    const valAIRadius = document.getElementById('val-fox-ai-radius');
    if (sliderAIRadius) {
        sliderAIRadius.addEventListener('input', () => {
            if (selectedFoxIndex >= 0) {
                const r = parseFloat(sliderAIRadius.value) || 18;
                if (valAIRadius) valAIRadius.innerText = `${r} m`;
                setFoxAIRadiusByIndex(selectedFoxIndex, r);
            }
        });
    }

    // Spawner Default AI Radius Slider
    const sliderSpawnerRadius = document.getElementById('slider-spawner-ai-radius');
    const valSpawnerRadius = document.getElementById('val-spawner-ai-radius');
    if (sliderSpawnerRadius) {
        sliderSpawnerRadius.addEventListener('input', () => {
            const r = parseFloat(sliderSpawnerRadius.value) || 18;
            if (valSpawnerRadius) valSpawnerRadius.innerText = `${r} m`;
        });
    }

    // 4. Sliders Transformasi
    const sliderHeading = document.getElementById('slider-fox-heading');
    const valHeading = document.getElementById('val-fox-heading');
    if (sliderHeading) {
        sliderHeading.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const deg = parseFloat(sliderHeading.value);
                spawnedFoxesList[selectedFoxIndex].root.rotation.y = THREE.MathUtils.degToRad(deg);
                if (valHeading) valHeading.innerText = `${deg}°`;
                if (typeof SelectionOutlineManager !== 'undefined') SelectionOutlineManager.updateBounds();
            }
        });
    }

    const sliderScale = document.getElementById('slider-fox-scale');
    const numScale = document.getElementById('num-fox-scale');
    const valScale = document.getElementById('val-fox-scale');

    function applySelectedFoxScale(newVal) {
        if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
            const fox = spawnedFoxesList[selectedFoxIndex];
            const sc = Math.max(0.1, parseFloat(newVal) || 1.0);
            fox.scaleMultiplier = sc;
            const base = (fox.model && typeof fox.model.baseScale === 'number') ? fox.model.baseScale : (fox.baseScale || 1.85);
            fox.root.scale.set(base * sc, base * sc, base * sc);
            if (fox.root.userData) fox.root.userData.customScale = sc;
            if (sliderScale && document.activeElement !== sliderScale) sliderScale.value = sc;
            if (numScale && document.activeElement !== numScale) numScale.value = sc.toFixed(2);
            if (valScale) valScale.innerText = `${sc.toFixed(2)}x`;
            if (typeof SelectionOutlineManager !== 'undefined') SelectionOutlineManager.updateBounds();
            if (typeof updateHitboxFromModel === 'function' && fox.selectionHitbox) {
                updateHitboxFromModel(fox.selectionHitbox, fox.model);
            }
        }
    }

    if (sliderScale) {
        sliderScale.addEventListener('input', () => applySelectedFoxScale(sliderScale.value));
    }
    if (numScale) {
        numScale.addEventListener('input', () => applySelectedFoxScale(numScale.value));
    }
    document.querySelectorAll('.btn-fox-scale-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const sc = parseFloat(btn.dataset.scale) || 1.0;
            applySelectedFoxScale(sc);
        });
    });

    const sliderPosX = document.getElementById('slider-fox-pos-x');
    const valPosX = document.getElementById('val-fox-pos-x');
    if (sliderPosX) {
        sliderPosX.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                const newX = parseFloat(sliderPosX.value);
                const newY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(newX, fox.root.position.z) : fox.root.position.y;
                fox.root.position.x = newX;
                fox.root.position.y = newY;
                if (valPosX) valPosX.innerText = newX.toFixed(1);
                if (typeof SelectionOutlineManager !== 'undefined') SelectionOutlineManager.updateBounds();
            }
        });
    }

    const sliderPosZ = document.getElementById('slider-fox-pos-z');
    const valPosZ = document.getElementById('val-fox-pos-z');
    if (sliderPosZ) {
        sliderPosZ.addEventListener('input', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const fox = spawnedFoxesList[selectedFoxIndex];
                const newZ = parseFloat(sliderPosZ.value);
                const newY = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(fox.root.position.x, newZ) : fox.root.position.y;
                fox.root.position.z = newZ;
                fox.root.position.y = newY;
                if (valPosZ) valPosZ.innerText = newZ.toFixed(1);
                if (typeof SelectionOutlineManager !== 'undefined') SelectionOutlineManager.updateBounds();
            }
        });
    }

    // 5. Tombol Hapus Rubah di Inspector
    const btnDeleteFox = document.getElementById('btn-delete-fox');
    if (btnDeleteFox) {
        btnDeleteFox.addEventListener('click', () => {
            if (selectedFoxIndex >= 0) {
                deleteFoxByIndex(selectedFoxIndex);
            }
        });
    }

    // 5b. Dropdown ganti Model Karakter di Inspector
    const selectInspectorSpecies = document.getElementById('select-fox-inspector-species');
    if (selectInspectorSpecies) {
        selectInspectorSpecies.addEventListener('change', () => {
            if (selectedFoxIndex >= 0 && spawnedFoxesList[selectedFoxIndex]) {
                const newSpec = selectInspectorSpecies.value;
                setFoxSpeciesByIndex(selectedFoxIndex, newSpec);
                const meta = (window.PandoraHeroRegistry && window.PandoraHeroRegistry.getCharacterMeta)
                    ? window.PandoraHeroRegistry.getCharacterMeta(newSpec)
                    : null;
                if (meta && meta.name) {
                    spawnedFoxesList[selectedFoxIndex].name = meta.name;
                    if (spawnedFoxesList[selectedFoxIndex].ai) spawnedFoxesList[selectedFoxIndex].ai.name = meta.name;
                    updateFoxInspectorUI();
                }
            }
        });
    }

    // 5c. Dropdown pilih Karakter Player Utama di Player Spawn Area
    const selectPlayerHero = document.getElementById('select-player-hero-folder');
    if (selectPlayerHero) {
        selectPlayerHero.addEventListener('change', () => {
            const heroKey = selectPlayerHero.value || 'red';
            window.currentFoxSpeciesKey = heroKey;
            const selPlayCharacter = document.getElementById('select-play-character');
            if (selPlayCharacter) selPlayCharacter.value = heroKey;
            if (typeof switchFoxSpecies === 'function') {
                switchFoxSpecies(heroKey);
            }
            if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
                PandoraToast.show('🦊 Karakter Player diubah ke: ' + heroKey, 'info');
            }
        });
    }

    // 6. Setup Spawner Card Grid & Sinkronisasi Otomatis dengan Folder hero/*
    if (typeof setupSpawnerCardGrid === 'function') {
        setupSpawnerCardGrid('fox-picker-grid', 'select-fox-mode');
    }

    if (selectFoxMode) {
        selectFoxMode.addEventListener('change', () => {
            const val = selectFoxMode.value;
            if (val && val !== 'none' && window.PandoraHeroRegistry) {
                const meta = window.PandoraHeroRegistry.getCharacterMeta(val);
                if (meta && meta.name && inputSpawnerName) {
                    inputSpawnerName.value = (chkSpawnerBoss && chkSpawnerBoss.checked) ? (meta.name + ' Boss') : meta.name;
                }
                // Preload model karakter yang dipilih agar instan saat diklik di tanah
                const mgr = window.PandoraHeroRegistry.getAssetManager(val);
                if (mgr && !mgr.isLoaded && !mgr.isLoading) {
                    mgr.load();
                }
            }
        });
    }

    function renderDynamicHeroSpawnerUI(characters) {
        if (!Array.isArray(characters) || characters.length === 0) return;

        const curSelectVal = selectFoxMode ? selectFoxMode.value : 'none';
        const grid = document.getElementById('fox-picker-grid');

        // Palette warna kartu spawner agar setiap karakter baru punya tampilan visual keren otomatis
        const CARD_THEMES = [
            { bg: 'radial-gradient(circle, #065f46 0%, #022c22 100%)', head: '#34d399', body: '#059669', orb: '#f59e0b' },
            { bg: 'radial-gradient(circle, #4c1d95 0%, #1e1b4b 100%)', head: '#c084fc', body: '#7c3aed', orb: '#38bdf8' },
            { bg: 'radial-gradient(circle, #7c2d12 0%, #3b0764 100%)', head: '#fb923c', body: '#ea580c', orb: '#facc15' },
            { bg: 'radial-gradient(circle, #1e3a8a 0%, #0f172a 100%)', head: '#60a5fa', body: '#2563eb', orb: '#34d399' },
            { bg: 'radial-gradient(circle, #831843 0%, #2e1065 100%)', head: '#f472b6', body: '#db2777', orb: '#a78bfa' }
        ];

        // 1. Update #select-fox-mode
        if (selectFoxMode) {
            selectFoxMode.innerHTML = '<option value="none">Off</option>';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.spawnerKey || c.id;
                opt.innerText = c.name + ' (hero/' + c.folder + ')';
                selectFoxMode.appendChild(opt);
            });
            if ([...selectFoxMode.options].some(o => o.value === curSelectVal)) {
                selectFoxMode.value = curSelectVal;
            }
        }

        // 2. Update #fox-picker-grid
        if (grid) {
            let html = `
                <button type="button" class="spawner-card ${curSelectVal === 'none' ? 'active' : ''}" data-value="none" title="Matikan Mode Spawner Karakter">
                    <div class="card-preview">
                        <svg viewBox="0 0 40 40" class="card-svg">
                            <circle cx="20" cy="20" r="13" fill="none" stroke="#64748b" stroke-width="2.5" stroke-dasharray="4 2" />
                            <line x1="12" y1="28" x2="28" y2="12" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" />
                        </svg>
                    </div>
                    <span class="card-name">Off</span>
                </button>
            `;

            characters.forEach((c, idx) => {
                const sKey = c.spawnerKey || c.id;
                const isAct = (curSelectVal === sKey) ? 'active' : '';
                const theme = (c.id === 'enemy-foxtree') ? CARD_THEMES[0] : (c.id === 'tharon' ? CARD_THEMES[1] : (c.id === 'red' ? CARD_THEMES[2] : CARD_THEMES[(idx + 1) % CARD_THEMES.length]));
                const clipCount = Array.isArray(c.files) ? c.files.length : 1;
                html += `
                    <button type="button" class="spawner-card ${isAct}" data-value="${sKey}" title="${c.name} (hero/${c.folder}/* — ${clipCount} file FBX)">
                        <div class="card-preview" style="background: ${theme.bg};">
                            <svg viewBox="0 0 40 40" class="card-svg">
                                <circle cx="20" cy="14" r="5" fill="${theme.head}" />
                                <path d="M12 36 L15 22 L20 25 L25 22 L28 36 Z" fill="${theme.body}" />
                                <circle cx="10" cy="20" r="3.2" fill="${theme.orb}" />
                                <circle cx="30" cy="20" r="3.2" fill="${theme.orb}" />
                            </svg>
                        </div>
                        <span class="card-name">${c.name}</span>
                    </button>
                `;
            });
            grid.innerHTML = html;
        }

        // 3. Update #select-fox-inspector-species
        const selInspectorSpec = document.getElementById('select-fox-inspector-species');
        if (selInspectorSpec) {
            const prevVal = selInspectorSpec.value;
            selInspectorSpec.innerHTML = '';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.spawnerKey || c.id;
                opt.innerText = (c.badge || '⚔️') + ' ' + c.name + ' (hero/' + c.folder + ')';
                selInspectorSpec.appendChild(opt);
            });
            if (prevVal) selInspectorSpec.value = prevVal;
        }

        // 4. Update #select-player-hero-folder
        const selPlayerHero = document.getElementById('select-player-hero-folder');
        if (selPlayerHero) {
            const prevHero = selPlayerHero.value || 'red';
            selPlayerHero.innerHTML = '';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = (c.badge || '🦊') + ' ' + c.name + ' (hero/' + c.folder + ')';
                selPlayerHero.appendChild(opt);
            });
            if ([...selPlayerHero.options].some(o => o.value === prevHero)) {
                selPlayerHero.value = prevHero;
            }
        }

        // 5. Update pemilih karakter di toolbar
        const selPlayCharacter = document.getElementById('select-play-character');
        if (selPlayCharacter) {
            const activeHero = (selPlayerHero && selPlayerHero.value)
                || (typeof currentFoxSpeciesKey !== 'undefined' && currentFoxSpeciesKey)
                || 'red';
            selPlayCharacter.innerHTML = '';
            characters.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = c.name;
                selPlayCharacter.appendChild(opt);
            });
            selPlayCharacter.value = activeHero;
        }
    }

    window.renderDynamicHeroSpawnerUI = renderDynamicHeroSpawnerUI;
    if (window.PandoraHeroRegistry) {
        renderDynamicHeroSpawnerUI(window.PandoraHeroRegistry.characters);
        window.PandoraHeroRegistry.onSync(renderDynamicHeroSpawnerUI);
    }

    const btnSyncHero = document.getElementById('btn-sync-hero-folders');
    if (btnSyncHero) {
        btnSyncHero.addEventListener('click', async () => {
            if (!window.PandoraHeroRegistry) return;
            btnSyncHero.disabled = true;
            btnSyncHero.innerText = '⏳ Resetting Cache & Syncing...';
            try {
                if (window.PandoraAttachmentSystem) {
                    window.PandoraAttachmentSystem.clearCache();
                    await window.PandoraAttachmentSystem.loadConfig(true);
                }
                await window.PandoraHeroRegistry.purgeAllCache();
                const chars = await window.PandoraHeroRegistry.sync(true);
                if (typeof PandoraToast !== 'undefined' && PandoraToast.show) {
                    const names = chars.map(c => c.name).join(', ');
                    PandoraToast.show('✅ Re-Sync Sukses: Cache Dikosongkan & ' + chars.length + ' Karakter Disinkronkan (' + names + ')', 'success');
                }
            } catch (errSync) {
                console.error('[FoxSpawner] Error sync hero:', errSync);
            } finally {
                btnSyncHero.disabled = false;
                btnSyncHero.innerText = '🔄 Re-Sync (Reset Cache)';
            }
        });
    }

    // Reset total semua enemy lama sesuai arahan user
    clearAllSpawnedFoxes(true);
}

// Inisialisasi listener
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFoxSpawnerUI);
} else {
    initFoxSpawnerUI();
}

// Global shortcut Delete / Backspace for selected fox
window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (window.selectedFoxIndex >= 0 && window.selectedFoxIndex < spawnedFoxesList.length) {
            e.preventDefault();
            deleteFoxByIndex(window.selectedFoxIndex);
        }
    }
});
