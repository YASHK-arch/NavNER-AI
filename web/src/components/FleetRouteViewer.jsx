/**
 * FleetRouteViewer — makes a reroute leg immediately legible on the map.
 *
 * A previously assigned route stays visible as a subdued grey dash. Its active
 * bypass is rendered above the regular route with red dots and staggered flow
 * markers, making the replacement path clear without hiding the road map.
 */
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';

const BLOCKED_SOURCE_PREFIX = 'frv-blocked-source-';
const BLOCKED_LAYER_PREFIX = 'frv-blocked-layer-';
const BLOCKED_CASING_PREFIX = 'frv-blocked-casing-';
const BYPASS_SOURCE_PREFIX = 'frv-bypass-source-';
const BYPASS_LAYER_PREFIX = 'frv-bypass-layer-';
const BYPASS_CASING_PREFIX = 'frv-bypass-casing-';
const FLOW_DOT_COUNT = 16;

function isValidCoordinate(coordinate) {
  if (!Array.isArray(coordinate)) return false;
  const [lng, lat] = coordinate;
  return Number.isFinite(Number(lng)) && Number.isFinite(Number(lat));
}

function getFlowCoordinates(coordinates) {
  const validCoordinates = coordinates.filter(isValidCoordinate);
  if (validCoordinates.length <= FLOW_DOT_COUNT) return validCoordinates;

  return Array.from({ length: FLOW_DOT_COUNT }, (_, index) => {
    const position = Math.round(
      (index / (FLOW_DOT_COUNT - 1)) * (validCoordinates.length - 1),
    );
    return validCoordinates[position];
  });
}

function removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers) {
  for (const id of layerIds) {
    try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* Map style changed */ }
  }
  for (const id of sourceIds) {
    try { if (map.getSource(id)) map.removeSource(id); } catch { /* Map style changed */ }
  }
  for (const marker of flowMarkers) {
    marker.remove();
  }

  layerIds.clear();
  sourceIds.clear();
  flowMarkers.length = 0;
}

function createFlowMarker(index, total, opacity) {
  const element = document.createElement('div');
  element.className = 'bypass-route-flow-marker';
  element.style.setProperty('--bypass-flow-delay', `${-(index / total) * 1.3}s`);
  element.style.opacity = String(opacity);

  const dot = document.createElement('span');
  dot.className = 'bypass-route-flow-dot';
  element.appendChild(dot);

  return new maplibregl.Marker({ element, anchor: 'center' });
}

export function FleetRouteViewer({ map, fleetData, selectedTripId }) {
  const layerIdsRef = useRef(new Set());
  const sourceIdsRef = useRef(new Set());
  const flowMarkersRef = useRef([]);

  useEffect(() => {
    if (!map || !fleetData?.active_trips) return;

    const layerIds = layerIdsRef.current;
    const sourceIds = sourceIdsRef.current;
    const flowMarkers = flowMarkersRef.current;
    let cancelled = false;
    let pollTimer = null;

    const renderReroutes = () => {
      removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers);

      fleetData.active_trips.forEach(trip => {
        if (trip.status !== 'REROUTED') return;

        const tripKey = trip.trip_id.slice(0, 8);
        const isSelected = trip.trip_id === selectedTripId;
        const dimmed = Boolean(selectedTripId) && !isSelected;
        const activeOpacity = dimmed ? 0.18 : (isSelected ? 1 : 0.74);



        // The new, active route is the bypass: a red dotted line plus a
        // staggered pulse that flows along it. MapLibre controls marker
        // placement while CSS animates only the dot inside each marker.
        const bypassCoordinates = trip.current_route?.coordinates;
        if (bypassCoordinates?.length < 2) return;

        const sourceId = `${BYPASS_SOURCE_PREFIX}${tripKey}`;
        const casingId = `${BYPASS_CASING_PREFIX}${tripKey}`;
        const layerId = `${BYPASS_LAYER_PREFIX}${tripKey}`;
        const lineWidth = isSelected ? 6 : 4;

        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { status: 'ACTIVE_BYPASS' },
            geometry: { type: 'LineString', coordinates: bypassCoordinates },
          },
        });
        sourceIds.add(sourceId);

        map.addLayer({
          id: casingId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#7f1d1d',
            'line-width': lineWidth + 5,
            'line-opacity': activeOpacity * 0.42,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        layerIds.add(casingId);

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#ef4444',
            'line-width': lineWidth,
            'line-opacity': activeOpacity,
            'line-dasharray': [0.01, 2.1],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        layerIds.add(layerId);

        getFlowCoordinates(bypassCoordinates).forEach((coordinate, index, flowCoordinates) => {
          const marker = createFlowMarker(index, flowCoordinates.length, activeOpacity)
            .setLngLat([Number(coordinate[0]), Number(coordinate[1])])
            .addTo(map);
          flowMarkers.push(marker);
        });
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
      removeRenderedArtifacts(map, layerIds, sourceIds, flowMarkers);
    };
  }, [map, fleetData, selectedTripId]);

  return null;
}
