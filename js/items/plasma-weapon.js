/* ===================================================================
   PANDORA ITEM SYSTEM - PLASMA BAZOOKA WEAPON MODULE
   100% Complete Implementation adapted from plasma.html
   Includes Transformer bazooka mesh, shaders, particle pools,
   fireball missiles, shockwaves, Web Audio synthesis, and Fox mounting.
   Transform animation eliminated for maximum 60FPS performance.
   =================================================================== */

class PlasmaWeapon {
    constructor() {
        this.isInitialized = false;
        this.wolfModel = null;
        this.mountGroup = new THREE.Group();
        this.mountGroup.name = 'PlasmaWeaponMountGroup';

        // Core states from plasma.html
        this.parts = [];
        this.barrelCoreLight = null;
        this.isWeaponState = true; // Permanently in Weapon state (tanpa transform effect demi performa mulus)
        this.isAnimating = false;
        this.lastFireTime = 0;
        this.flash = 0;
        this.glowT = 9;

        // Particle pools & objects from plasma.html
        this.smokePool = null;
        this.firePool = null;
        this.boomL = null;
        this.missL = null;
        this.glowSprite = null;
        this.missiles = [];
        this.shocks = [];

        // Uniforms for shaders
        this.U = { uTime: { value: 0 }, uFlash: { value: 0 } };

        // DOM flash element
        this.flElement = document.getElementById('fl');

        // Web Audio Context
        this.audioCtx = null;

        // Mount offset on Fox: Samping Kanan, Agak Kebawah
        // Posisi di sisi kanan bawah rusuk/badan (x=0.12, y=0.22, z=0.44), sama sekali tidak tertutup kepala dan bebas clipping!
        this.mountOffset = {
            x: 0.12,
            y: 0.22,     // Agak kebawah di samping badan rubah
            z: 0.44,     // Sisi samping kanan rubah
            scale: 0.13,
            pitch: -0.01 // Elevasi halus
        };
    }

    audio() {
        if (!this.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    // ==========================================
    // 1. SHADER & PARTICLE POOL SYSTEM (100% FROM plasma.html)
    // ==========================================
    init() {
        if (this.isInitialized) return;
        if (typeof scene === 'undefined') return;

        this.flElement = document.getElementById('fl');

        const rnd = (a, b) => a + Math.random() * (b - a);
        this.rnd = rnd;

        this.rs = function () {
            let x, y, z;
            do { x = rnd(-1, 1); y = rnd(-1, 1); z = rnd(-1, 1); } while (x * x + y * y + z * z > 1);
            const l = Math.hypot(x, y, z) || 1;
            return [x / l, y / l, z / l];
        };

        const cv = (s) => {
            const c = document.createElement('canvas');
            c.width = c.height = s;
            return [c, c.getContext('2d')];
        };

        this.radTex = (a, b, c) => {
            const [k, g] = cv(128);
            const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
            r.addColorStop(0, a);
            r.addColorStop(0.45, b);
            r.addColorStop(1, c);
            g.fillStyle = r;
            g.fillRect(0, 0, 128, 128);
            return new THREE.CanvasTexture(k);
        };

        this.glowTex = this.radTex('rgba(255,190,110,.9)', 'rgba(255,90,20,.25)', 'rgba(255,60,0,0)');

        const sm = (map) => new THREE.SpriteMaterial({
            map,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            fog: false
        });
        this.sm = sm;
        this.hm = sm(this.glowTex);

        const NOISE = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vn(p);p*=2.07;a*=.5;}return s;}`;

        const VS = `attribute vec3 aPos,aVel;attribute vec4 aM;varying vec2 vUv;varying vec4 vM;
        void main(){vec4 mv=modelViewMatrix*vec4(aPos,1.);float s=aM.x;vec2 o=position.xy*s;
        if(aM.z>.5&&aM.z<1.5){vec2 d=(modelViewMatrix*vec4(aVel,0.)).xy;float l=length(d);vec2 dir=l>1e-4?d/l:vec2(0.,1.);
        o=vec2(-dir.y,dir.x)*position.x*s+dir*position.y*(s+l*.035);}
        mv.xy+=o;vUv=position.xy*2.;vM=aM;gl_Position=projectionMatrix*mv;}`;

        const FIRE = NOISE + `varying vec2 vUv;varying vec4 vM;uniform float uTime;
        vec3 ramp(float t){vec3 c=vec3(0.);c=mix(c,vec3(.55,.05,0.),smoothstep(0.,.25,t));c=mix(c,vec3(1.,.38,.04),smoothstep(.2,.5,t));
        c=mix(c,vec3(1.,.75,.2),smoothstep(.45,.75,t));c=mix(c,vec3(1.,.95,.75),smoothstep(.7,1.,t));return c;}
        void main(){float k=vM.y;
        if(vM.z>.5){float a=pow((1.-abs(vUv.x))*(1.-abs(vUv.y)),1.5);vec3 c=mix(vec3(1.,.9,.5),vec3(1.,.25,.03),smoothstep(0.,.7,k));gl_FragColor=vec4(c*(1.6-k*.8),a*(1.-k*k));return;}
        float r=length(vUv);if(r>1.)discard;
        float n=fbm(vUv*1.7+vec2(vM.w*37.,-uTime*2.)+k*3.);
        float heat=smoothstep(1.,.1,r+(n-.5)*.8)*(1.-k)*(.5+n);
        gl_FragColor=vec4(ramp(heat),heat*.4);}`;

        const SMOKE = NOISE + `varying vec2 vUv;varying vec4 vM;uniform float uTime,uFlash;
        void main(){float r=length(vUv);if(r>1.)discard;float k=vM.y;
        float n=fbm(vUv*1.4+vM.w*20.+uTime*.05);
        float a=smoothstep(1.,.1,r+(n-.5)*1.2)*smoothstep(0.,.1,k)*pow(1.-k,2.0)*.4;
        vec3 c=vM.z>1.5?mix(vec3(.2,.16,.12),vec3(.38,.31,.24),n):mix(vec3(.06,.055,.05),vec3(.22,.2,.19),n);
        c+=vec3(.9,.35,.1)*(uFlash*.35+pow(1.-k,5.)*.5)*(1.-k);
        gl_FragColor=vec4(c,a);}`;

        const that = this;
        class Pool {
            constructor(n, fs, blend, order) {
                this.n = n; this.i = 0; const A = k => new Float32Array(n * k);
                this.pos = A(3); this.vel = A(3); this.m = A(4); this.age = A(1).fill(9); this.life = A(1).fill(1);
                this.s0 = A(1); this.s1 = A(1); this.dr = A(1); this.gy = A(1);
                const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
                g.setIndex(base.index); g.setAttribute('position', base.attributes.position);
                const at = (nm, arr, k) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(nm, a); return a; };
                this.A = [at('aPos', this.pos, 3), at('aVel', this.vel, 3), at('aM', this.m, 4)]; g.instanceCount = n;
                const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: that.U, vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend }));
                mesh.frustumCulled = false; mesh.renderOrder = order; scene.add(mesh);
            }
            emit(x, y, z, vx, vy, vz, life, s0, s1, dr, gy, kind) {
                const i = this.i; this.i = (i + 1) % this.n; const j = i * 3;
                this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
                this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.dr[i] = dr; this.gy[i] = gy;
                this.m[i * 4] = s0; this.m[i * 4 + 2] = kind; this.m[i * 4 + 3] = Math.random();
            }
            update(dt) {
                const { pos, vel, m, age, life } = this;
                for (let i = 0; i < this.n; i++) {
                    const j = i * 3, k4 = i * 4;
                    if (age[i] >= life[i]) { m[k4] = 0; continue; }
                    age[i] += dt; const k = age[i] / life[i]; if (k >= 1) { m[k4] = 0; continue; }
                    vel[j + 1] += this.gy[i] * dt; const d = Math.exp(-this.dr[i] * dt);
                    vel[j] *= d; vel[j + 1] *= d; vel[j + 2] *= d;
                    pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
                    m[k4] = this.s0[i] + (this.s1[i] - this.s0[i]) * k; m[k4 + 1] = k;
                }
                this.A.forEach(a => a.needsUpdate = true);
            }
        }

        this.smokePool = new Pool(1200, SMOKE, THREE.NormalBlending, 1);
        this.firePool = new Pool(1500, FIRE, THREE.AdditiveBlending, 2);

        this.boomL = new THREE.PointLight(0xff8a3a, 0, 45, 2);
        this.missL = new THREE.PointLight(0xff9040, 0, 18, 2);
        scene.add(this.boomL, this.missL);

        this.glowSprite = new THREE.Sprite(this.hm);
        this.glowSprite.renderOrder = 3;
        scene.add(this.glowSprite);

        this.buildTransformer();
        this.isInitialized = true;
    }

    createNoiseTexture() {
        const size = 64;
        const data = new Uint8Array(size * size * 4);
        for (let i = 0; i < data.length; i += 4) {
            const val = Math.floor(Math.random() * 256);
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
            data[i + 3] = 255;
        }
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        texture.needsUpdate = true;
        return texture;
    }

    buildTransformer() {
        this.parts.forEach(p => {
            if (p.parent) p.parent.remove(p);
        });
        this.parts = [];
        if (this.barrelCoreLight && this.barrelCoreLight.parent) {
            this.barrelCoreLight.parent.remove(this.barrelCoreLight);
        }

        const bumpTexture = this.createNoiseTexture();
        const octCylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
        const octCylHollowGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);

        const matDark = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.8,
            roughness: 0.4,
            flatShading: true,
            bumpMap: bumpTexture,
            bumpScale: 0.003
        });

        const matDarkHollow = new THREE.MeshStandardMaterial({
            color: 0x050505,
            metalness: 0.9,
            roughness: 0.9,
            flatShading: true,
            emissive: 0x220500,
            emissiveIntensity: 0.6,
            side: THREE.DoubleSide
        });

        const matLight = new THREE.MeshStandardMaterial({
            color: 0x880000,
            metalness: 0.3,
            roughness: 0.6,
            flatShading: true,
            bumpMap: bumpTexture,
            bumpScale: 0.003
        });

        const matBrown = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            metalness: 0.1,
            roughness: 0.8,
            flatShading: true
        });

        const rotAlign = Math.PI / 8;

        const configs = [
            { geo: octCylGeo, mat: matDark, wPos: [0, 0, 2.5], wScale: [1.1, 2.0, 1.1], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matBrown, wPos: [0, 0, 1.1], wScale: [1.15, 0.4, 1.15], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matBrown, wPos: [0, 0, 0.6], wScale: [1.15, 0.4, 1.15], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matBrown, wPos: [0, 0, 0.1], wScale: [1.15, 0.4, 1.15], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matDark, wPos: [0, 0, -1.8], wScale: [1.2, 3.2, 1.2], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matLight, wPos: [0, 0, -3.6], wScale: [1.4, 0.5, 1.4], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matLight, wPos: [0, 0, -4.9], wScale: [1.4, 0.5, 1.4], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylGeo, mat: matDark, wPos: [0, 0, -4.2], wScale: [1.3, 1.0, 1.3], wRot: [Math.PI / 2, rotAlign, 0] },
            { geo: octCylHollowGeo, mat: matDarkHollow, wPos: [0, 0, -5.5], wScale: [1.5, 1.0, 1.5], wRot: [Math.PI / 2, rotAlign, 0] }
        ];

        configs.forEach((cfg) => {
            const mesh = new THREE.Mesh(cfg.geo, cfg.mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            mesh.position.set(...cfg.wPos);
            mesh.scale.set(...cfg.wScale);
            mesh.rotation.set(...cfg.wRot);

            this.mountGroup.add(mesh);
            this.parts.push(mesh);
        });

        const coreMat = new THREE.SpriteMaterial({
            map: this.glowTex,
            color: 0xff5500,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        this.barrelCoreLight = new THREE.Sprite(coreMat);
        this.barrelCoreLight.scale.set(2.2, 2.2, 2.2);
        this.barrelCoreLight.position.set(0, 0, -5.5);
        this.mountGroup.add(this.barrelCoreLight);

        this.buildMountSaddle();
    }

    buildMountSaddle() {
        const saddleGeo = new THREE.BoxGeometry(1.4, 0.35, 1.4);
        const saddleMat = new THREE.MeshStandardMaterial({
            color: 0x1f2937,
            metalness: 0.9,
            roughness: 0.3,
            emissive: 0x0369a1,
            emissiveIntensity: 0.35
        });
        const saddleMesh = new THREE.Mesh(saddleGeo, saddleMat);
        saddleMesh.position.set(0, -0.4, -0.45);
        saddleMesh.castShadow = true;
        this.mountGroup.add(saddleMesh);
    }

    setBoxStateInstant() {
        this.isWeaponState = true;
        this.isAnimating = false;
    }

    playTransformSound() { }
    toggleTransformation() {
        this.isWeaponState = true;
        this.isAnimating = false;
    }

    // ==========================================
    // 3. ATTACHMENT TO FOX (SAMPLING KANAN / RIGHT SHOULDER)
    // ==========================================
    attachToFox(wolfModel) {
        this.init();
        if (!wolfModel || !wolfModel.bodyTiltGroup) return;

        this.wolfModel = wolfModel;

        if (this.mountGroup.parent) {
            this.mountGroup.parent.remove(this.mountGroup);
        }
        wolfModel.bodyTiltGroup.add(this.mountGroup);

        const s = this.mountOffset.scale;
        this.mountGroup.scale.set(s, s, s);
        this.mountGroup.position.set(this.mountOffset.x, this.mountOffset.y, this.mountOffset.z);
        this.mountGroup.rotation.set(0, Math.PI / 2, this.mountOffset.pitch);

        this.mountGroup.visible = true;
        this.isWeaponState = true;
    }

    detachFromFox() {
        if (this.mountGroup.parent) {
            this.mountGroup.parent.remove(this.mountGroup);
        }
        this.mountGroup.visible = false;
        this.wolfModel = null;
    }

    dropAndFadeout() {
        if (!this.mountGroup || !this.mountGroup.parent) return;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.mountGroup.getWorldPosition(worldPos);
        this.mountGroup.getWorldQuaternion(worldQuat);

        this.mountGroup.parent.remove(this.mountGroup);
        scene.add(this.mountGroup);

        this.mountGroup.position.copy(worldPos);
        this.mountGroup.quaternion.copy(worldQuat);

        const groundY = (typeof getTerrainHeightFast === 'function')
            ? getTerrainHeightFast(worldPos.x, worldPos.z)
            : 0;
        const targetGroundY = groundY + 0.18;

        this.playDropSound();

        if (typeof gsap !== 'undefined') {
            gsap.to(this.mountGroup.position, {
                y: targetGroundY,
                duration: 0.65,
                ease: "bounce.out"
            });

            gsap.to(this.mountGroup.rotation, {
                x: this.mountGroup.rotation.x + 0.6,
                z: this.mountGroup.rotation.z + 1.1,
                duration: 0.65,
                ease: "power2.in"
            });

            const fadeDelay = 0.8;
            const fadeDuration = 1.1;

            this.mountGroup.traverse(child => {
                if ((child.isMesh || child.isSprite) && child.material) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    gsap.to(child.material, {
                        opacity: 0,
                        duration: fadeDuration,
                        delay: fadeDelay
                    });
                }
            });

            setTimeout(() => {
                if (this.mountGroup.parent) {
                    this.mountGroup.parent.remove(this.mountGroup);
                }
                this.mountGroup.visible = false;
                this.wolfModel = null;
                this.isWeaponState = true;
                this.buildTransformer();
            }, (fadeDelay + fadeDuration + 0.1) * 1000);
        } else {
            this.mountGroup.position.y = targetGroundY;
            setTimeout(() => {
                if (this.mountGroup.parent) this.mountGroup.parent.remove(this.mountGroup);
                this.mountGroup.visible = false;
                this.wolfModel = null;
                this.isWeaponState = true;
                this.buildTransformer();
            }, 1200);
        }
    }

    prewarm(renderer, scene, camera) {
        if (!this.isInitialized) this.init();
        if (!renderer || !scene || !camera) return;

        const hadParent = !!this.mountGroup.parent;
        if (!hadParent) {
            this.mountGroup.position.set(0, -9999, 0);
            this.mountGroup.visible = true;
            scene.add(this.mountGroup);
        }

        try {
            renderer.compile(scene, camera);
        } catch (_) { }

        if (!hadParent && this.mountGroup.parent === scene) {
            scene.remove(this.mountGroup);
            this.mountGroup.visible = false;
        }
    }

    playDropSound() {
        try {
            const a = this.audio();
            const t = a.currentTime;

            const osc = a.createOscillator();
            const gain = a.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(480, t);
            osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            osc.connect(gain);
            gain.connect(a.destination);
            osc.start(t);
            osc.stop(t + 0.3);

            const osc2 = a.createOscillator();
            const gain2 = a.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(280, t + 0.2);
            osc2.frequency.exponentialRampToValueAtTime(90, t + 0.42);
            gain2.gain.setValueAtTime(0, t);
            gain2.gain.setValueAtTime(0.2, t + 0.2);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
            osc2.connect(gain2);
            gain2.connect(a.destination);
            osc2.start(t + 0.2);
            osc2.stop(t + 0.45);
        } catch (_) { }
    }

    // ==========================================
    // 5. MISSILE LAUNCH & EXPLOSION (FROM plasma.html)
    // ==========================================
    launchMissile() {
        if (!this.mountGroup.visible) return false;

        const now = Date.now();
        if (now - this.lastFireTime < 400) return false;
        this.lastFireTime = now;

        try { this.audio(); } catch (_) { }

        const muzzleWorldPos = new THREE.Vector3();
        if (this.barrelCoreLight) {
            this.barrelCoreLight.getWorldPosition(muzzleWorldPos);
        } else {
            this.mountGroup.getWorldPosition(muzzleWorldPos);
        }

        const muzzleForward = new THREE.Vector3(0, 0, -1);
        muzzleForward.applyQuaternion(this.mountGroup.getWorldQuaternion(new THREE.Quaternion()));
        muzzleForward.normalize();

        const sMat = new THREE.SpriteMaterial({
            map: this.glowTex,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });
        const spr = new THREE.Sprite(sMat);
        // Ukuran bola api presisi sesuai moncong plasma di samping fox (~0.45 unit)
        spr.scale.setScalar(0.45);
        spr.renderOrder = 3;
        spr.position.copy(muzzleWorldPos);
        scene.add(spr);

        const speed = 72.0;
        const vel = muzzleForward.clone().multiplyScalar(speed);

        const missileObj = {
            p: muzzleWorldPos.clone(),
            v: vel,
            a: 0,
            h: spr,
            startPos: muzzleWorldPos.clone()
        };
        this.missiles.push(missileObj);

        // Flash & recoil efek pada moncong laras
        this.flash = 0.8;
        this.U.uFlash.value = 0.8;

        // Partikel semburan api awal presisi moncong laras
        if (this.firePool) {
            for (let i = 0; i < 20; i++) {
                const [rx, ry, rz] = this.rs();
                this.firePool.emit(
                    muzzleWorldPos.x, muzzleWorldPos.y, muzzleWorldPos.z,
                    muzzleForward.x * 14 + rx * 2.0,
                    muzzleForward.y * 14 + ry * 2.0,
                    muzzleForward.z * 14 + rz * 2.0,
                    this.rnd(0.12, 0.25), 0.36, 0.05, 2.0, 0, 0
                );
            }
        }

        this.playFireSound();
        return true;
    }

    playFireSound() {
        try {
            const a = this.audio();
            const t = a.currentTime;

            const osc = a.createOscillator();
            const g = a.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(650, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.38);

            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

            osc.connect(g);
            g.connect(a.destination);
            osc.start(t);
            osc.stop(t + 0.45);
        } catch (_) { }
    }

    playExplosionSound() {
        try {
            const a = this.audio();
            const t = a.currentTime;

            const osc = a.createOscillator();
            const g = a.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(28, t + 0.65);

            g.gain.setValueAtTime(0.7, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

            osc.connect(g);
            g.connect(a.destination);
            osc.start(t);
            osc.stop(t + 0.8);
        } catch (_) { }
    }

    explode(pos, normal, scale = 1.0) {
        const R = 4.8 * scale;
        this.flash = 0.9 * scale;
        this.glowT = 0;

        if (this.boomL) {
            this.boomL.position.copy(pos).addScaledVector(normal, 0.6);
            this.boomL.intensity = 45 * scale;
        }

        if (this.glowSprite) {
            this.glowSprite.position.copy(pos);
            this.glowSprite.scale.setScalar(5.5 * scale);
            this.glowSprite.material.opacity = 1.0;
        }

        // Screen Shake menggelegar dari plasma.html
        if (typeof gsap !== 'undefined' && typeof camera !== 'undefined') {
            const dist = camera.position.distanceTo(pos);
            const shake = 1.6 / (1 + dist * 0.12);
            gsap.fromTo(camera.position,
                { x: camera.position.x - shake, y: camera.position.y - shake },
                { x: camera.position.x, y: camera.position.y, duration: 0.45, ease: "elastic.out(1, 0.3)" }
            );
        }

        // 1. Bola api ledakan (Fireball Core & Semburan Api Mekar)
        if (this.firePool) {
            for (let i = 0; i < 50; i++) {
                const [rx, ry, rz] = this.rs();
                const sp = this.rnd(2, 7) * scale;
                this.firePool.emit(
                    pos.x + normal.x * 0.15, pos.y + normal.y * 0.15, pos.z + normal.z * 0.15,
                    (rx + normal.x) * 0.8 * sp,
                    (ry + normal.y) * 0.8 * sp,
                    (rz + normal.z) * 0.8 * sp,
                    this.rnd(0.4, 0.9),
                    this.rnd(0.4, 0.8) * scale,
                    this.rnd(1.0, 1.8) * scale,
                    2.2,
                    2.5,
                    0
                );
            }

            // Inti bola api mekar di pusat ledakan
            this.firePool.emit(
                pos.x + normal.x * 0.2, pos.y + normal.y * 0.2, pos.z + normal.z * 0.2,
                0, 0, 0,
                0.22, 1.5 * scale, 3.2 * scale, 0, 0, 0
            );

            // Percikan api melayang (sparks) berkecepatan tinggi
            for (let i = 0; i < 100; i++) {
                const [rx, ry, rz] = this.rs();
                const sp = this.rnd(3, 14) * scale;
                this.firePool.emit(
                    pos.x, pos.y, pos.z,
                    (rx + normal.x * 0.5) * sp,
                    (ry + normal.y * 0.5) * sp,
                    (rz + normal.z * 0.5) * sp,
                    this.rnd(0.6, 1.6),
                    0.06,
                    0.06,
                    0.25,
                    -9.8,
                    1
                );
            }
        }

        // 2. Asap hitam tebal membumbung tinggi (Mushroom smoke)
        if (this.smokePool) {
            for (let i = 0; i < 35; i++) {
                const [rx, ry, rz] = this.rs();
                this.smokePool.emit(
                    pos.x + rx * 0.3, pos.y + ry * 0.3 + 0.2, pos.z + rz * 0.3,
                    rx * 1.5,
                    Math.abs(ry) * 2.0 + 1.2,
                    rz * 1.5,
                    this.rnd(2.2, 4.5),
                    this.rnd(0.6, 1.1) * scale,
                    this.rnd(1.8, 3.2) * scale,
                    0.9,
                    0.9,
                    0
                );
            }
        }

        // 3. Shockwave cincin kubah dari plasma.html
        const shockGeo = new THREE.SphereGeometry(1, 24, 16);
        const shockMat = new THREE.ShaderMaterial({
            uniforms: { o: { value: 0.6 } },
            vertexShader: `varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader: `varying vec3 vN;uniform float o;void main(){float f=pow(1.-abs(dot(vN,vec3(0.,0.,1.))),2.5);gl_FragColor=vec4(vec3(1.,.7,.3),f*o);}`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const shockMesh = new THREE.Mesh(shockGeo, shockMat);
        shockMesh.position.copy(pos);
        scene.add(shockMesh);

        this.shocks.push({ m: shockMesh, t: 0, R: R });
        this.playExplosionSound();
    }

    endMissile(m) {
        if (m.h) {
            scene.remove(m.h);
            m.h.material.dispose();
        }
        const idx = this.missiles.indexOf(m);
        if (idx !== -1) {
            this.missiles.splice(idx, 1);
        }
    }

    // ==========================================
    // 6. ANIMATION & TICK LOOP (CALLED FROM render-loop.js)
    // ==========================================
    update(dt, elapsedTime) {
        if (!this.isInitialized) return;

        this.U.uTime.value = elapsedTime;

        // Update active missiles
        for (let i = this.missiles.length - 1; i >= 0; i--) {
            const m = this.missiles[i];
            const prev = m.p.clone();
            m.p.addScaledVector(m.v, dt);
            m.a += dt;

            // Gravitasi halus proyektil
            m.v.y -= 2.2 * dt;

            // 4-step sub-interpolation loop from plasma.html for continuous thick trailing smoke & roaring flames
            for (let s = 0; s < 4; s++) {
                const q = prev.clone().lerp(m.p, s / 4);
                if (this.firePool) {
                    this.firePool.emit(
                        q.x + this.rnd(-0.04, 0.04), q.y + this.rnd(-0.04, 0.04), q.z + this.rnd(-0.04, 0.04),
                        this.rnd(-0.3, 0.3), this.rnd(-0.1, 0.4), this.rnd(-0.3, 0.3),
                        this.rnd(0.25, 0.5), 0.32, 0.08, 2.5, 2, 0
                    );
                }
                if (this.smokePool) {
                    this.smokePool.emit(
                        q.x + this.rnd(-0.06, 0.06), q.y + this.rnd(-0.06, 0.06), q.z + this.rnd(-0.06, 0.06),
                        this.rnd(-0.2, 0.2), this.rnd(0.1, 0.4), this.rnd(-0.2, 0.2),
                        this.rnd(0.4, 0.85), 0.22, this.rnd(0.48, 0.78), 0.8, 0.2, 0
                    );
                }
            }

            // Core bola api yang menempel erat pada kepala proyektil (proporsional moncong ~0.45 unit)
            if (this.firePool) {
                for (let k = 0; k < 2; k++) {
                    this.firePool.emit(m.p.x, m.p.y, m.p.z, 0, 0, 0, 0.09, 0.40, 0.26, 0, 0, 0);
                }
                // Percikan api (sparks) melesat ke belakang
                this.firePool.emit(
                    m.p.x, m.p.y, m.p.z,
                    -m.v.x * 0.08 + this.rnd(-1.5, 1.5), -m.v.y * 0.08 + this.rnd(-1.5, 1.5), -m.v.z * 0.08 + this.rnd(-1.5, 1.5),
                    this.rnd(0.3, 0.7), 0.12, 0.02, 0.4, -9.8, 1
                );
            }

            // Denyut cahaya bola api utama (presisi moncong plasma ~0.45 unit)
            m.h.position.copy(m.p);
            m.h.scale.setScalar(0.46 + 0.08 * Math.sin(elapsedTime * 40));

            // Collision check with terrain or max lifetime
            let hitGround = false;
            if (typeof getTerrainHeightFast === 'function') {
                const groundY = getTerrainHeightFast(m.p.x, m.p.z);
                if (m.p.y <= groundY + 0.35) {
                    hitGround = true;
                }
            }

            const distTravelled = m.startPos ? m.p.distanceTo(m.startPos) : 0;

            if (hitGround || m.a > 3.0 || distTravelled > 200) {
                const hitPos = m.p.clone();
                this.endMissile(m);
                const normal = hitGround ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
                this.explode(hitPos, normal, 1.5);
            }
        }

        // Missile dynamic point light
        const lastMissile = this.missiles[this.missiles.length - 1];
        if (lastMissile && this.missL) {
            this.missL.position.copy(lastMissile.p);
            this.missL.intensity = 15 * (0.85 + 0.15 * Math.sin(elapsedTime * 50));
        } else if (this.missL) {
            this.missL.intensity = 0;
        }

        // Update particle pools
        if (this.smokePool) this.smokePool.update(dt);
        if (this.firePool) this.firePool.update(dt);

        // Update shockwave spheres
        for (let i = this.shocks.length - 1; i >= 0; i--) {
            const s = this.shocks[i];
            s.t += dt / 0.6;
            const k = Math.min(1, s.t);
            s.m.scale.setScalar(s.R * 1.3 * (1 - (1 - k) * (1 - k)) + 0.1);
            s.m.material.uniforms.o.value = (1 - k) * (1 - k) * 0.6;
            if (s.t >= 1) {
                scene.remove(s.m);
                s.m.material.dispose();
                s.m.geometry.dispose();
                this.shocks.splice(i, 1);
            }
        }

        // Glow sprite & flash dissipation
        this.glowT += dt;
        const g = Math.max(0, 1 - this.glowT / 0.9);
        if (this.glowSprite) {
            this.glowSprite.material.opacity = g * g;
            this.glowSprite.scale.setScalar(10 + this.glowT * 9);
            this.glowSprite.visible = g > 0;
        }

        if (this.boomL) {
            this.boomL.intensity = this.flash * 70;
        }
        this.flash *= Math.exp(-4 * dt);
        this.U.uFlash.value = this.flash;

        if (this.flElement) {
            this.flElement.style.opacity = (this.flash * 0.3).toFixed(3);
        }
    }
}

// Global instance
window.plasmaWeaponInstance = new PlasmaWeapon();

// Pre-warm and compile shaders in advance to ensure 60fps pickup without freezing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof scene !== 'undefined') window.plasmaWeaponInstance.init();
        }, 150);
    });
} else {
    setTimeout(() => {
        if (typeof scene !== 'undefined') window.plasmaWeaponInstance.init();
    }, 150);
}
