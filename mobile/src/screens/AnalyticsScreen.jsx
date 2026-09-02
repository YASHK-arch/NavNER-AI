/**
 * Analytics Screen — Mobile Command Center.
 * Issue #36: KPI Carousel, AI Delay Matrix, Reroute Audit Timeline.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar, Platform,
  SafeAreaView, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FLEET_TRUCKS, REROUTE_TIMELINE, KPI_DATA } from '../services/mockFleet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_COLOR = {
  REROUTED:  { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', border: 'rgba(245,158,11,0.3)' },
  DELAYED:   { bg: 'rgba(239,68,68,0.12)',  text: '#EF4444', border: 'rgba(239,68,68,0.3)' },
  ON_ROUTE:  { bg: 'rgba(34,197,94,0.12)',  text: '#22C55E', border: 'rgba(34,197,94,0.3)' },
  ON_TIME:   { bg: 'rgba(34,197,94,0.12)',  text: '#22C55E', border: 'rgba(34,197,94,0.3)' },
};

function RiskBar({ risk }) {
  const color = risk >= 70 ? '#EF4444' : risk >= 40 ? '#F59E0B' : '#22C55E';
  return (
    <View style={riskStyles.track}>
      <View style={[riskStyles.fill, { width: `${risk}%`, backgroundColor: color }]} />
    </View>
  );
}
const riskStyles = StyleSheet.create({
  track: { height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, flex: 1 },
  fill: { height: 5, borderRadius: 4 },
});

function KPICard({ icon, label, value, unit, sub, accent, danger }) {
  return (
    <View style={[kpiStyles.card, accent && kpiStyles.cardAccent, danger && kpiStyles.cardDanger]}>
      <View style={kpiStyles.top}>
        <Text style={kpiStyles.icon}>{icon}</Text>
        <Text style={[kpiStyles.label, accent && kpiStyles.labelLight]}>{label}</Text>
      </View>
      <Text style={[kpiStyles.value, accent && kpiStyles.valueLight]}>
        {value}<Text style={[kpiStyles.unit, accent && kpiStyles.unitLight]}> {unit}</Text>
      </Text>
      <Text style={[kpiStyles.sub, accent && kpiStyles.subLight]}>{sub}</Text>
    </View>
  );
}
const kpiStyles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: '#1A1A1A',
    borderRadius: 22,
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginRight: 12,
  },
  cardAccent: {
    backgroundColor: '#FF5B22',
    borderColor: 'rgba(255,91,34,0.3)',
    shadowColor: '#FF5B22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 14,
  },
  cardDanger: { borderColor: 'rgba(239,68,68,0.3)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 22 },
  label: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  labelLight: { color: 'rgba(255,255,255,0.8)' },
  value: { fontSize: 48, fontWeight: '800', color: '#FFFFFF', lineHeight: 54 },
  valueLight: { color: '#FFFFFF' },
  unit: { fontSize: 16, fontWeight: '400', color: '#6B7280' },
  unitLight: { color: 'rgba(255,255,255,0.65)' },
  sub: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  subLight: { color: 'rgba(255,255,255,0.7)' },
});

export function AnalyticsScreen() {
  const [jurisdiction, setJurisdiction] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem('@jurisdiction').then(raw => {
      if (raw) setJurisdiction(JSON.parse(raw));
    });
    // Pulse animation for live dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const kpiCards = [
    { icon: '🚚', label: 'Active Trips',    value: KPI_DATA.activeTrips,    unit: 'trips',    sub: `${KPI_DATA.onTimeRate}% on-time rate`, accent: true },
    { icon: '🛣️', label: 'Running Fleet',   value: KPI_DATA.runningFleet,   unit: 'vehicles', sub: `${KPI_DATA.reroutes} rerouted today` },
    { icon: '⚠️', label: 'Critical Alerts', value: KPI_DATA.criticalRisks,  unit: 'alerts',   sub: 'AI-detected anomalies', danger: true },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F0F" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Command Center</Text>
          {jurisdiction && (
            <Text style={styles.headerSub}>
              📍 {jurisdiction.district}, {jurisdiction.state}
            </Text>
          )}
        </View>
        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* KPI Cards */}
        <Text style={styles.sectionLabel}>Key Performance Indicators</Text>
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 12, paddingBottom: 8 }}
          snapToInterval={SCREEN_WIDTH - 36}
          decelerationRate="fast"
        >
          {kpiCards.map((c, i) => <KPICard key={i} {...c} />)}
        </ScrollView>

        {/* Delay Matrix */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>AI Delay Risk Matrix</Text>
        <View style={styles.matrixCard}>
          {FLEET_TRUCKS.map(truck => {
            const cfg = STATUS_COLOR[truck.status] || STATUS_COLOR.ON_ROUTE;
            return (
              <View key={truck.id} style={styles.matrixRow}>
                <View style={styles.matrixLeft}>
                  <Text style={styles.matrixIcon}>{truck.cargoIcon}</Text>
                  <View>
                    <Text style={styles.matrixId}>{truck.id}</Text>
                    <Text style={styles.matrixDriver}>{truck.driverName}</Text>
                  </View>
                </View>
                <View style={styles.matrixRight}>
                  <View style={[styles.matrixBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <Text style={[styles.matrixBadgeText, { color: cfg.text }]}>{truck.status.replace('_', ' ')}</Text>
                  </View>
                  <View style={styles.riskRow}>
                    <RiskBar risk={truck.delayRisk} />
                    <Text style={styles.riskPct}>{truck.delayRisk}%</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Reroute Timeline */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Reroute Audit Trail</Text>
        <View style={styles.timelineCard}>
          {REROUTE_TIMELINE.map((event, i) => (
            <View key={event.id} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={styles.timelineDotOuter}>
                  <View style={styles.timelineDot} />
                </View>
                {i < REROUTE_TIMELINE.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineContent}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineTruck}>{event.truckId}</Text>
                  <Text style={styles.timelineTime}>{event.timestamp}</Text>
                </View>
                <Text style={styles.timelineReason}>⚠️ {event.reason}</Text>
                <Text style={styles.timelineRoute}>↪ {event.newRoute}</Text>
                <View style={styles.confidencePill}>
                  <Text style={styles.confidenceText}>✨ AI Confidence: {event.aiConfidence}%</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.aiFooter}>
          <Text style={styles.aiFooterIcon}>🤖</Text>
          <Text style={styles.aiFooterText}>
            Predictions powered by NavNER AI — processing severity, weather, and route data in real-time.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { flex: 1 },
  content: { paddingBottom: 130 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#FF5B22', marginTop: 3, fontWeight: '600' },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,197,94,0.1)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  liveText: { fontSize: 12, fontWeight: '700', color: '#22C55E' },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 24, marginBottom: 12, marginTop: 8,
  },

  // Delay Matrix
  matrixCard: {
    marginHorizontal: 24, backgroundColor: '#1A1A1A',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  matrixRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  matrixLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  matrixIcon: { fontSize: 22 },
  matrixId: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  matrixDriver: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  matrixRight: { flex: 1.2, gap: 8 },
  matrixBadge: {
    alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1,
  },
  matrixBadgeText: { fontSize: 10, fontWeight: '700' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  riskPct: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', width: 32, textAlign: 'right' },

  // Timeline
  timelineCard: {
    marginHorizontal: 24, backgroundColor: '#1A1A1A',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 18, gap: 0,
  },
  timelineItem: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  timelineLeft: { alignItems: 'center', width: 20 },
  timelineDotOuter: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,91,34,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5B22' },
  timelineLine: { width: 1.5, flex: 1, backgroundColor: 'rgba(255,91,34,0.2)', marginTop: 4, marginBottom: 4 },
  timelineContent: { flex: 1, paddingBottom: 20 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  timelineTruck: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  timelineTime: { fontSize: 12, color: '#6B7280' },
  timelineReason: { fontSize: 12, color: '#FCA5A5', marginBottom: 4 },
  timelineRoute: { fontSize: 12, color: '#22C55E', marginBottom: 8 },
  confidencePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
  },
  confidenceText: { fontSize: 11, color: '#C4B5FD', fontWeight: '600' },

  // AI Footer
  aiFooter: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 24, marginTop: 20,
    padding: 16, backgroundColor: '#1A1A1A',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  aiFooterIcon: { fontSize: 18 },
  aiFooterText: { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 16, fontWeight: '500' },
});
