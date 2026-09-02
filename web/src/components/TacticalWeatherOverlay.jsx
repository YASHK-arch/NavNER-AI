import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';

const MOCK_ZONES = [
  {
    id: 'shillong-rain',
    hazardType: 'RAIN',
    severity: 'SEVERE',
    intensity: '48 mm/hr',
    impact: 'Torrential downpour, localized flooding. Speed reduced to 20 km/h.',
    coordinates: [
      [91.75, 25.60],
      [91.95, 25.65],
      [92.10, 25.50],
      [91.85, 25.35],
      [91.75, 25.60]
    ]
  },
  {
    id: 'brahmaputra-fog',
    hazardType: 'FOG',
    severity: 'HEAVY',
    intensity: 'Visibility <50m',
    impact: 'Dense river fog. Use fog lights. Avoid overtaking.',
    coordinates: [
      [92.50, 26.65],
      [92.85, 26.70],
      [92.95, 26.50],
      [92.65, 26.45],
      [92.50, 26.65]
    ]
  },
  {
    id: 'silchar-rain',
    hazardType: 'RAIN',
    severity: 'LIGHT',
    intensity: '5 mm/hr',
    impact: 'Light drizzle. Wet roads.',
    coordinates: [
      [92.70, 24.85],
      [92.90, 24.90],
      [92.95, 24.75],
      [92.75, 24.70],
      [92.70, 24.85]
    ]
  }
];

const HAZARD_CONFIG = {
  RAIN: { color: '#38BDF8', symbol: '*' },
  FOG: { color: '#E2E8F0', symbol: '≡' },
  DUST: { color: '#F59E0B', symbol: 'S' }
};

const DENSITY_MAP = {
  LIGHT: 0.04,
  MODERATE: 0.15,
  HEAVY: 0.35,
  SEVERE: 0.60
};

export function TacticalWeatherOverlay({ map, weatherZones = MOCK_ZONES }) {
  const popupRef = useRef(null);
  const layersAddedRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    const addLayers = () => {
      if (layersAddedRef.current) return;
      
      const boundaryFeatures = [];
      const symbolFeatures = [];

      weatherZones.forEach(zone => {
        const config = HAZARD_CONFIG[zone.hazardType];
        if (!config) return;

        // Polygon boundary
        const poly = turf.polygon([zone.coordinates], {
          id: zone.id,
          hazardType: zone.hazardType,
          intensity: zone.intensity,
          impact: zone.impact,
          color: config.color
        });
        boundaryFeatures.push(poly);

        // Calculate point density
        const areaSqKm = turf.area(poly) / 1000000;
        const densityFactor = DENSITY_MAP[zone.severity] || 0.1;
        const targetPoints = Math.ceil(areaSqKm * densityFactor);

        // Generate points inside polygon via random bounding box rejection sampling
        const bbox = turf.bbox(poly);
        const points = [];
        
        let attempts = 0;
        while (points.length < targetPoints && attempts < targetPoints * 50) {
          const pt = turf.randomPoint(1, { bbox }).features[0];
          if (turf.booleanPointInPolygon(pt, poly)) {
            points.push(pt.geometry.coordinates);
          }
          attempts++;
        }

        if (points.length > 0) {
          const multiPoint = turf.multiPoint(points, {
            id: zone.id,
            hazardType: zone.hazardType,
            symbol: config.symbol,
            color: config.color,
            intensity: zone.intensity,
            impact: zone.impact
          });
          symbolFeatures.push(multiPoint);
        }
      });

      const boundaryCollection = turf.featureCollection(boundaryFeatures);
      const symbolCollection = turf.featureCollection(symbolFeatures);

      if (!map.getSource('weather-boundaries')) {
        map.addSource('weather-boundaries', {
          type: 'geojson',
          data: boundaryCollection
        });
        
        map.addSource('weather-symbols', {
          type: 'geojson',
          data: symbolCollection
        });

        // Dotted Boundary Layer
        map.addLayer({
          id: 'weather-boundaries-layer',
          type: 'line',
          source: 'weather-boundaries',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-dasharray': [2, 3]
          }
        });

        // Invisible fill layer for precise hover detection over the entire zone
        map.addLayer({
          id: 'weather-boundaries-fill',
          type: 'fill',
          source: 'weather-boundaries',
          paint: {
            'fill-color': 'transparent'
          }
        });

        // Density-scaled Symbols Layer
        map.addLayer({
          id: 'weather-symbols-layer',
          type: 'symbol',
          source: 'weather-symbols',
          layout: {
            'text-field': ['get', 'symbol'],
            'text-size': 16,
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-opacity': 0.85
          }
        });
        
        layersAddedRef.current = true;
      }
    };

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once('styledata', addLayers);
    }

    // Hover interactions
    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['weather-boundaries-fill', 'weather-symbols-layer']
      });

      if (features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        const feature = features[0];
        const props = feature.properties;

        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            maxWidth: '240px',
            className: 'weather-hazard-popup'
          });
        }

        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="padding: 10px; font-family: system-ui, sans-serif; background: rgba(20, 20, 20, 0.95); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.6); backdrop-filter: blur(4px);">
              <strong style="color: ${props.color}; font-size: 14px; display: block; margin-bottom: 4px; text-transform: uppercase;">
                ⚠️ ${props.hazardType} HAZARD
              </strong>
              <div style="font-size: 12px; margin-bottom: 4px; color: #f8fafc;">
                <strong>Intensity:</strong> ${props.intensity}
              </div>
              <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                ${props.impact}
              </div>
            </div>
          `)
          .addTo(map);
      } else {
        map.getCanvas().style.cursor = '';
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      }
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', 'weather-boundaries-fill', () => {
      map.getCanvas().style.cursor = '';
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });

    return () => {
      map.off('mousemove', handleMouseMove);
      if (popupRef.current) {
        popupRef.current.remove();
      }
      
      if (map.getStyle() && layersAddedRef.current) {
        if (map.getLayer('weather-symbols-layer')) map.removeLayer('weather-symbols-layer');
        if (map.getLayer('weather-boundaries-layer')) map.removeLayer('weather-boundaries-layer');
        if (map.getLayer('weather-boundaries-fill')) map.removeLayer('weather-boundaries-fill');
        if (map.getSource('weather-symbols')) map.removeSource('weather-symbols');
        if (map.getSource('weather-boundaries')) map.removeSource('weather-boundaries');
        layersAddedRef.current = false;
      }
    };
  }, [map, weatherZones]);

  return null;
}
