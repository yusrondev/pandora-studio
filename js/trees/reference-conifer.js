/* =========================================================
   POHON KONIFER GAYA REFERENSI (referensi/tone-and-camera.mp4)
   Batang merah-cokelat lurus dengan dahan bertingkat yang melengkung turun.
   Tiap dahan adalah satu bidang melengkung bertekstur siluet ranting bergerigi,
   jadi tajuknya rapat dengan segitiga jauh lebih sedikit dari pinus lama.
   ========================================================= */
const CONIFER_FROND_SIZE = 512;
const CONIFER_TIERS = 23;
const CONIFER_TRUNK_HEIGHT = 15;

function createConiferFrondTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CONIFER_FROND_SIZE;
    const ctx = canvas.getContext('2d');
    const center = CONIFER_FROND_SIZE / 2;
    // Pangkal dahan di atas kanvas, ujungnya di bawah. Nilai merah dipakai sebagai terang-gelap di shader.
    const shade = value => {
        const g = Math.round(value * 255);
        return `rgb(${g},${g},${g})`;
    };
    const branchlet = (startX, startY, angle, length, width, value) => {
        const dirX = Math.sin(angle), dirY = Math.cos(angle);
        const sideX = dirY, sideY = -dirX;
        const teeth = 6;
        const points = [];
        for (let side = 1; side >= -1; side -= 2) {
            for (let k = 0; k <= teeth; k++) {
                const a = side > 0 ? k / teeth : 1 - k / teeth;
                const profile = Math.pow(Math.sin(Math.PI * Math.min(1, a * 0.92 + 0.08)), 0.7) * width;
                // Gigi jarum bergantian panjang-pendek dan condong ke ujung
                const tooth = k % 2 === 0 ? 1 : 0.42;
                const along = length * a + (k % 2 === 0 ? length * 0.035 : 0);
                points.push([
                    startX + dirX * along + sideX * side * profile * tooth,
                    startY + dirY * along + sideY * side * profile * tooth
                ]);
            }
        }
        ctx.fillStyle = shade(value);
        ctx.beginPath();
        points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fill();
    };

    const pairs = 23;
    for (let i = 0; i < pairs; i++) {
        const t = i / (pairs - 1);
        const y = 8 + t * 450;
        const reach = Math.sin(Math.PI * Math.pow(0.1 + t * 0.9, 0.62)) * 240 + 16;
        const width = 15 + (1 - t) * 10;
        [1, -1].forEach((side) => {
            const angle = side * (0.98 - t * 0.3);
            branchlet(center, y, angle, reach, width, 0.42 + Math.random() * 0.14);
            // Lapisan atas yang lebih terang memberi kesan helai bertumpuk
            branchlet(center, y + 4, angle, reach * 0.8, width * 0.6, 0.78 + Math.random() * 0.22);
        });
    }
    branchlet(center, 440, 0, 66, 15, 0.82);
    ctx.fillStyle = shade(0.22);
    ctx.fillRect(center - 3, 0, 6, 470);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 2;
    return texture;
}

function createConiferBarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5a3524';
    ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) {
        const x = Math.random() * 128;
        const light = Math.random() > 0.5;
        ctx.fillStyle = light ? 'rgba(170,92,52,0.42)' : 'rgba(58,24,14,0.5)';
        ctx.fillRect(x, Math.random() * 256, 2 + Math.random() * 5, 40 + Math.random() * 150);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 4);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
}

function createConiferBoughGeometry() {
    const geometry = new THREE.PlaneGeometry(1, 1, 2, 3);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, 0.5);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const z = position.getZ(i);
        // Melengkung turun ke ujung dan membusur ke sisi, seperti dahan cemara yang berat
        position.setY(i, 0.06 * Math.sin(Math.PI * z) - 0.3 * z * z - 0.2 * Math.abs(x));
    }
    geometry.computeVertexNormals();
    // Cukup besar untuk seluruh tajuk: InstancedMesh hanya diuji dengan satu bola ini
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CONIFER_TRUNK_HEIGHT * 0.55, 0), CONIFER_TRUNK_HEIGHT * 0.75);
    return geometry;
}

let coniferAssets = null;

function getConiferAssets() {
    if (coniferAssets) return coniferAssets;
    const frond = createConiferFrondTexture();
    const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(genshinFoliageShader.uniforms),
        side: THREE.DoubleSide,
        lights: true,
        fog: true,
        vertexShader: `
            #include <common>
            #include <shadowmap_pars_vertex>
            #include <fog_pars_vertex>
            uniform float uTime;
            uniform float uWindSpeed;
            uniform float uLeafScale;
            varying vec2 vUv;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            varying vec3 vTint;
            void main() {
                vUv = uv;
                vec3 pos = position;
                pos.x *= uLeafScale;
                float sway = sin(uTime * 1.3 * uWindSpeed + instanceMatrix[3][0] + instanceMatrix[3][1] * 0.7 + position.z * 2.0);
                pos.y += sway * 0.035 * position.z * uWindSpeed;
                vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
                vTint = vec3(1.0);
                #ifdef USE_INSTANCING_COLOR
                    vTint = instanceColor;
                #endif
                vec3 objectNormal = vWorldNormal;
                vec3 transformedNormal = normalMatrix * objectNormal;
                vec4 mvPosition = viewMatrix * worldPosition;
                gl_Position = projectionMatrix * mvPosition;
                #include <shadowmap_vertex>
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            #include <common>
            #include <packing>
            #include <shadowmap_pars_fragment>
            #include <fog_pars_fragment>
            uniform sampler2D uTexture;
            uniform vec3 uLightPos;
            uniform vec3 uBaseColor;
            uniform vec3 uShadowColor;
            uniform vec3 uHighlightColor;
            uniform float uSnowCover;
            uniform float uWetness;
            varying vec2 vUv;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            varying vec3 vTint;
            void main() {
                vec4 tex = texture2D(uTexture, vUv);
                if (tex.a < 0.5) discard;
                // Sisi bawah dahan selalu gelap; sisi atas menangkap cahaya matahari
                float facing = gl_FrontFacing ? 1.0 : -1.0;
                float ndl = dot(vWorldNormal * facing, normalize(uLightPos - vWorldPosition));
                // Cahaya menembus dahan: sisi bawah tetap sedikit menyala bila matahari di baliknya
                float lit = max(smoothstep(-0.05, 0.3, ndl), smoothstep(0.0, 0.6, -ndl) * 0.42);
                float shadowVal = 1.0;
                #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
                    shadowVal = getShadow(
                        directionalShadowMap[0],
                        directionalLightShadows[0].shadowMapSize,
                        directionalLightShadows[0].shadowBias,
                        directionalLightShadows[0].shadowRadius,
                        vDirectionalShadowCoord[0]
                    );
                #endif
                lit *= smoothstep(0.1, 0.9, shadowVal);
                vec3 lightColor = mix(uBaseColor, uHighlightColor, smoothstep(0.55, 0.95, tex.r));
                vec3 darkColor = uShadowColor * (0.75 + tex.r * 0.55);
                vec3 col = mix(darkColor, lightColor, lit) * vTint;
                // Cuaca: dahan basah lebih gelap; salju menumpuk di atas dahan, bawahnya tetap hijau
                if (uSnowCover > 0.001 || uWetness > 0.001) {
                    float speck = fract(sin(dot(floor(vWorldPosition.xz * 9.0 + vWorldPosition.y * 5.0), vec2(12.9898, 78.233))) * 43758.5453);
                    float up = (vWorldNormal * facing).y + (speck - 0.5) * 0.35;
                    float snowAmt = uSnowCover * smoothstep(0.2 - uSnowCover * 0.4, 0.65 - uSnowCover * 0.3, up);
                    vec3 snowCol = mix(vec3(0.6, 0.67, 0.78), vec3(0.95, 0.97, 1.0), lit);
                    col = mix(col * (1.0 - uWetness * 0.18), snowCol, snowAmt);
                }
                gl_FragColor = vec4(col, 1.0);
                #include <fog_fragment>
            }
        `
    });
    material.uniforms.uTexture.value = frond;
    material.uniforms.uSnowCover = WEATHER_UNIFORMS.uSnowCover;
    material.uniforms.uWetness = WEATHER_UNIFORMS.uWetness;
    material.uniforms.uBaseColor.value.setHex(0x5a862e);
    material.uniforms.uShadowColor.value.setHex(0x204227);
    material.uniforms.uHighlightColor.value.setHex(0xb0c844);
    foliageMaterialsList.push(material);

    coniferAssets = {
        material,
        geometry: createConiferBoughGeometry(),
        depth: new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: frond,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        }),
        bark: new THREE.MeshLambertMaterial({ map: createConiferBarkTexture() })
    };
    return coniferAssets;
}

function createReferenceConifer(requestedBoughs = 0, curvature = 0.5) {
    const assets = getConiferAssets();
    const group = new THREE.Group();
    const trunkGroup = new THREE.Group();
    const height = CONIFER_TRUNK_HEIGHT * (0.86 + Math.random() * 0.28);

    const trunkGeometry = new THREE.CylinderGeometry(0.035, 0.3, height, 7, 3);
    trunkGeometry.translate(0, height / 2, 0);
    const trunk = new THREE.Mesh(trunkGeometry, assets.bark);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunkGroup.add(trunk);
    group.add(trunkGroup);

    const boughs = [];
    const dummy = new THREE.Object3D();
    const addBough = (y, yaw, pitch, length, tint) => {
        dummy.position.set(0, y, 0);
        dummy.rotation.set(pitch, yaw, 0, 'YXZ');
        dummy.scale.set(length * 0.82, length, length);
        dummy.updateMatrix();
        boughs.push({ matrix: dummy.matrix.clone(), tint });
    };
    for (let tier = 0; tier < CONIFER_TIERS; tier++) {
        const t = tier / (CONIFER_TIERS - 1);
        // Tingkat makin rapat ke atas, batang hanya terlihat di bagian bawah
        const y = height * (0.24 + 0.74 * Math.pow(t, 0.85));
        // Tajuk meruncing: dahan terpanjang di bawah, pendek dan mengarah ke atas di puncak
        const length = THREE.MathUtils.lerp(4.1, 0.55, Math.pow(t, 0.82)) * (0.9 + Math.random() * 0.22);
        const count = Math.round(THREE.MathUtils.lerp(8, 3, t));
        const startYaw = Math.random() * Math.PI * 2;
        const pitch = THREE.MathUtils.lerp(0.12 + curvature * 0.12, -0.55, t * t);
        // Dahan bawah sedikit lebih gelap, seperti tajuk yang saling menaungi
        const tierTint = THREE.MathUtils.lerp(0.78, 1.05, t);
        for (let i = 0; i < count; i++) {
            const shade = tierTint * (0.9 + Math.random() * 0.2);
            addBough(
                y + (Math.random() - 0.5) * 0.3,
                startYaw + (i + (Math.random() - 0.5) * 0.5) / count * Math.PI * 2,
                pitch + (Math.random() - 0.5) * 0.14,
                length,
                new THREE.Color(shade, shade, shade * 0.96)
            );
        }
    }
    for (let i = 0; i < 4; i++) {
        addBough(height * 0.985, i / 4 * Math.PI * 2, -1.05, 0.75, new THREE.Color(1.05, 1.05, 1));
    }
    // Urutan acak: preset rendah cukup menggambar bagian awal dan tajuk tetap merata
    for (let i = boughs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [boughs[i], boughs[j]] = [boughs[j], boughs[i]];
    }

    const leaves = new THREE.InstancedMesh(assets.geometry, assets.material, boughs.length);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.customDepthMaterial = assets.depth;
    boughs.forEach((bough, i) => {
        leaves.setMatrixAt(i, bough.matrix);
        leaves.setColorAt(i, bough.tint);
    });
    leaves.count = requestedBoughs > 0 ? Math.min(boughs.length, requestedBoughs) : boughs.length;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    leaves.userData.baseYOffset = 0;
    group.add(leaves);

    group.userData = {
        type: 'Pine Tree Referensi',
        typeCode: 'pine_ref',
        isPine: true,
        branchCount: CONIFER_TIERS,
        curvature,
        populatePineLeaves(count) {
            leaves.count = Math.min(boughs.length, Math.max(1, count));
        },
        leafMesh: leaves,
        trunkGroup,
        baseTrunkHeight: height,
        foliageMat: assets.material
    };
    return group;
}
window.createReferenceConifer = createReferenceConifer;
