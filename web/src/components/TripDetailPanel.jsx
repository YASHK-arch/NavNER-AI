/**
 * TripDetailPanel — Right-side detail panel (logistics mockup style)
 * Shows Shipping Info, Driver Info, and Route Details timeline
 * when a trip is selected.
 */

const COMMODITY_LABELS = {
  MEDICINE: { label: 'Pharma / Medicine', icon: '💊', type: 'Pharma' },
  FOOD_GRAINS: { label: 'Food Grains', icon: '🌾', type: 'Grains' },
  FUEL: { label: 'Fuel', icon: '⛽', type: 'Fuel' },
  GENERAL: { label: 'General Goods', icon: '📦', type: 'General' },
};

const PRIORITY_CONFIG = {
  EMERGENCY: { label: 'Emergency', color: '#ef4444' },
  HIGH_PRIORITY: { label: 'High Priority', color: '#f97316' },
  STANDARD: { label: 'Standard', color: '#3b82f6' },
};

function formatTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function TripDetailPanel({ trip, instructions, onClose, onAcceptRoute, onRevertRoute }) {
  if (!trip) {
    return (
      <aside className="trip-detail-panel trip-detail-empty" id="trip-detail-panel">
        <div className="trip-detail-empty-state">
          <div className="trip-detail-empty-icon">🗺️</div>
          <div className="trip-detail-empty-title">Select a Shipment</div>
          <div className="trip-detail-empty-sub">Click any trip card to view details, route info, and driver data.</div>
        </div>
      </aside>
    );
  }

  const commodity = COMMODITY_LABELS[trip.commodity_type] || COMMODITY_LABELS.GENERAL;
  const priority = PRIORITY_CONFIG[trip.priority_level] || PRIORITY_CONFIG.STANDARD;
  const isRerouted = trip.status === 'REROUTED';
  const isInTransit = trip.status === 'IN_TRANSIT';

  // Build route timeline steps
  const routeSteps = [
    {
      label: 'Pick Up',
      location: trip.origin_name || 'Origin',
      time: trip.departure_time || null,
      status: 'done',
    },
    {
      label: 'In Transit',
      location: `En route to ${trip.dest_name || 'Destination'}`,
      time: null,
      status: isInTransit || isRerouted ? 'active' : 'pending',
    },
    ...(isRerouted ? [{
      label: 'Rerouted',
      location: 'Dynamic reroute applied',
      time: trip.last_rerouted_at,
      status: 'warn',
    }] : []),
    {
      label: 'Delivered',
      location: trip.dest_name || 'Destination',
      time: trip.estimated_arrival,
      status: 'pending',
    },
  ];

  return (
    <aside className="trip-detail-panel" id="trip-detail-panel">
      {/* Panel Header */}
      <div className="trip-detail-header">
        <div className="trip-detail-header-title">
          <span>Route Details</span>
        </div>
        <button className="panel-toggle" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="trip-detail-body">

        {/* Shipping Info Card */}
        <div className="trip-detail-card" id="shipping-info-card">
          <div className="trip-detail-card-title">Shipping Info</div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Tracking No.</span>
              <span className="trip-detail-field-value tracking-id">
                #{(trip.trip_id || '').slice(0, 7).toUpperCase()}
                <button className="copy-btn" title="Copy" onClick={() => navigator.clipboard.writeText(trip.trip_id)}>⎘</button>
              </span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Organization</span>
              <span className="trip-detail-field-value">{trip.organization || 'NavNER Logistics'}</span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Type</span>
              <span className="trip-detail-field-value">{commodity.type}</span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Priority</span>
              <span
                className="trip-detail-field-value"
                style={{ color: priority.color, fontWeight: 700 }}
              >
                {priority.label}
              </span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Status</span>
              <span className={`trip-status-badge ${isRerouted ? 'rerouted' : isInTransit ? 'in-transit' : 'pending'}`}>
                {isRerouted ? 'Rerouted' : isInTransit ? 'On The Way' : trip.status}
              </span>
            </div>
            {isRerouted && trip.delay_minutes && (
              <div className="trip-detail-field full-span">
                <span className="trip-detail-field-label">Delay</span>
                <span className="trip-detail-field-value delay-warn">+{trip.delay_minutes} min</span>
              </div>
            )}
          </div>
        </div>

        {/* Driver / Vehicle Info Card */}
        <div className="trip-detail-card" id="driver-info-card">
          <div className="trip-detail-card-title">Vehicle Info</div>
          <div className="driver-info-row">
            <div className="driver-avatar">🚛</div>
            <div className="driver-info-details">
              <div className="driver-name">{trip.organization || 'NavNER Logistics'}</div>
              <div className="driver-status-row">
                <span className="driver-online-dot"></span>
                <span className="driver-status-text">Active</span>
              </div>
            </div>
            <div className="driver-actions">
              <button className="driver-action-btn" title="Contact">📞</button>
              <button className="driver-action-btn" title="Message">💬</button>
            </div>
          </div>
          <div className="trip-detail-grid" style={{ marginTop: 12 }}>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Plate No.</span>
              <span className="trip-detail-field-value mono">{trip.license_plate || trip.vehicle_name}</span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Vehicle</span>
              <span className="trip-detail-field-value">{trip.vehicle_name || 'Truck'}</span>
            </div>
            <div className="trip-detail-field">
              <span className="trip-detail-field-label">Commodity</span>
              <span className="trip-detail-field-value">{commodity.icon} {commodity.type}</span>
            </div>
          </div>
        </div>

        {/* Route Timeline Card */}
        <div className="trip-detail-card" id="route-timeline-card">
          <div className="trip-detail-card-title">Route Timeline</div>
          <div className="route-timeline">
            {routeSteps.map((step, i) => (
              <div key={i} className={`route-timeline-step ${step.status}`}>
                <div className="route-timeline-dot"></div>
                {i < routeSteps.length - 1 && <div className="route-timeline-line"></div>}
                <div className="route-timeline-content">
                  <div className="route-timeline-time">
                    {step.time ? `${formatDate(step.time)} · ${formatTime(step.time)}` : (step.status === 'active' ? 'Now' : 'ETA ' + formatTime(trip.estimated_arrival))}
                  </div>
                  <div className="route-timeline-label">{step.label}</div>
                  <div className="route-timeline-location">{step.location}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Turn-by-Turn Instructions Card */}
        {instructions && instructions.length > 0 && (
          <div className="trip-detail-card" id="navigation-instructions-card">
            <div className="trip-detail-card-title">Navigation Instructions</div>
            <div className="instructions-list" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {instructions.map((step, i) => (
                <div key={i} className="instruction-step" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                  <div className="instruction-icon" style={{ fontSize: '1.2em' }}>
                    {step.instruction?.toLowerCase().includes('left') ? '↩️' : step.instruction?.toLowerCase().includes('right') ? '↪️' : step.instruction?.toLowerCase().includes('arrive') ? '📍' : '⬆️'}
                  </div>
                  <div className="instruction-content" style={{ flex: 1 }}>
                    <div className="instruction-action" style={{ fontWeight: 600, fontSize: '0.9em', color: 'var(--text-primary)' }}>
                      {step.instruction || 'Continue on route'}
                    </div>
                  </div>
                  {step.distance_km > 0 && (
                    <div className="instruction-distance" style={{ fontSize: '0.85em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {step.distance_km >= 1 ? `${step.distance_km.toFixed(1)} km` : `${Math.round(step.distance_km * 1000)} m`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {isRerouted && (
          <div className="trip-detail-actions">
            <button
              className="trip-action-primary"
              onClick={() => onAcceptRoute?.(trip.trip_id)}
            >
              ✓ Accept New Route
            </button>
            <button
              className="trip-action-secondary"
              onClick={() => onRevertRoute?.(trip.trip_id)}
            >
              ↩ Revert to Original
            </button>
          </div>
        )}
        {!isRerouted && (
          <div className="trip-detail-actions">
            <button
              className="trip-action-primary"
              onClick={() => onAcceptRoute?.(trip.trip_id)}
            >
              🔄 Recalculate Route
            </button>
          </div>
        )}

      </div>
    </aside>
  );
}
