const USBStream = (() => {
    const CHUNK_SIZE = 1024;
    const RENDER_SCALE = 10;

    const state = {
        port: null,
        writer: null,
        isConnected: false,
        isStreaming: false,
        panelWidth: 40,
        panelHeight: 96,
        baudRate: 2000000,
        targetFps: 30,
        frameCount: 0,
        lastFpsTime: 0,
        streamAnimationId: null,
        sourceCanvas: null,
        onResizeCallback: null,
    };

    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
    });

    const previewCanvas = document.getElementById('usbPreviewCanvas');
    const previewCtx = previewCanvas
        ? previewCanvas.getContext('2d', { alpha: false })
        : null;

    function applyDimensions() {
        captureCanvas.width = state.panelWidth;
        captureCanvas.height = state.panelHeight;

        if (previewCanvas) {
            previewCanvas.width = state.panelWidth;
            previewCanvas.height = state.panelHeight;

            // Scale preview CSS to a visible size while preserving aspect ratio
            const maxPreviewHeight = 240;
            const scale = maxPreviewHeight / state.panelHeight;
            previewCanvas.style.width = Math.round(state.panelWidth * scale) + 'px';
            previewCanvas.style.height = Math.round(state.panelHeight * scale) + 'px';
        }

        if (state.sourceCanvas) {
            state.sourceCanvas.width = state.panelWidth * RENDER_SCALE;
            state.sourceCanvas.height = state.panelHeight * RENDER_SCALE;
        }

        if (state.onResizeCallback) {
            state.onResizeCallback(
                state.panelWidth * RENDER_SCALE,
                state.panelHeight * RENDER_SCALE
            );
        }
    }

    function updatePanelDimensions(width, height) {
        state.panelWidth = width;
        state.panelHeight = height;
        applyDimensions();
    }

    function setStatus(text, type) {
        const el = document.getElementById('usbStatus');
        if (el) {
            el.textContent = text;
            el.className = 'value-display usb-status-' + (type || 'info');
        }
    }

    function updateFpsDisplay(fps) {
        const el = document.getElementById('usbFps');
        if (el) el.textContent = fps;
    }

    async function connect() {
        if (state.isConnected) return disconnect();

        try {
            state.port = await navigator.serial.requestPort();
            await state.port.open({ baudRate: state.baudRate });
            state.isConnected = true;
            setStatus('Connected', 'connected');

            const btn = document.getElementById('usbConnectBtn');
            if (btn) {
                btn.textContent = 'Disconnect';
                btn.classList.add('connected');
            }

            const streamBtn = document.getElementById('usbStreamBtn');
            if (streamBtn) streamBtn.disabled = false;
        } catch (err) {
            setStatus('Failed: ' + err.message, 'error');
        }
    }

    async function disconnect() {
        if (state.isStreaming) stopStreaming();

        try {
            if (state.port) {
                await state.port.close();
                state.port = null;
            }
        } catch (err) {
            console.warn('Disconnect error:', err);
        }

        state.isConnected = false;
        setStatus('Disconnected', 'info');

        const btn = document.getElementById('usbConnectBtn');
        if (btn) {
            btn.textContent = 'Connect';
            btn.classList.remove('connected');
        }

        const streamBtn = document.getElementById('usbStreamBtn');
        if (streamBtn) streamBtn.disabled = true;
    }

    function captureFrame(sourceCanvas) {
        captureCtx.drawImage(
            sourceCanvas,
            0, 0, sourceCanvas.width, sourceCanvas.height,
            0, 0, state.panelWidth, state.panelHeight
        );

        if (previewCtx) {
            previewCtx.drawImage(captureCanvas, 0, 0);
        }

        const imageData = captureCtx.getImageData(
            0, 0, state.panelWidth, state.panelHeight
        );
        const rgba = imageData.data;
        const pixelCount = state.panelWidth * state.panelHeight;
        const rgbData = new Uint8Array(pixelCount * 3);

        for (let i = 0, j = 0; i < pixelCount; i++) {
            const offset = i * 4;
            rgbData[j++] = rgba[offset];
            rgbData[j++] = rgba[offset + 1];
            rgbData[j++] = rgba[offset + 2];
        }

        return rgbData;
    }

    async function sendFrame(rgbData) {
        if (!state.writer) return;

        for (let i = 0; i < rgbData.length; i += CHUNK_SIZE) {
            const chunk = rgbData.subarray(i, Math.min(i + CHUNK_SIZE, rgbData.length));
            await state.writer.write(chunk);
        }
    }

    function startStreaming(sourceCanvas) {
        if (!state.isConnected || !state.port) return;

        state.isStreaming = true;
        state.writer = state.port.writable.getWriter();
        state.frameCount = 0;
        state.lastFpsTime = performance.now();

        const frameTime = 1000 / state.targetFps;
        let lastFrameTime = performance.now();

        setStatus('Streaming', 'streaming');

        const streamBtn = document.getElementById('usbStreamBtn');
        if (streamBtn) {
            streamBtn.textContent = 'Stop Streaming';
            streamBtn.classList.add('streaming');
        }

        async function streamLoop() {
            if (!state.isStreaming) return;

            const now = performance.now();

            if (now - lastFrameTime >= frameTime) {
                try {
                    const rgbData = captureFrame(sourceCanvas);
                    await sendFrame(rgbData);

                    state.frameCount++;
                    if (now - state.lastFpsTime >= 1000) {
                        updateFpsDisplay(state.frameCount);
                        state.frameCount = 0;
                        state.lastFpsTime = now;
                    }

                    lastFrameTime = now;
                } catch (err) {
                    console.error('Stream error:', err);
                    setStatus('Error: ' + err.message, 'error');
                    stopStreaming();
                    return;
                }
            }

            state.streamAnimationId = requestAnimationFrame(streamLoop);
        }

        state.streamAnimationId = requestAnimationFrame(streamLoop);
    }

    function stopStreaming() {
        state.isStreaming = false;

        if (state.streamAnimationId) {
            cancelAnimationFrame(state.streamAnimationId);
            state.streamAnimationId = null;
        }

        if (state.writer) {
            state.writer.releaseLock();
            state.writer = null;
        }

        setStatus(state.isConnected ? 'Connected' : 'Disconnected',
            state.isConnected ? 'connected' : 'info');
        updateFpsDisplay(0);

        const streamBtn = document.getElementById('usbStreamBtn');
        if (streamBtn) {
            streamBtn.textContent = 'Start Streaming';
            streamBtn.classList.remove('streaming');
        }
    }

    function toggleStreaming(sourceCanvas) {
        if (state.isStreaming) {
            stopStreaming();
        } else {
            startStreaming(sourceCanvas);
        }
    }

    function initControls(sourceCanvas, onResize) {
        state.sourceCanvas = sourceCanvas;
        state.onResizeCallback = onResize || null;

        // Set canvas to panel aspect ratio on init
        applyDimensions();

        if (!navigator.serial) {
            setStatus('WebSerial not supported', 'error');
            const connectBtn = document.getElementById('usbConnectBtn');
            if (connectBtn) connectBtn.disabled = true;
            return;
        }

        document.getElementById('usbConnectBtn')
            ?.addEventListener('click', connect);

        document.getElementById('usbStreamBtn')
            ?.addEventListener('click', () => toggleStreaming(sourceCanvas));

        document.getElementById('panelWidth')
            ?.addEventListener('change', (e) => {
                const w = Math.max(1, parseInt(e.target.value) || 40);
                updatePanelDimensions(w, state.panelHeight);
                const display = document.getElementById('panelWidthValue');
                if (display) display.textContent = w;
            });

        document.getElementById('panelHeight')
            ?.addEventListener('change', (e) => {
                const h = Math.max(1, parseInt(e.target.value) || 96);
                updatePanelDimensions(state.panelWidth, h);
                const display = document.getElementById('panelHeightValue');
                if (display) display.textContent = h;
            });

        document.getElementById('baudRate')
            ?.addEventListener('change', (e) => {
                state.baudRate = parseInt(e.target.value);
            });

        const fpsSlider = document.getElementById('targetFps');
        if (fpsSlider) {
            fpsSlider.addEventListener('input', (e) => {
                state.targetFps = parseInt(e.target.value);
                const display = document.getElementById('targetFpsValue');
                if (display) display.textContent = state.targetFps;
            });
        }
    }

    return {
        get isStreaming() { return state.isStreaming; },
        get isConnected() { return state.isConnected; },
        get panelWidth() { return state.panelWidth; },
        get panelHeight() { return state.panelHeight; },
        get renderScale() { return RENDER_SCALE; },
        initControls,
        captureFrame,
        updatePanelDimensions,
    };
})();
