import React, { useState, useEffect, useRef } from 'react';

const M2_RISK_URL   = (lat, lng) => `http://localhost:8000/risk?lat=${lat}&lng=${lng}`;
const M2_HAZARD_URL = (lat, lng) => `http://localhost:8000/hazards?lat=${lat}&lng=${lng}&radius=5000`;

const RISK_COLORS = {
  low:      '#10b981',
  medium:   '#f59e0b',
  high:     '#f97316',
  critical: '#d71921'
};

export default function HudPage() {
  const [speed,      setSpeed]      = useState(0);
  const [riskLabel,  setRiskLabel]  = useState('low');
  const [riskScore,  setRiskScore]  = useState(0.12);
  const [nearHazard, setNearHazard] = useState(null);
  const [pos,        setPos]        = useState(null);
  const [wakeLock,   setWakeLock]   = useState(false);
  const [gForce,     setGForce]     = useState({ x: 0.05, y: 0.12, z: 0.98 });
  const [tilt,       setTilt]       = useState(0);

  const lastPosRef     = useRef(null);
  const lastPosTimeRef = useRef(null);

  useEffect(() => {
    let wl = null;
    const acquire = async () => {
      if ('wakeLock' in navigator) {
        try {
          wl = await navigator.wakeLock.request('screen');
          setWakeLock(true);
        } catch (_) {}
      }
    };
    acquire();
    return () => wl?.release().catch(() => {});
  }, []);

  useEffect(() => {
    const handleMotion = (e) => {
      if (e.accelerationIncludingGravity) {
        const x = (e.accelerationIncludingGravity.x || 0) / 9.81;
        const y = (e.accelerationIncludingGravity.y || 0) / 9.81;
        const z = (e.accelerationIncludingGravity.z || 0) / 9.81;
        setGForce({ x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)), z: parseFloat(z.toFixed(2)) });
        setTilt(Math.round(Math.atan2(y, z) * (180 / Math.PI)));
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        let kmh = 0;
        if (p.coords.speed != null && p.coords.speed >= 0) {
          kmh = p.coords.speed * 3.6;
        } else if (lastPosRef.current && lastPosTimeRef.current) {
          const dLat = (p.coords.latitude  - lastPosRef.current.lat)  * Math.PI / 180;
          const dLng = (p.coords.longitude - lastPosRef.current.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 +
            Math.cos(lastPosRef.current.lat * Math.PI/180) *
            Math.cos(p.coords.latitude      * Math.PI/180) *
            Math.sin(dLng/2)**2;
          const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const dt   = (now - lastPosTimeRef.current) / 1000;
          kmh = dt > 0 ? (dist / dt) * 3.6 : 0;
        }
        setSpeed(Math.round(kmh));
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        lastPosRef.current     = { lat: p.coords.latitude, lng: p.coords.longitude };
        lastPosTimeRef.current = now;
      },
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!pos) return;
    const poll = async () => {
      try {
        const res  = await fetch(M2_RISK_URL(pos.lat, pos.lng));
        const data = await res.json();
        setRiskLabel(data.risk_label || 'low');
        setRiskScore(data.risk_score || 0.15);
      } catch (_) {}
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const fetchHazard = async () => {
      try {
        const res  = await fetch(M2_HAZARD_URL(pos.lat, pos.lng));
        const data = await res.json();
        if (data.data?.length > 0) {
          const nearest = data.data.sort((a,b) => a.distance_m - b.distance_m)[0];
          setNearHazard(nearest);
        } else {
          setNearHazard(null);
        }
      } catch (_) {}
    };
    fetchHazard();
    const timer = setInterval(fetchHazard, 10000);
    return () => clearInterval(timer);
  }, [pos]);

  const riskColor = RISK_COLORS[riskLabel] || '#10b981';

  return (
    <div className="page" style={{ paddingBottom: 'calc(var(--nav-h) + 20px)' }}>
      <div className="page-header">
        <h1>🚗 Telemetry Cockpit HUD</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {wakeLock && (
            <span className="badge badge-success">
              DISPLAY AWAKE
            </span>
          )}
          <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: riskColor, border: `1px solid ${riskColor}` }}>
            {riskLabel.toUpperCase()} RISK [{(riskScore * 100).toFixed(0)}%]
          </span>
        </div>
      </div>

      <div className="hud-grid">
        {/* Speedometer Gauge Card */}
        <div className="hud-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <svg width="220" height="130" viewBox="0 0 200 120" style={{ marginTop: '10px' }}>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#242424"
              strokeWidth="16"
              strokeLinecap="round"
            />
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke={speed > 80 ? '#d71921' : speed > 60 ? '#f59e0b' : '#ffffff'}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray="251"
              strokeDashoffset={251 - (251 * Math.min(speed, 140)) / 140}
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
            />
          </svg>
          <div className="hud-speed-display" style={{ color: speed > 80 ? 'var(--secondary-red)' : '#ffffff' }}>
            {speed}
          </div>
          <div className="hud-label">SPEED (KM/H)</div>
        </div>

        {/* Dynamic G-Force Vector Scope */}
        <div className="hud-card">
          <div className="hud-label" style={{ marginBottom: '16px' }}>G-FORCE VECTOR SCOPE</div>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'var(--input-bg)',
            border: '1px solid var(--card-border)',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ position: 'absolute', height: '100%', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: Math.abs(gForce.x) > 0.8 || Math.abs(gForce.y) > 0.8 ? 'var(--secondary-red)' : '#ffffff',
              boxShadow: Math.abs(gForce.x) > 0.8 || Math.abs(gForce.y) > 0.8 ? '0 0 12px var(--secondary-red)' : '0 0 8px #ffffff',
              transform: `translate(${Math.max(-50, Math.min(50, gForce.x * 35))}px, ${Math.max(-50, Math.min(50, gForce.y * 35))}px)`,
              transition: 'transform 0.15s ease'
            }} />
          </div>
          <div className="mono" style={{ fontSize: '13px', marginTop: '16px', color: 'var(--text-muted)' }}>
            X: {gForce.x}g | Y: {gForce.y}g | Z: {gForce.z}g
          </div>
        </div>

        {/* Vehicle Tilt Angle & Risk Score Bar */}
        <div className="hud-card" style={{ alignItems: 'stretch', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="hud-label">PITCH / TILT ANGLE</span>
            <span className="mono" style={{ fontSize: '18px', fontWeight: '700' }}>{tilt}°</span>
          </div>

          <div className="hud-label" style={{ marginBottom: '8px' }}>AI CRASH RISK THRESHOLD</div>
          <div className="progress-bar-container" style={{ height: '14px', marginBottom: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(10, riskScore * 100))}%`,
                background: riskColor
              }}
            />
          </div>
          <div className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'right' }}>
            Probability: {(riskScore * 100).toFixed(1)}%
          </div>

          <div style={{ background: 'var(--input-bg)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '20px' }}>{nearHazard ? '⚠️' : '🛡️'}</div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700' }}>
                {nearHazard ? nearHazard.name : 'Path Clear — Normal Route'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {nearHazard ? `Hazard detected within ${Math.round(nearHazard.distance_m)}m` : 'No active hazards detected within 5km radius'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
