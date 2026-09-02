/**
 * MapCanvas — Full-screen MapLibre GL, 2D vector navigation map
 *
 * Features:
 * - OpenFreeMap positron vector basemap (clean 2D, road labels, no API key)
 * - 3D truck markers with commodity color rings + priority pulse
 * - Click vehicle → zoom into street-level view (flat, labels readable)
 * - Road block / calamity warning markers
 * - POI layer suppression (logistics-only view)
 *
 * Camera fix: uses a debounced fly-to that tracks the last flown trip ID
 * so OSRM route enrichment (which changes the route reference multiple times)
 * does NOT trigger repeated jittery camera moves.
 *
 * Marker fix: markers are only rebuilt when their key properties change,
 * preventing DOM churn on every WS telemetry tick.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TacticalWeatherOverlay } from './TacticalWeatherOverlay';

// OpenFreeMap positron: free, no API key, clean 2D navigation style.
const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ||
  'https://tiles.openfreemap.org/styles/positron';

// Suppress POI clutter on logistics map — keep road labels, hide retail pins.
const POI_LAYER_PATTERN = /^poi|housenum/i;

// Minimum zoom when framing a selected route.
const ROUTE_VIEW_MIN_ZOOM = 9.5;

// [[lng, lat], ...] → [[minLng, minLat], [maxLng, maxLat]] for fitBounds.
function routeBounds(coordinates) {
  return coordinates.reduce(
    (b, [lng, lat]) => [
      [Math.min(b[0][0], lng), Math.min(b[0][1], lat)],
      [Math.max(b[1][0], lng), Math.max(b[1][1], lat)],
    ],
    [[Infinity, Infinity], [-Infinity, -Infinity]],
  );
}

const COMMODITY_COLORS = {
  MEDICINE:    '#ef4444',
  FOOD_GRAINS: '#3b82f6',
  FUEL:        '#f59e0b',
  GENERAL:     '#8b5cf6',
};

const COMMODITY_ICONS = {
  MEDICINE:    '💊',
  FOOD_GRAINS: '🌾',
  FUEL:        '⛽',
  GENERAL:     '📦',
};

const PRIORITY_PULSE = {
  EMERGENCY:    true,
  HIGH_PRIORITY: true,
  STANDARD:      false,
};

const VEHICLE_EMOJI  = { truck: '🚛', ambulance: '🚑', utility: '🔧' };
const INCIDENT_EMOJI = { flood: '🌊', landslide: '⛰️', road_damage: '🚧', bridge_collapse: '🌉' };

function createTruckSVG(color = '#f97316') {
  return `<svg width="52" height="38" viewBox="0 0 52 38" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="8" width="36" height="22" rx="3" fill="${color}" opacity="0.95"/>
    <rect x="30" y="4" width="20" height="18" rx="2" fill="${color}"/>
    <rect x="32" y="6" width="12" height="10" rx="1" fill="rgba(255,255,255,0.35)"/>
    <circle cx="10" cy="32" r="5" fill="#1a1a1a" stroke="#555" stroke-width="1.5"/>
    <circle cx="10" cy="32" r="2.5" fill="#888"/>
    <circle cx="38" cy="32" r="5" fill="#1a1a1a" stroke="#555" stroke-width="1.5"/>
    <circle cx="38" cy="32" r="2.5" fill="#888"/>
    <rect x="3" y="10" width="6" height="8" rx="1" fill="rgba(255,255,255,0.25)"/>
  </svg>`;
}

// ─── Smooth cubic easing (ease-in-out) ───────────────────────────────────────
const easeInOutCubic = t =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function MapCanvas({ vehicles, incidents, onIncidentClick, onMapReady, onVehicleClick, selectedTripVehicle, selectedTripRoute, selectedTripId, fleetData }) {
  const mapContainer = useRef(null);
  const mapRef       = useRef(null);
  const vehicleMarkersRef  = useRef({});
  const incidentMarkersRef = useRef({});
  const travelDotRef       = useRef(null);
  const travelAnimRef      = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  // Track which trip the camera last flew to + a stable "route settled" flag
  // so enrichment swaps (OSRM replacing straight-line coords) do NOT fire
  // repeated camera moves.
  const lastCameraTripRef   = useRef(null);
  const cameraDebounceRef   = useRef(null);

  const onVehicleClickRef = useRef(onVehicleClick);
  useEffect(() => {
    onVehicleClickRef.current = onVehicleClick;
  }, [onVehicleClick]);

  // ── Initialize map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE_URL,
      center: [93.0, 25.5],
      zoom: 7,
      pitch: 0,
      bearing: 0,
      minZoom: 4,
      maxZoom: 19,
      // Improve tile rendering: use a higher pixel ratio on retina screens
      // and allow the GPU to pre-fetch adjacent tiles.
      fadeDuration: 150,
      crossSourceCollisions: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140 }), 'bottom-left');

    mapRef.current = map;
    map.on('load', () => {
      setMapInstance(map);

      // Suppress POI clutter.
      for (const layer of map.getStyle().layers ?? []) {
        if (POI_LAYER_PATTERN.test(layer.id)) {
          try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch { /* skip */ }
        }
      }
      onMapReady?.(map);
    });

    return () => {
      if (cameraDebounceRef.current) clearTimeout(cameraDebounceRef.current);
      map.remove();
      mapRef.current = null;
      vehicleMarkersRef.current = {};
      incidentMarkersRef.current = {};
    };
  }, []);

  // ── Update vehicle markers (skip rebuild when only position changed) ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(vehicles.map(v => v.id));

    // Remove stale markers
    for (const [id, marker] of Object.entries(vehicleMarkersRef.current)) {
      if (!currentIds.has(id)) {
        marker.remove();
        delete vehicleMarkersRef.current[id];
      }
    }

    vehicles.forEach(vehicle => {
      if (vehicle.lat == null || vehicle.lng == null) return;
      
      const isSelected = selectedTripVehicle?.id === vehicle.id;

      const existing = vehicleMarkersRef.current[vehicle.id];
      if (existing) {
        // Fast path: just move the existing marker — no DOM rebuild.
        existing.setLngLat([vehicle.lng, vehicle.lat]);
        
        const el = existing.getElement();
        
        if (isSelected) {
          el.classList.add('selected-vehicle-marker');
          // MapLibre actively manages z-index. To guarantee this marker is on top 
          // of other perfectly stacked markers, we move it to the end of the DOM sibling list.
          if (el.parentNode && el.parentNode.lastChild !== el) {
            el.parentNode.appendChild(el);
          }
          // Re-trigger CSS animation for visual feedback if clicked again
          el.classList.remove('bounce-pulse');
          void el.offsetWidth; // trigger reflow
          el.classList.add('bounce-pulse');
        } else {
          el.classList.remove('selected-vehicle-marker');
          el.classList.remove('bounce-pulse');
        }
        return;
      }

      // Find matching trip for commodity/priority
      const trip = fleetData?.active_trips?.find(t => t.vehicle_id === vehicle.id);
      const commodity  = trip?.commodity_type || 'GENERAL';
      const priority   = trip?.priority_level || 'STANDARD';
      const ringColor  = COMMODITY_COLORS[commodity] || '#3b82f6';
      const doPulse    = PRIORITY_PULSE[priority] ?? false;
      const emoji      = VEHICLE_EMOJI[vehicle.type] || '🚛';
      const isEmergency = priority === 'EMERGENCY';

      const el = document.createElement('div');
      el.className = `marker-vehicle-3d${doPulse ? ' pulsing' : ''}${isSelected ? ' selected-vehicle-marker bounce-pulse' : ''}`;
      el.dataset.vehicleId = vehicle.id;
      el.style.setProperty('--ring-color', ringColor);

      el.innerHTML = `
        <div class="mv3d-ring mv3d-ring-outer${doPulse ? ' mv3d-ring-pulse' : ''}"></div>
        <div class="mv3d-body" style="border-color:${ringColor}40">
          <div class="mv3d-truck-svg">${createTruckSVG(ringColor)}</div>
          ${isEmergency ? '<div class="mv3d-emergency-flash">🔴</div>' : ''}
        </div>
        <div class="mv3d-label-pill" style="border-color:${ringColor}50">
          <span class="mv3d-commodity-icon">${COMMODITY_ICONS[commodity]}</span>
          <span class="mv3d-plate">${vehicle.license_plate || vehicle.name}</span>
        </div>
      `;

      const statusBadge = trip ? `<span style="color:${trip.status === 'REROUTED' ? '#f59e0b' : '#22c55e'}">${trip.status}</span>` : '';
      const popup = new maplibregl.Popup({ offset: 38, closeButton: false, maxWidth: '260px' })
        .setHTML(`
          <div class="map-popup">
            <h4>${emoji} ${vehicle.license_plate || vehicle.name}</h4>
            <p><strong>Org:</strong> ${vehicle.organization || 'NavNER'}</p>
            <p><strong>Commodity:</strong> ${COMMODITY_ICONS[commodity]} ${commodity}</p>
            <p><strong>Priority:</strong> <span style="color:${ringColor}">${priority}</span></p>
            ${trip ? `<p><strong>Route:</strong> ${trip.origin_name} → ${trip.dest_name}</p>` : ''}
            ${trip?.estimated_arrival ? `<p><strong>ETA:</strong> ${new Date(trip.estimated_arrival).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>` : ''}
            ${trip ? `<p><strong>Status:</strong> ${statusBadge}</p>` : ''}
            <p style="font-size:10px;color:#6b7280;margin-top:4px">${vehicle.lat.toFixed(4)}°N, ${vehicle.lng.toFixed(4)}°E</p>
          </div>
        `);

      el.addEventListener('click', () => {
        onVehicleClickRef.current?.(vehicle);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([vehicle.lng, vehicle.lat])
        .setPopup(popup)
        .addTo(map);

      vehicleMarkersRef.current[vehicle.id] = marker;
    });
  }, [vehicles, fleetData, selectedTripVehicle]);

  // ── Incident markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(incidents.map(i => i.id));
    for (const [id, marker] of Object.entries(incidentMarkersRef.current)) {
      if (!currentIds.has(id)) {
        marker.remove();
        delete incidentMarkersRef.current[id];
      }
    }

    incidents.forEach(incident => {
      if (incidentMarkersRef.current[incident.id]) return;

      const el = document.createElement('div');
      el.className = 'marker-incident';
      el.innerHTML = `<span class="marker-incident-inner">${INCIDENT_EMOJI[incident.type] || '⚠️'}</span>`;
      el.addEventListener('click', () => onIncidentClick?.(incident));

      const popup = new maplibregl.Popup({ offset: 28, closeButton: false, maxWidth: '240px' })
        .setHTML(`
          <div class="map-popup">
            <h4>${INCIDENT_EMOJI[incident.type] || '⚠️'} ${incident.type.replace(/_/g, ' ').toUpperCase()}</h4>
            <p>${incident.description || 'No description.'}</p>
            <p><strong>Status:</strong> ${incident.status}</p>
            <p style="font-size:10px;color:#6b7280">${incident.lat?.toFixed(4)}°N, ${incident.lng?.toFixed(4)}°E</p>
          </div>
        `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([incident.lng, incident.lat])
        .setPopup(popup)
        .addTo(map);

      incidentMarkersRef.current[incident.id] = marker;
    });
  }, [incidents, onIncidentClick]);

  // ── Smart camera: fly to selected trip ─────────────────────────────────────
  // KEY FIX: We key the camera on `selectedTripId`, NOT on the vehicle/route
  // objects — which change identity every time OSRM enriches the route.
  // A 300 ms debounce absorbs rapid state transitions (trip select → OSRM
  // enrichment arrives) and settles into a single smooth animation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Trip deselected — reset tracking and do nothing.
    if (!selectedTripId) {
      lastCameraTripRef.current = null;
      return;
    }

    // If the camera already flew to this trip, don't re-fire.
    // (Route enrichment changes fleetData but the trip ID stays the same.)
    if (lastCameraTripRef.current === selectedTripId) return;

    // Cancel any pending debounced camera move for this trip.
    if (cameraDebounceRef.current) clearTimeout(cameraDebounceRef.current);

    cameraDebounceRef.current = setTimeout(() => {
      const v = selectedTripVehicle;

      // 1. Best case: live vehicle coordinates available — fly to the truck.
      if (v?.lat != null && v?.lng != null) {
        lastCameraTripRef.current = selectedTripId;
        map.flyTo({
          center: [v.lng, v.lat],
          zoom: 14.5,
          pitch: 0,
          bearing: 0,
          duration: 1800,
          easing: easeInOutCubic,
        });
        return;
      }

      // 2. Fallback: frame the route geometry.
      if (selectedTripRoute?.length > 1) {
        const bounds = routeBounds(selectedTripRoute);
        const framed = map.cameraForBounds(bounds, { padding: 60 });

        if (framed) {
          lastCameraTripRef.current = selectedTripId;
          map.flyTo({
            center: framed.center,
            zoom: Math.max(framed.zoom, ROUTE_VIEW_MIN_ZOOM),
            pitch: 0,
            bearing: 0,
            duration: 1800,
            easing: easeInOutCubic,
          });
        } else {
          map.fitBounds(bounds, {
            padding: 60,
            duration: 1800,
            essential: true,
          });
          lastCameraTripRef.current = selectedTripId;
        }
      }
    }, 300);

  // Only re-run when the selected TRIP changes — NOT when the vehicle/route
  // object reference changes from OSRM enrichment.
  }, [selectedTripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Secondary: if vehicle becomes available after route framed, zoom in ─────
  // This handles the case where the camera framed the route at ~zoom 9 and
  // then the vehicle location arrives — we do one final zoom-in to the truck.
  const vehicleArrivedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTripId || !selectedTripVehicle) return;
    // Only do the secondary zoom-in once per trip selection.
    if (vehicleArrivedRef.current === selectedTripId) return;
    // Only if camera already moved to this trip (via route framing above).
    if (lastCameraTripRef.current !== selectedTripId) return;

    const v = selectedTripVehicle;
    if (v?.lat == null || v?.lng == null) return;

    vehicleArrivedRef.current = selectedTripId;
    map.flyTo({
      center: [v.lng, v.lat],
      zoom: 14.5,
      pitch: 0,
      bearing: 0,
      duration: 1600,
      easing: easeInOutCubic,
    });
  }, [selectedTripVehicle, selectedTripId]);

  // Reset secondary zoom tracker on trip change.
  useEffect(() => {
    vehicleArrivedRef.current = null;
  }, [selectedTripId]);

  // ── Expose flyTo externally (for incident click) ────────────────────────────
  useEffect(() => {
    if (mapRef.current && mapContainer.current) {
      mapContainer.current.__flyTo = (lng, lat) => {
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          pitch: 0,
          duration: 1400,
          easing: easeInOutCubic,
        });
      };
    }
  });

  return (
    <>
      <div ref={mapContainer} className="map-container" id="map-canvas" />
      {mapInstance && <TacticalWeatherOverlay map={mapInstance} />}
    </>
  );
}
