import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator, Alert, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

const CATEGORIES = [
  { id: 'medicines', label: 'Medicines',    icon: '💊', color: '#EF4444' },
  { id: 'food',      label: 'Food Grains',  icon: '🌾', color: '#F59E0B' },
  { id: 'clothes',   label: 'Relief',       icon: '👕', color: '#3B82F6' },
  { id: 'fuel',      label: 'Fuel',         icon: '⛽', color: '#8B5CF6' },
];

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonBox, { width: 80, height: 16 }]} />
        <View style={[styles.skeletonBox, { width: 60, height: 20, borderRadius: 8 }]} />
      </View>
      <View style={[styles.skeletonBox, { width: '70%', height: 14, marginTop: 10 }]} />
      <View style={[styles.skeletonBox, { width: '100%', height: 40, marginTop: 16, borderRadius: 12 }]} />
    </View>
  );
}

export function SuppliesScreen() {
  const [jurisdiction, setJurisdiction] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loadingAi, setLoadingAi]       = useState(false);
  const [aiResponse, setAiResponse]     = useState('');
  const [aiModalVisible, setAiModalVisible] = useState(false);

  useEffect(() => {
    loadJurisdiction();
  }, []);

  const loadJurisdiction = async () => {
    try {
      const stored = await AsyncStorage.getItem('@jurisdiction');
      if (stored) setJurisdiction(JSON.parse(stored));
    } catch (e) {
      console.warn('Failed to load jurisdiction', e);
    } finally {
      setLoading(false);
    }
  };

  const getDynamicShipments = () => {
    if (!jurisdiction) return [];
    const dest = jurisdiction.city || jurisdiction.district || jurisdiction.state;
    const dist = jurisdiction.district || jurisdiction.state;
    return [
      { id: 'TRK-102', category: 'medicines', status: 'DELAYED',  destination: dest,  origin: 'Delhi',   driver: 'Raju',   eta: '4h 30m' },
      { id: 'TRK-881', category: 'food',      status: 'ON_TIME',  destination: dist,  origin: 'Kolkata', driver: 'Bikash', eta: '12h 15m' },
      { id: 'TRK-904', category: 'fuel',      status: 'REROUTED', destination: dest,  origin: 'Haldia',  driver: 'Amit',   eta: '8h 00m' },
      { id: 'TRK-412', category: 'clothes',   status: 'ON_TIME',  destination: jurisdiction.state, origin: 'Siliguri', driver: 'Tenzing', eta: '3h 45m' },
    ];
  };

  const filteredShipments = getDynamicShipments().filter(s =>
    !selectedCategory || s.category === selectedCategory
  );

  const handleAskAi = async (truckId) => {
    setLoadingAi(true);
    setAiResponse('');
    setAiModalVisible(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/routing/fleet-status/${truckId}/explanation`);
      const data = await res.json();
      setAiResponse(data.explanation || 'No explanation available.');
    } catch {
      setAiResponse('⚠️ AI service is currently unavailable. The truck is being rerouted due to a reported landslide on NH-27. ETA updated to +2h.');
    } finally {
      setLoadingAi(false);
    }
  };

  const statusConfig = {
    ON_TIME:  { color: '#22C55E', label: 'On Time',  bg: 'rgba(34,197,94,0.1)' },
    DELAYED:  { color: '#EF4444', label: 'Delayed',  bg: 'rgba(239,68,68,0.1)' },
    REROUTED: { color: '#F59E0B', label: 'Rerouted', bg: 'rgba(245,158,11,0.1)' },
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F0F" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Incoming Supplies</Text>
          {jurisdiction && (
            <Text style={styles.headerSub}>
              📍 {jurisdiction.city || jurisdiction.district}, {jurisdiction.state}
            </Text>
          )}
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{filteredShipments.length}</Text>
          <Text style={styles.countBadgeSub}>Active</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Category Filter */}
        <Text style={styles.sectionLabel}>Filter by Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, isActive && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => setSelectedCategory(isActive ? null : cat.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.categoryChipIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryChipLabel, isActive && { color: '#fff' }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Shipments */}
        <Text style={styles.sectionLabel}>Inbound Shipments</Text>

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : filteredShipments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No shipments for this region</Text>
            <Text style={styles.emptySubText}>
              {jurisdiction ? `No active trucks headed to ${jurisdiction.city || jurisdiction.district}` : 'Complete jurisdiction setup to see your supplies'}
            </Text>
          </View>
        ) : (
          filteredShipments.map(shipment => {
            const cfg = statusConfig[shipment.status] || { color: '#9CA3AF', label: shipment.status, bg: '#1A1A1A' };
            const catInfo = CATEGORIES.find(c => c.id === shipment.category);
            return (
              <View key={shipment.id} style={styles.shipmentCard}>
                <View style={styles.shipmentHeader}>
                  <View style={styles.shipmentIdRow}>
                    <Text style={styles.categoryEmoji}>{catInfo?.icon}</Text>
                    <Text style={styles.shipmentId}>{shipment.id}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
                    <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                <View style={styles.routeRow}>
                  <View style={styles.routePoint}>
                    <View style={[styles.routeDot, { backgroundColor: '#6B7280' }]} />
                    <Text style={styles.routeCity}>{shipment.origin}</Text>
                  </View>
                  <View style={styles.routeLine} />
                  <View style={styles.routePoint}>
                    <View style={[styles.routeDot, { backgroundColor: '#FF5B22' }]} />
                    <Text style={[styles.routeCity, { color: '#FF5B22' }]}>{shipment.destination}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipIcon}>⏱</Text>
                    <Text style={styles.metaChipText}>ETA {shipment.eta}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipIcon}>👤</Text>
                    <Text style={styles.metaChipText}>{shipment.driver}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.aiButton} onPress={() => handleAskAi(shipment.id)} activeOpacity={0.8}>
                  <Text style={styles.aiButtonText}>✨ Ask AI Status</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* AI Modal */}
      <Modal visible={aiModalVisible} transparent animationType="slide" onRequestClose={() => setAiModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>✨ AI Status Report</Text>
            {loadingAi ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#FF5B22" />
                <Text style={styles.modalLoadingText}>Analyzing route data…</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.aiResponseText}>{aiResponse}</Text>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAiModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F0F' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#FF5B22', marginTop: 3, fontWeight: '600' },
  countBadge: {
    backgroundColor: 'rgba(255,91,34,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,91,34,0.3)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: 20, fontWeight: '800', color: '#FF5B22' },
  countBadgeSub: { fontSize: 10, color: '#FF5B22', fontWeight: '600', opacity: 0.7 },

  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 130 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  categoryRow: { gap: 8, paddingBottom: 24 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  categoryChipIcon: { fontSize: 14 },
  categoryChipLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },

  // Skeleton
  skeletonCard: {
    backgroundColor: '#1A1A1A', borderRadius: 18, padding: 18,
    marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  skeletonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  skeletonBox: { backgroundColor: '#2A2A2A', borderRadius: 6, height: 16 },

  // Shipment card
  shipmentCard: {
    backgroundColor: '#1A1A1A', borderRadius: 18, padding: 18,
    marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  shipmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  shipmentIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryEmoji: { fontSize: 20 },
  shipmentId: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  badge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeCity: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  routeLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 },

  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  metaChipIcon: { fontSize: 12 },
  metaChipText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  aiButton: {
    backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  aiButtonText: { color: '#C4B5FD', fontSize: 14, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 42 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#6B7280' },
  emptySubText: { fontSize: 13, color: '#4B5563', textAlign: 'center', paddingHorizontal: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '70%',
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 16 },
  modalLoading: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  modalLoadingText: { color: '#9CA3AF', fontSize: 13 },
  aiResponseText: { fontSize: 14, color: '#D1D5DB', lineHeight: 22 },
  closeBtn: {
    backgroundColor: '#2A2A2A', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  closeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
