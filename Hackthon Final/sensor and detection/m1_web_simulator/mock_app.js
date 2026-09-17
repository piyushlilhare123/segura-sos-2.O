// ============================================================
// M1 Sensor Simulator — MOCK DESKTOP APP (No App / Phone Needed)
// ============================================================

const ui = {
    status:        document.getElementById('connection-status'),
    log:           document.getElementById('log-container'),
    simSpeed:      document.getElementById('sim-speed'),
    simG:          document.getElementById('sim-g'),
    lblSpeed:      document.getElementById('lbl-speed'),
    lblG:          document.getElementById('lbl-g'),
    simLoc:        document.getElementById('sim-loc'),
    simWeather:    document.getElementById('sim-weather'),
    analysisPanel: document.getElementById('analysis-panel')
};

let ws = null;
let isConnected = false;

// Direct local URLs
const M2_WS_URL = 'ws://localhost:8000/ws';
const M3_SOS_URL = 'http://localhost:4000/sos';
const M3_DEMO_URL = 'http://localhost:4000/demo/trigger-sos';

function connectWS() {
    console.log(`Connecting to M2 directly at ${M2_WS_URL}`);
    ws = new WebSocket(M2_WS_URL);

    ws.onopen = () => {
        isConnected = true;
        updateStatus('Connected to M2');
        console.log('WS connected to M2');
    };
    ws.onclose = () => {
        isConnected = false;
        updateStatus('Offline', true);
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

function renderAnalysis(result) {
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
            <h3 style="margin:0; font-size:16px;">Severity: 
                <span style="color:${result.severity === 'severe' ? '#ff3366' : result.severity === 'moderate' ? '#ff9933' : '#33cc66'}">
                    ${result.severity.toUpperCase()}
                </span>
            </h3>
            <span style="font-size:12px; color:#999">Risk: ${result.risk_score} (${result.risk_label})</span>
        </div>
    `;
    if (result.action_required) {
        html += `<div style="padding:8px 12px; background:#ff336622; border:1px solid #ff3366; border-radius:6px; color:#ff3366; font-size:13px; font-weight:700;">🚨 AUTO-SOS DISPATCHED TO RESPONDERS</div>`;
    }
    ui.analysisPanel.innerHTML = html;
    ui.analysisPanel.style.display = 'block';

    setTimeout(() => { ui.analysisPanel.style.display = 'none'; }, 8000);
}

function logEventToUI(ev) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.innerHTML = `
        <div>
            <span class="source-badge badge-sim">MOCK</span>
            <strong style="color: ${ev.type === 'crash' ? '#ff3366' : '#fff'}">${ev.type.toUpperCase()}</strong>
            <br>
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

async function sendDirectSOS(ev) {
    const speed = ev.speed_kmh;
    const g     = ev.impact_g;
    let severity = 'minor';
    if ((speed > 60 && g > 3.0) || (speed > 80 && g > 2.0)) severity = 'severe';
    else if (speed >= 30 && g >= 2.0) severity = 'moderate';
    
    if (severity === 'minor') return;

    const payload = {
        sos_id:    ev.event_id,
        timestamp: ev.timestamp,
        gps:       ev.gps,
        severity,
        speed_kmh: ev.speed_kmh,
        impact_g:  ev.impact_g,
        source:    ev.source
    };

    try {
        const res = await fetch(M3_SOS_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (res.ok) {
            console.log(`[M1→M3] SOS sent directly: ${severity}`);
        }
    } catch (e) {
        console.warn('[M1→M3] SOS failed:', e.message);
    }
}

function emitEvent(type, sourceOverride = 'mock_desktop') {
    const coords = ui.simLoc.value.split(',');
    
    const ev = {
        event_id:  crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type,
        gps: {
            lat:        parseFloat(coords[0]),
            lng:        parseFloat(coords[1]),
            accuracy_m: 5.0
        },
        speed_kmh:   parseFloat(ui.simSpeed.value),
        impact_g:    parseFloat(ui.simG.value),
        weather:     ui.simWeather.value,
        source:      sourceOverride
    };

    logEventToUI(ev);
    if (!isConnected) return;
    
    ws.send(JSON.stringify(ev));
    sendDirectSOS(ev);
}

// ─── Setup UI Listeners ─────────────────────────────────────────────
ui.simSpeed.oninput = e => { ui.lblSpeed.textContent = e.target.value; };
ui.simG.oninput     = e => { ui.lblG.textContent = e.target.value; };

document.getElementById('btn-normal').onclick     = () => emitEvent('motion');
document.getElementById('btn-hard-brake').onclick = () => emitEvent('hard_brake');
document.getElementById('btn-crash').onclick      = () => emitEvent('crash');

const btnDemo = document.getElementById('btn-demo');
btnDemo.onclick = () => {
    ui.simSpeed.value   = '95';
    ui.lblSpeed.textContent = '95';
    ui.simG.value       = '4.2';
    ui.lblG.textContent = '4.2';
    ui.simLoc.value     = '26.2183,78.1828'; // Gwalior
    ui.simWeather.value = 'clear';

    btnDemo.disabled    = true;
    btnDemo.textContent = 'Sending Demo SOS...';

    emitEvent('crash', 'demo_btn');

    fetch(M3_DEMO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'demo_btn_desktop' })
    }).catch(e => console.warn('[demo] fetch failed:', e.message));

    setTimeout(() => {
        btnDemo.disabled    = false;
        btnDemo.textContent = '🚨 Fire Demo SOS';
    }, 1500);
};

// Auto heartbeat every 2 secs
setInterval(() => {
    if (!isConnected) return;
    const coords = ui.simLoc.value.split(',');
    const ev = {
        event_id:  crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'motion',
        gps: {
            lat:        parseFloat(coords[0]),
            lng:        parseFloat(coords[1]),
            accuracy_m: 5.0
        },
        speed_kmh:   40.0, // always safe speed to prevent recurring crash detection
        impact_g:    1.0,  // always safe impact
        weather:     ui.simWeather.value,
        source:      'mock_heartbeat'
    };
    ws.send(JSON.stringify(ev));
}, 2000);

connectWS();
