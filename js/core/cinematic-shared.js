/* =========================================================
   CINEMATIC SHARED
   CinematicActors: aktor FBX dari hero/* beserta klip animasinya
   CinematicFX    : subtitle, title daerah, dan letterbox
   Dipakai timeline Studio dan pemutar di game.
   ========================================================= */
const CINEMATIC_GAIT = {
    walk: { speed: 1.7, clip: 'walk' },
    trot: { speed: 3.6, clip: 'run' },
    sprint: { speed: 6.2, clip: 'run' }
};

const CinematicActors = {
    resolveSpecies(species) {
        const registry = window.PandoraHeroRegistry;
        const known = registry && Array.isArray(registry.characters) ? registry.characters : [];
        if (known.some(c => c.id === species)) return species;
        return known.length > 0 ? known[0].id : 'red';
    },

    async preload(speciesList) {
        const registry = window.PandoraHeroRegistry;
        if (!registry) return;
        await Promise.all(speciesList.map(species => {
            const manager = registry.getAssetManager(this.resolveSpecies(species));
            return (manager && manager.load) ? manager.load().catch(() => {}) : null;
        }));
    },

    createModel(species) {
        const model = window.createEnemyFoxTreeModel(this.resolveSpecies(species));
        model._cinKey = null;
        model._cinAction = null;
        scene.add(model.root);
        return model;
    },

    clipNames(model) {
        if (!model || !model.actions) return [];
        return Object.keys(model.actions).filter(k => k !== 'kick' && k !== 'punch' && k !== 'jumpRun').sort();
    },

    playClip(model, key, loop) {
        if (!model || !model.actions) return;
        const action = model.actions[key] || model.actions.idle;
        if (!action) return;
        if (!model._cinAction) model._cinAction = model.actions.idle || null;
        if (model._cinKey === key && model._cinAction === action) return;

        action.reset();
        if (typeof action.stopFading === 'function') action.stopFading();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        action.play();
        action.fadeIn(0.28);

        const previous = model._cinAction;
        if (previous && previous !== action) previous.fadeOut(0.28);
        model._cinAction = action;
        model._cinKey = key;
    },

    tickMixer(model, dt) {
        if (!model || !model.mixer) return;
        model.mixer.update(dt);
        if (model.modelMesh) model.modelMesh.rotation.set(0, 0, 0);
    },

    curveOf(actor) {
        const stamp = (actor.waypoints || []).map(w => w.x + ',' + w.z).join('|');
        if (actor._curveStamp !== stamp) {
            actor._curveStamp = stamp;
            actor._samplerCurve = actor.waypoints.length >= 2
                ? new THREE.CatmullRomCurve3(actor.waypoints.map(w => new THREE.Vector3(w.x, 0, w.z)), false, 'catmullrom', 0.5)
                : null;
        }
        return actor._samplerCurve;
    },

    // Posisi & arah aktor pada detik t di dalam scene
    sample(actor, t) {
        const waypoints = actor.waypoints || [];
        if (waypoints.length === 0) return null;
        const curve = this.curveOf(actor);
        if (!curve) {
            return { x: waypoints[0].x, z: waypoints[0].z, heading: actor.heading || 0, moving: false };
        }
        const gait = CINEMATIC_GAIT[actor.movementMode] || CINEMATIC_GAIT.trot;
        const length = Math.max(0.01, curve.getLength());
        const u = Math.min(1, Math.max(0, t) * gait.speed / length);
        const point = curve.getPointAt(u);
        const before = curve.getPointAt(Math.max(0, u - 0.01));
        const after = curve.getPointAt(Math.min(1, u + 0.01));
        return {
            x: point.x,
            z: point.z,
            heading: Math.atan2(after.x - before.x, after.z - before.z),
            moving: u < 1
        };
    },

    // Satu langkah aktor: posisi dari jalur, klip dari pilihan scene
    apply(actor, model, t, dt, isPlaying) {
        if (!model || !model.root) return;
        const state = this.sample(actor, t);
        if (state) {
            const y = (typeof getTerrainHeightFast === 'function') ? getTerrainHeightFast(state.x, state.z) : 0;
            model.root.position.set(state.x, y, state.z);
            model.root.rotation.y = state.heading;
        }
        const moving = !!(state && state.moving && isPlaying);
        const gait = CINEMATIC_GAIT[actor.movementMode] || CINEMATIC_GAIT.trot;
        const key = moving ? (actor.moveClip || gait.clip) : (actor.idlePose || 'idle');
        this.playClip(model, key, moving || actor.clipLoop !== false);
        this.tickMixer(model, dt);
    }
};
window.CinematicActors = CinematicActors;

const SUBTITLE_STYLE_ALIAS = { capsule: 'ink', shadow: 'whisper', gold: 'ember', comic: 'parchment' };

const CinematicFX = {
    root: null,
    _subKey: null,
    _titleKey: null,

    mount() {
        if (this.root) return this.root;
        const host = document.getElementById('viewport-container') || document.body;
        const root = document.createElement('div');
        root.id = 'cfx-root';
        root.innerHTML = '<div class="cfx-bar cfx-bar-top"></div><div class="cfx-bar cfx-bar-bottom"></div><div class="cfx-title-slot"></div><div class="cfx-sub-slot"></div><div class="cfx-skip"></div>';
        host.appendChild(root);
        this.root = root;
        return root;
    },

    setBars(active) {
        this.mount().classList.toggle('bars-on', !!active);
    },

    setSkipHint(text) {
        this.mount().querySelector('.cfx-skip').textContent = text || '';
    },

    _letters(el, text, stepSeconds, startSeconds) {
        let index = 0;
        Array.from(text).forEach(ch => {
            const span = document.createElement('span');
            span.className = 'cfx-ch';
            span.textContent = ch === ' ' ? ' ' : ch;
            span.style.animationDelay = (startSeconds + index * stepSeconds).toFixed(3) + 's';
            el.appendChild(span);
            index++;
        });
    },

    showSubtitle(sub) {
        const slot = this.mount().querySelector('.cfx-sub-slot');
        if (!sub || !sub.text || !sub.text.trim()) {
            if (this._subKey !== null) {
                slot.innerHTML = '';
                this._subKey = null;
            }
            return;
        }
        const key = [sub.text, sub.speaker, sub.style, sub.position].join('|');
        if (key === this._subKey) return;
        this._subKey = key;

        const style = SUBTITLE_STYLE_ALIAS[sub.style] || sub.style || 'ember';
        const box = document.createElement('div');
        box.className = `cfx-sub cfx-sub-${style} cfx-pos-${sub.position || 'bottom'}`;
        if (sub.speaker && sub.speaker.trim()) {
            const speaker = document.createElement('div');
            speaker.className = 'cfx-speaker';
            speaker.textContent = sub.speaker;
            box.appendChild(speaker);
        }
        const line = document.createElement('div');
        line.className = 'cfx-line';
        const step = Math.min(0.03, 1.1 / Math.max(1, sub.text.length));
        this._letters(line, sub.text, step, 0.12);
        box.appendChild(line);
        slot.innerHTML = '';
        slot.appendChild(box);
    },

    // Subtitle aktif pada detik t
    syncSubtitles(subtitles, enabled, t) {
        const active = (enabled && Array.isArray(subtitles) && t >= 0)
            ? subtitles.find(s => t >= s.startTime && t <= s.endTime)
            : null;
        this.showSubtitle(active || null);
    },

    playTitle(card) {
        if (!card || !card.text || !card.text.trim()) return;
        const slot = this.mount().querySelector('.cfx-title-slot');
        const duration = Math.max(2, card.duration || 5);
        const el = document.createElement('div');
        el.className = `cfx-title cfx-title-${card.style || 'ember'}`;
        el.style.setProperty('--cfx-dur', duration + 's');

        const wash = document.createElement('div');
        wash.className = 'cfx-wash';
        const seal = document.createElement('div');
        seal.className = 'cfx-seal';
        seal.textContent = Array.from(card.text.trim())[0].toUpperCase();
        const main = document.createElement('div');
        main.className = 'cfx-main';
        this._letters(main, card.text.trim(), 0.07, 0.35);
        const rule = document.createElement('div');
        rule.className = 'cfx-rule';
        el.append(wash, seal, main, rule);
        if (card.subtitle && card.subtitle.trim()) {
            const sub = document.createElement('div');
            sub.className = 'cfx-title-sub';
            sub.textContent = card.subtitle.trim();
            el.appendChild(sub);
        }
        slot.innerHTML = '';
        slot.appendChild(el);
        clearTimeout(this._titleTimer);
        this._titleTimer = setTimeout(() => { if (el.parentNode) el.remove(); }, duration * 1000 + 100);
    },

    // Title scene muncul sekali saat waktunya tiba
    syncTitle(sceneKey, card, t) {
        if (!card || !card.text) return;
        const key = sceneKey + ':' + card.text;
        const at = card.at || 0;
        if (t < at) {
            if (this._titleKey === key) this._titleKey = null;
            return;
        }
        if (this._titleKey !== key && t < at + 0.5) {
            this._titleKey = key;
            this.playTitle(card);
        }
    },

    clear() {
        if (!this.root) return;
        this.root.querySelector('.cfx-title-slot').innerHTML = '';
        this.root.querySelector('.cfx-sub-slot').innerHTML = '';
        this.setSkipHint('');
        this.setBars(false);
        this._subKey = null;
        this._titleKey = null;
    }
};
window.CinematicFX = CinematicFX;
