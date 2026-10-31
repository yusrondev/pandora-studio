/* Pengaturan cara karakter musuh mati, di panel Spawner Character */
(function () {
    const $ = id => document.getElementById(id);

    function selectedFox() {
        const idx = (typeof selectedFoxIndex !== 'undefined') ? selectedFoxIndex : -1;
        return (typeof spawnedFoxesList !== 'undefined' && idx >= 0) ? spawnedFoxesList[idx] : null;
    }

    function fillScenes(el, withLast) {
        const current = el.value;
        const scenes = (typeof CinematicManager !== 'undefined' && CinematicManager.scenes) ? CinematicManager.scenes : [];
        el.innerHTML = '';
        if (withLast) el.appendChild(new Option('Scene terakhir', '-1'));
        scenes.forEach((s, i) => el.appendChild(new Option(s.name || ('Scene ' + (i + 1)), String(i))));
        if (current) el.value = current;
    }

    function syncFields() {
        const fox = selectedFox();
        const mode = fox ? (fox.deathMode || 'fade') : 'fade';
        $('fox-death-mode').value = mode;
        $('fox-death-line').value = fox ? (fox.deathLine || '') : '';
        fillScenes($('fox-death-from'), false);
        fillScenes($('fox-death-to'), true);
        $('fox-death-from').value = fox ? String(fox.deathFrom || 0) : '0';
        $('fox-death-to').value = fox ? String(fox.deathTo === undefined ? -1 : fox.deathTo) : '-1';
        $('fox-death-auto-fields').style.display = mode === 'auto' ? '' : 'none';
        $('fox-death-scene-fields').style.display = mode === 'scene' ? '' : 'none';
    }

    function init() {
        if (!$('fox-death-mode') || typeof updateFoxInspectorUI !== 'function') return;

        const originalUpdate = updateFoxInspectorUI;
        updateFoxInspectorUI = function () {
            originalUpdate();
            syncFields();
        };
        window.updateFoxInspectorUI = updateFoxInspectorUI;

        const bind = (id, field, parse) => {
            const el = $(id);
            el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
                const fox = selectedFox();
                if (!fox) return;
                fox[field] = parse(el.value);
                syncFields();
            });
        };
        bind('fox-death-mode', 'deathMode', v => v);
        bind('fox-death-line', 'deathLine', v => v);
        bind('fox-death-from', 'deathFrom', v => parseInt(v, 10) || 0);
        bind('fox-death-to', 'deathTo', v => parseInt(v, 10));

        // Daftar scene bisa berubah kapan saja di timeline
        ['fox-death-from', 'fox-death-to'].forEach((id, i) => {
            $(id).addEventListener('mouseenter', () => fillScenes($(id), i === 1));
        });
        syncFields();
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
