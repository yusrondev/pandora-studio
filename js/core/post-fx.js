/* =========================================================
   EFEK LAYAR KHUSUS PC: berkas cahaya, pendar matahari, dan sedikit bloom
   Berkas cahaya dihitung dari area langit di gambar, jadi cahaya benar-benar lolos
   lewat celah daun dan ranting. Titik awal tiap sinar diacak lalu hasilnya diblur,
   sehingga berkasnya lembut tanpa garis-garis. Butuh render tambahan satu layar penuh, karena itu
   hanya aktif pada preset dengan postFx.
   ========================================================= */
const POST_FX_BLOOM_STRENGTH = 0.14;
const POST_FX_SHAFT_STRENGTH = 0.85;
const POST_FX_GLOW = 0.14;
const SUN_MOTE_COUNT = 150;
const SUN_MOTE_BOX = 16;

const PandoraPostFX = {
    target: null,
    lightTarget: null,
    blurTarget: null,
    quad: null,
    sun: new THREE.Vector3(),

    enabled() {
        const mode = PandoraSettings.preset().postFx;
        if (!isPlayMode) return false;
        if (mode === 'lite') return true;
        return mode === true && renderer.capabilities.isWebGL2;
    },

    // Versi ponsel: tanpa MSAA, berkas cahaya di 1/4 resolusi dengan sampel lebih sedikit, tanpa bloom
    isLite() {
        return PandoraSettings.preset().postFx === 'lite';
    },

    ensureTargets(width, height, lite) {
        if (this.target && this.target.width === width && this.target.height === height && this.targetLite === lite) return;
        if (this.target) {
            this.target.dispose();
            this.lightTarget.dispose();
            this.blurTarget.dispose();
        }
        // Encoding sama dengan layar agar shader dunia tidak perlu dikompilasi ulang
        const colorOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            encoding: renderer.outputEncoding
        };
        if (lite) {
            this.target = new THREE.WebGLRenderTarget(width, height, colorOptions);
        } else {
            this.target = new THREE.WebGLMultisampleRenderTarget(width, height, colorOptions);
            this.target.samples = 4;
        }
        this.targetLite = lite;
        const shift = lite ? 2 : 1;
        const lightOptions = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
        this.lightTarget = new THREE.WebGLRenderTarget(Math.max(1, width >> shift), Math.max(1, height >> shift), lightOptions);
        this.blurTarget = new THREE.WebGLRenderTarget(Math.max(1, width >> shift), Math.max(1, height >> shift), lightOptions);
    },

    makeMaterial(vertexShader, fragmentShader, uniforms) {
        return new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false, uniforms, vertexShader, fragmentShader });
    },

    getQuad() {
        if (this.quad) return this.quad;
        const fullscreenVertex = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;
        // rgb = bloom bagian sangat terang, alpha = berkas cahaya
        const lightFragment = (shaftTaps, bloomTaps) => `
            #define SHAFT_TAPS ${shaftTaps}
            #define BLOOM_TAPS ${bloomTaps}
            uniform sampler2D tColor;
            uniform vec2 uTexel;
            uniform vec2 uSun;
            uniform float uFacing;
            uniform float uAspect;
            varying vec2 vUv;
            // Sumber berkas: langit TERBUKA yang terang di sekitar matahari (cakram, aureole, celah biru).
            // Badan awan putih tidak dihitung (kecerahannya di bawah ambang), jadi berkas keluar dari sela
            // awan dan dedaunan, bukan dari seluruh awan. Makin jauh dari matahari makin lemah.
            float skyMask(vec2 uv, vec3 c) {
                float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
                vec2 d = (uv - uSun) * vec2(uAspect, 1.0);
                float near = exp(-dot(d, d) * 3.5);
                float bright = smoothstep(0.88, 0.995, luma);
                float blueGap = smoothstep(0.08, 0.22, c.b - c.r) * smoothstep(0.35, 0.6, luma) * 0.35;
                return max(bright, blueGap) * mix(0.25, 1.0, near);
            }
            void main() {
                vec3 bloom = vec3(0.0);
                for (int i = 0; i < BLOOM_TAPS; i++) {
                    float t = (float(i) + 0.5) / float(BLOOM_TAPS);
                    float angle = float(i) * 2.39996;
                    vec3 c = texture2D(tColor, vUv + vec2(cos(angle), sin(angle)) * sqrt(t) * uTexel * 18.0).rgb;
                    bloom += c * smoothstep(0.86, 1.0, dot(c, vec3(0.2126, 0.7152, 0.0722)));
                }
                float shaft = 0.0;
                if (uFacing > 0.001) {
                    vec2 step = (uSun - vUv) * 0.9 / float(SHAFT_TAPS);
                    // Pengacakan titik awal menghapus pita-pita akibat jumlah sampel terbatas
                    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                    vec2 uv = vUv + step * jitter;
                    float decay = 1.0;
                    float total = 0.0;
                    for (int i = 0; i < SHAFT_TAPS; i++) {
                        uv += step;
                        shaft += skyMask(uv, texture2D(tColor, uv).rgb) * decay;
                        total += decay;
                        decay *= 0.965;
                    }
                    shaft = shaft / total * uFacing;
                }
                gl_FragColor = vec4(bloom / max(1.0, float(BLOOM_TAPS)), shaft);
            }
        `;
        const lightUniforms = () => ({
            tColor: { value: null },
            uTexel: { value: new THREE.Vector2() },
            uSun: { value: new THREE.Vector2() },
            uFacing: { value: 0 },
            uAspect: { value: 1 }
        });
        const light = this.makeMaterial(fullscreenVertex, lightFragment(40, 8), lightUniforms());
        // Ponsel: separuh sampel berkas (pita diredam blur + resolusi 1/4) dan tanpa bloom
        const lightLite = this.makeMaterial(fullscreenVertex, lightFragment(20, 0), lightUniforms());
        // Blur dua arah melebur pengacakan menjadi berkas yang halus
        const blur = this.makeMaterial(fullscreenVertex, `
            uniform sampler2D tLight;
            uniform vec2 uDirection;
            varying vec2 vUv;
            void main() {
                vec4 sum = texture2D(tLight, vUv) * 0.2270270;
                sum += (texture2D(tLight, vUv + uDirection * 1.3846) + texture2D(tLight, vUv - uDirection * 1.3846)) * 0.3162162;
                sum += (texture2D(tLight, vUv + uDirection * 3.2308) + texture2D(tLight, vUv - uDirection * 3.2308)) * 0.0702703;
                gl_FragColor = sum;
            }
        `, {
            tLight: { value: null },
            uDirection: { value: new THREE.Vector2() }
        });
        const composite = this.makeMaterial(`
            uniform sampler2D tColor;
            uniform vec3 uSun;
            varying vec2 vUv;
            varying float vVisible;
            void main() {
                vUv = uv;
                // Flare hanya saat CAKRAM matahari terlihat (putih jenuh). Awan putih atau daun di depannya
                // lebih redup dari cakram, jadi flare ikut padam. Cukup dinilai sekali di verteks.
                float visible = 0.0;
                for (int x = -1; x <= 1; x++) {
                    for (int y = -1; y <= 1; y++) {
                        vec3 c = texture2D(tColor, uSun.xy + vec2(float(x), float(y)) * 0.005).rgb;
                        visible += smoothstep(0.93, 0.995, min(c.r, min(c.g, c.b)));
                    }
                }
                vVisible = visible / 9.0 * uSun.z;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `, `
            uniform sampler2D tColor;
            uniform sampler2D tLight;
            uniform vec3 uSun;
            uniform vec3 uStrength; // bloom, berkas, pendar
            uniform float uAspect;
            varying vec2 vUv;
            varying float vVisible;
            vec3 screen(vec3 a, vec3 b) {
                return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0));
            }
            void main() {
                vec3 color = texture2D(tColor, vUv).rgb;
                vec4 light = texture2D(tLight, vUv);
                color = screen(color, light.rgb * uStrength.x);
                color = screen(color, vec3(1.0, 0.95, 0.84) * light.a * uStrength.y);
                float dist = length((vUv - uSun.xy) * vec2(uAspect, 1.0));
                color = screen(color, vec3(1.0, 0.94, 0.82) * exp(-dist * dist * 5.0) * uStrength.z * vVisible);
                // Lens flare: bayangan lensa samar di garis matahari -> tengah layar, hanya saat matahari terlihat
                vec3 flare = vec3(0.0);
                vec2 axis = vec2(0.5) - uSun.xy;
                for (int i = 0; i < 4; i++) {
                    float t = float(i) == 0.0 ? 0.55 : (float(i) == 1.0 ? 1.15 : (float(i) == 2.0 ? 1.55 : 1.9));
                    float r = float(i) == 0.0 ? 0.035 : (float(i) == 1.0 ? 0.08 : (float(i) == 2.0 ? 0.025 : 0.12));
                    vec3 tint = float(i) == 0.0 ? vec3(1.0, 0.8, 0.5) : (float(i) == 1.0 ? vec3(0.55, 0.85, 1.0) : (float(i) == 2.0 ? vec3(1.0, 0.65, 0.4) : vec3(0.5, 1.0, 0.75)));
                    float d = length((vUv - (uSun.xy + axis * t)) * vec2(uAspect, 1.0));
                    flare += tint * smoothstep(r, r * 0.55, d) * 0.06;
                }
                // Halo cincin tipis mengelilingi matahari
                flare += vec3(1.0, 0.9, 0.75) * smoothstep(0.02, 0.0, abs(dist - 0.32)) * 0.035;
                color = screen(color, flare * vVisible);
                gl_FragColor = vec4(color, 1.0);
            }
        `, {
            tColor: { value: null },
            tLight: { value: null },
            uStrength: { value: new THREE.Vector3(POST_FX_BLOOM_STRENGTH, POST_FX_SHAFT_STRENGTH, POST_FX_GLOW) },
            uSun: { value: new THREE.Vector3() },
            uAspect: { value: 1 }
        });
        const quadScene = new THREE.Scene();
        const mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), light);
        mesh.frustumCulled = false;
        quadScene.add(mesh);
        this.quad = { scene: quadScene, camera: new THREE.Camera(), mesh, light, lightLite, blur, composite };
        return this.quad;
    },

    render() {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const width = Math.max(1, size.x);
        const height = Math.max(1, size.y);
        const lite = this.isLite();
        this.ensureTargets(width, height, lite);
        const quad = this.getQuad();
        const lightMat = lite ? quad.lightLite : quad.light;

        renderer.setRenderTarget(this.target);
        renderer.render(scene, camera);

        // Matahari di layar; di belakang kamera berarti tidak ada berkas maupun flare
        this.sun.copy(sunLight.position).sub(sunLight.target.position).normalize();
        const facing = THREE.MathUtils.smoothstep(this.sun.dot(camera.getWorldDirection(new THREE.Vector3())), 0.05, 0.5);
        this.sun.multiplyScalar(500).add(camera.position).project(camera);
        const sunU = this.sun.x * 0.5 + 0.5;
        const sunV = this.sun.y * 0.5 + 0.5;

        quad.mesh.material = lightMat;
        lightMat.uniforms.tColor.value = this.target.texture;
        lightMat.uniforms.uTexel.value.set(1 / width, 1 / height);
        lightMat.uniforms.uSun.value.set(sunU, sunV);
        lightMat.uniforms.uFacing.value = facing;
        lightMat.uniforms.uAspect.value = width / height;
        renderer.setRenderTarget(this.lightTarget);
        renderer.render(quad.scene, quad.camera);

        quad.mesh.material = quad.blur;
        // Satu texel target cahaya (1/2 atau 1/4 layar)
        const texelX = (lite ? 4 : 2) / width;
        const texelY = (lite ? 4 : 2) / height;
        quad.blur.uniforms.tLight.value = this.lightTarget.texture;
        quad.blur.uniforms.uDirection.value.set(texelX, 0);
        renderer.setRenderTarget(this.blurTarget);
        renderer.render(quad.scene, quad.camera);
        quad.blur.uniforms.tLight.value = this.blurTarget.texture;
        quad.blur.uniforms.uDirection.value.set(0, texelY);
        renderer.setRenderTarget(this.lightTarget);
        renderer.render(quad.scene, quad.camera);
        renderer.setRenderTarget(null);

        const uniforms = quad.composite.uniforms;
        uniforms.tColor.value = this.target.texture;
        uniforms.tLight.value = this.lightTarget.texture;
        uniforms.uAspect.value = width / height;
        uniforms.uSun.value.set(sunU, sunV, facing);
        quad.mesh.material = quad.composite;
        renderer.render(quad.scene, quad.camera);
    }
};
window.PandoraPostFX = PandoraPostFX;

// Debu halus yang melayang dan berkilau di udara, seperti di video. Seluruh gerak di shader, tanpa beban CPU.
const PandoraSunMotes = {
    points: null,
    uniforms: { uTime: { value: 0 }, uCamera: { value: new THREE.Vector3() }, uPixelScale: { value: 400 } },

    build() {
        const seeds = new Float32Array(SUN_MOTE_COUNT * 4);
        for (let i = 0; i < SUN_MOTE_COUNT * 4; i++) seeds[i] = Math.random();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SUN_MOTE_COUNT * 3), 3));
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                attribute vec4 aSeed;
                uniform float uTime;
                uniform vec3 uCamera;
                uniform float uPixelScale;
                varying float vAlpha;
                void main() {
                    // Partikel berputar dalam kotak yang selalu mengikuti kamera
                    vec3 drift = vec3(sin(uTime * 0.21 + aSeed.w * 6.28) * 0.7, uTime * (0.03 + aSeed.w * 0.05), cos(uTime * 0.17 + aSeed.x * 6.28) * 0.7);
                    vec3 box = vec3(${SUN_MOTE_BOX.toFixed(1)});
                    vec3 p = mod(aSeed.xyz * box + drift - uCamera, box) - box * 0.5 + uCamera;
                    vec4 mv = viewMatrix * vec4(p, 1.0);
                    float depth = max(0.2, -mv.z);
                    gl_PointSize = (0.012 + aSeed.w * 0.016) * uPixelScale / depth;
                    float twinkle = 0.45 + 0.55 * sin(uTime * (0.8 + aSeed.y * 1.6) + aSeed.z * 40.0);
                    vAlpha = 0.55 * twinkle * twinkle * smoothstep(1.2, 3.0, depth) * (1.0 - smoothstep(5.0, 8.0, depth));
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: `
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * pow(max(0.0, 1.0 - d), 2.0) * vAlpha, 1.0);
                }
            `
        });
        this.points = new THREE.Points(geometry, material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 4;
        scene.add(this.points);
    },

    update(realDelta) {
        if (!this.points) this.build();
        // Debu dimatikan di tingkat paling ringan
        this.points.visible = isPlayMode && PandoraSettings.preset().shafts > 0;
        if (!this.points.visible) return;
        this.uniforms.uTime.value += realDelta;
        this.uniforms.uCamera.value.copy(camera.position);
        this.uniforms.uPixelScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    }
};
window.PandoraSunMotes = PandoraSunMotes;

// Berkas cahaya 3D yang jatuh dari tajuk pohon dan celah batu. Berbeda dari efek layar,
// berkas ini tetap terlihat walau kamera tidak menghadap matahari, dan juga berjalan di ponsel.
const LIGHT_SHAFTS_PER_TREE = 3;
const LIGHT_SHAFTS_MAX = 900;
const LIGHT_SHAFT_ROCK_LENGTH = 7;
const LIGHT_SHAFT_FADE_START = 0.72; // Arah matahari ke atas: sekitar 46 derajat dari cakrawala
const LIGHT_SHAFT_FADE_END = 0.92;   // Sekitar 67 derajat
const PandoraLightShafts = {
    mesh: null,
    builtFor: '',
    uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uCamera: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uStrength: { value: 1 }
    },

    create() {
        const base = new THREE.PlaneBufferGeometry(1, 1, 1, 6);
        base.translate(0, 0.5, 0);
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.index = base.index;
        geometry.setAttribute('position', base.attributes.position);
        geometry.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(new Float32Array(LIGHT_SHAFTS_MAX * 3), 3));
        geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(LIGHT_SHAFTS_MAX * 3), 3));
        geometry.instanceCount = 0;
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            vertexShader: `
                attribute vec3 aAnchor;
                attribute vec3 aSeed; // lebar, panjang, acak
                uniform vec3 uSun;
                uniform vec3 uCamera;
                varying vec2 vShaft;
                varying float vSeed;
                varying float vFade;
                void main() {
                    float along = position.y;
                    vec3 center = aAnchor + uSun * along * aSeed.y;
                    // Selalu menghadap kamera di sekitar sumbu sinar
                    vec3 side = normalize(cross(uSun, uCamera - center));
                    // Sinar sedikit melebar ke arah tanah
                    vec3 world = center + side * position.x * aSeed.x * (1.5 - along * 0.75);
                    vShaft = vec2(position.x * 2.0, along);
                    vSeed = aSeed.z;
                    vec4 mv = viewMatrix * vec4(world, 1.0);
                    // Dari sangat dekat sinar memudar agar tidak menutup layar
                    vFade = smoothstep(1.5, 6.0, -mv.z);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uStrength;
                varying vec2 vShaft;
                varying float vSeed;
                varying float vFade;
                void main() {
                    float edge = 1.0 - abs(vShaft.x);
                    float ends = smoothstep(0.0, 0.18, vShaft.y) * (1.0 - smoothstep(0.55, 1.0, vShaft.y));
                    float streak = 0.72 + 0.28 * sin(vShaft.x * 7.0 + vSeed * 40.0);
                    float breathe = 0.72 + 0.28 * sin(uTime * (0.25 + vSeed * 0.4) + vSeed * 30.0);
                    float light = edge * edge * ends * streak * breathe * vFade * uStrength * 0.15;
                    gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * light, 1.0);
                }
            `
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        scene.add(this.mesh);
    },

    // Sinar ditempatkan di bawah tajuk pohon dan di sisi batu besar
    rebuild() {
        const geometry = this.mesh.geometry;
        const anchors = geometry.attributes.aAnchor;
        const seeds = geometry.attributes.aSeed;
        const fraction = PandoraSettings.preset().shafts;
        let count = 0;
        const add = (x, z, width, length) => {
            if (count >= LIGHT_SHAFTS_MAX * fraction) return;
            anchors.setXYZ(count, x, getTerrainHeightFast(x, z), z);
            seeds.setXYZ(count, width, length, Math.random());
            count++;
        };
        treesList.forEach((tree) => {
            const crown = (tree.userData.isPine ? tree.userData.baseTrunkHeight || 12 : 6) * 0.7;
            for (let i = 0; i < LIGHT_SHAFTS_PER_TREE; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 0.8 + Math.random() * 3.4;
                // Sinar berhenti di tajuk, jadi tidak menggores langit
                add(tree.position.x + Math.cos(angle) * distance, tree.position.z + Math.sin(angle) * distance, 0.4 + Math.random() * 1.0, crown * (0.8 + Math.random() * 0.4));
            }
        });
        rocksList.forEach((rock) => {
            if (rock.scale.y < 2.5) return;
            const angle = Math.random() * Math.PI * 2;
            add(rock.position.x + Math.cos(angle) * rock.scale.x, rock.position.z + Math.sin(angle) * rock.scale.z, 0.6 + Math.random() * 1.2, LIGHT_SHAFT_ROCK_LENGTH);
        });
        geometry.instanceCount = count;
        anchors.needsUpdate = true;
        seeds.needsUpdate = true;
    },

    update(realDelta) {
        if (!this.mesh) this.create();
        const fraction = PandoraSettings.preset().shafts;
        this.mesh.visible = isPlayMode && fraction > 0;
        if (!this.mesh.visible) return;
        const signature = treesList.length + ':' + rocksList.length + ':' + fraction;
        if (signature !== this.builtFor) {
            this.builtFor = signature;
            this.rebuild();
        }
        this.uniforms.uSun.value.copy(sunLight.position).sub(sunLight.target.position).normalize();
        this.uniforms.uCamera.value.copy(camera.position);
        this.uniforms.uTime.value += realDelta;
        // Mengikuti kekuatan matahari, jadi malam hari sinarnya hilang
        // Sinar tegak lurus dari matahari di atas kepala tampak seperti tiang, jadi hanya muncul saat matahari miring
        const slanted = 1 - THREE.MathUtils.smoothstep(this.uniforms.uSun.value.y, LIGHT_SHAFT_FADE_START, LIGHT_SHAFT_FADE_END);
        this.uniforms.uStrength.value = Math.min(1.2, sunLight.intensity / 1.5) * slanted;
        this.mesh.visible = slanted > 0;
    }
};
window.PandoraLightShafts = PandoraLightShafts;
