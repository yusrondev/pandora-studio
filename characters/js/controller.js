/* Character Controller, Physics & Animation Loop */
// =====================================================================
// 7. CHARACTER CONTROLLER, PHYSICS & STATE MACHINE
// =====================================================================
const wolfState = {
    // Transform & Motion
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    heading: 0,           // Sudut rotasi serigala
    speed: 0,             // Kecepatan gerak saat ini
    baseWalkSpeed: 3.8,
    baseRunSpeed: 8.5,

    // Jump & Vertical Physics
    isGrounded: true,
    velocityY: 0,
    jumpStrength: 8.2,
    gravity: 21.0,

    // Action States
    isSprinting: false,
    isHowling: false,
    isSitting: false,
    howlTimer: 0,
    blinkTimer: 0,
    earTwitchTimer: 0,

    // Input Flags
    forward: false,
    backward: false,
    left: false,
    right: false,
    jumpQueued: false,

    // Camera Settings
    cameraMode: 'follow', // 'follow', 'orbit', 'cinematic'
    cinematicAngle: 0,

    // State Gerakan Ekor Otonom & Alami (Flick acak kiri-kanan & gelombang perambatan)
    tailFlickTimer: 2.0,
    tailFlickTargetY: 0,
    tailFlickTargetX: -0.5,
    tailCurrentAngleY: 0,
    tailCurrentAngleX: -0.5,

    // Dinamika Gerak Alami Hewan (Smooth Turning, Banking, Jump Trajectory & Landing Cushion)
    bankAngle: 0,          // Sudut kemiringan badan saat belok (lean/roll ke dalam tikungan)
    neckTurnY: 0,          // Antisipasi leher & kepala menoleh lebih dulu ke arah belok
    jumpBlend: 0,          // Transisi mulus melayang di udara dan menapak tanah
    landingSquash: 0,      // Meredam tumbukan pendaratan (kompresi sendi & pantulan alami)
    gaitPhase: 0,          // Fase siklus langkah berbasis perpindahan jarak & kecepatan
    idleTimer: 0           // Timer auto-sit setelah 5 detik diam
};

// Keyboard & Key Press Listeners
const activeKeys = {};
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    activeKeys[key] = true;

    if (key === 'w' || key === 'arrowup') wolfState.forward = true;
    if (key === 's' || key === 'arrowdown') wolfState.backward = true;
    if (key === 'a' || key === 'arrowleft') wolfState.left = true;
    if (key === 'd' || key === 'arrowright') wolfState.right = true;
    if (key === 'shift') wolfState.isSprinting = true;
    if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        triggerJump();
    }
    if (key === 'f') triggerHowl();
    if (key === 'c') toggleSit();

    updateDpadUI();
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    activeKeys[key] = false;

    if (key === 'w' || key === 'arrowup') wolfState.forward = false;
    if (key === 's' || key === 'arrowdown') wolfState.backward = false;
    if (key === 'a' || key === 'arrowleft') wolfState.left = false;
    if (key === 'd' || key === 'arrowright') wolfState.right = false;
    if (key === 'shift') wolfState.isSprinting = false;

    updateDpadUI();
});

function updateDpadUI() {
    document.getElementById('key-w').classList.toggle('pressed', wolfState.forward);
    document.getElementById('key-s').classList.toggle('pressed', wolfState.backward);
    document.getElementById('key-a').classList.toggle('pressed', wolfState.left);
    document.getElementById('key-d').classList.toggle('pressed', wolfState.right);
    document.getElementById('btn-action-sprint').classList.toggle('pressed', wolfState.isSprinting);
}

// On-screen D-Pad Mouse & Touch Handlers
function bindPressButton(elemId, onPress, onRelease) {
    const el = document.getElementById(elemId);
    if (!el) return;

    const handleDown = (e) => {
        e.preventDefault();
        onPress();
        el.classList.add('pressed');
    };
    const handleUp = (e) => {
        e.preventDefault();
        onRelease();
        el.classList.remove('pressed');
    };

    el.addEventListener('mousedown', handleDown);
    el.addEventListener('touchstart', handleDown, { passive: false });
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
}

bindPressButton('key-w', () => { wolfState.forward = true; }, () => { wolfState.forward = false; });
bindPressButton('key-s', () => { wolfState.backward = true; }, () => { wolfState.backward = false; });
bindPressButton('key-a', () => { wolfState.left = true; }, () => { wolfState.left = false; });
bindPressButton('key-d', () => { wolfState.right = true; }, () => { wolfState.right = false; });

// Action Trigger Functions
function triggerJump() {
    if (wolfState.isGrounded && !wolfState.isHowling) {
        wolfState.isSitting = false;
        wolfState.idleTimer = 0;
        const btnSit = document.getElementById('btn-action-sit');
        if (btnSit) btnSit.classList.remove('pressed');
        wolfState.velocityY = wolfState.jumpStrength;
        wolfState.isGrounded = false;
        soundFX.playJump();
        document.getElementById('btn-action-jump').classList.add('pressed');
        setTimeout(() => document.getElementById('btn-action-jump').classList.remove('pressed'), 250);
    }
}

function triggerHowl() {
    if (wolfState.isHowling) return;
    wolfState.isHowling = true;
    wolfState.howlTimer = 2.4;
    wolfState.isSitting = false;
    wolfState.idleTimer = 0;
    const btnSit = document.getElementById('btn-action-sit');
    if (btnSit) btnSit.classList.remove('pressed');
    soundFX.playHowl();

    const banner = document.getElementById('howl-banner');
    banner.classList.add('active');
    tongueMesh.visible = true;

    setTimeout(() => {
        banner.classList.remove('active');
        tongueMesh.visible = false;
    }, 2400);
}

function toggleSit() {
    if (!wolfState.isGrounded || wolfState.isHowling) return;
    wolfState.isSitting = !wolfState.isSitting;
    wolfState.idleTimer = 0;
    document.getElementById('btn-action-sit').classList.toggle('pressed', wolfState.isSitting);
}

// Bind Action Buttons
document.getElementById('btn-action-jump').addEventListener('click', triggerJump);
document.getElementById('btn-action-howl').addEventListener('click', triggerHowl);
document.getElementById('btn-action-sit').addEventListener('click', toggleSit);
document.getElementById('btn-action-sprint').addEventListener('click', () => {
    wolfState.isSprinting = !wolfState.isSprinting;
    updateDpadUI();
});

// Quick panel buttons
document.getElementById('btn-quick-howl').addEventListener('click', triggerHowl);
document.getElementById('btn-quick-sit').addEventListener('click', toggleSit);
document.getElementById('btn-quick-jump').addEventListener('click', triggerJump);
document.getElementById('btn-quick-pounce').addEventListener('click', () => {
    triggerJump();
    wolfState.speed = wolfState.baseRunSpeed * 1.3;
});

// Header controls (Sound, Time of Day, Reset Cam, Fullscreen)
const btnSound = document.getElementById('btn-sound-toggle');
btnSound.addEventListener('click', () => {
    soundFX.muted = !soundFX.muted;
    btnSound.classList.toggle('active', !soundFX.muted);
});

const timeBtns = {
    day: document.getElementById('btn-time-day'),
    sunset: document.getElementById('btn-time-sunset'),
    night: document.getElementById('btn-time-night')
};
Object.keys(timeBtns).forEach(k => {
    timeBtns[k].addEventListener('click', () => {
        Object.values(timeBtns).forEach(b => b.classList.remove('active'));
        timeBtns[k].classList.add('active');
        setEnvironmentPreset(k);
    });
});

document.getElementById('btn-cam-reset').addEventListener('click', () => {
    camera.position.set(0, 3.8, -8.5);
    controls.target.copy(wolfRoot.position).add(new THREE.Vector3(0, 1.4, 0));
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
    } else {
        document.exitFullscreen().catch(() => { });
    }
});

// Camera Switcher
const camPills = {
    follow: document.getElementById('cam-follow'),
    orbit: document.getElementById('cam-orbit'),
    cinematic: document.getElementById('cam-cinematic')
};
Object.keys(camPills).forEach(mode => {
    camPills[mode].addEventListener('click', () => {
        Object.values(camPills).forEach(p => p.classList.remove('active'));
        camPills[mode].classList.add('active');
        wolfState.cameraMode = mode;
    });
});

// Customizer Slider Listeners
const sliderFurGlow = document.getElementById('slider-fur-glow');
sliderFurGlow.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('val-fur-glow').innerText = `${val}%`;
    const mult = val / 100;
    furOrangeMat.color.copy(furBaseOrange).multiplyScalar(mult);
});

const sliderTailSize = document.getElementById('slider-tail-size');
sliderTailSize.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('val-tail-size').innerText = `${val.toFixed(1)}x`;
    tailBase.scale.set(val, val, val);
});

const sliderParticles = document.getElementById('slider-particles');
sliderParticles.addEventListener('input', (e) => {
    const val = e.target.value === '1';
    document.getElementById('val-particles').innerText = val ? 'Aktif' : 'Nonaktif';
    particlesSystem.visible = val;
});

// Visor Expression & Color Event Listeners
const visorExpButtons = document.querySelectorAll('.btn-visor-exp');
const badgeVisorExp = document.getElementById('badge-visor-exp');
visorExpButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        visorExpButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentVisorExp = btn.dataset.exp;
        if (badgeVisorExp) badgeVisorExp.innerText = currentVisorExp.toUpperCase();
    });
});

const visorColorDots = document.querySelectorAll('.color-dot');
visorColorDots.forEach(dot => {
    dot.addEventListener('click', () => {
        visorColorDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        currentVisorColor = dot.dataset.color;
        if (visorLight) visorLight.color.set(currentVisorColor);
        ledRingsList.forEach(r => r.material.color.set(currentVisorColor));
        if (badgeVisorExp) {
            badgeVisorExp.style.color = currentVisorColor;
            badgeVisorExp.style.borderColor = currentVisorColor;
        }
    });
});


// =====================================================================
// 8. ANIMATION LOOP & KINEMATICS
// =====================================================================
const clock = new THREE.Clock();
let stepSoundTimer = 0;

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // 1. UPDATE PHYSICAL MOVEMENT
    let moveX = 0;
    let moveZ = 0;

    const hasMoveInput = (wolfState.forward || wolfState.backward || wolfState.left || wolfState.right);
    if (hasMoveInput && !wolfState.isHowling) {
        // Sentuhan tombol gerak langsung membatalkan posisi duduk
        wolfState.isSitting = false;
        wolfState.idleTimer = 0;
        const btnSit = document.getElementById('btn-action-sit');
        if (btnSit) btnSit.classList.remove('pressed');
    }

    // Auto-sit setelah idle (diam tanpa input) selama 5 detik
    if (wolfState.isGrounded && !hasMoveInput && !wolfState.isHowling && wolfState.speed < 0.1) {
        wolfState.idleTimer += dt;
        if (wolfState.idleTimer >= 5.0 && !wolfState.isSitting) {
            wolfState.isSitting = true;
            const btnSit = document.getElementById('btn-action-sit');
            if (btnSit) btnSit.classList.add('pressed');
        }
    } else {
        wolfState.idleTimer = 0;
    }

    if (!wolfState.isHowling && !wolfState.isSitting) {
        if (wolfState.forward) moveZ -= 1;
        if (wolfState.backward) moveZ += 1;
        if (wolfState.left) moveX -= 1;
        if (wolfState.right) moveX += 1;
    }

    const isMoving = (moveX !== 0 || moveZ !== 0);
    if (isMoving) {
        wolfState.isSitting = false;
        wolfState.idleTimer = 0;
    }

    // Arah gerak relatif terhadap orientasi kamera
    let diff = 0;
    if (isMoving) {
        const camAngle = Math.atan2(
            wolfRoot.position.x - camera.position.x,
            wolfRoot.position.z - camera.position.z
        );
        const inputAngle = Math.atan2(moveX, -moveZ);
        const targetHeading = camAngle + inputAngle;

        // Rotasi halus ke arah gerak (slerp heading dengan inersia bobot tubuh)
        diff = targetHeading - wolfState.heading;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const turnSpeed = wolfState.isSprinting ? 9.5 : 11.5;
        wolfState.heading += diff * Math.min(1.0, turnSpeed * dt);

        const targetSpeed = wolfState.isSprinting ? wolfState.baseRunSpeed : wolfState.baseWalkSpeed;
        wolfState.speed += (targetSpeed - wolfState.speed) * 8.5 * dt;
    } else {
        wolfState.speed += (0 - wolfState.speed) * 10.0 * dt;
    }

    // Damping kemiringan badan (banking lean/roll) saat berbelok layaknya hewan asli
    const maxSpeed = wolfState.baseRunSpeed;
    const speedRatio = Math.min(1.0, wolfState.speed / maxSpeed);
    const targetBank = isMoving ? THREE.MathUtils.clamp(-diff * speedRatio * 0.40, -0.22, 0.22) : 0;
    wolfState.bankAngle += (targetBank - wolfState.bankAngle) * Math.min(1.0, 8.0 * dt);

    // Leher dan kepala menoleh duluan mengikuti arah belokan (Antisipasi visual alami)
    const targetNeckTurn = isMoving ? THREE.MathUtils.clamp(diff * 0.38, -0.32, 0.32) : 0;
    wolfState.neckTurnY += (targetNeckTurn - wolfState.neckTurnY) * Math.min(1.0, 10.0 * dt);

    // Gerakkan wolfRoot pada sumbu X & Z
    const forwardVector = new THREE.Vector3(
        Math.sin(wolfState.heading),
        0,
        Math.cos(wolfState.heading)
    );
    wolfRoot.position.addScaledVector(forwardVector, wolfState.speed * dt);
    wolfRoot.rotation.y = wolfState.heading;

    // 2. LOMPAT & GRAVITASI (VERTICAL MOTION & PENDARATAN SQUASH)
    if (!wolfState.isGrounded) {
        wolfState.velocityY -= wolfState.gravity * dt;
        wolfRoot.position.y += wolfState.velocityY * dt;

        if (wolfRoot.position.y <= 0) {
            wolfRoot.position.y = 0;
            wolfState.velocityY = 0;
            wolfState.isGrounded = true;
            // Trigger efek peredam kejut / squash saat menapak tanah
            wolfState.landingSquash = 0.18;
            soundFX.playLand();
        }
    }

    // Redam efek benturan pendaratan secara bertahap (suspensi sendi alami)
    wolfState.landingSquash *= Math.max(0, 1.0 - 14.0 * dt);

    // Efek suara langkah kaki berkala saat berlari di rumput
    if (wolfState.isGrounded && wolfState.speed > 0.5) {
        stepSoundTimer += dt * (wolfState.speed * 2.2);
        if (stepSoundTimer > Math.PI) {
            soundFX.playFootstep();
            stepSoundTimer = 0;
        }
    }

    // 3. ANIMATION GAIT CYCLE (TROT / GALLOP PROCEDURAL SKELETON)
    if (isMoving) {
        wolfState.gaitPhase += dt * (wolfState.isSprinting ? 14 : 9) * Math.min(1.0, wolfState.speed / (wolfState.isSprinting ? wolfState.baseRunSpeed : wolfState.baseWalkSpeed) + 0.15);
    }
    const cycle = wolfState.gaitPhase;

    if (wolfState.isHowling) {
        // Posisi Mengaum: Kepala tegak mendongak ke langit, mulut terbuka
        wolfState.howlTimer -= dt;
        if (wolfState.howlTimer <= 0) wolfState.isHowling = false;

        headGroup.rotation.x = -0.7 + Math.sin(time * 8) * 0.04;
        neckGroup.rotation.x = -0.4;
        jawGroup.rotation.x = 0.55 + Math.sin(time * 12) * 0.08;
        bodyGroup.position.y = 0.1;

        // Shockwave rings expanding
        howlRings.forEach((ring, idx) => {
            const wavePhase = (time * 2.5 + idx * 0.3) % 1.0;
            const scale = 0.5 + wavePhase * 3.5;
            ring.scale.set(scale, scale, scale);
            ring.material.opacity = (1.0 - wavePhase) * 0.8;
            ring.position.z = 0.2 + wavePhase * 1.8;
        });
    } else if (wolfState.isSitting) {
        // Posisi Duduk Santai Bahagia
        bodyGroup.position.y = -0.42;
        bodyGroup.rotation.x = -0.32;
        neckGroup.rotation.x = 0.22 + Math.sin(time * 3.0) * 0.02;
        headGroup.rotation.x = 0.08;
        headGroup.rotation.z = Math.sin(time * 2.5) * 0.05; // Gelengan kepala manis
        jawGroup.rotation.x = 0;

        frontLeftLeg.hip.rotation.x = 0.32;
        frontRightLeg.hip.rotation.x = 0.32;
        frontLeftLeg.knee.rotation.x = -0.15;
        frontRightLeg.knee.rotation.x = -0.15;

        backLeftLeg.hip.rotation.x = -1.25;
        backRightLeg.hip.rotation.x = -1.25;
        backLeftLeg.knee.rotation.x = 1.6;
        backRightLeg.knee.rotation.x = 1.6;

        // Ekor bergoyang cepat ke kanan dan kiri (Happy Wag Response)
        const happyWagCycle = time * 12.0;
        tailBase.rotation.x = -0.35 + Math.cos(happyWagCycle * 2.0) * 0.08;
        tailBase.rotation.y = Math.sin(happyWagCycle) * 0.72;
        tailBase.rotation.z = Math.cos(happyWagCycle) * 0.12;
    } else if (!wolfState.isGrounded) {
        // Posisi Melayang di Udara (Airborne Jump Pose yang Kontinu & Alami Tanpa Patah)
        const vNorm = THREE.MathUtils.clamp(wolfState.velocityY / wolfState.jumpStrength, -1.0, 1.0);

        // Elevasi & Pitch mengalir secara aerodinamis mengikuti kurva parabola
        bodyGroup.position.y = vNorm * 0.14 - wolfState.landingSquash;
        bodyGroup.rotation.x = -vNorm * 0.22;
        bodyGroup.rotation.z = wolfState.bankAngle;

        // Kaki depan: menjulur lentur saat naik, bersiap menapak saat turun
        frontLeftLeg.hip.rotation.x = -0.15 - vNorm * 0.45;
        frontRightLeg.hip.rotation.x = -0.10 - vNorm * 0.45;
        frontLeftLeg.knee.rotation.x = Math.max(0, -vNorm * 0.45) + wolfState.landingSquash * 1.6;
        frontRightLeg.knee.rotation.x = Math.max(0, -vNorm * 0.45) + wolfState.landingSquash * 1.6;

        // Kaki belakang: mendorong kuat ke belakang saat awal lompat, melipat ke bawah panggul saat turun
        backLeftLeg.hip.rotation.x = 0.20 + vNorm * 0.52;
        backRightLeg.hip.rotation.x = 0.25 + vNorm * 0.52;
        backLeftLeg.knee.rotation.x = Math.max(0, (vNorm + 0.25) * 0.55) + wolfState.landingSquash * 1.8;
        backRightLeg.knee.rotation.x = Math.max(0, (vNorm + 0.25) * 0.55) + wolfState.landingSquash * 1.8;

        // Kepala, Leher & Ekor mengikuti kurva lompatan dan mengimbangi arah belokan
        neckGroup.rotation.x = -vNorm * 0.14;
        neckGroup.rotation.y = wolfState.neckTurnY;
        headGroup.rotation.x = -vNorm * 0.08;
        headGroup.rotation.y = wolfState.neckTurnY * 0.55;

        tailBase.rotation.x = -0.45 - vNorm * 0.35;
        tailBase.rotation.y = Math.sin(time * 4) * 0.15 - wolfState.bankAngle * 1.4;
    } else if (isMoving) {
        // Berjalan / Berlari: Siklus Trot Alami dengan Bobbing & Lean
        bodyGroup.position.y = Math.abs(Math.sin(cycle)) * 0.10 - wolfState.landingSquash;
        bodyGroup.rotation.z = Math.sin(cycle * 0.5) * 0.035 + wolfState.bankAngle;
        bodyGroup.rotation.x = Math.sin(cycle) * 0.045;

        const legSwing = (wolfState.isSprinting ? 0.82 : 0.52) * Math.min(1.0, wolfState.speed / 1.5);
        frontLeftLeg.hip.rotation.x = Math.sin(cycle) * legSwing;
        frontRightLeg.hip.rotation.x = -Math.sin(cycle) * legSwing;
        backLeftLeg.hip.rotation.x = -Math.sin(cycle) * legSwing;
        backRightLeg.hip.rotation.x = Math.sin(cycle) * legSwing;

        frontLeftLeg.knee.rotation.x = Math.max(0, -Math.cos(cycle) * 0.65) + wolfState.landingSquash * 1.5;
        frontRightLeg.knee.rotation.x = Math.max(0, Math.cos(cycle) * 0.65) + wolfState.landingSquash * 1.5;
        backLeftLeg.knee.rotation.x = Math.max(0, Math.cos(cycle) * 0.75) + wolfState.landingSquash * 1.5;
        backRightLeg.knee.rotation.x = Math.max(0, -Math.cos(cycle) * 0.75) + wolfState.landingSquash * 1.5;

        // Kepala & Leher mengayun seirama langkah + antisipasi menoleh saat belok
        neckGroup.rotation.x = Math.sin(cycle) * 0.05;
        neckGroup.rotation.y = wolfState.neckTurnY;
        headGroup.rotation.x = -Math.sin(cycle) * 0.045;
        headGroup.rotation.y = wolfState.neckTurnY * 0.55;
        jawGroup.rotation.x = wolfState.isSprinting ? 0.16 : 0;

        // Ekor terangkat dan mengimbangi pergerakan lari serta berbelok
        tailBase.rotation.y = Math.sin(cycle * 0.5) * 0.35 - wolfState.bankAngle * 1.35;
        tailBase.rotation.x = -0.38 + Math.cos(cycle) * 0.10;
    } else {
        // Posisi Diam (Kaki tetap kokoh menapak tanah, nafas berdetak hanya pada area perut)
        bodyGroup.position.y = -wolfState.landingSquash;
        bodyGroup.rotation.set(0, 0, wolfState.bankAngle);
        neckGroup.rotation.x = Math.sin(time * 2.0) * 0.02;
        neckGroup.rotation.y = wolfState.neckTurnY;
        headGroup.rotation.x = -Math.sin(time * 2.0) * 0.015 + 0.04;
        headGroup.rotation.y = wolfState.neckTurnY * 0.55;
        jawGroup.rotation.x = 0;

        // Efek nafas halus hanya pada perut & torso tanpa membuat kaki tenggelam
        const breathCycle = Math.sin(time * 2.4);
        bellyMesh.scale.x = 0.92 + breathCycle * 0.035;
        bellyMesh.scale.y = 0.90 + breathCycle * 0.030;
        torsoMesh.scale.x = 1.0 + breathCycle * 0.016;
        torsoMesh.scale.y = 1.0 + breathCycle * 0.016;

        // Haluskan posisi sendi kaki kembali ke netral saat berhenti (tidak teleport mendadak)
        const settleSpeed = Math.min(1.0, 12.0 * dt);
        frontLeftLeg.hip.rotation.x += (0 - frontLeftLeg.hip.rotation.x) * settleSpeed;
        frontRightLeg.hip.rotation.x += (0 - frontRightLeg.hip.rotation.x) * settleSpeed;
        backLeftLeg.hip.rotation.x += (0 - backLeftLeg.hip.rotation.x) * settleSpeed;
        backRightLeg.hip.rotation.x += (0 - backRightLeg.hip.rotation.x) * settleSpeed;

        const kneeFlex = wolfState.landingSquash * 1.5;
        frontLeftLeg.knee.rotation.x += (kneeFlex - frontLeftLeg.knee.rotation.x) * settleSpeed;
        frontRightLeg.knee.rotation.x += (kneeFlex - frontRightLeg.knee.rotation.x) * settleSpeed;
        backLeftLeg.knee.rotation.x += (kneeFlex - backLeftLeg.knee.rotation.x) * settleSpeed;
        backRightLeg.knee.rotation.x += (kneeFlex - backRightLeg.knee.rotation.x) * settleSpeed;

        // EKOR BERGERAK SENDIRI SECARA OTONOM (FLICK ACAK KANAN/KIRI & ORGANIK SEPERTI RUBAH ASLI)
        wolfState.tailFlickTimer -= dt;
        if (wolfState.tailFlickTimer <= 0) {
            // Interval acak antara 1.2 hingga 4.5 detik
            wolfState.tailFlickTimer = 1.2 + Math.random() * 3.3;
            const flickDir = Math.random() > 0.5 ? 1 : -1;
            const flickPower = 0.25 + Math.random() * 0.55;
            wolfState.tailFlickTargetY = flickDir * flickPower;
            wolfState.tailFlickTargetX = -0.42 - Math.random() * 0.28;

            // 30% kesempatan melakukan double flick cepat
            if (Math.random() < 0.3) {
                wolfState.tailFlickTimer = 0.35 + Math.random() * 0.25;
            }
        } else {
            // Perlahan kembali ke posisi tengah netral
            wolfState.tailFlickTargetY *= Math.max(0, 1.0 - 1.4 * dt);
        }

        // Ayunan mikro multi-frekuensi yang tidak monoton
        const gentleNoiseY = Math.sin(time * 0.85) * 0.12 + Math.cos(time * 1.73 + 0.4) * 0.08 + Math.sin(time * 0.38) * 0.06;
        const gentleNoiseX = Math.cos(time * 0.72) * 0.05 + Math.sin(time * 1.45) * 0.03;

        wolfState.tailCurrentAngleY += (wolfState.tailFlickTargetY + gentleNoiseY - wolfState.tailCurrentAngleY) * Math.min(1.0, 7.0 * dt);
        wolfState.tailCurrentAngleX += (wolfState.tailFlickTargetX + gentleNoiseX - wolfState.tailCurrentAngleX) * Math.min(1.0, 5.0 * dt);

        tailBase.rotation.x = wolfState.tailCurrentAngleX;
        tailBase.rotation.y = wolfState.tailCurrentAngleY;
    }

    // 4. FISIKA SEKUNDER RANTAI EKOR (WAG SPREAD & SPRING LAG HINGGA UJUNG RUNCING)
    tailSegments.forEach((seg, idx) => {
        const lag = idx + 1;
        if (wolfState.isSitting) {
            // Kibasan ekor bahagia berombak cepat dari pangkal hingga ujung runcing
            const lagFactor = lag * 0.42;
            seg.rotation.y = Math.sin(time * 12.0 - lagFactor) * 0.36;
            seg.rotation.z = Math.cos(time * 12.0 - lagFactor) * 0.14;
            seg.rotation.x = (idx * 0.04) + Math.cos(time * 24.0 - lagFactor) * 0.05;
        } else if (isMoving) {
            const lagFactor = lag * 0.14;
            seg.rotation.y = Math.sin(cycle * 0.5 - lagFactor) * 0.20 - wolfState.bankAngle * 0.22;
            seg.rotation.z = Math.cos(cycle * 0.5 - lagFactor) * 0.09;
            seg.rotation.x = 0.04 * idx;
        } else {
            const waveY = Math.sin(time * 2.2 - lag * 0.6) * 0.07;
            const waveZ = Math.cos(time * 1.8 - lag * 0.5) * 0.05;
            seg.rotation.y = (wolfState.tailCurrentAngleY * 0.35) + waveY;
            seg.rotation.z = (wolfState.tailCurrentAngleY * 0.18) + waveZ;
            seg.rotation.x = (idx * 0.05) + Math.sin(time * 1.5 - lag * 0.4) * 0.04;
        }
    });

    // 5. UPDATE EKSPRESI KACAMATA ASTRO BOT VISION PRO AMOLED
    let activeExp = currentVisorExp;
    if (activeExp === 'auto') {
        if (wolfState.isHowling) activeExp = 'star';
        else if (wolfState.isSitting) activeExp = 'happy';
        else if (!wolfState.isGrounded) activeExp = 'surprised';
        else if (wolfState.isSprinting && isMoving) activeExp = 'focused';
        else if (isMoving) activeExp = 'normal';
        else activeExp = 'normal';
    }

    // Animasi Kedip Layar AMOLED pada ekspresi normal
    let blinkVal = 0;
    if (activeExp === 'normal') {
        wolfState.blinkTimer -= dt;
        if (wolfState.blinkTimer < 0.16) {
            blinkVal = Math.sin((wolfState.blinkTimer / 0.16) * Math.PI);
        }
        if (wolfState.blinkTimer <= 0) {
            wolfState.blinkTimer = 2.5 + Math.random() * 3.0;
        }
    }

    // Gerakan mata digital melirik mengikuti pergerakan
    const lookX = isMoving ? Math.sin(cycle * 0.5) * 0.4 : Math.sin(time * 0.8) * 0.25;
    const lookY = !wolfState.isGrounded ? -0.35 : 0;

    renderAstroBotScreen(activeExp, blinkVal, lookX, lookY);

    // Gerakan kedut telinga penasaran
    wolfState.earTwitchTimer += dt;
    if (wolfState.earTwitchTimer > 3.0) {
        leftEarGroup.rotation.y = Math.sin(time * 20) * 0.18;
        if (wolfState.earTwitchTimer > 3.4) wolfState.earTwitchTimer = 0;
    } else {
        leftEarGroup.rotation.y = 0;
    }

    // 6. UPDATE DANDELION / FIREFLY PARTICLES
    const pPositions = particleGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
        const vel = particleVelocities[i];
        vel.wobble += dt * 2.0;

        pPositions[i * 3] += vel.x + Math.sin(vel.wobble) * 0.02;
        pPositions[i * 3 + 1] += vel.y;
        pPositions[i * 3 + 2] += vel.z + Math.cos(vel.wobble) * 0.02;

        if (pPositions[i * 3 + 1] > 14) {
            pPositions[i * 3 + 1] = 0.2;
            pPositions[i * 3] = wolfRoot.position.x + (Math.random() - 0.5) * 50;
            pPositions[i * 3 + 2] = wolfRoot.position.z + (Math.random() - 0.5) * 50;
        }
    }
    particleGeo.attributes.position.needsUpdate = true;

    // 7. CAMERA SYSTEM (SMOOTH 3RD PERSON FOLLOW / ORBIT / CINEMATIC)
    if (wolfState.cameraMode === 'follow') {
        const targetLookAt = wolfRoot.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        controls.target.lerp(targetLookAt, 0.1);

        // Offset kamera di belakang punggung serigala
        const idealOffset = new THREE.Vector3(0, 2.8, -7.5);
        idealOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), wolfState.heading);
        const idealCameraPos = wolfRoot.position.clone().add(idealOffset);

        // Lerp kamera halus
        camera.position.lerp(idealCameraPos, 0.065);
        controls.update();
    } else if (wolfState.cameraMode === 'cinematic') {
        wolfState.cinematicAngle += dt * 0.45;
        const dist = 7.5;
        camera.position.x = wolfRoot.position.x + Math.sin(wolfState.cinematicAngle) * dist;
        camera.position.z = wolfRoot.position.z + Math.cos(wolfState.cinematicAngle) * dist;
        camera.position.y = wolfRoot.position.y + 2.4 + Math.sin(time * 0.8) * 0.4;
        controls.target.copy(wolfRoot.position).add(new THREE.Vector3(0, 1.3, 0));
        controls.update();
    } else {
        // Free Orbit mode
        controls.target.lerp(wolfRoot.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 0.05);
        controls.update();
    }

    if (camera.position.y < 0.5) camera.position.y = 0.5;

    // 8. UPDATE STATS UI
    document.getElementById('stat-speed').innerText = `${wolfState.speed.toFixed(1)} m/s`;
    document.getElementById('stat-altitude').innerText = `${wolfRoot.position.y.toFixed(2)} m`;

    let stateText = 'Berdiri (Idle)';
    if (wolfState.isHowling) stateText = 'Mengaum (Howl)';
    else if (!wolfState.isGrounded) stateText = 'Melompat (Jump)';
    else if (wolfState.isSitting) stateText = 'Duduk Santai';
    else if (wolfState.isSprinting && isMoving) stateText = 'Berlari Kencang (Sprint)';
    else if (isMoving) stateText = 'Melangkah (Walk)';
    document.getElementById('stat-state').innerText = stateText;
    document.getElementById('badge-motion').innerText = stateText.toUpperCase().split(' ')[0];

    renderer.render(scene, camera);
}

// Window Resize Handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Mulai Loop Animasi
animate();
