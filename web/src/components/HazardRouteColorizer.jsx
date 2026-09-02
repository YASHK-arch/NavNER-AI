/**
 * HazardRouteColorizer — Segment-level hazard coloring for all fleet routes.
 *
 * Non-rerouted trips:
 *   Current route is split into segments and colored by the H3 hazard zone
 *   each segment passes through: CLEAR→Blue, MODERATE→Yellow, HIGH→Amber,
 *   CRITICAL→Red. This is the Google Maps / Uber-style segmented coloring.
 *
 * Rerouted trips:
 *   The ORIGINAL (abandoned) route is rendered as a faded, hazard-colored
 *   line so the evaluator can see exactly which road segments were blocked and
 *   WHY the AI triggered the detour. The active detour is drawn by
 *   FleetRouteViewer — this component paints only the affected original-route
 *   segments on top of that faded blue base.
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
  const hoverPopupRef = useRef(null);
  const activeListenersRef = useRef([]);

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

    const cleanupListeners = () => {
      activeListenersRef.current.forEach(({ layerId, type, fn }) => {
        try { map.off(type, layerId, fn); } catch (e) {}
      });
      activeListenersRef.current = [];
      if (hoverPopupRef.current) hoverPopupRef.current.remove();
    };
    cleanupListeners();

    if (!fleetData?.active_trips?.length) return;

    const tryRender = () => {
      if (!map.isStyleLoaded()) {
        setTimeout(tryRender, 200);
        return;
      }

      const newRouteLayers = [];

      fleetData.active_trips.forEach(trip => {
        const coords = trip.current_route?.coordinates;
        if (!coords?.length || coords.length < 2) return;

        const tripKey    = trip.trip_id.slice(0, 8);
        const isSelected = trip.trip_id === selectedTripId;
        const dimmed     = Boolean(selectedTripId) && !isSelected;
        const isRerouted = trip.status === 'REROUTED';

        if (!isRerouted) {
          // ── Non-rerouted: hazard-colored current route ───────────────────────
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

            // Shadow / casing layer
            map.addLayer({
              id: casingId, type: 'line', source: srcId,
              paint: { 'line-color': caseCol, 'line-width': casingW, 'line-opacity': casingOp },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            layerIdsRef.current.add(casingId);

            // Colored segment on top
            map.addLayer({
              id: layerId, type: 'line', source: srcId,
              paint: { 'line-color': color, 'line-width': lineWidth, 'line-opacity': opacity },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            layerIdsRef.current.add(layerId);
            newRouteLayers.push(layerId);
          });
        } else {
          // ── Rerouted: paint hazard-affected segments of the ORIGINAL route ───
          // FleetRouteViewer renders the faded blue base line for the original
          // path and the bold green line for the detour. Here we overlay only
          // the AFFECTED (yellow/red) segments of the original path so the
          // evaluator can see precisely which road blocks triggered the AI.
          const origCoords = trip.original_route?.coordinates;
          if (origCoords?.length >= 2) {
            const origSegments    = buildColoredSegments(origCoords, hazardFeatures);
            const affectedSegments = origSegments.filter(s => s.risk !== 'CLEAR');
            const origOpacity     = dimmed ? 0.06 : (isSelected ? 0.55 : 0.38);
            const origWidth       = isSelected ? 5 : 3;

            affectedSegments.forEach((seg, idx) => {
              const risk     = seg.risk;
              const color    = SEGMENT_COLORS[risk] || SEGMENT_COLORS.CLEAR;
              const caseCol  = CASING_COLORS[risk]  || CASING_COLORS.CLEAR;
              const srcId    = `${SEG_SOURCE_PREFIX}${tripKey}-orig-${idx}`;
              const casingId = `${SEG_CASING_PREFIX}${tripKey}-orig-${idx}`;
              const layerId  = `${SEG_LAYER_PREFIX}${tripKey}-orig-${idx}`;

              map.addSource(srcId, {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: { risk, trip_id: trip.trip_id, segment_type: 'ORIGINAL_AFFECTED' },
                  geometry: { type: 'LineString', coordinates: seg.coordinates },
                },
              });
              sourceIdsRef.current.add(srcId);

              map.addLayer({
                id: casingId, type: 'line', source: srcId,
                paint: {
                  'line-color': caseCol,
                  'line-width': origWidth + 4,
                  'line-opacity': origOpacity * 0.4,
                },
                layout: { 'line-cap': 'round', 'line-join': 'round' },
              });
              layerIdsRef.current.add(casingId);

              // Dashed hazard-colored segment over the faded blue base
              map.addLayer({
                id: layerId, type: 'line', source: srcId,
                paint: {
                  'line-color': color,
                  'line-width': origWidth,
                  'line-opacity': origOpacity,
                  'line-dasharray': [3, 2],
                },
                layout: { 'line-cap': 'butt', 'line-join': 'round' },
              });
              layerIdsRef.current.add(layerId);
              newRouteLayers.push(layerId);
            });
          }
        }

        // ETA chip at route midpoint — only for the selected trip
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

      // ── Hover interaction for route popups ─────────────────────────────────
      const handleRouteHover = (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;

        if (hoverPopupRef.current) hoverPopupRef.current.remove();

        const isAffectedOrig = props.segment_type === 'ORIGINAL_AFFECTED';
        const isHazard = props.risk !== 'CLEAR';
        
        let badgeColor = '#3b82f6'; // default blue
        let badgeText = isAffectedOrig ? 'Original Path (Hazard)' : 'Current Path';
        let detailText = isAffectedOrig ? 'Blocked / Abandoned Segment' : 'Safe Corridor';

        if (isHazard) {
          badgeColor = SEGMENT_COLORS[props.risk] || badgeColor;
          if (!isAffectedOrig) {
            badgeText = `Current Path (${props.risk})`;
            detailText = 'AI is navigating this hazard zone';
          } else {
            detailText = `AI detoured due to ${props.risk} hazard`;
          }
        }

        const html = `
          <div style="padding: 4px 6px; font-family: sans-serif; pointer-events: none;">
            <strong style="color: ${badgeColor}; font-size: 13px;">${badgeText}</strong>
            <div style="color: #bbb; font-size: 11px; margin-top: 2px;">
              ${detailText}
            </div>
          </div>
        `;

        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
          className: 'hazard-hover-popup', // reuse the glassmorphic styling
        })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      };

      const handleRouteLeave = () => {
        map.getCanvas().style.cursor = '';
        if (hoverPopupRef.current) hoverPopupRef.current.remove();
      };

      newRouteLayers.forEach(layerId => {
        map.on('mousemove', layerId, handleRouteHover);
        map.on('mouseleave', layerId, handleRouteLeave);
        activeListenersRef.current.push({ layerId, type: 'mousemove', fn: handleRouteHover });
        activeListenersRef.current.push({ layerId, type: 'mouseleave', fn: handleRouteLeave });
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
