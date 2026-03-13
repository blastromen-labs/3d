let BACKGROUND = "#000000"
const FOREGROUND = "#50FF50"

console.log(game)
game.width = USBStream.panelWidth * USBStream.renderScale;
game.height = USBStream.panelHeight * USBStream.renderScale;
const ctx = game.getContext("2d")
console.log(ctx)

// Access presets from globally loaded presets.js.
const modelPresets = MODEL_PRESETS;

// Current model being rendered (starts with cube)
let currentModel = {
    vs: [...modelPresets.cube.vs],
    fs: modelPresets.cube.fs.map(f => [...f])
};
let currentPresetName = 'cube';

// Second object model
let secondModel = {
    vs: [...modelPresets.torus.vs],
    fs: modelPresets.torus.fs.map(f => [...f])
};
let secondPresetName = 'torus';

function loadModel(presetName) {
    const preset = modelPresets[presetName];
    if (preset) {
        currentModel.vs = [...preset.vs];
        currentModel.fs = preset.fs.map(f => [...f]);
        currentPresetName = presetName;
    }
}

function loadSecondModel(presetName) {
    const preset = modelPresets[presetName];
    if (preset) {
        secondModel.vs = [...preset.vs];
        secondModel.fs = preset.fs.map(f => [...f]);
        secondPresetName = presetName;
    }
}

// Function to save current model back to preset
function saveToPreset(presetName) {
    if (modelPresets[presetName]) {
        modelPresets[presetName].vs = [...currentModel.vs];
        modelPresets[presetName].fs = currentModel.fs.map(f => [...f]);
    }
}

function clear(bgColor) {
    ctx.fillStyle = bgColor || BACKGROUND;
    ctx.fillRect(0, 0, game.width, game.height);
}

function point({ x, y }) {
    const s = 20;
    ctx.fillStyle = FOREGROUND
    ctx.fillRect(x - s / 2, y - s / 2, s, s)
}

function line(p1, p2, thickness, color) {
    ctx.lineWidth = thickness || 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color || FOREGROUND;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
}

function polygon(points, color, strokeColor, strokeWidth = 1, fill = true, stroke = true) {
    if (points.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    }

    if (stroke) {
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
    }
}

// Calculate face normal
function calculateNormal(p0, p1, p2) {
    // Two edges of the triangle
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
    const v2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };

    // Cross product
    const normal = {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
    };

    // Normalize
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (length > 0) {
        normal.x /= length;
        normal.y /= length;
        normal.z /= length;
    }

    return normal;
}

// Calculate center of a polygon
function calculateCenter(vertices) {
    let cx = 0, cy = 0, cz = 0;
    for (const v of vertices) {
        cx += v.x;
        cy += v.y;
        cz += v.z;
    }
    return {
        x: cx / vertices.length,
        y: cy / vertices.length,
        z: cz / vertices.length
    };
}

// Convert brightness (0-1) to color based on selected color
function brightnessToColor(brightness, baseColor, contrast) {
    // Apply contrast enhancement
    // contrast: 0 = flat (no contrast), 100 = maximum contrast

    // First normalize brightness to 0-1 range
    brightness = Math.max(0, Math.min(1.0, brightness));

    // Apply power curve based on contrast to increase separation
    // Higher contrast = stronger curve
    const contrastPower = 1 + (contrast / 100) * 4; // Range: 1 to 5
    brightness = Math.pow(brightness, contrastPower);

    // Apply contrast to min/max range
    const contrastFactor = contrast / 100;
    const minBrightness = Math.max(0, 0.3 - contrastFactor * 0.3); // 0.3 down to 0.0
    const maxBrightness = 0.7 + contrastFactor * 0.3; // 0.7 up to 1.0

    // Map to final range
    brightness = minBrightness + brightness * (maxBrightness - minBrightness);

    // Parse hex color to RGB
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Apply brightness to each component
    const finalR = Math.floor(r * brightness);
    const finalG = Math.floor(g * brightness);
    const finalB = Math.floor(b * brightness);

    return `rgb(${finalR}, ${finalG}, ${finalB})`;
}

function screen(p) {
    const size = Math.min(game.width, game.height);
    const offsetX = (game.width - size) / 2;
    const offsetY = (game.height - size) / 2;
    return {
        x: (p.x + 1) / 2 * size + offsetX,
        y: (1 - (p.y + 1) / 2) * size + offsetY,
    }
}

function fovToFocal(degrees) {
    return 1 / Math.tan((degrees * Math.PI / 180) / 2);
}

let focalLength = fovToFocal(30);

function project({ x, y, z }) {
    return {
        x: x * focalLength / z,
        y: y * focalLength / z,
    }
}

const FPS = 60;

function translate_z({ x, y, z }, dz) {
    return { x, y, z: z + dz };
}

// Rotation around X-axis (pitch)
function rotate_x({ x, y, z }, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x,
        y: y * c - z * s,
        z: y * s + z * c,
    };
}

// Rotation around Y-axis (yaw)
function rotate_y({ x, y, z }, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c + z * s,
        y,
        z: -x * s + z * c,
    };
}

// Rotation around Z-axis (roll)
function rotate_z({ x, y, z }, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - y * s,
        y: x * s + y * c,
        z,
    };
}

// Apply all three rotations in sequence
function rotate_xyz(point, angleX, angleY, angleZ) {
    let p = point;
    p = rotate_x(p, angleX);
    p = rotate_y(p, angleY);
    p = rotate_z(p, angleZ);
    return p;
}

// Control state
let config = {
    speedX: 0,
    speedY: 0,
    speedZ: 0,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    zoom: 0.5,
    autoRotationX: 0,
    autoRotationY: 0,
    autoRotationZ: 0,
    solidMode: false,
    wireframeThickness: 10.0,
    thicknessScaleEnabled: false,
    thicknessScaleAmount: 0.5,
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
    colorCount: 1,
    gradientEnabled: false,
    strokeColor: '#000000',
    contrast: 70,
    starsEnabled: false,
    starSpeed: 0.3,
    starColor: '#ffffff',
    starCount: 200,
    zoomAutoEnabled: false,
    zoomMin: 0.8,
    zoomMax: 1.5,
    zoomSpeed: 1.0,
    zoomAutoTime: 0,
    zoomAutoDirection: 1,
    fov: 30,
    offsetY: 0,
    offsetYAutoEnabled: false,
    offsetYMin: -0.5,
    offsetYMax: 0.5,
    offsetYSpeed: 1.0,
    offsetYAutoTime: 0,
    morphEnabled: false,
    morphTarget: 'pyramid',
    morphSpeed: 0.5,
    objectCount: 1,
    obj1Scale: 1.0,
    obj2Scale: 1.0,
    objectDistance: 0.5,
    objDistAutoEnabled: false,
    objDistMin: 0.1,
    objDistMax: 1.0,
    objDistSpeed: 1.0,
    objDistAutoTime: 0,
};

let dz = focalLength;

// Morph animation state
let morphTime = 0;

function computeMorphedModel(primary, secondary, t) {
    const pVs = primary.vs;
    const sVs = secondary.vs;
    const maxLen = Math.max(pVs.length, sVs.length);

    const centroid = (vs) => {
        let cx = 0, cy = 0, cz = 0;
        for (const v of vs) { cx += v.x; cy += v.y; cz += v.z; }
        const n = vs.length;
        return { x: cx / n, y: cy / n, z: cz / n };
    };

    const pC = centroid(pVs);
    const sC = centroid(sVs);

    const vs = [];
    for (let i = 0; i < maxLen; i++) {
        const pv = i < pVs.length ? pVs[i] : pC;
        const sv = i < sVs.length ? sVs[i] : sC;
        vs.push({
            x: pv.x + (sv.x - pv.x) * t,
            y: pv.y + (sv.y - pv.y) * t,
            z: pv.z + (sv.z - pv.z) * t,
        });
    }

    const fs = t < 0.5 ? primary.fs : secondary.fs;
    return { vs, fs };
}

// Star field system
const stars = [];

function initStars() {
    stars.length = 0;
    for (let i = 0; i < config.starCount; i++) {
        stars.push({
            x: Math.random() * game.width,
            y: Math.random() * game.height,
            z: Math.random(),
            size: Math.random() * 2 + 0.5
        });
    }
}

// Draw stars
function drawStars(color) {
    if (!config.starsEnabled) return;

    const effectiveColor = color || config.starColor;
    const hex = effectiveColor.replace('#', '');
    const baseR = parseInt(hex.substring(0, 2), 16);
    const baseG = parseInt(hex.substring(2, 4), 16);
    const baseB = parseInt(hex.substring(4, 6), 16);

    for (const star of stars) {
        const depth = star.z;
        const r = Math.floor(baseR * depth);
        const g = Math.floor(baseG * depth);
        const b = Math.floor(baseB * depth);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        const size = star.size * (0.5 + depth * 1.5);

        ctx.beginPath();
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Update star positions (scroll from right to left)
function updateStars(dt) {
    if (!config.starsEnabled) return;

    for (const star of stars) {
        // Speed based on depth for parallax effect (closer = faster)
        const speed = (50 + star.z * 150) * config.starSpeed;

        star.x -= speed * dt;

        // Wrap around when star goes off left edge
        if (star.x < -10) {
            star.x = game.width + 10;
            star.y = Math.random() * game.height;
        }
    }
}

// Initialize stars on load
initStars();

// Initialize controls
const speedXSlider = document.getElementById('speedXSlider');
const speedYSlider = document.getElementById('speedYSlider');
const speedZSlider = document.getElementById('speedZSlider');
const angleXSlider = document.getElementById('angleXSlider');
const angleYSlider = document.getElementById('angleYSlider');
const angleZSlider = document.getElementById('angleZSlider');
const zoomSlider = document.getElementById('zoomSlider');
const zoomAutoToggle = document.getElementById('zoomAutoToggle');
const zoomMinSlider = document.getElementById('zoomMinSlider');
const zoomMaxSlider = document.getElementById('zoomMaxSlider');
const zoomSpeedSlider = document.getElementById('zoomSpeedSlider');
const fovSlider = document.getElementById('fovSlider');
const offsetYSlider = document.getElementById('offsetYSlider');
const offsetYAutoToggle = document.getElementById('offsetYAutoToggle');
const offsetYMinSlider = document.getElementById('offsetYMinSlider');
const offsetYMaxSlider = document.getElementById('offsetYMaxSlider');
const offsetYSpeedSlider = document.getElementById('offsetYSpeedSlider');
const solidToggle = document.getElementById('solidToggle');
const thicknessSlider = document.getElementById('thicknessSlider');
const thicknessScaleToggle = document.getElementById('thicknessScaleToggle');
const thicknessScaleSlider = document.getElementById('thicknessScaleSlider');
const thicknessScaleValue = document.getElementById('thicknessScaleValue');
const thicknessScaleGroup = document.getElementById('thicknessScaleGroup');
const colorPickers = [
    document.getElementById('colorPicker1'),
    document.getElementById('colorPicker2'),
    document.getElementById('colorPicker3'),
    document.getElementById('colorPicker4'),
];
const colorGroups = [
    document.getElementById('color1Group'),
    document.getElementById('color2Group'),
    document.getElementById('color3Group'),
    document.getElementById('color4Group'),
];
const gradientToggle = document.getElementById('gradientToggle');
const strokeColorPicker = document.getElementById('strokeColorPicker');
const contrastSlider = document.getElementById('contrastSlider');
const backgroundPicker = document.getElementById('backgroundPicker');
const starsToggle = document.getElementById('starsToggle');
const starSpeedSlider = document.getElementById('starSpeedSlider');
const starColorPicker = document.getElementById('starColorPicker');
const starCountSlider = document.getElementById('starCountSlider');
const starCountValue = document.getElementById('starCountValue');
const modelPresetSelect = document.getElementById('modelPreset');
const morphToggle = document.getElementById('morphToggle');
const morphTargetSelect = document.getElementById('morphTarget');
const morphSpeedSlider = document.getElementById('morphSpeedSlider');
const morphSpeedValue = document.getElementById('morphSpeedValue');
const editModelBtn = document.getElementById('editModelBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const modelEditorModal = document.getElementById('modelEditorModal');
const modelJsonEditor = document.getElementById('modelJsonEditor');
const applyModelBtn = document.getElementById('applyModelBtn');
const cancelModelBtn = document.getElementById('cancelModelBtn');
const jsonError = document.getElementById('jsonError');
const modelPreset2Select = document.getElementById('modelPreset2');
const obj2PresetGroup = document.getElementById('obj2PresetGroup');
const objDistanceGroup = document.getElementById('objDistanceGroup');
const obj1ScaleSlider = document.getElementById('obj1ScaleSlider');
const obj1ScaleValue = document.getElementById('obj1ScaleValue');
const obj2ScaleGroup = document.getElementById('obj2ScaleGroup');
const obj2ScaleSlider = document.getElementById('obj2ScaleSlider');
const obj2ScaleValue = document.getElementById('obj2ScaleValue');
const objDistanceSlider = document.getElementById('objDistanceSlider');
const objDistanceValue = document.getElementById('objDistanceValue');
const objDistAutoGroup = document.getElementById('objDistAutoGroup');
const objDistAutoToggle = document.getElementById('objDistAutoToggle');
const objDistMinGroup = document.getElementById('objDistMinGroup');
const objDistMinSlider = document.getElementById('objDistMinSlider');
const objDistMinInput = document.getElementById('objDistMinInput');
const objDistMaxGroup = document.getElementById('objDistMaxGroup');
const objDistMaxSlider = document.getElementById('objDistMaxSlider');
const objDistMaxInput = document.getElementById('objDistMaxInput');
const objDistSpeedGroup = document.getElementById('objDistSpeedGroup');
const objDistSpeedSlider = document.getElementById('objDistSpeedSlider');
const objDistSpeedValue = document.getElementById('objDistSpeedValue');
const resetBtn = document.getElementById('resetBtn');

const speedXValue = document.getElementById('speedXValue');
const speedYValue = document.getElementById('speedYValue');
const speedZValue = document.getElementById('speedZValue');
const angleXValue = document.getElementById('angleXValue');
const angleYValue = document.getElementById('angleYValue');
const angleZValue = document.getElementById('angleZValue');
const zoomValue = document.getElementById('zoomValue');
const zoomMinInput = document.getElementById('zoomMinInput');
const zoomMaxInput = document.getElementById('zoomMaxInput');
const zoomSpeedValue = document.getElementById('zoomSpeedValue');
const fovValue = document.getElementById('fovValue');
const offsetYValueEl = document.getElementById('offsetYValue');
const offsetYMinInput = document.getElementById('offsetYMinInput');
const offsetYMaxInput = document.getElementById('offsetYMaxInput');
const offsetYSpeedValue = document.getElementById('offsetYSpeedValue');
const thicknessValue = document.getElementById('thicknessValue');
const contrastValue = document.getElementById('contrastValue');
const starSpeedValue = document.getElementById('starSpeedValue');

// X-Axis speed control
speedXSlider.addEventListener('input', (e) => {
    config.speedX = parseFloat(e.target.value);
    speedXValue.textContent = config.speedX.toFixed(2) + 'x';
});

// Y-Axis speed control
speedYSlider.addEventListener('input', (e) => {
    config.speedY = parseFloat(e.target.value);
    speedYValue.textContent = config.speedY.toFixed(2) + 'x';
});

// Z-Axis speed control
speedZSlider.addEventListener('input', (e) => {
    config.speedZ = parseFloat(e.target.value);
    speedZValue.textContent = config.speedZ.toFixed(2) + 'x';
});

// X-Axis angle control
angleXSlider.addEventListener('input', (e) => {
    const degrees = parseFloat(e.target.value);
    config.angleX = degrees * Math.PI / 180;
    angleXValue.textContent = degrees.toFixed(0) + '°';
});

// Y-Axis angle control
angleYSlider.addEventListener('input', (e) => {
    const degrees = parseFloat(e.target.value);
    config.angleY = degrees * Math.PI / 180;
    angleYValue.textContent = degrees.toFixed(0) + '°';
});

// Z-Axis angle control
angleZSlider.addEventListener('input', (e) => {
    const degrees = parseFloat(e.target.value);
    config.angleZ = degrees * Math.PI / 180;
    angleZValue.textContent = degrees.toFixed(0) + '°';
});

// Zoom control
zoomSlider.addEventListener('input', (e) => {
    config.zoom = parseFloat(e.target.value);
    zoomValue.textContent = config.zoom.toFixed(2);
    // Disable auto zoom when manually adjusting
    if (config.zoomAutoEnabled) {
        config.zoomAutoEnabled = false;
        zoomAutoToggle.textContent = 'Off';
    }
});

// Zoom automation toggle
zoomAutoToggle.addEventListener('click', () => {
    config.zoomAutoEnabled = !config.zoomAutoEnabled;
    zoomAutoToggle.textContent = config.zoomAutoEnabled ? 'On' : 'Off';
    if (config.zoomAutoEnabled) {
        config.zoomAutoTime = 0;
        config.zoomAutoDirection = 1;
    }
});

// Zoom min control (slider + input synced)
function updateZoomMin(val) {
    config.zoomMin = val;
    if (config.zoomMin > config.zoomMax) {
        config.zoomMin = config.zoomMax;
    }
    zoomMinSlider.value = config.zoomMin;
    zoomMinInput.value = config.zoomMin.toFixed(2);
}

zoomMinSlider.addEventListener('input', (e) => updateZoomMin(parseFloat(e.target.value)));
zoomMinInput.addEventListener('input', (e) => updateZoomMin(parseFloat(e.target.value) || 0.1));

// Zoom max control (slider + input synced)
function updateZoomMax(val) {
    config.zoomMax = val;
    if (config.zoomMax < config.zoomMin) {
        config.zoomMax = config.zoomMin;
    }
    zoomMaxSlider.value = config.zoomMax;
    zoomMaxInput.value = config.zoomMax.toFixed(2);
}

zoomMaxSlider.addEventListener('input', (e) => updateZoomMax(parseFloat(e.target.value)));
zoomMaxInput.addEventListener('input', (e) => updateZoomMax(parseFloat(e.target.value) || 0.1));

// Zoom speed control
zoomSpeedSlider.addEventListener('input', (e) => {
    config.zoomSpeed = parseFloat(e.target.value);
    zoomSpeedValue.textContent = config.zoomSpeed.toFixed(1) + 'x';
});

// FOV control
fovSlider.addEventListener('input', (e) => {
    config.fov = parseFloat(e.target.value);
    fovValue.textContent = config.fov + '°';
});

// Y Position control
offsetYSlider.addEventListener('input', (e) => {
    config.offsetY = parseFloat(e.target.value);
    offsetYValueEl.textContent = config.offsetY.toFixed(2);
    if (config.offsetYAutoEnabled) {
        config.offsetYAutoEnabled = false;
        offsetYAutoToggle.textContent = 'Off';
    }
});

// Y Position automation toggle
offsetYAutoToggle.addEventListener('click', () => {
    config.offsetYAutoEnabled = !config.offsetYAutoEnabled;
    offsetYAutoToggle.textContent = config.offsetYAutoEnabled ? 'On' : 'Off';
    if (config.offsetYAutoEnabled) {
        config.offsetYAutoTime = 0;
    }
});

// Y Position min control (slider + input synced)
function updateOffsetYMin(val) {
    config.offsetYMin = val;
    if (config.offsetYMin > config.offsetYMax) {
        config.offsetYMin = config.offsetYMax;
    }
    offsetYMinSlider.value = config.offsetYMin;
    offsetYMinInput.value = config.offsetYMin.toFixed(2);
}
offsetYMinSlider.addEventListener('input', (e) => updateOffsetYMin(parseFloat(e.target.value)));
offsetYMinInput.addEventListener('input', (e) => updateOffsetYMin(parseFloat(e.target.value) || -2));

// Y Position max control (slider + input synced)
function updateOffsetYMax(val) {
    config.offsetYMax = val;
    if (config.offsetYMax < config.offsetYMin) {
        config.offsetYMax = config.offsetYMin;
    }
    offsetYMaxSlider.value = config.offsetYMax;
    offsetYMaxInput.value = config.offsetYMax.toFixed(2);
}
offsetYMaxSlider.addEventListener('input', (e) => updateOffsetYMax(parseFloat(e.target.value)));
offsetYMaxInput.addEventListener('input', (e) => updateOffsetYMax(parseFloat(e.target.value) || 2));

// Y Position speed control
offsetYSpeedSlider.addEventListener('input', (e) => {
    config.offsetYSpeed = parseFloat(e.target.value);
    offsetYSpeedValue.textContent = config.offsetYSpeed.toFixed(1) + 'x';
});

// Solid/Wireframe toggle
solidToggle.addEventListener('click', () => {
    config.solidMode = !config.solidMode;
    solidToggle.textContent = config.solidMode ? 'Solid' : 'Wireframe';
});

// Wireframe thickness control
thicknessSlider.addEventListener('input', (e) => {
    config.wireframeThickness = parseFloat(e.target.value);
    thicknessValue.textContent = config.wireframeThickness.toFixed(1) + 'px';
});

// Thickness zoom-scaling controls
thicknessScaleToggle.addEventListener('click', () => {
    config.thicknessScaleEnabled = !config.thicknessScaleEnabled;
    thicknessScaleToggle.textContent = config.thicknessScaleEnabled ? 'On' : 'Off';
    thicknessScaleGroup.style.display = config.thicknessScaleEnabled ? '' : 'none';
});

thicknessScaleSlider.addEventListener('input', (e) => {
    config.thicknessScaleAmount = parseFloat(e.target.value) / 100;
    thicknessScaleValue.textContent = e.target.value + '%';
});

// Color pickers
colorPickers.forEach((picker, i) => {
    picker.addEventListener('input', (e) => {
        config.colors[i] = e.target.value;
    });
});

// Color count buttons
function updateColorCount(count) {
    config.colorCount = count;
    colorGroups.forEach((g, i) => {
        g.style.display = i < count ? '' : 'none';
    });
    document.querySelectorAll('.color-count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });
}

document.querySelectorAll('.color-count-btn').forEach(btn => {
    btn.addEventListener('click', () => updateColorCount(parseInt(btn.dataset.count)));
});

// Gradient toggle
gradientToggle.addEventListener('click', () => {
    config.gradientEnabled = !config.gradientEnabled;
    gradientToggle.textContent = config.gradientEnabled ? 'On' : 'Off';
});

// Stroke color control
strokeColorPicker.addEventListener('input', (e) => {
    config.strokeColor = e.target.value;
});

// Contrast control
contrastSlider.addEventListener('input', (e) => {
    config.contrast = parseFloat(e.target.value);
    contrastValue.textContent = config.contrast.toFixed(0) + '%';
});

// Background color control
backgroundPicker.addEventListener('input', (e) => {
    BACKGROUND = e.target.value;
});

// Stars toggle
starsToggle.addEventListener('click', () => {
    config.starsEnabled = !config.starsEnabled;
    starsToggle.textContent = config.starsEnabled ? 'On' : 'Off';
});

// Star speed control
starSpeedSlider.addEventListener('input', (e) => {
    config.starSpeed = parseFloat(e.target.value);
    starSpeedValue.textContent = config.starSpeed.toFixed(1) + 'x';
});

starColorPicker.addEventListener('input', (e) => {
    config.starColor = e.target.value;
});

starCountSlider.addEventListener('input', (e) => {
    config.starCount = parseInt(e.target.value);
    starCountValue.textContent = config.starCount;
    initStars();
});

// Model preset selector
modelPresetSelect.addEventListener('change', (e) => {
    const selectedPreset = e.target.value;
    loadModel(selectedPreset);
});

// Morph controls
morphToggle.addEventListener('click', () => {
    config.morphEnabled = !config.morphEnabled;
    morphToggle.textContent = config.morphEnabled ? 'On' : 'Off';
    if (config.morphEnabled) morphTime = 0;
});

morphTargetSelect.addEventListener('change', (e) => {
    config.morphTarget = e.target.value;
    morphTime = 0;
});

morphSpeedSlider.addEventListener('input', (e) => {
    config.morphSpeed = parseFloat(e.target.value);
    morphSpeedValue.textContent = config.morphSpeed.toFixed(1) + 'x';
});

// Object count buttons
function updateObjectCount(count) {
    config.objectCount = count;
    const show = count >= 2;
    obj2PresetGroup.style.display = show ? '' : 'none';
    obj2ScaleGroup.style.display = show ? '' : 'none';
    objDistanceGroup.style.display = show ? '' : 'none';
    objDistAutoGroup.style.display = show ? '' : 'none';
    const showAuto = show && config.objDistAutoEnabled;
    objDistMinGroup.style.display = showAuto ? '' : 'none';
    objDistMaxGroup.style.display = showAuto ? '' : 'none';
    objDistSpeedGroup.style.display = showAuto ? '' : 'none';
    document.querySelectorAll('.obj-count-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });
}

document.querySelectorAll('.obj-count-btn').forEach(btn => {
    btn.addEventListener('click', () => updateObjectCount(parseInt(btn.dataset.count)));
});

// Object scale controls
obj1ScaleSlider.addEventListener('input', (e) => {
    config.obj1Scale = parseFloat(e.target.value);
    obj1ScaleValue.textContent = config.obj1Scale.toFixed(2) + 'x';
});

obj2ScaleSlider.addEventListener('input', (e) => {
    config.obj2Scale = parseFloat(e.target.value);
    obj2ScaleValue.textContent = config.obj2Scale.toFixed(2) + 'x';
});

// Second object preset selector
modelPreset2Select.addEventListener('change', (e) => {
    loadSecondModel(e.target.value);
});

// Object Y distance
objDistanceSlider.addEventListener('input', (e) => {
    config.objectDistance = parseFloat(e.target.value);
    objDistanceValue.textContent = config.objectDistance.toFixed(2);
    if (config.objDistAutoEnabled) {
        config.objDistAutoEnabled = false;
        objDistAutoToggle.textContent = 'Off';
    }
});

// Distance automation toggle
objDistAutoToggle.addEventListener('click', () => {
    config.objDistAutoEnabled = !config.objDistAutoEnabled;
    objDistAutoToggle.textContent = config.objDistAutoEnabled ? 'On' : 'Off';
    objDistMinGroup.style.display = config.objDistAutoEnabled ? '' : 'none';
    objDistMaxGroup.style.display = config.objDistAutoEnabled ? '' : 'none';
    objDistSpeedGroup.style.display = config.objDistAutoEnabled ? '' : 'none';
    if (config.objDistAutoEnabled) {
        config.objDistAutoTime = 0;
    }
});

// Distance min control
function updateObjDistMin(val) {
    config.objDistMin = val;
    if (config.objDistMin > config.objDistMax) config.objDistMin = config.objDistMax;
    objDistMinSlider.value = config.objDistMin;
    objDistMinInput.value = config.objDistMin.toFixed(2);
}
objDistMinSlider.addEventListener('input', (e) => updateObjDistMin(parseFloat(e.target.value)));
objDistMinInput.addEventListener('input', (e) => updateObjDistMin(parseFloat(e.target.value) || 0));

// Distance max control
function updateObjDistMax(val) {
    config.objDistMax = val;
    if (config.objDistMax < config.objDistMin) config.objDistMax = config.objDistMin;
    objDistMaxSlider.value = config.objDistMax;
    objDistMaxInput.value = config.objDistMax.toFixed(2);
}
objDistMaxSlider.addEventListener('input', (e) => updateObjDistMax(parseFloat(e.target.value)));
objDistMaxInput.addEventListener('input', (e) => updateObjDistMax(parseFloat(e.target.value) || 0));

// Distance speed control
objDistSpeedSlider.addEventListener('input', (e) => {
    config.objDistSpeed = parseFloat(e.target.value);
    objDistSpeedValue.textContent = config.objDistSpeed.toFixed(1) + 'x';
});

// Initialize with default model
loadModel('cube');
modelPresetSelect.value = 'cube';

// Initialize UI to match config defaults
speedXValue.textContent = config.speedX.toFixed(2) + 'x';
speedYValue.textContent = config.speedY.toFixed(2) + 'x';
speedZValue.textContent = config.speedZ.toFixed(2) + 'x';
zoomMinInput.value = config.zoomMin.toFixed(2);
zoomMaxInput.value = config.zoomMax.toFixed(2);
zoomSpeedValue.textContent = config.zoomSpeed.toFixed(1) + 'x';
fovValue.textContent = config.fov + '°';
offsetYValueEl.textContent = config.offsetY.toFixed(2);
offsetYMinInput.value = config.offsetYMin.toFixed(2);
offsetYMaxInput.value = config.offsetYMax.toFixed(2);
offsetYSpeedValue.textContent = config.offsetYSpeed.toFixed(1) + 'x';
thicknessValue.textContent = config.wireframeThickness.toFixed(1) + 'px';
thicknessSlider.value = config.wireframeThickness;
contrastValue.textContent = config.contrast.toFixed(0) + '%';
starSpeedValue.textContent = config.starSpeed.toFixed(1) + 'x';
starColorPicker.value = config.starColor;
starCountValue.textContent = config.starCount;
starCountSlider.value = config.starCount;
colorPickers.forEach((p, i) => p.value = config.colors[i]);
updateColorCount(config.colorCount);
gradientToggle.textContent = config.gradientEnabled ? 'On' : 'Off';
strokeColorPicker.value = config.strokeColor;
backgroundPicker.value = BACKGROUND;
solidToggle.textContent = 'Wireframe';
starsToggle.textContent = 'Off';

// Mouse wheel zoom on canvas
game.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling

    // Disable zoom automation when manually zooming
    if (config.zoomAutoEnabled) {
        config.zoomAutoEnabled = false;
        zoomAutoToggle.textContent = 'Off';
    }

    // Adjust zoom based on wheel direction
    // deltaY > 0 = scroll down = zoom out
    // deltaY < 0 = scroll up = zoom in
    const zoomStep = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;

    // Update zoom value
    config.zoom += direction * zoomStep;

    // Clamp to valid range (0.5 to 5)
    config.zoom = Math.max(0.1, Math.min(5.0, config.zoom));

    // Update UI
    zoomSlider.value = config.zoom;
    zoomValue.textContent = config.zoom.toFixed(2);
});

// Mouse drag rotation controls
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

game.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click only
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        game.style.cursor = 'grabbing';
    }
});

game.addEventListener('mousemove', (e) => {
    if (isDragging) {
        // Calculate mouse movement
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;

        // Rotation sensitivity (radians per pixel)
        const sensitivity = 0.005;

        // Update rotation angles
        // If Shift is held, horizontal movement controls Y-axis (spin left/right)
        // Otherwise, horizontal movement controls Z-axis (roll)
        if (e.shiftKey) {
            config.angleY += deltaX * sensitivity;
        } else {
            config.angleZ += deltaX * sensitivity;
        }

        // Vertical movement (deltaY) always controls X-axis rotation (tilt up/down)
        config.angleX += deltaY * sensitivity;

        // Normalize angles to 0-2π range for display
        const normalizeAngle = (angle) => {
            const normalized = angle % (Math.PI * 2);
            return normalized < 0 ? normalized + Math.PI * 2 : normalized;
        };

        const displayAngleX = normalizeAngle(config.angleX);
        const displayAngleY = normalizeAngle(config.angleY);
        const displayAngleZ = normalizeAngle(config.angleZ);

        // Update sliders and displays
        angleXSlider.value = Math.round((displayAngleX * 180 / Math.PI) % 360);
        angleYSlider.value = Math.round((displayAngleY * 180 / Math.PI) % 360);
        angleZSlider.value = Math.round((displayAngleZ * 180 / Math.PI) % 360);
        angleXValue.textContent = angleXSlider.value + '°';
        angleYValue.textContent = angleYSlider.value + '°';
        angleZValue.textContent = angleZSlider.value + '°';

        // Update last mouse position
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

game.addEventListener('mouseup', () => {
    isDragging = false;
    game.style.cursor = 'grab';
});

game.addEventListener('mouseleave', () => {
    isDragging = false;
    game.style.cursor = 'default';
});

// Set initial cursor style
game.style.cursor = 'grab';

// Edit current model button
editModelBtn.addEventListener('click', () => {
    // Load current model into editor
    const modelJson = JSON.stringify({
        vs: currentModel.vs,
        fs: currentModel.fs
    }, null, 2);
    modelJsonEditor.value = modelJson;
    jsonError.style.display = 'none';
    modelEditorModal.style.display = 'flex';
});

// Save as preset button
savePresetBtn.addEventListener('click', () => {
    // Save current model back to the current preset
    saveToPreset(currentPresetName);
    alert(`Saved to ${modelPresets[currentPresetName].name} preset!`);
});

// Apply model from editor
applyModelBtn.addEventListener('click', () => {
    try {
        const modelData = JSON.parse(modelJsonEditor.value);

        // Validate the structure
        if (!modelData.vs || !Array.isArray(modelData.vs)) {
            throw new Error('Invalid model: "vs" must be an array of vertices');
        }
        if (!modelData.fs || !Array.isArray(modelData.fs)) {
            throw new Error('Invalid model: "fs" must be an array of faces');
        }

        // Validate vertices
        for (let i = 0; i < modelData.vs.length; i++) {
            const v = modelData.vs[i];
            if (typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number') {
                throw new Error(`Invalid vertex at index ${i}: must have x, y, z numbers`);
            }
        }

        // Validate faces
        for (let i = 0; i < modelData.fs.length; i++) {
            const f = modelData.fs[i];
            if (!Array.isArray(f)) {
                throw new Error(`Invalid face at index ${i}: must be an array of vertex indices`);
            }
        }

        // Update current model
        currentModel.vs = modelData.vs;
        currentModel.fs = modelData.fs;

        // Close modal
        modelEditorModal.style.display = 'none';
        jsonError.style.display = 'none';

    } catch (error) {
        jsonError.textContent = 'Error: ' + error.message;
        jsonError.style.display = 'block';
    }
});

// Cancel model editor
cancelModelBtn.addEventListener('click', () => {
    modelEditorModal.style.display = 'none';
    jsonError.style.display = 'none';
});

// Close modal on outside click
modelEditorModal.addEventListener('click', (e) => {
    if (e.target === modelEditorModal) {
        modelEditorModal.style.display = 'none';
        jsonError.style.display = 'none';
    }
});

// Reset button
resetBtn.addEventListener('click', () => {
    config.speedX = 0.10;
    config.speedY = 0.10;
    config.speedZ = 0;
    config.angleX = 0;
    config.angleY = 0;
    config.angleZ = 0;
    config.zoom = 1.0;
    config.autoRotationX = 0;
    config.autoRotationY = 0;
    config.autoRotationZ = 0;
    config.solidMode = false;
    config.wireframeThickness = 10.0;
    config.thicknessScaleEnabled = false;
    config.thicknessScaleAmount = 0.5;
    config.colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    config.colorCount = 1;
    config.gradientEnabled = false;
    config.strokeColor = '#000000';
    config.contrast = 70;
    config.starsEnabled = false;
    config.starSpeed = 0.3;
    config.starColor = '#ffffff';
    config.starCount = 200;
    config.zoomAutoEnabled = false;
    config.zoomMin = 0.8;
    config.zoomMax = 1.5;
    config.zoomSpeed = 1.0;
    config.zoomAutoTime = 0;
    config.zoomAutoDirection = 1;
    config.fov = 60;
    config.offsetY = 0;
    config.offsetYAutoEnabled = false;
    config.offsetYMin = -0.5;
    config.offsetYMax = 0.5;
    config.offsetYSpeed = 1.0;
    config.offsetYAutoTime = 0;
    config.morphEnabled = false;
    config.morphTarget = 'pyramid';
    config.morphSpeed = 0.5;
    config.objectCount = 1;
    config.obj1Scale = 1.0;
    config.obj2Scale = 1.0;
    config.objectDistance = 0.5;
    config.objDistAutoEnabled = false;
    config.objDistMin = 0.1;
    config.objDistMax = 1.0;
    config.objDistSpeed = 1.0;
    config.objDistAutoTime = 0;
    morphTime = 0;

    loadSecondModel('torus');
    modelPreset2Select.value = 'torus';
    updateObjectCount(1);
    obj1ScaleSlider.value = 1.0;
    obj1ScaleValue.textContent = '1.00x';
    obj2ScaleSlider.value = 1.0;
    obj2ScaleValue.textContent = '1.00x';
    objDistanceSlider.value = 0.5;
    objDistanceValue.textContent = '0.50';
    objDistAutoToggle.textContent = 'Off';
    objDistMinSlider.value = 0.1;
    objDistMinInput.value = '0.10';
    objDistMaxSlider.value = 1.0;
    objDistMaxInput.value = '1.00';
    objDistSpeedSlider.value = 1.0;
    objDistSpeedValue.textContent = '1.0x';

    speedXSlider.value = 0.1;
    speedYSlider.value = 0.1;
    speedZSlider.value = 0;
    angleXSlider.value = 0;
    angleYSlider.value = 0;
    angleZSlider.value = 0;
    zoomSlider.value = 1.0;
    zoomAutoToggle.textContent = 'Off';
    zoomMinSlider.value = 0.8;
    zoomMaxSlider.value = 1.5;
    zoomSpeedSlider.value = 1.0;
    fovSlider.value = 60;
    offsetYSlider.value = 0;
    offsetYAutoToggle.textContent = 'Off';
    offsetYMinSlider.value = -0.5;
    offsetYMaxSlider.value = 0.5;
    offsetYSpeedSlider.value = 1.0;
    thicknessSlider.value = 10.0;
    thicknessScaleToggle.textContent = 'Off';
    thicknessScaleSlider.value = 50;
    thicknessScaleValue.textContent = '50%';
    thicknessScaleGroup.style.display = 'none';
    colorPickers[0].value = '#ff0000';
    colorPickers[1].value = '#00ff00';
    colorPickers[2].value = '#0000ff';
    colorPickers[3].value = '#ffff00';
    updateColorCount(1);
    gradientToggle.textContent = 'Off';
    strokeColorPicker.value = '#000000';
    contrastSlider.value = 70;
    backgroundPicker.value = '#000000';
    BACKGROUND = '#000000';
    solidToggle.textContent = 'Wireframe';
    starsToggle.textContent = 'Off';
    starSpeedSlider.value = 0.3;
    starColorPicker.value = '#ffffff';
    starCountSlider.value = 200;
    starCountValue.textContent = '200';
    initStars();

    speedXValue.textContent = '0.10x';
    speedYValue.textContent = '0.10x';
    speedZValue.textContent = '0.00x';
    angleXValue.textContent = '0°';
    angleYValue.textContent = '0°';
    angleZValue.textContent = '0°';
    zoomValue.textContent = '1.00';
    zoomMinInput.value = '0.80';
    zoomMaxInput.value = '1.50';
    zoomSpeedValue.textContent = '1.0x';
    fovValue.textContent = '60°';
    offsetYValueEl.textContent = '0.00';
    offsetYMinInput.value = '-0.50';
    offsetYMaxInput.value = '0.50';
    offsetYSpeedValue.textContent = '1.0x';
    thicknessValue.textContent = '10.0px';
    contrastValue.textContent = '70%';
    starSpeedValue.textContent = '0.3x';
    loadModel('cube');
    modelPresetSelect.value = 'cube';
    morphToggle.textContent = 'Off';
    morphTargetSelect.value = 'pyramid';
    morphSpeedSlider.value = 0.5;
    morphSpeedValue.textContent = '0.5x';

    dz = fovToFocal(60);
});

// Initialize USB LED streaming
USBStream.initControls(game, () => {
    initStars();
});

// Initialize sequencer
Sequencer.initUI();

function getEffectiveColors() {
    const targetIds = ['color1', 'color2', 'color3', 'color4'];
    return config.colors.slice(0, config.colorCount).map((c, i) => Sequencer.getColorBlend(c, targetIds[i]));
}

function createFaceGradient(screenPoints, colors, brightness, contrast) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of screenPoints) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    for (let i = 0; i < colors.length; i++) {
        const stop = colors.length === 1 ? 0 : i / (colors.length - 1);
        grad.addColorStop(stop, brightnessToColor(brightness, colors[i], contrast));
    }
    return grad;
}

function renderScene(dt) {
    Sequencer.updateModulations(dt);

    config.autoRotationX += Math.PI * dt * (config.speedX + Sequencer.getModOffset('speedX'));
    config.autoRotationY += Math.PI * dt * (config.speedY + Sequencer.getModOffset('speedY'));
    config.autoRotationZ += Math.PI * dt * (config.speedZ + Sequencer.getModOffset('speedZ'));

    const currentAngleX = config.angleX + config.autoRotationX + Sequencer.getModOffset('angleX');
    const currentAngleY = config.angleY + config.autoRotationY + Sequencer.getModOffset('angleY');
    const currentAngleZ = config.angleZ + config.autoRotationZ + Sequencer.getModOffset('angleZ');

    if (config.zoomAutoEnabled) {
        config.zoomAutoTime += dt * config.zoomSpeed;
        const sineValue = Math.sin(config.zoomAutoTime * Math.PI);
        config.zoom = config.zoomMin + (config.zoomMax - config.zoomMin) * (sineValue + 1) / 2;
        zoomSlider.value = config.zoom;
        zoomValue.textContent = config.zoom.toFixed(2);
    }

    focalLength = fovToFocal(config.fov);
    dz = Math.max(0.05, config.zoom + Sequencer.getModOffset('zoom')) * focalLength;

    if (config.offsetYAutoEnabled) {
        config.offsetYAutoTime += dt * config.offsetYSpeed;
        const sineValue = Math.sin(config.offsetYAutoTime * Math.PI);
        config.offsetY = config.offsetYMin + (config.offsetYMax - config.offsetYMin) * (sineValue + 1) / 2;
        offsetYSlider.value = config.offsetY;
        offsetYValueEl.textContent = config.offsetY.toFixed(2);
    }

    const dy = config.offsetY + Sequencer.getModOffset('offsetY');

    let effectiveThickness = config.wireframeThickness;
    if (config.thicknessScaleEnabled) {
        const baseDistance = fovToFocal(60);
        const scaleFactor = baseDistance / dz;
        const blended = 1 + (scaleFactor - 1) * config.thicknessScaleAmount;
        effectiveThickness = Math.max(0.5, config.wireframeThickness * blended);
    }

    const effectiveBackground = Sequencer.getColorBlend(BACKGROUND, 'background');
    const effectiveStarColor = Sequencer.getColorBlend(config.starColor, 'starColor');
    const effectiveStrokeColor = Sequencer.getColorBlend(config.strokeColor, 'strokeColor');

    updateStars(dt);
    clear(effectiveBackground);
    drawStars(effectiveStarColor);

    // Morph computation for object 1
    let activeModel = currentModel;
    if (config.morphEnabled) {
        morphTime += dt * config.morphSpeed;
        const t = (1 - Math.cos(morphTime * Math.PI)) / 2;
        const target = modelPresets[config.morphTarget];
        if (target) {
            activeModel = computeMorphedModel(currentModel, target, t);
        }
    }

    const morphMod = Sequencer.getMorphMod();
    if (morphMod.amount > 0 && morphMod.target) {
        const morphTarget = modelPresets[morphMod.target];
        if (morphTarget) {
            activeModel = computeMorphedModel(activeModel, morphTarget, morphMod.amount);
        }
    }

    // Distance automation
    if (config.objDistAutoEnabled && config.objectCount >= 2) {
        config.objDistAutoTime += dt * config.objDistSpeed;
        const sineValue = Math.sin(config.objDistAutoTime * Math.PI);
        config.objectDistance = config.objDistMin + (config.objDistMax - config.objDistMin) * (sineValue + 1) / 2;
        objDistanceSlider.value = config.objectDistance;
        objDistanceValue.textContent = config.objectDistance.toFixed(2);
    }

    // Build object list with Y offsets and scales
    const objectsToRender = [];
    if (config.objectCount >= 2) {
        objectsToRender.push({ model: activeModel, yOffset: config.objectDistance / 2, scale: config.obj1Scale });
        objectsToRender.push({ model: secondModel, yOffset: -config.objectDistance / 2, scale: config.obj2Scale });
    } else {
        objectsToRender.push({ model: activeModel, yOffset: 0, scale: config.obj1Scale });
    }

    const effectiveColors = getEffectiveColors();
    const solidAmount = config.solidMode ? 1 : Sequencer.getSolidAmount();
    const distortAmt = Sequencer.getDistortAmount();
    const dNoise = Sequencer.distortNoise;

    function getVertex(model, vi) {
        const v = model.vs[vi];
        if (distortAmt <= 0) return v;
        const n = dNoise[vi % dNoise.length];
        return {
            x: v.x + n.x * distortAmt,
            y: v.y + n.y * distortAmt,
            z: v.z + n.z * distortAmt,
        };
    }

    if (solidAmount > 0) {
        const facesWithDepth = [];

        for (const obj of objectsToRender) {
            for (const f of obj.model.fs) {
                if (f.length < 3) continue;

                const transformedVertices = [];
                let allValid = true;

                for (let i = 0; i < f.length; i++) {
                    const v = getVertex(obj.model, f[i]);
                    const s = obj.scale;
                    const offset = { x: v.x * s, y: v.y * s + obj.yOffset, z: v.z * s };
                    const rotated = rotate_xyz(offset, currentAngleX, currentAngleY, currentAngleZ);
                    const translated = translate_z(rotated, dz);

                    if (translated.z <= 0.01) {
                        allValid = false;
                        break;
                    }
                    transformedVertices.push(translated);
                }

                if (!allValid) continue;

                const center = calculateCenter(transformedVertices);
                const normal = calculateNormal(
                    transformedVertices[0],
                    transformedVertices[1],
                    transformedVertices[2]
                );

                const lightIntensity = Math.abs(normal.z);
                const depthBrightness = Math.max(0.3, Math.min(1.0, 2.0 / center.z));
                const contrastFactor = config.contrast / 100;
                const baseBrightness = 0.4 - (contrastFactor * 0.35);
                const directionalLight = 0.6 + (contrastFactor * 0.4);
                const brightness = baseBrightness + (lightIntensity * directionalLight * depthBrightness);

                facesWithDepth.push({
                    vertices: transformedVertices,
                    depth: center.z,
                    brightness: brightness,
                    faceIndex: facesWithDepth.length,
                    normal: normal
                });
            }
        }

        facesWithDepth.sort((a, b) => b.depth - a.depth);

        for (const face of facesWithDepth) {
            const screenPoints = face.vertices.map(v => {
                const p = project(v);
                p.y += dy;
                return screen(p);
            });

            let faceColor;
            if (config.gradientEnabled && effectiveColors.length > 1) {
                faceColor = createFaceGradient(screenPoints, effectiveColors, face.brightness, config.contrast);
            } else {
                const ci = face.faceIndex % effectiveColors.length;
                faceColor = brightnessToColor(face.brightness, effectiveColors[ci], config.contrast);
            }

            ctx.globalAlpha = solidAmount;
            polygon(screenPoints, faceColor, effectiveStrokeColor, effectiveThickness, true, solidAmount >= 1);
            ctx.globalAlpha = 1;
        }
    }

    if (solidAmount < 1) {
        let edgeIdx = 0;
        for (const obj of objectsToRender) {
            for (const f of obj.model.fs) {
                for (let i = 0; i < f.length; ++i) {
                    const a = getVertex(obj.model, f[i]);
                    const b = getVertex(obj.model, f[(i + 1) % f.length]);
                    const s = obj.scale;

                    const aOff = { x: a.x * s, y: a.y * s + obj.yOffset, z: a.z * s };
                    const bOff = { x: b.x * s, y: b.y * s + obj.yOffset, z: b.z * s };

                    const rotatedA = rotate_xyz(aOff, currentAngleX, currentAngleY, currentAngleZ);
                    const rotatedB = rotate_xyz(bOff, currentAngleX, currentAngleY, currentAngleZ);

                    const tA = translate_z(rotatedA, dz);
                    const tB = translate_z(rotatedB, dz);

                    if (tA.z <= 0.01 || tB.z <= 0.01) { edgeIdx++; continue; }

                    const pA = project(tA);
                    const pB = project(tB);
                    pA.y += dy;
                    pB.y += dy;

                    const sA = screen(pA);
                    const sB = screen(pB);

                    let lineColor;
                    if (config.gradientEnabled && effectiveColors.length > 1) {
                        const grad = ctx.createLinearGradient(sA.x, sA.y, sB.x, sB.y);
                        for (let c = 0; c < effectiveColors.length; c++) {
                            grad.addColorStop(c / (effectiveColors.length - 1), effectiveColors[c]);
                        }
                        lineColor = grad;
                    } else {
                        lineColor = effectiveColors[edgeIdx % effectiveColors.length];
                    }

                    line(sA, sB, effectiveThickness, lineColor);
                    edgeIdx++;
                }
            }
        }
    }
}

let renderLoopActive = true;

function frame() {
    if (!renderLoopActive) return;
    renderScene(1 / FPS);
    setTimeout(frame, 1000 / FPS);
}

window.renderScene = renderScene;
window.getConfig = () => config;
window.stopRenderLoop = () => { renderLoopActive = false; };
window.startRenderLoop = () => { renderLoopActive = true; setTimeout(frame, 1000 / FPS); };

setTimeout(frame, 1000 / FPS);
