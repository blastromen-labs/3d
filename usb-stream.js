const USBStream = (() => {
    const CHUNK_SIZE = 1024;
    const RENDER_SCALE = 10;
    const PANEL_IDS = ['left', 'center', 'right'];

    const panels = {};
    PANEL_IDS.forEach(id => {
        panels[id] = { port: null, writer: null, isConnected: false };
    });

    const state = {
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

    function applyDimensions() {
        captureCanvas.width = state.panelWidth;
        captureCanvas.height = state.panelHeight;

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

    function connectedCount() {
        return PANEL_IDS.filter(id => panels[id].isConnected).length;
    }

    function updateStreamButton() {
        const btn = document.getElementById('usbStreamBtn');
        if (btn) btn.disabled = connectedCount() === 0;
    }

    function setPanelStatus(panelId, text, type) {
        const capId = panelId.charAt(0).toUpperCase() + panelId.slice(1);
        const el = document.getElementById('status' + capId);
        if (el) {
            el.textContent = text;
            el.className = 'usb-panel-status usb-status-' + (type || 'info');
        }
    }

    function updateFpsDisplay(fps) {
        const el = document.getElementById('usbFps');
        if (el) el.textContent = fps;
    }

    async function connectPanel(panelId) {
        const panel = panels[panelId];

        if (panel.isConnected) {
            return disconnectPanel(panelId);
        }

        try {
            panel.port = await navigator.serial.requestPort();
            await panel.port.open({ baudRate: state.baudRate });
            panel.isConnected = true;
            setPanelStatus(panelId, 'Connected', 'connected');

            const capId = panelId.charAt(0).toUpperCase() + panelId.slice(1);
            const btn = document.getElementById('connect' + capId);
            if (btn) {
                btn.textContent = 'Disconnect';
                btn.classList.add('connected');
            }

            const slot = document.getElementById('panelSlot' + capId);
            if (slot) slot.classList.add('connected');

            updateStreamButton();
        } catch (err) {
            setPanelStatus(panelId, 'Failed', 'error');
        }
    }

    async function disconnectPanel(panelId) {
        const panel = panels[panelId];

        if (panel.writer) {
            try { panel.writer.releaseLock(); } catch (_) {}
            panel.writer = null;
        }

        try {
            if (panel.port) {
                await panel.port.close();
                panel.port = null;
            }
        } catch (err) {
            console.warn(`Disconnect ${panelId} error:`, err);
        }

        panel.isConnected = false;
        setPanelStatus(panelId, '--', 'info');

        const capId = panelId.charAt(0).toUpperCase() + panelId.slice(1);
        const btn = document.getElementById('connect' + capId);
        if (btn) {
            btn.textContent = 'Connect';
            btn.classList.remove('connected');
        }

        const slot = document.getElementById('panelSlot' + capId);
        if (slot) slot.classList.remove('connected');

        if (connectedCount() === 0 && state.isStreaming) {
            stopStreaming();
        }
        updateStreamButton();
    }

    function captureFrame(sourceCanvas) {
        captureCtx.drawImage(
            sourceCanvas,
            0, 0, sourceCanvas.width, sourceCanvas.height,
            0, 0, state.panelWidth, state.panelHeight
        );

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

    async function sendToPanel(panel, rgbData) {
        if (!panel.writer) return;

        for (let i = 0; i < rgbData.length; i += CHUNK_SIZE) {
            const chunk = rgbData.subarray(i, Math.min(i + CHUNK_SIZE, rgbData.length));
            await panel.writer.write(chunk);
        }
    }

    async function sendToAllPanels(rgbData) {
        const promises = PANEL_IDS
            .filter(id => panels[id].isConnected && panels[id].writer)
            .map(id => sendToPanel(panels[id], rgbData));
        await Promise.all(promises);
    }

    function startStreaming(sourceCanvas) {
        if (connectedCount() === 0) return;

        state.isStreaming = true;
        state.frameCount = 0;
        state.lastFpsTime = performance.now();

        PANEL_IDS.forEach(id => {
            const panel = panels[id];
            if (panel.isConnected && panel.port) {
                panel.writer = panel.port.writable.getWriter();
                setPanelStatus(id, 'Streaming', 'streaming');
            }
        });

        const frameTime = 1000 / state.targetFps;
        let lastFrameTime = performance.now();

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
                    await sendToAllPanels(rgbData);

                    state.frameCount++;
                    if (now - state.lastFpsTime >= 1000) {
                        updateFpsDisplay(state.frameCount);
                        state.frameCount = 0;
                        state.lastFpsTime = now;
                    }

                    lastFrameTime = now;
                } catch (err) {
                    console.error('Stream error:', err);
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

        PANEL_IDS.forEach(id => {
            const panel = panels[id];
            if (panel.writer) {
                try { panel.writer.releaseLock(); } catch (_) {}
                panel.writer = null;
            }
            if (panel.isConnected) {
                setPanelStatus(id, 'Connected', 'connected');
            }
        });

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

        applyDimensions();

        if (!navigator.serial) {
            PANEL_IDS.forEach(id => {
                setPanelStatus(id, 'No WebSerial', 'error');
                const capId = id.charAt(0).toUpperCase() + id.slice(1);
                const btn = document.getElementById('connect' + capId);
                if (btn) btn.disabled = true;
            });
            return;
        }

        PANEL_IDS.forEach(id => {
            const capId = id.charAt(0).toUpperCase() + id.slice(1);
            document.getElementById('connect' + capId)
                ?.addEventListener('click', () => connectPanel(id));
        });

        document.getElementById('usbStreamBtn')
            ?.addEventListener('click', () => toggleStreaming(sourceCanvas));
    }

    return {
        get isStreaming() { return state.isStreaming; },
        get panelWidth() { return state.panelWidth; },
        get panelHeight() { return state.panelHeight; },
        get renderScale() { return RENDER_SCALE; },
        initControls,
        captureFrame,
        updatePanelDimensions,
    };
})();
