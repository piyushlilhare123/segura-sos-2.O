const IS_LOCAL = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const M2_HTTP_URL = import.meta.env.VITE_M2_URL || 
  (IS_LOCAL ? 'http://localhost:8000' : 'https://segura-m2-ai-engine.onrender.com');

export const M2_WS_URL = import.meta.env.VITE_M2_WS_URL || 
  (IS_LOCAL ? 'ws://localhost:8000/ws' : 'wss://segura-m2-ai-engine.onrender.com/ws');

export const M3_HTTP_URL = import.meta.env.VITE_M3_URL || 
  (IS_LOCAL ? 'http://localhost:4000' : 'https://segura-m3-sos-server.onrender.com');

export const M3_WS_URL = import.meta.env.VITE_M3_WS_URL || 
  (IS_LOCAL ? 'ws://localhost:4000' : 'wss://segura-m3-sos-server.onrender.com');
