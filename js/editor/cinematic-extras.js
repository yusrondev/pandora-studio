/* =========================================================
   CINEMATIC EXTRAS (Studio)
   Pilihan karakter hero/*, klip FBX per aktor per scene, peran akhir aktor,
   dan title daerah per scene.
   ========================================================= */
(function () {
    const $ = id => document.getElementById(id);

    function fillSpeciesOptions() {
        const select = $('select-cinematic-fox-species');
        const registry = window.PandoraHeroRegistry;
        if (!select || !registry || !registry.characters) return;
        select.innerHTML = '';
        registry.characters.forEach(c => select.appendChild(new Option(c.name, c.id)));
        const fox = CinematicManager.getActiveFox();
        if (fox) select.value = CinematicActors.resolveSpecies(fox.species);
    }

    // Klip baru diketahui setelah FBX karakter selesai dimuat
    async function fillClipOptions() {
        const fox = CinematicManager.getActiveFox();
        const idle = $('select-cinematic-fox-idle');
        const move = $('select-cinematic-fox-moveclip');
        if (!fox || !idle || !move) return;

        const species = CinematicActors.resolveSpecies(fox.species);
        await CinematicActors.preload([species]);
        if (CinematicManager.getActiveFox() !== fox) return;

        CinematicManager.ensureFoxGroupAndModel(fox, CinematicManager.activeFoxIndex);
        const clips = fox.model ? CinematicActors.clipNames(fox.model) : [];
        idle.innerHTML = '';
        move.innerHTML = '';
        move.appendChild(new Option('Gerak: otomatis', ''));
        clips.forEach(key => {
            idle.appendChild(new Option('Diam: ' + key, key));
            move.appendChild(new Option('Gerak: ' + key, key));
        });
        idle.value = clips.includes(fox.idlePose) ? fox.idlePose : 'idle';
        move.value = fox.moveClip || '';
    }

    function syncActorFields() {
        const fox = CinematicManager.getActiveFox();
        if (!fox) return;
        const role = $('select-cinematic-fox-endrole');
        const loop = $('toggle-cinematic-fox-loop');
        if (role) role.value = fox.endRole || 'stay';
        if (loop) loop.checked = fox.clipLoop !== false;
        fillClipOptions();
    }

    function syncTitleFields() {
        const card = CinematicManager.titleCard || {};
        const set = (id, value) => {
            const el = $(id);
            if (el && document.activeElement !== el) el.value = value;
        };
        set('input-title-text', card.text || '');
        set('input-title-sub', card.subtitle || '');
        set('input-title-at', card.at || 0);
        set('input-title-duration', card.duration || 6);
        set('select-title-style', card.style || 'ember');
    }

    function readTitleFields() {
        const text = $('input-title-text').value;
        CinematicManager.titleCard = text.trim() ? {
            text,
            subtitle: $('input-title-sub').value,
            at: parseFloat($('input-title-at').value) || 0,
            duration: parseFloat($('input-title-duration').value) || 6,
            style: $('select-title-style').value
        } : null;
    }

    function init() {
        if (typeof CinematicManager === 'undefined' || !$('select-cinematic-fox-species')) return;

        const originalSync = CinematicManager.syncActiveFoxControlsUI.bind(CinematicManager);
        CinematicManager.syncActiveFoxControlsUI = function () {
            originalSync();
            syncActorFields();
        };
        const originalLoad = CinematicManager.loadScene.bind(CinematicManager);
        CinematicManager.loadScene = function (idx, keepPlaying) {
            originalLoad(idx, keepPlaying);
            syncTitleFields();
        };

        $('select-cinematic-fox-moveclip').addEventListener('change', (e) => {
            const fox = CinematicManager.getActiveFox();
            if (fox) fox.moveClip = e.target.value;
        });
        $('select-cinematic-fox-endrole').addEventListener('change', (e) => {
            const fox = CinematicManager.getActiveFox();
            if (fox) fox.endRole = e.target.value;
        });
        $('toggle-cinematic-fox-loop').addEventListener('change', (e) => {
            const fox = CinematicManager.getActiveFox();
            if (fox) {
                fox.clipLoop = e.target.checked;
                if (fox.model) fox.model._cinKey = null;
            }
        });
        ['input-title-text', 'input-title-sub', 'input-title-at', 'input-title-duration', 'select-title-style'].forEach(id => {
            $(id).addEventListener(id.startsWith('select') ? 'change' : 'input', readTitleFields);
        });
        $('btn-title-preview').addEventListener('click', () => {
            readTitleFields();
            if (CinematicManager.titleCard) CinematicFX.playTitle(CinematicManager.titleCard);
        });

        fillSpeciesOptions();
        if (window.PandoraHeroRegistry && PandoraHeroRegistry.onSync) PandoraHeroRegistry.onSync(fillSpeciesOptions);
        syncActorFields();
        syncTitleFields();
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
