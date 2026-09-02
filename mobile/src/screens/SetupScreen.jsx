import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthCheckerModal } from '../components/AuthCheckerModal';
import { MOCK_CITIES, MOCK_WARDS } from '../services/mockLocationData';

export function SetupScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  
  const [govData, setGovData] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [wards, setWards] = useState([]);

  const [selectedState, setSelectedState] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);

  useEffect(() => {
    fetchStates();
  }, []);

  const fetchStates = async () => {
    setLoading(true);
    try {
      // Fetching from a free open public repository for Indian States & Districts
      const response = await fetch('https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json');
      const data = await response.json();
      setGovData(data.states);
      // Filter only North Eastern States for relevance, or show all if preferred. Let's show NE states.
      const neStates = ['Assam', 'Tripura', 'Meghalaya', 'Mizoram', 'Manipur', 'Nagaland', 'Arunachal Pradesh', 'Sikkim'];
      
      const filteredStates = data.states.filter(s => neStates.includes(s.state));
      setStates(filteredStates.length > 0 ? filteredStates.map(s => s.state) : data.states.map(s => s.state));
    } catch (e) {
      console.warn("Failed to fetch live state data, falling back to basic mock", e);
      setStates(['Assam', 'Tripura']);
    } finally {
      setLoading(false);
    }
  };

  const handleStateSelect = (state) => {
    setSelectedState(state);
    setSelectedDistrict(null);
    setSelectedCity(null);
    setSelectedWard(null);
    
    // Find districts from the fetched data
    const stateObj = govData.find(s => s.state === state);
    if (stateObj && stateObj.districts) {
      setDistricts(stateObj.districts);
    } else {
      setDistricts(['Default District']);
    }
  };

  const handleDistrictSelect = (district) => {
    setSelectedDistrict(district);
    setSelectedCity(null);
    setSelectedWard(null);
    setLoading(true);
    setTimeout(() => {
      // Mocking cities based on the selected district name
      setCities(MOCK_CITIES[district] || [`${district} City Center`, `${district} North`, `${district} South`]);
      setLoading(false);
    }, 300);
  };

  const handleCitySelect = (city) => {
    setSelectedCity(city);
    setSelectedWard(null);
    setLoading(true);
    setTimeout(() => {
      // Mocking wards based on the selected city name
      setWards(MOCK_WARDS[city] || ['Ward 1', 'Ward 2', 'Ward 3', 'Ward 4']);
      setLoading(false);
    }, 300);
  };

  const handleConfirm = () => {
    setAuthModalVisible(true);
  };

  const handleAuthVerified = async () => {
    setAuthModalVisible(false);
    const setupData = {
      state: selectedState,
      district: selectedDistrict,
      city: selectedCity,
      ward: selectedWard,
      timestamp: new Date().toISOString()
    };
    await AsyncStorage.setItem('@jurisdiction_setup', JSON.stringify(setupData));
    navigation.replace('MainTabs');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jurisdiction Setup</Text>
        <Text style={styles.headerSubtitle}>Select your assignment area (Gov API Synced)</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* State Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Select State</Text>
          <View style={styles.chipContainer}>
            {states.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.chip, selectedState === st && styles.chipActive]}
                onPress={() => handleStateSelect(st)}
              >
                <Text style={[styles.chipText, selectedState === st && styles.chipTextActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* District Selection */}
        {selectedState && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Select District</Text>
            {loading && !districts.length ? <ActivityIndicator color="#EF4444" /> : (
              <View style={styles.chipContainer}>
                {districts.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.chip, selectedDistrict === d && styles.chipActive]}
                    onPress={() => handleDistrictSelect(d)}
                  >
                    <Text style={[styles.chipText, selectedDistrict === d && styles.chipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* City/Sub-District Selection */}
        {selectedDistrict && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Select City / Block</Text>
            {loading && !cities.length ? <ActivityIndicator color="#EF4444" /> : (
              <View style={styles.chipContainer}>
                {cities.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, selectedCity === c && styles.chipActive]}
                    onPress={() => handleCitySelect(c)}
                  >
                    <Text style={[styles.chipText, selectedCity === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Ward/Village Selection */}
        {selectedCity && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Select Ward / Area</Text>
            {loading && !wards.length ? <ActivityIndicator color="#EF4444" /> : (
              <View style={styles.chipContainer}>
                {wards.map((w) => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.chip, selectedWard === w && styles.chipActive]}
                    onPress={() => setSelectedWard(w)}
                  >
                    <Text style={[styles.chipText, selectedWard === w && styles.chipTextActive]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {selectedWard && (
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>Confirm & Verify Authority</Text>
          </TouchableOpacity>
        )}
        
        <View style={{height: 100}} />
      </ScrollView>

      <AuthCheckerModal 
        visible={authModalVisible} 
        onConfirm={handleAuthVerified} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1C1C1C' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  content: { padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  chipActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  chipText: { color: '#D1D5DB', fontSize: 14 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  confirmButton: {
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
