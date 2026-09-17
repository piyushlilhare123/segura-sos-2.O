"""
M1 HTTPS Server -- Segura SOS Sensor Simulator
================================================
Serves the M1 web simulator over HTTPS with a self-signed certificate.
Also provides a transparent reverse proxy so the browser never needs to
make HTTP/WS requests to M2 or M3 (which would be blocked as mixed content
when the page is served over HTTPS, especially on mobile via LAN IP).

Proxy routes (all served from the same https://host:8443 origin):
  GET/WS  /proxy/ws    ->  ws://localhost:8000/ws   (M2 FastAPI)
  POST    /proxy/sos   ->  http://localhost:4000/sos  (M3 SOS Node)
  POST    /proxy/demo  ->  http://localhost:4000/demo/trigger-sos
  GET     /proxy/health->  http://localhost:8000/health

WHY?
  Mixed-content rules: an HTTPS page cannot fetch http:// or ws:// resources
  (even on localhost when accessed from a different machine like a phone).
  By proxying everything through the HTTPS server itself, both desktop and
  mobile get a secure origin for all requests.

USAGE:
  python https_server.py              # starts on https://0.0.0.0:8443
  python https_server.py --port 9443  # custom port
  python https_server.py --regen-cert # force-regenerate self-signed cert
"""

import http.server
from http.server import ThreadingHTTPServer
import ssl
import os
import sys
import socket
import argparse
import ipaddress
import threading
import urllib.request
import urllib.error
import json

# Force UTF-8 output on Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# -- Directory this script lives in ------------------------------------------
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
CERT_FILE    = os.path.join(SCRIPT_DIR, 'cert.pem')
KEY_FILE     = os.path.join(SCRIPT_DIR, 'key.pem')
DEFAULT_PORT = 8443

M2_WS_HOST   = 'localhost'
M2_WS_PORT   = 8000
M3_HTTP_HOST = 'localhost'
M3_HTTP_PORT = 4000


# -- Detect LAN IP ------------------------------------------------------------
def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


# -- Generate self-signed certificate -----------------------------------------
def generate_cert(lan_ip: str):
    print('  [*] Generating self-signed certificate (one-time)...')
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, 'IN'),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Segura SOS Dev'),
            x509.NameAttribute(NameOID.COMMON_NAME, 'localhost'),
        ])

        san_list = [
            x509.DNSName('localhost'),
            x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
        ]
        try:
            san_list.append(x509.IPAddress(ipaddress.IPv4Address(lan_ip)))
        except Exception:
            pass

        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
            .sign(key, hashes.SHA256())
        )
        with open(CERT_FILE, 'wb') as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        with open(KEY_FILE, 'wb') as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption()
            ))
        print('  [OK] Certificate generated (Python cryptography)')
        return True
    except ImportError:
        pass

    try:
        import subprocess
        san_ext = f'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{lan_ip}'
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', KEY_FILE, '-out', CERT_FILE,
            '-days', '3650', '-nodes',
            '-subj', '/C=IN/O=Segura SOS Dev/CN=localhost',
            '-addext', san_ext
        ], check=True, capture_output=True)
        print('  [OK] Certificate generated (openssl CLI)')
        return True
    except Exception as e:
        print(f'  [X] Could not generate cert: {e}')
        print('      Install with:  pip install cryptography')
        return False


# -- Print mobile access info -------------------------------------------------
def print_mobile_url(lan_ip: str, port: int):
    url = f'https://{lan_ip}:{port}'
    bar = '+' + '-' * 46 + '+'
    print()
    print('  ' + bar)
    print('  |  [MOBILE] Open on your phone:              |')
    print(f'  |  {url:<45}|')
    print('  |                                            |')
    print('  |  Accept the self-signed cert once:         |')
    print('  |    Advanced -> Proceed to site             |')
    print('  |                                            |')
    print('  |  All traffic proxied through HTTPS:        |')
    print('  |  /proxy/ws   -> M2 WebSocket (8000)        |')
    print('  |  /proxy/sos  -> M3 SOS Server (4000)       |')
    print('  +' + '-' * 46 + '+')
    print()


# -- WebSocket proxy (threaded, raw TCP tunnel) --------------------------------
def proxy_websocket(client_sock, client_addr):
    """
    Tunnel a WebSocket connection from the browser (over TLS) to M2 (plain WS).
    We receive the already-decrypted HTTP upgrade request and forward it as-is
    to M2, then bridge bytes in both directions.
    """
    import select

    try:
        # Connect to M2
        m2_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        m2_sock.connect((M2_WS_HOST, M2_WS_PORT))
        m2_sock.setblocking(False)
        client_sock.setblocking(False)

        while True:
            rlist, _, _ = select.select([client_sock, m2_sock], [], [], 30)
            if not rlist:
                break
            for s in rlist:
                try:
                    data = s.recv(65536)
                except Exception:
                    data = b''
                if not data:
                    return
                target = m2_sock if s is client_sock else client_sock
                try:
                    target.sendall(data)
                except Exception:
                    return
    except Exception as e:
        pass
    finally:
        try: client_sock.close()
        except Exception: pass
        try: m2_sock.close()
        except Exception: pass


# -- HTTP reverse proxy helper ------------------------------------------------
def proxy_http(path: str, method: str, body: bytes, headers_in: dict) -> tuple:
    """Forward an HTTP request to M3 and return (status, body_bytes, content_type)."""
    url = f'http://{M3_HTTP_HOST}:{M3_HTTP_PORT}{path}'
    req = urllib.request.Request(url, data=body if method in ('POST', 'PUT') else None, method=method)
    req.add_header('Content-Type', headers_in.get('content-type', 'application/json'))
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read(), resp.headers.get('Content-Type', 'application/json')
    except urllib.error.HTTPError as e:
        return e.code, e.read(), 'application/json'
    except Exception as e:
        body_err = json.dumps({'error': str(e)}).encode()
        return 502, body_err, 'application/json'


# -- Combined HTTPS + Proxy handler -------------------------------------------
class ProxyHandler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SCRIPT_DIR, **kwargs)

    # ---- Shared CORS / security headers -------------------------------------
    def send_common_headers(self, content_type='application/json'):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Type', content_type)
        self.send_header('Permissions-Policy',
            'geolocation=*, accelerometer=*, gyroscope=*, magnetometer=*, camera=*')

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Permissions-Policy',
            'geolocation=*, accelerometer=*, gyroscope=*, magnetometer=*, camera=*')
        super().end_headers()

    # ---- WebSocket upgrade detection & tunnel --------------------------------
    def handle_one_request(self):
        """Intercept WS upgrades before http.server processes them."""
        try:
            self.raw_requestline = self.rfile.readline(65537)
            if not self.raw_requestline or len(self.raw_requestline) > 65536:
                self.close_connection = True
                return
            if not self.parse_request():
                return
        except Exception:
            self.close_connection = True
            return

        upgrade = self.headers.get('Upgrade', '').lower()
        if upgrade == 'websocket' and self.path.startswith('/proxy/ws'):
            self._handle_ws_upgrade()
        elif self.path.startswith('/proxy/'):
            method_fn = getattr(self, f'do_{self.command}', None)
            if method_fn:
                method_fn()
            else:
                self.send_error(405)
        else:
            method_fn = getattr(self, f'do_{self.command}', None)
            if method_fn:
                method_fn()
            else:
                self.send_error(405)

    def _handle_ws_upgrade(self):
        """Bridge WS upgrade to M2 and then tunnel raw bytes."""
        try:
            m2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            m2.connect((M2_WS_HOST, M2_WS_PORT))

            # Reconstruct and forward the HTTP upgrade request to M2
            req_line = f'{self.command} /ws HTTP/1.1\r\n'
            headers_out = [req_line]
            for key, val in self.headers.items():
                if key.lower() == 'host':
                    # Rewrite host to M2
                    headers_out.append(f'Host: {M2_WS_HOST}:{M2_WS_PORT}\r\n')
                else:
                    headers_out.append(f'{key}: {val}\r\n')
            headers_out.append('\r\n')
            m2.sendall(''.join(headers_out).encode())

            # Read M2's 101 Switching Protocols response and forward to client
            buf = b''
            while b'\r\n\r\n' not in buf:
                chunk = m2.recv(4096)
                if not chunk:
                    self.send_error(502)
                    m2.close()
                    return
                buf += chunk
            self.wfile.write(buf)
            self.wfile.flush()

            # Now bridge raw bytes in both directions (blocking)
            import select
            client_sock = self.connection
            client_sock.setblocking(False)
            m2.setblocking(False)
            while True:
                rlist, _, xlist = select.select([client_sock, m2], [], [client_sock, m2], 60)
                if xlist:
                    break
                if not rlist:
                    continue
                for s in rlist:
                    try:
                        data = s.recv(65536)
                    except Exception:
                        data = b''
                    if not data:
                        return
                    target = m2 if s is client_sock else client_sock
                    try:
                        target.sendall(data)
                    except Exception:
                        return
        except Exception as e:
            try:
                self.send_error(502, f'WS proxy error: {e}')
            except Exception:
                pass
        finally:
            try: m2.close()
            except Exception: pass

    # ---- OPTIONS preflight --------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_common_headers()
        self.end_headers()

    # ---- Static file serving (default) --------------------------------------
    def do_GET(self):
        if self.path == '/proxy/health':
            self._proxy_m2_health()
        else:
            super().do_GET()

    def _proxy_m2_health(self):
        try:
            with urllib.request.urlopen(
                    f'http://{M2_WS_HOST}:{M2_WS_PORT}/health', timeout=3) as r:
                body = r.read()
                self.send_response(200)
                self.send_common_headers()
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(502)
            self.send_common_headers()
            self.send_header('Content-Length', str(len(err)))
            self.end_headers()
            self.wfile.write(err)

    # ---- POST proxy to M3 ---------------------------------------------------
    def do_POST(self):
        path = self.path

        # /proxy/sos  -> POST http://localhost:4000/sos
        if path == '/proxy/sos':
            self._forward_to_m3('/sos')
        # /proxy/demo -> POST http://localhost:4000/demo/trigger-sos
        elif path == '/proxy/demo':
            self._forward_to_m3('/demo/trigger-sos')
        # /proxy/incident -> POST http://localhost:4000/incident
        elif path == '/proxy/incident':
            self._forward_to_m3('/incident')
        else:
            self.send_error(404)

    def _forward_to_m3(self, m3_path: str):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length) if length > 0 else b'{}'
        status, resp_body, ct = proxy_http(
            m3_path, 'POST', body, dict(self.headers)
        )
        self.send_response(status)
        self.send_common_headers(ct)
        self.send_header('Content-Length', str(len(resp_body)))
        self.end_headers()
        self.wfile.write(resp_body)

    def log_message(self, fmt, *args):
        # Only log errors and proxy calls (suppress 200/304 static noise)
        if args and str(args[1]) not in ('200', '304', '206'):
            super().log_message(fmt, *args)
        elif self.path.startswith('/proxy/'):
            super().log_message(fmt, *args)


# -- Main ---------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description='M1 HTTPS Sensor Simulator + Reverse Proxy'
    )
    parser.add_argument('--port', type=int, default=DEFAULT_PORT,
                        help=f'Port to serve on (default: {DEFAULT_PORT})')
    parser.add_argument('--regen-cert', action='store_true',
                        help='Force-regenerate the self-signed certificate')
    args = parser.parse_args()

    lan_ip = get_lan_ip()

    if args.regen_cert or not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        if not generate_cert(lan_ip):
            sys.exit(1)
    else:
        print('  [OK] Using existing certificate (cert.pem / key.pem)')

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT_FILE, KEY_FILE)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2

    server = ThreadingHTTPServer(('0.0.0.0', args.port), ProxyHandler)
    server.allow_reuse_address = True
    server.socket = ctx.wrap_socket(server.socket, server_side=True)

    print()
    print('  Segura SOS -- M1 HTTPS Sensor Simulator + Proxy')
    print(f'  Desktop : https://localhost:{args.port}')
    print(f'  Proxies : /proxy/ws   -> ws://localhost:{M2_WS_PORT}/ws  (M2)')
    print(f'            /proxy/sos  -> http://localhost:{M3_HTTP_PORT}/sos (M3)')
    print_mobile_url(lan_ip, args.port)
    print('  Press Ctrl+C to stop.')
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')


if __name__ == '__main__':
    main()
