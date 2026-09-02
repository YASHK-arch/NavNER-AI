/**
 * Header component with branding, live stats, fleet status, view tabs, and WebSocket status.
 */
import { useState } from 'react';

export function Header({ vehicleCount, incidentCount, isConnected, fleetData, activeView, onViewChange }) {
  const [showSmsToast, setShowSmsToast] = useState(false);

  const simulateSMS = async () => {
    setShowSmsToast(true);
    setTimeout(() => setShowSmsToast(false), 5000);
    
    try {
      await fetch('http://localhost:8000/api/v1/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'landslide',
          severity: 'Critical',
          description: 'Severe Landslide (Via Satellite SMS)',
          lat: 26.1445,
          lng: 91.7362,
        })
      });
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <header className="header">
      {showSmsToast && (
        <div style={{
          position: 'absolute', top: 60, right: 20, background: '#1c1c1e', border: '1px solid #333', 
          padding: 16, borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 9999,
          color: 'white', maxWidth: 320, animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 'bold', marginBottom: 4 }}>📡 SATELLITE GATEWAY</div>
          <div style={{ fontSize: 14, fontFamily: 'monospace', color: '#ccc' }}>
            NNER|INC-88|LND|C|26.14|91.73|Severe Landslide
          </div>
        </div>
      )}

      <div className="header-brand">
        <img src="/favicon.svg" alt="NavNER-AI" style={{ width: 36, height: 36 }} />
        <div>
          <div className="header-title">NavNER·AI</div>
          <div className="header-subtitle">NER Logistics Intelligence</div>
        </div>
      </div>

      <div className="header-tabs">
        <button
          className="header-tab"
          style={{ background: '#ff5b22', color: '#fff', borderColor: '#ff5b22', marginRight: 16 }}
          onClick={simulateSMS}
        >
          📡 Simulate SMS 
        </button>
        <button
          className={`header-tab ${activeView === 'map' ? 'active' : ''}`}
          onClick={() => onViewChange?.('map')}
        >
          🗺️ Map
        </button>
        <button
          className={`header-tab ${activeView === 'analytics' ? 'active' : ''}`}
          onClick={() => onViewChange?.('analytics')}
        >
          📊 Analytics
        </button>
      </div>

      <div className="header-stats">
        <div className="stat-item">
          <span className="stat-dot blue"></span>
          <span className="stat-count">{vehicleCount}</span>
          <span className="stat-label">Vehicles</span>
        </div>

        <div className="stat-item">
          <span className="stat-dot red"></span>
          <span className="stat-count">{incidentCount}</span>
          <span className="stat-label">Incidents</span>
        </div>

        {/* Stage 3: Fleet stats */}
        {fleetData && (
          <>
            <div className="stat-item">
              <span className="stat-dot green"></span>
              <span className="stat-count">{fleetData.total_active}</span>
              <span className="stat-label">Active Trips</span>
            </div>
            {fleetData.rerouted_count > 0 && (
              <div className="stat-item stat-item-alert">
                <span className="stat-dot amber"></span>
                <span className="stat-count">{fleetData.rerouted_count}</span>
                <span className="stat-label">Rerouted</span>
              </div>
            )}
          </>
        )}

        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className={`stat-dot ${isConnected ? 'green' : 'red'}`}></span>
          {isConnected ? 'Live' : 'Reconnecting...'}
        </div>
      </div>
    </header>
  );
}
