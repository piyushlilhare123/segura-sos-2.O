from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

M1_URL = "http://127.0.0.1:8000"
M2_URL = "http://127.0.0.1:5002"

@app.route('/')
def index():
    return render_template('index.html', m1_url=M1_URL, m2_url=M2_URL)

@app.route('/api/m2/health')
def m2_health():
    try:
        r = requests.get(f"{M2_URL}/health", timeout=2)
        return jsonify(r.json())
    except:
        return jsonify({"status": "offline"}), 503

@app.route('/api/m2/hazards')
def m2_hazards():
    try:
        r = requests.get(f"{M2_URL}/hazards", timeout=2)
        return jsonify(r.json())
    except:
        return jsonify({"status": "offline", "data": []}), 503

@app.route('/api/m2/risk-score')
def m2_risk():
    lat = request.args.get('lat', 28.7041)
    lng = request.args.get('lng', 77.1025)
    speed = request.args.get('speed', 60)
    try:
        r = requests.get(f"{M2_URL}/risk-score?lat={lat}&lng={lng}&speed={speed}", timeout=2)
        return jsonify(r.json())
    except:
        return jsonify({"status": "offline"}), 503

@app.route('/api/m1/health')
def m1_health():
    try:
        r = requests.get(f"{M1_URL}/health", timeout=2)
        return jsonify({"status": "online"})
    except:
        return jsonify({"status": "offline"}), 503

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)
