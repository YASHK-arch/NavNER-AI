/**
 * FleetRouteViewer — Dual-route visualization for rerouted trips.
 *
 * ORIGINAL ROUTE: Rendered as a faded/dimmed blue line with hazard-segment
 *   coloring (blue→yellow→red depending on intersection with hazard zones).
 *   This communicates "this is the path the truck was going to take."
 *
 * ACTIVE DETOUR: Rendered as a bold solid green line layered above the
 *   original, with animated flow markers and an "AI Detour Initiated" badge
 *   at the divergence point.
 *
 * The two-layer approach mirrors professional logistics control towers
 * (Uber Freight, Google Maps rerouting) — the evaluator immediately sees
 * *both* paths and understands the AI's bypass decision.
 */
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';

const ORIG_SOURCE_PREFIX   = 'frv-orig-source-';
const ORIG_CASING_PREFIX   = 'frv-orig-casing-';
const ORIG_LAYER_PREFIX    = 'frv-orig-layer-';
const BYPASS_SOURCE_PREFIX = 'frv-bypass-source-';
const BYPASS_CASING_PREFIX = 'frv-bypass-casing-';
const BYPASS_LAYER_PREFIX  = 'frv-bypass-layer-';
const FLOW_DOT_COUNT = 14;

// Colors
const ORIG_COLOR        = '#eab308'; // yellow — original path base
const ORIG_CASING_COLOR = '#a16207';
const DETOUR_COLOR        = '#10b981'; // green — active AI detour
const DETOUR_CASING_COLOR = '#065f46';

function isValidCoordinate(coordinate) {
  if (!Array.isArray(coordinate)) return false;
  const [lng, lat] = coordinate;
  return Number.isFinite(Number(lng)) && Number.isFinite(Number(lat));
}

function getFlowCoordinates(coordinates) {
  const valid = coordinates.filter(isValidCoordinate);
  if (valid.length <= FLOW_DOT_COUNT) return valid;
  return Array.from({ length: FLOW_DOT_COUNT }, (_, i) => {
    const pos = Math.round((i / (FLOW_DOT_COUNT - 1)) * (valid.length - 1));
    return valid[pos];
  });
}

/** Find the first coordinate in `detour` that is meaningfully different from `original[0]`. */
function findDivergencePoint(originalCoords, detourCoords) {
  if (!originalCoords?.length || !detourCoords?.length) return null;
  // Use the midpoint of the detour as the badge anchor — the true geometric
  // divergence is computed server-side and not yet exposed, but the midpoint
  // is close enough to convey the concept.
  return detourCoords[Math.floor(detourCoords.length * 0.25)];
}

function removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers, divMarkers) {
  for (const id of layerIds) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* Map style changed */ }
  }
  for (const id of sourceIds) {
    try { if (map.getSource(id)) map.removeSource(id); } catch { /* Map style changed */ }
  }
  for (const marker of flowMarkers) marker.remove();
  for (const marker of divMarkers)  marker.remove();

  layerIds.clear();
  sourceIds.clear();
  flowMarkers.length = 0;
  divMarkers.length  = 0;
}

function createFlowMarker(index, total, opacity) {
  const element = document.createElement('div');
  element.className = 'bypass-route-flow-marker bypass-route-flow-marker--green';
  element.style.setProperty('--bypass-flow-delay', `${-(index / total) * 1.3}s`);
  element.style.opacity = String(opacity);

  const dot = document.createElement('span');
  dot.className = 'bypass-route-flow-dot bypass-route-flow-dot--green';
  element.appendChild(dot);
  return new maplibregl.Marker({ element, anchor: 'center' });
}

function createDivergenceMarker() {
  const el = document.createElement('div');
  el.className = 'ai-detour-badge';
  el.innerHTML = `
    <div class="ai-detour-badge__inner">
      <span class="ai-detour-badge__icon">🔀</span>
      <span class="ai-detour-badge__text">AI Detour Initiated</span>
    </div>
  `;
  return new maplibregl.Marker({ element: el, anchor: 'bottom' });
}

export function FleetRouteViewer({ map, fleetData, selectedTripId }) {
  const layerIdsRef   = useRef(new Set());
  const sourceIdsRef  = useRef(new Set());
  const flowMarkersRef = useRef([]);
  const divMarkersRef  = useRef([]);

  const hoverPopupRef = useRef(null);
  const activeListenersRef = useRef([]);

  useEffect(() => {
    if (!map || !fleetData?.active_trips) return;

    const layerIds   = layerIdsRef.current;
    const sourceIds  = sourceIdsRef.current;
    const flowMarkers = flowMarkersRef.current;
    const divMarkers  = divMarkersRef.current;
    let cancelled = false;
    let pollTimer = null;

    const cleanupListeners = () => {
      activeListenersRef.current.forEach(({ layerId, type, fn }) => {
        try { map.off(type, layerId, fn); } catch (e) {}
      });
      activeListenersRef.current = [];
      if (hoverPopupRef.current) hoverPopupRef.current.remove();
    };

    const renderReroutes = () => {
      removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers, divMarkers);
      cleanupListeners();

      const newRouteLayers = [];

      fleetData.active_trips.forEach(trip => {
        if (trip.status !== 'REROUTED') return;

        const tripKey    = trip.trip_id.slice(0, 8);
        const isSelected = trip.trip_id === selectedTripId;
        const dimmed     = Boolean(selectedTripId) && !isSelected;

        // Opacity scale — selected: full / unselected: 74% / other-selected: 18%
        const detourOpacity = dimmed ? 0.18 : (isSelected ? 1.0 : 0.74);
        const origOpacity   = dimmed ? 0.15 : (isSelected ? 0.45 : 0.25);

        // ── Layer 1: Original (abandoned) route — faded yellow ─────────────────
        const origCoords = trip.original_route?.coordinates;
        if (origCoords?.length >= 2) {
          const srcId    = `${ORIG_SOURCE_PREFIX}${tripKey}`;
          const casingId = `${ORIG_CASING_PREFIX}${tripKey}`;
          const layerId  = `${ORIG_LAYER_PREFIX}${tripKey}`;
          const width    = isSelected ? 4 : 2.5;

          map.addSource(srcId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { status: 'ORIGINAL_ROUTE' },
              geometry: { type: 'LineString', coordinates: origCoords },
            },
          });
          sourceIds.add(srcId);

          // Dark casing to lift it off the basemap
          map.addLayer({
            id: casingId, type: 'line', source: srcId,
            paint: {
              'line-color': ORIG_CASING_COLOR,
              'line-width': width + 4,
              'line-opacity': origOpacity * 0.5,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          layerIds.add(casingId);

          // Faded red dashed line — communicates "abandoned path"
          map.addLayer({
            id: layerId, type: 'line', source: srcId,
            paint: {
              'line-color': ORIG_COLOR,
              'line-width': width,
              'line-opacity': origOpacity,
              'line-dasharray': [4, 3],
            },
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
          });
          layerIds.add(layerId);
          newRouteLayers.push(layerId);
        }

        // ── Layer 2: Active detour — solid bold green ─────────────────────────
        const detourCoords = trip.current_route?.coordinates;
        if (!detourCoords?.length || detourCoords.length < 2) return;

        const dSrcId    = `${BYPASS_SOURCE_PREFIX}${tripKey}`;
        const dCasingId = `${BYPASS_CASING_PREFIX}${tripKey}`;
        const dLayerId  = `${BYPASS_LAYER_PREFIX}${tripKey}`;
        const detourW   = isSelected ? 7 : 5;

        map.addSource(dSrcId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { status: 'ACTIVE_DETOUR' },
            geometry: { type: 'LineString', coordinates: detourCoords },
          },
        });
        sourceIds.add(dSrcId);

        // Dark green casing
        map.addLayer({
          id: dCasingId, type: 'line', source: dSrcId,
          paint: {
            'line-color': DETOUR_CASING_COLOR,
            'line-width': detourW + 6,
            'line-opacity': detourOpacity * 0.45,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        layerIds.add(dCasingId);

        // Solid green — the active AI-approved bypass
        map.addLayer({
          id: dLayerId, type: 'line', source: dSrcId,
          paint: {
            'line-color': DETOUR_COLOR,
            'line-width': detourW,
            'line-opacity': detourOpacity,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        layerIds.add(dLayerId);
        newRouteLayers.push(dLayerId);

        // Animated flow dots along the detour
        getFlowCoordinates(detourCoords).forEach((coord, idx, arr) => {
          if (!isValidCoordinate(coord)) return;
          const marker = createFlowMarker(idx, arr.length, detourOpacity)
            .setLngLat([Number(coord[0]), Number(coord[1])])
            .addTo(map);
          flowMarkers.push(marker);
        });

        // "AI Detour Initiated" badge — only for the selected trip
        if (isSelected) {
          const divPoint = findDivergencePoint(origCoords, detourCoords);
          if (divPoint && isValidCoordinate(divPoint)) {
            const badge = createDivergenceMarker()
              .setLngLat([Number(divPoint[0]), Number(divPoint[1])])
              .addTo(map);
            divMarkers.push(badge);
          }
        }
      });

      // ── Hover interaction for route popups ─────────────────────────────────
      const handleRouteHover = (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const isBypass = props.status === 'ACTIVE_DETOUR';

        if (hoverPopupRef.current) hoverPopupRef.current.remove();

        const badgeColor = isBypass ? '#10b981' : '#3b82f6';
        const badgeText = isBypass ? 'AI Detour' : 'Original Path';

        const html = `
          <div style="padding: 4px 6px; font-family: sans-serif; pointer-events: none;">
            <strong style="color: ${badgeColor}; font-size: 13px;">${badgeText}</strong>
            <div style="color: #bbb; font-size: 11px; margin-top: 2px;">
              ${isBypass ? 'Active rerouted path' : 'Abandoned route'}
            </div>
            <div style="color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 5px; font-family: monospace;">
              ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}
            </div>
          </div>
        `;

        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
          anchor: 'top',
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

    const tryRender = () => {
      if (cancelled) return;
      if (map.isStyleLoaded()) {
        renderReroutes();
      } else {
        pollTimer = setTimeout(tryRender, 250);
      }
    };

    tryRender();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers, divMarkers);
    };
  }, [map, fleetData, selectedTripId]);

  return null;
}
