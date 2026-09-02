/**
 * Map Screen — Full-screen dark fleet tracking map with Uber-style bottom sheet.
 * Issue #36: Full-screen MapView, animated truck markers, tap-to-select truck,
 * bottom sheet with truck info card, orange "Accept Reroute" CTA.
 * Issue #68: positions, trip detail and route geometry are now the real
 * fleet from the backend (useFleetTracking) instead of mockFleet's hardcoded
 * trucks and a local random-walk simulation.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { MapView, Marker, Polyline, PROVIDER_DEFAULT } from '../components/MapView';
import { TruckMarker } from '../components/TruckMarker';
import BottomSheet from '../components/BottomSheet';
import { useFleetTracking } from '../hooks/useFleetTracking';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function MapScreen() {
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [rerouteAccepted, setRerouteAccepted] = useState({});
  const mapRef = useRef(null);
  const bottomSheetRef = useRef(null);
  const { trucks, loading, error } = useFleetTracking();

  // selectedTruck is a snapshot taken on tap; refresh it from the latest poll
  // so the bottom sheet does not freeze on stale ETA/delay after a 5s tick.
  const liveSelectedTruck = selectedTruck
    ? trucks.find((t) => t.vehicleId === selectedTruck.vehicleId) || selectedTruck
    : null;

  const handleTruckPress = useCallback((truck) => {
    setSelectedTruck(truck);
    // Animate map camera to truck
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: truck.lat,
          longitude: truck.lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        600
      );
    }
    // Snap bottom sheet to 40%
    if (bottomSheetRef.current) {
      bottomSheetRef.current.snapTo(1);
    }
  }, []);

  const handleMapPress = useCallback(() => {
    setSelectedTruck(null);
    if (bottomSheetRef.current) {
      bottomSheetRef.current.snapTo(0);
    }
  }, []);

  const handleAcceptReroute = useCallback((truckId) => {
    setRerouteAccepted(prev => ({ ...prev, [truckId]: true }));
  }, []);

  // Real delay minutes, not the fabricated 0-100 risk score this replaced.
  const delayColor = (minutes) =>
    minutes >= 20 ? '#EF4444' : minutes >= 5 ? '#FF5B22' : '#22C55E';

  const statusColor = (status) =>
    status === 'DELAYED' ? '#EF4444' :
    status === 'REROUTED' ? '#FF5B22' : '#22C55E';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Full-Screen Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: 26.1655,
          longitude: 91.7362,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
        mapType={Platform.OS === 'android' ? 'standard' : 'mutedStandard'}
        userInterfaceStyle="dark"
        onPress={handleMapPress}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
      >
        {trucks.map((truck) => (
          <Marker
            key={truck.id}
            coordinate={{ latitude: truck.lat, longitude: truck.lng }}
            anchor={{ x: 0.5, y: 1.0 }}
            onPress={() => handleTruckPress(truck)}
            tracksViewChanges={false}
          >
            <TruckMarker
              truck={truck}
              onPress={() => handleTruckPress(truck)}
              isSelected={selectedTruck?.id === truck.id}
            />
          </Marker>
        ))}

        {/* ── Dual-route visualization for rerouted trucks ─────────────────
            Layer 1 (drawn first / below): Original (abandoned) route — faded
            blue dashed line. Shows the path the AI decided to leave, turning
            orange/red where hazard segments exist (same as the web dashboard).
            Layer 2 (drawn on top): Active AI detour — solid bold green.
            Together they mirror the professional logistics control-tower
            visualization described in the feature request. */}

        {/* Layer 1 — Original route (faded blue dashed) */}
        {liveSelectedTruck?.rerouted && liveSelectedTruck.originalRoute && (
          <Polyline
            coordinates={liveSelectedTruck.originalRoute}
            strokeColor="rgba(59,130,246,0.40)"
            strokeWidth={3}
            lineDashPattern={[8, 5]}
          />
        )}

        {/* Layer 2 — Active detour (solid green) */}
        {liveSelectedTruck?.currentRoute && (
          <Polyline
            coordinates={liveSelectedTruck.currentRoute}
            strokeColor={liveSelectedTruck.rerouted ? '#10b981' : '#F97316'}
            strokeWidth={liveSelectedTruck.rerouted ? 6 : 4}
          />
        )}

      </MapView>

      {/* Map Header Overlay */}
      <View style={styles.mapHeader}>
        <View style={styles.headerPill}>
          <View style={[styles.liveDot, error && styles.liveDotError]} />
          <Text style={styles.headerText}>
            {error
              ? '⚠ Fleet unreachable — showing last known data'
              : loading && trucks.length === 0
                ? 'Loading fleet…'
                : `Live Fleet · ${trucks.length} vehicles`}
          </Text>
        </View>
      </View>

      {/* Bottom Sheet */}
      <BottomSheet ref={bottomSheetRef} initialSnap={0}>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {liveSelectedTruck ? (
            /* Truck Info Card */
            <View style={styles.truckCard}>
              {/* Card Header */}
              <View style={styles.truckCardHeader}>
                <View style={styles.truckCardLeft}>
                  <Text style={styles.truckCardIcon}>{liveSelectedTruck.cargoIcon}</Text>
                  <View>
                    <Text style={styles.truckCardId}>{liveSelectedTruck.id}</Text>
                    <Text style={styles.truckCardDriver}>{liveSelectedTruck.organization || 'Unassigned organization'}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${statusColor(liveSelectedTruck.status)}18` },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusColor(liveSelectedTruck.status) },
                    ]}
                  >
                    {liveSelectedTruck.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>

              {/* Info Grid — Plate No, Commodity, Status, ETA, Delay per issue #68 */}
              <View style={styles.infoGrid}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoCellLabel}>Plate No.</Text>
                  <Text style={styles.infoCellValue}>{liveSelectedTruck.id}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoCellLabel}>Commodity</Text>
                  <Text style={styles.infoCellValue}>{liveSelectedTruck.cargo}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoCellLabel}>ETA</Text>
                  <Text style={styles.infoCellValue}>{liveSelectedTruck.eta}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoCellLabel}>Delay</Text>
                  <Text
                    style={[
                      styles.infoCellValue,
                      liveSelectedTruck.delayMinutes != null && {
                        color: delayColor(liveSelectedTruck.delayMinutes),
                      },
                    ]}
                  >
                    {liveSelectedTruck.delayMinutes == null
                      ? '—'
                      : `${liveSelectedTruck.delayMinutes > 0 ? '+' : ''}${liveSelectedTruck.delayMinutes}m`}
                  </Text>
                </View>
                <View style={[styles.infoCell, styles.infoCellWide]}>
                  <Text style={styles.infoCellLabel}>Route</Text>
                  <Text style={[styles.infoCellValue, styles.infoCellValueSmall]} numberOfLines={2}>
                    {liveSelectedTruck.route}
                  </Text>
                </View>
              </View>

              {/* Accept Reroute CTA */}
              {liveSelectedTruck.rerouted && (
                <TouchableOpacity
                  style={[
                    styles.rerouteBtn,
                    rerouteAccepted[liveSelectedTruck.id] && styles.rerouteBtnAccepted,
                  ]}
                  onPress={() => handleAcceptReroute(liveSelectedTruck.id)}
                  disabled={!!rerouteAccepted[liveSelectedTruck.id]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rerouteBtnText}>
                    {rerouteAccepted[liveSelectedTruck.id]
                      ? '✓ Reroute Accepted'
                      : '🔄 Accept AI Reroute'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* Default bottom sheet — fleet summary */
            <View style={styles.fleetSummary}>
              <Text style={styles.fleetSummaryTitle}>Fleet Overview</Text>
              <Text style={styles.fleetSummarySubtitle}>
                Tap a truck on the map to view details
              </Text>
              <View style={styles.fleetGrid}>
                {[
                  { label: 'Active', value: trucks.length, color: '#22C55E' },
                  {
                    label: 'Rerouted',
                    value: trucks.filter(t => t.rerouted).length,
                    color: '#FF5B22',
                  },
                  {
                    // Real trip statuses are IN_TRANSIT / REROUTED / PENDING /
                    // COMPLETED — there is no DELAYED status to filter on, so
                    // this now reads real positive delay minutes instead.
                    label: 'Delayed',
                    value: trucks.filter(t => (t.delayMinutes ?? 0) > 0).length,
                    color: '#EF4444',
                  },
                ].map((item) => (
                  <View key={item.label} style={styles.fleetGridCell}>
                    <Text style={[styles.fleetGridValue, { color: item.color }]}>
                      {item.value}
                    </Text>
                    <Text style={styles.fleetGridLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1C',
  },
  mapHeader: {
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 56,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,28,28,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  liveDotError: {
    backgroundColor: '#EF4444',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 120,
  },
  // Truck Card
  truckCard: {
    gap: 16,
  },
  truckCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  truckCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  truckCardIcon: {
    fontSize: 32,
  },
  truckCardId: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  truckCardDriver: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoCell: {
    width: '47%',
    backgroundColor: '#1C1C1C',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  infoCellWide: {
    width: '100%',
  },
  infoCellLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCellValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoCellValueSmall: {
    fontSize: 12,
    lineHeight: 16,
  },
  rerouteBtn: {
    backgroundColor: '#FF5B22',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#FF5B22',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  rerouteBtnAccepted: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
  },
  rerouteBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  // Fleet Summary
  fleetSummary: {
    gap: 14,
  },
  fleetSummaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  fleetSummarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: -8,
  },
  fleetGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  fleetGridCell: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  fleetGridValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  fleetGridLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
