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
const dockToggleLeft = document.getElementById('dock-toggle-left');
const dockToggleRight = document.getElementById('dock-toggle-right');

function updateSidebarCSSVariables() {
    const sLeft = document.getElementById('sidebar-left');
    const sRight = document.getElementById('sidebar-right');
    const isLeftOpen = sLeft && !sLeft.classList.contains('collapsed');
    const isRightOpen = sRight && !sRight.classList.contains('collapsed');

    const leftW = isLeftOpen ? (sLeft.offsetWidth || parseFloat(sLeft.style.width) || 285) : 0;
    const rightW = isRightOpen ? (sRight.offsetWidth || parseFloat(sRight.style.width) || 285) : 0;

    document.documentElement.style.setProperty('--sidebar-left-actual-width', leftW + 'px');
    document.documentElement.style.setProperty('--sidebar-right-actual-width', rightW + 'px');
    if (typeof updateViewportSize === 'function') updateViewportSize();
}
window.updateSidebarCSSVariables = updateSidebarCSSVariables;

function toggleLeftSidebar(forceState) {
    const willCollapse = forceState !== undefined ? !forceState : !sidebarLeft.classList.contains('collapsed');
    if (willCollapse) {
        sidebarLeft.classList.add('collapsed');
        dockToggleLeft.classList.add('visible');
        btnToggleLeftSidebar.classList.remove('active');
    } else {
        sidebarLeft.classList.remove('collapsed');
        dockToggleLeft.classList.remove('visible');
        btnToggleLeftSidebar.classList.add('active');
    }
    updateSidebarCSSVariables();
}

function toggleRightSidebar(forceState) {
    const willCollapse = forceState !== undefined ? !forceState : !sidebarRight.classList.contains('collapsed');
    if (willCollapse) {
        sidebarRight.classList.add('collapsed');
        dockToggleRight.classList.add('visible');
        btnToggleRightSidebar.classList.remove('active');
    } else {
        sidebarRight.classList.remove('collapsed');
        dockToggleRight.classList.remove('visible');
        btnToggleRightSidebar.classList.add('active');
    }
    updateSidebarCSSVariables();
}

btnToggleLeftSidebar.addEventListener('click', () => toggleLeftSidebar());
btnCloseLeftSidebar.addEventListener('click', () => toggleLeftSidebar(false));
dockToggleLeft.addEventListener('click', () => toggleLeftSidebar(true));

btnToggleRightSidebar.addEventListener('click', () => toggleRightSidebar());
btnCloseRightSidebar.addEventListener('click', () => toggleRightSidebar(false));
dockToggleRight.addEventListener('click', () => toggleRightSidebar(true));

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

// Inisialisasi awal sinkronisasi CSS variable untuk panel cinematic bawah
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

