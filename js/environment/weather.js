/* =========================================================
   CUACA: HUJAN & SALJU
   - Partikel dianimasikan seluruhnya di GPU: posisi dihitung dari waktu, jadi tidak ada biaya CPU per butir.
     Butir diikat ke grid dunia yang membungkus kamera, jadi tidak ikut bergeser saat kamera bergerak.
   - Hujan: garis jatuh miring searah angin (motion blur), percikan mahkota kecil di tanah, langit mendung,
     suara hujan. Permukaan perlahan basah lalu genangan terbentuk di tanah datar (shader tanah).
   - Salju: kepingan melayang bergoyang, lalu menumpuk di permukaan yang menghadap ke atas: tanah, rumput,
     daun, batu, dan tubuh karakter/musuh (bahu, kepala).
   Semua akumulasi naik/turun bertahap, kecuali saat stage dimuat (langsung sesuai cuaca stage).
   ========================================================= */
const WEATHER_RAIN_BOX = 38;        // Lebar kotak hujan di sekitar kamera (m)
const WEATHER_RAIN_HEIGHT = 22;
const WEATHER_SNOW_BOX = 30;
const WEATHER_SNOW_HEIGHT = 16;
const WEATHER_SPLASH_COUNT = 260;
// Intensitas 0..1 = gerimis sampai deras (sama seperti sebelumnya), di atas 1 = badai.
// Buffer partikel dibuat untuk intensitas maksimum; intensitas memilih sebagian butir yang aktif.
const WEATHER_MAX_INTENSITY = 1.6;
const WEATHER_LEVELS = [            // Label slider di Studio
    { upTo: 0.3, rain: 'Gerimis', snow: 'Tipis' },
    { upTo: 0.65, rain: 'Sedang', snow: 'Sedang' },
    { upTo: 1.05, rain: 'Deras', snow: 'Lebat' },
    { upTo: Infinity, rain: 'Badai', snow: 'Badai Salju' }
];
const WEATHER_SPLASH_LIFE = 0.32;
const WEATHER_RATES = {             // Per detik: naik / turun
    precip: [0.9, 0.9],             // Hujan/salju yang terlihat turun
    wet: [1 / 6, 1 / 40],           // Basah cepat, kering lama
    puddle: [1 / 16, 1 / 70],
    snow: [1 / 22, 1 / 50],
    overcast: [0.5, 0.35]
};

const WEATHER_RAIN_VERTEX = `
    uniform float uTime, uAmount, uBox, uHeight, uSpeedScale;
    uniform vec3 uCenter;
    uniform vec2 uWind;
    attribute vec4 aSeed;   // x,z acak di kotak, fase jatuh, variasi
    attribute float aEnd;   // 0 kepala butir, 1 ekor
    varying float vAlpha;
    varying float vEnd;
    void main() {
        vEnd = aEnd;
        // Hanya sebagian butir aktif sesuai intensitas
        if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vAlpha = 0.0; return; }
        float speed = (11.0 + aSeed.w * 5.0) * uSpeedScale;
        float fall = mod(aSeed.z * uHeight + uTime * speed, uHeight);
        vec3 p;
        // Grid dunia yang membungkus kamera: butir tetap di tempatnya walau kamera bergerak
        p.x = uCenter.x + (fract((aSeed.x * uBox - uCenter.x) / uBox) - 0.5) * uBox;
        p.z = uCenter.z + (fract((aSeed.y * uBox - uCenter.z) / uBox) - 0.5) * uBox;
        p.y = uCenter.y + uHeight * 0.55 - fall;
        float t = fall / speed;
        p.xz += uWind * t;
        vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
        // Panjang garis = jarak tempuh selama ~1/40 detik (motion blur kamera)
        p += dir * (speed * 0.045) * aEnd;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        vAlpha = smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(uBox * 0.35, uBox * 0.5, dist));
        gl_Position = projectionMatrix * mv;
    }
`;
const WEATHER_RAIN_FRAGMENT = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vAlpha;
    varying float vEnd;
    void main() {
        gl_FragColor = vec4(uColor, vAlpha * uOpacity * mix(0.35, 1.0, vEnd));
    }
`;

const WEATHER_SNOW_VERTEX = `
    uniform float uTime, uAmount, uBox, uHeight, uPixelScale;
    uniform vec3 uCenter;
    uniform vec2 uWind;
    attribute vec4 aSeed;
    varying float vAlpha;
    void main() {
        if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
        float speed = 0.9 + aSeed.w * 0.7;
        float fall = mod(aSeed.z * uHeight + uTime * speed, uHeight);
        vec3 p;
        p.x = uCenter.x + (fract((aSeed.x * uBox - uCenter.x) / uBox) - 0.5) * uBox;
        p.z = uCenter.z + (fract((aSeed.y * uBox - uCenter.z) / uBox) - 0.5) * uBox;
        p.y = uCenter.y + uHeight * 0.55 - fall;
        // Kepingan bergoyang ke samping saat jatuh, terbawa angin
        float phase = aSeed.z * 31.0 + uTime * (0.8 + aSeed.w);
        p.x += sin(phase) * 0.35 + uWind.x * fall / speed * 0.35;
        p.z += cos(phase * 0.83) * 0.35 + uWind.y * fall / speed * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float size = mix(0.022, 0.06, fract(aSeed.x * 17.0));
        gl_PointSize = max(1.0, size * uPixelScale / max(dist, 0.1));
        vAlpha = smoothstep(0.3, 1.2, dist) * (1.0 - smoothstep(uBox * 0.35, uBox * 0.5, dist));
        gl_Position = projectionMatrix * mv;
    }
`;
const WEATHER_SNOW_FRAGMENT = `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.15, d);
        gl_FragColor = vec4(uColor, a * vAlpha * 0.9);
    }
`;

// Percikan mahkota: cincin tipis melebar + titik-titik kecil memantul, lalu memudar
const WEATHER_SPLASH_VERTEX = `
    uniform float uPixelScale;
    attribute float aAge;    // 0..1, >= 1 tidak aktif
    attribute float aSize;
    varying float vAge;
    void main() {
        vAge = aAge;
        if (aAge >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (0.5 + aAge * 0.9) * uPixelScale / max(-mv.z, 0.1);
        gl_Position = projectionMatrix * mv;
    }
`;
const WEATHER_SPLASH_FRAGMENT = `
    uniform vec3 uColor;
    varying float vAge;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        c.y *= 1.9;                      // Cincin terlihat pipih karena dilihat menyerong ke tanah
        float d = length(c);
        float ring = smoothstep(0.08, 0.0, abs(d - 0.18 - vAge * 0.24));
        float drops = step(0.92, fract(sin(floor(atan(c.y, c.x) * 2.0) * 91.7) * 43758.5)) * smoothstep(0.1, 0.0, abs(d - 0.12 - vAge * 0.3));
        float a = (ring + drops) * (1.0 - vAge) * 0.7;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
    }
`;

const PandoraWeather = {
    type: 'clear',
    intensity: 0.7,
    precip: 0,          // Hujan/salju yang sedang terlihat turun (0..1)
    overcast: 0,
    wet: 0,
    puddle: 0,
    snowCover: 0,
    time: 0,
    rain: null,
    snow: null,
    splash: null,
    splashCursor: 0,
    splashTimer: 0,
    audio: null,
    lastSun: null,
    lastHemi: null,
    baseSun: 1,
    baseHemi: 1,
    skyBase: null,
    skyApplied: null,
    patchTimer: 0,
    overcastApplied: 0,
    rippleCursor: 0,
    walkers: new WeakMap(),   // root karakter -> { x, z, travel }

    particleBudget() {
        const preset = (typeof PandoraSettings !== 'undefined' && PandoraSettings.preset) ? PandoraSettings.preset() : null;
        const frac = preset && typeof preset.grassFraction === 'number' ? preset.grassFraction : 1;
        const phone = typeof PANDORA_IS_PHONE !== 'undefined' && PANDORA_IS_PHONE;
        return {
            rain: Math.round((phone ? 2600 : 6500) * (0.45 + 0.55 * frac) * WEATHER_MAX_INTENSITY),
            snow: Math.round((phone ? 1800 : 4200) * (0.45 + 0.55 * frac) * WEATHER_MAX_INTENSITY)
        };
    },

    seeds(count, perDrop) {
        const seeds = new Float32Array(count * perDrop * 4);
        for (let i = 0; i < count; i++) {
            const s = [Math.random(), Math.random(), Math.random(), Math.random()];
            for (let k = 0; k < perDrop; k++) seeds.set(s, (i * perDrop + k) * 4);
        }
        return seeds;
    },

    buildRain() {
        const count = this.particleBudget().rain;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds(count, 2), 4));
        const ends = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) ends[i * 2 + 1] = 1;
        geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: WEATHER_UNIFORMS.uWeatherTime, uAmount: { value: 0 }, uBox: { value: WEATHER_RAIN_BOX },
                uHeight: { value: WEATHER_RAIN_HEIGHT }, uSpeedScale: { value: 1 }, uCenter: { value: new THREE.Vector3() },
                uWind: { value: new THREE.Vector2(1.2, 0.6) }, uColor: { value: new THREE.Color(0xdde5ee) }, uOpacity: { value: 0.55 }
            },
            vertexShader: WEATHER_RAIN_VERTEX,
            fragmentShader: WEATHER_RAIN_FRAGMENT,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        const lines = new THREE.LineSegments(geo, mat);
        lines.frustumCulled = false;
        lines.renderOrder = 6;
        lines.visible = false;
        lines.userData.noWeather = true;
        scene.add(lines);
        this.rain = lines;
    },

    buildSnow() {
        const count = this.particleBudget().snow;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds(count, 1), 4));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: WEATHER_UNIFORMS.uWeatherTime, uAmount: { value: 0 }, uBox: { value: WEATHER_SNOW_BOX },
                uHeight: { value: WEATHER_SNOW_HEIGHT }, uPixelScale: { value: 600 }, uCenter: { value: new THREE.Vector3() },
                uWind: { value: new THREE.Vector2(0.6, 0.3) }, uColor: { value: new THREE.Color(0xf4f8ff) }
            },
            vertexShader: WEATHER_SNOW_VERTEX,
            fragmentShader: WEATHER_SNOW_FRAGMENT,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        points.renderOrder = 6;
        points.visible = false;
        points.userData.noWeather = true;
        scene.add(points);
        this.snow = points;
    },

    buildSplash() {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WEATHER_SPLASH_COUNT * 3), 3));
        const age = new Float32Array(WEATHER_SPLASH_COUNT).fill(1);
        geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
        const size = new Float32Array(WEATHER_SPLASH_COUNT);
        for (let i = 0; i < size.length; i++) size[i] = 0.12 + Math.random() * 0.12;
        geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: { uPixelScale: { value: 600 }, uColor: { value: new THREE.Color(0xdde6ef) } },
            vertexShader: WEATHER_SPLASH_VERTEX,
            fragmentShader: WEATHER_SPLASH_FRAGMENT,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        points.renderOrder = 6;
        points.visible = false;
        points.userData.noWeather = true;
        scene.add(points);
        this.splash = points;
        this.splashLife = new Float32Array(WEATHER_SPLASH_COUNT).fill(WEATHER_SPLASH_LIFE);
    },

    ensureBuilt() {
        if (!this.rain) this.buildRain();
        if (!this.snow) this.buildSnow();
        if (!this.splash) this.buildSplash();
    },

    // type: 'clear' | 'rain' | 'snow'. instant: akumulasi langsung (stage dimuat)
    set(type, intensity, instant) {
        if (!['clear', 'rain', 'snow'].includes(type)) type = 'clear';
        this.type = type;
        if (typeof intensity === 'number' && isFinite(intensity)) this.intensity = Math.max(0.05, Math.min(WEATHER_MAX_INTENSITY, intensity));
        if (type !== 'clear') this.ensureBuilt();
        if (instant) {
            const t = this.targets();
            this.precip = t.precip; this.overcast = t.overcast; this.wet = t.wet; this.puddle = t.puddle; this.snowCover = t.snow;
            this.applyUniforms();
        }
        // Pasang efek salju/basah sekarang juga: saat stage dimuat loop update belum berjalan, dan
        // prepareStage perlu mengompilasi shader yang sudah final
        if (type !== 'clear') this.patchScene();
        this.patchTimer = 2;
        const select = document.getElementById('select-weather');
        if (select && select.value !== type) select.value = type;
        const slider = document.getElementById('slider-weather-intensity');
        if (slider && Math.abs(parseFloat(slider.value) - this.intensity) > 0.001) slider.value = this.intensity;
    },

    targets() {
        const i = this.intensity;
        const storm = Math.max(0, i - 1);   // Bagian di atas "deras"
        const rain = this.type === 'rain', snow = this.type === 'snow';
        return {
            precip: rain || snow ? i : 0,
            overcast: rain ? Math.min(1, 0.35 + Math.min(1, i) * 0.5 + storm * 0.35) : (snow ? Math.min(1, 0.25 + Math.min(1, i) * 0.35 + storm * 0.4) : 0),
            wet: rain ? 1 : 0,
            puddle: rain ? Math.min(1, 0.35 + i * 0.75) : 0,
            snow: snow ? Math.min(1, 0.25 + i * 0.85) : 0
        };
    },

    approach(current, target, rates, dt) {
        const rate = target > current ? rates[0] : rates[1];
        return current + Math.sign(target - current) * Math.min(Math.abs(target - current), rate * dt);
    },

    applyUniforms() {
        WEATHER_UNIFORMS.uSnowCover.value = this.snowCover;
        WEATHER_UNIFORMS.uWetness.value = this.wet * (1 - this.snowCover);
        WEATHER_UNIFORMS.uPuddles.value = this.puddle * (1 - this.snowCover);
        WEATHER_UNIFORMS.uRainAmount.value = this.type === 'rain' ? this.precip : 0;
    },

    // ---------- Langit & cahaya mendung ----------
    // Lampu/langit bisa diubah sistem lain (preset langit, sudut matahari). Nilai yang berbeda dari yang
    // terakhir kita pasang berarti nilai dasar baru, jadi faktor mendung tidak pernah menumpuk.
    applyOvercast() {
        const k = this.overcast;
        const snowy = this.type === 'snow';
        if (typeof sunLight !== 'undefined' && sunLight) {
            if (this.lastSun === null || Math.abs(sunLight.intensity - this.lastSun) > 1e-6) this.baseSun = sunLight.intensity;
            sunLight.intensity = this.baseSun * (1 - k * (snowy ? 0.45 : 0.62));
            this.lastSun = sunLight.intensity;
        }
        if (typeof hemiLight !== 'undefined' && hemiLight) {
            if (this.lastHemi === null || Math.abs(hemiLight.intensity - this.lastHemi) > 1e-6) this.baseHemi = hemiLight.intensity;
            hemiLight.intensity = this.baseHemi * (1 + k * 0.15);   // Cahaya langit merata saat mendung
            this.lastHemi = hemiLight.intensity;
        }
        if (typeof skyMat === 'undefined' || !skyMat) return;
        const u = skyMat.uniforms;
        // Awan di shader langit menutup langit dan menjadi kelabu tebal saat hujan/salju
        if (u.uCloudOvercast) u.uCloudOvercast.value = Math.min(1, k * (snowy ? 0.85 : 1.0));
        // Langit & awan menuju abu-abu mendung. Hujan lebat: langit kelabu gelap, awan tebal kelabu
        const targets = snowy ? [
            [u.uTopColor, 0x9aabbd], [u.uMidColor, 0xbcc6d1], [u.uBottomColor, 0xdce2e9]
        ] : [
            [u.uTopColor, 0x4f5a66], [u.uMidColor, 0x737e8a], [u.uBottomColor, 0x9aa3ad]
        ];
        if (typeof volumetricCloudMat !== 'undefined' && volumetricCloudMat) {
            const cu = volumetricCloudMat.uniforms;
            targets.push([cu.uBaseColor, snowy ? 0xdfe5ec : 0x8d97a2], [cu.uShadowColor, snowy ? 0x8e9cad : 0x4b545e]);
        }
        if (!this.overcastSlots) this.overcastSlots = new Map();
        targets.forEach(([uniform, greyHex]) => {
            let slot = this.overcastSlots.get(uniform);
            if (!slot) {
                slot = { base: uniform.value.clone(), applied: uniform.value.clone(), grey: new THREE.Color() };
                this.overcastSlots.set(uniform, slot);
            }
            if (!uniform.value.equals(slot.applied)) slot.base.copy(uniform.value);   // Preset langit baru
            slot.grey.setHex(greyHex);
            uniform.value.copy(slot.base).lerp(slot.grey, Math.min(1, k * 1.05));
            slot.applied.copy(uniform.value);
        });
        if (u.uSunIntensity) {
            if (this.sunDiscBase === undefined || Math.abs(u.uSunIntensity.value - this.sunDiscApplied) > 1e-6) this.sunDiscBase = u.uSunIntensity.value;
            u.uSunIntensity.value = this.sunDiscBase * (1 - k);
            this.sunDiscApplied = u.uSunIntensity.value;
        }
    },

    // ---------- Suara hujan (derau tersaring, tanpa file audio) ----------
    updateAudio() {
        const playing = (typeof isPlayMode !== 'undefined' && isPlayMode) || !!window.PANDORA_RUNTIME;
        const level = playing && this.type === 'rain' ? this.precip : 0;
        const fx = typeof foxSoundFX !== 'undefined' ? foxSoundFX : null;
        if (!fx || !fx.ctx) return;
        if (!this.audio && level > 0.01) {
            const ctx = fx.ctx;
            const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            let brown = 0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                brown = (brown + 0.02 * white) / 1.02;
                data[i] = white * 0.55 + brown * 3.2;   // Desis butir + gemuruh rendah
            }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 280;
            const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 5200;
            const gain = ctx.createGain(); gain.gain.value = 0;
            src.connect(high); high.connect(low); low.connect(gain); gain.connect(ctx.destination);
            src.start();
            this.audio = { gain, ctx };
        }
        if (this.audio) this.audio.gain.gain.setTargetAtTime(Math.min(1.4, level) * 0.16, this.audio.ctx.currentTime, 0.4);
    },

    // ---------- Genangan: riak & percikan dari langkah karakter ----------
    addPuddleRipple(x, z, strength) {
        const slot = WEATHER_UNIFORMS.uPuddleRipples.value[this.rippleCursor];
        slot.set(x, z, this.time, strength);
        this.rippleCursor = (this.rippleCursor + 1) % WEATHER_UNIFORMS.uPuddleRipples.value.length;
    },

    spawnSplash(x, y, z, size) {
        if (!this.splash) return;
        const i = this.splashCursor;
        this.splashCursor = (this.splashCursor + 1) % WEATHER_SPLASH_COUNT;
        this.splash.geometry.attributes.position.setXYZ(i, x, y, z);
        this.splash.geometry.attributes.aAge.array[i] = 0;
        this.splash.geometry.attributes.aSize.array[i] = size;
        this.splash.geometry.attributes.aSize.needsUpdate = true;
        this.splashLife[i] = WEATHER_SPLASH_LIFE * (0.8 + Math.random() * 0.6);
        this.splashActive = true;
    },

    // Pemain, musuh, dan bunshin yang berjalan di genangan memancarkan riak tiap langkah, dan
    // memercikkan air di kaki (lebih banyak saat berlari)
    updateWalkers(dt) {
        if (WEATHER_UNIFORMS.uPuddles.value <= 0.02 || typeof getPuddleAmountAt !== 'function') return;
        const roots = [];
        if (typeof isPlayMode !== 'undefined' && isPlayMode && typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.root) roots.push(wolfCharacter.root);
        if (typeof FoxAIManager !== 'undefined' && FoxAIManager.agents) {
            FoxAIManager.agents.forEach(a => { if (a && a.root && a.root.visible && !a.isDead) roots.push(a.root); });
        }
        if (window.PandoraUltimate && PandoraUltimate.bunshins) {
            PandoraUltimate.bunshins.forEach(b => { if (b && b.root && b.root.visible) roots.push(b.root); });
        }
        roots.forEach((root) => {
            const x = root.position.x, z = root.position.z;
            let w = this.walkers.get(root);
            if (!w) { w = { x, z, travel: 0 }; this.walkers.set(root, w); return; }
            const moved = Math.hypot(x - w.x, z - w.z);
            w.x = x; w.z = z;
            if (moved > 3) return;                 // Teleport / pindah stage
            const ground = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(x, z) : 0;
            if (root.position.y > ground + 0.35) return;   // Sedang melompat
            const speed = dt > 0 ? moved / dt : 0;
            w.travel += moved;
            const stride = speed > 3.5 ? 0.75 : 0.5;
            if (w.travel < stride) return;
            w.travel = 0;
            const puddle = getPuddleAmountAt(x, z);
            if (puddle < 0.15) return;
            const strength = Math.min(1, 0.35 + speed / 6) * puddle;
            this.addPuddleRipple(x, z, strength);
            const drops = speed > 3.5 ? 5 : 2;
            for (let k = 0; k < drops; k++) {
                const a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.35;
                this.spawnSplash(x + Math.cos(a) * r, ground + 0.04, z + Math.sin(a) * r, 0.22 + Math.random() * 0.2 + speed * 0.02);
            }
        });
    },

    // ---------- Percikan ----------
    updateSplashes(dt) {
        const amount = this.type === 'rain' ? this.precip : 0;
        const pos = this.splash.geometry.attributes.position;
        const age = this.splash.geometry.attributes.aAge;
        let anyAlive = false;
        for (let i = 0; i < WEATHER_SPLASH_COUNT; i++) {
            if (age.array[i] < 1) {
                age.array[i] = Math.min(1, age.array[i] + dt / this.splashLife[i]);
                anyAlive = true;
            }
        }
        age.needsUpdate = true;
        // Tetap tampil setelah hujan berhenti selama masih ada percikan langkah
        this.splash.visible = amount > 0.01 || anyAlive;
        if (amount <= 0.01) return;
        // Percikan muncul di depan kamera, di tanah (bukan di atas air: air punya riak sendiri)
        this.splashTimer += dt * amount * 320;   // Badai (amount > 1) otomatis lebih banyak percikan
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
        fwd.normalize();
        while (this.splashTimer >= 1) {
            this.splashTimer -= 1;
            const i = this.splashCursor;
            this.splashCursor = (this.splashCursor + 1) % WEATHER_SPLASH_COUNT;
            const r = 1.5 + Math.random() * 13;
            const a = (Math.random() - 0.5) * 2.2;
            const x = camera.position.x + (fwd.x * Math.cos(a) - fwd.z * Math.sin(a)) * r;
            const z = camera.position.z + (fwd.z * Math.cos(a) + fwd.x * Math.sin(a)) * r;
            if (typeof isWaterAtWorld === 'function' && isWaterAtWorld(x, z)) continue;
            const y = typeof getTerrainHeightFast === 'function' ? getTerrainHeightFast(x, z) : 0;
            pos.setXYZ(i, x, y + 0.03, z);
            this.splash.geometry.attributes.aSize.array[i] = 0.12 + Math.random() * 0.12;
            this.splash.geometry.attributes.aSize.needsUpdate = true;
            age.array[i] = 0;
            this.splashLife[i] = WEATHER_SPLASH_LIFE * (0.7 + Math.random() * 0.6);
        }
        pos.needsUpdate = true;
        age.needsUpdate = true;
    },

    // ---------- Salju & basah di material objek / karakter ----------
    // Material bawaan three.js disisipi kode kecil: salju di permukaan yang menghadap atas (normal dunia,
    // ikut tulang karakter), basah = lebih gelap dan lebih licin. Dipasang sekali per material.
    patchMaterial(mat) {
        if (!mat || mat.userData.weatherPatched || mat.userData.noWeather) return false;
        if (!(mat.isMeshStandardMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial || mat.isMeshToonMaterial)) return false;
        if (typeof groundMat !== 'undefined' && mat === groundMat) return false;
        // userData bisa diganti kode lain setelah dipasang; penanda di fungsinya mencegah pembungkusan ganda
        if (mat.onBeforeCompile && mat.onBeforeCompile.__pandoraWeather) {
            mat.userData.weatherPatched = true;
            return false;
        }
        mat.userData.weatherPatched = true;
        const prevCompile = mat.onBeforeCompile;
        const prevKey = mat.customProgramCacheKey;
        mat.onBeforeCompile = function (shader, renderer) {
            if (prevCompile) prevCompile.call(this, shader, renderer);
            shader.uniforms.uSnowCover = WEATHER_UNIFORMS.uSnowCover;
            shader.uniforms.uWetness = WEATHER_UNIFORMS.uWetness;
            // Shader sudah berisi kode cuaca (material salinan yang ikut membawa pembungkus lama)
            if (shader.fragmentShader.includes('varying vec3 vWeatherNormal;')) return;
            // Salju dikunci ke TUBUH, bukan ke dunia:
            // - normal dari pose istirahat (sebelum animasi tulang) yang hanya diputar oleh objeknya, jadi
            //   batas salju tidak bergeser saat lengan/badan berayun;
            // - pola bintik dari posisi pose istirahat dalam meter (ruang objek), jadi pola ikut bergerak
            //   bersama tubuh dan nilainya kecil (presisi GPU ponsel tetap cukup, tanpa pola belah ketupat).
            let vs = shader.vertexShader.replace('#include <common>',
                '#include <common>\nvarying vec3 vWeatherNormal;\nvarying vec3 vWeatherLocal;');
            const restBlock = `
                #ifdef USE_INSTANCING
                    vWeatherNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
                #else
                    vWeatherNormal = normalize(mat3(modelMatrix) * objectNormal);
                #endif
                vec3 wScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
                vWeatherLocal = position * wScale;
                #ifdef USE_INSTANCING
                    vWeatherLocal += instanceMatrix[3].xyz * wScale;
                #endif`;
            if (vs.includes('#include <beginnormal_vertex>')) {
                vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + restBlock);
            } else {
                // Material yang mengganti potongan normal sendiri: pakai normal akhir dalam ruang dunia
                vs = vs.replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
                    vWeatherNormal = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
                    vWeatherLocal = position * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));`);
            }
            shader.vertexShader = vs;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
                    uniform float uSnowCover;
                    uniform float uWetness;
                    varying vec3 vWeatherNormal;
                    varying vec3 vWeatherLocal;
                    float wHash(vec3 p) {
                        p = fract(p * 0.3183099 + 0.1);
                        p *= 17.0;
                        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                    }
                    // Value noise 3D halus (interpolasi smoothstep), tanpa tepi sel yang tajam
                    float wNoise(vec3 x) {
                        vec3 i = floor(x);
                        vec3 f = fract(x);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(mix(wHash(i), wHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                                       mix(wHash(i + vec3(0.0, 1.0, 0.0)), wHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                                   mix(mix(wHash(i + vec3(0.0, 0.0, 1.0)), wHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                                       mix(wHash(i + vec3(0.0, 1.0, 1.0)), wHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
                    }`)
                .replace('#include <color_fragment>', `#include <color_fragment>
                    float wSnow = 0.0;
                    if (uSnowCover > 0.001) {
                        // Gumpalan ~20 cm + butiran ~6 cm; tepi lembut seperti salju yang menempel
                        float wN = wNoise(vWeatherLocal * 5.0) * 0.65 + wNoise(vWeatherLocal * 17.0) * 0.35;
                        float wUp = normalize(vWeatherNormal).y + (wN - 0.5) * 0.55;
                        float wLo = 0.6 - uSnowCover * 0.4;
                        wSnow = uSnowCover * smoothstep(wLo, wLo + 0.28, wUp);
                    }
                    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - uWetness * 0.28), vec3(0.93, 0.95, 1.0), wSnow);`);
            if (shader.fragmentShader.includes('#include <roughnessmap_fragment>')) {
                shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
                    roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.7, uWetness * (1.0 - wSnow));`);
            }
        };
        mat.onBeforeCompile.__pandoraWeather = true;
        mat.customProgramCacheKey = function () {
            const base = prevKey ? prevKey.call(this) : '';
            return base.includes('|weather2') ? base : base + '|weather2';
        };
        mat.needsUpdate = true;
        return true;
    },

    // Material baru (musuh yang dispawn, bunshin, objek impor) dipasang berkala selama cuaca aktif
    patchScene() {
        scene.traverse((obj) => {
            if (!obj.isMesh || obj.userData.noWeather || obj.isPoints || obj.isLine) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(mat => this.patchMaterial(mat));
        });
    },

    update(delta) {
        const dt = Math.min(0.1, Math.max(0, delta || 0));
        this.time += dt;
        WEATHER_UNIFORMS.uWeatherTime.value = this.time;
        const t = this.targets();
        this.precip = this.approach(this.precip, t.precip, WEATHER_RATES.precip, dt);
        this.overcast = this.approach(this.overcast, t.overcast, WEATHER_RATES.overcast, dt);
        this.wet = this.approach(this.wet, t.wet, WEATHER_RATES.wet, dt);
        this.puddle = this.approach(this.puddle, t.puddle, WEATHER_RATES.puddle, dt);
        this.snowCover = this.approach(this.snowCover, t.snow, WEATHER_RATES.snow, dt);
        this.applyUniforms();

        // Mendung juga diterapkan sekali lagi saat kembali 0, supaya langit & cahaya pulih persis
        if (this.overcast > 0 || this.overcastApplied > 0) {
            this.applyOvercast();
            this.overcastApplied = this.overcast;
        }
        const active = this.type !== 'clear' || this.precip > 0 || this.wet > 0 || this.snowCover > 0;
        if (!active) {
            if (this.rain) this.rain.visible = false;
            if (this.snow) this.snow.visible = false;
            if (this.splash) this.splash.visible = false;
            this.updateAudio();
            return;
        }
        this.ensureBuilt();

        this.patchTimer -= dt;
        if (this.patchTimer <= 0) {
            this.patchTimer = 2;
            this.patchScene();
        }

        const center = camera.position;
        const pixelScale = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        const windSlider = document.getElementById('slider-wind-speed');
        const wind = windSlider ? parseFloat(windSlider.value) || 1 : 1;

        // Di atas "deras": butir lebih cepat & panjang, angin kencang berembus (gust), lebih pekat
        const storm = Math.max(0, this.precip - 1) / (WEATHER_MAX_INTENSITY - 1);
        const gust = 1 + storm * (1.6 + Math.sin(this.time * 0.7) * 0.6 + Math.sin(this.time * 2.3) * 0.25);
        const rainAmount = this.type === 'rain' ? this.precip : 0;
        this.rain.visible = rainAmount > 0.01;
        if (this.rain.visible) {
            const u = this.rain.material.uniforms;
            u.uAmount.value = rainAmount / WEATHER_MAX_INTENSITY;
            u.uCenter.value.copy(center);
            u.uWind.value.set(1.4 * wind * gust, 0.7 * wind * gust);
            u.uSpeedScale.value = 1 + storm * 0.45;
            u.uOpacity.value = 0.55 + storm * 0.2;
        }
        const snowAmount = this.type === 'snow' ? this.precip : 0;
        this.snow.visible = snowAmount > 0.01;
        if (this.snow.visible) {
            const u = this.snow.material.uniforms;
            u.uAmount.value = snowAmount / WEATHER_MAX_INTENSITY;
            u.uCenter.value.copy(center);
            u.uPixelScale.value = pixelScale;
            u.uWind.value.set(1.0 * wind * gust * (1 + storm * 2.5), 0.5 * wind * gust * (1 + storm * 2.5));
        }
        this.splash.material.uniforms.uPixelScale.value = pixelScale;
        this.updateWalkers(dt);
        this.updateSplashes(dt);
        this.updateAudio();
    },

    serialize() {
        return { type: this.type, intensity: Math.round(this.intensity * 100) / 100 };
    }
};
window.PandoraWeather = PandoraWeather;

// ---------- Panel Studio (elemen hanya ada di Studio) ----------
(function bindWeatherControls() {
    const select = document.getElementById('select-weather');
    const slider = document.getElementById('slider-weather-intensity');
    const label = document.getElementById('val-weather-intensity');
    if (!select) return;
    if (slider) slider.max = String(WEATHER_MAX_INTENSITY);
    const refresh = () => {
        if (slider) slider.disabled = select.value === 'clear';
        if (label && slider) {
            const v = parseFloat(slider.value);
            const level = WEATHER_LEVELS.find(l => v <= l.upTo);
            label.textContent = select.value === 'clear' ? Math.round(v * 100) + '%' : (select.value === 'snow' ? level.snow : level.rain);
            label.title = `Intensitas ${Math.round(v * 100)}%`;
        }
    };
    select.addEventListener('change', () => {
        PandoraWeather.set(select.value, slider ? parseFloat(slider.value) : undefined);
        refresh();
    });
    if (slider) slider.addEventListener('input', () => {
        PandoraWeather.set(select.value, parseFloat(slider.value));
        refresh();
    });
    refresh();
    window.refreshWeatherControls = refresh;
})();
