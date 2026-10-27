// ===================================================================
// PANDORA FOX AI SYSTEM (REWRITTEN & CLEANED)
// Alur Kerja Bersih:
// 1. Editor Mode: Diam total (pose editor), tidak ada pergerakan posisi!
// 2. Play Mode:
//    - TAHAP 1: Cari box item aktif terdekat di peta, sprint ambil senjata!
//    - TAHAP 2: Cari Player, dekati ke jarak tembak, hadapkan senjata & serang!
//    - TAHAP 3: Visual radius ring aktif di Play Mode.
// ===================================================================

// ===================================================================
// KONFIGURASI COMBAT ENEMY AI (BOSS & NON-BOSS)
// Pengaturan HP maksimum dan Damage per hit untuk Enemy AI
// ===================================================================
const ENEMY_COMBAT_CONFIG = {
    boss: {
        name: 'Lingxuzi',
        maxHealth: 500,       // HP darah Boss
        damagePerHit: 25,     // Damage yang diterima player saat terkena serangan Boss
    },
    nonBoss: {
        name: 'FoxTree Enemy',
        maxHealth: 100,       // HP darah Enemy biasa
        damagePerHit: 12,     // Damage yang diterima player saat terkena serangan Enemy biasa
    }
};
window.ENEMY_COMBAT_CONFIG = ENEMY_COMBAT_CONFIG;

let FoxAIManager = null;

class FoxAIAgent {
    constructor(foxRecord) {
        this.fox = foxRecord;
        this.root = foxRecord.root;
        this.model = foxRecord.model;
        this.id = foxRecord.id || ('ai_fox_' + Math.random().toString(36).substr(2, 9));
        this.isAIFox = true;

        // Origin spawn untuk reset & teritorial
        this.spawnOrigin = this.root ? this.root.position.clone() : new THREE.Vector3();
        this.spawnRotationY = this.root ? this.root.rotation.y : 0;

        // Radius deteksi & mode
        this.detectionRadius = foxRecord.detectionRadius !== undefined ? foxRecord.detectionRadius : 18.0;
        this.aiMode = foxRecord.aiMode || 'combat'; // 'combat' | 'companion' | 'wander' | 'passive'

        // Status Senjata & Pertarungan
        this.equippedItem = null; // 'plasma' jika memegang bazooka
        this.ammo = 0;
        this.maxAmmo = 3;
        this.weaponMeshGroup = null;

        // Kesehatan & Status (Mengikuti ENEMY_COMBAT_CONFIG terpusat)
        this.isBoss = !!foxRecord.isBoss;
        const cfgCombat = this.isBoss ? ENEMY_COMBAT_CONFIG.boss : ENEMY_COMBAT_CONFIG.nonBoss;
        this.name = foxRecord.name || cfgCombat.name;
        this.maxHealth = typeof foxRecord.maxHealth === 'number' ? foxRecord.maxHealth : cfgCombat.maxHealth;
        this.damagePerHit = typeof foxRecord.damagePerHit === 'number' ? foxRecord.damagePerHit : cfgCombat.damagePerHit;
        this.health = typeof foxRecord.health === 'number' ? foxRecord.health : this.maxHealth;
        this.isDead = false;
        this.isFadingOut = false;
        this.fadeTimer = 0.0;
        this.fadeDuration = 1.8; // Fadeout 1.8 detik sebelum menghilang sepenuhnya
        this.state = 'IDLE'; // 'IDLE', 'SEEK_BOX', 'COMBAT_ENGAGE', 'HIT_STUN'
        this.hitStunTimer = 0;
        this.shootCooldown = 1.0 + Math.random() * 0.8;
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
        this.strafeTimer = 1.5;

        // Ritme & Tempo Serangan Melee (Burst 3-5 pukulan lalu mundur sedikit selama 2 detik)
        this.attackComboTarget = 3 + Math.floor(Math.random() * 3); // 3, 4, atau 5 serangan
        this.attacksCompletedInBurst = 0;
        this.combatRestTimer = 0.0;     // Timer 2 detik untuk mundur & istirahat
        this.betweenPunchDelay = 0.0;   // Jeda mikro natural antar pukulan
        this._wasPunching = false;

        // Variasi Acak Gait Locomotion (Walk & Run Pacing independen dari player)
        this.locomotionDecisionTimer = 0.0;
        this.isPacingRun = Math.random() > 0.45;

        // Kecepatan & Kemudi (Diselaraskan persis dengan stats spesies player red fox)
        const speciesKey = (foxRecord && foxRecord.species) ? foxRecord.species : 'foxtree';
        const speciesCfg = (typeof FOX_STATS_CONFIG !== 'undefined' && FOX_STATS_CONFIG[speciesKey])
            ? FOX_STATS_CONFIG[speciesKey]
            : (typeof FOX_STATS_CONFIG !== 'undefined' ? FOX_STATS_CONFIG.red : null);

        this.walkSpeed = (speciesCfg && speciesCfg.walkSpeed) ? speciesCfg.walkSpeed : 1.65;
        this.sprintSpeed = (speciesCfg && speciesCfg.runSpeed) ? speciesCfg.runSpeed : 4.8;
        this.turnRate = (speciesCfg && speciesCfg.turnRate) ? speciesCfg.turnRate : 2.8;
        this.currentSpeed = 0;
        this.targetSpeed = 0;
        this.currentTurnRate = 0;
        this.knockbackVel = new THREE.Vector3();
        this.velocityY = 0;
        this.isGrounded = true;
        this.landingSquash = 0;

        // Animasi Gait
        this.gaitPhase = Math.random() * Math.PI * 2;
        this.animOffset = foxRecord.animOffset || Math.random() * 50;

        // Objek Visual 3D
        this.ringGroup = null;
        this.buildMountedWeapon();
        this.buildDetectionRing();
    }

    // ==========================================
    // 3D MOUNTED BAZOOKA MESH FOR AI FOX
    // ==========================================
    buildMountedWeapon() {
        if (this.weaponMeshGroup) return;
        if (this.model && (this.model.mixer || this.model.isEnemy)) return; // FoxTree enemy adalah Melee Combat, tidak memakai bazooka

        this.weaponMeshGroup = new THREE.Group();
        this.weaponMeshGroup.name = 'AI_MountedBazooka_' + this.id;

        const octCylGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8);
        const octDarkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85, roughness: 0.35 });
        const octRedMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.4, roughness: 0.5 });
        const octOrangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.2, roughness: 0.4 });

        const body1 = new THREE.Mesh(octCylGeo, octDarkMat);
        body1.rotation.x = Math.PI / 2;
        this.weaponMeshGroup.add(body1);

        const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8), octRedMat);
        ring1.rotation.x = Math.PI / 2;
        ring1.position.z = 0.15;
        this.weaponMeshGroup.add(ring1);

        const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 8), octOrangeMat);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.z = -0.22;
        this.weaponMeshGroup.add(ring2);

        const coreMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        const muzzleCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), coreMat);
        muzzleCore.position.z = -0.42;
        this.weaponMeshGroup.add(muzzleCore);
        this.muzzleCore = muzzleCore;

        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), octDarkMat);
        clamp.position.set(0, -0.12, 0);
        this.weaponMeshGroup.add(clamp);

        if (this.model && this.model.bodyTiltGroup) {
            this.model.bodyTiltGroup.add(this.weaponMeshGroup);
            this.weaponMeshGroup.position.set(0.12, 0.22, 0.44);
            this.weaponMeshGroup.rotation.set(0, Math.PI / 2, -0.01);
            this.weaponMeshGroup.visible = false;
        }
    }

    equipPlasmaWeapon() {
        this.equippedItem = 'plasma';
        this.ammo = this.maxAmmo;
        if (this.weaponMeshGroup) {
            this.weaponMeshGroup.visible = true;
        }
        this.state = 'COMBAT_ENGAGE';
        this.shootCooldown = 0.6;
    }

    dropWeapon() {
        this.equippedItem = null;
        this.ammo = 0;
        if (this.weaponMeshGroup) {
            this.weaponMeshGroup.visible = false;
        }
        this.state = 'SEEK_BOX';
        this.shootCooldown = 0;
    }

    onCollectItemBox(itemType = 'plasma') {
        this.equipPlasmaWeapon();
    }

    // ==========================================
    // VISUAL DETECTION RING IN PLAY MODE
    // ==========================================
    buildDetectionRing() {
        if (this.ringGroup) return;

        this.ringGroup = new THREE.Group();
        this.ringGroup.name = 'AI_AggroRing_' + this.id;

        const r = this.detectionRadius || 18.0;

        const borderGeo = new THREE.RingGeometry(Math.max(0.1, r - 0.24), r + 0.24, 64);
        borderGeo.rotateX(-Math.PI / 2);
        this.ringBorderMat = new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        this.ringBorderMesh = new THREE.Mesh(borderGeo, this.ringBorderMat);
        this.ringBorderMesh.renderOrder = 998;
        this.ringGroup.add(this.ringBorderMesh);

        const discGeo = new THREE.CircleGeometry(r, 64);
        discGeo.rotateX(-Math.PI / 2);
        this.ringDiscMat = new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.08,
            depthWrite: false
        });
        this.ringDiscMesh = new THREE.Mesh(discGeo, this.ringDiscMat);
        this.ringDiscMesh.renderOrder = 997;
        this.ringGroup.add(this.ringDiscMesh);

        if (typeof scene !== 'undefined' && scene) {
            scene.add(this.ringGroup);
        }
        this.ringGroup.visible = false;
    }

    setDetectionRadius(newR) {
        this.detectionRadius = Math.max(3.0, newR);
        if (this.fox) this.fox.detectionRadius = this.detectionRadius;

        if (this.ringBorderMesh && this.ringBorderMesh.geometry) {
            this.ringBorderMesh.geometry.dispose();
            const bGeo = new THREE.RingGeometry(Math.max(0.1, this.detectionRadius - 0.24), this.detectionRadius + 0.24, 64);
            bGeo.rotateX(-Math.PI / 2);
            this.ringBorderMesh.geometry = bGeo;
        }
        if (this.ringDiscMesh && this.ringDiscMesh.geometry) {
            this.ringDiscMesh.geometry.dispose();
            const dGeo = new THREE.CircleGeometry(this.detectionRadius, 64);
            dGeo.rotateX(-Math.PI / 2);
            this.ringDiscMesh.geometry = dGeo;
        }
    }

    updateDetectionRing(elapsed, isPlayerInRange, groundY) {
        if (!this.ringGroup) return;

        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);
        // Sembunyikan ring visual saat Play Demo Mode sesuai permintaan user
        if (inPlay || this.isDead || !this.root || !this.root.visible) {
            this.ringGroup.visible = false;
            return;
        }

        // Tampilkan saat Mode Studio Editor
        this.ringGroup.visible = true;
        this.ringGroup.position.set(this.root.position.x, groundY + 0.05, this.root.position.z);

        // Visual ring cyan editor dengan nafas halus
        const breathe = Math.sin(elapsed * 2.2);
        if (this.ringBorderMat) {
            this.ringBorderMat.color.setHex(0x06b6d4);
            this.ringBorderMat.opacity = 0.65 + breathe * 0.15;
        }
        if (this.ringDiscMat) {
            this.ringDiscMat.color.setHex(0x06b6d4);
            this.ringDiscMat.opacity = 0.06 + breathe * 0.02;
        }
    }

    dispose() {
        if (this.ringGroup) {
            if (this.ringBorderMesh && this.ringBorderMesh.geometry) this.ringBorderMesh.geometry.dispose();
            if (this.ringDiscMesh && this.ringDiscMesh.geometry) this.ringDiscMesh.geometry.dispose();
            if (this.ringBorderMat) this.ringBorderMat.dispose();
            if (this.ringDiscMat) this.ringDiscMat.dispose();
            if (typeof scene !== 'undefined' && scene) scene.remove(this.ringGroup);
            this.ringGroup = null;
        }
        if (this.weaponMeshGroup) {
            if (typeof scene !== 'undefined' && scene) scene.remove(this.weaponMeshGroup);
            this.weaponMeshGroup = null;
        }
    }

    // ==========================================
    // HEALTH, DAMAGE, & KNOCKBACK
    // ==========================================
    takeDamage(amount, attackerPos = null) {
        if (this.isDead) return;
        this.health = Math.max(0, this.health - amount);
        if (this.fox) this.fox.health = this.health;

        if (this.health <= 0) {
            this.die(attackerPos);
            return;
        }

        this.takeHit(attackerPos);
    }

    die(attackerPos = null) {
        if (this.isDead) return;
        this.isDead = true;
        this.state = 'DEAD';
        this.targetSpeed = 0;
        this.currentSpeed = 0;
        this.velocityY = 0;
        this.dropWeapon();

        if (this.ringGroup) {
            this.ringGroup.visible = false;
        }

        if (this.model && typeof this.model.triggerDeath === 'function') {
            this.model.triggerDeath();
        }

        // Mulai animasi fadeout material halus setelah tereliminasi
        this.isFadingOut = true;
        this.fadeTimer = 0.0;
        if (this.root) {
            this.root.traverse(child => {
                if (child.isMesh && child.material) {
                    // Pastikan material di-clone secara eksklusif agar fadeout tidak pernah bocor ke enemy lain
                    if (!child.userData.hasUniqueFadeMat) {
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map(m => m.clone());
                        } else {
                            child.material = child.material.clone();
                        }
                        child.userData.hasUniqueFadeMat = true;
                    }
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.transparent = true;
                    });
                }
            });
        }
    }

    takeHit(attackerPos = null) {
        if (this.isDead) return;
        if (!attackerPos && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            attackerPos = wolfCharacter.root.position;
        }
        if (this.model && typeof this.model.takeHit === 'function') {
            this.model.takeHit(attackerPos);
        }
        this.state = 'HIT_STUN';
        this.hitStunTimer = (this.model && this.model.hitDuration) ? this.model.hitDuration : 0.55;
    }

    applyKnockback(impulseVec, verticalPop = 0) {
        this.knockbackVel.add(impulseVec);
        this.velocityY = Math.max(this.velocityY, 0) + verticalPop;
        this.isGrounded = false;
        this.landingSquash = 0.12;
        this.state = 'HIT_STUN';
        this.hitStunTimer = 0.6;
    }

    getForwardVector() {
        if (this.model && (this.model.mixer || this.model.isEnemy)) {
            // Model FBX Mixamo menghadap +Z
            return new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
        }
        return new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
    }

    canSeePlayer(playerPos) {
        if (FoxAIManager && typeof FoxAIManager.checkLineOfSight === 'function') {
            return FoxAIManager.checkLineOfSight(this.root.position, playerPos);
        }
        return true;
    }

    getBlockingObstacle(playerPos) {
        if (FoxAIManager && typeof FoxAIManager.getBlockingObstacle === 'function') {
            return FoxAIManager.getBlockingObstacle(this.root.position, playerPos);
        }
        return null;
    }

    findClosestItemBox() {
        if (typeof itemBoxManagerInstance === 'undefined' || !itemBoxManagerInstance || !itemBoxManagerInstance.boxes) {
            return null;
        }
        let closest = null;
        let minDistSq = Infinity;
        const myPos = this.root.position;

        for (let i = 0; i < itemBoxManagerInstance.boxes.length; i++) {
            const box = itemBoxManagerInstance.boxes[i];
            if (!box || !box.isActive) continue;

            const dx = box.baseX - myPos.x;
            const dz = box.baseZ - myPos.z;
            const distSq = dx * dx + dz * dz;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                closest = box;
            }
        }
        return closest;
    }

    findBestRespawningBox() {
        if (typeof itemBoxManagerInstance === 'undefined' || !itemBoxManagerInstance || !itemBoxManagerInstance.boxes) {
            return null;
        }
        let best = null;
        let bestScore = Infinity;
        const myPos = this.root.position;

        for (let i = 0; i < itemBoxManagerInstance.boxes.length; i++) {
            const box = itemBoxManagerInstance.boxes[i];
            if (!box) continue;

            const dx = box.baseX - myPos.x;
            const dz = box.baseZ - myPos.z;
            const dist = Math.hypot(dx, dz);
            const remainingTimer = box.respawnTimer || 0;

            // Prioritaskan box dengan timer tersisa paling sedikit dan jarak terdekat
            const score = remainingTimer * 2.2 + dist;
            if (score < bestScore) {
                bestScore = score;
                best = box;
            }
        }
        return best;
    }

    // ==========================================
    // LOCOMOTION STEERING (DENGAN BATAS DARATAN)
    // ==========================================
    steerToward(targetPos, desiredSpeed, dt, sprint = false) {
        const myPos = this.root.position;
        const toTarget = new THREE.Vector3().subVectors(targetPos, myPos).setY(0);
        const dist = toTarget.length();

        if (dist < 0.2) {
            this.targetSpeed = 0;
            return;
        }

        toTarget.normalize();

        // Repulsi tepi pulau daratan: arahkan kembali ke tengah jika mendekati tepi pantai/laut
        const mapHalf = (typeof groundSize !== 'undefined' ? groundSize : 80) / 2 - 3.0;
        const edgeMargin = 7.0;
        let edgePush = new THREE.Vector3();
        let nearEdge = false;

        if (myPos.x > mapHalf - edgeMargin) {
            edgePush.x -= (myPos.x - (mapHalf - edgeMargin)) / edgeMargin * 3.5;
            nearEdge = true;
        } else if (myPos.x < -mapHalf + edgeMargin) {
            edgePush.x += ((-mapHalf + edgeMargin) - myPos.x) / edgeMargin * 3.5;
            nearEdge = true;
        }

        if (myPos.z > mapHalf - edgeMargin) {
            edgePush.z -= (myPos.z - (mapHalf - edgeMargin)) / edgeMargin * 3.5;
            nearEdge = true;
        } else if (myPos.z < -mapHalf + edgeMargin) {
            edgePush.z += ((-mapHalf + edgeMargin) - myPos.z) / edgeMargin * 3.5;
            nearEdge = true;
        }

        let desiredDir = toTarget.clone();
        if (nearEdge) {
            desiredDir.add(edgePush);
        }

        // Hindari bebatuan & objek (Obstacle Avoidance):
        // Gunakan tangential defleksi ke kiri/kanan agar AI meluncur lancar memutari batu tanpa mandek!
        const obstacles = [];
        const rocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList)) ? rocksList : [];
        for (let i = 0; i < rocks.length; i++) {
            const rock = rocks[i];
            if (!rock || !rock.visible) continue;
            const rData = rock.userData || {};
            obstacles.push({
                x: rData.centerX !== undefined ? rData.centerX : rock.position.x,
                z: rData.centerZ !== undefined ? rData.centerZ : rock.position.z,
                radius: (rData.radiusMax || 1.8) * 1.25
            });
        }
        if (Array.isArray(window.importedObjectsList)) {
            for (let i = 0; i < window.importedObjectsList.length; i++) {
                const item = window.importedObjectsList[i];
                if (!item || !item.root || !item.root.visible || item.hasCollision === false) continue;
                obstacles.push({
                    x: item.root.position.x,
                    z: item.root.position.z,
                    radius: (item.collisionRadius || 1.4) * 1.25
                });
            }
        }

        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const toObsX = obs.x - myPos.x;
            const toObsZ = obs.z - myPos.z;
            const dObs = Math.hypot(toObsX, toObsZ);
            const avoidDist = obs.radius + 2.6;

            if (dObs < avoidDist && dObs > 0.1) {
                const dirObsX = toObsX / dObs;
                const dirObsZ = toObsZ / dObs;

                // Cek apakah obstacle berada di depan jalur gerakan kita
                const aheadDot = desiredDir.x * dirObsX + desiredDir.z * dirObsZ;
                if (aheadDot > -0.2) {
                    const factor = Math.max(0, 1.0 - (dObs / avoidDist));

                    // Tangen kiri (-dirObsZ, dirObsX) dan kanan (dirObsZ, -dirObsX)
                    const leftDot = desiredDir.x * (-dirObsZ) + desiredDir.z * dirObsX;
                    const rightDot = desiredDir.x * dirObsZ + desiredDir.z * (-dirObsX);

                    // Pilih tangen yang lebih searah dengan arah tujuan
                    const tangentX = (leftDot >= rightDot) ? -dirObsZ : dirObsZ;
                    const tangentZ = (leftDot >= rightDot) ? dirObsX : -dirObsX;

                    // Dorongan tangensial (meluncur melingkari sisi) + dorongan menjauh dari pusat
                    desiredDir.x += tangentX * factor * 3.2 + (myPos.x - obs.x) / dObs * factor * 0.8;
                    desiredDir.z += tangentZ * factor * 3.2 + (myPos.z - obs.z) / dObs * factor * 0.8;
                }
            }
        }

        desiredDir.setY(0).normalize();

        const targetRotY = (this.model && (this.model.mixer || this.model.isEnemy))
            ? Math.atan2(desiredDir.x, desiredDir.z)
            : Math.atan2(desiredDir.z, -desiredDir.x);
        let diff = (targetRotY - this.root.rotation.y) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;

        const maxTurn = this.turnRate * (sprint ? 1.4 : 1.1);
        const turnStep = THREE.MathUtils.clamp(diff * 7.5, -maxTurn, maxTurn);
        this.currentTurnRate = turnStep;
        this.root.rotation.y += turnStep * dt;

        // Berikan kecepatan maju yang baik saat berbelok melingkari batu, jangan sampai kecepatan drop ke 0
        const alignFactor = Math.max(0.25, Math.cos(diff));
        this.targetSpeed = desiredSpeed * (sprint ? Math.max(0.45, alignFactor) : alignFactor);
    }

    turnTowardAngle(targetRotY, dt) {
        let diff = (targetRotY - this.root.rotation.y) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (Math.abs(diff) > 0.02) {
            const maxTurn = this.turnRate * 1.2;
            const turnStep = THREE.MathUtils.clamp(diff * 4.5, -maxTurn, maxTurn);
            this.currentTurnRate = turnStep;
            this.root.rotation.y += turnStep * dt;
        } else {
            this.currentTurnRate = 0;
        }
    }

    // ==========================================
    // CORE AI BRAIN (SESUAI ATURAN PENGGUNA)
    // 1. Cari box item terdekat
    // 2. Cari player
    // 3. JIKA PLAYER DI LUAR RADIUS: JANGAN MENYERANG & JANGAN MENDEKAT!
    // 4. JIKA PLAYER DI DALAM RADIUS: SERANG DENGAN MENEMBAK!
    // ==========================================
    think(dt, elapsed) {
        if (this.isDead) {
            this.targetSpeed = 0;
            return;
        }

        // Jika player sudah dead, musuh berhenti menyerang dan kembali ke IDLE
        const isPlayerDead = Boolean(
            (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) ||
            (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.isDead)
        );
        if (isPlayerDead) {
            this.targetSpeed = 0;
            this.currentSpeed = 0;
            this.isPunching = false;
            if (this.model && typeof this.model.cancelPunch === 'function') {
                this.model.cancelPunch();
            }
            this.state = 'IDLE';
            return;
        }

        if (this.state === 'HIT_STUN') {
            this.hitStunTimer -= dt;
            this.targetSpeed = 0;
            if (this.hitStunTimer <= 0 && this.isGrounded) {
                this.state = this.equippedItem ? 'COMBAT_ENGAGE' : 'IDLE';
            }
            return;
        }

        // Posisi Player saat Play Mode
        const playerPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
            ? wolfCharacter.root.position
            : null;
        const distToPlayer = playerPos ? this.root.position.distanceTo(playerPos) : 999;
        const hasLOS = playerPos ? this.canSeePlayer(playerPos) : false;

        // Radius AI Enemy dinamis mengikuti posisi terkini AI (misal dari titik A bergerak ke titik B,
        // radius otomatis berpusat di titik B). AI tidak kembali ke titik awal spawn.
        const isPlayerInAggro = Boolean(playerPos && distToPlayer <= this.detectionRadius);

        // ==============================================================
        // KHUSUS ENEMY FOXTREE: PERILAKU MELEE COMBAT PUNCH (TIDAK PAKAI BAZOOKA)
        // ==============================================================
        if (this.model && (this.model.mixer || this.model.isEnemy)) {
            if (this.equippedItem) this.dropWeapon();

            // Sedang menerima pukulan/tendangan: diam di tempat (hit stun) sampai animasi hit selesai
            if (this.model.isTakingHit) {
                this.targetSpeed = 0;
                this.currentSpeed = 0;
                this.state = 'HIT_STUN';
                return;
            }

            if (!playerPos || !isPlayerInAggro) {
                this.targetSpeed = 0;
                this.isPunching = false;
                this._wasPunching = false;
                if (this.model && typeof this.model.cancelPunch === 'function') {
                    this.model.cancelPunch();
                }
                this.state = 'IDLE';
                return;
            }

            // FASE 1: FASE TEMPO / ISTIRAHAT & MUNDUR SEDIKIT SELAMA 2 DETIK
            // Terjadi setelah musuh melancarkan spam 3-5 serangan
            if (this.combatRestTimer > 0) {
                this.combatRestTimer -= dt;

                // Selalu hadapkan badan menghadap ke Player selama mundur
                const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                if (toPlayer.lengthSq() > 0.001) {
                    toPlayer.normalize();
                    const aimAngle = Math.atan2(toPlayer.x, toPlayer.z);
                    this.turnTowardAngle(aimAngle, dt);
                }

                // Mundur santai menjauhi player (hingga jarak aman ~2.3m)
                if (distToPlayer < 2.3) {
                    this.targetSpeed = -this.walkSpeed * 0.75; // Langkah mundur santai ~ -1.2 m/s
                } else {
                    this.targetSpeed = 0; // Berdiri siaga mengamati player
                }

                this.state = 'COMBAT_RETREAT';

                // Ketika waktu istirahat 2 detik habis: mulai burst serangan baru dengan random 3-5 pukulan!
                if (this.combatRestTimer <= 0) {
                    this.attacksCompletedInBurst = 0;
                    this.attackComboTarget = 3 + Math.floor(Math.random() * 3); // 3, 4, atau 5 serangan
                    this.betweenPunchDelay = 0.0;
                    this._wasPunching = false;
                }
                return;
            }

            // FASE 2: FASE SERANGAN DENGAN RITME 3-5 PUKULAN
            // Deteksi ketika pukulan yang sedang dieksekusi selesai
            const isCurrentlyPunching = Boolean(this.model && this.model.isPunching);
            if (this._wasPunching && !isCurrentlyPunching) {
                this.attacksCompletedInBurst++;
                this._wasPunching = false;
                this.betweenPunchDelay = 0.12 + Math.random() * 0.10; // Jeda mikro natural antar pukulan

                // Jika sudah mencapai batas ritme spam (3-5 serangan random):
                if (this.attacksCompletedInBurst >= this.attackComboTarget) {
                    this.combatRestTimer = 2.0; // Aktifkan fase mundur 2 detik
                    this.targetSpeed = -this.walkSpeed * 0.75;
                    this.state = 'COMBAT_RETREAT';
                    return;
                }
            }

            // Jeda mikro antar pukulan dalam 1 burst agar animasi memiliki ritme
            if (this.betweenPunchDelay > 0) {
                this.betweenPunchDelay -= dt;
                this.targetSpeed = 0;
                const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                if (toPlayer.lengthSq() > 0.001) {
                    toPlayer.normalize();
                    const aimAngle = Math.atan2(toPlayer.x, toPlayer.z);
                    this.turnTowardAngle(aimAngle, dt);
                }
                return;
            }

            // Jarak Presisi Kontak Pukulan Melee (Fist Contact Physical Range)
            // AI hanya boleh mulai memukul jika sudah benar-benar dekat (<= 1.25m) agar tangan menyentuh badan visual
            const PUNCH_RANGE = 1.25;

            // 1. JIKA SEDANG MELANCARKAN PUKULAN (ACTIVE PUNCH STATE):
            if (isCurrentlyPunching) {
                this.isPunching = true;
                this.state = 'COMBAT_PUNCH';

                // Hadapkan badan tepat ke arah Player secara presisi
                const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                if (toPlayer.lengthSq() > 0.001) {
                    toPlayer.normalize();
                    const aimAngle = Math.atan2(toPlayer.x, toPlayer.z);
                    this.turnTowardAngle(aimAngle, dt);
                }

                // STEP-IN TRACKING RAPAT:
                // Selama pukulan belum mendarat (wind-up), AI terus melangkah rapat mendekati tubuh Player
                // agar kepalan tangan 3D benar-benar MENYENTUH tubuh Player (bukan memukul angin di kejauhan).
                const strikeProcessed = Boolean(this.model && this.model.strikeProcessed);
                if (!strikeProcessed) {
                    if (distToPlayer > 0.95) {
                        // Jika player melangkah santai menjauh, susul dengan lunge maju rapat (~2.2 m/s)
                        this.targetSpeed = Math.min(this.walkSpeed * 1.35, 2.3);
                    } else {
                        // Jarak sudah sangat rapat menempel tubuh (~0.85m-0.95m), tahan agar tidak tembus
                        this.targetSpeed = 0;
                    }
                } else {
                    // Setelah kepalan mendarat di tubuh target, redam langkah saat menarik kembali tangan
                    this.targetSpeed = 0;
                }

                // Batalkan pukulan jika player kabur sangat jauh (> 4.5m)
                if (distToPlayer > 4.5 && typeof this.model.cancelPunch === 'function') {
                    this.model.cancelPunch();
                    this.isPunching = false;
                    this._wasPunching = false;
                }
                return;
            }

            // 2. JIKA SUDAH MENDEKATI BADAN PLAYER DALAM JARAK SENTUH FISIK (TRIGGER PUNCH):
            if (distToPlayer <= PUNCH_RANGE) {
                // Hadapkan badan tepat ke arah Player
                const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                if (toPlayer.lengthSq() > 0.001) {
                    toPlayer.normalize();
                    const aimAngle = Math.atan2(toPlayer.x, toPlayer.z);
                    this.turnTowardAngle(aimAngle, dt);
                }

                // Eksekusi animasi pukulan baru
                if (typeof this.model.triggerPunch === 'function') {
                    this.model.triggerPunch();
                    this._wasPunching = true;
                    this.isPunching = true;
                    // Lunge maju jika masih ada celah jarak
                    this.targetSpeed = (distToPlayer > 0.95) ? Math.min(this.walkSpeed * 1.35, 2.3) : 0;
                }
                this.state = 'COMBAT_PUNCH';
                return;
            }

            // 3. JIKA BERADA DI LUAR JARAK PUKUL: BERGERAK MENGEJAR PLAYER
            this.isPunching = false;
            this._wasPunching = false;

            // Update timer keputusan gaya pergerakan secara acak (walk & run)
            this.locomotionDecisionTimer -= dt;
            if (this.locomotionDecisionTimer <= 0) {
                // Ganti gaya pergerakan setiap 1.4 - 3.2 detik secara acak
                this.locomotionDecisionTimer = 1.4 + Math.random() * 1.8;
                // Jika sangat jauh (> 8m), condong lari; jika dekat/menengah (1.5 - 7m), acak 50:50 lari atau jalan santai
                const runChance = (distToPlayer > 8.0) ? 0.90 : 0.52;
                this.isPacingRun = Math.random() < runChance;
            }

            let chaseSpeed = this.isPacingRun ? this.sprintSpeed : this.walkSpeed;
            // Saat mendekat ke player (< 3.0m), pastikan kecepatan cukup untuk menyusul jalan santai player
            if (distToPlayer < 3.0 && chaseSpeed < 2.0) {
                chaseSpeed = Math.min(this.walkSpeed * 1.25, 2.1);
            }
            const isSprint = (chaseSpeed > 2.8) || (distToPlayer > 10.0);
            this.steerToward(playerPos, chaseSpeed, dt, isSprint);
            this.state = 'CHASE_PLAYER';
            return;
        }

        // Hanya AI ber-mode 'combat' yang aktif mencari senjata dan menyerang Player sebagai Enemy!
        const effectiveAIMode = this.aiMode || (this.fox && this.fox.aiMode) || 'combat';
        if (effectiveAIMode !== 'combat') {
            if (this.equippedItem) this.dropWeapon();

            if (effectiveAIMode === 'companion') {
                if (playerPos) {
                    if (distToPlayer > 12.0) {
                        this.steerToward(playerPos, this.sprintSpeed, dt, true);
                    } else if (distToPlayer > 4.5) {
                        this.steerToward(playerPos, this.walkSpeed, dt, false);
                    } else {
                        this.targetSpeed = 0;
                        const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                        if (toPlayer.lengthSq() > 0.01) {
                            toPlayer.normalize();
                            const targetRotY = Math.atan2(toPlayer.z, -toPlayer.x);
                            this.turnTowardAngle(targetRotY, dt);
                        }
                    }
                }
            } else if (effectiveAIMode === 'wander') {
                this.wanderTimer = (this.wanderTimer || 0) - dt;
                if (this.wanderTimer <= 0) {
                    this.wanderTimer = 3.0 + Math.random() * 4.0;
                    this.wanderMoving = Math.random() > 0.45;
                    this.wanderTargetRotY = Math.random() * Math.PI * 2;
                }
                if (this.wanderMoving) {
                    this.turnTowardAngle(this.wanderTargetRotY, dt);
                    this.targetSpeed = this.walkSpeed * 0.45;
                } else {
                    this.targetSpeed = 0;
                }
            } else {
                // 'passive' atau idle
                this.state = 'IDLE';
                this.targetSpeed = 0;
            }
            return;
        }

        // -------------------------------------------------------------
        // LANGKAH 1: BELUM PUNYA SENJATA -> LANGSUNG SPRINT CARI BOX (AKTIF / RESPAWN) TANPA JEDA!
        // -------------------------------------------------------------
        if (!this.equippedItem || this.ammo <= 0) {
            // PRIORITAS 1 TANPA HENTI: Cari box aktif terdekat, ATAU titik spawn box yang sedang respawn!
            const targetBox = this.findClosestItemBox() || this.findBestRespawningBox();

            if (targetBox) {
                this.state = 'SEEK_BOX';
                const boxPos = new THREE.Vector3(targetBox.baseX, this.root.position.y, targetBox.baseZ);
                const distToBox = Math.hypot(boxPos.x - this.root.position.x, boxPos.z - this.root.position.z);

                if (distToBox > 1.2) {
                    // SPRINT MAKSIMAL MENUJU TITIK BOX! Tidak boleh ada jeda atau terdiam sedetik pun!
                    this.steerToward(boxPos, this.sprintSpeed, dt, true);
                } else {
                    // Sudah tiba di atas titik box:
                    if (targetBox.isActive) {
                        this.steerToward(boxPos, this.walkSpeed, dt, false);
                    } else {
                        // Box masih hitungan detik: siaga aktif tepat di titik spawn agar langsung tersambar saat muncul!
                        this.patrolAngle = (this.patrolAngle || 0) + dt * 3.5;
                        const campTarget = new THREE.Vector3(
                            boxPos.x + Math.cos(this.patrolAngle) * 0.75,
                            this.root.position.y,
                            boxPos.z + Math.sin(this.patrolAngle) * 0.75
                        );
                        this.steerToward(campTarget, this.walkSpeed * 0.9, dt, false);
                    }
                }
                return;
            }

            // HANYA JIKA TIDAK ADA BOX SAMA SEKALI DI SELURUH MAP:
            if (playerPos && isPlayerInAggro) {
                this.state = 'TACTICAL_RETREAT';
                const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
                const awayDir = toPlayer.clone().negate().normalize();
                const retreatTarget = this.root.position.clone().addScaledVector(awayDir, 8.0);
                this.steerToward(retreatTarget, this.sprintSpeed, dt, true);
                return;
            } else {
                this.state = 'IDLE';
                this.targetSpeed = 0;
                return;
            }
        }

        // -------------------------------------------------------------
        // LANGKAH 2 & 3: SUDAH PUNYA SENJATA -> KUNCI PLAYER & TEMBAK HANYA DI DALAM RADIUS!
        // -------------------------------------------------------------
        if (this.equippedItem === 'plasma' && this.ammo > 0) {
            // Sesuai permintaan pengguna:
            // "pastikan radius tidak berhenti di satu titik, radius ai enemy harus mengikuti setiap pergerakan ai nya...
            // biar ai tidak kembali kembali ke titik awalnya"
            if (!isPlayerInAggro) {
                // Player di luar radius: JANGAN tembak, JANGAN dekati player, dan tetap di posisi sekarang
                this.state = 'IDLE';
                this.targetSpeed = 0;
                return;
            }

            // DI DALAM RADIUS DETEKSI: AKTIF MENGUNCI BIDIKAN, MENDEKATI KE JARAK TEMBAK, & MENEMBAK!
            this.shootCooldown -= dt;

            const toPlayer = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0);
            const dist = toPlayer.length();

            const OPTIMAL_MIN_DIST = 8.0;
            const OPTIMAL_MAX_DIST = 16.0;

            if (!hasLOS) {
                // =========================================================
                // PLAYER DI BALIK BATU / OBJEK: AI KELILING MENCARI CARA MENDEKAT
                // Sesuai permintaan pengguna:
                // "improve : saat saya dibelakang batu, jika radius enemy masih menjangkau, maka buat enemy keliling mencari cara untuk mendekat"
                // =========================================================
                this.state = 'COMBAT_FLANK';

                const obstacle = this.getBlockingObstacle(playerPos);
                if (obstacle) {
                    const clearDist = obstacle.radius + 2.5;
                    const obsPos = new THREE.Vector3(obstacle.x, this.root.position.y, obstacle.z);
                    const toObs = new THREE.Vector3().subVectors(obsPos, this.root.position).setY(0);
                    const toPlayerFromObs = new THREE.Vector3().subVectors(playerPos, obsPos).setY(0).normalize();

                    // Tangen di kedua sisi batu (Kiri & Kanan)
                    const tangentL = new THREE.Vector3(-toObs.z, 0, toObs.x).normalize();
                    const tangentR = new THREE.Vector3(toObs.z, 0, -toObs.x).normalize();

                    // Waypoint melingkar di sisi kiri dan kanan, ditarik condong ke arah player di balik batu
                    const pullFactor = Math.min(dist * 0.35, Math.max(1.8, obstacle.radius * 0.75));
                    const wpLeft = obsPos.clone().addScaledVector(tangentL, clearDist).addScaledVector(toPlayerFromObs, pullFactor);
                    const wpRight = obsPos.clone().addScaledVector(tangentR, clearDist).addScaledVector(toPlayerFromObs, pullFactor);

                    // Periksa batas aman pulau daratan
                    const mapBoundary = (typeof groundSize !== 'undefined' ? groundSize : 80) / 2 - 4.0;
                    const isLeftSafe = Math.abs(wpLeft.x) < mapBoundary && Math.abs(wpLeft.z) < mapBoundary;
                    const isRightSafe = Math.abs(wpRight.x) < mapBoundary && Math.abs(wpRight.z) < mapBoundary;

                    // Tentukan arah flanking (komit ke satu sisi selama flankTimer agar gerakan mulus & tidak bergetar)
                    this.flankTimer = (this.flankTimer || 0) - dt;
                    if (this.flankTimer <= 0 || !this.currentFlankSide) {
                        const dL = this.root.position.distanceTo(wpLeft);
                        const dR = this.root.position.distanceTo(wpRight);

                        if (isLeftSafe && !isRightSafe) {
                            this.currentFlankSide = 'left';
                        } else if (!isLeftSafe && isRightSafe) {
                            this.currentFlankSide = 'right';
                        } else {
                            this.currentFlankSide = (dL <= dR) ? 'left' : 'right';
                        }
                        this.flankTimer = 2.2 + Math.random() * 0.5;
                    }

                    const targetWp = (this.currentFlankSide === 'left') ? wpLeft : wpRight;

                    // Lari cepat melingkari batu menuju waypoint (sprint flank)
                    this.steerToward(targetWp, this.sprintSpeed * 0.95, dt, true);
                } else {
                    // Fallback jika tidak ada objek spesifik terdeteksi: jalan mendekati player
                    this.steerToward(playerPos, this.walkSpeed * 1.25, dt, false);
                }
            } else {
                // PANDANGAN BERSIH (LOS TERBUKA): AI MENGUNCI BIDIKAN & MENEMBAK!
                this.flankTimer = 0;
                this.currentFlankSide = null;
                this.state = 'COMBAT_ENGAGE';

                // Arahkan badan & moncong senjata tepat ke arah Player
                const aimAngle = Math.atan2(toPlayer.z, -toPlayer.x);
                let aimDiff = (aimAngle - this.root.rotation.y) % (Math.PI * 2);
                if (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
                if (aimDiff > Math.PI) aimDiff -= Math.PI * 2;

                this.root.rotation.y += THREE.MathUtils.clamp(aimDiff * 8.5, -this.turnRate * 1.5, this.turnRate * 1.5) * dt;

                if (dist > OPTIMAL_MAX_DIST) {
                    // Terlalu jauh: lari mendekat ke Player (hanya saat player di dalam radius)
                    this.targetSpeed = (dist > OPTIMAL_MAX_DIST + 4.0) ? this.sprintSpeed : this.walkSpeed;
                } else if (dist < OPTIMAL_MIN_DIST) {
                    // Terlalu dekat: mundur sedikit sambil tetap membidik
                    this.targetSpeed = -this.walkSpeed * 0.6;
                } else {
                    // Jarak ideal tembak (8m - 16m): berhenti dan kunci bidikan
                    this.targetSpeed = 0;
                }

                // Tembak peluru jika sudah menghadap Player, terlihat jelas (LOS), dalam jarak tembak, dan cooldown siap!
                if (dist <= this.detectionRadius && Math.abs(aimDiff) < 0.35 && this.shootCooldown <= 0) {
                    const playerSpeed = window.currentFoxSpeed || 0;
                    const isPlayerDodging = Math.abs(playerSpeed) > 6.0;
                    this.firePlasmaMissile(playerPos, isPlayerDodging);
                    if (this.ammo > 0) {
                        this.shootCooldown = 1.4 + Math.random() * 0.6;
                    } else {
                        this.shootCooldown = 0;
                    }
                }
            }
            return;
        }

        this.state = 'IDLE';
        this.targetSpeed = 0;
    }

    firePlasmaMissile(targetPos, isTargetDodging = false) {
        if (!window.plasmaWeaponInstance || !this.root) return;

        // Pastikan matrixWorld model rubah dan senjatanya sudah diperbarui sebelum menghitung posisi moncong di dunia 3D
        this.root.updateMatrixWorld(true);

        const muzzlePos = new THREE.Vector3();
        let validMuzzle = false;
        if (this.muzzleCore && typeof this.muzzleCore.getWorldPosition === 'function') {
            this.muzzleCore.getWorldPosition(muzzlePos);
            // Validasi: Moncong harus berada dalam jangkauan rubah (< 2.2m) dan tidak di (0,0,0) kecuali jika rubahnya memang di (0,0,0)
            if (muzzlePos.distanceTo(this.root.position) < 2.2 && (muzzlePos.lengthSq() > 0.05 || this.root.position.lengthSq() < 0.05)) {
                validMuzzle = true;
            }
        }

        if (!validMuzzle) {
            const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y);
            muzzlePos.copy(this.root.position).add(new THREE.Vector3(0, 0.75, 0)).addScaledVector(fwd, 0.6);
        }

        // Pastikan posisi moncong berada aman di atas permukaan tanah
        if (typeof getTerrainHeightFast === 'function') {
            const groundY = getTerrainHeightFast(muzzlePos.x, muzzlePos.z);
            muzzlePos.y = Math.max(muzzlePos.y, groundY + 0.65);
        }

        let aimTarget = targetPos.clone().add(new THREE.Vector3(0, 0.65, 0));
        if (isTargetDodging) {
            aimTarget.x += (Math.random() - 0.5) * 1.4;
            aimTarget.z += (Math.random() - 0.5) * 1.4;
        }

        const forwardDir = new THREE.Vector3().subVectors(aimTarget, muzzlePos).normalize();

        window.plasmaWeaponInstance.launchMissileFromSource(
            muzzlePos,
            forwardDir,
            this,
            'player'
        );

        if (this.muzzleCore) {
            this.muzzleCore.scale.setScalar(2.2);
            setTimeout(() => {
                if (this.muzzleCore) this.muzzleCore.scale.setScalar(1.0);
            }, 100);
        }

        this.ammo--;
        if (this.ammo <= 0) {
            this.dropWeapon();
            // Spontan detik ini juga langsung putar dan sprint menuju box (aktif/respawn) tanpa jeda!
            const targetBox = this.findClosestItemBox() || this.findBestRespawningBox();
            if (targetBox) {
                const boxPos = new THREE.Vector3(targetBox.baseX, this.root.position.y, targetBox.baseZ);
                this.steerToward(boxPos, this.sprintSpeed, 0.016, true);
            } else {
                this.targetSpeed = this.sprintSpeed;
            }
        }
    }

    // ==========================================
    // PHYSICAL INTEGRATION (HANYA PLAY MODE)
    // ==========================================
    update(dt, elapsed) {
        // HANYA BERGERAK & BERPIKIR SAAT PLAY MODE AKTIF!
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);
        if (!inPlay || !this.root || !this.root.visible) {
            this.currentSpeed = 0;
            this.targetSpeed = 0;
            if (this.ringGroup) this.ringGroup.visible = false;
            return;
        }

        if (this.isDead) {
            this.currentSpeed = 0;
            this.targetSpeed = 0;
            this.velocityY = 0;
            if (this.ringGroup) this.ringGroup.visible = false;
            const groundH = (typeof getTerrainHeightFast === 'function')
                ? getTerrainHeightFast(this.root.position.x, this.root.position.z)
                : 0;
            this.root.position.y = groundH;

            // Fade out material secara bertahap sampai transparan lalu sembunyikan root
            if (this.isFadingOut) {
                this.fadeTimer += dt;
                const alpha = Math.max(0, 1.0 - (this.fadeTimer / this.fadeDuration));
                this.root.traverse(child => {
                    if (child.isMesh && child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            m.transparent = true;
                            m.opacity = alpha;
                        });
                    }
                });

                if (this.fadeTimer >= this.fadeDuration) {
                    this.isFadingOut = false;
                    this.root.visible = false; // Menghilang sepenuhnya dari scene
                }
            }

            if (this.model && typeof this.model.updateAnimation === 'function') {
                this.model.updateAnimation(dt, 0);
            } else if (this.model && this.model.mixer) {
                this.model.mixer.update(dt);
            }
            return;
        }

        this.think(dt, elapsed);

        // Knockback impuls
        if (this.knockbackVel.lengthSq() > 0.001) {
            this.root.position.x += this.knockbackVel.x * dt;
            this.root.position.z += this.knockbackVel.z * dt;
            this.knockbackVel.multiplyScalar(Math.exp(-5.5 * dt));
        }

        // Kecepatan
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.targetSpeed, 7.5 * dt);

        if (Math.abs(this.currentSpeed) > 0.01) {
            const forward = this.getForwardVector();
            this.root.position.add(forward.multiplyScalar(this.currentSpeed * dt));
        }

        // Batas aman daratan pulau
        const mapHalf = (typeof groundSize !== 'undefined' ? groundSize : 80) / 2 - 2.5;
        this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, -mapHalf, mapHalf);
        this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, -mapHalf, mapHalf);

        // Ketinggian Terrain
        const groundH = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(this.root.position.x, this.root.position.z)
            : 0;

        // Tabrakan fisik bebatuan: Dorong AI keluar secara horizontal agar tidak menembus atau naik ke atas batu
        const rocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList)) ? rocksList : [];
        for (let i = 0; i < rocks.length; i++) {
            const rock = rocks[i];
            if (!rock || !rock.visible) continue;
            const rData = rock.userData || {};
            const rx = rData.centerX !== undefined ? rData.centerX : rock.position.x;
            const rz = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
            const rRad = (rData.radiusMax || 1.8) * 1.15;
            const dx = this.root.position.x - rx;
            const dz = this.root.position.z - rz;
            const distSq = dx * dx + dz * dz;
            if (distSq < rRad * rRad && distSq > 0.0001) {
                const d = Math.sqrt(distSq);
                const pushDist = rRad - d;
                this.root.position.x += (dx / d) * pushDist;
                this.root.position.z += (dz / d) * pushDist;
            }
        }

        // Tabrakan fisik antar sesama AI Enemy (Anti-Tembus & Anti-Tumpuk)
        if (Array.isArray(window.spawnedFoxesList) && window.spawnedFoxesList.length > 1) {
            const minEnemyDist = 0.95;
            const myPos = this.root.position;
            for (let i = 0; i < window.spawnedFoxesList.length; i++) {
                const other = window.spawnedFoxesList[i];
                if (!other || !other.root || other.root === this.root || !other.root.visible) continue;
                const oPos = other.root.position;
                const dx = myPos.x - oPos.x;
                const dz = myPos.z - oPos.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < minEnemyDist * minEnemyDist && distSq > 0.0001) {
                    const d = Math.sqrt(distSq);
                    const push = (minEnemyDist - d) * 0.5;
                    myPos.x += (dx / d) * push;
                    myPos.z += (dz / d) * push;
                    oPos.x -= (dx / d) * push;
                    oPos.z -= (dz / d) * push;
                }
            }
        }

        // Tabrakan fisik AI Enemy terhadap Player (Anti-Tembus saat mendekat/memukul)
        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            const pPos = wolfCharacter.root.position;
            const myPos = this.root.position;
            const minPlayerDist = 0.85;
            const dx = myPos.x - pPos.x;
            const dz = myPos.z - pPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minPlayerDist * minPlayerDist && distSq > 0.0001) {
                const d = Math.sqrt(distSq);
                const push = (minPlayerDist - d);
                myPos.x += (dx / d) * (push * 0.5);
                myPos.z += (dz / d) * (push * 0.5);
                pPos.x -= (dx / d) * (push * 0.5);
                pPos.z -= (dz / d) * (push * 0.5);
            }
        }

        const effectiveH = groundH;
        this.root.position.y += this.velocityY * dt;

        if (this.root.position.y <= effectiveH) {
            if (!this.isGrounded && this.velocityY < -2.5) {
                this.landingSquash = 0.10;
            }
            this.root.position.y = effectiveH;
            this.velocityY = 0;
            this.isGrounded = true;
        } else {
            this.velocityY -= 22.0 * dt;
            this.isGrounded = false;
        }

        this.landingSquash = THREE.MathUtils.lerp(this.landingSquash, 0, 8.0 * dt);

        // Update visual radius ring di Play Mode
        const playerPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
            ? wolfCharacter.root.position
            : null;
        const distToPlayer = playerPos ? this.root.position.distanceTo(playerPos) : 999;
        this.updateDetectionRing(elapsed, distToPlayer <= this.detectionRadius, effectiveH);

        // Animasi Model: Gunakan AnimationMixer jika FBX Enemy, atau Procedural Bone jika legacy
        if (this.model && typeof this.model.updateAnimation === 'function') {
            this.model.updateAnimation(dt, this.currentSpeed);
        } else {
            this.animateBones(dt, elapsed);
        }
    }

    animateBones(dt, elapsed) {
        if (!this.model || !this.model.bodyTiltGroup) return;

        const {
            bodyTiltGroup,
            neckJoint,
            headJoint,
            tailBaseJoint,
            tailMidJoint,
            tailTipJoint,
            legFL,
            legFR,
            legBL,
            legBR,
            BASE_HIP_Y
        } = this.model;

        const baseHipY = typeof BASE_HIP_Y === 'number' ? BASE_HIP_Y : 1.66;
        const speedRatio = Math.abs(this.currentSpeed) / this.walkSpeed;
        const isMoving = speedRatio > 0.08;
        const isHunting = this.currentSpeed > 6.0;

        if (!isMoving && this.state !== 'HIT_STUN') {
            const breath = Math.sin(elapsed * 2.2 + this.animOffset) * 0.012;
            bodyTiltGroup.position.y = baseHipY + Math.max(0, breath) - Math.min(0.03, this.landingSquash * 0.2);
            bodyTiltGroup.rotation.set(0, 0, 0);

            // Head look-at player jika dalam jarak pantau (hanya putar YAW tanpa memiringkan kepala!)
            const playerPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
                ? wolfCharacter.root.position
                : null;
            const distToPlayer = playerPos ? this.root.position.distanceTo(playerPos) : 999;

            let targetNeckYaw = 0;
            let targetHeadYaw = 0;

            const inAggro = playerPos && (distToPlayer <= this.detectionRadius);

            if (inAggro && (this.state === 'COMBAT_ENGAGE' || this.equippedItem)) {
                const toP = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0).normalize();
                const aimAngle = Math.atan2(toP.z, -toP.x);
                let aDiff = (aimAngle - this.root.rotation.y) % (Math.PI * 2);
                if (aDiff < -Math.PI) aDiff += Math.PI * 2;
                if (aDiff > Math.PI) aDiff -= Math.PI * 2;
                const headLook = THREE.MathUtils.clamp(aDiff * 0.7, -0.65, 0.65);
                targetNeckYaw = headLook * 0.45;
                targetHeadYaw = headLook * 0.55;
            } else {
                targetNeckYaw = Math.sin(elapsed * 0.9 + this.animOffset) * 0.06;
                targetHeadYaw = targetNeckYaw * 0.8;
            }

            neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, 8.0 * dt);
            headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, 8.0 * dt);
            neckJoint.rotation.x = 0;
            neckJoint.rotation.z = 0;
            headJoint.rotation.x = 0;
            headJoint.rotation.z = 0;

            legFL.hip.rotation.set(0, 0, 0);
            legFL.knee.rotation.set(0, 0, 0);
            legFL.paw.rotation.set(0, 0, 0);

            legFR.hip.rotation.set(0, 0, 0);
            legFR.knee.rotation.set(0, 0, 0);
            legFR.paw.rotation.set(0, 0, 0);

            legBL.hip.rotation.set(0, 0, 0);
            legBL.knee.rotation.set(0, 0, 0);
            legBL.paw.rotation.set(0, 0, 0);

            legBR.hip.rotation.set(0, 0, 0);
            legBR.knee.rotation.set(0, 0, 0);
            legBR.paw.rotation.set(0, 0, 0);

            const tailWave = Math.sin(elapsed * 1.6 + this.animOffset) * 0.08;
            tailBaseJoint.rotation.y = tailWave;
            tailMidJoint.rotation.y = tailWave * 1.3;
            tailTipJoint.rotation.y = tailWave * 1.7;
        } else if (this.state === 'HIT_STUN') {
            bodyTiltGroup.rotation.z = -0.35;
            bodyTiltGroup.rotation.x = 0;
            neckJoint.rotation.z = 0.25;
            headJoint.rotation.z = 0.15;
            neckJoint.rotation.x = 0;
            headJoint.rotation.x = 0;
        } else {
            const isHunting = Math.abs(this.currentSpeed) > (this.walkSpeed + 0.8);
            const freq = 9.2 + Math.abs(this.currentSpeed) * 0.95;
            this.gaitPhase += dt * freq;

            const bounce = Math.abs(Math.sin(this.gaitPhase)) * (isHunting ? 0.045 : 0.025);
            bodyTiltGroup.position.y = baseHipY + bounce - Math.min(0.03, this.landingSquash * 0.2);

            bodyTiltGroup.rotation.x = 0;
            bodyTiltGroup.rotation.z = isHunting ? 0.05 : 0.0;

            const swingAmp = isHunting ? 0.72 : 0.50;
            const swingL = Math.sin(this.gaitPhase) * swingAmp;
            const swingR = Math.sin(this.gaitPhase + Math.PI) * swingAmp;

            legFL.hip.rotation.z = swingL;
            legFL.knee.rotation.z = -Math.max(0, -swingL * 0.75);

            legFR.hip.rotation.z = swingR;
            legFR.knee.rotation.z = -Math.max(0, -swingR * 0.75);

            legBL.hip.rotation.z = swingR * 0.80;
            legBL.knee.rotation.z = Math.max(0, swingR * 0.85);

            legBR.hip.rotation.z = swingL * 0.80;
            legBR.knee.rotation.z = Math.max(0, swingL * 0.85);

            tailBaseJoint.rotation.y = -Math.sin(this.gaitPhase) * 0.15;
            tailBaseJoint.rotation.z = isHunting ? 0.28 : 0.05;

            const playerPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
                ? wolfCharacter.root.position
                : null;
            const distToPlayer = playerPos ? this.root.position.distanceTo(playerPos) : 999;

            let targetNeckYaw = 0;
            let targetHeadYaw = 0;

            const inAggro = playerPos && (distToPlayer <= this.detectionRadius);

            if (inAggro && this.state === 'COMBAT_ENGAGE') {
                const toP = new THREE.Vector3().subVectors(playerPos, this.root.position).setY(0).normalize();
                const aimAngle = Math.atan2(toP.z, -toP.x);
                let aDiff = (aimAngle - this.root.rotation.y) % (Math.PI * 2);
                if (aDiff < -Math.PI) aDiff += Math.PI * 2;
                if (aDiff > Math.PI) aDiff -= Math.PI * 2;
                const headLook = THREE.MathUtils.clamp(aDiff * 0.7, -0.65, 0.65);
                targetNeckYaw = headLook * 0.45;
                targetHeadYaw = headLook * 0.55;
            } else {
                targetNeckYaw = this.currentTurnRate * 0.12;
                targetHeadYaw = this.currentTurnRate * 0.16;
            }

            neckJoint.rotation.y = THREE.MathUtils.lerp(neckJoint.rotation.y, targetNeckYaw, 8.0 * dt);
            headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, targetHeadYaw, 8.0 * dt);
            neckJoint.rotation.x = 0;
            neckJoint.rotation.z = 0;
            headJoint.rotation.x = 0;
            headJoint.rotation.z = 0;
        }
    }

    reset() {
        if (this.root && this.spawnOrigin) {
            this.root.position.copy(this.spawnOrigin);
            this.root.rotation.y = this.spawnRotationY;
            this.root.visible = true; // Spawn kembali saat demo mode dimulai lagi

            // Kembalikan opacity material ke 100% dan matikan status transparansi
            this.root.traverse(child => {
                if (child.isMesh && child.material) {
                    child.userData.hasUniqueFadeMat = false;
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => {
                        m.transparent = false;
                        m.opacity = 1.0;
                    });
                }
            });
        }
        this.currentSpeed = 0;
        this.targetSpeed = 0;
        this.dropWeapon();
        this.health = this.maxHealth;
        if (this.fox) this.fox.health = this.maxHealth;
        this.isDead = false;
        this.isFadingOut = false;
        this.fadeTimer = 0.0;
        this.state = 'IDLE';
        if (this.ringGroup) this.ringGroup.visible = false;

        // Hidupkan kembali animasi idle jika ini enemy model Mixamo
        if (this.model && typeof this.model.triggerRevive === 'function') {
            this.model.triggerRevive();
        } else if (this.model && this.fox && typeof applyFoxPose === 'function') {
            applyFoxPose(this.model, this.fox.pose || 'idle', 0);
        }
    }

    dispose() {
        if (this.ringGroup) {
            if (this.ringGroup.parent) {
                this.ringGroup.parent.remove(this.ringGroup);
            } else if (typeof scene !== 'undefined' && scene) {
                scene.remove(this.ringGroup);
            }
            if (this.ringBorderMesh && this.ringBorderMesh.geometry) this.ringBorderMesh.geometry.dispose();
            if (this.ringDiscMesh && this.ringDiscMesh.geometry) this.ringDiscMesh.geometry.dispose();
            if (this.ringBorderMat) this.ringBorderMat.dispose();
            if (this.ringDiscMat) this.ringDiscMat.dispose();
            this.ringGroup = null;
        }
    }
}

// ===================================================================
// FOX AI MANAGER & AUTO-LOCK CONTROLLER
// ===================================================================
class FoxAIManagerClass {
    constructor() {
        this.agents = [];
        this.crosshairContainer = null;
        this.targetBox = null;
        this.lockDistBadge = null;
        this.lockHealthFill = null;
        this.lockTargetName = null;
        this.playerWarningBanner = null;
        this.playerLockedTarget = null;
    }

    init() {
        this.cacheDOMElements();
        this.syncSpawnedFoxes();
    }

    cacheDOMElements() {
        this.crosshairContainer = document.getElementById('plasma-crosshair-container');
        this.targetBox = document.getElementById('plasma-target-box');
        this.lockDistBadge = document.getElementById('lock-dist');
        this.lockHealthFill = document.getElementById('lock-health-fill');
        this.lockTargetName = document.getElementById('lock-target-name');
        this.playerWarningBanner = document.getElementById('player-incoming-warning');
    }

    getBlockingObstacle(posA, posB) {
        const rayDir = new THREE.Vector3().subVectors(posB, posA);
        const rayDist = rayDir.length();
        if (rayDist < 0.5) return null;
        const normRayDir = rayDir.clone().normalize();
        const normRayDirHoriz = new THREE.Vector3(normRayDir.x, 0, normRayDir.z).normalize();

        let closest = null;
        let minProj = Infinity;

        // 1. Cek bebatuan (rocksList)
        const rocks = (typeof rocksList !== 'undefined' && Array.isArray(rocksList)) ? rocksList : [];
        for (let i = 0; i < rocks.length; i++) {
            const rock = rocks[i];
            if (!rock || !rock.visible) continue;

            const rData = rock.userData || {};
            const rx = rData.centerX !== undefined ? rData.centerX : rock.position.x;
            const rz = rData.centerZ !== undefined ? rData.centerZ : rock.position.z;
            const rad = (rData.radiusMax || 1.8) * 0.98;
            const topY = rData.topY !== undefined ? rData.topY : rock.position.y + 1.4;
            const botY = rData.bottomY !== undefined ? rData.bottomY : rock.position.y - 1.0;

            const toRock = new THREE.Vector3(rx - posA.x, 0, rz - posA.z);
            const proj = toRock.dot(normRayDirHoriz);

            if (proj > 0.6 && proj < rayDist - 0.6) {
                const perpDistSq = toRock.lengthSq() - (proj * proj);
                if (perpDistSq < rad * rad) {
                    const tRay = proj / rayDist;
                    const rayY = posA.y + (posB.y - posA.y) * tRay;
                    if (rayY >= botY && rayY <= topY + 0.3) {
                        if (proj < minProj) {
                            minProj = proj;
                            closest = {
                                type: 'rock',
                                x: rx,
                                z: rz,
                                y: rock.position.y,
                                radius: rData.radiusMax || 1.8,
                                proj: proj,
                                object: rock
                            };
                        }
                    }
                }
            }
        }

        // 2. Cek objek 3D impor (window.importedObjectsList)
        if (Array.isArray(window.importedObjectsList)) {
            for (let i = 0; i < window.importedObjectsList.length; i++) {
                const item = window.importedObjectsList[i];
                if (!item || !item.root || !item.root.visible || item.hasCollision === false) continue;
                const rootPos = item.root.position;
                const rad = (item.collisionRadius || 1.4) * 0.98;
                const colHeight = item.collisionHeight || 2.5;

                const toObj = new THREE.Vector3(rootPos.x - posA.x, 0, rootPos.z - posA.z);
                const proj = toObj.dot(normRayDirHoriz);

                if (proj > 0.6 && proj < rayDist - 0.6) {
                    const perpDistSq = toObj.lengthSq() - (proj * proj);
                    if (perpDistSq < rad * rad) {
                        const tRay = proj / rayDist;
                        const rayY = posA.y + (posB.y - posA.y) * tRay;
                        if (rayY >= rootPos.y - 0.2 && rayY <= rootPos.y + colHeight + 0.3) {
                            if (proj < minProj) {
                                minProj = proj;
                                closest = {
                                    type: 'imported',
                                    x: rootPos.x,
                                    z: rootPos.z,
                                    y: rootPos.y,
                                    radius: item.collisionRadius || 1.4,
                                    proj: proj,
                                    object: item
                                };
                            }
                        }
                    }
                }
            }
        }

        // 3. Cek pepohonan (treesList)
        const trees = (typeof treesList !== 'undefined' && Array.isArray(treesList))
            ? treesList
            : (Array.isArray(window.treesList) ? window.treesList : []);
        for (let i = 0; i < trees.length; i++) {
            const tree = trees[i];
            if (!tree || !tree.visible) continue;

            const toTree = new THREE.Vector3(tree.position.x - posA.x, 0, tree.position.z - posA.z);
            const proj = toTree.dot(normRayDirHoriz);

            if (proj > 0.6 && proj < rayDist - 0.6) {
                const perpDistSq = toTree.lengthSq() - (proj * proj);
                if (perpDistSq < 0.65 * 0.65) {
                    const tRay = proj / rayDist;
                    const rayY = posA.y + (posB.y - posA.y) * tRay;
                    if (rayY >= tree.position.y && rayY <= tree.position.y + 4.5) {
                        if (proj < minProj) {
                            minProj = proj;
                            closest = {
                                type: 'tree',
                                x: tree.position.x,
                                z: tree.position.z,
                                y: tree.position.y,
                                radius: 0.8,
                                proj: proj,
                                object: tree
                            };
                        }
                    }
                }
            }
        }

        return closest;
    }

    checkLineOfSight(posA, posB) {
        return this.getBlockingObstacle(posA, posB) === null;
    }

    getAgent(foxOrModel) {
        if (!foxOrModel) return null;
        return this.agents.find(a => a.fox === foxOrModel || a.model === foxOrModel || a.root === foxOrModel);
    }

    syncSpawnedFoxes() {
        if (typeof spawnedFoxesList === 'undefined' || !Array.isArray(spawnedFoxesList)) return;
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);

        for (let i = 0; i < spawnedFoxesList.length; i++) {
            const fox = spawnedFoxesList[i];
            if (!fox) continue;
            let agent = this.agents.find(a => a.fox === fox);
            if (!agent) {
                agent = new FoxAIAgent(fox);
                this.agents.push(agent);
                fox.ai = agent;
            } else {
                if (fox.aiMode !== undefined) agent.aiMode = fox.aiMode;
                if (fox.isBoss !== undefined) agent.isBoss = fox.isBoss;
                if (fox.name !== undefined) agent.name = fox.name;
                if (fox.maxHealth !== undefined) agent.maxHealth = fox.maxHealth;
                if (!inPlay && fox.health !== undefined) agent.health = fox.health;

                if (fox.detectionRadius !== undefined && fox.detectionRadius !== agent.detectionRadius) {
                    agent.setDetectionRadius(fox.detectionRadius);
                }
                if (!inPlay && agent.root) {
                    agent.spawnOrigin.copy(agent.root.position);
                    agent.spawnRotationY = agent.root.rotation.y;
                }
            }
        }

        for (let i = this.agents.length - 1; i >= 0; i--) {
            const agent = this.agents[i];
            if (!spawnedFoxesList.includes(agent.fox)) {
                if (typeof agent.dispose === 'function') agent.dispose();
                this.agents.splice(i, 1);
            }
        }
    }

    resetAll() {
        for (let i = 0; i < this.agents.length; i++) {
            if (this.agents[i]) this.agents[i].reset();
        }
    }

    checkItemBoxCollisions(itemBoxManager) {
        if (!itemBoxManager || !itemBoxManager.boxes) return;
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);
        if (!inPlay) return;

        for (let a = 0; a < this.agents.length; a++) {
            const agent = this.agents[a];
            if (!agent || agent.isDead || !agent.root.visible) continue;
            // Hanya AI ber-mode 'combat' yang boleh mengambil dan melengkapi senjata bazooka
            const mode = agent.aiMode || (agent.fox && agent.fox.aiMode) || 'combat';
            if (mode !== 'combat') continue;

            const aPos = agent.root.position;

            for (let b = 0; b < itemBoxManager.boxes.length; b++) {
                const box = itemBoxManager.boxes[b];
                if (!box || !box.isActive) continue;

                const dx = aPos.x - box.baseX;
                const dz = aPos.z - box.baseZ;
                const distSq = dx * dx + dz * dz;

                if (distSq < itemBoxManager.pickupRadius * itemBoxManager.pickupRadius) {
                    itemBoxManager.collectBox(box, agent);
                }
            }
        }
    }

    applyExplosionKnockback(pos, blastRadius) {
        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            if (!agent || !agent.root || !agent.root.visible || agent.isDead) continue;

            const aPos = agent.root.position;
            const dist = aPos.distanceTo(pos);
            if (dist < blastRadius) {
                const factor = Math.max(0.1, 1.0 - (dist / blastRadius));
                const dir = new THREE.Vector3().subVectors(aPos, pos);
                dir.y = 0;
                if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
                dir.normalize();

                const impulseH = factor * 9.0;
                const impulseV = factor * 1.8 + 0.5;

                agent.takeDamage(factor * 40);
                agent.applyKnockback(dir.multiplyScalar(impulseH), impulseV);
            }
        }
    }

    updateAutoLockCrosshair(dt) {
        if (!this.crosshairContainer) this.cacheDOMElements();

        const hasPlasma = (typeof ItemSystem !== 'undefined' && ItemSystem.equippedItem === 'plasma' && ItemSystem.ammo > 0);
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);

        if (!hasPlasma || !inPlay || typeof camera === 'undefined') {
            if (this.crosshairContainer) this.crosshairContainer.style.display = 'none';
            if (this.targetBox) this.targetBox.style.display = 'none';
            this.playerLockedTarget = null;
            return;
        }

        this.crosshairContainer.style.display = 'block';

        const camPos = camera.position;
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);

        let bestCandidate = null;
        let bestScore = -Infinity;
        let bestTargetData = null;

        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            if (!agent || agent.isDead || !agent.root || !agent.root.visible) continue;

            const tPos = agent.root.position.clone().add(new THREE.Vector3(0, 0.65, 0));
            const toTarget = new THREE.Vector3().subVectors(tPos, camPos);
            const dist = toTarget.length();

            if (dist > 55.0 || dist < 1.0) continue;

            toTarget.normalize();
            const dot = camForward.dot(toTarget);

            if (dot > 0.72) {
                const screenPos = tPos.clone().project(camera);

                if (screenPos.z > 0 && Math.abs(screenPos.x) < 0.95 && Math.abs(screenPos.y) < 0.95) {
                    const screenDist = Math.hypot(screenPos.x, screenPos.y);
                    const score = dot * 3.0 - screenDist * 2.0 - (dist / 55.0);

                    if (score > bestScore) {
                        bestScore = score;
                        bestCandidate = agent;
                        bestTargetData = {
                            agent: agent,
                            worldPos: tPos,
                            screenPos: screenPos,
                            dist: dist
                        };
                    }
                }
            }
        }

        if (bestTargetData) {
            const agent = bestTargetData.agent;
            // Cek Line of Sight baik dari kamera maupun dari player
            const pPos = (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root)
                ? wolfCharacter.root.position.clone().add(new THREE.Vector3(0, 0.8, 0))
                : camPos;
            const hasLOS = this.checkLineOfSight(pPos, bestTargetData.worldPos) && this.checkLineOfSight(camPos, bestTargetData.worldPos);

            if (hasLOS) {
                this.playerLockedTarget = agent;

                const containerW = window.innerWidth;
                const containerH = window.innerHeight;
                const pxX = (bestTargetData.screenPos.x * 0.5 + 0.5) * containerW;
                const pxY = (-(bestTargetData.screenPos.y * 0.5) + 0.5) * containerH;

                if (this.targetBox) {
                    this.targetBox.style.display = 'block';
                    this.targetBox.style.left = `${pxX}px`;
                    this.targetBox.style.top = `${pxY}px`;
                }

                if (this.lockDistBadge) {
                    this.lockDistBadge.innerText = `${bestTargetData.dist.toFixed(1)}m`;
                }

                if (this.lockHealthFill) {
                    this.lockHealthFill.style.width = `${agent.health}%`;
                }

                if (this.lockTargetName) {
                    const spName = (typeof FOX_SPECIES !== 'undefined' && FOX_SPECIES[agent.fox.species]) ? FOX_SPECIES[agent.fox.species].name : 'Fox';
                    this.lockTargetName.innerText = `🦊 ${spName}`;
                }
            } else {
                // Terhalang objek 3D/batu: Sembunyikan UI dan lepaskan target lock!
                if (this.targetBox) this.targetBox.style.display = 'none';
                this.playerLockedTarget = null;
            }
        } else {
            if (this.targetBox) this.targetBox.style.display = 'none';
            this.playerLockedTarget = null;
        }

        // Warning banner jika ada AI bersenjata yang siap menembak Player
        let isPlayerTargetedByAnyAI = false;
        if (inPlay && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            const pPos = wolfCharacter.root.position;
            for (let i = 0; i < this.agents.length; i++) {
                const ai = this.agents[i];
                if (ai && !ai.isDead && ai.equippedItem === 'plasma' && ai.ammo > 0) {
                    const dAI = pPos.distanceTo(ai.root.position);
                    const inAggro = (dAI <= ai.detectionRadius);
                    if (inAggro && ai.state === 'COMBAT_ENGAGE' && ai.canSeePlayer(pPos)) {
                        isPlayerTargetedByAnyAI = true;
                        break;
                    }
                }
            }
        }

        if (this.playerWarningBanner) {
            if (isPlayerTargetedByAnyAI) {
                this.playerWarningBanner.classList.add('visible');
            } else {
                this.playerWarningBanner.classList.remove('visible');
            }
        }
    }

    updateInEditor(dt, elapsed) {
        this.syncSpawnedFoxes();

        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            if (agent && agent.root && agent.root.visible) {
                if (!agent.ringGroup) agent.buildDetectionRing();

                const gx = agent.root.position.x;
                const gz = agent.root.position.z;
                const gy = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(gx, gz) : (agent.root.position.y || 0);

                // Selalu tempelkan kaki di atas terrain permukaan tanah
                agent.root.position.y = gy;

                // Update animasi idle di editor agar karakter tidak T-pose / tenggelam
                if (agent.model && typeof agent.model.updateAnimation === 'function') {
                    agent.model.updateAnimation(dt, 0);
                } else if (agent.model && agent.model.mixer) {
                    agent.model.mixer.update(dt);
                }

                agent.updateDetectionRing(elapsed, false, gy);
            } else if (agent && agent.ringGroup) {
                agent.ringGroup.visible = false;
            }
        }
    }

    update(dt, elapsed) {
        // HANYA UPDATE SAAT PLAY MODE
        const inPlay = (typeof isPlayMode !== 'undefined' && isPlayMode);
        if (!inPlay) return;

        this.syncSpawnedFoxes();

        for (let i = 0; i < this.agents.length; i++) {
            const agent = this.agents[i];
            if (agent) {
                agent.update(dt, elapsed);
            }
        }

        this.updateAutoLockCrosshair(dt);
    }
}

// Global Singleton
FoxAIManager = new FoxAIManagerClass();
window.FoxAIManager = FoxAIManager;
window.FoxAIAgent = FoxAIAgent;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FoxAIManager.init());
} else {
    setTimeout(() => FoxAIManager.init(), 100);
}
