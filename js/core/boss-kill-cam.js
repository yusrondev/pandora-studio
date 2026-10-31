/* =========================================================
   KAMERA ELIMINASI BOSS
   Kamera mendekat ke boss dengan latar blur bokeh, lalu kembali ke kamera permainan.
   Hanya mengganti kamera selama satu render, jadi kamera permainan tidak terganggu.
   ========================================================= */
const KILL_CAM_IN = 0.45;
const KILL_CAM_HOLD = 1.5;
const KILL_CAM_OUT = 0.5;
const KILL_CAM_DISTANCE = 3.4;
const KILL_CAM_HEIGHT = 0.75;
const KILL_CAM_FOV = 30;
const KILL_CAM_SIDE_ANGLE = 0.6;   // Radian dari sumbu pemain-boss, agar pemain tidak menutupi boss
const KILL_CAM_ORBIT = 0.22;       // Radian putaran pelan selama kamera aktif
const KILL_CAM_FOCUS_START = 1.25; // Tinggi titik fokus: dari dada, turun mengikuti tubuh yang rebah
const KILL_CAM_FOCUS_END = 0.6;
const KILL_CAM_BASE_SCALE = 1.85;
const BOKEH_MAX_RADIUS = 0.02;     // Terhadap tinggi layar
const BOKEH_FOCUS_BAND = 1.3;      // Jarak dari titik fokus yang tetap tajam
const BOKEH_FAR_RAMP = 7.0;
const BOKEH_NEAR_RAMP = 1.6;

const BossKillCam = {
    active: false,
    agent: null,
    time: 0,
    startPos: new THREE.Vector3(),
    startFov: 45,
    sideDir: new THREE.Vector3(),
    orbitSign: 1,
    target: null,
    quad: null,
    saved: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 45 },

    start(agent) {
        if (!agent || !agent.root) return;
        if (typeof wolfCharacter === 'undefined' || !wolfCharacter || !wolfCharacter.root) return;
        const boss = agent.root.position;
        const player = wolfCharacter.root.position;
        // Dari sumbu pemain-boss, geser ke sisi yang paling dekat dengan posisi kamera sekarang
        const toPlayer = new THREE.Vector3(player.x - boss.x, 0, player.z - boss.z);
        if (toPlayer.lengthSq() < 0.01) toPlayer.set(0, 0, 1);
        toPlayer.normalize();
        const toCamera = new THREE.Vector3(camera.position.x - boss.x, 0, camera.position.z - boss.z);
        const side = (toPlayer.x * toCamera.z - toPlayer.z * toCamera.x) >= 0 ? -1 : 1;
        this.sideDir.copy(toPlayer).applyAxisAngle(THREE.Object3D.DefaultUp, side * KILL_CAM_SIDE_ANGLE);
        this.orbitSign = side;
        this.startPos.copy(camera.position);
        this.startFov = camera.fov;
        this.agent = agent;
        this.time = 0;
        this.active = true;
        document.body.classList.add('boss-kill-cam');
    },

    stop() {
        this.active = false;
        this.agent = null;
        document.body.classList.remove('boss-kill-cam');
    },

    shouldAbort() {
        if (typeof isPlayMode === 'undefined' || !isPlayMode) return true;
        if (typeof CinematicPlayer !== 'undefined' && CinematicPlayer.active) return true;
        if (typeof PlayerHealthState !== 'undefined' && PlayerHealthState.isDead) return true;
        return !this.agent || !this.agent.root;
    },

    // 0 sampai 1: seberapa jauh kamera sudah bergeser dari kamera permainan
    blendAt(time) {
        const total = KILL_CAM_IN + KILL_CAM_HOLD + KILL_CAM_OUT;
        if (time < KILL_CAM_IN) return THREE.MathUtils.smootherstep(time, 0, KILL_CAM_IN);
        if (time > total - KILL_CAM_OUT) return 1 - THREE.MathUtils.smootherstep(time, total - KILL_CAM_OUT, total);
        return 1;
    },

    // Dipanggil tepat sebelum render dengan waktu nyata, karena permainan sedang melambat
    beforeRender(realDelta) {
        if (!this.active) return;
        if (this.shouldAbort() || this.time >= KILL_CAM_IN + KILL_CAM_HOLD + KILL_CAM_OUT) {
            this.stop();
            return;
        }
        this.time += realDelta;

        this.saved.position.copy(camera.position);
        this.saved.quaternion.copy(camera.quaternion);
        this.saved.fov = camera.fov;

        const total = KILL_CAM_IN + KILL_CAM_HOLD + KILL_CAM_OUT;
        const progress = Math.min(1, this.time / total);
        const blend = this.blendAt(this.time);
        const boss = this.agent.root.position;
        const focusHeight = THREE.MathUtils.lerp(KILL_CAM_FOCUS_START, KILL_CAM_FOCUS_END, progress) * this.scaleFactor();
        const focus = new THREE.Vector3(boss.x, boss.y + focusHeight, boss.z);

        const orbit = this.sideDir.clone().applyAxisAngle(THREE.Object3D.DefaultUp, this.orbitSign * KILL_CAM_ORBIT * progress);
        const close = new THREE.Vector3(
            boss.x + orbit.x * KILL_CAM_DISTANCE,
            boss.y + focusHeight + KILL_CAM_HEIGHT,
            boss.z + orbit.z * KILL_CAM_DISTANCE
        );
        if (typeof getTerrainHeightFast === 'function') {
            close.y = Math.max(close.y, getTerrainHeightFast(close.x, close.z) + 0.5);
        }

        // Masuk dari posisi awal kamera, keluar menuju kamera permainan yang terus berjalan
        const from = this.time < KILL_CAM_IN ? this.startPos : this.saved.position;
        camera.position.lerpVectors(from, close, blend);
        camera.quaternion.copy(this.saved.quaternion);
        camera.lookAt(focus);
        const closeQuaternion = camera.quaternion.clone();
        camera.quaternion.copy(this.saved.quaternion).slerp(closeQuaternion, blend);
        camera.fov = THREE.MathUtils.lerp(this.saved.fov, KILL_CAM_FOV, blend);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();

        this.focusDistance = camera.position.distanceTo(focus);
        this.amount = blend;
    },

    scaleFactor() {
        // Tinggi fokus ditulis untuk skala karakter standar
        const scale = this.agent.root.scale ? this.agent.root.scale.y : KILL_CAM_BASE_SCALE;
        return Math.max(0.6, scale / KILL_CAM_BASE_SCALE);
    },

    supportsBokeh() {
        return renderer.capabilities.isWebGL2 || renderer.extensions.has('WEBGL_depth_texture');
    },

    ensureTarget(width, height) {
        if (this.target && this.target.width === width && this.target.height === height) return this.target;
        if (this.target) {
            this.target.depthTexture.dispose();
            this.target.dispose();
        }
        // Encoding sama dengan layar agar shader dunia tidak perlu dikompilasi ulang
        const target = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            encoding: renderer.outputEncoding,
            stencilBuffer: false
        });
        target.depthTexture = new THREE.DepthTexture(width, height);
        target.depthTexture.type = THREE.UnsignedIntType;
        this.target = target;
        return target;
    },

    getQuad() {
        if (this.quad) return this.quad;
        const material = new THREE.ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
                tColor: { value: null },
                tDepth: { value: null },
                uNear: { value: 0.1 },
                uFar: { value: 1000 },
                uFocus: { value: 4 },
                uAmount: { value: 0 },
                uRadius: { value: BOKEH_MAX_RADIUS },
                uAspect: { value: 1 },
                uBand: { value: BOKEH_FOCUS_BAND },
                uFarRamp: { value: BOKEH_FAR_RAMP },
                uNearRamp: { value: BOKEH_NEAR_RAMP }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                #define TAPS 40
                uniform sampler2D tColor;
                uniform sampler2D tDepth;
                uniform float uNear, uFar, uFocus, uAmount, uRadius, uAspect, uBand, uFarRamp, uNearRamp;
                varying vec2 vUv;

                float circleOfConfusion(vec2 uv) {
                    float z = texture2D(tDepth, uv).r * 2.0 - 1.0;
                    float dist = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
                    float offset = dist - uFocus;
                    float coc = offset > 0.0
                        ? (offset - uBand) / uFarRamp
                        : (-offset - uBand) / uNearRamp;
                    return clamp(coc, 0.0, 1.0);
                }

                void main() {
                    float centerCoc = circleOfConfusion(vUv);
                    vec4 sum = vec4(0.0);
                    // Spiral sudut emas memberi cakram merata; piksel terang diberi bobot lebih agar membentuk bola bokeh
                    for (int i = 0; i < TAPS; i++) {
                        float t = (float(i) + 0.5) / float(TAPS);
                        float angle = float(i) * 2.39996;
                        vec2 offset = vec2(cos(angle) / uAspect, sin(angle)) * sqrt(t) * uRadius * uAmount;
                        vec2 uv = vUv + offset;
                        float sampleCoc = circleOfConfusion(uv);
                        // Objek tajam tidak boleh meluber ke latar yang blur, dan sebaliknya
                        float reach = max(min(sampleCoc, centerCoc * 1.5), 0.02);
                        float weight = smoothstep(sqrt(t) - 0.08, sqrt(t) + 0.08, reach);
                        vec3 color = texture2D(tColor, uv).rgb;
                        float luma = dot(color, vec3(0.299, 0.587, 0.114));
                        weight *= 1.0 + 6.0 * luma * luma * luma * luma;
                        sum += vec4(color * weight, weight);
                    }
                    vec3 sharp = texture2D(tColor, vUv).rgb;
                    gl_FragColor = vec4(sum.a > 0.001 ? sum.rgb / sum.a : sharp, 1.0);
                }
            `
        });
        const scene2 = new THREE.Scene();
        const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), material);
        mesh.frustumCulled = false;
        scene2.add(mesh);
        this.quad = { scene: scene2, camera: new THREE.Camera(), material };
        return this.quad;
    },

    // Kompilasi di balik layar pemuatan supaya momen eliminasi tidak tersendat
    prewarm() {
        if (!this.supportsBokeh()) return;
        const quad = this.getQuad();
        renderer.compile(quad.scene, quad.camera);
        // Alokasi di GPU juga dilakukan sekarang, bukan tepat saat momen eliminasi
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        renderer.setRenderTarget(this.ensureTarget(Math.max(1, size.x), Math.max(1, size.y)));
        renderer.clear();
        renderer.setRenderTarget(null);
    },

    render() {
        if (!this.active || !this.supportsBokeh()) {
            renderer.render(scene, camera);
            return;
        }
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const target = this.ensureTarget(Math.max(1, size.x), Math.max(1, size.y));
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        const quad = this.getQuad();
        const uniforms = quad.material.uniforms;
        uniforms.tColor.value = target.texture;
        uniforms.tDepth.value = target.depthTexture;
        uniforms.uNear.value = camera.near;
        uniforms.uFar.value = camera.far;
        uniforms.uFocus.value = this.focusDistance;
        uniforms.uAmount.value = this.amount;
        uniforms.uAspect.value = size.x / size.y;
        renderer.render(quad.scene, quad.camera);
    },

    afterRender() {
        if (!this.active) return;
        camera.position.copy(this.saved.position);
        camera.quaternion.copy(this.saved.quaternion);
        camera.fov = this.saved.fov;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
    }
};
window.BossKillCam = BossKillCam;
