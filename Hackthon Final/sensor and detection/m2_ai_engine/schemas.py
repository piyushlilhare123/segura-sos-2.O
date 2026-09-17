"""Pydantic schemas for M2 AI Engine API"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class GPSData(BaseModel):
    lat: float = 0.0
    lng: float = 0.0
    accuracy_m: float = 10.0


class SensorEvent(BaseModel):
    event_id: str
    timestamp: str
    type: str = "crash"  # crash | hard_brake | normal
    gps: GPSData = GPSData()
    speed_kmh: float = 0.0
    impact_g: float = 1.0
    weather: str = "clear"  # clear | rain | fog
    source: str = "simulated"  # real | simulated


class HazardZone(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    radius_m: float
    type: str  # school_zone | blind_turn | accident_cluster
    risk_level: str  # low | medium | high


class AnalysisResult(BaseModel):
    event_id: str
    severity: str          # minor | moderate | severe
    risk_score: float      # 0.0 – 1.0
    risk_label: str        # low | medium | high | critical
    alert_message: str
    hazard_zone: Optional[str] = None
    action_required: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
