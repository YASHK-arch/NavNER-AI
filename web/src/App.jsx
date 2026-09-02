/**
 * NavNER-AI Command Center — Main Application
 * Stage 1: Live vehicle tracking + incident reporting
 * Stage 2: AI Predictive Disruption Heatmap + Emergency Alerts
 * Stage 3: Dynamic Rerouting Engine + Fleet Optimization
 * Stage 4: Centralized Analytics Dashboard + Alert Dispatch
 *
 * Layout: 3-column (Left Panel | Map | Right Detail Panel)
 */
import { useCallback, useState, useMemo } from 'react';
import './index.css';
import { Header } from './components/Header';
import { MapCanvas } from './components/MapCanvas';
import { IncidentPanel } from './components/IncidentPanel';
import { HazardMapOverlay } from './components/HazardMapOverlay';
import { HazardRouteColorizer } from './components/HazardRouteColorizer';
import { AlertBanner } from './components/AlertBanner';
import { FleetRouteViewer } from './components/FleetRouteViewer';
import { FleetSideDrawer } from './components/FleetSideDrawer';
import { TripDetailPanel } from './components/TripDetailPanel';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { RouteIntelligencePanel } from './components/RouteIntelligencePanel';
import { useMapState } from './hooks/useMapState';
import { useWebSocket } from './hooks/useWebSocket';
import { useHazardMap } from './hooks/useHazardMap';
import { useFleetStatus } from './hooks/useFleetStatus';
import { useOSRMRoutes } from './hooks/useOSRMRoutes';

function App() {
  const { vehicles, setVehicles, incidents, setIncidents, loading, error, refetch: refetchMap } = useMapState();
  const [mapInstance, setMapInstance] = useState(null);
  const [riskUpdate, setRiskUpdate] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [activeView, setActiveView] = useState('map'); // 'map' | 'analytics'

  // Fetch hazard data for the heatmap overlay
  const { hazardData, refetch: refetchHazard } = useHazardMap({ enabled: true });

  // Stage 3: Fleet status management
  const {
    fleetData: rawFleetData,
    loading: fleetLoading,
    refetch: refetchFleet,
    handleRerouteAlert,
    triggerReroute,
  } = useFleetStatus({ enabled: true });

  // Issue #63: Replace straight-line displacement routes with real OSRM
  // road-snapped geometry. This hook transparently enriches rawFleetData
  // — all downstream components just use fleetData and get real roads.
  const fleetData = useOSRMRoutes(rawFleetData);

  // Handle incoming WebSocket messages
  const handleWsMessage = useCallback((message) => {
    switch (message.event) {
      case 'telemetry_update': {
        const { vehicle_id, lat, lng, speed, timestamp } = message.data;
        setVehicles(prev =>
          prev.map(v =>
            v.id === vehicle_id
              ? { ...v, lat, lng, speed, last_ping: timestamp }
              : v
          )
        );
        break;
      }
      case 'new_incident': {
        const newIncident = message.data;
        // Guards against a duplicate: the incident this dashboard's own
        // report-modal submission just created arrives back over this same
        // broadcast — POST /api/v1/incident triggers it too — so without this
        // check submitting a report double-added the row (found live, via
        // React's duplicate-key warning, while testing issue #68).
        setIncidents(prev =>
          prev.some(inc => inc.id === newIncident.id) ? prev : [newIncident, ...prev]
        );
        break;
      }
      case 'risk_update': {
        setRiskUpdate(message.data);
        refetchHazard();
        break;
      }
      case 'reroute_alert': {
        handleRerouteAlert(message.data);
        refetchFleet();
        break;
      }
      case 'fleet_update': {
        refetchFleet();
        refetchMap();
        break;
      }
      default:
        console.log('[App] Unknown WS event:', message.event);
    }
  }, [setVehicles, setIncidents, refetchHazard, handleRerouteAlert, refetchFleet, refetchMap]);

  const { isConnected } = useWebSocket(handleWsMessage);

  const handleMapReady = useCallback((map) => {
    setMapInstance(map);
  }, []);

  const handleFlyTo = useCallback((lng, lat) => {
    const container = document.getElementById('map-canvas');
    if (container?.__flyTo) {
      container.__flyTo(lng, lat);
    }
  }, []);

  const [tripInstructions, setTripInstructions] = useState({}); // tripId -> instructions

  // Stage 3: Route actions
  const handleAcceptRoute = useCallback(async (tripId) => {
    try {
      const result = await triggerReroute(tripId, true, 0.60);
      if (result && result.turn_by_turn_instructions) {
        setTripInstructions(prev => ({
          ...prev,
          [tripId]: result.turn_by_turn_instructions
        }));
      }
    } catch (err) {
      console.error('[App] Accept route error:', err);
    }
  }, [triggerReroute]);

  const handleRevertRoute = useCallback(async (tripId) => {
    try {
      await triggerReroute(tripId, false, 1.0);
    } catch (err) {
      console.error('[App] Revert route error:', err);
    }
  }, [triggerReroute]);

  // Find the currently selected trip
  const selectedTrip = useMemo(() => {
    if (!fleetData?.active_trips || !selectedTripId) return null;
    return fleetData.active_trips.find(t => t.trip_id === selectedTripId) || null;
  }, [fleetData, selectedTripId]);

  // Find the vehicle for the selected trip (for map camera)
  const selectedTripVehicle = useMemo(() => {
    if (!selectedTrip || !vehicles.length) return null;
    // The two endpoints both serialize UUIDs today, but normalising here keeps
    // the camera/marker selection reliable if either transport changes shape.
    return vehicles.find(v => String(v.id) === String(selectedTrip.vehicle_id)) || null;
  }, [selectedTrip, vehicles]);

  // Route geometry for the selected trip — memoised so the map camera effect
  // does not re-run on every render.
  const selectedTripRoute = useMemo(
    () => selectedTrip?.current_route?.coordinates ?? null,
    [selectedTrip],
  );

  // Selecting a truck on the map resolves it to its active trip, so the route
  // highlight and detail panel behave exactly as they do from the sidebar.
  const handleVehicleClick = useCallback((vehicle) => {
    const trip = fleetData?.active_trips?.find(
      t => String(t.vehicle_id) === String(vehicle.id),
    );
    if (trip) setSelectedTripId(trip.trip_id);
  }, [fleetData]);

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner-large">
          <div className="loading-spinner"></div>
          <div className="loading-label">NavNER Initializing...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Header
        vehicleCount={vehicles.length}
        incidentCount={incidents.length}
        isConnected={isConnected}
        fleetData={fleetData}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Stage 2: Emergency Alert Banner */}
      <AlertBanner hazardData={hazardData} riskUpdate={riskUpdate} />

      {/* Stage 4: Tab-based view switching */}
      {activeView === 'map' ? (
        <div className="app-body">
          {/* LEFT: Fleet Side Drawer — logistics mockup style */}
          <FleetSideDrawer
            fleetData={fleetData}
            loading={fleetLoading}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
            incidents={incidents}
            onIncidentFlyTo={handleFlyTo}
            mapCenter={mapInstance ? mapInstance.getCenter() : null}
            hazardData={hazardData}
          />

          {/* CENTER: Full map with 3D perspective */}
          <div className="map-wrapper">
            <MapCanvas
              vehicles={vehicles}
              incidents={incidents}
              onIncidentClick={(incident) => handleFlyTo(incident.lng, incident.lat)}
              onMapReady={handleMapReady}
              onVehicleClick={handleVehicleClick}
              selectedTripId={selectedTripId}
              selectedTripVehicle={selectedTripVehicle}
              selectedTripRoute={selectedTripRoute}
              fleetData={fleetData}
            />

            {/* Stage 3: Blocked-route dashed overlay on map */}
            <FleetRouteViewer
              map={mapInstance}
              fleetData={fleetData}
              selectedTripId={selectedTripId}
            />

            {/* Issue #63: Hazard-colored segmented active routes */}
            <HazardRouteColorizer
              map={mapInstance}
              fleetData={fleetData}
              hazardData={hazardData}
              selectedTripId={selectedTripId}
            />

            {/* Stage 2: Hazard Map Overlay Controls */}
            <HazardMapOverlay
              map={mapInstance}
              hazardData={hazardData}
              enabled={true}
              showHazard={true}
            />
            {/* Uber-style Route Intelligence Panel — appears bottom-center on rerouted/blocked trips */}
            {selectedTrip && selectedTrip.status === 'REROUTED' && (
              <RouteIntelligencePanel
                trip={selectedTrip}
                onAccept={handleAcceptRoute}
                onIgnore={() => setSelectedTripId(null)}
                onHalt={() => {}}
              />
            )}
          </div>

          {/* RIGHT: Trip Detail Panel — logistics mockup right column */}
          <TripDetailPanel
            trip={selectedTrip}
            instructions={selectedTrip ? tripInstructions[selectedTrip.trip_id] : null}
            onClose={() => setSelectedTripId(null)}
            onAcceptRoute={handleAcceptRoute}
            onRevertRoute={handleRevertRoute}
          />
        </div>
      ) : (
        <div className="app-body analytics-view">
          <AnalyticsDashboard />
        </div>
      )}
    </div>
  );
}

export default App;
