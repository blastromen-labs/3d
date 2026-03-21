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
    if (config.trailEnabled && config.trailAmount > 0) {
        ctx.globalAlpha = 1 - config.trailAmount;
        ctx.fillStyle = bgColor || BACKGROUND;
        ctx.fillRect(0, 0, game.width, game.height);
        ctx.globalAlpha = 1;
    } else {
        ctx.fillStyle = bgColor || BACKGROUND;
        ctx.fillRect(0, 0, game.width, game.height);
    }
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

function brightnessToColor(brightness, baseColor, contrast, specular = 0) {
    brightness = Math.max(0, Math.min(1.0, brightness));

    const contrastFactor = contrast / 100;
    const contrastPower = 1 + contrastFactor * 4;
    brightness = Math.pow(brightness, contrastPower);

    const minBrightness = 1.0 - contrastFactor;
    brightness = minBrightness + brightness * contrastFactor;

    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const finalR = Math.min(255, Math.floor(r * brightness + 255 * specular));
    const finalG = Math.min(255, Math.floor(g * brightness + 255 * specular));
    const finalB = Math.min(255, Math.floor(b * brightness + 255 * specular));

    return `rgb(${finalR}, ${finalG}, ${finalB})`;
}

function hexToRgbComponents(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
}

function hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    const toHex = v => Math.round(Math.min(255, Math.max(0, v * 255))).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function interpolateColorHSL(hex1, hex2, t) {
    const [r1, g1, b1] = hexToRgbComponents(hex1);
    const [r2, g2, b2] = hexToRgbComponents(hex2);
    const [h1, s1, l1] = rgbToHsl(r1, g1, b1);
    const [h2, s2, l2] = rgbToHsl(r2, g2, b2);

    let dh = h2 - h1;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    const h = ((h1 + dh * t) % 1 + 1) % 1;
    const s = s1 + (s2 - s1) * t;
    const l = l1 + (l2 - l1) * t;
    return hslToHex(h, s, l);
}

function sampleGradientColor(colors, t) {
    t = Math.max(0, Math.min(1, t));
    if (colors.length === 1) return colors[0];
    const vibrancy = config.gradientVibrancy / 100;
    const segment = t * (colors.length - 1);
    const i = Math.min(Math.floor(segment), colors.length - 2);
    let lt = segment - i;
    if (vibrancy > 0) {
        const power = 1 + vibrancy * 10;
        if (lt < 0.5) lt = 0.5 * Math.pow(2 * lt, power);
        else lt = 1 - 0.5 * Math.pow(2 * (1 - lt), power);
    }
    return interpolateColorHSL(colors[i], colors[i + 1], lt);
}

function applyMasterColor(hexColor) {
    const [r, g, b] = hexToRgbComponents(hexColor);
    let [h, s, l] = rgbToHsl(r, g, b);

    h = ((h + config.masterHue / 360) % 1 + 1) % 1;
    s = Math.min(1, Math.max(0, s * (config.masterSaturation / 100)));
    l = Math.min(1, Math.max(0, 0.5 + (l - 0.5) * (config.masterContrast / 100)));
    l = Math.min(1, Math.max(0, l * (config.masterBrightness / 100)));

    return hslToHex(h, s, l);
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
    gradientMode: 'face',
    gradientDirection: 'tb',
    gradientVibrancy: 0,
    masterHue: 0,
    masterHueAutoEnabled: false,
    masterHueMin: -180,
    masterHueMax: 180,
    masterHueSpeed: 1.0,
    masterHueAutoTime: 0,
    masterSaturation: 100,
    masterBrightness: 100,
    masterContrast: 100,
    strokeColor: '#000000',
    contrast: 70,
    starsEnabled: false,
    starMode: 'parallax',
    starSpeedX: 0.3,
    starSpeedY: 0,
    starSpeedXAutoEnabled: false,
    starSpeedXMin: -3,
    starSpeedXMax: 3,
    starSpeedXSpeed: 1.0,
    starSpeedXAutoTime: 0,
    starSpeedYAutoEnabled: false,
    starSpeedYMin: -3,
    starSpeedYMax: 3,
    starSpeedYSpeed: 1.0,
    starSpeedYAutoTime: 0,
    starColor: '#ffffff',
    starContrast: 100,
    starSize: 1.0,
    starCount: 200,
    tunnelSpeed: 2.0,
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
    metallicEnabled: false,
    metallicShininess: 0.5,
    metallicStrokes: false,
    morphEnabled: false,
    morphTarget: 'pyramid',
    morphSpeed: 0.5,
    morphStay: 0,
    objectCount: 1,
    obj1Scale: 1.0,
    obj2Scale: 1.0,
    objectDistance: 0.5,
    objDistAutoEnabled: false,
    objDistMin: 0.1,
    objDistMax: 1.0,
    objDistSpeed: 1.0,
    objDistAutoTime: 0,
    trailEnabled: false,
    trailAmount: 0.5,
    synthStripesEnabled: false,
    synthStripesColor: '#00ffff',
    synthStripesThickness: 4,
    synthStripesCount: 6,
    synthStripesSpeed: 2.0,
    synthStripesStartY: 0.5,
    formScaleX: 1.0,
    formScaleXAutoEnabled: false,
    formScaleXMin: 0.5,
    formScaleXMax: 2.0,
    formScaleXSpeed: 1.0,
    formScaleXAutoTime: 0,
    formScaleY: 1.0,
    formScaleYAutoEnabled: false,
    formScaleYMin: 0.5,
    formScaleYMax: 2.0,
    formScaleYSpeed: 1.0,
    formScaleYAutoTime: 0,
    formScaleZ: 1.0,
    formScaleZAutoEnabled: false,
    formScaleZMin: 0.5,
    formScaleZMax: 2.0,
    formScaleZSpeed: 1.0,
    formScaleZAutoTime: 0,
    formExplode: 0,
    formExplodeAutoEnabled: false,
    formExplodeMin: 0,
    formExplodeMax: 0.5,
    formExplodeSpeed: 1.0,
    formExplodeAutoTime: 0,
};

let dz = focalLength;

// Morph animation state
let morphTime = 0;
let morphHoldTimer = 0;
let morphNextHoldAt = 1;

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
const TUNNEL_MAX_Z = 20;
const TUNNEL_MIN_Z = 0.15;

function initStars() {
    stars.length = 0;
    for (let i = 0; i < config.starCount; i++) {
        stars.push({
            x: Math.random() * game.width,
            y: Math.random() * game.height,
            z: Math.random(),
            tx: (Math.random() - 0.5) * 2,
            ty: (Math.random() - 0.5) * 2,
            tz: Math.random() * TUNNEL_MAX_Z + TUNNEL_MIN_Z,
            size: Math.random() * 2 + 0.5
        });
    }
}

function tunnelVanishPoint() {
    return {
        cx: game.width / 2 + config.starSpeedX * game.width * 0.1,
        cy: game.height / 2 + config.starSpeedY * game.height * 0.1
    };
}

function tunnelScreenPos(star, cx, cy) {
    const sx = cx + star.tx * game.width * 0.5 / star.tz;
    const sy = cy + star.ty * game.height * 0.5 / star.tz;
    const sz = star.size * config.starSize * 2 / star.tz;
    return { sx, sy, sz };
}

// --- Parallax mode ---

function eraseParallaxStars(bgColor) {
    if (!config.trailEnabled) return;
    ctx.fillStyle = bgColor || BACKGROUND;
    for (const star of stars) {
        const size = star.size * (0.5 + star.z * 1.5) * config.starSize + 1;
        ctx.fillRect(star.x - size, star.y - size, size * 2, size * 2);
    }
}

function drawParallaxStars(color) {
    const effectiveColor = color || config.starColor;
    const hex = effectiveColor.replace('#', '');
    const baseR = parseInt(hex.substring(0, 2), 16);
    const baseG = parseInt(hex.substring(2, 4), 16);
    const baseB = parseInt(hex.substring(4, 6), 16);

    const cf = config.starContrast / 100;

    for (const star of stars) {
        const brightness = 1 - cf * (1 - star.z);
        const r = Math.floor(baseR * brightness);
        const g = Math.floor(baseG * brightness);
        const b = Math.floor(baseB * brightness);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        const size = star.size * (0.5 + star.z * 1.5) * config.starSize;

        ctx.beginPath();
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function updateParallaxStars(dt) {
    for (const star of stars) {
        const depth = 50 + star.z * 150;
        star.x -= depth * config.starSpeedX * dt;
        star.y -= depth * config.starSpeedY * dt;

        if (star.x < -10) { star.x = game.width + 10; star.y = Math.random() * game.height; }
        else if (star.x > game.width + 10) { star.x = -10; star.y = Math.random() * game.height; }
        if (star.y < -10) { star.y = game.height + 10; star.x = Math.random() * game.width; }
        else if (star.y > game.height + 10) { star.y = -10; star.x = Math.random() * game.width; }
    }
}

// --- Tunnel mode ---

function eraseTunnelStars(bgColor) {
    if (!config.trailEnabled) return;
    ctx.fillStyle = bgColor || BACKGROUND;
    const { cx, cy } = tunnelVanishPoint();
    for (const star of stars) {
        const { sx, sy, sz } = tunnelScreenPos(star, cx, cy);
        const size = sz + 1;
        ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
    }
}

function drawTunnelStars(color) {
    const effectiveColor = color || config.starColor;
    const hex = effectiveColor.replace('#', '');
    const baseR = parseInt(hex.substring(0, 2), 16);
    const baseG = parseInt(hex.substring(2, 4), 16);
    const baseB = parseInt(hex.substring(4, 6), 16);

    const cf = config.starContrast / 100;
    const { cx, cy } = tunnelVanishPoint();

    for (const star of stars) {
        const { sx, sy, sz } = tunnelScreenPos(star, cx, cy);

        if (sx < -30 || sx > game.width + 30 || sy < -30 || sy > game.height + 30) continue;

        const brightness = 1 - cf * (star.tz / TUNNEL_MAX_Z);
        const r = Math.floor(baseR * Math.min(brightness, 1));
        const g = Math.floor(baseG * Math.min(brightness, 1));
        const b = Math.floor(baseB * Math.min(brightness, 1));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(sz, 0.2), 0, Math.PI * 2);
        ctx.fill();
    }
}

function respawnTunnelStar(star) {
    star.tx = (Math.random() - 0.5) * 2;
    star.ty = (Math.random() - 0.5) * 2;
    star.tz = TUNNEL_MAX_Z * (0.8 + Math.random() * 0.2);
    star.size = Math.random() * 2 + 0.5;
}

function updateTunnelStars(dt) {
    if (Math.abs(config.tunnelSpeed) < 0.001) return;

    const { cx, cy } = tunnelVanishPoint();

    for (const star of stars) {
        star.tz -= config.tunnelSpeed * dt;

        if (star.tz <= TUNNEL_MIN_Z) {
            respawnTunnelStar(star);
            continue;
        }

        const { sx, sy } = tunnelScreenPos(star, cx, cy);
        if (sx < -100 || sx > game.width + 100 || sy < -100 || sy > game.height + 100) {
            respawnTunnelStar(star);
        }
    }
}

// --- Star dispatch ---

function eraseStars(bgColor) {
    if (!config.starsEnabled) return;
    if (config.starMode === 'tunnel') eraseTunnelStars(bgColor);
    else eraseParallaxStars(bgColor);
}

function drawStars(color) {
    if (!config.starsEnabled) return;
    if (config.starMode === 'tunnel') drawTunnelStars(color);
    else drawParallaxStars(color);
}

function updateStars(dt) {
    if (!config.starsEnabled) return;
    if (config.starMode === 'tunnel') updateTunnelStars(dt);
    else updateParallaxStars(dt);
}

// Initialize stars on load
initStars();

// Synthwave stripes system
const SYNTH_STRIPE_MAX_Z = 15;
const SYNTH_STRIPE_MIN_Z = 0.3;
const synthStripes = [];

function initSynthStripes() {
    synthStripes.length = 0;
    for (let i = 0; i < config.synthStripesCount; i++) {
        synthStripes.push({
            z: SYNTH_STRIPE_MIN_Z + (SYNTH_STRIPE_MAX_Z - SYNTH_STRIPE_MIN_Z) * (i / config.synthStripesCount)
        });
    }
}

function updateSynthStripes(dt) {
    if (!config.synthStripesEnabled) return;
    for (const stripe of synthStripes) {
        stripe.z -= config.synthStripesSpeed * dt;
        if (stripe.z <= SYNTH_STRIPE_MIN_Z) {
            stripe.z += (SYNTH_STRIPE_MAX_Z - SYNTH_STRIPE_MIN_Z);
        }
    }
}

function drawSynthStripes() {
    if (!config.synthStripesEnabled) return;

    const horizonY = config.synthStripesStartY * game.height;
    const groundH = game.height - horizonY;
    const perspScale = groundH * SYNTH_STRIPE_MIN_Z;

    ctx.strokeStyle = config.synthStripesColor;
    ctx.lineCap = 'butt';
    const zRange = SYNTH_STRIPE_MAX_Z - SYNTH_STRIPE_MIN_Z;

    for (const stripe of synthStripes) {
        const screenY = horizonY + perspScale / stripe.z;
        if (screenY >= horizonY && screenY <= game.height + config.synthStripesThickness) {
            const closeness = 1 - (stripe.z - SYNTH_STRIPE_MIN_Z) / zRange;
            const t = closeness * closeness * closeness * closeness;
            ctx.lineWidth = 0.5 + config.synthStripesThickness * t;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(game.width, screenY);
            ctx.stroke();
        }
    }
}

initSynthStripes();

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
const zoomMinGroup = document.getElementById('zoomMinGroup');
const zoomMaxGroup = document.getElementById('zoomMaxGroup');
const zoomSpeedGroup = document.getElementById('zoomSpeedGroup');
const fovSlider = document.getElementById('fovSlider');
const offsetYSlider = document.getElementById('offsetYSlider');
const offsetYAutoToggle = document.getElementById('offsetYAutoToggle');
const offsetYMinSlider = document.getElementById('offsetYMinSlider');
const offsetYMaxSlider = document.getElementById('offsetYMaxSlider');
const offsetYSpeedSlider = document.getElementById('offsetYSpeedSlider');
const offsetYMinGroup = document.getElementById('offsetYMinGroup');
const offsetYMaxGroup = document.getElementById('offsetYMaxGroup');
const offsetYSpeedGroup = document.getElementById('offsetYSpeedGroup');
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
const gradientModeGroup = document.getElementById('gradientModeGroup');
const gradientModeBtns = document.querySelectorAll('.grad-mode-btn');
const gradientDirectionGroup = document.getElementById('gradientDirectionGroup');
const gradientDirectionSelect = document.getElementById('gradientDirectionSelect');
const gradientVibrancySlider = document.getElementById('gradientVibrancySlider');
const gradientVibrancyValue = document.getElementById('gradientVibrancyValue');
const gradientVibrancyGroup = document.getElementById('gradientVibrancyGroup');
const strokeColorPicker = document.getElementById('strokeColorPicker');
const contrastSlider = document.getElementById('contrastSlider');
const contrastGroup = document.getElementById('contrastGroup');
const metallicToggle = document.getElementById('metallicToggle');
const metallicGroup = document.getElementById('metallicGroup');
const metallicShininessSlider = document.getElementById('metallicShininessSlider');
const metallicShininessValue = document.getElementById('metallicShininessValue');
const metallicShininessGroup = document.getElementById('metallicShininessGroup');
const metallicStrokesToggle = document.getElementById('metallicStrokesToggle');
const metallicStrokesGroup = document.getElementById('metallicStrokesGroup');
const masterHueSlider = document.getElementById('masterHueSlider');
const masterHueValue = document.getElementById('masterHueValue');
const masterHueAutoToggle = document.getElementById('masterHueAutoToggle');
const masterHueMinGroup = document.getElementById('masterHueMinGroup');
const masterHueMinSlider = document.getElementById('masterHueMinSlider');
const masterHueMinInput = document.getElementById('masterHueMinInput');
const masterHueMaxGroup = document.getElementById('masterHueMaxGroup');
const masterHueMaxSlider = document.getElementById('masterHueMaxSlider');
const masterHueMaxInput = document.getElementById('masterHueMaxInput');
const masterHueSpeedGroup = document.getElementById('masterHueSpeedGroup');
const masterHueSpeedSlider = document.getElementById('masterHueSpeedSlider');
const masterHueSpeedValue = document.getElementById('masterHueSpeedValue');
const masterSaturationSlider = document.getElementById('masterSaturationSlider');
const masterSaturationValue = document.getElementById('masterSaturationValue');
const masterBrightnessSlider = document.getElementById('masterBrightnessSlider');
const masterBrightnessValue = document.getElementById('masterBrightnessValue');
const masterContrastSlider = document.getElementById('masterContrastSlider');
const masterContrastValue = document.getElementById('masterContrastValue');
const backgroundPicker = document.getElementById('backgroundPicker');
const starsToggle = document.getElementById('starsToggle');
const starModeToggle = document.getElementById('starModeToggle');
const tunnelSpeedGroup = document.getElementById('tunnelSpeedGroup');
const tunnelSpeedSlider = document.getElementById('tunnelSpeedSlider');
const tunnelSpeedValue = document.getElementById('tunnelSpeedValue');
const starJoystick = document.getElementById('starJoystick');
const starJoystickDot = document.getElementById('starJoystickDot');
const starSpeedDisplay = document.getElementById('starSpeedDisplay');
const starSpeedXAutoToggle = document.getElementById('starSpeedXAutoToggle');
const starSpeedXMinGroup = document.getElementById('starSpeedXMinGroup');
const starSpeedXMinSlider = document.getElementById('starSpeedXMinSlider');
const starSpeedXMinInput = document.getElementById('starSpeedXMinInput');
const starSpeedXMaxGroup = document.getElementById('starSpeedXMaxGroup');
const starSpeedXMaxSlider = document.getElementById('starSpeedXMaxSlider');
const starSpeedXMaxInput = document.getElementById('starSpeedXMaxInput');
const starSpeedXSpeedGroup = document.getElementById('starSpeedXSpeedGroup');
const starSpeedXSpeedSlider = document.getElementById('starSpeedXSpeedSlider');
const starSpeedXSpeedValue = document.getElementById('starSpeedXSpeedValue');
const starSpeedYAutoToggle = document.getElementById('starSpeedYAutoToggle');
const starSpeedYMinGroup = document.getElementById('starSpeedYMinGroup');
const starSpeedYMinSlider = document.getElementById('starSpeedYMinSlider');
const starSpeedYMinInput = document.getElementById('starSpeedYMinInput');
const starSpeedYMaxGroup = document.getElementById('starSpeedYMaxGroup');
const starSpeedYMaxSlider = document.getElementById('starSpeedYMaxSlider');
const starSpeedYMaxInput = document.getElementById('starSpeedYMaxInput');
const starSpeedYSpeedGroup = document.getElementById('starSpeedYSpeedGroup');
const starSpeedYSpeedSlider = document.getElementById('starSpeedYSpeedSlider');
const starSpeedYSpeedValue = document.getElementById('starSpeedYSpeedValue');
const starColorPicker = document.getElementById('starColorPicker');
const starContrastSlider = document.getElementById('starContrastSlider');
const starContrastValue = document.getElementById('starContrastValue');
const starSizeSlider = document.getElementById('starSizeSlider');
const starSizeValue = document.getElementById('starSizeValue');
const starCountSlider = document.getElementById('starCountSlider');
const starCountValue = document.getElementById('starCountValue');
const synthStripesToggle = document.getElementById('synthStripesToggle');
const synthStripesColorGroup = document.getElementById('synthStripesColorGroup');
const synthStripesColorPicker = document.getElementById('synthStripesColorPicker');
const synthStripesThicknessGroup = document.getElementById('synthStripesThicknessGroup');
const synthStripesThicknessSlider = document.getElementById('synthStripesThicknessSlider');
const synthStripesThicknessValueEl = document.getElementById('synthStripesThicknessValue');
const synthStripesCountGroup = document.getElementById('synthStripesCountGroup');
const synthStripesCountSlider = document.getElementById('synthStripesCountSlider');
const synthStripesCountValueEl = document.getElementById('synthStripesCountValue');
const synthStripesSpeedGroup = document.getElementById('synthStripesSpeedGroup');
const synthStripesSpeedSlider = document.getElementById('synthStripesSpeedSlider');
const synthStripesSpeedValueEl = document.getElementById('synthStripesSpeedValue');
const synthStripesStartYGroup = document.getElementById('synthStripesStartYGroup');
const synthStripesStartYSlider = document.getElementById('synthStripesStartYSlider');
const synthStripesStartYValueEl = document.getElementById('synthStripesStartYValue');

const formScaleXSlider = document.getElementById('formScaleXSlider');
const formScaleXValue = document.getElementById('formScaleXValue');
const formScaleXAutoToggle = document.getElementById('formScaleXAutoToggle');
const formScaleXMinSlider = document.getElementById('formScaleXMinSlider');
const formScaleXMinInput = document.getElementById('formScaleXMinInput');
const formScaleXMaxSlider = document.getElementById('formScaleXMaxSlider');
const formScaleXMaxInput = document.getElementById('formScaleXMaxInput');
const formScaleXSpeedSlider = document.getElementById('formScaleXSpeedSlider');
const formScaleXSpeedValue = document.getElementById('formScaleXSpeedValue');
const formScaleXMinGroup = document.getElementById('formScaleXMinGroup');
const formScaleXMaxGroup = document.getElementById('formScaleXMaxGroup');
const formScaleXSpeedGroup = document.getElementById('formScaleXSpeedGroup');

const formScaleYSlider = document.getElementById('formScaleYSlider');
const formScaleYValue = document.getElementById('formScaleYValue');
const formScaleYAutoToggle = document.getElementById('formScaleYAutoToggle');
const formScaleYMinSlider = document.getElementById('formScaleYMinSlider');
const formScaleYMinInput = document.getElementById('formScaleYMinInput');
const formScaleYMaxSlider = document.getElementById('formScaleYMaxSlider');
const formScaleYMaxInput = document.getElementById('formScaleYMaxInput');
const formScaleYSpeedSlider = document.getElementById('formScaleYSpeedSlider');
const formScaleYSpeedValue = document.getElementById('formScaleYSpeedValue');
const formScaleYMinGroup = document.getElementById('formScaleYMinGroup');
const formScaleYMaxGroup = document.getElementById('formScaleYMaxGroup');
const formScaleYSpeedGroup = document.getElementById('formScaleYSpeedGroup');

const formScaleZSlider = document.getElementById('formScaleZSlider');
const formScaleZValue = document.getElementById('formScaleZValue');
const formScaleZAutoToggle = document.getElementById('formScaleZAutoToggle');
const formScaleZMinSlider = document.getElementById('formScaleZMinSlider');
const formScaleZMinInput = document.getElementById('formScaleZMinInput');
const formScaleZMaxSlider = document.getElementById('formScaleZMaxSlider');
const formScaleZMaxInput = document.getElementById('formScaleZMaxInput');
const formScaleZSpeedSlider = document.getElementById('formScaleZSpeedSlider');
const formScaleZSpeedValue = document.getElementById('formScaleZSpeedValue');
const formScaleZMinGroup = document.getElementById('formScaleZMinGroup');
const formScaleZMaxGroup = document.getElementById('formScaleZMaxGroup');
const formScaleZSpeedGroup = document.getElementById('formScaleZSpeedGroup');

const formExplodeSlider = document.getElementById('formExplodeSlider');
const formExplodeValue = document.getElementById('formExplodeValue');
const formExplodeAutoToggle = document.getElementById('formExplodeAutoToggle');
const formExplodeMinSlider = document.getElementById('formExplodeMinSlider');
const formExplodeMinInput = document.getElementById('formExplodeMinInput');
const formExplodeMaxSlider = document.getElementById('formExplodeMaxSlider');
const formExplodeMaxInput = document.getElementById('formExplodeMaxInput');
const formExplodeSpeedSlider = document.getElementById('formExplodeSpeedSlider');
const formExplodeSpeedValue = document.getElementById('formExplodeSpeedValue');
const formExplodeMinGroup = document.getElementById('formExplodeMinGroup');
const formExplodeMaxGroup = document.getElementById('formExplodeMaxGroup');
const formExplodeSpeedGroup = document.getElementById('formExplodeSpeedGroup');

const modelPresetSelect = document.getElementById('modelPreset');
const morphToggle = document.getElementById('morphToggle');
const morphTargetSelect = document.getElementById('morphTarget');
const morphTargetGroup = document.getElementById('morphTargetGroup');
const morphSpeedSlider = document.getElementById('morphSpeedSlider');
const morphSpeedValue = document.getElementById('morphSpeedValue');
const morphStaySlider = document.getElementById('morphStaySlider');
const morphStayValue = document.getElementById('morphStayValue');
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
    if (config.zoomAutoEnabled) {
        config.zoomAutoEnabled = false;
        zoomAutoToggle.textContent = 'Off';
        zoomMinGroup.style.display = 'none';
        zoomMaxGroup.style.display = 'none';
        zoomSpeedGroup.style.display = 'none';
    }
});

// Zoom automation toggle
zoomAutoToggle.addEventListener('click', () => {
    config.zoomAutoEnabled = !config.zoomAutoEnabled;
    zoomAutoToggle.textContent = config.zoomAutoEnabled ? 'On' : 'Off';
    const show = config.zoomAutoEnabled ? '' : 'none';
    zoomMinGroup.style.display = show;
    zoomMaxGroup.style.display = show;
    zoomSpeedGroup.style.display = show;
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
        offsetYMinGroup.style.display = 'none';
        offsetYMaxGroup.style.display = 'none';
        offsetYSpeedGroup.style.display = 'none';
    }
});

// Y Position automation toggle
offsetYAutoToggle.addEventListener('click', () => {
    config.offsetYAutoEnabled = !config.offsetYAutoEnabled;
    offsetYAutoToggle.textContent = config.offsetYAutoEnabled ? 'On' : 'Off';
    const show = config.offsetYAutoEnabled ? '' : 'none';
    offsetYMinGroup.style.display = show;
    offsetYMaxGroup.style.display = show;
    offsetYSpeedGroup.style.display = show;
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
    contrastGroup.style.display = config.solidMode ? '' : 'none';
    metallicGroup.style.display = config.solidMode ? '' : 'none';
    if (!config.solidMode) {
        metallicShininessGroup.style.display = 'none';
        metallicStrokesGroup.style.display = 'none';
    } else if (config.metallicEnabled) {
        metallicShininessGroup.style.display = '';
        metallicStrokesGroup.style.display = '';
    }
});

metallicToggle.addEventListener('click', () => {
    config.metallicEnabled = !config.metallicEnabled;
    metallicToggle.textContent = config.metallicEnabled ? 'On' : 'Off';
    metallicToggle.classList.toggle('active', config.metallicEnabled);
    metallicShininessGroup.style.display = config.metallicEnabled ? '' : 'none';
    metallicStrokesGroup.style.display = config.metallicEnabled ? '' : 'none';
    if (!config.metallicEnabled) config.metallicStrokes = false;
    metallicStrokesToggle.textContent = config.metallicStrokes ? 'On' : 'Off';
    metallicStrokesToggle.classList.toggle('active', config.metallicStrokes);
});

metallicStrokesToggle.addEventListener('click', () => {
    config.metallicStrokes = !config.metallicStrokes;
    metallicStrokesToggle.textContent = config.metallicStrokes ? 'On' : 'Off';
    metallicStrokesToggle.classList.toggle('active', config.metallicStrokes);
});

metallicShininessSlider.addEventListener('input', (e) => {
    config.metallicShininess = parseFloat(e.target.value) / 100;
    metallicShininessValue.textContent = Math.round(config.metallicShininess * 100) + '%';
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
    const show = config.gradientEnabled ? '' : 'none';
    gradientModeGroup.style.display = show;
    gradientVibrancyGroup.style.display = show;
    gradientDirectionGroup.style.display = config.gradientEnabled && config.gradientMode !== 'face' ? '' : 'none';
});

gradientModeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.grad-mode-btn');
    if (!btn) return;
    config.gradientMode = btn.dataset.mode;
    gradientModeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === config.gradientMode));
    gradientDirectionGroup.style.display = config.gradientMode !== 'face' ? '' : 'none';
});

gradientDirectionSelect.addEventListener('change', (e) => {
    config.gradientDirection = e.target.value;
});

// Gradient vibrancy
gradientVibrancySlider.addEventListener('input', (e) => {
    config.gradientVibrancy = parseFloat(e.target.value);
    gradientVibrancyValue.textContent = config.gradientVibrancy.toFixed(0) + '%';
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

// Master color controls
masterHueSlider.addEventListener('input', (e) => {
    config.masterHue = parseFloat(e.target.value);
    masterHueValue.textContent = config.masterHue.toFixed(0) + '°';
    if (config.masterHueAutoEnabled) {
        config.masterHueAutoEnabled = false;
        masterHueAutoToggle.textContent = 'Off';
        setMasterHueAutoVisibility(false);
    }
});

function setMasterHueAutoVisibility(show) {
    masterHueMinGroup.style.display = show ? '' : 'none';
    masterHueMaxGroup.style.display = show ? '' : 'none';
    masterHueSpeedGroup.style.display = show ? '' : 'none';
}

masterHueAutoToggle.addEventListener('click', () => {
    config.masterHueAutoEnabled = !config.masterHueAutoEnabled;
    masterHueAutoToggle.textContent = config.masterHueAutoEnabled ? 'On' : 'Off';
    setMasterHueAutoVisibility(config.masterHueAutoEnabled);
    if (config.masterHueAutoEnabled) config.masterHueAutoTime = 0;
});

function updateMasterHueMin(val) {
    config.masterHueMin = val;
    if (config.masterHueMin > config.masterHueMax) config.masterHueMin = config.masterHueMax;
    masterHueMinSlider.value = config.masterHueMin;
    masterHueMinInput.value = config.masterHueMin.toFixed(0);
}
masterHueMinSlider.addEventListener('input', (e) => updateMasterHueMin(parseFloat(e.target.value)));
masterHueMinInput.addEventListener('input', (e) => updateMasterHueMin(parseFloat(e.target.value) || -180));

function updateMasterHueMax(val) {
    config.masterHueMax = val;
    if (config.masterHueMax < config.masterHueMin) config.masterHueMax = config.masterHueMin;
    masterHueMaxSlider.value = config.masterHueMax;
    masterHueMaxInput.value = config.masterHueMax.toFixed(0);
}
masterHueMaxSlider.addEventListener('input', (e) => updateMasterHueMax(parseFloat(e.target.value)));
masterHueMaxInput.addEventListener('input', (e) => updateMasterHueMax(parseFloat(e.target.value) || 180));

masterHueSpeedSlider.addEventListener('input', (e) => {
    config.masterHueSpeed = parseFloat(e.target.value);
    masterHueSpeedValue.textContent = config.masterHueSpeed.toFixed(1) + 'x';
});

masterSaturationSlider.addEventListener('input', (e) => {
    config.masterSaturation = parseFloat(e.target.value);
    masterSaturationValue.textContent = config.masterSaturation.toFixed(0) + '%';
});
masterBrightnessSlider.addEventListener('input', (e) => {
    config.masterBrightness = parseFloat(e.target.value);
    masterBrightnessValue.textContent = config.masterBrightness.toFixed(0) + '%';
});
masterContrastSlider.addEventListener('input', (e) => {
    config.masterContrast = parseFloat(e.target.value);
    masterContrastValue.textContent = config.masterContrast.toFixed(0) + '%';
});

// Background color control
backgroundPicker.addEventListener('input', (e) => {
    BACKGROUND = e.target.value;
});

// Trail controls
const trailToggle = document.getElementById('trailToggle');
const trailAmountSlider = document.getElementById('trailAmountSlider');
const trailAmountValue = document.getElementById('trailAmountValue');
const trailAmountGroup = document.getElementById('trailAmountGroup');

trailToggle.addEventListener('click', () => {
    config.trailEnabled = !config.trailEnabled;
    trailToggle.textContent = config.trailEnabled ? 'On' : 'Off';
    trailAmountGroup.style.display = config.trailEnabled ? '' : 'none';
});

trailAmountSlider.addEventListener('input', (e) => {
    config.trailAmount = parseFloat(e.target.value) / 100;
    trailAmountValue.textContent = e.target.value + '%';
});

// Stars toggle
starsToggle.addEventListener('click', () => {
    config.starsEnabled = !config.starsEnabled;
    starsToggle.textContent = config.starsEnabled ? 'On' : 'Off';
});

// Star mode toggle
starModeToggle.addEventListener('click', () => {
    config.starMode = config.starMode === 'parallax' ? 'tunnel' : 'parallax';
    starModeToggle.textContent = config.starMode === 'parallax' ? 'Parallax' : 'Tunnel';
    tunnelSpeedGroup.style.display = config.starMode === 'tunnel' ? '' : 'none';
    initStars();
});

// Tunnel speed slider
tunnelSpeedSlider.addEventListener('input', (e) => {
    config.tunnelSpeed = parseFloat(e.target.value);
    tunnelSpeedValue.textContent = config.tunnelSpeed.toFixed(1) + 'x';
});

// Star direction joystick
function updateStarJoystick(normX, normY, fromAuto) {
    const maxSpeed = 5;
    if (!fromAuto) {
        if (config.starSpeedXAutoEnabled) {
            config.starSpeedXAutoEnabled = false;
            starSpeedXAutoToggle.textContent = 'Off';
            setStarSpeedXAutoVisibility(false);
        }
        if (config.starSpeedYAutoEnabled) {
            config.starSpeedYAutoEnabled = false;
            starSpeedYAutoToggle.textContent = 'Off';
            setStarSpeedYAutoVisibility(false);
        }
    }
    config.starSpeedX = normX * maxSpeed;
    config.starSpeedY = normY * maxSpeed;
    starSpeedDisplay.textContent = `${config.starSpeedX.toFixed(1)}, ${config.starSpeedY.toFixed(1)}`;
    const pctX = (normX + 1) / 2 * 100;
    const pctY = (normY + 1) / 2 * 100;
    starJoystickDot.style.left = pctX + '%';
    starJoystickDot.style.top = pctY + '%';
}

function joystickFromEvent(e) {
    const rect = starJoystick.getBoundingClientRect();
    const x = ((e.clientX ?? e.touches[0].clientX) - rect.left) / rect.width;
    const y = ((e.clientY ?? e.touches[0].clientY) - rect.top) / rect.height;
    const normX = Math.max(-1, Math.min(1, x * 2 - 1));
    const normY = Math.max(-1, Math.min(1, y * 2 - 1));
    updateStarJoystick(normX, normY);
}

let joystickDragging = false;

starJoystick.addEventListener('mousedown', (e) => {
    joystickDragging = true;
    joystickFromEvent(e);
});
window.addEventListener('mousemove', (e) => {
    if (joystickDragging) joystickFromEvent(e);
});
window.addEventListener('mouseup', () => { joystickDragging = false; });

starJoystick.addEventListener('touchstart', (e) => {
    joystickDragging = true;
    joystickFromEvent(e);
    e.preventDefault();
}, { passive: false });
window.addEventListener('touchmove', (e) => {
    if (joystickDragging) joystickFromEvent(e);
}, { passive: false });
window.addEventListener('touchend', () => { joystickDragging = false; });

starJoystick.addEventListener('dblclick', () => {
    updateStarJoystick(0, 0);
});

// Star speed X automation
function setStarSpeedXAutoVisibility(show) {
    starSpeedXMinGroup.style.display = show ? '' : 'none';
    starSpeedXMaxGroup.style.display = show ? '' : 'none';
    starSpeedXSpeedGroup.style.display = show ? '' : 'none';
}

starSpeedXAutoToggle.addEventListener('click', () => {
    config.starSpeedXAutoEnabled = !config.starSpeedXAutoEnabled;
    starSpeedXAutoToggle.textContent = config.starSpeedXAutoEnabled ? 'On' : 'Off';
    setStarSpeedXAutoVisibility(config.starSpeedXAutoEnabled);
    if (config.starSpeedXAutoEnabled) config.starSpeedXAutoTime = 0;
});

function updateStarSpeedXMin(val) {
    config.starSpeedXMin = val;
    if (config.starSpeedXMin > config.starSpeedXMax) config.starSpeedXMin = config.starSpeedXMax;
    starSpeedXMinSlider.value = config.starSpeedXMin;
    starSpeedXMinInput.value = config.starSpeedXMin.toFixed(1);
}
starSpeedXMinSlider.addEventListener('input', (e) => updateStarSpeedXMin(parseFloat(e.target.value)));
starSpeedXMinInput.addEventListener('input', (e) => updateStarSpeedXMin(parseFloat(e.target.value) || 0));

function updateStarSpeedXMax(val) {
    config.starSpeedXMax = val;
    if (config.starSpeedXMax < config.starSpeedXMin) config.starSpeedXMax = config.starSpeedXMin;
    starSpeedXMaxSlider.value = config.starSpeedXMax;
    starSpeedXMaxInput.value = config.starSpeedXMax.toFixed(1);
}
starSpeedXMaxSlider.addEventListener('input', (e) => updateStarSpeedXMax(parseFloat(e.target.value)));
starSpeedXMaxInput.addEventListener('input', (e) => updateStarSpeedXMax(parseFloat(e.target.value) || 0));

starSpeedXSpeedSlider.addEventListener('input', (e) => {
    config.starSpeedXSpeed = parseFloat(e.target.value);
    starSpeedXSpeedValue.textContent = config.starSpeedXSpeed.toFixed(1) + 'x';
});

// Star speed Y automation
function setStarSpeedYAutoVisibility(show) {
    starSpeedYMinGroup.style.display = show ? '' : 'none';
    starSpeedYMaxGroup.style.display = show ? '' : 'none';
    starSpeedYSpeedGroup.style.display = show ? '' : 'none';
}

starSpeedYAutoToggle.addEventListener('click', () => {
    config.starSpeedYAutoEnabled = !config.starSpeedYAutoEnabled;
    starSpeedYAutoToggle.textContent = config.starSpeedYAutoEnabled ? 'On' : 'Off';
    setStarSpeedYAutoVisibility(config.starSpeedYAutoEnabled);
    if (config.starSpeedYAutoEnabled) config.starSpeedYAutoTime = 0;
});

function updateStarSpeedYMin(val) {
    config.starSpeedYMin = val;
    if (config.starSpeedYMin > config.starSpeedYMax) config.starSpeedYMin = config.starSpeedYMax;
    starSpeedYMinSlider.value = config.starSpeedYMin;
    starSpeedYMinInput.value = config.starSpeedYMin.toFixed(1);
}
starSpeedYMinSlider.addEventListener('input', (e) => updateStarSpeedYMin(parseFloat(e.target.value)));
starSpeedYMinInput.addEventListener('input', (e) => updateStarSpeedYMin(parseFloat(e.target.value) || 0));

function updateStarSpeedYMax(val) {
    config.starSpeedYMax = val;
    if (config.starSpeedYMax < config.starSpeedYMin) config.starSpeedYMax = config.starSpeedYMin;
    starSpeedYMaxSlider.value = config.starSpeedYMax;
    starSpeedYMaxInput.value = config.starSpeedYMax.toFixed(1);
}
starSpeedYMaxSlider.addEventListener('input', (e) => updateStarSpeedYMax(parseFloat(e.target.value)));
starSpeedYMaxInput.addEventListener('input', (e) => updateStarSpeedYMax(parseFloat(e.target.value) || 0));

starSpeedYSpeedSlider.addEventListener('input', (e) => {
    config.starSpeedYSpeed = parseFloat(e.target.value);
    starSpeedYSpeedValue.textContent = config.starSpeedYSpeed.toFixed(1) + 'x';
});

starColorPicker.addEventListener('input', (e) => {
    config.starColor = e.target.value;
});

starContrastSlider.addEventListener('input', (e) => {
    config.starContrast = parseFloat(e.target.value);
    starContrastValue.textContent = config.starContrast + '%';
});

starSizeSlider.addEventListener('input', (e) => {
    config.starSize = parseFloat(e.target.value);
    starSizeValue.textContent = config.starSize.toFixed(1) + 'x';
});

starCountSlider.addEventListener('input', (e) => {
    config.starCount = parseInt(e.target.value);
    starCountValue.textContent = config.starCount;
    initStars();
});

// Synthwave stripes controls
function setSynthStripesVisibility(show) {
    synthStripesColorGroup.style.display = show ? '' : 'none';
    synthStripesThicknessGroup.style.display = show ? '' : 'none';
    synthStripesCountGroup.style.display = show ? '' : 'none';
    synthStripesSpeedGroup.style.display = show ? '' : 'none';
    synthStripesStartYGroup.style.display = show ? '' : 'none';
}

synthStripesToggle.addEventListener('click', () => {
    config.synthStripesEnabled = !config.synthStripesEnabled;
    synthStripesToggle.textContent = config.synthStripesEnabled ? 'On' : 'Off';
    setSynthStripesVisibility(config.synthStripesEnabled);
});

synthStripesColorPicker.addEventListener('input', (e) => {
    config.synthStripesColor = e.target.value;
});

synthStripesThicknessSlider.addEventListener('input', (e) => {
    config.synthStripesThickness = parseFloat(e.target.value);
    synthStripesThicknessValueEl.textContent = config.synthStripesThickness.toFixed(1) + 'px';
});

synthStripesCountSlider.addEventListener('input', (e) => {
    config.synthStripesCount = parseInt(e.target.value);
    synthStripesCountValueEl.textContent = config.synthStripesCount;
    initSynthStripes();
});

synthStripesSpeedSlider.addEventListener('input', (e) => {
    config.synthStripesSpeed = parseFloat(e.target.value);
    synthStripesSpeedValueEl.textContent = config.synthStripesSpeed.toFixed(1) + 'x';
});

synthStripesStartYSlider.addEventListener('input', (e) => {
    config.synthStripesStartY = parseFloat(e.target.value) / 100;
    synthStripesStartYValueEl.textContent = e.target.value + '%';
});

// --- Form tab controls ---

function setupFormAutoParam(key, slider, valueEl, autoToggle, minSlider, minInput, maxSlider, maxInput, speedSlider, speedValueEl, minGroup, maxGroup, speedGroup, fmt) {
    slider.addEventListener('input', (e) => {
        config[key] = parseFloat(e.target.value);
        valueEl.textContent = fmt(config[key]);
        if (config[key + 'AutoEnabled']) {
            config[key + 'AutoEnabled'] = false;
            autoToggle.textContent = 'Off';
            minGroup.style.display = 'none';
            maxGroup.style.display = 'none';
            speedGroup.style.display = 'none';
        }
    });

    autoToggle.addEventListener('click', () => {
        config[key + 'AutoEnabled'] = !config[key + 'AutoEnabled'];
        autoToggle.textContent = config[key + 'AutoEnabled'] ? 'On' : 'Off';
        const show = config[key + 'AutoEnabled'] ? '' : 'none';
        minGroup.style.display = show;
        maxGroup.style.display = show;
        speedGroup.style.display = show;
        if (config[key + 'AutoEnabled']) config[key + 'AutoTime'] = 0;
    });

    function updateMin(val) {
        config[key + 'Min'] = val;
        if (config[key + 'Min'] > config[key + 'Max']) config[key + 'Min'] = config[key + 'Max'];
        minSlider.value = config[key + 'Min'];
        minInput.value = config[key + 'Min'].toFixed(2);
    }
    function updateMax(val) {
        config[key + 'Max'] = val;
        if (config[key + 'Max'] < config[key + 'Min']) config[key + 'Max'] = config[key + 'Min'];
        maxSlider.value = config[key + 'Max'];
        maxInput.value = config[key + 'Max'].toFixed(2);
    }

    minSlider.addEventListener('input', (e) => updateMin(parseFloat(e.target.value)));
    minInput.addEventListener('input', (e) => updateMin(parseFloat(e.target.value) || 0));
    maxSlider.addEventListener('input', (e) => updateMax(parseFloat(e.target.value)));
    maxInput.addEventListener('input', (e) => updateMax(parseFloat(e.target.value) || 0));

    speedSlider.addEventListener('input', (e) => {
        config[key + 'Speed'] = parseFloat(e.target.value);
        speedValueEl.textContent = config[key + 'Speed'].toFixed(1) + 'x';
    });
}

const fmtScale = v => v.toFixed(2);
const fmtExplode = v => v.toFixed(2);

setupFormAutoParam('formScaleX', formScaleXSlider, formScaleXValue, formScaleXAutoToggle,
    formScaleXMinSlider, formScaleXMinInput, formScaleXMaxSlider, formScaleXMaxInput,
    formScaleXSpeedSlider, formScaleXSpeedValue, formScaleXMinGroup, formScaleXMaxGroup, formScaleXSpeedGroup, fmtScale);

setupFormAutoParam('formScaleY', formScaleYSlider, formScaleYValue, formScaleYAutoToggle,
    formScaleYMinSlider, formScaleYMinInput, formScaleYMaxSlider, formScaleYMaxInput,
    formScaleYSpeedSlider, formScaleYSpeedValue, formScaleYMinGroup, formScaleYMaxGroup, formScaleYSpeedGroup, fmtScale);

setupFormAutoParam('formScaleZ', formScaleZSlider, formScaleZValue, formScaleZAutoToggle,
    formScaleZMinSlider, formScaleZMinInput, formScaleZMaxSlider, formScaleZMaxInput,
    formScaleZSpeedSlider, formScaleZSpeedValue, formScaleZMinGroup, formScaleZMaxGroup, formScaleZSpeedGroup, fmtScale);

setupFormAutoParam('formExplode', formExplodeSlider, formExplodeValue, formExplodeAutoToggle,
    formExplodeMinSlider, formExplodeMinInput, formExplodeMaxSlider, formExplodeMaxInput,
    formExplodeSpeedSlider, formExplodeSpeedValue, formExplodeMinGroup, formExplodeMaxGroup, formExplodeSpeedGroup, fmtExplode);

// Model preset selector
modelPresetSelect.addEventListener('change', (e) => {
    const selectedPreset = e.target.value;
    loadModel(selectedPreset);
});

// Morph controls
morphToggle.addEventListener('click', () => {
    config.morphEnabled = !config.morphEnabled;
    morphToggle.textContent = config.morphEnabled ? 'On' : 'Off';
    morphTargetGroup.style.display = config.morphEnabled ? '' : 'none';
    if (config.morphEnabled) {
        morphTime = 0;
        morphHoldTimer = 0;
        morphNextHoldAt = 1;
    }
});

morphTargetSelect.addEventListener('change', (e) => {
    config.morphTarget = e.target.value;
    morphTime = 0;
    morphHoldTimer = 0;
    morphNextHoldAt = 1;
});

morphSpeedSlider.addEventListener('input', (e) => {
    config.morphSpeed = parseFloat(e.target.value);
    morphSpeedValue.textContent = config.morphSpeed.toFixed(1) + 'x';
});

morphStaySlider.addEventListener('input', (e) => {
    config.morphStay = parseFloat(e.target.value);
    morphStayValue.textContent = config.morphStay.toFixed(1) + 's';
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
updateStarJoystick(config.starSpeedX / 5, config.starSpeedY / 5);
starColorPicker.value = config.starColor;
starCountValue.textContent = config.starCount;
starCountSlider.value = config.starCount;
colorPickers.forEach((p, i) => p.value = config.colors[i]);
updateColorCount(config.colorCount);
gradientToggle.textContent = config.gradientEnabled ? 'On' : 'Off';
gradientVibrancySlider.value = config.gradientVibrancy;
gradientVibrancyValue.textContent = config.gradientVibrancy.toFixed(0) + '%';
masterHueSlider.value = config.masterHue;
masterHueValue.textContent = config.masterHue.toFixed(0) + '°';
masterHueAutoToggle.textContent = config.masterHueAutoEnabled ? 'On' : 'Off';
setMasterHueAutoVisibility(config.masterHueAutoEnabled);
masterHueMinSlider.value = config.masterHueMin;
masterHueMinInput.value = config.masterHueMin.toFixed(0);
masterHueMaxSlider.value = config.masterHueMax;
masterHueMaxInput.value = config.masterHueMax.toFixed(0);
masterHueSpeedSlider.value = config.masterHueSpeed;
masterHueSpeedValue.textContent = config.masterHueSpeed.toFixed(1) + 'x';
masterSaturationSlider.value = config.masterSaturation;
masterSaturationValue.textContent = config.masterSaturation.toFixed(0) + '%';
masterBrightnessSlider.value = config.masterBrightness;
masterBrightnessValue.textContent = config.masterBrightness.toFixed(0) + '%';
masterContrastSlider.value = config.masterContrast;
masterContrastValue.textContent = config.masterContrast.toFixed(0) + '%';
strokeColorPicker.value = config.strokeColor;
backgroundPicker.value = BACKGROUND;
solidToggle.textContent = 'Wireframe';
starsToggle.textContent = 'Off';
starModeToggle.textContent = config.starMode === 'parallax' ? 'Parallax' : 'Tunnel';
tunnelSpeedGroup.style.display = config.starMode === 'tunnel' ? '' : 'none';
tunnelSpeedSlider.value = config.tunnelSpeed;
tunnelSpeedValue.textContent = config.tunnelSpeed.toFixed(1) + 'x';

// Mouse wheel zoom on canvas
game.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling

    if (config.zoomAutoEnabled) {
        config.zoomAutoEnabled = false;
        zoomAutoToggle.textContent = 'Off';
        zoomMinGroup.style.display = 'none';
        zoomMaxGroup.style.display = 'none';
        zoomSpeedGroup.style.display = 'none';
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
    config.speedX = 0;
    config.speedY = 0;
    config.speedZ = 0;
    config.angleX = 0;
    config.angleY = 0;
    config.angleZ = 0;
    config.zoom = 0.5;
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
    config.gradientMode = 'face';
    config.gradientDirection = 'tb';
    config.gradientVibrancy = 0;
    config.masterHue = 0;
    config.masterHueAutoEnabled = false;
    config.masterHueMin = -180;
    config.masterHueMax = 180;
    config.masterHueSpeed = 1.0;
    config.masterHueAutoTime = 0;
    config.masterSaturation = 100;
    config.masterBrightness = 100;
    config.masterContrast = 100;
    config.strokeColor = '#000000';
    config.contrast = 70;
    config.starsEnabled = false;
    config.starMode = 'parallax';
    config.starSpeedX = 0.3;
    config.starSpeedY = 0;
    config.starSpeedXAutoEnabled = false;
    config.starSpeedXMin = -3;
    config.starSpeedXMax = 3;
    config.starSpeedXSpeed = 1.0;
    config.starSpeedXAutoTime = 0;
    config.starSpeedYAutoEnabled = false;
    config.starSpeedYMin = -3;
    config.starSpeedYMax = 3;
    config.starSpeedYSpeed = 1.0;
    config.starSpeedYAutoTime = 0;
    config.starColor = '#ffffff';
    config.starContrast = 100;
    config.starSize = 1.0;
    config.starCount = 200;
    config.tunnelSpeed = 2.0;
    config.zoomAutoEnabled = false;
    config.zoomMin = 0.8;
    config.zoomMax = 1.5;
    config.zoomSpeed = 1.0;
    config.zoomAutoTime = 0;
    config.zoomAutoDirection = 1;
    config.fov = 30;
    config.offsetY = 0;
    config.offsetYAutoEnabled = false;
    config.offsetYMin = -0.5;
    config.offsetYMax = 0.5;
    config.offsetYSpeed = 1.0;
    config.offsetYAutoTime = 0;
    config.morphEnabled = false;
    config.morphTarget = 'pyramid';
    config.morphSpeed = 0.5;
    config.morphStay = 0;
    config.objectCount = 1;
    config.obj1Scale = 1.0;
    config.obj2Scale = 1.0;
    config.objectDistance = 0.5;
    config.objDistAutoEnabled = false;
    config.objDistMin = 0.1;
    config.objDistMax = 1.0;
    config.objDistSpeed = 1.0;
    config.objDistAutoTime = 0;
    config.trailEnabled = false;
    config.trailAmount = 0.5;
    config.synthStripesEnabled = false;
    config.synthStripesColor = '#00ffff';
    config.synthStripesThickness = 4;
    config.synthStripesCount = 6;
    config.synthStripesSpeed = 2.0;
    config.synthStripesStartY = 0.5;
    config.formScaleX = 1.0;
    config.formScaleXAutoEnabled = false;
    config.formScaleXMin = 0.5;
    config.formScaleXMax = 2.0;
    config.formScaleXSpeed = 1.0;
    config.formScaleXAutoTime = 0;
    config.formScaleY = 1.0;
    config.formScaleYAutoEnabled = false;
    config.formScaleYMin = 0.5;
    config.formScaleYMax = 2.0;
    config.formScaleYSpeed = 1.0;
    config.formScaleYAutoTime = 0;
    config.formScaleZ = 1.0;
    config.formScaleZAutoEnabled = false;
    config.formScaleZMin = 0.5;
    config.formScaleZMax = 2.0;
    config.formScaleZSpeed = 1.0;
    config.formScaleZAutoTime = 0;
    config.formExplode = 0;
    config.formExplodeAutoEnabled = false;
    config.formExplodeMin = 0;
    config.formExplodeMax = 0.5;
    config.formExplodeSpeed = 1.0;
    config.formExplodeAutoTime = 0;
    morphTime = 0;
    morphHoldTimer = 0;
    morphNextHoldAt = 1;

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

    speedXSlider.value = 0;
    speedYSlider.value = 0;
    speedZSlider.value = 0;
    angleXSlider.value = 0;
    angleYSlider.value = 0;
    angleZSlider.value = 0;
    zoomSlider.value = 0.5;
    zoomAutoToggle.textContent = 'Off';
    zoomMinGroup.style.display = 'none';
    zoomMaxGroup.style.display = 'none';
    zoomSpeedGroup.style.display = 'none';
    zoomMinSlider.value = 0.8;
    zoomMaxSlider.value = 1.5;
    zoomSpeedSlider.value = 1.0;
    fovSlider.value = 30;
    offsetYSlider.value = 0;
    offsetYAutoToggle.textContent = 'Off';
    offsetYMinGroup.style.display = 'none';
    offsetYMaxGroup.style.display = 'none';
    offsetYSpeedGroup.style.display = 'none';
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
    gradientModeGroup.style.display = 'none';
    gradientModeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === 'face'));
    gradientDirectionGroup.style.display = 'none';
    gradientDirectionSelect.value = 'tb';
    gradientVibrancyGroup.style.display = 'none';
    gradientVibrancySlider.value = 0;
    gradientVibrancyValue.textContent = '0%';
    masterHueSlider.value = 0;
    masterHueValue.textContent = '0°';
    masterHueAutoToggle.textContent = 'Off';
    setMasterHueAutoVisibility(false);
    masterHueMinSlider.value = -180;
    masterHueMinInput.value = '-180';
    masterHueMaxSlider.value = 180;
    masterHueMaxInput.value = '180';
    masterHueSpeedSlider.value = 1.0;
    masterHueSpeedValue.textContent = '1.0x';
    masterSaturationSlider.value = 100;
    masterSaturationValue.textContent = '100%';
    masterBrightnessSlider.value = 100;
    masterBrightnessValue.textContent = '100%';
    masterContrastSlider.value = 100;
    masterContrastValue.textContent = '100%';
    strokeColorPicker.value = '#000000';
    contrastSlider.value = 70;
    config.metallicEnabled = false;
    config.metallicShininess = 0.5;
    config.metallicStrokes = false;
    metallicToggle.textContent = 'Off';
    metallicToggle.classList.remove('active');
    metallicStrokesToggle.textContent = 'Off';
    metallicStrokesToggle.classList.remove('active');
    metallicGroup.style.display = 'none';
    metallicShininessGroup.style.display = 'none';
    metallicStrokesGroup.style.display = 'none';
    metallicShininessSlider.value = 50;
    metallicShininessValue.textContent = '50%';
    backgroundPicker.value = '#000000';
    BACKGROUND = '#000000';
    solidToggle.textContent = 'Wireframe';
    contrastGroup.style.display = 'none';
    trailToggle.textContent = 'Off';
    trailAmountSlider.value = 50;
    trailAmountValue.textContent = '50%';
    trailAmountGroup.style.display = 'none';
    starsToggle.textContent = 'Off';
    starModeToggle.textContent = 'Parallax';
    tunnelSpeedGroup.style.display = 'none';
    tunnelSpeedSlider.value = 2.0;
    tunnelSpeedValue.textContent = '2.0x';
    updateStarJoystick(0.3 / 5, 0);
    starSpeedXAutoToggle.textContent = 'Off';
    setStarSpeedXAutoVisibility(false);
    starSpeedXMinSlider.value = -3;
    starSpeedXMinInput.value = '-3.0';
    starSpeedXMaxSlider.value = 3;
    starSpeedXMaxInput.value = '3.0';
    starSpeedXSpeedSlider.value = 1.0;
    starSpeedXSpeedValue.textContent = '1.0x';
    starSpeedYAutoToggle.textContent = 'Off';
    setStarSpeedYAutoVisibility(false);
    starSpeedYMinSlider.value = -3;
    starSpeedYMinInput.value = '-3.0';
    starSpeedYMaxSlider.value = 3;
    starSpeedYMaxInput.value = '3.0';
    starSpeedYSpeedSlider.value = 1.0;
    starSpeedYSpeedValue.textContent = '1.0x';
    starColorPicker.value = '#ffffff';
    starContrastSlider.value = 100;
    starContrastValue.textContent = '100%';
    starSizeSlider.value = 1.0;
    starSizeValue.textContent = '1.0x';
    starCountSlider.value = 200;
    starCountValue.textContent = '200';
    initStars();

    synthStripesToggle.textContent = 'Off';
    setSynthStripesVisibility(false);
    synthStripesColorPicker.value = '#00ffff';
    synthStripesThicknessSlider.value = 4;
    synthStripesThicknessValueEl.textContent = '4.0px';
    synthStripesCountSlider.value = 6;
    synthStripesCountValueEl.textContent = '6';
    synthStripesSpeedSlider.value = 2.0;
    synthStripesSpeedValueEl.textContent = '2.0x';
    synthStripesStartYSlider.value = 50;
    synthStripesStartYValueEl.textContent = '50%';
    initSynthStripes();

    formScaleXSlider.value = 1.0;
    formScaleXValue.textContent = '1.00';
    formScaleXAutoToggle.textContent = 'Off';
    formScaleXMinGroup.style.display = 'none';
    formScaleXMaxGroup.style.display = 'none';
    formScaleXSpeedGroup.style.display = 'none';
    formScaleXMinSlider.value = 0.5; formScaleXMinInput.value = '0.50';
    formScaleXMaxSlider.value = 2.0; formScaleXMaxInput.value = '2.00';
    formScaleXSpeedSlider.value = 1.0; formScaleXSpeedValue.textContent = '1.0x';

    formScaleYSlider.value = 1.0;
    formScaleYValue.textContent = '1.00';
    formScaleYAutoToggle.textContent = 'Off';
    formScaleYMinGroup.style.display = 'none';
    formScaleYMaxGroup.style.display = 'none';
    formScaleYSpeedGroup.style.display = 'none';
    formScaleYMinSlider.value = 0.5; formScaleYMinInput.value = '0.50';
    formScaleYMaxSlider.value = 2.0; formScaleYMaxInput.value = '2.00';
    formScaleYSpeedSlider.value = 1.0; formScaleYSpeedValue.textContent = '1.0x';

    formScaleZSlider.value = 1.0;
    formScaleZValue.textContent = '1.00';
    formScaleZAutoToggle.textContent = 'Off';
    formScaleZMinGroup.style.display = 'none';
    formScaleZMaxGroup.style.display = 'none';
    formScaleZSpeedGroup.style.display = 'none';
    formScaleZMinSlider.value = 0.5; formScaleZMinInput.value = '0.50';
    formScaleZMaxSlider.value = 2.0; formScaleZMaxInput.value = '2.00';
    formScaleZSpeedSlider.value = 1.0; formScaleZSpeedValue.textContent = '1.0x';

    formExplodeSlider.value = 0;
    formExplodeValue.textContent = '0.00';
    formExplodeAutoToggle.textContent = 'Off';
    formExplodeMinGroup.style.display = 'none';
    formExplodeMaxGroup.style.display = 'none';
    formExplodeSpeedGroup.style.display = 'none';
    formExplodeMinSlider.value = 0; formExplodeMinInput.value = '0.00';
    formExplodeMaxSlider.value = 0.5; formExplodeMaxInput.value = '0.50';
    formExplodeSpeedSlider.value = 1.0; formExplodeSpeedValue.textContent = '1.0x';

    speedXValue.textContent = '0.00x';
    speedYValue.textContent = '0.00x';
    speedZValue.textContent = '0.00x';
    angleXValue.textContent = '0°';
    angleYValue.textContent = '0°';
    angleZValue.textContent = '0°';
    zoomValue.textContent = '0.50';
    zoomMinInput.value = '0.80';
    zoomMaxInput.value = '1.50';
    zoomSpeedValue.textContent = '1.0x';
    fovValue.textContent = '30°';
    offsetYValueEl.textContent = '0.00';
    offsetYMinInput.value = '-0.50';
    offsetYMaxInput.value = '0.50';
    offsetYSpeedValue.textContent = '1.0x';
    thicknessValue.textContent = '10.0px';
    contrastValue.textContent = '70%';
    loadModel('cube');
    modelPresetSelect.value = 'cube';
    morphToggle.textContent = 'Off';
    morphTargetGroup.style.display = 'none';
    morphTargetSelect.value = 'pyramid';
    morphSpeedSlider.value = 0.5;
    morphSpeedValue.textContent = '0.5x';
    morphStaySlider.value = 0;
    morphStayValue.textContent = '0.0s';
    morphHoldTimer = 0;
    morphNextHoldAt = 1;

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
    return config.colors.slice(0, config.colorCount)
        .map((c, i) => Sequencer.getColorBlend(c, targetIds[i]))
        .map(applyMasterColor);
}

function addGradientStops(grad, colors, applyColor) {
    const vibrancy = config.gradientVibrancy / 100;
    if (vibrancy > 0 && colors.length > 1) {
        const subSteps = 16;
        const totalSegs = colors.length - 1;
        const power = 1 + vibrancy * 10;

        for (let seg = 0; seg < totalSegs; seg++) {
            const isLast = seg === totalSegs - 1;
            for (let j = 0; j <= subSteps; j++) {
                if (!isLast && j === subSteps) continue;
                const linearT = j / subSteps;
                const globalStop = (seg + linearT) / totalSegs;

                // Gain curve: pushes t toward 0 and 1, creating sharp color bands
                let ct;
                if (linearT < 0.5) {
                    ct = 0.5 * Math.pow(2 * linearT, power);
                } else {
                    ct = 1 - 0.5 * Math.pow(2 * (1 - linearT), power);
                }

                const color = interpolateColorHSL(colors[seg], colors[seg + 1], ct);
                grad.addColorStop(globalStop, applyColor(color));
            }
        }
    } else {
        for (let i = 0; i < colors.length; i++) {
            const stop = colors.length === 1 ? 0 : i / (colors.length - 1);
            grad.addColorStop(stop, applyColor(colors[i]));
        }
    }
}

function createMetallicFaceGradient(screenPoints, baseColor, face, shininess, contrast) {
    const normal = face.normal;
    const brightness = face.brightness;

    const lx = 0.7036, ly = 0.5026, lz = 0.5026;
    const nDotL = normal.x * lx + normal.y * ly + normal.z * lz;
    const catchLight = Math.abs(nDotL);

    const sign = nDotL >= 0 ? 1 : -1;
    const rx = 2 * Math.abs(nDotL) * normal.x * sign - lx;
    const ry = 2 * Math.abs(nDotL) * normal.y * sign - ly;

    const dirLen = Math.sqrt(rx * rx + ry * ry) || 1;
    const dx = rx / dirLen;
    const dy = -ry / dirLen;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of screenPoints) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }

    const size = Math.max(maxX - minX, maxY - minY);
    if (size < 1) return brightnessToColor(brightness, baseColor, contrast);

    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const extent = size * 0.65;
    const grad = ctx.createLinearGradient(
        cx - dx * extent, cy - dy * extent,
        cx + dx * extent, cy + dy * extent
    );

    const specPeak = catchLight * (0.4 + shininess * 0.6);
    const dark = brightness * (0.05 + (1 - shininess) * 0.15);
    const mid = brightness * (0.35 + (1 - shininess) * 0.2);

    grad.addColorStop(0, brightnessToColor(dark, baseColor, contrast));
    grad.addColorStop(0.3, brightnessToColor(mid, baseColor, contrast));
    grad.addColorStop(0.55, brightnessToColor(brightness, baseColor, contrast, specPeak * 0.15));
    grad.addColorStop(0.8, brightnessToColor(Math.min(1, brightness * 1.2), baseColor, contrast, specPeak));
    grad.addColorStop(1.0, brightnessToColor(mid * 0.6, baseColor, contrast, specPeak * 0.1));

    return grad;
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
    addGradientStops(grad, colors, c => brightnessToColor(brightness, c, contrast));
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

    function updateFormAuto(key, slider, valueEl, fmt) {
        if (config[key + 'AutoEnabled']) {
            config[key + 'AutoTime'] += dt * config[key + 'Speed'];
            const sineValue = Math.sin(config[key + 'AutoTime'] * Math.PI);
            config[key] = config[key + 'Min'] + (config[key + 'Max'] - config[key + 'Min']) * (sineValue + 1) / 2;
            slider.value = config[key];
            valueEl.textContent = fmt(config[key]);
        }
    }

    updateFormAuto('formScaleX', formScaleXSlider, formScaleXValue, fmtScale);
    updateFormAuto('formScaleY', formScaleYSlider, formScaleYValue, fmtScale);
    updateFormAuto('formScaleZ', formScaleZSlider, formScaleZValue, fmtScale);
    updateFormAuto('formExplode', formExplodeSlider, formExplodeValue, fmtExplode);

    let effectiveThickness = config.wireframeThickness;
    if (config.thicknessScaleEnabled) {
        const baseDistance = fovToFocal(60);
        const scaleFactor = baseDistance / dz;
        const blended = 1 + (scaleFactor - 1) * config.thicknessScaleAmount;
        effectiveThickness = Math.max(0.5, config.wireframeThickness * blended);
    }

    const effectiveBackground = Sequencer.getColorBlend(BACKGROUND, 'background');
    const effectiveStarColor = Sequencer.getColorBlend(config.starColor, 'starColor');
    const effectiveStrokeColor = applyMasterColor(Sequencer.getColorBlend(config.strokeColor, 'strokeColor'));

    if (config.starSpeedXAutoEnabled) {
        config.starSpeedXAutoTime += dt * config.starSpeedXSpeed;
        const sineValue = Math.sin(config.starSpeedXAutoTime * Math.PI);
        config.starSpeedX = config.starSpeedXMin + (config.starSpeedXMax - config.starSpeedXMin) * (sineValue + 1) / 2;
        updateStarJoystick(config.starSpeedX / 5, config.starSpeedY / 5, true);
    }
    if (config.starSpeedYAutoEnabled) {
        config.starSpeedYAutoTime += dt * config.starSpeedYSpeed;
        const sineValue = Math.sin(config.starSpeedYAutoTime * Math.PI);
        config.starSpeedY = config.starSpeedYMin + (config.starSpeedYMax - config.starSpeedYMin) * (sineValue + 1) / 2;
        updateStarJoystick(config.starSpeedX / 5, config.starSpeedY / 5, true);
    }

    eraseStars(effectiveBackground);
    updateStars(dt);
    clear(effectiveBackground);
    drawStars(effectiveStarColor);

    updateSynthStripes(dt);
    drawSynthStripes();

    // Morph computation for object 1
    let activeModel = currentModel;
    if (config.morphEnabled) {
        if (morphHoldTimer > 0) {
            morphHoldTimer -= dt;
        } else {
            morphTime += dt * config.morphSpeed;
            if (config.morphStay > 0 && morphTime >= morphNextHoldAt) {
                morphTime = morphNextHoldAt;
                morphNextHoldAt += 1;
                morphHoldTimer = config.morphStay;
            }
        }
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
    const effectiveObjDistance = config.objectDistance + Sequencer.getModOffset('objectDistance');
    const objectsToRender = [];
    if (config.objectCount >= 2) {
        objectsToRender.push({ model: activeModel, yOffset: effectiveObjDistance / 2, scale: config.obj1Scale });
        objectsToRender.push({ model: secondModel, yOffset: -effectiveObjDistance / 2, scale: config.obj2Scale });
    } else {
        objectsToRender.push({ model: activeModel, yOffset: 0, scale: config.obj1Scale });
    }

    if (config.masterHueAutoEnabled) {
        config.masterHueAutoTime += dt * config.masterHueSpeed;
        const sineValue = Math.sin(config.masterHueAutoTime * Math.PI);
        config.masterHue = config.masterHueMin + (config.masterHueMax - config.masterHueMin) * (sineValue + 1) / 2;
        masterHueSlider.value = config.masterHue;
        masterHueValue.textContent = config.masterHue.toFixed(0) + '°';
    }

    const effectiveColors = getEffectiveColors();
    const solidAmount = config.solidMode ? 1 : Sequencer.getSolidAmount();
    const distortAmt = Sequencer.getDistortAmount();
    const fsx = config.formScaleX + Sequencer.getModOffset('formScaleX');
    const fsy = config.formScaleY + Sequencer.getModOffset('formScaleY');
    const fsz = config.formScaleZ + Sequencer.getModOffset('formScaleZ');
    const totalExplode = distortAmt + config.formExplode;
    const needFormScale = fsx !== 1 || fsy !== 1 || fsz !== 1;

    function computeFaceNormal(model, face) {
        if (face.length < 3) return { x: 0, y: 0, z: 0 };
        const v0 = model.vs[face[0]];
        const v1 = model.vs[face[1]];
        const v2 = model.vs[face[2]];
        const e1x = (v1.x - v0.x) * fsx, e1y = (v1.y - v0.y) * fsy, e1z = (v1.z - v0.z) * fsz;
        const e2x = (v2.x - v0.x) * fsx, e2y = (v2.y - v0.y) * fsy, e2z = (v2.z - v0.z) * fsz;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 0.0001) return { x: 0, y: 0, z: 0 };
        return { x: nx / len, y: ny / len, z: nz / len };
    }

    function getVertex(model, vi, faceNormal) {
        const v = model.vs[vi];
        const needExplode = totalExplode > 0 && faceNormal;
        if (!needFormScale && !needExplode) return v;
        return {
            x: v.x * fsx + (needExplode ? faceNormal.x * totalExplode : 0),
            y: v.y * fsy + (needExplode ? faceNormal.y * totalExplode : 0),
            z: v.z * fsz + (needExplode ? faceNormal.z * totalExplode : 0),
        };
    }

    const useGlobalGrad = config.gradientEnabled && config.gradientMode === 'global' && effectiveColors.length > 1;
    const usePaintedGrad = config.gradientEnabled && config.gradientMode === 'painted' && effectiveColors.length > 1;
    let globalGradBounds = null;
    let paintedBounds = null;
    if (useGlobalGrad || usePaintedGrad) {
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        let mMinX = Infinity, mMinY = Infinity, mMinZ = Infinity;
        let mMaxX = -Infinity, mMaxY = -Infinity, mMaxZ = -Infinity;
        for (const obj of objectsToRender) {
            for (let vi = 0; vi < obj.model.vs.length; vi++) {
                const v = getVertex(obj.model, vi, null);
                const s = obj.scale;
                const mx = v.x * s, my = v.y * s + obj.yOffset, mz = v.z * s;
                if (mx < mMinX) mMinX = mx; if (mx > mMaxX) mMaxX = mx;
                if (my < mMinY) mMinY = my; if (my > mMaxY) mMaxY = my;
                if (mz < mMinZ) mMinZ = mz; if (mz > mMaxZ) mMaxZ = mz;
                if (useGlobalGrad) {
                    const rotated = rotate_xyz({ x: mx, y: my, z: mz }, currentAngleX, currentAngleY, currentAngleZ);
                    const translated = translate_z(rotated, dz);
                    if (translated.z <= 0.01) continue;
                    const p = project(translated);
                    p.y += dy;
                    const sp = screen(p);
                    if (sp.x < gMinX) gMinX = sp.x;
                    if (sp.x > gMaxX) gMaxX = sp.x;
                    if (sp.y < gMinY) gMinY = sp.y;
                    if (sp.y > gMaxY) gMaxY = sp.y;
                }
            }
        }
        if (useGlobalGrad) globalGradBounds = { minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY };
        if (usePaintedGrad) paintedBounds = { minX: mMinX, minY: mMinY, minZ: mMinZ, maxX: mMaxX, maxY: mMaxY, maxZ: mMaxZ };
    }

    let paintedGradStart = null, paintedGradEnd = null;
    if (usePaintedGrad && paintedBounds) {
        const b = paintedBounds;
        const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, cz = (b.minZ + b.maxZ) / 2;
        let startPt, endPt;
        switch (config.gradientDirection) {
            case 'tb': startPt = { x: cx, y: b.maxY, z: cz }; endPt = { x: cx, y: b.minY, z: cz }; break;
            case 'bt': startPt = { x: cx, y: b.minY, z: cz }; endPt = { x: cx, y: b.maxY, z: cz }; break;
            case 'lr': startPt = { x: b.minX, y: cy, z: cz }; endPt = { x: b.maxX, y: cy, z: cz }; break;
            case 'rl': startPt = { x: b.maxX, y: cy, z: cz }; endPt = { x: b.minX, y: cy, z: cz }; break;
            default:   startPt = { x: cx, y: b.maxY, z: cz }; endPt = { x: cx, y: b.minY, z: cz }; break;
        }
        const toScreen = (pt) => {
            const rotated = rotate_xyz(pt, currentAngleX, currentAngleY, currentAngleZ);
            const translated = translate_z(rotated, dz);
            if (translated.z <= 0.01) translated.z = 0.01;
            const p = project(translated);
            p.y += dy;
            return screen(p);
        };
        paintedGradStart = toScreen(startPt);
        paintedGradEnd = toScreen(endPt);
    }

    function createPaintedGradient(colors, brightness, contrast) {
        const grad = ctx.createLinearGradient(paintedGradStart.x, paintedGradStart.y, paintedGradEnd.x, paintedGradEnd.y);
        addGradientStops(grad, colors, c => brightnessToColor(brightness, c, contrast));
        return grad;
    }

    function createDirectionalGradient(bounds, colors, brightness, contrast) {
        const { minX, minY, maxX, maxY } = bounds;
        let grad;
        switch (config.gradientDirection) {
            case 'tb': grad = ctx.createLinearGradient(0, minY, 0, maxY); break;
            case 'bt': grad = ctx.createLinearGradient(0, maxY, 0, minY); break;
            case 'lr': grad = ctx.createLinearGradient(minX, 0, maxX, 0); break;
            case 'rl': grad = ctx.createLinearGradient(maxX, 0, minX, 0); break;
            default:   grad = ctx.createLinearGradient(0, minY, 0, maxY); break;
        }
        addGradientStops(grad, colors, c => brightnessToColor(brightness, c, contrast));
        return grad;
    }

    if (solidAmount > 0) {
        const facesWithDepth = [];

        for (const obj of objectsToRender) {
            for (const f of obj.model.fs) {
                if (f.length < 3) continue;

                const faceNormal = totalExplode > 0 ? computeFaceNormal(obj.model, f) : null;
                const transformedVertices = [];
                let allValid = true;

                for (let i = 0; i < f.length; i++) {
                    const v = getVertex(obj.model, f[i], faceNormal);
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
                let brightness = baseBrightness + (lightIntensity * directionalLight * depthBrightness);

                if (config.metallicEnabled) {
                    const shin = config.metallicShininess;
                    brightness = Math.pow(brightness, 1.5 + shin * 2.5);
                }

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
            if (config.metallicEnabled) {
                let baseColor;
                if (config.gradientEnabled && effectiveColors.length > 1) {
                    const t = face.faceIndex / Math.max(1, facesWithDepth.length - 1);
                    baseColor = sampleGradientColor(effectiveColors, t);
                } else {
                    const ci = face.faceIndex % effectiveColors.length;
                    baseColor = effectiveColors[ci];
                }
                faceColor = createMetallicFaceGradient(screenPoints, baseColor, face, config.metallicShininess, config.contrast);
            } else if (usePaintedGrad) {
                faceColor = createPaintedGradient(effectiveColors, face.brightness, config.contrast);
            } else if (useGlobalGrad) {
                faceColor = createDirectionalGradient(globalGradBounds, effectiveColors, face.brightness, config.contrast);
            } else if (config.gradientEnabled && effectiveColors.length > 1) {
                faceColor = createFaceGradient(screenPoints, effectiveColors, face.brightness, config.contrast);
            } else {
                const ci = face.faceIndex % effectiveColors.length;
                faceColor = brightnessToColor(face.brightness, effectiveColors[ci], config.contrast);
            }

            let strokeColor = effectiveStrokeColor;
            if (config.metallicStrokes) {
                const n = face.normal;
                const shin = config.metallicShininess;
                const lx = 0.7036, ly = 0.5026, lz = 0.5026;
                const nDotL = Math.abs(n.x * lx + n.y * ly + n.z * lz);
                const fresnel = 1 - Math.abs(n.z);
                const edgeLight = Math.pow(nDotL, 0.6) * 0.7 + Math.pow(fresnel, 1.5) * 0.5;
                const intensity = Math.min(1, edgeLight * (0.3 + shin * 0.7));

                let baseColor;
                if (config.gradientEnabled && effectiveColors.length > 1) {
                    const t = face.faceIndex / Math.max(1, facesWithDepth.length - 1);
                    baseColor = sampleGradientColor(effectiveColors, t);
                } else {
                    const ci = face.faceIndex % effectiveColors.length;
                    baseColor = effectiveColors[ci];
                }
                const hex = baseColor.replace('#', '');
                const br = parseInt(hex.substring(0, 2), 16);
                const bg = parseInt(hex.substring(2, 4), 16);
                const bb = parseInt(hex.substring(4, 6), 16);
                const sr = Math.min(255, Math.floor(br * 0.2 + 255 * intensity));
                const sg = Math.min(255, Math.floor(bg * 0.2 + 255 * intensity));
                const sb = Math.min(255, Math.floor(bb * 0.2 + 255 * intensity));
                strokeColor = `rgb(${sr}, ${sg}, ${sb})`;
            }

            ctx.globalAlpha = solidAmount;
            polygon(screenPoints, faceColor, strokeColor, effectiveThickness, true, solidAmount >= 1);
            ctx.globalAlpha = 1;
        }
    }

    if (solidAmount < 1) {
        let edgeIdx = 0;
        for (const obj of objectsToRender) {
            for (const f of obj.model.fs) {
                const faceNormal = totalExplode > 0 ? computeFaceNormal(obj.model, f) : null;
                for (let i = 0; i < f.length; ++i) {
                    const a = getVertex(obj.model, f[i], faceNormal);
                    const b = getVertex(obj.model, f[(i + 1) % f.length], faceNormal);
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
                    if (usePaintedGrad) {
                        lineColor = createPaintedGradient(effectiveColors, 1, 0);
                    } else if (useGlobalGrad) {
                        lineColor = createDirectionalGradient(globalGradBounds, effectiveColors, 1, 0);
                    } else if (config.gradientEnabled && effectiveColors.length > 1) {
                        const grad = ctx.createLinearGradient(sA.x, sA.y, sB.x, sB.y);
                        addGradientStops(grad, effectiveColors, c => c);
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
