import os
import json
import logging
import httpx
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

from schemas import SensorEvent, AnalysisResult
from classifier import SeverityClassifier
from risk_engine import RiskEngine
from hazard_engine import HazardZoneEngine

M3_SOS_URL = os.getenv("M3_SOS_URL", "http://localhost:4000/sos")


app = FastAPI(title="M2 AI Engine", description="Accident Detection Backend", version="1.0")


# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Engine Initialization
classifier = SeverityClassifier()
risk_engine = RiskEngine()
hazard_engine = HazardZoneEngine()

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logging.info("WebSocket Client Connected")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logging.info("WebSocket Client Disconnected")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logging.error(f"Failed to send WS message: {e}")

manager = ConnectionManager()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_event(event: SensorEvent):
    # 1. Classify severity
    severity = classifier.classify(event.speed_kmh, event.impact_g)
    
    # 2. Calculate risk
    score, label, msg = risk_engine.calculate_risk(
        speed_kmh=event.speed_kmh,
        weather=event.weather,
        road_type="urban" # Defaults to urban for now
    )
    
    # 3. Check hazard zones
    hazard_zone = hazard_engine.get_hazard_level(event.gps.lat, event.gps.lng)
    
    # 4. Action flag
    action_required = False
    if severity in ["moderate", "severe"] or label == "critical":
        action_required = True

    # 5. Build Result
    result = AnalysisResult(
        event_id=event.event_id,
        severity=severity,
        risk_score=score,
        risk_label=label,
        alert_message=msg,
        hazard_zone=hazard_zone,
        action_required=action_required
    )
    
    # Broadcast to all websocket listeners (e.g. Map UI)
    broadcast_data = {
        **result.dict(),
        "lat": event.gps.lat,
        "lng": event.gps.lng,
        "speed_kmh": event.speed_kmh,
        "impact_g": event.impact_g
    }
    await manager.broadcast(broadcast_data)

    # Forward to M3 SOS server if moderate or severe
    if severity in ["severe", "moderate"]:
        sos_payload = {
            "sos_id":    event.event_id,
            "timestamp": event.timestamp,
            "gps":       event.gps.dict(),
            "severity":  severity,
            "speed_kmh": event.speed_kmh,
            "impact_g":  event.impact_g,
            "source":    event.source
        }
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(M3_SOS_URL, json=sos_payload)
            logging.info(f"[M2→M3] SOS forwarded for event {event.event_id}")
        except Exception as e:
            logging.warning(f"[M2→M3] SOS forward failed: {e}")

    return result


@app.get("/risk")
async def get_risk(lat: float, lng: float, speed: float = Query(40.0), weather: str = Query("clear")):
    score, label, msg = risk_engine.calculate_risk(
        speed_kmh=speed,
        weather=weather,
    )
    hazard_zone = hazard_engine.get_hazard_level(lat, lng)
    
    return {
        "lat": lat,
        "lng": lng,
        "risk_score": score,
        "risk_label": label,
        "alert_message": msg,
        "hazard_zone": hazard_zone
    }


@app.get("/hazards")
async def get_hazards(lat: float, lng: float, radius: float = Query(500.0)):
    # radius is in meters
    nearby = hazard_engine.get_zones_within_radius(lat, lng, radius)
    return {
        "status": "success",
        "radius": radius,
        "count": len(nearby),
        "data": nearby
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We expect to receive raw events from M1 simulator here
            data = await websocket.receive_json()
            
            try:
                # Parse as SensorEvent
                event = SensorEvent(**data)
                
                # Analyze and broadcast
                severity = classifier.classify(event.speed_kmh, event.impact_g)
                score, label, msg = risk_engine.calculate_risk(event.speed_kmh, event.weather)
                hazard_zone_level = hazard_engine.get_hazard_level(event.gps.lat, event.gps.lng)

                
                result = AnalysisResult(
                    event_id=event.event_id,
                    severity=severity,
                    risk_score=score,
                    risk_label=label,
                    alert_message=msg,
                    hazard_zone=hazard_zone_level,
                    action_required=(severity != "minor")
                )
                
                broadcast_data = {
                    **result.dict(),
                    "lat": event.gps.lat,
                    "lng": event.gps.lng,
                    "speed_kmh": event.speed_kmh,
                    "impact_g": event.impact_g
                }
                # Forward moderate or severe events to M3 SOS server
                if severity in ["severe", "moderate"]:
                    sos_payload = {
                        "sos_id":    event.event_id,
                        "timestamp": event.timestamp,
                        "gps":       event.gps.dict(),
                        "severity":  severity,
                        "speed_kmh": event.speed_kmh,
                        "impact_g":  event.impact_g,
                        "source":    event.source
                    }
                    try:
                        async with httpx.AsyncClient(timeout=3.0) as client:
                            await client.post(M3_SOS_URL, json=sos_payload)
                        logging.info(f"[M2→M3] WS: SOS forwarded for event {event.event_id}")
                    except Exception as fwd_err:
                        logging.warning(f"[M2→M3] WS SOS forward failed: {fwd_err}")

                # broadcast to ALL connected clients including the sender
                await manager.broadcast(broadcast_data)
                
            except Exception as parse_err:
                logging.error(f"Error parsing incoming WS message: {parse_err}")
                await websocket.send_json({"error": "Invalid format", "details": str(parse_err)})
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
