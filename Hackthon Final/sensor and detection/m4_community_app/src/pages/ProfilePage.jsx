import React from 'react';

export default function ProfilePage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>👤 Driver Safety Scorecard</h1>
        <span className="badge badge-success">VERIFIED GUARDIAN</span>
      </div>

      <div style={{ maxWidth: '600px', margin: '24px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Main Score Card */}
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--input-bg)',
            border: '2px solid var(--card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
            margin: '0 auto 16px'
          }}>
            🛡️
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>Community Safety Pilot</h2>
          <div className="mono" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
            ID: SEGURA-PILOT-8894
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="hud-label">SAFETY RATING</span>
            <span className="mono" style={{ fontSize: '20px', fontWeight: '700' }}>98 / 100</span>
          </div>

          {/* Dual tone progress bar matching reference design image (White + Tint Red highlight) */}
          <div className="progress-bar-container" style={{ height: '12px', marginBottom: '8px', display: 'flex' }}>
            <div className="progress-bar-fill" style={{ width: '85%', background: '#ffffff' }} />
            <div className="progress-bar-highlight" style={{ width: '13%', background: '#ffaaaa' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>Smooth Driving: 98%</span>
            <span>Alert Preparedness: 95%</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: '32px', fontWeight: '700' }}>1,240</div>
            <div className="hud-label" style={{ marginTop: '4px' }}>KM SAFE DRIVEN</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: '32px', fontWeight: '700' }}>14</div>
            <div className="hud-label" style={{ marginTop: '4px' }}>HAZARDS REPORTED</div>
          </div>
        </div>

        {/* Emergency Contacts Card */}
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📞 Emergency Dispatch Contacts
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: 'var(--input-bg)', padding: '12px 18px', borderRadius: '9999px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>Segura Dispatch HQ</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Automated Twilio Voice Channel</div>
              </div>
              <span className="badge badge-danger">PRIMARY</span>
            </div>

            <div style={{ background: 'var(--input-bg)', padding: '12px 18px', borderRadius: '9999px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>Emergency Contact #1</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>SMS & Call Alert</div>
              </div>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>ACTIVE</span>
            </div>
          </div>

          <button className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => alert('Emergency contacts locked in test environment.')}>
            EDIT EMERGENCY CONTACTS
          </button>
        </div>
      </div>
    </div>
  );
}
