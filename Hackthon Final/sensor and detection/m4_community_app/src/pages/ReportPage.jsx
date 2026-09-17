import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const M3_INCIDENT_URL = 'http://localhost:4000/incident';

export default function ReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    description: '',
    severity:    'medium',
    your_name:   '',
    lat:         '',
    lng:         '',
    photo:       null
  });
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [offline,    setOffline]    = useState(!navigator.onLine);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setForm(f => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6)
        })),
        () => {}
      );
    }
    const onOnline  = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      description: form.description,
      severity:    form.severity,
      reporter:    form.your_name || 'Anonymous Driver',
      lat:         parseFloat(form.lat) || 0,
      lng:         parseFloat(form.lng) || 0,
      timestamp:   new Date().toISOString()
    };

    if (offline) {
      const pending = JSON.parse(localStorage.getItem('pending_reports') || '[]');
      pending.push(payload);
      localStorage.setItem('pending_reports', JSON.stringify(pending));
      setSubmitting(false);
      setSuccess('offline');
      return;
    }

    try {
      const res = await fetch(M3_INCIDENT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess('online');
      setTimeout(() => navigate('/'), 1800);
    } catch (err) {
      const pending = JSON.parse(localStorage.getItem('pending_reports') || '[]');
      pending.push(payload);
      localStorage.setItem('pending_reports', JSON.stringify(pending));
      setSuccess('offline');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>📋 Report Road Incident</h1>
        {offline && <span className="badge badge-warning">OFFLINE MODE</span>}
      </div>

      <div style={{ maxWidth: '600px', margin: '24px auto', padding: '0 24px' }}>
        {success === 'online' && (
          <div className="card" style={{ borderLeft: '4px solid #10b981', textAlign: 'center', padding: '30px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
            <h2>Incident Report Dispatched</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Redirecting to community safety map…</p>
          </div>
        )}

        {success === 'offline' && (
          <div className="card card-alert" style={{ textAlign: 'center', padding: '30px' }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>📦</div>
            <h2>Report Saved Offline</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Will automatically sync with M3 server upon connection.</p>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="hud-label" style={{ display: 'block', marginBottom: '8px' }}>INCIDENT DESCRIPTION *</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Describe accident, severe weather, debris, or road hazard..."
                required
                rows="4"
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '14px',
                  color: 'var(--primary)',
                  padding: '14px 18px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label className="hud-label" style={{ display: 'block', marginBottom: '8px' }}>SEVERITY LEVEL</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['low', 'medium', 'high'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`pill ${level === 'high' ? 'danger' : ''} ${form.severity === level ? 'active' : ''}`}
                    style={{ flex: 1, textTransform: 'uppercase' }}
                    onClick={() => setForm(f => ({ ...f, severity: level }))}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="hud-label" style={{ display: 'block', marginBottom: '8px' }}>REPORTER NAME (OPTIONAL)</label>
              <input
                type="text"
                name="your_name"
                value={form.your_name}
                onChange={handleChange}
                placeholder="Anonymous"
                style={{
                  width: '100%',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '9999px',
                  color: 'var(--primary)',
                  padding: '12px 20px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label className="hud-label" style={{ display: 'block', marginBottom: '8px' }}>LIVE GPS TELEMETRY TAG</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="mono" style={{ background: 'var(--input-bg)', padding: '12px 18px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Lat: {form.lat || 'Acquiring GPS...'}
                </div>
                <div className="mono" style={{ background: 'var(--input-bg)', padding: '12px 18px', borderRadius: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Lng: {form.lng || '...'}
                </div>
              </div>
            </div>

            {error && <p style={{ color: 'var(--secondary-red)', fontSize: '13px' }}>{error}</p>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '15px' }} disabled={submitting}>
              {submitting ? 'SUBMITTING...' : offline ? '📦 SAVE OFFLINE' : '🚨 DISPATCH INCIDENT REPORT'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
