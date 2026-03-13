const BinExport = (() => {
    const FRAME_SIZE_MULTIPLIER = 3; // RGB bytes per pixel

    function getTargetFps() {
        return 30;
    }

    function getStepDuration() {
        return 60 / Sequencer.tempo / 4;
    }

    function getExportDuration(loops) {
        return Sequencer.totalSteps * getStepDuration() * loops;
    }

    function updateExportInfo() {
        const loops = parseInt(document.getElementById('exportLoops').value) || 1;
        const durationSec = getExportDuration(loops);
        const targetFps = getTargetFps();
        const totalFrames = Math.ceil(durationSec * targetFps);
        const frameSize = USBStream.panelWidth * USBStream.panelHeight * FRAME_SIZE_MULTIPLIER;
        const fileSize = totalFrames * frameSize;
        const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

        const info = `${loops}x${Sequencer.totalSteps} steps = ` +
            `${durationSec.toFixed(2)}s, ${totalFrames} frames, ${sizeMB} MB`;
        document.getElementById('exportInfo').textContent = info;
    }

    async function exportBin() {
        const exportBtn = document.getElementById('exportBinBtn');
        const progressDiv = document.getElementById('exportProgress');
        const progressFill = document.getElementById('exportProgressFill');
        const progressText = document.getElementById('exportProgressText');

        const loops = parseInt(document.getElementById('exportLoops').value) || 1;
        const targetFps = getTargetFps();
        const durationSec = getExportDuration(loops);
        const totalFrames = Math.ceil(durationSec * targetFps);
        const frameSize = USBStream.panelWidth * USBStream.panelHeight * FRAME_SIZE_MULTIPLIER;
        const dt = 1 / targetFps;
        const stepDuration = getStepDuration();
        const numSteps = Sequencer.totalSteps;

        exportBtn.disabled = true;
        progressDiv.style.display = 'flex';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';

        window.stopRenderLoop();

        const config = window.getConfig();
        const savedAutoRotation = {
            x: config.autoRotationX,
            y: config.autoRotationY,
            z: config.autoRotationZ,
        };
        const savedZoomAutoTime = config.zoomAutoTime;
        const savedOffsetYAutoTime = config.offsetYAutoTime;
        const savedModState = Sequencer.saveModState();

        Sequencer.resetModulations();

        const sourceCanvas = document.getElementById('game');
        const binData = new Uint8Array(totalFrames * frameSize);
        let binOffset = 0;
        let lastStep = -1;

        for (let f = 0; f < totalFrames; f++) {
            const simTime = f / targetFps;
            const absStep = Math.floor(simTime / stepDuration);
            const seqStep = absStep % numSteps;

            if (absStep !== lastStep) {
                lastStep = absStep;
                Sequencer.triggerStepSilent(seqStep);
            }

            window.renderScene(dt);

            const rgbData = USBStream.captureFrame(sourceCanvas);
            binData.set(rgbData, binOffset);
            binOffset += rgbData.length;

            if (f % 10 === 0 || f === totalFrames - 1) {
                const pct = Math.floor(((f + 1) / totalFrames) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
                await new Promise(r => setTimeout(r, 0));
            }
        }

        config.autoRotationX = savedAutoRotation.x;
        config.autoRotationY = savedAutoRotation.y;
        config.autoRotationZ = savedAutoRotation.z;
        config.zoomAutoTime = savedZoomAutoTime;
        config.offsetYAutoTime = savedOffsetYAutoTime;
        Sequencer.restoreModState(savedModState);

        window.startRenderLoop();

        const blob = new Blob([binData.subarray(0, binOffset)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_${Sequencer.tempo}bpm_${numSteps}steps_${loops}x_${durationSec.toFixed(1)}s.bin`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        progressFill.style.width = '100%';
        progressText.textContent = 'Done!';
        setTimeout(() => {
            progressDiv.style.display = 'none';
            exportBtn.disabled = false;
        }, 1500);
    }

    function init() {
        document.getElementById('exportLoops').addEventListener('input', updateExportInfo);
        document.getElementById('exportBinBtn').addEventListener('click', exportBin);

        const tempoInput = document.getElementById('seqTempo');
        if (tempoInput) tempoInput.addEventListener('change', updateExportInfo);

        document.querySelectorAll('.seq-steps-btn').forEach(btn => {
            btn.addEventListener('click', () => setTimeout(updateExportInfo, 50));
        });

        updateExportInfo();
    }

    return { init, updateExportInfo };
})();
