/* Play mode global state */
// ==========================================
// 11.5 KARAKTER RUBAH / SERIGALA ORANGE (PLAY DEMO MODE)
// ==========================================
var isPlayMode = false;
window.isPlayMode = false;
var wolfCharacter = null;
window.wolfCharacter = null;
let savedEditorCamera = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3()
};
let wasLeftSidebarCollapsed = false;
let wasRightSidebarCollapsed = false;
let wasCinematicBottomOpen = false;

// Sound Controller berbasis Web Audio API murni
