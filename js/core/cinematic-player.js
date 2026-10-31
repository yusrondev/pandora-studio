/* =========================================================
   CINEMATIC PLAYER
   Memutar scene saat Play Mode (dipicu trigger area). Scene terakhir menjadi
   keadaan stage: aktor tetap di tempat, jadi musuh, atau jadi posisi pemain.
   ========================================================= */
const ENEMY_DEATH_SLOWMO = 0.35;
const ENEMY_DEATH_SLOWMO_MS = 1500;
const ENEMY_DEATH_CINEMATIC_DELAY_MS = 1300;

const CinematicPlayer = {
    active: false,
    scenes: [],
    index: 0,
    time: 0,
    stageId: null,
    actors: new Map(),   // id aktor -> { model, data }
    props: [],           // aktor yang tetap hidup di stage setelah cinematic
    memory: {},          // stageId -> { played:Set, final }

    stageMemory(stageId) {
        if (!this.memory[stageId]) this.memory[stageId] = { played: new Set(), final: null };
        return this.memory[stageId];
    },

    sourceScenes() {
        if (typeof CinematicManager !== 'undefined' && Array.isArray(CinematicManager.scenes)) {
            if (typeof CinematicManager.saveCurrentSceneState === 'function') CinematicManager.saveCurrentSceneState();
            return CinematicManager.scenes;
        }
        return (window.currentStageCinematic && window.currentStageCinematic.scenes) || [];
    },

    async play(options) {
        if (this.active) return;
        const all = options.scenes || this.sourceScenes();
        const from = Math.max(0, options.from || 0);
        const to = Math.min(all.length - 1, options.to === undefined || options.to === null ? all.length - 1 : options.to);
        const scenes = all.slice(from, to + 1).filter(s => Array.isArray(s.waypoints) && s.waypoints.length > 0);
        if (scenes.length === 0) {
            console.warn('[Cinematic] Tidak ada scene dengan titik kamera untuk diputar');
            return;
        }

        this.active = true;
        this.scenes = scenes;
        this.index = 0;
        this.time = 0;
        this.stageId = options.stageId || window.currentStageId || 'studio';
        this.ephemeral = !!options.ephemeral;
        this.dyingAgent = options.dyingAgent || null;
        this.savedFov = camera.fov;
        document.body.classList.add('cinematic-playing');
        if (typeof keys !== 'undefined') Object.keys(keys).forEach(k => { keys[k] = false; });

        const species = new Set();
        scenes.forEach(s => {
            if (s.isFoxEnabled) (s.foxes || []).forEach(a => species.add(a.species));
        });
        await CinematicActors.preload(Array.from(species));

        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
            const hasPlayerActor = scenes.some(s => s.isFoxEnabled && (s.foxes || []).some(a => a.endRole === 'player'));
            wolfCharacter.root.visible = !hasPlayerActor;
            if (typeof wolfCharacter.resetAnimation === 'function') wolfCharacter.resetAnimation();
        }
        CinematicFX.setSkipHint('Esc  lewati');
        this.enterScene();
    },

    enterScene() {
        const scene_ = this.scenes[this.index];
        this.time = 0;

        const points = scene_.waypoints.map(w => new THREE.Vector3(w.x, w.y, w.z));
        this.curve = points.length >= 2 ? new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5) : null;

        if (scene_.environment) this.applyEnvironment(scene_.environment);
        CinematicFX.setBars(scene_.isLetterboxActive !== false);

        const wanted = new Set();
        if (scene_.isFoxEnabled) {
            (scene_.foxes || []).forEach(data => {
                wanted.add(data.id);
                let entry = this.actors.get(data.id);
                if (!entry || entry.species !== data.species) {
                    if (entry) scene.remove(entry.model.root);
                    entry = { model: CinematicActors.createModel(data.species), species: data.species };
                    this.actors.set(data.id, entry);
                }
                entry.data = Object.assign({}, data);
                entry.model.root.visible = true;
            });
        }
        this.actors.forEach((entry, id) => {
            if (!wanted.has(id)) entry.model.root.visible = false;
        });
    },

    applyEnvironment(env) {
        if (env.skyPreset && typeof applySkyPreset === 'function') {
            const selectSky = document.getElementById('select-sky-preset');
            if (selectSky) selectSky.value = env.skyPreset;
            applySkyPreset(env.skyPreset);
        }
        const sliderAzim = document.getElementById('slider-azimuth');
        const sliderElev = document.getElementById('slider-elevation');
        if (env.sunAzimuth !== undefined && sliderAzim) sliderAzim.value = env.sunAzimuth;
        if (env.sunElevation !== undefined && sliderElev) sliderElev.value = env.sunElevation;
        if (typeof updateSunPosition === 'function') updateSunPosition();
    },

    easing(t, mode) {
        if (mode === 'smooth') return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        if (mode === 'dramatic') return Math.sin((t * Math.PI) / 2);
        return t;
    },

    // Yaw/pitch/FOV di antara dua titik kamera terdekat
    waypointAngles(scene_, u) {
        const wps = scene_.waypoints;
        if (wps.length === 1) return { yaw: wps[0].yaw || 0, pitch: wps[0].pitch || 0, fov: wps[0].fov || 45 };
        const global = u * (wps.length - 1);
        const i = Math.min(wps.length - 2, Math.floor(global));
        const a = wps[i];
        const b = wps[i + 1];
        const alpha = global - i;
        let diff = ((b.yaw || 0) - (a.yaw || 0)) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return {
            yaw: (a.yaw || 0) + diff * alpha,
            pitch: (a.pitch || 0) + ((b.pitch || 0) - (a.pitch || 0)) * alpha,
            fov: (a.fov || 45) + ((b.fov || 45) - (a.fov || 45)) * alpha
        };
    },

    focusPoint(scene_, u, camPos, angles) {
        if (scene_.focusAt) return new THREE.Vector3(scene_.focusAt.x, scene_.focusAt.y, scene_.focusAt.z);
        const mode = scene_.focusMode || 'character';
        if (mode === 'character') {
            for (const entry of this.actors.values()) {
                if (entry.model.root.visible) return entry.model.root.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            }
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) {
                return wolfCharacter.root.position.clone().add(new THREE.Vector3(0, 1.5, 0));
            }
        }
        if (mode === 'forward' && this.curve) return this.curve.getPointAt(Math.min(1, u + 0.02));
        if (mode === 'tree' && typeof treesList !== 'undefined' && treesList.length > 0) {
            return treesList[0].position.clone().add(new THREE.Vector3(0, 2.5, 0));
        }
        if (mode === 'angles' || mode === 'forward') {
            const dir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(angles.pitch), THREE.MathUtils.degToRad(angles.yaw), 0, 'YXZ'));
            return camPos.clone().addScaledVector(dir, 25);
        }
        return new THREE.Vector3(0, 1.2, 0);
    },

    update(dt) {
        if (!this.active || !this.scenes.length) return;
        const scene_ = this.scenes[this.index];
        this.time += dt;
        const duration = Math.max(0.1, scene_.duration || 10);
        const raw = Math.min(1, this.time / duration);
        const u = this.easing(raw, scene_.easing);

        this.actors.forEach(entry => {
            if (entry.model.root.visible) CinematicActors.apply(entry.data, entry.model, this.time, dt, true);
        });
        // AI dijeda selama cinematic, tetapi animasi jatuh karakter yang mati harus tuntas
        if (this.dyingAgent && this.dyingAgent.model && this.dyingAgent.model.mixer) {
            this.dyingAgent.model.mixer.update(dt);
        }

        const camPos = this.curve
            ? this.curve.getPointAt(u)
            : new THREE.Vector3(scene_.waypoints[0].x, scene_.waypoints[0].y, scene_.waypoints[0].z);
        const angles = this.waypointAngles(scene_, u);
        camera.position.copy(camPos);
        const focus = this.focusPoint(scene_, u, camPos, angles);
        camera.lookAt(focus);
        controls.target.copy(focus);
        if (Math.abs(camera.fov - angles.fov) > 0.05) {
            camera.fov = angles.fov;
            camera.updateProjectionMatrix();
        }

        CinematicFX.syncSubtitles(scene_.subtitles, scene_.isSubtitlesEnabled !== false, this.time);
        CinematicFX.syncTitle(scene_.id || this.index, scene_.titleCard, this.time);

        if (raw >= 1) {
            if (this.index < this.scenes.length - 1) {
                this.index++;
                this.enterScene();
            } else {
                this.finish();
            }
        }
    },

    skip() {
        if (!this.active) return;
        this.index = this.scenes.length - 1;
        this.enterScene();
        this.time = (this.scenes[this.index].duration || 10);
        this.actors.forEach(entry => {
            if (entry.model.root.visible) CinematicActors.apply(entry.data, entry.model, 9999, 0.016, false);
        });
        this.finish();
    },

    // Keadaan akhir scene terakhir menjadi keadaan stage
    finish() {
        const last = this.scenes[this.scenes.length - 1];
        const finals = [];
        let playerFinal = null;

        this.actors.forEach(entry => {
            const data = entry.data;
            const visible = entry.model.root.visible;
            if (!visible || !data) {
                scene.remove(entry.model.root);
                return;
            }
            const root = entry.model.root;
            const final = { species: data.species, x: root.position.x, z: root.position.z, heading: root.rotation.y, role: data.endRole || 'stay', clip: data.idlePose, name: data.name };
            if (final.role === 'player') playerFinal = final;
            else if (final.role !== 'hide') finals.push(final);
            scene.remove(root);
        });
        this.actors.clear();

        const final = { actors: finals, player: playerFinal, environment: last.environment || null };
        if (!this.ephemeral) this.stageMemory(this.stageId).final = final;
        this.dyingAgent = null;

        this.active = false;
        document.body.classList.remove('cinematic-playing');
        CinematicFX.clear();
        if (camera.fov !== 45) {
            camera.fov = 45;
            camera.updateProjectionMatrix();
        }

        this.realizeFinal(final);
        this.handCameraToPlayer();
    },

    realizeFinal(final) {
        if (!final) return;
        final.actors.forEach(a => {
            if (a.role === 'enemy' || a.role === 'boss') {
                this.spawnFighter(a);
            } else {
                const model = CinematicActors.createModel(a.species);
                const y = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(a.x, a.z) : 0;
                model.root.position.set(a.x, y, a.z);
                model.root.rotation.y = a.heading;
                this.props.push({ model, clip: a.clip });
            }
        });

        const player = final.player;
        if (player && typeof wolfCharacter !== 'undefined' && wolfCharacter) {
            if (player.species && player.species !== currentFoxSpeciesKey && typeof switchFoxSpecies === 'function') {
                switchFoxSpecies(player.species);
            }
            const y = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(player.x, player.z) : 0;
            wolfCharacter.root.position.set(player.x, y, player.z);
            wolfCharacter.root.rotation.y = player.heading;
        }
        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) wolfCharacter.root.visible = true;
    },

    spawnFighter(a) {
        spawnFoxAtLocation(a.species, 'idle', a.x, a.z, a.heading, 1.0);
        const fox = spawnedFoxesList[spawnedFoxesList.length - 1];
        if (!fox) return;
        const isBoss = a.role === 'boss';
        const hp = isBoss ? 500 : 100;
        Object.assign(fox, { isBoss, name: a.name || fox.name, maxHealth: hp, health: hp, aiMode: 'combat' });
        if (fox.ai) Object.assign(fox.ai, { isBoss, maxHealth: hp, health: hp, aiMode: 'combat' });
    },

    // Kamera gameplay mulai dari posisi kamera terakhir lalu menyusul sendiri, tanpa potongan
    handCameraToPlayer() {
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) return;
        const focus = wolfCharacter.root.position.clone();
        focus.y += 1.7;
        const ray = camera.position.clone().sub(focus);
        const flat = Math.max(0.05, Math.hypot(ray.x, ray.z));
        camOrbitYaw = Math.atan2(ray.x, ray.z);
        camOrbitPitch = Math.atan2(ray.y, flat);
        window.camOrbitYaw = camOrbitYaw;
        window.camOrbitPitch = camOrbitPitch;
        currentCamDist = Math.min(18, ray.length());
    },

    // Musuh mati: momen kemenangan tanpa layar gelap, atau cinematic sesuai mode di Spawner Character
    onEnemyKilled(agent, mode) {
        const others = (typeof FoxAIManager !== 'undefined' && FoxAIManager.agents) ? FoxAIManager.agents : [];
        const isLast = !others.some(a => a && a !== agent && !a.isDead && a.root && a.root.visible);
        const wantsCinematic = mode === 'auto' || mode === 'scene';

        if (agent.isBoss || isLast || wantsCinematic) {
            window.PandoraTimeScale = ENEMY_DEATH_SLOWMO;
            clearTimeout(this._slowmoTimer);
            this._slowmoTimer = setTimeout(() => { window.PandoraTimeScale = 1; }, ENEMY_DEATH_SLOWMO_MS);
        }
        if (!wantsCinematic) return;

        setTimeout(() => {
            if (typeof isPlayMode === 'undefined' || !isPlayMode || !agent.isDead) return;
            if (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) return;
            window.PandoraTimeScale = 1;
            if (window.PandoraStageFlow && PandoraStageFlow.rememberStudioStage) PandoraStageFlow.rememberStudioStage();
            const scenes = mode === 'auto' ? this.buildAutoDeathScene(agent) : this.buildDeathScenes(agent);
            if (scenes.length > 0) this.play({ scenes, ephemeral: true, dyingAgent: agent });
        }, ENEMY_DEATH_CINEMATIC_DELAY_MS);
    },

    // Kamera memutari jasad perlahan, opsional dengan kata terakhir
    buildAutoDeathScene(agent) {
        const pos = agent.root.position;
        const startAngle = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
        const orbit = (angleOffset, radius, height, fov) => ({
            x: pos.x + Math.sin(startAngle + angleOffset) * radius,
            y: pos.y + height,
            z: pos.z + Math.cos(startAngle + angleOffset) * radius,
            fov
        });
        const line = agent.fox && agent.fox.deathLine;
        const duration = 5.5;
        return [{
            id: 'death-' + agent.name,
            duration,
            easing: 'smooth',
            isLetterboxActive: true,
            isSubtitlesEnabled: true,
            isFoxEnabled: false,
            focusAt: { x: pos.x, y: pos.y + 0.7, z: pos.z },
            waypoints: [orbit(0, 6.5, 3.4, 42), orbit(0.55, 4.8, 2.3, 38), orbit(1.1, 3.6, 1.5, 34)],
            subtitles: line ? [{ startTime: 0.6, endTime: duration - 0.4, text: line, speaker: agent.name, style: 'ember', position: 'bottom' }] : []
        }];
    },

    // Scene dibuat di sekitar titik spawn musuh, lalu digeser ke tempat musuh benar-benar jatuh
    buildDeathScenes(agent) {
        const all = this.sourceScenes();
        const fox = agent.fox || {};
        const from = Math.max(0, fox.deathFrom || 0);
        const to = (fox.deathTo === undefined || fox.deathTo < 0) ? all.length - 1 : Math.min(all.length - 1, fox.deathTo);
        const origin = agent.spawnOrigin || agent.root.position;
        const dx = agent.root.position.x - origin.x;
        const dz = agent.root.position.z - origin.z;
        const shift = (list) => (list || []).map(p => Object.assign({}, p, { x: p.x + dx, z: p.z + dz }));
        return all.slice(from, to + 1).map(s => Object.assign({}, s, {
            waypoints: shift(s.waypoints),
            foxes: (s.foxes || []).map(a => Object.assign({}, a, { waypoints: shift(a.waypoints) }))
        }));
    },

    // Masuk ulang stage (respawn): langsung pakai keadaan akhir tanpa memutar lagi
    restoreStage(stageId) {
        const memory = this.memory[stageId];
        if (!memory || !memory.final) return;
        if (memory.final.environment) this.applyEnvironment(memory.final.environment);
        this.realizeFinal(memory.final);
    },

    tick(dt) {
        for (let i = 0; i < this.props.length; i++) {
            const prop = this.props[i];
            if (!prop.started && prop.model.actions) {
                prop.started = true;
                CinematicActors.playClip(prop.model, prop.clip || 'idle', true);
            }
            CinematicActors.tickMixer(prop.model, dt);
        }
    },

    clearProps() {
        this.props.forEach(p => scene.remove(p.model.root));
        this.props = [];
    },

    reset() {
        this.active = false;
        this.actors.forEach(entry => scene.remove(entry.model.root));
        this.actors.clear();
        this.clearProps();
        this.memory = {};
        document.body.classList.remove('cinematic-playing');
        if (typeof CinematicFX !== 'undefined') CinematicFX.clear();
    }
};
window.CinematicPlayer = CinematicPlayer;

// Input pemain dikunci selama cinematic; hanya Esc/Enter untuk melewati.
// File ini dimuat sebelum kode gameplay agar listener capture ini berjalan lebih dulu.
['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'contextmenu'].forEach(type => {
    window.addEventListener(type, (e) => {
        if (!CinematicPlayer.active) return;
        if (type === 'keydown' && (e.key === 'Escape' || e.key === 'Enter')) CinematicPlayer.skip();
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);
});
