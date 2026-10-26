/* ===================================================================
   PANDORA ITEM SYSTEM - ITEM BOX (MYSTERY CRATE) MANAGER
   Crash Nitro Kart-inspired Power-Up Item Box Spawner.
   Custom non-copyright holographic cyber-crystal aesthetic,
   dynamic floating bobbing, collection collision, shatter FX,
   and automatic respawn loop.
   =================================================================== */

class ItemBoxManager {
    constructor() {
        this.boxes = [];
        this.pickupRadius = 1.8;
        this.respawnTime = 4.5; // Durasi respawn cepat (4.5 detik) agar aksi tempur mengalir cepat tanpa menunggu lama
        this.audioCtx = null;
        this.shards = [];
        this.containerGroup = new THREE.Group();
        this.containerGroup.name = 'ItemBoxesContainer';

        // Shared geometries & materials for peak performance
        this.frameGeo = null;
        this.frameMat = null;
        this.coreGeo = null;
        this.coreMat = null;
        this.ringGeo = null;
        this.ringMat = null;
        this.shardGeo = null;
        this.shardMat = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        if (typeof scene === 'undefined') return;
        this.isInitialized = true;

        if (!this.containerGroup.parent) {
            scene.add(this.containerGroup);
        }

        // 1. Outer Translucent Holographic Cube Frame (MeshStandardMaterial tanpa transmission pass agar 60fps bebas freeze)
        const boxSize = 1.15;
        this.frameGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        this.frameMat = new THREE.MeshStandardMaterial({
            color: 0x0ea5e9,
            emissive: 0x0284c7,
            emissiveIntensity: 0.45,
            metalness: 0.2,
            roughness: 0.15,
            opacity: 0.82,
            transparent: true,
            depthWrite: false
        });

        // 2. Inner Rotating Energy Crystal Core
        this.coreGeo = new THREE.OctahedronGeometry(0.38, 0);
        this.coreMat = new THREE.MeshStandardMaterial({
            color: 0xff7700,
            emissive: 0xff5500,
            emissiveIntensity: 1.2,
            roughness: 0.2,
            metalness: 0.8
        });

        // 3. Orbiting Energy Halos
        this.ringGeo = new THREE.TorusGeometry(0.55, 0.022, 8, 24);
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.85
        });

        // Cached shatter shard geometry & material
        this.shardGeo = new THREE.TetrahedronGeometry(0.16, 0);
        this.shardMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 1.0
        });

        // Di awal game buat TIDAK ADA box, biarkan user menentukan sendiri lokasinya
        this.spawnDefaultItemBoxes();

        // Bind editor UI controls
        this.bindUI();
    }

    updateCountUI() {
        const badge = document.getElementById('val-item-box-count');
        if (badge) {
            badge.innerText = this.boxes.length;
        }
    }

    toggleSpawnerMode(force) {
        if (typeof force === 'boolean') {
            window.isItemBoxSpawnerActive = force;
        } else {
            window.isItemBoxSpawnerActive = !window.isItemBoxSpawnerActive;
        }

        const btnToggle = document.getElementById('btn-toggle-itembox-spawner');
        const txtToggle = document.getElementById('txt-itembox-spawner-toggle');
        if (btnToggle) {
            if (window.isItemBoxSpawnerActive) {
                btnToggle.classList.add('active');
                if (txtToggle) txtToggle.innerText = 'Mode Spawner Aktif (Klik Tanah)';
            } else {
                btnToggle.classList.remove('active');
                if (txtToggle) txtToggle.innerText = 'Aktifkan Mode Spawner (Klik Tanah)';
            }
        }
    }

    deleteItemBox(box) {
        if (!box) return;
        const idx = this.boxes.indexOf(box);
        if (idx !== -1) {
            this.boxes.splice(idx, 1);
        }
        if (box.group && box.group.parent) {
            box.group.parent.remove(box.group);
        }
        this.updateCountUI();
    }

    deleteItemBoxAtLocation(x, z, radius = 3.0) {
        const radSq = radius * radius;
        let deleted = false;
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const b = this.boxes[i];
            const dx = b.x - x;
            const dz = b.z - z;
            if (dx * dx + dz * dz <= radSq) {
                if (b.group && b.group.parent) {
                    b.group.parent.remove(b.group);
                }
                this.boxes.splice(i, 1);
                deleted = true;
                break;
            }
        }
        if (deleted) this.updateCountUI();
        return deleted;
    }

    bindUI() {
        // 1. Toggle Interactive Click-to-Place Mode
        const btnToggle = document.getElementById('btn-toggle-itembox-spawner');
        if (btnToggle) {
            btnToggle.onclick = () => {
                this.toggleSpawnerMode();
            };
        }

        // 2. Spawn at Camera Target Focus
        const btnSpawn = document.getElementById('btn-spawn-item-box-center');
        if (btnSpawn) {
            btnSpawn.onclick = () => {
                const targetX = (typeof controls !== 'undefined' && controls.target) ? controls.target.x : 0;
                const targetZ = (typeof controls !== 'undefined' && controls.target) ? controls.target.z : 0;
                this.createItemBox(targetX, targetZ);
                this.updateCountUI();
            };
        }

        // 3. Spawn at Fox Current Position
        const btnSpawnFox = document.getElementById('btn-spawn-item-box-fox');
        if (btnSpawnFox) {
            btnSpawnFox.onclick = () => {
                let fx = 0, fz = 0;
                if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                    fx = wolfCharacter.root.position.x;
                    fz = wolfCharacter.root.position.z;
                }
                this.createItemBox(fx, fz);
                this.updateCountUI();
            };
        }

        const btnReset = document.getElementById('btn-reset-item-boxes');
        if (btnReset) {
            btnReset.onclick = () => {
                this.boxes.forEach(b => {
                    b.isActive = true;
                    b.respawnTimer = 0;
                    b.group.visible = true;
                    b.group.scale.setScalar(1.0);
                });
                this.updateCountUI();
            };
        }

        const btnClear = document.getElementById('btn-clear-item-boxes');
        if (btnClear) {
            btnClear.onclick = () => {
                this.clearAll();
                this.updateCountUI();
            };
        }

        this.updateCountUI();
    }

    spawnDefaultItemBoxes() {
        // Di awal game buat TIDAK ADA box, biarkan user menentukan sendiri di mana box ingin diletakkan!
        this.boxes = [];
        this.updateCountUI();
    }

    createItemBox(x, z, id = null) {
        if (!this.frameGeo) this.init();

        // Pastikan jika sudah ada di area itu, tidak perlu spawn terus (override)
        // Hanya spawn jika area memang kosong (radius 3.5 meter)!
        const MIN_PROXIMITY_DIST = 3.5;
        const isOccupied = this.boxes.some(b => {
            const dx = b.x - x;
            const dz = b.z - z;
            return (dx * dx + dz * dz) < (MIN_PROXIMITY_DIST * MIN_PROXIMITY_DIST);
        });

        if (isOccupied) {
            return null;
        }

        const boxGroup = new THREE.Group();
        boxGroup.name = id || `ItemBox_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        // Outer holographic frame
        const frameMesh = new THREE.Mesh(this.frameGeo, this.frameMat);
        frameMesh.castShadow = true;
        boxGroup.add(frameMesh);

        // Cyber edge wireframe brackets
        const edgesGeo = new THREE.EdgesGeometry(this.frameGeo);
        const edgesMat = new THREE.LineBasicMaterial({
            color: 0x7dd3fc,
            linewidth: 2,
            transparent: true,
            opacity: 0.95
        });
        const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
        boxGroup.add(edgeLines);

        // Inner glowing crystal
        const coreMesh = new THREE.Mesh(this.coreGeo, this.coreMat);
        boxGroup.add(coreMesh);

        // Orbiting rings
        const ring1 = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring1.rotation.x = Math.PI / 3;
        boxGroup.add(ring1);

        const ring2 = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring2.rotation.y = Math.PI / 4;
        boxGroup.add(ring2);

        // Soft ambient point light illuminating grass
        const boxLight = new THREE.PointLight(0xff9900, 1.4, 5.5, 2);
        boxLight.position.set(0, 0, 0);
        boxGroup.add(boxLight);

        // Position on terrain
        const groundY = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(x, z) : 0;
        const baseHoverY = groundY + 1.25;

        boxGroup.position.set(x, baseHoverY, z);
        this.containerGroup.add(boxGroup);

        const boxData = {
            id: boxGroup.name,
            group: boxGroup,
            core: coreMesh,
            ring1: ring1,
            ring2: ring2,
            light: boxLight,
            baseX: x,
            baseZ: z,
            baseHoverY: baseHoverY,
            phase: Math.random() * Math.PI * 2,
            isActive: true,
            respawnTimer: 0
        };

        this.boxes.push(boxData);
        return boxData;
    }

    removeItemBox(index) {
        if (index < 0 || index >= this.boxes.length) return;
        const box = this.boxes[index];
        if (box.group && box.group.parent) {
            box.group.parent.remove(box.group);
        }
        this.boxes.splice(index, 1);
    }

    clearAll() {
        this.boxes.forEach(box => {
            if (box.group && box.group.parent) {
                box.group.parent.remove(box.group);
            }
        });
        this.boxes = [];
    }

    // ==========================================
    // AUDIO SYNTHESIS: ITEM COLLECT CHIME
    // ==========================================
    playCollectSound() {
        try {
            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            const t = this.audioCtx.currentTime;

            // Musical arpeggio chime (Crash Nitro Kart mystery box pickup chime)
            const notes = [440, 554.37, 659.25, 880, 1108.73];
            notes.forEach((freq, idx) => {
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                const startTime = t + idx * 0.055;

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, startTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.05, startTime + 0.18);

                gain.gain.setValueAtTime(0.22, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc.start(startTime);
                osc.stop(startTime + 0.23);
            });

            // Energetic bass thud on impact
            const bass = this.audioCtx.createOscillator();
            const bassGain = this.audioCtx.createGain();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(140, t);
            bass.frequency.exponentialRampToValueAtTime(45, t + 0.22);
            bassGain.gain.setValueAtTime(0.4, t);
            bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
            bass.connect(bassGain);
            bassGain.connect(this.audioCtx.destination);
            bass.start(t);
            bass.stop(t + 0.25);
        } catch (_) { }
    }

    playRespawnSound(pos) {
        try {
            this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            const t = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.exponentialRampToValueAtTime(960, t + 0.25);

            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.27);
        } catch (_) { }
    }

    // ==========================================
    // SHATTER PARTICLE EFFECT
    // ==========================================
    createShatterFX(pos) {
        const shardCount = 12;
        const shardGeo = this.shardGeo || new THREE.TetrahedronGeometry(0.16, 0);
        const shardMat = this.shardMat || new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 1.0 });

        for (let i = 0; i < shardCount; i++) {
            const mesh = new THREE.Mesh(shardGeo, shardMat);
            mesh.position.copy(pos);

            const dir = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 1.5 + 0.5,
                (Math.random() - 0.5) * 2
            ).normalize();

            const speed = 4.5 + Math.random() * 6.0;
            const vel = dir.multiplyScalar(speed);

            scene.add(mesh);

            this.shards.push({
                mesh: mesh,
                vel: vel,
                rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
                age: 0,
                life: 0.65 + Math.random() * 0.45
            });
        }
    }

    // ==========================================
    // COLLECTION LOGIC
    // ==========================================
    collectBox(box, collector = null) {
        if (!box.isActive) return;

        box.isActive = false;
        box.respawnTimer = this.respawnTime;
        box.group.visible = false;

        // Visual shatter & audio
        this.createShatterFX(box.group.position);
        this.playCollectSound();

        // Award weapon to AI Fox if collected by AI, otherwise to Player
        if (collector && collector.isAIFox) {
            if (typeof collector.onCollectItemBox === 'function') {
                collector.onCollectItemBox('plasma');
            }
        } else {
            if (typeof ItemSystem !== 'undefined' && ItemSystem.onItemCollected) {
                ItemSystem.onItemCollected('plasma');
            }
        }
    }

    // ==========================================
    // MAIN UPDATE LOOP
    // ==========================================
    update(dt, elapsedTime) {
        dt = Math.min(dt, 0.05);

        // 1. Update flying shatter shards
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.age += dt;
            const k = s.age / s.life;

            s.vel.y -= 9.8 * dt; // Gravity
            s.mesh.position.addScaledVector(s.vel, dt);
            s.mesh.rotation.x += s.rotVel.x * dt;
            s.mesh.rotation.y += s.rotVel.y * dt;

            s.mesh.material.opacity = Math.max(0, 1.0 - k);
            s.mesh.scale.setScalar(Math.max(0.01, 1.0 - k * 0.5));

            if (k >= 1.0) {
                scene.remove(s.mesh);
                s.mesh.geometry.dispose();
                s.mesh.material.dispose();
                this.shards.splice(i, 1);
            }
        }

        // 2. Check Fox position in Play Mode for collision pickup
        let foxPos = null;
        if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            foxPos = wolfCharacter.root.position;
        }

        // 3. Update each Item Box
        for (let i = 0; i < this.boxes.length; i++) {
            const box = this.boxes[i];

            if (!box.isActive) {
                // Respawn countdown
                box.respawnTimer -= dt;
                if (box.respawnTimer <= 0) {
                    box.isActive = true;
                    box.group.visible = true;
                    box.group.scale.setScalar(0.01);

                    // Smooth pop-in tween
                    if (typeof gsap !== 'undefined') {
                        gsap.to(box.group.scale, {
                            x: 1.0,
                            y: 1.0,
                            z: 1.0,
                            duration: 0.6,
                            ease: "elastic.out(1.2, 0.4)"
                        });
                    } else {
                        box.group.scale.setScalar(1.0);
                    }
                    this.playRespawnSound(box.group.position);
                }
                continue;
            }

            // Floating bobbing motion & steady spin
            const bob = Math.sin(elapsedTime * 2.8 + box.phase) * 0.15;
            box.group.position.y = box.baseHoverY + bob;
            box.group.rotation.y += dt * 1.5;

            // Inner core multi-axis rotation & pulse
            if (box.core) {
                box.core.rotation.x += dt * 2.5;
                box.core.rotation.y += dt * 3.2;
                const scalePulse = 1.0 + Math.sin(elapsedTime * 5.0 + box.phase) * 0.12;
                box.core.scale.setScalar(scalePulse);
            }

            // Ring orbits
            if (box.ring1) box.ring1.rotation.z += dt * 2.2;
            if (box.ring2) box.ring2.rotation.x += dt * 1.8;

            // Light flicker
            if (box.light) {
                box.light.intensity = 1.2 + Math.sin(elapsedTime * 8.0 + box.phase) * 0.35;
            }

            // Collision detection with Fox
            if (foxPos) {
                const dx = foxPos.x - box.group.position.x;
                const dz = foxPos.z - box.group.position.z;
                const distSq = dx * dx + dz * dz;

                if (distSq < this.pickupRadius * this.pickupRadius) {
                    this.collectBox(box);
                }
            }
        }

        // 4. Check AI Foxes collision with Item Boxes
        if (typeof FoxAIManager !== 'undefined' && FoxAIManager.checkItemBoxCollisions) {
            FoxAIManager.checkItemBoxCollisions(this);
        }
    }
}

// Global instance
window.itemBoxManagerInstance = new ItemBoxManager();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.itemBoxManagerInstance.init();
    });
} else {
    // If scene is ready, init now, otherwise delay slightly
    setTimeout(() => {
        if (typeof scene !== 'undefined') {
            window.itemBoxManagerInstance.init();
        }
    }, 100);
}
