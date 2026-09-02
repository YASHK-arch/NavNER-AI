import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Platform, StatusBar, ActivityIndicator, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../../config';

const CATEGORIES = [
  { id: 'medicines', label: 'Medicines', icon: '💊', color: '#EF4444' },
  { id: 'food', label: 'Food Grains', icon: '🌾', color: '#F59E0B' },
  { id: 'clothes', label: 'Relief & Clothes', icon: '👕', color: '#3B82F6' },
  { id: 'fuel', label: 'Fuel', icon: '⛽', color: '#8B5CF6' },
];

// Mock inbound shipments for hackathon demo
const MOCK_SHIPMENTS = [
  { id: 'TRK-102', category: 'medicines', status: 'DELAYED', destination: 'Guwahati', origin: 'Delhi', driver: 'Raju', eta: '4h 30m' },
  { id: 'TRK-881', category: 'food', status: 'ON_TIME', destination: 'Aizawl', origin: 'Kolkata', driver: 'Bikash', eta: '12h 15m' },
  { id: 'TRK-904', category: 'fuel', status: 'REROUTED', destination: 'Guwahati', origin: 'Haldia', driver: 'Amit', eta: '8h 00m' },
  { id: 'TRK-412', category: 'clothes', status: 'ON_TIME', destination: 'Shillong', origin: 'Siliguri', driver: 'Tenzing', eta: '3h 45m' },
];

export function SuppliesScreen() {
  const [jurisdiction, setJurisdiction] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiModalVisible, setAiModalVisible] = useState(false);

  useEffect(() => {
    loadJurisdiction();
  }, []);

  const loadJurisdiction = async () => {
    try {
      const stored = await AsyncStorage.getItem('@jurisdiction');
      if (stored) {
        setJurisdiction(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load jurisdiction', e);
    }
  };

  const filteredShipments = MOCK_SHIPMENTS.filter(s => {
    // Basic filter by category (if selected) and jurisdiction city for demo purposes
    if (selectedCategory && s.category !== selectedCategory) return false;
    if (jurisdiction && s.destination !== jurisdiction.city && s.destination !== jurisdiction.district) {
      // In a real app we'd filter strictly, for demo let's show all if jurisdiction doesn't strictly match any mock data,
      // but ideally we just match destination
      // To ensure we see data during demo, we'll allow all if no exact match, but let's try to match.
    }
    return true; 
  });

  const handleAskAi = async (truckId) => {
    setLoadingAi(true);
    setAiResponse('');
    setAiModalVisible(true);
    try {
      // Endpoint from Module C/D
      const res = await fetch(`${APP_CONFIG.API_URL}/api/v1/routing/fleet-status/${truckId}/explanation`);
      const data = await res.json();
      setAiResponse(data.explanation || "No explanation available.");
    } catch (e) {
      console.error(e);
      setAiResponse("⚠️ Unable to reach AI service. Please check network connection.");
    } finally {
      setLoadingAi(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'ON_TIME': return '#22C55E';
      case 'DELAYED': return '#EF4444';
      case 'REROUTED': return '#F59E0B';
      default: return '#9CA3AF';
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1C1C1C" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Incoming Supplies</Text>
        {jurisdiction && (
          <Text style={styles.headerSub}>Tracking for {jurisdiction.city}, {jurisdiction.state}</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Category Grid */}
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.grid}>
          {CATEGORIES.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.gridCard, isActive && { borderColor: cat.color, backgroundColor: 'rgba(255,255,255,0.05)' }]}
                onPress={() => setSelectedCategory(isActive ? null : cat.id)}
              >
                <Text style={styles.gridIcon}>{cat.icon}</Text>
                <Text style={[styles.gridLabel, isActive && { color: cat.color }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Inbound Shipments</Text>
        {filteredShipments.map(shipment => (
          <View key={shipment.id} style={styles.shipmentCard}>
            <View style={styles.shipmentHeader}>
              <Text style={styles.shipmentId}>{shipment.id}</Text>
              <View style={[styles.badge, { backgroundColor: getStatusColor(shipment.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: getStatusColor(shipment.status) }]}>{shipment.status}</Text>
              </View>
            </View>
            <Text style={styles.shipmentRoute}>{shipment.origin} ➔ {shipment.destination}</Text>
            <View style={styles.shipmentMeta}>
              <Text style={styles.metaText}>ETA: {shipment.eta}</Text>
              <Text style={styles.metaText}>Driver: {shipment.driver}</Text>
            </View>
            <TouchableOpacity style={styles.aiButton} onPress={() => handleAskAi(shipment.id)}>
              <Text style={styles.aiButtonText}>✨ Ask AI Status</Text>
            </TouchableOpacity>
          </View>
        ))}

        {filteredShipments.length === 0 && (
          <Text style={styles.emptyText}>No inbound shipments for this region.</Text>
        )}
      </ScrollView>

      {/* AI Modal */}
      <Modal visible={aiModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✨ AI Status Report</Text>
            {loadingAi ? (
              <ActivityIndicator size="large" color="#FF5B22" style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView style={styles.aiScroll}>
                <Text style={styles.aiResponseText}>{aiResponse}</Text>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAiModalVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1C1C1C' },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#22C55E', marginTop: 4, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 120 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  gridCard: {
    width: '48%',
    backgroundColor: 'rgba(28,28,28,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gridIcon: { fontSize: 32 },
  gridLabel: { fontSize: 13, fontWeight: '600', color: '#D1D5DB' },
  shipmentCard: {
    backgroundColor: 'rgba(28,28,28,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  shipmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  shipmentId: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  shipmentRoute: { fontSize: 14, color: '#D1D5DB', marginBottom: 12 },
  shipmentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metaText: { fontSize: 12, color: '#9CA3AF' },
  aiButton: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  aiButtonText: { color: '#C4B5FD', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#6B7280', fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#2C2C2E', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#3F3F46', maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 16, textAlign: 'center' },
  aiScroll: { marginVertical: 10 },
  aiResponseText: { fontSize: 15, color: '#D1D5DB', lineHeight: 22 },
  closeBtn: { backgroundColor: '#3F3F46', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  closeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
