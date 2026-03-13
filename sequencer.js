const Sequencer = (() => {
    let audioCtx = null;
    let masterGain = null;
    let noiseBuffer = null;

    let isPlaying = false;
    let tempo = 120;
    let totalSteps = 16;
    let currentStep = 0;
    let displayStep = -1;
    let currentPage = 0;
    let nextNoteTime = 0;
    let schedulerTimerId = null;
    let volume = 0.8;

    let isPainting = false;
    let paintValue = false;

    // Sample player state
    let sampleBuffer = null;
    let sampleSource = null;
    let sampleGain = null;
    let samplePlaying = false;
    let sampleVolume = 0.8;
    let sampleName = '';

    const STEPS_PER_PAGE = 16;
    const LOOKAHEAD = 0.1;
    const SCHEDULE_INTERVAL = 25;

    // Pre-generated random offsets for vertex distortion
    const DISTORT_NOISE_SIZE = 512;
    const distortNoise = [];
    for (let i = 0; i < DISTORT_NOISE_SIZE; i++) {
        distortNoise.push({
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: (Math.random() - 0.5) * 2,
        });
    }

    const MOD_TARGETS = [
        { id: 'none', label: 'None' },
        { id: 'zoom', label: 'Zoom' },
        { id: 'offsetY', label: 'Y Position' },
        { id: 'speedX', label: 'X Spin' },
        { id: 'speedY', label: 'Y Spin' },
        { id: 'speedZ', label: 'Z Spin' },
        { id: 'angleX', label: 'X Angle' },
        { id: 'angleY', label: 'Y Angle' },
        { id: 'angleZ', label: 'Z Angle' },
    ];

    const COLOR_MOD_TARGETS = [
        { id: 'color1', label: 'Color 1' },
        { id: 'color2', label: 'Color 2' },
        { id: 'color3', label: 'Color 3' },
        { id: 'color4', label: 'Color 4' },
        { id: 'starColor', label: 'Star Color' },
        { id: 'background', label: 'Background' },
        { id: 'strokeColor', label: 'Stroke Color' },
    ];

    const tracks = [
        {
            id: 'kick',
            label: 'KICK',
            steps: new Array(64).fill(false),
            color: '#ff6633',
            modTarget: 'zoom',
            modAmount: -0.3,
            modRecovery: 0.5,
            currentMod: 0,
            colorModEnabled: false,
            colorModTarget: 'color1',
            colorModColor: '#ff2200',
            colorReturn: 0.3,
            colorEnvelope: 0,
            solidModEnabled: false,
            solidReturn: 0.3,
            solidEnvelope: 0,
            distortModEnabled: false,
            distortAmount: 0.15,
            distortReturn: 0.4,
            distortEnvelope: 0,
        },
        {
            id: 'hihat',
            label: 'HIHAT',
            steps: new Array(64).fill(false),
            color: '#33ffff',
            modTarget: 'none',
            modAmount: 0.5,
            modRecovery: 0.7,
            currentMod: 0,
            colorModEnabled: false,
            colorModTarget: 'color1',
            colorModColor: '#00ccff',
            colorReturn: 0.3,
            colorEnvelope: 0,
            solidModEnabled: false,
            solidReturn: 0.3,
            solidEnvelope: 0,
            distortModEnabled: false,
            distortAmount: 0.15,
            distortReturn: 0.4,
            distortEnvelope: 0,
        },
        {
            id: 'snare',
            label: 'SNARE',
            steps: new Array(64).fill(false),
            color: '#ffff33',
            modTarget: 'none',
            modAmount: 0.5,
            modRecovery: 0.5,
            currentMod: 0,
            colorModEnabled: false,
            colorModTarget: 'color1',
            colorModColor: '#0044ff',
            colorReturn: 0.3,
            colorEnvelope: 0,
            solidModEnabled: false,
            solidReturn: 0.3,
            solidEnvelope: 0,
            distortModEnabled: false,
            distortAmount: 0.15,
            distortReturn: 0.4,
            distortEnvelope: 0,
        },
    ];

    // --- Audio Engine ---

    function initAudio() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = volume;
        masterGain.connect(audioCtx.destination);

        const bufferSize = audioCtx.sampleRate * 2;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    function playKick(time) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.4);
    }

    function playHihat(time) {
        const source = audioCtx.createBufferSource();
        source.buffer = noiseBuffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start(time);
        source.stop(time + 0.08);
    }

    function playSnare(time) {
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 3000;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.5, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(time);
        noise.stop(time + 0.15);

        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 200;
        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(0.5, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.1);
    }

    const drumFns = { kick: playKick, hihat: playHihat, snare: playSnare };

    // --- Scheduler ---

    function scheduleStep(step, time) {
        for (const track of tracks) {
            if (track.steps[step]) {
                drumFns[track.id](time);
                const delay = Math.max(0, (time - audioCtx.currentTime) * 1000);
                const t = track;
                setTimeout(() => {
                    if (t.modTarget !== 'none') {
                        t.currentMod = t.modAmount;
                    }
                    if (t.colorModEnabled) {
                        t.colorEnvelope = 1;
                    }
                    if (t.solidModEnabled) {
                        t.solidEnvelope = 1;
                    }
                    if (t.distortModEnabled) {
                        t.distortEnvelope = 1;
                    }
                }, delay);
            }
        }
        const visualDelay = Math.max(0, (time - audioCtx.currentTime) * 1000);
        const stepForVisual = step;
        setTimeout(() => {
            displayStep = stepForVisual;
            updateStepIndicator();
        }, visualDelay);
    }

    function scheduler() {
        while (nextNoteTime < audioCtx.currentTime + LOOKAHEAD) {
            scheduleStep(currentStep, nextNoteTime);
            const secondsPerStep = 60.0 / tempo / 4;
            nextNoteTime += secondsPerStep;
            currentStep = (currentStep + 1) % totalSteps;
        }
        schedulerTimerId = setTimeout(scheduler, SCHEDULE_INTERVAL);
    }

    // --- Transport ---

    function play() {
        initAudio();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isPlaying = true;
        currentStep = 0;
        displayStep = -1;
        nextNoteTime = audioCtx.currentTime;
        scheduler();
        if (sampleBuffer) playSample();
        updatePlayButton();
    }

    function stop() {
        isPlaying = false;
        if (schedulerTimerId) {
            clearTimeout(schedulerTimerId);
            schedulerTimerId = null;
        }
        currentStep = 0;
        displayStep = -1;
        stopSample();
        updatePlayButton();
        updateStepIndicator();
        for (const track of tracks) {
            track.currentMod = 0;
            track.colorEnvelope = 0;
            track.solidEnvelope = 0;
            track.distortEnvelope = 0;
        }
    }

    function togglePlay() {
        if (isPlaying) stop();
        else play();
    }

    // --- Modulation ---

    function updateModulations(dt) {
        for (const track of tracks) {
            const decayRate = track.modRecovery * 15;
            if (track.currentMod !== 0) {
                track.currentMod *= Math.exp(-decayRate * dt);
                if (Math.abs(track.currentMod) < 0.001) track.currentMod = 0;
            }
            if (track.colorEnvelope > 0) {
                const colorDecay = track.colorReturn * 20;
                track.colorEnvelope *= Math.exp(-colorDecay * dt);
                if (track.colorEnvelope < 0.005) track.colorEnvelope = 0;
            }
            if (track.solidEnvelope > 0) {
                const solidDecay = track.solidReturn * 12;
                track.solidEnvelope *= Math.exp(-solidDecay * dt);
                if (track.solidEnvelope < 0.005) track.solidEnvelope = 0;
            }
            if (track.distortEnvelope > 0) {
                const distortDecay = track.distortReturn * 8;
                track.distortEnvelope *= Math.exp(-distortDecay * dt);
                if (track.distortEnvelope < 0.005) track.distortEnvelope = 0;
            }
        }
    }

    function getModOffset(paramId) {
        let total = 0;
        for (const track of tracks) {
            if (track.modTarget === paramId) total += track.currentMod;
        }
        return total;
    }

    function getSolidAmount() {
        let max = 0;
        for (const track of tracks) {
            if (track.solidModEnabled && track.solidEnvelope > max) {
                max = track.solidEnvelope;
            }
        }
        return max;
    }

    function getDistortAmount() {
        let total = 0;
        for (const track of tracks) {
            if (track.distortModEnabled) {
                total += track.distortEnvelope * track.distortAmount;
            }
        }
        return total;
    }

    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return {
            r: parseInt(h.substring(0, 2), 16),
            g: parseInt(h.substring(2, 4), 16),
            b: parseInt(h.substring(4, 6), 16),
        };
    }

    function getColorBlend(baseHex, targetId) {
        const base = hexToRgb(baseHex);
        let r = base.r, g = base.g, b = base.b;

        for (const track of tracks) {
            if (track.colorModEnabled && track.colorEnvelope > 0.005 && track.colorModTarget === targetId) {
                const c = hexToRgb(track.colorModColor);
                const t = track.colorEnvelope;
                r += (c.r - r) * t;
                g += (c.g - g) * t;
                b += (c.b - b) * t;
            }
        }

        const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
        return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
    }

    // --- Sample Player ---

    function loadSample(file) {
        initAudio();
        const reader = new FileReader();
        reader.onload = (e) => {
            audioCtx.decodeAudioData(e.target.result, (buffer) => {
                sampleBuffer = buffer;
                sampleName = file.name;
                const label = document.getElementById('sampleFileName');
                if (label) label.textContent = sampleName;
                const playBtn = document.getElementById('samplePlayBtn');
                if (playBtn) playBtn.disabled = false;
            }, () => {
                const label = document.getElementById('sampleFileName');
                if (label) label.textContent = 'Failed to decode';
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function playSample() {
        if (!sampleBuffer || !audioCtx) return;
        stopSample();

        if (!sampleGain) {
            sampleGain = audioCtx.createGain();
            sampleGain.connect(audioCtx.destination);
        }
        sampleGain.gain.value = sampleVolume;

        sampleSource = audioCtx.createBufferSource();
        sampleSource.buffer = sampleBuffer;
        sampleSource.loop = true;
        sampleSource.connect(sampleGain);
        sampleSource.start(0);
        samplePlaying = true;
    }

    function stopSample() {
        if (sampleSource) {
            try { sampleSource.stop(); } catch (_) {}
            sampleSource.disconnect();
            sampleSource = null;
        }
        samplePlaying = false;
    }

    // --- UI ---

    function updatePlayButton() {
        const btn = document.getElementById('seqPlayBtn');
        if (btn) {
            btn.textContent = isPlaying ? 'Stop' : 'Play';
            btn.classList.toggle('seq-playing', isPlaying);
        }
    }

    function updateStepIndicator() {
        document.querySelectorAll('.seq-step').forEach(el => {
            const stepIdx = parseInt(el.dataset.step);
            el.classList.toggle('seq-step-current', stepIdx === displayStep);
        });
    }

    function setTotalSteps(count) {
        totalSteps = count;
        if (currentStep >= totalSteps) currentStep = 0;
        const maxPage = Math.ceil(totalSteps / STEPS_PER_PAGE) - 1;
        if (currentPage > maxPage) currentPage = maxPage;
        renderGrid();
        updatePageButtons();
    }

    function setPage(page) {
        currentPage = page;
        renderGrid();
        updatePageButtons();
    }

    function updatePageButtons() {
        const numPages = totalSteps / STEPS_PER_PAGE;
        document.querySelectorAll('.seq-page-btn').forEach(btn => {
            const page = parseInt(btn.dataset.page);
            btn.style.display = page < numPages ? '' : 'none';
            btn.classList.toggle('active', page === currentPage);
        });
        document.querySelectorAll('.seq-steps-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.steps) === totalSteps);
        });
    }

    function updateStepButton(btn, track, stepIdx) {
        btn.classList.toggle('seq-step-on', track.steps[stepIdx]);
        btn.style.background = track.steps[stepIdx] ? track.color : '';
    }

    function renderGrid() {
        const pageStart = currentPage * STEPS_PER_PAGE;

        for (const track of tracks) {
            const container = document.getElementById(`seq-steps-${track.id}`);
            if (!container) continue;
            container.innerHTML = '';

            for (let i = 0; i < STEPS_PER_PAGE; i++) {
                const stepIdx = pageStart + i;
                if (stepIdx >= 64) break;

                const btn = document.createElement('button');
                btn.className = 'seq-step';
                btn.dataset.step = String(stepIdx);
                btn.dataset.track = track.id;

                if (track.steps[stepIdx]) {
                    btn.classList.add('seq-step-on');
                    btn.style.background = track.color;
                }
                if (stepIdx === displayStep) {
                    btn.classList.add('seq-step-current');
                }
                if (i % 4 === 0 && i !== 0) {
                    btn.classList.add('seq-step-beat-start');
                }

                const trackRef = track;
                const idx = stepIdx;

                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    isPainting = true;
                    paintValue = !trackRef.steps[idx];
                    trackRef.steps[idx] = paintValue;
                    updateStepButton(btn, trackRef, idx);
                });

                btn.addEventListener('mouseenter', () => {
                    if (isPainting) {
                        trackRef.steps[idx] = paintValue;
                        updateStepButton(btn, trackRef, idx);
                    }
                });

                container.appendChild(btn);
            }
        }
    }

    function buildModTargetOptions() {
        return MOD_TARGETS.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
    }

    function buildColorModTargetOptions() {
        return COLOR_MOD_TARGETS.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
    }

    function initUI() {
        for (const track of tracks) {
            const select = document.getElementById(`seq-mod-target-${track.id}`);
            if (select) {
                select.innerHTML = buildModTargetOptions();
                select.value = track.modTarget;
            }
        }

        document.getElementById('seqPlayBtn').addEventListener('click', togglePlay);

        const tempoInput = document.getElementById('seqTempo');
        tempoInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val >= 20 && val <= 300) tempo = val;
            else e.target.value = tempo;
        });

        const volSlider = document.getElementById('seqVolume');
        const volValue = document.getElementById('seqVolumeValue');
        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                volume = parseFloat(e.target.value);
                volValue.textContent = Math.round(volume * 100) + '%';
                if (masterGain) masterGain.gain.value = volume;
            });
        }

        document.querySelectorAll('.seq-steps-btn').forEach(btn => {
            btn.addEventListener('click', () => setTotalSteps(parseInt(btn.dataset.steps)));
        });

        document.querySelectorAll('.seq-page-btn').forEach(btn => {
            btn.addEventListener('click', () => setPage(parseInt(btn.dataset.page)));
        });

        for (const track of tracks) {
            const sel = document.getElementById(`seq-mod-target-${track.id}`);
            const amtSlider = document.getElementById(`seq-mod-amount-${track.id}`);
            const amtVal = document.getElementById(`seq-mod-amount-val-${track.id}`);
            const recSlider = document.getElementById(`seq-mod-recovery-${track.id}`);
            const recVal = document.getElementById(`seq-mod-recovery-val-${track.id}`);

            if (sel) sel.addEventListener('change', (e) => { track.modTarget = e.target.value; });

            if (amtSlider) {
                amtSlider.value = track.modAmount;
                amtVal.textContent = track.modAmount.toFixed(2);
                amtSlider.addEventListener('input', (e) => {
                    track.modAmount = parseFloat(e.target.value);
                    amtVal.textContent = track.modAmount.toFixed(2);
                });
            }

            if (recSlider) {
                recSlider.value = track.modRecovery;
                recVal.textContent = track.modRecovery.toFixed(2);
                recSlider.addEventListener('input', (e) => {
                    track.modRecovery = parseFloat(e.target.value);
                    recVal.textContent = track.modRecovery.toFixed(2);
                });
            }

            const colorToggle = document.getElementById(`seq-color-toggle-${track.id}`);
            const colorTargetSel = document.getElementById(`seq-color-target-${track.id}`);
            const colorPicker = document.getElementById(`seq-color-picker-${track.id}`);
            const colorRetSlider = document.getElementById(`seq-color-return-${track.id}`);
            const colorRetVal = document.getElementById(`seq-color-return-val-${track.id}`);

            if (colorToggle) {
                colorToggle.addEventListener('click', () => {
                    track.colorModEnabled = !track.colorModEnabled;
                    colorToggle.textContent = track.colorModEnabled ? 'On' : 'Off';
                    colorToggle.classList.toggle('active', track.colorModEnabled);
                });
            }

            if (colorTargetSel) {
                colorTargetSel.innerHTML = buildColorModTargetOptions();
                colorTargetSel.value = track.colorModTarget;
                colorTargetSel.addEventListener('change', (e) => {
                    track.colorModTarget = e.target.value;
                });
            }

            if (colorPicker) {
                colorPicker.value = track.colorModColor;
                colorPicker.addEventListener('input', (e) => {
                    track.colorModColor = e.target.value;
                });
            }

            if (colorRetSlider) {
                colorRetSlider.value = track.colorReturn;
                colorRetVal.textContent = track.colorReturn.toFixed(2);
                colorRetSlider.addEventListener('input', (e) => {
                    track.colorReturn = parseFloat(e.target.value);
                    colorRetVal.textContent = track.colorReturn.toFixed(2);
                });
            }

            const solidToggle = document.getElementById(`seq-solid-toggle-${track.id}`);
            const solidRetSlider = document.getElementById(`seq-solid-return-${track.id}`);
            const solidRetVal = document.getElementById(`seq-solid-return-val-${track.id}`);

            if (solidToggle) {
                solidToggle.addEventListener('click', () => {
                    track.solidModEnabled = !track.solidModEnabled;
                    solidToggle.textContent = track.solidModEnabled ? 'On' : 'Off';
                    solidToggle.classList.toggle('active', track.solidModEnabled);
                });
            }

            if (solidRetSlider) {
                solidRetSlider.value = track.solidReturn;
                solidRetVal.textContent = track.solidReturn.toFixed(2);
                solidRetSlider.addEventListener('input', (e) => {
                    track.solidReturn = parseFloat(e.target.value);
                    solidRetVal.textContent = track.solidReturn.toFixed(2);
                });
            }

            const distortToggle = document.getElementById(`seq-distort-toggle-${track.id}`);
            const distortAmtSlider = document.getElementById(`seq-distort-amount-${track.id}`);
            const distortAmtVal = document.getElementById(`seq-distort-amount-val-${track.id}`);
            const distortRetSlider = document.getElementById(`seq-distort-return-${track.id}`);
            const distortRetVal = document.getElementById(`seq-distort-return-val-${track.id}`);

            if (distortToggle) {
                distortToggle.addEventListener('click', () => {
                    track.distortModEnabled = !track.distortModEnabled;
                    distortToggle.textContent = track.distortModEnabled ? 'On' : 'Off';
                    distortToggle.classList.toggle('active', track.distortModEnabled);
                });
            }

            if (distortAmtSlider) {
                distortAmtSlider.value = track.distortAmount;
                distortAmtVal.textContent = track.distortAmount.toFixed(2);
                distortAmtSlider.addEventListener('input', (e) => {
                    track.distortAmount = parseFloat(e.target.value);
                    distortAmtVal.textContent = track.distortAmount.toFixed(2);
                });
            }

            if (distortRetSlider) {
                distortRetSlider.value = track.distortReturn;
                distortRetVal.textContent = track.distortReturn.toFixed(2);
                distortRetSlider.addEventListener('input', (e) => {
                    track.distortReturn = parseFloat(e.target.value);
                    distortRetVal.textContent = track.distortReturn.toFixed(2);
                });
            }
        }

        document.addEventListener('mouseup', () => { isPainting = false; });

        // Sample player controls
        const sampleFileInput = document.getElementById('sampleFileInput');
        if (sampleFileInput) {
            sampleFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) loadSample(e.target.files[0]);
            });
        }

        const sampleVolSlider = document.getElementById('sampleVolume');
        const sampleVolValue = document.getElementById('sampleVolumeValue');
        if (sampleVolSlider) {
            sampleVolSlider.addEventListener('input', (e) => {
                sampleVolume = parseFloat(e.target.value);
                sampleVolValue.textContent = Math.round(sampleVolume * 100) + '%';
                if (sampleGain) sampleGain.gain.value = sampleVolume;
            });
        }

        renderGrid();
        updatePageButtons();
    }

    function triggerStepSilent(stepIdx) {
        for (const track of tracks) {
            if (track.steps[stepIdx]) {
                if (track.modTarget !== 'none') track.currentMod = track.modAmount;
                if (track.colorModEnabled) track.colorEnvelope = 1;
                if (track.solidModEnabled) track.solidEnvelope = 1;
                if (track.distortModEnabled) track.distortEnvelope = 1;
            }
        }
    }

    function resetModulations() {
        for (const track of tracks) {
            track.currentMod = 0;
            track.colorEnvelope = 0;
            track.solidEnvelope = 0;
            track.distortEnvelope = 0;
        }
    }

    function saveModState() {
        return tracks.map(t => ({
            currentMod: t.currentMod,
            colorEnvelope: t.colorEnvelope,
            solidEnvelope: t.solidEnvelope,
            distortEnvelope: t.distortEnvelope,
        }));
    }

    function restoreModState(saved) {
        tracks.forEach((t, i) => {
            t.currentMod = saved[i].currentMod;
            t.colorEnvelope = saved[i].colorEnvelope;
            t.solidEnvelope = saved[i].solidEnvelope;
            t.distortEnvelope = saved[i].distortEnvelope;
        });
    }

    return {
        initUI,
        updateModulations,
        getModOffset,
        getColorBlend,
        getSolidAmount,
        getDistortAmount,
        distortNoise,
        triggerStepSilent,
        resetModulations,
        saveModState,
        restoreModState,
        get isPlaying() { return isPlaying; },
        get tracks() { return tracks; },
        get tempo() { return tempo; },
        get totalSteps() { return totalSteps; },
    };
})();
