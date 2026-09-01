/**
 * MapCanvas — Full-screen MapLibre GL with 3D Uber-style map
 *
 * Features:
 * - Pitch 45° Uber-style 3D perspective
 * - 3D truck markers with commodity color rings + priority pulse
 * - Click vehicle → zoom into street-level 3D view (pitch 60°)
 * - Animated route travel dot
 * - Road block / calamity warning markers
 * - Street-level detail tiles at high zoom
 */
import { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Basemap raster tiles. Can be overridden via environment variables for deployment.
const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

const COMMODITY_COLORS = {
  MEDICINE:    '#ef4444',  // red — emergency pharma
  FOOD_GRAINS: '#3b82f6',  // blue — FCI grains
  FUEL:        '#f59e0b',  // amber — fuel convoy
  GENERAL:     '#8b5cf6',  // purple — general goods
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

// Animated truck SVG element for 3D overlay at street level
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

export function MapCanvas({ vehicles, incidents, onIncidentClick, onMapReady, selectedTripVehicle, fleetData }) {
  const mapContainer = useRef(null);
  const mapRef       = useRef(null);
  const vehicleMarkersRef  = useRef({});
  const incidentMarkersRef = useRef({});
  const travelDotRef       = useRef(null);
  const travelAnimRef      = useRef(null);

  // ── Initialize map ─────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [91.74, 26.15], // Centered directly on Guwahati hazard cluster
      zoom: 11.5, // High zoom needed to clearly see H3 resolution 7 grid cells
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      touchZoomRotate: false,
      minZoom: 4,
      maxZoom: 18,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140 }), 'bottom-left');

    mapRef.current = map;
    map.on('load', () => {
      onMapReady?.(map);

      // --- DEBUG TEST: Direct MapLibre API injection ---
      fetch('http://localhost:8000/api/v1/analytics/hazard-map')
        .then(r => r.json())
        .then(data => {
          // Normalise depth
          const normalizedFeatures = data.features.map(f => {
            let depth = 0;
            let curr = f.geometry.coordinates;
            while (Array.isArray(curr)) { depth++; curr = curr[0]; }
            
            const newF = { ...f };
            if (depth === 3 && f.geometry.type === 'MultiPolygon') newF.geometry.type = 'Polygon';
            if (depth === 4 && f.geometry.type === 'Polygon') newF.geometry.type = 'MultiPolygon';
            return newF;
          });

          map.addSource('debug-hazard-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: normalizedFeatures }
          });
          map.addLayer({
            id: 'debug-hazard-fill',
            type: 'fill',
            source: 'debug-hazard-source',
            paint: { 'fill-color': '#ffeb3b', 'fill-opacity': 0.7 }
          });
          map.addLayer({
            id: 'debug-hazard-line',
            type: 'line',
            source: 'debug-hazard-source',
            paint: { 'line-color': '#ff0000', 'line-width': 3 }
          });
          console.log('[DEBUG] Direct MapLibre GeoJSON injected!', normalizedFeatures.length, 'features');
        })
        .catch(e => console.error('[DEBUG] Failed to inject GeoJSON directly:', e));
    }); return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Update vehicle markers ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(vehicles.map(v => v.id));

    // Remove stale
    for (const [id, marker] of Object.entries(vehicleMarkersRef.current)) {
      if (!currentIds.has(id)) {
        marker.remove();
        delete vehicleMarkersRef.current[id];
      }
    }

    // Add / update
    vehicles.forEach(vehicle => {
      if (vehicle.lat == null || vehicle.lng == null) return;

      const existing = vehicleMarkersRef.current[vehicle.id];
      if (existing) {
        existing.setLngLat([vehicle.lng, vehicle.lat]);
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

      // Build the 3D-style marker element
      const el = document.createElement('div');
      el.className = `marker-vehicle-3d${doPulse ? ' pulsing' : ''}`;
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

      // Popup with deep info
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

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([vehicle.lng, vehicle.lat])
        .setPopup(popup)
        .addTo(map);

      vehicleMarkersRef.current[vehicle.id] = marker;
    });
  }, [vehicles, fleetData]);

  // ── Incident markers ────────────────────────────────────────────
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

  // ── Zoom to selected vehicle / trip route ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedTripVehicle) return;

    const v = selectedTripVehicle;
    if (v.lat == null || v.lng == null) return;

    // Smooth camera fly to street-level 2D view
    map.easeTo({
      center: [v.lng, v.lat],
      zoom: 14,
      pitch: 0,
      duration: 1400,
      easing: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    });
  }, [selectedTripVehicle]);

  // ── Expose flyTo externally ─────────────────────────────────────
  useEffect(() => {
    if (mapRef.current && mapContainer.current) {
      mapContainer.current.__flyTo = (lng, lat) => {
        mapRef.current.easeTo({ center: [lng, lat], zoom: 14, pitch: 0, duration: 1000 });
      };
    }
  });

  return <div ref={mapContainer} className="map-container" id="map-canvas" />;
}
