import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * RouteIntelligencePanel — Uber-style smart route suggestions
 *
 * Shows when a trip is selected AND has a rerouted/blocked route.
 * Displays:
 * - Current route status (blocked/congested/calamity)
 * - 2-3 alternative routes with estimated time + hazard score
 * - Visual confirmation bar (like Uber's "You're near a smart route")
 * - Halting recommendation if all routes are blocked
 * - Accept / Ignore route suggestion
 */

const BLOCKAGE_REASONS = {
  ROAD_CLOSURE:       { label: 'Road Closed',      icon: '🚧', color: '#ef4444' },
  LANDSLIDE:          { label: 'Landslide',         icon: '⛰️', color: '#ef4444' },
  FLOOD:              { label: 'Flooding',           icon: '🌊', color: '#3b82f6' },
  LOW_VISIBILITY:     { label: 'Low Visibility',    icon: '🌫️', color: '#6b7280' },
  BRIDGE_COLLAPSE:    { label: 'Bridge Damaged',    icon: '🌉', color: '#ef4444' },
  CONGESTION:         { label: 'Heavy Traffic',     icon: '🚗', color: '#f59e0b' },
  WEATHER_EXTREME:    { label: 'Extreme Weather',   icon: '⛈️', color: '#8b5cf6' },
};

const ROUTE_QUALITY = {
  OPTIMAL:   { label: 'Smart Route',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  ALTERNATE:  { label: 'Alternate',     color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  LAST_RESORT: { label: 'Last Resort', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

function formatMinutes(mins) {
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function HazardBar({ score }) {
  const pct = Math.round((score || 0) * 100);
  let color = '#22c55e';
  if (pct > 70) color = '#ef4444';
  else if (pct > 40) color = '#f59e0b';

  return (
    <div className="ri-hazard-bar">
      <div className="ri-hazard-bar-fill" style={{ width: `${pct}%`, background: color }}></div>
      <span className="ri-hazard-bar-label" style={{ color }}>{pct}%</span>
    </div>
  );
}

export function RouteIntelligencePanel({ trip, onAccept, onIgnore, onHalt }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    }
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  if (!trip) return null;

  const isRerouted = trip.status === 'REROUTED';
  const isEmergencyHalt = false; // Would come from backend in full impl

  // Build synthetic alternative routes based on trip data
  // In production these come from /api/v1/routing/alternatives
  const blockReason = BLOCKAGE_REASONS.LANDSLIDE; // would be from trip.blockage_reason

  const currentDelay = trip.delay_minutes || 0;

  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trip?.trip_id) return;
    
    let isMounted = true;
    setLoading(true);
    
    fetch(`http://localhost:8000/api/v1/routing/trip/${trip.trip_id}/alternatives`)
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.alternatives) {
          setAlternatives(data.alternatives);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Error fetching LLM alternatives:", err);
        if (isMounted) setLoading(false);
      });
      
    return () => { isMounted = false; };
  }, [trip?.trip_id]);

  return (
    <div 
      className="ri-panel" 
      id="route-intelligence-panel"
      style={{
        transform: `translate(calc(-50% + ${position.x}px), ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
      }}
    >
      {/* Banner - acts as drag handle */}
      <div 
        className={`ri-banner ${isRerouted ? 'rerouted' : 'warning'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="ri-banner-icon">{blockReason.icon}</div>
        <div className="ri-banner-content">
          <div className="ri-banner-title">
            {isRerouted ? 'Route Rerouted' : `${blockReason.label} Detected`}
          </div>
          <div className="ri-banner-sub">
            {isRerouted
              ? `+${currentDelay}m delay • AI suggests smarter route`
              : 'Original route blocked — select alternative below'}
          </div>
        </div>
        <button 
          className="ri-minimize-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(!isMinimized);
          }}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>

      {!isMinimized && (
        <div className="ri-panel-content" style={{ paddingBottom: '16px' }}>

      {/* Current status */}
      <div className="ri-current-status">
        <div className="ri-section-label">Current Route Status</div>
        <div className="ri-status-row">
          <span className="ri-status-icon" style={{ color: blockReason.color }}>{blockReason.icon}</span>
          <div className="ri-status-detail">
            <div className="ri-status-reason" style={{ color: blockReason.color }}>
              {blockReason.label}
            </div>
            <div className="ri-status-route">
              {trip.origin_name} → {trip.dest_name}
            </div>
          </div>
          {currentDelay > 0 && (
            <div className="ri-delay-badge">+{currentDelay}m</div>
          )}
        </div>
      </div>

      {/* Alternative routes */}
      <div className="ri-section-label">Smart Route Options</div>

      <div className="ri-routes-list">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
            <div className="loading-spinner" style={{ display: 'inline-block', width: '24px', height: '24px', marginBottom: '8px' }}></div>
            <div>NavNER.ai is analyzing safe alternatives...</div>
          </div>
        ) : alternatives.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
            No alternatives found.
          </div>
        ) : alternatives.map((alt, i) => {
          const quality = ROUTE_QUALITY[alt.quality] || ROUTE_QUALITY.ALTERNATE;
          const timeDelta = alt.extraTime;
          const timeStr = timeDelta > 0 ? `+${timeDelta}m` : `${Math.abs(timeDelta)}m faster`;
          const timeColor = timeDelta <= 0 ? '#22c55e' : timeDelta < 30 ? '#f59e0b' : '#ef4444';

          return (
            <div
              key={alt.id}
              className={`ri-route-card ${i === 0 ? 'recommended' : ''}`}
              style={{ borderColor: i === 0 ? quality.color : 'var(--border)', background: i === 0 ? quality.bg : '' }}
            >
              {i === 0 && (
                <div className="ri-recommended-badge" style={{ background: quality.color }}>
                  ✓ SMART ROUTE
                </div>
              )}
              <div className="ri-route-header">
                <div className="ri-route-name">{alt.label}</div>
                <div className="ri-route-time" style={{ color: timeColor }}>
                  {timeStr}
                </div>
              </div>
              <div className="ri-route-description">{alt.description}</div>
              <div className="ri-route-meta">
                <span className="ri-route-distance">📍 {alt.distance}km</span>
                <div className="ri-route-hazard">
                  <span className="ri-hazard-label">Hazard:</span>
                  <HazardBar score={alt.hazardScore} />
                </div>
              </div>
              {i === 0 && (
                <button
                  className="ri-accept-btn"
                  style={{ background: quality.color }}
                  onClick={() => onAccept?.(trip.trip_id, alt.id)}
                >
                  ✓ Accept This Route
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="ri-actions">
        <button className="ri-ignore-btn" onClick={() => onIgnore?.(trip.trip_id)}>
          Continue Original
        </button>
        <button className="ri-halt-btn" onClick={() => onHalt?.(trip.trip_id)}>
          🛑 Halt & Wait
        </button>
      </div>
      </div>
      )}
    </div>
  );
}
