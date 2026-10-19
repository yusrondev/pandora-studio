/* Studio UI interaction handlers & init */
// ==========================================
// 13. STUDIO UI INTERACTION HANDLERS
// ==========================================
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarRight = document.getElementById('sidebar-right');
const btnToggleLeftSidebar = document.getElementById('btn-toggle-left-sidebar');
const btnToggleRightSidebar = document.getElementById('btn-toggle-right-sidebar');
const btnCloseLeftSidebar = document.getElementById('btn-close-left-sidebar');
const btnCloseRightSidebar = document.getElementById('btn-close-right-sidebar');

function updateSidebarCSSVariables() {
    const isMobile = window.innerWidth <= 768;
    const sLeft = document.getElementById('sidebar-left');
    const sRight = document.getElementById('sidebar-right');
    const isLeftOpen = sLeft && !sLeft.classList.contains('collapsed');
    const isRightOpen = sRight && !sRight.classList.contains('collapsed');

    // Pada mobile, sidebar menjadi overlay drawer di atas viewport (tidak memperkecil viewport)
    const leftW = (!isMobile && isLeftOpen) ? (sLeft.offsetWidth || parseFloat(sLeft.style.width) || 285) : 0;
    const rightW = (!isMobile && isRightOpen) ? (sRight.offsetWidth || parseFloat(sRight.style.width) || 285) : 0;

    document.documentElement.style.setProperty('--sidebar-left-actual-width', leftW + 'px');
    document.documentElement.style.setProperty('--sidebar-right-actual-width', rightW + 'px');

    // Sinkronkan backdrop mobile saat salah satu drawer terbuka
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (backdrop) {
        if (isMobile && (isLeftOpen || isRightOpen)) {
            backdrop.classList.add('visible');
        } else {
            backdrop.classList.remove('visible');
        }
    }

    if (typeof updateViewportSize === 'function') updateViewportSize();
    if (typeof window.checkToolbarOverflow === 'function') window.checkToolbarOverflow();
}
window.updateSidebarCSSVariables = updateSidebarCSSVariables;

function toggleLeftSidebar(forceState) {
    const willCollapse = forceState !== undefined ? !forceState : !sidebarLeft.classList.contains('collapsed');
    if (willCollapse) {
        sidebarLeft.classList.add('collapsed');
        btnToggleLeftSidebar.classList.remove('active');
    } else {
        sidebarLeft.classList.remove('collapsed');
        btnToggleLeftSidebar.classList.add('active');
        // Di mobile, jika buka panel kiri, otomatis tutup panel kanan agar rapi
        if (window.innerWidth <= 768 && sidebarRight && !sidebarRight.classList.contains('collapsed')) {
            toggleRightSidebar(false);
        }
    }
    updateSidebarCSSVariables();
}

function toggleRightSidebar(forceState) {
    const willCollapse = forceState !== undefined ? !forceState : !sidebarRight.classList.contains('collapsed');
    if (willCollapse) {
        sidebarRight.classList.add('collapsed');
        btnToggleRightSidebar.classList.remove('active');
    } else {
        sidebarRight.classList.remove('collapsed');
        btnToggleRightSidebar.classList.add('active');
        // Di mobile, jika buka panel kanan, otomatis tutup panel kiri agar rapi
        if (window.innerWidth <= 768 && sidebarLeft && !sidebarLeft.classList.contains('collapsed')) {
            toggleLeftSidebar(false);
        }
    }
    updateSidebarCSSVariables();
}

btnToggleLeftSidebar.addEventListener('click', () => toggleLeftSidebar());
btnCloseLeftSidebar.addEventListener('click', () => toggleLeftSidebar(false));

btnToggleRightSidebar.addEventListener('click', () => toggleRightSidebar());
btnCloseRightSidebar.addEventListener('click', () => toggleRightSidebar(false));

// Tutup sidebar saat backdrop di-tap di mobile
const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');
if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', () => {
        toggleLeftSidebar(false);
        toggleRightSidebar(false);
    });
}

btnToggleLeftSidebar.classList.add('active');
btnToggleRightSidebar.classList.add('active');

// --- RESIZE SIDEBAR WIDTH LOGIC ---
const resizerLeft = document.getElementById('resizer-sidebar-left');
const resizerRight = document.getElementById('resizer-sidebar-right');

if (resizerLeft && sidebarLeft) {
    let isDraggingLeft = false;
    let startX = 0;
    let startWidth = 0;

    resizerLeft.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDraggingLeft = true;
        startX = e.clientX;
        startWidth = sidebarLeft.getBoundingClientRect().width;
        resizerLeft.classList.add('dragging');
        document.body.classList.add('resizing-sidebar');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDraggingLeft) return;
        const newWidth = Math.min(650, Math.max(220, startWidth + (e.clientX - startX)));
        sidebarLeft.style.width = newWidth + 'px';
        document.documentElement.style.setProperty('--sidebar-left-actual-width', newWidth + 'px');
        if (typeof updateViewportSize === 'function') updateViewportSize();
    });

    window.addEventListener('pointerup', () => {
        if (!isDraggingLeft) return;
        isDraggingLeft = false;
        resizerLeft.classList.remove('dragging');
        document.body.classList.remove('resizing-sidebar');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        updateSidebarCSSVariables();
    });
}

if (resizerRight && sidebarRight) {
    let isDraggingRight = false;
    let startX = 0;
    let startWidth = 0;

    resizerRight.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDraggingRight = true;
        startX = e.clientX;
        startWidth = sidebarRight.getBoundingClientRect().width;
        resizerRight.classList.add('dragging');
        document.body.classList.add('resizing-sidebar');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDraggingRight) return;
        const newWidth = Math.min(650, Math.max(200, startWidth - (e.clientX - startX)));
        sidebarRight.style.width = newWidth + 'px';
        document.documentElement.style.setProperty('--sidebar-right-actual-width', newWidth + 'px');
        if (typeof updateViewportSize === 'function') updateViewportSize();
    });

    window.addEventListener('pointerup', () => {
        if (!isDraggingRight) return;
        isDraggingRight = false;
        resizerRight.classList.remove('dragging');
        document.body.classList.remove('resizing-sidebar');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        updateSidebarCSSVariables();
    });
}

// Inisialisasi awal sinkronisasi: sembunyikan panel timeline cinematic di awal
const bottomPanel = document.getElementById('cinematic-bottom-panel');
if (bottomPanel && bottomPanel.classList.contains('visible')) {
    bottomPanel.classList.remove('visible');
    document.body.classList.remove('cinematic-footer-open');
    const btnCinematicDock = document.getElementById('btn-toggle-cinematic-dock');
    if (btnCinematicDock) btnCinematicDock.classList.remove('active');
}
if (window.innerWidth <= 768) {
    if (sidebarLeft && !sidebarLeft.classList.contains('collapsed')) toggleLeftSidebar(false);
    if (sidebarRight && !sidebarRight.classList.contains('collapsed')) toggleRightSidebar(false);
}
updateSidebarCSSVariables();
window.addEventListener('resize', updateSidebarCSSVariables);

document.querySelectorAll('.accordion').forEach(acc => {
    const title = acc.querySelector('.accordion-title');
    if (title) {
        title.addEventListener('click', (e) => {
            if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
            acc.classList.toggle('collapsed');
        });
    }
});

const btnResetCamera = document.getElementById('btn-reset-camera');
if (btnResetCamera) {
    btnResetCamera.addEventListener('click', () => {
        camera.position.set(0, 16, 32);
        controls.target.set(0, 0, 0);
        controls.update();
    });
}

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
if (btnUndo) btnUndo.addEventListener('click', performUndo);
if (btnRedo) btnRedo.addEventListener('click', performRedo);

const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
    } else {
        document.exitFullscreen().catch(() => { });
    }
}
if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', toggleFullscreen);
}

function updateActiveModeHUD() {
    const banner = document.getElementById('active-mode-banner');
    const bannerText = document.getElementById('mode-banner-text');
    const btnCancelEsc = document.getElementById('btn-cancel-esc');

    let modeLabel = '';
    let modeIcon = '';

    if (selectTreeMode && selectTreeMode.value !== 'none') {
        const text = selectTreeMode.options[selectTreeMode.selectedIndex] ? selectTreeMode.options[selectTreeMode.selectedIndex].text : selectTreeMode.value;
        modeLabel = `Tanam Pohon: ${text}`;
        modeIcon = '🌲';
    } else if (selectRoadBrush && selectRoadBrush.value !== 'none') {
        const text = selectRoadBrush.options[selectRoadBrush.selectedIndex] ? selectRoadBrush.options[selectRoadBrush.selectedIndex].text : selectRoadBrush.value;
        modeLabel = `Kuas Jalan: ${text}`;
        modeIcon = '🛤️';
    } else if (selectGrassBrush && selectGrassBrush.value !== 'none') {
        const text = selectGrassBrush.options[selectGrassBrush.selectedIndex] ? selectGrassBrush.options[selectGrassBrush.selectedIndex].text : selectGrassBrush.value;
        modeLabel = `Kuas Rumput: ${text}`;
        modeIcon = '🌿';
    } else if (typeof selectRockBrush !== 'undefined' && selectRockBrush && selectRockBrush.value !== 'none') {
        const text = selectRockBrush.options[selectRockBrush.selectedIndex] ? selectRockBrush.options[selectRockBrush.selectedIndex].text : selectRockBrush.value;
        modeLabel = `Kuas Batu: ${text}`;
        modeIcon = '🪨';
    } else if (selectTerrainMode && selectTerrainMode.value !== 'none') {
        const text = selectTerrainMode.options[selectTerrainMode.selectedIndex] ? selectTerrainMode.options[selectTerrainMode.selectedIndex].text : selectTerrainMode.value;
        modeLabel = `Sculpt Tanah: ${text}`;
        modeIcon = '⛰️';
    } else if (selectedTreeIndex >= 0 && treesList[selectedTreeIndex]) {
        const tree = treesList[selectedTreeIndex];
        modeLabel = `Pohon #${selectedTreeIndex + 1} Terpilih (${tree.userData.type || 'Pohon'})`;
        modeIcon = '📍';
    } else if (isPanMode) {
        modeLabel = 'Hand / Pan Tool Aktif';
        modeIcon = '✋';
    }

    const hasActive = !!modeLabel;

    if (banner && bannerText) {
        if (hasActive) {
            let actionHint = `Tekan <span class="esc-kbd">Esc</span> untuk batal / unset`;
            if (selectTreeMode && selectTreeMode.value !== 'none') {
                actionHint = `Klik Kiri: Tanam &bull; Klik Kanan: Hapus &bull; Scroll: Zoom &bull; <span class="esc-kbd">Esc</span> selesai`;
            } else if (selectGrassBrush && selectGrassBrush.value !== 'none') {
                actionHint = `Klik Kiri: Tanam &bull; Klik Kanan: Hapus &bull; Scroll: Zoom &bull; <span class="esc-kbd">Esc</span> selesai`;
            } else if (selectRoadBrush && selectRoadBrush.value !== 'none') {
                actionHint = `Klik Kiri: Buat Jalan &bull; Klik Kanan: Hapus &bull; Scroll: Zoom &bull; <span class="esc-kbd">Esc</span> selesai`;
            } else {
                actionHint = `Scroll: Zoom &bull; Tekan <span class="esc-kbd">Esc</span> untuk selesai`;
            }
            bannerText.innerHTML = `<strong>${modeIcon} ${modeLabel}</strong> &mdash; ${actionHint}`;
            banner.classList.add('visible');
        } else {
            banner.classList.remove('visible');
        }
    }

    if (btnCancelEsc) {
        if (hasActive) {
            btnCancelEsc.classList.add('active-cancel');
            btnCancelEsc.title = `Batal / Unset ${modeLabel} (Esc)`;
        } else {
            btnCancelEsc.classList.remove('active-cancel');
            btnCancelEsc.title = "Batal / Unset Semua Pilihan (Esc)";
        }
    }

    // Sinkronisasi status visual kartu spawner pohon & rumput
    const treeGrid = document.getElementById('tree-picker-grid');
    if (treeGrid && selectTreeMode) {
        const val = selectTreeMode.value;
        treeGrid.querySelectorAll('.spawner-card').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-value') === val);
        });
    }
    const grassGrid = document.getElementById('grass-picker-grid');
    if (grassGrid && selectGrassBrush) {
        const val = selectGrassBrush.value;
        grassGrid.querySelectorAll('.spawner-card').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-value') === val);
        });
    }
}

function cancelAllSelections() {
    if (selectTreeMode) selectTreeMode.value = 'none';
    if (selectRoadBrush) selectRoadBrush.value = 'none';
    if (selectGrassBrush) selectGrassBrush.value = 'none';
    if (typeof selectRockBrush !== 'undefined' && selectRockBrush) selectRockBrush.value = 'none';
    if (selectTerrainMode) selectTerrainMode.value = 'none';

    if (typeof brushReticleGroup !== 'undefined') {
        brushReticleGroup.visible = false;
    }

    if (typeof CinematicManager !== 'undefined') {
        if (CinematicManager.isDrawingMode) {
            CinematicManager.toggleDrawingMode(false);
        }
        if (CinematicManager.isPlaying || document.getElementById('cinematic-floating-timeline')?.classList.contains('visible')) {
            CinematicManager.stop();
        }
        const dofOverlay = document.getElementById('cinematic-dof-overlay');
        if (dofOverlay) {
            dofOverlay.classList.remove('active');
            dofOverlay.style.display = 'none';
        }
        document.body.classList.remove('cinematic-mode-active');
    }

    selectedTreeIndex = -1;
    if (typeof SelectionOutlineManager !== 'undefined') {
        SelectionOutlineManager.clearSelection();
    }

    if (isPanMode) {
        isPanMode = false;
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        if (btnHandMode) btnHandMode.classList.remove('active');
    }

    isMouseDown = false;
    if (typeof isRightMouseDown !== 'undefined') isRightMouseDown = false;
    if (typeof updateToolControlsState === 'function') {
        updateToolControlsState();
    } else {
        controls.enabled = true;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
    }

    refreshLayerUI();
    updateEditorUI();
    updateActiveModeHUD();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
}

const btnCancelEsc = document.getElementById('btn-cancel-esc');
if (btnCancelEsc) {
    btnCancelEsc.addEventListener('click', cancelAllSelections);
}

const btnBannerEsc = document.getElementById('btn-banner-sk');
if (btnBannerEsc) {
    btnBannerEsc.addEventListener('click', cancelAllSelections);
}

window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag);

    if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        if (isPlayMode) {
            stopPlayMode();
            return;
        }
        cancelAllSelections();
        return;
    }

    if (!isTyping && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePlayMode();
        return;
    }

    if (isPlayMode) {
        return;
    }

    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        performRedo();
        return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        performUndo();
        return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        performRedo();
        return;
    }

    if (!isTyping && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key.toLowerCase() === 'i') {
            e.preventDefault();
            toggleLeftSidebar();
        } else if (e.key.toLowerCase() === 'l') {
            e.preventDefault();
            toggleRightSidebar();
        } else if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFullscreen();
        }
    }
});

updateEditorUI();
updateActiveModeHUD();

// ========================================================
// SYNC VISUAL PREVIEW SPAWNER CARDS (TREE & GRASS)
// ========================================================
function setupSpawnerCardGrid(gridId, selectId) {
    const grid = document.getElementById(gridId);
    const select = document.getElementById(selectId);
    if (!grid || !select) return;

    const cards = grid.querySelectorAll('.spawner-card');

    function syncCards() {
        const val = select.value;
        cards.forEach(card => {
            const cardVal = card.getAttribute('data-value');
            card.classList.toggle('active', cardVal === val);
        });
    }

    cards.forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const val = card.getAttribute('data-value');
            if (select.value === val && val !== 'none') {
                select.value = 'none';
            } else {
                select.value = val;
            }
            select.dispatchEvent(new Event('change'));
            syncCards();
            if (typeof updateActiveModeHUD === 'function') {
                updateActiveModeHUD();
            }
        });
    });

    select.addEventListener('change', syncCards);
    syncCards();
}

setupSpawnerCardGrid('tree-picker-grid', 'select-tree-mode');
setupSpawnerCardGrid('grass-picker-grid', 'select-grass-brush');
setupSpawnerCardGrid('rock-picker-grid', 'select-rock-brush');

// Tab switcher between Rumput and Bebatuan in Brush accordion
const tabBrushGrass = document.getElementById('btn-tab-brush-grass');
const tabBrushRock = document.getElementById('btn-tab-brush-rock');
const subpanelBrushGrass = document.getElementById('subpanel-brush-grass');
const subpanelBrushRock = document.getElementById('subpanel-brush-rock');

if (tabBrushGrass && tabBrushRock) {
    tabBrushGrass.addEventListener('click', () => {
        tabBrushGrass.classList.add('active');
        tabBrushRock.classList.remove('active');
        if (subpanelBrushGrass) subpanelBrushGrass.style.display = 'block';
        if (subpanelBrushRock) subpanelBrushRock.style.display = 'none';
    });

    tabBrushRock.addEventListener('click', () => {
        tabBrushRock.classList.add('active');
        tabBrushGrass.classList.remove('active');
        if (subpanelBrushRock) subpanelBrushRock.style.display = 'block';
        if (subpanelBrushGrass) subpanelBrushGrass.style.display = 'none';
    });
}

// Mutual exclusivity between Rock Brush and other tools
if (typeof selectRockBrush !== 'undefined' && selectRockBrush) {
    selectRockBrush.addEventListener('change', () => {
        if (selectRockBrush.value !== 'none') {
            if (selectGrassBrush && selectGrassBrush.value !== 'none') {
                selectGrassBrush.value = 'none';
                selectGrassBrush.dispatchEvent(new Event('change'));
            }
            if (selectTreeMode && selectTreeMode.value !== 'none') {
                selectTreeMode.value = 'none';
                selectTreeMode.dispatchEvent(new Event('change'));
            }
            if (selectRoadBrush && selectRoadBrush.value !== 'none') {
                selectRoadBrush.value = 'none';
            }
            if (selectTerrainMode && selectTerrainMode.value !== 'none') {
                selectTerrainMode.value = 'none';
            }
        }
        if (typeof updateToolControlsState === 'function') updateToolControlsState();
        if (typeof updateActiveModeHUD === 'function') updateActiveModeHUD();
    });
}

if (selectGrassBrush) {
    selectGrassBrush.addEventListener('change', () => {
        if (selectGrassBrush.value !== 'none') {
            if (typeof selectRockBrush !== 'undefined' && selectRockBrush && selectRockBrush.value !== 'none') {
                selectRockBrush.value = 'none';
                selectRockBrush.dispatchEvent(new Event('change'));
            }
        }
    });
}

// ========================================================
// RESPONSIVE TOOLBAR OVERFLOW MANAGER (Titik Tiga / More Options)
// ========================================================
function initToolbarOverflowManager() {
    const toolbar = document.getElementById('top-toolbar');
    const overflowBtn = document.getElementById('btn-toolbar-overflow');
    const overflowDropdown = document.getElementById('toolbar-overflow-dropdown');
    const overflowContent = document.getElementById('toolbar-overflow-content');

    if (!toolbar || !overflowBtn || !overflowDropdown || !overflowContent) {
        return;
    }

    // Candidate elements that can overflow (in priority order: rightmost first)
    const candidateIds = [
        'btn-toggle-fullscreen',
        'toolbar-group-leaves',
        'toolbar-group-wind',
        'toolbar-group-elevation',
        'toolbar-group-azimuth',
        'toolbar-group-sky',
        'btn-cancel-esc',
        'btn-redo',
        'btn-undo',
        'btn-reset-camera',
        'btn-hand-mode'
    ];

    const candidates = candidateIds.map(id => document.getElementById(id)).filter(Boolean);

    // Create persistent marker comment for each candidate to restore exact DOM slot
    candidates.forEach((el, idx) => {
        const marker = document.createComment(`overflow-slot-${el.id || idx}`);
        el.parentNode.insertBefore(marker, el);
        el._overflowMarker = marker;
        el._originalToolbarWidth = el.offsetWidth || 80;
    });

    const overflowedItems = [];

    function updateOriginalWidths() {
        candidates.forEach(el => {
            if (el.parentNode === toolbar && el.offsetWidth > 0) {
                el._originalToolbarWidth = el.offsetWidth;
            }
        });
    }

    const candidateOrderMap = {
        'toolbar-group-sky': 1,
        'toolbar-group-azimuth': 2,
        'toolbar-group-elevation': 3,
        'toolbar-group-wind': 4,
        'toolbar-group-leaves': 5,
        'btn-toggle-fullscreen': 6,
        'btn-cancel-esc': 7,
        'btn-redo': 8,
        'btn-undo': 9,
        'btn-reset-camera': 10,
        'btn-hand-mode': 11
    };

    function sortOverflowContent() {
        const items = Array.from(overflowContent.children);
        items.sort((a, b) => (candidateOrderMap[a.id] || 99) - (candidateOrderMap[b.id] || 99));
        items.forEach(item => overflowContent.appendChild(item));
    }

    function updateDividers() {
        const divEnv1 = document.getElementById('divider-env-1');
        const divEnv2 = document.getElementById('divider-env-2');
        if (divEnv1) {
            const windInToolbar = document.getElementById('toolbar-group-wind')?.parentNode === toolbar;
            const elevInToolbar = document.getElementById('toolbar-group-elevation')?.parentNode === toolbar;
            divEnv1.style.display = (windInToolbar && elevInToolbar) ? '' : 'none';
        }
        if (divEnv2) {
            const leavesInToolbar = document.getElementById('toolbar-group-leaves')?.parentNode === toolbar;
            const windInToolbar = document.getElementById('toolbar-group-wind')?.parentNode === toolbar;
            const fsInToolbar = document.getElementById('btn-toggle-fullscreen')?.parentNode === toolbar;
            divEnv2.style.display = ((leavesInToolbar || windInToolbar) && fsInToolbar) ? '' : 'none';
        }
    }

    function checkOverflow() {
        updateOriginalWidths();

        // 1. If content exceeds visible width, progressively move candidates into dropdown
        let safetyCounter = 0;
        while (toolbar.scrollWidth > toolbar.clientWidth + 2 && safetyCounter < candidates.length) {
            safetyCounter++;
            const itemToMove = candidates.find(c => c.parentNode === toolbar);
            if (!itemToMove) break;

            overflowBtn.style.display = 'inline-flex';
            overflowContent.appendChild(itemToMove);
            overflowedItems.push(itemToMove);
        }

        // 2. If window grew wider, test if the last overflowed item can fit back
        while (overflowedItems.length > 0) {
            const lastItem = overflowedItems[overflowedItems.length - 1];
            const neededWidth = (lastItem._originalToolbarWidth || 60) + 14;
            const availableSpace = toolbar.clientWidth - toolbar.scrollWidth;

            if (availableSpace >= neededWidth) {
                lastItem._overflowMarker.parentNode.insertBefore(lastItem, lastItem._overflowMarker);
                overflowedItems.pop();
            } else {
                break;
            }
        }

        sortOverflowContent();
        updateDividers();

        // 3. Update visibility of overflow button and dropdown
        if (overflowedItems.length === 0) {
            overflowBtn.style.display = 'none';
            toolbar.classList.remove('has-overflow');
            overflowDropdown.classList.remove('open');
            overflowBtn.classList.remove('active');
        } else {
            overflowBtn.style.display = 'inline-flex';
            toolbar.classList.add('has-overflow');
        }
    }

    // Toggle dropdown
    overflowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = overflowDropdown.classList.contains('open');
        if (isOpen) {
            overflowDropdown.classList.remove('open');
            overflowBtn.classList.remove('active');
        } else {
            const rect = overflowBtn.getBoundingClientRect();
            const topPos = rect.bottom + 4;
            overflowDropdown.style.top = topPos + 'px';
            if (window.innerWidth <= 768) {
                overflowDropdown.style.left = '8px';
                overflowDropdown.style.right = '8px';
            } else {
                overflowDropdown.style.left = '';
                overflowDropdown.style.right = Math.max(6, window.innerWidth - rect.right) + 'px';
            }
            // Batasi tinggi dropdown secara dinamis agar pas di dalam layar HP dan scrollable
            const availableHeight = Math.max(160, window.innerHeight - topPos - 12);
            overflowDropdown.style.maxHeight = availableHeight + 'px';

            overflowDropdown.classList.add('open');
            overflowBtn.classList.add('active');
        }
    });

    overflowDropdown.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && (btn.id === 'btn-play-mode' || btn.classList.contains('btn-compact') || btn.classList.contains('btn-icon-only'))) {
            // Tutup dropdown otomatis jika tombol aksi utama diklik
            overflowDropdown.classList.remove('open');
            overflowBtn.classList.remove('active');
        }
        e.stopPropagation();
    });

    // Cegah event swipe/scroll di dropdown mengganggu OrbitControls kamera 3D
    overflowDropdown.addEventListener('touchstart', (e) => {
        e.stopPropagation();
    }, { passive: true });
    overflowDropdown.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: true });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!overflowBtn.contains(e.target) && !overflowDropdown.contains(e.target)) {
            overflowDropdown.classList.remove('open');
            overflowBtn.classList.remove('active');
        }
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overflowDropdown.classList.remove('open');
            overflowBtn.classList.remove('active');
        }
    });

    window.addEventListener('resize', checkOverflow);

    // Initial checks
    setTimeout(checkOverflow, 50);
    setTimeout(checkOverflow, 250);
    setTimeout(checkOverflow, 600);

    window.checkToolbarOverflow = checkOverflow;
}

initToolbarOverflowManager();


