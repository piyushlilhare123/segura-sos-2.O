import React from 'react';

export default function GuidePage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 style={{ fontFamily: 'var(--font-display)', letterSpacing: '1px' }}>📖 How To Use Segura SOS</h1>
        <span className="badge badge-success">SYSTEM USER GUIDE</span>
      </div>

      <div style={{ maxWidth: '750px', margin: '24px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Quick Overview */}
        <div className="card card-alert" style={{ borderLeftColor: 'var(--primary)' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px', color: '#ffffff' }}>🛡️ System Overview</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Segura SOS is an automated accident detection and real-time emergency dispatch network. It monitors mobile telemetry (GPS, Accelerometer, Gyroscope), processes crash risk using AI inference, and dispatches automated Twilio emergency calls and WebSocket broadcasts.
          </p>
        </div>

        {/* Step 1: M1 Telemetry Simulator */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--input-bg)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
              1
            </div>
            <h3 style={{ fontSize: '18px' }}>M1 — Telemetry & Sensor Simulator</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
            Access the HTTPS web simulator on port <code className="mono" style={{ color: '#fff' }}>:8443</code> or mobile browser to stream real-time motion sensor data.
          </p>
          <ul style={{ color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Manual Controls:</strong> Adjust G-Force sliders, speed, and tilt angle.</li>
            <li><strong>Crash Scenarios:</strong> Click <em>Hard Brake</em>, <em>Rollover</em>, or <em>Severe Crash</em> to simulate live collision telemetry.</li>
          </ul>
        </div>

        {/* Step 2: M2 AI Classification Engine */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--input-bg)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
              2
            </div>
            <h3 style={{ fontSize: '18px' }}>M2 — AI Crash Engine</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
            The FastAPI engine (port <code className="mono" style={{ color: '#fff' }}>:8000</code>) evaluates incoming sensor packets:
          </p>
          <ul style={{ color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Minor Events:</strong> Logged to community map feed.</li>
            <li><strong>Moderate & Severe Crashes:</strong> Triggers immediate POST payload to M3 SOS Dispatch server.</li>
          </ul>
        </div>

        {/* Step 3: M3 Emergency Dispatch Command Server */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--input-bg)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
              3
            </div>
            <h3 style={{ fontSize: '18px' }}>M3 — Dispatch Command Center</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
            Open <code className="mono" style={{ color: '#fff' }}>http://localhost:4000</code> to monitor the live dispatch console:
          </p>
          <ul style={{ color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Automated Voice Calls:</strong> Initiates Twilio emergency voice dispatch to registered numbers.</li>
            <li><strong>Live Incident Stream:</strong> Broadcasts real-time WebSocket alerts to all connected community app clients.</li>
          </ul>
        </div>

        {/* Step 4: M4 Community Safety App & HUD */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'var(--input-bg)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
              4
            </div>
            <h3 style={{ fontSize: '18px' }}>M4 — Safety Map & Telemetry HUD</h3>
          </div>
          <ul style={{ color: 'var(--text-muted)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Map Tab:</strong> View live incident locations, search road hazards, and filter severity levels.</li>
            <li><strong>HUD Tab:</strong> Mount phone on dashboard to view live digital speedometer, G-force scope, and tilt meter.</li>
            <li><strong>Report Tab:</strong> Submit crowd-sourced hazard reports with automatic GPS tagging.</li>
            <li><strong>Floating SOS Button:</strong> Press the red 🚨 button anytime to initiate a 5-second countdown emergency dispatch.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
