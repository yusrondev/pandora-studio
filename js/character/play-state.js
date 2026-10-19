/* Play mode global state */
// ==========================================
// 11.5 KARAKTER RUBAH / SERIGALA ORANGE (PLAY DEMO MODE)
// ==========================================
let isPlayMode = false;
let wolfCharacter = null;
let savedEditorCamera = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3()
};
let wasLeftSidebarCollapsed = false;
let wasRightSidebarCollapsed = false;

// Sound Controller berbasis Web Audio API murni
