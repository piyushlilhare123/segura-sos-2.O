const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const https = require('https');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory stores (declared early so WS handler can reference them) ──
const incidents = [];
const sosLogs = [];
const telemetryLogs = [];

// ── Twilio Configuration — loaded from environment variables ──────
// Set these in Render dashboard: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_FROM_NUMBER, EMERGENCY_SERVICES_NUMBER
const TWILIO_ACCOUNT_SID         = process.env.TWILIO_ACCOUNT_SID         || '';
const TWILIO_AUTH_TOKEN          = process.env.TWILIO_AUTH_TOKEN          || '';
const TWILIO_FROM_NUMBER         = process.env.TWILIO_FROM_NUMBER         || '';
const EMERGENCY_SERVICES_NUMBER  = process.env.EMERGENCY_SERVICES_NUMBER  || '';

let twilioClient;
try {
    if (TWILIO_ACCOUNT_SID.startsWith('AC') && TWILIO_ACCOUNT_SID !== 'AC_dummy_account_sid') {
        twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    }
} catch (error) {
    console.error('Failed to initialize Twilio client:', error.message);
}

// ── WebSocket Server (M3 → M4 real-time SOS broadcast) ────────
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`[M3 WS] Client connected (total: ${wsClients.size})`);
    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`[M3 WS] Client disconnected (total: ${wsClients.size})`);
    });
    ws.on('error', (err) => console.error('[M3 WS] Error:', err.message));
    // Send last 5 SOS on connect so M4 has initial state
    ws.send(JSON.stringify({ type: 'history', data: sosLogs.slice(0, 5) }));
});

function broadcastSOS(entry) {
    const msg = JSON.stringify({ type: 'sos', data: entry });
    wsClients.forEach(ws => {
        if (ws.readyState === ws.OPEN) ws.send(msg);
    });
}

let lastTwilioCallTime = 0;
const TWILIO_COOLDOWN_MS = 60000; // 1 call per minute max

// ── Haversine Distance (km) ───────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Nearest Hospital Finder (OpenStreetMap Overpass API) ──────
async function findNearbyHospitals(lat, lng, radiusMeters = 10000) {
    const query = `[out:json][timeout:10];(
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      relation["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
    );out center body;`;

    const postData = `data=${encodeURIComponent(query)}`;
    const options = {
        hostname: 'overpass-api.de',
        port: 443,
        path: '/api/interpreter',
        method: 'POST',
        timeout: 10000,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'SeguraSOS/1.0'
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const hospitals = (json.elements || [])
                        .map(el => {
                            const hLat = el.lat || el.center?.lat;
                            const hLng = el.lon || el.center?.lon;
                            if (!hLat || !hLng) return null;
                            const dist = haversineKm(lat, lng, hLat, hLng);
                            const etaMin = Math.round((dist / 30) * 60); // 30 km/h avg ambulance speed in Indian cities
                            return {
                                name: el.tags?.name || el.tags?.['name:en'] || 'Hospital',
                                lat: hLat,
                                lng: hLng,
                                distance_km: parseFloat(dist.toFixed(2)),
                                eta_minutes: etaMin < 1 ? 1 : etaMin,
                                phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
                                emergency: el.tags?.emergency === 'yes'
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.distance_km - b.distance_km)
                        .slice(0, 5);
                    console.log(`[HOSPITAL FINDER] Found ${hospitals.length} hospitals near ${lat},${lng}`);
                    resolve(hospitals);
                } catch (e) {
                    console.error('[HOSPITAL FINDER] Parse error:', e.message);
                    console.error('[HOSPITAL FINDER] Response (first 200 chars):', data.substring(0, 200));
                    resolve([]);
                }
            });
        });
        req.on('error', (e) => {
            console.error('[HOSPITAL FINDER] Network error:', e.message);
            resolve([]);
        });
        req.on('timeout', () => {
            req.destroy();
            console.error('[HOSPITAL FINDER] Timeout');
            resolve([]);
        });
        req.write(postData);
        req.end();
    });
}

async function sendTwilioAlert(payload) {
    if (!twilioClient) {
        console.log('[Twilio CALL] Skipping call alert, invalid or missing credentials.');
        return;
    }

    const now = Date.now();
    if (now - lastTwilioCallTime < TWILIO_COOLDOWN_MS) {
        console.log(`[Twilio CALL] Skipped due to rate limit (${Math.round((TWILIO_COOLDOWN_MS - (now - lastTwilioCallTime))/1000)}s remaining)`);
        return;
    }
    lastTwilioCallTime = now;

    try {
        const lat = payload.gps?.lat ?? payload.latitude ?? 'unknown';
        const lng = payload.gps?.lng ?? payload.longitude ?? 'unknown';
        const severity = (payload.severity || 'severe').toUpperCase();

        // TwiML spoken message for the emergency call
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">
    Alert! Alert! This is an automated emergency call from Segura S O S.
    A ${severity} crash has been detected.
    Location: Latitude ${lat}, Longitude ${lng}.
    A driver needs immediate assistance. Please respond immediately.
    Repeating. A ${severity} crash has been detected at Latitude ${lat}, Longitude ${lng}.
    This was an automated alert from Segura S O S.
  </Say>
</Response>`;

        await twilioClient.calls.create({
            twiml: twiml,
            from: TWILIO_FROM_NUMBER,
            to: EMERGENCY_SERVICES_NUMBER
        });
        console.log(`[Twilio CALL] Emergency call dispatched to ${EMERGENCY_SERVICES_NUMBER}`);
    } catch (error) {
        console.error('[Twilio CALL] Error placing call:', error.message);
    }
}

// ── POST /sos  (M2 AI Engine + web/React PWA clients) ─────────
app.post('/sos', async (req, res) => {
    console.log('[SOS /sos RECEIVED]', req.body);
    const lat = req.body.gps?.lat ?? req.body.latitude;
    const lng = req.body.gps?.lng ?? req.body.longitude;

    // Find nearby hospitals (non-blocking, with fallback)
    let hospitals = [];
    if (lat && lng) {
        hospitals = await findNearbyHospitals(lat, lng);
    }

    const entry = {
        id: req.body.sos_id || Date.now().toString(),
        timestamp: new Date().toISOString(),
        status: 'sent',
        source: req.body.source || 'm2_ai_engine',
        payload: req.body,
        hospitals: hospitals,
        golden_hour_start: new Date().toISOString()
    };
    sosLogs.unshift(entry);
    if (sosLogs.length > 100) sosLogs.pop();

    // Real-time push to M4 via WebSocket
    broadcastSOS(entry);

    // Trigger Twilio SMS async
    sendTwilioAlert(req.body);

    res.status(200).json({ success: true, received: true, message: 'SOS dispatched to emergency responders.', hospitals });
});

// ── POST /demo/trigger-sos  (Emergency test trigger button) ──────────
app.post('/demo/trigger-sos', async (req, res) => {
    // Indian road locations for realistic demo
    const locations = [
        { lat: 28.6139, lng: 77.2090, city: 'New Delhi' },
        { lat: 19.0760, lng: 72.8777, city: 'Mumbai' },
        { lat: 12.9716, lng: 77.5946, city: 'Bengaluru' },
        { lat: 13.0827, lng: 80.2707, city: 'Chennai' },
        { lat: 22.5726, lng: 88.3639, city: 'Kolkata' },
    ];
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const sosId = `demo-${Date.now()}`;

    const demoPayload = {
        sos_id: sosId,
        timestamp: new Date().toISOString(),
        gps: { lat: loc.lat + (Math.random() - 0.5) * 0.05, lng: loc.lng + (Math.random() - 0.5) * 0.05, accuracy_m: 5 },
        severity: 'severe',
        speed_kmh: Math.floor(Math.random() * 40 + 70),   // 70–110 km/h
        impact_g: parseFloat((Math.random() * 2 + 3.5).toFixed(2)), // 3.5–5.5 g
        source: 'demo_trigger',
        city: loc.city
    };

    // Find nearby hospitals for demo location
    const hospitals = await findNearbyHospitals(loc.lat, loc.lng);

    const entry = {
        id: sosId,
        timestamp: demoPayload.timestamp,
        status: 'sent',
        source: 'demo_trigger',
        payload: demoPayload,
        hospitals: hospitals,
        golden_hour_start: new Date().toISOString()
    };
    sosLogs.unshift(entry);
    if (sosLogs.length > 100) sosLogs.pop();

    broadcastSOS(entry);
    sendTwilioAlert(demoPayload);

    console.log(`[DEMO SOS] Triggered: ${demoPayload.severity} crash near ${loc.city} | ${hospitals.length} hospitals found`);
    res.status(200).json({ success: true, sos_id: sosId, location: loc.city, payload: demoPayload, hospitals });
});

// ── POST /api/v1/sos  (legacy / external clients) ──────────────
app.post('/api/v1/sos', async (req, res) => {
    console.log('[SOS /api/v1/sos RECEIVED]', req.body);
    const lat = req.body.gps?.lat ?? req.body.latitude;
    const lng = req.body.gps?.lng ?? req.body.longitude;

    let hospitals = [];
    if (lat && lng) {
        hospitals = await findNearbyHospitals(lat, lng);
    }

    const entry = {
        id: req.body.recordId || req.body.sos_id || Date.now().toString(),
        timestamp: new Date().toISOString(),
        status: 'sent',
        source: 'android',
        payload: req.body,
        hospitals: hospitals,
        golden_hour_start: new Date().toISOString()
    };
    sosLogs.unshift(entry);
    if (sosLogs.length > 100) sosLogs.pop();

    // Real-time push to M4 via WebSocket
    broadcastSOS(entry);

    // Trigger Twilio SMS async
    sendTwilioAlert(req.body);

    res.status(200).json({ success: true, received: true, message: 'SOS dispatched to emergency responders.', hospitals });
});

// ── POST /api/v1/telemetry (M1 Android Telemetry) ─────────────
app.post('/api/v1/telemetry', (req, res) => {
    // console.log('[TELEMETRY]', req.body); // Uncomment to see live stream, it's very noisy
    const entry = {
        timestamp: new Date().toISOString(),
        ...req.body
    };
    telemetryLogs.unshift(entry);
    if (telemetryLogs.length > 500) telemetryLogs.pop();
    res.status(200).json({ received: true });
});

// ── GET /sos-logs  (React SOS history screen) ─────────────────
app.get('/sos-logs', (req, res) => {
    res.status(200).json({
        status: 'success',
        count: sosLogs.length,
        data: sosLogs.slice(0, 10)   // last 10
    });
});

// ── POST /incident  (M4 community report form) ────────────────
app.post('/incident', (req, res) => {
    console.log('[INCIDENT REPORTED]', req.body);
    const newIncident = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...req.body
    };
    incidents.unshift(newIncident);
    if (incidents.length > 200) incidents.pop();
    res.status(201).json({ success: true, incident: newIncident });
});

// ── GET /incidents  (M4 map & community feed) ─────────────────
app.get('/incidents', (req, res) => {
    res.status(200).json({ status: 'success', count: incidents.length, data: incidents });
});

// ── GET /api/nearby-hospitals  (standalone hospital lookup) ────
app.get('/api/nearby-hospitals', async (req, res) => {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng query parameters are required' });
    }
    const hospitals = await findNearbyHospitals(
        parseFloat(lat),
        parseFloat(lng),
        parseInt(radius) || 10000
    );
    res.status(200).json({ status: 'success', count: hospitals.length, hospitals });
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', module: 'M3 SOS Server', port: PORT });
});

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`
${'─'.repeat(60)}
  Segura SOS — M3 SOS Server  http://localhost:${PORT}
${'─'.repeat(60)}`);
    console.log(`  GET  /                → 🎛  SOS Dashboard (presenter view)`);
    console.log(`  WS   ws://localhost:${PORT}/     → M4 real-time SOS broadcast`);
    console.log(`  POST /sos             → M2 AI Engine SOS dispatch`);
    console.log(`  POST /demo/trigger-sos→ 🎯 Emergency test trigger`);
    console.log(`  GET  /sos-logs        → SOS history (last 10)`);
    console.log(`  POST /incident        → Community report`);
    console.log(`  GET  /incidents       → All incidents`);
    console.log(`  GET  /health          → Health check`);
    console.log('─'.repeat(60));
    if (!twilioClient) {
        console.log(`  ⚠  Twilio: set env vars TWILIO_ACCOUNT_SID / AUTH_TOKEN for live SMS calls.`);
    } else {
        console.log(`  ✓  Twilio configured — emergency SMS/call active.`);
    }
    console.log('─'.repeat(60) + '\n');
});
