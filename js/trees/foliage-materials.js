/* Foliage/bark textures and shaders */
// ==========================================
// 5. TEKSTUR & SHADER FOLIAGE
// ==========================================
function createLeafTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    function drawSingleLeaf(cx, cy, scale, angle) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -45);
        ctx.bezierCurveTo(24, -20, 26, 20, 0, 38);
        ctx.bezierCurveTo(-26, 20, -24, -20, 0, -45);
        ctx.fill();

        ctx.restore();
    }

    const leafPositions = [
        { x: 256, y: 150, scale: 1.15, rot: 0 },
        { x: 195, y: 215, scale: 0.95, rot: -0.65 },
        { x: 317, y: 215, scale: 0.95, rot: 0.65 },
        { x: 155, y: 295, scale: 0.85, rot: -1.0 },
        { x: 357, y: 295, scale: 0.85, rot: 1.0 },
        { x: 256, y: 275, scale: 1.05, rot: 0.1 },
        { x: 205, y: 365, scale: 0.85, rot: -0.45 },
        { x: 307, y: 365, scale: 0.85, rot: 0.45 },
        { x: 256, y: 415, scale: 0.8, rot: 0 }
    ];

    leafPositions.forEach(leaf => drawSingleLeaf(leaf.x, leaf.y, leaf.scale, leaf.rot));

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

// Tekstur khusus sehelai daun tunggal untuk partikel rontok
function createSingleFallingLeafTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    ctx.save();
    ctx.translate(64, 64);

    // Gambar bentuk satu daun lonjong alami dengan ujung runcing
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.bezierCurveTo(24, -20, 22, 28, 0, 48);   // Lekukan kanan
    ctx.bezierCurveTo(-22, 28, -24, -20, 0, -48); // Lekukan kiri
    ctx.fill();

    // Tulang daun halus di bagian tengah (opsional, memberi siluet tegas)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, 42);
    ctx.stroke();

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

const singleLeafTexture = createSingleFallingLeafTexture();

function createPineBranchClumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 512);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';

    const numNeedles = 40;
    for (let i = 0; i < numNeedles; i++) {
        const angle = (i / numNeedles - 0.5) * 1.3;
        const len = 190 + Math.random() * 210;
        const startX = 256 + (Math.random() - 0.5) * 30;
        const startY = 480 - Math.random() * 60;

        ctx.lineWidth = 7 + Math.random() * 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        const endX = startX + Math.sin(angle) * len;
        const endY = startY - Math.cos(angle) * len;
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createBarkTexture(baseColor, spotColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 512);

    ctx.fillStyle = spotColor;
    for (let i = 0; i < 100; i++) {
        const y = Math.random() * 512;
        const h = 3 + Math.random() * 10;
        const w = 10 + Math.random() * 40;
        const x = Math.random() * (256 - w);

        ctx.beginPath();
        ctx.ellipse(x + w / 2, y, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2);
    return texture;
}

const leafTexture = createLeafTexture();
const pineClumpTexture = createPineBranchClumpTexture();
const birchBarkTexture = createBarkTexture('#f2eee9', '#2c2724');
const oakBarkTexture = createBarkTexture('#5c4028', '#3b2616');

const leafDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leafTexture,
    alphaTest: 0.5
});

const pineDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: pineClumpTexture,
    alphaTest: 0.5
});

const genshinFoliageShader = {
    uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.lights,
        THREE.UniformsLib.fog,
        {
            uTexture: { value: leafTexture },
            uLightPos: { value: sunLight.position },
            uBaseColor: { value: new THREE.Color() },
            uShadowColor: { value: new THREE.Color() },
            uHighlightColor: { value: new THREE.Color() },
            uTime: { value: 0 },
            uWindSpeed: { value: 1.0 },
            directionalShadowMap: { value: [] },
            directionalLightMatrix: { value: [] }
        }
    ]),
    vertexShader: `
        #include <common>
        #include <shadowmap_pars_vertex>
        #include <fog_pars_vertex>

        uniform float uTime;
        uniform float uWindSpeed;

        varying vec2 vUv;
        varying vec3 vSphericalNormal;
        varying vec3 vWorldPosition;

        void main() {
            vUv = uv;
            vec3 pos = position;

            if (uWindSpeed > 0.0) {
                float waveX = sin(uTime * 2.5 * uWindSpeed + position.y * 1.5) * 0.12 * uWindSpeed;
                float waveZ = cos(uTime * 2.0 * uWindSpeed + position.x * 1.5) * 0.12 * uWindSpeed;
                pos.x += waveX;
                pos.z += waveZ;
            }

            vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
            vWorldPosition = worldPosition.xyz;

            vec4 treeCenter = modelMatrix * vec4(0.0, 3.2, 0.0, 1.0);
            vSphericalNormal = normalize(worldPosition.xyz - treeCenter.xyz);

            vec3 objectNormal = vSphericalNormal;
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

        varying vec2 vUv;
        varying vec3 vSphericalNormal;
        varying vec3 vWorldPosition;

        void main() {
            vec4 texColor = texture2D(uTexture, vUv);
            if (texColor.a < 0.45) discard;

            vec3 lightDir = normalize(uLightPos - vWorldPosition);
            float NdotL = dot(vSphericalNormal, lightDir);

            float shadowStep = smoothstep(-0.5, 0.4, NdotL);
            float highlightStep = smoothstep(0.3, 0.95, NdotL);

            vec3 toonColor = mix(uShadowColor, uBaseColor, shadowStep);
            toonColor = mix(toonColor, uHighlightColor, highlightStep * 0.7);

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

            float externalShadow = smoothstep(0.0, 0.95, shadowVal);
            vec3 finalColor = mix(uShadowColor * 0.9, toonColor, externalShadow);

            gl_FragColor = vec4(finalColor, 1.0);
            #include <fog_fragment>
        }
    `
};

function createGenshinFoliageMaterial(baseHex, shadowHex, highlightHex, tex = leafTexture) {
    const mat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(genshinFoliageShader.uniforms),
        vertexShader: genshinFoliageShader.vertexShader,
        fragmentShader: genshinFoliageShader.fragmentShader,
        side: THREE.DoubleSide,
        lights: true,
        fog: true
    });

    mat.uniforms.uTexture.value = tex;
    mat.uniforms.uBaseColor.value.setHex(baseHex);
    mat.uniforms.uShadowColor.value.setHex(shadowHex);
    mat.uniforms.uHighlightColor.value.setHex(highlightHex);

    foliageMaterialsList.push(mat);
    return mat;
}

const oakGreenMat = createGenshinFoliageMaterial(0x4a9e2d, 0x1d5415, 0x86e643);
const birchYellowMat = createGenshinFoliageMaterial(0xe0ab16, 0x945202, 0xffe859);
const birchTealMat = createGenshinFoliageMaterial(0x278762, 0x0c4a33, 0x58c991);
const autumnRedMat = createGenshinFoliageMaterial(0xc94726, 0x6e1b08, 0xff7b4a);
const pineEmeraldMat = createGenshinFoliageMaterial(0x2d874e, 0x0f4a27, 0x61d683, pineClumpTexture);

const birchBarkMaterial = new THREE.MeshToonMaterial({ map: birchBarkTexture, bumpMap: birchBarkTexture, bumpScale: 0.03 });
const oakBarkMaterial = new THREE.MeshToonMaterial({ map: oakBarkTexture, bumpMap: oakBarkTexture, bumpScale: 0.03 });
