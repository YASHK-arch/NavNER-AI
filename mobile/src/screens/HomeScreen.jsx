import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getQueue } from '../services/syncQueue';

const QUICK_ACTIONS = [
  { label: 'Report Incident', icon: '🚨', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', target: 'Report' },
  { label: 'Live Map',        icon: '🗺️', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', target: 'Map' },
  { label: 'Track Supplies',  icon: '📦', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', target: 'Supplies' },
  { label: 'Analytics',       icon: '📊', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', target: 'Analytics' },
];

const STATUS_ITEMS = [
  { label: 'Active Trucks', value: '24', icon: '🚛', color: '#22C55E' },
  { label: 'Pending Reports', value: '3', icon: '📋', color: '#F59E0B' },
  { label: 'Alerts', value: '1', icon: '⚠️', color: '#EF4444' },
];

function StatusCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statusCard, { borderLeftColor: color }]}>
      <Text style={styles.statusIcon}>{icon}</Text>
      <View>
        <Text style={[styles.statusValue, { color }]}>{value}</Text>
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
    </View>
  );
}

function QuickAction({ icon, label, color, bg, onPress }) {
  return (
    <TouchableOpacity style={[styles.actionCard, { backgroundColor: bg, borderColor: color + '30' }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActivityItem({ item }) {
  const statusColor = item.sync_status === 'SYNCED' ? '#22C55E'
    : item.sync_status?.includes('PENDING') ? '#F59E0B'
    : '#9CA3AF';
  const statusLabel = item.sync_status === 'SYNCED' ? 'Synced'
    : item.sync_status?.includes('PENDING') ? 'Pending'
    : 'Queued';

  return (
    <View style={styles.activityItem}>
      <View style={[styles.activityDot, { backgroundColor: statusColor }]} />
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {item.type || 'Incident'} — {item.severity || 'Unknown severity'}
        </Text>
        <Text style={styles.activityMeta}>
          {item._queuedAt ? new Date(item._queuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          {'  '}
          <Text style={{ color: statusColor }}>{statusLabel}</Text>
        </Text>
      </View>
    </View>
  );
}

export function HomeScreen({ navigation }) {
  const [profile, setProfile]           = useState(null);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [refreshing, setRefreshing]     = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [profileRaw, jurisdictionRaw, queue] = await Promise.all([
        AsyncStorage.getItem('@user_profile'),
        AsyncStorage.getItem('@jurisdiction'),
        getQueue(),
      ]);
      if (profileRaw)     setProfile(JSON.parse(profileRaw));
      if (jurisdictionRaw) setJurisdiction(JSON.parse(jurisdictionRaw));
      // Show 5 most recent queue items
      setRecentActivity([...queue].reverse().slice(0, 5));
    } catch (e) {
      console.warn('HomeScreen load error', e);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleEditProfile = async () => {
    await AsyncStorage.removeItem('@jurisdiction');
    await AsyncStorage.removeItem('@jurisdiction_setup');
    navigation.replace('Setup');
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F0F" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5B22" />}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName}>{profile?.name || 'Field Officer'}</Text>
          </View>
          <TouchableOpacity style={styles.avatarWrap} onPress={handleEditProfile}>
            {profile?.picture
              ? <Image source={{ uri: profile.picture }} style={styles.avatar} />
              : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {(profile?.name || 'F')[0].toUpperCase()}
                  </Text>
                </View>
              )
            }
            <View style={styles.editDot} />
          </TouchableOpacity>
        </View>

        {/* ── Jurisdiction Badge ── */}
        {jurisdiction && (
          <View style={styles.jurisdictionBanner}>
            <Text style={styles.jurisdictionIcon}>📍</Text>
            <View>
              <Text style={styles.jurisdictionTitle}>
                {jurisdiction.city || jurisdiction.district}, {jurisdiction.state}
              </Text>
              {jurisdiction.ward && (
                <Text style={styles.jurisdictionSub}>{jurisdiction.ward}</Text>
              )}
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
        )}

        {/* ── Status Strip ── */}
        <View style={styles.statusRow}>
          {STATUS_ITEMS.map(s => <StatusCard key={s.label} {...s} />)}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map(a => (
            <QuickAction
              key={a.label}
              {...a}
              onPress={() => navigation.navigate(a.target)}
            />
          ))}
        </View>

        {/* ── Recent Activity ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Report')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityCard}>
          {recentActivity.length === 0 ? (
            <View style={styles.emptyActivity}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No reports submitted yet.</Text>
              <Text style={styles.emptySubText}>Your field reports will appear here.</Text>
            </View>
          ) : (
            recentActivity.map((item, i) => (
              <ActivityItem key={item._id || i} item={item} />
            ))
          )}
        </View>

        {/* ── App Info Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>NavNER AI · Northeast Emergency Response Network</Text>
          <Text style={styles.footerVersion}>v1.0 · Issue #77</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 130 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 16 : 16,
    paddingBottom: 20,
  },
  headerLeft: { gap: 2 },
  greeting: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  userName: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FF5B22' },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FF5B22', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,91,34,0.4)',
  },
  avatarInitial: { fontSize: 20, fontWeight: '800', color: '#fff' },
  editDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#0F0F0F',
  },

  // Jurisdiction
  jurisdictionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 22,
    marginBottom: 20,
    backgroundColor: 'rgba(255,91,34,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,91,34,0.2)',
    borderRadius: 16,
    padding: 14,
  },
  jurisdictionIcon: { fontSize: 22 },
  jurisdictionTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  jurisdictionSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  livePill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#22C55E' },

  // Status strip
  statusRow: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    gap: 10,
    marginBottom: 28,
  },
  statusCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 12,
    borderLeftWidth: 3,
  },
  statusIcon: { fontSize: 18 },
  statusValue: { fontSize: 18, fontWeight: '800' },
  statusLabel: { fontSize: 10, color: '#6B7280', fontWeight: '500', marginTop: 1 },

  // Quick Actions
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 22,
    marginTop: 8,
  },
  seeAll: { fontSize: 13, color: '#FF5B22', fontWeight: '600' },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 22,
    gap: 12,
    marginBottom: 28,
  },
  actionCard: {
    width: '47%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { fontSize: 13, fontWeight: '700' },

  // Activity
  activityCard: {
    marginHorizontal: 22,
    marginTop: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  activityDot: {
    width: 8, height: 8, borderRadius: 4, marginTop: 5,
  },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: 14, fontWeight: '600', color: '#E5E7EB' },
  activityMeta: { fontSize: 11, color: '#6B7280', marginTop: 3 },
  emptyActivity: { padding: 32, alignItems: 'center', gap: 6 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  emptySubText: { fontSize: 12, color: '#4B5563', textAlign: 'center' },

  // Footer
  footer: { marginTop: 28, paddingHorizontal: 22, alignItems: 'center', gap: 4 },
  footerText: { fontSize: 11, color: '#374151', textAlign: 'center' },
  footerVersion: { fontSize: 10, color: '#374151' },
});
