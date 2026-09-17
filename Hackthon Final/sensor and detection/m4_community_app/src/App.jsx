import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import MapPage from './pages/MapPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import HudPage from './pages/HudPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import GuidePage from './pages/GuidePage.jsx';
import './index.css';

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <BrowserRouter>
      {!isOnline && (
        <div className="offline-banner">
          ⚡ OFFLINE MODE — DISPLAYING CACHED SAFETY DATA
        </div>
      )}

      <Routes>
        <Route path="/"       element={<MapPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/hud"    element={<HudPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/guide"  element={<GuidePage />} />
      </Routes>

      <FloatingSOS />
      <BottomNav />
    </BrowserRouter>
  );
}

function FloatingSOS() {
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let timer;
    if (showModal && countdown > 0) {
      timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    } else if (showModal && countdown === 0) {
      dispatchSOS();
    }
    return () => clearInterval(timer);
  }, [showModal, countdown]);

  const triggerModal = () => {
    setCountdown(5);
    setShowModal(true);
  };

  const cancelSOS = () => {
    setShowModal(false);
    setCountdown(5);
  };

  const dispatchSOS = async () => {
    setIsSending(true);
    try {
      const m3Url = import.meta.env.VITE_M3_URL || 'http://localhost:4000';
      await fetch(`${m3Url}/demo/trigger-sos`, { method: 'POST' });
    } catch(err) {
      console.error('Manual SOS dispatch warning:', err);
    } finally {
      setIsSending(false);
      setShowModal(false);
      alert('🚨 Distress signal dispatched to M3 Emergency Command & Contacts.');
    }
  };

  return (
    <>
      <button className="fab-sos" onClick={triggerModal} aria-label="Trigger Emergency SOS">
        🚨
      </button>

      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13, 13, 13, 0.85)',
          backdropFilter: 'blur(12px)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="card" style={{
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
            border: '1px solid var(--secondary-red)',
            boxShadow: '0 20px 50px rgba(215, 25, 33, 0.4)'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '12px'
            }}>🚨</div>
            <h2 style={{ color: 'var(--secondary-red)', marginBottom: '8px' }}>DISPATCHING SOS</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              Sending emergency location & telemetry to dispatch center in:
            </p>
            <div className="mono" style={{
              fontSize: '64px',
              fontWeight: '700',
              color: '#ffffff',
              marginBottom: '24px'
            }}>
              00:0{countdown}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={cancelSOS} style={{ flex: 1 }}>
                CANCEL
              </button>
              <button className="btn btn-danger" onClick={dispatchSOS} disabled={isSending} style={{ flex: 1 }}>
                {isSending ? 'SENDING…' : 'SEND NOW'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
          </svg>
        </span>
        <span>Map</span>
      </NavLink>
      <NavLink to="/report" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </span>
        <span>Report</span>
      </NavLink>
      <NavLink to="/hud" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="12 8 8 12 12 16 12 8"></polygon>
          </svg>
        </span>
        <span>HUD</span>
      </NavLink>
      <NavLink to="/guide" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </span>
        <span>Guide</span>
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </span>
        <span>Stats</span>
      </NavLink>
    </nav>
  );
}
