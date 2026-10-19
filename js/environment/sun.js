/* Sun position controls */
// ==========================================
// 11. SUN & SKY POSITION
// ==========================================
const sliderAzimuth = document.getElementById('slider-azimuth');
const sliderElevation = document.getElementById('slider-elevation');

const valAzimuth = document.getElementById('val-azimuth');
const valElevation = document.getElementById('val-elevation');

function updateSunPosition() {
    const azimuthDeg = parseFloat(sliderAzimuth.value);
    const elevationDeg = parseFloat(sliderElevation.value);

    valAzimuth.innerText = azimuthDeg + '°';
    valElevation.innerText = elevationDeg + '°';

    const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
    const elevationRad = THREE.MathUtils.degToRad(elevationDeg);

    const distance = 40;
    const x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
    const y = distance * Math.sin(elevationRad);
    const z = distance * Math.cos(elevationRad) * Math.cos(azimuthRad);

    sunLight.position.set(x, y, z);
    sunLight.target.position.set(-x * 0.25, 0, -z * 0.25);
    sunLight.target.updateMatrixWorld();

    sunSprite.position.copy(sunLight.position).normalize().multiplyScalar(500);

    if (typeof skyMat !== 'undefined' && skyMat.uniforms && skyMat.uniforms.uSunPosition) {
        skyMat.uniforms.uSunPosition.value.copy(sunLight.position);
    }

    foliageMaterialsList.forEach(mat => {
        mat.uniforms.uLightPos.value.copy(sunLight.position);
    });
}

sliderAzimuth.addEventListener('input', updateSunPosition);
sliderElevation.addEventListener('input', updateSunPosition);

updateSunPosition();
