/* Astro Bot AMOLED Visor */
// =====================================================================
// ASTRO BOT VISION PRO AMOLED VISOR (TEXTURE & EXPRESSION GENERATOR)
// =====================================================================
const visorCanvas = document.createElement('canvas');
visorCanvas.width = 512;
visorCanvas.height = 256;
const visorCtx = visorCanvas.getContext('2d');
const visorTexture = new THREE.CanvasTexture(visorCanvas);
visorTexture.minFilter = THREE.LinearFilter;
visorTexture.magFilter = THREE.LinearFilter;

let currentVisorColor = '#00f0ff'; // Neon Cyan Astro Bot default
let currentVisorExp = 'auto';      // 'auto', 'happy', 'star', 'focused', 'surprised', 'heart', 'wink'

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

function drawHeart(ctx, x, y, size) {
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 1.4, x, y + size);
    ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 1.4, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
    ctx.closePath();
}

function renderAstroBotScreen(expName, blinkProgress = 0, lookOffsetX = 0, lookOffsetY = 0) {
    visorCtx.save();

    // 1. True AMOLED Deep Black
    visorCtx.fillStyle = '#010206';
    visorCtx.fillRect(0, 0, 512, 256);

    // 2. Center coordinates for Left & Right Astro Bot Eyes
    const lx = 145 + lookOffsetX * 16;
    const rx = 367 + lookOffsetX * 16;
    const cy = 128 + lookOffsetY * 10;

    const glowColor = currentVisorColor;

    function drawSingleEye(cx, isRight = false) {
        visorCtx.save();
        visorCtx.translate(cx, cy);

        if (expName === 'happy') {
            // ^ ^ Astro Bot Smiling Eyes (Ultra Bright Neon Arches)
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.strokeStyle = glowColor;
            visorCtx.lineWidth = 36;
            visorCtx.lineCap = 'round';
            visorCtx.beginPath();
            visorCtx.arc(0, 16, 44, Math.PI * 1.15, Math.PI * 1.85, false);
            visorCtx.stroke();

            visorCtx.shadowBlur = 20;
            visorCtx.lineWidth = 26;
            visorCtx.stroke();

            visorCtx.shadowBlur = 8;
            visorCtx.shadowColor = '#ffffff';
            visorCtx.strokeStyle = '#ffffff';
            visorCtx.lineWidth = 14;
            visorCtx.stroke();
        } else if (expName === 'star') {
            // ★ ★ Astro Bot Level-Up Stars (Super Bright)
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 50;
            visorCtx.fillStyle = glowColor;
            drawStar(visorCtx, 0, 0, 5, 60, 26);
            visorCtx.fill();

            visorCtx.shadowColor = '#ffffff';
            visorCtx.shadowBlur = 15;
            visorCtx.fillStyle = '#ffffff';
            drawStar(visorCtx, 0, 0, 5, 36, 15);
            visorCtx.fill();

            visorCtx.fillStyle = '#ffffff';
            visorCtx.fillRect(isRight ? 48 : -48, -38, 8, 8);
            visorCtx.fillRect(isRight ? -45 : 45, 36, 6, 6);
        } else if (expName === 'focused') {
            // \ / Sharp Sporty Astro Bot Eyes
            const dir = isRight ? 1 : -1;
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.fillStyle = glowColor;
            visorCtx.beginPath();
            visorCtx.moveTo(-45 * dir, -42);
            visorCtx.lineTo(52 * dir, -14);
            visorCtx.lineTo(40 * dir, 44);
            visorCtx.lineTo(-52 * dir, 26);
            visorCtx.closePath();
            visorCtx.fill();

            visorCtx.shadowColor = '#ffffff';
            visorCtx.shadowBlur = 12;
            visorCtx.fillStyle = '#ffffff';
            visorCtx.beginPath();
            visorCtx.moveTo(-32 * dir, -30);
            visorCtx.lineTo(40 * dir, -10);
            visorCtx.lineTo(30 * dir, 32);
            visorCtx.lineTo(-40 * dir, 18);
            visorCtx.closePath();
            visorCtx.fill();
        } else if (expName === 'surprised') {
            // O O Wide Excited Astro Eyes
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.strokeStyle = glowColor;
            visorCtx.lineWidth = 28;
            visorCtx.beginPath();
            visorCtx.arc(0, 0, 50, 0, Math.PI * 2);
            visorCtx.stroke();

            visorCtx.shadowColor = '#ffffff';
            visorCtx.shadowBlur = 12;
            visorCtx.strokeStyle = '#ffffff';
            visorCtx.lineWidth = 14;
            visorCtx.stroke();

            visorCtx.fillStyle = '#ffffff';
            visorCtx.beginPath();
            visorCtx.arc(0, 0, 18, 0, Math.PI * 2);
            visorCtx.fill();
        } else if (expName === 'heart') {
            // ♥ ♥ Digital Heart Eyes
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.fillStyle = glowColor;
            drawHeart(visorCtx, 0, -10, 56);
            visorCtx.fill();

            visorCtx.shadowColor = '#ffffff';
            visorCtx.shadowBlur = 12;
            visorCtx.fillStyle = '#ffffff';
            drawHeart(visorCtx, 0, -10, 32);
            visorCtx.fill();
        } else if (expName === 'wink' && !isRight) {
            // Left eye wink ^, right eye normal
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.strokeStyle = glowColor;
            visorCtx.lineWidth = 32;
            visorCtx.lineCap = 'round';
            visorCtx.beginPath();
            visorCtx.arc(0, 16, 42, Math.PI * 1.15, Math.PI * 1.85, false);
            visorCtx.stroke();

            visorCtx.strokeStyle = '#ffffff';
            visorCtx.lineWidth = 14;
            visorCtx.stroke();
        } else {
            // Normal Astro Bot Eyes: Rounded Squircle Pill with Dynamic Blink
            const eyeW = 90;
            const fullH = 126;
            const eyeH = Math.max(10, fullH * (1.0 - blinkProgress));
            const r = Math.min(eyeW / 2, eyeH / 2);

            // Layer 1: Outer Neon Bloom Halo
            visorCtx.shadowColor = glowColor;
            visorCtx.shadowBlur = 45;
            visorCtx.fillStyle = glowColor;
            roundRect(visorCtx, -eyeW / 2, -eyeH / 2, eyeW, eyeH, r);
            visorCtx.fill();

            // Layer 2: Vivid Mid Glow
            visorCtx.shadowBlur = 20;
            visorCtx.strokeStyle = glowColor;
            visorCtx.lineWidth = 8;
            roundRect(visorCtx, -eyeW / 2, -eyeH / 2, eyeW, eyeH, r);
            visorCtx.stroke();

            // Layer 3: Ultra Bright Pure White Core
            if (eyeH > 24) {
                visorCtx.shadowColor = '#ffffff';
                visorCtx.shadowBlur = 10;
                visorCtx.fillStyle = '#ffffff';
                const coreInset = 12;
                roundRect(visorCtx, -eyeW / 2 + coreInset, -eyeH / 2 + coreInset, eyeW - coreInset * 2, eyeH - coreInset * 2, Math.max(3, r - coreInset));
                visorCtx.fill();

                // Layer 4: Astro Bot Iconic Specular Gloss Catchlights
                visorCtx.fillStyle = 'rgba(255, 255, 255, 1.0)';
                visorCtx.beginPath();
                visorCtx.arc(-16, -eyeH / 2 + 28, 12, 0, Math.PI * 2);
                visorCtx.fill();

                visorCtx.beginPath();
                visorCtx.arc(18, eyeH / 2 - 25, 7, 0, Math.PI * 2);
                visorCtx.fill();
            }
        }

        visorCtx.restore();
    }

    drawSingleEye(lx, false);
    drawSingleEye(rx, true);

    visorCtx.restore();
    visorTexture.needsUpdate = true;
}

renderAstroBotScreen('normal');

// Palet Material Bulu Serigala (Orange Fox/Wolf Ghibli Tone)
const furBaseOrange = new THREE.Color('#f97316'); // Vibrant Orange
const furWarmAmber = new THREE.Color('#fbbf24');  // Golden Accent
const furWhiteCream = new THREE.Color('#fffbeb'); // Creamy underbelly & chest
const darkSnoutColor = new THREE.Color('#292524'); // Hidung & cakar
const innerEarPink = new THREE.Color('#fed7aa');  // Telinga dalam

// Material Toon
const furOrangeMat = new THREE.MeshToonMaterial({
    color: furBaseOrange,
    gradientMap: celGradientTex,
    roughness: 0.6
});

const furWhiteMat = new THREE.MeshToonMaterial({
    color: furWhiteCream,
    gradientMap: celGradientTex,
    roughness: 0.6
});

const darkAccentsMat = new THREE.MeshToonMaterial({
    color: darkSnoutColor,
    gradientMap: celGradientTex,
    roughness: 0.4
});

const earInnerMat = new THREE.MeshToonMaterial({
    color: innerEarPink,
    gradientMap: celGradientTex,
    roughness: 0.7
});

const goldRuneMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.85,
    roughness: 0.25,
    emissive: 0xd97706,
    emissiveIntensity: 0.35
});

// Material Kacamata Vision Pro Astro Bot AMOLED
const visorScreenMat = new THREE.MeshBasicMaterial({
    map: visorTexture,
    side: THREE.DoubleSide,
    toneMapped: false // Memastikan pancaran neon AMOLED menyala 100% terang
});

// Kaca depan kristal bening ultra-transparan (tidak menggelapkan layar)
const visorGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.02,
    transparent: true,
    opacity: 0.08,
    depthWrite: false
});

const visorTitaniumMat = new THREE.MeshStandardMaterial({
    color: 0x1f2430,
    metalness: 0.90,
    roughness: 0.18,
    side: THREE.DoubleSide
});

const visorChromeRimMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.95,
    roughness: 0.10
});

const visorFoamMat = new THREE.MeshStandardMaterial({
    color: 0x090c14,
    roughness: 0.95
});

