/**
 * Header component with branding, live stats, fleet status, view tabs, and WebSocket status.
 */
export function Header({ vehicleCount, incidentCount, isConnected, fleetData, activeView, onViewChange }) {
  return (
    <header className="header">
      <div className="header-brand">
        <img src="/favicon.svg" alt="NavNER-AI" style={{ width: 36, height: 36 }} />
        <div>
          <div className="header-title">NavNER·AI</div>
          <div className="header-subtitle">NER Logistics Intelligence</div>
        </div>
      </div>

      <div className="header-tabs">
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
