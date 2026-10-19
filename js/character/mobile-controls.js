/* ========================================================
   MOBILE TOUCH CONTROLS (VIRTUAL JOYSTICK & ACTION BUTTONS)
   Fluid 360-degree analog locomotion and actions for mobile
   ======================================================== */

let mobileJoystickForward = 0;
let mobileJoystickTurn = 0;
let isMobileSprintActive = false;

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
    const btnSprint = document.getElementById('btn-mobile-sprint');
    const btnExit = document.getElementById('btn-mobile-exit-demo');

    if (!controlsContainer || !joystickZone || !joystickBase || !joystickStick) {
        return;
    }

    // 1. VIRTUAL ANALOG JOYSTICK LOGIC
    let activeTouchId = null;
    let baseCenter = { x: 0, y: 0 };
    const maxDistance = 55; // Max stick travel radius in px (disesuaikan dengan analog lebih besar)

    function updateBaseCenter() {
        const rect = joystickBase.getBoundingClientRect();
        baseCenter.x = rect.left + rect.width / 2;
        baseCenter.y = rect.top + rect.height / 2;
    }

    function resetJoystick() {
        activeTouchId = null;
        mobileJoystickForward = 0;
        mobileJoystickTurn = 0;
        keys.w = false;
        keys.s = false;
        keys.a = false;
        keys.d = false;
        joystickStick.style.transform = 'translate(-50%, -50%)';
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
        const normX = stickX / maxDistance;
        const normY = -stickY / maxDistance; // Ke atas bernilai positif

        mobileJoystickForward = normY;
        mobileJoystickTurn = normX;

        // Reset idle timer & prone saat joystick digerakkan
        if (Math.abs(normX) > 0.08 || Math.abs(normY) > 0.08) {
            if (typeof foxIdleTimer !== 'undefined') foxIdleTimer = 0;
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
        updateBaseCenter();
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
                resetJoystick();
                break;
            }
        }
    });

    window.addEventListener('touchcancel', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
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
        updateBaseCenter();
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

    // 2. JUMP BUTTON
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            btnJump.classList.add('active');
            if (typeof triggerWolfJump === 'function') {
                triggerWolfJump();
            } else {
                keys.space = true;
                setTimeout(() => { keys.space = false; }, 120);
            }
            if (navigator.vibrate) navigator.vibrate(20);
        }, { passive: false });

        btnJump.addEventListener('touchend', () => {
            btnJump.classList.remove('active');
        });

        btnJump.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof triggerWolfJump === 'function') triggerWolfJump();
        });
    }

    // 3. SPRINT BUTTON (TOGGLE OR HOLD)
    if (btnSprint) {
        btnSprint.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isMobileSprintActive = !isMobileSprintActive;
            keys.shift = isMobileSprintActive;
            btnSprint.classList.toggle('active', isMobileSprintActive);
            if (navigator.vibrate) navigator.vibrate(15);
        }, { passive: false });

        btnSprint.addEventListener('click', (e) => {
            e.preventDefault();
            isMobileSprintActive = !isMobileSprintActive;
            keys.shift = isMobileSprintActive;
            btnSprint.classList.toggle('active', isMobileSprintActive);
        });
    }

    // 4. EXIT DEMO BUTTON
    if (btnExit) {
        btnExit.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof stopPlayMode === 'function') stopPlayMode();
        }, { passive: false });

        btnExit.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof stopPlayMode === 'function') stopPlayMode();
        });
    }
}

function showMobileControls() {
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
    isMobileSprintActive = false;
    keys.shift = false;
    const btnSprint = document.getElementById('btn-mobile-sprint');
    if (btnSprint) btnSprint.classList.remove('active');
}

// Inisialisasi setelah DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileControls);
} else {
    initMobileControls();
}
