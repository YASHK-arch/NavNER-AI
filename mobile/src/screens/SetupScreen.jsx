import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock data for cascading dropdowns
const STATES = ['Assam', 'Mizoram', 'Meghalaya', 'Tripura'];
const DISTRICTS = {
  Assam: ['Kamrup', 'Jorhat', 'Dibrugarh'],
  Mizoram: ['Aizawl', 'Lunglei', 'Champhai'],
  Meghalaya: ['East Khasi Hills', 'West Garo Hills', 'Ri-Bhoi'],
  Tripura: ['West Tripura', 'Gomati', 'South Tripura'],
};
const CITIES = {
  Kamrup: ['Guwahati', 'Rangia'],
  Jorhat: ['Jorhat City', 'Titabor'],
  Dibrugarh: ['Dibrugarh City', 'Chabua'],
  Aizawl: ['Aizawl City', 'Tlangnuam'],
  Lunglei: ['Lunglei City'],
  Champhai: ['Champhai City'],
  'East Khasi Hills': ['Shillong', 'Sohra'],
  'West Garo Hills': ['Tura'],
  'Ri-Bhoi': ['Nongpoh'],
  'West Tripura': ['Agartala'],
  Gomati: ['Udaipur'],
  'South Tripura': ['Belonia'],
};

export function SetupScreen() {
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    loadJurisdiction();
  }, []);

  const loadJurisdiction = async () => {
    try {
      const stored = await AsyncStorage.getItem('@jurisdiction');
      if (stored) {
        const data = JSON.parse(stored);
        setSelectedState(data.state);
        setSelectedDistrict(data.district);
        setSelectedCity(data.city);
        setIsLocked(true);
      }
    } catch (e) {
      console.error('Failed to load jurisdiction', e);
    }
  };

  const handleConfirm = async () => {
    if (!selectedState || !selectedDistrict || !selectedCity) return;
    try {
      await AsyncStorage.setItem('@jurisdiction', JSON.stringify({
        state: selectedState,
        district: selectedDistrict,
        city: selectedCity,
      }));
      setIsLocked(true);
    } catch (e) {
      console.error('Failed to save jurisdiction', e);
    }
  };

  const handleReset = async () => {
    try {
      await AsyncStorage.removeItem('@jurisdiction');
      setIsLocked(false);
      setSelectedState('');
      setSelectedDistrict('');
      setSelectedCity('');
    } catch (e) {
      console.error('Failed to clear jurisdiction', e);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1C1C1C" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Regional Assignment</Text>
        <Text style={styles.headerSub}>Select your municipal jurisdiction</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>State</Text>
          <View style={styles.dropdownGrid}>
            {STATES.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.pill, selectedState === s && styles.pillActive]}
                onPress={() => {
                  if (isLocked) return;
                  setSelectedState(s);
                  setSelectedDistrict('');
                  setSelectedCity('');
                }}
                disabled={isLocked}
              >
                <Text style={[styles.pillText, selectedState === s && styles.pillTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedState ? (
            <>
              <Text style={styles.label}>District</Text>
              <View style={styles.dropdownGrid}>
                {(DISTRICTS[selectedState] || []).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.pill, selectedDistrict === d && styles.pillActive]}
                    onPress={() => {
                      if (isLocked) return;
                      setSelectedDistrict(d);
                      setSelectedCity('');
                    }}
                    disabled={isLocked}
                  >
                    <Text style={[styles.pillText, selectedDistrict === d && styles.pillTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          {selectedDistrict ? (
            <>
              <Text style={styles.label}>City / Block</Text>
              <View style={styles.dropdownGrid}>
                {(CITIES[selectedDistrict] || []).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pill, selectedCity === c && styles.pillActive]}
                    onPress={() => {
                      if (!isLocked) setSelectedCity(c);
                    }}
                    disabled={isLocked}
                  >
                    <Text style={[styles.pillText, selectedCity === c && styles.pillTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isLocked ? (
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Text style={styles.resetBtnText}>Change Jurisdiction</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.confirmBtn, (!selectedState || !selectedDistrict || !selectedCity) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selectedState || !selectedDistrict || !selectedCity}
          >
            <Text style={styles.confirmBtnText}>Confirm Jurisdiction</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1C1C1C',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: 'rgba(28,28,28,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dropdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  pillActive: {
    backgroundColor: '#FF5B22',
    borderColor: '#FF5B22',
  },
  pillText: {
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: 14,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 100,
    backgroundColor: 'rgba(28,28,28,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  confirmBtn: {
    backgroundColor: '#FF5B22',
    borderRadius: 30,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(255,91,34,0.3)',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  resetBtn: {
    backgroundColor: '#2C2C2E',
    borderRadius: 30,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  resetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
