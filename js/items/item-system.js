/* ===================================================================
   PANDORA ITEM SYSTEM - CENTRAL ITEM & INVENTORY MANAGER
   Manages player item inventory, roulette roll, HUD display,
   mouse right-click & mobile action button triggers, and
   future item extensibility.
   =================================================================== */

const ItemSystem = {
    equippedItem: null, // 'plasma' | future items
    ammo: 3, // Maksimal 3 peluru per pickup
    maxAmmo: 3,
    isRolling: false,

    // Registry for future item types
    registry: {
        'plasma': {
            id: 'plasma',
            name: 'Plasma Bazooka',
            iconSvg: `
                <svg viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="18" fill="url(#plasmaGrad)" stroke="#ffedd5" stroke-width="2" />
                    <path d="M24 10V38M10 24H38" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
                    <circle cx="24" cy="24" r="7" fill="#ffffff" />
                    <defs>
                        <radialGradient id="plasmaGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#fff7ed" />
                            <stop offset="35%" stop-color="#fb923c" />
                            <stop offset="80%" stop-color="#ea580c" />
                            <stop offset="100%" stop-color="#7c2d12" />
                        </radialGradient>
                    </defs>
                </svg>
            `,
            desktopHint: '<kbd>R-Click</kbd> / Klik Kanan Tembak',
            mobileHint: 'Tap Tombol Api',
            onEquip(foxModel) {
                if (window.plasmaWeaponInstance) {
                    window.plasmaWeaponInstance.attachToFox(foxModel);
                }
            },
            onUse() {
                if (window.plasmaWeaponInstance) {
                    return window.plasmaWeaponInstance.launchMissile();
                }
                return false;
            },
            onDetach() {
                if (window.plasmaWeaponInstance) {
                    window.plasmaWeaponInstance.detachFromFox();
                }
            }
        }
    },

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // 1. Mouse Right-Click trigger (Desktop)
        window.addEventListener('mousedown', (e) => {
            if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
            // Button 2 = Right Click
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                this.useEquippedItem();
            }
        });

        // 2. Prevent right-click context menu when in Play Mode
        window.addEventListener('contextmenu', (e) => {
            if (typeof isPlayMode !== 'undefined' && isPlayMode) {
                e.preventDefault();
            }
        });

        // 3. Space / F shortcut as secondary trigger
        window.addEventListener('keydown', (e) => {
            if (typeof isPlayMode === 'undefined' || !isPlayMode) return;
            if (e.key === 'f' || e.key === 'F') {
                this.useEquippedItem();
            }
        });

        // 4. Click on HUD Item Frame
        const hudFrame = document.getElementById('item-slot-frame');
        if (hudFrame) {
            hudFrame.addEventListener('click', (e) => {
                e.preventDefault();
                this.useEquippedItem();
            });
        }
    },

    updateAmmoDisplay() {
        const hudHint = document.getElementById('item-slot-hint');
        if (hudHint && this.equippedItem) {
            const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const triggerText = isMobile ? 'Tap Tombol Api' : 'Klik Kanan Tembak';
            hudHint.innerHTML = `<span style="color:#fbbf24; font-weight:700;">Peluru: ${this.ammo}/${this.maxAmmo}</span> | ${triggerText}`;
        }
    },

    /**
     * Called when Fox collides with an Item Box
     */
    onItemCollected(itemType = 'plasma') {
        if (!this.registry[itemType]) itemType = 'plasma';

        const hudContainer = document.getElementById('item-slot-hud');
        const hudFrame = document.getElementById('item-slot-frame');
        const hudIcon = document.getElementById('item-slot-icon');
        const hudTitle = document.getElementById('item-slot-title');

        if (hudContainer) hudContainer.classList.add('visible');
        if (hudFrame) hudFrame.classList.add('roulette-active');

        this.isRolling = true;

        // Crash Nitro Kart style quick roulette roll (0.55s)
        const itemDef = this.registry[itemType];
        setTimeout(() => {
            this.isRolling = false;
            this.equippedItem = itemType;
            this.maxAmmo = 3;
            this.ammo = 3;

            if (hudFrame) {
                hudFrame.classList.remove('roulette-active');
                hudFrame.classList.add('item-acquired');
                setTimeout(() => hudFrame.classList.remove('item-acquired'), 600);
            }

            if (hudIcon) hudIcon.innerHTML = itemDef.iconSvg;
            if (hudTitle) hudTitle.innerText = itemDef.name;
            this.updateAmmoDisplay();

            // Equip weapon onto Fox's flank
            if (typeof wolfCharacter !== 'undefined' && wolfCharacter) {
                itemDef.onEquip(wolfCharacter);
            }

            // Show mobile item action button
            this.updateMobileButtonState(true);
        }, 550);
    },

    /**
     * Fires / activates the current equipped item
     */
    useEquippedItem() {
        if (!this.equippedItem || this.isRolling) return;
        const itemDef = this.registry[this.equippedItem];
        if (!itemDef) return;

        const fired = itemDef.onUse();

        if (fired) {
            // Visual feedback on HUD
            const hudFrame = document.getElementById('item-slot-frame');
            if (hudFrame) {
                hudFrame.style.transform = 'scale(0.92)';
                setTimeout(() => { hudFrame.style.transform = ''; }, 100);
            }

            // Vibrate on mobile
            if (navigator.vibrate) navigator.vibrate(25);

            // Decrement Ammo: Maksimal 3 tembakan
            this.ammo--;
            this.updateAmmoDisplay();

            if (this.ammo <= 0) {
                // 3x tembakan tercapai -> Plasma jatuh ke tanah lalu fade out
                const hudHint = document.getElementById('item-slot-hint');
                if (hudHint) {
                    hudHint.innerHTML = '<span style="color:#ef4444; font-weight:700;">Peluru Habis!</span>';
                }

                setTimeout(() => {
                    if (window.plasmaWeaponInstance && typeof window.plasmaWeaponInstance.dropAndFadeout === 'function') {
                        window.plasmaWeaponInstance.dropAndFadeout();
                    }
                    this.equippedItem = null;
                    this.updateMobileButtonState(false);

                    setTimeout(() => {
                        if (!this.equippedItem) {
                            const hudContainer = document.getElementById('item-slot-hud');
                            if (hudContainer) hudContainer.classList.remove('visible');
                        }
                    }, 1400);
                }, 260);
            }
        }
    },

    updateMobileButtonState(visible) {
        const btnItem = document.getElementById('btn-mobile-use-item');
        if (btnItem) {
            btnItem.style.display = visible ? 'flex' : 'none';
        }
    },

    onFoxSpeciesChanged(newWolfModel) {
        if (this.equippedItem && this.registry[this.equippedItem]) {
            if (this.equippedItem === 'plasma' && window.plasmaWeaponInstance) {
                window.plasmaWeaponInstance.attachToFox(newWolfModel, false);
            } else {
                this.registry[this.equippedItem].onEquip(newWolfModel);
            }
        }
    },

    reset() {
        if (this.equippedItem && this.registry[this.equippedItem]) {
            this.registry[this.equippedItem].onDetach();
        }
        this.equippedItem = null;
        this.isRolling = false;

        const hudContainer = document.getElementById('item-slot-hud');
        if (hudContainer) hudContainer.classList.remove('visible');

        this.updateMobileButtonState(false);
    },

    update(dt, elapsedTime) {
        if (window.plasmaWeaponInstance) {
            window.plasmaWeaponInstance.update(dt, elapsedTime);
        }
    }
};

window.ItemSystem = ItemSystem;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ItemSystem.init());
} else {
    ItemSystem.init();
}
