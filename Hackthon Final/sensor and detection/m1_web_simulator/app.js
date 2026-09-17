// ============================================================
// M1 Sensor Simulator — app.js  (v10 · Camera capture on accident)
// ============================================================
//
// All backend traffic goes through the M1 HTTPS server proxy:
//   WebSocket:  wss://<this-host>:8443/proxy/ws   -> M2 :8000/ws
//   SOS POST:   https://<this-host>:8443/proxy/sos -> M3 :4000/sos
//   Demo POST:  https://<this-host>:8443/proxy/demo-> M3 :4000/demo/trigger-sos
// This eliminates all mixed-content blocking (no http:// or ws:// from HTTPS).

// ─── On-screen debug logger (visible on Android without devtools) ─
(function () {
    const dbg = () => document.getElementById('debug-log');
    function log(color, ...args) {
        const el = dbg();
        if (!el) return;
        const line = document.createElement('div');
        line.style.color = color;
        line.textContent = '[' + new Date().toLocaleTimeString() + '] ' +
            args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        el.prepend(line);
        while (el.children.length > 30) el.lastChild.remove();
    }
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    console.log   = (...a) => { origLog(...a);   log('#0f0', '✓', ...a); };
    console.warn  = (...a) => { origWarn(...a);  log('#ff0', '⚠', ...a); };
    console.error = (...a) => { origError(...a); log('#f44', '✗', ...a); };
    window.onerror = (msg, src, line) => log('#f44', `ERROR: ${msg} (line ${line})`);
})();

// ─── HTTPS / Origin detection ──────────────────────────────────────
const IS_SECURE   = location.protocol === 'https:' || location.hostname === 'localhost';
const IS_FILE     = location.protocol === 'file:';
const IS_IOS      = /iphone|ipad|ipod/i.test(navigator.userAgent);
const IS_ANDROID  = /android/i.test(navigator.userAgent);
const IS_MOBILE   = IS_IOS || IS_ANDROID;

// ─── State ────────────────────────────────────────────────────────
let ws;
let isConnected = false;
let bufferedCount = 0;

let lastPos = null;
let lastPosTime = null;

let liveState = {
    gforce: 1.0,
    speed: 0,
    lat: 26.2183,   // Gwalior default
    lng: 78.1828,
    accuracy: 0.0
};

let sensorActive = false;  // true once startLiveSensors() runs
let realGPS      = false;  // true once GPS gives first fix
let realMotion   = false;  // true once devicemotion fires non-zero

// ─── Camera state ─────────────────────────────────────────────────
let cameraStream  = null;   // MediaStream from getUserMedia
let cameraReady   = false;  // true once video is playing
let lastAccidentPhoto = ''; // last captured base64 JPEG

// ─── UI element references ─────────────────────────────────────────
const ui = {
    status:            document.getElementById('connection-status'),
    gforce:            document.getElementById('val-gforce'),
    speed:             document.getElementById('val-speed'),
    lat:               document.getElementById('val-lat'),
    lng:               document.getElementById('val-lng'),
    subGforce:         document.getElementById('sub-gforce'),
    subSpeed:          document.getElementById('sub-speed'),
    subLat:            document.getElementById('sub-lat'),
    subAccuracy:       document.getElementById('sub-accuracy'),
    btnStartSensors:   document.getElementById('btn-start-sensors'),
    btnStopSensors:    document.getElementById('btn-stop-sensors'),
    simSpeed:          document.getElementById('sim-speed'),
    lblSpeed:          document.getElementById('lbl-speed'),
    simG:              document.getElementById('sim-g'),
    lblG:              document.getElementById('lbl-g'),
    simWeather:        document.getElementById('sim-weather'),
    btnNormal:         document.getElementById('btn-normal'),
    btnHardBrake:      document.getElementById('btn-hard-brake'),
    btnCrash:          document.getElementById('btn-crash'),
    log:               document.getElementById('log-container'),
    analysisPanel:     document.getElementById('analysis-panel'),
    sensorOverlay:     document.getElementById('sensor-overlay'),
    overlayEnableBtn:  document.getElementById('btn-overlay-enable'),
    httpsBanner:       document.getElementById('https-banner'),
    sensorBars:        document.getElementById('sensor-bars'),
    barX:              document.getElementById('bar-x'),
    barY:              document.getElementById('bar-y'),
    barZ:              document.getElementById('bar-z'),
    svalX:             document.getElementById('sval-x'),
    svalY:             document.getElementById('sval-y'),
    svalZ:             document.getElementById('sval-z'),
    permGpsState:      document.getElementById('perm-gps-state'),
    permMotionState:   document.getElementById('perm-motion-state'),
    permOrientState:   document.getElementById('perm-orient-state'),
    permSourceState:   document.getElementById('perm-source-state'),
    permCamState:      document.getElementById('perm-cam-state'),};

// ─── Permission badge helpers ──────────────────────────────────────
function setPermBadge(id, state) {
    // state: 'granted' | 'denied' | 'pending' | 'na'
    const badge = document.getElementById(id);
    if (!badge) return;
    const dot = badge.querySelector('.perm-dot');
    if (!dot) return;
    dot.className = 'perm-dot ' + state;
}
function setPermState(el, text, state) {
    if (!el) return;
    el.textContent = text;
    setPermBadge(el.id?.replace('-state', ''), state);
}

// ─── HTTPS / file:// banner ────────────────────────────────────────
function renderHttpsBanner() {
    const banner = ui.httpsBanner;
    if (!banner) return;

    if (IS_FILE) {
        banner.innerHTML = `
            <div class="https-banner-icon">⚠️</div>
            <div class="https-banner-body">
                <strong>Sensor APIs are blocked on file://</strong>
                <span>Run <code>python https_server.py</code> in the <em>m1_web_simulator</em> folder,
                then open <strong>https://localhost:8443</strong> to enable GPS, accelerometer &amp; gyroscope.</span>
            </div>`;
        banner.className = 'https-banner warn';
        banner.classList.remove('hidden');
    } else if (!IS_SECURE) {
        banner.innerHTML = `
            <div class="https-banner-icon">⚠️</div>
            <div class="https-banner-body">
                <strong>Not served over HTTPS</strong>
                <span>Sensor APIs require a secure origin. Switch to HTTPS.</span>
            </div>`;
        banner.className = 'https-banner warn';
        banner.classList.remove('hidden');
    } else {
        // Served securely — show mobile URL if on desktop
        const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const mobileUrl = isLocalHost ? `https://${location.hostname}:${location.port || 8443}` : location.origin;
        if (!IS_MOBILE) {
            banner.innerHTML = `
                <div class="https-banner-icon">✅</div>
                <div class="https-banner-body">
                    <strong>HTTPS · Sensors unlocked</strong>
                    <span>📱 Open on your phone: <a href="${mobileUrl}" target="_blank">${mobileUrl}</a>
                    ${isLocalHost ? "(accept the self-signed cert once → Advanced → Proceed)" : "(open in your phone browser to stream sensors)"}</span>
                </div>`;
            banner.className = 'https-banner ok';
            banner.classList.remove('hidden');
        }
    }
}

// ─── IndexedDB offline queue ───────────────────────────────────────
const dbName = 'M1BufferDB';
let db;
const dbReq = indexedDB.open(dbName, 1);
dbReq.onupgradeneeded = e => {
    db = e.target.result;
    db.createObjectStore('events', { autoIncrement: true });
};
dbReq.onsuccess = e => {
    db = e.target.result;
    flushOfflineQueue();
};

function saveOffline(ev) {
    if (!db) return;
    bufferedCount++;
    const tx = db.transaction('events', 'readwrite');
    tx.objectStore('events').add(ev);
    updateStatus(`Offline — ${bufferedCount} event${bufferedCount > 1 ? 's' : ''} buffered`, true);
}

function flushOfflineQueue() {
    if (!db || !isConnected) return;
    const tx = db.transaction('events', 'readwrite');
    const store = tx.objectStore('events');
    store.getAll().onsuccess = e => {
        const events = e.target.result;
        events.forEach(ev => ws.send(JSON.stringify(ev)));
        store.clear();
        bufferedCount = 0;
        if (events.length > 0) {
            updateStatus(`Connected (Flushed ${events.length} buffered)`);
            setTimeout(() => updateStatus('Connected'), 2500);
        }
    };
}

// ─── WebSocket via HTTPS proxy (/proxy/ws on same origin) ────
function connectWS() {
    // Always connect through the proxy on the same origin — no mixed content.
    // Proxy: wss://<host>:<port>/proxy/ws  →  ws://localhost:8000/ws (M2)
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const wsUrl  = isLocal ? `${scheme}://${location.host}/proxy/ws` : 'wss://segura-m2-ai-engine.onrender.com/ws';
    console.log(`WS connecting -> ${wsUrl}`);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        isConnected = true;
        updateStatus('Connected');
        flushOfflineQueue();
        console.log('WS connected');
    };
    ws.onclose = () => {
        isConnected = false;
        updateStatus(`Offline${bufferedCount > 0 ? ` — ${bufferedCount} events buffered` : ''}`, true);
        setTimeout(connectWS, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = msg => {
        try {
            const result = JSON.parse(msg.data);
            if (result.severity) renderAnalysis(result);
        } catch (e) {
            console.warn('WS parse error', e);
        }
    };
}

function updateStatus(text, isOffline = false) {
    ui.status.textContent = text;
    ui.status.className   = isOffline ? 'status-offline' : 'status-online';
}

// ─── Render M2 analysis result ─────────────────────────────────────
function renderAnalysis(result) {
    const sevColor  = { severe: '#ff3366', moderate: '#ff9800', minor: '#4caf50' };
    const riskColor = { critical: '#ff0844', high: '#ff6d00', medium: '#ffd600', low: '#66bb6a' };
    const sosSent   = result.severity === 'severe' || result.severity === 'moderate';
    ui.analysisPanel.innerHTML = `
        <div class="analysis-row">
            <span class="badge" style="background:${sevColor[result.severity] || '#555'}">${result.severity?.toUpperCase()}</span>
            <span class="badge" style="background:${riskColor[result.risk_label] || '#555'}">${result.risk_label?.toUpperCase()}</span>
            <span style="color:#aaa;font-size:13px">Score: ${result.risk_score?.toFixed(2)}</span>
        </div>
        <div style="color:#ccc;font-size:13px;margin-top:6px">${result.alert_message || ''}</div>
        ${result.hazard_zone ? `<div style="color:#ff9800;font-size:12px;margin-top:4px">⚠ Hazard Zone: ${result.hazard_zone}</div>` : ''}
        ${sosSent ? `<div style="margin-top:10px;padding:8px 12px;background:#ff336622;border:1px solid #ff3366;border-radius:6px;color:#ff3366;font-weight:700;font-size:13px;letter-spacing:0.5px">🚨 SOS Dispatched to Emergency Services via M3</div>` : ''}
    `;
    ui.analysisPanel.style.display = 'block';
}

// ─── Event logger ──────────────────────────────────────────────────
function logEvent(ev) {
    const el = document.createElement('div');
    const cls = ev.type === 'crash' ? 'crash' : ev.type === 'hard_brake' ? 'hard_brake' : 'normal';
    el.className = `log-item ${cls}`;
    const srcBadge = ev.source === 'real' ? '<span class="src-badge real">REAL</span>' : '<span class="src-badge sim">SIM</span>';
    el.innerHTML = `
        <div>
            <strong>${ev.type.replace('_', ' ').toUpperCase()}</strong>
            ${srcBadge}
            <span style="color:#888"> · ${ev.weather}</span><br>
            <small style="color:#666">${new Date(ev.timestamp).toLocaleTimeString()}</small>
        </div>
        <div style="text-align:right;font-size:14px">
            <span style="color:#fff">${ev.speed_kmh} <small>km/h</small></span><br>
            <span style="color:#ccc">${ev.impact_g} <small>g</small></span>
        </div>
    `;
    ui.log.prepend(el);
    while (ui.log.children.length > 8) ui.log.lastChild.remove();
}

// ─── SOS Countdown Modal state ─────────────────────────────────────
let sosCountdownTimer  = null;   // setInterval handle
let sosCountdownActive = false;  // prevent stacking multiple countdowns
let sosAudioCtx        = null;   // Web Audio context for buzzer

// ─── Play an urgent buzzer beep (Web Audio API — no file needed) ────
function playBuzzer(type = 'alert') {
    try {
        if (!sosAudioCtx) sosAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = sosAudioCtx;
        if (ctx.state === 'suspended') ctx.resume();

        const schedule = (freq, start, duration, gain = 0.6) => {
            const osc = ctx.createOscillator();
            const amp = ctx.createGain();
            osc.connect(amp);
            amp.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
            amp.gain.setValueAtTime(0, ctx.currentTime + start);
            amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
            amp.gain.linearRampToValueAtTime(0,    ctx.currentTime + start + duration);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime  + start + duration + 0.05);
        };

        if (type === 'alert') {
            // Three urgent beeps on countdown start
            schedule(880, 0.00, 0.15);
            schedule(880, 0.20, 0.15);
            schedule(1100, 0.40, 0.25, 0.7);
        } else if (type === 'tick') {
            // Soft tick each second
            schedule(660, 0.00, 0.06, 0.3);
        } else if (type === 'cancel') {
            // Descending tone on cancel
            schedule(660, 0.00, 0.12, 0.4);
            schedule(440, 0.15, 0.20, 0.3);
        }
    } catch (e) {
        console.warn('[Buzzer]', e.message);
    }
}

// ─── Actually dispatch SOS to M3 (called after countdown completes) ─
async function dispatchSOS(ev, severity) {
    const payload = {
        sos_id:    ev.event_id,
        timestamp: ev.timestamp,
        gps:       ev.gps,
        severity,
        speed_kmh: ev.speed_kmh,
        impact_g:  ev.impact_g,
        source:    ev.source,
        accident_photo: ev.accident_photo || ''
    };
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const proxyUrl = isLocal ? `${location.origin}/proxy/sos` : 'https://segura-m3-sos-server.onrender.com/sos';
    try {
        const res = await fetch(proxyUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (res.ok) {
            const banner = document.createElement('div');
            banner.style.cssText = 'margin-top:10px;padding:8px 12px;background:#ff336622;border:1px solid #ff3366;border-radius:6px;color:#ff3366;font-weight:700;font-size:13px';
            banner.textContent = `🚨 SOS Dispatched! Severity: ${severity.toUpperCase()}`;
            ui.analysisPanel.appendChild(banner);
            ui.analysisPanel.style.display = 'block';
            console.log(`[M1→M3] SOS sent: ${severity}`);
        }
    } catch (e) {
        console.warn('[M1→M3] SOS failed:', e.message);
    }
}

// ─── Show 10-second countdown modal, then dispatch if not cancelled ──
function sendDirectSOS(ev) {
    const speed = ev.speed_kmh;
    const g     = ev.impact_g;
    let severity = 'minor';
    // For real sensor events, g-force alone is sufficient to trigger
    if (ev.source === 'real') {
        if (g > 3.0) severity = 'severe';
        else if (g >= 2.0) severity = 'moderate';
    } else {
        if ((speed > 60 && g > 3.0) || (speed > 80 && g > 2.0)) severity = 'severe';
        else if (speed >= 30 && g >= 2.0) severity = 'moderate';
    }
    if (severity === 'minor') return;

    // Don't stack multiple countdowns
    if (sosCountdownActive) return;
    sosCountdownActive = true;

    // Populate modal info
    const modal    = document.getElementById('sos-countdown-modal');
    const numEl    = document.getElementById('sos-countdown-num');
    const ringFill = document.getElementById('sos-ring-fill');
    const infoG    = document.getElementById('sos-info-g');
    const infoSpd  = document.getElementById('sos-info-speed');
    const infoLoc  = document.getElementById('sos-info-loc');

    infoG.textContent   = `${g.toFixed(2)} g`;
    infoSpd.textContent = `${Math.round(speed)} km/h`;
    infoLoc.textContent = `${ev.gps.lat.toFixed(4)}, ${ev.gps.lng.toFixed(4)}`;

    // SVG ring: circumference = 2π×52 ≈ 326.73
    const CIRC = 326.73;
    const TOTAL_SECS = 10;
    let remaining = TOTAL_SECS;

    ringFill.style.strokeDashoffset = '0';
    numEl.textContent = remaining;
    modal.classList.remove('hidden');
    playBuzzer('alert');  // Three urgent beeps on SOS start

    function cancelCountdown(cancelled) {
        clearInterval(sosCountdownTimer);
        sosCountdownTimer  = null;
        sosCountdownActive = false;
        modal.classList.add('hidden');
        if (!cancelled) {
            dispatchSOS(ev, severity);
        } else {
            playBuzzer('cancel');  // Descending tone on cancel
            console.log('[SOS] Cancelled by user — not dispatching');
            const banner = document.createElement('div');
            banner.style.cssText = 'margin-top:10px;padding:8px 12px;background:rgba(16,185,129,0.15);border:1px solid #10b981;border-radius:6px;color:#10b981;font-weight:700;font-size:13px';
            banner.textContent = '✓ SOS Cancelled — Stay safe!';
            ui.analysisPanel.appendChild(banner);
            ui.analysisPanel.style.display = 'block';
            setTimeout(() => banner.remove(), 5000);
        }
    }

    // Wire cancel button
    const cancelBtn = document.getElementById('sos-cancel-btn');
    const onCancel = () => { cancelBtn.removeEventListener('click', onCancel); cancelCountdown(true); };
    cancelBtn.addEventListener('click', onCancel);

    sosCountdownTimer = setInterval(() => {
        remaining--;
        numEl.textContent = remaining;
        playBuzzer('tick');  // Soft tick every second
        // Drain the ring as time passes
        ringFill.style.strokeDashoffset = ((TOTAL_SECS - remaining) / TOTAL_SECS * CIRC).toFixed(2);
        // Turn ring orange at 5s, white at 2s for urgency
        if (remaining <= 2) ringFill.style.stroke = '#fff';
        else if (remaining <= 5) ringFill.style.stroke = '#f59e0b';
        if (remaining <= 0) {
            cancelBtn.removeEventListener('click', onCancel);
            cancelCountdown(false);
        }
    }, 1000);
}

// ─── Emit event ────────────────────────────────────────────────────
function emitEvent(type, sourceOverride) {
    const source = sourceOverride || (realMotion || realGPS ? 'real' : 'simulated');

    // When live sensors are active, prefer real GPS speed over the slider value
    // This ensures sendDirectSOS() speed thresholds are evaluated correctly
    const speedKmh = (sensorActive && liveState.speed > 0)
        ? liveState.speed
        : parseFloat(ui.simSpeed.value);

    const ev = {
        event_id:  crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type,
        gps: {
            lat:        liveState.lat,
            lng:        liveState.lng,
            accuracy_m: liveState.accuracy || 10.0
        },
        speed_kmh: speedKmh,
        impact_g:  liveState.gforce > 0 && sensorActive ? liveState.gforce : parseFloat(ui.simG.value),
        weather:   ui.simWeather.value,
        source,
        accident_photo: ''
    };

    if (isConnected) {
        ws.send(JSON.stringify(ev));
    } else {
        saveOffline(ev);
    }

    if (type === 'crash' || type === 'hard_brake') {
        sendDirectSOS(ev);
    }

    logEvent(ev);
}

// ─── Range input listeners ─────────────────────────────────────────
ui.simSpeed.addEventListener('input', e => ui.lblSpeed.textContent = e.target.value);
ui.simG.addEventListener('input', e => ui.lblG.textContent = parseFloat(e.target.value).toFixed(1));

ui.btnNormal.addEventListener('click', () => {
    ui.simG.value = 0.8; ui.lblG.textContent = '0.8';
    emitEvent('normal');
});
ui.btnHardBrake.addEventListener('click', () => {
    const g = parseFloat(ui.simG.value);
    if (g < 1.5 || g > 2.5) { ui.simG.value = 2.0; ui.lblG.textContent = '2.0'; }
    emitEvent('hard_brake');
});
ui.btnCrash.addEventListener('click', () => {
    if (parseFloat(ui.simG.value) < 3.0)        { ui.simG.value = 3.5; ui.lblG.textContent = '3.5'; }
    if (parseFloat(ui.simSpeed.value) < 61)      { ui.simSpeed.value = 75; ui.lblSpeed.textContent = '75'; }
    emitEvent('crash');
});

// ─── updateGForce ──────────────────────────────────────────────────
function updateGForce(g, ax, ay, az) {
    liveState.gforce = g;
    const clamped = Math.min(g, 5.0);
    ui.gforce.innerHTML = `${g.toFixed(2)} <span>g</span>`;
    ui.gforce.style.color = g > 2.5 ? '#ff3366' : g > 1.5 ? '#ff9800' : '#fff';
    ui.simG.value = clamped.toFixed(2);
    ui.lblG.textContent = clamped.toFixed(2);
    ui.subGforce.textContent = 'live accelerometer';

    // Update sensor bars if raw axes provided
    if (ax !== undefined) {
        const maxG = 4;
        const pct = v => Math.min(Math.abs(v) / maxG * 100, 100);
        ui.barX.style.width = pct(ax) + '%';
        ui.barY.style.width = pct(ay) + '%';
        ui.barZ.style.width = pct(az) + '%';
        ui.svalX.textContent = ax.toFixed(2);
        ui.svalY.textContent = ay.toFixed(2);
        ui.svalZ.textContent = az.toFixed(2);
    }
}

// ─── iOS sensor permission flow ────────────────────────────────────
function showPermissionOverlay() {
    ui.sensorOverlay.classList.remove('hidden');
}
function hidePermissionOverlay() {
    ui.sensorOverlay.classList.add('hidden');
}

async function requestIOSMotionPermission() {
    // iOS 13+ requires DeviceMotionEvent.requestPermission() inside a user gesture
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const state = await DeviceMotionEvent.requestPermission();
            setPermBadge('perm-motion', state === 'granted' ? 'granted' : 'denied');
            ui.permMotionState.textContent = state;
            if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
                const ostate = await DeviceOrientationEvent.requestPermission();
                setPermBadge('perm-orient', ostate === 'granted' ? 'granted' : 'denied');
                ui.permOrientState.textContent = ostate;
            }
            return state === 'granted';
        } catch (e) {
            console.error('iOS motion permission error', e);
            return false;
        }
    }
    // Android / Chrome: permission not needed via JS API
    return true;
}

// Overlay tap handler
if (ui.overlayEnableBtn) {
    ui.overlayEnableBtn.addEventListener('click', async () => {
        ui.overlayEnableBtn.textContent = '⏳ Requesting permissions…';
        ui.overlayEnableBtn.disabled = true;
        const granted = await requestIOSMotionPermission();
        hidePermissionOverlay();
        if (granted) {
            startLiveSensors();
        } else {
            alert('Sensor permission denied. Manual controls still work.');
        }
    });
}

// ─── Enable Real Sensors button ────────────────────────────────────
ui.btnStartSensors.addEventListener('click', () => {
    if (!IS_SECURE && !IS_FILE) {
        alert('Sensors require HTTPS. Serve this page with https_server.py');
        return;
    }
    // On iOS show the overlay (must be inside a tap gesture)
    if (IS_IOS) {
        showPermissionOverlay();
    } else {
        startLiveSensors();
    }
});

// Stop Sensors button
if (ui.btnStopSensors) {
    ui.btnStopSensors.addEventListener('click', stopLiveSensors);
}

// ─── Sensor variables ──────────────────────────────────────────────
let watchId = null;
let lastOrient = null;
let orientCrashCooldown = false;
let motionCrashCooldown = false;   // ← NEW: prevents 60Hz SOS spam
let motionHandler = null;
let orientHandler = null;

function stopLiveSensors() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (motionHandler)    { window.removeEventListener('devicemotion', motionHandler); motionHandler = null; }
    if (orientHandler)    { window.removeEventListener('deviceorientation', orientHandler); orientHandler = null; }
    sensorActive = false;
    realMotion   = false;
    realGPS      = false;
    ui.btnStartSensors.textContent = '📡 Enable Real Sensors';
    ui.btnStartSensors.disabled = false;
    ui.btnStopSensors?.classList.add('hidden');
    ui.sensorBars.style.display = 'none';
    ui.subGforce.textContent = 'simulated';
    ui.subSpeed.textContent = 'simulated';
    ui.permMotionState.textContent = '—';
    ui.permOrientState.textContent = '—';
    ui.permGpsState.textContent = '—';
    setPermBadge('perm-motion', 'pending');
    setPermBadge('perm-orient', 'pending');
    setPermBadge('perm-gps', 'pending');
    ui.permSourceState.textContent = 'SIM';    console.log('Sensors stopped');
}

// ─── startLiveSensors ──────────────────────────────────────────────
function startLiveSensors() {
    if (sensorActive) return;
    sensorActive = true;

    ui.btnStartSensors.textContent = '● Live Sensors Active';
    ui.btnStartSensors.disabled = true;
    ui.btnStopSensors?.classList.remove('hidden');
    ui.sensorBars.style.display = 'block';
    ui.permSourceState.textContent = 'REAL';    let motionFired = false;

    // ── A) Real devicemotion (Android + physical devices) ──────────
    motionHandler = (e) => {
        const ax = e.accelerationIncludingGravity?.x ?? 0;
        const ay = e.accelerationIncludingGravity?.y ?? 0;
        const az = e.accelerationIncludingGravity?.z ?? 0;
        const g  = Math.sqrt(ax * ax + ay * ay + az * az) / 9.81;
        if (g < 0.05) return;

        if (!motionFired) {
            motionFired = true;
            realMotion  = true;
            setPermBadge('perm-motion', 'granted');
            ui.permMotionState.textContent = 'granted';
            console.log('devicemotion active');
        }

        updateGForce(g, ax / 9.81, ay / 9.81, az / 9.81);

        // Cooldown prevents firing SOS on every accelerometer tick (60Hz)
        if (!motionCrashCooldown) {
            if (g > 2.5) {
                motionCrashCooldown = true;
                emitEvent('crash', 'real');
                setTimeout(() => { motionCrashCooldown = false; }, 2000);
            } else if (g > 1.5) {
                motionCrashCooldown = true;
                emitEvent('hard_brake', 'real');
                setTimeout(() => { motionCrashCooldown = false; }, 1500);
            }
        }
    };
    window.addEventListener('devicemotion', motionHandler);

    // Show pending while waiting
    setPermBadge('perm-motion', 'pending');
    ui.permMotionState.textContent = 'pending…';

    // ── B) Orientation (DevTools spoof + gyro backup) ──────────────
    orientHandler = (e) => {
        if (e.beta === null && e.gamma === null) return;

        const betaRad  = (e.beta  || 0) * Math.PI / 180;
        const gammaRad = (e.gamma || 0) * Math.PI / 180;
        const now      = Date.now();

        const gStatic = Math.sqrt(
            Math.pow(Math.sin(gammaRad), 2) +
            Math.pow(Math.sin(betaRad) * Math.cos(gammaRad), 2) +
            Math.pow(Math.cos(betaRad) * Math.cos(gammaRad), 2)
        );

        let impactG = gStatic;
        if (lastOrient) {
            const dt     = Math.max(now - lastOrient.time, 8);
            const dBeta  = Math.abs((e.beta  || 0) - lastOrient.beta);
            const dGamma = Math.abs((e.gamma || 0) - lastOrient.gamma);
            const angV   = (dBeta + dGamma) / dt;
            impactG = Math.min(gStatic + angV * 4.0, 5.0);
        }
        lastOrient = { beta: e.beta || 0, gamma: e.gamma || 0, time: now };

        // Badge update once
        setPermBadge('perm-orient', 'granted');
        ui.permOrientState.textContent = 'granted';

        if (!motionFired) {
            updateGForce(impactG);
        }

        if (!orientCrashCooldown) {
            if (impactG > 2.5) {
                orientCrashCooldown = true;
                emitEvent('crash');
                setTimeout(() => { orientCrashCooldown = false; }, 2000);
            } else if (impactG > 1.5) {
                orientCrashCooldown = true;
                emitEvent('hard_brake');
                setTimeout(() => { orientCrashCooldown = false; }, 1500);
            }
        }
    };
    window.addEventListener('deviceorientation', orientHandler);

    setPermBadge('perm-orient', 'pending');
    ui.permOrientState.textContent = 'pending…';

    // ── C) GPS geolocation ─────────────────────────────────────────
    if ('geolocation' in navigator) {
        setPermBadge('perm-gps', 'pending');
        ui.permGpsState.textContent = 'pending…';

        watchId = navigator.geolocation.watchPosition(
            pos => {
                const now = Date.now();
                let speedKmh = 0;

                if (pos.coords.speed !== null && pos.coords.speed >= 0) {
                    speedKmh = pos.coords.speed * 3.6;
                } else if (lastPos && lastPosTime) {
                    const dLat = (pos.coords.latitude  - lastPos.lat) * Math.PI / 180;
                    const dLng = (pos.coords.longitude - lastPos.lng) * Math.PI / 180;
                    const a    = Math.sin(dLat / 2) ** 2 +
                        Math.cos(lastPos.lat * Math.PI / 180) *
                        Math.cos(pos.coords.latitude  * Math.PI / 180) *
                        Math.sin(dLng / 2) ** 2;
                    const distM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    const dtSec = (now - lastPosTime) / 1000;
                    speedKmh = dtSec > 0 ? (distM / dtSec) * 3.6 : 0;
                }

                liveState.lat      = pos.coords.latitude;
                liveState.lng      = pos.coords.longitude;
                liveState.accuracy = pos.coords.accuracy;
                liveState.speed    = speedKmh;
                lastPos     = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                lastPosTime = now;

                if (!realGPS) {
                    realGPS = true;
                    setPermBadge('perm-gps', 'granted');
                    ui.permGpsState.textContent = 'granted';
                    ui.subLat.textContent = 'live GPS';
                    console.log(`GPS fix: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                }

                ui.lat.textContent  = liveState.lat.toFixed(6);
                ui.lng.textContent  = liveState.lng.toFixed(6);
                ui.speed.innerHTML  = `${Math.round(speedKmh)} <span>km/h</span>`;
                ui.subSpeed.textContent = 'live GPS';
                ui.subAccuracy.textContent = `±${Math.round(pos.coords.accuracy)}m`;
                ui.simSpeed.value   = Math.round(speedKmh);
                ui.lblSpeed.textContent = Math.round(speedKmh);
            },
            err => {
                console.warn('GPS error:', err.message);
                setPermBadge('perm-gps', 'denied');
                ui.permGpsState.textContent = 'denied';
                ui.subLat.textContent = 'GPS denied — using default (Gwalior)';
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    } else {
        ui.permGpsState.textContent = 'n/a';
        setPermBadge('perm-gps', 'na');
    }
}

// ─── Auto-show iOS overlay on page load ───────────────────────────
// We do NOT auto-request on load; sensors need a gesture on iOS.
// On Android we just show the "Enable Real Sensors" button.
window.addEventListener('DOMContentLoaded', () => {
    renderHttpsBanner();

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            themeToggleBtn.textContent = isLight ? '☀️ Light Theme' : '🌙 Dark Theme';
        });
    }

    if (IS_MOBILE) {
        // On mobile: pre-set default lat/lng display from Gwalior
        ui.lat.textContent = liveState.lat.toFixed(6);
        ui.lng.textContent = liveState.lng.toFixed(6);
        ui.subLat.textContent = 'tap Enable Sensors for GPS';
    }

    if (!IS_SECURE && IS_FILE) {
        // Sensor APIs won't work from file://, show warning in permission badges
        ui.permGpsState.textContent = 'blocked';
        ui.permMotionState.textContent = 'blocked';
        ui.permOrientState.textContent = 'blocked';        setPermBadge('perm-gps', 'denied');
        setPermBadge('perm-motion', 'denied');
        setPermBadge('perm-orient', 'denied');    }
});

// ─── Start WebSocket ──────────────────────────────────────────────
connectWS();

// ─── Demo SOS Button ──────────────────────────────────────────────
const btnDemo = document.getElementById('btn-demo');
if (btnDemo) {
    btnDemo.addEventListener('click', () => {
        ui.simSpeed.value = '85';    ui.lblSpeed.textContent = '85';
        ui.simG.value     = '4.2';   ui.lblG.textContent = '4.2';
        ui.simWeather.value = 'clear';

        btnDemo.disabled    = true;
        btnDemo.textContent = 'Sending SOS...';

        emitEvent('crash', 'simulated');

        // Also fire the /proxy/demo route for M3 demo trigger
        fetch(`${location.origin}/proxy/demo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'demo_btn' })
        }).catch(e => console.warn('[demo proxy]', e.message));

        setTimeout(() => {
            btnDemo.disabled    = false;
            btnDemo.textContent = '\uD83D\uDEA8 Fire Demo SOS';
        }, 1500);
    });
}
