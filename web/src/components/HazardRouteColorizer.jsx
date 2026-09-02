/**
 * HazardRouteColorizer — Splits each trip's road-snapped polyline into
 * segments colored by the H3 hazard hexagon they pass through:
 *
 *   🔴 Red   — CRITICAL hazard zone
 *   🟡 Yellow — MODERATE hazard zone
 *   🔵 Blue  — CLEAR (no intersecting hazard)
 *
 * This produces the Google-Maps / Uber-style segmented route coloring
 * requested in Issue #63. The backend already returns real road-snapped
 * polylines from the DynamicGraphRouter; this component only handles
 * the visual coloring split.
 */
import { useEffect, useRef, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';

// Route segment source/layer ID prefixes (kept distinct from FleetRouteViewer)
const SEG_SOURCE_PREFIX  = 'hrc-seg-source-';
const SEG_LAYER_PREFIX   = 'hrc-seg-layer-';
const SEG_CASING_PREFIX  = 'hrc-casing-layer-';

// Risk level → line color (matches HazardMapOverlay legend)
const SEGMENT_COLORS = {
  CRITICAL: '#ef4444',   // red
  HIGH:     '#f59e0b',   // amber
  MODERATE: '#eab308',   // yellow
  CLEAR:    '#3b82f6',   // blue (safe corridor)
};

const CASING_COLORS = {
  CRITICAL: '#991b1b',
  HIGH:     '#92400e',
  MODERATE: '#713f12',
  CLEAR:    '#1d4ed8',
};

/**
 * Cheap 2D ray-casting point-in-polygon test.
 */
function pointInRing(point, ring) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.some(ring => pointInRing(point, ring));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly =>
      poly.some(ring => pointInRing(point, ring))
    );
  }
  return false;
}

const SEVERITY_ORDER = { CRITICAL: 3, HIGH: 2, MODERATE: 1, LOW: 0 };

function hazardForPoint(coord, hazardFeatures) {
  let best = 'CLEAR';
  let bestScore = -1;
  for (const feat of hazardFeatures) {
    const level = feat.properties?.risk_level;
    if (!level) continue;
    const score = SEVERITY_ORDER[level] ?? -1;
    if (score <= bestScore) continue;
    if (pointInGeometry(coord, feat.geometry)) {
      best = level;
      bestScore = score;
    }
  }
  return best === 'LOW' ? 'CLEAR' : best;
}

function buildColoredSegments(coords, hazardFeatures) {
  if (!coords || coords.length < 2) return [];
  if (!hazardFeatures?.length) {
    return [{ coordinates: coords, risk: 'CLEAR' }];
  }

  const tagged = coords.map(c => ({ coord: c, risk: hazardForPoint(c, hazardFeatures) }));

  const segments = [];
  let current = { coordinates: [tagged[0].coord], risk: tagged[0].risk };

  for (let i = 1; i < tagged.length; i++) {
    if (tagged[i].risk === current.risk) {
      current.coordinates.push(tagged[i].coord);
    } else {
      current.coordinates.push(tagged[i].coord);
      segments.push(current);
      current = { coordinates: [tagged[i].coord], risk: tagged[i].risk };
    }
  }
  segments.push(current);
  return segments.filter(s => s.coordinates.length >= 2);
}

function midpoint(coords) {
  if (!coords?.length) return null;
  return coords[Math.floor(coords.length / 2)];
}

function fmtETA(isoString) {
  if (!isoString) return null;
  const diff = Math.round((new Date(isoString) - Date.now()) / 60000);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function approxDistKm(coords) {
  if (!coords || coords.length < 2) return null;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const dx = (x2 - x1) * 111 * Math.cos(((y1 + y2) / 2) * (Math.PI / 180));
    const dy = (y2 - y1) * 111;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(total);
}

export function HazardRouteColorizer({ map, fleetData, hazardData, selectedTripId }) {
  const layerIdsRef  = useRef(new Set());
  const sourceIdsRef = useRef(new Set());
  const markersRef   = useRef([]);

  const hazardFeatures = useMemo(() => hazardData?.features ?? [], [hazardData]);

  useEffect(() => {
    if (!map) return;

    // Clean up previous layers + markers
    for (const id of layerIdsRef.current) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
    }
    for (const id of sourceIdsRef.current) {
      try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
    }
    layerIdsRef.current.clear();
    sourceIdsRef.current.clear();
    for (const mk of markersRef.current) { try { mk.remove(); } catch (_) {} }
    markersRef.current = [];

    if (!fleetData?.active_trips?.length) return;

    const tryRender = () => {
      if (!map.isStyleLoaded()) {
        setTimeout(tryRender, 200);
        return;
      }

      fleetData.active_trips.forEach(trip => {
        const coords = trip.current_route?.coordinates;
        if (!coords?.length || coords.length < 2) return;

        const tripKey    = trip.trip_id.slice(0, 8);
        const isSelected = trip.trip_id === selectedTripId;
        const dimmed     = Boolean(selectedTripId) && !isSelected;
        const isRerouted  = trip.status === 'REROUTED';

        // Rerouted trips use FleetRouteViewer's animated red dotted bypass.
        // Do not paint the normal hazard segments over that visual treatment.
        if (!isRerouted) {
          const segments  = buildColoredSegments(coords, hazardFeatures);
          const lineWidth = isSelected ? 7 : (dimmed ? 1.5 : 4);
          const opacity   = dimmed ? 0.18 : 1.0;
          const casingW   = isSelected ? 12 : (dimmed ? 0 : 7);
          const casingOp  = dimmed ? 0 : (isSelected ? 0.35 : 0.2);

          segments.forEach((seg, idx) => {
            const risk     = seg.risk;
            const color    = SEGMENT_COLORS[risk]  || SEGMENT_COLORS.CLEAR;
            const caseCol  = CASING_COLORS[risk]   || CASING_COLORS.CLEAR;
            const srcId    = `${SEG_SOURCE_PREFIX}${tripKey}-${idx}`;
            const casingId = `${SEG_CASING_PREFIX}${tripKey}-${idx}`;
            const layerId  = `${SEG_LAYER_PREFIX}${tripKey}-${idx}`;

            map.addSource(srcId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: { risk, trip_id: trip.trip_id },
                geometry: { type: 'LineString', coordinates: seg.coordinates },
              },
            });
            sourceIdsRef.current.add(srcId);

            // Shadow / casing layer (drawn first)
            map.addLayer({
              id: casingId, type: 'line', source: srcId,
              paint: { 'line-color': caseCol, 'line-width': casingW, 'line-opacity': casingOp },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            layerIdsRef.current.add(casingId);

            // Colored route segment on top
            map.addLayer({
              id: layerId, type: 'line', source: srcId,
              paint: { 'line-color': color, 'line-width': lineWidth, 'line-opacity': opacity },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            layerIdsRef.current.add(layerId);
          });
        }

        // ETA chip at route midpoint — only for selected trip
        if (isSelected) {
          const mid = midpoint(coords);
          if (!mid) return;

          const etaStr = fmtETA(trip.estimated_arrival);
          const distKm = approxDistKm(coords);
          const shortOrigin = (trip.origin_name || '').split(',')[0];
          const shortDest   = (trip.dest_name   || '').split(',')[0];
          const el = document.createElement('div');
          el.className = `route-eta-chip${isRerouted ? ' route-eta-chip--rerouted' : ''}`;
          el.innerHTML = `
            <div class="route-eta-inner">
              <span class="route-eta-icon">${isRerouted ? '🔀' : '🛣️'}</span>
              <div class="route-eta-info">
                <span class="route-eta-label">${shortOrigin} → ${shortDest}</span>
                <span class="route-eta-details">
                  ${distKm ? `<span class="route-eta-dist">${distKm} km</span>` : ''}
                  ${etaStr  ? `<span class="route-eta-time">${etaStr}</span>` : ''}
                  ${isRerouted ? '<span class="route-eta-badge">REROUTED</span>' : ''}
                </span>
              </div>
            </div>
          `;

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([mid[0], mid[1]])
            .addTo(map);
          markersRef.current.push(marker);
        }
      });
    };

    tryRender();

    return () => {
      for (const id of layerIdsRef.current) {
        try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
      }
      for (const id of sourceIdsRef.current) {
        try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
      }
      layerIdsRef.current.clear();
      sourceIdsRef.current.clear();
      for (const mk of markersRef.current) { try { mk.remove(); } catch (_) {} }
      markersRef.current = [];
    };
  }, [map, fleetData, hazardFeatures, selectedTripId]);

  return null;
}
