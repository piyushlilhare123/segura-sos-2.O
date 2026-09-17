from flask import Flask, request, jsonify
from flask_cors import CORS
import uuid
import datetime

from ml_models import SeverityClassifier
from hazard_engine import HazardZoneEngine
from risk_engine import RiskEngine

app = Flask(__name__)
CORS(app)

# Initialize engines
severity_classifier = SeverityClassifier()
hazard_engine = HazardZoneEngine()
risk_engine = RiskEngine(hazard_engine)

@app.route('/events', methods=['POST'])
def receive_event():
    """
    Accept POST /events with JSON from M1:
    - speed, g_force, severity_hint, confidence_score, location
    Returns enriched JSON for M3/M4.
    """
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
        
    # Extract data from M1 event
    speed = data.get('speed', 0.0)
    g_force = data.get('g_force', 1.0)
    severity_hint = data.get('severity_hint', 'low')
    confidence_score = data.get('confidence_score', 0.5)
    
    location = data.get('location', {})
    lat = location.get('lat', 0.0)
    lng = location.get('lng', 0.0)
    
    timestamp = data.get('timestamp', datetime.datetime.utcnow().isoformat())

    # 1. Crash Severity Classification
    severity = severity_classifier.classify(speed, g_force, severity_hint, confidence_score)
    
    # 2. Risk Score Engine
    risk_score = risk_engine.calculate_risk_score(speed, lat, lng, timestamp)
    
    # 3. Update & Detect Hazard Zone
    hazard_engine.update_zone_with_crash(lat, lng, severity)
    hazard_zone = hazard_engine.get_hazard_level(lat, lng)
    
    # BONUS: Predict risk before crash & Auto-trigger SOS flag
    # If a severe crash occurs or high risk is predicted, an action is required immediately.
    action_required = False
    if severity == 'severe':
        action_required = True
    elif severity == 'moderate' and risk_score > 75:
        action_required = True
        
    predicted_risk_before_crash = risk_score > 60

    # 4. Output for M3 & M4
    response = {
        "event_id": data.get('event_id', str(uuid.uuid4())),
        "severity": severity,
        "risk_score": risk_score,
        "hazard_zone": hazard_zone,
        "action_required": action_required,
        "timestamp": timestamp,
        "location": location,
        "predicted_risk_before_crash": predicted_risk_before_crash
    }
    
    return jsonify(response), 200

@app.route('/risk-score', methods=['GET'])
def get_risk_score():
    """
    Calculate real-time risk score
    GET /risk-score?lat=&lng=&speed=
    """
    lat = request.args.get('lat', type=float)
    lng = request.args.get('lng', type=float)
    speed = request.args.get('speed', default=40.0, type=float)
    
    if lat is None or lng is None:
        return jsonify({"error": "lat and lng are required query parameters"}), 400
        
    score = risk_engine.calculate_risk_score(speed, lat, lng)
    hazard_zone = hazard_engine.get_hazard_level(lat, lng)
    
    return jsonify({
        "lat": lat,
        "lng": lng,
        "risk_score": score,
        "hazard_zone": hazard_zone,
        "risk_level": "high" if score >= 75 else ("medium" if score >= 40 else "low")
    }), 200

@app.route('/hazards', methods=['GET'])
def get_hazards():
    """
    Returns all hazard zones
    """
    zones = hazard_engine.get_all_hazards()
    return jsonify({
        "status": "success",
        "count": len(zones),
        "data": zones
    }), 200

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "module": "M2 - AI Engine", "uptime": "running"}), 200

if __name__ == '__main__':
    # Run the server on a different port than M1 (M1 usually runs on 5000 or 5001)
    app.run(host='0.0.0.0', port=5002, debug=True)
