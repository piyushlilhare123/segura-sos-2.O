# 🚨 Segura SOS — Accident Detection & Response System (ADRS)

> **Real-Time Safety System** · Real-time crash detection, AI risk scoring, emergency dispatch & community safety map

---

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Full Data Flow](#full-data-flow)
- [Module Reference](#module-reference)
  - [M1 — Sensor Simulator](#m1--sensor-simulator-web)
  - [M2 — AI Engine](#m2--ai-engine-fastapi)
  - [M3 — SOS Server](#m3--sos-server-nodejs)
  - [M4 — Community App](#m4--community-app-react)
- [Prerequisites](#prerequisites)
- [Quick Start (One Command)](#quick-start-one-command)
- [Manual Start (Module by Module)](#manual-start-module-by-module)
- [Service URLs](#service-urls)
- [Mobile Access](#mobile-access)
- [System Usage & Test Flow](#system-usage--test-flow)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)

---

## Overview

**Segura SOS** is a full-stack, real-time accident detection and emergency response system. It combines mobile sensor data (GPS, accelerometer, gyroscope), AI-based crash classification, automated emergency calling via Twilio, and a community safety map — all connected through WebSockets for live updates.

| Module | Role | Tech Stack | Port |
|--------|------|------------|------|
| **M1** | Sensor Simulator (browser/mobile) | Vanilla JS + HTTPS Python server | `8443` |
| **M2** | AI Engine — crash analysis & risk scoring | Python / FastAPI / Uvicorn | `8000` |
| **M3** | SOS Dispatch Server + Dashboard | Node.js / Express / Twilio / WebSocket | `4000` |
| **M4** | Community App — live map & HUD | React 18 / Vite / Leaflet | `5173` |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Segura SOS                              │
│                                                                  │
│  ┌─────────────────┐    WSS/HTTPS     ┌──────────────────────┐  │
│  │   M1 Browser    │ ══════════════►  │   M2 AI Engine       │  │
│  │  Sensor Sim     │  /proxy/ws        │   FastAPI :8000      │  │
│  │  HTTPS :8443    │                  │                      │  │
│  │                 │  POST /proxy/sos  │  • SeverityClassifier│  │
│  │  GPS ✓          │ ══════════════►  │  • RiskEngine        │  │
│  │  Accelerometer ✓│                  │  • HazardZoneEngine  │  │
│  │  Gyroscope ✓    │                  └──────────┬───────────┘  │
│  └─────────────────┘                             │              │
│         ▲                              POST /sos (moderate/severe)│
│         │ HTTPS Proxy                            ▼              │
│         │ (same origin,              ┌──────────────────────┐   │
│         │  no mixed-content)         │  M3 SOS Server       │   │
│                                      │  Node.js / Express   │   │
│  ┌─────────────────┐  WS broadcast   │  :4000               │   │
│  │   M4 Community  │ ◄════════════   │                      │   │
│  │   App React     │                 │  • Twilio call       │   │
│  │   Vite :5173    │                 │  • SOS Dashboard     │   │
│  │                 │                 │  • Incident logs     │   │
│  │  • Live Map     │                 └──────────────────────┘   │
│  │  • Driver HUD   │                                            │
│  │  • Reports      │                                            │
│  └─────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Full Data Flow

### 🔴 Normal Sensor Loop
```
M1 Browser (accelerometer + GPS)
    │
    │  WebSocket JSON event (type: "normal" / "hard_brake" / "crash")
    │  { event_id, timestamp, type, gps:{lat,lng}, speed_kmh, impact_g, weather, source }
    ▼
wss://localhost:8443/proxy/ws  ──[HTTPS proxy tunnel]──►  ws://localhost:8000/ws
    │
    ▼
M2 FastAPI /ws endpoint
    │  1. Parse SensorEvent
    │  2. SeverityClassifier  →  minor | moderate | severe
    │  3. RiskEngine          →  score (0–1) + label (low/medium/high/critical)
    │  4. HazardZoneEngine    →  nearest hazard zone level
    ▼
WebSocket broadcast → all connected clients (M1 gets analysis result back, M4 gets map update)
    │
    │  (if severity == "moderate" or "severe")
    ▼
POST http://localhost:4000/sos
    │
    ▼
M3 SOS Server
    │  1. Log SOS entry to in-memory store
    │  2. WebSocket broadcast → M4 (red pin on map, SOS alert)
    │  3. Twilio API → automated emergency phone call
```

### 🔴 Direct SOS Path (from M1)
```
M1 crash/hard_brake event
    │
    │  POST https://localhost:8443/proxy/sos
    │  → forwarded to http://localhost:4000/sos
    ▼
M3 SOS Server → Twilio call + WS broadcast → M4 map pin
```

### 🎯 Demo Button Path
```
"🚨 Fire Demo SOS" button (M1 or M3 dashboard)
    │
    │  POST /proxy/demo  →  M3 /demo/trigger-sos
    ▼
M3 generates realistic crash payload (random Indian city location)
    │  → broadcastSOS() → M4 WebSocket → red marker on map
    │  → Twilio emergency call dispatched
```

### 📍 Community Report Path
```
M4 Report Page (user submits incident)
    │
    │  POST http://localhost:4000/incident
    ▼
M3 stores incident → GET /incidents (M4 map polls and renders pins)
```

---

## Module Reference

### M1 — Sensor Simulator (Web)

**Location:** `sensor and detection/m1_web_simulator/`

The M1 module is a responsive web app served over HTTPS. On **desktop**, it acts as a manual simulator with sliders. On **mobile** (via LAN IP), it uses **real sensors** — GPS, accelerometer, and gyroscope.

#### Key Files
| File | Purpose |
|------|---------|
| `https_server.py` | Python HTTPS server (ThreadingHTTPServer + SSL) + reverse proxy for /proxy/* routes |
| `index.html` | Main UI — sensor dashboard, controls, log panel |
| `app.js` | Sensor logic, WebSocket client, SOS dispatch, live GPS/motion handling |
| `style.css` | Glassmorphic dark-mode UI |
| `cert.pem` / `key.pem` | Self-signed TLS certificate (auto-generated if missing) |

#### HTTPS Proxy Routes (M1 → Backend)
| Route | Forwards To | Purpose |
|-------|-------------|---------|
| `GET /` | Serves `index.html` | Main simulator UI |
| `WSS /proxy/ws` | `ws://localhost:8000/ws` | M2 WebSocket tunnel |
| `POST /proxy/sos` | `http://localhost:4000/sos` | Direct SOS dispatch |
| `POST /proxy/demo` | `http://localhost:4000/demo/trigger-sos` | Demo SOS trigger |
| `GET /proxy/health` | `http://localhost:8000/health` | M2 health check |

#### Sensor Event Schema
```json
{
  "event_id": "uuid-v4",
  "timestamp": "2026-04-19T08:00:00.000Z",
  "type": "crash | hard_brake | normal",
  "gps": { "lat": 26.2183, "lng": 78.1828, "accuracy_m": 10.0 },
  "speed_kmh": 85,
  "impact_g": 4.2,
  "weather": "clear | rain | fog",
  "source": "real | simulated"
}
```

#### Why HTTPS?
Mobile browsers block access to GPS, accelerometer, and gyroscope on `http://` or `file://` origins (mixed-content policy). M1 serves the app over HTTPS with a self-signed cert, and proxies all backend traffic through the same HTTPS origin to avoid any mixed-content blocks.

---

### M2 — AI Engine (FastAPI)

**Location:** `sensor and detection/m2_ai_engine/`

The M2 module is a Python FastAPI backend that receives sensor events, classifies crash severity using rule-based ML, scores road risk, detects hazard zones, and forwards critical events to M3.

#### Key Files
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app — WebSocket endpoint, `/analyze`, `/risk`, `/hazards` routes |
| `classifier.py` | `SeverityClassifier` — rule-based crash severity logic |
| `risk_engine.py` | `RiskEngine` — composite road risk score calculation |
| `hazard_engine.py` | `HazardZoneEngine` — Haversine-based hazard zone proximity checks |
| `schemas.py` | Pydantic models: `SensorEvent`, `AnalysisResult` |

#### Severity Classification Rules
| Condition | Severity |
|-----------|----------|
| speed > 60 km/h **AND** G-force > 3.0g | `severe` |
| speed > 80 km/h **AND** G-force > 2.0g | `severe` |
| speed 30–60 km/h **AND** G-force 2.0–3.0g | `moderate` |
| G-force > 3.0g (any speed) | `moderate` |
| Everything else | `minor` |

#### Risk Score Formula
```
score = (speed_kmh / speed_limit × 0.5) + weather_factor + road_factor

weather_factor: clear=0.0, rain=0.4, fog=0.7
road_factor:    highway=0.1, urban=0.4, rural=0.7

Labels:  ≥0.8 → critical │ ≥0.6 → high │ ≥0.4 → medium │ <0.4 → low
```

#### Built-in Hazard Zones (India)
| Zone | Location | Type | Risk |
|------|----------|------|------|
| School Zone Alpha | Delhi (28.70°N, 77.10°E) | School zone | Medium |
| Blind Turn Beta | Mumbai (19.07°N, 72.87°E) | Blind turn | High |
| Accident Cluster Gamma | Bengaluru (12.97°N, 77.59°E) | Accident cluster | High |
| School Zone Delta | Kolkata (22.57°N, 88.36°E) | School zone | Low |
| Blind Turn Epsilon | Chennai (13.08°N, 80.27°E) | Blind turn | Medium |

#### REST Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Analyze a SensorEvent synchronously |
| `GET` | `/risk?lat=&lng=&speed=&weather=` | Get risk score for a location |
| `GET` | `/hazards?lat=&lng=&radius=` | Get hazard zones within radius (meters) |
| `WS` | `/ws` | Real-time sensor stream from M1 |

---

### M3 — SOS Server (Node.js)

**Location:** `sos-server/`

The M3 module is a Node.js Express server that receives SOS alerts from M2 (or directly from M1), stores them in-memory, broadcasts live updates to M4 via WebSocket, and dispatches automated emergency phone calls via Twilio.

#### Key Files
| File | Purpose |
|------|---------|
| `index.js` | Express server + WebSocket server + Twilio integration |
| `public/` | Static SOS dashboard (presenter view) |
| `package.json` | Node dependencies (express, cors, twilio, ws) |

#### Twilio Emergency Call
- Calls `EMERGENCY_SERVICES_NUMBER` with a spoken TwiML message on every moderate/severe crash.
- **Rate limited:** 1 call per 60 seconds maximum.
- Configure via environment variables (see [Configuration](#configuration)).

#### REST Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | SOS Dashboard (presenter view) |
| `POST` | `/sos` | Receive SOS from M2 → store + broadcast + Twilio call |
| `POST` | `/demo/trigger-sos` | Generate demo crash event (random Indian city) |
| `POST` | `/api/v1/sos` | Legacy endpoint (Android clients) |
| `POST` | `/api/v1/telemetry` | Telemetry stream from Android |
| `GET` | `/sos-logs` | Last 10 SOS entries |
| `POST` | `/incident` | Community-reported road incident |
| `GET` | `/incidents` | All community incidents |
| `GET` | `/health` | Health check |
| `WS` | `ws://localhost:4000` | M3 → M4 real-time broadcast |

#### WebSocket Messages (M3 → M4)
```json
// On new SOS
{ "type": "sos", "data": { "id": "...", "timestamp": "...", "severity": "severe", "payload": {...} } }

// On connect (history)
{ "type": "history", "data": [ ...last 5 SOS entries ] }
```

---

### M4 — Community App (React)

**Location:** `sensor and detection/m4_community_app/`

The M4 module is a React 18 app built with Vite, using Leaflet for interactive maps. It shows live crash events as map pins, provides a driver HUD, community incident reporting, and driver profile.

#### Key Files / Pages
| File | Route | Description |
|------|-------|-------------|
| `src/pages/MapPage.jsx` | `/map` | Live Leaflet map with SOS pins + incidents |
| `src/pages/HudPage.jsx` | `/hud` | Driver heads-up display (speed, risk, alerts) |
| `src/pages/ReportPage.jsx` | `/report` | Community road hazard report form |
| `src/pages/ProfilePage.jsx` | `/profile` | Driver profile & gamified safety score |
| `src/App.jsx` | — | Router, WebSocket connection to M3 |

#### Data Sources (M4)
| Source | Protocol | What it provides |
|--------|----------|-----------------|
| M2 `:8000/ws` | WebSocket | Real-time crash analysis results |
| M3 `:4000` (WS) | WebSocket | Live SOS events → red map pins |
| M3 `:4000/incidents` | HTTP GET | Community-reported incidents |
| M3 `:4000/incident` | HTTP POST | Submit a new community report |

---

## Prerequisites

### Software Required
| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | ≥ 3.10 | M1 HTTPS server + M2 FastAPI |
| **Node.js** | ≥ 18.x | M3 SOS server + M4 Vite dev server |
| **npm** | ≥ 9.x | M3 and M4 package management |

### Python Packages (M2)
```
fastapi, uvicorn[standard], websockets, pydantic, httpx, python-multipart
```
> Auto-installed by `start_all.py` from `m2_ai_engine/requirements.txt`

### Node Packages
- **M3 SOS Server:** `express`, `cors`, `twilio`, `ws`
- **M4 Community App:** `react`, `react-dom`, `react-router-dom`, `leaflet`, `vite`

> Auto-installed by `start_all.py` if `node_modules` is missing.

### Optional (for self-signed cert generation)
```
pip install cryptography
```
> If not installed, falls back to `openssl` CLI. Cert is pre-generated in the repo.

---

## Quick Start (One Command)

```powershell
# From the project root:
cd "d:\Hackthon Final\Hackthon Final\sensor and detection"
python start_all.py
```

This single command:
1. Installs all Python and Node dependencies (first run only)
2. Starts **M1** HTTPS Sensor Simulator on `https://0.0.0.0:8443`
3. Starts **M2** FastAPI AI Engine on `http://0.0.0.0:8000`
4. Starts **M3** SOS Node Server on `http://0.0.0.0:4000`
5. Starts **M4** React Community App on `http://localhost:5173`
6. Auto-opens M1, M3 dashboard, and M4 in the browser after 4–8 seconds

> Press **Ctrl+C** to stop all services.

---

## Manual Start (Module by Module)

Open **4 separate terminals:**

### Terminal 1 — M1 Sensor Simulator
```powershell
cd "d:\Hackthon Final\Hackthon Final\sensor and detection\m1_web_simulator"
python https_server.py
```

### Terminal 2 — M2 AI Engine
```powershell
cd "d:\Hackthon Final\Hackthon Final\sensor and detection\m2_ai_engine"
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 3 — M3 SOS Server
```powershell
cd "d:\Hackthon Final\Hackthon Final\sos-server"
npm install
node index.js
```

### Terminal 4 — M4 Community App
```powershell
cd "d:\Hackthon Final\Hackthon Final\sensor and detection\m4_community_app"
npm install
npm run dev
```

---

## Service URLs

| Service | URL | Notes |
|---------|-----|-------|
| **M1 Simulator (Desktop)** | https://localhost:8443 | Accept self-signed cert |
| **M1 Mobile Access** | https://\<LAN-IP\>:8443 | Same cert acceptance needed |
| **M2 FastAPI** | http://localhost:8000 | AI Engine |
| **M2 API Docs** | http://localhost:8000/docs | Interactive Swagger UI |
| **M3 SOS Dashboard** | http://localhost:4000 | Presenter view |
| **M4 Community App** | http://localhost:5173 | Live map + HUD |

---

## Mobile Access

To use **real phone sensors** (GPS, accelerometer, gyroscope) on the M1 simulator:

1. Ensure your phone is on the **same Wi-Fi as the laptop**
2. Open `https://<YOUR-LAN-IP>:8443` on your phone's browser
   - LAN IP is printed in the terminal when M1 starts
3. Accept the self-signed certificate:
   - **Chrome/Android:** Advanced → Proceed to site
   - **Safari/iOS:** Visit Anyway
4. Tap **"📡 Enable Real Sensors"** → Grant GPS + Motion permissions
5. Walk/drive — the app will use real sensors automatically

> Simulated controls (sliders) still work on mobile if sensors are denied.

---

## System Usage & Test Flow

### 🎯 Fastest Demo (30 seconds)
1. Open **M3 Dashboard** → `http://localhost:4000`
2. Click **"Fire Demo SOS"** button
3. Watch **M4 map** → `http://localhost:5173` show a red SOS pin in a random Indian city
4. Check terminal for **Twilio call** dispatch confirmation

### 🎮 Full Pipeline Demo
1. Open **M1 Simulator** → `https://localhost:8443`
2. Set **Speed = 85 km/h**, **G-Force = 4.2g**, Weather = `clear`
3. Click **"🚨 Crash"** button
4. **M1 shows:** SOS Dispatched badge + analysis result
5. **M3 Dashboard** shows: New SOS entry logged
6. **M4 Map** shows: Red pin at Gwalior (or real GPS location)
7. **Twilio:** Emergency call placed to configured number

### 📱 Live Sensor Demo (with phone)
1. Connect phone to same Wi-Fi
2. Open `https://<LAN-IP>:8443` on phone, accept cert
3. Enable sensors on the phone
4. Shake the phone firmly → automatic crash detection
5. Watch M3 and M4 update in real time

---

## API Reference

### M2 — POST /analyze
```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "abc-123",
    "timestamp": "2026-04-19T08:00:00Z",
    "type": "crash",
    "gps": { "lat": 26.2183, "lng": 78.1828, "accuracy_m": 5 },
    "speed_kmh": 85,
    "impact_g": 4.2,
    "weather": "clear",
    "source": "simulated"
  }'
```

**Response:**
```json
{
  "event_id": "abc-123",
  "severity": "severe",
  "risk_score": 0.91,
  "risk_label": "critical",
  "alert_message": "Critical risk! Please reduce speed immediately.",
  "hazard_zone": "low",
  "action_required": true
}
```

### M3 — POST /sos
```bash
curl -X POST http://localhost:4000/sos \
  -H "Content-Type: application/json" \
  -d '{
    "sos_id": "abc-123",
    "timestamp": "2026-04-19T08:00:00Z",
    "gps": { "lat": 26.2183, "lng": 78.1828 },
    "severity": "severe",
    "speed_kmh": 85,
    "impact_g": 4.2
  }'
```

### M3 — POST /demo/trigger-sos
```bash
curl -X POST http://localhost:4000/demo/trigger-sos
```

---

## Configuration

### Twilio (Emergency Calls)
Set via environment variables before starting M3:

```powershell
$env:TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:TWILIO_AUTH_TOKEN  = "your_auth_token"
$env:TWILIO_FROM_NUMBER = "+1XXXXXXXXXX"
$env:EMERGENCY_SERVICES_NUMBER = "+91XXXXXXXXXX"
node index.js
```

> Default credentials (trial) are embedded in `index.js` for testing.

### M1 — Custom Port
```powershell
python https_server.py --port 9443
```

### M1 — Regenerate Certificate
```powershell
python https_server.py --regen-cert
```

### M2 — Target IP (for LAN deployments)
Edit `m2_ai_engine/main.py`:
```python
M3_SOS_URL = "http://localhost:4000/sos"  # Change to LAN IP if M3 on different machine
```

---

## Troubleshooting

### M1 page not opening / `ERR_CONNECTION_REFUSED`
- **Cause:** Python HTTPS server not running or crashed.
- **Fix:** Run `python https_server.py` in `m1_web_simulator/`. Check for port conflicts with `netstat -ano | findstr :8443`.

### M1 shows "CLOSE_WAIT" connections building up
- **Cause:** Old single-threaded `HTTPServer` version.
- **Fix:** The server now uses `ThreadingHTTPServer`. Kill the old process and restart.

### M2 WebSocket shows "Offline" in M1
- **Cause:** M2 FastAPI not running.
- **Fix:** Start M2 with `python -m uvicorn main:app --port 8000`.

### Twilio call not firing
- **Cause:** Invalid credentials or rate limit (60s cooldown).
- **Fix:** Set correct env vars. Watch terminal for `[Twilio CALL]` log.

### M4 map not showing pins
- **Cause:** M3 WebSocket not connected.
- **Fix:** Check M3 is running on port 4000. Check browser console for WS errors.

### Self-signed certificate warning on mobile
- **This is expected.** Tap Advanced → Proceed to site once per session.

### Port already in use
```powershell
# Find and kill process on a port (e.g. 8443)
netstat -ano | findstr :8443
Stop-Process -Id <PID> -Force
```

---

## Project Structure

```
d:\Hackthon Final\Hackthon Final\
│
├── README.md                          ← This file
│
├── sensor and detection\              ← Main project root
│   ├── start_all.py                   ← 🚀 ONE-COMMAND LAUNCHER
│   │
│   ├── m1_web_simulator\              ← M1: HTTPS Sensor Simulator
│   │   ├── https_server.py            ← Python HTTPS + proxy server
│   │   ├── index.html                 ← Simulator UI
│   │   ├── app.js                     ← Sensor logic + WS client
│   │   ├── style.css                  ← Glassmorphic dark UI
│   │   ├── cert.pem                   ← TLS certificate (self-signed)
│   │   └── key.pem                    ← TLS private key
│   │
│   ├── m2_ai_engine\                  ← M2: FastAPI AI Engine
│   │   ├── main.py                    ← FastAPI app + WebSocket endpoint
│   │   ├── classifier.py              ← SeverityClassifier (rule-based)
│   │   ├── risk_engine.py             ← RiskEngine (composite scoring)
│   │   ├── hazard_engine.py           ← HazardZoneEngine (Haversine proximity)
│   │   ├── schemas.py                 ← Pydantic models
│   │   └── requirements.txt           ← Python dependencies
│   │
│   └── m4_community_app\              ← M4: React Community App
│       ├── index.html
│       ├── vite.config.js
│       ├── package.json
│       └── src\
│           ├── App.jsx                ← Router + WS connection
│           ├── main.jsx
│           ├── index.css              ← Global dark styles
│           └── pages\
│               ├── MapPage.jsx        ← Live Leaflet map
│               ├── HudPage.jsx        ← Driver HUD
│               ├── ReportPage.jsx     ← Community reports
│               └── ProfilePage.jsx    ← Driver profile
│
└── sos-server\                        ← M3: SOS Dispatch Server
    ├── index.js                       ← Express + WS + Twilio
    ├── package.json
    └── public\                        ← SOS Dashboard HTML
```

---

## Built With

| Technology | Used In | Purpose |
|------------|---------|---------|
| Python 3.10+ | M1, M2 | HTTPS server, FastAPI backend |
| FastAPI | M2 | Async REST + WebSocket API |
| Uvicorn | M2 | ASGI server |
| Node.js 18+ | M3 | SOS event processing |
| Express.js | M3 | HTTP API server |
| Twilio | M3 | Emergency phone calls |
| ws | M3 | WebSocket server (M3→M4) |
| React 18 | M4 | Community app UI |
| Vite | M4 | Dev server + bundler |
| Leaflet | M4 | Interactive map |
| Web APIs | M1 | `DeviceMotionEvent`, `Geolocation`, `DeviceOrientationEvent` |
| IndexedDB | M1 | Offline event buffering |
| SSL/TLS | M1 | Self-signed HTTPS for sensor access |

---

## License

Segura SOS — Real-Time Accident Detection & Emergency Response System. All rights reserved.

---

*Made with ❤️ for public safety — Team Segura SOS*
