/**
 * useOSRMRoutes — Enriches fleet data with real road-snapped route geometry
 * by calling the OSRM public routing API (no API key needed).
 *
 * Problem: The stored route geometries in the backend DB may be straight-line
 * displacement paths rather than actual road-following polylines.
 *
 * Fix strategy:
 *  1. Detect displacement / low-quality routes using a COLLINEARITY test
 *     (pure point-count threshold is unreliable — the DynamicGraphRouter can
 *     produce routes with 10-30 intermediate nodes that are still nearly straight)
 *  2. For any trip that needs enrichment, resolve its origin+dest coords:
 *     a. Prefer the backend-supplied origin_lat/lng / dest_lat/lng
 *     b. Fallback: use first+last coords of the stored route itself
 *     c. Fallback: skip (log a warning)
 *  3. Call OSRM with the resolved coords and cache the result
 *
 * OSRM: https://router.project-osrm.org — free, no API key, OSM-powered.
 */
import { useState, useEffect, useRef, useMemo } from 'react';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// In-memory cache: "lng1,lat1;lng2,lat2" → Promise<{ primary, alternative }>
const routeCache = new Map();

// ---------------------------------------------------------------------------
// Collinearity / displacement detection
// ---------------------------------------------------------------------------

function maxRelativeDeviation(coords) {
  if (!coords || coords.length < 2) return 0;
  const [x0, y0] = coords[0];
  const [x1, y1] = coords[coords.length - 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const denom = Math.sqrt(dx * dx + dy * dy);
  if (denom < 1e-9) return 0;

  let maxDev = 0;
  for (const [x, y] of coords) {
    const dev = Math.abs(dy * x - dx * y + x1 * y0 - y1 * x0) / denom;
    if (dev > maxDev) maxDev = dev;
  }
  return maxDev / denom;
}

const MIN_POINTS = 30;
const STRAIGHTNESS_THRESHOLD = 0.08;

function isDisplacementPath(coords) {
  if (!coords || coords.length < 2) return true;
  if (coords.length < MIN_POINTS) return true;
  if (maxRelativeDeviation(coords) < STRAIGHTNESS_THRESHOLD) return true;
  return false;
}

// ---------------------------------------------------------------------------
// OSRM fetch
// ---------------------------------------------------------------------------

async function fetchOSRMRoute(originLng, originLat, destLng, destLat) {
  const cacheKey = `${originLng.toFixed(5)},${originLat.toFixed(5)};${destLng.toFixed(5)},${destLat.toFixed(5)}`;
  
  if (routeCache.has(cacheKey)) {
    return await routeCache.get(cacheKey);
  }

  const fetchPromise = (async () => {
    const url = `${OSRM_BASE}/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) {
      throw new Error(`OSRM no route (code=${json.code})`);
    }

    const primary = json.routes[0].geometry.coordinates;
    const alternative = json.routes[1]?.geometry?.coordinates ?? null;
    return { primary, alternative };
  })();

  routeCache.set(cacheKey, fetchPromise);
  
  try {
    return await fetchPromise;
  } catch (err) {
    routeCache.delete(cacheKey);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Coordinate resolution helpers
// ---------------------------------------------------------------------------

function resolveCoords(trip) {
  // Priority 1: Current route (handles reroutes properly from current location)
  const coords = trip.current_route?.coordinates;
  if (coords?.length >= 2) {
    const [oLng, oLat] = coords[0];
    const [dLng, dLat] = coords[coords.length - 1];
    return { originLng: oLng, originLat: oLat, destLng: dLng, destLat: dLat };
  }
  
  // Priority 2: Fallback to trip definition origin/dest for brand new trips
  if (
    trip.origin_lat != null && trip.origin_lng != null &&
    trip.dest_lat   != null && trip.dest_lng   != null
  ) {
    return {
      originLng: trip.origin_lng, originLat: trip.origin_lat,
      destLng:   trip.dest_lng,   destLat:   trip.dest_lat,
    };
  }
  
  return null;
}

function getTripRouteKey(trip) {
  return `${trip.trip_id}_${trip.last_rerouted_at || 'original'}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOSRMRoutes(fleetData) {
  const [enrichedGeometries, setEnrichedGeometries] = useState({});
  const fetchedRef = useRef(new Set());

  useEffect(() => {
    if (!fleetData?.active_trips?.length) return;

    const tripsToFetch = fleetData.active_trips.filter(trip => {
      const key = getTripRouteKey(trip);
      if (fetchedRef.current.has(key)) return false;
      return isDisplacementPath(trip.current_route?.coordinates);
    });

    if (!tripsToFetch.length) return;

    const fetchAll = async () => {
      const updates = {};
      
      const jobs = tripsToFetch.map(async trip => {
        const key = getTripRouteKey(trip);
        const coords = resolveCoords(trip);
        
        fetchedRef.current.add(key); // Mark as fetched immediately to avoid infinite loops
        
        if (!coords) {
          console.warn(`[useOSRMRoutes] No coords for trip ${trip.vehicle_name} — skipping`);
          return;
        }

        try {
          const result = await fetchOSRMRoute(
            coords.originLng, coords.originLat,
            coords.destLng,   coords.destLat,
          );
          console.info(`[useOSRMRoutes] Enriched ${trip.vehicle_name}: ${result.primary.length} points`);
          updates[key] = result;
        } catch (err) {
          console.warn(`[useOSRMRoutes] OSRM failed for ${trip.vehicle_name}:`, err.message);
          fetchedRef.current.delete(key); // Allow retry on next render if failed
        }
      });

      await Promise.allSettled(jobs);
      
      if (Object.keys(updates).length > 0) {
        setEnrichedGeometries(prev => ({ ...prev, ...updates }));
      }
    };

    fetchAll();
  }, [fleetData]);

  // Merge live fleetData with enriched geometries unconditionally
  const enrichedFleet = useMemo(() => {
    if (!fleetData?.active_trips) return fleetData;

    const updatedTrips = fleetData.active_trips.map(trip => {
      const key = getTripRouteKey(trip);
      const update = enrichedGeometries[key];
      
      if (!update) return trip;

      const enriched = { ...trip };
      enriched.current_route = {
        type: 'LineString',
        coordinates: update.primary,
        _osrm_enriched: true,
      };

      if (trip.status === 'REROUTED') {
        const origCoords = trip.original_route?.coordinates;
        if (isDisplacementPath(origCoords) && update.alternative) {
          enriched.original_route = {
            type: 'LineString',
            coordinates: update.alternative,
            _osrm_enriched: true,
          };
        }
      }

      return enriched;
    });

    return { ...fleetData, active_trips: updatedTrips };
  }, [fleetData, enrichedGeometries]);

  return enrichedFleet;
}
