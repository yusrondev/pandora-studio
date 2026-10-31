/* ========================================================
   MOBILE TOUCH CONTROLS (VIRTUAL JOYSTICK & ACTION BUTTONS)
   Fluid 360-degree analog locomotion and actions for mobile
   ======================================================== */

let mobileJoystickForward = 0;
let mobileJoystickTurn = 0;

function isTouchDevice() {
    return ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0) ||
           (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
}

function initMobileControls() {
    const controlsContainer = document.getElementById('mobile-play-controls');
    const joystickZone = document.getElementById('mobile-joystick-zone');
    const joystickBase = document.getElementById('mobile-joystick-base');
    const joystickStick = document.getElementById('mobile-joystick-stick');
    const btnJump = document.getElementById('btn-mobile-jump');
    const btnPunch = document.getElementById('btn-mobile-punch');
    const btnKick = document.getElementById('btn-mobile-kick');
    const btnShield = document.getElementById('btn-mobile-shield');

    if (!controlsContainer || !joystickZone || !joystickBase || !joystickStick) {
        return;
    }

    // 1. VIRTUAL ANALOG JOYSTICK LOGIC
    let activeTouchId = null;
    let baseCenter = { x: 0, y: 0 };
    const maxDistance = 58; // Jangkauan stick (px)
    const deadZone = 0.1;  // Gerakan kecil ibu jari diabaikan
    const STICK_FULL = 0.85; // Dorongan sejauh ini sudah dihitung penuh, supaya ibu jari tidak harus mentok
    const SPRINT_TAP_MS = 220; // Tombol X: lepas lebih cepat dari ini = lompat, lebih lama = lari

    // Joystick mengambang: dasar berpindah ke tempat ibu jari mendarat
    function placeBaseAt(clientX, clientY) {
        joystickBase.style.transform = '';
        const rect = joystickBase.getBoundingClientRect();
        const restX = rect.left + rect.width / 2;
        const restY = rect.top + rect.height / 2;
        joystickBase.style.transform = `translate(${clientX - restX}px, ${clientY - restY}px)`;
        baseCenter.x = clientX;
        baseCenter.y = clientY;
    }

    function resetJoystick() {
        activeTouchId = null;
        mobileJoystickForward = 0;
        mobileJoystickTurn = 0;
        keys.w = false;
        keys.s = false;
        keys.a = false;
        keys.d = false;
        activeTouchId = null;
        window.activeJoystickTouchId = null;
        joystickStick.style.transform = 'translate(-50%, -50%)';
        joystickBase.style.transform = '';
        joystickBase.classList.remove('active');
    }

    function processJoystickMove(clientX, clientY) {
        const dx = clientX - baseCenter.x;
        const dy = clientY - baseCenter.y;
        const dist = Math.hypot(dx, dy);

        const angle = Math.atan2(dy, dx);
        const clampedDist = Math.min(dist, maxDistance);

        const stickX = Math.cos(angle) * clampedDist;
        const stickY = Math.sin(angle) * clampedDist;

        joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

        // Normalisasi -1.0 sampai +1.0
        // Analog hanya mengatur arah dan kecepatan berjalan; berlari dengan menahan tombol X
        const rawStrength = clampedDist / maxDistance;
        const strength = rawStrength <= deadZone ? 0 : Math.min(1, (rawStrength - deadZone) / (STICK_FULL - deadZone));
        const normX = Math.cos(angle) * strength;
        const normY = -Math.sin(angle) * strength; // Ke atas bernilai positif

        mobileJoystickForward = normY;
        mobileJoystickTurn = normX;

        // Reset idle timer & prone saat joystick digerakkan
        if (Math.abs(normX) > 0.08 || Math.abs(normY) > 0.08) {
            if (typeof foxIdleTimer !== 'undefined') foxIdleTimer = 0;
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter) {
                wolfCharacter.idleTimer = 0.0;
                wolfCharacter.activeIdleKey = null;
            }
            if (typeof manualProne !== 'undefined') manualProne = false;
        }

        // Pasangkan juga ke keys keyboard sebagai fallback
        keys.w = normY > 0.18;
        keys.s = normY < -0.22;
        keys.a = normX < -0.20;
        keys.d = normX > 0.20;
    }

    // Touch Event Listeners untuk Joystick
    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeTouchId !== null) return;

        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        window.activeJoystickTouchId = touch.identifier;
        placeBaseAt(touch.clientX, touch.clientY);
        joystickBase.classList.add('active');
        processJoystickMove(touch.clientX, touch.clientY);
        if (navigator.vibrate) navigator.vibrate(10);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === activeTouchId) {
                e.preventDefault();
                processJoystickMove(touch.clientX, touch.clientY);
                break;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                window.activeJoystickTouchId = null;
                resetJoystick();
                break;
            }
        }
    });

    window.addEventListener('touchcancel', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                window.activeJoystickTouchId = null;
                resetJoystick();
                break;
            }
        }
    });

    // Mouse pointer fallback untuk testing joystick di simulator desktop
    let isMouseDriving = false;
    joystickZone.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isMouseDriving = true;
        placeBaseAt(e.clientX, e.clientY);
        joystickBase.classList.add('active');
        processJoystickMove(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDriving) return;
        processJoystickMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
        if (isMouseDriving) {
            isMouseDriving = false;
            resetJoystick();
        }
    });

    // 2. TOMBOL X: tahan untuk berlari, ketuk untuk melompat
    if (btnJump) {
        let pressedAt = 0;
        let lastTouchTime = 0;
        const press = () => {
            pressedAt = performance.now();
            keys.shift = true;
            btnJump.classList.add('active');
            if (navigator.vibrate) navigator.vibrate(15);
        };
        const release = (canJump) => {
            if (!pressedAt) return;
            const heldFor = performance.now() - pressedAt;
            pressedAt = 0;
            btnJump.classList.remove('active');
            // Lompat lebih dulu: keys.shift masih aktif saat dibaca, jadi lompat lari tetap bisa dari ketukan
            if (canJump && heldFor < SPRINT_TAP_MS && typeof triggerWolfJump === 'function') {
                triggerWolfJump();
                setTimeout(() => { if (!pressedAt) keys.shift = false; }, 60);
            } else {
                keys.shift = false;
            }
        };

        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            lastTouchTime = performance.now();
            press();
        }, { passive: false });
        btnJump.addEventListener('touchend', (e) => {
            e.preventDefault();
            release(true);
        }, { passive: false });
        btnJump.addEventListener('touchcancel', () => release(false));

        // Mouse untuk mencoba di desktop; abaikan event sintetis setelah sentuhan
        btnJump.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (performance.now() - lastTouchTime > 450) press();
        });
        window.addEventListener('mouseup', () => release(true));
    }

    // 4. PUNCH BUTTON (COMBO ATTACK)
    if (btnPunch) {
        let lastPunchTap = 0;
        let lastPunchTouchTime = 0;
        const doPunch = (e, isTouch = false) => {
            if (e) e.preventDefault();
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (!isTouch && (now - lastPunchTouchTime < 450)) return; // Abaikan click sintetis touch
            if (isTouch) lastPunchTouchTime = now;
            if (now - lastPunchTap < 70) return;
            lastPunchTap = now;

            btnPunch.classList.add('active');
            setTimeout(() => { btnPunch.classList.remove('active'); }, 140);
            // Tanpa tombol tembak terpisah: selama senjata dipegang, tombol kotak menembak
            if (typeof ItemSystem !== 'undefined' && ItemSystem.equippedItem) {
                ItemSystem.useEquippedItem();
            } else if (typeof triggerWolfPunch === 'function') {
                triggerWolfPunch();
            }
            if (navigator.vibrate) navigator.vibrate(22);
        };

        btnPunch.addEventListener('touchstart', (e) => doPunch(e, true), { passive: false });
        btnPunch.addEventListener('click', (e) => doPunch(e, false));
    }

    // 5. KICK BUTTON (SWEEP ATTACK)
    if (btnKick) {
        let lastKickTap = 0;
        let lastKickTouchTime = 0;
        const doKick = (e, isTouch = false) => {
            if (e) e.preventDefault();
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (!isTouch && (now - lastKickTouchTime < 450)) return; // Abaikan click sintetis touch
            if (isTouch) lastKickTouchTime = now;
            if (now - lastKickTap < 70) return;
            lastKickTap = now;

            btnKick.classList.add('active');
            setTimeout(() => { btnKick.classList.remove('active'); }, 140);
            if (typeof triggerWolfKick === 'function') {
                triggerWolfKick();
            }
            if (navigator.vibrate) navigator.vibrate(25);
        };

        btnKick.addEventListener('touchstart', (e) => doKick(e, true), { passive: false });
        btnKick.addEventListener('click', (e) => doKick(e, false));
    }

    // 5B. SHIELD / BLOCK BUTTON (TANGKISAN PERTAHANAN)
    if (btnShield) {
        let lastShieldTouchTime = 0;
        btnShield.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            lastShieldTouchTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            btnShield.classList.add('active');
            if (typeof startWolfBlock === 'function') {
                startWolfBlock();
            }
            if (navigator.vibrate) navigator.vibrate(20);
        }, { passive: false });

        btnShield.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            btnShield.classList.remove('active');
            if (typeof stopWolfBlock === 'function') {
                stopWolfBlock();
            }
        }, { passive: false });

        btnShield.addEventListener('touchcancel', () => {
            btnShield.classList.remove('active');
            if (typeof stopWolfBlock === 'function') {
                stopWolfBlock();
            }
        });

        btnShield.addEventListener('click', (e) => {
            e.preventDefault();
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (now - lastShieldTouchTime < 450) return; // Sudah diproses oleh touchstart
            btnShield.classList.add('active');
            setTimeout(() => { btnShield.classList.remove('active'); }, 180);
            if (typeof triggerWolfBlock === 'function') {
                triggerWolfBlock();
            }
        });
    }
}

// Harus dipanggil langsung dari klik pemain: browser menolak fullscreen di luar gestur.
// iPhone tidak mendukung keduanya, jadi petunjuk "putar perangkat" menjadi cadangan.
async function enterMobileGameView() {
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
    try {
        const root = document.documentElement;
        if (!document.fullscreenElement && root.requestFullscreen) {
            await root.requestFullscreen({ navigationUI: 'hide' });
        }
        if (screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape');
        }
    } catch (err) { /* browser menolak: pemain memutar perangkat sendiri */ }
}
window.enterMobileGameView = enterMobileGameView;

function exitMobileGameView() {
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
    if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (err) { /* tidak didukung */ }
    }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
window.exitMobileGameView = exitMobileGameView;

function ensureRotateHint() {
    if (document.getElementById('rotate-device-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'rotate-device-hint';
    hint.textContent = 'Putar perangkat ke posisi mendatar untuk bermain';
    document.body.appendChild(hint);
}

function showMobileControls() {
    ensureRotateHint();
    const controlsContainer = document.getElementById('mobile-play-controls');
    if (controlsContainer && isTouchDevice()) {
        controlsContainer.style.display = 'block';
    }
}

function hideMobileControls() {
    const controlsContainer = document.getElementById('mobile-play-controls');
    if (controlsContainer) {
        controlsContainer.style.display = 'none';
    }
    mobileJoystickForward = 0;
    mobileJoystickTurn = 0;
    keys.shift = false;
    const btnShield = document.getElementById('btn-mobile-shield');
    if (btnShield) btnShield.classList.remove('active');
    if (typeof stopWolfBlock === 'function') stopWolfBlock();
}

// Inisialisasi setelah DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileControls);
} else {
    initMobileControls();
}
