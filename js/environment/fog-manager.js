/* =========================================================
   REALISTIC BRUSHABLE FOG MANAGER (100% Ported from kabut.html)
   Procedural FBM Noise Texture + Instanced Billboard Particles +
   Dynamic Canvas Mask Brush Engine + Terrain Height Integration
   ========================================================= */

(function () {
    // 1. TEKSTUR GUMPALAN KABUT (NOISE FBM 100% PERSIS KABUT.HTML)
    function makeTexture() {
        const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
        const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
        const G = 16, grid = new Float32Array(G * G * 4);
        const rnd = new Float32Array(64 * 64);
        for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
        const sm = t => t * t * (3 - 2 * t);
        function vn(x, y) {
            const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
            const h = (a, b) => rnd[((b & 63) * 64) + (a & 63)];
            const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1);
            return a + (b - a) * xf + (c - a) * yf + (a - b - c + e) * xf * yf;
        }
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const u = x / N, v = y / N;
                let f = 0, amp = .5, fr = 3;
                for (let o = 0; o < 5; o++) {
                    f += amp * vn(u * fr + o * 7.3, v * fr + o * 3.1);
                    amp *= .5;
                    fr *= 2;
                }
                const r = Math.hypot(u - .5, v - .5) * 2;
                let fall = Math.max(0, 1 - r);
                fall = fall * fall * (3 - 2 * fall);
                const a = Math.max(0, Math.min(1, (f - .28) * 1.9)) * fall;
                const k = (y * N + x) * 4;
                img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * a;
                img.data[k + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(cv);
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = 4;
        return t;
    }

    // 2. MASK BRUSH CANVAS SYSTEM
    // Kabut hanya muncul di area yang di-brush oleh user
    const fogMaskResolution = 512;
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = fogMaskResolution;
    fogCanvas.height = fogMaskResolution;
    const fogCtx = fogCanvas.getContext('2d');
    fogCtx.clearRect(0, 0, fogMaskResolution, fogMaskResolution);

    const fogMaskTexture = new THREE.CanvasTexture(fogCanvas);
    fogMaskTexture.minFilter = THREE.LinearFilter;
    fogMaskTexture.magFilter = THREE.LinearFilter;
    fogMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
    fogMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
    fogMaskTexture.flipY = false;
    fogMaskTexture.needsUpdate = true;

    // 3. PARAMETER & DEFAULTS (PERSIS DARI KABUT.HTML)
    const MAX_FOG_INSTANCES = 6000;
    const groundSizeVal = (typeof groundSize !== 'undefined') ? groundSize : 80;

    const DEF = {
        count: 2200,
        size: 11,
        opacity: 0.12,
        height: 5,
        area: groundSizeVal,
        speed: 0.6,
        wind: 40,
        turb: 1.2,
        light: 1.6,
        range: 12,
        exposure: 1
    };
    const P = Object.assign({}, DEF);
    let fogHex = '#9fb4c4';
    let lightHex = '#ffb561';

    const LANTERN = new THREE.Vector3(0, 2.2, 0);

    // 4. INSTANCED QUAD BILLBOARD GEOMETRY (PERSIS KABUT.HTML)
    const baseGeo = new THREE.PlaneBufferGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseGeo.index;
    geo.setAttribute('position', baseGeo.attributes.position);

    const offA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOG_INSTANCES * 3), 3);
    const varA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOG_INSTANCES * 2), 2);
    geo.setAttribute('aOff', offA);
    geo.setAttribute('aVar', varA);

    function reseed() {
        for (let i = 0; i < MAX_FOG_INSTANCES; i++) {
            offA.array[i * 3] = Math.random();
            offA.array[i * 3 + 1] = Math.pow(Math.random(), 1.4);
            offA.array[i * 3 + 2] = Math.random();
            varA.array[i * 2] = Math.random();
            varA.array[i * 2 + 1] = Math.random();
        }
        offA.needsUpdate = varA.needsUpdate = true;
    }
    reseed();

    // 5. SHADER UNIFORMS & MATERIAL (PERSIS DARI KABUT.HTML DENGAN DUKUNGAN BRUSH MASK)
    const dummyHeightTex = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    dummyHeightTex.needsUpdate = true;

    const U = {
        uTex: { value: makeTexture() },
        uFogMask: { value: fogMaskTexture },
        uTerrainHeightMap: { value: (typeof terrainHeightTexture !== 'undefined' ? terrainHeightTexture : dummyHeightTex) },
        uGroundSize: { value: groundSizeVal },
        uTime: { value: 0 },
        uSize: { value: P.size },
        uHeight: { value: P.height },
        uBox: { value: new THREE.Vector3(P.area, 1, P.area) },
        uWind: { value: new THREE.Vector2(1, 0) },
        uTurb: { value: P.turb },
        uColor: { value: new THREE.Color(fogHex) },
        uLightColor: { value: new THREE.Color(lightHex) },
        uLightPos: { value: LANTERN.clone() },
        uLightRange: { value: P.range },
        uLightInt: { value: P.light },
        uOpacity: { value: P.opacity },
        uExp: { value: P.exposure }
    };

    const mat = new THREE.ShaderMaterial({
        uniforms: U,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        vertexShader: `
            attribute vec3 aOff;
            attribute vec2 aVar;
            uniform float uTime, uSize, uHeight, uTurb, uLightRange, uGroundSize;
            uniform vec3 uBox, uLightPos;
            uniform vec2 uWind;
            uniform sampler2D uFogMask;
            uniform sampler2D uTerrainHeightMap;
            varying vec2 vUv;
            varying float vA, vLit;

            void main(){
                float s = aVar.y;
                vec2 xz = fract(aOff.xz + uWind * uTime * (0.5 + s) / uBox.xz);
                float h = aOff.y;
                vec3 wp = vec3((xz.x - 0.5) * uBox.x, h * uHeight, (xz.y - 0.5) * uBox.z);
                wp.x += sin(uTime * 0.23 + s * 40.0) * uTurb;
                wp.z += cos(uTime * 0.19 + s * 27.0) * uTurb;
                wp.y += sin(uTime * 0.31 + s * 53.0) * 0.35 * uTurb;

                // Koordinat UV pada kanvas kuas (masking hanya di area yang di-brush)
                vec2 maskUv = vec2((wp.x + uGroundSize * 0.5) / uGroundSize, (wp.z + uGroundSize * 0.5) / uGroundSize);
                float fogMask = 0.0;
                float groundY = 0.0;
                if (maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) {
                    fogMask = texture2D(uFogMask, maskUv).r;
                    groundY = texture2D(uTerrainHeightMap, maskUv).r;
                }
                wp.y += groundY;

                float edge = smoothstep(0.0, 0.14, xz.x) * smoothstep(1.0, 0.86, xz.x) * smoothstep(0.0, 0.14, xz.y) * smoothstep(1.0, 0.86, xz.y);
                vA = edge * pow(sin(clamp(h, 0.02, 0.98) * 3.14159), 0.6) * fogMask;

                vec4 mv = viewMatrix * vec4(wp, 1.0);
                float sz = uSize * (0.55 + 0.9 * aVar.x);
                float ang = s * 6.2831 + uTime * 0.04 * (s - 0.5) * 4.0;
                float c = cos(ang), sn = sin(ang);
                vec2 q = position.xy * sz;
                mv.xy += vec2(c * q.x - sn * q.y, sn * q.x + c * q.y);
                vUv = position.xy + 0.5;
                vA *= smoothstep(0.4, 5.0, -mv.z);
                vLit = exp(-distance(wp, uLightPos) / uLightRange);
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: `
            uniform sampler2D uTex;
            uniform vec3 uColor, uLightColor;
            uniform float uOpacity, uLightInt, uExp;
            varying vec2 vUv;
            varying float vA, vLit;

            void main(){
                float a = texture2D(uTex, vUv).r * vA * uOpacity;
                if (a < 0.001) discard;
                vec3 col = (uColor + uLightColor * uLightInt * vLit * 1.6) * uExp;
                gl_FragColor = vec4(col, a);
            }
        `
    });

    const fogMesh = new THREE.Mesh(geo, mat);
    fogMesh.frustumCulled = false;
    fogMesh.renderOrder = 8;
    if (typeof scene !== 'undefined' && scene) {
        scene.add(fogMesh);
    } else {
        const checkScene = setInterval(() => {
            if (typeof scene !== 'undefined' && scene) {
                scene.add(fogMesh);
                clearInterval(checkScene);
            }
        }, 100);
    }

    function applyUniforms() {
        geo.instanceCount = Math.floor(P.count);
        U.uSize.value = P.size;
        U.uHeight.value = P.height;
        U.uBox.value.set(P.area, 1, P.area);
        const a = P.wind * Math.PI / 180;
        U.uWind.value.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4);
        U.uTurb.value = P.turb;
        U.uOpacity.value = P.opacity;
        U.uLightInt.value = P.light;
        U.uLightRange.value = P.range;
        U.uExp.value = P.exposure;
        U.uColor.value.set(fogHex);
        U.uLightColor.value.set(lightHex);
    }
    applyUniforms();

    // 6. LOGIKA BRUSH (LUKIS & HAPUS KABUT)
    let hasAnyFogDrawn = false;
    let lastFogStrokePoint = null;

    function drawFogDot(worldX, worldZ, radius, mode) {
        const gs = (typeof groundSize !== 'undefined') ? groundSize : 80;
        const halfSize = gs / 2;
        const normX = (worldX + halfSize) / gs;
        const normZ = (worldZ + halfSize) / gs;

        if (normX < -0.1 || normX > 1.1 || normZ < -0.1 || normZ > 1.1) return;

        const cx = normX * fogMaskResolution;
        const cy = normZ * fogMaskResolution;
        const pixelRadius = Math.max(4, (radius / gs) * fogMaskResolution);

        const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, pixelRadius);

        if (mode === 'paint') {
            grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.95)');
            grad.addColorStop(0.80, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(0.95, 'rgba(255, 255, 255, 0.10)');
            grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

            fogCtx.globalCompositeOperation = 'source-over';
            fogCtx.fillStyle = grad;
            fogCtx.beginPath();
            fogCtx.arc(cx, cy, pixelRadius, 0, Math.PI * 2);
            fogCtx.fill();
            hasAnyFogDrawn = true;
        } else {
            grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
            grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.95)');
            grad.addColorStop(0.80, 'rgba(0, 0, 0, 0.45)');
            grad.addColorStop(0.95, 'rgba(0, 0, 0, 0.10)');
            grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

            fogCtx.globalCompositeOperation = 'destination-out';
            fogCtx.fillStyle = grad;
            fogCtx.beginPath();
            fogCtx.arc(cx, cy, pixelRadius, 0, Math.PI * 2);
            fogCtx.fill();
        }
    }

    function paintFogAt(hitPoint, radius, mode = 'paint') {
        if (!hitPoint) return;
        if (!lastFogStrokePoint) {
            drawFogDot(hitPoint.x, hitPoint.z, radius, mode);
        } else {
            const dx = hitPoint.x - lastFogStrokePoint.x;
            const dz = hitPoint.z - lastFogStrokePoint.z;
            const dist = Math.hypot(dx, dz);
            const step = Math.max(0.4, radius * 0.28);
            const steps = Math.max(1, Math.ceil(dist / step));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const ix = lastFogStrokePoint.x + dx * t;
                const iz = lastFogStrokePoint.z + dz * t;
                drawFogDot(ix, iz, radius, mode);
            }
        }
        lastFogStrokePoint = { x: hitPoint.x, z: hitPoint.z };
        fogMaskTexture.needsUpdate = true;
    }

    function endFogStroke() {
        lastFogStrokePoint = null;
    }

    function clearAllFog() {
        fogCtx.clearRect(0, 0, fogMaskResolution, fogMaskResolution);
        fogMaskTexture.needsUpdate = true;
        hasAnyFogDrawn = false;
        lastFogStrokePoint = null;
    }

    // 7. PRESETS (100% PERSIS KABUT.HTML)
    const PRESETS = {
        'Tipis': [{ count: 1200, size: 9, opacity: 0.05, height: 3, light: 1.2 }, '#b8c7d4', '#ffb561'],
        'Sedang': [DEF, '#9fb4c4', '#ffb561'],
        'Tebal': [{ count: 3800, size: 14, opacity: 0.16, height: 7, light: 2.2, speed: 0.4 }, '#a9b8c4', '#ffb561'],
        'Mistis': [{ count: 3200, size: 16, opacity: 0.15, height: 9, light: 2.6, speed: 0.35, turb: 2.0 }, '#8a9be0', '#ff8ad8']
    };

    function applyPreset(name) {
        const pr = PRESETS[name];
        if (!pr) return;
        const [o, f, l] = pr;
        Object.assign(P, DEF, o);
        if (f) fogHex = f;
        if (l) lightHex = l;
        applyUniforms();
        syncFogUI();
    }

    function syncFogUI() {
        const inpCount = document.getElementById('slider-fog-count');
        const outCount = document.getElementById('val-fog-count');
        if (inpCount && outCount) { inpCount.value = P.count; outCount.textContent = P.count; }

        const inpSize = document.getElementById('slider-fog-size');
        const outSize = document.getElementById('val-fog-size');
        if (inpSize && outSize) { inpSize.value = P.size; outSize.textContent = (+P.size).toFixed(1); }

        const inpOpac = document.getElementById('slider-fog-opacity');
        const outOpac = document.getElementById('val-fog-opacity');
        if (inpOpac && outOpac) { inpOpac.value = P.opacity; outOpac.textContent = (+P.opacity).toFixed(3); }

        const inpH = document.getElementById('slider-fog-height');
        const outH = document.getElementById('val-fog-height');
        if (inpH && outH) { inpH.value = P.height; outH.textContent = (+P.height).toFixed(1); }

        const inpSpd = document.getElementById('slider-fog-speed');
        const outSpd = document.getElementById('val-fog-speed');
        if (inpSpd && outSpd) { inpSpd.value = P.speed; outSpd.textContent = (+P.speed).toFixed(2); }

        const inpWind = document.getElementById('slider-fog-wind');
        const outWind = document.getElementById('val-fog-wind');
        if (inpWind && outWind) { inpWind.value = P.wind; outWind.textContent = P.wind + '°'; }

        const inpTurb = document.getElementById('slider-fog-turb');
        const outTurb = document.getElementById('val-fog-turb');
        if (inpTurb && outTurb) { inpTurb.value = P.turb; outTurb.textContent = (+P.turb).toFixed(1); }

        const colEl = document.getElementById('picker-fog-color');
        if (colEl) colEl.value = fogHex;

        const lcolEl = document.getElementById('picker-fog-light-color');
        if (lcolEl) lcolEl.value = lightHex;
    }

    // 8. ANIMASI & SINKRONISASI UPDATE LOOP
    let fogClockTime = 0;
    function updateFog(delta, elapsedTime) {
        if (!fogMesh || !fogMesh.visible) return;
        const dt = Math.min(delta, 0.05);
        fogClockTime += dt * P.speed;
        U.uTime.value = fogClockTime;

        if (typeof terrainHeightTexture !== 'undefined' && terrainHeightTexture && U.uTerrainHeightMap.value !== terrainHeightTexture) {
            U.uTerrainHeightMap.value = terrainHeightTexture;
        }

        // Sumber cahaya dalam kabut mengikuti karakter rubah jika ada
        if (typeof wolfCharacter !== 'undefined' && wolfCharacter && wolfCharacter.position) {
            U.uLightPos.value.set(wolfCharacter.position.x, wolfCharacter.position.y + 1.8, wolfCharacter.position.z);
        }
    }

    // Export API ke global window
    window.paintFogAt = paintFogAt;
    window.endFogStroke = endFogStroke;
    window.clearAllFog = clearAllFog;
    window.hasFogDrawn = () => hasAnyFogDrawn;
    window.updateFog = updateFog;
    window.reseedFog = reseed;
    window.applyFogPreset = applyPreset;
    window.fogParams = P;
    window.getFogCanvas = () => fogCanvas;
    window.getFogHex = () => fogHex;
    window.setFogHex = (hex) => { fogHex = hex; applyUniforms(); };
    window.getFogLightHex = () => lightHex;
    window.setFogLightHex = (hex) => { lightHex = hex; applyUniforms(); };
    window.applyFogUniforms = applyUniforms;
    window.syncFogUI = syncFogUI;

    window.exportFogData = function () {
        return {
            hasDrawn: hasAnyFogDrawn,
            mask: hasAnyFogDrawn ? fogCanvas.toDataURL('image/png') : null,
            params: Object.assign({}, P),
            fogHex,
            lightHex
        };
    };

    window.importFogData = function (data) {
        if (!data) return;
        if (data.params) Object.assign(P, data.params);
        if (data.fogHex) fogHex = data.fogHex;
        if (data.lightHex) lightHex = data.lightHex;
        applyUniforms();
        syncFogUI();

        if (data.mask) {
            const img = new Image();
            img.onload = function () {
                fogCtx.globalCompositeOperation = 'source-over';
                fogCtx.clearRect(0, 0, fogMaskResolution, fogMaskResolution);
                fogCtx.drawImage(img, 0, 0);
                fogMaskTexture.needsUpdate = true;
                hasAnyFogDrawn = true;
            };
            img.src = data.mask;
        } else {
            clearAllFog();
        }
    };
})();
