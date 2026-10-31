/* =========================================================
   ULTIMATE: energi 3 orb, menu L1, dan jurus Bunshin
   L1 memperlambat waktu dan mendekatkan kamera, lalu pemain memilih jurus dari menu.
   Bunshin adalah salinan karakter pemain yang mengikuti dan menyerang musuh di sekitarnya.
   ========================================================= */
const ULTIMATE_MAX_ORBS = 3;
const ULTIMATE_REGEN_SECONDS = 45;  // Waktu mengisi satu orb, jauh lebih lambat dari stamina
const ULTIMATE_MENU_TIMESCALE = 0.06;
const BUNSHIN_COST = 1;
const BUNSHIN_PER_CAST = 2;
const BUNSHIN_MAX = 6;              // Energi penuh = 3 kali panggil. Melewati batas, yang tertua digantikan
const BUNSHIN_HP_FRACTION = 0.5;
const BUNSHIN_DAMAGE_SCALE = 0.8;
const BUNSHIN_LIFETIME = 45;        // Detik, supaya energi tetap punya arti
const BUNSHIN_SIDE_OFFSET = 2.2;
const BUNSHIN_ROW_OFFSET = 1.9;     // Pasangan berikutnya berbaris di belakang pasangan sebelumnya
const BUNSHIN_ENEMY_RADIUS = 9;
const BUNSHIN_ATTACK_COOLDOWN = 0.75;
const BUNSHIN_REVEAL_DELAY = 0.4;   // Tubuh muncul saat kabut sudah menutupi
const FOG_BURST_SECONDS = 2.2;
const FOG_BURST_PUFFS = 46;

const FOG_VERTEX = `
    attribute vec4 aSeed; // sudut, jarak, kecepatan naik, ukuran
    uniform float uAge;
    uniform float uPixelScale;
    varying float vAlpha;
    varying float vSpin;
    void main() {
        float t = clamp(uAge / ${FOG_BURST_SECONDS.toFixed(1)}, 0.0, 1.0);
        float grow = 1.0 - pow(1.0 - min(1.0, t * 2.2), 3.0);
        float radius = aSeed.y * (0.25 + grow * 1.55);
        float angle = aSeed.x + t * 0.9 * (aSeed.z - 0.5);
        vec3 p = vec3(cos(angle) * radius, 0.15 + aSeed.z * (0.7 + t * 2.1), sin(angle) * radius);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.w * (0.55 + t * 0.85) * uPixelScale / max(0.1, -mvPosition.z);
        vAlpha = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.42, 1.0, t));
        vSpin = aSeed.x + t * 1.2;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const FOG_FRAGMENT = `
    uniform sampler2D uMap;
    varying float vAlpha;
    varying float vSpin;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vSpin), k = cos(vSpin);
        vec2 uv = vec2(c.x * k - c.y * s, c.x * s + c.y * k) + 0.5;
        float soft = 1.0 - smoothstep(0.1, 0.5, length(c));
        float cloud = texture2D(uMap, uv).r;
        float alpha = soft * (0.35 + cloud * 0.75) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.62, 0.63, 0.66), vec3(0.96), cloud), alpha);
    }
`;

const PandoraUltimate = {
    orbs: ULTIMATE_MAX_ORBS,
    regen: 0,
    menuOpen: false,
    selected: 0,
    jutsuClip: null,
    bunshins: [],
    bursts: [],
    pool: [],
    poolSpecies: null,
    prepared: null,
    pixelScale: { value: 400 },
    elements: null,

    options: [
        { id: 'bunshin', label: 'Bunshin', cost: BUNSHIN_COST, run() { PandoraUltimate.summonBunshin(); } }
    ],

    // ---------- Persiapan: dilakukan di balik layar pemuatan supaya L1 tidak tersendat ----------
    prepare() {
        const species = wolfCharacter && (wolfCharacter.speciesKey || wolfCharacter.charKey);
        if (this.prepared && this.poolSpecies === species) return this.prepared;
        this.poolSpecies = species;
        this.prepared = this.buildAssets(species);
        return this.prepared;
    },

    async buildAssets(species) {
        this.buildFog();
        if (!this.jutsuClip) {
            try {
                const loaded = await PandoraAssetCache.loadFBX(getGeneralHeroBasePath() + 'jutsu.fbx');
                this.jutsuClip = loaded.animations[0] || null;
            } catch (err) {
                console.warn('[Ultimate] Pose jutsu gagal dimuat:', err);
            }
        }
        this.pool.forEach(model => scene.remove(model.root));
        this.pool = [];
        for (let i = 0; i < BUNSHIN_MAX; i++) {
            const model = createWolfCharacterModel(species);
            model.isAlly = true;
            model.damageScale = BUNSHIN_DAMAGE_SCALE;
            model.root.visible = false;
            scene.add(model.root);
            this.pool.push(model);
        }
    },

    buildFog() {
        if (this.fogTexture) return;
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        // Lapisan titik lembut menghasilkan bentuk gumpalan tanpa menghitung noise tiap frame
        for (let i = 0; i < 90; i++) {
            const x = Math.random() * size, y = Math.random() * size, r = 8 + Math.random() * 26;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.32)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        this.fogTexture = new THREE.CanvasTexture(canvas);
        const seeds = new Float32Array(FOG_BURST_PUFFS * 4);
        for (let i = 0; i < FOG_BURST_PUFFS; i++) {
            seeds[i * 4] = Math.random() * Math.PI * 2;
            seeds[i * 4 + 1] = Math.sqrt(Math.random());
            seeds[i * 4 + 2] = Math.random();
            seeds[i * 4 + 3] = 1.1 + Math.random() * 1.5;
        }
        this.fogGeometry = new THREE.BufferGeometry();
        this.fogGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FOG_BURST_PUFFS * 3), 3));
        this.fogGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
        // Satu kabut disiapkan sejak awal agar shadernya ikut dikompilasi saat loading
        this.createBurst().points.visible = false;
    },

    createBurst() {
        const material = new THREE.ShaderMaterial({
            vertexShader: FOG_VERTEX,
            fragmentShader: FOG_FRAGMENT,
            uniforms: { uAge: { value: 0 }, uPixelScale: this.pixelScale, uMap: { value: this.fogTexture } },
            transparent: true,
            depthWrite: false,
            toneMapped: false
        });
        const points = new THREE.Points(this.fogGeometry, material);
        points.frustumCulled = false;
        points.renderOrder = 5;
        scene.add(points);
        const burst = { points, material, age: 0 };
        this.bursts.push(burst);
        return burst;
    },

    spawnFog(position) {
        const burst = this.bursts.find(item => !item.points.visible) || this.createBurst();
        burst.age = 0;
        burst.material.uniforms.uAge.value = 0;
        burst.points.position.copy(position);
        burst.points.visible = true;
    },

    // ---------- Energi ----------
    addOrbs(amount) {
        this.orbs = Math.min(ULTIMATE_MAX_ORBS, this.orbs + amount);
        if (this.orbs >= ULTIMATE_MAX_ORBS) this.regen = 0;
        this.renderOrbs();
    },

    renderOrbs() {
        if (!this.elements) return;
        this.elements.orbs.forEach((orb, i) => {
            const fill = i < this.orbs ? 1 : (i === this.orbs ? this.regen : 0);
            orb.style.transform = `scale(${fill.toFixed(3)})`;
            orb.parentElement.classList.toggle('full', i < this.orbs);
        });
    },

    // ---------- Antarmuka ----------
    buildUI() {
        if (this.elements) return;
        const orbRow = document.createElement('div');
        orbRow.id = 'player-mana-orbs';
        const orbs = [];
        for (let i = 0; i < ULTIMATE_MAX_ORBS; i++) {
            const slot = document.createElement('span');
            const fill = document.createElement('i');
            slot.appendChild(fill);
            orbRow.appendChild(slot);
            orbs.push(fill);
        }
        const column = document.querySelector('#player-combat-hud .player-bars-column');
        if (column) column.insertBefore(orbRow, column.firstChild);

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'btn-ultimate';
        button.textContent = 'L1';
        const press = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleMenu();
        };
        button.addEventListener('touchstart', press, { passive: false });
        button.addEventListener('click', press);
        document.body.appendChild(button);

        const menu = document.createElement('div');
        menu.id = 'ultimate-menu';
        menu.innerHTML = '<div class="ultimate-list"></div><div class="ultimate-hint"></div>';
        menu.addEventListener('click', (event) => {
            if (event.target === menu) this.closeMenu(false);
        });
        document.body.appendChild(menu);

        this.elements = { orbs, button, menu, list: menu.querySelector('.ultimate-list'), hint: menu.querySelector('.ultimate-hint') };
        this.renderOrbs();
    },

    renderMenu() {
        const { list, hint } = this.elements;
        list.innerHTML = '';
        this.options.forEach((option, i) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'ultimate-option' + (i === this.selected ? ' selected' : '') + (this.orbs < option.cost ? ' disabled' : '');
            const name = document.createElement('span');
            name.textContent = option.label;
            const cost = document.createElement('em');
            for (let c = 0; c < option.cost; c++) cost.appendChild(document.createElement('i'));
            row.append(name, cost);
            row.addEventListener('click', () => {
                this.selected = i;
                this.closeMenu(true);
            });
            list.appendChild(row);
        });
        hint.textContent = this.orbs < this.options[this.selected].cost ? 'Energi tidak cukup' : '';
    },

    toggleMenu() {
        if (this.menuOpen) this.closeMenu(false);
        else this.openMenu();
    },

    async openMenu() {
        if (typeof isPlayMode === 'undefined' || !isPlayMode || !wolfCharacter || PlayerHealthState.isDead) return;
        if (window.PandoraGamePaused || (window.PandoraStageFlow && PandoraStageFlow.isTransitioning)) return;
        if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return;
        this.menuOpen = true;
        window.PandoraUltimateCasting = true;
        window.PandoraTimeScale = ULTIMATE_MENU_TIMESCALE;
        this.buildUI();
        this.renderMenu();
        this.elements.menu.classList.add('open');
        BossKillCam.startHold(wolfCharacter);
        this.startPose();
        await this.prepare();
    },

    closeMenu(confirmed) {
        if (!this.menuOpen) return;
        const option = this.options[this.selected];
        if (confirmed && this.orbs < option.cost) return;
        this.menuOpen = false;
        window.PandoraUltimateCasting = false;
        window.PandoraTimeScale = 1;
        if (this.elements) this.elements.menu.classList.remove('open');
        BossKillCam.release();
        this.endPose();
        if (confirmed) {
            this.orbs -= option.cost;
            this.renderOrbs();
            option.run();
        }
    },

    // Pose jutsu berjalan dengan kecepatan normal walau seluruh dunia sedang melambat
    startPose() {
        if (!this.jutsuClip || !wolfCharacter.mixer) return;
        const target = wolfCharacter.modelMesh || wolfCharacter.meshContainer || wolfCharacter.root;
        const action = wolfCharacter.mixer.clipAction(sanitizeAnimationClipForModel(this.jutsuClip, target));
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.timeScale = 1 / ULTIMATE_MENU_TIMESCALE;
        action.play();
        wolfCharacter.castAction = action;
        wolfCharacter.castTarget = 1;
    },

    endPose() {
        if (wolfCharacter) wolfCharacter.castTarget = 0;
    },

    // ---------- Bunshin ----------
    async summonBunshin() {
        await this.prepare();
        if (PlayerHealthState.isDead || !isPlayMode) return;
        const root = wolfCharacter.root;
        for (let i = 0; i < BUNSHIN_PER_CAST; i++) {
            if (this.bunshins.length >= BUNSHIN_MAX) this.dismiss(this.bunshins[0]);
            const model = this.pool.find(item => !item.inUse);
            if (!model) return;
            model.inUse = true;
            const slot = this.freeSlot();
            const { x, z } = this.slotPosition(slot);
            model.root.position.set(x, getTerrainHeightFast(x, z), z);
            model.root.rotation.y = root.rotation.y;
            model.root.scale.copy(root.scale);
            this.spawnFog(model.root.position);
            this.bunshins.push({
                model, root: model.root, slot,
                hp: PlayerHealthState.max * BUNSHIN_HP_FRACTION,
                maxHp: PlayerHealthState.max * BUNSHIN_HP_FRACTION,
                reveal: BUNSHIN_REVEAL_DELAY,
                life: BUNSHIN_LIFETIME,
                speed: 0,
                cooldown: 0.3 + i * 0.25,
                alive: true
            });
        }
    },

    freeSlot() {
        let slot = 0;
        while (this.bunshins.some(ally => ally.slot === slot)) slot++;
        return slot;
    },

    // Slot genap dan ganjil berada di kedua sisi pemain, tiap pasangan satu baris lebih ke belakang
    slotPosition(slot) {
        const player = wolfCharacter.root;
        const yaw = player.rotation.y;
        const side = slot % 2 === 0 ? 1 : -1;
        const row = slot >> 1;
        return {
            x: player.position.x + Math.cos(yaw) * BUNSHIN_SIDE_OFFSET * side - Math.sin(yaw) * BUNSHIN_ROW_OFFSET * row,
            z: player.position.z - Math.sin(yaw) * BUNSHIN_SIDE_OFFSET * side - Math.cos(yaw) * BUNSHIN_ROW_OFFSET * row
        };
    },

    release(ally) {
        ally.alive = false;
        ally.root.visible = false;
        ally.model.inUse = false;
        ally.model.isPunching = false;
        ally.model.isKicking = false;
    },

    dismiss(ally) {
        this.spawnFog(ally.root.position);
        this.release(ally);
        const i = this.bunshins.indexOf(ally);
        if (i !== -1) this.bunshins.splice(i, 1);
    },

    // Musuh menyerang bunshin jika bunshin lebih dekat daripada pemain
    pickEnemyTarget(agent) {
        const position = agent.root.position;
        let best = null;
        let bestDist = wolfCharacter && wolfCharacter.root ? position.distanceTo(wolfCharacter.root.position) : Infinity;
        for (let i = 0; i < this.bunshins.length; i++) {
            const ally = this.bunshins[i];
            if (!ally.alive || ally.reveal > 0) continue;
            const dist = position.distanceTo(ally.root.position);
            if (dist < bestDist) {
                best = ally;
                bestDist = dist;
            }
        }
        return best;
    },

    enemyStrike(enemy) {
        if (enemy.strikeProcessed || enemy.punchTimer < 0.26) return;
        const ally = enemy.allyTarget;
        if (!ally || !ally.alive) return;
        const scale = Math.max(1, enemy.root.scale.x / 1.85);
        if (enemy.root.position.distanceTo(ally.root.position) > 2.0 * scale) return;
        enemy.strikeProcessed = true;
        const config = window.ENEMY_COMBAT_CONFIG;
        const fallback = config ? (enemy.isBoss ? config.boss.damagePerHit : config.nonBoss.damagePerHit) : 15;
        const damage = typeof enemy.damagePerHit === 'number' ? enemy.damagePerHit : fallback;
        ally.hp -= damage;
        if (typeof CombatHUD !== 'undefined' && CombatHUD.spawnFloatingDamage) {
            CombatHUD.spawnFloatingDamage(new THREE.Vector3(ally.root.position.x, ally.root.position.y + 1.3, ally.root.position.z), damage, false);
        }
        if (ally.hp <= 0) this.dismiss(ally);
        else this.withoutPlayerStamina(() => ally.model.takeHit(enemy.root.position));
    },

    // Metode karakter memakai stamina pemain; bunshin tidak boleh menghabiskannya
    withoutPlayerStamina(fn) {
        FoxStaminaState.ignoreDrain = true;
        try {
            fn();
        } finally {
            FoxStaminaState.ignoreDrain = false;
        }
    },

    nearestEnemy(position) {
        let best = null;
        let bestDist = BUNSHIN_ENEMY_RADIUS;
        spawnedFoxesList.forEach((fox) => {
            if (!fox.root || !fox.root.visible || (fox.ai && fox.ai.isDead)) return;
            const dist = position.distanceTo(fox.root.position);
            if (dist < bestDist) {
                best = fox;
                bestDist = dist;
            }
        });
        return best ? { fox: best, dist: bestDist } : null;
    },

    updateBunshin(ally, dt) {
        if (ally.reveal > 0) {
            ally.reveal -= dt;
            if (ally.reveal <= 0) ally.root.visible = true;
            return;
        }
        ally.life -= dt;
        if (ally.life <= 0) {
            this.dismiss(ally);
            return;
        }
        ally.cooldown -= dt;

        const pos = ally.root.position;
        const player = wolfCharacter.root;
        const enemy = this.nearestEnemy(pos);
        const scale = enemy ? Math.max(1, enemy.fox.root.scale.x / 1.85) : 1;
        const attackRange = 1.45 * scale;
        let targetX, targetZ, stopDist;
        if (enemy) {
            targetX = enemy.fox.root.position.x;
            targetZ = enemy.fox.root.position.z;
            stopDist = attackRange * 0.8;
        } else {
            const slot = this.slotPosition(ally.slot);
            targetX = slot.x;
            targetZ = slot.z;
            stopDist = 0.35;
        }
        const dx = targetX - pos.x, dz = targetZ - pos.z;
        const dist = Math.hypot(dx, dz);

        // Terlalu jauh tertinggal, misalnya pemain berlari jauh: muncul kembali di sisi pemain
        if (!enemy && dist > 26) {
            pos.set(targetX, getTerrainHeightFast(targetX, targetZ), targetZ);
            this.spawnFog(pos);
            return;
        }

        const model = ally.model;
        const busy = model.isPunching || model.isKicking || model.isTakingHit;
        let wanted = 0;
        if (!busy && dist > stopDist) {
            const playerRunning = Math.abs(window.currentFoxSpeed || 0) > 3;
            wanted = (dist > 3.5 || playerRunning) ? 6.0 : 1.65;
        }
        ally.speed = THREE.MathUtils.lerp(ally.speed, wanted, Math.min(1, 7 * dt));
        if (dist > 0.05 && !model.isTakingHit) {
            const facing = enemy || dist > stopDist ? Math.atan2(dx, dz) : player.rotation.y;
            let turn = (facing - ally.root.rotation.y) % (Math.PI * 2);
            if (turn > Math.PI) turn -= Math.PI * 2;
            if (turn < -Math.PI) turn += Math.PI * 2;
            ally.root.rotation.y += turn * Math.min(1, 9 * dt);
        }
        if (ally.speed > 0.02 && dist > 0.01) {
            const step = Math.min(dist, ally.speed * dt);
            pos.x += dx / dist * step;
            pos.z += dz / dist * step;
        }
        pos.y = getTerrainHeightFast(pos.x, pos.z);

        this.withoutPlayerStamina(() => {
            if (enemy && dist <= attackRange && !busy && ally.cooldown <= 0) {
                ally.cooldown = BUNSHIN_ATTACK_COOLDOWN;
                if (model.triggerKick && Math.random() < 0.35) model.triggerKick();
                else if (model.triggerPunch) model.triggerPunch();
            }
            model.updateAnimation(dt, ally.speed, ally.speed > 3, true, 0);
        });
    },

    // ---------- Tiap frame ----------
    update(dt, realDelta) {
        this.pixelScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        for (let i = 0; i < this.bursts.length; i++) {
            const burst = this.bursts[i];
            if (!burst.points.visible) continue;
            burst.age += realDelta;
            burst.material.uniforms.uAge.value = burst.age;
            if (burst.age >= FOG_BURST_SECONDS) burst.points.visible = false;
        }
        if (typeof isPlayMode === 'undefined' || !isPlayMode || !wolfCharacter || !wolfCharacter.root) return;

        this.buildUI();
        if (this.menuOpen) {
            if (PlayerHealthState.isDead || !BossKillCam.active) this.closeMenu(false);
            else window.PandoraTimeScale = ULTIMATE_MENU_TIMESCALE;
        }
        if (this.orbs < ULTIMATE_MAX_ORBS && !this.menuOpen) {
            this.regen += dt / ULTIMATE_REGEN_SECONDS;
            if (this.regen >= 1) {
                this.regen = 0;
                this.orbs++;
            }
            this.renderOrbs();
        }
        // Pemain tewas: bunshin ikut lenyap dalam kabut
        if (PlayerHealthState.isDead) {
            this.bunshins.slice().forEach(ally => this.dismiss(ally));
            return;
        }
        for (let i = this.bunshins.length - 1; i >= 0; i--) {
            this.updateBunshin(this.bunshins[i], dt);
        }
    },

    // Play Mode dimulai atau berhenti: bunshin hilang; energi hanya penuh lagi saat uji ulang di Studio
    resetForPlay() {
        if (this.menuOpen) this.closeMenu(false);
        this.bunshins.forEach(ally => this.release(ally));
        this.bunshins = [];
        if (!window.PANDORA_RUNTIME) {
            this.orbs = ULTIMATE_MAX_ORBS;
            this.regen = 0;
            this.renderOrbs();
        }
    }
};
window.PandoraUltimate = PandoraUltimate;

window.addEventListener('keydown', (event) => {
    if (typeof isPlayMode === 'undefined' || !isPlayMode || event.repeat) return;
    if (event.code === 'KeyE') {
        PandoraUltimate.toggleMenu();
    } else if (PandoraUltimate.menuOpen && event.code === 'Enter') {
        PandoraUltimate.closeMenu(true);
    } else if (PandoraUltimate.menuOpen && event.code === 'Escape') {
        event.stopImmediatePropagation();
        PandoraUltimate.closeMenu(false);
    }
}, true);
