"""
Segura SOS — Master Launcher
Starts M1 HTTPS Sensor Simulator, M2 (FastAPI:8000), M3 SOS server (Node:4000),
and M4 React dev server (Vite:5173).

Architecture
  M1 Browser (HTTPS:8443) →  wss://localhost:8000/ws  →  M2 FastAPI
  M2 FastAPI              →  POST /sos                →  M3 SOS Node server (on crash)
  M2 FastAPI              →  WS broadcast             →  M4 React App (live map pins)
  M3 Dashboard            →  POST /demo/trigger-sos   →  M3 → WS → M4 (demo button)

  Mobile: visit https://<LAN-IP>:8443 on your phone (accept the self-signed cert once)
"""
import subprocess
import sys
import time
import os
import webbrowser
import threading
import shutil

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE    = os.path.dirname(os.path.abspath(__file__))
M2_DIR  = os.path.join(BASE, 'm2_ai_engine')
M4_DIR  = os.path.join(BASE, 'm4_community_app')
SOS_DIR = os.path.join(BASE, '..', 'sos-server')
M1_DIR  = os.path.join(BASE, 'm1_web_simulator')
M1_HTTPS_SERVER = os.path.join(M1_DIR, 'https_server.py')
M1_HTTPS_PORT   = 8443

PYTHON = sys.executable
NODE   = shutil.which('node') or 'node'
NPM    = shutil.which('npm')  or 'npm'

processes = []

def start_process(name, cmd, cwd):
    print(f"  ▶  Starting {name}...")
    try:
        p = subprocess.Popen(
            cmd, cwd=cwd,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        processes.append(p)
        return p
    except FileNotFoundError as e:
        print(f"  ✗  Could not start {name}: {e}")
        return None

def install_python_deps(directory, req_file='requirements.txt'):
    req_path = os.path.join(directory, req_file)
    if os.path.exists(req_path):
        print(f"  📦 Installing Python deps from {req_file} ...")
        subprocess.run(
            [PYTHON, '-m', 'pip', 'install', '-q', '-r', req_path],
            cwd=directory
        )

def install_node_deps(directory):
    nm = os.path.join(directory, 'node_modules')
    if not os.path.exists(nm):
        print(f"  📦 Installing Node deps in {os.path.basename(directory)} ...")
        subprocess.run([NPM, 'install', '--silent'], cwd=directory, shell=True)
    else:
        print(f"  ✓  Node deps already installed ({os.path.basename(directory)})")

def open_browser_delayed(url, delay=5):
    def _open():
        time.sleep(delay)
        print(f"\n  🌐 Opening → {url}")
        webbrowser.open(url)
    threading.Thread(target=_open, daemon=True).start()

if __name__ == '__main__':
    print('\n' + '='*62)
    print('  🚨  Segura SOS — Unified Launcher')
    print('  Accident Detection & Response System')
    print('='*62 + '\n')

    # ── 1. Install dependencies ───────────────────────────────
    print('> Checking dependencies…\n')
    install_python_deps(M2_DIR)
    install_node_deps(SOS_DIR)
    install_node_deps(M4_DIR)

    # ── 2. Start M1 — HTTPS Sensor Simulator on port 8443 ───
    start_process(
        f'M1 HTTPS Sensor Simulator (port {M1_HTTPS_PORT})',
        [PYTHON, M1_HTTPS_SERVER, '--port', str(M1_HTTPS_PORT)],
        M1_DIR
    )
    time.sleep(1)

    # ── 3. Start M2 — FastAPI on port 8000 ───────────────────
    start_process(
        'M2 AI Engine (FastAPI → port 8000)',
        [PYTHON, '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
        M2_DIR
    )
    time.sleep(2)

    # ── 4. Start M3 — SOS Node server on port 4000 ───────────
    start_process(
        'M3 SOS Server (Node → port 4000)',
        [NODE, 'index.js'],
        SOS_DIR
    )
    time.sleep(1)

    # ── 5. Start M4 — React Vite dev server on port 5173 ─────
    start_process(
        'M4 Community App (Vite → port 5173)',
        [NPM, 'run', 'dev'],
        M4_DIR
    )
    time.sleep(1)

    # ── 6. Open browsers ─────────────────────────────────────
    m1_url = f'https://localhost:{M1_HTTPS_PORT}'
    open_browser_delayed(m1_url,                   delay=4)   # M1 HTTPS simulator
    open_browser_delayed('http://localhost:4000',   delay=6)   # M3 dashboard
    open_browser_delayed('http://localhost:5173',   delay=8)   # M4 community app

    # Get LAN IP for mobile URL hint
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        lan_ip = '127.0.0.1'

    print('\n' + '='*62)
    print('  All services launching!\n')
    print(f'  M1 Sensor Simulator  →  https://localhost:{M1_HTTPS_PORT}  (HTTPS)')
    print(f'  M1 Mobile Access     →  https://{lan_ip}:{M1_HTTPS_PORT}')
    print('  M2 AI Engine         →  http://localhost:8000')
    print('  M2 API Docs          →  http://localhost:8000/docs')
    print('  M3 SOS Dashboard     →  http://localhost:4000   ← presenter view')
    print('  M4 Community App     →  http://localhost:5173\n')
    print('  📱 Mobile Access:')
    print(f'    Open https://{lan_ip}:{M1_HTTPS_PORT} on your phone')
    print('    → Accept the self-signed cert once (Advanced → Proceed)')
    print('    → GPS + Accelerometer + Gyroscope will request permission\n')
    print('  Demo Flow:')
    print('    Click "🚨 Fire Demo SOS" on M1 or M3 dashboard')
    print('    → M2 classifies → M3 stores + Twilio call → M4 red marker\n')
    print('  Full Data Flow:')
    print('    M1 → wss:8000/ws → M2 → ws broadcast → M4 map')
    print('    M2 → POST /sos  → M3  (on crash event)')
    print('    M3 Dashboard → POST /demo/trigger-sos → M3 → WS → M4\n')
    print('  Press Ctrl+C to stop all services.')
    print('='*62 + '\n')

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print('\n\n  Stopping all services…')
        for p in processes:
            try:
                p.terminate()
            except Exception:
                pass
        print('  Goodbye! 👋\n')
