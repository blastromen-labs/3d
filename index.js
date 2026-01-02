let BACKGROUND = "#030317"
const FOREGROUND = "#50FF50"

console.log(game)
game.width = 800
game.height = 800
const ctx = game.getContext("2d")
console.log(ctx)

// Access presets from globally loaded presets.js
const modelPresets = MODEL_PRESETS;

// Current model being rendered (starts with penguin)
let currentModel = {
    vs: [...modelPresets.penguin.vs],
    fs: modelPresets.penguin.fs.map(f => [...f])
};

// Current selected preset name
let currentPresetName = 'penguin';

// Function to switch model
function loadModel(presetName) {
    const preset = modelPresets[presetName];
    if (preset) {
        currentModel.vs = [...preset.vs];
        currentModel.fs = preset.fs.map(f => [...f]);
        currentPresetName = presetName;
    }
}

// Function to save current model back to preset
function saveToPreset(presetName) {
    if (modelPresets[presetName]) {
        modelPresets[presetName].vs = [...currentModel.vs];
        modelPresets[presetName].fs = currentModel.fs.map(f => [...f]);
    }
}

function clear() {
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, game.width, game.height)
}

function point({ x, y }) {
    const s = 20;
    ctx.fillStyle = FOREGROUND
    ctx.fillRect(x - s / 2, y - s / 2, s, s)
}

function line(p1, p2, thickness, color) {
    ctx.lineWidth = thickness || 3;
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
    // -1..1 => 0..2 => 0..1 => 0..w
    return {
        x: (p.x + 1) / 2 * game.width,
        y: (1 - (p.y + 1) / 2) * game.height,
    }
}

function project({ x, y, z }) {
    return {
        x: x / z,
        y: y / z,
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
    speedX: 0.10,
    speedY: 0.10,
    speedZ: 0,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    zoom: 1.0,
    autoRotationX: 0,
    autoRotationY: 0,
    autoRotationZ: 0,
    solidMode: true,
    wireframeThickness: 1.0,
    wireframeColor: '#FF0F77',
    strokeColor: '#0a0a0a',
    contrast: 70,
    starsEnabled: true,
    starSpeed: 0.3
};

let dz = 1;

// Star field system
const stars = [];
const STAR_COUNT = 200;

// Initialize stars
function initStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * game.width,
            y: Math.random() * game.height,
            z: Math.random(), // 0 to 1, represents depth (0 = far, 1 = near)
            size: Math.random() * 2 + 0.5
        });
    }
}

// Draw stars
function drawStars() {
    if (!config.starsEnabled) return;

    for (const star of stars) {
        // Brightness based on depth (farther = darker, closer = brighter)
        const brightness = Math.floor(star.z * 255);
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;

        // Size based on depth
        const size = star.size * (0.5 + star.z * 1.5);

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
const solidToggle = document.getElementById('solidToggle');
const thicknessSlider = document.getElementById('thicknessSlider');
const colorPicker = document.getElementById('colorPicker');
const strokeColorPicker = document.getElementById('strokeColorPicker');
const contrastSlider = document.getElementById('contrastSlider');
const backgroundPicker = document.getElementById('backgroundPicker');
const starsToggle = document.getElementById('starsToggle');
const starSpeedSlider = document.getElementById('starSpeedSlider');
const modelPresetSelect = document.getElementById('modelPreset');
const editModelBtn = document.getElementById('editModelBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const modelEditorModal = document.getElementById('modelEditorModal');
const modelJsonEditor = document.getElementById('modelJsonEditor');
const applyModelBtn = document.getElementById('applyModelBtn');
const cancelModelBtn = document.getElementById('cancelModelBtn');
const jsonError = document.getElementById('jsonError');
const resetBtn = document.getElementById('resetBtn');

const speedXValue = document.getElementById('speedXValue');
const speedYValue = document.getElementById('speedYValue');
const speedZValue = document.getElementById('speedZValue');
const angleXValue = document.getElementById('angleXValue');
const angleYValue = document.getElementById('angleYValue');
const angleZValue = document.getElementById('angleZValue');
const zoomValue = document.getElementById('zoomValue');
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

// Wireframe color control
colorPicker.addEventListener('input', (e) => {
    config.wireframeColor = e.target.value;
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

// Model preset selector
modelPresetSelect.addEventListener('change', (e) => {
    const selectedPreset = e.target.value;
    loadModel(selectedPreset);
});

// Initialize with default model
loadModel('penguin');

// Initialize UI to match config defaults
speedXValue.textContent = config.speedX.toFixed(2) + 'x';
speedYValue.textContent = config.speedY.toFixed(2) + 'x';
speedZValue.textContent = config.speedZ.toFixed(2) + 'x';
thicknessValue.textContent = config.wireframeThickness.toFixed(1) + 'px';
contrastValue.textContent = config.contrast.toFixed(0) + '%';
starSpeedValue.textContent = config.starSpeed.toFixed(1) + 'x';

// Mouse wheel zoom on canvas
game.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling

    // Adjust zoom based on wheel direction
    // deltaY > 0 = scroll down = zoom out
    // deltaY < 0 = scroll up = zoom in
    const zoomStep = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;

    // Update zoom value
    config.zoom += direction * zoomStep;

    // Clamp to valid range (0.5 to 5)
    config.zoom = Math.max(0.5, Math.min(5.0, config.zoom));

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
    config.solidMode = true;
    config.wireframeThickness = 1.0;
    config.wireframeColor = '#FF0F77';
    config.strokeColor = '#0a0a0a';
    config.contrast = 70;
    config.starsEnabled = true;
    config.starSpeed = 0.3;

    speedXSlider.value = 0.1;
    speedYSlider.value = 0.1;
    speedZSlider.value = 0;
    angleXSlider.value = 0;
    angleYSlider.value = 0;
    angleZSlider.value = 0;
    zoomSlider.value = 1.0;
    thicknessSlider.value = 1.0;
    colorPicker.value = '#FF0F77';
    strokeColorPicker.value = '#0a0a0a';
    contrastSlider.value = 70;
    backgroundPicker.value = '#030317';
    BACKGROUND = '#030317';
    solidToggle.textContent = 'Solid';
    starsToggle.textContent = 'On';
    starSpeedSlider.value = 0.3;

    speedXValue.textContent = '0.10x';
    speedYValue.textContent = '0.10x';
    speedZValue.textContent = '0.00x';
    angleXValue.textContent = '0°';
    angleYValue.textContent = '0°';
    angleZValue.textContent = '0°';
    zoomValue.textContent = '1.00';
    thicknessValue.textContent = '1.0px';
    contrastValue.textContent = '70%';
    starSpeedValue.textContent = '0.3x';

    dz = 1;
});

function frame() {
    const dt = 1 / FPS;

    // Update auto-rotation angles for each axis
    config.autoRotationX += Math.PI * dt * config.speedX;
    config.autoRotationY += Math.PI * dt * config.speedY;
    config.autoRotationZ += Math.PI * dt * config.speedZ;

    // Combine base angles from sliders with auto-rotation
    const currentAngleX = config.angleX + config.autoRotationX;
    const currentAngleY = config.angleY + config.autoRotationY;
    const currentAngleZ = config.angleZ + config.autoRotationZ;

    // Update zoom
    dz = config.zoom;

    // Update star positions
    updateStars(dt);

    clear();

    // Draw stars behind 3D object
    drawStars();

    if (config.solidMode) {
        // Solid rendering with lighting and depth sorting
        const facesWithDepth = [];

        for (const f of currentModel.fs) {
            // Skip edges (faces with only 2 vertices)
            if (f.length < 3) continue;

            // Transform all vertices of this face
            const transformedVertices = [];
            let allValid = true;

            for (let i = 0; i < f.length; i++) {
                const v = currentModel.vs[f[i]];
                const rotated = rotate_xyz(v, currentAngleX, currentAngleY, currentAngleZ);
                const translated = translate_z(rotated, dz);

                // Check if vertex is in front of camera (positive z)
                if (translated.z <= 0.1) {
                    allValid = false;
                    break;
                }
                transformedVertices.push(translated);
            }

            // Skip faces that are behind or too close to camera
            if (!allValid) continue;

            // Calculate face center for depth sorting
            const center = calculateCenter(transformedVertices);

            // Calculate face normal (use first 3 vertices)
            const normal = calculateNormal(
                transformedVertices[0],
                transformedVertices[1],
                transformedVertices[2]
            );

            // Calculate lighting intensity based on how face is oriented to camera
            // normal.z tells us if face is pointing towards (+) or away (-) from camera
            const lightIntensity = Math.abs(normal.z);

            // Calculate depth-based brightness (closer = brighter)
            const depthBrightness = Math.max(0.3, Math.min(1.0, 2.0 / center.z));

            // Ambient light decreases with contrast for more dramatic lighting
            const contrastFactor = config.contrast / 100;
            const baseBrightness = 0.4 - (contrastFactor * 0.35); // 0.4 down to 0.05
            const directionalLight = 0.6 + (contrastFactor * 0.4); // 0.6 up to 1.0

            // Combine lighting and depth
            const brightness = baseBrightness + (lightIntensity * directionalLight * depthBrightness);

            facesWithDepth.push({
                vertices: transformedVertices,
                depth: center.z,
                color: brightnessToColor(brightness, config.wireframeColor, config.contrast),
                normal: normal
            });
        }

        // Sort faces by depth (back to front for painter's algorithm)
        facesWithDepth.sort((a, b) => b.depth - a.depth);

        // Draw sorted faces
        for (const face of facesWithDepth) {
            const screenPoints = face.vertices.map(v => screen(project(v)));
            polygon(screenPoints, face.color, config.strokeColor, config.wireframeThickness, true, true);
        }
    } else {
        // Wireframe rendering
        for (const f of currentModel.fs) {
            for (let i = 0; i < f.length; ++i) {
                const a = currentModel.vs[f[i]];
                const b = currentModel.vs[f[(i + 1) % f.length]];

                const rotatedA = rotate_xyz(a, currentAngleX, currentAngleY, currentAngleZ);
                const rotatedB = rotate_xyz(b, currentAngleX, currentAngleY, currentAngleZ);

                line(screen(project(translate_z(rotatedA, dz))),
                    screen(project(translate_z(rotatedB, dz))),
                    config.wireframeThickness,
                    config.wireframeColor)
            }
        }
    }

    setTimeout(frame, 1000 / FPS);
}
setTimeout(frame, 1000 / FPS);
