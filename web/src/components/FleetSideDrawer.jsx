/**
 * FleetSideDrawer — Left panel (logistics mockup style)
 * Search bar → Add Shipment → Active trip cards (selected = orange)
 * Incident feed embedded below
 */
import { useState, useMemo } from 'react';
import { ReportIncidentModal } from './ReportIncidentModal';

const COMMODITY_ICONS = {
  MEDICINE: '💊',
  FOOD_GRAINS: '🌾',
  FUEL: '⛽',
  GENERAL: '📦',
};

const PRIORITY_CONFIG = {
  EMERGENCY: { label: 'Emergency', class: 'tag-emergency', order: 0 },
  HIGH_PRIORITY: { label: 'High', class: 'tag-high', order: 1 },
  STANDARD: { label: 'On The Way', class: 'tag-standard', order: 2 },
};

const INCIDENT_EMOJI = {
  flood: '🌊',
  landslide: '⛰️',
  road_damage: '🚧',
  bridge_collapse: '🌉',
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function FleetSideDrawer({
  fleetData,
  loading,
  selectedTripId,
  onSelectTrip,
  incidents = [],
  onIncidentFlyTo,
  mapCenter,
}) {
  const [search, setSearch] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const sortedTrips = useMemo(() => {
    if (!fleetData?.active_trips) return [];
    let trips = [...fleetData.active_trips];

    if (search.trim()) {
      const q = search.toLowerCase();
      trips = trips.filter(t =>
        (t.license_plate || '').toLowerCase().includes(q) ||
        (t.organization || '').toLowerCase().includes(q) ||
        (t.vehicle_name || '').toLowerCase().includes(q) ||
        (t.origin_name || '').toLowerCase().includes(q) ||
        (t.dest_name || '').toLowerCase().includes(q)
      );
    }

    return trips.sort((a, b) => {
      // Selected first
      if (a.trip_id === selectedTripId) return -1;
      if (b.trip_id === selectedTripId) return 1;
      // Then by priority
      const pa = PRIORITY_CONFIG[a.priority_level]?.order ?? 3;
      const pb = PRIORITY_CONFIG[b.priority_level]?.order ?? 3;
      return pa - pb;
    });
  }, [fleetData, search, selectedTripId]);

  if (isCollapsed) {
    return (
      <button
        className="fleet-drawer-toggle-float"
        onClick={() => setIsCollapsed(false)}
        id="fleet-drawer-toggle"
      >
        🚛 Fleet ({fleetData?.total_active || 0})
        {fleetData?.rerouted_count > 0 && (
          <span className="fleet-drawer-rerouted-badge">{fleetData.rerouted_count}</span>
        )}
      </button>
    );
  }

  return (
    <aside className="fleet-drawer" id="fleet-side-drawer">
      {/* Top heading */}
      <div className="fleet-drawer-header">
        <div className="fleet-drawer-title">
          Shipment
          {fleetData && (
            <span className="fleet-drawer-count-badge">{fleetData.total_active}</span>
          )}
        </div>
        <button className="panel-toggle" onClick={() => setIsCollapsed(true)} title="Collapse">✕</button>
      </div>

      {/* Search */}
      <div className="fleet-search-wrap">
        <span className="fleet-search-icon">🔍</span>
        <input
          type="text"
          className="fleet-search-input"
          placeholder="Search tracking number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          id="fleet-search-input"
        />
      </div>

      {/* Add Shipment Button */}
      <button className="fleet-add-btn" id="fleet-add-btn">
        + Add Shipment
      </button>

      {/* Trip Cards */}
      <div className="fleet-drawer-list">
        {loading && !fleetData && (
          <div className="empty-state">
            <div className="loading-spinner" style={{ width: 24, height: 24 }}></div>
            <span className="empty-state-text">Loading fleet...</span>
          </div>
        )}

        {!loading && sortedTrips.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">🚛</span>
            <span className="empty-state-text">No trips found</span>
          </div>
        )}

        {sortedTrips.map((trip) => {
          const prio = PRIORITY_CONFIG[trip.priority_level] || PRIORITY_CONFIG.STANDARD;
          const isSelected = trip.trip_id === selectedTripId;
          const isRerouted = trip.status === 'REROUTED';
          const commodityIcon = COMMODITY_ICONS[trip.commodity_type] || '📦';

          let etaTime = '—';
          let etaDate = '';
          if (trip.estimated_arrival) {
            const d = new Date(trip.estimated_arrival);
            etaTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            etaDate = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          }

          return (
            <div
              key={trip.trip_id}
              className={`logistics-trip-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectTrip?.(trip.trip_id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectTrip?.(trip.trip_id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Select vehicle ${trip.license_plate || trip.vehicle_name}`}
              id={`fleet-trip-${trip.trip_id.slice(0, 8)}`}
            >
              {/* Card Header Row */}
              <div className="logistics-card-header">
                <div className="logistics-card-icon">
                  <span>{commodityIcon}</span>
                </div>
                <div className="logistics-card-id-wrapper" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div className="logistics-card-id" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {trip.license_plate || trip.vehicle_name}
                  </div>
                  <div className="logistics-card-route-preview" style={{ fontSize: '11px', color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                    {trip.origin_name?.split(',')[0] || 'Origin'} → {trip.dest_name?.split(',')[0] || 'Destination'}
                  </div>
                </div>
                <span className={`logistics-status-badge ${isRerouted ? 'rerouted' : prio.class}`}>
                  {isRerouted ? 'Rerouted' : prio.label}
                </span>
              </div>

              {/* ETA Section */}
              {isSelected && (
                <>
                  <div className="logistics-card-divider"></div>
                  <div className="logistics-eta-row">
                    <span className="logistics-eta-label">Estimated Time</span>
                  </div>
                  <div className="logistics-eta-display">
                    <span className="logistics-eta-time">{etaTime}</span>
                    <span className="logistics-eta-date">{etaDate}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="logistics-progress-row">
                    <div className="logistics-progress-dot origin"></div>
                    <div className="logistics-progress-track">
                      <div className="logistics-progress-truck">🚛</div>
                      <div className="logistics-progress-line"></div>
                    </div>
                    <div className="logistics-progress-dot destination">📍</div>
                  </div>

                  <div className="logistics-route-row">
                    <div className="logistics-route-place">
                      <div className="logistics-place-name">{trip.origin_name || 'Origin'}</div>
                    </div>
                    <div className="logistics-route-place right">
                      <div className="logistics-place-name">{trip.dest_name || 'Destination'}</div>
                    </div>
                  </div>

                  <div className="logistics-org-row">
                    <div className="logistics-org-avatar">🏢</div>
                    <div className="logistics-org-info">
                      <div className="logistics-org-name">{trip.organization || 'NavNER Logistics'}</div>
                      <div className="logistics-org-role">Organization</div>
                    </div>
                    <div className="logistics-org-actions">
                      <button className="logistics-org-btn" title="Contact">📞</button>
                      <button className="logistics-org-btn" title="Message">💬</button>
                    </div>
                  </div>

                  {isRerouted && trip.delay_minutes > 0 && (
                    <div className="logistics-delay-banner">
                      ⚠️ +{trip.delay_minutes} min delay due to route change
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Incident Feed — embedded below */}
      <div className="fleet-incident-section">
        <div className="fleet-incident-section-title">
          ⚠️ Active Incidents
          {incidents.length > 0 && <span className="panel-badge">{incidents.length}</span>}
          <button
            type="button"
            className="fleet-incident-add-btn"
            onClick={() => setShowReportModal(true)}
            title="Report an incident received by radio, phone, or another channel"
          >
            + Report
          </button>
        </div>
        {incidents.length > 0 && (
          <div className="fleet-incident-list">
            {incidents.slice(0, 4).map((inc) => {
              // The satellite-SMS bridge (#74) writes this exact sentinel while
              // the photo is still in flight, so it must be distinguished from
              // an app report that simply has no photo — showing a blank
              // thumbnail for both would read as "no evidence" for a report
              // that is actually still arriving.
              const imagePending = inc.image_url === 'PENDING_NETWORK_SYNC';
              const hasRealImage = inc.image_url && !imagePending;
              return (
                <div
                  key={inc.id}
                  className="fleet-incident-row"
                  onClick={() => onIncidentFlyTo?.(inc.lng, inc.lat)}
                >
                  {hasRealImage ? (
                    <img src={inc.image_url} alt="" className="fleet-incident-thumb" />
                  ) : (
                    <span className="fleet-incident-emoji">{INCIDENT_EMOJI[inc.type] || '⚠️'}</span>
                  )}
                  <div className="fleet-incident-info">
                    <div className="fleet-incident-type">{(inc.type || '').replace(/_/g, ' ')}</div>
                    <div className="fleet-incident-time">{timeAgo(inc.created_at)}</div>
                  </div>
                  {imagePending && (
                    <span className="fleet-incident-pending-badge" title="Reported via satellite SMS — photo not yet synced">
                      📡 pending
                    </span>
                  )}
                  <span className={`fleet-incident-dot ${inc.status}`}></span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showReportModal && (
        <ReportIncidentModal
          mapCenter={mapCenter}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </aside>
  );
}
