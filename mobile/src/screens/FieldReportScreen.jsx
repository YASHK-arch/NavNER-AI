/**
 * Field Report Screen — Redesigned for Issue #36.
 * Orange (#FF5B22) dark charcoal theme. Lives inside the bottom sheet on the Map screen.
 * New fields: severity pills, ETC, geo-tag. Two-tier offline/online Firebase sync.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  StatusBar,
  Alert,
  SafeAreaView,
} from 'react-native';
import { NetworkBadge } from '../components/NetworkBadge';
import { IncidentForm } from '../components/IncidentForm';
import { PhotoCapture } from '../components/PhotoCapture';
import { enqueue, syncQueue, getQueue, getCachedMapState } from '../services/syncQueue';
import { dispatchSatelliteSms, syncPendingSatelliteImages } from '../services/satelliteSms';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

export function FieldReportScreen() {
  const [isOnline, setIsOnline] = useState(true);
  const [location, setLocation] = useState(null);

  // Form state — Issue #36 data model
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedClearanceHrs, setEstimatedClearanceHrs] = useState('');
  const [photo, setPhoto] = useState(null);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedToQueue, setSavedToQueue] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [cachedIncidents, setCachedIncidents] = useState([]);

  // Snackbar animation
  const snackbarAnim = useRef(new Animated.Value(0)).current;
  const snackbarMessage = useRef('');

  // Network monitoring + location
  useEffect(() => {
    updateQueueCount();
    loadCachedState();

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);

      // Auto-sync when coming back online (Issue #36 — Two-Tier Sync Logic)
      if (online) {
        const synced = await syncQueue();
        if (synced > 0) {
          snackbarMessage.current = `☁️ ${synced} queued report${synced > 1 ? 's' : ''} synced to Firebase!`;
          showSnackbar('#22C55E');
          await updateQueueCount();
        }

        // Issue #74: push any photos that went out over satellite SMS with
        // the image left pending. Runs on the same reconnect event as the
        // normal queue sync above.
        const imagesSynced = await syncPendingSatelliteImages();
        if (imagesSynced > 0) {
          snackbarMessage.current = `📷 ${imagesSynced} satellite report photo${imagesSynced > 1 ? 's' : ''} synced!`;
          showSnackbar('#22C55E');
        }
      }
    });

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Just fail silently or warn, we have manual inputs now.
        return;
      }
      fetchLiveGps();
    })();

    return () => unsubscribe();
  }, []);

  const fetchLiveGps = async () => {
    try {
      let currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation({
        lat: currentLoc.coords.latitude,
        lng: currentLoc.coords.longitude,
      });
      snackbarMessage.current = '📍 Location updated from GPS';
      showSnackbar('#22C55E');
    } catch (err) {
      Alert.alert('GPS Error', 'Failed to fetch location. Please enter manually.');
    }
  };

  const updateQueueCount = async () => {
    const queue = await getQueue();
    setQueueCount(queue.length);
  };

  const loadCachedState = async () => {
    const state = await getCachedMapState();
    if (state && state.incidents) {
      setCachedIncidents(state.incidents);
    }
  };

  const showSnackbar = useCallback((color = '#FF5B22') => {
    Animated.sequence([
      Animated.timing(snackbarAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(snackbarAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [snackbarAnim]);

  const handleCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required to capture incident photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!incidentType) {
      Alert.alert('Missing Field', 'Please select an incident type.');
      return;
    }
    if (!severity) {
      Alert.alert('Missing Field', 'Please select a severity level.');
      return;
    }

    setSubmitting(true);

    const report = {
      type: incidentType,
      severity,
      description,
      estimatedClearanceHrs: estimatedClearanceHrs ? parseInt(estimatedClearanceHrs, 10) : null,
      lat: location?.lat ?? 26.1445,
      lng: location?.lng ?? 91.7362,
      photoUri: photo,
    };

    if (isOnline) {
      try {
        // Submits to the real backend — POST /api/v1/incident, the same
        // endpoint the web dashboard and the map both read from — rather
        // than the Firebase mocks this replaced (uploadImageToFirebaseStorage
        // / saveToFirestore never actually left the device).
        await submitIncidentToBackend(report);
        setSubmitted(true);
        snackbarMessage.current = '✅ Report submitted — live on the dashboard!';
        showSnackbar('#22C55E');
        setTimeout(resetForm, 2500);
      } catch (err) {
        Alert.alert('Submission Error', 'Failed to submit. Report saved locally.');
        await enqueue(report);
        await updateQueueCount();
        setSavedToQueue(true);
        snackbarMessage.current = '📦 Report Queued. Will sync when online.';
        showSnackbar();
        setTimeout(resetForm, 2500);
      }
    } else {
      // Fully offline. Try the satellite-SMS bridge first (issue #74) — it
      // gets the hazard onto the dashboard within an SMS's transit time
      // rather than whenever this phone next sees a signal, which in the
      // scenario this exists for could be hours. If SMS genuinely is not
      // available (no SIM, a simulator), fall back to the ordinary queue so
      // the report is not lost either way.
      try {
        const { incidentId, smsResult } = await dispatchSatelliteSms(report);
        setSavedToQueue(true);
        snackbarMessage.current =
          smsResult === 'sent'
            ? `📡 ${incidentId} sent via satellite SMS. Photo queued for sync.`
            : `📦 ${incidentId} saved locally. Photo queued — SMS was not sent.`;
        showSnackbar(smsResult === 'sent' ? '#22C55E' : '#FBBF24');
      } catch (err) {
        await enqueue(report);
        await updateQueueCount();
        setSavedToQueue(true);
        snackbarMessage.current = '📦 Report Queued. Will sync when online.';
        showSnackbar();
      }
      setTimeout(resetForm, 2500);
    }

    setSubmitting(false);
  };

  const resetForm = () => {
    setIncidentType('');
    setSeverity('');
    setDescription('');
    setEstimatedClearanceHrs('');
    setPhoto(null);
    setSubmitted(false);
    setSavedToQueue(false);
  };

  const getSubmitLabel = () => {
    if (submitting) return '';
    if (submitted) return '✅ Report Submitted';
    if (savedToQueue) return '📦 Report Queued';
    return 'Submit Report';
  };

  const submitDisabled =
    submitting || submitted || savedToQueue || !incidentType || !severity;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1C1C1C" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Report Incident</Text>
          <Text style={styles.headerSub}>Field Incident Reporting</Text>
        </View>
        <NetworkBadge isOnline={isOnline} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Offline Queue Banner */}
        {queueCount > 0 && (
          <View style={styles.queueBanner}>
            <Text style={styles.queueBannerIcon}>🕐</Text>
            <Text style={styles.queueBannerText}>
              {queueCount} report{queueCount > 1 ? 's' : ''} saved locally — waiting for network
            </Text>
          </View>
        )}

        {/* Incident Form (Issue #36 redesign / Issue #77 manual location) */}
        <IncidentForm
          incidentType={incidentType}
          onTypeChange={setIncidentType}
          severity={severity}
          onSeverityChange={setSeverity}
          description={description}
          onDescriptionChange={setDescription}
          estimatedClearanceHrs={estimatedClearanceHrs}
          onEtcChange={setEstimatedClearanceHrs}
          location={location}
          onLocationChange={setLocation}
          onUseLiveGps={fetchLiveGps}
        />

        {/* Mini-Map for visual confirmation (Issue #77) */}
        {location && (
          <View style={styles.miniMapContainer}>
            <MapView
              style={styles.miniMap}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: location.lat,
                longitude: location.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              region={{
                latitude: location.lat,
                longitude: location.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} />
            </MapView>
          </View>
        )}

        {/* Photo Capture */}
        <PhotoCapture photo={photo} onCapture={handleCapture} />
        {/* Cached Incidents Display */}
        {cachedIncidents.length > 0 && (
          <View style={styles.incidentsContainer}>
            <Text style={styles.incidentsTitle}>Active Regional Incidents ({cachedIncidents.length})</Text>
            {cachedIncidents.map(inc => (
              <View key={inc.id} style={styles.incidentCard}>
                <Text style={styles.incidentCardType}>
                  {inc.type.replace('_', ' ').toUpperCase()}
                </Text>
                {inc.description && <Text style={styles.incidentCardDesc}>{inc.description}</Text>}
                <Text style={styles.incidentCardMeta}>
                  {inc.lat.toFixed(4)}°N, {inc.lng.toFixed(4)}°E • {new Date(inc.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.submitArea}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            submitDisabled && !submitted && !savedToQueue && styles.submitBtnDisabled,
            submitted && styles.submitBtnSuccess,
            savedToQueue && styles.submitBtnQueued,
          ]}
          onPress={handleSubmit}
          disabled={submitDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Submit incident report"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>{getSubmitLabel()}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Snackbar Toast */}
      <Animated.View
        style={[
          styles.snackbar,
          {
            opacity: snackbarAnim,
            transform: [
              {
                translateY: snackbarAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [60, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.snackbarText}>{snackbarMessage.current}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1C1C1C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 2,
  },
  // Queue Banner
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  queueBannerIcon: {
    fontSize: 14,
  },
  queueBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#FBBF24',
    fontWeight: '600',
  },
  // Mini Map
  miniMapContainer: {
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  // Submit Button
  submitArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: 'rgba(28,28,28,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  submitBtn: {
    backgroundColor: '#FF5B22',
    borderRadius: 30,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5B22',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(255,91,34,0.28)',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnSuccess: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
  },
  submitBtnQueued: {
    backgroundColor: '#FBBF24',
    shadowColor: '#FBBF24',
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  // Snackbar
  snackbar: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(44,44,46,0.97)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  snackbarText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  // Cached Incidents
  incidentsContainer: {
    marginTop: 10,
    gap: 12,
  },
  incidentsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e8edf5',
    marginBottom: 4,
  },
  incidentCard: {
    backgroundColor: 'rgba(14, 26, 50, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  incidentCardType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },
  incidentCardDesc: {
    fontSize: 13,
    color: '#cbd5e1',
  },
  incidentCardMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
});
