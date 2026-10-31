/* =========================================================
   PANDORA DESKTOP SHELL (dipakai index.html & hit-tool.html)
   Topbar + menu, workspace tabs, status bar, popup select,
   tooltip, number field drag, dan penonaktifan perilaku browser.
   Elemen asli (ID & listener) tidak diganti: menu hanya memanggil
   .click() pada tombol yang sudah ada.
   ========================================================= */
(function () {
    const ICON_PATHS = {
        play: '<polygon points="7 4 20 12 7 20" fill="currentColor" stroke="none"/>',
        pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>',
        prev: '<polygon points="19 5 9 12 19 19" fill="currentColor" stroke="none"/><line x1="6" y1="5" x2="6" y2="19"/>',
        next: '<polygon points="5 5 15 12 5 19" fill="currentColor" stroke="none"/><line x1="18" y1="5" x2="18" y2="19"/>',
        loop: '<polyline points="17 2 21 6 17 10"/><path d="M3 12V9a3 3 0 0 1 3-3h15"/><polyline points="7 22 3 18 7 14"/><path d="M21 12v3a3 3 0 0 1-3 3H3"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 3.9M6.5 6.6A18 18 0 0 0 1 12s4 7 11 7a10 10 0 0 0 5.4-1.6"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        check: '<polyline points="4 12 10 18 20 6"/>',
        cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    };

    function blIcon(name) {
        return `<svg class="bl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
    }
    window.blIcon = blIcon;

    const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+\s*/gu;
    const stripEmoji = (s) => String(s || '').replace(EMOJI_RE, '').trim();
    window.blStripEmoji = stripEmoji;

    // ---------------------------------------------------------
    // SLIDER FILL: value range bisa berubah dari JS tanpa event,
    // jadi setter value di-wrap agar isi slider selalu sinkron.
    // ---------------------------------------------------------
    function syncRangeFill(el) {
        const min = parseFloat(el.min) || 0;
        const maxAttr = parseFloat(el.max);
        const max = isNaN(maxAttr) ? 100 : maxAttr;
        const val = parseFloat(el.value);
        const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
        el.style.setProperty('--bl-fill', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
    }

    const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
        configurable: true,
        enumerable: valueDesc.enumerable,
        get() { return valueDesc.get.call(this); },
        set(v) {
            valueDesc.set.call(this, v);
            if (this.type === 'range') syncRangeFill(this);
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target && e.target.type === 'range') syncRangeFill(e.target);
    }, true);

    function syncRangesIn(root) {
        if (root.matches && root.matches('input[type="range"]')) syncRangeFill(root);
        if (root.querySelectorAll) root.querySelectorAll('input[type="range"]').forEach(syncRangeFill);
    }

    // Option yang diisi JS (mis. daftar bone) bisa membawa emoji dari data karakter.
    // Option tanpa atribut value dilewati karena value-nya adalah teksnya sendiri.
    function cleanOption(opt) {
        if (!opt.hasAttribute('value')) return;
        const clean = stripEmoji(opt.textContent);
        if (clean && clean !== opt.textContent) opt.textContent = clean;
    }

    function cleanOptionsIn(root) {
        if (root.tagName === 'OPTION') cleanOption(root);
        else if (root.querySelectorAll) root.querySelectorAll('option').forEach(cleanOption);
    }

    // ---------------------------------------------------------
    // PERILAKU BROWSER YANG DIMATIKAN
    // ---------------------------------------------------------
    const isEditable = (el) => !!el && (el.isContentEditable
        || el.tagName === 'TEXTAREA'
        || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button', 'file'].includes(el.type)));

    // Handler contextmenu game/brush tetap jalan karena hanya preventDefault, bukan stopPropagation
    document.addEventListener('contextmenu', (e) => {
        if (!isEditable(e.target)) e.preventDefault();
    });
    document.addEventListener('dragstart', (e) => {
        if (e.target && (e.target.tagName === 'A' || e.target.tagName === 'IMG')) e.preventDefault();
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const k = e.key.toLowerCase();
        if (['+', '=', '-', '0', 'p', 'u', 'd', 'f', 'g', 'h', 'j'].includes(k)) e.preventDefault();
        if (k === 's') {
            e.preventDefault();
            const save = document.getElementById('btn-save-map') || document.getElementById('btn-save-hitboxes');
            if (save && !save.disabled) save.click();
        }
    });

    // ---------------------------------------------------------
    // POPUP MENU (dipakai menu bar & <select>)
    // ---------------------------------------------------------
    let activePopup = null;
    let activePopupOwner = null;

    function closePopup() {
        if (activePopup) activePopup.remove();
        if (activePopupOwner) activePopupOwner.classList.remove('bl-open');
        activePopup = null;
        activePopupOwner = null;
    }

    // Listener window milik brush/orbit tidak boleh melihat klik pada chrome aplikasi
    function shieldEvents(el) {
        ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'wheel', 'contextmenu', 'touchstart'].forEach((type) => {
            el.addEventListener(type, (e) => e.stopPropagation(), { passive: type !== 'contextmenu' });
        });
    }

    function openPopup(owner, rows, opts = {}) {
        closePopup();
        const popup = document.createElement('div');
        popup.className = 'bl-popup' + (opts.className ? ' ' + opts.className : '');
        if (opts.title) {
            const t = document.createElement('div');
            t.className = 'bl-popup-title';
            t.textContent = opts.title;
            popup.appendChild(t);
        }
        rows.forEach((row) => {
            if (row.separator) {
                popup.appendChild(Object.assign(document.createElement('div'), { className: 'bl-popup-sep' }));
                return;
            }
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'bl-popup-item';
            if (row.selected) item.classList.add('selected');
            if (row.disabled) item.disabled = true;
            item.innerHTML = `<span class="bl-popup-check">${row.checked ? blIcon('check') : ''}</span><span class="bl-popup-label"></span><span class="bl-popup-key"></span>`;
            item.querySelector('.bl-popup-label').textContent = row.label;
            item.querySelector('.bl-popup-key').textContent = row.key || '';
            item.addEventListener('click', () => {
                closePopup();
                if (row.run) row.run();
            });
            popup.appendChild(item);
        });
        shieldEvents(popup);
        document.body.appendChild(popup);

        const r = owner.getBoundingClientRect();
        if (opts.matchWidth) popup.style.minWidth = r.width + 'px';
        const h = popup.offsetHeight;
        const w = popup.offsetWidth;
        let top = r.bottom + 1;
        if (top + h > window.innerHeight - 4) top = Math.max(4, r.top - h - 1);
        popup.style.top = top + 'px';
        popup.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
        const sel = popup.querySelector('.bl-popup-item.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });

        owner.classList.add('bl-open');
        activePopup = popup;
        activePopupOwner = owner;
    }

    document.addEventListener('mousedown', (e) => {
        if (activePopup && !activePopup.contains(e.target) && !(activePopupOwner && activePopupOwner.contains(e.target))) {
            closePopup();
        }
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); }, true);
    window.addEventListener('resize', closePopup);
    window.addEventListener('blur', closePopup);

    // ---------------------------------------------------------
    // SELECT: <select> asli tetap sumber data, hanya popup-nya diganti.
    // Layar sentuh tetap memakai picker native.
    // ---------------------------------------------------------
    const isCoarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    document.addEventListener('mousedown', (e) => {
        const select = e.target && e.target.closest && e.target.closest('select');
        if (!select || select.disabled || select.multiple || isCoarse() || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (activePopupOwner === select) { closePopup(); return; }

        const rows = [];
        Array.from(select.options).forEach((opt, idx) => {
            if (opt.hidden) return;
            rows.push({
                label: stripEmoji(opt.textContent),
                selected: idx === select.selectedIndex,
                disabled: opt.disabled,
                run() {
                    if (select.selectedIndex === idx) return;
                    select.selectedIndex = idx;
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
        openPopup(select, rows, { matchWidth: true, className: 'bl-popup-select' });
    }, true);

    // ---------------------------------------------------------
    // NUMBER FIELD: tarik horizontal untuk ubah nilai, klik untuk ketik
    // ---------------------------------------------------------
    document.addEventListener('mousedown', (e) => {
        const input = e.target;
        if (!input || input.tagName !== 'INPUT' || input.type !== 'number' || input.disabled || e.button !== 0) return;
        if (document.activeElement === input || isCoarse()) return;
        e.preventDefault();

        const startX = e.clientX;
        const startVal = parseFloat(input.value) || 0;
        const stepAttr = parseFloat(input.step);
        const step = stepAttr > 0 ? stepAttr : 1;
        const decimals = (String(input.step).split('.')[1] || '').length;
        const min = input.min === '' ? -Infinity : parseFloat(input.min);
        const max = input.max === '' ? Infinity : parseFloat(input.max);
        let dragged = false;

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            if (!dragged && Math.abs(dx) < 3) return;
            if (!dragged) {
                dragged = true;
                document.body.classList.add('bl-scrubbing');
            }
            const factor = ev.shiftKey ? 0.1 : 1;
            const next = Math.max(min, Math.min(max, startVal + Math.round(dx / 4) * step * factor));
            input.value = next.toFixed(ev.shiftKey ? decimals + 1 : decimals);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.classList.remove('bl-scrubbing');
            if (dragged) {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                input.focus();
                input.select();
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') e.target.blur();
    });

    // ---------------------------------------------------------
    // TOOLTIP: title dipinjam selama hover lalu dikembalikan,
    // sehingga kode yang membaca/menulis title tetap bekerja.
    // ---------------------------------------------------------
    let tipEl = null;
    let tipTimer = null;
    let tipOwner = null;

    function hideTip() {
        clearTimeout(tipTimer);
        if (tipEl) tipEl.style.display = 'none';
        if (tipOwner && tipOwner._blTitle !== undefined) {
            if (!tipOwner.getAttribute('title')) tipOwner.setAttribute('title', tipOwner._blTitle);
            delete tipOwner._blTitle;
        }
        tipOwner = null;
    }

    document.addEventListener('mouseover', (e) => {
        const target = e.target && e.target.closest && e.target.closest('[title]');
        if (!target || target === tipOwner) {
            if (!target && tipOwner && !tipOwner.contains(e.target)) hideTip();
            return;
        }
        // Tombol di overflow menampilkan attr(title) sebagai label lewat CSS
        if (target.closest('.toolbar-overflow-content')) return;
        hideTip();
        tipOwner = target;
        target._blTitle = target.getAttribute('title');
        target.removeAttribute('title');
        tipTimer = setTimeout(() => {
            if (!target.isConnected || tipOwner !== target) return;
            if (!tipEl) {
                tipEl = document.createElement('div');
                tipEl.className = 'bl-tooltip';
                document.body.appendChild(tipEl);
            }
            tipEl.textContent = stripEmoji(target._blTitle);
            tipEl.style.display = 'block';
            const r = target.getBoundingClientRect();
            const w = tipEl.offsetWidth;
            const h = tipEl.offsetHeight;
            let top = r.bottom + 6;
            if (top + h > window.innerHeight - 4) top = r.top - h - 6;
            tipEl.style.top = Math.max(4, top) + 'px';
            tipEl.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
        }, 550);
    });
    document.addEventListener('mouseout', (e) => {
        if (tipOwner && (!e.relatedTarget || !tipOwner.contains(e.relatedTarget))) hideTip();
    });
    document.addEventListener('mousedown', hideTip, true);
    window.addEventListener('blur', hideTip);

    // ---------------------------------------------------------
    // KONFIGURASI PER APLIKASI
    // ---------------------------------------------------------
    const clickEl = (id) => () => { const el = document.getElementById(id); if (el) el.click(); };
    const cmd = (label, id, key) => ({
        label,
        key,
        run: clickEl(id),
        isDisabled: () => { const el = document.getElementById(id); return !el || el.disabled; },
        isChecked: () => { const el = document.getElementById(id); return !!el && (el.classList.contains('active') || el.checked === true); }
    });
    const SEP = { separator: true };

    const APPS = {
        studio: {
            menus: {
                File: [cmd('Simpan Map', 'btn-save-map', 'Ctrl S'), cmd('Ganti Nama Map', 'btn-edit-map'), SEP, cmd('Hapus Map', 'btn-delete-map')],
                Edit: [cmd('Undo', 'btn-undo', 'Ctrl Z'), cmd('Redo', 'btn-redo', 'Ctrl Y')],
                View: [
                    cmd('Inspector', 'btn-toggle-left-sidebar', 'I'),
                    cmd('Layers', 'btn-toggle-right-sidebar', 'L'),
                    cmd('Cinematic Timeline', 'btn-toggle-cinematic-dock', 'C'),
                    SEP,
                    cmd('Hand Tool', 'btn-hand-mode', 'Space'),
                    cmd('Reset Kamera', 'btn-reset-camera'),
                    SEP,
                    cmd('Fullscreen', 'btn-toggle-fullscreen', 'F')
                ],
                Play: [cmd('Play Demo', 'btn-play-mode', 'P'), cmd('AI Battle', 'btn-toggle-battle-mode'), cmd('Atur Spawn Area', 'btn-player-spawn-tool')]
            },
            workspaces: [
                { label: 'Map Editor', active: true },
                { label: 'Hitbox Studio', href: 'hit-tool.html' },
                { label: '3D Attachment', href: 'hit-tool.html#attachment' }
            ],
            keymap: [['lmb', 'Orbit / Pilih'], ['mmb', 'Zoom'], ['rmb', 'Geser'], ['key:P', 'Play'], ['key:I', 'Inspector'], ['key:L', 'Layers'], ['key:C', 'Timeline']]
        },
        hittool: {
            menus: {
                File: [cmd('Simpan ke Game', 'btn-save-hitboxes', 'Ctrl S'), cmd('Re-Sync Studio (Reset Cache)', 'btn-ht-sync-heroes')],
                Edit: [cmd('Reset Animasi', 'btn-reset-anim-ht'), cmd('Tambah Hitbox', 'btn-add-custom-hitbox')],
                View: [
                    cmd('Titik Sendi (Bone Dots)', 'chk-show-bones'),
                    cmd('3D Gizmo', 'chk-show-gizmo'),
                    cmd('Tampilkan di Play Mode', 'chk-debug-playmode'),
                    SEP,
                    cmd('Reset Kamera', 'btn-reset-camera-ht')
                ]
            },
            workspaces: [
                { label: 'Map Editor', href: 'index.html' },
                { moveId: 'tab-mode-hitbox', label: 'Hitbox Studio' },
                { moveId: 'tab-mode-attachment', label: '3D Attachment' }
            ],
            keymap: [['lmb', 'Orbit / Pilih'], ['mmb', 'Zoom'], ['rmb', 'Geser'], ['key:Space', 'Play / Pause'], ['key:W', 'Geser'], ['key:E', 'Putar'], ['key:R', 'Skala']]
        }
    };

    const MOUSE_ICONS = {
        lmb: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v8H6V8a6 6 0 0 1 6-6z" fill="currentColor"/>',
        mmb: '<rect x="6" y="2" width="12" height="20" rx="6"/><rect x="10.5" y="5" width="3" height="6" rx="1.5" fill="currentColor" stroke="none"/>',
        rmb: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v8h6V8a6 6 0 0 0-6-6z" fill="currentColor"/>'
    };

    function buildTopbar(app) {
        const bar = document.createElement('div');
        bar.id = 'bl-topbar';
        bar.innerHTML = `<div class="bl-topbar-logo" title="Pandora 3D">${blIcon('cube')}</div><nav class="bl-menubar"></nav><div class="bl-workspaces"></div><div class="bl-topbar-spacer"></div>`;

        const menubar = bar.querySelector('.bl-menubar');
        const openMenu = (btn, name) => {
            openPopup(btn, app.menus[name].map((row) => row.separator ? row : ({
                label: row.label,
                key: row.key,
                run: row.run,
                disabled: row.isDisabled(),
                checked: row.isChecked()
            })));
        };
        Object.keys(app.menus).forEach((name) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bl-menu-btn';
            btn.textContent = name;
            btn.addEventListener('click', () => {
                if (activePopupOwner === btn) closePopup(); else openMenu(btn, name);
            });
            // Seperti menu desktop: saat satu menu terbuka, hover langsung berpindah
            btn.addEventListener('mouseenter', () => {
                if (activePopup && activePopupOwner !== btn && activePopupOwner && activePopupOwner.classList.contains('bl-menu-btn')) {
                    openMenu(btn, name);
                }
            });
            menubar.appendChild(btn);
        });

        const wsWrap = bar.querySelector('.bl-workspaces');
        app.workspaces.forEach((ws) => {
            if (ws.moveId) {
                const el = document.getElementById(ws.moveId);
                if (el) {
                    el.classList.add('bl-ws-tab');
                    el.textContent = ws.label;
                    wsWrap.appendChild(el);
                }
                return;
            }
            const tab = document.createElement(ws.href ? 'a' : 'span');
            tab.className = 'bl-ws-tab' + (ws.active ? ' active' : '');
            tab.textContent = ws.label;
            if (ws.href) {
                tab.href = ws.href;
                tab.draggable = false;
            }
            wsWrap.appendChild(tab);
        });

        shieldEvents(bar);
        document.body.insertBefore(bar, document.body.firstChild);
    }

    function buildStatusbar(app) {
        const bar = document.createElement('div');
        bar.id = 'bl-statusbar';
        const hints = app.keymap.map(([k, label]) => {
            const glyph = k.startsWith('key:')
                ? `<kbd>${k.slice(4)}</kbd>`
                : `<svg class="bl-mouse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${MOUSE_ICONS[k]}</svg>`;
            return `<span class="bl-hint">${glyph}<span>${label}</span></span>`;
        }).join('');
        bar.innerHTML = `<div class="bl-status-left">${hints}</div><div class="bl-status-right"><span id="bl-status-info"></span><span id="bl-status-fps"></span><span>Pandora 3D</span></div>`;
        shieldEvents(bar);
        document.body.appendChild(bar);

        const fpsEl = bar.querySelector('#bl-status-fps');
        const infoEl = bar.querySelector('#bl-status-info');
        let frames = 0;
        let last = performance.now();
        const tick = (now) => {
            frames++;
            if (now - last >= 1000) {
                fpsEl.textContent = Math.round((frames * 1000) / (now - last)) + ' FPS';
                frames = 0;
                last = now;
                const mapSel = document.getElementById('select-saved-maps');
                const layers = document.getElementById('layer-count');
                const parts = [];
                if (mapSel && mapSel.value) parts.push(mapSel.options[mapSel.selectedIndex].textContent.trim());
                if (layers) parts.push('Objek: ' + layers.textContent.trim());
                infoEl.textContent = parts.join('  |  ');
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // ---------------------------------------------------------
    // PROPERTIES EDITOR: kolom tab ikon vertikal untuk accordion Inspector
    // ---------------------------------------------------------
    function buildPropertyTabs() {
        const sidebar = document.getElementById('sidebar-left');
        const content = sidebar && sidebar.querySelector('.sidebar-content');
        if (!content) return;
        const accordions = Array.from(content.querySelectorAll(':scope > .accordion'));
        if (!accordions.length) return;

        const body = document.createElement('div');
        body.className = 'bl-props-body';
        const strip = document.createElement('div');
        strip.className = 'bl-props-tabs';
        content.parentNode.insertBefore(body, content);
        body.appendChild(strip);
        body.appendChild(content);

        const STORE_KEY = 'pandora.inspector.tab';
        const tabs = [];

        function activate(acc, persist) {
            accordions.forEach((a, i) => {
                // Panel tersembunyi harus collapsed: observer di bawah memakai "tersembunyi tapi terbuka" sebagai sinyal
                a.classList.toggle('bl-tab-hidden', a !== acc);
                a.classList.toggle('collapsed', a !== acc);
                tabs[i].classList.toggle('active', a === acc);
            });
            acc.classList.remove('collapsed');
            content.scrollTop = 0;
            if (persist) {
                try { localStorage.setItem(STORE_KEY, String(accordions.indexOf(acc))); } catch (err) { /* storage opsional */ }
            }
        }

        accordions.forEach((acc) => {
            const label = acc.querySelector('.accordion-title-left > span:last-child');
            const icon = acc.querySelector('.accordion-title-left .svg-icon');
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'bl-props-tab';
            tab.title = label ? stripEmoji(label.textContent) : '';
            if (icon) tab.appendChild(icon.cloneNode(true));
            tab.addEventListener('click', () => activate(acc, true));
            strip.appendChild(tab);
            tabs.push(tab);

            // Spawner/inspector membuka panelnya sendiri lewat classList: ikuti ke tab tersebut
            // termasuk panel bersarang (Transformasi Karakter/Pohon) di dalam accordion ini
            new MutationObserver((records) => {
                const hidden = acc.classList.contains('bl-tab-hidden');
                const opened = records.some((r) => r.target.classList.contains('accordion') && !r.target.classList.contains('collapsed'));
                if (!opened) return;
                const nestedOpened = records.some((r) => r.target !== acc && r.target.classList.contains('accordion') && !r.target.classList.contains('collapsed'));
                if (hidden || (nestedOpened && acc.classList.contains('collapsed'))) activate(acc, false);
            }).observe(acc, { attributes: true, attributeFilter: ['class'], subtree: true });
        });

        let initial = 0;
        try {
            const stored = parseInt(localStorage.getItem(STORE_KEY), 10);
            if (stored >= 0 && stored < accordions.length) initial = stored;
            else initial = Math.max(0, accordions.findIndex((a) => a.id === 'accordion-brush'));
        } catch (err) { /* storage opsional */ }
        activate(accordions[initial], false);
    }

    // Rollout Hit Tool: judul section bisa dilipat
    function bindSectionRollouts() {
        document.addEventListener('click', (e) => {
            const title = e.target && e.target.closest && e.target.closest('.ht-section-title');
            if (!title || e.target.closest('button, input, label, select')) return;
            title.parentElement.classList.toggle('bl-collapsed');
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const app = APPS[document.body.dataset.app];
        if (app) {
            buildTopbar(app);
            buildStatusbar(app);
        }
        syncRangesIn(document);
        cleanOptionsIn(document);
        new MutationObserver((records) => {
            records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) { syncRangesIn(n); cleanOptionsIn(n); } }));
        }).observe(document.body, { childList: true, subtree: true });

        buildPropertyTabs();
        bindSectionRollouts();

        if (location.hash === '#attachment') {
            const tab = document.getElementById('tab-mode-attachment');
            if (tab) window.addEventListener('load', () => tab.click());
        }
    });
})();
